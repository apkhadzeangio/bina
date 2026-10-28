// Procedural material textures drawn on canvas. Each texture is a tileable patch of a
// known physical size (metres), so it can be repeated at true scale in 3D.

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = typeof seed === 'string' ? hash(seed) : seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => clamp255(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${clamp255(A[0] + (B[0] - A[0]) * t)},${clamp255(A[1] + (B[1] - A[1]) * t)},${clamp255(A[2] + (B[2] - A[2]) * t)})`;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  return c;
}

// Draw fn at (x, y) and at the wrapped copies so shapes crossing the patch edge tile cleanly.
function wrapDraw(W, H, x, y, w, h, fn) {
  for (const dx of [0, -W, W]) {
    for (const dy of [0, -H, H]) {
      const X = x + dx;
      const Y = y + dy;
      if (X + w < 0 || Y + h < 0 || X > W || Y > H) continue;
      fn(X, Y);
    }
  }
}

function grain(ctx, R, x, y, w, h, dark, ppm, horizontal = true) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const lines = Math.max(3, Math.round((horizontal ? h : w) / (ppm * 0.012)));
  ctx.strokeStyle = dark;
  for (let i = 0; i < lines; i++) {
    ctx.globalAlpha = 0.05 + R() * 0.12;
    ctx.lineWidth = Math.max(0.6, ppm * 0.0015 * (0.5 + R()));
    ctx.beginPath();
    if (horizontal) {
      const yy = y + (h * (i + R())) / lines;
      const amp = h * 0.08 * R();
      ctx.moveTo(x, yy);
      ctx.bezierCurveTo(x + w * 0.3, yy + amp, x + w * 0.6, yy - amp, x + w, yy + amp * 0.5);
    } else {
      const xx = x + (w * (i + R())) / lines;
      const amp = w * 0.08 * R();
      ctx.moveTo(xx, y);
      ctx.bezierCurveTo(xx + amp, y + h * 0.3, xx - amp, y + h * 0.6, xx + amp * 0.5, y + h);
    }
    ctx.stroke();
  }
  // a knot now and then
  if (R() < 0.35) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(x + w * R(), y + h * R(), ppm * 0.02, ppm * 0.008, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function speckle(ctx, R, x, y, w, h, color, density, size) {
  ctx.fillStyle = color;
  const n = Math.round(w * h * density);
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.15 + R() * 0.45;
    const s = size * (0.4 + R());
    ctx.fillRect(x + R() * w, y + R() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

function clouds(ctx, R, x, y, w, h, color, count, rMin, rMax, alpha) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0; i < count; i++) {
    const cx = x + R() * w;
    const cy = y + R() * h;
    const r = rMin + R() * (rMax - rMin);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.4 + R() * 0.6);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function veins(ctx, R, x, y, w, h, color, count, ppm) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let px = x + R() * w;
    let py = y + R() * h;
    let ang = R() * Math.PI * 2;
    const steps = 40 + Math.floor(R() * 40);
    const step = Math.max(w, h) / 40;
    const width = ppm * (0.002 + R() * 0.006);
    ctx.globalAlpha = 0.25 + R() * 0.4;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let s = 0; s < steps; s++) {
      ang += (R() - 0.5) * 0.7;
      px += Math.cos(ang) * step;
      py += Math.sin(ang) * step;
      ctx.lineTo(px, py);
      if (R() < 0.04) {
        ctx.stroke();
        ctx.lineWidth = width * (0.3 + R() * 0.6);
        ctx.beginPath();
        ctx.moveTo(px, py);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function surfacePattern(ctx, R, x, y, w, h, look, ppm) {
  const base = look.base;
  switch (look.pattern) {
    case 'concrete':
      clouds(ctx, R, x, y, w, h, shade(base, -0.12), 14, ppm * 0.08, ppm * 0.35, 0.35);
      clouds(ctx, R, x, y, w, h, shade(base, 0.12), 10, ppm * 0.06, ppm * 0.3, 0.3);
      speckle(ctx, R, x, y, w, h, shade(base, -0.3), 0.004 / (ppm / 256), Math.max(1, ppm * 0.003));
      break;
    case 'stone':
      clouds(ctx, R, x, y, w, h, shade(base, -0.08), 10, ppm * 0.05, ppm * 0.2, 0.3);
      speckle(ctx, R, x, y, w, h, shade(base, -0.25), 0.006 / (ppm / 256), Math.max(1, ppm * 0.0025));
      speckle(ctx, R, x, y, w, h, shade(base, 0.25), 0.004 / (ppm / 256), Math.max(1, ppm * 0.0025));
      break;
    case 'marble':
      clouds(ctx, R, x, y, w, h, shade(base, -0.05), 8, ppm * 0.1, ppm * 0.4, 0.25);
      veins(ctx, R, x, y, w, h, look.vein || shade(base, -0.4), 2 + Math.floor(R() * 3), ppm);
      break;
    case 'travertine':
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      for (let i = 0; i < h / (ppm * 0.015); i++) {
        ctx.globalAlpha = 0.06 + R() * 0.12;
        ctx.fillStyle = R() < 0.5 ? shade(base, -0.15) : shade(base, 0.12);
        const yy = y + R() * h;
        ctx.fillRect(x, yy, w, ppm * (0.002 + R() * 0.01));
      }
      ctx.restore();
      speckle(ctx, R, x, y, w, h, shade(base, -0.35), 0.0012 / (ppm / 256), Math.max(1.5, ppm * 0.006));
      break;
    case 'terrazzo': {
      const chips = ['#9c8f80', '#c7b9a6', '#7e8a8c', '#d8a58a', '#5f5a55', '#e9e2d6'];
      const n = Math.round(((w * h) / (ppm * ppm)) * 260);
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = chips[Math.floor(R() * chips.length)];
        const r = ppm * (0.004 + R() * 0.012);
        ctx.beginPath();
        const cx = x + R() * w;
        const cy = y + R() * h;
        const k = 5 + Math.floor(R() * 3);
        for (let j = 0; j < k; j++) {
          const a = (j / k) * Math.PI * 2;
          const rr = r * (0.6 + R() * 0.6);
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'zellige': {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, 'rgba(255,255,255,0.28)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      clouds(ctx, R, x, y, w, h, shade(base, -0.18), 3, w * 0.2, w * 0.6, 0.35);
      break;
    }
    case 'speckle':
      speckle(ctx, R, x, y, w, h, look.fleck || shade(base, -0.2), 0.02 / (ppm / 256), Math.max(1, ppm * 0.002));
      break;
    case 'wood':
      grain(ctx, R, x, y, w, h, shade(base, -0.3), ppm, w >= h);
      break;
    default:
      speckle(ctx, R, x, y, w, h, shade(base, -0.06), 0.002 / (ppm / 256), Math.max(1, ppm * 0.003));
  }
}

function drawPlanks(look, seed, ppmWanted) {
  const L = look.l;
  const Wd = look.w;
  const Wm = L * 3;
  const rows = 8;
  const Hm = Wd * rows;
  const ppm = Math.min(ppmWanted, 1024 / Math.max(Wm, Hm));
  const W = Wm * ppm;
  const H = Hm * ppm;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const R = rng(seed);
  ctx.fillStyle = look.base;
  ctx.fillRect(0, 0, c.width, c.height);
  const pw = Wd * ppm;
  const pl = L * ppm;
  for (let r = 0; r < rows; r++) {
    const off = (R() * 3) * pl / 3 + (r % 2) * pl * 0.5;
    for (let k = -1; k < 4; k++) {
      const x = off + k * pl;
      const y = r * pw;
      const t = R();
      const fill = t < 0.33 ? shade(look.base, (R() - 0.5) * 0.12) : mix(look.base, look.dark, R() * 0.45);
      wrapDraw(c.width, c.height, x, y, pl, pw, (X, Y) => {
        ctx.fillStyle = fill;
        ctx.fillRect(X, Y, pl, pw);
        grain(ctx, rng(seed + r * 31 + k), X, Y, pl, pw, look.dark, ppm, true);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(X, Y, Math.max(1, ppm * 0.002), pw);
        ctx.fillRect(X, Y, pl, Math.max(1, ppm * 0.0015));
      });
    }
  }
  return { canvas: c, w: Wm, h: Hm };
}

// Chevron ("ნაძვისებრი") pattern computed per pixel so it tiles exactly.
function drawChevron(look, seed, ppmWanted) {
  const col = look.l * Math.SQRT1_2;
  const pitch = look.w * Math.SQRT2;
  const Wm = col * 2;
  const Hm = pitch * 8;
  const ppm = Math.min(ppmWanted, 768 / Math.max(Wm, Hm));
  const c = canvas(Wm * ppm, Hm * ppm);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  const base = hexToRgb(look.base);
  const dark = hexToRgb(look.dark);
  const R = rng(seed);
  const tones = Array.from({ length: 64 }, () => R());
  const colPx = col * ppm;
  const pitchPx = pitch * ppm;
  for (let py = 0; py < c.height; py++) {
    for (let px = 0; px < c.width; px++) {
      const j = Math.floor(px / colPx);
      const xl = px - j * colPx;
      const s = j % 2 === 0 ? py + xl : py - xl + colPx;
      const idx = Math.floor(s / pitchPx);
      const within = s / pitchPx - idx;
      const t = tones[((idx % 8) + 8 + j * 8) % 64];
      const edgeDark = within < 0.04 || xl < 1 ? 0.75 : 1;
      const g = 0.92 + 0.08 * Math.sin((xl + idx * 13) * 0.9 + t * 20);
      const k = (py * c.width + px) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = (base[ch] + (dark[ch] - base[ch]) * t * 0.6) * edgeDark * g;
        img.data[k + ch] = v;
      }
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, w: Wm, h: Hm };
}

function drawTiles(look, seed, ppmWanted) {
  const tw = look.w;
  const th = look.h;
  const cols = Math.max(2, Math.ceil(1.2 / tw));
  let rows = Math.max(2, Math.ceil(1.2 / th));
  if (look.stagger && rows % 2) rows += 1;
  const Wm = cols * tw;
  const Hm = rows * th;
  const ppm = Math.min(ppmWanted, 1024 / Math.max(Wm, Hm));
  const c = canvas(Wm * ppm, Hm * ppm);
  const ctx = c.getContext('2d');
  const R = rng(seed);
  ctx.fillStyle = look.grout;
  ctx.fillRect(0, 0, c.width, c.height);
  const gw = Math.max(1, ppm * 0.003);
  const vary = look.pattern === 'zellige' ? 0.22 : look.pattern === 'plain' ? 0.03 : 0.06;
  for (let r = 0; r < rows; r++) {
    const off = look.stagger && r % 2 ? (tw * ppm) / 2 : 0;
    for (let k = -1; k <= cols; k++) {
      const x = off + k * tw * ppm;
      const y = r * th * ppm;
      const w = tw * ppm;
      const h = th * ppm;
      const fill = shade(look.base, (R() - 0.5) * vary * 2);
      const seedK = seed + ':' + r + ':' + k;
      wrapDraw(c.width, c.height, x, y, w, h, (X, Y) => {
        ctx.fillStyle = fill;
        ctx.fillRect(X + gw / 2, Y + gw / 2, w - gw, h - gw);
        ctx.save();
        ctx.beginPath();
        ctx.rect(X + gw / 2, Y + gw / 2, w - gw, h - gw);
        ctx.clip();
        surfacePattern(ctx, rng(seedK), X, Y, w, h, { ...look, base: look.base }, ppm);
        ctx.restore();
      });
    }
  }
  return { canvas: c, w: Wm, h: Hm };
}

function drawSlab(look, seed, ppmWanted) {
  const Wm = 2;
  const Hm = 2;
  const ppm = Math.min(ppmWanted, 512 / Wm);
  const c = canvas(Wm * ppm, Hm * ppm);
  const ctx = c.getContext('2d');
  const R = rng(seed);
  ctx.fillStyle = look.base;
  ctx.fillRect(0, 0, c.width, c.height);
  surfacePattern(ctx, R, 0, 0, c.width, c.height, look, ppm);
  return { canvas: c, w: Wm, h: Hm };
}

const cache = new Map();

export function texturePatch(material, ppm = 256) {
  const key = `${material.id}@${ppm}`;
  if (cache.has(key)) return cache.get(key);
  const look = material.look;
  let out = null;
  switch (look.kind) {
    case 'plank': out = drawPlanks(look, material.id, ppm); break;
    case 'herringbone': out = drawChevron(look, material.id, ppm); break;
    case 'tile': out = drawTiles(look, material.id, ppm); break;
    case 'stone': out = drawSlab(look, material.id, ppm); break;
    default: out = null;
  }
  cache.set(key, out);
  return out;
}

export function isTextured(material) {
  return ['plank', 'herringbone', 'tile', 'stone'].includes(material.look.kind);
}

// Square swatch showing roughly `meters` of the material.
export function swatch(material, sizePx = 96, meters) {
  const c = canvas(sizePx, sizePx);
  const ctx = c.getContext('2d');
  const look = material.look;
  if (!isTextured(material)) {
    ctx.fillStyle = look.base;
    ctx.fillRect(0, 0, sizePx, sizePx);
    if (look.kind === 'paint') {
      const R = rng(material.id);
      for (let i = 0; i < 40; i++) {
        ctx.globalAlpha = 0.04;
        ctx.fillStyle = R() < 0.5 ? '#000' : '#fff';
        ctx.fillRect(0, R() * sizePx, sizePx, 1 + R() * 3);
      }
      ctx.globalAlpha = 1;
    }
    return c;
  }
  const patch = texturePatch(material);
  const span = meters || Math.min(2.4, Math.max(0.9, Math.max(look.w || 0.6, look.h || 0.6, look.l || 0) * 1.3));
  const scale = sizePx / span; // px per metre on the swatch
  const pw = patch.w * scale;
  const ph = patch.h * scale;
  for (let x = 0; x < sizePx; x += pw) {
    for (let y = 0; y < sizePx; y += ph) {
      ctx.drawImage(patch.canvas, x, y, pw, ph);
    }
  }
  return c;
}
