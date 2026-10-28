// The acceptance flow on the data level, through the same store the editor uses: draw a
// 4 × 5 m bedroom, add a 160 × 200 cm bed and a wardrobe, move and rotate them, undo and
// redo, save, and open the project again without losing the arrangement.
import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
globalThis.localStorage = new MemoryStorage();

const store = await import('../src/ui/store.js');
const { emptyProject, makeRoom } = await import('../src/core/model.js');
const { rectPoints } = await import('../src/core/geometry.js');
const { autoPlace, analyzeFurniture } = await import('../src/core/layout.js');
const { addFurniture, updateFurniture, moveFurniture, rotateFurniture, duplicateFurniture, deleteFurniture } = await import('../src/core/ops.js');

const pos = (f) => [f.x, f.y, f.rot, f.w, f.d];
const byType = (p, t) => p.furniture.find((f) => f.type === t);

test('bedroom acceptance flow: arrange, undo/redo, save and reload', () => {
  store.resetHistory();
  const room = makeRoom(rectPoints(0, 0, 4, 5), 'bedroom');
  store.commit({ ...emptyProject(), rooms: [room] }, { history: false });

  // add the bed from the library and set it to 160 × 200
  let bed = autoPlace(store.state.project, 'bed_double', room.id);
  store.commit(addFurniture(store.state.project, bed));
  store.commit(updateFurniture(store.state.project, bed.id, { w: 1.6, d: 2.0 }));
  // and a wardrobe
  const wr = autoPlace(store.state.project, 'wardrobe', room.id);
  store.commit(addFurniture(store.state.project, wr));
  assert.equal(store.state.project.furniture.length, 2);

  // drag the bed: previews do not enter the history, the drop is one undo step
  const before = pos(byType(store.state.project, 'bed_double'));
  for (const dx of [0.1, 0.2, 0.3]) store.preview(moveFurniture(store.state.project, bed.id, dx, 0));
  store.commit(store.state.draft);
  bed = byType(store.state.project, 'bed_double');
  assert.equal(bed.x, before[0] + 0.3);
  // rotate the wardrobe
  store.commit(rotateFurniture(store.state.project, wr.id, 90));
  const arranged = JSON.parse(JSON.stringify(store.state.project.furniture));

  store.undo();
  assert.equal(byType(store.state.project, 'wardrobe').rot, wr.rot, 'rotation undone');
  store.undo();
  assert.deepEqual(pos(byType(store.state.project, 'bed_double')), before, 'move undone in one step');
  store.redo();
  store.redo();
  assert.deepEqual(store.state.project.furniture, arranged);

  // selection of a deleted piece is cleared, and comes back with undo
  store.setSelection({ type: 'furniture', id: wr.id });
  store.commit(deleteFurniture(store.state.project, wr.id));
  assert.equal(store.state.selection, null);
  store.undo();
  assert.equal(store.state.project.furniture.length, 2);

  // duplicate and remove again
  const dup = duplicateFurniture(store.state.project, wr.id);
  store.commit(dup.project);
  assert.equal(store.state.project.furniture.length, 3);
  store.undo();

  // save, then open the project as on the next visit
  store.saveNow();
  const loaded = store.loadSaved();
  assert.equal(loaded.notice, null);
  assert.deepEqual(loaded.project.furniture, store.state.project.furniture);
  assert.deepEqual(loaded.project.furniture, arranged);
  const issues = analyzeFurniture(loaded.project);
  for (const f of loaded.project.furniture) assert.ok(issues.has(f.id));
});

test('snapping preference is remembered per browser', () => {
  store.setSnap({ grid: true });
  assert.deepEqual(store.state.snap, { walls: true, grid: true });
  assert.equal(JSON.parse(localStorage.getItem('bina-designer:snap:v1')).grid, true);
  store.setSnap({ walls: false, grid: false });
});

test('a damaged saved piece is reported when the project opens', () => {
  const p = { ...emptyProject(), rooms: [makeRoom(rectPoints(0, 0, 4, 5), 'bedroom')] };
  p.furniture = [{ id: 'x', type: 'teleporter', x: 1, y: 1 }];
  localStorage.setItem('bina-designer:project:v1', JSON.stringify(p));
  const r = store.loadSaved();
  assert.match(r.notice, /1 ავეჯი/);
  assert.deepEqual(r.project.furniture, []);
});
