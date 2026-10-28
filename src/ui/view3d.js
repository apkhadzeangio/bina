// 3D view of the whole apartment. Walls are single-sided planes facing into each room,
// so walls between the camera and a room disappear and the interiors stay visible.
import * as G from '../core/geometry.js';
import { PURPOSES, OPENING_TYPES } from '../core/model.js';
import { openingHosts, kitchenRuns, roomHeight, GEOMETRY_RULES } from '../core/measure.js';
import { resolveMaterial } from '../core/finishes.js';
import { STYLES } from '../core/catalog.js';
import { texturePatch, isTextured } from './textures.js';
import { cssVar } from './dom.js';

export function createView3D({ THREE, container, onPickRoom }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'ბინის 3D ხედი');
  renderer.domElement.style.touchAction = 'none';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 300);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8c8478, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6e8, 0.62);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  let group = null;
  let floors = [];
  let decos = []; // doors, glass and sills that belong to one wall
  let outline = null;
  let bounds = { minX: 0, minY: 0, maxX: 10, maxY: 8, w: 10, h: 8 };
  let cut = false;
  let lastProject = null;
  let focused = null;
  // Camera starts south of the plan looking north, so the 3D view reads like the drawing.
  const ctl = { target: new THREE.Vector3(5, 0, 4), theta: 1.22, phi: 0.8, dist: 16 };
  let anim = null;

  const texCache = new Map();
  const matCache = new Map();

  function texFor(material, repeatW, repeatH) {
    const patch = texturePatch(material);
    if (!patch) return null;
    const key = `${material.id}|${repeatW ?? ''}|${repeatH ?? ''}`;
    if (texCache.has(key)) return texCache.get(key);
    const t = new THREE.CanvasTexture(patch.canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (repeatW) t.repeat.set(repeatW / patch.w, repeatH / patch.h);
    else t.repeat.set(1 / patch.w, 1 / patch.h);
    texCache.set(key, t);
    return t;
  }

  function matFor(material, opts = {}) {
    const key = `${material.id}|${opts.repeatW || ''}|${opts.repeatH || ''}|${opts.side || ''}`;
    if (matCache.has(key)) return matCache.get(key);
    const look = material.look;
    const glossy = look.gloss || look.pattern === 'marble' || material.cat === 'stone';
    const m = new THREE.MeshStandardMaterial({
      color: isTextured(material) ? 0xffffff : new THREE.Color(look.base).convertSRGBToLinear(),
      map: isTextured(material) ? texFor(material, opts.repeatW, opts.repeatH) : null,
      roughness: glossy ? 0.38 : look.kind === 'paint' ? 0.92 : 0.75,
      metalness: 0,
      side: opts.side || THREE.FrontSide,
    });
    matCache.set(key, m);
    return m;
  }

  function plainMat(hex, extra = {}) {
    const key = `plain|${hex}|${JSON.stringify(extra)}`;
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).convertSRGBToLinear(), roughness: 0.8, metalness: 0, ...extra });
    matCache.set(key, m);
    return m;
  }

  // Wall as rectangles around its openings: u runs along the wall, v up from the floor.
  function wallGeometry(e, h, cells) {
    const byKey = new Map();
    for (const c of cells) {
      if (!byKey.has(c.key)) byKey.set(c.key, { pos: [], uv: [], nrm: [] });
      const g = byKey.get(c.key);
      const P = (u, v) => [e.a.x + e.ux * u, v, e.a.y + e.uy * u];
      const quad = [P(c.u0, c.v0), P(c.u1, c.v0), P(c.u1, c.v1), P(c.u0, c.v0), P(c.u1, c.v1), P(c.u0, c.v1)];
      const uvs = [[c.u0, c.v0], [c.u1, c.v0], [c.u1, c.v1], [c.u0, c.v0], [c.u1, c.v1], [c.u0, c.v1]];
      for (let k = 0; k < 6; k++) {
        g.pos.push(...quad[k]);
        g.uv.push(...uvs[k]);
        g.nrm.push(e.nx, 0, e.ny);
      }
    }
    const out = new Map();
    for (const [key, g] of byKey) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
      out.set(key, geo);
    }
    return out;
  }

  function wallCells(len, h, holes, bands, regions) {
    const us = new Set([0, len]);
    const vs = new Set([0, h]);
    for (const o of holes) {
      us.add(Math.max(0, Math.min(len, o.u0)));
      us.add(Math.max(0, Math.min(len, o.u1)));
      vs.add(Math.max(0, Math.min(h, o.v0)));
      vs.add(Math.max(0, Math.min(h, o.v1)));
    }
    for (const b of bands) if (b.v > 0 && b.v < h) vs.add(b.v);
    for (const r of regions) {
      us.add(Math.max(0, Math.min(len, r.u0)));
      us.add(Math.max(0, Math.min(len, r.u1)));
      vs.add(Math.max(0, Math.min(h, r.v0)));
      vs.add(Math.max(0, Math.min(h, r.v1)));
    }
    const U = [...us].sort((a, b) => a - b);
    const V = [...vs].sort((a, b) => a - b);
    const cells = [];
    for (let i = 0; i + 1 < U.length; i++) {
      for (let j = 0; j + 1 < V.length; j++) {
        const u0 = U[i];
        const u1 = U[i + 1];
        const v0 = V[j];
        const v1 = V[j + 1];
        if (u1 - u0 < 1e-4 || v1 - v0 < 1e-4) continue;
        const uc = (u0 + u1) / 2;
        const vc = (v0 + v1) / 2;
        if (holes.some((o) => uc > o.u0 && uc < o.u1 && vc > o.v0 && vc < o.v1)) continue;
        const reg = regions.find((r) => uc > r.u0 && uc < r.u1 && vc > r.v0 && vc < r.v1);
        let key = reg ? reg.key : 'main';
        if (!reg) {
          for (const b of bands) if (vc > b.v) key = b.key;
        }
        cells.push({ u0, u1, v0, v1, key });
      }
    }
    return cells;
  }

  function addBox(parent, w, hgt, d, mat, x, y, z, rotY = 0, cast = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function build(project) {
    if (group) {
      scene.remove(group);
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    group = new THREE.Group();
    floors = [];
    decos = [];
    const p = project;
    const style = STYLES[p.style] || STYLES.modern;
    const { hosts } = openingHosts(p);
    const allPts = p.rooms.flatMap((r) => r.points);
    bounds = allPts.length ? G.bounds(allPts) : { minX: 0, minY: 0, maxX: 10, maxY: 8, w: 10, h: 8 };

    // the building slab: shows through wall gaps like poché on a drawing
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.w + 1.2, bounds.h + 1.2),
      plainMat(cssVar('--slab') || '#4a4846'),
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(bounds.minX + bounds.w / 2, -0.015, bounds.minY + bounds.h / 2);
    slab.receiveShadow = true;
    group.add(slab);

    const doorMat = resolveMaterial(p, null, 'door').material;
    const sillMat = resolveMaterial(p, null, 'sill').material;
    const glass = plainMat('#bcd6e6', { transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false });
    const cabinet = plainMat(style.cabinet);
    const capMat = plainMat(cssVar('--wall-cap') || '#3a3936', { side: THREE.DoubleSide });

    for (const room of p.rooms) {
      const purpose = PURPOSES[room.purpose] || PURPOSES.other;
      const fullH = roomHeight(room, p);
      const h = cut ? Math.min(1.25, fullH) : fullH;
      const floorM = resolveMaterial(p, room, 'floor').material;

      const shape = new THREE.Shape(room.points.map((q) => new THREE.Vector2(q.x, -q.y)));
      const fg = new THREE.ShapeGeometry(shape);
      fg.rotateX(-Math.PI / 2);
      const floor = new THREE.Mesh(fg, floorM ? matFor(floorM) : plainMat('#cccccc'));
      floor.receiveShadow = true;
      floor.userData.roomId = room.id;
      group.add(floor);
      floors.push(floor);

      if (purpose.outdoor) {
        // a low parapet so the balcony reads as one
        const es = G.edges(room.points);
        const rail = plainMat('#9a978f');
        for (const e of es) {
          const items = hosts.get(`${room.id}:${e.i}`) || [];
          if (items.length) continue; // the wall with the balcony door is the building
          const cx = (e.a.x + e.b.x) / 2 - e.nx * 0.04;
          const cz = (e.a.y + e.b.y) / 2 - e.ny * 0.04;
          addBox(group, e.len, 1.0, 0.08, rail, cx, 0.5, cz, -Math.atan2(e.uy, e.ux));
        }
        continue;
      }

      const wallsM = resolveMaterial(p, room, 'walls').material;
      const upperM = purpose.wet ? resolveMaterial(p, room, 'walls_upper').material : null;
      const splashM = purpose.kitchen ? resolveMaterial(p, room, 'backsplash').material : null;
      const tileH = purpose.wet ? Math.min(fullH, room.tileHeight ?? fullH) : null;
      const runs = purpose.kitchen ? kitchenRuns(room) : [];
      const G2 = GEOMETRY_RULES;

      for (const e of G.edges(room.points)) {
        const items = hosts.get(`${room.id}:${e.i}`) || [];
        const holes = items.map((it) => ({
          u0: it.offset - it.op.width / 2,
          u1: it.offset + it.op.width / 2,
          v0: it.op.sill,
          v1: Math.min(fullH - 0.01, it.op.sill + it.op.height),
        }));
        const bands = [];
        if (purpose.wet && tileH < h) bands.push({ v: tileH, key: 'upper' });
        const regions = runs.filter((r) => r.edge === e.i).map((r) => ({
          u0: r.start, u1: r.start + r.length, v0: G2.counterHeight, v1: G2.counterHeight + G2.backsplashHeight, key: 'splash',
        }));
        const cells = wallCells(e.len, h, holes, bands, regions);
        const geos = wallGeometry(e, h, cells);
        for (const [key, geo] of geos) {
          const mat = key === 'splash' ? splashM : key === 'upper' ? upperM : wallsM;
          const mesh = new THREE.Mesh(geo, mat ? matFor(mat) : plainMat('#eeeeee'));
          mesh.receiveShadow = true;
          mesh.castShadow = true;
          group.add(mesh);
        }
        // the cut top of the wall, like the poché on the plan
        const capW = 0.15;
        const cap = new THREE.Mesh(new THREE.PlaneGeometry(e.len + capW * 2, capW), capMat);
        cap.rotation.order = 'YXZ';
        cap.rotation.y = -Math.atan2(e.uy, e.ux);
        cap.rotation.x = -Math.PI / 2;
        cap.position.set((e.a.x + e.b.x) / 2 - e.nx * capW / 2, h + 0.002, (e.a.y + e.b.y) / 2 - e.ny * capW / 2);
        group.add(cap);

        // doors, glass and sills: hidden together with their wall when the wall faces away
        const deco = new THREE.Group();
        deco.userData.wall = { x: (e.a.x + e.b.x) / 2, z: (e.a.y + e.b.y) / 2, nx: e.nx, nz: e.ny };
        group.add(deco);
        decos.push(deco);
        for (const it of items) {
          const op = it.op;
          const t = OPENING_TYPES[op.type];
          const c = { x: e.a.x + e.ux * it.offset, y: e.a.y + e.uy * it.offset };
          const rot = -Math.atan2(e.uy, e.ux);
          if (!it.own) continue;
          if (t.kind === 'window') {
            const gx = c.x - e.nx * 0.08;
            const gz = c.y - e.ny * 0.08;
            if (op.sill + op.height / 2 < h + 0.2) {
              const pane = new THREE.Mesh(new THREE.PlaneGeometry(op.width, Math.min(op.height, Math.max(0.05, h - op.sill))), glass);
              pane.position.set(gx, op.sill + Math.min(op.height, h - op.sill) / 2, gz);
              pane.rotation.y = rot;
              deco.add(pane);
            }
            if (op.type === 'window' && sillMat && op.sill < h) {
              const len = op.width + G2.sillExtra;
              const sm = sillMat.look.kind === 'stone' ? matFor(sillMat, { repeatW: len, repeatH: 0.3 }) : matFor(sillMat);
              addBox(deco, len, 0.03, 0.3, sm, c.x - e.nx * 0.1 + e.nx * 0.04, op.sill + 0.015, c.y - e.ny * 0.1 + e.ny * 0.04, rot, false);
            }
          } else if (op.type === 'door' && doorMat) {
            // an open door leaf turned into the room
            const hinge = { x: c.x - e.ux * op.width / 2, y: c.y - e.uy * op.width / 2 };
            const ang = Math.atan2(e.ny, e.nx);
            const lw = op.width - 0.04;
            const hh = Math.min(op.height, h) - 0.02;
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(lw, hh, 0.04), matFor(doorMat));
            const dirx = Math.cos(ang - 0.2);
            const dirz = Math.sin(ang - 0.2);
            leaf.position.set(hinge.x + dirx * lw / 2, hh / 2, hinge.y + dirz * lw / 2);
            leaf.rotation.y = -Math.atan2(dirz, dirx);
            leaf.castShadow = true;
            deco.add(leaf);
          } else if (op.type === 'entrance') {
            addBox(deco, op.width, Math.min(op.height, h), 0.06, plainMat('#3b3936'), c.x - e.nx * 0.09, Math.min(op.height, h) / 2, c.y - e.ny * 0.09, rot);
          }
        }
      }

      // kitchen base cabinets and countertop
      for (const r of runs) {
        const e = G.edge(room.points, r.edge);
        const mid = r.start + r.length / 2;
        const cx = e.a.x + e.ux * mid + e.nx * 0.3;
        const cz = e.a.y + e.uy * mid + e.ny * 0.3;
        const rot = -Math.atan2(e.uy, e.ux);
        addBox(group, r.length, 0.86, 0.6, cabinet, cx, 0.43, cz, rot);
        const top = resolveMaterial(p, room, 'countertop').material;
        if (top) {
          const tx = e.a.x + e.ux * mid + e.nx * 0.31;
          const tz = e.a.y + e.uy * mid + e.ny * 0.31;
          addBox(group, r.length, 0.04, G2.counterDepth, matFor(top, { repeatW: r.length, repeatH: G2.counterDepth }), tx, 0.88 + (r.edge % 2) * 0.001, tz, rot);
        }
      }

      // bathroom vanity on the longest wall without openings
      if (purpose.surfaces.vanity) {
        const es = G.edges(room.points);
        const free = es.filter((e) => !(hosts.get(`${room.id}:${e.i}`) || []).length && e.len >= 1);
        const e = (free.length ? free : es).reduce((m, x) => (x.len > m.len ? x : m));
        const mid = e.len / 2;
        const cx = e.a.x + e.ux * mid + e.nx * 0.25;
        const cz = e.a.y + e.uy * mid + e.ny * 0.25;
        const rot = -Math.atan2(e.uy, e.ux);
        addBox(group, G2.vanityLength, 0.5, G2.vanityDepth, cabinet, cx, 0.6, cz, rot);
        const top = resolveMaterial(p, room, 'vanity').material;
        if (top) addBox(group, G2.vanityLength, 0.03, G2.vanityDepth, matFor(top, { repeatW: G2.vanityLength, repeatH: G2.vanityDepth }), cx, 0.865, cz, rot);
      }
    }

    scene.add(group);
    // shadows cover the apartment
    const cx = bounds.minX + bounds.w / 2;
    const cz = bounds.minY + bounds.h / 2;
    const R = Math.max(bounds.w, bounds.h) * 0.75 + 2;
    sun.position.set(cx - R * 0.6, R * 1.6, cz - R * 0.9);
    sun.target.position.set(cx, 0, cz);
    const sc = sun.shadow.camera;
    sc.left = -R;
    sc.right = R;
    sc.top = R;
    sc.bottom = -R;
    sc.near = 0.5;
    sc.far = R * 5;
    sc.updateProjectionMatrix();
    drawOutline();
  }

  function drawOutline() {
    if (outline) {
      scene.remove(outline);
      outline.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      outline = null;
    }
    if (!focused || !lastProject) return;
    const room = lastProject.rooms.find((r) => r.id === focused);
    if (!room) return;
    outline = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--accent') || '#2f55d4').convertSRGBToLinear() });
    for (const e of G.edges(room.points)) {
      const w = 0.07;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(e.len + w, w), mat);
      m.rotation.order = 'YXZ';
      m.rotation.y = -Math.atan2(e.uy, e.ux);
      m.rotation.x = -Math.PI / 2;
      m.position.set((e.a.x + e.b.x) / 2 + e.nx * w / 2, 0.012, (e.a.y + e.b.y) / 2 + e.ny * w / 2);
      outline.add(m);
    }
    scene.add(outline);
  }

  // ------------------------------------------------------------------ camera
  function applyCamera() {
    const { target, theta, phi, dist } = ctl;
    camera.position.set(
      target.x + dist * Math.sin(phi) * Math.cos(theta),
      target.y + dist * Math.cos(phi),
      target.z + dist * Math.sin(phi) * Math.sin(theta),
    );
    camera.lookAt(target);
  }

  function fitTo(b, animate = true) {
    const cx = b.minX + b.w / 2;
    const cz = b.minY + b.h / 2;
    const size = Math.max(b.w, b.h, 2.5);
    const aspect = camera.aspect || 1;
    const dist = (size * 0.74) / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, aspect * 0.95) + 2;
    const to = { x: cx, y: 0, z: cz, dist };
    if (!animate) {
      ctl.target.set(to.x, to.y, to.z);
      ctl.dist = to.dist;
      render();
      return;
    }
    const from = { x: ctl.target.x, y: ctl.target.y, z: ctl.target.z, dist: ctl.dist };
    const t0 = performance.now();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 0 : 450;
    cancelAnimationFrame(anim);
    const step = (now) => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      const s = k * k * (3 - 2 * k);
      ctl.target.set(from.x + (to.x - from.x) * s, from.y + (to.y - from.y) * s, from.z + (to.z - from.z) * s);
      ctl.dist = from.dist + (to.dist - from.dist) * s;
      render();
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  function render() {
    applyCamera();
    const c = camera.position;
    for (const d of decos) {
      const w = d.userData.wall;
      d.visible = (c.x - w.x) * w.nx + (c.z - w.z) * w.nz > 0;
    }
    renderer.render(scene, camera);
  }

  function resize() {
    const r = container.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }

  // ------------------------------------------------------------------ input
  const ptrs = new Map();
  let dragInfo = null;
  let pinchD = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragInfo = { x: e.clientX, y: e.clientY, moved: false, pan: e.button === 2 || e.shiftKey };
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinchD = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (dragInfo && Math.hypot(e.clientX - dragInfo.x, e.clientY - dragInfo.y) > 4) dragInfo.moved = true;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD) ctl.dist = Math.max(2, Math.min(80, ctl.dist * (pinchD / d)));
      pinchD = d;
      panBy(dx / 2, dy / 2);
      render();
      return;
    }
    if (dragInfo?.pan) panBy(dx, dy);
    else {
      ctl.theta += dx * 0.006;
      ctl.phi = Math.max(0.12, Math.min(1.45, ctl.phi - dy * 0.006));
    }
    render();
  });
  const end = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinchD = null;
    if (dragInfo && !dragInfo.moved && e.type === 'pointerup') pick(e);
    if (!ptrs.size) dragInfo = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    ctl.dist = Math.max(2, Math.min(80, ctl.dist * Math.exp(e.deltaY * 0.0012)));
    render();
  }, { passive: false });

  function panBy(dx, dy) {
    const k = ctl.dist * 0.0016;
    const fwd = new THREE.Vector3(Math.cos(ctl.theta), 0, Math.sin(ctl.theta));
    const right = new THREE.Vector3(-Math.sin(ctl.theta), 0, Math.cos(ctl.theta));
    ctl.target.addScaledVector(right, -dx * k);
    ctl.target.addScaledVector(fwd, -dy * k);
  }

  const ray = new THREE.Raycaster();
  function pick(e) {
    const r = el.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hit = ray.intersectObjects(floors, false)[0];
    onPickRoom?.(hit ? hit.object.userData.roomId : null);
  }

  new ResizeObserver(resize).observe(container);

  return {
    update(project, { refit = false } = {}) {
      const bg = cssVar('--view-bg') || '#e9ebe8';
      scene.background = new THREE.Color(bg); // clear colour is not encoded, so pass sRGB as is
      lastProject = project;
      build(project);
      if (refit) fitTo(bounds, false);
      render();
    },
    focusRoom(id) {
      focused = id;
      drawOutline();
      if (id && lastProject) {
        const room = lastProject.rooms.find((r) => r.id === id);
        if (room) fitTo(G.bounds(room.points));
      } else fitTo(bounds);
      render();
    },
    fit() {
      fitTo(bounds);
    },
    setCut(v) {
      cut = v;
      if (lastProject) build(lastProject);
      render();
    },
    get cut() {
      return cut;
    },
    resize,
    render,
    setCamera(c) {
      Object.assign(ctl, c);
      render();
    },
    snapshot() {
      render();
      return renderer.domElement.toDataURL('image/jpeg', 0.85);
    },
  };
}
