// Project data model: room purposes, opening types, defaults and the sample apartment.
import { area, edge, normalizeOrientation, rectPoints, roundPoint } from './geometry.js';
import { STYLES, TIERS } from './catalog.js';

export const SCHEMA_VERSION = 1;

// Room purposes. `surfaces` maps each finish surface to the material category used by default.
export const PURPOSES = {
  living: {
    label: 'მისაღები', group: 'dry', icon: 'sofa',
    surfaces: { floor: 'floor_wood', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting' },
  },
  kitchenLiving: {
    label: 'სამზარეულო-მისაღები', group: 'kitchen', icon: 'kitchen',
    surfaces: { floor: 'floor_wood', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting', backsplash: 'tile_wall', countertop: 'stone' },
    kitchen: true, defaultRun: 3.6,
  },
  kitchen: {
    label: 'სამზარეულო', group: 'kitchen', icon: 'kitchen',
    surfaces: { floor: 'tile_floor', walls: 'paint', ceiling: 'ceiling', skirting: 'skirting', backsplash: 'tile_wall', countertop: 'stone' },
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

let idCounter = 0;
export function newId(prefix) {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

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
    kitchen: null,
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
  living.kitchen = { runs: [{ edge: 1, start: 0, length: 3.6 }] };
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

function cleanMap(m) {
  const out = {};
  if (!isObj(m)) return out;
  for (const [k, v] of Object.entries(m)) if (typeof v === 'string') out[k] = v;
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

// Bring older, partial or hand-edited project JSON up to the current shape. Every value is
// checked, because saved data comes from the browser or from files people send each other:
// a single bad number must not crash the drawing or turn the estimate into NaN. Items that
// cannot be repaired are dropped and counted in `report` ({ rooms, openings }).
// Returns null when the input is not a project at all.
export function migrateProject(raw, report = {}) {
  report.rooms = 0;
  report.openings = 0;
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
    p.rooms.push({
      id,
      purpose: typeof r.purpose === 'string' && PURPOSES[r.purpose] ? r.purpose : 'other',
      name: str(r.name),
      points,
      height,
      tileHeight,
      kitchen: cleanKitchen(r.kitchen, points.length),
      unassigned: !!r.unassigned,
    });
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

  const finish = isObj(raw.finish) ? raw.finish : {};
  const rooms = {};
  if (isObj(finish.rooms)) {
    for (const [rid, m] of Object.entries(finish.rooms)) if (byId.has(rid)) rooms[rid] = cleanMap(m);
  }
  p.finish = { global: cleanMap(finish.global), rooms };
  p.version = SCHEMA_VERSION;
  return p;
}

// Only embedded raster images are accepted as a saved plan image; anything else (a remote
// URL, an SVG that could run script, a non-string) is ignored.
export function cleanPlanImage(v) {
  return typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v) ? v : null;
}
