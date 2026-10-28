// Stage 04: product identity, provenance, the material board and the AI reference package.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, MATERIAL_LIST, SHOPS } from '../src/core/catalog.js';
import {
  PRODUCTS, VERIFIED, IMAGES, validateImage, refKind, REF_KINDS, VERIFICATION, ASSET_PREFIX, product,
} from '../src/core/products.js';
import { referencePackage, roomBoard, chosenProducts, REF_FORMAT } from '../src/core/references.js';
import { setFinish, setRefPrefs, refPrefs, surfacesForCat } from '../src/core/finishes.js';
import { computeEstimate } from '../src/core/quantities.js';
import { emptyProject, makeRoom, sampleProject, migrateProject } from '../src/core/model.js';
import { rectPoints } from '../src/core/geometry.js';
import { deleteRoom } from '../src/core/ops.js';

const TODAY = '2026-10-28';
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');

// ------------------------------------------------------------------ provenance
test('every catalog entry has a stable, unique product id and a product record', () => {
  for (const m of MATERIAL_LIST) {
    assert.match(m.id, /^[a-z0-9_]+$/, m.id);
    const p = PRODUCTS[m.id];
    assert.ok(p, m.id);
    assert.equal(p.id, m.id);
    assert.ok(VERIFICATION[p.verification.status], m.id);
    assert.ok(REF_KINDS[refKind(p)], m.id);
    assert.ok(surfacesForCat(m.cat).length > 0 || m.cat === 'consumable', `${m.id} fits no surface`);
  }
  assert.equal(Object.keys(PRODUCTS).length, MATERIAL_LIST.length);
});

test('verified records: evidence matches the catalog and the shop page', () => {
  const ids = Object.keys(VERIFIED);
  assert.ok(ids.length >= 5, 'sample verified records exist');
  for (const id of ids) {
    const m = MATERIALS[id];
    const ev = VERIFIED[id];
    const p = PRODUCTS[id];
    assert.ok(m, `${id} is in the catalog`);
    assert.equal(p.verification.status, 'verified', id);
    assert.match(ev.checked, /^\d{4}-\d{2}-\d{2}$/, id);
    assert.ok(ev.checked <= TODAY, `${id}: verification date is not in the future`);
    assert.equal(ev.price, m.price, `${id}: verified price equals the catalog price`);
    assert.equal(ev.currency, 'GEL', id);
    assert.ok(ev.retailerCode, `${id}: shop code recorded`);
    assert.ok(ev.fields && ev.fields.name, `${id}: page fields recorded`);
    assert.ok(/^https:\/\//.test(m.source.url), id);
    assert.equal(hostOf(m.source.url), hostOf(SHOPS[m.source.shop].url), `${id}: link is on the shop's own site`);
    assert.equal(p.availability.status, ev.availability, id);
    assert.equal(p.availability.checked, ev.checked, id);
  }
});

test('nothing is verified, in stock or photographed without evidence', () => {
  for (const p of Object.values(PRODUCTS)) {
    if (!VERIFIED[p.id]) {
      assert.notEqual(p.verification.status, 'verified', p.id);
      assert.equal(p.availability.status, 'unknown', `${p.id}: stock was never checked`);
      assert.equal(p.availability.checked, null, p.id);
      assert.equal(p.retailerCode, null, `${p.id}: no shop code without a page read`);
    }
    if (p.image) assert.deepEqual(validateImage(p.image), [], p.id);
    else assert.notEqual(refKind(p), 'product-image', p.id);
    assert.equal(p.swatch.synthetic, true, `${p.id}: on-screen sample is labelled as drawn`);
    assert.equal(p.color.approximate, true, p.id);
  }
  for (const [id, img] of Object.entries(IMAGES)) assert.deepEqual(validateImage(img), [], id);
});

test('no retailer image is copied or hot-linked anywhere in the product data', () => {
  const text = JSON.stringify({ PRODUCTS, MATERIALS });
  assert.doesNotMatch(text, /\.(jpe?g|png|webp|gif)(["?#]|$)/i, 'no image file URL');
  assert.doesNotMatch(text, /\/upload\/products\//, 'no retailer upload path');
  for (const p of Object.values(PRODUCTS)) {
    if (p.retailerPhoto) {
      assert.equal(p.retailerPhoto.linkOnly, true, p.id);
      assert.equal(p.retailerPhoto.pageUrl, p.sourceUrl, `${p.id}: points to the product page, not an image`);
    }
  }
});

test('image records need a local path, a licence, a holder and a date', () => {
  const ok = { path: `${ASSET_PREFIX}lam_kt502.jpg`, license: 'permission', holder: 'Kastamonu Entegre', checked: '2026-10-28', permissionRef: 'email 2026-10-28' };
  assert.deepEqual(validateImage(ok), []);
  assert.deepEqual(validateImage({ ...ok, license: 'own', permissionRef: undefined }), []);
  const bad = [
    { ...ok, path: 'https://citadeli.com/upload/products/y8oTpHhGpFwugDJx.png' }, // retailer server
    { ...ok, path: `${ASSET_PREFIX}../secret.jpg` },
    { ...ok, path: `${ASSET_PREFIX}x.svg` },
    { ...ok, license: 'found-online' },
    { ...ok, holder: '' },
    { ...ok, checked: 'soon' },
    { ...ok, permissionRef: undefined },
    null,
  ];
  for (const b of bad) assert.ok(validateImage(b).length > 0, JSON.stringify(b));
});

test('source kinds decide the level: category pages are indicative, sets are estimates', () => {
  const lvl = (id) => PRODUCTS[id].verification.status;
  assert.equal(lvl('st_juliet'), 'indicative'); // Zodi quartz category page
  assert.equal(lvl('eng_f4e'), 'indicative'); // collection page, "from" price
  assert.equal(lvl('sk_greece'), 'indicative'); // recorded with another profile's page
  assert.equal(lvl('san_bath_mid'), 'estimate'); // assembled set
  assert.equal(lvl('ceil_gypsum'), 'estimate'); // calculated system
  assert.equal(lvl('st_acrylic'), 'estimate'); // article
  assert.equal(lvl('wt_metro'), 'listed'); // exact product page, not re-read
  assert.equal(lvl('pg_jambo'), 'listed');
  assert.equal(PRODUCTS.pg_jambo.price.basis, 'discounted');
  assert.equal(PRODUCTS.eng_f4e.price.basis, 'from');
  assert.equal(PRODUCTS.san_bath_mid.price.basis, 'computed');
});

test('the corrected Step-Latex price: white 200 ₾, tinting base 180 ₾ with the colour as a preference', () => {
  assert.equal(MATERIALS.paint_mid_white.price, 200);
  assert.equal(PRODUCTS.paint_mid_white.verification.status, 'verified');
  assert.equal(VERIFIED.paint_mid_white.fields.name, 'STEP-LATEX HIGH LEVEL WHITE 10LT');
  for (const id of ['paint_mid_sage', 'paint_mid_warm', 'paint_mid_graphite']) {
    assert.equal(MATERIALS[id].price, 180, id);
    assert.equal(VERIFIED[id].base, true, `${id} is the tinting base`);
  }
});

test('design preferences (cabinet fronts) have no price, no shop and stay out of the purchase list', () => {
  const prefs = MATERIAL_LIST.filter((m) => m.cat === 'cabinet_front');
  assert.ok(prefs.length >= 5);
  const p = sampleProject();
  const est = computeEstimate(p);
  for (const m of prefs) {
    const pr = PRODUCTS[m.id];
    assert.equal(pr.verification.status, 'preference', m.id);
    assert.equal(refKind(pr), 'preference', m.id);
    assert.equal(pr.price, null, m.id);
    assert.equal(pr.retailer, null, m.id);
    assert.ok(!est.lines.some((l) => l.material.id === m.id), `${m.id} is not bought`);
  }
});

// ------------------------------------------------------------------ acceptance
// A user picks a specific floor, wall colour and countertop. BINA stores the three exact
// product ids, builds a coherent board and reference package, and changing one product
// changes only its own assignments while the quantities stay right.
function kitchenFlat() {
  const p = emptyProject();
  p.style = 'modern';
  p.tier = 'mid';
  p.height = 2.7;
  p.rooms = [
    makeRoom(rectPoints(0, 0, 5, 4), 'kitchenLiving', { id: 'k' }),
    makeRoom(rectPoints(5.12, 0, 9.12, 3), 'bedroom', { id: 'b' }),
  ];
  return p;
}
const byKey = (pkg) => Object.fromEntries(pkg.references.map((r) => [r.key, r]));
const AT = '2026-10-28T12:00:00Z';

test('acceptance: three chosen products are stored by exact id and referenced', () => {
  let p = kitchenFlat();
  const k = p.rooms[0];
  p = setFinish(p, k, 'floor', 'lam_kt502', 'room');
  p = setFinish(p, k, 'walls', 'paint_mid_sage', 'room');
  p = setFinish(p, k, 'countertop', 'st_calacatta', 'room');
  assert.deepEqual(p.finish.rooms.k, { floor: 'lam_kt502', walls: 'paint_mid_sage', countertop: 'st_calacatta' });
  assert.deepEqual(chosenProducts(p), { 'k|floor': 'lam_kt502', 'k|walls': 'paint_mid_sage', 'k|countertop': 'st_calacatta' });

  // survives saving and loading
  const loaded = migrateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(chosenProducts(loaded), chosenProducts(p));

  const pkg = referencePackage(p, { generatedAt: AT });
  assert.equal(pkg.format, REF_FORMAT);
  assert.equal(pkg.version, 1);
  const r = byKey(pkg);
  for (const [key, id] of [['k|floor', 'lam_kt502'], ['k|walls', 'paint_mid_sage'], ['k|countertop', 'st_calacatta']]) {
    assert.equal(r[key].materialId, id, key);
    assert.equal(r[key].chosenBy, 'room', key);
    assert.equal(r[key].mandatory, true, `${key}: a user's choice is binding by default`);
    assert.equal(r[key].kind, 'product-approx', key);
    assert.equal(r[key].visual.image, null, key);
    assert.equal(r[key].visual.swatch, 'synthetic-approximate', key);
    assert.equal(r[key].target.roomId, 'k');
  }
  // what each reference says about the product
  assert.equal(r['k|floor'].identity.verification, 'verified');
  assert.equal(r['k|floor'].identity.retailerCode, '5068978');
  assert.equal(r['k|floor'].material.manufacturer, 'Kastamonu Entegre');
  assert.equal(r['k|floor'].material.unitSize, '1205 × 197 mm');
  assert.equal(r['k|floor'].layout.direction, 'along');
  assert.equal(r['k|floor'].target.areaM2, 20);
  assert.equal(r['k|walls'].material.colorIsPreference, true);
  assert.equal(r['k|countertop'].identity.verification, 'indicative');
  assert.match(r['k|floor'].prompt, /Kastamonu Entegre/);
  assert.match(r['k|floor'].prompt, /must be used as specified/);
  // surfaces filled in by the style are references too, but flexible
  assert.equal(r['b|floor'].chosenBy, 'style');
  assert.equal(r['b|floor'].mandatory, false);
  assert.equal(r['k|cabinet'].kind, 'preference');
  assert.equal(r['k|cabinet'].priced, false);

  // the board of the kitchen holds the same three choices, in display order
  const board = roomBoard(p, k).map((x) => x.target.surface);
  assert.deepEqual(board.slice(0, 2), ['floor', 'walls']);
  assert.ok(board.includes('countertop') && board.includes('cabinet'));
});

test('acceptance: changing one product changes only its own assignments', () => {
  let p = kitchenFlat();
  const k = p.rooms[0];
  p = setFinish(p, k, 'floor', 'lam_kt502', 'room');
  p = setFinish(p, k, 'walls', 'paint_mid_sage', 'room');
  p = setFinish(p, k, 'countertop', 'st_calacatta', 'room');
  p = setRefPrefs(p, k, 'walls', { mandatory: false });
  const before = byKey(referencePackage(p, { generatedAt: AT }));
  const estBefore = computeEstimate(p);

  const q = setFinish(p, k, 'floor', 'lam_se002', 'room');
  const after = byKey(referencePackage(q, { generatedAt: AT }));
  assert.deepEqual(Object.keys(after), Object.keys(before));
  for (const key of Object.keys(before)) {
    if (key === 'k|floor') continue;
    assert.deepEqual(after[key], before[key], `${key} did not change`);
  }
  assert.equal(after['k|floor'].materialId, 'lam_se002');
  assert.deepEqual(q.finish.rooms.k, { floor: 'lam_se002', walls: 'paint_mid_sage', countertop: 'st_calacatta' });
  assert.equal(refPrefs(q, k, 'walls').mandatory, false, 'reference settings are kept');

  // quantities: every other line is identical; the floor area is the same 20 m²
  const estAfter = computeEstimate(q);
  const lines = (est) => Object.fromEntries(est.lines.map((l) => [l.material.id, l]));
  const a = lines(estBefore);
  const b = lines(estAfter);
  for (const id of Object.keys(a)) {
    if (id === 'lam_kt502') continue;
    assert.deepEqual({ need: b[id].need, packs: b[id].packs, cost: b[id].cost }, { need: a[id].need, packs: a[id].packs, cost: a[id].cost }, id);
  }
  assert.ok(!b.lam_kt502 && b.lam_se002);
  assert.equal(b.lam_se002.net.area, a.lam_kt502.net.area);
  // 20 m² × 1.07 = 21.4 m²; packs of 1.87 m² → 12 packs = 22.44 m² × 38.50 ₾
  assert.equal(b.lam_se002.packs, 12);
  assert.ok(Math.abs(b.lam_se002.cost - 22.44 * 38.5) < 1e-6);
  assert.ok(Math.abs(estAfter.total - estAfter.lines.reduce((s, l) => s + l.cost, 0)) < 1e-6);
});

test('acceptance: cabinet fronts and reference settings never change the estimate', () => {
  let p = kitchenFlat();
  const k = p.rooms[0];
  const total = computeEstimate(p).total;
  p = setFinish(p, k, 'cabinet', 'cf_walnut', 'room');
  p = setRefPrefs(p, k, 'floor', { mandatory: true, orientation: 'across' });
  assert.equal(computeEstimate(p).total, total);
  const r = byKey(referencePackage(p, { generatedAt: AT }));
  assert.equal(r['k|cabinet'].materialId, 'cf_walnut');
  assert.equal(r['k|cabinet'].identity, null, 'a preference has no shop identity');
  assert.equal(r['k|floor'].layout.direction, 'across');
  assert.equal(r['k|floor'].layout.planAxis, 'y', 'room is 5 m along x, so across runs along y');
});

test('apartment-wide choices still update every room of that kind (and nothing else)', () => {
  let p = kitchenFlat();
  p.rooms.push(makeRoom(rectPoints(0, 4.12, 4, 7.12), 'bedroom', { id: 'b2' }));
  p.rooms.push(makeRoom(rectPoints(4.12, 4.12, 6.5, 6.5), 'bathroom', { id: 'w' }));
  const before = byKey(referencePackage(p, { generatedAt: AT }));
  p = setFinish(p, p.rooms[1], 'floor', 'lam_kt503', 'all');
  const after = byKey(referencePackage(p, { generatedAt: AT }));
  // every wood floor (bedrooms and the kitchen-living room) takes the new laminate
  for (const key of ['b|floor', 'b2|floor', 'k|floor']) assert.equal(after[key].materialId, 'lam_kt503', key);
  // the bathroom's tiled floor is another kind of surface and is not touched
  assert.deepEqual(after['w|floor'], before['w|floor']);
  for (const key of Object.keys(before)) if (!['b|floor', 'b2|floor', 'k|floor'].includes(key)) assert.deepEqual(after[key], before[key], key);
});

// ------------------------------------------------------------------ compatibility
test('older projects without reference settings open unchanged', () => {
  const s = sampleProject();
  const old = JSON.parse(JSON.stringify(s));
  delete old.finish.refs;
  const m = migrateProject(old);
  assert.equal(m.finish.refs, undefined);
  assert.equal(computeEstimate(m).total, computeEstimate(s).total);
});

test('reference settings are validated on load and dropped with their room', () => {
  let p = kitchenFlat();
  p = setRefPrefs(p, p.rooms[0], 'floor', { mandatory: true, orientation: 'across' });
  p = setRefPrefs(p, null, 'sill', { mandatory: false });
  p = setRefPrefs(p, p.rooms[1], 'walls', { mandatory: true });
  const raw = JSON.parse(JSON.stringify(p));
  raw.finish.refs['ghost|floor'] = { mandatory: true };
  raw.finish.refs['k|walls|x'] = { mandatory: true };
  raw.finish.refs['k|ceiling'] = { mandatory: 'yes', orientation: 'diagonal' };
  const m = migrateProject(raw);
  assert.deepEqual(m.finish.refs, {
    'k|floor': { mandatory: true, orientation: 'across' },
    '*|sill': { mandatory: false },
    'b|walls': { mandatory: true },
  });
  const d = deleteRoom(m, 'b');
  assert.deepEqual(Object.keys(d.finish.refs).sort(), ['*|sill', 'k|floor']);
});

test('a choice of an unknown product is kept but falls back to the style default', () => {
  const p = kitchenFlat();
  p.finish.rooms.k = { floor: 'discontinued_floor_123' };
  const m = migrateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(m.finish.rooms.k.floor, 'discontinued_floor_123');
  const r = byKey(referencePackage(m, { generatedAt: AT }));
  assert.ok(MATERIALS[r['k|floor'].materialId]);
  assert.equal(r['k|floor'].chosenBy, 'style');
});

test('every reference in the sample package is well formed', () => {
  const pkg = referencePackage(sampleProject(), { generatedAt: AT });
  assert.ok(pkg.references.length > 20);
  const keys = new Set();
  for (const r of pkg.references) {
    assert.ok(!keys.has(r.key), r.key);
    keys.add(r.key);
    assert.ok(MATERIALS[r.materialId], r.key);
    assert.ok(REF_KINDS[r.kind], r.key);
    assert.equal(r.kind, refKind(product(r.materialId)), r.key);
    assert.ok(r.prompt.length > 40 && !/https?:/.test(r.prompt), `${r.key}: prompt has no links`);
    if (r.kind === 'preference') assert.match(r.prompt, /design preference/);
    else assert.ok(r.identity && r.identity.verification, r.key);
    if (r.visual.retailerPage) assert.equal(r.visual.retailerPage, product(r.materialId).sourceUrl);
  }
  assert.deepEqual(Object.keys(pkg.kinds).sort(), ['preference', 'product-approx', 'product-image']);
});
