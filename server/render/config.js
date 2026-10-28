// Administrator configuration, read from the Pages project's environment variables and
// secrets (Settings → Variables and Secrets). Everything defaults to OFF or to the cheapest
// safe value: nothing is billed until an administrator has set a key, a budget, a database
// and has enabled the service.
//
//   RENDER_ENABLED            "true" to allow generation at all
//   RENDER_PROVIDER           "openai" (default) | "gemini"
//   RENDER_FALLBACK           "gemini" | "openai" | "none" (default)
//   OPENAI_API_KEY            secret
//   OPENAI_IMAGE_MODEL        default gpt-image-2.5-sunburst
//   GEMINI_API_KEY            secret
//   GEMINI_IMAGE_MODEL        default gemini-3-pro-image
//   RENDER_QUALITY_MAX        "low" | "medium" (default) | "high"
//   RENDER_MAX_IMAGES         images per request, default 1, at most 4
//   RENDER_DAILY_PER_USER     default 3
//   RENDER_DAILY_TOTAL        default 30
//   RENDER_RATE_PER_MINUTE    per network address, default 2
//   RENDER_MONTHLY_BUDGET_USD required; 0 or missing = no billable requests
//   RENDER_MAX_COST_USD       ceiling for one request, default 0.60
//   RENDER_TIMEOUT_MS         provider timeout, default 150000 (10 000 – 290 000)
//   RENDER_MAX_UPLOAD_MB      request body limit, default 4
//   RENDER_ACCESS_CODES       secret, comma separated; each code is one user
//   RENDER_PUBLIC             "true" to allow requests without a code (not recommended)
//   RENDER_SALT               secret used to hash user and network identifiers
//   RENDER_ALLOWED_ORIGINS    comma separated; default https://bina.lithos.ge and *.bina-csn.pages.dev
//   GEMINI_API_BASE           default https://generativelanguage.googleapis.com/v1
//   OPENAI_API_BASE           default https://api.openai.com/v1
// Binding: BINA_DB (D1 database) — required; quotas and spending are kept there.
import { MODELS } from './cost.js';

const int = (v, def, lo, hi) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
};
const money = (v, def) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const QUALITIES = ['low', 'medium', 'high'];
export const ASPECTS = ['landscape', 'portrait', 'square'];

export function readConfig(env = {}) {
  const provider = env.RENDER_PROVIDER === 'gemini' ? 'gemini' : 'openai';
  const fb = ['openai', 'gemini'].includes(env.RENDER_FALLBACK) && env.RENDER_FALLBACK !== provider ? env.RENDER_FALLBACK : null;
  const models = {
    openai: env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst',
    gemini: env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image',
  };
  const keys = { openai: env.OPENAI_API_KEY || '', gemini: env.GEMINI_API_KEY || '' };
  const qmax = QUALITIES.includes(env.RENDER_QUALITY_MAX) ? env.RENDER_QUALITY_MAX : 'medium';
  const cfg = {
    enabled: env.RENDER_ENABLED === 'true',
    provider,
    fallback: fb,
    models,
    keys,
    bases: {
      openai: (env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      gemini: (env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1').replace(/\/+$/, ''),
    },
    qualities: QUALITIES.slice(0, QUALITIES.indexOf(qmax) + 1),
    maxImages: int(env.RENDER_MAX_IMAGES, 1, 1, 4),
    perUserDaily: int(env.RENDER_DAILY_PER_USER, 3, 0, 1000),
    totalDaily: int(env.RENDER_DAILY_TOTAL, 30, 0, 100000),
    perMinute: int(env.RENDER_RATE_PER_MINUTE, 2, 1, 120),
    monthlyBudget: money(env.RENDER_MONTHLY_BUDGET_USD, 0),
    maxCost: money(env.RENDER_MAX_COST_USD, 0.6),
    timeoutMs: int(env.RENDER_TIMEOUT_MS, 150000, 10000, 290000),
    maxUploadBytes: int(env.RENDER_MAX_UPLOAD_MB, 4, 1, 20) * 1024 * 1024,
    accessCodes: list(env.RENDER_ACCESS_CODES),
    public: env.RENDER_PUBLIC === 'true',
    salt: env.RENDER_SALT || '',
    origins: list(env.RENDER_ALLOWED_ORIGINS).length ? list(env.RENDER_ALLOWED_ORIGINS) : ['https://bina.lithos.ge', 'https://bina-csn.pages.dev', 'https://*.bina-csn.pages.dev'],
    db: env.BINA_DB || null,
  };
  return cfg;
}

// Why billable requests are not possible right now (null = they are).
export function blockedReason(cfg) {
  if (!cfg.enabled) return 'disabled';
  if (!cfg.keys[cfg.provider]) return 'not_configured';
  if (!MODELS[cfg.provider][cfg.models[cfg.provider]]) return 'not_configured';
  if (!cfg.db) return 'not_configured';
  if (!(cfg.monthlyBudget > 0)) return 'not_configured';
  if (!cfg.salt) return 'not_configured';
  if (!cfg.accessCodes.length && !cfg.public) return 'not_configured';
  if (!(cfg.perUserDaily > 0) || !(cfg.totalDaily > 0)) return 'not_configured';
  return null;
}

// Is the fallback provider usable?
export function fallbackReady(cfg) {
  return !!cfg.fallback && !!cfg.keys[cfg.fallback] && !!MODELS[cfg.fallback][cfg.models[cfg.fallback]];
}

export function originAllowed(cfg, origin) {
  if (!origin) return true; // not a browser request; the access code and quotas still apply
  return cfg.origins.some((o) => {
    if (o === origin) return true;
    const m = /^https:\/\/\*\.(.+)$/.exec(o);
    return !!m && /^https:\/\/[a-z0-9-]+\./.test(origin) && origin.endsWith(`.${m[1]}`);
  });
}
