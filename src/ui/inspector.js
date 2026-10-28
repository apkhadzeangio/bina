// Right-hand panel of the plan step: apartment settings, the selected room or opening.
import { state, current, commit, setSelection, setHoverEdge, subscribe, emit, setPlanImage, setSnap } from './store.js';
import * as G from '../core/geometry.js';
import { PURPOSES, PURPOSE_ORDER, OPENING_TYPES, roomLabel, DEFAULT_HEIGHT } from '../core/model.js';
import { measureRoom, openingHosts, defaultKitchenRun, roomHeight, kitchenRuns } from '../core/measure.js';
import {
  withRoomPoints, updateRoom, deleteRoom, updateOpening, deleteOpening,
  addFurniture, updateFurniture, deleteFurniture, rotateFurniture, duplicateFurniture, resizeFurniture,
} from '../core/ops.js';
import { FURNITURE, furnitureLabel } from '../core/furniture.js';
import { analyzeFurniture, issueLevel, alignToWall, fitRun } from '../core/layout.js';
import { h, add, clear, icon, fmtNum, fmtArea, fmtLen, parseNum, toast } from './dom.js';
import { purposeColorVar } from './plan-editor.js';

// A room that becomes a kitchen gets a cabinet run on its best wall, unless it has one.
export function setRoomPurpose(project, room, purpose) {
  let next = updateRoom(project, room.id, { purpose, unassigned: false });
  const hasRun = (next.furniture || []).some((f) => f.type === 'kitchen_run' && f.roomId === room.id);
  if (PURPOSES[purpose].kitchen && !hasRun) {
    const r = next.rooms.find((x) => x.id === room.id);
    next = addFurniture(next, fitRun(next, r, defaultKitchenRun(r, next).runs[0]));
  }
  return next;
}

const cm = (m) => fmtNum(m * 100, 0);

export function purposeGrid(selected, onPick, idPrefix = 'pp') {
  return h('div', { class: 'purpose-grid', role: 'radiogroup', 'aria-label': 'ოთახის დანიშნულება' },
    PURPOSE_ORDER.map((k) => h('button', {
      type: 'button',
      id: `${idPrefix}-${k}`,
      class: `purpose-chip${selected === k ? ' on' : ''}`,
      role: 'radio',
      'aria-checked': selected === k ? 'true' : 'false',
      onclick: () => onPick(k),
    }, h('span', { class: 'dot', style: { background: `var(${purposeColorVar(k)})` } }), PURPOSES[k].label)));
}

function numField({ id, label, value, unit = 'მ', placeholder, onCommit, digits = 2, hint }) {
  const inp = h('input', {
    id,
    class: 'num-in',
    type: 'text',
    inputmode: 'decimal',
    value: value === null || value === undefined || value === '' ? '' : fmtNum(value, digits).replace(/ /g, ''),
    placeholder: placeholder || '',
    autocomplete: 'off',
  });
  const shown = inp.value;
  // onCommit returns false when the value was rejected; the field then shows the value
  // that is actually in use again instead of keeping text that was never applied.
  const commitVal = () => {
    const raw = inp.value.trim();
    if (onCommit(raw === '' ? null : parseNum(raw), inp) === false) inp.value = shown;
  };
  inp.addEventListener('change', commitVal);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  return h('div', { class: 'field' },
    h('label', { for: id }, label),
    h('div', { class: 'field-in' }, inp, unit ? h('span', { class: 'unit' }, unit) : null),
    hint ? h('div', { class: 'field-hint' }, hint) : null);
}

function confirmButton(label, confirmLabel, onConfirm) {
  const b = h('button', { type: 'button', class: 'btn btn-ghost btn-sm danger' }, icon('trash', 16), label);
  let armed = false;
  let t = null;
  b.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      b.classList.add('armed');
      b.lastChild.textContent = confirmLabel;
      t = setTimeout(() => {
        armed = false;
        b.classList.remove('armed');
        b.lastChild.textContent = label;
      }, 3000);
      return;
    }
    clearTimeout(t);
    onConfirm();
  });
  return b;
}

export function createInspector({ el, onUpload, onStartScale, onNext, onOpenLibrary, onShow3D }) {
  function render() {
    clear(el);
    const p = current();
    const sel = state.selection;
    if (sel?.type === 'room') {
      const room = p.rooms.find((r) => r.id === sel.id);
      if (room) return renderRoom(p, room);
    }
    if (sel?.type === 'furniture') {
      const f = (p.furniture || []).find((x) => x.id === sel.id);
      if (f) return renderFurniture(p, f);
    }
    if (sel?.type === 'opening') {
      const op = p.openings.find((o) => o.id === sel.id);
      if (op) return renderOpening(p, op);
    }
    return renderApartment(p);
  }

  // ---------------------------------------------------------------- apartment
  function renderApartment(p) {
    const name = h('input', { id: 'proj-name', class: 'text-in', value: p.name, autocomplete: 'off' });
    name.addEventListener('change', () => commit({ ...p, name: name.value.trim() || 'ჩემი ბინა' }));

    const plan = p.plan;
    let imageBlock;
    if (state.planImage && plan) {
      const op = h('input', { id: 'plan-opacity', type: 'range', min: '0.1', max: '1', step: '0.05', value: String(plan.opacity ?? 0.6) });
      op.addEventListener('input', () => {
        state.project = { ...state.project, plan: { ...state.project.plan, opacity: parseFloat(op.value) } };
        state.draft = null;
        emit('opacity');
      });
      op.addEventListener('change', () => commit({ ...current() }, { history: false }));
      imageBlock = h('section', { class: 'card-sec' },
        h('div', { class: 'sec-title' }, 'დეველოპერის გეგმა'),
        h('div', { class: `status ${plan.calibrated ? 'ok' : 'warn'}` },
          plan.calibrated
            ? `მასშტაბი: 1 მ = ${fmtNum(1 / plan.mPerPx, 0)} პიქსელი`
            : 'მასშტაბი ჯერ არ არის დაყენებული. მიუთითე ერთი ცნობილი ზომა.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: `btn btn-sm ${plan.calibrated ? '' : 'btn-accent'}`, onclick: onStartScale }, icon('scale', 16), 'მასშტაბის დაყენება'),
          h('button', { type: 'button', class: 'btn btn-sm', onclick: () => commit({ ...p, plan: { ...plan, visible: plan.visible === false } }, { history: false }) }, icon('eye', 16), plan.visible === false ? 'ჩვენება' : 'დამალვა'),
        ),
        h('label', { class: 'field', for: 'plan-opacity' }, h('span', null, 'გამჭვირვალობა'), op),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: onUpload }, icon('upload', 16), 'სხვა გეგმის ატვირთვა'),
          confirmButton('სურათის წაშლა', 'დაადასტურე წაშლა', () => {
            setPlanImage(null);
            commit({ ...p, plan: null }, { history: false });
          }),
        ),
      );
    } else {
      imageBlock = h('section', { class: 'card-sec upload-sec' },
        h('div', { class: 'sec-title' }, 'დეველოპერის გეგმა'),
        h('p', { class: 'muted' }, 'ატვირთე ბინის გეგმა (სურათი ან PDF) და ოთახები ზედ შემოხაზე. გეგმის გარეშეც შეგიძლია ხაზვა ბადეზე.'),
        h('button', { type: 'button', class: 'btn btn-accent', onclick: onUpload }, icon('upload', 18), 'გეგმის ატვირთვა'),
      );
    }

    const heightField = numField({
      id: 'ceil-h',
      label: 'ჭერის სიმაღლე',
      value: p.height ?? DEFAULT_HEIGHT,
      hint: 'სუფთა იატაკიდან ჭერამდე. ცალკეულ ოთახში სხვაგვარად შეიძლება მიუთითო.',
      onCommit: (v, inp) => {
        if (!(v >= 2 && v <= 6)) {
          toast('ჭერის სიმაღლე 2–6 მეტრის ფარგლებში უნდა იყოს.', 'warn');
          inp.value = fmtNum(p.height, 2);
          return;
        }
        commit({ ...p, height: v });
      },
    });

    const info = openingHosts(p);
    const rows = p.rooms.map((r) => h('button', {
      type: 'button',
      class: 'room-row',
      onclick: () => setSelection({ type: 'room', id: r.id }),
    },
    h('span', { class: 'dot', style: { background: `var(${purposeColorVar(r.purpose)})` } }),
    h('span', { class: 'room-name' }, roomLabel(r, p.rooms)),
    h('span', { class: 'num' }, fmtArea(G.area(r.points)))));
    const interior = p.rooms.filter((r) => !PURPOSES[r.purpose]?.outdoor).reduce((s, r) => s + G.area(r.points), 0);
    const outdoor = p.rooms.filter((r) => PURPOSES[r.purpose]?.outdoor).reduce((s, r) => s + G.area(r.points), 0);

    const warnings = checks(p, info);

    add(el, 
      h('div', { class: 'insp-head' }, h('h2', null, 'ბინა')),
      h('div', { class: 'field' }, h('label', { for: 'proj-name' }, 'პროექტის სახელი'), name),
      imageBlock,
      heightField,
      h('section', { class: 'card-sec' },
        h('div', { class: 'sec-title' }, `ოთახები (${p.rooms.length})`),
        rows.length ? h('div', { class: 'room-list' }, rows) : h('p', { class: 'muted' }, 'ჯერ არცერთი ოთახი არ არის.'),
        p.rooms.length ? h('div', { class: 'totals' },
          h('div', null, h('span', null, 'საცხოვრებელი ფართი'), h('b', { class: 'num' }, fmtArea(interior))),
          outdoor > 0 ? h('div', null, h('span', null, 'აივანი / ლოჯია'), h('b', { class: 'num' }, fmtArea(outdoor))) : null,
        ) : null),
      warnings.length ? h('section', { class: 'card-sec warn-sec' },
        h('div', { class: 'sec-title' }, 'შესამოწმებელი'),
        h('ul', { class: 'warn-list' }, warnings.map((w) => h('li', null, w.room
          ? h('button', { type: 'button', class: 'link', onclick: () => setSelection({ type: w.kind || 'room', id: w.id || w.room.id }) }, w.text)
          : w.text)))) : null,
      p.rooms.length ? h('button', { type: 'button', class: 'btn btn-accent btn-block', onclick: onNext }, 'მასალების არჩევა', icon('chevron', 18)) : null,
    );
  }

  function checks(p, info) {
    const out = [];
    for (const r of p.rooms) {
      if (r.unassigned) out.push({ room: r, text: `${roomLabel(r, p.rooms)}: მიუთითე დანიშნულება` });
    }
    for (let i = 0; i < p.rooms.length; i++) {
      for (let j = i + 1; j < p.rooms.length; j++) {
        if (G.polygonsOverlap(p.rooms[i].points, p.rooms[j].points)) {
          out.push({ room: p.rooms[i], text: `${roomLabel(p.rooms[i], p.rooms)} და ${roomLabel(p.rooms[j], p.rooms)} ერთმანეთს ფარავს` });
        }
      }
    }
    const linked = new Set(info.links.map((l) => l.opId));
    for (const o of p.openings) {
      if ((o.type === 'door' || o.type === 'arch') && !linked.has(o.id)) {
        const r = p.rooms.find((x) => x.id === o.roomId);
        out.push({ room: r, kind: 'opening', id: o.id, text: `${roomLabel(r, p.rooms)}: კარი არცერთ ოთახთან არ აკავშირებს (შეამოწმე კედელი)` });
      }
    }
    if (p.plan && state.planImage && !p.plan.calibrated) out.push({ text: 'გეგმის მასშტაბი არ არის დაყენებული — ზომები არაზუსტი იქნება.' });
    // furniture: overlaps and pieces in walls first, then missing space; at most six lines
    const iss = analyzeFurniture(p);
    const bad = (p.furniture || [])
      .map((f) => ({ f, list: iss.get(f.id) || [] }))
      .filter((x) => x.list.length)
      .sort((a, b) => (issueLevel(a.list) === 'error' ? 0 : 1) - (issueLevel(b.list) === 'error' ? 0 : 1));
    for (const { f, list } of bad.slice(0, 6)) {
      const r = p.rooms.find((x) => x.id === f.roomId);
      out.push({ room: r || true, kind: 'furniture', id: f.id, text: `${r ? `${roomLabel(r, p.rooms)}: ` : ''}${furnitureLabel(f)} — ${list[0].text}` });
    }
    if (bad.length > 6) out.push({ text: `და კიდევ ${bad.length - 6} ავეჯის შენიშვნა` });
    return out;
  }

  // ---------------------------------------------------------------- room
  function renderRoom(p, room) {
    const m = measureRoom(room, p);
    const purpose = PURPOSES[room.purpose] || PURPOSES.other;
    const es = G.edges(room.points);
    const info = openingHosts(p);

    const nameIn = h('input', { id: 'room-name', class: 'text-in', value: room.name || '', placeholder: purpose.label, autocomplete: 'off' });
    nameIn.addEventListener('change', () => commit(updateRoom(current(), room.id, { name: nameIn.value.trim() })));

    const walls = h('div', { class: 'wall-list' }, es.map((e) => {
      const ops = info.hosts.get(`${room.id}:${e.i}`) || [];
      const inp = h('input', { id: `wall-${e.i}`, class: 'num-in', type: 'text', inputmode: 'decimal', value: fmtNum(e.len, 2).replace(/ /g, ''), autocomplete: 'off', 'aria-label': `კედელი ${e.i + 1}, სიგრძე` });
      inp.addEventListener('change', () => {
        const v = parseNum(inp.value);
        const cur = current();
        const r = cur.rooms.find((x) => x.id === room.id);
        const pts = v > 0 ? G.setEdgeLength(r.points, e.i, v) : null;
        if (!pts) {
          toast('ასეთი სიგრძით ოთახის ფორმა ირღვევა. სცადე სხვა კედელი ან გადაათრიე კუთხე.', 'warn');
          inp.value = fmtNum(e.len, 2);
          return;
        }
        commit(withRoomPoints(cur, room.id, pts));
      });
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') inp.blur(); });
      const row = h('div', { class: 'wall-row' },
        h('span', { class: 'wall-n' }, String(e.i + 1)),
        h('span', { class: 'wall-desc' }, ops.length ? ops.map((it) => OPENING_TYPES[it.op.type].short).join(', ') : 'კედელი'),
        h('span', { class: 'field-in' }, inp, h('span', { class: 'unit' }, 'მ')));
      row.addEventListener('mouseenter', () => setHoverEdge({ roomId: room.id, edge: e.i }));
      row.addEventListener('mouseleave', () => setHoverEdge(null));
      inp.addEventListener('focus', () => setHoverEdge({ roomId: room.id, edge: e.i }));
      inp.addEventListener('blur', () => setHoverEdge(null));
      return row;
    }));

    const ownHeight = room.height !== null && room.height !== undefined;
    const heightBox = h('div', { class: 'sub' },
      h('label', { class: 'check' },
        h('input', {
          type: 'checkbox',
          id: 'room-own-h',
          checked: ownHeight,
          onchange: (ev) => commit(updateRoom(current(), room.id, { height: ev.target.checked ? (p.height ?? DEFAULT_HEIGHT) : null })),
        }),
        ` განსხვავებული ჭერის სიმაღლე (ბინაში ${fmtNum(p.height ?? DEFAULT_HEIGHT, 2)} მ)`),
      ownHeight ? numField({
        id: 'room-h', label: 'ჭერის სიმაღლე ამ ოთახში', value: room.height,
        onCommit: (v) => {
          if (!(v >= 2 && v <= 6)) {
            toast('ჭერის სიმაღლე 2–6 მეტრის ფარგლებში უნდა იყოს.', 'warn');
            return false;
          }
          commit(updateRoom(current(), room.id, { height: v }));
          return true;
        },
      }) : null);

    let extra = null;
    if (purpose.wet) {
      extra = h('section', { class: 'card-sec' },
        h('div', { class: 'sec-title' }, 'კედლის ფილა'),
        numField({
          id: 'tile-h', label: 'ფილის სიმაღლე', value: room.tileHeight, placeholder: 'ჭერამდე',
          hint: 'ცარიელი ნიშნავს ჭერამდე. ფილის ზემოთ კედელი შეიღებება.',
          onCommit: (v) => {
            if (v === null) commit(updateRoom(current(), room.id, { tileHeight: null }));
            else if (v > 0.3 && v <= roomHeight(room, p)) commit(updateRoom(current(), room.id, { tileHeight: v }));
            else {
              toast(`ფილის სიმაღლე 0.3 მ-დან ჭერის სიმაღლემდე (${fmtNum(roomHeight(room, p), 2)} მ) უნდა იყოს.`, 'warn');
              return false;
            }
            return true;
          },
        }),
        h('div', { class: 'kv' }, h('span', null, 'ფილა კედლებზე'), h('b', { class: 'num' }, fmtArea(m.wallTileArea))),
        h('div', { class: 'kv' }, h('span', null, 'ჰიდროიზოლაცია'), h('b', { class: 'num' }, fmtArea(m.waterproofArea))));
    }
    if (purpose.kitchen) {
      const runs = kitchenRuns(room, p);
      // Cabinet runs are furniture; these switches add or remove a run along a wall.
      const runsOn = (cur, i) => kitchenRuns(cur.rooms.find((x) => x.id === room.id), cur).filter((r) => r.edge === i);
      extra = h('section', { class: 'card-sec' },
        h('div', { class: 'sec-title' }, 'სამზარეულოს ავეჯი'),
        h('p', { class: 'muted small' }, 'მონიშნე კედლები, რომლებზეც ქვედა კარადები და სამუშაო ზედაპირი დგას. გეგმაზე კარადები სხვა ავეჯივით გადაიტანება და ზომა ეცვლება.'),
        h('div', { class: 'run-list' }, es.map((e) => {
          const run = runs.find((r) => r.edge === e.i);
          const box = h('input', {
            type: 'checkbox',
            id: `run-${e.i}`,
            checked: !!run,
            onchange: (ev) => {
              const cur = current();
              const r = cur.rooms.find((x) => x.id === room.id);
              if (ev.target.checked) {
                commit(addFurniture(cur, fitRun(cur, r, { edge: e.i, start: 0, length: Math.min(e.len, 3.6) })));
              } else {
                const ids = new Set(runsOn(cur, e.i).map((x) => x.id));
                commit({ ...cur, furniture: cur.furniture.filter((f) => !ids.has(f.id)) });
              }
            },
          });
          const len = h('input', { id: `run-len-${e.i}`, class: 'num-in', type: 'text', inputmode: 'decimal', disabled: !run, value: run ? fmtNum(run.length, 2) : '', 'aria-label': `კედელი ${e.i + 1}, ავეჯის სიგრძე` });
          len.addEventListener('change', () => {
            const v = parseNum(len.value);
            const cur = current();
            const [r0] = runsOn(cur, e.i);
            if (!(v > 0.2) || !r0) return;
            const f = cur.furniture.find((x) => x.id === r0.id);
            const L = Math.min(v, e.len - r0.start);
            // keep the start of the run, grow or shrink along the wall
            const t = r0.start + L / 2;
            commit(updateFurniture(cur, f.id, { w: L, x: e.a.x + e.ux * t + e.nx * f.d / 2, y: e.a.y + e.uy * t + e.ny * f.d / 2 }));
          });
          const row = h('div', { class: 'run-row' },
            h('label', { class: 'check', for: `run-${e.i}` }, box, ` კედელი ${e.i + 1}`, h('span', { class: 'muted num' }, ` · ${fmtNum(e.len, 2)} მ`)),
            h('span', { class: 'field-in' }, len, h('span', { class: 'unit' }, 'მ')));
          row.addEventListener('mouseenter', () => setHoverEdge({ roomId: room.id, edge: e.i }));
          row.addEventListener('mouseleave', () => setHoverEdge(null));
          return row;
        })),
        h('div', { class: 'kv' }, h('span', null, 'სამუშაო ზედაპირი'), h('b', { class: 'num' }, fmtArea(m.countertopArea))),
        h('div', { class: 'kv' }, h('span', null, 'ფარტუხი'), h('b', { class: 'num' }, fmtArea(m.backsplashArea))));
    }

    // furniture standing in the room
    const iss = analyzeFurniture(p);
    const items = (p.furniture || []).filter((f) => f.roomId === room.id);
    const furnSec = h('section', { class: 'card-sec' },
      h('div', { class: 'sec-title' }, `ავეჯი (${items.length})`),
      items.length ? h('div', { class: 'room-list' }, items.map((f) => {
        const level = issueLevel(iss.get(f.id));
        return h('button', { type: 'button', class: 'room-row', onclick: () => setSelection({ type: 'furniture', id: f.id }) },
          h('span', { class: `f-dot${level ? ` ${level}` : ''}`, 'aria-hidden': 'true' }),
          h('span', { class: 'room-name' }, furnitureLabel(f), level ? h('span', { class: 'sr-only' }, ' (შენიშვნა)') : null),
          h('span', { class: 'num' }, `${cm(f.w)} × ${cm(f.d)}`));
      })) : h('p', { class: 'muted small' }, 'ოთახში ჯერ ავეჯი არ არის. დაამატე, რომ 3D-ში და AI-სთვის ოთახი სრულად გამოჩნდეს.'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-sm btn-accent', onclick: () => onOpenLibrary?.(room.id) }, icon('plus', 16), 'ავეჯის დამატება'),
        items.length ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => onShow3D?.() }, icon('cube', 16), '3D ხედი') : null));

    add(el, 
      h('div', { class: 'insp-head' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm back', onclick: () => setSelection(null), 'aria-label': 'ბინის პარამეტრებზე დაბრუნება' }, '← ბინა'),
        confirmButton('წაშლა', 'დაადასტურე', () => { commit(deleteRoom(current(), room.id)); setSelection(null); })),
      h('h2', { class: 'room-title' }, roomLabel(room, p.rooms)),
      h('div', { class: 'big-stat' },
        h('div', null, h('span', { class: 'lbl' }, 'იატაკის ფართი'), h('b', { class: 'num' }, fmtArea(m.area))),
        h('div', null, h('span', { class: 'lbl' }, 'პერიმეტრი'), h('b', { class: 'num' }, fmtLen(m.perimeter))),
        purpose.outdoor ? null : h('div', null, h('span', { class: 'lbl' }, 'კედლები, ღიობების გარეშე'), h('b', { class: 'num' }, fmtArea(m.wallNet)))),
      h('section', { class: 'card-sec' },
        h('div', { class: 'sec-title' }, 'დანიშნულება'),
        purposeGrid(room.purpose, (k) => commit(setRoomPurpose(current(), room, k)))),
      h('div', { class: 'field' }, h('label', { for: 'room-name' }, 'სახელი (არასავალდებულო)'), nameIn),
      h('section', { class: 'card-sec' },
        h('div', { class: 'sec-title' }, 'კედლები'),
        h('p', { class: 'muted small' }, 'ჩაწერე ზუსტი სიგრძე გეგმიდან. მომდევნო კედელი გადაიწევს, კუთხეები შენარჩუნდება.'),
        walls),
      furnSec,
      extra,
      purpose.outdoor ? null : heightBox,
    );
  }

  // ---------------------------------------------------------------- furniture
  function renderFurniture(p, f) {
    const def = FURNITURE[f.type];
    const room = p.rooms.find((r) => r.id === f.roomId);
    const list = analyzeFurniture(p).get(f.id) || [];
    const id = f.id;
    const sizeField = (fid, label, key, lo, hi) => numField({
      id: fid, label, value: f[key] * 100, unit: 'სმ', digits: 0,
      onCommit: (v) => {
        if (!(v >= lo && v <= hi)) {
          toast(`${label}: ${lo}–${hi} სმ`, 'warn');
          return false;
        }
        commit(resizeFurniture(current(), id, { [key]: v / 100 }));
        return true;
      },
    });
    const presets = def.presets || [];
    const toggle = (fid, label, key) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', id: fid, checked: state.snap[key], onchange: (ev) => setSnap({ [key]: ev.target.checked }) }), ` ${label}`);

    add(el,
      h('div', { class: 'insp-head' },
        h('button', {
          type: 'button', class: 'btn btn-ghost btn-sm back',
          onclick: () => setSelection(room ? { type: 'room', id: room.id } : null),
        }, `← ${room ? roomLabel(room, p.rooms) : 'ბინა'}`),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm danger', id: 'f-delete', onclick: () => {
          commit(deleteFurniture(current(), id));
          setSelection(room ? { type: 'room', id: room.id } : null);
          toast(`${def.label} წაიშალა. დაბრუნება — Ctrl+Z`, 'info');
        } }, icon('trash', 16), 'წაშლა')),
      h('h2', { class: 'room-title' }, def.label),
      h('p', { class: 'muted' }, room ? `${roomLabel(room, p.rooms)} · ${cm(f.w)} × ${cm(f.d)} სმ, სიმაღლე ${cm(f.h)} სმ` : 'ოთახის გარეთ'),
      list.length ? h('section', { class: 'card-sec warn-sec' },
        h('div', { class: 'sec-title' }, 'შესამოწმებელი'),
        h('ul', { class: 'warn-list' }, list.map((w) => h('li', { class: w.level }, w.other
          ? h('button', { type: 'button', class: 'link', onclick: () => setSelection({ type: 'furniture', id: w.other }) }, w.text)
          : w.text)))) : null,
      h('section', { class: 'card-sec' },
        h('div', { class: 'sec-title' }, 'ზომა'),
        presets.length ? h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'გავრცელებული ზომები' }, presets.map(([w, d]) => {
          const on = Math.abs(f.w - w) < 0.005 && Math.abs(f.d - d) < 0.005;
          return h('button', {
            type: 'button', class: `seg-btn${on ? ' on' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false',
            onclick: () => commit(resizeFurniture(current(), id, { w, d })),
          }, `${cm(w)}×${cm(d)}`);
        })) : null,
        h('div', { class: 'field-grid field-grid-3' },
          sizeField('f-w', 'სიგანე', 'w', 20, 1000),
          sizeField('f-d', 'სიღრმე', 'd', 20, 1000),
          sizeField('f-h', 'სიმაღლე', 'h', 5, 400))),
      h('section', { class: 'card-sec' },
        h('div', { class: 'sec-title' }, 'მობრუნება და ადგილი'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-sm', id: 'f-rot-l', 'aria-label': 'მობრუნება 90° საათის ისრის საწინააღმდეგოდ', onclick: () => commit(rotateFurniture(current(), id, -90)) }, icon('rotateL', 16), '90°'),
          h('button', { type: 'button', class: 'btn btn-sm', id: 'f-rot-r', 'aria-label': 'მობრუნება 90° საათის ისრის მიმართულებით', onclick: () => commit(rotateFurniture(current(), id, 90)) }, icon('rotate', 16), '90°'),
          numField({
            id: 'f-rot', label: 'კუთხე', value: f.rot, unit: '°', digits: 0,
            onCommit: (v) => {
              if (!Number.isFinite(v)) return false;
              commit(updateFurniture(current(), id, { rot: v }));
              return true;
            },
          })),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-sm', id: 'f-wall', onclick: () => {
            const next = alignToWall(current(), (current().furniture || []).find((x) => x.id === id));
            if (next) commit(updateFurniture(current(), id, next));
            else toast('ამ ნივთისთვის საკმარისად გრძელი კედელი ვერ ვიპოვე.', 'warn');
          } }, icon('wall', 16), 'კედელთან მიდგმა'),
          h('button', { type: 'button', class: 'btn btn-sm', id: 'f-dup', onclick: () => {
            const r = duplicateFurniture(current(), id);
            commit(r.project);
            setSelection({ type: 'furniture', id: r.id });
          } }, icon('copy', 16), 'ასლი')),
        h('div', { class: 'snap-row' },
          toggle('f-snap-walls', 'კედლებზე მიკვრა', 'walls'),
          toggle('f-snap-grid', 'ბადე 10 სმ', 'grid')),
        h('p', { class: 'muted small' }, 'გეგმაზე გადაათრიე ნივთი, წინა მრგვალი სახელურით მოაბრუნე, გვერდის კვადრატებით ზომა შეცვალე.',
          h('span', { class: 'kbd-only' }, ' ისრები — 1 სმ, Ctrl+D — ასლი.'))),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => onOpenLibrary?.(room?.id) }, icon('plus', 16), 'სხვა ავეჯის დამატება'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => onShow3D?.() }, icon('cube', 16), '3D ხედი')),
    );
  }

  // ---------------------------------------------------------------- opening
  function renderOpening(p, op) {
    const room = p.rooms.find((r) => r.id === op.roomId);
    const t = OPENING_TYPES[op.type];
    const e = G.edge(room.points, op.edge);
    const info = openingHosts(p);
    const link = info.links.find((l) => l.opId === op.id);
    const other = link ? p.rooms.find((r) => r.id === link.to) : null;
    const kinds = Object.entries(OPENING_TYPES).filter(([, v]) => v.kind === t.kind);
    const set = (patch) => commit(updateOpening(current(), op.id, patch));
    const wallH = roomHeight(room, p);
    // Rejects values that cannot exist on this wall instead of silently ignoring them.
    const check = (ok, msg, patch) => {
      if (!ok) {
        toast(msg, 'warn');
        return false;
      }
      set(patch);
      return true;
    };

    add(el, 
      h('div', { class: 'insp-head' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm back', onclick: () => setSelection(null) }, '← ბინა'),
        confirmButton('წაშლა', 'დაადასტურე', () => { commit(deleteOpening(current(), op.id)); setSelection(null); })),
      h('h2', { class: 'room-title' }, t.label),
      h('p', { class: 'muted' }, other
        ? `${roomLabel(room, p.rooms)} ↔ ${roomLabel(other, p.rooms)}`
        : `${roomLabel(room, p.rooms)} · გარე კედელი`),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'ტიპი' },
        kinds.map(([k, v]) => h('button', {
          type: 'button',
          class: `seg-btn${k === op.type ? ' on' : ''}`,
          role: 'radio',
          'aria-checked': k === op.type ? 'true' : 'false',
          onclick: () => set({ type: k, height: v.height, sill: v.sill, width: k === op.type ? op.width : v.width }),
        }, v.short))),
      h('div', { class: 'field-grid' },
        numField({
          id: 'op-w', label: 'სიგანე', value: op.width,
          onCommit: (v) => check(v >= 0.2 && v <= e.len, `სიგანე 0.2 მ-დან კედლის სიგრძემდე (${fmtNum(e.len, 2)} მ) უნდა იყოს.`, { width: v }),
        }),
        numField({
          id: 'op-h', label: 'სიმაღლე', value: op.height,
          onCommit: (v) => check(v > 0.3 && op.sill + v <= wallH + 1e-9, `სიმაღლე რაფასთან ერთად ჭერს (${fmtNum(wallH, 2)} მ) არ უნდა აღემატებოდეს.`, { height: v }),
        }),
        t.kind === 'window' && op.type === 'window'
          ? numField({
            id: 'op-sill', label: 'რაფის სიმაღლე', value: op.sill,
            onCommit: (v) => check(v >= 0 && v + op.height <= wallH + 1e-9, `რაფა ფანჯარასთან ერთად ჭერს (${fmtNum(wallH, 2)} მ) არ უნდა აღემატებოდეს.`, { sill: v }),
          })
          : null,
        numField({
          id: 'op-off',
          label: 'კუთხიდან',
          value: Math.max(0, op.offset - op.width / 2),
          hint: `კედელი ${op.edge + 1}, ${fmtNum(e.len, 2)} მ`,
          onCommit: (v) => check(v >= 0 && v + op.width <= e.len + 1e-9, `ღიობი კედელს (${fmtNum(e.len, 2)} მ) არ უნდა სცდებოდეს.`, { offset: v + op.width / 2 }),
        })),
      op.type === 'door' ? h('p', { class: 'muted small' }, 'ოთახის კარი შედის ხარჯთაღრიცხვაში. ღიობი და შესასვლელი კარი არ შედის.') : null,
      op.type === 'window' ? h('p', { class: 'muted small' }, 'ფანჯრისთვის რაფა ავტომატურად ითვლება.') : null,
    );
  }

  subscribe((kind) => {
    if (state.step !== 'plan') return;
    if (['project', 'selection', 'image', 'snap'].includes(kind)) {
      const active = document.activeElement;
      const keepId = active && el.contains(active) ? active.id : null;
      render();
      if (keepId) document.getElementById(keepId)?.focus?.();
    }
  });
  return { render };
}
