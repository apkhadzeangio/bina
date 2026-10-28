// Small DOM helpers, number formatting and icons.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Append children, skipping null/false (Element.append would print them as text).
export function add(parent, ...kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    parent.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return parent;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const nbsp = ' ';
const thin = ' ';

export function fmtNum(v, digits = 2) {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(digits);
  const [i, d] = s.split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, thin);
  return d ? `${grouped}.${d}` : grouped;
}
export const fmtArea = (v, d = 2) => `${fmtNum(v, d)}${nbsp}მ²`;
export const fmtLen = (v, d = 2) => `${fmtNum(v, d)}${nbsp}მ`;
export const fmtMoney = (v) => `${fmtNum(Math.round(v), 0)}${nbsp}₾`;

// Accepts "3.65", "3,65", " 3.65 მ".
export function parseNum(str) {
  if (typeof str === 'number') return str;
  const s = String(str).replace(',', '.').replace(/[^\d.\-]/g, '');
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : NaN;
}

const P = (d) => d.map((x) => `<path d="${x}"/>`).join('');
const ICONS = {
  select: P(['M6 3.5l11 7.2-5.2 1.3-2.6 4.8z']),
  rect: '<rect x="4" y="5.5" width="16" height="13" rx="0.5"/><circle cx="4" cy="5.5" r="1.4" fill="currentColor"/><circle cx="20" cy="18.5" r="1.4" fill="currentColor"/>',
  poly: P(['M4 4.5h9v6.5h7v8.5H4z']) + '<circle cx="13" cy="4.5" r="1.3" fill="currentColor"/><circle cx="20" cy="11" r="1.3" fill="currentColor"/>',
  door: P(['M3 20.5h4', 'M17 20.5h4', 'M7 20.5V9.5', 'M7 9.5a11 11 0 0 1 10 11']),
  window: '<rect x="3.5" y="9.5" width="17" height="5"/>' + P(['M3.5 12h17']),
  scale: P(['M3.5 16.5l13-13 4 4-13 13z', 'M7.5 12.5l1.8 1.8', 'M10.5 9.5l1.8 1.8', 'M13.5 6.5l1.8 1.8']),
  undo: P(['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11']),
  redo: P(['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13']),
  fit: P(['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5']),
  upload: P(['M12 15.5V4', 'M7.5 8.5L12 4l4.5 4.5', 'M4.5 15.5v4h15v-4']),
  trash: P(['M4.5 7h15', 'M9.5 7V4.5h5V7', 'M6.5 7l1 12.5h9l1-12.5']),
  cube: P(['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M12 12l8-4.5', 'M12 12v9', 'M12 12L4 7.5']),
  close: P(['M6 6l12 12', 'M18 6L6 18']),
  check: P(['M5 12.5l4.5 4.5L19 7.5']),
  chevron: P(['M9 6l6 6-6 6']),
  plus: P(['M12 5v14', 'M5 12h14']),
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1"/>' + P(['M15.5 8.5V4.5h-11v11h4']),
  download: P(['M12 4v11.5', 'M7.5 11L12 15.5 16.5 11', 'M4.5 19.5h15']),
  eye: P(['M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z']) + '<circle cx="12" cy="12" r="2.6"/>',
  layers: P(['M12 4l8.5 4.5L12 13 3.5 8.5z', 'M3.5 12.5L12 17l8.5-4.5', 'M3.5 16.5L12 21l8.5-4.5']),
  menu: P(['M4 7h16', 'M4 12h16', 'M4 17h16']),
  help: '<circle cx="12" cy="12" r="8.5"/>' + P(['M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6']) + '<circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none"/>',
  pencil: P(['M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.9 2.9L8.5 18.5z', 'M13.8 7.2l3 3']),
  coins: '<ellipse cx="10" cy="7" rx="5.5" ry="2.5"/>' + P(['M4.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7', 'M8.5 16.4c.5 1.2 2.8 2.1 5.5 2.1 3 0 5.5-1.1 5.5-2.5v-4c0-1.2-1.8-2.2-4.3-2.4']),
    focus: '<circle cx="12" cy="12" r="3"/>' + P(['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3']),
  sofa: P(['M5.5 11V8.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2V11', 'M3.5 11.5a1.5 1.5 0 0 1 3 0V14h11v-2.5a1.5 1.5 0 0 1 3 0V17.5h-17z', 'M5.5 17.5v1.5', 'M18.5 17.5v1.5']),
  rotate: P(['M19 12a7 7 0 1 1-2.05-4.95', 'M19.5 4.5v3.5H16']),
  rotateL: P(['M5 12a7 7 0 1 0 2.05-4.95', 'M4.5 4.5v3.5H8']),
  wall: P(['M4 4.5h16', 'M4 7.5h16']) + '<rect x="7" y="10.5" width="10" height="8" rx="1"/>' + P(['M12 7.5v3']),
};

export function icon(name, size = 20) {
  const span = document.createElement('span');
  span.className = 'ic';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    if (fallbackEl) {
      fallbackEl.hidden = false;
      fallbackEl.value = text;
      fallbackEl.focus();
      fallbackEl.select();
    }
    return false;
  }
}

let toastTimer = null;
export function toast(msg, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
