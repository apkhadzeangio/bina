import * as G from './geometry.js';
import { roomLabel } from './model.js';
import { corners } from './furniture.js';
import { roomHeight, kitchenRuns, GEOMETRY_RULES } from './measure.js';
import { roomBoard, apartmentBoard } from './references.js';
import { globalKey, refPrefs } from './finishes.js';
import { MATERIALS, STYLES } from './catalog.js';
import { sceneCamera, roomOpenings, validCamera } from './scene-camera.js';
import { creativeText, LIGHTING } from './scene-prompt.js';

export const SCENE_FORMAT = 'bina.ai-scene';
export const SCENE_VERSION = 1;
export const APP_VERSION = '1.0.0';
export const COORDINATES = {
  units: 'metres', x: 'plan right', y: 'plan down', z: 'height above floor',
  polygonWinding: 'clockwise in plan', rotation: 'clockwise plan degrees',
  threeMapping: 'world.x=scene.x; world.y=scene.z; world.z=scene.y', fov: 'vertical degrees',
};

export function canonical(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite scene value');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
// Content identification, not an authentication/security digest. UTF-8 FNV-1a 64-bit.
export function fingerprint(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonical(value))) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return `fnv1a64-${hash.toString(16).padStart(16, '0')}`;
}
const point = (p) => ({ x: p.x, y: p.y });
const roomFact = (r) => ({ id: r.id, name: r.name, purpose: r.purpose, points: r.points.map(point), height: r.height, tileHeight: r.tileHeight });
const furnitureFact = (f) => ({ id: f.id, roomId: f.roomId, type: f.type, x: f.x, y: f.y, w: f.w, d: f.d, h: f.h, rot: f.rot });
const openingFact = (o) => ({ id: o.id, roomId: o.roomId, edge: o.edge, offset: o.offset, type: o.type, width: o.width, height: o.height, sill: o.sill });

// Whitelist project content: no title, imported image, arbitrary attributes or pricing.
export function projectFingerprint(project) {
  return fingerprint({ version: project.version, height: project.height, style: project.style, tier: project.tier,
    rooms: project.rooms.map(roomFact), openings: project.openings.map(openingFact),
    furniture: (project.furniture || []).map(furnitureFact), finish: project.finish });
}

function sceneMaterials(project, room, openings) {
  const refs = [...roomBoard(project, room), ...apartmentBoard(project).filter((r) => r.target.surface === 'door'
    ? openings.some((o) => o.type === 'door') : openings.some((o) => o.type === 'window'))];
  return refs.map((ref) => {
    const r = ref.target.roomId ? room : null;
    const surface = ref.target.surface;
    const explicit = project.finish?.rooms?.[r?.id]?.[surface]
      || project.finish?.global?.[globalKey(r?.purpose, surface, project.tier)];
    if (explicit && !MATERIALS[explicit]) return {
      key: ref.key, target: ref.target, materialId: explicit, status: 'unresolved', kind: null,
      mandatory: refPrefs(project, r, surface).explicit ? refPrefs(project, r, surface).mandatory : true,
      chosenBy: project.finish?.rooms?.[r?.id]?.[surface] ? 'room' : 'apartment',
      material: null, identity: null, visual: { image: null, swatch: null }, layout: null, prompt: '',
    };
    const identity = ref.identity ? (({ price, availability, ...rest }) => rest)(ref.identity) : null;
    return { key: ref.key, target: ref.target, materialId: ref.materialId, status: 'resolved',
      kind: ref.kind, mandatory: ref.mandatory, chosenBy: ref.chosenBy,
      material: ref.material, identity, visual: ref.visual, layout: ref.layout, prompt: ref.prompt };
  });
}

// The negative constraints every scene carries. Consumers (the render server) use this
// constant rather than the copy inside a received scene.
export const EXCLUSIONS = Object.freeze(['Do not add windows or doors.', 'Do not move, remove or reshape structural walls.',
  'Do not remove essential furniture or change its footprint, placement or rotation.',
  'Do not invent room connections.', 'Do not replace mandatory products or reinterpret their intended surfaces.',
  'Do not invent missing dimensions, manufacturer photos or product facts.']);

// The revision of a compiled scene, recomputed from its content. Excluded: the project
// fingerprint (an unrelated room can change it), reference capture status, the revision
// itself and the camera's copy of it. compileScene uses this function too, so a scene that
// arrives at the server can be checked with exactly the browser's rule.
export function sceneRevisionOf(scene) {
  const { projectFingerprint, references, revision, camera, ...rest } = scene;
  const { sceneRevision, ...cam } = camera || {};
  return fingerprint({ ...rest, camera: cam });
}

export function compileScene(project, roomId, settings = {}, cameraOverride = null) {
  if (project?.version !== 2) throw new Error('Scene compilation requires a migrated schema 2 project');
  const room = project.rooms.find((r) => r.id === roomId);
  if (!room || !G.isValidPolygon(room.points)) throw new Error('Select a valid room');
  const h = roomHeight(room, project);
  const openings = roomOpenings(project, room);
  const lighting = settings.lighting || 'daylight';
  if (!LIGHTING[lighting]) throw new Error('Unknown lighting mood');
  // A style chosen for the picture only (Stage 06) does not change the project's style, so
  // the default materials and the estimate stay as they are.
  const style = settings.style && STYLES[settings.style] ? settings.style : project.style;
  const prefs = { style, lighting, instructions: creativeText(settings.instructions) };
  const generatedCamera = sceneCamera(project, room, {
    preset: settings.preset || 'entrance', aspect: settings.aspect ?? 16 / 9, fov: settings.fov, custom: settings.custom,
  });
  let camera = generatedCamera;
  if (cameraOverride) {
    if (!validCamera(project, room, cameraOverride)) throw new Error('Unsafe or invalid custom camera');
    const { status, roomId: rid, preset, position, target, fov, aspect, fallback } = cameraOverride;
    camera = { status, roomId: rid, preset, position: { ...position }, target: { ...target }, fov, aspect, fallback: fallback || null };
  }
  const materials = sceneMaterials(project, room, openings);
  const furniture = (project.furniture || []).filter((f) => f.roomId === room.id).map((f) => ({
    id: f.id, type: f.type, position: { x: f.x, y: f.y, z: 0 },
    size: { width: f.w, depth: f.d, height: f.h }, rotation: f.rot, footprint: corners(f),
  }));
  const walls = G.edges(room.points).map((e) => ({ index: e.i, start: point(e.a), end: point(e.b), length: e.len,
    orientation: Math.atan2(e.uy, e.ux) * 180 / Math.PI, inward: { x: e.nx, y: e.ny } }));
  const constraints = {
    hard: {
      preserve: ['/room/polygon', '/room/walls', '/room/ceilingHeight', '/openings', '/furniture', '/finishRegions'],
      mandatoryMaterials: materials.filter((r) => r.mandatory).map((r) => ({ key: r.key, materialId: r.materialId, status: r.status })),
    },
    flexible: {
      materials: materials.filter((r) => !r.mandatory).map((r) => r.key),
      allowed: ['decorative accessories', 'lighting atmosphere', 'nonstructural styling', 'small decorative elements without spatial conflicts'],
    },
    exclusions: [...EXCLUSIONS],
    limitation: 'Generative image models cannot guarantee geometric precision; future renders require validation against structured geometry.',
  };
  const b = G.bounds(room.points);
  const scene = {
    format: SCENE_FORMAT, version: SCENE_VERSION, applicationVersion: APP_VERSION,
    coordinates: COORDINATES, projectFingerprint: projectFingerprint(project),
    room: { id: room.id, name: roomLabel(room, project.rooms), type: room.purpose,
      polygon: room.points.map(point), bounds: b, areaM2: G.area(room.points), ceilingHeight: h,
      heightSource: room.height != null ? 'room' : project.height != null ? 'project' : 'application-default', walls },
    openings, furniture, materials,
    finishRegions: { tileHeight: room.tileHeight ?? null, kitchenRuns: kitchenRuns(room, project),
      conventions: { counterHeight: GEOMETRY_RULES.counterHeight, backsplashHeight: GEOMETRY_RULES.backsplashHeight, counterDepth: GEOMETRY_RULES.counterDepth },
      note: 'Kitchen surface regions use application measurement conventions, not independently measured dimensions.' },
    preferences: prefs, camera, constraints,
    references: {
      plan: { status: 'pending', filename: null, reason: 'Reference not captured yet.' },
      blockout: { status: 'pending', filename: null, reason: 'Reference not captured yet.' },
    },
    warnings: [
      ...materials.filter((r) => r.status === 'unresolved').map((r) => `Unresolved material ${r.materialId} on ${r.key}; no substitution authorized.`),
      ...openings.filter((o) => o.offset - o.width / 2 < 0 || o.offset + o.width / 2 > walls[o.edge].length || o.sill + o.height > h).map((o) => `Opening ${o.id} exceeds its wall bounds; recorded dimensions retained and visible span clipped as in the viewer.`),
      ...(camera.fallback ? [camera.fallback] : []),
    ],
  };
  // Neither export timestamps, asset availability nor the full-project fingerprint changes
  // the selected room's revision. The latter can change for an unrelated room edit.
  const out = JSON.parse(JSON.stringify(scene));
  const revision = sceneRevisionOf(out);
  return { ...out, revision, camera: { ...out.camera, sceneRevision: revision } };
}
