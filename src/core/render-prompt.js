// Instructions for the image model, built only from a validated scene specification and
// the catalog. No free text from the request reaches the model.
//
// Reference images, in this order:
//   Image 1     the layout sketch: the room drawn by BINA's 3D view from the chosen camera
//   Image 2..n  drawn material samples for the surfaces listed in `materialImages`
import { product } from './products.js';
import { COLOR_FAMILIES } from './products.js';
import { PURPOSE_EN, PURPOSE_MOOD, OPENING_EN, FURNITURE_EN, STYLE_EN } from './scene.js';

const SURFACE_EN = {
  floor: 'floor', walls: 'walls', walls_upper: 'walls above the tiling', backsplash: 'kitchen backsplash',
  countertop: 'kitchen countertop', cabinet: 'kitchen cabinet fronts', vanity: 'vanity top', ceiling: 'ceiling',
  skirting: 'skirting boards', sanitary: 'sanitary ware', door: 'interior doors', sill: 'window sills',
};
const SIDE_EN = { ahead: 'ahead of the camera', left: 'on the left', right: 'on the right', behind: 'behind the camera (not visible)', here: 'at the camera' };
const DIR_EN = {
  along: 'long side parallel to the longest wall', across: 'long side perpendicular to the longest wall',
  horizontal: 'long side horizontal', vertical: 'grain running vertically',
};

const m2 = (v) => `${v.toFixed(2)} m`;

function materialLine(m, imageNo) {
  const p = product(m.materialId);
  const parts = [];
  const what = m.kind === 'preference'
    ? 'design preference (no specific product)'
    : `product "${p.name}"${p.manufacturer ? ` by ${p.manufacturer}` : ''}`;
  const tone = p.color.family === 'wood' ? 'medium-brown' : COLOR_FAMILIES[p.color.family].en;
  parts.push(`${p.finish ? `${p.finish.en} ` : ''}${tone} ${p.pattern.en}, approximate colour ${p.color.hex}`);
  if (p.size) parts.push(`each piece ${Math.round(p.size.length * 1000)} × ${Math.round(p.size.width * 1000)} mm`);
  if (m.direction && DIR_EN[m.direction]) parts.push(DIR_EN[m.direction]);
  parts.push(what);
  if (imageNo) parts.push(`Image ${imageNo} is a drawn sample of it (approximate, not a photograph): follow its colour, pattern and scale`);
  return `- ${SURFACE_EN[m.surface] || m.surface} [${m.mandatory ? 'use as specified' : 'may be adjusted to fit the design'}]: ${parts.join('; ')}.`;
}

export function buildRenderPrompt(spec, { materialImages = [] } = {}) {
  const r = spec.room;
  const lines = [];
  const purpose = PURPOSE_EN[r.purpose] || 'room';
  lines.push(`Create a photorealistic interior photograph of a ${purpose}.`);
  lines.push('');
  lines.push('Image 1 is a simple 3D layout sketch of exactly this room, rendered by a planning tool from the exact camera position to use. It is the binding layout:');
  lines.push('- keep the room shape, wall positions, ceiling height and camera viewpoint exactly as in Image 1;');
  lines.push('- keep every door and window where Image 1 shows it, with the same size and sill height; do not add, remove or move doors, windows or walls;');
  lines.push('- keep every piece of furniture in the same place, size and orientation; turn the plain blocks into realistic furniture of that type and size; do not add large furniture;');
  lines.push('- replace the flat sketch colours with the real finishes listed below.');
  lines.push('');
  lines.push(`Room: ${m2(r.size.w)} × ${m2(r.size.d)} (floor area ${r.area.toFixed(1)} m²), ceiling height ${m2(r.ceiling)}.`);
  const c = spec.camera;
  lines.push(`Camera: a person standing in the room, eye level ${m2(c.position.z)}, wide-angle interior lens (about ${Math.round(c.fov)}° vertical field of view), verticals straight.`);

  const wallLines = [];
  for (const w of r.walls) {
    if (w.side === 'behind' || w.side === 'here') continue;
    const ops = spec.openings.filter((o) => o.wall === w.n);
    const desc = ops.length
      ? ops.map((o) => `${OPENING_EN[o.type] || 'opening'} ${m2(o.width)} wide × ${m2(o.height)} high${o.sill > 0.05 ? `, sill at ${m2(o.sill)}` : ''}${o.leadsTo === 'outside' ? ' to the outside' : ` to the ${PURPOSE_EN[o.leadsTo] || 'next room'}`}`).join('; ')
      : 'no openings';
    wallLines.push(`- ${w.facing} wall, ${m2(w.length)} long, ${SIDE_EN[w.side]}: ${desc}.`);
  }
  if (wallLines.length) {
    lines.push('Visible walls:');
    lines.push(...wallLines);
  }

  const visible = spec.furniture.filter((f) => f.side !== 'behind' && f.side !== 'here');
  if (visible.length) {
    lines.push('Furniture (sizes are width × depth × height):');
    for (const f of visible) lines.push(`- ${FURNITURE_EN[f.type] || 'furniture'}, ${m2(f.w)} × ${m2(f.d)} × ${m2(f.h)}, ${SIDE_EN[f.side]}.`);
  }

  if (spec.materials.length) {
    lines.push('Finishes:');
    const imageNo = new Map(materialImages.map((s, i) => [s, i + 2]));
    for (const m of spec.materials) lines.push(materialLine(m, imageNo.get(m.surface)));
  }

  lines.push('');
  lines.push(`Interior style: ${STYLE_EN[spec.style] || STYLE_EN.modern}. Choose loose furniture, textiles and a few accessories in this style; they must not cover the listed finishes.`);
  lines.push(`Mood and light: ${PURPOSE_MOOD[r.purpose] || 'natural daylight'}; realistic exposure, soft shadows, no colour cast.`);
  lines.push('Output: realistic architectural interior photography, correct perspective, realistic material texture and scale. No people, no text, no labels, no dimensions, no logos or brand marks, no watermark, no split views or collage.');
  return lines.join('\n');
}
