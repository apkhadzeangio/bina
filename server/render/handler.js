// The render service: GET /api/render/config and POST /api/render.
//
// A POST is billable only when ALL of these hold: the administrator enabled the service
// and set a provider key, a monthly budget, a salt and a database; the request carries a
// valid access code (or the service is explicitly public); the user agreed to send the data
// and accepted a cost that is not below the server's estimate; the Stage 05 scene passes
// the schema, revision and geometry checks (scene-check.js) with no unresolved mandatory
// material; and the quotas, rate limit and budget leave room for it. Otherwise nothing is
// sent to a provider.
import { readConfig, blockedReason, fallbackReady, originAllowed } from './config.js';
import { RenderError, errorResponse, json } from './errors.js';
import { readJsonLimited, checkRequest } from './input.js';
import { actualCost, MODELS, estimateRequest, referencesFor, PROMPT_CHARS_FOR_ESTIMATE } from './cost.js';
import { reserve, finish, usage, recentCost } from './store.js';
import { PROVIDERS } from './providers.js';
import { checkScene } from './scene-check.js';
import { ASPECTS } from './config.js';
import { buildRenderPrompt } from '../../src/core/render-prompt.js';

export const LABEL = {
  ka: 'AI-ით შექმნილი კონცეპტუალური ვიზუალიზაცია. არ არის ზუსტი არქიტექტურული ნახაზი: ზომები და მასალები იხილე გეგმასა და ხარჯთაღრიცხვაში.',
  en: 'Conceptual AI visualization. Not a dimensionally accurate architectural render; the plan and the estimate remain the source of truth.',
};

const PROVIDER_LABEL = { openai: 'OpenAI', gemini: 'Google Gemini' };

async function sha(salt, value) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${value}`));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeSignals(requestSignal, timeoutMs) {
  const ctrl = new AbortController();
  let timed = false;
  let cancelled = false;
  const t = setTimeout(() => {
    timed = true;
    ctrl.abort(new Error('timeout'));
  }, timeoutMs);
  const onAbort = () => {
    cancelled = true;
    ctrl.abort(new Error('cancelled'));
  };
  if (requestSignal) {
    if (requestSignal.aborted) onAbort();
    else requestSignal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    timedOut: () => timed,
    cancelled: () => cancelled,
    clear: () => {
      clearTimeout(t);
      requestSignal?.removeEventListener?.('abort', onAbort);
    },
  };
}

export function estimateFor(cfg, provider, opts) {
  return estimateRequest(provider, cfg.models[provider], opts);
}

// The formula estimate, raised to the real per-image cost of recent renders with the same
// model, quality and frame (plus 10 %) when that is higher. Never lower than the formula.
export async function estimateWithHistory(cfg, provider, opts, now) {
  const base = estimateFor(cfg, provider, opts);
  if (base === null || !cfg.db) return base;
  let recent = null;
  try {
    recent = await recentCost(cfg.db, { provider, model: cfg.models[provider], quality: opts.quality, aspect: opts.aspect, now });
  } catch (e) {
    recent = null;
  }
  return recent ? Math.round(Math.max(base, recent * (opts.count || 1) * 1.1) * 10000) / 10000 : base;
}

// ------------------------------------------------------------------ GET /api/render/config
export async function handleConfig(request, env) {
  const cfg = readConfig(env);
  if (!originAllowed(cfg, request.headers.get('origin'))) return errorResponse(new RenderError('forbidden_origin', 403));
  const reason = blockedReason(cfg);
  const side = (p) => (p ? { name: p, label: PROVIDER_LABEL[p], model: cfg.models[p], maxReferences: MODELS[p][cfg.models[p]]?.maxReferences || 1 } : null);
  // Upper estimates per frame and quality, for one image with as many references as the
  // primary model takes. The server charges its own exact estimate, never more than this.
  const estimates = {};
  if (!reason) {
    for (const aspect of ASPECTS) {
      estimates[aspect] = {};
      for (const quality of cfg.qualities) {
        estimates[aspect][quality] = await estimateWithHistory(cfg, cfg.provider, { quality, aspect, count: 1, samples: 99 }, Date.now());
      }
    }
  }
  return json({
    available: !reason,
    reason,
    provider: side(cfg.provider),
    fallback: fallbackReady(cfg) ? side(cfg.fallback) : null,
    qualities: cfg.qualities,
    aspects: ASPECTS,
    estimates,
    maxImages: cfg.maxImages,
    maxCostUsd: cfg.maxCost,
    accessCodeRequired: cfg.accessCodes.length > 0,
    limits: { perUserDaily: cfg.perUserDaily, perMinute: cfg.perMinute },
    timeoutSeconds: Math.round(cfg.timeoutMs / 1000),
    promptCharsForEstimate: PROMPT_CHARS_FOR_ESTIMATE,
    label: LABEL,
  });
}

// ------------------------------------------------------------------ POST /api/render
export async function handleRender(request, env, ctx = {}, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch.bind(globalThis);
  const now = deps.now || Date.now;
  const newId = deps.newId || (() => crypto.randomUUID());
  const log = deps.log || ((...a) => console.log(...a));
  const later = (p) => (ctx.waitUntil ? ctx.waitUntil(p) : p);
  const cfg = readConfig(env);
  if (deps.timeoutMs) cfg.timeoutMs = deps.timeoutMs; // tests only
  try {
    if (!originAllowed(cfg, request.headers.get('origin'))) throw new RenderError('forbidden_origin', 403);
    const blocked = blockedReason(cfg);
    if (blocked) throw new RenderError(blocked, 503);

    // who is asking
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const ipKey = await sha(cfg.salt, `ip:${ip}`);
    let userKey;
    if (cfg.accessCodes.length) {
      const code = (request.headers.get('x-bina-access') || '').trim();
      if (!code) throw new RenderError('access_required', 401);
      const given = await sha(cfg.salt, `code:${code}`);
      let match = false;
      for (const c of cfg.accessCodes) if ((await sha(cfg.salt, `code:${c}`)) === given) match = true;
      if (!match) throw new RenderError('access_denied', 403);
      userKey = `c:${given}`;
    } else {
      const client = request.headers.get('x-bina-client') || '';
      userKey = `a:${await sha(cfg.salt, /^[0-9a-f-]{36}$/i.test(client) ? `client:${client}` : `ip:${ip}`)}`;
    }

    const body = await readJsonLimited(request, cfg.maxUploadBytes);
    const req = checkRequest(body, cfg);
    const checked = checkScene(req.scene, { expectedRevision: req.sceneRevision });
    const { revision, aspect } = checked;

    // material samples: only for resolved finishes of this scene, once each, in the order sent
    const keys = new Set(checked.materials.map((m) => m.key));
    const seen = new Set();
    const samples = req.samples.filter((s) => keys.has(s.key) && !seen.has(s.key) && seen.add(s.key));
    const withPlan = !!req.plan;

    const order = [cfg.provider, ...(fallbackReady(cfg) ? [cfg.fallback] : [])];
    const started = now();
    let lastErr = null;
    for (let attempt = 0; attempt < order.length; attempt++) {
      const provider = order[attempt];
      const model = cfg.models[provider];
      const est = await estimateWithHistory(cfg, provider, { quality: req.quality, aspect, count: req.count, samples: samples.length, withPlan }, now());
      if (est === null) throw new RenderError('not_configured', 503);
      if (est > cfg.maxCost) {
        if (attempt === 0) throw new RenderError('too_expensive', 400);
        break;
      }
      if (est > req.maxUsd + 0.0001) {
        // the user accepted less than this attempt may cost: ask again (or skip the fallback)
        if (attempt === 0) return errorResponse(new RenderError('estimate_changed', 409), { estimateUsd: est });
        break;
      }
      const refCount = referencesFor(provider, model, samples.length, withPlan);
      const sendPlan = withPlan && refCount >= 2;
      const used = samples.slice(0, refCount - (sendPlan ? 2 : 1));
      const references = [{ role: 'blockout' }, ...(sendPlan ? [{ role: 'plan' }] : []), ...used.map((x) => ({ role: 'material', key: x.key }))];
      const prompt = buildRenderPrompt(checked, { references });
      const id = newId();
      const r = await reserve(cfg.db, {
        id, now: now(), userKey, ipKey, provider, model, quality: req.quality, aspect, images: req.count,
        sceneRevision: revision, estUsd: est,
      }, {
        monthlyBudget: cfg.monthlyBudget, perUserDaily: cfg.perUserDaily, totalDaily: cfg.totalDaily,
        perMinute: cfg.perMinute, staleMs: cfg.timeoutMs + 30000,
      });
      if (!r.ok) {
        if (attempt > 0) break;
        const status = r.reason === 'busy' ? 409 : 429;
        const retryAfter = r.reason === 'rate_limited' ? 60 : r.reason === 'busy' ? 30 : null;
        throw new RenderError(r.reason, status, { retryAfter, retryable: r.reason === 'rate_limited' || r.reason === 'busy' });
      }

      const signals = makeSignals(request.signal, cfg.timeoutMs);
      const t0 = now();
      try {
        const out = await PROVIDERS[provider]({
          cfg, prompt, images: [req.blockout, ...(sendPlan ? [req.plan] : []), ...used.map((x) => x.image)], quality: req.quality, aspect, count: req.count,
          userHash: userKey.slice(2, 34), signals, fetchImpl,
        });
        const actual = actualCost(provider, model, out.usage);
        await finish(cfg.db, id, { status: 'succeeded', charged: true, actualUsd: actual ?? est, latencyMs: now() - t0 });
        const u = await usage(cfg.db, { userKey, ipKey, now: now() });
        log('render ok', { id, provider, model, revision, ms: now() - t0, est, actual });
        return json({
          id,
          createdAt: new Date(now()).toISOString(),
          sceneRevision: revision,
          roomId: checked.room.id,
          projectFingerprint: checked.scene.projectFingerprint,
          provider,
          providerLabel: PROVIDER_LABEL[provider],
          model,
          quality: req.quality,
          aspect,
          fallbackUsed: attempt > 0,
          references: { blockout: true, plan: sendPlan, materialSamples: used.map((x) => x.key) },
          images: out.images,
          cost: { estimatedUsd: est, actualUsd: actual, basis: actual === null ? 'estimate' : 'usage' },
          quota: { usedToday: u.userToday, perUserDaily: cfg.perUserDaily },
          label: LABEL,
        });
      } catch (e) {
        const err = e instanceof RenderError ? e : new RenderError('internal', 500, { detail: String(e?.stack || e) });
        // Keep the reserved cost unless the provider certainly did not bill the attempt.
        later(finish(cfg.db, id, {
          status: err.code === 'cancelled' ? 'cancelled' : 'failed',
          charged: err.charged !== false,
          errorCode: err.code,
          latencyMs: now() - t0,
        }).catch((x) => log('render finish failed', String(x))));
        log('render failed', { id, provider, model, code: err.code, detail: err.detail });
        lastErr = err;
        const timeLeft = cfg.timeoutMs - (now() - started) > cfg.timeoutMs / 2;
        if (!err.retryable || err.code === 'cancelled' || err.code === 'provider_timeout' || !timeLeft) break;
      } finally {
        signals.clear();
      }
    }
    throw lastErr || new RenderError('internal', 500);
  } catch (e) {
    const err = e instanceof RenderError ? e : new RenderError('internal', 500, { detail: String(e?.stack || e) });
    if (err.code === 'internal') log('render internal error', err.detail);
    return errorResponse(err);
  }
}
