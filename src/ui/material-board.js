// Material board: every finish chosen for a room, with where each product comes from and
// how the interior render may use it. Also the export of the AI reference package.
import { current, commit } from './store.js';
import { MATERIALS, priceLabel } from '../core/catalog.js';
import { product, refKind, REF_KINDS, VERIFICATION, AVAILABILITY } from '../core/products.js';
import { roomBoard, apartmentBoard, referencePackage } from '../core/references.js';
import { setRefPrefs } from '../core/finishes.js';
import { roomLabel, PURPOSES } from '../core/model.js';
import { h, add, clear, icon, toast, copyText } from './dom.js';
import { swatch } from './textures.js';

/* global __SITE__ */

const fmtDate = (d) => (d ? d.split('-').reverse().join('.') : '');

// Small labels shown next to a product everywhere: how sure the identity/price is, and
// what kind of picture the renderer gets.
export function provenanceBadges(p, { compact = false } = {}) {
  const v = p.verification.status;
  const kind = refKind(p);
  return h('span', { class: 'prov' },
    h('span', { class: `badge v-${v}`, title: VERIFICATION[v].desc },
      compact ? VERIFICATION[v].short : VERIFICATION[v].label,
      v === 'verified' && !compact ? ` ${fmtDate(p.verification.checked)}` : null),
    compact ? null : h('span', { class: `badge k-${kind}`, title: REF_KINDS[kind].desc }, REF_KINDS[kind].label));
}

// The drawn sample, captioned so it is never mistaken for a photograph.
export function sampleTile(material, size) {
  const sw = swatch(material, size);
  sw.className = 'sw';
  return h('span', { class: 'sample' }, sw, h('span', { class: 'sample-cap' }, 'მიახლოებითი ნიმუში'));
}

function download(name, data) {
  const text = JSON.stringify(data, null, 2);
  if (__SITE__) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    return Promise.resolve(true);
  }
  return copyText(text);
}

const safeName = (s) => (s || 'bina').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);

export async function exportReferences(roomId = null) {
  const p = current();
  const pkg = referencePackage(p, { roomId });
  const room = roomId ? p.rooms.find((r) => r.id === roomId) : null;
  const name = `${safeName(p.name)}${room ? `-${safeName(roomLabel(room, p.rooms))}` : ''}-materials.json`;
  const ok = await download(name, pkg);
  if (__SITE__) toast(`AI-ის რეფერენსები შენახულია: ${pkg.references.length} ზედაპირი.`, 'ok');
  else toast(ok ? 'AI-ის რეფერენსები დაკოპირდა (JSON).' : 'კოპირება ვერ მოხერხდა.', ok ? 'ok' : 'warn');
}

export function createBoard({ onChange, onRender }) {
  const dlg = h('dialog', { class: 'modal board', 'aria-labelledby': 'board-title' });
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  let roomId = null; // null = apartment-wide finishes

  function card(ref, room) {
    const m = MATERIALS[ref.materialId];
    const p = product(ref.materialId);
    const id = ref.identity;
    const orientable = ['along', 'across'].includes(ref.layout.direction) && room && ref.target.surface === 'floor';
    return h('article', { class: `board-card${ref.mandatory ? ' must' : ''}` },
      sampleTile(m, 168),
      h('div', { class: 'board-txt' },
        h('div', { class: 'eyebrow' }, ref.target.surfaceLabel, ref.target.areaM2 ? ` · ${ref.target.areaM2} მ²` : ''),
        h('h3', null, p.name),
        provenanceBadges(p),
        h('dl', { class: 'facts' },
          p.manufacturer ? [h('dt', null, 'მწარმოებელი'), h('dd', null, p.manufacturer)] : null,
          [h('dt', null, 'აღწერა'), h('dd', null, p.description)],
          ref.material.unitSize ? [h('dt', null, 'ზომა'), h('dd', null, ref.material.unitSize)] : null,
          [h('dt', null, 'ფერი, ზედაპირი'), h('dd', null, `${p.color.familyLabel}${p.finish ? `, ${p.finish.label}` : ''} · ${p.pattern.label}`,
            ref.material.colorIsPreference ? h('span', { class: 'muted' }, ' (ფერი შეფერვით, კოდი დასაზუსტებელია)') : null)],
          id ? [h('dt', null, 'მაღაზია'), h('dd', null,
            id.productUrl ? h('a', { href: id.productUrl, target: '_blank', rel: 'noopener noreferrer' }, id.retailer || 'გვერდი', ' ↗') : id.retailer,
            id.retailerCode ? h('span', { class: 'muted' }, ` · კოდი ${id.retailerCode}`) : null)] : null,
          id && id.price ? [h('dt', null, 'ფასი'), h('dd', null, `${priceLabel(m)} · ${id.price.basisLabel}, ${fmtDate(id.price.checked)}`)] : null,
          id ? [h('dt', null, 'მარაგი'), h('dd', null, AVAILABILITY[id.availability.status], id.availability.checked ? ` (${fmtDate(id.availability.checked)})` : '')] : null,
          [h('dt', null, 'ფოტო'), h('dd', null, ref.visual.image ? `ლიცენზირებული (${ref.visual.image.holder})`
            : ref.visual.retailerPage ? 'მხოლოდ მაღაზიის გვერდზე — აქ არ კოპირდება' : 'არ არის; ნიმუში დახატულია')],
          ref.priced ? null : [h('dt', null, 'ხარჯთაღრიცხვა'), h('dd', null, 'არ ითვლება — მზადდება შეკვეთით')]),
        h('div', { class: 'board-ctrl' },
          h('label', { class: 'check' },
            h('input', {
              type: 'checkbox',
              checked: ref.mandatory,
              onchange: (e) => commit(setRefPrefs(current(), room, ref.target.surface, { mandatory: e.target.checked })),
            }),
            ' სავალდებულო რენდერისთვის'),
          orientable ? h('label', { class: 'field-in' }, h('span', { class: 'small muted' }, 'მიმართულება'),
            h('select', {
              class: 'unit-sel',
              'aria-label': `${ref.target.surfaceLabel}: მიმართულება`,
              onchange: (e) => commit(setRefPrefs(current(), room, ref.target.surface, { orientation: e.target.value })),
            },
            [['auto', 'ავტომატური (გრძელი კედლის გასწვრივ)'], ['along', 'გრძელი კედლის გასწვრივ'], ['across', 'გრძელი კედლის განივ']].map(([v, l]) => h('option', { value: v, selected: (current().finish?.refs?.[ref.key]?.orientation || 'auto') === v }, l)))) : null,
          h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { dlg.close(); onChange(room, ref.target.surface); } }, 'შეცვლა'))));
  }

  function render() {
    const p = current();
    const room = roomId ? p.rooms.find((r) => r.id === roomId) : null;
    if (roomId && !room) {
      dlg.close();
      return;
    }
    const refs = room ? roomBoard(p, room) : apartmentBoard(p);
    const counts = refs.reduce((o, r) => ({ ...o, [r.kind]: (o[r.kind] || 0) + 1 }), {});
    clear(dlg);
    add(dlg,
      h('div', { class: 'modal-head' },
        h('div', null, h('p', { class: 'eyebrow' }, 'მასალების დაფა'), h('h2', { id: 'board-title' }, room ? roomLabel(room, p.rooms) : 'მთელი ბინა')),
        h('button', { type: 'button', class: 'btn btn-ghost icon-btn', 'aria-label': 'დახურვა', onclick: () => dlg.close() }, icon('close', 20))),
      h('div', { class: 'modal-body' },
        h('div', { class: 'board-strip', 'aria-hidden': 'true' }, refs.map((r) => { const s = swatch(MATERIALS[r.materialId], 64); s.className = 'sw'; return s; })),
        h('p', { class: 'muted small' },
          Object.entries(REF_KINDS).filter(([k]) => counts[k]).map(([k, v]) => `${v.label}: ${counts[k]}`).join(' · '),
          '. ნიმუშები დახატულია ფერისა და ზომის მიხედვით და არ არის პროდუქტის ფოტო.'),
        refs.length ? h('div', { class: 'board-grid' }, refs.map((r) => card(r, room))) : h('p', null, 'ამ ოთახს მასალები არ აქვს.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-accent', onclick: () => exportReferences(roomId) }, icon('download', 16), room ? 'ამ ოთახის AI რეფერენსები' : 'AI რეფერენსები'),
          room ? h('button', { type: 'button', class: 'btn', onclick: () => exportReferences(null) }, 'მთელი ბინის') : null,
          room && onRender && !PURPOSES[room.purpose]?.outdoor ? h('button', { type: 'button', class: 'btn', onclick: () => { dlg.close(); onRender(room.id); } }, icon('sparkle', 16), 'AI დიზაინის გენერაცია') : null)),
    );
  }

  return {
    open(id) {
      roomId = id;
      render();
      if (!dlg.open) dlg.showModal();
      dlg.querySelector('.icon-btn')?.focus();
    },
    refresh() {
      if (dlg.open) render();
    },
  };
}
