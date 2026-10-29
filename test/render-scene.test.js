// Stage 06 on top of Stage 05: the scene the render server accepts, the instructions it
// builds from it, the render-only style, and saved render records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { unzipSync, strFromU8 } from 'fflate';
import { bedroomProject, kitchenProject } from './fixtures/scene.js';
import { compileScene, sceneRevisionOf, EXCLUSIONS } from '../src/core/scene.js';
import { compileSchema } from '../server/render/json-schema.js';
import { checkScene } from '../server/render/scene-check.js';
import { buildRenderPrompt, sideFromCamera } from '../src/core/render-prompt.js';
import { makeRecord, renderIsCurrent, recordScene, frameKey } from '../src/core/render-record.js';
import { migrateProject, cleanRenders } from '../src/core/model.js';
import { computeEstimate } from '../src/core/quantities.js';
import { setFinish } from '../src/core/finishes.js';
import { makeFurniture } from '../src/core/furniture.js';

const schema = JSON.parse(readFileSync(new URL('../schemas/bina.ai-scene.v1.schema.json', import.meta.url)));
const ajv = new Ajv({ allErrors: true });
const ajvValidate = ajv.compile(schema);
const mini = compileSchema(schema);
const clone = (v) => JSON.parse(JSON.stringify(v));
const examples = ['bedroom', 'kitchen', 'webgl-unavailable'].map((n) => {
  const z = unzipSync(readFileSync(new URL(`../docs/stage05/examples/${n}.zip`, import.meta.url)));
  return JSON.parse(strFromU8(z['bina-scene/scene.json']));
});

// ------------------------------------------------------------------ schema check (Workers-safe)
test('the server schema check agrees with Ajv on Stage 05 scenes and on broken ones', () => {
  const scenes = [...examples, compileScene(bedroomProject(), 'bedroom', {}), compileScene(kitchenProject(), 'room-0', { preset: 'window', aspect: 1 })];
  const mutations = [
    (s) => { s.version = 2; },
    (s) => { delete s.room; },
    (s) => { s.extra = 1; },
    (s) => { s.camera.aspect = 1.5; },
    (s) => { s.camera.fov = 120; },
    (s) => { s.camera.status = 'unavailable'; }, // position must then be null
    (s) => { s.materials[0].kind = 'photo'; },
    (s) => { s.materials[0].status = 'maybe'; },
    (s) => { s.preferences.instructions = 'x'.repeat(1201); },
    (s) => { s.preferences.lighting = 'disco'; },
    (s) => { s.revision = 'fnv1a64-xyz'; },
    (s) => { s.references.plan = { status: 'included', filename: 'evil.png', reason: null }; },
    (s) => { s.room.polygon = 'square'; },
    (s) => { s.furniture[0] = { ...s.furniture[0], rotation: 'left' }; },
    (s) => { s.openings.push({}); },
  ];
  let checked = 0;
  for (const s of scenes) {
    assert.deepEqual(mini(s), [], 'valid scene');
    assert.equal(ajvValidate(s), true);
    for (const mutate of mutations) {
      const m = clone(s);
      try { mutate(m); } catch (e) { continue; } // a mutation that does not apply to this scene
      const ours = mini(m).length === 0;
      assert.equal(ours, ajvValidate(m), `${mutate} → ours ${ours}, Ajv ${!ours}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 60);
});

test('the schema check refuses unsupported keywords instead of ignoring them', () => {
  assert.throws(() => compileSchema({ type: 'object', patternProperties: {} })({}), /Unsupported schema keyword patternProperties/);
});

// ------------------------------------------------------------------ revision identity
test('the server recomputes exactly the revision the browser compiled', () => {
  for (const ex of examples) assert.equal(sceneRevisionOf(ex), ex.revision);
  const p = kitchenProject();
  for (const settings of [{}, { preset: 'window' }, { preset: 'wide', aspect: 4 / 3 }, { lighting: 'evening', instructions: 'ტესტი' }, { style: 'loft' }]) {
    const s = compileScene(p, 'room-0', settings);
    assert.equal(sceneRevisionOf(s), s.revision);
    assert.equal(sceneRevisionOf(clone(s)), s.revision, 'JSON round trip keeps the revision');
    assert.equal(checkScene(clone(s)).revision, s.revision);
  }
});

// ------------------------------------------------------------------ render-only style
test('a style chosen for the render changes the scene, not the project, its materials or its estimate', () => {
  const p = kitchenProject();
  const base = compileScene(p, 'room-0', {});
  const loft = compileScene(p, 'room-0', { style: 'loft' });
  assert.equal(base.preferences.style, p.style);
  assert.equal(loft.preferences.style, 'loft');
  assert.notEqual(loft.revision, base.revision);
  assert.equal(loft.projectFingerprint, base.projectFingerprint);
  assert.deepEqual(loft.materials.map((m) => m.materialId), base.materials.map((m) => m.materialId), 'same products');
  assert.equal(compileScene(p, 'room-0', { style: 'neon' }).preferences.style, p.style, 'unknown styles fall back');
  // saved settings survive a reload; the estimate is the project's, untouched
  const saved = migrateProject(clone({ ...p, scenePreparation: { roomId: 'room-0', rooms: { 'room-0': { style: 'loft', lighting: 'warm' } } } }));
  assert.equal(saved.scenePreparation.rooms['room-0'].style, 'loft');
  assert.equal(saved.style, p.style);
  assert.equal(computeEstimate(saved).total, computeEstimate(migrateProject(clone(p))).total);
});

// ------------------------------------------------------------------ the instructions for the model
test('acceptance prompt: 4 × 5 m bedroom, bed, wardrobe, floor and walls, camera and style', () => {
  let p = bedroomProject();
  p = setFinish(p, p.rooms[0], 'walls', 'paint_mid_sage', 'room');
  const scene = compileScene(p, 'bedroom', { preset: 'opposite', style: 'scandi' });
  const checked = checkScene(clone(scene));
  const refs = [{ role: 'blockout' }, { role: 'plan' }, { role: 'material', key: 'bedroom|floor' }, { role: 'material', key: 'bedroom|walls' }];
  const prompt = buildRenderPrompt(checked, { references: refs });
  assert.match(prompt, /^Create a photorealistic interior photograph of a bedroom\./);
  assert.match(prompt, /Room: 4\.00 m × 5\.00 m overall \(floor area 20\.0 m²\), ceiling height 2\.80 m\./);
  assert.match(prompt, /double bed, 1\.60 m × 2\.00 m × 0\.50 m/);
  assert.match(prompt, /tall wardrobe/);
  assert.match(prompt, /floor \[use as specified\]:.*KT502 Lussac Ash.*Image 3 is a drawn sample/);
  assert.match(prompt, /walls \[use as specified\]:.*tinted paint: the colour is a preference.*Image 4/);
  assert.match(prompt, /Interior style: Scandinavian/);
  assert.match(prompt, /window 1\.40 m wide × 1\.50 m high, sill at 0\.90 m/);
  for (const x of EXCLUSIONS) assert.ok(prompt.includes(x), x);
  assert.ok(!prompt.includes('საძინებელი'), 'the room name typed by the user is not sent');
  assert.ok(!/₾|GEL|price/i.test(prompt), 'no prices');
  assert.ok(!prompt.includes('Optional suggestion'), 'no suggestion section without user text');
});

test('the camera decides which walls and furniture are described', () => {
  const cam = { position: { x: 0, y: 0 }, target: { x: 0, y: -1 } }; // looking "north" (plan y up)
  assert.equal(sideFromCamera(cam, { x: 0, y: -3 }), 'ahead');
  assert.equal(sideFromCamera(cam, { x: 1, y: -2 }), 'ahead-right');
  assert.equal(sideFromCamera(cam, { x: -1, y: -2 }), 'ahead-left');
  assert.equal(sideFromCamera(cam, { x: 3, y: 0 }), 'right');
  assert.equal(sideFromCamera(cam, { x: -3, y: 0.5 }), 'left');
  assert.equal(sideFromCamera(cam, { x: 0, y: 3 }), 'behind');
  assert.equal(sideFromCamera(cam, { x: 0.01, y: 0 }), 'here');
});

test('flexible unknown products are left out of the prompt, never replaced', () => {
  const scene = compileScene(bedroomProject(), 'bedroom', {});
  const m = scene.materials.find((x) => x.key === 'bedroom|ceiling');
  Object.assign(m, { materialId: 'gone_ceiling', status: 'unresolved', kind: null, mandatory: false, material: null, identity: null, layout: null, prompt: '', visual: { image: null, swatch: null } });
  scene.revision = sceneRevisionOf(scene);
  scene.camera.sceneRevision = scene.revision;
  const checked = checkScene(scene);
  assert.ok(!checked.materials.some((x) => x.key === 'bedroom|ceiling'));
  assert.doesNotMatch(buildRenderPrompt(checked), /ceiling \[/);
});

test('the longest scene stays far below the providers\' prompt limit', () => {
  const p = kitchenProject();
  const scene = compileScene(p, 'room-0', { instructions: 'ა'.repeat(1200) });
  const prompt = buildRenderPrompt(checkScene(clone(scene)), { references: [{ role: 'blockout' }, { role: 'plan' }, ...scene.materials.map((m) => ({ role: 'material', key: m.key }))] });
  assert.ok(prompt.length < 8000, `${prompt.length} characters (estimates assume 8000; OpenAI allows 32000)`);
});

// ------------------------------------------------------------------ saved renders
function savedRecord(p, settings = { preset: 'opposite', style: 'scandi' }) {
  const scene = compileScene(p, 'bedroom', settings);
  const response = { id: 'job-0001-abcd', sceneRevision: scene.revision, createdAt: '2026-10-29T10:00:00.000Z', provider: 'openai', model: 'gpt-image-2.5-sunburst', quality: 'medium', cost: { actualUsd: 0.12, estimatedUsd: 0.18, basis: 'usage' } };
  return makeRecord({ response, scene, settings });
}

test('a saved render knows its scene revision and whether the plan changed since', () => {
  let p = bedroomProject();
  p.rooms.push({ ...p.rooms[0], id: 'study', name: 'კაბინეტი', purpose: 'study', points: p.rooms[0].points.map((q) => ({ x: q.x + 4.2, y: q.y })) });
  const meta = savedRecord(p);
  assert.equal(meta.aspect, '16:9');
  assert.equal(frameKey(1), '1:1');
  assert.equal(renderIsCurrent(p, meta), true);
  assert.equal(recordScene(p, meta).revision, meta.sceneRevision);
  // it survives saving and loading the project
  const loaded = migrateProject(clone({ ...p, renders: [meta] }));
  assert.deepEqual(loaded.renders[0], meta);
  assert.equal(renderIsCurrent(loaded, loaded.renders[0]), true);
  // a change in another room does not make it outdated
  const other = setFinish(loaded, loaded.rooms[1], 'floor', 'lam_se010', 'room');
  assert.equal(renderIsCurrent(other, meta), true);
  // a different floor in this room does
  assert.equal(renderIsCurrent(setFinish(loaded, loaded.rooms[0], 'floor', 'lam_se010', 'room'), meta), false);
  // moved furniture does
  const moved = { ...loaded, furniture: loaded.furniture.map((f) => (f.id === 'bed' ? { ...f, x: f.x - 0.3 } : f)) };
  assert.equal(renderIsCurrent(moved, meta), false);
  // furniture placed where the camera stood makes the old camera unusable: outdated, no error
  const c = meta.camera.position;
  const blocked = { ...loaded, furniture: [...loaded.furniture, makeFurniture('wardrobe', c.x, c.y, 0, { id: 'w2', roomId: 'bedroom' })] };
  assert.equal(renderIsCurrent(blocked, meta), false);
  // a deleted room
  assert.equal(renderIsCurrent({ ...loaded, rooms: loaded.rooms.slice(1) }, meta), false);
});

test('render records are validated on load; images never live in the project', () => {
  const meta = savedRecord(bedroomProject());
  const bad = [
    { ...meta, id: 'x' },
    { ...meta, sceneRevision: 's1-00000000000000' },
    { ...meta, aspect: 'landscape' },
    { ...meta, camera: { ...meta.camera, position: { x: 'a', y: 0, z: 1 } } },
    { ...meta, createdAt: 'yesterday' },
    null,
  ];
  assert.deepEqual(cleanRenders([meta, ...bad, meta]), [meta], 'invalid and duplicate records are dropped');
  const withImage = cleanRenders([{ ...meta, image: 'data:image/jpeg;base64,AAAA', prompt: 'x' }]);
  assert.equal('image' in withImage[0], false);
  assert.equal('prompt' in withImage[0], false);
  assert.equal(cleanRenders([{ ...meta, settings: { ...meta.settings, style: 'neon', lighting: 'disco' } }])[0].settings.lighting, 'daylight');
});
