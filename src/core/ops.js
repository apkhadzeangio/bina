// Pure edits on a project. Every function returns a new project object.
import { edge, edges, round, roundPoint } from './geometry.js';
import { openingCenter } from './measure.js';
import { FURNITURE, FURNITURE_LIMITS, SIDES, axes, normRot, roomAt, sideToWall } from './furniture.js';
import { newId } from './ids.js';
import { copySpot } from './layout.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function clampOffset(len, width, t) {
  if (len <= width) return len / 2;
  return clamp(t, width / 2, len - width / 2);
}

// Furniture standing flush against a wall of the room: { id, edge, side }.
function flushFurniture(project, room) {
  const out = [];
  const es = edges(room.points);
  for (const f of project.furniture || []) {
    if (f.roomId !== room.id) continue;
    for (const e of es) {
      for (const side of Object.keys(SIDES)) {
        const r = sideToWall(f, side, e);
        if (r.facing > 0.999 && Math.abs(r.dist) < 0.03 && r.t1 > 0.02 && r.t0 < e.len - 0.02) out.push({ id: f.id, edge: e.i, side });
      }
    }
  }
  return out;
}

// Replace a room's outline and keep its doors and windows where they were in the world.
// Furniture that stood against a wall that moved goes with the wall.
export function withRoomPoints(project, roomId, pts) {
  const room = project.rooms.find((r) => r.id === roomId);
  if (!room) return project;
  const centers = new Map(
    project.openings.filter((o) => o.roomId === roomId).map((o) => [o.id, openingCenter(room, o)]),
  );
  const nextRoom = { ...room, points: pts.map((p) => roundPoint(p)) };
  const openings = project.openings.map((o) => {
    if (o.roomId !== roomId) return o;
    const c = centers.get(o.id);
    const e = edge(nextRoom.points, o.edge);
    const t = (c.x - e.a.x) * e.ux + (c.y - e.a.y) * e.uy;
    return { ...o, offset: round(clampOffset(e.len, o.width, t), 0.001) };
  });
  let furniture = project.furniture || [];
  const flush = nextRoom.points.length === room.points.length ? flushFurniture(project, room) : [];
  if (flush.length) {
    const byId = new Map();
    for (const fl of flush) {
      const e = edge(nextRoom.points, fl.edge);
      const f = byId.get(fl.id) || furniture.find((x) => x.id === fl.id);
      const r = sideToWall(f, fl.side, e);
      if (Math.abs(r.dist) > 2) continue; // the wall turned away; leave the piece alone
      byId.set(fl.id, { ...f, x: round(f.x - e.nx * r.dist), y: round(f.y - e.ny * r.dist) });
    }
    furniture = furniture.map((f) => byId.get(f.id) || f);
  }
  return { ...project, rooms: project.rooms.map((r) => (r.id === roomId ? nextRoom : r)), openings, furniture };
}

// Moving a room carries its furniture along.
export function moveRoom(project, roomId, dx, dy) {
  const room = project.rooms.find((r) => r.id === roomId);
  if (!room) return project;
  const pts = room.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  return {
    ...project,
    rooms: project.rooms.map((r) => (r.id === roomId ? { ...r, points: pts.map((p) => roundPoint(p)) } : r)),
    furniture: (project.furniture || []).map((f) => (f.roomId === roomId ? { ...f, x: round(f.x + dx), y: round(f.y + dy) } : f)),
  };
}

export function addRoom(project, room) {
  return { ...project, rooms: [...project.rooms, room] };
}

export function updateRoom(project, roomId, patch) {
  return { ...project, rooms: project.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) };
}

export function deleteRoom(project, roomId) {
  const rooms = { ...(project.finish?.rooms || {}) };
  delete rooms[roomId];
  return {
    ...project,
    rooms: project.rooms.filter((r) => r.id !== roomId),
    openings: project.openings.filter((o) => o.roomId !== roomId),
    furniture: (project.furniture || []).filter((f) => f.roomId !== roomId),
    finish: { ...project.finish, rooms },
  };
}

export function addOpening(project, op) {
  return { ...project, openings: [...project.openings, op] };
}

export function updateOpening(project, id, patch) {
  return {
    ...project,
    openings: project.openings.map((o) => {
      if (o.id !== id) return o;
      const next = { ...o, ...patch };
      const room = project.rooms.find((r) => r.id === o.roomId);
      if (room) {
        const e = edge(room.points, next.edge);
        next.width = clamp(next.width, 0.2, e.len);
        next.offset = round(clampOffset(e.len, next.width, next.offset), 0.001);
      }
      return next;
    }),
  };
}

export function deleteOpening(project, id) {
  return { ...project, openings: project.openings.filter((o) => o.id !== id) };
}

// ------------------------------------------------------------------ furniture
// Sizes and angle are kept in range, the position is rounded to the millimetre and the
// piece belongs to the room its centre stands in.
function fixFurniture(project, f) {
  const L = FURNITURE_LIMITS;
  const t = FURNITURE[f.type];
  const next = {
    ...f,
    category: t.cat,
    x: round(f.x),
    y: round(f.y),
    w: round(clamp(Number.isFinite(f.w) ? f.w : t.w, L.minSize, L.maxSize)),
    d: round(clamp(Number.isFinite(f.d) ? f.d : t.d, L.minSize, L.maxSize)),
    h: round(clamp(Number.isFinite(f.h) ? f.h : t.h, L.minH, L.maxH)),
    rot: normRot(f.rot),
  };
  const keep = f.roomId && project.rooms.find((r) => r.id === f.roomId);
  const here = roomAt(project.rooms, next);
  // A piece over two overlapping rooms stays in its own; otherwise the room it stands in.
  next.roomId = keep && here && roomAt([keep], next) ? keep.id : here?.id ?? null;
  return next;
}

export function addFurniture(project, item) {
  return { ...project, furniture: [...(project.furniture || []), fixFurniture(project, item)] };
}

export function updateFurniture(project, id, patch) {
  return {
    ...project,
    furniture: (project.furniture || []).map((f) => (f.id === id ? fixFurniture(project, { ...f, ...patch }) : f)),
  };
}

export function moveFurniture(project, id, dx, dy) {
  const f = (project.furniture || []).find((x) => x.id === id);
  return f ? updateFurniture(project, id, { x: f.x + dx, y: f.y + dy }) : project;
}

export function rotateFurniture(project, id, deg) {
  const f = (project.furniture || []).find((x) => x.id === id);
  return f ? updateFurniture(project, id, { rot: f.rot + deg }) : project;
}

// New size from typed numbers or a preset. The back stays where it is (usually against a
// wall); a piece standing in a corner keeps the side that touches the wall.
export function resizeFurniture(project, id, size) {
  const f = (project.furniture || []).find((x) => x.id === id);
  if (!f) return project;
  const L = FURNITURE_LIMITS;
  const w = size.w === undefined ? f.w : clamp(size.w, L.minSize, L.maxSize);
  const d = size.d === undefined ? f.d : clamp(size.d, L.minSize, L.maxSize);
  const A = axes(f);
  let x = f.x + A.vx * (d - f.d) / 2;
  let y = f.y + A.vy * (d - f.d) / 2;
  const room = project.rooms.find((r) => r.id === f.roomId);
  const touches = (side) => !!room && edges(room.points).some((e) => {
    const r = sideToWall(f, side, e);
    return r.facing > 0.999 && Math.abs(r.dist) < 0.03 && r.t1 > 0.02 && r.t0 < e.len - 0.02;
  });
  const left = touches('left');
  const right = touches('right');
  const k = left && !right ? 1 : right && !left ? -1 : 0;
  x += A.ux * (w - f.w) / 2 * k;
  y += A.uy * (w - f.w) / 2 * k;
  const patch = { x, y, w, d };
  if (size.h !== undefined) patch.h = size.h;
  return updateFurniture(project, id, patch);
}

export function deleteFurniture(project, id) {
  return { ...project, furniture: (project.furniture || []).filter((f) => f.id !== id) };
}

// A copy placed beside the original where there is room. Returns { project, id }.
export function duplicateFurniture(project, id) {
  const f = (project.furniture || []).find((x) => x.id === id);
  if (!f) return { project, id: null };
  const copy = copySpot(project, { ...f, id: newId('f') });
  return { project: addFurniture(project, copy), id: copy.id };
}
