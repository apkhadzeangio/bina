// Which material goes on which surface. A choice can be made for the whole apartment
// (every surface of the same kind) or for a single room; otherwise the style and budget
// decide.
import { PURPOSES } from './model.js';
import { MATERIALS, pick } from './catalog.js';

export const SURFACES = {
  floor: { label: 'იატაკი', cats: (p) => (p.outdoor ? ['outdoor', 'tile_floor'] : ['floor_wood', 'tile_floor']) },
  walls: { label: 'კედლები', cats: (p) => (p.wet ? ['tile_wall', 'tile_floor', 'paint'] : ['paint', 'tile_wall']) },
  walls_upper: { label: 'კედლები ფილის ზემოთ', cats: () => ['paint'] },
  ceiling: { label: 'ჭერი', cats: () => ['ceiling'] },
  backsplash: { label: 'ფარტუხი', cats: () => ['tile_wall', 'stone'] },
  countertop: { label: 'სამუშაო ზედაპირი', cats: () => ['stone'] },
  vanity: { label: 'ნიჟარის ზედაპირი', cats: () => ['stone'] },
  skirting: { label: 'პლინტუსი', cats: () => ['skirting'] },
  sanitary: { label: 'სანტექნიკა', cats: (p) => [p.surfaces.sanitary] },
};

export const GLOBAL_SURFACES = {
  door: { label: 'ოთახის კარები', cats: () => ['door'] },
  sill: { label: 'ფანჯრის რაფები', cats: () => ['stone'] },
};

export const SURFACE_ORDER = ['floor', 'walls', 'walls_upper', 'backsplash', 'countertop', 'vanity', 'ceiling', 'skirting', 'sanitary'];

// The category a surface uses by default in a room of this purpose.
export function defaultCat(purposeKey, surface, tier) {
  if (surface === 'door') return 'door';
  if (surface === 'sill') return 'stone';
  if (surface === 'walls_upper') return 'paint';
  const p = PURPOSES[purposeKey] || PURPOSES.other;
  return p.surfaces[surface] || null;
}

export function globalKey(purposeKey, surface, tier) {
  if (surface === 'door' || surface === 'sill') return surface;
  if (surface === 'walls_upper') return 'walls|paint';
  return `${surface}|${defaultCat(purposeKey, surface, tier)}`;
}

// Surfaces a room actually has, in display order.
export function roomSurfaces(room, measured) {
  const p = PURPOSES[room.purpose] || PURPOSES.other;
  const list = SURFACE_ORDER.filter((s) => s !== 'walls_upper' && p.surfaces[s]);
  if (p.wet && measured && measured.wallPaintArea > 0.01) list.splice(list.indexOf('walls') + 1, 0, 'walls_upper');
  return list;
}

export function resolveMaterial(project, room, surface) {
  const purposeKey = room ? room.purpose : null;
  const cat = defaultCat(purposeKey, surface, project.tier);
  if (!cat) return { material: null, source: 'none' };
  if (room) {
    const ov = project.finish?.rooms?.[room.id]?.[surface];
    if (ov && MATERIALS[ov]) return { material: MATERIALS[ov], source: 'room' };
  }
  const g = project.finish?.global?.[globalKey(purposeKey, surface, project.tier)];
  if (g && MATERIALS[g]) return { material: MATERIALS[g], source: 'global' };
  return { material: pick(cat, project.style, project.tier), source: 'default' };
}

export function allowedCats(room, surface) {
  if (!room) return GLOBAL_SURFACES[surface].cats();
  const p = PURPOSES[room.purpose] || PURPOSES.other;
  return SURFACES[surface].cats(p);
}

// Apply a material choice. scope: 'all' (every surface of this kind) or 'room'.
export function setFinish(project, room, surface, materialId, scope) {
  const finish = {
    global: { ...(project.finish?.global || {}) },
    rooms: { ...(project.finish?.rooms || {}) },
  };
  if (!room || scope === 'all') {
    const key = globalKey(room ? room.purpose : null, surface, project.tier);
    finish.global[key] = materialId;
    // A whole-apartment choice clears single-room choices for the same kind of surface.
    for (const [rid, map] of Object.entries(finish.rooms)) {
      const r = project.rooms.find((x) => x.id === rid);
      if (!r || !map[surface]) continue;
      if (globalKey(r.purpose, surface, project.tier) === key) {
        const next = { ...map };
        delete next[surface];
        finish.rooms[rid] = next;
      }
    }
  } else {
    finish.rooms[room.id] = { ...(finish.rooms[room.id] || {}), [surface]: materialId };
  }
  return { ...project, finish };
}

export function clearRoomFinish(project, roomId, surface) {
  const rooms = { ...(project.finish?.rooms || {}) };
  if (rooms[roomId]) {
    const next = { ...rooms[roomId] };
    delete next[surface];
    rooms[roomId] = next;
  }
  return { ...project, finish: { ...project.finish, rooms } };
}
