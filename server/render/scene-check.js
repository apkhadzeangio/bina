// Server-side check of a Stage 05 scene ('bina.ai-scene' v1) before anything is sent to an
// image provider. Implements the Stage 05 contract (docs/stage05/stage06.md):
//   1. structure: the JSON Schema in schemas/bina.ai-scene.v1.schema.json;
//   2. identity: the revision is recomputed from the content with the browser's own rule;
//   3. cross-field facts: walls agree with the polygon, openings sit on existing walls,
//      furniture footprints follow from position/size/rotation, the camera stands at a safe
//      point inside the room, material assignments use catalog products the server knows;
//   4. unresolved mandatory materials stop the request (the user must correct them).
// The result keeps only what the prompt needs. Free text from the request is limited to
// the user's quoted creative suggestion; product names, colours and sizes come from the
// server's own catalog, never from strings in the request.
import schema from '../../schemas/bina.ai-scene.v1.schema.json' with { type: 'json' };
import { compileSchema } from './json-schema.js';
import { RenderError } from './errors.js';
import { SCENE_FORMAT, SCENE_VERSION, sceneRevisionOf } from '../../src/core/scene.js';
import { validCamera, ASPECTS } from '../../src/core/scene-camera.js';
import { LIGHTING, creativeText } from '../../src/core/scene-prompt.js';
import { corners } from '../../src/core/furniture.js';
import { isValidPolygon } from '../../src/core/geometry.js';
import { PURPOSES, OPENING_TYPES } from '../../src/core/model.js';
import { MATERIALS, STYLES } from '../../src/core/catalog.js';
import { product, refKind } from '../../src/core/products.js';
import { SURFACES, GLOBAL_SURFACES } from '../../src/core/finishes.js';
import { FURNITURE } from '../../src/core/furniture.js';

const validate = compileSchema(schema);

export const SCENE_LIMITS = { points: 64, openings: 64, furniture: 120, materials: 24, coord: 1000 };
export const ASPECT_KEYS = { '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1 };
export const DIRECTIONS = ['along', 'across', 'horizontal', 'vertical'];

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const nearPoint = (p, q, tol = 1e-6) => near(p.x, q.x, tol) && near(p.y, q.y, tol);

export function aspectKey(aspect) {
  return Object.keys(ASPECT_KEYS).find((k) => Math.abs(ASPECT_KEYS[k] - aspect) < 1e-8) || null;
}

// Throws RenderError('bad_scene' | 'scene_mismatch' | 'unresolved_material') or returns
// { scene, revision, aspect, room, materials } for the prompt builder.
export function checkScene(scene, { expectedRevision } = {}) {
  const fail = (detail, code = 'bad_scene', status = 400) => { throw new RenderError(code, status, { detail }); };
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) fail('scene missing');

  // Cheap size limits first, so the schema check never walks a huge payload.
  if (!Array.isArray(scene.room?.polygon) || scene.room.polygon.length > SCENE_LIMITS.points) fail('room polygon size');
  if (!Array.isArray(scene.openings) || scene.openings.length > SCENE_LIMITS.openings) fail('too many openings');
  if (!Array.isArray(scene.furniture) || scene.furniture.length > SCENE_LIMITS.furniture) fail('too much furniture');
  if (!Array.isArray(scene.materials) || scene.materials.length > SCENE_LIMITS.materials) fail('too many materials');

  let errors;
  try {
    errors = validate(scene);
  } catch (e) {
    fail(`schema: ${e.message}`);
  }
  if (errors.length) fail(`schema: ${errors.slice(0, 5).join('; ')}`);
  if (scene.format !== SCENE_FORMAT || scene.version !== SCENE_VERSION) fail('format/version');

  // identity
  const revision = sceneRevisionOf(scene);
  if (scene.revision !== revision || scene.camera.sceneRevision !== revision) fail(`revision ${scene.revision} does not match its content (${revision})`, 'scene_mismatch', 409);
  if (expectedRevision && expectedRevision !== revision) fail(`${expectedRevision} != ${revision}`, 'scene_mismatch', 409);

  // room and walls
  const r = scene.room;
  if (!PURPOSES[r.type]) fail('room type');
  const pts = r.polygon;
  if (pts.some((p) => Math.abs(p.x) > SCENE_LIMITS.coord || Math.abs(p.y) > SCENE_LIMITS.coord)) fail('coordinates out of range');
  if (!isValidPolygon(pts)) fail('room polygon is not a valid room outline');
  if (!(r.ceilingHeight >= 1.5 && r.ceilingHeight <= 10)) fail('ceiling height');
  if (r.walls.length !== pts.length) fail('walls do not follow the polygon');
  r.walls.forEach((w, i) => {
    if (w.index !== i || !nearPoint(w.start, pts[i]) || !nearPoint(w.end, pts[(i + 1) % pts.length])) fail(`wall ${i} does not follow the polygon`);
    if (!near(w.length, Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y), 1e-6)) fail(`wall ${i} length`);
  });

  // openings
  for (const o of scene.openings) {
    if (!OPENING_TYPES[o.type]) fail('opening type');
    if (!Number.isInteger(o.edge) || o.edge < 0 || o.edge >= r.walls.length) fail(`opening ${o.id} is not on a wall of the room`);
    if (!(o.width > 0 && o.height > 0 && o.sill >= 0)) fail(`opening ${o.id} size`);
  }

  // furniture: the footprint must be the one its position, size and rotation give
  const furniture = scene.furniture.map((f) => ({ id: f.id, roomId: r.id, type: f.type, x: f.position.x, y: f.position.y, w: f.size.width, d: f.size.depth, h: f.size.height, rot: f.rotation }));
  for (const [i, f] of furniture.entries()) {
    if (!FURNITURE[f.type]) fail('furniture type');
    if (!(f.w > 0 && f.d > 0 && f.h > 0)) fail(`furniture ${f.id} size`);
    const expected = corners(f);
    const given = scene.furniture[i].footprint;
    if (!Array.isArray(given) || given.length !== 4 || !given.every((q, k) => nearPoint(q, expected[k], 1e-4))) fail(`furniture ${f.id} footprint`);
  }

  // camera: ready, in this room, at a safe eye point, with a supported frame
  const c = scene.camera;
  const aspect = aspectKey(c.aspect);
  if (c.status !== 'ready') fail('no usable camera: choose a viewpoint in the scene step');
  if (!aspect || !ASPECTS.some((a) => Math.abs(a - c.aspect) < 1e-8)) fail('camera aspect');
  const pseudoRoom = { id: r.id, points: pts, height: r.ceilingHeight };
  const pseudoProject = { height: r.ceilingHeight, furniture };
  if (!validCamera(pseudoProject, pseudoRoom, c)) fail('camera is not at a safe point inside the room');

  // preferences
  const pref = scene.preferences;
  if (!STYLES[pref.style] || !LIGHTING[pref.lighting]) fail('style or lighting');
  let instructions;
  try {
    instructions = creativeText(pref.instructions);
  } catch (e) {
    fail('instructions');
  }
  if (instructions !== pref.instructions) fail('instructions are not normalised');

  // materials: catalog products only; surfaces that exist; one entry per key
  const keys = new Set();
  const materials = [];
  const unresolvedMandatory = [];
  for (const m of scene.materials) {
    if (keys.has(m.key)) fail(`duplicate material ${m.key}`);
    keys.add(m.key);
    const surface = m.target.surface;
    const roomScoped = m.target.roomId !== null;
    if (roomScoped ? m.target.roomId !== r.id || !SURFACES[surface] : !GLOBAL_SURFACES[surface]) fail(`material ${m.key} target`);
    if (m.key !== `${roomScoped ? r.id : '*'}|${surface}`) fail(`material ${m.key} key`);
    if (m.status === 'unresolved') {
      if (m.mandatory) unresolvedMandatory.push(m.key);
      continue; // a flexible unknown product is left out of the prompt, never replaced
    }
    const mat = MATERIALS[m.materialId];
    if (!mat) fail(`material ${m.key}: unknown product ${m.materialId}`);
    const p = product(m.materialId);
    if (m.kind !== refKind(p)) fail(`material ${m.key}: reference kind`);
    const allowed = roomScoped ? SURFACES[surface].cats(PURPOSES[r.type]) : GLOBAL_SURFACES[surface].cats();
    if (!allowed.includes(mat.cat)) fail(`material ${m.key}: ${mat.cat} cannot be used on ${surface}`);
    materials.push({
      key: m.key, surface, roomScoped, materialId: m.materialId, mandatory: m.mandatory, kind: m.kind, product: p,
      direction: DIRECTIONS.includes(m.layout?.direction) ? m.layout.direction : null,
      colorIsPreference: !!p.verification.evidence?.base,
    });
  }
  if (unresolvedMandatory.length) {
    throw new RenderError('unresolved_material', 422, { detail: unresolvedMandatory.join(', ') });
  }

  return {
    scene,
    revision,
    aspect,
    room: { id: r.id, type: r.type, polygon: pts, walls: r.walls, bounds: r.bounds, area: r.areaM2, ceiling: r.ceilingHeight },
    openings: scene.openings,
    furniture,
    camera: c,
    preferences: { style: pref.style, lighting: pref.lighting, instructions },
    materials,
  };
}
