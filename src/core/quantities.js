// Purchase list: what to buy, how many packs, and the approximate cost.
import { PURPOSES } from './model.js';
import { MATERIALS, CATEGORIES } from './catalog.js';
import { measureProject } from './measure.js';
import { resolveMaterial, roomSurfaces } from './finishes.js';

export const CONSUMPTION = {
  adhesiveFloor: 5.0, // kg of tile adhesive per m² of floor tile
  adhesiveWall: 4.0, // kg per m² of wall tile
  grout: 0.3, // kg per m² of tile
  primer: 0.12, // litres per m² of painted or tiled surface
  putty: 1.2, // kg per m² of painted surface (two thin finishing coats)
  underlayExtra: 0.05, // overlap of underlay rolls
  waterproof: 3.0, // kg per m² of cement-polymer membrane (two coats, about 2 mm)
};

export const GROUPS = [
  { key: 'floor', label: 'იატაკი', cats: ['floor_wood', 'tile_floor', 'outdoor'] },
  { key: 'walltile', label: 'კედლის ფილა', cats: ['tile_wall'] },
  { key: 'paint', label: 'საღებავი', cats: ['paint'] },
  { key: 'ceiling', label: 'ჭერი', cats: ['ceiling'] },
  { key: 'stone', label: 'ქვის ზედაპირები და რაფები', cats: ['stone'] },
  { key: 'door', label: 'კარები', cats: ['door'] },
  { key: 'skirting', label: 'პლინტუსი', cats: ['skirting'] },
  { key: 'sanitary', label: 'სანტექნიკა', cats: ['sanitary_bath', 'sanitary_wc'] },
  { key: 'consumable', label: 'დამხმარე მასალები', cats: ['consumable'] },
];

const ceilTol = (x) => Math.max(0, Math.ceil(x - 1e-9));

// Every surface in the apartment with the material on it and its measured size.
export function buildUsage(project, measured = measureProject(project)) {
  const usage = [];
  const byId = new Map(measured.rooms.map((m) => [m.id, m]));
  const push = (room, surface, dims) => {
    const { material } = resolveMaterial(project, room, surface);
    if (!material) return;
    const q = { area: 0, length: 0, count: 0, ...dims };
    if (q.area <= 1e-6 && q.length <= 1e-6 && q.count <= 0) return;
    usage.push({ materialId: material.id, roomId: room ? room.id : null, surface, ...q });
  };
  for (const room of project.rooms) {
    const m = byId.get(room.id);
    if (!m) continue;
    const p = PURPOSES[room.purpose] || PURPOSES.other;
    for (const s of roomSurfaces(room, m)) {
      switch (s) {
        case 'floor': push(room, s, { area: m.floorArea }); break;
        case 'walls': push(room, s, { area: p.wet ? m.wallTileArea : m.wallPaintArea }); break;
        case 'walls_upper': push(room, s, { area: m.wallPaintArea }); break;
        case 'ceiling': push(room, s, { area: m.ceilingArea }); break;
        case 'backsplash': push(room, s, { area: m.backsplashArea }); break;
        case 'countertop': push(room, s, { area: m.countertopArea }); break;
        case 'vanity': push(room, s, { area: m.vanityArea }); break;
        case 'skirting': push(room, s, { length: m.skirtingLength }); break;
        case 'sanitary': push(room, s, { count: m.sanitaryCount }); break;
        default: break;
      }
    }
  }
  const doors = measured.rooms.reduce((s, m) => s + m.doorCount, 0);
  if (doors > 0) push(null, 'door', { count: doors });
  const sills = measured.rooms.flatMap((m) => m.sills);
  if (sills.length) {
    push(null, 'sill', {
      area: sills.reduce((s, x) => s + x.area, 0),
      length: sills.reduce((s, x) => s + x.length, 0),
      count: sills.length,
    });
  }
  return usage;
}

function buyLine(material, net) {
  const m = material;
  let need = 0;
  let packs = null;
  let amount = 0;
  let unit = 'm2';
  let cost = 0;
  switch (m.measure) {
    case 'area':
      need = net.area * (1 + m.waste);
      if (m.pack) {
        packs = ceilTol(need / m.pack.size);
        amount = packs * m.pack.size;
      } else {
        amount = need;
      }
      cost = amount * m.price;
      unit = 'm2';
      break;
    case 'paint':
      need = (net.area * m.coats) / m.coverage * (1 + m.waste);
      packs = ceilTol(need / m.pack.size);
      amount = packs * m.pack.size;
      cost = packs * m.price;
      unit = 'l';
      break;
    case 'length':
      need = net.length * (1 + m.waste);
      if (m.pack) {
        packs = ceilTol(need / m.pack.size);
        amount = packs * m.pack.size;
      } else {
        amount = need;
      }
      cost = amount * m.price;
      unit = 'm';
      break;
    case 'count':
      need = net.count;
      amount = net.count;
      cost = amount * m.price;
      unit = m.cat.startsWith('sanitary') ? 'set' : 'pcs';
      break;
    case 'pack':
      need = net.base;
      packs = ceilTol(need / m.pack.size);
      amount = packs * m.pack.size;
      cost = packs * m.price;
      unit = m.baseUnit;
      break;
    default:
      break;
  }
  return { need, packs, amount, unit, cost };
}

export function computeEstimate(project) {
  const measured = measureProject(project);
  const usage = buildUsage(project, measured);

  // Aggregate by material before rounding up to whole packs.
  const agg = new Map();
  for (const u of usage) {
    if (!agg.has(u.materialId)) {
      agg.set(u.materialId, { area: 0, length: 0, count: 0, rooms: new Set(), surfaces: new Set(), parts: [] });
    }
    const a = agg.get(u.materialId);
    a.area += u.area;
    a.length += u.length;
    a.count += u.count;
    if (u.roomId) a.rooms.add(u.roomId);
    a.surfaces.add(u.surface);
    a.parts.push(u);
  }

  // Consumables follow from the finishes.
  const C = CONSUMPTION;
  let floorTile = 0;
  let wallTile = 0;
  let painted = 0;
  let underlay = 0;
  for (const u of usage) {
    const m = MATERIALS[u.materialId];
    if (m.look.kind === 'tile') {
      if (u.surface === 'floor') floorTile += u.area;
      else wallTile += u.area;
    }
    if (m.measure === 'paint') painted += u.area;
    if (m.underlay) underlay += u.area;
  }
  const waterproofArea = measured.rooms.reduce((s, m) => s + m.waterproofArea, 0);
  const cons = [
    ['cons_adhesive', floorTile * C.adhesiveFloor + wallTile * C.adhesiveWall],
    ['cons_grout', (floorTile + wallTile) * C.grout],
    ['cons_primer', (painted + floorTile + wallTile) * C.primer],
    ['cons_putty', painted * C.putty],
    ['cons_underlay', underlay * (1 + C.underlayExtra)],
    ['cons_waterproof', waterproofArea * C.waterproof],
  ];

  const lines = [];
  for (const [id, a] of agg) {
    const material = MATERIALS[id];
    const buy = buyLine(material, a);
    lines.push({
      material,
      rooms: [...a.rooms],
      surfaces: [...a.surfaces],
      parts: a.parts,
      net: { area: a.area, length: a.length, count: a.count },
      ...buy,
    });
  }
  for (const [id, base] of cons) {
    if (base <= 1e-6) continue;
    const material = MATERIALS[id];
    lines.push({ material, rooms: [], surfaces: [], parts: [], net: { base }, ...buyLine(material, { base }) });
  }

  const groups = GROUPS.map((g) => {
    const gl = lines
      .filter((l) => g.cats.includes(l.material.cat))
      .sort((x, y) => y.cost - x.cost);
    return { ...g, lines: gl, cost: gl.reduce((s, l) => s + l.cost, 0) };
  }).filter((g) => g.lines.length);

  const total = lines.reduce((s, l) => s + l.cost, 0);
  return { measured, usage, lines, groups, total, categories: CATEGORIES };
}
