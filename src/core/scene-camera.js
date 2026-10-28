// Interior camera geometry, independent of Three.js and the DOM.
import * as G from './geometry.js';
import { corners } from './furniture.js';
import { openingHosts, roomHeight } from './measure.js';

export const CAMERA_PRESETS = ['entrance', 'window', 'opposite', 'wide', 'custom'];
export const ASPECTS = [16 / 9, 4 / 3, 1];
export const toThree = (p) => ({ x: p.x, y: p.z, z: p.y });
export const fromThree = (p) => ({ x: p.x, y: p.z, z: p.y });

// Include openings hosted on the other face of a shared wall, as the viewer does.
export function roomOpenings(project, room) {
  const { hosts, links } = openingHosts(project);
  return G.edges(room.points).flatMap((e) => (hosts.get(`${room.id}:${e.i}`) || []).map(({ op, offset, own }) => {
    const at = (u) => ({ x: e.a.x + e.ux * u, y: e.a.y + e.uy * u });
    return {
      id: op.id, type: op.type, ownerRoomId: op.roomId, hosted: !own, edge: e.i,
      offset, center: at(offset), width: op.width, height: op.height, sill: op.sill,
      start: at(offset - op.width / 2), end: at(offset + op.width / 2),
      visibleSpan: { start: Math.max(0, offset - op.width / 2), end: Math.min(e.len, offset + op.width / 2), top: Math.min(roomHeight(room, project), op.sill + op.height) },
      connectedRoomId: links.find((l) => l.opId === op.id)?.[own ? 'to' : 'from'] || null,
    };
  })).sort((a, b) => a.edge - b.edge || a.offset - b.offset || a.id.localeCompare(b.id, 'en'));
}

export function safeCameraPosition(project, room, p) {
  if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) return false;
  if (p.z < 0.3 || p.z > roomHeight(room, project) - 0.12) return false;
  if (!G.pointInPolygon(p, room.points) || G.distToPolygonEdges(p, room.points) < 0.18 - 1e-8) return false;
  return !(project.furniture || []).some((f) => f.roomId === room.id && f.h >= p.z - 0.15 && G.pointInPolygon(p, corners(f, 0.16)));
}

export function validCamera(project, room, c) {
  return c?.status === 'ready' && c.roomId === room.id && CAMERA_PRESETS.includes(c.preset)
    && Number.isFinite(c.fov) && c.fov >= 25 && c.fov <= 100
    && ASPECTS.some((a) => Math.abs(a - c.aspect) < 1e-8)
    && safeCameraPosition(project, room, c.position)
    && c.target && [c.target.x, c.target.y, c.target.z].every(Number.isFinite)
    && Math.hypot(c.target.x - c.position.x, c.target.y - c.position.y, c.target.z - c.position.z) > 0.05;
}

function candidates(project, room) {
  const es = G.edges(room.points);
  const b = G.bounds(room.points);
  const z = Math.min(1.6, roomHeight(room, project) - 0.25);
  const out = [];
  const add = (q) => { const p = { ...q, z }; if (safeCameraPosition(project, room, p)) out.push(p); };
  for (let i = 0; i < es.length; i++) {
    const prev = es[(i + es.length - 1) % es.length];
    const e = es[i];
    const dx = prev.nx + e.nx, dy = prev.ny + e.ny;
    const L = Math.hypot(dx, dy);
    if (L) for (const d of [0.45, 0.7, 1]) add({ x: e.a.x + dx / L * d, y: e.a.y + dy / L * d });
    for (const t of [0.25, 0.5, 0.75]) add({ x: e.a.x + e.ux * e.len * t + e.nx * 0.4, y: e.a.y + e.uy * e.len * t + e.ny * 0.4 });
  }
  // A bounded grid also handles concave polygons with no usable corner.
  const nx = Math.min(28, Math.max(4, Math.ceil(b.w / 0.25)));
  const ny = Math.min(28, Math.max(4, Math.ceil(b.h / 0.25)));
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) add({ x: b.minX + b.w * (ix + 0.5) / nx, y: b.minY + b.h * (iy + 0.5) / ny });
  return out;
}

export function sceneCamera(project, room, { preset = 'entrance', aspect = 16 / 9, fov, custom = null } = {}) {
  if (!CAMERA_PRESETS.includes(preset)) throw new Error('Unknown camera preset');
  if (!ASPECTS.some((a) => Math.abs(a - aspect) < 1e-8)) throw new Error('Unsupported camera aspect');
  const vfov = fov ?? (preset === 'wide' ? 82 : 64);
  if (!Number.isFinite(vfov) || vfov < 25 || vfov > 100) throw new Error('Camera FOV must be 25–100 degrees');
  const base = { status: 'ready', roomId: room.id, preset, fov: vfov, aspect, fallback: null };
  if (preset === 'custom' && custom) {
    const c = { ...base, position: { ...custom.position }, target: { ...custom.target } };
    if (validCamera(project, room, c)) return c;
  }
  const spots = candidates(project, room);
  if (!spots.length) return { ...base, status: 'unavailable', position: null, target: null, fallback: 'No safe interior camera position; 3D reference unavailable.' };
  const ops = roomOpenings(project, room);
  const entrance = ops.filter((o) => ['entrance', 'door', 'arch'].includes(o.type)).sort((a, b) => ['entrance', 'door', 'arch'].indexOf(a.type) - ['entrance', 'door', 'arch'].indexOf(b.type))[0];
  const window = ops.filter((o) => o.type === 'window').sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const mid = G.labelPoint(room.points);
  const d2 = (p, q) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
  let target = { ...mid, z: Math.min(1.15, roomHeight(room, project) / 2) };
  let score;
  if (preset === 'entrance' && entrance) score = (p) => d2(p, entrance.center);
  else if (preset === 'window' && window) { target = { ...window.center, z: window.sill + window.height / 2 }; score = (p) => -d2(p, window.center); }
  else if (preset === 'opposite' && entrance) score = (p) => -d2(p, entrance.center);
  else {
    score = (p) => -d2(p, mid);
    if (preset === 'window') base.fallback = 'No window; using a safe corner facing the room interior.';
    if (preset === 'entrance' || preset === 'opposite') base.fallback = 'No entrance; using a safe corner facing the room interior.';
    if (preset === 'custom') base.fallback = custom ? 'Saved custom camera is unsafe; using a safe interior position.' : 'No custom camera saved; start from a safe interior position.';
  }
  spots.sort((a, b) => score(a) - score(b));
  // A far corner in another wing of a concave room can face a solid wall.
  // Prefer candidates whose sight line stays within the room up to the target.
  const visible = (p) => {
    const steps = Math.min(256, Math.max(16, Math.ceil(Math.sqrt(d2(p, target)) / 0.1)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!G.pointInPolygon({ x: p.x + (target.x - p.x) * t, y: p.y + (target.y - p.y) * t }, room.points)) return false;
    }
    return true;
  };
  const position = spots.find((p) => d2(p, target) > 0.01 && visible(p)) || spots[0];
  if (d2(position, target) < 0.01) target = { ...target, z: Math.max(0.1, position.z - 0.3) };
  return { ...base, position, target };
}
