// Furniture: footprint geometry, wall snapping, checks, automatic placement and edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rectPoints, area } from '../src/core/geometry.js';
import { makeRoom, makeOpening, emptyProject } from '../src/core/model.js';
import {
  FURNITURE, FURNITURE_ORDER, SUGGESTED, makeFurniture, corners, toLocal, toWorld, overlapDepth, insideRoom,
  wallRot, snapToWalls, distancesToWalls, sideToWall, wallRuns, islandRuns, runFurniture, roomAt,
} from '../src/core/furniture.js';
import { analyzeFurniture, autoPlace, alignToWall, againstWall, fitRun } from '../src/core/layout.js';
import {
  addFurniture, updateFurniture, moveFurniture, rotateFurniture, duplicateFurniture, deleteFurniture,
  resizeFurniture, deleteRoom, moveRoom, withRoomPoints,
} from '../src/core/ops.js';
import { measureRoom } from '../src/core/measure.js';
import { edge, setEdgeLength } from '../src/core/geometry.js';

const close = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) < eps, `${msg} expected ${b}, got ${a}`);
const kinds = (p, id) => analyzeFurniture(p).get(id).map((w) => w.kind).sort();

// A 4 × 5 m bedroom (x 0..4, y 0..5) with a door on the bottom wall.
function bedroom() {
  const p = emptyProject();
  const r = makeRoom(rectPoints(0, 0, 4, 5), 'bedroom');
  p.rooms = [r];
  // bottom edge runs right→left from (4,5); offset 0.8 from the bottom-right corner
  p.openings = [makeOpening(r.id, 2, 0.8, 'door')];
  return { p, r };
}
const place = (p, type, x, y, rot = 0, over = {}) => addFurniture(p, makeFurniture(type, x, y, rot, over));
const last = (p) => p.furniture[p.furniture.length - 1];

test('library: every piece has a label, category, sane size and a place in the order', () => {
  assert.equal(FURNITURE_ORDER.length, Object.keys(FURNITURE).length);
  for (const [k, t] of Object.entries(FURNITURE)) {
    assert.ok(t.label && t.cat, k);
    for (const v of [t.w, t.d, t.h]) assert.ok(v > 0.1 && v < 4, `${k} size`);
    for (const [w, d] of t.presets || []) assert.ok(w > 0 && d > 0, `${k} preset`);
  }
  for (const list of Object.values(SUGGESTED)) for (const k of list) assert.ok(FURNITURE[k], k);
});

test('footprint: rotation, local/world round trip, clockwise corners', () => {
  const f = makeFurniture('bed_double', 2, 3, 90);
  const c = corners(f);
  // rotated 90°: width (1.6) runs along y, depth (2.0) along x
  const xs = c.map((q) => q.x);
  const ys = c.map((q) => q.y);
  close(Math.max(...xs) - Math.min(...xs), 2.0);
  close(Math.max(...ys) - Math.min(...ys), 1.6);
  close(area(c), 3.2);
  // back side (local -y) is on +x at rot 90
  const back = toWorld(f, 0, -1);
  close(back.x, 3);
  close(back.y, 3);
  const q = toLocal(f, toWorld(f, 0.3, -0.7));
  close(q.x, 0.3);
  close(q.y, -0.7);
});

test('overlap: apart, touching and overlapping rectangles', () => {
  const a = corners(makeFurniture('chair', 0, 0, 0));
  assert.equal(overlapDepth(a, corners(makeFurniture('chair', 1, 0, 0))), 0);
  assert.equal(overlapDepth(a, corners(makeFurniture('chair', 0.45, 0, 0))), 0, 'touching');
  close(overlapDepth(a, corners(makeFurniture('chair', 0.4, 0, 0))), 0.05);
  assert.ok(overlapDepth(a, corners(makeFurniture('chair', 0.3, 0.3, 45))) > 0);
});

test('inside a room: flush with the wall is fine, through the wall or an L notch is not', () => {
  const room = rectPoints(0, 0, 4, 5);
  assert.ok(insideRoom(corners(makeFurniture('wardrobe', 0.8, 0.3, 0)), room), 'flush in the corner');
  assert.ok(!insideRoom(corners(makeFurniture('wardrobe', 0.8, 0.25, 0)), room), '5 cm in the wall');
  const L = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }];
  assert.ok(insideRoom(corners(makeFurniture('chair', 1, 1, 0)), L));
  // a bed across the inner corner: all corners can be inside while an edge crosses the notch
  const bed = makeFurniture('bed_double', 2.0, 2.0, 45);
  assert.ok(!insideRoom(corners(bed), L));
});

test('wall snapping: flush, turned parallel, into corners, and only near walls', () => {
  const r = makeRoom(rectPoints(0, 0, 4, 5), 'bedroom');
  // a wardrobe 6 cm from the top wall, turned 5°
  const f = makeFurniture('wardrobe', 2, 0.36, 5);
  const s = snapToWalls(f, r, 0.15);
  close(s.rot, 0);
  close(s.y, 0.3, 1e-3);
  assert.deepEqual(s.edges, [0]);
  // near the top-left corner: both walls
  const g = snapToWalls(makeFurniture('wardrobe', 0.85, 0.35, 0), r, 0.15);
  close(g.x, 0.8, 1e-3);
  close(g.y, 0.3, 1e-3);
  assert.equal(g.edges.length, 2);
  // far from walls: untouched; turned 30°: not pulled around
  const far = snapToWalls(makeFurniture('wardrobe', 2, 2, 0), r, 0.15);
  assert.deepEqual([far.x, far.y, far.edges.length], [2, 2, 0]);
  assert.equal(snapToWalls(makeFurniture('wardrobe', 2, 0.36, 30), r, 0.15).edges.length, 0);
});

test('back to the wall: rotation for each wall of a rectangle', () => {
  const pts = rectPoints(0, 0, 4, 5);
  assert.deepEqual([0, 1, 2, 3].map((i) => wallRot(edge(pts, i))), [0, 90, 180, 270]);
});

test('distances from each side to the walls', () => {
  const r = makeRoom(rectPoints(0, 0, 4, 5), 'bedroom');
  const d = distancesToWalls(makeFurniture('bed_double', 2, 1.0, 0), r); // 1.6 × 2.0, back at y 0
  close(d.back.d, 0);
  close(d.front.d, 3);
  close(d.left.d, 1.2);
  close(d.right.d, 1.2);
  // a wardrobe at the foot of the bed is nearer than the wall
  const wr = makeFurniture('wardrobe', 2, 4.7, 180);
  close(distancesToWalls(makeFurniture('bed_double', 2, 1.0, 0), r, [corners(wr)]).front.d, 2.4);
});

test('checks: collision, outside, door swing, window, free space', () => {
  let { p } = bedroom();
  p = place(p, 'bed_double', 2, 1.0, 0); // head to the top wall, foot at y 2.0
  const bed = last(p).id;
  assert.deepEqual(kinds(p, bed), []);
  p = place(p, 'wardrobe', 2, 2.3, 180); // back at y 2.6, front 2.0: touches the bed's foot
  const wr = last(p).id;
  assert.ok(kinds(p, bed).includes('clearance'), 'bed needs room at its foot');
  p = updateFurniture(p, wr, { y: 2.2 });
  assert.ok(kinds(p, bed).includes('collision'));
  assert.ok(kinds(p, wr).includes('collision'));
  // into the wall
  p = updateFurniture(p, wr, { x: 3.9, y: 3.5, rot: 90 });
  assert.ok(kinds(p, wr).includes('outside'));
  // in front of the door (door on the bottom wall at x 3.2, swings into the room)
  p = updateFurniture(p, wr, { x: 3.2, y: 4.7, rot: 180 });
  assert.ok(kinds(p, wr).includes('door'));
  // a tall wardrobe in front of a window covers it, a low sofa does not
  const q = bedroom();
  q.p.openings.push(makeOpening(q.r.id, 3, 2.5, 'window')); // left wall, y 1.8..3.2
  let p2 = place(q.p, 'wardrobe', 0.3, 2.5, 270);
  assert.ok(kinds(p2, last(p2).id).includes('window'));
  p2 = place(q.p, 'sofa', 0.45, 2.5, 270);
  assert.ok(!kinds(p2, last(p2).id).includes('window'));
  // a wardrobe facing a wall 40 cm away has no room to open its doors
  const p3 = place(bedroom().p, 'wardrobe', 2, 4.3, 0); // back at 4.0, front 4.6, wall at 5.0
  assert.ok(kinds(p3, last(p3).id).includes('clearance'));
});

test('checks: pieces that are meant to overlap', () => {
  const p0 = emptyProject();
  const r = makeRoom(rectPoints(0, 0, 4, 4), 'kitchen');
  p0.rooms = [r];
  let p = addFurniture(p0, runFurniture(r, { edge: 0, start: 0, length: 3 }));
  p = addFurniture(p, runFurniture(r, { edge: 3, start: 1.5, length: 2.5 })); // L: meets the first run in the corner
  p = place(p, 'sink', 1.5, 0.3, 0);
  p = place(p, 'dining_table', 2.5, 2.8, 0);
  p = place(p, 'chair', 2.5, 3.4, 180); // pushed half under the table
  const a = analyzeFurniture(p);
  for (const f of p.furniture) assert.deepEqual(a.get(f.id), [], f.type);
});

test('automatic placement: the acceptance bedroom (bed 160 × 200 and a wardrobe)', () => {
  let { p, r } = bedroom();
  const bed = autoPlace(p, 'bed_double', r.id);
  assert.equal(bed.w, 1.6);
  assert.equal(bed.d, 2.0);
  p = addFurniture(p, bed);
  const wr = autoPlace(p, 'wardrobe', r.id);
  p = addFurniture(p, wr);
  const a = analyzeFurniture(p);
  assert.deepEqual(a.get(bed.id), []);
  assert.deepEqual(a.get(wr.id), []);
  assert.ok(againstWall(p, p.furniture[0]), 'bed head against a wall');
  assert.ok(againstWall(p, p.furniture[1]), 'wardrobe back against a wall');
  // bedside tables go beside the bed's head, chairs around a table, coffee table before the sofa
  const bs = autoPlace(p, 'bedside', r.id);
  const lb = toLocal(p.furniture[0], bs);
  close(Math.abs(lb.x), 0.8 + 0.225 + 0.03, 1e-3);
  assert.deepEqual(analyzeFurniture(addFurniture(p, bs)).get(bs.id), []);
});

test('automatic placement: chairs around a dining table, coffee table before a sofa', () => {
  const p0 = emptyProject();
  const r = makeRoom(rectPoints(0, 0, 6, 5), 'living');
  p0.rooms = [r];
  let p = place(p0, 'dining_table', 3, 2.5, 0);
  const t = last(p);
  for (let k = 0; k < 4; k++) p = addFurniture(p, autoPlace(p, 'chair', r.id));
  const chairs = p.furniture.filter((f) => f.type === 'chair');
  const a = analyzeFurniture(p);
  for (const c of chairs) {
    assert.deepEqual(a.get(c.id), []);
    const l = toLocal(t, c);
    assert.ok(Math.abs(l.y) < 0.9 && Math.abs(l.x) < 1.2, 'next to the table');
  }
  let q = place(p0, 'sofa', 3, 0.45, 0);
  const ct = autoPlace(q, 'coffee_table', r.id);
  close(toLocal(last(q), ct).y, 0.45 + 0.4 + 0.3, 1e-3);
  q = addFurniture(q, ct);
  assert.deepEqual(analyzeFurniture(q).get(ct.id), []);
  // an armchair goes beside the coffee table, facing it
  const ac = autoPlace(q, 'armchair', r.id);
  const l = toLocal(ct, ac);
  close(Math.abs(l.x), 0.55 + 0.35 + 0.425, 1e-3);
  assert.ok(l.y >= 0 && l.y <= 0.3 + 1e-9);
  const front = toWorld(ac, 0, 1);
  assert.ok(Math.hypot(front.x - ct.x, front.y - ct.y) < Math.hypot(ac.x - ct.x, ac.y - ct.y), 'faces the table');
  assert.deepEqual(analyzeFurniture(addFurniture(q, ac)).get(ac.id), []);
});

test('align to wall turns the back to the nearest wall', () => {
  const { p } = bedroom();
  const f = alignToWall(p, makeFurniture('wardrobe', 3.3, 2.5, 40, { roomId: p.rooms[0].id }));
  assert.equal(f.rot, 90);
  close(f.x, 3.7, 1e-3);
});

test('kitchen runs come from cabinets against kitchen walls; islands add countertop', () => {
  const p = emptyProject();
  const r = makeRoom(rectPoints(0, 0, 4, 4), 'kitchen');
  p.rooms = [r];
  const run = runFurniture(r, { edge: 1, start: 0.5, length: 2 });
  p.furniture = [run];
  const runs = wallRuns(r, p.furniture);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].edge, 1);
  close(runs[0].start, 0.5);
  close(runs[0].length, 2);
  close(measureRoom(r, p).countertopArea, 0.62 * 2);
  // pulled 1 m away from the wall it becomes an island: top all round, no backsplash
  p.furniture = [{ ...run, x: run.x - 1 }];
  assert.equal(wallRuns(r, p.furniture).length, 0);
  assert.equal(islandRuns(r, p.furniture).length, 1);
  const m = measureRoom(r, p);
  close(m.countertopArea, 2 * 0.62);
  close(m.backsplashArea, 0);
  close(m.kitchenRunLength, 0);
});

test('a new kitchen run keeps clear of a door near the corner', () => {
  const p = emptyProject();
  const r = makeRoom(rectPoints(0, 0, 4, 3), 'kitchen');
  p.rooms = [r];
  // left wall runs bottom→top from (0,3): offset 2.4 puts the door at y 0.2..1.0, near the top corner
  p.openings = [makeOpening(r.id, 3, 2.4, 'door')];
  const f = fitRun(p, r, { edge: 0, start: 0, length: 4 });
  const [run] = wallRuns(r, [f]);
  close(run.start, 0.8, 1e-6, 'starts after the door swing');
  close(run.length, 3.2, 1e-6);
  assert.deepEqual(analyzeFurniture(addFurniture(p, f)).get(f.id).filter((w) => w.kind !== 'clearance'), []);
});

test('vanity top area follows the vanity units in the bathroom', () => {
  const p = emptyProject();
  const r = makeRoom(rectPoints(0, 0, 2, 2.5), 'bathroom');
  p.rooms = [r];
  close(measureRoom(r, p).vanityArea, 0.4, 1e-9, 'default unit');
  p.furniture = [makeFurniture('vanity', 1, 0.25, 0, { roomId: r.id, w: 1.2, d: 0.5 })];
  close(measureRoom(r, p).vanityArea, 0.6);
});

test('edits: add, move between rooms, rotate, resize, duplicate, delete', () => {
  const p0 = emptyProject();
  const a = makeRoom(rectPoints(0, 0, 4, 4), 'bedroom');
  const b = makeRoom(rectPoints(4.12, 0, 8, 4), 'living');
  p0.rooms = [a, b];
  let p = place(p0, 'armchair', 2, 2, 0);
  const id = last(p).id;
  assert.equal(last(p).roomId, a.id);
  p = moveFurniture(p, id, 4, 0);
  assert.equal(last(p).roomId, b.id, 'moved into the next room');
  p = rotateFurniture(p, id, -90);
  assert.equal(last(p).rot, 270);
  p = updateFurniture(p, id, { w: 50, d: -3, h: 'x' });
  assert.equal(last(p).w, 10);
  assert.equal(last(p).d, 0.1);
  assert.equal(last(p).h, FURNITURE.armchair.h);
  p = updateFurniture(p, id, { w: 0.85, d: 0.85 });
  const dup = duplicateFurniture(p, id);
  assert.equal(dup.project.furniture.length, 2);
  assert.notEqual(dup.id, id);
  const an = analyzeFurniture(dup.project);
  assert.deepEqual(an.get(dup.id), [], 'the copy is placed where it fits');
  p = deleteFurniture(dup.project, id);
  assert.deepEqual(p.furniture.map((f) => f.id), [dup.id]);
});

test('typed sizes keep the back against the wall and a corner piece in its corner', () => {
  const p0 = emptyProject();
  const r = makeRoom(rectPoints(0, 0, 4, 5), 'bedroom');
  p0.rooms = [r];
  let p = place(p0, 'wardrobe', 0.8, 0.3, 0); // in the top-left corner
  const id = last(p).id;
  p = resizeFurniture(p, id, { w: 2.4, d: 0.65 });
  const f = last(p);
  close(f.x - f.w / 2, 0, 1e-6, 'left side still in the corner');
  close(f.y - f.d / 2, 0, 1e-6, 'back still on the wall');
  // a bed in the middle of a wall grows to both sides
  let q = place(p0, 'bed_double', 2, 1.0, 0);
  q = resizeFurniture(q, last(q).id, { w: 1.8 });
  close(last(q).x, 2);
  close(last(q).y, 1.0);
});

test('rooms carry their furniture: move, delete, and walls that are pushed', () => {
  const p0 = emptyProject();
  const r = makeRoom(rectPoints(0, 0, 4, 5), 'bedroom');
  p0.rooms = [r];
  let p = place(p0, 'wardrobe', 3.7, 2.5, 90); // back against the right wall (x 4)
  p = place(p, 'armchair', 2, 2.5, 0);
  const [wr, ac] = p.furniture;
  const moved = moveRoom(p, r.id, 1, 2);
  close(moved.furniture[0].x, wr.x + 1);
  close(moved.furniture[1].y, ac.y + 2);
  // the right wall moves 0.5 m out: the wardrobe stays against it, the armchair stays put
  const pts = setEdgeLength(r.points, 0, 4.5);
  const pushed = withRoomPoints(p, r.id, pts);
  close(pushed.furniture[0].x, 4.2, 1e-6);
  close(pushed.furniture[1].x, 2);
  const back = sideToWall(pushed.furniture[0], 'back', edge(pushed.rooms[0].points, 1));
  close(back.dist, 0, 1e-6);
  assert.equal(deleteRoom(p, r.id).furniture.length, 0);
});

test('roomAt picks the room under a point', () => {
  const a = makeRoom(rectPoints(0, 0, 4, 4), 'bedroom');
  const b = makeRoom(rectPoints(4.12, 0, 8, 4), 'living');
  assert.equal(roomAt([a, b], { x: 1, y: 1 }).id, a.id);
  assert.equal(roomAt([a, b], { x: 5, y: 1 }).id, b.id);
  assert.equal(roomAt([a, b], { x: 4.06, y: 1 }), null, 'in the wall between');
});
