// Local saving: an unreadable saved project must be backed up (not silently replaced by the
// sample), a full browser storage must be reported, and pending edits must be written when
// the page is hidden or closed.
import test from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'bina-designer:project:v1';
const BACKUP = 'bina-designer:project:unreadable-backup';

class MemoryStorage {
  constructor() { this.m = new Map(); this.quota = Infinity; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    if (String(v).length > this.quota) throw new Error('QuotaExceededError');
    this.m.set(k, String(v));
  }
  removeItem(k) { this.m.delete(k); }
}
globalThis.localStorage = new MemoryStorage();

const store = await import('../src/ui/store.js');
const { sampleProject } = await import('../src/core/model.js');

test('no saved project: the sample opens without a notice', () => {
  localStorage.m.clear();
  const r = store.loadSaved();
  assert.equal(r.project.sample, true);
  assert.equal(r.notice, null);
});

test('unreadable saved project is backed up before it can be overwritten', () => {
  localStorage.m.clear();
  for (const raw of ['{broken json', '{"rooms": {}, "name": "my work"}', '"just a string"']) {
    localStorage.setItem(KEY, raw);
    const r = store.loadSaved();
    assert.equal(r.project.sample, true);
    assert.ok(r.notice);
    assert.equal(localStorage.getItem(BACKUP), raw);
  }
});

test('partly damaged project opens with the damaged items skipped and reported', () => {
  localStorage.m.clear();
  const p = sampleProject();
  p.sample = false;
  p.openings.push({ id: 'bad', roomId: p.rooms[0].id, edge: 42, offset: 1, type: 'door' });
  localStorage.setItem(KEY, JSON.stringify(p));
  const r = store.loadSaved();
  assert.equal(r.project.rooms.length, p.rooms.length);
  assert.equal(r.project.openings.length, p.openings.length - 1);
  assert.match(r.notice, /1 კარი/);
  assert.equal(localStorage.getItem(BACKUP), null);
});

test('a remote or script image stored as the plan image is ignored', () => {
  localStorage.m.clear();
  const p = { ...sampleProject(), sample: false };
  localStorage.setItem(KEY, JSON.stringify(p));
  localStorage.setItem('bina-designer:plan-image:v1', 'https://tracker.example/x.png');
  assert.equal(store.loadSaved().image, null);
  localStorage.setItem('bina-designer:plan-image:v1', 'data:image/jpeg;base64,AAAA');
  assert.equal(store.loadSaved().image, 'data:image/jpeg;base64,AAAA');
});

test('a failed save is reported once, and cleared when saving works again', () => {
  localStorage.m.clear();
  const events = [];
  const off = store.subscribe((k) => events.push(k));
  store.state.project = { ...sampleProject(), sample: false };
  localStorage.quota = 10;
  store.saveNow();
  store.saveNow();
  assert.ok(store.state.saveError);
  assert.equal(events.filter((k) => k === 'save').length, 1);
  localStorage.quota = Infinity;
  store.saveNow();
  assert.equal(store.state.saveError, null);
  assert.equal(events.filter((k) => k === 'save').length, 2);
  off();
});

test('flushSave writes a pending change immediately', () => {
  localStorage.m.clear();
  store.state.project = { ...sampleProject(), sample: false, name: 'pending' };
  store.commit({ ...store.state.project, name: 'edited just before closing' });
  assert.equal(localStorage.getItem(KEY), null); // still waiting for the debounce
  store.flushSave();
  assert.equal(JSON.parse(localStorage.getItem(KEY)).name, 'edited just before closing');
  store.flushSave(); // nothing pending: no error
});
