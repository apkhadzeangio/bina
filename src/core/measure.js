// Measurements derived from the plan: per-room floor, wall, ceiling, skirting,
// kitchen and wet-room areas. Everything here is a pure function of the project.
import { area, perimeter, edges, edge } from './geometry.js';
import { PURPOSES, OPENING_TYPES, DEFAULT_HEIGHT } from './model.js';
import { wallRuns, islandRuns } from './furniture.js';

// Assumptions used by the measurements. Shown to the user on the estimate page.
export const GEOMETRY_RULES = {
  maxWallThickness: 0.5, // an opening also cuts the wall of a room on the other side within this distance
  counterHeight: 0.9, // countertop surface height
  backsplashHeight: 0.6, // tiled band above the countertop
  counterDepth: 0.62, // countertop depth incl. overhang
  waterproofUpturn: 0.2, // waterproofing goes this far up the walls of wet rooms
  sillExtra: 0.1, // a window sill is this much longer than the window opening
  sillDepth: 0.3,
  vanityLength: 0.8,
  vanityDepth: 0.5,
};

export function roomHeight(room, project) {
  const h = room.height ?? project.height ?? DEFAULT_HEIGHT;
  return h > 0 ? h : DEFAULT_HEIGHT;
}

export function openingCenter(room, op) {
  const e = edge(room.points, op.edge);
  const t = Math.max(0, Math.min(e.len, op.offset));
  return { x: e.a.x + e.ux * t, y: e.a.y + e.uy * t, e };
}

// For every opening, the edges it cuts: its own room edge plus the facing edge of the
// neighbouring room across the wall (if there is one).
export function openingHosts(project) {
  const byRoom = new Map(project.rooms.map((r) => [r.id, r]));
  const roomEdges = new Map(project.rooms.map((r) => [r.id, edges(r.points)]));
  const hosts = new Map(); // key `${roomId}:${edge}` → [{op, offset, own}]
  const links = []; // { opId, from, to }
  const add = (roomId, ei, item) => {
    const k = `${roomId}:${ei}`;
    if (!hosts.has(k)) hosts.set(k, []);
    hosts.get(k).push(item);
  };
  for (const op of project.openings) {
    const room = byRoom.get(op.roomId);
    if (!room || op.edge >= room.points.length) continue;
    const { x, y, e } = openingCenter(room, op);
    add(room.id, op.edge, { op, offset: op.offset, own: true });
    let best = null;
    for (const other of project.rooms) {
      if (other.id === room.id) continue;
      for (const f of roomEdges.get(other.id)) {
        const cross = e.ux * f.uy - e.uy * f.ux;
        if (Math.abs(cross) > 0.03) continue; // not parallel
        if (e.nx * f.nx + e.ny * f.ny > -0.9) continue; // must face each other
        // distance from the opening centre to the line of f, measured along e's inward normal backwards
        const dist = (x - f.a.x) * f.nx + (y - f.a.y) * f.ny; // >0 when the point is on f's inner side
        const gap = -dist; // the point lies outside f's room, behind the wall
        if (gap < -0.02 || gap > GEOMETRY_RULES.maxWallThickness) continue;
        const t = (x - f.a.x) * f.ux + (y - f.a.y) * f.uy;
        if (t < -0.01 || t > f.len + 0.01) continue;
        if (!best || gap < best.gap) best = { room: other, f, t, gap };
      }
    }
    if (best) {
      add(best.room.id, best.f.i, { op, offset: best.t, own: false });
      links.push({ opId: op.id, from: room.id, to: best.room.id });
    }
  }
  return { hosts, links };
}

// Area of an opening inside a horizontal band [v0, v1] of a wall of length len.
function openingBandArea(item, len, v0, v1, u0 = 0, u1 = len) {
  const { op } = item;
  const a = Math.max(u0, item.offset - op.width / 2);
  const b = Math.min(u1, item.offset + op.width / 2);
  const w = Math.max(0, b - a);
  const top = op.sill + op.height;
  const h = Math.max(0, Math.min(top, v1) - Math.max(op.sill, v0));
  return w * h;
}

function openingFloorWidth(item, len) {
  const { op } = item;
  if (!OPENING_TYPES[op.type].floor || op.sill > 0.01) return 0;
  const a = Math.max(0, item.offset - op.width / 2);
  const b = Math.min(len, item.offset + op.width / 2);
  return Math.max(0, b - a);
}

// Kitchen base cabinets standing against the walls of a kitchen, as wall stretches
// { edge, start, length, id }. They come from the furniture of type kitchen_run.
export function kitchenRuns(room, project) {
  const p = PURPOSES[room.purpose];
  if (!p || !p.kitchen) return [];
  return wallRuns(room, project?.furniture);
}

// Pick the longest wall without a floor-level opening as the default kitchen run.
export function defaultKitchenRun(room, project) {
  const p = PURPOSES[room.purpose];
  const { hosts } = openingHosts(project);
  const es = edges(room.points);
  let best = null;
  for (const e of es) {
    const items = hosts.get(`${room.id}:${e.i}`) || [];
    if (items.some((it) => OPENING_TYPES[it.op.type].floor)) continue;
    if (!best || e.len > best.len) best = e;
  }
  if (!best) best = es.reduce((m, e) => (e.len > m.len ? e : m), es[0]);
  return { runs: [{ edge: best.i, start: 0, length: Math.min(best.len, p?.defaultRun || 3.6) }] };
}

export function measureRoom(room, project, hostsInfo) {
  const { hosts } = hostsInfo || openingHosts(project);
  const p = PURPOSES[room.purpose] || PURPOSES.other;
  const h = roomHeight(room, project);
  const es = edges(room.points);
  const A = area(room.points);
  const P = perimeter(room.points);
  const G = GEOMETRY_RULES;

  const edgeInfo = es.map((e) => ({ len: e.len, items: hosts.get(`${room.id}:${e.i}`) || [] }));
  let wallGross = 0;
  let openingArea = 0;
  let floorOpenings = 0;
  for (const ei of edgeInfo) {
    wallGross += ei.len * h;
    for (const it of ei.items) {
      openingArea += openingBandArea(it, ei.len, 0, h);
      floorOpenings += openingFloorWidth(it, ei.len);
    }
  }
  const wallNet = Math.max(0, wallGross - openingArea);

  const m = {
    id: room.id,
    purpose: room.purpose,
    height: h,
    area: A,
    perimeter: P,
    wallGross,
    openingArea,
    wallNet,
    floorArea: A,
    ceilingArea: p.surfaces.ceiling ? A : 0,
    wallPaintArea: 0,
    wallTileArea: 0,
    tileHeight: 0,
    backsplashArea: 0,
    countertopArea: 0,
    kitchenRunLength: 0,
    skirtingLength: 0,
    waterproofArea: 0,
    vanityArea: 0,
    sanitaryCount: p.surfaces.sanitary ? 1 : 0,
    doorCount: 0,
    sills: [],
  };

  if (p.outdoor) {
    m.wallNet = 0;
  } else if (p.wet) {
    const tileH = Math.min(h, room.tileHeight ?? h);
    m.tileHeight = tileH;
    let tile = 0;
    let paint = 0;
    for (const ei of edgeInfo) {
      tile += ei.len * tileH;
      paint += ei.len * (h - tileH);
      for (const it of ei.items) {
        tile -= openingBandArea(it, ei.len, 0, tileH);
        paint -= openingBandArea(it, ei.len, tileH, h);
      }
    }
    m.wallTileArea = Math.max(0, tile);
    m.wallPaintArea = Math.max(0, paint);
  } else {
    m.wallPaintArea = wallNet;
  }

  if (p.kitchen) {
    const runs = kitchenRuns(room, project);
    let runLen = 0;
    let splash = 0;
    for (const r of runs) {
      runLen += r.length;
      const ei = edgeInfo[r.edge];
      let band = r.length * G.backsplashHeight;
      for (const it of ei.items) {
        band -= openingBandArea(it, ei.len, G.counterHeight, G.counterHeight + G.backsplashHeight, r.start, r.start + r.length);
      }
      splash += Math.max(0, band);
    }
    // Corners: a run that ends at a corner meeting a run that starts there.
    let corners = 0;
    const n = room.points.length;
    for (const r of runs) {
      const len = es[r.edge].len;
      if (r.start + r.length < len - 0.02) continue;
      const next = runs.find((q) => q.edge === (r.edge + 1) % n && q.start < 0.02);
      if (next) corners += 1;
    }
    m.kitchenRunLength = runLen;
    m.backsplashArea = Math.min(splash, m.wallPaintArea);
    m.wallPaintArea = Math.max(0, m.wallPaintArea - m.backsplashArea);
    // A kitchen island: a top over the whole cabinet plus a small overhang.
    const island = islandRuns(room, project.furniture).reduce((sum, f) => sum + f.w * (f.d + G.counterDepth - 0.6), 0);
    m.countertopArea = Math.max(0, G.counterDepth * (runLen - G.counterDepth * corners)) + island;
  }

  if (p.surfaces.skirting) {
    m.skirtingLength = Math.max(0, P - floorOpenings - m.kitchenRunLength);
  }
  if (p.waterproof) {
    m.waterproofArea = A + P * G.waterproofUpturn;
  }
  if (p.surfaces.vanity) {
    // The stone top of the vanity units drawn in the room, or one standard unit.
    const units = (project.furniture || []).filter((f) => f.type === 'vanity' && f.roomId === room.id);
    m.vanityArea = units.length ? units.reduce((sum, f) => sum + f.w * f.d, 0) : G.vanityLength * G.vanityDepth;
  }

  for (const ei of edgeInfo) {
    for (const it of ei.items) {
      if (!it.own) continue;
      if (it.op.type === 'door') m.doorCount += 1;
      if (it.op.type === 'window') {
        const length = it.op.width + G.sillExtra;
        m.sills.push({ length, area: length * G.sillDepth });
      }
    }
  }
  return m;
}

export function measureProject(project) {
  const info = openingHosts(project);
  const rooms = project.rooms.map((r) => measureRoom(r, project, info));
  const sum = (k) => rooms.reduce((s, m) => s + m[k], 0);
  const interior = rooms.filter((m) => !PURPOSES[m.purpose]?.outdoor);
  return {
    rooms,
    links: info.links,
    totals: {
      area: sum('area'),
      interiorArea: interior.reduce((s, m) => s + m.area, 0),
      outdoorArea: rooms.filter((m) => PURPOSES[m.purpose]?.outdoor).reduce((s, m) => s + m.area, 0),
      wallNet: sum('wallNet'),
      wallPaintArea: sum('wallPaintArea'),
      wallTileArea: sum('wallTileArea'),
      ceilingArea: sum('ceilingArea'),
      skirtingLength: sum('skirtingLength'),
      doorCount: sum('doorCount'),
      windowCount: rooms.reduce((s, m) => s + m.sills.length, 0),
    },
  };
}
