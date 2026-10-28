// Structured scene specification for AI interior rendering ('bina.scene' version 1).
//
// One room, seen from one camera, with its exact geometry, openings, furniture and chosen
// finishes. It is built from the project (the geometric model stays the source of truth),
// sent to the render server, validated there, and turned into the instructions for the
// image model. Every value is a number or an enum: names shown to the model come from the
// catalog on the server, never from free text in the request.
//
// Coordinates: metres, relative to the room's bounding box (x to the right / east,
// y down / south on the plan; z is height above the floor).
//
// The revision is a hash of the whole specification. A render is stored with the revision
// it was made from, so a later change to the plan, the materials, the camera or the style
// shows that the image is out of date.
import { bounds, edges, area } from './geometry.js';
import { PURPOSES, OPENING_TYPES } from './model.js';
import { roomHeight, openingHosts } from './measure.js';
import { FURNITURE } from './furniture.js';
import { STYLES, MATERIALS } from './catalog.js';
import { roomBoard, apartmentBoard } from './references.js';
import { product, refKind } from './products.js';

export const SCENE_FORMAT = 'bina.scene';
export const SCENE_VERSION = 1;

export const PURPOSE_EN = {
  living: 'living room', kitchenLiving: 'open-plan kitchen and living room', kitchen: 'kitchen', bedroom: 'bedroom',
  kids: "children's bedroom", study: 'home office', hall: 'entrance hall', wardrobe: 'walk-in wardrobe',
  bathroom: 'bathroom', wc: 'guest WC', laundry: 'laundry room', storage: 'storage room', balcony: 'balcony', other: 'room',
};

// The mood each kind of room is usually photographed in.
export const PURPOSE_MOOD = {
  living: 'inviting and relaxed, soft natural daylight', kitchenLiving: 'bright and practical, natural daylight from the windows',
  kitchen: 'bright and clean, practical lighting', bedroom: 'calm and restful, soft diffused daylight',
  kids: 'cheerful but tidy, soft daylight', study: 'focused and orderly, good daylight', hall: 'welcoming, warm artificial light',
  wardrobe: 'orderly, even light', bathroom: 'clean and bright, soft even light', wc: 'clean and bright', laundry: 'clean and practical',
  storage: 'plain and practical', balcony: 'open air, daylight', other: 'natural daylight',
};

export const OPENING_EN = {
  door: 'hinged interior door', arch: 'open doorway without a door', entrance: 'apartment entrance door',
  window: 'window', balcony: 'glazed balcony door',
};

export const FURNITURE_EN = {
  sofa: 'sofa', armchair: 'armchair', coffee_table: 'coffee table', tv_unit: 'low TV unit', bed_single: 'single bed',
  bed_double: 'double bed', wardrobe: 'tall wardrobe', bedside: 'bedside table', dining_table: 'dining table', chair: 'chair',
  desk: 'desk', kitchen_run: 'run of kitchen base cabinets with countertop', fridge: 'fridge', stove: 'cooker',
  sink: 'kitchen sink unit', toilet: 'toilet', bathtub: 'bathtub', shower: 'shower enclosure', vanity: 'washbasin vanity unit',
};

export const STYLE_EN = {
  modern: 'contemporary: neutral greys and white, large-format surfaces, clean lines, minimal decoration',
  scandi: 'Scandinavian: light oak, white walls, soft textiles, plenty of light, simple forms',
  warm: 'warm natural: natural oak, beige stone, clay and sand tones, linen and wool textiles',
  classic: 'neoclassical: herringbone parquet, marble, warm white walls, refined mouldings kept subtle',
  loft: 'loft: concrete textures, dark wood, graphite and black metal details',
};

export const SURFACE_KEYS = ['floor', 'walls', 'walls_upper', 'backsplash', 'countertop', 'cabinet', 'vanity', 'ceiling', 'skirting', 'sanitary', 'door', 'sill'];

export const SCENE_LIMITS = {
  maxPoints: 64, maxOpenings: 64, maxFurniture: 120, maxMaterials: 16,
  maxRoomSize: 60, minCeiling: 1.5, maxCeiling: 10, maxFov: 120, minFov: 20,
};

const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

// Where a point is seen from the camera: ahead, left, right or behind.
export function sideFromCamera(cam, q) {
  const fx = cam.target.x - cam.position.x;
  const fy = cam.target.y - cam.position.y;
  const vx = q.x - cam.position.x;
  const vy = q.y - cam.position.y;
  if (Math.hypot(vx, vy) < 0.05) return 'here';
  // plan y grows downward, so a positive cross product is a turn to the right
  const ang = Math.atan2(fx * vy - fy * vx, fx * vx + fy * vy) * (180 / Math.PI);
  if (Math.abs(ang) <= 40) return 'ahead';
  if (Math.abs(ang) >= 140) return 'behind';
  return ang > 0 ? 'right' : 'left';
}

function compass(nx, ny) {
  // (nx, ny) points out of the room; plan y grows to the south
  const a = Math.atan2(nx, -ny) * (180 / Math.PI);
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[((Math.round(a / 45) % 8) + 8) % 8];
}

// A default eye-level camera when none is given: in the corner opposite the room's largest
// piece of furniture, looking at the middle of the room.
export function defaultCamera(project, room) {
  const b = bounds(room.points);
  const mid = { x: b.minX + b.w / 2, y: b.minY + b.h / 2 };
  const inRoom = (project.furniture || []).filter((f) => f.roomId === room.id);
  const main = inRoom.reduce((m, f) => (!m || f.w * f.d > m.w * m.d ? f : m), null);
  const focus = main ? { x: main.x, y: main.y } : mid;
  const corner = room.points.reduce((best, p) => (!best || Math.hypot(p.x - focus.x, p.y - focus.y) > Math.hypot(best.x - focus.x, best.y - focus.y) ? p : best), null);
  const k = 0.5 / Math.max(0.5, Math.hypot(mid.x - corner.x, mid.y - corner.y));
  return {
    kind: 'room',
    position: { x: corner.x + (mid.x - corner.x) * k, y: corner.y + (mid.y - corner.y) * k, z: 1.6 },
    target: { x: mid.x, y: mid.y, z: 1.15 },
    fov: 64,
  };
}

// Build the specification of one room for the given camera (plan coordinates, as returned
// by the 3D view's cameraState()) and interior style.
export function sceneSpec(project, { roomId, camera, style } = {}) {
  const room = project.rooms.find((r) => r.id === roomId);
  if (!room) throw new Error('room not found');
  const purpose = PURPOSES[room.purpose] ? room.purpose : 'other';
  const b = bounds(room.points);
  const rel = (p) => ({ x: r2(p.x - b.minX), y: r2(p.y - b.minY) });
  const cam0 = camera && camera.position && camera.target ? camera : defaultCamera(project, room);
  const cam = {
    position: { x: cam0.position.x, y: cam0.position.y },
    target: { x: cam0.target.x, y: cam0.target.y },
  };
  const es = edges(room.points);

  const walls = es.map((e) => ({
    n: e.i + 1,
    length: r2(e.len),
    from: rel(e.a),
    to: rel(e.b),
    facing: compass(-e.nx, -e.ny),
    side: sideFromCamera(cam, { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }),
  }));

  const { hosts, links } = openingHosts(project);
  const linkTo = new Map(links.map((l) => [l.opId, l]));
  const openings = [];
  for (const e of es) {
    for (const it of hosts.get(`${room.id}:${e.i}`) || []) {
      const op = it.op;
      const link = linkTo.get(op.id);
      const otherId = link ? (link.from === room.id ? link.to : link.from) : null;
      const other = otherId ? project.rooms.find((r) => r.id === otherId) : null;
      const c = { x: e.a.x + e.ux * it.offset, y: e.a.y + e.uy * it.offset };
      openings.push({
        type: op.type,
        wall: e.i + 1,
        center: r2(it.offset),
        width: r2(op.width),
        height: r2(op.height),
        sill: r2(op.sill),
        leadsTo: other ? (PURPOSES[other.purpose] ? other.purpose : 'other') : 'outside',
        side: sideFromCamera(cam, c),
      });
    }
  }
  openings.sort((a, b2) => a.wall - b2.wall || a.center - b2.center);

  const furniture = (project.furniture || [])
    .filter((f) => f.roomId === room.id && FURNITURE[f.type])
    .map((f) => ({
      type: f.type,
      center: rel({ x: f.x, y: f.y }),
      w: r2(f.w),
      d: r2(f.d),
      h: r2(f.h),
      rot: ((Math.round(f.rot) % 360) + 360) % 360,
      side: sideFromCamera(cam, f),
    }))
    .sort((a, c) => a.type.localeCompare(c.type) || a.center.x - c.center.x || a.center.y - c.center.y);

  // The room's own finishes, plus the apartment-wide door and window-sill finishes when
  // this room has a door or a window.
  const hasDoor = openings.some((o) => o.type === 'door');
  const hasWindow = openings.some((o) => o.type === 'window');
  const global = apartmentBoard(project).filter((ref) => (ref.target.surface === 'door' && hasDoor) || (ref.target.surface === 'sill' && hasWindow));
  const materials = [...roomBoard(project, room), ...global].map((ref) => ({
    surface: ref.target.surface,
    materialId: ref.materialId,
    mandatory: !!ref.mandatory,
    direction: ref.layout.direction || null,
  }));

  return describeMaterials({
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    units: 'm',
    room: {
      purpose,
      area: r2(area(room.points)),
      size: { w: r2(b.w), d: r2(b.h) },
      ceiling: r2(roomHeight(room, project)),
      polygon: room.points.map(rel),
      walls,
    },
    openings,
    furniture,
    materials,
    camera: {
      kind: 'eye',
      position: { ...rel(cam.position), z: r2(cam0.position.z ?? 1.6) },
      target: { ...rel(cam.target), z: r2(cam0.target.z ?? 1.15) },
      fov: Math.round(cam0.fov || 64),
    },
    style: STYLES[style] ? style : STYLES[project.style] ? project.style : 'modern',
  });
}

// Material facts are always taken from the catalog, by id (also on the server).
function describeMaterials(spec) {
  spec.materials = spec.materials.map((m) => {
    const p = product(m.materialId);
    return {
      surface: m.surface,
      materialId: m.materialId,
      mandatory: m.mandatory,
      direction: m.direction,
      kind: refKind(p),
      verification: p.verification.status,
    };
  });
  return spec;
}

// ------------------------------------------------------------------ revision
// Canonical JSON: keys sorted, so the same scene always gives the same text.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

// 53-bit string hash (cyrb53), as 14 hex characters. Identifies a scene version; it is
// not a security measure.
export function hash53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export function sceneRevision(spec) {
  return `s1-${hash53(canonical(spec))}`;
}

// ------------------------------------------------------------------ validation
// Used by the render server on whatever arrives over the network. Returns
// { spec, errors }: a cleaned copy (only known keys, numbers in range, enums checked,
// material facts re-read from the catalog) or a list of problems.
export function validateScene(raw) {
  const errors = [];
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, lo, hi, what) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
      errors.push(`${what} out of range`);
      return null;
    }
    return v;
  };
  const enumOf = (v, set, what) => {
    if (typeof v !== 'string' || !Object.prototype.hasOwnProperty.call(set, v)) {
      errors.push(`${what} unknown`);
      return null;
    }
    return v;
  };
  const L = SCENE_LIMITS;
  const M = L.maxRoomSize;
  const pt = (p, what, lo = -0.5, hi = M + 0.5) => (isObj(p) ? { x: num(p.x, lo, hi, `${what}.x`), y: num(p.y, lo, hi, `${what}.y`) } : (errors.push(`${what} missing`), null));
  const SIDES = { ahead: 1, left: 1, right: 1, behind: 1, here: 1 };
  const FACING = { north: 1, 'north-east': 1, east: 1, 'south-east': 1, south: 1, 'south-west': 1, west: 1, 'north-west': 1 };

  if (!isObj(raw) || raw.format !== SCENE_FORMAT || raw.version !== SCENE_VERSION) return { spec: null, errors: ['not a bina.scene v1'] };
  const r = isObj(raw.room) ? raw.room : {};
  const arr = (v, max, what) => {
    if (!Array.isArray(v)) {
      errors.push(`${what} missing`);
      return [];
    }
    if (v.length > max) {
      errors.push(`${what}: too many`);
      return [];
    }
    return v;
  };
  const polygon = arr(r.polygon, L.maxPoints, 'room.polygon').map((p, i) => pt(p, `polygon[${i}]`));
  if (polygon.length < 3) errors.push('room.polygon too short');
  const spec = {
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    units: 'm',
    room: {
      purpose: enumOf(r.purpose, PURPOSES, 'room.purpose'),
      area: num(r.area, 0.05, M * M, 'room.area'),
      size: isObj(r.size) ? { w: num(r.size.w, 0.1, M, 'room.size.w'), d: num(r.size.d, 0.1, M, 'room.size.d') } : (errors.push('room.size missing'), null),
      ceiling: num(r.ceiling, L.minCeiling, L.maxCeiling, 'room.ceiling'),
      polygon,
      walls: arr(r.walls, L.maxPoints, 'room.walls').map((w, i) => (isObj(w) ? {
        n: num(w.n, 1, L.maxPoints, `walls[${i}].n`),
        length: num(w.length, 0.01, M * 1.5, `walls[${i}].length`),
        from: pt(w.from, `walls[${i}].from`),
        to: pt(w.to, `walls[${i}].to`),
        facing: enumOf(w.facing, FACING, `walls[${i}].facing`),
        side: enumOf(w.side, SIDES, `walls[${i}].side`),
      } : (errors.push(`walls[${i}] invalid`), null))),
    },
    openings: arr(raw.openings, L.maxOpenings, 'openings').map((o, i) => (isObj(o) ? {
      type: enumOf(o.type, OPENING_TYPES, `openings[${i}].type`),
      wall: num(o.wall, 1, L.maxPoints, `openings[${i}].wall`),
      center: num(o.center, 0, M * 1.5, `openings[${i}].center`),
      width: num(o.width, 0.1, 10, `openings[${i}].width`),
      height: num(o.height, 0.1, L.maxCeiling, `openings[${i}].height`),
      sill: num(o.sill, 0, L.maxCeiling, `openings[${i}].sill`),
      leadsTo: o.leadsTo === 'outside' ? 'outside' : enumOf(o.leadsTo, PURPOSES, `openings[${i}].leadsTo`),
      side: enumOf(o.side, SIDES, `openings[${i}].side`),
    } : (errors.push(`openings[${i}] invalid`), null))),
    furniture: arr(raw.furniture, L.maxFurniture, 'furniture').map((f, i) => (isObj(f) ? {
      type: enumOf(f.type, FURNITURE, `furniture[${i}].type`),
      center: pt(f.center, `furniture[${i}].center`, -2, M + 2),
      w: num(f.w, 0.05, 12, `furniture[${i}].w`),
      d: num(f.d, 0.05, 12, `furniture[${i}].d`),
      h: num(f.h, 0.02, 5, `furniture[${i}].h`),
      rot: num(f.rot, 0, 359, `furniture[${i}].rot`),
      side: enumOf(f.side, SIDES, `furniture[${i}].side`),
    } : (errors.push(`furniture[${i}] invalid`), null))),
    materials: arr(raw.materials, L.maxMaterials, 'materials').map((m, i) => {
      if (!isObj(m)) {
        errors.push(`materials[${i}] invalid`);
        return null;
      }
      const surface = SURFACE_KEYS.includes(m.surface) ? m.surface : (errors.push(`materials[${i}].surface unknown`), null);
      const materialId = typeof m.materialId === 'string' && MATERIALS[m.materialId] ? m.materialId : (errors.push(`materials[${i}].materialId unknown`), null);
      if (typeof m.mandatory !== 'boolean') errors.push(`materials[${i}].mandatory not boolean`);
      const direction = m.direction === null || ['along', 'across', 'horizontal', 'vertical'].includes(m.direction) ? m.direction : (errors.push(`materials[${i}].direction unknown`), null);
      return { surface, materialId, mandatory: !!m.mandatory, direction };
    }),
    camera: isObj(raw.camera) ? {
      kind: 'eye',
      position: { ...(pt(raw.camera.position, 'camera.position', -1, M + 1) || {}), z: num(raw.camera.position?.z, 0.3, L.maxCeiling, 'camera.position.z') },
      target: { ...(pt(raw.camera.target, 'camera.target', -5, M + 5) || {}), z: num(raw.camera.target?.z, 0, L.maxCeiling, 'camera.target.z') },
      fov: num(raw.camera.fov, L.minFov, L.maxFov, 'camera.fov'),
    } : (errors.push('camera missing'), null),
    style: enumOf(raw.style, STYLES, 'style'),
  };
  if (spec.room.walls.length !== polygon.length) errors.push('room.walls must match polygon');
  const seen = new Set();
  for (const m of spec.materials) {
    if (m && seen.has(m.surface)) errors.push(`materials: ${m.surface} twice`);
    if (m) seen.add(m.surface);
  }
  if (errors.length) return { spec: null, errors };
  return { spec: describeMaterials(spec), errors: [] };
}
