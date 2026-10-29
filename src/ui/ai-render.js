// "AI დიზაინის გენერაცია": a photorealistic concept image of the room prepared in the scene
// step (Stage 05), from its camera, with its chosen finishes.
//
// The browser sends the compiled scene ('bina.ai-scene' v1), a real capture of the 3D
// blockout from the scene camera, the scene's plan drawing, and drawn samples of the
// finishes to /api/render. The server checks everything again, builds the instructions and
// calls the image provider. Nothing is generated without the user's explicit confirmation
// of the data transfer and the cost, and every result is labelled as a conceptual AI
// visualization. A result never changes the plan, the furniture or the chosen products:
// only the project's list of saved renders grows when the user saves one.
import { current, commit } from './store.js';
import { h, add, clear, icon, toast } from './dom.js';
import { swatch } from './textures.js';
import { MATERIALS, STYLES, STYLE_ORDER } from '../core/catalog.js';
import { roomLabel } from '../core/model.js';
import { LIGHTING } from '../core/scene-prompt.js';
import { product } from '../core/products.js';
import { renderIsCurrent, makeRecord, frameKey } from '../core/render-record.js';
import { provenanceBadges } from './material-board.js';
import { putRender, getRender, deleteRender, base64ToBlob } from './render-store.js';

/* global __SITE__ */

const QUALITY_LABEL = { low: 'სწრაფი ესკიზი', medium: 'სტანდარტული', high: 'მაღალი ხარისხი' };
const PRESET_LABEL = { entrance: 'შესასვლელიდან', window: 'ფანჯრისკენ', opposite: 'საპირისპირო კუთხე', wide: 'ფართო ხედი', custom: 'ჩემი კუთხე' };
const SAMPLE_ORDER = ['floor', 'walls', 'backsplash', 'countertop', 'cabinet', 'walls_upper', 'vanity', 'door', 'ceiling', 'skirting', 'sill', 'sanitary'];
const MAX_SAMPLES = 12;
// Pixels sent to the server for the blockout (its frame is the scene camera's aspect).
const BLOCKOUT_WIDTH = { '16:9': 1536, '4:3': 1536, '1:1': 1024 };
const CODE_KEY = 'bina-designer:render-access';
const CLIENT_KEY = 'bina-designer:client-id';
const UNAVAILABLE = {
  disabled: 'AI გენერაცია ჯერ ჩართული არ არის: ადმინისტრატორს ჯერ არ დაუყენებია AI სერვისის გასაღები და ბიუჯეტი. სცენის მომზადება და პაკეტის ექსპორტი უკვე შეგიძლია.',
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

// The finishes whose drawn samples go with the request, most important first.
export function sampleKeys(scene, max = MAX_SAMPLES) {
  const rank = (m) => (m.mandatory ? 0 : 100) + (SAMPLE_ORDER.indexOf(m.target.surface) + 1 || 50);
  return scene.materials.filter((m) => m.status === 'resolved').sort((a, b) => rank(a) - rank(b)).slice(0, max).map((m) => m.key);
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

// A JPEG data URL of at most `maxBytes`, `width` pixels wide (aspect kept).
async function jpegDataUrl(blob, width, maxBytes) {
  const img = await blobToImage(blob);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((width * img.naturalHeight) / img.naturalWidth);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  for (const q of [0.9, 0.82, 0.72, 0.6]) {
    const url = c.toDataURL('image/jpeg', q);
    if (url.length * 0.75 <= maxBytes) return url;
  }
  throw new Error('image too large');
}

function sampleImage(materialId) {
  return swatch(MATERIALS[materialId], 256).toDataURL('image/jpeg', 0.85);
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

// getContext() → null, or { scene, settings, capture(width) → { blockout: Blob, plan: Blob },
//                           saveSettings(patch), editMaterials(roomId) }
export function createRenderDialog({ getContext }) {
  const dlg = h('dialog', { class: 'modal ai-dialog', 'aria-labelledby': 'ai-title' });
  document.body.append(dlg);
  let cfg = null; // server configuration, or { available: false, reason }
  let form = { quality: 'medium', count: 1, consentData: false, consentAdult: false, code: store.get(CODE_KEY) };
  let mode = 'form';
  let run = null; // { ctrl, started, timer }
  let result = null; // { images: [{ blob, url, meta, saved }], index, ... }
  let lastError = null;
  let preview = null; // object URL of the blockout preview
  let previewFor = null; // revision of that preview

  dlg.addEventListener('cancel', (e) => {
    if (mode === 'running') e.preventDefault(); // Esc must not hide a paid request; use "cancel"
  });
  dlg.addEventListener('close', () => {
    for (const im of result?.images || []) if (!im.saved) URL.revokeObjectURL(im.url);
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

  const ctx = () => getContext();
  const frameOf = (scene) => frameKey(scene.camera.aspect);
  function estimate(scene) {
    if (!cfg?.available || !scene) return null;
    const e = cfg.estimates?.[frameOf(scene)]?.[form.quality];
    return Number.isFinite(e) ? Math.round(e * form.count * 10000) / 10000 : null;
  }
  function blockers(scene) {
    const out = [];
    if (!scene) return ['სცენა ვერ მომზადდა. დაბრუნდი სცენის ეტაპზე.'];
    if (scene.camera.status !== 'ready') out.push('ამ ოთახში უსაფრთხო კამერის წერტილი ვერ მოიძებნა. შეცვალე ხედი სცენის ეტაპზე.');
    const unresolved = scene.materials.filter((m) => m.status === 'unresolved' && m.mandatory);
    if (unresolved.length) out.push(`სავალდებულო მასალის ჩანაწერი ვერ მოიძებნა: ${unresolved.map((m) => m.target.surfaceLabel).join(', ')}. შეცვალე ან მონიშნე როგორც არასავალდებულო.`);
    return out;
  }

  async function refreshPreview() {
    const c = ctx();
    if (!c?.scene || c.scene.camera.status !== 'ready' || previewFor === c.scene.revision) return;
    previewFor = c.scene.revision;
    try {
      const { blockout } = await c.capture(640);
      if (previewFor !== c.scene.revision) return;
      if (preview) URL.revokeObjectURL(preview);
      preview = blockout ? URL.createObjectURL(blockout) : null;
    } catch (e) {
      preview = null;
    }
    if (mode === 'form' && dlg.open) render();
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

  function canSubmit(scene) {
    return !!cfg?.available && form.consentData && form.consentAdult && (!cfg.accessCodeRequired || form.code.trim())
      && estimate(scene) !== null && blockers(scene).length === 0;
  }

  function renderForm() {
    const c = ctx();
    const p = current();
    const scene = c?.scene || null;
    const room = scene ? p.rooms.find((r) => r.id === scene.room.id) : null;
    if (!scene || !room) {
      add(dlg, head('ოთახი არ არის'), h('div', { class: 'modal-body' }, h('p', null, 'გენერაციისთვის ჯერ დახაზე ოთახი და მოამზადე სცენა.')));
      return;
    }
    const est = estimate(scene);
    const available = !!cfg?.available;
    const block = blockers(scene);
    const frame = frameOf(scene);
    const saved = (p.renders || []).filter((r) => r.roomId === room.id).slice().reverse();
    const style = scene.preferences.style;

    add(dlg,
      head(roomLabel(room, p.rooms)),
      h('div', { class: 'modal-body ai-form' },
        available ? null : h('div', { class: 'status warn', role: 'status' }, UNAVAILABLE[cfg?.reason] || UNAVAILABLE.offline),
        block.length ? h('div', { class: 'status warn', role: 'alert' }, block.map((b) => h('p', null, b))) : null,

        h('section', { class: 'ai-sec' },
          h('h3', null, '1. ოთახი და ხედი'),
          h('div', { class: 'ai-grid' },
            h('div', { class: 'ai-sketch' },
              preview ? h('img', { src: preview, alt: '3D ბლოკაუტი, რომელიც AI-ს გაეგზავნება: ოთახი არჩეული კამერიდან' }) : h('div', { class: 'ai-sketch-empty' }, scene.camera.status === 'ready' ? '3D ბლოკაუტი მზადდება…' : '3D ხედი მიუწვდომელია'),
              h('span', { class: 'sample-cap' }, '3D ბლოკაუტი AI-სთვის')),
            h('div', { class: 'ai-side' },
              h('dl', { class: 'facts' },
                h('dt', null, 'ოთახი'), h('dd', null, `${roomLabel(room, p.rooms)} · ${scene.room.areaM2.toFixed(1)} მ²`),
                h('dt', null, 'ხედი'), h('dd', null, `${PRESET_LABEL[scene.camera.preset] || scene.camera.preset} · ${frame} · ${Math.round(scene.camera.fov)}°`),
                h('dt', null, 'ავეჯი'), h('dd', null, `${scene.furniture.length} · კარი/ფანჯარა ${scene.openings.length}`),
                h('dt', null, 'ვერსია'), h('dd', null, h('code', null, scene.revision))),
              h('button', { type: 'button', class: 'btn btn-sm', onclick: () => dlg.close() }, 'ხედის შეცვლა სცენაში'),
              h('p', { class: 'muted small' }, 'AI-ს ეგზავნება ეს 3D ბლოკაუტი, ოთახის გეგმის ნახაზი და ზომები. გეგმის სურათი, პროექტის სახელი და ფასები არ იგზავნება.')))),

        h('section', { class: 'ai-sec' },
          h('div', { class: 'sec-row' }, h('h3', null, '2. მასალები'),
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { dlg.close(); c.editMaterials?.(room.id); } }, 'შეცვლა')),
          h('ul', { class: 'ai-mats' }, scene.materials.map((m) => {
            if (m.status === 'unresolved') {
              return h('li', { class: 'ai-mat-missing' }, h('span', { class: 'sw ai-sw-missing' }, '?'),
                h('span', { class: 'ai-mat-txt' }, h('span', { class: 'muted small' }, m.target.surfaceLabel, m.mandatory ? ' · სავალდებულო' : ' · მოქნილი'),
                  h('span', null, m.materialId), h('span', { class: 'small warn-text' }, 'ჩანაწერი ვერ მოიძებნა — AI-ს არ გაეგზავნება')));
            }
            const pr = product(m.materialId);
            const s = swatch(MATERIALS[m.materialId], 40);
            s.className = 'sw';
            return h('li', null, s,
              h('span', { class: 'ai-mat-txt' },
                h('span', { class: 'muted small' }, m.target.surfaceLabel, m.mandatory ? ' · სავალდებულო' : ' · მოქნილი'),
                h('span', null, pr.name),
                provenanceBadges(pr, { compact: true })));
          })),
          h('p', { class: 'muted small' }, 'AI-ს ეგზავნება პროდუქტის სახელი, ფერი, ზომა და დახატული ნიმუში — არა პროდუქტის ფოტო. ამიტომ მასალის ზუსტ გამეორებას ვერ ვამტკიცებთ.')),

        h('section', { class: 'ai-sec' },
          h('h3', null, '3. ინტერიერის სტილი და განათება'),
          h('div', { class: 'tabs', role: 'group', 'aria-label': 'სტილი' }, STYLE_ORDER.map((k) => h('button', {
            type: 'button', class: `tab${style === k ? ' on' : ''}`, 'aria-pressed': style === k ? 'true' : 'false',
            onclick: () => { if (style !== k) c.saveSettings({ style: k }); },
          }, STYLES[k].label))),
          h('div', { class: 'tabs', role: 'group', 'aria-label': 'განათება' }, Object.entries(LIGHTING).map(([k, v]) => h('button', {
            type: 'button', class: `tab${scene.preferences.lighting === k ? ' on' : ''}`, 'aria-pressed': scene.preferences.lighting === k ? 'true' : 'false',
            onclick: () => { if (scene.preferences.lighting !== k) c.saveSettings({ lighting: k }); },
          }, v.ka))),
          h('p', { class: 'muted small' }, 'სტილი განსაზღვრავს ავეჯის ფორმას, ტექსტილს და აქსესუარებს მხოლოდ ამ სურათზე. პროექტის მასალები და ხარჯთაღრიცხვა არ იცვლება.'),
          scene.preferences.instructions ? h('p', { class: 'ai-quote small' }, h('span', { class: 'muted' }, 'შენი სურვილი (ეგზავნება ბრჭყალებში, გეგმაზე დაბალი პრიორიტეტით): '), `„${scene.preferences.instructions}“`) : null),

        h('section', { class: 'ai-sec' },
          h('h3', null, '4. ხარისხი და ღირებულება'),
          available ? h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'ხარისხი' }, cfg.qualities.map((q) => h('button', {
            type: 'button', role: 'radio', 'aria-checked': form.quality === q ? 'true' : 'false', class: `seg-btn${form.quality === q ? ' on' : ''}`,
            onclick: () => { form.quality = q; render(); },
          }, QUALITY_LABEL[q]))) : null,
          available && cfg.maxImages > 1 ? h('label', { class: 'field-in' }, h('span', { class: 'small muted' }, 'სურათების რაოდენობა'),
            h('select', { class: 'unit-sel', onchange: (e) => { form.count = Number(e.target.value); render(); } },
              Array.from({ length: cfg.maxImages }, (_, i) => h('option', { value: i + 1, selected: form.count === i + 1 }, String(i + 1))))) : null,
          available ? h('div', { class: 'ai-cost' },
            h('div', null, h('span', { class: 'muted small' }, 'სავარაუდო ღირებულება'), h('b', { class: 'num', id: 'ai-estimate' }, `≤ ${usd(est)}`)),
            h('div', null, h('span', { class: 'muted small' }, 'მოდელი'), h('b', null, `${cfg.provider.label} · ${cfg.provider.model}`)),
            h('div', null, h('span', { class: 'muted small' }, 'ლიმიტი'), h('b', null, `დღეში ${cfg.limits.perUserDaily} გენერაცია`)))
            : h('p', { class: 'muted small' }, 'ღირებულება გამოჩნდება, როცა სერვისი ჩაირთვება.'),
          available && cfg.fallback ? h('p', { class: 'muted small' }, `თუ ${cfg.provider.label} დროებით მიუწვდომელია, გამოიყენება ${cfg.fallback.label} (${cfg.fallback.model}) — მხოლოდ თუ მისი ღირებულება დადასტურებულს არ აჭარბებს.`) : null,
          h('p', { class: 'muted small' }, 'ეს არის ზედა შეფასება: საბოლოო ფასს AI სერვისი ითვლის. გაუქმებული ან შეწყვეტილი გენერაციაც შეიძლება დაირიცხოს.')),

        h('section', { class: 'ai-sec ai-consent' },
          h('h3', null, '5. დადასტურება'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'ai-consent-data', checked: form.consentData, onchange: (e) => { form.consentData = e.target.checked; render(); } }),
            ` ვეთანხმები, რომ ოთახის 3D ბლოკაუტი, გეგმის ნახაზი, ზომები, ავეჯის განლაგება, არჩეული მასალები და ჩემი სურვილის ტექსტი გაეგზავნება ${available ? `${cfg.provider.label}${cfg.fallback ? ` (ან ${cfg.fallback.label})` : ''}` : 'AI სერვისს'}-ს სურათის შესაქმნელად.`),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'ai-consent-adult', checked: form.consentAdult, onchange: (e) => { form.consentAdult = e.target.checked; render(); } }), ' ვარ 18 წლის ან უფროსი.'),
          available && cfg.accessCodeRequired ? h('label', { class: 'field' }, h('span', null, 'წვდომის კოდი'),
            h('input', { class: 'text-in', id: 'ai-code', type: 'password', autocomplete: 'off', value: form.code, oninput: (e) => { form.code = e.target.value; syncSubmit(); } })) : null,
          h('p', { class: 'ai-note' }, icon('image', 16), h('span', null, 'შედეგი იქნება ', h('b', null, 'კონცეპტუალური AI ვიზუალიზაცია'), ', არა ზუსტი არქიტექტურული ნახაზი. ზომები და მასალების რაოდენობა — გეგმასა და ხარჯთაღრიცხვაში.'))),

        saved.length ? h('section', { class: 'ai-sec' }, h('h3', null, 'შენახული ვიზუალიზაციები'),
          h('div', { class: 'ai-gallery' }, saved.map((meta) => galleryItem(meta, p)))) : null,

        h('div', { class: 'ai-actions' },
          h('button', { type: 'button', class: 'btn btn-accent btn-lg', id: 'ai-submit', disabled: !canSubmit(scene), onclick: submit }, icon('sparkle', 18), `გენერაცია${est !== null && available ? ` (≤ ${usd(est)})` : ''}`))),
    );
  }

  function syncSubmit() {
    const btn = dlg.querySelector('#ai-submit');
    if (btn) btn.disabled = !canSubmit(ctx()?.scene || null);
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
        preview ? h('div', { class: 'ai-sketch ai-sketch-dim' }, h('img', { src: preview, alt: '' }), h('div', { class: 'ai-spinner', 'aria-hidden': 'true' })) : null,
        h('p', { class: 'ai-elapsed num' }, fmtTime(elapsed)),
        h('p', { class: 'ai-stage' }, run.stage),
        h('p', null, `${cfg.provider.label} ქმნის ვიზუალიზაციას. ჩვეულებრივ ამას 30 წამიდან 2 წუთამდე სჭირდება (ზღვარი — ${Math.round((cfg.timeoutSeconds / 60) * 10) / 10} წთ).`),
        h('button', { type: 'button', class: 'btn', id: 'ai-cancel', onclick: cancel }, 'გაუქმება'),
        h('p', { class: 'muted small' }, 'გაუქმება შეწყვეტს ლოდინს. თუ AI-მ გენერაცია უკვე დაიწყო, ის შეიძლება მაინც დაირიცხოს.')));
  }

  function renderError() {
    const e = lastError;
    add(dlg, head('სურათი ვერ შეიქმნა'),
      h('div', { class: 'modal-body' },
        h('div', { class: 'status warn', role: 'alert', id: 'ai-error' }, e.message),
        e.code ? h('p', { class: 'muted small' }, `კოდი: ${e.code}`) : null,
        h('div', { class: 'btn-row' },
          e.retryable || ['provider_timeout', 'cancelled', 'network'].includes(e.code)
            ? h('button', { type: 'button', class: 'btn btn-accent', onclick: () => { mode = 'form'; render(); submit(); } }, 'თავიდან ცდა') : null,
          h('button', { type: 'button', class: 'btn', onclick: () => { mode = 'form'; render(); } }, 'პარამეტრებზე დაბრუნება'))));
  }

  function renderResult() {
    const im = result.images[result.index];
    const m = im.meta;
    const p = current();
    const fresh = renderIsCurrent(p, m);
    const room = p.rooms.find((r) => r.id === m.roomId);
    add(dlg, head(room ? roomLabel(room, p.rooms) : 'ვიზუალიზაცია'),
      h('div', { class: 'modal-body' },
        h('figure', { class: 'ai-result' },
          h('img', { src: im.url, alt: 'AI-ით შექმნილი კონცეპტუალური ვიზუალიზაცია', id: 'ai-result-img' }),
          h('span', { class: 'ai-label' }, 'AI კონცეფცია — არა ზუსტი ნახაზი'),
          h('figcaption', { class: 'muted small' }, result.label || 'AI-ით შექმნილი კონცეპტუალური ვიზუალიზაცია. ზომები და მასალები — გეგმასა და ხარჯთაღრიცხვაში.')),
        result.images.length > 1 ? h('div', { class: 'btn-row', role: 'group', 'aria-label': 'ვარიანტები' }, result.images.map((x, i) => h('button', {
          type: 'button', class: `btn btn-sm${i === result.index ? ' btn-accent' : ''}`, onclick: () => { result.index = i; render(); },
        }, `ვარიანტი ${i + 1}${x.saved ? ' ✓' : ''}`))) : null,
        h('dl', { class: 'facts' },
          h('dt', null, 'მოდელი'), h('dd', null, `${m.provider === 'openai' ? 'OpenAI' : m.provider === 'gemini' ? 'Google Gemini' : m.provider} · ${m.model}${m.fallbackUsed ? ' (სარეზერვო)' : ''}`),
          h('dt', null, 'სცენის ვერსია'), h('dd', null, h('code', { id: 'ai-result-revision' }, m.sceneRevision), ' ', h('span', { class: `badge ${fresh ? 'v-verified' : 'v-indicative'}`, id: 'ai-result-fresh' }, fresh ? 'ემთხვევა გეგმას' : 'გეგმა მას შემდეგ შეიცვალა')),
          h('dt', null, 'სტილი'), h('dd', null, `${STYLES[m.style]?.label || m.style} · ${LIGHTING[m.settings.lighting]?.ka || ''}`),
          h('dt', null, 'შეიქმნა'), h('dd', null, new Date(m.createdAt).toLocaleString('ka-GE')),
          h('dt', null, 'ღირებულება'), h('dd', null, `${usd(m.costUsd)} ${m.costBasis === 'usage' ? '(AI სერვისის მონაცემით)' : '(შეფასება)'}`),
          result.references ? [h('dt', null, 'რეფერენსები'), h('dd', null, `3D ბლოკაუტი${result.references.plan ? ', გეგმა' : ''}, მასალის ნიმუშები: ${result.references.materialSamples.length}`)] : null),
        h('p', { class: 'muted small' }, 'AI-მ მასალები შეიძლება ზუსტად ვერ გაიმეოროს: ფერი, ფაქტურა და მასშტაბი გადაამოწმე მაღაზიაში. ეს სურათი გეგმას და არჩეულ პროდუქტებს არ ცვლის.'),
        h('div', { class: 'btn-row ai-actions' },
          im.saved
            ? h('span', { class: 'badge v-verified' }, icon('check', 14), ' შენახულია პროექტში')
            : h('button', { type: 'button', class: 'btn btn-accent', id: 'ai-save', onclick: save }, 'პროექტში შენახვა'),
          h('button', { type: 'button', class: 'btn', id: 'ai-download', onclick: download }, icon('download', 16), 'ჩამოტვირთვა'),
          h('button', { type: 'button', class: 'btn', id: 'ai-again', onclick: () => { mode = 'form'; render(); refreshPreview(); } }, 'თავიდან გენერაცია'),
          im.saved ? h('button', { type: 'button', class: 'btn btn-ghost danger', onclick: removeSaved }, icon('trash', 16), 'წაშლა') : null)));
  }

  // ---------------------------------------------------------------- actions
  async function submit() {
    if (mode === 'running' || !cfg?.available) return;
    const c = ctx();
    const scene = c?.scene;
    if (!scene || blockers(scene).length) return;
    const settings = { ...(c.settings || {}) };
    const est = estimate(scene);
    store.set(CODE_KEY, form.code.trim());
    run = { ctrl: new AbortController(), started: Date.now(), timer: null, stage: '3D ბლოკაუტის მომზადება…' };
    mode = 'running';
    render();
    run.timer = setInterval(() => {
      const el = dlg.querySelector('.ai-elapsed');
      if (el && run) el.textContent = fmtTime((Date.now() - run.started) / 1000);
    }, 1000);
    try {
      // Real captures from the scene camera, taken now, for exactly this revision.
      const frame = frameOf(scene);
      const shots = await c.capture(BLOCKOUT_WIDTH[frame]);
      if (!shots?.blockout) throw Object.assign(new Error('3D'), { code: 'capture' });
      if (ctx()?.scene?.revision !== scene.revision) throw Object.assign(new Error('changed'), { code: 'changed' });
      const blockout = await jpegDataUrl(shots.blockout, BLOCKOUT_WIDTH[frame], 1.4 * 1024 * 1024);
      const plan = shots.plan ? await jpegDataUrl(shots.plan, 1024, 560 * 1024).catch(() => null) : null;
      const maxSamples = Math.max(0, Math.min(MAX_SAMPLES, (cfg.provider.maxReferences || 16) - (plan ? 2 : 1)));
      const samples = sampleKeys(scene, maxSamples).map((key) => ({ key, image: sampleImage(scene.materials.find((m) => m.key === key).materialId) }));
      if (run.ctrl.signal.aborted) throw Object.assign(new Error('abort'), { name: 'AbortError' });
      run.stage = 'AI სერვისთან გაგზავნა…';
      const st = dlg.querySelector('.ai-stage');
      if (st) st.textContent = run.stage;
      const res = await fetch('/api/render', {
        method: 'POST',
        signal: run.ctrl.signal,
        headers: {
          'content-type': 'application/json',
          'x-bina-client': clientId(),
          ...(form.code.trim() ? { 'x-bina-access': form.code.trim() } : {}),
        },
        body: JSON.stringify({
          scene,
          sceneRevision: scene.revision,
          blockout,
          ...(plan ? { plan } : {}),
          samples,
          options: { quality: form.quality, count: form.count },
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
      if (body.sceneRevision !== scene.revision || !Array.isArray(body.images) || !body.images.length) {
        lastError = { code: 'bad_response', message: 'სერვერის პასუხი არ ემთხვევა მოთხოვნას. სურათი არ შეინახა.' };
        mode = 'error';
        render();
        return;
      }
      result = {
        index: 0,
        label: body.label?.ka,
        references: body.references || null,
        images: body.images.map((img, i) => {
          const blob = base64ToBlob(img.data, img.mime);
          return { blob, url: URL.createObjectURL(blob), saved: false, meta: makeRecord({ response: body, scene, settings, index: i }) };
        }),
      };
      mode = 'result';
      render();
    } catch (e) {
      if (run?.ctrl.signal.aborted || e?.name === 'AbortError') {
        mode = 'form';
        render();
        toast('გენერაცია გაუქმდა. თუ AI-მ უკვე დაიწყო, ის შეიძლება მაინც დაირიცხოს.', 'info');
      } else if (e?.code === 'capture') {
        lastError = { code: 'capture', message: '3D ბლოკაუტი ვერ გადაიღო. დაბრუნდი სცენის ეტაპზე და დააჭირე „3D თავიდან ცდა“.' };
        mode = 'error';
        render();
      } else if (e?.code === 'changed') {
        lastError = { code: 'scene_changed', message: 'სცენა შეიცვალა გადაღების დროს. გადახედე და სცადე თავიდან.' };
        mode = 'error';
        render();
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
    const im = result?.images[result.index];
    if (!im || im.saved) return;
    const durable = await putRender(im.meta.id, im.blob);
    const p = current();
    // Only the list of renders changes; rooms, sizes and chosen products stay as they are.
    commit({ ...p, renders: [...(p.renders || []), im.meta] }, { history: false });
    im.saved = true;
    toast(durable ? 'ვიზუალიზაცია შენახულია.' : 'პროექტში ჩაიწერა, მაგრამ ბრაუზერმა სურათის შენახვა არ დაუშვა — ჩამოტვირთე, რომ არ დაიკარგოს.', durable ? 'ok' : 'warn');
    render();
  }

  async function removeSaved() {
    const im = result?.images[result.index];
    if (!im?.saved) return;
    await deleteRender(im.meta.id);
    const p = current();
    commit({ ...p, renders: (p.renders || []).filter((r) => r.id !== im.meta.id) }, { history: false });
    mode = 'form';
    render();
  }

  async function download() {
    const im = result?.images[result.index];
    if (!im) return;
    const blob = await stampedBlob(im.blob);
    const a = h('a', { href: URL.createObjectURL(blob), download: `bina-ai-${im.meta.sceneRevision}-${im.meta.id.slice(0, 8)}.jpg` });
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
    result = { index: 0, label: null, references: null, images: [{ blob, url: URL.createObjectURL(blob), saved: true, meta }] };
    mode = 'result';
    render();
  }

  return {
    async open() {
      mode = 'form';
      cfg = { available: false, reason: 'offline' };
      render();
      if (!dlg.open) dlg.showModal();
      refreshPreview();
      cfg = await loadConfig();
      if (cfg.available && !cfg.qualities.includes(form.quality)) form.quality = cfg.qualities[cfg.qualities.length - 1];
      if (cfg.available && form.count > cfg.maxImages) form.count = 1;
      if (mode === 'form') render();
    },
    // The scene changed (style, lighting, camera, materials): show the new state.
    refresh() {
      if (!dlg.open || mode !== 'form') return;
      render();
      refreshPreview();
    },
    get isOpen() {
      return dlg.open;
    },
  };
}
