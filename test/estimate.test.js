import test from 'node:test';
import assert from 'node:assert/strict';
import { rectPoints } from '../src/core/geometry.js';
import { makeRoom, emptyProject, sampleProject } from '../src/core/model.js';
import { pick, STYLE_ORDER, TIER_ORDER, MATERIALS, MATERIAL_LIST, SHOPS } from '../src/core/catalog.js';
import { resolveMaterial, setFinish } from '../src/core/finishes.js';
import { computeEstimate } from '../src/core/quantities.js';

const close = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) < eps, `${msg} expected ${b}, got ${a}`);

test('every style gets a fitting default within one budget step', () => {
  for (const style of STYLE_ORDER) {
    for (const tier of TIER_ORDER) {
      for (const cat of ['floor_wood', 'tile_floor', 'tile_wall', 'paint', 'stone', 'door', 'skirting', 'ceiling', 'outdoor', 'sanitary_bath', 'sanitary_wc']) {
        const m = pick(cat, style, tier);
        assert.ok(m, `${cat} ${style} ${tier}`);
        assert.ok(m.styles.includes(style), `${cat} ${style} ${tier} → ${m.id} does not fit the style`);
        const d = Math.abs(TIER_ORDER.indexOf(m.tier) - TIER_ORDER.indexOf(tier));
        assert.ok(d <= 1, `${cat} ${style} ${tier} → ${m.id} is ${m.tier}`);
      }
    }
  }
});

test('every catalog entry is complete and has a source', () => {
  const ids = new Set();
  for (const m of MATERIAL_LIST) {
    assert.ok(!ids.has(m.id), `duplicate ${m.id}`);
    ids.add(m.id);
    assert.ok(m.name && m.cat && m.measure && m.look, m.id);
    // A design preference (e.g. a cabinet front colour) is not a shop product: it must not
    // pretend to have a price or a shop.
    if (m.preference) {
      assert.equal(m.price, null, m.id);
      assert.equal(m.source, undefined, m.id);
      assert.equal(m.measure, 'none', m.id);
      continue;
    }
    assert.ok(m.price > 0, m.id);
    if (m.measure === 'paint' || m.measure === 'pack') assert.ok(m.pack && m.pack.size > 0, m.id);
    if (m.measure === 'paint') assert.ok(m.coverage > 0 && m.coats > 0, m.id);
    assert.ok(m.source && SHOPS[m.source.shop], `${m.id} has no known shop`);
    assert.ok(/^https:\/\//.test(m.source.url), `${m.id} has no link`);
    assert.ok(m.source.checked, `${m.id} has no date`);
  }
});

function bedroomProject() {
  const p = emptyProject();
  p.height = 2.7;
  p.style = 'modern';
  p.tier = 'econ';
  p.rooms = [makeRoom(rectPoints(0, 0, 4, 3), 'bedroom')];
  return p;
}

test('bedroom purchase list, worked by hand', () => {
  const est = computeEstimate(bedroomProject());
  const line = (id) => est.lines.find((l) => l.material.id === id);
  const floor = line('lam_kt502');
  close(floor.need, 12 * 1.07);
  assert.equal(floor.packs, 6);
  close(floor.cost, 6 * 2.374 * 24.5);
  const paint = line('paint_econ_white');
  close(paint.need, (37.8 * 2) / 10 * 1.05);
  assert.equal(paint.packs, 1);
  close(paint.cost, 132.4);
  assert.equal(line('ceil_paint_econ').packs, 1);
  const sk = line('sk_simple');
  close(sk.amount, 14 * 1.08);
  close(sk.cost, 14 * 1.08 * 12);
  assert.equal(line('cons_primer').packs, 1);
  assert.equal(line('cons_putty').packs, 3);
  assert.equal(line('cons_underlay').packs, 13);
  close(line('cons_underlay').cost, 13 * 1.5);
  assert.equal(line('cons_adhesive'), undefined, 'no tiles, no adhesive');
  const sum = est.lines.reduce((s, l) => s + l.cost, 0);
  close(est.total, sum);
});

test('same material in two rooms is rounded up once, not per room', () => {
  const p = bedroomProject();
  p.rooms.push(makeRoom(rectPoints(4.12, 0, 6.12, 1), 'bedroom')); // 2 m²
  const est = computeEstimate(p);
  const floor = est.lines.find((l) => l.material.id === 'lam_kt502');
  close(floor.net.area, 14);
  assert.equal(floor.packs, Math.ceil((14 * 1.07) / 2.374));
  assert.equal(floor.rooms.length, 2);
});

test('tiles are bought as whole tiles', () => {
  const p = bedroomProject();
  p.rooms[0].purpose = 'bathroom';
  const est = computeEstimate(p);
  const floor = est.lines.find((l) => l.material.cat === 'tile_floor');
  const tileArea = floor.material.pack.size;
  close(floor.amount, Math.ceil(floor.need / tileArea - 1e-9) * tileArea);
});

test('whole-apartment and single-room choices', () => {
  let p = bedroomProject();
  p.rooms.push(makeRoom(rectPoints(4.12, 0, 6.12, 3), 'kids'));
  const [a, b] = p.rooms;
  p = setFinish(p, a, 'floor', 'eng_f4e', 'all');
  assert.equal(resolveMaterial(p, b, 'floor').material.id, 'eng_f4e');
  p = setFinish(p, b, 'floor', 'pg_evin', 'room');
  assert.equal(resolveMaterial(p, a, 'floor').material.id, 'eng_f4e');
  assert.equal(resolveMaterial(p, b, 'floor').material.id, 'pg_evin');
  assert.equal(resolveMaterial(p, b, 'floor').source, 'room');
  p = setFinish(p, a, 'floor', 'lam_kt503', 'all');
  assert.equal(resolveMaterial(p, b, 'floor').material.id, 'lam_kt503');
  p = setFinish(p, b, 'floor', 'pg_evin', 'room');
  const est = computeEstimate(p);
  const adh = est.lines.find((l) => l.material.id === 'cons_adhesive');
  close(adh.need, 2 * 3 * 5.0);
});

test('bathroom brings tiles, adhesive, waterproofing and a sanitary set', () => {
  const p = emptyProject();
  p.height = 2.7;
  p.style = 'scandi';
  p.tier = 'mid';
  p.rooms = [makeRoom(rectPoints(0, 0, 2, 2.5), 'bathroom')];
  const est = computeEstimate(p);
  const ids = est.lines.map((l) => l.material.id);
  for (const id of ['pg_evin', 'wt_void_bone', 'cons_adhesive', 'cons_grout', 'cons_waterproof', 'san_bath_mid', 'st_hierapolis']) {
    assert.ok(ids.includes(id), `${id} missing from ${ids.join(', ')}`);
  }
  const wp = est.lines.find((l) => l.material.id === 'cons_waterproof');
  close(wp.need, (5 + 9 * 0.2) * 3.0);
  assert.equal(wp.packs, 1);
});

test('sample apartment estimate is complete and finite in every style and budget', () => {
  for (const style of STYLE_ORDER) {
    for (const tier of TIER_ORDER) {
      const p = sampleProject();
      p.style = style;
      p.tier = tier;
      const est = computeEstimate(p);
      assert.ok(Number.isFinite(est.total) && est.total > 0, `${style}/${tier}`);
      for (const l of est.lines) {
        assert.ok(Number.isFinite(l.cost) && l.cost >= 0, `${l.material.id}`);
      }
      const cats = new Set(est.lines.map((l) => l.material.cat));
      for (const c of ['floor_wood', 'tile_floor', 'tile_wall', 'paint', 'ceiling', 'stone', 'door', 'skirting', 'sanitary_bath', 'sanitary_wc', 'outdoor']) {
        assert.ok(cats.has(c), `${style}/${tier} lacks ${c}`);
      }
    }
  }
  assert.ok(MATERIALS.cons_adhesive);
});

test('budget order holds on the sample apartment', () => {
  for (const style of STYLE_ORDER) {
    const totals = TIER_ORDER.map((tier) => {
      const p = sampleProject();
      p.style = style;
      p.tier = tier;
      return computeEstimate(p).total;
    });
    assert.ok(totals[0] < totals[1] && totals[1] < totals[2], `${style}: ${totals.map(Math.round).join(' / ')}`);
  }
});
