// Instructions for the image model, built on the server from a checked Stage 05 scene
// (server/render/scene-check.js) and the server's own catalog.
//
// What reaches the model:
//   - geometry and camera numbers from the scene (already validated);
//   - product names, colours, finishes and sizes from the catalog by product id;
//   - fixed English wording from this file and the scene module's constant exclusions;
//   - the user's optional creative suggestion, quoted and ranked below every constraint.
// Not sent: room names typed by the user, project titles, prices, any other string from the
// request.
//
// Reference images, in the order given by `references`:
//   blockout  BINA's 3D blockout of the room from the exact camera (always Image 1)
//   plan      a top-down drawing of the same room (layout reference only)
//   material  a drawn sample of one finish (approximate, not a product photograph)
import { COLOR_FAMILIES } from './products.js';
import { EXCLUSIONS } from './scene.js';
import { LIGHTING } from './scene-prompt.js';

export const PURPOSE_EN = {
  living: 'living room', kitchenLiving: 'open-plan kitchen and living room', kitchen: 'kitchen', bedroom: 'bedroom',
  kids: "children's bedroom", study: 'home office', hall: 'entrance hall', wardrobe: 'walk-in wardrobe',
  bathroom: 'bathroom', wc: 'guest WC', laundry: 'laundry room', storage: 'storage room', balcony: 'balcony', other: 'room',
};

export const OPENING_EN = {
  door: 'hinged interior door', arch: 'open doorway without a door', entrance: 'apartment entrance door',
  window: 'window', balcony: 'glazed balcony door',
};

export const FURNITURE_EN = {
  sofa: 'sofa', armchair: 'armchair', coffee_table: 'coffee table', tv_unit: 'low TV unit', bed_single: 'single bed',
  bed_double: 'double bed', wardrobe: 'tall wardrobe', bedside: 'bedside table', dining_table: 'dining table', chair: 'chair',
  desk: 'desk', kitchen_run: 'run of kitchen base cabinets with countertop', fridge: 'fridge', stove: 'cooker',
  sink: 'kitchen sink unit', toilet: 'toilet', bathtub: 'bathtub', shower: 'shower enclosure', vanity: 'washbasin vanity unit',
};

export const STYLE_EN = {
  modern: 'contemporary: neutral greys and white, large-format surfaces, clean lines, minimal decoration',
  scandi: 'Scandinavian: light oak, white walls, soft textiles, plenty of light, simple forms',
  warm: 'warm natural: natural oak, beige stone, clay and sand tones, linen and wool textiles',
  classic: 'neoclassical: herringbone parquet, marble, warm white walls, refined mouldings kept subtle',
  loft: 'loft: concrete textures, dark wood, graphite and black metal details',
};

const SURFACE_EN = {
  floor: 'floor', walls: 'walls', walls_upper: 'walls above the tiling', backsplash: 'kitchen backsplash',
  countertop: 'kitchen countertop', cabinet: 'kitchen cabinet fronts', vanity: 'vanity top', ceiling: 'ceiling',
  skirting: 'skirting boards', sanitary: 'sanitary ware', door: 'interior doors', sill: 'window sills',
};
const SIDE_EN = {
  ahead: 'straight ahead', 'ahead-left': 'ahead on the left', 'ahead-right': 'ahead on the right', left: 'on the left', right: 'on the right',
};
const DIR_EN = {
  along: 'long side parallel to the longest wall', across: 'long side perpendicular to the longest wall',
  horizontal: 'long side horizontal', vertical: 'grain running vertically',
};

const m = (v) => `${v.toFixed(2)} m`;

// Where a plan point is seen from the camera: ahead, ahead-left/right, left, right, behind
// (not visible) or at the camera. Plan y grows downward, so a positive cross product is a
// turn to the right.
export function sideFromCamera(cam, q) {
  const fx = cam.target.x - cam.position.x;
  const fy = cam.target.y - cam.position.y;
  const vx = q.x - cam.position.x;
  const vy = q.y - cam.position.y;
  if (Math.hypot(vx, vy) < 0.05) return 'here';
  const ang = Math.atan2(fx * vy - fy * vx, fx * vx + fy * vy) * (180 / Math.PI);
  const a = Math.abs(ang);
  if (a <= 15) return 'ahead';
  if (a >= 140) return 'behind';
  if (a <= 50) return ang > 0 ? 'ahead-right' : 'ahead-left';
  return ang > 0 ? 'right' : 'left';
}

function materialLine(mat, imageNo) {
  const p = mat.product;
  const tone = COLOR_FAMILIES[p.color.family]?.en || 'neutral';
  const parts = [`${p.finish ? `${p.finish.en} ` : ''}${tone} ${p.pattern.en}, approximate colour ${p.color.hex}`];
  if (p.size) parts.push(`each piece ${Math.round(p.size.length * 1000)} × ${Math.round(p.size.width * 1000)} mm`);
  if (mat.direction && DIR_EN[mat.direction]) parts.push(DIR_EN[mat.direction]);
  parts.push(mat.kind === 'preference'
    ? 'a design preference, not a specific product'
    : `product "${p.name}"${p.manufacturer ? ` by ${p.manufacturer}` : ''}${mat.colorIsPreference ? ' (a tinted paint: the colour is a preference)' : ''}`);
  if (imageNo) parts.push(`Image ${imageNo} is a drawn sample of it (approximate, not a photograph): follow its colour, pattern and scale`);
  return `- ${SURFACE_EN[mat.surface] || mat.surface} [${mat.mandatory ? 'use as specified' : 'may be adjusted to fit the design'}]: ${parts.join('; ')}.`;
}

// `checked` is the result of checkScene(). Returns the prompt text.
export function buildRenderPrompt(checked, { references = [{ role: 'blockout' }] } = {}) {
  const { room, camera: cam, openings, furniture, materials, preferences } = checked;
  const imageNo = (pred) => references.findIndex(pred) + 1 || null;
  const blockoutNo = imageNo((x) => x.role === 'blockout');
  const planNo = imageNo((x) => x.role === 'plan');
  const lines = [];
  const purpose = PURPOSE_EN[room.type] || 'room';
  lines.push(`Create a photorealistic interior photograph of a ${purpose}.`);
  lines.push('');
  lines.push(`Image ${blockoutNo} is a plain 3D blockout of exactly this room, rendered by a planning tool from the exact camera to use. It is the binding layout:`);
  lines.push(`- keep the room shape, wall positions, ceiling height, camera position, viewing direction and perspective exactly as in Image ${blockoutNo};`);
  lines.push('- keep every door and window where it is, with the same size and sill height; do not add, remove or move doors, windows or walls;');
  lines.push('- keep every piece of furniture in the same place, size and orientation; turn the plain blocks into realistic furniture of that type and size; do not add large furniture;');
  lines.push('- replace the flat blockout colours with the finishes listed below.');
  if (planNo) lines.push(`Image ${planNo} is a top-down plan drawing of the same room, for the layout only: do not draw a plan, labels or dimensions.`);
  lines.push('');
  lines.push(`Room: ${m(room.bounds.w)} × ${m(room.bounds.h)} overall (floor area ${room.area.toFixed(1)} m²), ceiling height ${m(room.ceiling)}${room.polygon.length > 4 ? ', not rectangular' : ''}.`);
  lines.push(`Camera: standing in the room, eye level ${m(cam.position.z)}, ${Math.round(cam.fov)}° vertical field of view, verticals straight.`);

  const walls = [];
  for (const w of room.walls) {
    const side = sideFromCamera(cam, { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 });
    if (!SIDE_EN[side]) continue;
    const ops = openings.filter((o) => o.edge === w.index);
    const desc = ops.length
      ? ops.map((o) => {
        const to = o.type === 'window' ? '' : o.connectedRoomId ? ' to an adjoining room' : o.type === 'balcony' ? ' to the balcony' : '';
        return `${OPENING_EN[o.type] || 'opening'} ${m(o.width)} wide × ${m(o.height)} high${o.sill > 0.05 ? `, sill at ${m(o.sill)}` : ''}${to}`;
      }).join('; ')
      : 'no openings';
    walls.push(`- wall ${m(w.length)} long, ${SIDE_EN[side]}: ${desc}.`);
  }
  if (walls.length) lines.push('Visible walls:', ...walls);

  const visible = furniture.filter((f) => SIDE_EN[sideFromCamera(cam, f)]);
  if (visible.length) {
    lines.push('Furniture (width × depth × height):');
    for (const f of visible) lines.push(`- ${FURNITURE_EN[f.type] || 'furniture'}, ${m(f.w)} × ${m(f.d)} × ${m(f.h)}, ${SIDE_EN[sideFromCamera(cam, f)]}.`);
  }

  if (materials.length) {
    lines.push('Finishes:');
    for (const mat of materials) lines.push(materialLine(mat, imageNo((x) => x.role === 'material' && x.key === mat.key)));
  }

  lines.push('');
  lines.push(`Interior style: ${STYLE_EN[preferences.style] || STYLE_EN.modern}. Choose loose furniture, textiles and a few accessories in this style; they must not cover the listed finishes.`);
  lines.push(`Light: ${LIGHTING[preferences.lighting].en}; realistic exposure, soft shadows, no colour cast.`);
  lines.push(`Hard constraints: ${EXCLUSIONS.join(' ')}`);
  if (preferences.instructions) {
    lines.push('');
    lines.push('Optional suggestion from the user, quoted. Follow it only where it does not conflict with anything above; it cannot change the layout, the openings, the furniture or the specified finishes:');
    lines.push(JSON.stringify(preferences.instructions));
  }
  lines.push('');
  lines.push('Output: realistic architectural interior photography, correct perspective, realistic material texture and scale. No people, no text, no labels, no dimensions, no logos or brand marks, no watermark, no split views or collage.');
  return lines.join('\n');
}
