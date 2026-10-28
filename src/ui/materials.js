// Step 2: style, budget and a material for every surface, with the 3D view.
import { state, current, commit, subscribe } from './store.js';
import * as G from '../core/geometry.js';
import { PURPOSES, roomLabel } from '../core/model.js';
import { STYLES, STYLE_ORDER, TIERS, TIER_ORDER, CATEGORIES, SHOPS, materialsInCats, pick, priceLabel, shopLabel, CATALOG_NOTE } from '../core/catalog.js';
import { product, COLOR_FAMILIES, VERIFICATION } from '../core/products.js';
import { createBoard, provenanceBadges, sampleTile, exportReferences } from './material-board.js';
import { SURFACES, GLOBAL_SURFACES, resolveMaterial, roomSurfaces, allowedCats, setFinish, clearRoomFinish, globalKey } from '../core/finishes.js';
import { measureProject } from '../core/measure.js';
import { computeEstimate } from '../core/quantities.js';
import { h, add, clear, icon, fmtArea, fmtMoney, toast } from './dom.js';
import { swatch } from './textures.js';
import { loadThree } from './libs.js';
import { createView3D } from './view3d.js';
import { purposeColorVar } from './plan-editor.js';

export function createMaterialsStep({ el, onGoEstimate, onGoPlan }) {
  const viewBox = h('div', { class: 'view-box', id: 'view3d' });
  const viewMsg = h('div', { class: 'view-msg' }, '3D ხედი იტვირთება…');
  const cutBtn = h('button', { type: 'button', class: 'btn btn-sm btn-float', 'aria-pressed': 'false' }, icon('layers', 16), 'კედლების ჭრილი');
  // Viewpoints: the whole apartment at an angle, straight from above (like the plan), or
  // standing inside one room at eye height — the view an interior render starts from.
  const VIEWS = [['overview', 'მთელი ბინა'], ['top', 'ზემოდან'], ['room', 'ოთახში']];
  const viewSeg = h('div', { class: 'seg seg-float', role: 'radiogroup', 'aria-label': 'ხედი' }, VIEWS.map(([k, label]) => h('button', {
    type: 'button', class: 'seg-btn', 'data-view': k, role: 'radio', 'aria-checked': 'false', onclick: () => chooseView(k),
  }, label)));
  const cornerBtn = h('button', { type: 'button', class: 'btn btn-sm btn-float', hidden: true, onclick: () => { view?.nextCorner(); } }, icon('rotate', 16), 'სხვა კუთხე');
  const viewCaption = h('div', { class: 'view-caption' });
  const panel = h('div', { class: 'mat-panel' });
  const totalBar = h('div', { class: 'total-bar' });
  const dialog = h('dialog', { class: 'picker', id: 'picker' });
  const board = createBoard({ onChange: (room, surface) => openPicker(room, surface) });
  add(el, 
    h('div', { class: 'mat-layout' },
      h('div', { class: 'view-col' },
        h('div', { class: 'view-wrap' }, viewBox, viewMsg, h('div', { class: 'view-tools' }, viewSeg, cutBtn, cornerBtn)),
        viewCaption),
      h('div', { class: 'mat-col' }, panel, totalBar)),
    dialog,
  );
  // Shared by Materials and Scene; a hidden step must not hide its modal.
  document.body.append(dialog);

  let view = null;
  let viewFailed = false;
  let focusRoom = null;
  let needsRefit = true;
  const viewHome = viewBox.parentElement;
  let pendingView = null;

  function showViewError(msg, retry) {
    viewMsg.hidden = false;
    clear(viewMsg);
    add(viewMsg, h('p', null, msg),
      retry ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { viewFailed = false; viewMsg.textContent = '3D ხედი იტვირთება…'; ensureView(); } }, 'თავიდან ცდა') : null);
  }

  function ensureView() {
    if (pendingView) return pendingView;
    pendingView = initView().finally(() => { pendingView = null; });
    return pendingView;
  }
  async function initView() {
    if (view || viewFailed) return;
    let THREE;
    try {
      THREE = await loadThree();
      if (!THREE) throw new Error('three');
    } catch (e) {
      viewFailed = true;
      showViewError('3D ხედის ბიბლიოთეკა ვერ ჩაიტვირთა. შეამოწმე ინტერნეტი და სცადე თავიდან. მასალების არჩევა და ხარჯთაღრიცხვა მის გარეშეც მუშაობს.', true);
      return;
    }
    try {
      view = createView3D({
        THREE,
        container: viewBox,
        onPickRoom: (id) => {
          if (!id && view.view.kind === 'room') return; // looking around inside a room
          focusRoom = id;
          view.focusRoom(id);
          syncView();
          renderCaption();
          if (id) {
            const sec = panel.querySelector(`[data-room="${id}"]`);
            sec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            panel.querySelectorAll('.room-sec').forEach((s) => s.classList.toggle('focus', s.dataset.room === id));
          }
        },
      });
      viewMsg.hidden = true;
      if (window.__BINA_DEBUG__) window.__binaView = view;
      view.update(current(), { refit: true });
      needsRefit = false;
    } catch (e) {
      // WebGL is unavailable or was refused (old device, disabled graphics acceleration).
      viewFailed = true;
      view = null;
      clear(viewBox);
      showViewError('ეს ბრაუზერი ან მოწყობილობა 3D გრაფიკას (WebGL) ვერ აჩვენებს. მასალების არჩევა და ხარჯთაღრიცხვა მის გარეშეც მუშაობს.', false);
    }
  }

  cutBtn.addEventListener('click', () => {
    if (!view) return;
    view.setCut(!view.cut);
    syncView();
    renderCaption();
  });

  function markFocus() {
    panel.querySelectorAll('.room-sec').forEach((s) => s.classList.toggle('focus', !!focusRoom && s.dataset.room === focusRoom));
  }

  function chooseView(kind) {
    if (!view) return;
    if (kind === 'overview') focusRoom = null;
    view.setView(kind, { roomId: focusRoom });
    if (kind === 'room') focusRoom = view.view.roomId;
    if (kind === 'overview') view.focusRoom(null);
    markFocus();
    syncView();
    renderCaption();
  }

  function syncView() {
    const kind = view?.view.kind || 'overview';
    for (const b of viewSeg.querySelectorAll('.seg-btn')) {
      const on = b.dataset.view === kind;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    cornerBtn.hidden = kind !== 'room';
    const cut = !!view?.cut;
    cutBtn.setAttribute('aria-pressed', String(cut));
    cutBtn.classList.toggle('on', cut);
  }

  function renderCaption() {
    clear(viewCaption);
    const p = current();
    const r = focusRoom && p.rooms.find((x) => x.id === focusRoom);
    const inRoom = view?.view.kind === 'room';
    add(viewCaption, r
      ? h('span', null, h('b', null, roomLabel(r, p.rooms)), inRoom ? ' · შიგნიდან, თვალის სიმაღლიდან. გადათრევით მიმოიხედე, „სხვა კუთხე“ — სხვა წერტილიდან.' : ` · ${fmtArea(G.area(r.points))}`)
      : h('span', { class: 'muted' }, 'დააჭირე ოთახს 3D-ში, რომ მასზე გადახვიდე. გადათრევით ატრიალებ, ბორბლით ან ორი თითით ადიდებ.'));
  }

  // ---------------------------------------------------------------- panel
  function materialRow({ room, surface, label, project }) {
    const { material, source } = resolveMaterial(project, room, surface);
    if (!material) return null;
    const sw = swatch(material, 44);
    sw.className = 'sw';
    const row = h('button', {
      type: 'button',
      class: 'mat-row',
      onclick: () => openPicker(room, surface),
      'aria-label': `${label}: ${material.name}. შეცვლა`,
    },
    sw,
    h('span', { class: 'mat-txt' },
      h('span', { class: 'mat-surface' }, label, source === 'room' ? h('span', { class: 'chip' }, 'მხოლოდ აქ') : source === 'global' ? h('span', { class: 'chip chip-soft' }, 'შენი არჩევანი') : null),
      h('span', { class: 'mat-name' }, material.name),
      h('span', { class: 'mat-spec' }, `${material.spec} · ${priceLabel(material)}${material.source ? ` · ${shopLabel(material)}` : ''}`),
      provenanceBadges(product(material.id), { compact: true })),
    h('span', { class: 'mat-change' }, 'შეცვლა'));
    return row;
  }

  function styleCard(key, p) {
    const s = STYLES[key];
    const picks = ['floor_wood', 'tile_wall', 'stone', 'paint'].map((c) => pick(c, key, p.tier));
    return h('button', {
      type: 'button',
      class: `style-card${p.style === key ? ' on' : ''}`,
      role: 'radio',
      'aria-checked': p.style === key ? 'true' : 'false',
      onclick: () => { if (p.style !== key) commit({ ...current(), style: key }); },
    },
    h('span', { class: 'style-sw' }, picks.map((m) => { const c = swatch(m, 48); c.className = 'sw'; return c; })),
    h('span', { class: 'style-name' }, s.label));
  }

  function render() {
    const p = current();
    const measured = measureProject(p);
    const byId = new Map(measured.rooms.map((m) => [m.id, m]));
    const keepScroll = panel.scrollTop;
    clear(panel);

    if (!p.rooms.length) {
      add(panel, h('div', { class: 'empty' },
        h('h2', null, 'ჯერ ოთახები არ არის'),
        h('p', null, 'მასალების ასარჩევად ჯერ ბინის გეგმა დახაზე.'),
        h('button', { type: 'button', class: 'btn btn-accent', onclick: onGoPlan }, 'გეგმაზე დაბრუნება')));
      clear(totalBar);
      return;
    }

    const overrides = Object.keys(p.finish?.global || {}).length
      + Object.values(p.finish?.rooms || {}).reduce((s, m) => s + Object.keys(m).length, 0);

    add(panel, 
      h('section', { class: 'mat-sec' },
        h('h2', { class: 'sec-h' }, 'სტილი'),
        h('div', { class: 'style-grid', role: 'radiogroup', 'aria-label': 'სტილი' }, STYLE_ORDER.map((k) => styleCard(k, p))),
        h('p', { class: 'style-desc' }, h('b', null, `${STYLES[p.style].label}: `), STYLES[p.style].desc)),
      h('section', { class: 'mat-sec' },
        h('h2', { class: 'sec-h' }, 'ბიუჯეტი'),
        h('div', { class: 'seg seg-lg', role: 'radiogroup', 'aria-label': 'ბიუჯეტი' }, TIER_ORDER.map((k) => h('button', {
          type: 'button',
          class: `seg-btn${p.tier === k ? ' on' : ''}`,
          role: 'radio',
          'aria-checked': p.tier === k ? 'true' : 'false',
          onclick: () => { if (p.tier !== k) commit({ ...current(), tier: k }); },
        }, h('b', null, TIERS[k].label), h('span', null, TIERS[k].desc)))),
        overrides ? h('div', { class: 'reset-row' },
          h('span', { class: 'muted small' }, `ხელით შეცვლილია ${overrides} ზედაპირი. სტილის და ბიუჯეტის ცვლილება მათ არ ეხება.`),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => commit({ ...current(), finish: { global: {}, rooms: {} } }) }, 'ყველას გაუქმება')) : null),
    );

    const globalRows = [];
    if (measured.totals.doorCount > 0) globalRows.push(materialRow({ room: null, surface: 'door', label: `${GLOBAL_SURFACES.door.label} · ${measured.totals.doorCount} ც`, project: p }));
    if (measured.totals.windowCount > 0) globalRows.push(materialRow({ room: null, surface: 'sill', label: `${GLOBAL_SURFACES.sill.label} · ${measured.totals.windowCount} ც`, project: p }));
    add(panel, h('section', { class: 'mat-sec refs-sec' },
      h('div', { class: 'refs-txt' },
        h('b', null, 'AI რენდერის რეფერენსები'),
        h('span', { class: 'muted small' }, 'თითოეული ზედაპირის პროდუქტი, ფერი, მასშტაბი და რამდენად სავალდებულოა. ოთახის დაფა — „დაფა“ ღილაკით.')),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => exportReferences(null) }, icon('download', 16), 'ექსპორტი')));
    if (globalRows.length) {
      add(panel, h('section', { class: 'mat-sec room-sec' },
        h('div', { class: 'room-head' },
          h('h3', { class: 'room-h' }, 'მთელი ბინა'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => board.open(null) }, icon('layers', 16), 'დაფა')),
        h('div', { class: 'rows' }, globalRows)));
    }

    for (const room of p.rooms) {
      const m = byId.get(room.id);
      const surfaces = roomSurfaces(room, m);
      const rows = surfaces.map((s) => {
        let label = SURFACES[s].label;
        if (s === 'floor') label += ` · ${fmtArea(m.floorArea, 1)}`;
        if (s === 'walls') label += ` · ${fmtArea(PURPOSES[room.purpose]?.wet ? m.wallTileArea : m.wallPaintArea, 1)}`;
        if (s === 'walls_upper') label += ` · ${fmtArea(m.wallPaintArea, 1)}`;
        if (s === 'backsplash') label += ` · ${fmtArea(m.backsplashArea, 1)}`;
        if (s === 'countertop') label += ` · ${fmtArea(m.countertopArea, 2)}`;
        if (s === 'cabinet') label += ' · ფასი არ ითვლება';
        return materialRow({ room, surface: s, label, project: p });
      });
      add(panel, h('section', { class: `mat-sec room-sec${focusRoom === room.id ? ' focus' : ''}`, 'data-room': room.id },
        h('div', { class: 'room-head' },
          h('button', {
            type: 'button',
            class: 'room-h as-btn',
            title: '3D-ში ამ ოთახის ჩვენება',
            onclick: () => { focusRoom = room.id; view?.focusRoom(room.id); syncView(); renderCaption(); markFocus(); },
          },
          h('span', { class: 'dot', style: { background: `var(${purposeColorVar(room.purpose)})` } }),
          roomLabel(room, p.rooms),
          h('span', { class: 'muted num' }, fmtArea(m.area, 1)),
          icon('focus', 16)),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm board-btn', 'aria-label': `${roomLabel(room, p.rooms)}: მასალების დაფა`, onclick: () => board.open(room.id) }, icon('layers', 16), 'დაფა')),
        h('div', { class: 'rows' }, rows)));
    }
    add(panel, h('p', { class: 'muted small note' }, CATALOG_NOTE));
    panel.scrollTop = keepScroll;

    const est = computeEstimate(p);
    clear(totalBar);
    add(totalBar, 
      h('div', null, h('span', { class: 'muted small' }, 'მასალები, სავარაუდოდ'), h('b', { class: 'num total-sum' }, fmtMoney(est.total))),
      h('button', { type: 'button', class: 'btn btn-accent', onclick: onGoEstimate }, 'ხარჯთაღრიცხვა', icon('chevron', 18)));
  }

  // ---------------------------------------------------------------- picker
  let pickerState = null;
  // Picker filters. They are kept when the same surface is opened again, and start fresh on
  // another surface: a filter carried over silently (e.g. "verified only" from the floor to
  // the countertop) would hide products without the user knowing why.
  const NO_FILTERS = { tier: 'all', color: 'all', style: 'all', shop: 'all', verified: false };
  let filters = { ...NO_FILTERS };
  let filtersFor = null;
  function openPicker(room, surface) {
    const p = current();
    const cats = allowedCats(room, surface);
    const { material: cur, source } = resolveMaterial(p, room, surface);
    pickerState = { room, surface, scope: source === 'room' ? 'room' : 'all', cat: cur && cats.includes(cur.cat) ? cur.cat : cats[0] };
    const fkey = `${room ? room.id : '*'}|${surface}`;
    if (fkey !== filtersFor) {
      filters = { ...NO_FILTERS };
      filtersFor = fkey;
    }
    renderPicker();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closePicker() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    pickerState = null;
  }

  dialog.addEventListener('click', (e) => { if (e.target === dialog) closePicker(); });
  dialog.addEventListener('cancel', () => { pickerState = null; });

  function renderPicker() {
    clear(dialog);
    if (!pickerState) return;
    const p = current();
    const { room, surface } = pickerState;
    const cats = allowedCats(room, surface);
    const { material: cur, source } = resolveMaterial(p, room, surface);
    const surfLabel = room ? SURFACES[surface].label : GLOBAL_SURFACES[surface].label;
    const where = room ? roomLabel(room, p.rooms) : 'მთელი ბინა';

    const all = materialsInCats([pickerState.cat]).slice().sort((a, b) => {
      const sa = a.styles.includes(p.style) ? 0 : 1;
      const sb = b.styles.includes(p.style) ? 0 : 1;
      return sa - sb || TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || (a.price ?? 0) - (b.price ?? 0);
    });
    const f = filters;
    const list = all.filter((m) => {
      const pr = product(m.id);
      if (f.tier !== 'all' && m.tier !== f.tier) return false;
      if (f.color !== 'all' && pr.color.family !== f.color) return false;
      if (f.style !== 'all' && !m.styles.includes(f.style)) return false;
      if (f.shop !== 'all' && m.source?.shop !== f.shop) return false;
      if (f.verified && pr.verification.status !== 'verified') return false;
      return true;
    });
    // Only offer filter values that exist in this category.
    const has = (fn) => new Set(all.map(fn));
    const tiers = has((m) => m.tier);
    const colors = has((m) => product(m.id).color.family);
    const styles = new Set(all.flatMap((m) => m.styles));
    const shops = has((m) => m.source?.shop);
    const chip = (key, value, label) => h('button', {
      type: 'button',
      class: `fchip${f[key] === value ? ' on' : ''}`,
      'aria-pressed': f[key] === value ? 'true' : 'false',
      onclick: () => { filters = { ...filters, [key]: value }; renderPicker(); },
    }, label);
    const anyFilter = f.tier !== 'all' || f.color !== 'all' || f.style !== 'all' || f.shop !== 'all' || f.verified;
    const filterBar = h('div', { class: 'filters', role: 'group', 'aria-label': 'ფილტრები' },
      h('div', { class: 'frow' }, h('span', { class: 'flabel' }, 'ბიუჯეტი'), chip('tier', 'all', 'ყველა'),
        TIER_ORDER.filter((t) => tiers.has(t)).map((t) => chip('tier', t, TIERS[t].label))),
      colors.size > 1 ? h('div', { class: 'frow' }, h('span', { class: 'flabel' }, 'ფერი'), chip('color', 'all', 'ყველა'),
        Object.keys(COLOR_FAMILIES).filter((c) => colors.has(c)).map((c) => chip('color', c, COLOR_FAMILIES[c].label))) : null,
      styles.size ? h('div', { class: 'frow' }, h('span', { class: 'flabel' }, 'სტილი'), chip('style', 'all', 'ყველა'),
        STYLE_ORDER.filter((st) => styles.has(st)).map((st) => chip('style', st, STYLES[st].label))) : null,
      h('div', { class: 'frow' },
        shops.size > 1 || (shops.size === 1 && !shops.has(undefined)) ? h('label', { class: 'field-in' }, h('span', { class: 'flabel' }, 'მაღაზია'),
          h('select', { class: 'unit-sel', 'aria-label': 'მაღაზია', onchange: (e) => { filters = { ...filters, shop: e.target.value }; renderPicker(); } },
            h('option', { value: 'all', selected: f.shop === 'all' }, 'ყველა'),
            [...shops].filter(Boolean).map((k) => h('option', { value: k, selected: f.shop === k }, SHOPS[k]?.label || k)))) : null,
        h('label', { class: 'check', title: VERIFICATION.verified.desc },
          h('input', { type: 'checkbox', checked: f.verified, onchange: (e) => { filters = { ...filters, verified: e.target.checked }; renderPicker(); } }),
          ' მხოლოდ გადამოწმებული'),
        h('span', { class: 'muted small fcount', 'aria-live': 'polite' }, `${list.length} / ${all.length}`),
        anyFilter ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { filters = { ...NO_FILTERS }; renderPicker(); } }, 'ფილტრის მოხსნა') : null));

    const same = room ? p.rooms.filter((r) => globalKey(r.purpose, surface, p.tier) === globalKey(room.purpose, surface, p.tier)).length : 0;

    add(dialog, 
      h('header', { class: 'picker-head' },
        h('div', null, h('div', { class: 'eyebrow' }, where), h('h2', null, surfLabel)),
        h('button', { type: 'button', class: 'btn btn-ghost icon-btn', 'aria-label': 'დახურვა', onclick: closePicker }, icon('close'))),
      room ? h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'სად გამოვიყენო' },
        h('button', { type: 'button', class: `seg-btn${pickerState.scope === 'all' ? ' on' : ''}`, onclick: () => { pickerState.scope = 'all'; renderPicker(); } },
          same > 1 ? `ყველა მსგავს ოთახში (${same})` : 'მთელ ბინაში'),
        h('button', { type: 'button', class: `seg-btn${pickerState.scope === 'room' ? ' on' : ''}`, onclick: () => { pickerState.scope = 'room'; renderPicker(); } },
          `მხოლოდ: ${where}`)) : null,
      cats.length > 1 ? h('div', { class: 'tabs' }, cats.map((c) => h('button', {
        type: 'button', class: `tab${pickerState.cat === c ? ' on' : ''}`, onclick: () => { pickerState.cat = c; filters = { ...filters, color: 'all' }; renderPicker(); },
      }, CATEGORIES[c]))) : null,
      filterBar,
      list.length ? h('div', { class: 'pick-grid' }, list.map((m) => {
        const pr = product(m.id);
        const on = cur && cur.id === m.id;
        return h('div', { class: `pick-card${on ? ' on' : ''}` },
          h('button', {
            type: 'button',
            class: 'pick-main',
            'aria-pressed': on ? 'true' : 'false',
            onclick: () => {
              const next = setFinish(current(), room, surface, m.id, room ? pickerState.scope : 'all');
              commit(next);
              closePicker();
              toast(`${surfLabel}: ${m.name}`, 'ok');
            },
          },
          sampleTile(m, 132),
          on ? h('span', { class: 'pick-on' }, icon('check', 16)) : null,
          h('span', { class: 'pick-name' }, m.name),
          h('span', { class: 'pick-spec' }, m.spec),
          pr.manufacturer ? h('span', { class: 'pick-spec' }, pr.manufacturer) : null,
          m.source ? h('span', { class: 'pick-shop' }, shopLabel(m), m.source.note ? h('span', { class: 'pick-note' }, ` · ${m.source.note}`) : null) : null,
          h('span', { class: 'pick-foot' }, h('span', { class: `tier tier-${m.tier}` }, TIERS[m.tier].label), h('b', { class: 'num' }, priceLabel(m)))),
          h('div', { class: 'pick-meta' },
            provenanceBadges(pr, { compact: true }),
            pr.sourceUrl ? h('a', { class: 'pick-link', href: pr.sourceUrl, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${m.name}: მაღაზიის გვერდი` }, 'გვერდი ↗') : null));
      })) : h('div', { class: 'pick-empty' },
        h('p', null, 'ამ ფილტრით პროდუქტი არ მოიძებნა.'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { filters = { ...NO_FILTERS }; renderPicker(); } }, 'ფილტრის მოხსნა')),
      room && source === 'room' ? h('footer', { class: 'picker-foot' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { commit(clearRoomFinish(current(), room.id, surface)); closePicker(); } }, 'ამ ოთახის არჩევანის გაუქმება')) : null,
    );
  }

  subscribe((kind) => {
    if (state.step === 'scene' && kind === 'project') board.refresh();
    if (state.step !== 'materials') return;
    if (kind === 'project' || kind === 'theme') {
      board.refresh();
      render();
      renderCaption();
      if (view) view.update(current(), { refit: needsRefit });
      needsRefit = false;
    }
  });

  return {
    openBoard(id) { board.open(id); },
    openPicker,
    async sceneView(container, { retry = false } = {}) {
      if (retry) viewFailed = false;
      await ensureView();
      if (!view || state.step !== 'scene') return null;
      container.append(viewBox);
      view.update(current());
      view.resize();
      return view;
    },
    show() {
      if (viewBox.parentElement !== viewHome) {
        viewHome.prepend(viewBox);
        view?.leavePreparation();
        needsRefit = true;
      }
      render();
      renderCaption();
      ensureView().then(() => {
        if (view) {
          view.resize();
          view.update(current(), { refit: needsRefit });
          needsRefit = false;
          syncView();
        }
      });
    },
    planChanged() {
      needsRefit = true;
    },
  };
}
