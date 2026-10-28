// The furniture library: pick a piece and it appears in a free spot of the room, ready to
// be dragged. Pieces that suit the room's purpose are shown first.
import { current, commit, setSelection } from './store.js';
import { FURNITURE, FURNITURE_CATEGORIES, CATEGORY_ORDER, FURNITURE_ORDER, SUGGESTED } from '../core/furniture.js';
import { autoPlace } from '../core/layout.js';
import { addFurniture } from '../core/ops.js';
import { roomLabel } from '../core/model.js';
import { h, add, clear, icon, cssVar, toast, fmtNum } from './dom.js';
import { furnitureThumb } from './furniture-draw.js';

export function createFurnitureLibrary({ onAdded } = {}) {
  const dlg = h('dialog', { class: 'picker lib', id: 'furniture-library', 'aria-labelledby': 'lib-title' });
  document.body.append(dlg);
  let roomId = null;
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });

  function addPiece(type) {
    const p = current();
    const item = autoPlace(p, type, roomId);
    if (!item) return;
    commit(addFurniture(p, item));
    setSelection({ type: 'furniture', id: item.id });
    dlg.close();
    onAdded?.(item);
  }

  function card(type, colors) {
    const t = FURNITURE[type];
    return h('button', { type: 'button', class: 'lib-card', 'data-type': type, onclick: () => addPiece(type) },
      h('span', { class: 'lib-thumb' }, furnitureThumb(type, t.w, t.d, colors)),
      h('span', { class: 'lib-name' }, t.label),
      h('span', { class: 'lib-size num' }, `${fmtNum(t.w * 100, 0)} × ${fmtNum(t.d * 100, 0)} სმ`));
  }

  function section(title, types, colors) {
    return h('section', { class: 'lib-sec' },
      h('h3', null, title),
      h('div', { class: 'lib-grid' }, types.map((k) => card(k, colors))));
  }

  function render() {
    clear(dlg);
    const p = current();
    const room = p.rooms.find((r) => r.id === roomId);
    const colors = { ink: cssVar('--furn-ink') || '#3a4246', fill: cssVar('--furn') || '#ffffff' };
    const roomSel = h('select', { class: 'unit-sel', id: 'lib-room' },
      p.rooms.map((r) => h('option', { value: r.id, selected: r.id === roomId }, roomLabel(r, p.rooms))));
    roomSel.addEventListener('change', () => {
      roomId = roomSel.value;
      render();
      dlg.querySelector('#lib-room')?.focus();
    });
    const suggested = SUGGESTED[room?.purpose] || [];
    add(dlg,
      h('header', { class: 'picker-head' },
        h('div', null, h('div', { class: 'eyebrow' }, 'ავეჯის დამატება'), h('h2', { id: 'lib-title' }, room ? roomLabel(room, p.rooms) : 'ავეჯი')),
        h('button', { type: 'button', class: 'btn btn-ghost icon-btn', 'aria-label': 'დახურვა', onclick: () => dlg.close() }, icon('close'))),
      h('div', { class: 'lib-room' },
        h('label', { for: 'lib-room' }, 'ოთახი'), roomSel,
        h('span', { class: 'muted small' }, 'ნივთი ოთახის თავისუფალ ადგილას დაჯდება; შემდეგ გადაათრიე სასურველ ადგილზე.')),
      h('div', { class: 'lib-body' },
        suggested.length ? section('ამ ოთახისთვის', suggested, colors) : null,
        CATEGORY_ORDER.map((c) => section(FURNITURE_CATEGORIES[c], FURNITURE_ORDER.filter((k) => FURNITURE[k].cat === c), colors))));
  }

  return {
    show(targetRoomId) {
      const p = current();
      if (!p.rooms.length) {
        toast('ავეჯის დასამატებლად ჯერ ოთახი დახაზე.', 'warn');
        return;
      }
      roomId = p.rooms.some((r) => r.id === targetRoomId) ? targetRoomId : p.rooms[0].id;
      render();
      if (dlg.open) dlg.close();
      dlg.showModal();
      dlg.querySelector('.lib-card')?.focus();
    },
    get isOpen() {
      return dlg.open;
    },
  };
}
