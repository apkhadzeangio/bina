// App shell: steps, toolbar, upload, project menu.
import {
  state, current, commit, subscribe, emit, setSelection, setTool, undo, redo, canUndo, canRedo,
  loadSaved, setPlanImage, saveNow, flushSave, droppedNotice,
} from './store.js';
import { emptyProject, sampleProject, migrateProject } from '../core/model.js';
import { createPlanEditor } from './plan-editor.js';
import { createInspector, purposeGrid, setRoomPurpose } from './inspector.js';
import { createMaterialsStep } from './materials.js';
import { createSceneComposer } from './scene-composer.js';
import { createEstimateStep } from './estimate.js';
import { h, add, clear, icon, toast, copyText } from './dom.js';
import { loadPdf } from './libs.js';
import { createOnboarding, firstVisit } from './onboarding.js';
import { createFurnitureLibrary } from './furniture-library.js';
import * as G from '../core/geometry.js';
import { roomLabel, OPENING_TYPES } from '../core/model.js';
import { corners, furnitureLabel, roomAt } from '../core/furniture.js';

/* global __SITE__ */ // true only in the lithos.ge build, where file downloads work
const STEPS = [
  ['plan', 'გეგმა'],
  ['materials', 'მასალები'],
  ['scene', 'AI სცენა'],
  ['estimate', 'ხარჯთაღრიცხვა'],
];
const MAX_IMAGE = 2400;

function brandMark() {
  const s = h('span', { class: 'brand-mark', 'aria-hidden': 'true' });
  s.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 4h20v20H4z"/><path d="M4 15h9V4"/><path d="M13 24v-5"/><path d="M13 19a5 5 0 0 1 5-5h6" stroke-dasharray="2.2 2.2" stroke-width="1.3"/></svg>';
  return s;
}

async function fileToImageData(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('image'));
      i.src = url;
    });
    const k = Math.min(1, MAX_IMAGE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pdfToImageData(file) {
  const pdfjs = await loadPdf();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const page = await doc.getPage(1);
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(6, MAX_IMAGE / Math.max(v1.width, v1.height));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width);
  c.height = Math.round(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return { dataUrl: c.toDataURL('image/jpeg', 0.9), pages: doc.numPages };
}

export async function main(root) {
  const saved = loadSaved();
  state.project = saved.project;
  if (saved.image) await setPlanImage(saved.image);
  // A plan outline whose image could not be restored is kept; the user can upload it again.

  // ---------------------------------------------------------------- header
  const nav = h('nav', { class: 'steps', 'aria-label': 'ნაბიჯები' }, STEPS.map(([k, label], i) => h('a', {
    href: `#${k}`, class: 'step-link', 'data-step': k,
  }, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'step-label' }, label))));

  const menuBtn = h('button', { type: 'button', class: 'btn btn-sm', 'aria-expanded': 'false', 'aria-controls': 'project-menu', id: 'menu-btn' }, icon('menu', 16), h('span', { class: 'hide-sm' }, 'პროექტი'));
  const menu = h('div', { class: 'menu-pop', hidden: true, id: 'project-menu', 'aria-label': 'პროექტი' });
  const helpBtn = h('button', { type: 'button', class: 'btn btn-sm icon-btn', id: 'help-btn', title: 'დახმარება (?)', 'aria-label': 'დახმარება', onclick: () => onboarding.showHelp() }, icon('help', 18));
  const header = h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, brandMark(), h('span', { class: 'brand-name' }, 'ბინის დიზაინერი')),
    nav,
    h('div', { class: 'top-actions' }, helpBtn, menuBtn, menu));

  // ---------------------------------------------------------------- plan step
  const planInput = h('input', { type: 'file', accept: 'image/*,application/pdf,.pdf', hidden: true, id: 'plan-file' });
  const jsonInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, id: 'json-file' });

  const toolDefs = [
    ['select', 'არჩევა', 'select', 'V'],
    ['rect', 'მართკუთხა ოთახი', 'rect', 'R'],
    ['poly', 'რთული ფორმა', 'poly', 'P'],
    ['door', 'კარი', 'door', 'D'],
    ['window', 'ფანჯარა', 'window', 'W'],
    ['scale', 'მასშტაბი', 'scale', ''],
  ];
  // aria-label keeps a name when the text label is hidden on narrow screens.
  const toolBtns = toolDefs.map(([k, label, ic, key]) => h('button', {
    type: 'button', class: 'btn tool', 'data-tool': k, title: key ? `${label} (${key})` : label, 'aria-label': label,
    'aria-keyshortcuts': key || undefined, onclick: () => setTool(k),
  }, icon(ic, 18), h('span', { class: 'tool-label' }, label)));
  const undoBtn = h('button', { type: 'button', class: 'btn tool icon-only', title: 'დაბრუნება (Ctrl+Z)', 'aria-label': 'დაბრუნება', onclick: undo }, icon('undo', 18));
  const redoBtn = h('button', { type: 'button', class: 'btn tool icon-only', title: 'გამეორება (Ctrl+Shift+Z)', 'aria-label': 'გამეორება', onclick: redo }, icon('redo', 18));
  const fitBtn = h('button', { type: 'button', class: 'btn tool icon-only', title: 'მთელი გეგმა ეკრანზე', 'aria-label': 'მთელი გეგმა ეკრანზე', onclick: () => editor.fit() }, icon('fit', 18));
  const uploadBtn = h('button', { type: 'button', class: 'btn tool', title: 'გეგმის ატვირთვა (სურათი ან PDF)', 'aria-label': 'გეგმის ატვირთვა', onclick: () => planInput.click() }, icon('upload', 18), h('span', { class: 'tool-label' }, 'გეგმა'));
  // Furniture is added from the library (it is not a drawing tool) and seen in 3D.
  const furnBtn = h('button', { type: 'button', class: 'btn tool', id: 'furniture-btn', title: 'ავეჯის დამატება (F)', 'aria-label': 'ავეჯის დამატება', 'aria-keyshortcuts': 'F', onclick: () => openLibrary() }, icon('sofa', 18), h('span', { class: 'tool-label' }, 'ავეჯი'));
  const view3dBtn = h('button', { type: 'button', class: 'btn tool', title: '3D ხედი', 'aria-label': '3D ხედი', onclick: () => go('materials') }, icon('cube', 18), h('span', { class: 'tool-label' }, '3D'));
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'ხელსაწყოები' },
    h('div', { class: 'tool-group' }, toolBtns, furnBtn),
    h('div', { class: 'tool-group' }, undoBtn, redoBtn, fitBtn, view3dBtn, uploadBtn));

  const hintbar = h('div', { class: 'hintbar', 'aria-live': 'polite' });
  const canvas = h('canvas', { class: 'plan', 'aria-label': 'ბინის გეგმა. გამოიყენე ხელსაწყოები ოთახების დასახაზად.' });
  const pop = h('div', { class: 'purpose-pop', hidden: true, tabindex: '-1', role: 'dialog', 'aria-label': 'ოთახის დანიშნულება' });
  const emptyCard = h('div', { class: 'canvas-empty', hidden: true },
    h('b', null, 'დაიწყე ბინის გეგმით'),
    h('p', { class: 'muted' }, 'ატვირთე დეველოპერის გეგმა და შემოხაზე ოთახები, ან დახაზე ისინი პირდაპირ ბადეზე.'),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-accent', onclick: () => planInput.click() }, icon('upload', 18), 'გეგმის ატვირთვა'),
      h('button', { type: 'button', class: 'btn', onclick: () => setTool('rect') }, icon('rect', 18), 'მართკუთხა ოთახი'),
      h('button', { type: 'button', class: 'btn', onclick: () => setTool('poly') }, icon('poly', 18), 'რთული ფორმა')));
  const canvasWrap = h('div', { class: 'canvas-wrap' }, canvas, emptyCard, pop);
  // On phones and narrow tablets the inspector becomes a bottom sheet over the plan; the
  // handle shows what is selected and opens or closes the sheet.
  const inspectorEl = h('div', { class: 'inspector', id: 'inspector' });
  const sheetTitle = h('span', { class: 'sheet-title' });
  const sheetHandle = h('button', { type: 'button', class: 'sheet-handle', 'aria-controls': 'inspector', 'aria-expanded': 'false' },
    h('span', { class: 'grip', 'aria-hidden': 'true' }), sheetTitle, icon('chevron', 18));
  const sheet = h('aside', { class: 'sheet', 'data-sheet': 'peek', 'aria-label': 'პარამეტრები' }, sheetHandle, inspectorEl);
  const banner = h('div', { class: 'sample-banner', hidden: true });

  const planSection = h('section', { class: 'step step-plan', id: 'step-plan' },
    banner,
    h('div', { class: 'plan-layout' },
      h('div', { class: 'plan-main panel' }, toolbar, hintbar, canvasWrap),
      sheet));
  const matSection = h('section', { class: 'step step-materials', id: 'step-materials', hidden: true });
  const estSection = h('section', { class: 'step step-estimate', id: 'step-estimate', hidden: true });
  const sceneSection = h('section', { class: 'step step-scene', id: 'step-scene', hidden: true });

  add(root, header, h('main', { class: 'main' }, planSection, matSection, sceneSection, estSection), planInput, jsonInput);

  const go = (step) => {
    location.hash = step;
  };

  const editor = createPlanEditor({
    wrap: canvasWrap,
    canvas,
    hintEl: hintbar,
    onRoomCreated: (room, pt) => showPurposePopover(room, pt),
    onOpenLibrary: () => openLibrary(),
  });
  if (window.__BINA_DEBUG__) window.__binaEditor = editor;
  const inspector = createInspector({
    el: inspectorEl,
    onUpload: () => planInput.click(),
    onStartScale: () => editor.startScale(),
    onNext: () => go('materials'),
    onOpenLibrary: (roomId) => openLibrary(roomId),
    onShow3D: () => go('materials'),
  });

  // ---------------------------------------------------------------- furniture library
  // Pieces go into the room the user is working on: the one named, the selected room (or
  // the room of the selected piece or door), the room in the middle of the view, or the
  // largest room.
  function libraryRoom(explicit) {
    const p = current();
    if (explicit && p.rooms.some((r) => r.id === explicit)) return explicit;
    const sel = state.selection;
    if (sel?.type === 'room') return sel.id;
    if (sel?.type === 'furniture') return (p.furniture || []).find((f) => f.id === sel.id)?.roomId;
    if (sel?.type === 'opening') return p.openings.find((o) => o.id === sel.id)?.roomId;
    const r = state.step === 'plan' ? roomAt(p.rooms, editor.viewCenter()) : null;
    if (r) return r.id;
    return p.rooms.reduce((m, x) => (!m || G.area(x.points) > G.area(m.points) ? x : m), null)?.id;
  }
  const library = createFurnitureLibrary({
    onAdded: () => {
      if (state.tool !== 'select') setTool('select');
      canvas.focus({ preventScroll: true });
    },
  });
  function openLibrary(roomId) {
    if (state.step !== 'plan') go('plan');
    library.show(libraryRoom(roomId));
  }
  // "AI დიზაინის გენერაცია" from Materials or a material board: prepare that room's scene
  // and open the generation dialog in the scene step (Stage 06).
  const openAiFor = (roomId) => {
    const p = current();
    if (roomId && p.rooms.some((r) => r.id === roomId) && p.scenePreparation?.roomId !== roomId) {
      commit({ ...p, scenePreparation: { rooms: p.scenePreparation?.rooms || {}, roomId } }, { history: false });
    }
    composer.openRender();
    go('scene');
  };
  const materials = createMaterialsStep({ el: matSection, onGoEstimate: () => go('estimate'), onGoPlan: () => go('plan'), onRender: openAiFor });
  const composer = createSceneComposer({ el: sceneSection, materials, onGoPlan: () => go('plan'), onGoMaterials: () => go('materials') });
  const estimate = createEstimateStep({ el: estSection, onGoPlan: () => go('plan') });

  // ---------------------------------------------------------------- purpose popover
  let popRoom = null;
  function hidePop() {
    pop.hidden = true;
    popRoom = null;
  }
  function showPurposePopover(room, pt) {
    popRoom = room.id;
    // Keep the bottom sheet out of the way while the purpose is picked.
    if (window.matchMedia('(max-width: 860px)').matches) setSheet('peek');
    clear(pop);
    add(pop, 
      h('div', { class: 'pop-head' }, h('b', null, 'რა ოთახია?'), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: hidePop }, 'მოგვიანებით')),
      purposeGrid(room.purpose, (k) => {
        const r = current().rooms.find((x) => x.id === popRoom);
        if (r) commit(setRoomPurpose(current(), r, k));
        hidePop();
      }, 'pop'),
    );
    pop.hidden = false;
    const wr = canvasWrap.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    pop.style.left = `${Math.max(8, Math.min(wr.width - pw - 8, pt.x - pw / 2))}px`;
    pop.style.top = `${Math.max(8, Math.min(wr.height - ph - 8, pt.y + 18))}px`;
    // Focus the panel, not a button: the Enter that created the room must not pick a purpose.
    pop.focus({ preventScroll: true });
  }
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target)) hidePop();
    if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!pop.hidden) hidePop();
      if (!menu.hidden) closeMenu();
    }
  });

  // ---------------------------------------------------------------- upload
  async function handlePlanFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    let dataUrl;
    try {
      if (isPdf) {
        toast('PDF იხსნება…');
        const r = await pdfToImageData(file);
        dataUrl = r.dataUrl;
        if (r.pages > 1) toast(`PDF-ს ${r.pages} გვერდი აქვს. გამოყენებულია პირველი.`, 'info');
      } else if (file.type.startsWith('image/')) {
        dataUrl = await fileToImageData(file);
      } else {
        toast('ატვირთე სურათი (JPG, PNG) ან PDF.', 'warn');
        return;
      }
    } catch (e) {
      toast(isPdf ? 'PDF ვერ გაიხსნა. სცადე გეგმის სურათად (სქრინშოტით) ატვირთვა.' : 'სურათი ვერ გაიხსნა.', 'warn');
      return;
    }
    const img = await setPlanImage(dataUrl);
    if (!img) {
      toast('სურათი ვერ გაიხსნა.', 'warn');
      return;
    }
    const base = current().sample ? { ...emptyProject(), name: 'ჩემი ბინა' } : current();
    const mPerPx = 12 / Math.max(img.width, img.height);
    commit({ ...base, plan: { x: 0, y: 0, mPerPx, w: img.width, h: img.height, opacity: 0.6, visible: true, calibrated: false } });
    setSelection(null);
    if (state.saveError) toast(state.saveError, 'warn');
    go('plan');
    editor.fit();
    editor.startScale();
  }
  planInput.addEventListener('change', () => {
    handlePlanFile(planInput.files[0]);
    planInput.value = '';
  });

  // ---------------------------------------------------------------- project menu
  function closeMenu() {
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
  }
  function newProject(p, image = null) {
    commit(p);
    setSelection(null);
    setTool('select');
    setPlanImage(image);
    editor.fit();
    materials.planChanged();
    go('plan');
  }
  function renderMenu() {
    clear(menu);
    let armed = false;
    const newBtn = h('button', { type: 'button', class: 'menu-item' }, icon('plus', 16), 'ახალი ცარიელი პროექტი');
    newBtn.addEventListener('click', () => {
      if (!armed && current().rooms.length && !current().sample) {
        armed = true;
        newBtn.lastChild.textContent = 'დაადასტურე: მიმდინარე გეგმა წაიშლება';
        newBtn.classList.add('danger');
        return;
      }
      closeMenu();
      newProject(emptyProject());
    });
    // Opening the sample replaces the plan, so it asks for a second click like "new project".
    let sampleArmed = false;
    const sampleBtn = h('button', { type: 'button', class: 'menu-item' }, icon('layers', 16), 'ნიმუშის გახსნა');
    sampleBtn.addEventListener('click', () => {
      if (!sampleArmed && current().rooms.length && !current().sample) {
        sampleArmed = true;
        sampleBtn.lastChild.textContent = 'დაადასტურე: მიმდინარე გეგმა შეიცვლება ნიმუშით';
        sampleBtn.classList.add('danger');
        return;
      }
      closeMenu();
      newProject(sampleProject());
    });
    const exportJson = () => JSON.stringify({ ...current(), planImage: state.planImageData || null });
    const fallback = h('textarea', { class: 'copy-fallback', hidden: true, readonly: true, 'aria-label': 'პროექტის ტექსტი' });
    add(menu, 
      newBtn,
      sampleBtn,
      h('div', { class: 'menu-sep' }),
      __SITE__
        ? h('button', {
          type: 'button', class: 'menu-item',
          onclick: () => {
            const blob = new Blob([exportJson()], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: `${current().name || 'bina'}.json` });
            document.body.append(a);
            a.click();
            setTimeout(() => a.remove(), 500);
            closeMenu();
          },
        }, icon('download', 16), 'პროექტის შენახვა ფაილად')
        : h('button', {
          type: 'button', class: 'menu-item',
          onclick: async () => {
            const ok = await copyText(exportJson(), fallback);
            toast(ok ? 'პროექტი დაკოპირდა. შეინახე ტექსტურ ფაილში .json გაფართოებით.' : 'მონიშნული ტექსტი დააკოპირე ხელით.', ok ? 'ok' : 'info');
            if (ok) closeMenu();
          },
        }, icon('copy', 16), 'პროექტის კოპირება (JSON)'),
      h('button', { type: 'button', class: 'menu-item', onclick: () => { closeMenu(); jsonInput.click(); } }, icon('upload', 16), 'პროექტის გახსნა ფაილიდან'),
      fallback,
      state.saveError ? h('p', { class: 'menu-note warn' }, state.saveError) : h('p', { class: 'menu-note' }, 'პროექტი ავტომატურად ინახება ამ ბრაუზერში.'),
    );
  }
  menuBtn.addEventListener('click', () => {
    if (menu.hidden) {
      renderMenu();
      menu.hidden = false;
      menuBtn.setAttribute('aria-expanded', 'true');
    } else closeMenu();
  });
  jsonInput.addEventListener('change', async () => {
    const f = jsonInput.files[0];
    jsonInput.value = '';
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      const report = {};
      const p = migrateProject(raw, report);
      if (!p) throw new Error('bad');
      newProject(p, raw.planImage);
      const dropped = droppedNotice(report);
      toast(dropped ? `პროექტი გაიხსნა. ${dropped}` : 'პროექტი გაიხსნა.', dropped ? 'warn' : 'ok');
    } catch (e) {
      toast('ფაილი ვერ წავიკითხე. საჭიროა ამ პროგრამიდან შენახული .json ფაილი.', 'warn');
    }
  });

  // ---------------------------------------------------------------- sample banner
  function renderBanner() {
    const p = current();
    banner.hidden = !p.sample;
    if (!p.sample) return;
    clear(banner);
    add(banner, 
      h('div', { class: 'banner-txt' }, h('b', null, 'ეს ნიმუშია'), h('span', { class: 'hide-sm' }, ': 3-ოთახიანი ბინა, 73 მ². დაათვალიერე, შემდეგ დახაზე შენი.')),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-sm btn-accent', 'aria-label': 'ჩემი გეგმის ატვირთვა', onclick: () => planInput.click() }, icon('upload', 16), h('span', { class: 'hide-sm' }, 'ჩემი გეგმის '), 'ატვირთვა'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => newProject(emptyProject()) }, 'ცარიელი ბადე')),
    );
  }

  // ---------------------------------------------------------------- state wiring
  function syncToolbar() {
    for (const b of toolBtns) {
      const on = b.dataset.tool === state.tool;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (b.dataset.tool === 'scale') b.hidden = !(state.planImage && current().plan);
    }
    undoBtn.disabled = !canUndo();
    redoBtn.disabled = !canRedo();
  }

  subscribe((kind) => {
    if (kind === 'tool' || kind === 'project' || kind === 'image') syncToolbar();
    if (kind === 'project') {
      renderBanner();
      if (state.step === 'plan') materials.planChanged();
    }
    if (kind === 'tool' && state.tool !== 'select') hidePop();
    if (kind === 'save' && state.saveError) toast(state.saveError, 'warn');
  });

  function showStep() {
    const k = (location.hash || '#plan').slice(1);
    const step = STEPS.some(([s]) => s === k) ? k : 'plan';
    state.step = step;
    planSection.hidden = step !== 'plan';
    matSection.hidden = step !== 'materials';
    estSection.hidden = step !== 'estimate';
    sceneSection.hidden = step !== 'scene';
    for (const a of nav.querySelectorAll('.step-link')) {
      if (a.dataset.step === step) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    document.body.dataset.step = step;
    hidePop();
    if (step === 'plan') {
      editor.resize();
      inspector.render();
    }
    renderEmpty();
    if (step === 'materials') materials.show();
    if (step === 'estimate') estimate.show();
    if (step === 'scene') composer.show();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', showStep);
  window.addEventListener('beforeunload', saveNow);
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => emit('theme'));
  new MutationObserver(() => emit('theme')).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------------------------------------------------------------- empty plan
  function renderEmpty() {
    const p = current();
    emptyCard.hidden = !(state.step === 'plan' && !p.rooms.length && !(state.planImage && p.plan) && state.tool === 'select');
  }

  // ---------------------------------------------------------------- bottom sheet (narrow screens)
  const SHEET = ['peek', 'half', 'full'];
  const setSheet = (v) => {
    sheet.dataset.sheet = v;
    sheetHandle.setAttribute('aria-expanded', v === 'peek' ? 'false' : 'true');
    sheetHandle.setAttribute('aria-label', v === 'peek' ? 'პარამეტრების გაშლა' : 'პარამეტრების ჩაკეცვა');
  };
  function renderSheetTitle() {
    const p = current();
    const sel = state.selection;
    let t = `ბინა · ${p.rooms.length} ოთახი`;
    if (sel?.type === 'room') {
      const r = p.rooms.find((x) => x.id === sel.id);
      if (r) t = `${roomLabel(r, p.rooms)} · ${G.area(r.points).toFixed(2)} მ²`;
    } else if (sel?.type === 'opening') {
      const o = p.openings.find((x) => x.id === sel.id);
      if (o) t = OPENING_TYPES[o.type].label;
    } else if (sel?.type === 'furniture') {
      const f = (p.furniture || []).find((x) => x.id === sel.id);
      if (f) t = `${furnitureLabel(f)} · ${Math.round(f.w * 100)} × ${Math.round(f.d * 100)} სმ`;
    }
    sheetTitle.textContent = t;
  }
  let sheetDrag = null;
  sheetHandle.addEventListener('pointerdown', (e) => {
    sheetDrag = { y: e.clientY };
    sheetHandle.setPointerCapture?.(e.pointerId);
  });
  sheetHandle.addEventListener('pointerup', (e) => {
    if (!sheetDrag) return;
    const dy = e.clientY - sheetDrag.y;
    sheetDrag = null;
    const i = SHEET.indexOf(sheet.dataset.sheet);
    if (dy < -30) setSheet(SHEET[Math.min(2, i + 1)]);
    else if (dy > 30) setSheet(SHEET[Math.max(0, i - 1)]);
    else return; // a tap: handled by click
    sheetHandle.dataset.dragged = '1';
  });
  sheetHandle.addEventListener('click', () => {
    if (sheetHandle.dataset.dragged) {
      delete sheetHandle.dataset.dragged;
      return;
    }
    setSheet(sheet.dataset.sheet === 'peek' ? 'half' : 'peek');
  });
  let lastSel = null;
  subscribe((kind) => {
    if (kind === 'selection' || kind === 'project') {
      const key = state.selection ? `${state.selection.type}:${state.selection.id}` : null;
      // Selecting something opens the sheet so its details can be edited.
      if (kind === 'selection' && key && key !== lastSel && sheet.dataset.sheet === 'peek') {
        setSheet('half');
        // Then keep the selected room in view above the sheet.
        setTimeout(() => {
          const p = current();
          const sel = state.selection;
          if (!sel || getComputedStyle(sheet).position !== 'fixed') return;
          let pts = null;
          if (sel.type === 'furniture') {
            const f = (p.furniture || []).find((x) => x.id === sel.id);
            if (f) pts = corners(f, 0.4); // with room for the handles
          } else {
            const room = p.rooms.find((r) => r.id === (sel.type === 'room' ? sel.id : p.openings.find((o) => o.id === sel.id)?.roomId));
            pts = room?.points;
          }
          if (!pts) return;
          const cover = canvas.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top;
          editor.reveal(pts, Math.max(0, cover));
        }, 260);
      }
      // Nothing selected any more: give the plan its space back.
      if (!key && lastSel) setSheet('peek');
      lastSel = key;
      renderSheetTitle();
    }
    if (['project', 'tool', 'image'].includes(kind)) renderEmpty();
  });
  setSheet('peek');
  renderSheetTitle();

  // ---------------------------------------------------------------- onboarding and help
  const onboarding = createOnboarding({
    onUpload: () => planInput.click(),
    onDraw: () => {
      newProject(emptyProject());
      setTool('rect');
    },
    onSample: () => {
      if (!current().sample) newProject(sampleProject());
      go('plan');
    },
  });
  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName || '';
    if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !onboarding.open) {
      e.preventDefault();
      onboarding.showHelp();
    }
  });

  // ---------------------------------------------------------------- never lose work
  // An unexpected error must not take unsaved edits with it.
  const onCrash = () => {
    try {
      saveNow();
    } catch (err) { /* ignore */ }
    toast('მოხდა მოულოდნელი შეცდომა. პროექტი შენახულია; თუ რამე არასწორად ჩანს, გადატვირთე გვერდი.', 'warn');
  };
  window.addEventListener('error', onCrash);
  window.addEventListener('unhandledrejection', onCrash);
  // If the browser could not save, ask before the page is closed.
  window.addEventListener('beforeunload', (e) => {
    if (state.saveError) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  renderBanner();
  syncToolbar();
  showStep();
  renderEmpty();
  inspector.render();
  if (saved.notice) toast(saved.notice, 'warn');
  else if (state.saveError) toast(state.saveError, 'warn');
  if (firstVisit() && current().sample && !saved.notice) onboarding.showWelcome();
}
