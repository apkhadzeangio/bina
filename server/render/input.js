// Reading and checking what the browser sends.
import { RenderError } from './errors.js';
import { QUALITIES, ASPECTS } from './config.js';

// Read the body up to `max` bytes; a larger body is refused without reading the rest.
export async function readJsonLimited(request, max) {
  const len = Number(request.headers.get('content-length'));
  if (Number.isFinite(len) && len > max) throw new RenderError('too_large', 413);
  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) throw new RenderError('bad_request', 415);
  if (!request.body) throw new RenderError('bad_request', 400);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new RenderError('too_large', 413);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch (e) {
    throw new RenderError('bad_request', 400, { detail: 'invalid JSON' });
  }
}

const MAGIC = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

// A base64 data URL of a PNG, JPEG or WebP whose first bytes match its type.
export function checkImage(dataUrl, maxBytes) {
  if (typeof dataUrl !== 'string') throw new RenderError('bad_image', 400);
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m) throw new RenderError('bad_image', 400, { detail: 'not a png/jpeg/webp data URL' });
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > maxBytes) throw new RenderError('too_large', 413, { detail: 'image too large' });
  if (bytes < 64) throw new RenderError('bad_image', 400, { detail: 'image too small' });
  const head = Uint8Array.from(atob(m[2].slice(0, 16)), (c) => c.charCodeAt(0));
  if (!MAGIC[m[1]](head)) throw new RenderError('bad_image', 400, { detail: 'content does not match type' });
  return { mime: m[1], data: m[2], bytes, url: dataUrl };
}

export const LIMITS = { blockoutBytes: 1.5 * 1024 * 1024, planBytes: 600 * 1024, sampleBytes: 300 * 1024, maxSamples: 12 };

// The request:
// { scene: <bina.ai-scene v1>, sceneRevision, blockout: <data URL>, plan?: <data URL>,
//   samples: [{ key: '<roomId|*>|<surface>', image: <data URL> }],
//   options: { quality, count }, consent: { dataTransfer, adult, maxUsd } }
// The frame (aspect) is the scene camera's; style, lighting and the user's suggestion are in
// the scene's preferences.
export function checkRequest(body, cfg) {
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(body)) throw new RenderError('bad_request', 400);
  const consent = isObj(body.consent) ? body.consent : {};
  if (consent.dataTransfer !== true || consent.adult !== true) throw new RenderError('consent_required', 403);
  const maxUsd = Number(consent.maxUsd);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new RenderError('consent_required', 403, { detail: 'no accepted cost' });
  const o = isObj(body.options) ? body.options : {};
  const quality = cfg.qualities.includes(o.quality) ? o.quality : null;
  const count = Number.isInteger(o.count) && o.count >= 1 && o.count <= cfg.maxImages ? o.count : null;
  if (!quality || !count) throw new RenderError('bad_request', 400, { detail: `options: quality one of ${cfg.qualities.join('/')}, count 1..${cfg.maxImages}` });
  if (typeof body.sceneRevision !== 'string' || !/^fnv1a64-[0-9a-f]{16}$/.test(body.sceneRevision)) throw new RenderError('bad_scene', 400, { detail: 'sceneRevision' });
  const blockout = checkImage(body.blockout, LIMITS.blockoutBytes);
  const plan = body.plan === undefined || body.plan === null ? null : checkImage(body.plan, LIMITS.planBytes);
  const rawSamples = Array.isArray(body.samples) ? body.samples : [];
  if (rawSamples.length > LIMITS.maxSamples) throw new RenderError('bad_request', 400, { detail: 'too many samples' });
  const samples = rawSamples.map((x) => {
    if (!isObj(x) || typeof x.key !== 'string' || x.key.length > 120) throw new RenderError('bad_request', 400, { detail: 'sample' });
    return { key: x.key, image: checkImage(x.image, LIMITS.sampleBytes) };
  });
  return { scene: body.scene, sceneRevision: body.sceneRevision, blockout, plan, samples, quality, count, maxUsd };
}

export { QUALITIES, ASPECTS };
