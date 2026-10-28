// Pure edits on a project. Every function returns a new project object.
import { edge, round, roundPoint } from './geometry.js';
import { openingCenter } from './measure.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function clampOffset(len, width, t) {
  if (len <= width) return len / 2;
  return clamp(t, width / 2, len - width / 2);
}

// Replace a room's outline and keep its doors and windows where they were in the world.
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
  return { ...project, rooms: project.rooms.map((r) => (r.id === roomId ? nextRoom : r)), openings };
}

export function moveRoom(project, roomId, dx, dy) {
  const room = project.rooms.find((r) => r.id === roomId);
  if (!room) return project;
  const pts = room.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  return { ...project, rooms: project.rooms.map((r) => (r.id === roomId ? { ...r, points: pts.map((p) => roundPoint(p)) } : r)) };
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
