import { h, add, clear, icon, toast } from './dom.js';
import { current, commit, subscribe, state } from './store.js';
import { roomLabel } from '../core/model.js';
import { FURNITURE } from '../core/furniture.js';
import { compileScene } from '../core/scene.js';
import { compilePrompt, LIGHTING } from '../core/scene-prompt.js';
import { scenePackage } from '../core/scene-package.js';
import { drawScenePlan, planPNG } from './scene-plan.js';
import { sampleTile } from './material-board.js';
import { MATERIALS } from '../core/catalog.js';
import { setRefPrefs } from '../core/finishes.js';

const PRESETS = [['entrance', 'შესასვლელიდან'], ['window', 'ფანჯრისკენ'], ['opposite', 'საპირისპირო კუთხე'], ['wide', 'ფართო ხედი'], ['custom', 'ჩემი კუთხე']];
const FALLBACK = '3D რეფერენსი მიუწვდომელია. 2D გეგმა და სცენის პაკეტი ინახება; სცადე თავიდან.';

export function createSceneComposer({ el, materials, onGoPlan, onGoMaterials }) {
  let scene = null, view = null, epoch = 0, exporting = false;
  const viewport = h('div', { class: 'scene-viewport', id: 'scene-viewport' });
  const status = h('p', { class: 'scene-status', role: 'status', 'aria-live': 'polite' });
  const plan = h('canvas', { class: 'scene-plan', 'aria-label': 'ოთახის არქიტექტურული გეგმა' });
  const settingsPanel = h('div', { class: 'scene-settings' });
  const brief = h('div', { class: 'scene-brief' });
  const review = h('div', { class: 'scene-review' });
  const exportBtn = h('button', { type: 'button', class: 'btn btn-accent', id: 'scene-export', onclick: () => exportScene() }, icon('download', 18), 'AI პაკეტის ექსპორტი');
  const retryBtn = h('button', { type: 'button', class: 'btn btn-sm', id: 'scene-retry', onclick: () => synchronize(true) }, '3D თავიდან ცდა');
  const title = h('h1', null, 'სცენის მომზადება');
  const content = h('div', { class: 'scene-layout' },
    h('div', { class: 'scene-visuals' },
      h('div', { class: 'scene-image panel' },
        h('div', { class: 'scene-image-head' }, h('span', { class: 'eyebrow' }, '3D ბლოკაუტი · რეფერენსი 02'), h('span', { class: 'chip chip-soft' }, 'AI ჯერ არ შექმნილა')),
        viewport, h('div', { class: 'scene-image-foot' }, status, retryBtn)),
      h('div', { class: 'scene-secondary' },
        h('div', { class: 'scene-plan-card panel' }, h('p', { class: 'eyebrow' }, 'ოთახის გეგმა · რეფერენსი 01'), plan),
        h('div', { class: 'scene-brief-card panel' }, h('p', { class: 'eyebrow' }, 'რენდერის დავალება'), brief))),
    h('aside', { class: 'panel scene-controls', 'aria-label': 'სცენის პარამეტრები' }, settingsPanel));
  add(el,
    h('div', { class: 'scene-heading' }, h('div', null, h('p', { class: 'eyebrow' }, 'BINA / STAGE 05'), title,
      h('p', { class: 'muted' }, 'ოთახი → კამერა → მასალები → სცენის განხილვა → ექსპორტი')),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: onGoPlan }, 'გეგმის რედაქტირება')),
    content, review,
    h('div', { class: 'scene-export-bar panel' }, h('div', null, h('b', null, 'სცენა მზადაა შემდეგი ეტაპისთვის'),
      h('p', { class: 'muted small' }, 'ZIP პაკეტი: გეომეტრია, რეფერენსები, მასალები და დავალება.')), exportBtn));

  function selected() {
    const p = current();
    const id = p.scenePreparation?.roomId;
    return p.rooms.find((r) => r.id === id) || p.rooms[0];
  }
  function settings(room = selected()) {
    return current().scenePreparation?.rooms?.[room?.id] || {};
  }
  function compile(p = current(), r = selected(), s = settings(r)) {
    return compileScene(p, r.id, { ...s, custom: s.camera });
  }
  function saveSettings(patch = {}, roomId = selected()?.id) {
    const p = current(), r = p.rooms.find((x) => x.id === roomId);
    if (!r || exporting) return;
    const prev = p.scenePreparation || { rooms: {} };
    const s = { ...(prev.rooms?.[roomId] || {}), ...patch };
    try {
      const nextScene = compile(p, r, s);
      s.camera = nextScene.camera.status === 'ready' ? nextScene.camera : undefined;
      commit({ ...p, scenePreparation: { roomId, rooms: { ...prev.rooms, [roomId]: s } } }, { history: false });
    } catch (e) { toast(e.message, 'warn'); }
  }
  function label(text, control) { return h('label', { class: 'scene-field' }, h('span', null, text), control); }
  function options(values, value) { return values.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)); }

  function renderSettings() {
    const r = selected(), s = settings(r);
    clear(settingsPanel);
    add(settingsPanel,
      h('p', { class: 'eyebrow' }, '01 / ოთახი'),
      label('აირჩიე ოთახი', h('select', { id: 'scene-room', onchange: (e) => saveSettings({}, e.target.value) }, options(current().rooms.map((x) => [x.id, roomLabel(x, current().rooms)]), r.id))),
      h('p', { class: 'eyebrow' }, '02 / კამერა'),
      label('ხედვის წერტილი', h('select', { id: 'scene-preset', onchange: (e) => saveSettings({ preset: e.target.value, fov: e.target.value === 'wide' ? 82 : scene.camera.fov }) }, options(PRESETS, scene.camera.preset))),
      h('div', { class: 'scene-field-row' },
        label('ფორმატი', h('select', { id: 'scene-aspect', onchange: (e) => saveSettings({ aspect: +e.target.value }) }, options([[16 / 9, '16:9'], [4 / 3, '4:3'], [1, '1:1']], scene.camera.aspect))),
        label('ხედვის კუთხე (°)', h('input', { id: 'scene-fov', type: 'number', min: 25, max: 100, value: scene.camera.fov, onchange: (e) => saveSettings({ fov: +e.target.value }) }))),
      h('p', { class: 'muted small' }, 'გადაათრიე 3D ხედი მაუსით ან თითით, რომ მიმოიხედო. კამერის პოზიცია უსაფრთხო წერტილში რჩება.'),
      h('details', { class: 'scene-options', open: !window.matchMedia('(max-width: 860px)').matches },
        h('summary', null, 'განათება და სურვილები'),
        label('განათება', h('select', { id: 'scene-lighting', onchange: (e) => saveSettings({ lighting: e.target.value }) }, options(Object.entries(LIGHTING).map(([k, v]) => [k, v.ka]), scene.preferences.lighting))),
        label('დამატებითი სურვილი (არასავალდებულო)', h('textarea', { id: 'scene-instructions', rows: 4, maxlength: 1200,
          placeholder: 'მაგ.: თბილი მინიმალისტური ინტერიერი, რბილი დღის განათებით.', onchange: (e) => saveSettings({ instructions: e.target.value }) }, s.instructions || '')),
        h('p', { class: 'muted small' }, 'მაქსიმუმ 1200 სიმბოლო. სურვილები ვერ შეცვლის გეგმასა და სავალდებულო მასალებს.')),
      h('p', { class: 'eyebrow' }, '03 / მასალები'),
      h('button', { type: 'button', class: 'btn', onclick: () => materials.openBoard(r.id) }, icon('layers', 16), 'მასალების დაფა'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: onGoMaterials }, 'მასალებისა და სტილის არჩევა'));
  }
  function renderReview() {
    clear(brief); clear(review);
    add(brief, h('p', { id: 'scene-brief-ka' }, compilePrompt(scene).georgian),
      h('span', { class: 'scene-revision num' }, scene.revision));
    const r = selected();
    add(review, h('div', { class: 'scene-review-head' }, h('h2', null, 'სცენის განხილვა'),
      h('span', { class: 'muted' }, `${scene.furniture.length} ავეჯი · ${scene.openings.length} კარი/ფანჯარა · ${scene.materials.length} ზედაპირი`)),
      h('div', { class: 'scene-material-grid' }, scene.materials.map((ref) => {
        const room = ref.target.roomId ? r : null;
        return h('article', { class: `scene-material panel${ref.mandatory ? ' must' : ''}` },
          ref.status === 'resolved' ? sampleTile(MATERIALS[ref.materialId], 96) : h('div', { class: 'scene-unresolved' }, '?'),
          h('div', null, h('p', { class: 'eyebrow' }, ref.target.surfaceLabel), h('b', null, ref.material?.name || ref.materialId),
            h('p', { class: 'muted small' }, ref.status === 'unresolved' ? 'ჩანაწერი ვერ მოიძებნა — საჭიროა გადამოწმება'
              : ref.kind === 'preference' ? 'დიზაინის სურვილი' : 'პროდუქტი · ვიზუალური ნიმუში მიახლოებითია'),
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ref.mandatory,
              'aria-label': `${ref.target.surfaceLabel}: სავალდებულო`, onchange: (e) => commit(setRefPrefs(current(), room, ref.target.surface, { mandatory: e.target.checked })) }), ' სავალდებულო'),
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => materials.openPicker(room, ref.target.surface) }, 'შეცვლა')));
      })),
      h('details', { class: 'panel scene-data' }, h('summary', null, 'ავეჯის ზუსტი ზომები და ტექნიკური დავალება'),
        h('div', { class: 'scene-table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['ავეჯი', 'ზომა (მ)', 'პოზიცია X/Y', 'ბრუნვა'].map((t) => h('th', null, t)))),
          h('tbody', null, scene.furniture.map((f) => h('tr', null, h('td', null, FURNITURE[f.type]?.label || f.type), h('td', null, `${f.size.width} × ${f.size.depth} × ${f.size.height}`), h('td', null, `${f.position.x}, ${f.position.y}`), h('td', null, `${f.rotation}°`)))))),
        h('pre', { id: 'scene-prompt-en', tabindex: 0 }, compilePrompt(scene).english)),
      scene.warnings.length ? h('div', { class: 'scene-warnings panel', role: 'status' }, h('b', null, 'გადასამოწმებელი ინფორმაცია'), scene.warnings.map((w) => h('p', { class: 'small' }, w))) : null);
    if (window.__BINA_DEBUG__) window.__binaScene = { get scene() { return scene; }, get view() { return view; }, exportPackage: preparePackage };
  }
  async function synchronize(retry = false) {
    const generation = ++epoch;
    status.textContent = '3D რეფერენსი იტვირთება…';
    retryBtn.hidden = true;
    view = null;
    try {
      const v = await materials.sceneView(viewport, { retry });
      if (generation !== epoch || state.step !== 'scene') return;
      if (!v || scene.camera.status !== 'ready') throw new Error(FALLBACK);
      view = v;
      view.prepareCamera(scene.camera, (c) => saveSettings({ preset: 'custom', camera: c }));
      status.textContent = scene.camera.fallback ? 'გამოყენებულია ალტერნატიული კამერის წერტილი — იხილე შენიშვნა.' : 'სცენის კამერა და რეფერენსი სინქრონიზებულია.';
    } catch (e) {
      if (generation !== epoch) return;
      view = null;
      viewport.querySelector('.view-box')?.remove();
      status.textContent = FALLBACK;
      retryBtn.hidden = false;
    }
  }
  function render() {
    const r = selected();
    content.hidden = !r; review.hidden = !r; exportBtn.disabled = !r || exporting;
    if (!r) { title.textContent = 'ჯერ ოთახი დახაზე'; return; }
    title.textContent = 'სცენის მომზადება';
    try {
      scene = compile();
      viewport.style.aspectRatio = String(scene.camera.aspect);
      drawScenePlan(plan, scene);
      renderSettings(); renderReview();
      synchronize();
    } catch (e) {
      ++epoch;
      scene = null;
      view = null;
      status.textContent = e.message;
      exportBtn.disabled = true;
      if (window.__BINA_DEBUG__) window.__binaSceneError = e.message;
    }
  }
  async function preparePackage() {
    if (!scene) throw new Error('No valid scene');
    const snapshot = scene;
    const planBlob = await planPNG(plan);
    if (state.step !== 'scene') throw new Error('Scene export interrupted by navigation; return to scene preparation and retry.');
    let blockout = null, reason = FALLBACK;
    if (view && snapshot.camera.status === 'ready') {
      try {
        view.prepareCamera(snapshot.camera, null);
        blockout = await view.capturePNG();
      } catch (e) { reason = `Real 3D capture failed: ${e.message}. Retry available.`; }
    }
    return scenePackage(snapshot, { plan: planBlob, blockout, blockoutReason: reason });
  }
  async function exportScene() {
    if (exporting || !scene) return;
    // Save the camera with the exact compiled revision before capturing.
    saveSettings({ camera: scene.camera });
    exporting = true; exportBtn.disabled = true; el.setAttribute('aria-busy', 'true');
    settingsPanel.inert = true; review.inert = true;
    try {
      // Await pending viewer synchronization. A supported viewer gives a real PNG;
      // failure still leaves a useful geometry/2D package.
      await synchronize();
      const pkg = await preparePackage();
      const url = URL.createObjectURL(pkg.blob);
      const a = h('a', { href: url, download: `bina-scene-${scene.revision}.zip` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      if (!pkg.manifest.assets.blockout.filename) { status.textContent = FALLBACK; retryBtn.hidden = false; }
      toast(pkg.manifest.assets.blockout.filename ? 'სცენის სრული პაკეტი შენახულია.' : 'პაკეტი შენახულია 2D გეგმით; 3D რეფერენსი მიუწვდომელია.', 'ok');
    } catch (e) { toast(`ექსპორტი ვერ შესრულდა: ${e.message}`, 'warn'); }
    finally {
      exporting = false; exportBtn.disabled = false; el.removeAttribute('aria-busy'); settingsPanel.inert = false; review.inert = false;
      if (view && state.step === 'scene') {
        try { view.prepareCamera(scene.camera, (c) => saveSettings({ preset: 'custom', camera: c })); }
        catch (e) { view = null; status.textContent = FALLBACK; retryBtn.hidden = false; }
      }
    }
  }
  let queued = false;
  subscribe((kind) => {
    if (state.step !== 'scene' || !['project', 'theme'].includes(kind) || exporting || queued) return;
    // Blur/change events can fire while rebuilding settings. Coalesce commits so a
    // textarea blur never re-enters DOM rendering inside another control's change.
    queued = true;
    queueMicrotask(() => { queued = false; if (state.step === 'scene' && !exporting) render(); });
  });
  return { show: render };
}
