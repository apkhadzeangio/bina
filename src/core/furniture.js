// Furniture blockout: a small library of everyday pieces and the geometry needed to place
// them in rooms. Furniture is stored separately from walls, doors and windows, which stay
// the authoritative plan; a piece only refers to the room it stands in.
//
// A piece is a rectangle in plan: centre (x, y) in metres, width w along its local x axis,
// depth d along its local y axis and height h. rot is in degrees, clockwise on screen
// (plan y grows down). The local +y side is the front (where you sit, open the doors or
// stand to use it); the local -y side is the back, which goes against a wall.
import * as G from './geometry.js';
import { newId } from './ids.js';

export const FURNITURE_CATEGORIES = {
  living: 'მისაღები',
  bedroom: 'საძინებელი',
  dining: 'სასადილო და სამუშაო',
  kitchen: 'სამზარეულო',
  bathroom: 'აბაზანა',
};
export const CATEGORY_ORDER = ['living', 'bedroom', 'dining', 'kitchen', 'bathroom'];

// w, d, h: default size in metres. wall: normally stands with its back to a wall.
// clear: free space needed in front, metres. anchor: preferred spot along a wall when the
// piece is placed automatically ('center' or 'corner'). presets: common sizes [w, d].
export const FURNITURE = {
  sofa: { label: 'დივანი', cat: 'living', w: 2.2, d: 0.9, h: 0.85, wall: true, clear: 0.3, anchor: 'center', presets: [[1.6, 0.9], [2.2, 0.9], [2.8, 0.95]] },
  armchair: { label: 'სავარძელი', cat: 'living', w: 0.85, d: 0.85, h: 0.85, clear: 0.3 },
  coffee_table: { label: 'ჟურნალის მაგიდა', cat: 'living', w: 1.1, d: 0.6, h: 0.42, presets: [[0.8, 0.8], [1.1, 0.6], [1.3, 0.7]] },
  tv_unit: { label: 'ტელევიზორის ტუმბო', cat: 'living', w: 1.8, d: 0.42, h: 0.5, wall: true, anchor: 'center', presets: [[1.4, 0.4], [1.8, 0.42], [2.4, 0.45]] },
  bed_single: { label: 'ერთადგილიანი საწოლი', cat: 'bedroom', w: 0.9, d: 2.0, h: 0.5, wall: true, clear: 0.5, anchor: 'corner', presets: [[0.8, 1.9], [0.9, 2.0], [1.2, 2.0]] },
  bed_double: { label: 'ორადგილიანი საწოლი', cat: 'bedroom', w: 1.6, d: 2.0, h: 0.5, wall: true, clear: 0.6, anchor: 'center', presets: [[1.4, 2.0], [1.6, 2.0], [1.8, 2.0]] },
  wardrobe: { label: 'ტანსაცმლის კარადა', cat: 'bedroom', w: 1.6, d: 0.6, h: 2.2, wall: true, clear: 0.7, anchor: 'corner', presets: [[1.0, 0.6], [1.6, 0.6], [2.4, 0.6]] },
  bedside: { label: 'საწოლის ტუმბო', cat: 'bedroom', w: 0.45, d: 0.4, h: 0.5, wall: true, anchor: 'corner' },
  dining_table: { label: 'სასადილო მაგიდა', cat: 'dining', w: 1.6, d: 0.9, h: 0.75, presets: [[1.2, 0.8], [1.6, 0.9], [2.0, 1.0]] },
  chair: { label: 'სკამი', cat: 'dining', w: 0.45, d: 0.5, h: 0.9 },
  desk: { label: 'სამუშაო მაგიდა', cat: 'dining', w: 1.2, d: 0.6, h: 0.75, wall: true, clear: 0.6, anchor: 'center', presets: [[1.0, 0.55], [1.2, 0.6], [1.6, 0.7]] },
  kitchen_run: { label: 'სამზარეულოს კარადები', cat: 'kitchen', w: 2.4, d: 0.6, h: 0.9, wall: true, clear: 0.9, anchor: 'corner' },
  fridge: { label: 'მაცივარი', cat: 'kitchen', w: 0.6, d: 0.65, h: 1.85, wall: true, clear: 0.9, anchor: 'corner', presets: [[0.6, 0.65], [0.7, 0.7], [0.9, 0.7]] },
  stove: { label: 'ქურა', cat: 'kitchen', w: 0.6, d: 0.6, h: 0.9, wall: true, clear: 0.9, anchor: 'center' },
  sink: { label: 'სამზარეულოს ნიჟარა', cat: 'kitchen', w: 0.8, d: 0.6, h: 0.9, wall: true, clear: 0.9, anchor: 'center' },
  toilet: { label: 'უნიტაზი', cat: 'bathroom', w: 0.38, d: 0.65, h: 0.8, wall: true, clear: 0.6, anchor: 'corner' },
  bathtub: { label: 'ვანა', cat: 'bathroom', w: 1.7, d: 0.75, h: 0.58, wall: true, clear: 0.6, anchor: 'corner', presets: [[1.5, 0.7], [1.7, 0.75], [1.8, 0.8]] },
  shower: { label: 'საშხაპე', cat: 'bathroom', w: 0.9, d: 0.9, h: 2.0, wall: true, clear: 0.6, anchor: 'corner', presets: [[0.8, 0.8], [0.9, 0.9], [1.2, 0.9]] },
  vanity: { label: 'ნიჟარა კარადით', cat: 'bathroom', w: 0.8, d: 0.5, h: 0.85, wall: true, clear: 0.6, anchor: 'center', presets: [[0.6, 0.45], [0.8, 0.5], [1.2, 0.5]] },
};

export const FURNITURE_ORDER = CATEGORY_ORDER.flatMap((c) => Object.keys(FURNITURE).filter((k) => FURNITURE[k].cat === c));

// What a room of each purpose usually holds, shown first in the library.
export const SUGGESTED = {
  living: ['sofa', 'armchair', 'coffee_table', 'tv_unit', 'dining_table', 'chair'],
  kitchenLiving: ['kitchen_run', 'fridge', 'stove', 'sink', 'dining_table', 'chair', 'sofa', 'coffee_table', 'tv_unit'],
  kitchen: ['kitchen_run', 'fridge', 'stove', 'sink', 'dining_table', 'chair'],
  bedroom: ['bed_double', 'wardrobe', 'bedside', 'desk', 'chair', 'armchair'],
  kids: ['bed_single', 'wardrobe', 'desk', 'chair', 'bedside'],
  study: ['desk', 'chair', 'wardrobe', 'armchair', 'sofa'],
  hall: ['wardrobe', 'armchair'],
  wardrobe: ['wardrobe'],
  bathroom: ['bathtub', 'shower', 'toilet', 'vanity'],
  wc: ['toilet', 'vanity'],
  laundry: ['vanity', 'wardrobe'],
  storage: ['wardrobe'],
  balcony: ['chair', 'armchair', 'coffee_table'],
  other: [],
};

export const FURNITURE_LIMITS = { minSize: 0.1, maxSize: 10, minH: 0.05, maxH: 4, maxCoord: 1000 };

const DEG = Math.PI / 180;

export function normRot(deg) {
  if (!Number.isFinite(deg)) return 0;
  let r = deg % 360;
  if (r < 0) r += 360;
  r = Math.round(r * 10) / 10;
  return r >= 360 ? 0 : r;
}

export function makeFurniture(type, x, y, rot = 0, over = {}) {
  const t = FURNITURE[type];
  return {
    id: newId('f'),
    type,
    category: t.cat,
    roomId: null,
    x: G.round(x),
    y: G.round(y),
    w: t.w,
    d: t.d,
    h: t.h,
    rot: normRot(rot),
    ...over,
  };
}

export function furnitureLabel(item) {
  return FURNITURE[item?.type]?.label || 'ავეჯი';
}

// ------------------------------------------------------------------ local frame
// u: local x (width) direction, v: local y (depth) direction, pointing to the front.
export function axes(item) {
  const a = (item.rot || 0) * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { ux: c, uy: s, vx: -s, vy: c };
}

export function toWorld(item, lx, ly) {
  const A = axes(item);
  return { x: item.x + A.ux * lx + A.vx * ly, y: item.y + A.uy * lx + A.vy * ly };
}

export function toLocal(item, p) {
  const A = axes(item);
  const dx = p.x - item.x;
  const dy = p.y - item.y;
  return { x: dx * A.ux + dy * A.uy, y: dx * A.vx + dy * A.vy };
}

// A rectangle given in local coordinates, as a world polygon with positive signed area.
export function localRect(item, x0, y0, x1, y1) {
  return [toWorld(item, x0, y0), toWorld(item, x1, y0), toWorld(item, x1, y1), toWorld(item, x0, y1)];
}

// Footprint corners: back-left, back-right, front-right, front-left.
export function corners(item, pad = 0) {
  const hw = item.w / 2 + pad;
  const hd = item.d / 2 + pad;
  return localRect(item, -hw, -hd, hw, hd);
}

export function frontZone(item, depth) {
  return localRect(item, -item.w / 2, item.d / 2, item.w / 2, item.d / 2 + depth);
}

export const SIDES = {
  back: { lx: 0, ly: -1 },
  front: { lx: 0, ly: 1 },
  left: { lx: -1, ly: 0 },
  right: { lx: 1, ly: 0 },
};

// World outward normal of one side and the half sizes across and along it.
export function sideInfo(item, side) {
  const s = SIDES[side];
  const A = axes(item);
  return {
    nx: A.ux * s.lx + A.vx * s.ly,
    ny: A.uy * s.lx + A.vy * s.ly,
    across: s.lx ? item.w / 2 : item.d / 2,
    along: s.lx ? item.d / 2 : item.w / 2,
  };
}

// Rotation that turns `side` of a piece towards the wall of room edge e.
export function wallRot(e, side = 'back') {
  const s = SIDES[side];
  const target = Math.atan2(-e.ny, -e.nx);
  const local = Math.atan2(s.ly, s.lx);
  return normRot((target - local) / DEG);
}

// How one side of a piece relates to the wall of room edge e. facing is 1 when the side
// looks straight at the wall; dist is the gap between side and wall (negative: inside the
// wall); t0..t1 is the stretch of the wall the piece covers.
export function sideToWall(item, side, e) {
  const si = sideInfo(item, side);
  const facing = -(si.nx * e.nx + si.ny * e.ny);
  const dist = (item.x - e.a.x) * e.nx + (item.y - e.a.y) * e.ny - si.across;
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const p of corners(item)) {
    const t = (p.x - e.a.x) * e.ux + (p.y - e.a.y) * e.uy;
    if (t < t0) t0 = t;
    if (t > t1) t1 = t;
  }
  return { facing, dist, t0, t1 };
}

// ------------------------------------------------------------------ polygons
function projectPoly(poly, ax, ay) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const v = p.x * ax + p.y * ay;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

// Separating-axis test for two convex polygons. Returns how deep they overlap (metres,
// along the axis of least overlap), or 0 when they only touch or are apart.
export function overlapDepth(A, B) {
  let best = Infinity;
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      let ax = -(b.y - a.y);
      let ay = b.x - a.x;
      const len = Math.hypot(ax, ay);
      if (len < 1e-12) continue;
      ax /= len;
      ay /= len;
      const [a0, a1] = projectPoly(A, ax, ay);
      const [b0, b1] = projectPoly(B, ax, ay);
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return 0;
      if (o < best) best = o;
    }
  }
  return best === Infinity ? 0 : best;
}

function segCross(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

// True when a convex polygon lies inside the room. Touching the walls is allowed
// (tolerance tol); poking through a wall or a notch of an L-shaped room is not.
export function insideRoom(poly, roomPts, tol = 0.01) {
  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
  const shrunk = poly.map((p) => {
    const dx = cx - p.x;
    const dy = cy - p.y;
    const L = Math.hypot(dx, dy) || 1;
    const k = Math.min(tol, L * 0.5) / L;
    return { x: p.x + dx * k, y: p.y + dy * k };
  });
  if (!shrunk.every((p) => G.pointInPolygon(p, roomPts))) return false;
  for (let i = 0; i < shrunk.length; i++) {
    const a = shrunk[i];
    const b = shrunk[(i + 1) % shrunk.length];
    for (let j = 0; j < roomPts.length; j++) {
      if (segCross(a, b, roomPts[j], roomPts[(j + 1) % roomPts.length])) return false;
    }
  }
  return true;
}

// Smallest distance between segment ab and a polygon (0 when they intersect).
export function segPolyDistance(a, b, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (segCross(a, b, p, q)) return 0;
    best = Math.min(best, G.projectOnSegment(p, a, b).d, G.projectOnSegment(a, p, q).d, G.projectOnSegment(b, p, q).d);
  }
  if (G.pointInPolygon(a, poly)) return 0;
  return best;
}

// The room a point stands in: the smallest one, if rooms overlap.
export function roomAt(rooms, p) {
  let best = null;
  for (const r of rooms) {
    if (!G.pointInPolygon(p, r.points)) continue;
    const A = G.area(r.points);
    if (!best || A < best.A) best = { room: r, A };
  }
  return best ? best.room : null;
}

// ------------------------------------------------------------------ snapping
// Pull a piece flush against nearby walls of its room. A side that almost faces a wall
// (within maxAngle degrees) and is closer than tol metres is moved onto it and the piece
// is turned to be exactly parallel. Up to two walls are used, so pieces drop into corners.
// Returns the new position and rotation and the room edges that were used.
export function snapToWalls(item, room, tol, maxAngle = 10) {
  if (!room) return { x: item.x, y: item.y, rot: item.rot, edges: [] };
  const cosMax = Math.cos(maxAngle * DEG);
  const es = G.edges(room.points);
  let cur = { ...item };
  const used = [];
  for (let pass = 0; pass < 2; pass++) {
    let best = null;
    for (const e of es) {
      if (used.some((u) => Math.abs(u.e.nx * e.nx + u.e.ny * e.ny) > 0.2)) continue; // same direction as a wall already used
      for (const side of Object.keys(SIDES)) {
        const r = sideToWall(cur, side, e);
        if (r.facing < cosMax || Math.abs(r.dist) > tol) continue;
        if (r.t1 < 0.02 || r.t0 > e.len - 0.02) continue; // beside the wall, not in front of it
        if (!best || Math.abs(r.dist) < Math.abs(best.dist)) best = { e, side, dist: r.dist };
      }
    }
    if (!best) break;
    // turn exactly parallel (only on the first wall), then close the gap
    if (!used.length) cur = { ...cur, rot: wallRot(best.e, best.side) };
    const r = sideToWall(cur, best.side, best.e);
    cur = { ...cur, x: cur.x - best.e.nx * r.dist, y: cur.y - best.e.ny * r.dist };
    used.push({ e: best.e, side: best.side });
  }
  return { x: G.round(cur.x), y: G.round(cur.y), rot: cur.rot, edges: used.map((u) => u.e.i) };
}

// Distance from the middle of each side to the nearest wall straight ahead of it, or to
// the nearest obstacle (other furniture, as polygons) when that is closer.
export function distancesToWalls(item, room, obstacles = []) {
  const out = {};
  if (!room) return out;
  const segs = [];
  for (const poly of [room.points, ...obstacles]) {
    for (let i = 0; i < poly.length; i++) segs.push([poly[i], poly[(i + 1) % poly.length]]);
  }
  for (const side of Object.keys(SIDES)) {
    const si = sideInfo(item, side);
    const from = { x: item.x + si.nx * si.across, y: item.y + si.ny * si.across };
    let best = Infinity;
    for (const [a, b] of segs) {
      // ray from + t·dir against segment ab
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = si.nx * ey - si.ny * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / den;
      const s = ((a.x - from.x) * si.ny - (a.y - from.y) * si.nx) / den;
      if (t > -0.005 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = Math.max(0, t);
    }
    if (best < Infinity) out[side] = { d: best, from, to: { x: from.x + si.nx * best, y: from.y + si.ny * best } };
  }
  return out;
}

// ------------------------------------------------------------------ kitchen runs
// Base cabinet runs that stand with their back against a wall of the room, as stretches
// of that wall: { edge, start, length, id }. These drive the countertop, backsplash and
// skirting of the estimate, so the drawing, the 3D view and the estimate always agree.
export function wallRuns(room, furniture) {
  const es = G.edges(room.points);
  const runs = [];
  for (const f of furniture || []) {
    if (f.type !== 'kitchen_run' || f.roomId !== room.id) continue;
    let best = null;
    for (const e of es) {
      const r = sideToWall(f, 'back', e);
      if (r.facing < 0.9994 || Math.abs(r.dist) > 0.03) continue; // parallel within 2°, flush within 3 cm
      const start = Math.max(0, r.t0);
      const end = Math.min(e.len, r.t1);
      if (end - start < 0.05) continue;
      if (!best || Math.abs(r.dist) < Math.abs(best.dist)) best = { edge: e.i, start, length: end - start, id: f.id, dist: r.dist };
    }
    if (best) runs.push({ edge: best.edge, start: best.start, length: best.length, id: best.id });
  }
  return runs.sort((a, b) => a.edge - b.edge || a.start - b.start);
}

// Cabinet runs that do not stand against a wall (a kitchen island).
export function islandRuns(room, furniture) {
  const onWall = new Set(wallRuns(room, furniture).map((r) => r.id));
  return (furniture || []).filter((f) => f.type === 'kitchen_run' && f.roomId === room.id && !onWall.has(f.id));
}

// A cabinet run along a wall stretch, as a piece of furniture.
export function runFurniture(room, run, depth = FURNITURE.kitchen_run.d) {
  const e = G.edge(room.points, run.edge);
  const t = run.start + run.length / 2;
  const x = e.a.x + e.ux * t + e.nx * depth / 2;
  const y = e.a.y + e.uy * t + e.ny * depth / 2;
  return makeFurniture('kitchen_run', x, y, wallRot(e, 'back'), { w: G.round(run.length), d: depth, roomId: room.id });
}

// ------------------------------------------------------------------ reading saved data
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const finite = (v) => Number.isFinite(num(v));

// Check every saved piece. Unknown types and pieces without a usable position are dropped
// and counted in report.furniture; sizes out of range fall back to the type's defaults.
export function cleanFurniture(list, rooms, report, max = 2000) {
  const out = [];
  if (!Array.isArray(list)) return out;
  const L = FURNITURE_LIMITS;
  const ids = new Set();
  const size = (v, def, lo, hi) => (finite(v) && num(v) >= lo && num(v) <= hi ? num(v) : def);
  for (const f of list) {
    const t = isObj(f) && typeof f.type === 'string' && Object.prototype.hasOwnProperty.call(FURNITURE, f.type) ? FURNITURE[f.type] : null;
    const ok = t && finite(f.x) && finite(f.y) && Math.abs(num(f.x)) <= L.maxCoord && Math.abs(num(f.y)) <= L.maxCoord;
    if (!ok || out.length >= max) {
      report.furniture = (report.furniture || 0) + 1;
      continue;
    }
    let id = typeof f.id === 'string' && f.id ? f.id.slice(0, 64) : newId('f');
    if (ids.has(id)) id = newId('f');
    ids.add(id);
    const item = {
      id,
      type: f.type,
      category: t.cat,
      roomId: null,
      x: G.round(num(f.x)),
      y: G.round(num(f.y)),
      w: size(f.w, t.w, L.minSize, L.maxSize),
      d: size(f.d, t.d, L.minSize, L.maxSize),
      h: size(f.h, t.h, L.minH, L.maxH),
      rot: finite(f.rot) ? normRot(num(f.rot)) : 0,
    };
    const stored = typeof f.roomId === 'string' ? rooms.find((r) => r.id === f.roomId) : null;
    item.roomId = stored && G.pointInPolygon(item, stored.points) ? stored.id : roomAt(rooms, item)?.id ?? null;
    out.push(item);
  }
  return out;
}
