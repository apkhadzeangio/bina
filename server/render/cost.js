// Prices and cost estimates (USD). Prices are from the providers' official pages, read on
// 2026-10-28 and re-read on 2026-10-29 (see docs/stage-06/PROVIDERS.md). They change: an
// administrator should check them before raising the budget.
//
// OpenAI GPT Image models are billed per token. OpenAI publishes no per-image table for the
// 2.5 models, so the OUTPUT_TOKENS table below is an assumption, taken from the per-image
// token counts OpenAI published for gpt-image-1, with a safety margin. The real cost of a
// finished request is computed from the `usage` the API returns. Gemini image models have
// an official per-image price.

export const OPENAI_RATES = {
  // per 1M tokens: text input, image input, image output
  'gpt-image-2.5-sunburst': { text: 5, imageIn: 8, imageOut: 30 },
  'gpt-image-2.5-flare': { text: 5, imageIn: 8, imageOut: 30 },
};

// Assumed output tokens for a 1024×1024 image (gpt-image-1 published values) by quality;
// other frames scale with their pixel area (gpt-image-1's 1536×1024 values were exactly
// 1.5×). OpenAI publishes no per-image token table for GPT Image 2.5; real costs come from
// `usage`, and the server raises its estimate from recent real costs (store.js).
export const OPENAI_OUTPUT_TOKENS = { low: 272, medium: 1056, high: 4160 };
export const OPENAI_INPUT_TOKENS_PER_IMAGE = 1500; // assumption; billed from `usage` afterwards
export const OPENAI_MARGIN = 1.25;

export const GEMINI_RATES = {
  // per image output by size, per input image, per 1M text input / text+thinking output
  'gemini-3-pro-image': { image: { '1K': 0.134, '2K': 0.134, '4K': 0.24 }, inImage: 0.0011, text: 2, out: 12, imageOutPerM: 120 },
  'gemini-nano-banana-2.1': { image: { '1K': 0.0336, '2K': 0.0504, '4K': 0.113 }, inImage: 0.0011, text: 1.5, out: 12, imageOutPerM: 30 },
};
export const GEMINI_THINKING_TOKENS = 2000; // assumption for the estimate
export const GEMINI_MAX_REFERENCES = { 'gemini-3-pro-image': 6, 'gemini-nano-banana-2.1': 10 };

export const MODELS = {
  openai: Object.fromEntries(Object.keys(OPENAI_RATES).map((k) => [k, { maxReferences: 16 }])),
  gemini: Object.fromEntries(Object.keys(GEMINI_RATES).map((k) => [k, { maxReferences: GEMINI_MAX_REFERENCES[k] }])),
};

// The output frame follows the scene camera's aspect (Stage 05 keeps FOV and aspect fixed).
// GPT Image 2.5 takes any W×H divisible by 16 with an aspect between 1:3 and 3:1.
export const OPENAI_SIZES = { '16:9': '1536x864', '4:3': '1536x1152', '1:1': '1024x1024' };
export const GEMINI_ASPECTS = { '16:9': '16:9', '4:3': '4:3', '1:1': '1:1' };
const areaFactor = (aspect) => {
  const [w, h] = (OPENAI_SIZES[aspect] || '').split('x').map(Number);
  return w && h ? (w * h) / (1024 * 1024) : null;
};
export const geminiSize = (quality) => (quality === 'high' ? '2K' : '1K');

const round = (v) => Math.round(v * 10000) / 10000;

// Estimate before sending. `references` = number of input images, `promptChars` = prompt length.
export function estimateCost(provider, model, { quality, aspect, count = 1, references = 1, promptChars = 4000 }) {
  if (provider === 'openai') {
    const r = OPENAI_RATES[model];
    if (!r) return null;
    const base = OPENAI_OUTPUT_TOKENS[quality];
    const k = areaFactor(aspect);
    if (!base || !k) return null;
    const out = base * k;
    const input = (promptChars / 4) * r.text + references * OPENAI_INPUT_TOKENS_PER_IMAGE * r.imageIn;
    const perImage = (out * r.imageOut) / 1e6;
    return round((input / 1e6 + perImage * count) * OPENAI_MARGIN);
  }
  if (provider === 'gemini') {
    const r = GEMINI_RATES[model];
    if (!r || !GEMINI_ASPECTS[aspect]) return null;
    const perCall = r.image[geminiSize(quality)] + references * r.inImage + (promptChars / 4) * r.text / 1e6 + GEMINI_THINKING_TOKENS * r.out / 1e6;
    return round(perCall * count); // one image per call
  }
  return null;
}

// Cost from what the provider reports. Returns null when the response has no usage data.
export function actualCost(provider, model, usage) {
  if (!usage || typeof usage !== 'object') return null;
  if (provider === 'openai') {
    const r = OPENAI_RATES[model];
    const d = usage.input_tokens_details || {};
    if (!r || !Number.isFinite(usage.output_tokens)) return null;
    const text = Number.isFinite(d.text_tokens) ? d.text_tokens : 0;
    const img = Number.isFinite(d.image_tokens) ? d.image_tokens : Math.max(0, (usage.input_tokens || 0) - text);
    return round((text * r.text + img * r.imageIn + usage.output_tokens * r.imageOut) / 1e6);
  }
  if (provider === 'gemini') {
    const r = GEMINI_RATES[model];
    if (!r || !Number.isFinite(usage.promptTokenCount)) return null;
    // candidatesTokenCount includes the image tokens; thinking is billed as text output
    const cand = usage.candidatesTokenCount || 0;
    const thoughts = usage.thoughtsTokenCount || 0;
    return round((usage.promptTokenCount * r.text + cand * r.imageOutPerM + thoughts * r.out) / 1e6);
  }
  return null;
}

// The estimate for a request: the blockout, the plan drawing (when sent) and as many material
// samples as the model takes, with a fixed prompt size that covers the longest prompts
// (a large room with every finish and a 1200-character suggestion).
export const PROMPT_CHARS_FOR_ESTIMATE = 8000;

// Reference images the provider will get: [blockout, plan?, samples...] within its limit.
export function referencesFor(provider, model, sampleCount, withPlan = true) {
  const max = MODELS[provider]?.[model]?.maxReferences || 1;
  const fixed = withPlan && max >= 2 ? 2 : 1;
  return fixed + Math.max(0, Math.min(sampleCount, max - fixed));
}

export function estimateRequest(provider, model, { quality, aspect, count, samples, withPlan = true }) {
  return estimateCost(provider, model, { quality, aspect, count, references: referencesFor(provider, model, samples, withPlan), promptChars: PROMPT_CHARS_FOR_ESTIMATE });
}
