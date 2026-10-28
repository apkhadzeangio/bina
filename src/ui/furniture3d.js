// Lightweight 3D stand-ins for the furniture library: a few boxes and cylinders per piece,
// at the piece's real size, so the room reads correctly (and an AI render knows what
// stands where) without detailed models. Built in the piece's local frame: x across the
// width, z along the depth with the front towards +z, y up from the floor.

// Colours that go with each interior style.
export const FURNITURE_PALETTE = {
  modern: { fabric: '#8e949a', fabric2: '#b9bec2', wood: '#b49d82', dark: '#3b3e42', linen: '#f2f1ed', throw: '#7d8a96', metal: '#c3c6c8', white: '#f5f5f2', stone: '#d6d4cf', black: '#1d1f21' },
  scandi: { fabric: '#cfcac0', fabric2: '#e4dfd5', wood: '#d6be98', dark: '#4e5155', linen: '#f5f3ee', throw: '#9fb0a5', metal: '#d4d6d7', white: '#f7f6f2', stone: '#e3e0d9', black: '#202224' },
  warm: { fabric: '#b39a7b', fabric2: '#d3c2a8', wood: '#a27a53', dark: '#4a3e34', linen: '#f3efe7', throw: '#b2734f', metal: '#bdb5a8', white: '#f5f2ec', stone: '#d8ccb8', black: '#231f1c' },
  classic: { fabric: '#d8cebd', fabric2: '#ebe3d4', wood: '#86664a', dark: '#3a322b', linen: '#f6f2ea', throw: '#8b6f78', metal: '#c8c0b2', white: '#f7f4ee', stone: '#e6e1d8', black: '#221e1b' },
  loft: { fabric: '#56595d', fabric2: '#7b7f83', wood: '#6a4e37', dark: '#28292b', linen: '#e9e7e2', throw: '#a3643f', metal: '#97999b', white: '#efeeea', stone: '#a8a7a3', black: '#151617' },
};

export function buildFurniture(THREE, f, room, mats) {
  const g = new THREE.Group();
  const P = mats.pal;
  const M = (hex, extra) => mats.plain(hex, extra);
  const w = f.w;
  const d = f.d;
  const h = f.h;
  const hw = w / 2;
  const hd = d / 2;
  const box = (bw, bh, bd, mat, x, y, z, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.005, bw), Math.max(0.005, bh), Math.max(0.005, bd)), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const cyl = (r, ch, mat, x, y, z, sx = 1, sz = 1) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.005, ch), 24), mat);
    m.position.set(x, y, z);
    m.scale.set(sx, 1, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const legs = (top, lw, mat, inset = 0.05) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(lw, top, lw, mat, sx * (hw - inset), top / 2, sz * (hd - inset));
  };
  const gaps = (n, height, y, mat) => {
    // door gaps on the front of a cabinet
    for (let k = 1; k < n; k++) box(0.006, height, 0.004, mat, -hw + (w / n) * k, y, hd + 0.002, false);
  };

  switch (f.type) {
    case 'sofa':
    case 'armchair': {
      const back = Math.min(0.22, d * 0.26);
      const arm = Math.min(0.18, w * 0.12);
      const seatH = 0.42;
      const fabric = M(P.fabric);
      box(w, seatH - 0.12, d, fabric, 0, (seatH - 0.12) / 2 + 0.04, 0);
      box(w - 0.02, 0.04, d - 0.02, M(P.dark), 0, 0.02, 0, false);
      box(w, h - 0.04, back, fabric, 0, 0.04 + (h - 0.04) / 2, -hd + back / 2);
      for (const sx of [-1, 1]) box(arm, 0.62, d - back, fabric, sx * (hw - arm / 2), 0.31 + 0.02, back / 2);
      const n = f.type === 'armchair' ? 1 : w > 2.5 ? 3 : w > 1.3 ? 2 : 1;
      const span = (w - arm * 2) / n;
      for (let k = 0; k < n; k++) {
        box(span - 0.02, 0.14, d - back - 0.04, M(P.fabric2), -hw + arm + span * (k + 0.5), seatH - 0.05, back / 2 + 0.01);
      }
      break;
    }
    case 'coffee_table':
      box(w, 0.04, d, M(P.wood), 0, h - 0.02, 0);
      legs(h - 0.04, 0.04, M(P.dark));
      break;
    case 'tv_unit': {
      box(w, h, d, M(P.wood), 0, h / 2, 0);
      gaps(Math.max(2, Math.round(w / 0.6)), h - 0.06, h / 2, M(P.dark));
      const tw = Math.min(w * 0.85, 1.45);
      const th = tw * 0.58;
      box(0.25, 0.05, 0.18, M(P.black), 0, h + 0.025, -hd + 0.15);
      box(tw, th, 0.04, M(P.black, { roughness: 0.3 }), 0, h + 0.1 + th / 2, -hd + 0.12);
      break;
    }
    case 'bed_single':
    case 'bed_double': {
      box(w, 0.3, d, M(P.wood), 0, 0.15, 0);
      box(w - 0.04, 0.2, d - 0.08, M(P.linen), 0, 0.4, 0.02);
      box(w, 1.0, 0.07, M(P.fabric), 0, 0.5, -hd + 0.035);
      const py = 0.55;
      const pz = -hd + 0.3;
      if (w >= 1.2) {
        for (const sx of [-1, 1]) box(w / 2 - 0.16, 0.12, 0.34, M(P.white), sx * w / 4, py, pz);
      } else box(w - 0.2, 0.12, 0.34, M(P.white), 0, py, pz);
      const bl = d * 0.62;
      box(w + 0.02, 0.05, bl, M(P.throw), 0, 0.525, hd - bl / 2 - 0.02);
      break;
    }
    case 'wardrobe': {
      box(w, h, d, mats.cabinet, 0, h / 2, 0);
      const n = Math.max(2, Math.round(w / 0.5));
      gaps(n, h - 0.08, h / 2, M(P.dark));
      for (let k = 0; k < n; k++) {
        const x = -hw + (w / n) * (k + 0.5) + (k % 2 ? -1 : 1) * (w / n) * 0.38;
        box(0.015, 0.3, 0.02, M(P.metal), x, h * 0.48, hd + 0.01, false);
      }
      break;
    }
    case 'bedside': {
      box(w, h, d, M(P.wood), 0, h / 2, 0);
      box(w - 0.04, 0.005, 0.004, M(P.dark), 0, h * 0.55, hd + 0.002, false);
      cyl(0.05, 0.22, M(P.dark), 0, h + 0.11, 0);
      cyl(0.12, 0.16, M(P.linen, { emissive: 0x332a1a }), 0, h + 0.3, 0);
      break;
    }
    case 'dining_table':
      box(w, 0.04, d, M(P.wood), 0, h - 0.02, 0);
      legs(h - 0.04, 0.06, M(P.wood), 0.08);
      break;
    case 'chair': {
      const wood = M(P.wood);
      box(w, 0.05, d - 0.06, wood, 0, 0.445, 0.03);
      box(w, Math.max(0.1, h - 0.47), 0.04, wood, 0, 0.47 + Math.max(0.1, h - 0.47) / 2, -hd + 0.03);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.035, 0.42, 0.035, M(P.dark), sx * (hw - 0.04), 0.21, sz * (hd - 0.05) + 0.02);
      break;
    }
    case 'desk': {
      box(w, 0.035, d, M(P.wood), 0, h - 0.0175, 0);
      for (const sx of [-1, 1]) box(0.03, h - 0.035, d - 0.04, M(P.dark), sx * (hw - 0.03), (h - 0.035) / 2, 0);
      box(0.12, 0.1, 0.08, M(P.black), 0, h + 0.05, -hd + 0.12);
      box(Math.min(0.6, w * 0.5), 0.34, 0.025, M(P.black, { roughness: 0.3 }), 0, h + 0.27, -hd + 0.12);
      break;
    }
    case 'kitchen_run': {
      box(w, 0.1, d - 0.06, M(P.dark), 0, 0.05, -0.03);
      box(w, 0.76, d, mats.cabinet, 0, 0.1 + 0.38, 0);
      gaps(Math.max(1, Math.round(w / 0.6)), 0.7, 0.48, M(P.dark));
      box(w, 0.04, d + 0.02, mats.top(room, 'countertop', w, d + 0.02), 0, 0.88, 0.01);
      break;
    }
    case 'fridge': {
      box(w, h, d, M(P.metal, { roughness: 0.35 }), 0, h / 2, 0);
      box(w - 0.02, 0.006, 0.004, M(P.dark), 0, h * 0.62, hd + 0.002, false);
      box(0.02, 0.35, 0.03, M(P.dark), hw - 0.06, h * 0.78, hd + 0.015, false);
      box(0.02, 0.45, 0.03, M(P.dark), hw - 0.06, h * 0.42, hd + 0.015, false);
      break;
    }
    case 'stove': {
      box(w, 0.86, d, M(P.metal, { roughness: 0.4 }), 0, 0.43, 0);
      box(w, 0.03, d, M(P.black, { roughness: 0.2 }), 0, 0.875, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(Math.min(w, d) * 0.1, 0.006, M(P.dark), sx * w * 0.22, 0.893, sz * d * 0.2 - 0.02);
      box(w - 0.12, 0.32, 0.006, M(P.black, { roughness: 0.2 }), 0, 0.42, hd + 0.003, false);
      break;
    }
    case 'sink': {
      box(w, 0.1, d - 0.06, M(P.dark), 0, 0.05, -0.03);
      box(w, 0.76, d, mats.cabinet, 0, 0.48, 0);
      gaps(2, 0.7, 0.48, M(P.dark));
      box(w, 0.04, d + 0.02, mats.top(room, 'countertop', w, d + 0.02), 0, 0.88, 0.01);
      box(Math.max(0.1, w - 0.2), 0.012, Math.max(0.1, d - 0.22), M(P.metal, { roughness: 0.25 }), 0, 0.903, 0.01);
      cyl(0.016, 0.26, M(P.metal, { roughness: 0.2 }), 0, 1.03, -hd + 0.06);
      box(0.03, 0.03, 0.2, M(P.metal, { roughness: 0.2 }), 0, 1.15, -hd + 0.15);
      break;
    }
    case 'toilet': {
      const white = M(P.white, { roughness: 0.25 });
      const tank = Math.min(0.2, d * 0.3);
      box(w, 0.4, tank, white, 0, 0.6, -hd + tank / 2);
      const bd = d - tank;
      cyl(0.5, 0.4, white, 0, 0.2, -hd + tank + bd / 2, w * 0.9, bd * 0.95);
      cyl(0.5, 0.03, M(P.white, { roughness: 0.4 }), 0, 0.415, -hd + tank + bd / 2, w * 0.92, bd * 0.97);
      break;
    }
    case 'bathtub': {
      box(w, h, d, M(P.white, { roughness: 0.25 }), 0, h / 2, 0);
      box(Math.max(0.1, w - 0.14), 0.006, Math.max(0.1, d - 0.14), M('#cfd9de', { roughness: 0.15 }), 0, h + 0.002, 0, false);
      cyl(0.02, 0.2, M(P.metal, { roughness: 0.2 }), -hw + 0.08, h + 0.1, 0);
      break;
    }
    case 'shower': {
      box(w, 0.06, d, M(P.white, { roughness: 0.3 }), 0, 0.03, 0);
      const glassH = Math.max(0.5, h - 0.06);
      box(w, glassH, 0.01, mats.glass, 0, 0.06 + glassH / 2, hd - 0.005, false);
      box(0.01, glassH, d, mats.glass, hw - 0.005, 0.06 + glassH / 2, 0, false);
      cyl(0.012, 0.35, M(P.metal, { roughness: 0.2 }), -hw + 0.08, Math.min(h, 2.0) - 0.15, -hd + 0.05);
      cyl(0.09, 0.02, M(P.metal, { roughness: 0.2 }), -hw + 0.18, Math.min(h, 2.0) - 0.05, -hd + 0.15);
      break;
    }
    case 'vanity': {
      box(w, 0.45, d, mats.cabinet, 0, 0.6, 0);
      gaps(2, 0.4, 0.6, M(P.dark));
      box(w, 0.03, d, mats.top(room, 'vanity', w, d), 0, 0.84, 0);
      box(Math.max(0.1, Math.min(w - 0.2, 0.5)), 0.012, Math.max(0.1, d - 0.2), M(P.white, { roughness: 0.2 }), 0, 0.858, 0.03);
      cyl(0.015, 0.18, M(P.metal, { roughness: 0.2 }), 0, 0.94, -hd + 0.06);
      box(w * 0.9, 0.7, 0.02, M('#c9d4d8', { roughness: 0.05, metalness: 0.3 }), 0, 1.55, -hd + 0.01, false);
      break;
    }
    default:
      box(w, h, d, M(P.fabric), 0, h / 2, 0);
  }
  return g;
}
