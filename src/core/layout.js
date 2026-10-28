// Checks and automatic placement for furniture: collisions, pieces in walls, blocked doors
// and windows, and the free space a piece needs in front of it. Everything here is a pure
// function of the project, shared by the plan, the inspector and the tests.
import * as G from './geometry.js';
import { OPENING_TYPES } from './model.js';
import { openingHosts } from './measure.js';
import {
  FURNITURE, corners, frontZone, overlapDepth, insideRoom, segPolyDistance, roomAt, makeFurniture,
  wallRot, furnitureLabel, sideToWall, normRot, toWorld, runFurniture,
} from './furniture.js';

export const PASSAGE = 0.5; // free depth needed on the side of a door or opening you walk from
export const WINDOW_GAP = 0.25; // a piece taller than the sill closer than this covers the window
const MIN_OVERLAP = 0.01; // overlaps below 1 cm are drawing noise, not a collision

// Pieces that may overlap: a sink or a hob is built into the cabinet run, two runs meet in
// a kitchen corner, chairs are pushed under tables.
const MAY_OVERLAP = {
  kitchen_run: ['kitchen_run', 'sink', 'stove'],
  sink: ['kitchen_run'],
  stove: ['kitchen_run'],
  chair: ['dining_table', 'desk'],
  dining_table: ['chair'],
  desk: ['chair'],
};
export const mayOverlap = (a, b) => (MAY_OVERLAP[a.type] || []).includes(b.type);

// Pieces that may stand in another piece's free space: chairs at a desk or table, kitchen
// pieces in each other's working space (an L-shaped kitchen).
const KITCHEN = ['kitchen_run', 'sink', 'stove', 'fridge'];
const IGNORE_IN_ZONE = {
  desk: ['chair'],
  dining_table: ['chair'],
  kitchen_run: KITCHEN,
  sink: KITCHEN,
  stove: KITCHEN,
  fridge: KITCHEN,
};
const ignoredInZone = (owner, other) => (IGNORE_IN_ZONE[owner.type] || []).includes(other.type);

const cm = (m) => Math.round(m * 100);

// Door swings, passages and windows of the plan, as world polygons and segments.
export function openingZones(project) {
  const rooms = new Map(project.rooms.map((r) => [r.id, r]));
  const { hosts } = openingHosts(project);
  const zones = [];
  const windows = [];
  for (const [key, items] of hosts) {
    const roomId = key.slice(0, key.lastIndexOf(':'));
    const ei = Number(key.slice(key.lastIndexOf(':') + 1));
    const room = rooms.get(roomId);
    if (!room || ei >= room.points.length) continue;
    const e = G.edge(room.points, ei);
    for (const it of items) {
      const op = it.op;
      const t = OPENING_TYPES[op.type];
      if (!t) continue;
      const c = { x: e.a.x + e.ux * it.offset, y: e.a.y + e.uy * it.offset };
      const hw = op.width / 2;
      const p0 = { x: c.x - e.ux * hw, y: c.y - e.uy * hw };
      const p1 = { x: c.x + e.ux * hw, y: c.y + e.uy * hw };
      if (t.floor) {
        // A hinged door swings into the room it was drawn in; elsewhere you need room to pass.
        const swing = it.own && op.type !== 'arch';
        const depth = swing ? op.width : PASSAGE;
        zones.push({
          opId: op.id,
          roomId,
          kind: swing ? 'swing' : 'pass',
          poly: [p0, p1, { x: p1.x + e.nx * depth, y: p1.y + e.ny * depth }, { x: p0.x + e.nx * depth, y: p0.y + e.ny * depth }],
        });
      } else {
        windows.push({ opId: op.id, roomId, a: p0, b: p1, sill: op.sill });
      }
    }
  }
  return { zones, windows };
}

function context(project) {
  return { rooms: new Map(project.rooms.map((r) => [r.id, r])), ...openingZones(project) };
}

// Problems of one piece that do not depend on other furniture.
function ownIssues(ctx, item, push) {
  const room = item.roomId ? ctx.rooms.get(item.roomId) : null;
  const poly = corners(item);
  if (!room || !insideRoom(poly, room.points)) {
    push({ kind: 'outside', level: 'error', text: 'კედელში შედის ან ოთახს სცდება' });
  }
  if (ctx.zones.some((z) => overlapDepth(poly, z.poly) > MIN_OVERLAP)) {
    push({ kind: 'door', level: 'warn', text: 'კარის გაღებას ან გავლას უშლის ხელს' });
  }
  if (ctx.windows.some((w) => item.h > w.sill + 0.02 && w.roomId === item.roomId && segPolyDistance(w.a, w.b, poly) < WINDOW_GAP)) {
    push({ kind: 'window', level: 'warn', text: 'ფანჯარას ფარავს' });
  }
  const clear = FURNITURE[item.type]?.clear;
  if (clear && room && !insideRoom(frontZone(item, clear), room.points, 0.02)) {
    push({ kind: 'clearance', level: 'warn', text: `წინ ${cm(clear)} სმ თავისუფალი ადგილი სჭირდება — კედელი ხელს უშლის` });
  }
}

// Problems between two pieces, from a's point of view.
function pairIssues(a, b, push) {
  const pa = corners(a);
  const pb = corners(b);
  if (!mayOverlap(a, b) && overlapDepth(pa, pb) > MIN_OVERLAP) {
    push({ kind: 'collision', level: 'error', text: `ეხება: ${furnitureLabel(b)}`, other: b.id });
    return; // overlapping pieces need moving anyway; the free-space notes would only repeat it
  }
  const ca = FURNITURE[a.type]?.clear;
  if (ca && !ignoredInZone(a, b) && overlapDepth(frontZone(a, ca), pb) > MIN_OVERLAP) {
    push({ kind: 'clearance', level: 'warn', text: `წინ ${cm(ca)} სმ თავისუფალი ადგილი სჭირდება — ხელს უშლის: ${furnitureLabel(b)}`, other: b.id });
  }
  const cb = FURNITURE[b.type]?.clear;
  if (cb && !ignoredInZone(b, a) && overlapDepth(frontZone(b, cb), pa) > MIN_OVERLAP) {
    push({ kind: 'clearance', level: 'warn', text: `${furnitureLabel(b)}: წინ საჭირო ადგილს იკავებს`, other: b.id });
  }
}

// Every piece's problems: Map id → [{ kind, level: 'error' | 'warn', text, other? }].
export function analyzeFurniture(project) {
  const items = project.furniture || [];
  const out = new Map(items.map((f) => [f.id, []]));
  if (!items.length) return out;
  const ctx = context(project);
  for (const f of items) ownIssues(ctx, f, (w) => out.get(f.id).push(w));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      pairIssues(a, b, (w) => out.get(a.id).push(w));
      pairIssues(b, a, (w) => out.get(b.id).push(w));
    }
  }
  return out;
}

export function issueLevel(list) {
  if (!list || !list.length) return null;
  return list.some((w) => w.level === 'error') ? 'error' : 'warn';
}

// Number of problems a piece would have (and cause) at a candidate spot.
function countIssues(ctx, item, others) {
  let n = 0;
  const inc = (w) => { n += w.level === 'error' ? 3 : 1; };
  ownIssues(ctx, item, inc);
  for (const o of others) {
    if (o.id === item.id) continue;
    pairIssues(item, o, inc);
  }
  return n;
}

function pickBest(project, item, cands) {
  const ctx = context(project);
  const others = project.furniture || [];
  cands.sort((a, b) => a.pref - b.pref);
  let best = null;
  for (const c of cands) {
    const cand = { ...item, x: G.round(c.x), y: G.round(c.y), rot: normRot(c.rot) };
    const room = roomAt(project.rooms, cand);
    if (!room || (item.roomId && room.id !== item.roomId)) continue;
    cand.roomId = room.id;
    const n = countIssues(ctx, cand, others);
    if (!best || n < best.n) best = { item: cand, n };
    if (n === 0) break;
  }
  return best ? best.item : null;
}

// Candidate spots next to related pieces: chairs around tables and desks, bedside tables
// at the head of a bed, a coffee table in front of the sofa.
function relatedSpots(project, type, base, roomId) {
  const out = [];
  const inRoom = (project.furniture || []).filter((f) => f.roomId === roomId);
  const at = (f, lx, ly, rot, pref) => {
    const p = toWorld(f, lx, ly);
    out.push({ x: p.x, y: p.y, rot, pref });
  };
  if (type === 'chair') {
    const tuck = 0.1; // seats slide a little under the table top
    for (const t of inRoom.filter((f) => f.type === 'dining_table' || f.type === 'desk')) {
      const off = t.d / 2 + base.d / 2 - tuck;
      const n = Math.max(1, Math.floor(t.w / 0.6));
      for (let k = 0; k < n; k++) {
        const lx = -t.w / 2 + (t.w / n) * (k + 0.5);
        at(t, lx, off, t.rot + 180, -100 + k);
        if (t.type === 'dining_table') at(t, lx, -off, t.rot, -90 + k);
      }
      if (t.type === 'dining_table') {
        const end = t.w / 2 + base.d / 2 - tuck;
        at(t, end, 0, t.rot + 90, -80);
        at(t, -end, 0, t.rot - 90, -80);
      }
    }
  }
  if (type === 'bedside') {
    for (const b of inRoom.filter((f) => f.type === 'bed_double' || f.type === 'bed_single')) {
      const ly = -b.d / 2 + base.d / 2;
      at(b, b.w / 2 + base.w / 2 + 0.03, ly, b.rot, -100);
      at(b, -b.w / 2 - base.w / 2 - 0.03, ly, b.rot, -99);
    }
  }
  if (type === 'coffee_table') {
    for (const s of inRoom.filter((f) => f.type === 'sofa')) at(s, 0, s.d / 2 + 0.4 + base.d / 2, s.rot, -100);
  }
  if (type === 'armchair') {
    // beside the coffee table, turned towards it
    for (const t of inRoom.filter((f) => f.type === 'coffee_table')) {
      const off = t.w / 2 + 0.35 + base.d / 2;
      // level with the table, or a little further from the sofa if that is in the way
      for (const ly of [0, 0.15, 0.3]) {
        at(t, off, ly, t.rot + 90, -100 + ly * 10);
        at(t, -off, ly, t.rot - 90, -99 + ly * 10);
      }
    }
  }
  return out;
}

// Find a sensible free spot for a new piece in a room: next to related furniture, against
// a wall for pieces that belong there, otherwise near the middle of the room. When nothing
// is free the least bad spot is used and the checks tell the user what to fix.
export function autoPlace(project, type, roomId) {
  const room = project.rooms.find((r) => r.id === roomId);
  const def = FURNITURE[type];
  if (!room || !def) return null;
  const base = makeFurniture(type, 0, 0, 0, { roomId });
  const cands = relatedSpots(project, type, base, roomId);
  const es = G.edges(room.points);
  const { hosts } = openingHosts(project);
  if (def.wall) {
    for (const e of es) {
      if (e.len < base.w + 0.02) continue;
      const rot = wallRot(e, 'back');
      // walls with a door or window come second, longer walls first
      const penalty = ((hosts.get(`${room.id}:${e.i}`) || []).length ? 1 : 0) - e.len * 0.05;
      const lo = base.w / 2 + 0.01;
      const hi = e.len - base.w / 2 - 0.01;
      const spots = [lo, hi, e.len / 2];
      for (let t = lo + 0.05; t < hi; t += 0.05) spots.push(t);
      for (const t of spots) {
        if (t < lo - 1e-9 || t > hi + 1e-9) continue;
        const pref = (def.anchor === 'corner' ? Math.min(t - lo, hi - t) : Math.abs(t - e.len / 2)) + penalty;
        cands.push({ x: e.a.x + e.ux * t + e.nx * (base.d / 2), y: e.a.y + e.uy * t + e.ny * (base.d / 2), rot, pref });
      }
    }
  }
  // free spots on a grid, nearest to the middle of the room first
  const longest = es.reduce((m, e) => (e.len > m.len ? e : m), es[0]);
  const rot = wallRot(longest, 'back');
  const mid = G.labelPoint(room.points);
  const b = G.bounds(room.points);
  const step = Math.max(0.1, Math.min(0.25, Math.sqrt(G.area(room.points)) / 30));
  for (let x = b.minX + step / 2; x < b.maxX; x += step) {
    for (let y = b.minY + step / 2; y < b.maxY; y += step) {
      if (!G.pointInPolygon({ x, y }, room.points)) continue;
      cands.push({ x, y, rot, pref: 50 + Math.hypot(x - mid.x, y - mid.y) });
    }
  }
  return pickBest(project, base, cands) || { ...base, x: G.round(mid.x), y: G.round(mid.y), rot };
}

// A cabinet run along a wall stretch, made as long as it can be from the start of the
// stretch without blocking a door or standing in other furniture (doors near a corner are
// common). When nothing fits cleanly, the stretch as asked.
export function fitRun(project, room, run) {
  const e = G.edge(room.points, run.edge);
  const ctx = context(project);
  const others = (project.furniture || []).filter((f) => f.roomId === room.id);
  const clean = (f) => {
    let bad = false;
    const flag = (w) => { if (w.kind !== 'clearance') bad = true; };
    ownIssues(ctx, f, flag);
    for (const o of others) pairIssues(f, o, flag);
    return !bad;
  };
  for (let L = Math.min(run.length, e.len); L >= 0.6 - 1e-9; L = G.round(L - 0.1, 0.01)) {
    for (let start = run.start; start + L <= e.len + 1e-9; start = G.round(start + 0.05, 0.01)) {
      const f = runFurniture(room, { edge: run.edge, start, length: L });
      if (clean(f)) return f;
    }
  }
  return runFurniture(room, run);
}

// Where a copy of a piece goes: beside it, in front, or slightly offset. `item` is the copy
// with its own id, still standing where the original is.
export function copySpot(project, item) {
  const cands = [
    [item.w + 0.05, 0, 0], [-(item.w + 0.05), 0, 1], [0, item.d + 0.05, 2], [0, -(item.d + 0.05), 3],
    [item.w + 0.05, item.d + 0.05, 4], [0.2, 0.2, 9],
  ].map(([lx, ly, pref]) => ({ ...toWorld(item, lx, ly), rot: item.rot, pref }));
  const best = pickBest(project, { ...item, roomId: null }, cands);
  if (best) return best;
  const p = toWorld(item, item.w + 0.05, 0);
  return { ...item, x: G.round(p.x), y: G.round(p.y), roomId: roomAt(project.rooms, p)?.id ?? null };
}

// Turn a piece so its back is against the nearest wall it fits on, and push it flush.
export function alignToWall(project, item) {
  const room = project.rooms.find((r) => r.id === item.roomId) || roomAt(project.rooms, item);
  if (!room) return null;
  let best = null;
  for (const e of G.edges(room.points)) {
    if (e.len < item.w - 1e-6) continue;
    const q = G.projectOnSegment(item, e.a, e.b);
    if (!best || q.d < best.d) best = { e, t: q.t, d: q.d };
  }
  if (!best) return null;
  const { e } = best;
  const t = Math.max(item.w / 2, Math.min(e.len - item.w / 2, best.t));
  const x = e.a.x + e.ux * t + e.nx * item.d / 2;
  const y = e.a.y + e.uy * t + e.ny * item.d / 2;
  return { ...item, x: G.round(x), y: G.round(y), rot: wallRot(e, 'back'), roomId: room.id };
}

// Is the piece's back against a wall of its room?
export function againstWall(project, item) {
  const room = project.rooms.find((r) => r.id === item.roomId);
  if (!room) return false;
  return G.edges(room.points).some((e) => {
    const r = sideToWall(item, 'back', e);
    return r.facing > 0.9994 && Math.abs(r.dist) < 0.03 && r.t1 > 0 && r.t0 < e.len;
  });
}
