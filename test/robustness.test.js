// Regression tests for damaged, hand-edited or hostile project data (QA audit, stage 01).
// Before these fixes a single bad value could crash the plan drawing on every start-up,
// turn the estimate into NaN, or make the saved project be overwritten by the sample.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleProject, migrateProject, cleanPlanImage, DEFAULT_HEIGHT } from '../src/core/model.js';
import { computeEstimate } from '../src/core/quantities.js';
import { measureProject } from '../src/core/measure.js';
import { updateOpening, withRoomPoints } from '../src/core/ops.js';
import { area } from '../src/core/geometry.js';

const square = (s = 3) => [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }];
const room = (over = {}) => ({ id: 'a', purpose: 'bedroom', points: square(), ...over });
const door = (over = {}) => ({ id: 'o', roomId: 'a', edge: 0, offset: 1.5, type: 'door', width: 0.8, height: 2.1, sill: 0, ...over });

// Everything the UI does with a project right after loading it must work.
function assertUsable(p) {
  const e = computeEstimate(p);
  assert.ok(Number.isFinite(e.total), `total is ${e.total}`);
  for (const m of measureProject(p).rooms) {
    for (const k of ['area', 'wallNet', 'wallPaintArea', 'wallTileArea', 'skirtingLength']) {
      assert.ok(Number.isFinite(m[k]), `${k} is ${m[k]}`);
    }
  }
  for (const o of p.openings) updateOpening(p, o.id, {});
  for (const r of p.rooms) withRoomPoints(p, r.id, r.points);
}

test('non-project input is rejected instead of opening as an empty project', () => {
  for (const raw of [null, undefined, 'text', 7, [1, 2], {}, { rooms: {} }, { rooms: 'x' }, { name: 'x' }]) {
    assert.equal(migrateProject(raw), null, JSON.stringify(raw));
  }
});

test('rooms with missing, non-numeric or degenerate points are dropped and counted', () => {
  const report = {};
  const p = migrateProject({
    rooms: [
      room(),
      room({ id: 'b', points: [{ x: 'q', y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }),
      room({ id: 'c', points: [null, { x: 1, y: 0 }, { x: 1, y: 1 }] }),
      room({ id: 'd', points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] }),
      room({ id: 'e', points: 'nope' }),
      room({ id: 'f', points: [{ x: 0, y: 0 }, { x: 1e12, y: 0 }, { x: 1e12, y: 1e12 }] }),
      null,
      'room',
    ],
  }, report);
  assert.deepEqual(p.rooms.map((r) => r.id), ['a']);
  assert.equal(report.rooms, 7);
  assertUsable(p);
});

test('repeated corner points are merged, a closing duplicate is removed', () => {
  const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 }];
  const p = migrateProject({ rooms: [room({ points: pts })] });
  assert.equal(p.rooms[0].points.length, 4);
  assert.equal(area(p.rooms[0].points), 12);
});

test('numeric strings from hand-edited files are accepted', () => {
  const p = migrateProject({ rooms: [room({ points: [{ x: '0', y: '0' }, { x: '2.5', y: 0 }, { x: 2.5, y: '2' }] })] });
  assert.equal(area(p.rooms[0].points), 2.5);
});

test('openings on a wall that does not exist are dropped (used to crash the drawing)', () => {
  const report = {};
  const p = migrateProject({
    rooms: [room()],
    openings: [door(), door({ id: 'o2', edge: 7 }), door({ id: 'o3', edge: -1 }), door({ id: 'o4', edge: 1.5 }),
      door({ id: 'o5', edge: '2' }), door({ id: 'o6', type: 'portal' }), door({ id: 'o7', roomId: 'zz' }), null],
  }, report);
  assert.deepEqual(p.openings.map((o) => o.id), ['o', 'o5']);
  assert.equal(p.openings[1].edge, 2);
  assert.equal(report.openings, 6);
  assertUsable(p);
});

test('bad opening sizes are repaired to the type defaults and kept on the wall', () => {
  const p = migrateProject({
    rooms: [room()],
    openings: [
      { id: 'w', roomId: 'a', edge: 0, offset: 'x', type: 'window' },
      { id: 'd', roomId: 'a', edge: 1, offset: 99, type: 'door', width: 50, height: -2, sill: 'low' },
    ],
  });
  const [w, d] = p.openings;
  assert.deepEqual([w.width, w.height, w.sill, w.offset], [1.4, 1.5, 0.9, 1.5]);
  assert.equal(d.width, 3); // no wider than its 3 m wall
  assert.equal(d.offset, 3);
  assert.equal(d.height, 2.1);
  assert.equal(d.sill, 0);
  assertUsable(p);
});

test('invalid heights fall back to defaults instead of producing NaN totals', () => {
  const p = migrateProject({
    height: 'abc',
    rooms: [room({ purpose: 'bathroom', height: -3, tileHeight: 'x' }), room({ id: 'b', height: 2.6, points: square(2).map((q) => ({ x: q.x + 5, y: q.y })) })],
  });
  assert.equal(p.height, DEFAULT_HEIGHT);
  assert.equal(p.rooms[0].height, null);
  assert.equal(p.rooms[0].tileHeight, null);
  assert.equal(p.rooms[1].height, 2.6);
  assertUsable(p);
});

test('broken kitchen data does not throw', () => {
  for (const kitchen of [{ runs: 'x' }, { runs: [{ edge: 'a', start: 'b', length: 'c' }] }, 5, { runs: [{ edge: 9, length: 2 }] }]) {
    const p = migrateProject({ rooms: [room({ purpose: 'kitchen', kitchen })] });
    assert.ok(p.rooms[0].kitchen === null || Array.isArray(p.rooms[0].kitchen.runs));
    assertUsable(p);
  }
});

test('duplicate ids are made unique so selection and deletion stay unambiguous', () => {
  const p = migrateProject({ rooms: [room(), room({ points: square(2).map((q) => ({ x: q.x + 5, y: q.y })) })], openings: [door(), door()] });
  assert.equal(new Set(p.rooms.map((r) => r.id)).size, 2);
  assert.equal(new Set(p.openings.map((o) => o.id)).size, 2);
  assert.ok(p.openings.every((o) => o.roomId === 'a'));
});

test('unknown style, tier, plan and finish shapes are reset', () => {
  const p = migrateProject({
    style: 'nope', tier: 42, name: { a: 1 },
    plan: { mPerPx: 'x', w: -1 },
    finish: { global: null, rooms: 5 },
    rooms: [room({ name: 5 })],
  });
  assert.equal(p.style, 'modern');
  assert.equal(p.tier, 'mid');
  assert.equal(p.name, 'ჩემი ბინა');
  assert.equal(p.rooms[0].name, '');
  assert.equal(p.plan, null);
  assert.deepEqual(p.finish, { global: {}, rooms: {} });
  assertUsable(p);
});

test('a valid plan calibration is kept, opacity is clamped', () => {
  const p = migrateProject({ rooms: [], plan: { x: 1, y: 2, mPerPx: 0.01, w: 1200, h: 800, opacity: 7, visible: false, calibrated: true } });
  assert.deepEqual(p.plan, { x: 1, y: 2, mPerPx: 0.01, w: 1200, h: 800, opacity: 1, visible: false, calibrated: true });
});

test('extra keys (e.g. an exported planImage) are not copied into the saved project', () => {
  const p = migrateProject({ ...sampleProject(), planImage: 'data:image/jpeg;base64,AAAA', junk: 1 });
  assert.equal('planImage' in p, false);
  assert.equal('junk' in p, false);
});

test('the sample apartment survives a save/load round trip unchanged', () => {
  const s = sampleProject();
  const m = migrateProject(JSON.parse(JSON.stringify(s)));
  const strip = (p) => ({ ...p, rooms: p.rooms.map(({ unassigned, ...r }) => r) });
  assert.deepEqual(strip(m), strip(s));
  assert.equal(computeEstimate(m).total, computeEstimate(s).total);
});

test('only embedded raster images are accepted as the plan image', () => {
  assert.equal(cleanPlanImage('data:image/jpeg;base64,/9j/4AAQ'), 'data:image/jpeg;base64,/9j/4AAQ');
  assert.equal(cleanPlanImage('data:image/png;base64,iVBOR'), 'data:image/png;base64,iVBOR');
  for (const bad of ['https://example.com/a.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 5, null, {}]) {
    assert.equal(cleanPlanImage(bad), null, String(bad));
  }
});
