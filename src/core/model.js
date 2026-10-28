// Project data model: room purposes, opening types, defaults and the sample apartment.
import { normalizeOrientation, rectPoints, roundPoint } from './geometry.js';

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

// Bring older or partial project JSON up to the current shape.
export function migrateProject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const p = { ...emptyProject(), ...raw };
  p.finish = { global: {}, rooms: {}, ...(raw.finish || {}) };
  p.rooms = (raw.rooms || [])
    .filter((r) => Array.isArray(r.points) && r.points.length >= 3)
    .map((r) => ({
      id: r.id || newId('r'),
      purpose: PURPOSES[r.purpose] ? r.purpose : 'other',
      name: r.name || '',
      points: normalizeOrientation(r.points.map((q) => ({ x: +q.x, y: +q.y }))),
      height: r.height ?? null,
      tileHeight: r.tileHeight ?? null,
      kitchen: r.kitchen || null,
      unassigned: !!r.unassigned,
    }));
  const ids = new Set(p.rooms.map((r) => r.id));
  p.openings = (raw.openings || [])
    .filter((o) => ids.has(o.roomId) && OPENING_TYPES[o.type])
    .map((o) => ({ ...o }));
  p.version = SCHEMA_VERSION;
  return p;
}
