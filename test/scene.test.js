// Scene specification (src/core/scene.js), render instructions (src/core/render-prompt.js)
// and saved-render records in the project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneSpec, sceneRevision, validateScene, sideFromCamera, canonical, SCENE_LIMITS } from '../src/core/scene.js';
import { buildRenderPrompt } from '../src/core/render-prompt.js';
import { emptyProject, makeRoom, migrateProject, sampleProject, cleanRenders } from '../src/core/model.js';
import { rectPoints } from '../src/core/geometry.js';
import { makeFurniture } from '../src/core/furniture.js';
import { setFinish, setRefPrefs } from '../src/core/finishes.js';
import { moveRoom } from '../src/core/ops.js';

// The acceptance room: 4 × 5 m bedroom, window on the north wall, door on the south wall,
// a 160 × 200 bed against the south wall and a wardrobe on the west wall.
function bedroom() {
  let p = emptyProject();
  p.height = 2.7;
  p.style = 'modern';
  p.rooms = [makeRoom(rectPoints(0, 0, 4, 5), 'bedroom', { id: 'bed' }), makeRoom(rectPoints(4.12, 0, 7, 3), 'living', { id: 'liv' })];
  p.openings = [
    { id: 'w1', roomId: 'bed', edge: 0, offset: 2, type: 'window', width: 1.4, height: 1.5, sill: 0.9 },
    { id: 'd1', roomId: 'bed', edge: 1, offset: 1.5, type: 'door', width: 0.8, height: 2.1, sill: 0 },
  ];
  p.furniture = [makeFurniture('bed_double', 2, 3.9, 180, { roomId: 'bed' }), makeFurniture('wardrobe', 0.3, 1.2, 270, { roomId: 'bed' })];
  p = setFinish(p, p.rooms[0], 'floor', 'lam_kt502', 'room');
  p = setFinish(p, p.rooms[0], 'walls', 'paint_mid_sage', 'room');
  return p;
}
const CAM = { position: { x: 3.5, y: 0.5, z: 1.6 }, target: { x: 2, y: 2.5, z: 1.15 }, fov: 64 };
const spec = (p = bedroom(), o = {}) => sceneSpec(p, { roomId: 'bed', camera: CAM, style: 'scandi', ...o });

test('the scene describes the room exactly, in room coordinates', () => {
  const s = spec();
  assert.equal(s.format, 'bina.scene');
  assert.equal(s.room.purpose, 'bedroom');
  assert.deepEqual(s.room.size, { w: 4, d: 5 });
  assert.equal(s.room.area, 20);
  assert.equal(s.room.ceiling, 2.7);
  assert.equal(s.room.walls.length, 4);
  assert.deepEqual(s.room.walls.map((w) => w.facing), ['north', 'east', 'south', 'west']);
  assert.deepEqual(s.room.walls.map((w) => w.length), [4, 5, 4, 5]);
  const win = s.openings.find((o) => o.type === 'window');
  assert.deepEqual({ wall: win.wall, center: win.center, width: win.width, sill: win.sill, leadsTo: win.leadsTo }, { wall: 1, center: 2, width: 1.4, sill: 0.9, leadsTo: 'outside' });
  const door = s.openings.find((o) => o.type === 'door');
  assert.equal(door.leadsTo, 'living', 'the door is linked to the neighbouring room');
  const bed = s.furniture.find((f) => f.type === 'bed_double');
  assert.deepEqual([bed.w, bed.d, bed.rot], [1.6, 2, 180]);
  assert.deepEqual(bed.center, { x: 2, y: 3.9 });
  assert.deepEqual(s.materials.map((m) => [m.surface, m.materialId, m.mandatory]).slice(0, 2), [['floor', 'lam_kt502', true], ['walls', 'paint_mid_sage', true]]);
  assert.ok(s.materials.some((m) => m.surface === 'door'), 'the room has a door: door finish included');
  assert.ok(s.materials.some((m) => m.surface === 'sill'), 'the room has a window: sill finish included');
  assert.deepEqual(s.camera.position, { x: 3.5, y: 0.5, z: 1.6 });
  assert.equal(s.style, 'scandi');
});

test('sides are seen from the camera (plan y grows downward)', () => {
  const cam = { position: { x: 0, y: 0 }, target: { x: 0, y: -1 } }; // looking north
  assert.equal(sideFromCamera(cam, { x: 0, y: -3 }), 'ahead');
  assert.equal(sideFromCamera(cam, { x: 3, y: 0 }), 'right'); // east is on the right
  assert.equal(sideFromCamera(cam, { x: -3, y: 0 }), 'left');
  assert.equal(sideFromCamera(cam, { x: 0, y: 3 }), 'behind');
  const s = spec();
  // from near the north-east corner looking south-south-west: the north wall is to the
  // right (west-north-west of the viewer), the east wall to the left, south and west ahead
  assert.deepEqual(s.room.walls.map((w) => w.side), ['right', 'left', 'ahead', 'ahead']);
  assert.equal(s.furniture.find((f) => f.type === 'bed_double').side, 'ahead');
  // from the middle of the room looking south, the north wall is behind
  const mid = spec(bedroom(), { camera: { position: { x: 2, y: 2.5, z: 1.6 }, target: { x: 2, y: 4.5, z: 1.2 }, fov: 64 } });
  assert.equal(mid.room.walls[0].side, 'behind');
});

test('validation keeps a valid scene exactly (same revision on both sides)', () => {
  for (const p of [bedroom(), sampleProject()]) {
    for (const r of p.rooms) {
      const s = sceneSpec(p, { roomId: r.id });
      const v = validateScene(JSON.parse(JSON.stringify(s)));
      assert.deepEqual(v.errors, [], r.purpose);
      assert.equal(sceneRevision(v.spec), sceneRevision(s), r.purpose);
    }
  }
});

test('the revision changes with anything that changes the picture, and only then', () => {
  const p = bedroom();
  const base = sceneRevision(spec(p));
  assert.equal(sceneRevision(spec(bedroom())), base, 'deterministic');
  assert.match(base, /^s1-[0-9a-f]{14}$/);
  const moved = { ...p, furniture: p.furniture.map((f) => (f.type === 'bed_double' ? { ...f, x: f.x + 0.3 } : f)) };
  assert.notEqual(sceneRevision(spec(moved)), base, 'furniture moved');
  assert.notEqual(sceneRevision(spec(setFinish(p, p.rooms[0], 'floor', 'lam_se002', 'room'))), base, 'floor changed');
  assert.notEqual(sceneRevision(spec(setRefPrefs(p, p.rooms[0], 'floor', { mandatory: false }))), base, 'binding changed');
  assert.notEqual(sceneRevision(spec(p, { style: 'loft' })), base, 'style changed');
  assert.notEqual(sceneRevision(spec(p, { camera: { ...CAM, position: { x: 0.5, y: 4.5, z: 1.6 } } })), base, 'camera changed');
  assert.notEqual(sceneRevision(spec({ ...p, height: 3 })), base, 'ceiling changed');
  // a change in another room that does not touch this one
  const other = setFinish(p, p.rooms[1], 'walls', 'paint_mid_clay', 'room');
  assert.equal(sceneRevision(spec(other)), base, 'another room repainted');
  // moving the whole room keeps the room-relative scene (camera moved with it)
  // (moveRoom carries the room's furniture along)
  const shifted = moveRoom({ ...p, rooms: p.rooms.filter((r) => r.id === 'bed'), openings: p.openings.filter((o) => o.type === 'window') }, 'bed', 10, 0);
  const a = sceneSpec({ ...p, rooms: p.rooms.filter((r) => r.id === 'bed'), openings: p.openings.filter((o) => o.type === 'window') }, { roomId: 'bed', camera: CAM, style: 'scandi' });
  const b = sceneSpec(shifted, { roomId: 'bed', camera: { ...CAM, position: { ...CAM.position, x: CAM.position.x + 10 }, target: { ...CAM.target, x: CAM.target.x + 10 } }, style: 'scandi' });
  assert.equal(sceneRevision(b), sceneRevision(a), 'position on the plan does not matter');
});

test('canonical JSON does not depend on key order', () => {
  assert.equal(canonical({ b: 1, a: [{ d: 2, c: 3 }] }), canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
});

test('validation refuses what is not a scene, and strips everything unknown', () => {
  const good = JSON.parse(JSON.stringify(spec()));
  const bad = [
    null, {}, { ...good, version: 2 },
    { ...good, room: { ...good.room, purpose: 'castle' } },
    { ...good, room: { ...good.room, ceiling: 40 } },
    { ...good, room: { ...good.room, area: 'big' } },
    { ...good, room: { ...good.room, polygon: good.room.polygon.slice(0, 2) } },
    { ...good, furniture: [{ ...good.furniture[0], type: 'piano' }] },
    { ...good, furniture: new Array(SCENE_LIMITS.maxFurniture + 1).fill(good.furniture[0]) },
    { ...good, materials: [{ ...good.materials[0], materialId: 'unknown_floor' }] },
    { ...good, materials: [good.materials[0], good.materials[0]] },
    { ...good, openings: [{ ...good.openings[0], width: Number.NaN }] },
    { ...good, camera: { ...good.camera, fov: 170 } },
    { ...good, style: 'baroque' },
  ];
  for (const b of bad) assert.equal(validateScene(b).spec, null, JSON.stringify(b)?.slice(0, 80));
  const withExtras = { ...good, note: 'x', room: { ...good.room, name: 'free text' }, materials: good.materials.map((m) => ({ ...m, name: 'EVIL', kind: 'product-image' })) };
  const v = validateScene(withExtras);
  assert.deepEqual(v.errors, []);
  assert.ok(!JSON.stringify(v.spec).includes('free text') && !JSON.stringify(v.spec).includes('EVIL'));
  assert.equal(v.spec.materials[0].kind, 'product-approx', 'the kind is recomputed from the catalog, not taken from the request');
});

test('instructions: binding layout, sizes, finishes with their sample images, honest about samples', () => {
  const s = spec();
  const text = buildRenderPrompt(s, { materialImages: ['floor', 'walls'] });
  assert.match(text, /Image 1 is a simple 3D layout sketch/);
  assert.match(text, /do not add, remove or move doors, windows or walls/);
  assert.match(text, /Room: 4\.00 m × 5\.00 m \(floor area 20\.0 m²\), ceiling height 2\.70 m/);
  assert.match(text, /double bed, 1\.60 m × 2\.00 m × 0\.50 m, ahead of the camera/);
  assert.match(text, /floor \[use as specified\]: .*KT502 Lussac Ash.*Kastamonu Entegre; Image 2 is a drawn sample of it \(approximate, not a photograph\)/);
  assert.match(text, /walls \[use as specified\]: .*Image 3/);
  assert.match(text, /Scandinavian/);
  assert.match(text, /No people, no text/);
  const fromMiddle = buildRenderPrompt(spec(bedroom(), { camera: { position: { x: 2, y: 2.5, z: 1.6 }, target: { x: 2, y: 4.5, z: 1.2 }, fov: 64 } }));
  assert.doesNotMatch(fromMiddle, /north wall/, 'a wall behind the camera is left out');
  assert.match(fromMiddle, /south wall/);
  assert.doesNotMatch(text, /https?:/);
});

test('saved renders are validated when a project is opened', () => {
  const ok = {
    id: '0f8fad5b-d9cb-469f-a165-70867728950e', roomId: 'bed', sceneRevision: 's1-0123456789abcd', createdAt: '2026-10-28T12:00:00.000Z',
    provider: 'openai', model: 'gpt-image-2.5-sunburst', quality: 'medium', aspect: 'landscape', style: 'scandi', costUsd: 0.08, costBasis: 'usage', camera: CAM,
  };
  const p = migrateProject({ ...bedroom(), renders: [ok, { ...ok }, { ...ok, id: 'x' }, { ...ok, id: 'aaaaaaaa-1', sceneRevision: 'abc' }, { ...ok, id: 'aaaaaaaa-2', camera: null }, { ...ok, id: 'aaaaaaaa-3', provider: 'midjourney', costUsd: -1 }, 'junk'] });
  assert.equal(p.renders.length, 2);
  assert.deepEqual(p.renders[0], ok);
  assert.equal(p.renders[1].provider, 'unknown');
  assert.equal(p.renders[1].costUsd, null);
  assert.deepEqual(cleanRenders('x'), []);
  assert.deepEqual(migrateProject({ ...bedroom() }).renders, [], 'older projects get an empty list');
});
