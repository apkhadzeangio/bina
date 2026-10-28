import test from 'node:test';
import assert from 'node:assert/strict';
import {
  area, perimeter, signedArea, rectPoints, setEdgeLength, moveEdge, labelPoint, pointInPolygon,
  selfIntersects, isValidPolygon, polygonsOverlap, edge,
} from '../src/core/geometry.js';
import { makeRoom, makeOpening, emptyProject, sampleProject, migrateProject } from '../src/core/model.js';
import { measureProject, measureRoom, openingHosts, defaultKitchenRun } from '../src/core/measure.js';
import { runFurniture } from '../src/core/furniture.js';

const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) < eps, `${msg || ''} expected ${b}, got ${a}`);

function project(rooms, openings = [], height = 2.7) {
  const p = emptyProject();
  p.height = height;
  p.rooms = rooms;
  p.openings = openings;
  return p;
}

test('rectangle area, perimeter and orientation', () => {
  const r = makeRoom(rectPoints(0, 0, 4, 3), 'bedroom');
  close(area(r.points), 12);
  close(perimeter(r.points), 14);
  assert.ok(signedArea(r.points) > 0);
  // counter-clockwise input is normalised
  const r2 = makeRoom(rectPoints(0, 0, 4, 3).reverse(), 'bedroom');
  assert.ok(signedArea(r2.points) > 0);
  const e0 = edge(r.points, 0);
  close(e0.nx, 0); close(e0.ny, 1); // top edge points inward (down)
});

test('plain room: walls, ceiling, skirting', () => {
  const r = makeRoom(rectPoints(0, 0, 4, 3), 'bedroom');
  const m = measureRoom(r, project([r]));
  close(m.wallGross, 14 * 2.7);
  close(m.wallNet, 37.8);
  close(m.wallPaintArea, 37.8);
  close(m.ceilingArea, 12);
  close(m.skirtingLength, 14);
});

test('door and window are subtracted; sill is counted', () => {
  const r = makeRoom(rectPoints(0, 0, 4, 3), 'bedroom');
  const d = makeOpening(r.id, 0, 1, 'door'); // 0.8 × 2.1
  const w = makeOpening(r.id, 1, 1.5, 'window'); // 1.4 × 1.5, sill 0.9
  const m = measureRoom(r, project([r], [d, w]));
  close(m.wallNet, 37.8 - 1.68 - 2.1);
  close(m.skirtingLength, 14 - 0.8);
  assert.equal(m.doorCount, 1);
  assert.equal(m.sills.length, 1);
  close(m.sills[0].length, 1.5);
  close(m.sills[0].area, 0.45);
});

test('an opening cuts the wall on both sides of a partition', () => {
  const a = makeRoom(rectPoints(0, 0, 4, 3), 'bedroom');
  const b = makeRoom(rectPoints(4.12, 0, 7, 3), 'hall');
  const d = makeOpening(a.id, 1, 1.5, 'door'); // right wall of a
  const p = project([a, b], [d]);
  const { links } = openingHosts(p);
  assert.equal(links.length, 1);
  assert.equal(links[0].to, b.id);
  const mb = measureRoom(b, p);
  close(mb.wallNet, (2.88 * 2 + 6) * 2.7 - 1.68, 1e-6);
  close(mb.skirtingLength, 2.88 * 2 + 6 - 0.8, 1e-6);
  assert.equal(mb.doorCount, 0, 'door is purchased once, by the owning room');
});

test('opening is not linked to a room further than a wall away', () => {
  const a = makeRoom(rectPoints(0, 0, 4, 3), 'bedroom');
  const b = makeRoom(rectPoints(4.8, 0, 7, 3), 'hall');
  const d = makeOpening(a.id, 1, 1.5, 'door');
  const { links } = openingHosts(project([a, b], [d]));
  assert.equal(links.length, 0);
});

test('bathroom: full-height tile, waterproofing, vanity and sanitary set', () => {
  const r = makeRoom(rectPoints(0, 0, 2, 2.5), 'bathroom');
  const d = makeOpening(r.id, 0, 1, 'door');
  d.width = 0.7;
  const p = project([r], [d]);
  let m = measureRoom(r, p);
  close(m.wallTileArea, 9 * 2.7 - 0.7 * 2.1);
  close(m.wallPaintArea, 0);
  close(m.waterproofArea, 5 + 9 * 0.2);
  close(m.vanityArea, 0.4);
  assert.equal(m.sanitaryCount, 1);
  assert.equal(m.skirtingLength, 0);
  r.tileHeight = 2.0;
  m = measureRoom(r, p);
  close(m.wallTileArea, 18 - 0.7 * 2.0);
  close(m.wallPaintArea, 9 * 0.7 - 0.7 * 0.1);
});

test('kitchen run: countertop, backsplash, corner', () => {
  const r = makeRoom(rectPoints(0, 0, 3, 4), 'kitchen');
  const p = project([r]);
  p.furniture = [runFurniture(r, { edge: 0, start: 0, length: 3 })];
  let m = measureRoom(r, p);
  close(m.countertopArea, 0.62 * 3);
  close(m.backsplashArea, 1.8);
  close(m.wallPaintArea, 14 * 2.7 - 1.8);
  close(m.skirtingLength, 14 - 3);
  p.furniture.push(runFurniture(r, { edge: 1, start: 0, length: 2 }));
  m = measureRoom(r, p);
  close(m.countertopArea, 0.62 * (5 - 0.62));
  close(m.backsplashArea, 3.0);
});

test('window over the counter reduces the backsplash', () => {
  const r = makeRoom(rectPoints(0, 0, 3, 4), 'kitchen');
  const w = makeOpening(r.id, 0, 1.5, 'window'); // sill 0.9 → overlaps band 0.9–1.5 fully
  const p = project([r], [w]);
  p.furniture = [runFurniture(r, { edge: 0, start: 0, length: 3 })];
  const m = measureRoom(r, p);
  close(m.backsplashArea, 1.8 - 1.4 * 0.6);
});

test('default kitchen run avoids walls with doors', () => {
  const r = makeRoom(rectPoints(0, 0, 5, 3), 'kitchen');
  const d = makeOpening(r.id, 0, 1, 'door');
  const p = project([r], [d]);
  const k = defaultKitchenRun(r, p);
  assert.equal(k.runs[0].edge, 2, 'bottom wall, 5 m, no door');
  close(k.runs[0].length, 4.2);
});

test('setEdgeLength keeps a rectangle rectangular', () => {
  const pts = rectPoints(0, 0, 4, 3);
  const out = setEdgeLength(pts, 0, 5);
  close(area(out), 15);
  close(edge(out, 1).len, 3);
  close(edge(out, 2).len, 5);
  const out2 = setEdgeLength(pts, 1, 3.5); // right wall 3 → 3.5
  close(area(out2), 14);
  assert.equal(setEdgeLength(pts, 0, 0), null);
});

test('moveEdge grows the room outward', () => {
  const pts = rectPoints(0, 0, 4, 3);
  const out = moveEdge(pts, 1, 0.5);
  close(area(out), 4.5 * 3);
  const out2 = moveEdge(pts, 1, -5);
  assert.equal(out2, null, 'cannot collapse a room');
});

test('L-shaped room: label point inside, edge length keeps shape valid', () => {
  const L = [
    { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 },
  ];
  close(area(L), 12);
  assert.ok(pointInPolygon(labelPoint(L), L));
  assert.ok(!selfIntersects(L));
  const longer = setEdgeLength(L, 0, 5);
  assert.ok(isValidPolygon(longer));
  close(area(longer), 14);
  assert.equal(setEdgeLength(L, 0, 1.5), null, 'would fold the notch over itself');
});

test('overlap detection', () => {
  const a = rectPoints(0, 0, 4, 3);
  assert.ok(polygonsOverlap(a, rectPoints(3, 1, 6, 2)));
  assert.ok(polygonsOverlap(a, rectPoints(1, 1, 2, 2)));
  assert.ok(!polygonsOverlap(a, rectPoints(4.12, 0, 6, 3)));
});

test('sample apartment measures as drawn', () => {
  const p = sampleProject();
  const M = measureProject(p);
  close(M.totals.area, 27.6 + 13.68 + 2.78 * 3.48 + 9.042 + 2.48 * 2.18 + 1.5 * 1.48 + 4.2 * 1.3, 1e-6);
  close(M.totals.outdoorArea, 5.46, 1e-6);
  assert.equal(M.links.length, 7, 'five interior doors/arches + two openings onto the balcony');
  assert.equal(M.totals.doorCount, 4);
  assert.equal(M.totals.windowCount, 4);
  const living = M.rooms[0];
  close(living.kitchenRunLength, 3.6);
  close(living.countertopArea, 0.62 * 3.6);
  // every room has non-negative areas
  for (const m of M.rooms) {
    for (const k of ['wallNet', 'wallPaintArea', 'wallTileArea', 'skirtingLength', 'backsplashArea']) {
      assert.ok(m[k] >= 0, `${m.purpose}.${k}`);
    }
  }
});

test('migrate drops broken rooms and orphan openings', () => {
  const p = sampleProject();
  const raw = JSON.parse(JSON.stringify(p));
  raw.rooms.push({ id: 'bad', points: [{ x: 0, y: 0 }] });
  raw.openings.push({ id: 'x', roomId: 'missing', edge: 0, offset: 1, type: 'door', width: 0.8, height: 2.1, sill: 0 });
  const m = migrateProject(raw);
  assert.equal(m.rooms.length, p.rooms.length);
  assert.equal(m.openings.length, p.openings.length);
});

import { withRoomPoints, updateOpening, deleteRoom } from '../src/core/ops.js';
import { openingCenter } from '../src/core/measure.js';

test('doors stay in place when a wall is pushed', () => {
  const r = makeRoom(rectPoints(0, 0, 4, 3), 'bedroom');
  const d = makeOpening(r.id, 2, 1, 'door'); // bottom wall, 1 m from the right corner
  let p = project([r], [d]);
  const before = openingCenter(r, d);
  p = withRoomPoints(p, r.id, setEdgeLength(r.points, 0, 5));
  const after = openingCenter(p.rooms[0], p.openings[0]);
  close(after.x, before.x, 1e-6);
  close(after.y, before.y, 1e-6);
  close(p.openings[0].offset, 2);
});

test('opening width and offset are kept on the wall', () => {
  const r = makeRoom(rectPoints(0, 0, 2, 2), 'wc');
  const d = makeOpening(r.id, 0, 1, 'door');
  let p = project([r], [d]);
  p = updateOpening(p, d.id, { width: 5 });
  close(p.openings[0].width, 2);
  p = updateOpening(p, d.id, { width: 0.8, offset: 1.9 });
  close(p.openings[0].offset, 1.6);
  p = deleteRoom(p, r.id);
  assert.equal(p.openings.length, 0);
});
