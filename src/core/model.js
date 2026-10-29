// Project data model: room purposes, opening types, defaults and the sample apartment.
import { area, edge, normalizeOrientation, rectPoints, roundPoint } from './geometry.js';
import { STYLES, TIERS } from './catalog.js';
import { ALIASES } from './products.js';
import { newId } from './ids.js';
import { makeFurniture, runFurniture, cleanFurniture } from './furniture.js';

export { newId };

// Saved project format.
//   1  rooms, openings, finishes; kitchen cabinets as stretches of kitchen walls (room.kitchen.runs)
//   2  furniture list; kitchen cabinet runs are furniture of type kitchen_run
export const SCHEMA_VERSION = 2;

// Room purposes. `surfaces` maps each finish surface to the material category used by default.
export const PURPOSES = {
  living: {
    label: 'მისაღები', group: 'dry', icon: 'sofa',
    surfaces: { floor: 'floor_wood', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting' },
  },
  kitchenLiving: {
    label: 'სამზარეულო-მისაღები', group: 'kitchen', icon: 'kitchen',
    surfaces: { floor: 'floor_wood', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting', backsplash: 'tile_wall', countertop: 'stone', cabinet: 'cabinet_front' },
    kitchen: true, defaultRun: 3.6,
  },
  kitchen: {
    label: 'სამზარეულო', group: 'kitchen', icon: 'kitchen',
    surfaces: { floor: 'tile_floor', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting', backsplash: 'tile_wall', countertop: 'stone', cabinet: 'cabinet_front' },
    kitchen: true, defaultRun: 4.2,
  },
  bedroom: {
    label: 'საძინებელი', group: 'dry', icon: 'bed',
    surfaces: { floor: 'floor_wood', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting' },
  },
  kids: {
    label: 'საბავშვო', group: 'dry', icon: 'kids',
    surfaces: { floor: 'floor_wood', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting' },
  },
  study: {
    label: 'კაბინეტი', group: 'dry', icon: 'desk',
    surfaces: { floor: 'floor_wood', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting' },
  },
  hall: {
    label: 'დერეფანი / ჰოლი', group: 'dry', icon: 'hall',
    surfaces: { floor: 'floor_wood', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting' },
  },
  wardrobe: {
    label: 'გარდერობი', group: 'dry', icon: 'hanger',
    surfaces: { floor: 'floor_wood', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting' },
  },
  bathroom: {
    label: 'აბაზანა', group: 'wet', icon: 'bath',
    surfaces: { floor: 'tile_floor', walls: 'tile_wall', ceiling: 'ceiling', vanity: 'stone', sanitary: 'sanitary_bath' },
    wet: true, waterproof: true,
  },
  wc: {
    label: 'საპირფარეშო', group: 'wet', icon: 'wc',
    surfaces: { floor: 'tile_floor', walls: 'tile_wall', ceiling: 'ceiling', sanitary: 'sanitary_wc' },
    wet: true, waterproof: true,
  },
  laundry: {
    label: 'სამრეცხაო', group: 'utility', icon: 'laundry',
    surfaces: { floor: 'tile_floor', walls: 'paint', ceiling: 'ceiling' },
    waterproof: true,
  },
  storage: {
    label: 'სათავსო', group: 'utility', icon: 'box',
    surfaces: { floor: 'tile_floor', walls: 'paint', ceiling: 'ceiling' },
  },
  balcony: {
    label: 'აივანი / ლოჯია', group: 'outdoor', icon: 'balcony',
    surfaces: { floor: 'outdoor' },
    outdoor: true,
  },
  other: {
    label: 'სხვა ოთახი', group: 'dry', icon: 'room',
    surfaces: { floor: 'floor_wood', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting' },
  },
};

export const PURPOSE_ORDER = [
  'living', 'kitchenLiving', 'kitchen', 'bedroom', 'kids', 'study', 'hall', 'wardrobe',
  'bathroom', 'wc', 'laundry', 'storage', 'balcony', 'other',
];

// Opening types. `floor` means the opening reaches the floor (cuts skirting).
export const OPENING_TYPES = {
  door: { label: 'ოთახის კარი', short: 'კარი', kind: 'door', floor: true, width: 0.8, height: 2.1, sill: 0, purchase: true },
  arch: { label: 'ღიობი (კარის გარეშე)', short: 'ღიობი', kind: 'door', floor: true, width: 1.2, height: 2.1, sill: 0 },
  entrance: { label: 'შესასვლელი კარი', short: 'შესასვლელი', kind: 'door', floor: true, width: 0.9, height: 2.1, sill: 0 },
  window: { label: 'ფანჯარა', short: 'ფანჯარა', kind: 'window', floor: false, width: 1.4, height: 1.5, sill: 0.9 },
  balcony: { label: 'აივნის კარი', short: 'აივნის კარი', kind: 'window', floor: true, width: 0.9, height: 2.2, sill: 0 },
};

export const DEFAULT_HEIGHT = 2.8;

export function roomLabel(room, rooms) {
  if (room.name) return room.name;
  const p = PURPOSES[room.purpose] || PURPOSES.other;
  const same = rooms.filter((r) => r.purpose === room.purpose && !r.name);
  if (same.length > 1) return `${p.label} ${same.indexOf(room) + 1}`;
  return p.label;
}

export function makeRoom(points, purpose = 'other', extra = {}) {
  return {
    id: newId('r'),
    purpose,
    name: '',
    points: normalizeOrientation(points.map((p) => roundPoint(p))),
    height: null,
    tileHeight: null,
    ...extra,
  };
}

export function makeOpening(roomId, edgeIndex, offset, type) {
  const t = OPENING_TYPES[type];
  return {
    id: newId('o'),
    roomId,
    edge: edgeIndex,
    offset,
    type,
    width: t.width,
    height: t.height,
    sill: t.sill,
  };
}

export function emptyProject() {
  return {
    version: SCHEMA_VERSION,
    name: 'ჩემი ბინა',
    sample: false,
    height: DEFAULT_HEIGHT,
    rooms: [],
    openings: [],
    furniture: [], // see furniture.js
    renders: [], // saved AI visualizations (metadata; the images stay in the browser), see cleanRenders
    plan: null, // { hasImage, x, y, mPerPx, w, h, opacity, visible }
    style: 'modern',
    tier: 'mid',
    finish: { global: {}, rooms: {} },
  };
}

// Sample: a 73 m² three-room apartment in a new building, traced as interior contours.
// Gaps between rooms are the walls (0.12 m partitions, 0.20 m structural walls).
export function sampleProject() {
  const p = emptyProject();
  p.sample = true;
  p.name = 'ნიმუში — 3-ოთახიანი, 73 მ²';
  p.height = 2.85;
  p.style = 'warm';
  p.tier = 'mid';
  const R = (x0, y0, x1, y1, purpose, extra) => makeRoom(rectPoints(x0, y0, x1, y1), purpose, extra);
  const living = R(0, 0, 6.0, 4.6, 'kitchenLiving');
  const bedroom = R(6.2, 0, 10.0, 3.6, 'bedroom');
  const kids = R(7.62, 3.72, 10.4, 7.2, 'kids');
  const hall = makeRoom(
    [
      { x: 2.6, y: 4.72 }, { x: 6.2, y: 4.72 }, { x: 6.2, y: 3.72 },
      { x: 7.5, y: 3.72 }, { x: 7.5, y: 6.3 }, { x: 2.6, y: 6.3 },
    ],
    'hall',
  );
  const bath = R(0, 4.72, 2.48, 6.9, 'bathroom');
  const wc = R(2.6, 6.42, 4.1, 7.9, 'wc');
  const balcony = R(0.4, -1.5, 4.6, -0.2, 'balcony');
  p.rooms = [living, bedroom, kids, hall, bath, wc, balcony];

  // Edge indices for rectangles: 0 top, 1 right, 2 bottom, 3 left (clockwise on screen).
  const O = (room, edgeIndex, offset, type, over = {}) => ({ ...makeOpening(room.id, edgeIndex, offset, type), ...over });
  p.openings = [
    // living-kitchen: window and balcony door on the top wall, window on the left wall
    O(living, 0, 1.4, 'window'),
    O(living, 0, 3.4, 'balcony'),
    O(living, 3, 2.2, 'window', { width: 1.2 }), // left edge runs bottom→top: offset from bottom-left corner
    // arch between hall and living (living bottom edge runs right→left)
    O(living, 2, 1.6, 'arch'),
    // bedroom: window on the top wall, door to the hall on the bottom wall
    O(bedroom, 0, 1.9, 'window', { width: 1.5 }),
    O(bedroom, 2, 3.0, 'door'),
    // kids: window on the right wall, door on the left wall (left edge runs bottom→top)
    O(kids, 1, 1.7, 'window', { width: 1.2 }),
    O(kids, 3, 1.4, 'door'),
    // bathroom door on its right wall, WC door on its top wall
    O(bath, 1, 0.8, 'door', { width: 0.7 }),
    O(wc, 0, 0.75, 'door', { width: 0.7 }),
    // entrance door on the hall bottom wall (hall bottom edge runs right→left from x=7.5)
    O(hall, 4, 0.85, 'entrance'),
  ];

  // Furniture. rot is clockwise from "back to the top wall": 90 = back to the right wall,
  // 180 = back to the bottom wall, 270 = back to the left wall.
  const F = (room, type, x, y, rot, over) => makeFurniture(type, x, y, rot, { roomId: room.id, ...over });
  p.furniture = [
    // kitchen along the right wall of the living-kitchen, dining table, sofa facing the TV
    runFurniture(living, { edge: 1, start: 0, length: 3.6 }),
    F(living, 'sink', 5.7, 1.2, 90),
    F(living, 'stove', 5.7, 2.6, 90),
    F(living, 'fridge', 5.675, 3.92, 90),
    F(living, 'dining_table', 3.5, 1.9, 90),
    F(living, 'chair', 2.78, 1.5, 270),
    F(living, 'chair', 2.78, 2.3, 270),
    F(living, 'chair', 4.22, 1.5, 90),
    F(living, 'chair', 4.22, 2.3, 90),
    F(living, 'sofa', 1.25, 2.2, 0),
    F(living, 'coffee_table', 1.25, 3.3, 0),
    F(living, 'tv_unit', 1.25, 4.39, 180),
    // bedroom: 160 × 200 bed with its head to the right wall, wardrobe on the left wall
    F(bedroom, 'bed_double', 9.0, 1.8, 90),
    F(bedroom, 'bedside', 9.8, 0.745, 90),
    F(bedroom, 'bedside', 9.8, 2.855, 90),
    F(bedroom, 'wardrobe', 6.5, 1.2, 270),
    // kids: bed along the bottom wall, desk under the top wall, wardrobe by the door
    F(kids, 'bed_single', 9.4, 6.75, 90),
    F(kids, 'desk', 9.7, 4.02, 0),
    F(kids, 'chair', 9.7, 4.47, 180),
    F(kids, 'wardrobe', 7.92, 4.42, 270, { w: 1.2 }),
    // hall wardrobe, bathroom and WC fixtures
    F(hall, 'wardrobe', 5.1, 6.0, 180, { w: 1.4 }),
    F(bath, 'bathtub', 0.86, 5.095, 0),
    F(bath, 'toilet', 0.325, 6.4, 270),
    F(bath, 'vanity', 1.7, 6.65, 180),
    F(wc, 'toilet', 3.35, 7.575, 180),
  ];
  return p;
}

// Limits used when reading saved or imported projects. Anything outside them is not a
// real apartment and would only produce broken drawings or meaningless totals.
export const LIMITS = {
  maxCoord: 1000, // metres from the origin
  minRoomArea: 0.01, // m²
  minHeight: 1.5,
  maxHeight: 10,
  maxRooms: 500,
  maxOpenings: 2000,
  maxFurniture: 2000,
  maxName: 200,
};

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const finite = (v) => Number.isFinite(num(v));
const str = (v, max = LIMITS.maxName) => (typeof v === 'string' ? v.slice(0, max) : '');

function cleanPoints(list) {
  if (!Array.isArray(list)) return null;
  const pts = [];
  for (const q of list) {
    if (!isObj(q) || !finite(q.x) || !finite(q.y)) return null;
    const p = roundPoint({ x: num(q.x), y: num(q.y) });
    if (Math.abs(p.x) > LIMITS.maxCoord || Math.abs(p.y) > LIMITS.maxCoord) return null;
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue;
    pts.push(p);
  }
  while (pts.length > 1 && Math.abs(pts[0].x - pts[pts.length - 1].x) < 1e-6 && Math.abs(pts[0].y - pts[pts.length - 1].y) < 1e-6) pts.pop();
  if (pts.length < 3 || area(pts) < LIMITS.minRoomArea) return null;
  return normalizeOrientation(pts);
}

function cleanHeight(v) {
  if (v === null || v === undefined || !finite(v)) return null;
  const x = num(v);
  return x >= LIMITS.minHeight && x <= LIMITS.maxHeight ? x : null;
}

function cleanKitchen(k, n) {
  if (!isObj(k) || !Array.isArray(k.runs)) return null;
  const runs = k.runs
    .filter((r) => isObj(r) && Number.isInteger(num(r.edge)) && num(r.edge) >= 0 && num(r.edge) < n && finite(r.length) && num(r.length) > 0)
    .map((r) => ({ edge: num(r.edge), start: finite(r.start) && num(r.start) > 0 ? num(r.start) : 0, length: num(r.length) }));
  return { runs };
}

// Material choices: { surfaceKey: materialId }. An id that a later catalog renamed is
// carried over through ALIASES; an id that is unknown is kept as it is (the surface then
// falls back to the style's default and the choice is not lost if the product returns).
function cleanMap(m) {
  const out = {};
  if (!isObj(m)) return out;
  for (const [k, v] of Object.entries(m)) if (typeof v === 'string' && v.length <= 80) out[k] = ALIASES[v] || v;
  return out;
}

// Render reference settings per surface: { '<roomId|*>|<surface>': { mandatory, orientation } }.
function cleanRefs(m, roomIds) {
  const out = {};
  if (!isObj(m)) return out;
  for (const [k, v] of Object.entries(m)) {
    const [rid, surface, extra] = k.split('|');
    if (extra !== undefined || !surface || !isObj(v)) continue;
    if (rid !== '*' && !roomIds.has(rid)) continue;
    const r = {};
    if (typeof v.mandatory === 'boolean') r.mandatory = v.mandatory;
    if (['auto', 'along', 'across'].includes(v.orientation)) r.orientation = v.orientation;
    if (Object.keys(r).length) out[k] = r;
  }
  return out;
}

function cleanPlan(pl) {
  if (!isObj(pl)) return null;
  const ok = ['x', 'y', 'mPerPx', 'w', 'h'].every((k) => finite(pl[k]));
  if (!ok || !(num(pl.mPerPx) > 0) || !(num(pl.w) > 0) || !(num(pl.h) > 0)) return null;
  const opacity = finite(pl.opacity) ? Math.min(1, Math.max(0.1, num(pl.opacity))) : 0.6;
  return {
    x: num(pl.x), y: num(pl.y), mPerPx: num(pl.mPerPx), w: num(pl.w), h: num(pl.h),
    opacity, visible: pl.visible !== false, calibrated: !!pl.calibrated,
  };
}

// Optional Stage 05 settings, still schema 2. Never persist reference image payloads.
function cleanScenePreparation(raw, roomIds) {
  if (!isObj(raw)) return null;
  const rooms = {};
  for (const [id, value] of Object.entries(isObj(raw.rooms) ? raw.rooms : {})) {
    if (!roomIds.has(id) || !isObj(value)) continue;
    const s = {};
    if (['entrance', 'window', 'opposite', 'wide', 'custom'].includes(value.preset)) s.preset = value.preset;
    if ([16 / 9, 4 / 3, 1].includes(value.aspect)) s.aspect = value.aspect;
    if (Number.isFinite(value.fov) && value.fov >= 25 && value.fov <= 100) s.fov = value.fov;
    if (['daylight', 'warm', 'evening'].includes(value.lighting)) s.lighting = value.lighting;
    if (typeof value.style === 'string' && STYLES[value.style]) s.style = value.style; // render-only style (Stage 06)
    s.instructions = str(value.instructions, 1200).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '');
    const c = value.camera;
    const validPoint = (p) => isObj(p) && ['x', 'y', 'z'].every((k) => Number.isFinite(p[k]) && Math.abs(p[k]) <= LIMITS.maxCoord);
    if (isObj(c) && c.roomId === id && validPoint(c.position) && validPoint(c.target)) {
      s.camera = { status: 'ready', roomId: id, preset: s.preset || 'custom', position: { x: c.position.x, y: c.position.y, z: c.position.z },
        target: { x: c.target.x, y: c.target.y, z: c.target.z }, fov: s.fov || 64, aspect: s.aspect || 16 / 9,
        sceneRevision: str(c.sceneRevision, 80), fallback: null };
    }
    rooms[id] = s;
  }
  return { roomId: roomIds.has(raw.roomId) ? raw.roomId : null, rooms };
}

// Bring older, partial or hand-edited project JSON up to the current shape. Every value is
// checked, because saved data comes from the browser or from files people send each other:
// a single bad number must not crash the drawing or turn the estimate into NaN. Items that
// cannot be repaired are dropped and counted in `report` ({ rooms, openings, furniture }).
// Older versions are converted (see SCHEMA_VERSION). Returns null when the input is not a
// project at all.
export function migrateProject(raw, report = {}) {
  report.rooms = 0;
  report.openings = 0;
  report.furniture = 0;
  // Every project this program writes has a rooms list; anything else is some other file.
  if (!isObj(raw) || !Array.isArray(raw.rooms)) return null;
  const base = emptyProject();
  const p = {
    ...base,
    name: str(raw.name).trim() || base.name,
    sample: raw.sample === true,
    height: cleanHeight(raw.height) ?? DEFAULT_HEIGHT,
    style: typeof raw.style === 'string' && STYLES[raw.style] ? raw.style : base.style,
    tier: typeof raw.tier === 'string' && TIERS[raw.tier] ? raw.tier : base.tier,
    plan: cleanPlan(raw.plan),
  };

  const ids = new Set();
  const kitchens = []; // version 1 kitchen cabinets, converted to furniture below
  for (const r of raw.rooms) {
    const points = isObj(r) ? cleanPoints(r.points) : null;
    if (!points || p.rooms.length >= LIMITS.maxRooms) {
      report.rooms += 1;
      continue;
    }
    let id = typeof r.id === 'string' && r.id ? r.id : newId('r');
    if (ids.has(id)) id = newId('r');
    ids.add(id);
    const height = cleanHeight(r.height);
    const tileHeight = finite(r.tileHeight) && num(r.tileHeight) > 0 ? num(r.tileHeight) : null;
    const room = {
      id,
      purpose: typeof r.purpose === 'string' && PURPOSES[r.purpose] ? r.purpose : 'other',
      name: str(r.name),
      points,
      height,
      tileHeight,
      unassigned: !!r.unassigned,
    };
    p.rooms.push(room);
    if (r.kitchen !== undefined && r.kitchen !== null) kitchens.push({ room, kitchen: r.kitchen });
    // A duplicated room id gets a new id; its openings cannot be told apart from the
    // first room's, so they stay with the first room.
  }

  const byId = new Map(p.rooms.map((r) => [r.id, r]));
  const opIds = new Set();
  const rawOps = Array.isArray(raw.openings) ? raw.openings : [];
  for (const o of rawOps) {
    const room = isObj(o) && typeof o.roomId === 'string' ? byId.get(o.roomId) : null;
    const t = room && typeof o.type === 'string' ? OPENING_TYPES[o.type] : null;
    const ei = t ? num(o.edge) : NaN;
    if (!t || !Number.isInteger(ei) || ei < 0 || ei >= room.points.length || p.openings.length >= LIMITS.maxOpenings) {
      report.openings += 1;
      continue;
    }
    const len = edge(room.points, ei).len;
    const width = Math.min(len, finite(o.width) && num(o.width) >= 0.2 ? num(o.width) : t.width);
    const offset = finite(o.offset) ? Math.min(len, Math.max(0, num(o.offset))) : len / 2;
    let id = typeof o.id === 'string' && o.id ? o.id : newId('o');
    if (opIds.has(id)) id = newId('o');
    opIds.add(id);
    p.openings.push({
      id,
      roomId: room.id,
      edge: ei,
      offset,
      type: o.type,
      width,
      height: finite(o.height) && num(o.height) > 0.3 && num(o.height) <= LIMITS.maxHeight ? num(o.height) : t.height,
      sill: finite(o.sill) && num(o.sill) >= 0 && num(o.sill) <= LIMITS.maxHeight ? num(o.sill) : t.sill,
    });
  }

  p.furniture = cleanFurniture(raw.furniture, p.rooms, report, LIMITS.maxFurniture);
  // Version 1: kitchen cabinets were stretches of kitchen walls. Only kitchens used them.
  if (!(num(raw.version) >= 2)) {
    for (const { room, kitchen } of kitchens) {
      if (!PURPOSES[room.purpose].kitchen) continue;
      for (const run of cleanKitchen(kitchen, room.points.length)?.runs || []) {
        const len = edge(room.points, run.edge).len;
        const start = Math.min(len, run.start);
        const length = Math.min(run.length, len - start);
        if (length > 0.05 && p.furniture.length < LIMITS.maxFurniture) p.furniture.push(runFurniture(room, { edge: run.edge, start, length }));
      }
    }
  }

  const finish = isObj(raw.finish) ? raw.finish : {};
  const rooms = {};
  if (isObj(finish.rooms)) {
    for (const [rid, m] of Object.entries(finish.rooms)) if (byId.has(rid)) rooms[rid] = cleanMap(m);
  }
  p.finish = { global: cleanMap(finish.global), rooms };
  const refs = cleanRefs(finish.refs, byId);
  if (Object.keys(refs).length) p.finish.refs = refs;
  const scenePreparation = cleanScenePreparation(raw.scenePreparation, byId);
  if (scenePreparation) p.scenePreparation = scenePreparation;
  p.renders = cleanRenders(raw.renders);
  p.version = SCHEMA_VERSION;
  return p;
}

// Saved AI visualizations: what was rendered, from which Stage 05 scene revision, by which
// model, at what cost, and the scene settings needed to recompile that scene later (to show
// whether the plan has changed since). The image itself stays in the browser's storage
// (src/ui/render-store.js) under the same id; the project JSON never holds image data.
export const RENDER_LIMIT = 200;
const REVISION = /^fnv1a64-[0-9a-f]{16}$/;
const FRAMES = { '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1 };
const PRESETS = ['entrance', 'window', 'opposite', 'wide', 'custom'];
export function cleanRenders(list) {
  if (!Array.isArray(list)) return [];
  const xyz = (v) => (isObj(v) && ['x', 'y', 'z'].every((k) => finite(v[k]) && Math.abs(num(v[k])) <= LIMITS.maxCoord) ? { x: num(v.x), y: num(v.y), z: num(v.z) } : null);
  const out = [];
  const ids = new Set();
  for (const r of list) {
    if (!isObj(r) || out.length >= RENDER_LIMIT) continue;
    if (typeof r.id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(r.id) || ids.has(r.id)) continue;
    if (typeof r.roomId !== 'string' || !r.roomId || r.roomId.length > 64) continue;
    if (typeof r.sceneRevision !== 'string' || !REVISION.test(r.sceneRevision)) continue;
    if (typeof r.createdAt !== 'string' || Number.isNaN(Date.parse(r.createdAt))) continue;
    if (!FRAMES[r.aspect]) continue;
    const c = isObj(r.camera) ? r.camera : {};
    const camera = {
      status: 'ready', roomId: r.roomId, preset: PRESETS.includes(c.preset) ? c.preset : 'custom',
      position: xyz(c.position), target: xyz(c.target),
      fov: finite(c.fov) && num(c.fov) >= 25 && num(c.fov) <= 100 ? num(c.fov) : null,
      aspect: FRAMES[r.aspect], fallback: typeof c.fallback === 'string' ? str(c.fallback, 300) : null,
    };
    if (!camera.position || !camera.target || camera.fov === null) continue;
    const st = isObj(r.settings) ? r.settings : {};
    const settings = {
      preset: camera.preset, aspect: FRAMES[r.aspect], fov: camera.fov,
      lighting: ['daylight', 'warm', 'evening'].includes(st.lighting) ? st.lighting : 'daylight',
      instructions: str(st.instructions, 1200),
      ...(typeof st.style === 'string' && STYLES[st.style] ? { style: st.style } : {}),
    };
    ids.add(r.id);
    out.push({
      id: r.id,
      roomId: r.roomId,
      sceneRevision: r.sceneRevision,
      projectFingerprint: typeof r.projectFingerprint === 'string' && REVISION.test(r.projectFingerprint) ? r.projectFingerprint : null,
      createdAt: new Date(r.createdAt).toISOString(),
      provider: ['openai', 'gemini'].includes(r.provider) ? r.provider : 'unknown',
      model: typeof r.model === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(r.model) ? r.model : 'unknown',
      quality: ['low', 'medium', 'high'].includes(r.quality) ? r.quality : 'medium',
      aspect: r.aspect,
      style: typeof r.style === 'string' && STYLES[r.style] ? r.style : 'modern',
      costUsd: finite(r.costUsd) && num(r.costUsd) >= 0 ? num(r.costUsd) : null,
      costBasis: r.costBasis === 'usage' ? 'usage' : 'estimate',
      fallbackUsed: r.fallbackUsed === true,
      camera,
      settings,
    });
  }
  return out;
}

// Only embedded raster images are accepted as a saved plan image; anything else (a remote
// URL, an SVG that could run script, a non-string) is ignored.
export function cleanPlanImage(v) {
  return typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v) ? v : null;
}
