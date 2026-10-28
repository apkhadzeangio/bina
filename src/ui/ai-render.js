// "AI დიზაინის გენერაცია": a photorealistic concept image of one room, from the chosen
// camera, with the chosen finishes.
//
// The browser sends the structured scene (src/core/scene.js), a sketch of the room drawn
// by the 3D view from that camera, and drawn samples of the finishes to /api/render. The
// server checks everything, builds the instructions and calls the image provider. Nothing
// is generated without the user's explicit confirmation of the data transfer and the cost,
// and the result is always labelled as a conceptual AI visualization. The plan and the
// chosen products are never changed by a result.
import { current, commit } from './store.js';
import { h, add, clear, icon, toast } from './dom.js';
import { swatch } from './textures.js';
import { MATERIALS, STYLES, STYLE_ORDER } from '../core/catalog.js';
import { PURPOSES, roomLabel } from '../core/model.js';
import { area } from '../core/geometry.js';
import { sceneSpec, sceneRevision } from '../core/scene.js';
import { SURFACES, GLOBAL_SURFACES } from '../core/finishes.js';
import { product } from '../core/products.js';
import { estimateRequest } from '../../server/render/cost.js';
import { provenanceBadges } from './material-board.js';
import { putRender, getRender, deleteRender, base64ToBlob } from './render-store.js';

/* global __SITE__ */

const ASPECT_PX = { landscape: [1536, 1024], portrait: [1024, 1536], square: [1024, 1024] };
const ASPECT_LABEL = { landscape: 'ჰორიზონტალური', portrait: 'ვერტიკალური', square: 'კვადრატი' };
const QUALITY_LABEL = { low: 'სწრაფი ესკიზი', medium: 'სტანდარტული', high: 'მაღალი ხარისხი' };
const SAMPLE_ORDER = ['floor', 'walls', 'backsplash', 'countertop', 'cabinet', 'walls_upper', 'vanity', 'ceiling', 'skirting', 'sanitary'];
const MAX_SAMPLES = 8;
const CODE_KEY = 'bina-designer:render-access';
const CLIENT_KEY = 'bina-designer:client-id';
const UNAVAILABLE = {
  disabled: 'AI გენერაცია ჯერ ჩართული არ არის: ადმინისტრატორს ჯერ არ დაუყენებია AI სერვისის გასაღები და ბიუჯეტი. ოთახის, ხედისა და მასალების მომზადება უკვე შეგიძლია.',
  not_configured: 'AI სერვისი ბოლომდე არ არის მოწყობილი (გასაღები, ბიუჯეტი ან მონაცემთა ბაზა აკლია).',
  offline: 'AI სერვისთან დაკავშირება ვერ მოხერხდა. შეამოწმე ინტერნეტი და სცადე თავიდან.',
  artifact: 'AI გენერაცია მუშაობს მხოლოდ bina.lithos.ge-ზე.',
};

const usd = (v) => (v === null || v === undefined ? '—' : `$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const store = {
  get(k) {
    try { return localStorage.getItem(k) || ''; } catch (e) { return ''; }
  },
  set(k, v) {
    try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* not remembered */ }
  },
};

function clientId() {
  let id = store.get(CLIENT_KEY);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    id = crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000'.replace(/0/g, () => Math.floor(Math.random() * 16).toString(16));
    store.set(CLIENT_KEY, id);
  }
  return id;
}

// Rooms that can be rendered from inside.
export function renderableRooms(p) {
  return p.rooms.filter((r) => !PURPOSES[r.purpose]?.outdoor && area(r.points) >= 1.5);
}

// Is a saved render still what the plan shows? (same room, camera, style → same revision)
export function renderIsCurrent(p, meta) {
  if (!p.rooms.some((r) => r.id === meta.roomId)) return false;
  try {
    return sceneRevision(sceneSpec(p, { roomId: meta.roomId, camera: meta.camera, style: meta.style })) === meta.sceneRevision;
  } catch (e) {
    return false;
  }
}

// The drawn material samples sent with a scene, most important first.
export function sampleSurfaces(spec, max = MAX_SAMPLES) {
  const rank = (m) => (m.mandatory ? 0 : 100) + (SAMPLE_ORDER.indexOf(m.surface) + 1 || 50);
  return spec.materials.slice().sort((a, b) => rank(a) - rank(b)).slice(0, max).map((m) => m.surface);
}

function sampleImage(materialId) {
  const c = swatch(MATERIALS[materialId], 256);
  return c.toDataURL('image/jpeg', 0.85);
}

// Put the label on the image itself before it leaves the program.
async function stampedBlob(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const pad = Math.round(c.width * 0.012);
    const fs = Math.max(14, Math.round(c.width * 0.014));
    ctx.font = `600 ${fs}px "Noto Sans Georgian", sans-serif`;
    const text = 'BINA · AI კონცეფცია — არა ზუსტი ნახაზი';
    const w = ctx.measureText(text).width + pad * 2;
    ctx.fillStyle = 'rgba(15,18,20,0.62)';
    ctx.fillRect(pad, c.height - pad - fs * 1.8, w, fs * 1.8);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, pad * 2, c.height - pad - fs * 0.9);
    return await new Promise((r) => c.toBlob((b) => r(b || blob), 'image/jpeg', 0.92));
  } catch (e) {
    return blob;
  }
}

export function createRenderDialog({ getView, onEditMaterials, onViewChanged }) {
  const dlg = h('dialog', { class: 'modal ai-dialog', 'aria-labelledby': 'ai-title' });
  document.body.append(dlg);
  let cfg = null; // server configuration, or { available: false, reason }
  let form = null;
  let mode = 'form';
  let run = null; // { ctrl, started, timer }
  let result = null; // { meta, url, blob, saved, current }
  let lastError = null;
  let sketchUrl = null;

  dlg.addEventListener('cancel', (e) => {
    if (mode === 'running') e.preventDefault(); // Esc must not hide a paid request; use "cancel"
  });
  dlg.addEventListener('close', () => {
    if (result?.url && !result.keepUrl) URL.revokeObjectURL(result.url);
  });

  async function loadConfig() {
    if (!__SITE__) return { available: false, reason: 'artifact' };
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch('/api/render/config', { signal: ctrl.signal, headers: { accept: 'application/json' } });
      clearTimeout(t);
      if (!res.ok) return { available: false, reason: res.status === 404 ? 'disabled' : 'offline' };
      return await res.json();
    } catch (e) {
      return { available: false, reason: 'offline' };
    }
  }

  function view() {
    return getView();
  }

  // Stand in the room (if not already) so the sketch is taken from inside it.
  function ensureRoomView() {
    const v = view();
    if (!v) return;
    if (v.view.kind !== 'room' || v.view.roomId !== form.roomId) v.setView('room', { roomId: form.roomId });
    onViewChanged?.();
  }

  function takeSketch() {
    const v = view();
    if (!v) return null;
    const [w, hgt] = ASPECT_PX[form.aspect];
    return v.snapshot({ width: w, height: hgt, quality: 0.88 });
  }

  function estimate() {
    if (!cfg?.available || !form) return null;
    const spec = currentSpec();
    const samples = spec ? Math.min(sampleSurfaces(spec).length, MAX_SAMPLES) : 0;
    return estimateRequest(cfg.provider.name, cfg.provider.model, { quality: form.quality, aspect: form.aspect, count: 1, samples });
  }

  function currentSpec() {
    const v = view();
    const p = current();
    if (!p.rooms.some((r) => r.id === form.roomId)) return null;
    return sceneSpec(p, { roomId: form.roomId, camera: v ? v.cameraState() : null, style: form.style });
  }

  // ---------------------------------------------------------------- rendering of the dialog
  function head(title) {
    return h('div', { class: 'modal-head' },
      h('div', null, h('p', { class: 'eyebrow' }, 'AI დიზაინის გენერაცია'), h('h2', { id: 'ai-title' }, title)),
      mode === 'running' ? null : h('button', { type: 'button', class: 'btn btn-ghost icon-btn', 'aria-label': 'დახურვა', onclick: () => dlg.close() }, icon('close', 20)));
  }

  function render() {
    clear(dlg);
    if (mode === 'running') return renderRunning();
    if (mode === 'result') return renderResult();
    if (mode === 'error') return renderError();
    return renderForm();
  }

  function renderForm() {
    const p = current();
    const rooms = renderableRooms(p);
    const room = p.rooms.find((r) => r.id === form.roomId);
    if (!room) {
      add(dlg, head('ოთახი არ არის'), h('div', { class: 'modal-body' }, h('p', null, 'გენერაციისთვის საჭიროა მინიმუმ ერთი ოთახი (არა აივანი), 1.5 მ²-ზე მეტი.')));
      return;
    }
    const spec = currentSpec();
    const est = estimate();
    const available = !!cfg?.available;
    const canSubmit = available && form.consentData && form.consentAdult && (!cfg.accessCodeRequired || form.code.trim()) && est !== null && !!view();
    const saved = (p.renders || []).filter((r) => r.roomId === form.roomId).slice().reverse();

    add(dlg,
      head(roomLabel(room, p.rooms)),
      h('div', { class: 'modal-body ai-form' },
        available ? null : h('div', { class: 'status warn', role: 'status' }, UNAVAILABLE[cfg?.reason] || UNAVAILABLE.offline),
        !view() ? h('div', { class: 'status warn' }, 'ესკიზისთვის საჭიროა 3D ხედი, რომელიც ამ მოწყობილობაზე ვერ ჩაიტვირთა.') : null,

        h('section', { class: 'ai-sec' },
          h('h3', null, '1. ოთახი და ხედი'),
          h('div', { class: 'ai-grid' },
            h('div', { class: 'ai-sketch' },
              sketchUrl ? h('img', { src: sketchUrl, alt: 'ესკიზი, რომელიც AI-ს გაეგზავნება: ოთახი არჩეული ხედიდან' }) : h('div', { class: 'ai-sketch-empty' }, '3D ხედი არ არის'),
              h('span', { class: 'sample-cap' }, 'ესკიზი AI-სთვის')),
            h('div', { class: 'ai-side' },
              h('label', { class: 'field' }, h('span', null, 'ოთახი'),
                h('select', { class: 'unit-sel', onchange: (e) => { form.roomId = e.target.value; ensureRoomView(); refreshSketch(); } },
                  rooms.map((r) => h('option', { value: r.id, selected: r.id === form.roomId }, `${roomLabel(r, p.rooms)} · ${area(r.points).toFixed(1)} მ²`)))),
              h('div', { class: 'btn-row' },
                h('button', { type: 'button', class: 'btn btn-sm', disabled: !view(), onclick: () => { view()?.nextCorner(); onViewChanged?.(); refreshSketch(); } }, icon('rotate', 16), 'სხვა კუთხე')),
              h('div', { class: 'field' }, h('span', null, 'კადრი'),
                h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'კადრი' }, Object.keys(ASPECT_PX).map((k) => h('button', {
                  type: 'button', role: 'radio', 'aria-checked': form.aspect === k ? 'true' : 'false', class: `seg-btn${form.aspect === k ? ' on' : ''}`,
                  onclick: () => { form.aspect = k; refreshSketch(); },
                }, ASPECT_LABEL[k])))),
              h('p', { class: 'muted small' }, 'კამერა დგას ოთახში, თვალის სიმაღლეზე. ზუსტი კუთხე 3D ხედში შეგიძლია შეცვალო გადათრევით.')))),

        h('section', { class: 'ai-sec' },
          h('div', { class: 'sec-row' }, h('h3', null, '2. მასალები'),
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { dlg.close(); onEditMaterials?.(form.roomId); } }, 'შეცვლა')),
          spec ? h('ul', { class: 'ai-mats' }, spec.materials.map((m) => {
            const pr = product(m.materialId);
            const s = swatch(MATERIALS[m.materialId], 40);
            s.className = 'sw';
            return h('li', null, s,
              h('span', { class: 'ai-mat-txt' },
                h('span', { class: 'muted small' }, SURFACES[m.surface]?.label || GLOBAL_SURFACES[m.surface]?.label || m.surface, m.mandatory ? ' · სავალდებულო' : ' · მოქნილი'),
                h('span', null, pr.name),
                provenanceBadges(pr, { compact: true })));
          })) : null,
          h('p', { class: 'muted small' }, 'AI-ს ეგზავნება პროდუქტის სახელი, ფერი, ზომა და დახატული ნიმუში — არა პროდუქტის ფოტო. ამიტომ მასალის ზუსტ გამეორებას ვერ ვამტკიცებთ.')),

        h('section', { class: 'ai-sec' },
          h('h3', null, '3. ინტერიერის სტილი'),
          h('div', { class: 'tabs' }, STYLE_ORDER.map((k) => h('button', {
            type: 'button', class: `tab${form.style === k ? ' on' : ''}`, 'aria-pressed': form.style === k ? 'true' : 'false',
            onclick: () => { form.style = k; render(); },
          }, STYLES[k].label))),
          h('p', { class: 'muted small' }, 'სტილი განსაზღვრავს ავეჯის ფორმას, ტექსტილს და აქსესუარებს მხოლოდ ამ სურათზე. პროექტის მასალები არ იცვლება.')),

        h('section', { class: 'ai-sec' },
          h('h3', null, '4. ხარისხი და ღირებულება'),
          available ? h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'ხარისხი' }, cfg.qualities.map((q) => h('button', {
            type: 'button', role: 'radio', 'aria-checked': form.quality === q ? 'true' : 'false', class: `seg-btn${form.quality === q ? ' on' : ''}`,
            onclick: () => { form.quality = q; render(); },
          }, QUALITY_LABEL[q]))) : null,
          available ? h('div', { class: 'ai-cost' },
            h('div', null, h('span', { class: 'muted small' }, 'სავარაუდო ღირებულება'), h('b', { class: 'num' }, `≈ ${usd(est)}`)),
            h('div', null, h('span', { class: 'muted small' }, 'მოდელი'), h('b', null, `${cfg.provider.label} · ${cfg.provider.model}`)),
            h('div', null, h('span', { class: 'muted small' }, 'ლიმიტი'), h('b', null, `დღეში ${cfg.limits.perUserDaily} გენერაცია`)))
            : h('p', { class: 'muted small' }, 'ღირებულება გამოჩნდება, როცა სერვისი ჩაირთვება.'),
          available && cfg.fallback ? h('p', { class: 'muted small' }, `თუ ${cfg.provider.label} დროებით მიუწვდომელია, გამოიყენება ${cfg.fallback.label} (${cfg.fallback.model}) — მხოლოდ იმ შემთხვევაში, თუ მისი ღირებულება ამ შეფასებას არ აჭარბებს.`) : null,
          h('p', { class: 'muted small' }, 'ღირებულება მიახლოებითია: საბოლოო ფასს AI სერვისი ითვლის. გაუქმებული ან შეწყვეტილი გენერაციაც შეიძლება დაირიცხოს.')),

        h('section', { class: 'ai-sec ai-consent' },
          h('h3', null, '5. დადასტურება'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: form.consentData, onchange: (e) => { form.consentData = e.target.checked; render(); } }),
            ` ვეთანხმები, რომ ოთახის ესკიზი, ზომები, ავეჯის განლაგება და არჩეული მასალები გაეგზავნება ${available ? `${cfg.provider.label}${cfg.fallback ? ` (ან ${cfg.fallback.label})` : ''}` : 'AI სერვისს'}-ს სურათის შესაქმნელად.`),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: form.consentAdult, onchange: (e) => { form.consentAdult = e.target.checked; render(); } }), ' ვარ 18 წლის ან უფროსი.'),
          available && cfg.accessCodeRequired ? h('label', { class: 'field' }, h('span', null, 'წვდომის კოდი'),
            h('input', { class: 'text-in', id: 'ai-code', type: 'password', autocomplete: 'off', value: form.code, oninput: (e) => { form.code = e.target.value; syncSubmit(); } })) : null,
          h('p', { class: 'ai-note' }, icon('image', 16), ' შედეგი იქნება ', h('b', null, 'კონცეპტუალური AI ვიზუალიზაცია'), ', არა ზუსტი არქიტექტურული ნახაზი. ზომები და მასალების რაოდენობა — გეგმასა და ხარჯთაღრიცხვაში.')),

        saved.length ? h('section', { class: 'ai-sec' }, h('h3', null, 'შენახული ვიზუალიზაციები'),
          h('div', { class: 'ai-gallery' }, saved.map((meta) => galleryItem(meta, p)))) : null,

        h('div', { class: 'ai-actions' },
          h('button', { type: 'button', class: 'btn btn-accent btn-lg', id: 'ai-submit', disabled: !canSubmit, onclick: submit }, icon('sparkle', 18), `გენერაცია${est !== null && available ? ` (≈ ${usd(est)})` : ''}`))),
    );
  }

  function syncSubmit() {
    const btn = dlg.querySelector('#ai-submit');
    if (!btn) return;
    btn.disabled = !(cfg?.available && form.consentData && form.consentAdult && (!cfg.accessCodeRequired || form.code.trim()) && estimate() !== null && !!view());
  }

  function galleryItem(meta, p) {
    const fresh = renderIsCurrent(p, meta);
    const img = h('img', { alt: '', loading: 'lazy' });
    getRender(meta.id).then((blob) => { if (blob) img.src = URL.createObjectURL(blob); else img.replaceWith(h('span', { class: 'ai-missing' }, 'სურათი ამ ბრაუზერში არ არის')); });
    return h('button', { type: 'button', class: 'ai-thumb', onclick: () => openSaved(meta) },
      img,
      h('span', { class: `badge ${fresh ? 'v-verified' : 'v-indicative'}` }, fresh ? 'მიმდინარე' : 'გეგმა შეიცვალა'),
      h('span', { class: 'muted small' }, new Date(meta.createdAt).toLocaleString('ka-GE', { dateStyle: 'short', timeStyle: 'short' })));
  }

  function renderRunning() {
    const elapsed = (Date.now() - run.started) / 1000;
    add(dlg, head('იქმნება სურათი…'),
      h('div', { class: 'modal-body ai-running', 'aria-live': 'polite' },
        sketchUrl ? h('div', { class: 'ai-sketch ai-sketch-dim' }, h('img', { src: sketchUrl, alt: '' }), h('div', { class: 'ai-spinner', 'aria-hidden': 'true' })) : null,
        h('p', { class: 'ai-elapsed num' }, fmtTime(elapsed)),
        h('p', null, `${cfg.provider.label} ქმნის ვიზუალიზაციას. ჩვეულებრივ ამას 30 წამიდან 2 წუთამდე სჭირდება (ზღვარი — ${Math.round(cfg.timeoutSeconds / 60 * 10) / 10} წთ).`),
        h('button', { type: 'button', class: 'btn', onclick: cancel }, 'გაუქმება'),
        h('p', { class: 'muted small' }, 'გაუქმება შეწყვეტს ლოდინს. თუ AI-მ გენერაცია უკვე დაიწყო, ის შეიძლება მაინც დაირიცხოს.')));
  }

  function renderError() {
    const e = lastError;
    add(dlg, head('სურათი ვერ შეიქმნა'),
      h('div', { class: 'modal-body' },
        h('div', { class: 'status warn', role: 'alert' }, e.message),
        e.code ? h('p', { class: 'muted small' }, `კოდი: ${e.code}`) : null,
        h('div', { class: 'btn-row' },
          e.retryable || ['provider_timeout', 'cancelled', 'network'].includes(e.code)
            ? h('button', { type: 'button', class: 'btn btn-accent', onclick: () => { mode = 'form'; render(); submit(); } }, 'თავიდან ცდა') : null,
          h('button', { type: 'button', class: 'btn', onclick: () => { mode = 'form'; render(); } }, 'პარამეტრებზე დაბრუნება'))));
  }

  function renderResult() {
    const m = result.meta;
    const p = current();
    const fresh = renderIsCurrent(p, m);
    add(dlg, head(p.rooms.find((r) => r.id === m.roomId) ? roomLabel(p.rooms.find((r) => r.id === m.roomId), p.rooms) : 'ვიზუალიზაცია'),
      h('div', { class: 'modal-body' },
        h('figure', { class: 'ai-result' },
          h('img', { src: result.url, alt: 'AI-ით შექმნილი კონცეპტუალური ვიზუალიზაცია' }),
          h('span', { class: 'ai-label' }, 'AI კონცეფცია — არა ზუსტი ნახაზი'),
          h('figcaption', { class: 'muted small' }, result.label || 'AI-ით შექმნილი კონცეპტუალური ვიზუალიზაცია. ზომები და მასალები — გეგმასა და ხარჯთაღრიცხვაში.')),
        h('dl', { class: 'facts' },
          h('dt', null, 'მოდელი'), h('dd', null, `${m.provider === 'openai' ? 'OpenAI' : m.provider === 'gemini' ? 'Google Gemini' : m.provider} · ${m.model}${result.fallbackUsed ? ' (სარეზერვო)' : ''}`),
          h('dt', null, 'სცენის ვერსია'), h('dd', null, h('code', null, m.sceneRevision), ' ', h('span', { class: `badge ${fresh ? 'v-verified' : 'v-indicative'}` }, fresh ? 'ემთხვევა გეგმას' : 'გეგმა მას შემდეგ შეიცვალა')),
          h('dt', null, 'შეიქმნა'), h('dd', null, new Date(m.createdAt).toLocaleString('ka-GE')),
          h('dt', null, 'ღირებულება'), h('dd', null, `${usd(m.costUsd)} ${m.costBasis === 'usage' ? '(AI სერვისის მონაცემით)' : '(შეფასება)'}`),
          result.samples ? [h('dt', null, 'მასალის ნიმუშები'), h('dd', null, result.samples.map((s) => SURFACES[s]?.label || s).join(', ') || '—')] : null),
        h('p', { class: 'muted small' }, 'AI-მ მასალები შეიძლება ზუსტად ვერ გაიმეოროს: ფერი, ფაქტურა და მასშტაბი გადაამოწმე მაღაზიაში. ეს სურათი გეგმას და არჩეულ პროდუქტებს არ ცვლის.'),
        h('div', { class: 'btn-row ai-actions' },
          result.saved
            ? h('span', { class: 'badge v-verified' }, icon('check', 14), ' შენახულია პროექტში')
            : h('button', { type: 'button', class: 'btn btn-accent', onclick: save }, 'პროექტში შენახვა'),
          h('button', { type: 'button', class: 'btn', onclick: download }, icon('download', 16), 'ჩამოტვირთვა'),
          h('button', { type: 'button', class: 'btn', onclick: () => { mode = 'form'; form.roomId = m.roomId; ensureRoomView(); refreshSketch(); } }, 'თავიდან გენერაცია'),
          result.saved ? h('button', { type: 'button', class: 'btn btn-ghost danger', onclick: removeSaved }, icon('trash', 16), 'წაშლა') : null)));
  }

  // ---------------------------------------------------------------- actions
  function refreshSketch() {
    sketchUrl = form && view() ? takeSketch() : null;
    render();
  }

  async function submit() {
    if (mode === 'running' || !cfg?.available) return;
    const p = current();
    const v = view();
    if (!v) return;
    const camera = v.cameraState();
    const spec = sceneSpec(p, { roomId: form.roomId, camera, style: form.style });
    const revision = sceneRevision(spec);
    const est = estimate();
    sketchUrl = takeSketch();
    const surfaces = sampleSurfaces(spec);
    const samples = surfaces.map((s) => ({ surface: s, image: sampleImage(spec.materials.find((m) => m.surface === s).materialId) }));
    store.set(CODE_KEY, form.code.trim());

    run = { ctrl: new AbortController(), started: Date.now(), timer: null, camera, revision, spec, style: form.style };
    mode = 'running';
    render();
    run.timer = setInterval(() => {
      const el = dlg.querySelector('.ai-elapsed');
      if (el) el.textContent = fmtTime((Date.now() - run.started) / 1000);
    }, 1000);
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        signal: run.ctrl.signal,
        headers: {
          'content-type': 'application/json',
          'x-bina-client': clientId(),
          ...(form.code.trim() ? { 'x-bina-access': form.code.trim() } : {}),
        },
        body: JSON.stringify({
          scene: spec,
          sceneRevision: revision,
          sketch: sketchUrl,
          samples,
          options: { quality: form.quality, aspect: form.aspect, count: 1 },
          consent: { dataTransfer: true, adult: true, maxUsd: est },
        }),
      });
      let body = null;
      try {
        body = await res.json();
      } catch (e) {
        body = null;
      }
      if (!res.ok || !body || body.error) {
        const err = body?.error || { code: `http_${res.status}`, message: 'სერვერმა უცნობი პასუხი დააბრუნა.' };
        if (err.code === 'estimate_changed') {
          toast('ღირებულება შეიცვალა — გადახედე და დაადასტურე თავიდან.', 'warn');
          cfg = await loadConfig();
          mode = 'form';
          form.consentData = false;
          render();
          return;
        }
        lastError = err;
        mode = 'error';
        render();
        return;
      }
      if (body.sceneRevision !== revision || !Array.isArray(body.images) || !body.images.length) {
        lastError = { code: 'bad_response', message: 'სერვერის პასუხი არ ემთხვევა მოთხოვნას. სურათი არ შეინახა.' };
        mode = 'error';
        render();
        return;
      }
      const img = body.images[0];
      const blob = base64ToBlob(img.data, img.mime);
      result = {
        blob,
        url: URL.createObjectURL(blob),
        saved: false,
        fallbackUsed: body.fallbackUsed,
        samples: body.references?.materialSamples || [],
        label: body.label?.ka,
        meta: {
          id: body.id,
          roomId: form.roomId,
          sceneRevision: body.sceneRevision,
          createdAt: body.createdAt,
          provider: body.provider,
          model: body.model,
          quality: body.quality,
          aspect: body.aspect,
          style: run.style,
          costUsd: body.cost?.actualUsd ?? body.cost?.estimatedUsd ?? null,
          costBasis: body.cost?.basis === 'usage' ? 'usage' : 'estimate',
          camera: { position: camera.position, target: camera.target, fov: camera.fov },
        },
      };
      mode = 'result';
      render();
    } catch (e) {
      if (run?.ctrl.signal.aborted) {
        mode = 'form';
        render();
        toast('გენერაცია გაუქმდა. თუ AI-მ უკვე დაიწყო, ის შეიძლება მაინც დაირიცხოს.', 'info');
      } else {
        lastError = { code: 'network', message: 'AI სერვისთან კავშირი გაწყდა. შეამოწმე ინტერნეტი და სცადე თავიდან.', retryable: true };
        mode = 'error';
        render();
      }
    } finally {
      clearInterval(run?.timer);
      run = null;
    }
  }

  function cancel() {
    run?.ctrl.abort();
  }

  async function save() {
    if (!result || result.saved) return;
    const durable = await putRender(result.meta.id, result.blob);
    const p = current();
    // Only the list of renders changes; rooms, sizes and chosen products stay as they are.
    commit({ ...p, renders: [...(p.renders || []), result.meta] }, { history: false });
    result.saved = true;
    toast(durable ? 'ვიზუალიზაცია შენახულია.' : 'პროექტში ჩაიწერა, მაგრამ ბრაუზერმა სურათის შენახვა არ დაუშვა — ჩამოტვირთე, რომ არ დაიკარგოს.', durable ? 'ok' : 'warn');
    render();
  }

  async function removeSaved() {
    if (!result?.saved) return;
    const id = result.meta.id;
    await deleteRender(id);
    const p = current();
    commit({ ...p, renders: (p.renders || []).filter((r) => r.id !== id) }, { history: false });
    mode = 'form';
    render();
  }

  async function download() {
    if (!result) return;
    const blob = await stampedBlob(result.blob);
    const a = h('a', { href: URL.createObjectURL(blob), download: `bina-ai-${result.meta.sceneRevision}-${result.meta.id.slice(0, 8)}.jpg` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  async function openSaved(meta) {
    const blob = await getRender(meta.id);
    if (!blob) {
      toast('ეს სურათი სხვა ბრაუზერში ან მოწყობილობაზე შეინახა.', 'info');
      return;
    }
    result = { blob, url: URL.createObjectURL(blob), saved: true, meta, label: null };
    mode = 'result';
    render();
  }

  return {
    async open(roomId) {
      const p = current();
      const rooms = renderableRooms(p);
      const v = view();
      const pickRoom = [roomId, v?.view.roomId].find((id) => id && rooms.some((r) => r.id === id))
        || rooms.reduce((m, r) => (!m || area(r.points) > area(m.points) ? r : m), null)?.id || null;
      form = form && form.roomId === pickRoom ? form : {
        roomId: pickRoom,
        style: p.style,
        quality: 'medium',
        aspect: 'landscape',
        consentData: false,
        consentAdult: false,
        code: store.get(CODE_KEY),
      };
      mode = 'form';
      cfg = { available: false, reason: 'offline' };
      if (pickRoom) ensureRoomView();
      sketchUrl = pickRoom && view() ? takeSketch() : null;
      render();
      if (!dlg.open) dlg.showModal();
      cfg = await loadConfig();
      if (cfg.available && !cfg.qualities.includes(form.quality)) form.quality = cfg.qualities[cfg.qualities.length - 1];
      if (mode === 'form') render();
    },
    refresh() {
      if (dlg.open && mode === 'form') render();
    },
    get isOpen() {
      return dlg.open;
    },
  };
}
