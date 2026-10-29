// Image provider adapters. Each takes the prepared request and returns
// { images: [{ mime, data }], usage, model, provider } or throws a RenderError.
//
// `charged` on an error says whether the provider may already have billed the attempt:
// false = rejected before any generation (bad key, bad request), null = unknown (timeouts,
// server errors, refusals after generation). Unknown attempts keep their reserved cost.
import { RenderError } from './errors.js';
import { OPENAI_SIZES, GEMINI_ASPECTS, geminiSize } from './cost.js';

function retryAfterOf(res) {
  const v = Number.parseInt(res.headers.get('retry-after') || '', 10);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 3600) : null;
}

async function errorBody(res) {
  try {
    return await res.json();
  } catch (e) {
    return null;
  }
}

// fetch with the caller's abort signal; tells a timeout from a cancellation.
async function send(fetchImpl, url, init, signals) {
  try {
    return await fetchImpl(url, { ...init, signal: signals.signal });
  } catch (e) {
    if (signals.cancelled()) throw new RenderError('cancelled', 499, { charged: null });
    if (signals.timedOut()) throw new RenderError('provider_timeout', 504, { retryable: true, charged: null });
    throw new RenderError('provider_error', 502, { retryable: true, charged: null, detail: `network: ${e?.message || e}` });
  }
}

async function readJson(res, signals) {
  try {
    return await res.json();
  } catch (e) {
    if (signals.cancelled()) throw new RenderError('cancelled', 499, { charged: null });
    if (signals.timedOut()) throw new RenderError('provider_timeout', 504, { retryable: true, charged: null });
    throw new RenderError('provider_bad_response', 502, { retryable: true, charged: null, detail: 'invalid JSON' });
  }
}

// ------------------------------------------------------------------ OpenAI Images API
export async function callOpenAI({ cfg, prompt, images, quality, aspect, count, userHash, signals, fetchImpl }) {
  const model = cfg.models.openai;
  const res = await send(fetchImpl, `${cfg.bases.openai}/images/edits`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.keys.openai}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      images: images.map((im) => ({ image_url: im.url })),
      size: OPENAI_SIZES[aspect],
      quality,
      n: count,
      output_format: 'jpeg',
      output_compression: 90,
      background: 'opaque',
      moderation: 'auto',
      safety_identifier: userHash,
    }),
  }, signals);
  if (!res.ok) {
    const body = await errorBody(res);
    const code = body?.error?.code || '';
    const type = body?.error?.type || '';
    const detail = `openai ${res.status} ${code || type} ${String(body?.error?.message || '').slice(0, 200)}`;
    if (res.status === 401 || res.status === 403) throw new RenderError('provider_auth', 502, { charged: false, detail });
    if (res.status === 429 && /insufficient_quota|billing/i.test(code + type)) throw new RenderError('provider_auth', 502, { charged: false, detail });
    if (res.status === 429) throw new RenderError('provider_rate_limited', 503, { retryable: true, retryAfter: retryAfterOf(res) || 30, charged: false, detail });
    if (res.status === 400 && /moderation|safety|content_policy/i.test(code + type + (body?.error?.message || ''))) throw new RenderError('provider_refused', 422, { charged: null, detail });
    if (res.status >= 400 && res.status < 500) throw new RenderError('provider_error', 502, { charged: false, detail });
    throw new RenderError('provider_error', 502, { retryable: true, charged: null, detail });
  }
  const body = await readJson(res, signals);
  const out = (Array.isArray(body?.data) ? body.data : [])
    .filter((d) => typeof d?.b64_json === 'string' && d.b64_json.length > 100)
    .map((d) => ({ mime: `image/${body.output_format === 'png' ? 'png' : body.output_format === 'webp' ? 'webp' : 'jpeg'}`, data: d.b64_json }));
  if (!out.length) throw new RenderError('provider_bad_response', 502, { retryable: true, charged: null, detail: 'no image in response' });
  return { provider: 'openai', model, images: out, usage: body.usage || null };
}

// ------------------------------------------------------------------ Google Gemini API
// generateContent with text first, then the reference images in order (Image 1, 2, ...).
// One image per call: `count` images take `count` calls.
export async function callGemini({ cfg, prompt, images, quality, aspect, count, signals, fetchImpl }) {
  const model = cfg.models.gemini;
  const outImages = [];
  const usage = { promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 0 };
  for (let i = 0; i < count; i++) {
    const res = await send(fetchImpl, `${cfg.bases.gemini}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': cfg.keys.gemini, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }, ...images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.data } }))],
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: GEMINI_ASPECTS[aspect], imageSize: geminiSize(quality) },
        },
      }),
    }, signals);
    if (!res.ok) {
      const body = await errorBody(res);
      const status = body?.error?.status || '';
      const msg = String(body?.error?.message || '');
      const reasons = JSON.stringify(body?.error?.details || []);
      const detail = `gemini ${res.status} ${status} ${msg.slice(0, 200)}`;
      if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(reasons + msg)) throw new RenderError('provider_auth', 502, { charged: false, detail });
      if (res.status === 429) throw new RenderError('provider_rate_limited', 503, { retryable: true, retryAfter: retryAfterOf(res) || 30, charged: false, detail });
      if (res.status >= 400 && res.status < 500) throw new RenderError('provider_error', 502, { charged: false, detail });
      throw new RenderError('provider_error', 502, { retryable: true, charged: null, detail });
    }
    const body = await readJson(res, signals);
    const u = body?.usageMetadata || {};
    usage.promptTokenCount += u.promptTokenCount || 0;
    usage.candidatesTokenCount += u.candidatesTokenCount || 0;
    usage.thoughtsTokenCount += u.thoughtsTokenCount || 0;
    if (body?.promptFeedback?.blockReason) throw new RenderError('provider_refused', 422, { charged: null, detail: `gemini blocked: ${body.promptFeedback.blockReason}` });
    const cand = Array.isArray(body?.candidates) ? body.candidates[0] : null;
    const parts = cand?.content?.parts || [];
    const img = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && typeof d.data === 'string' && d.data.length > 100);
    if (!img) {
      if (/SAFETY|PROHIBITED|BLOCKLIST|IMAGE_SAFETY|RECITATION/i.test(cand?.finishReason || '')) {
        throw new RenderError('provider_refused', 422, { charged: null, detail: `gemini finish ${cand.finishReason}` });
      }
      throw new RenderError('provider_bad_response', 502, { retryable: true, charged: null, detail: `no image, finish ${cand?.finishReason}` });
    }
    const mime = img.mimeType || img.mime_type || 'image/png';
    outImages.push({ mime: /^image\/(png|jpeg|webp)$/.test(mime) ? mime : 'image/png', data: img.data });
  }
  return { provider: 'gemini', model, images: outImages, usage };
}

export const PROVIDERS = { openai: callOpenAI, gemini: callGemini };
