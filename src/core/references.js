// Material board and AI reference package.
//
// For every surface in the apartment this answers: which product was chosen, how sure we
// are that it is a real product at that price, what picture of it exists, and how the
// interior renderer should use it (exact or adjustable, scale, direction).
//
// Package format 'bina.material-references' version 1:
// {
//   format, version, generatedAt, project: { name, style, tier },
//   kinds:      the three reference kinds with their meaning,
//   references: [ one entry per room surface (and per apartment-wide surface) ]
// }
// A reference entry never contains a retailer image: only a licensed image path, the
// product page link, or the colour/scale description of the drawn sample.
import { PURPOSES, roomLabel } from './model.js';
import { STYLES, TIERS } from './catalog.js';
import { area, edges } from './geometry.js';
import { measureProject } from './measure.js';
import {
  SURFACES, GLOBAL_SURFACES, resolveMaterial, roomSurfaces, refPrefs, UNPRICED_SURFACES,
} from './finishes.js';
import { product, refKind, REF_KINDS, VERIFICATION, COLOR_FAMILIES } from './products.js';

export const REF_FORMAT = 'bina.material-references';
export const REF_VERSION = 1;

const SURFACE_EN = {
  floor: 'floor', walls: 'walls', walls_upper: 'walls above the tiles', backsplash: 'kitchen backsplash',
  countertop: 'kitchen countertop', cabinet: 'kitchen cabinet fronts', vanity: 'vanity top', ceiling: 'ceiling',
  skirting: 'skirting boards', sanitary: 'sanitary fixtures', door: 'interior doors', sill: 'window sills',
};
const PURPOSE_EN = {
  living: 'living room', kitchenLiving: 'kitchen-living room', kitchen: 'kitchen', bedroom: 'bedroom', kids: "children's room",
  study: 'study', hall: 'hallway', wardrobe: 'walk-in wardrobe', bathroom: 'bathroom', wc: 'WC', laundry: 'laundry',
  storage: 'storage room', balcony: 'balcony', other: 'room',
};

// Direction of the room's longest wall, as 'x' (left–right on the plan) or 'y'.
function longestWallAxis(room) {
  const e = edges(room.points).reduce((a, b) => (b.len > a.len ? b : a));
  return Math.abs(e.ux) >= Math.abs(e.uy) ? 'x' : 'y';
}

// How the pattern is laid. Planks and long tiles run along (or across) the longest wall;
// other tiles sit on a grid; stone, paint and plain finishes have no direction.
function layout(p, room, surface, prefs) {
  const k = p.pattern.kind;
  if (p.category === 'cabinet_front') {
    return k === 'plank'
      ? { pattern: 'panels', direction: 'vertical', planAxis: null, chosen: false, en: 'wood grain running vertically on each door' }
      : { pattern: 'panels', direction: null, planAxis: null, chosen: false, en: 'flat door panels' };
  }
  const long = p.size && p.size.length / p.size.width >= 2.5;
  if (k === 'plank' || k === 'herringbone' || (k === 'tile' && long && (surface === 'floor'))) {
    const dir = prefs.orientation === 'across' ? 'across' : 'along';
    const axis = room ? longestWallAxis(room) : null;
    const planAxis = axis ? (dir === 'along' ? axis : axis === 'x' ? 'y' : 'x') : null;
    return {
      pattern: k === 'herringbone' ? 'herringbone' : p.pattern.stagger || k === 'plank' ? 'staggered' : 'straight',
      direction: dir,
      planAxis,
      chosen: prefs.orientation !== 'auto',
      en: `${k === 'herringbone' ? 'herringbone, axis' : 'long side'} ${dir === 'along' ? 'parallel' : 'perpendicular'} to the longest wall`,
    };
  }
  if (k === 'tile') {
    const wall = surface !== 'floor';
    return {
      pattern: p.pattern.stagger ? 'staggered' : 'grid',
      direction: wall && p.size && p.size.length !== p.size.width ? 'horizontal' : null,
      planAxis: null,
      chosen: false,
      en: `${p.pattern.stagger ? 'staggered' : 'straight grid'}${wall && p.size && p.size.length !== p.size.width ? ', long side horizontal' : ''}`,
    };
  }
  if (k === 'stone' && p.pattern.veinHex) return { pattern: 'slab', direction: 'along', planAxis: null, chosen: false, en: 'veins running along the length of the slab' };
  return { pattern: k === 'paint' || k === 'flat' ? 'continuous' : 'slab', direction: null, planAxis: null, chosen: false, en: 'continuous surface' };
}

function sizeText(s) {
  if (!s) return null;
  const mm = (v) => Math.round(v * 1000);
  return `${mm(s.length)} × ${mm(s.width)} mm`;
}

// A plain-English sentence for an image model, built only from recorded fields.
function promptText(ref) {
  const p = ref.material;
  const parts = [];
  const color = `${COLOR_FAMILIES[p.colorFamily].en} (approx. ${p.colorHex})`;
  const finish = p.finishEn ? `${p.finishEn} ` : '';
  parts.push(`${ref.target.surfaceEn[0].toUpperCase()}${ref.target.surfaceEn.slice(1)} of the ${ref.target.roomEn}: ${finish}${color} ${p.patternEn}`);
  if (p.unitSize) parts.push(`unit size ${p.unitSize}`);
  if (ref.layout.en && ref.layout.pattern !== 'continuous') parts.push(ref.layout.en);
  if (ref.kind === 'preference') parts.push('design preference, not a specific product');
  else parts.push(`real product "${p.name}"${p.manufacturer ? ` by ${p.manufacturer}` : ''}${p.colorIsPreference ? ' (tinting base; the colour is a preference)' : ''}`);
  if (ref.kind === 'product-approx') parts.push('no product photo: match colour, finish and scale, do not copy branding');
  parts.push(ref.mandatory ? 'must be used as specified' : 'may be adjusted to suit the design');
  return `${parts.join('; ')}.`;
}

function entry(project, room, surface, measured) {
  const { material, source } = resolveMaterial(project, room, surface);
  if (!material) return null;
  const p = product(material.id);
  const prefs = refPrefs(project, room, surface);
  const kind = refKind(p);
  const purpose = room ? PURPOSES[room.purpose] || PURPOSES.other : null;
  const surfaceLabel = room ? SURFACES[surface].label : GLOBAL_SURFACES[surface].label;
  const lay = layout(p, room, surface, prefs);
  const ref = {
    key: `${room ? room.id : '*'}|${surface}`,
    target: {
      roomId: room ? room.id : null,
      roomLabel: room ? roomLabel(room, project.rooms) : 'მთელი ბინა',
      roomPurpose: room ? room.purpose : null,
      roomEn: room ? PURPOSE_EN[room.purpose] || 'room' : 'whole apartment',
      surface,
      surfaceLabel,
      surfaceEn: SURFACE_EN[surface] || surface,
      areaM2: room && measured ? surfaceArea(measured, surface, purpose) : null,
    },
    materialId: material.id,
    chosenBy: source === 'room' ? 'room' : source === 'global' ? 'apartment' : 'style', // who set it
    kind,
    kindLabel: REF_KINDS[kind].label,
    mandatory: prefs.mandatory,
    priced: !UNPRICED_SURFACES.has(surface),
    material: {
      name: p.name,
      manufacturer: p.manufacturer,
      category: p.category,
      categoryLabel: p.categoryLabel,
      description: p.description,
      colorHex: p.color.hex,
      colorFamily: p.color.family,
      colorIsPreference: !!p.verification.evidence?.base,
      finish: p.finish?.label || null,
      finishEn: p.finish?.en || null,
      pattern: p.pattern.label,
      patternEn: p.pattern.en,
      unitSize: sizeText(p.size),
      unitSizeM: p.size,
      thicknessMm: p.thicknessMm,
    },
    identity: kind === 'preference' ? null : {
      retailer: p.retailer?.label || null,
      retailerCode: p.retailerCode,
      productUrl: p.sourceUrl,
      verification: p.verification.status,
      verificationLabel: VERIFICATION[p.verification.status].label,
      verifiedOn: p.verification.checked,
      price: p.price,
      availability: p.availability,
    },
    visual: {
      image: p.image ? { path: p.image.path, license: p.image.license, holder: p.image.holder, checked: p.image.checked } : null,
      retailerPage: p.retailerPhoto ? p.retailerPhoto.pageUrl : null, // the shop's photo is there; it is not copied
      swatch: 'synthetic-approximate', // the on-screen sample is drawn, not photographed
    },
    layout: lay,
  };
  ref.prompt = promptText(ref);
  return ref;
}

function surfaceArea(m, surface, purpose) {
  switch (surface) {
    case 'floor': return round2(m.floorArea);
    case 'walls': return round2(purpose?.wet ? m.wallTileArea : m.wallPaintArea);
    case 'walls_upper': return round2(m.wallPaintArea);
    case 'ceiling': return round2(m.ceilingArea);
    case 'backsplash': return round2(m.backsplashArea);
    case 'countertop': return round2(m.countertopArea);
    case 'vanity': return round2(m.vanityArea);
    default: return null;
  }
}
const round2 = (v) => Math.round(v * 100) / 100;

// The material board of one room: every finish chosen for it, in display order.
export function roomBoard(project, room, measured = measureProject(project)) {
  const m = measured.rooms.find((x) => x.id === room.id);
  return roomSurfaces(room, m).map((s) => entry(project, room, s, m)).filter(Boolean);
}

// Apartment-wide finishes (doors, window sills) when the plan has any.
export function apartmentBoard(project, measured = measureProject(project)) {
  const out = [];
  if (measured.totals.doorCount > 0) out.push(entry(project, null, 'door', null));
  if (measured.totals.windowCount > 0) out.push(entry(project, null, 'sill', null));
  return out.filter(Boolean);
}

export function referencePackage(project, { generatedAt = new Date().toISOString(), roomId = null } = {}) {
  const measured = measureProject(project);
  const rooms = roomId ? project.rooms.filter((r) => r.id === roomId) : project.rooms;
  const references = [
    ...(roomId ? [] : apartmentBoard(project, measured)),
    ...rooms.flatMap((r) => roomBoard(project, r, measured)),
  ];
  return {
    format: REF_FORMAT,
    version: REF_VERSION,
    generatedAt,
    project: {
      name: project.name,
      style: project.style,
      styleLabel: STYLES[project.style]?.label,
      tier: project.tier,
      tierLabel: TIERS[project.tier]?.label,
      rooms: rooms.map((r) => ({ id: r.id, label: roomLabel(r, project.rooms), purpose: r.purpose, areaM2: round2(area(r.points)) })),
    },
    kinds: Object.fromEntries(Object.entries(REF_KINDS).map(([k, v]) => [k, v.desc])),
    references,
  };
}

// The exact product ids a project has chosen (not style defaults), by surface key.
export function chosenProducts(project) {
  return referencePackage(project, { generatedAt: '' }).references
    .filter((r) => r.chosenBy !== 'style')
    .reduce((o, r) => ({ ...o, [r.key]: r.materialId }), {});
}
