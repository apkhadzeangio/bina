// Saved project format: version 1 projects (no furniture, kitchen cabinets as wall stretches)
// must open unchanged in meaning, version 2 projects must survive a save/load round trip,
// and damaged furniture data must be repaired or dropped, never crash the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rectPoints } from '../src/core/geometry.js';
import { migrateProject, sampleProject, SCHEMA_VERSION } from '../src/core/model.js';
import { measureRoom, kitchenRuns } from '../src/core/measure.js';
import { computeEstimate } from '../src/core/quantities.js';
import { FURNITURE } from '../src/core/furniture.js';
import { analyzeFurniture } from '../src/core/layout.js';

const close = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) < eps, `${msg} expected ${b}, got ${a}`);

// A project exactly as version 1 of the app saved it.
function v1Kitchen(runs, purpose = 'kitchen') {
  return {
    version: 1,
    name: 'old',
    height: 2.7,
    rooms: [{ id: 'k', purpose, name: '', points: rectPoints(0, 0, 3, 4), height: null, tileHeight: null, kitchen: { runs } }],
    openings: [],
    style: 'modern',
    tier: 'mid',
    finish: { global: {}, rooms: {} },
  };
}

test('version 1 kitchen runs become cabinet furniture with the same measurements', () => {
  const p = migrateProject(v1Kitchen([{ edge: 0, start: 0, length: 3 }, { edge: 1, start: 0, length: 2 }]));
  assert.equal(p.version, SCHEMA_VERSION);
  assert.equal(p.rooms[0].kitchen, undefined);
  assert.equal(p.furniture.length, 2);
  assert.ok(p.furniture.every((f) => f.type === 'kitchen_run' && f.roomId === 'k' && f.category === 'kitchen'));
  const runs = kitchenRuns(p.rooms[0], p);
  assert.deepEqual(runs.map((r) => [r.edge, +r.start.toFixed(3), +r.length.toFixed(3)]), [[0, 0, 3], [1, 0, 2]]);
  const m = measureRoom(p.rooms[0], p);
  // the same numbers version 1 produced for these runs
  close(m.countertopArea, 0.62 * (5 - 0.62));
  close(m.backsplashArea, 3.0);
  close(m.skirtingLength, 14 - 5);
  assert.deepEqual(analyzeFurniture(p).get(p.furniture[0].id), []);
});

test('version 1: runs longer than the wall are cut, runs in non-kitchens are not invented', () => {
  let p = migrateProject(v1Kitchen([{ edge: 0, start: 1, length: 9 }]));
  assert.equal(p.furniture.length, 1);
  close(p.furniture[0].w, 2);
  p = migrateProject(v1Kitchen([{ edge: 0, start: 0, length: 3 }], 'bedroom'));
  assert.deepEqual(p.furniture, []);
});

test('version 2 does not read kitchen data any more', () => {
  const raw = { ...v1Kitchen([{ edge: 0, start: 0, length: 3 }]), version: 2 };
  assert.deepEqual(migrateProject(raw).furniture, []);
});

test('a saved project opens with every piece exactly where it was', () => {
  const p = sampleProject();
  const again = migrateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(again.furniture, p.furniture);
  assert.deepEqual(again.rooms.map(({ unassigned, ...r }) => r), p.rooms); // loading adds unassigned: false
  assert.deepEqual(again.openings, p.openings);
  // and gives the same estimate
  close(computeEstimate(again).total, computeEstimate(p).total, 1e-6);
});

test('the sample apartment has furniture in every room type and no problems', () => {
  const p = sampleProject();
  assert.ok(p.furniture.length >= 20);
  for (const f of p.furniture) assert.ok(f.roomId, `${f.type} stands in a room`);
  const a = analyzeFurniture(p);
  for (const f of p.furniture) assert.deepEqual(a.get(f.id), [], f.type);
});

test('damaged furniture is repaired or dropped and counted', () => {
  const room = { id: 'a', purpose: 'bedroom', points: rectPoints(0, 0, 4, 5) };
  const good = { id: 'f1', type: 'bed_double', roomId: 'a', x: 2, y: 1, w: 1.6, d: 2, h: 0.5, rot: 0 };
  const report = {};
  const p = migrateProject({
    version: 2,
    rooms: [room],
    furniture: [
      good,
      { ...good, id: 'f1', x: 1 }, // duplicate id
      { ...good, id: 'f3', type: 'spaceship' },
      { ...good, id: 'f4', type: '__proto__' },
      { ...good, id: 'f5', type: 'toString' },
      { ...good, id: 'f6', x: 'left' },
      { ...good, id: 'f7', y: 1e9 },
      { ...good, id: 'f8', w: -1, d: 'deep', h: 99, rot: -90 },
      { ...good, id: 'f9', rot: 725, roomId: 'gone' },
      { ...good, id: 'f10', x: 50, roomId: 'a' }, // not in the room it claims
      null,
      'sofa',
    ],
  }, report);
  assert.equal(report.furniture, 7);
  assert.deepEqual(p.furniture.map((f) => f.id).slice(0, 1), ['f1']);
  assert.equal(new Set(p.furniture.map((f) => f.id)).size, p.furniture.length);
  const f8 = p.furniture.find((f) => f.id === 'f8');
  assert.deepEqual([f8.w, f8.d, f8.h, f8.rot], [FURNITURE.bed_double.w, FURNITURE.bed_double.d, FURNITURE.bed_double.h, 270]);
  const f9 = p.furniture.find((f) => f.id === 'f9');
  assert.equal(f9.rot, 5);
  assert.equal(f9.roomId, 'a');
  assert.equal(p.furniture.find((f) => f.id === 'f10').roomId, null);
  assert.ok(p.furniture.every((f) => f.category === FURNITURE[f.type].cat));
});

test('furniture of a dropped room loses its room but is kept', () => {
  const p = migrateProject({
    version: 2,
    rooms: [{ id: 'a', purpose: 'bedroom', points: 'broken' }, { id: 'b', purpose: 'living', points: rectPoints(5, 0, 9, 4) }],
    furniture: [{ id: 'x', type: 'sofa', roomId: 'a', x: 1, y: 1, w: 2, d: 0.9, h: 0.8, rot: 0 }],
  });
  assert.equal(p.furniture.length, 1);
  assert.equal(p.furniture[0].roomId, null);
  assert.ok(analyzeFurniture(p).get('x').some((w) => w.kind === 'outside'));
});

test('a project from a newer version still opens', () => {
  const p = migrateProject({ ...JSON.parse(JSON.stringify(sampleProject())), version: 99, futureField: { a: 1 } });
  assert.ok(p.furniture.length > 0);
  assert.equal(p.version, SCHEMA_VERSION);
  assert.equal(p.futureField, undefined);
});
