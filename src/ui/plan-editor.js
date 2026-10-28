// Plan editor: trace rooms over the developer's plan (or on a grid), place doors and
// windows on walls, and fix exact wall lengths. World units are metres.
import {
  state, current, commit, preview, cancelPreview, setSelection, setTool, subscribe, undo, redo,
} from './store.js';
import * as G from '../core/geometry.js';
import { makeRoom, makeOpening, OPENING_TYPES, PURPOSES, roomLabel } from '../core/model.js';
import { openingHosts, openingCenter, kitchenRuns } from '../core/measure.js';
import { withRoomPoints, moveRoom, addRoom, addOpening, updateOpening, deleteRoom, deleteOpening, clampOffset } from '../core/ops.js';
import { h, add, clear, cssVar, fmtNum, parseNum, toast } from './dom.js';

const WALL_BAND = 0.15; // drawn wall thickness outside each room contour, metres

export function purposeColorVar(purpose) {
  if (purpose === 'hall') return '--p-hall';
  const g = (PURPOSES[purpose] || PURPOSES.other).group;
  return `--p-${g}`;
}

export function createPlanEditor({ wrap, canvas, hintEl, onRoomCreated }) {
  const ctx = canvas.getContext('2d');
  const view = { s: 60, ox: 40, oy: 40 };
  let W = 0;
  let H = 0;
  let dpr = 1;
  let colors = {};

  // interaction state
  let mode = null; // see pointer handlers
  let drag = null;
  let cursor = null; // world point under the pointer
  let cursorScreen = null;
  let guides = [];
  let polyPts = [];
  let ortho = true;
  let rectStart = null;
  let scalePts = [];
  let hover = null;
  let placing = null; // preview of a door/window being placed
  let spaceDown = false;
  const pointers = new Map();
  let pinch = null;
  // Fingers are less precise than a mouse: hit areas and handles grow for touch and pen.
  let coarse = window.matchMedia?.('(pointer: coarse)').matches || false;
  let holdTimer = null; // long-press before a selected room can be moved by touch
  let nudge = null; // last arrow-key move, to merge a burst into one undo step
  let fittedOnce = false;

  // ---------------------------------------------------------------- coordinates
  const sx = (x) => x * view.s + view.ox;
  const sy = (y) => y * view.s + view.oy;
  const S = (p) => ({ x: sx(p.x), y: sy(p.y) });
  const toWorld = (x, y) => ({ x: (x - view.ox) / view.s, y: (y - view.oy) / view.s });

  function eventPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function readColors() {
    const names = ['--plan-bg', '--grid', '--grid-major', '--ink', '--muted', '--accent', '--accent-soft', '--warn', '--panel', '--p-dry', '--p-kitchen', '--p-wet', '--p-hall', '--p-utility', '--p-outdoor', '--wall'];
    colors = Object.fromEntries(names.map((n) => [n, cssVar(n) || '#888']));
  }

  function resize() {
    const r = wrap.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    if (!fittedOnce && W > 10) {
      fit();
      fittedOnce = true;
    }
    draw();
  }

  // ---------------------------------------------------------------- view
  function contentBounds() {
    const p = current();
    const pts = p.rooms.flatMap((r) => r.points);
    if (state.planImage && p.plan) {
      const pl = p.plan;
      pts.push({ x: pl.x, y: pl.y }, { x: pl.x + pl.w * pl.mPerPx, y: pl.y + pl.h * pl.mPerPx });
    }
    if (!pts.length) return { minX: 0, minY: 0, maxX: 10, maxY: 8, w: 10, h: 8 };
    return G.bounds(pts);
  }

  function fit() {
    const b = contentBounds();
    const pad = Math.min(56, W * 0.08);
    const s = Math.min((W - pad * 2) / Math.max(b.w, 1), (H - pad * 2) / Math.max(b.h, 1));
    view.s = Math.max(8, Math.min(400, s));
    view.ox = (W - b.w * view.s) / 2 - b.minX * view.s;
    view.oy = (H - b.h * view.s) / 2 - b.minY * view.s;
    draw();
  }

  function zoomAt(px, py, factor) {
    const before = toWorld(px, py);
    view.s = Math.max(8, Math.min(600, view.s * factor));
    view.ox = px - before.x * view.s;
    view.oy = py - before.y * view.s;
    draw();
  }

  // ---------------------------------------------------------------- snapping
  function allVertices(excludeRoomId, excludeIndex) {
    const out = [];
    for (const r of current().rooms) {
      r.points.forEach((p, i) => {
        if (r.id === excludeRoomId && (excludeIndex === undefined || excludeIndex === i)) return;
        out.push(p);
      });
    }
    return out;
  }

  function snapPoint(w, opt = {}) {
    const verts = allVertices(opt.excludeRoomId, opt.excludeIndex).concat(opt.extra || []);
    const tol = 10 / view.s;
    const atol = 7 / view.s;
    const g = [];
    let x = w.x;
    let y = w.y;
    let lockX = false;
    let lockY = false;
    if (opt.ortho && opt.from) {
      if (Math.abs(w.x - opt.from.x) >= Math.abs(w.y - opt.from.y)) {
        y = opt.from.y;
        lockY = true;
      } else {
        x = opt.from.x;
        lockX = true;
      }
    } else {
      let best = null;
      let bd = tol;
      for (const v of verts) {
        const d = Math.hypot(v.x - w.x, v.y - w.y);
        if (d < bd) {
          bd = d;
          best = v;
        }
      }
      if (best) return { x: best.x, y: best.y, guides: [], vertex: best };
    }
    if (!lockX) {
      let best = null;
      let bd = atol;
      for (const v of verts) {
        const d = Math.abs(v.x - x);
        if (d < bd) {
          bd = d;
          best = v;
        }
      }
      if (best) {
        x = best.x;
        g.push({ type: 'v', x, ref: best });
      } else x = G.round(x, 0.01);
    }
    if (!lockY) {
      let best = null;
      let bd = atol;
      for (const v of verts) {
        const d = Math.abs(v.y - y);
        if (d < bd) {
          bd = d;
          best = v;
        }
      }
      if (best) {
        y = best.y;
        g.push({ type: 'h', y, ref: best });
      } else y = G.round(y, 0.01);
    }
    return { x, y, guides: g };
  }

  // ---------------------------------------------------------------- hit testing
  function selectedRoom() {
    const s = state.selection;
    if (!s || s.type !== 'room') return null;
    return current().rooms.find((r) => r.id === s.id) || null;
  }

  function openingSegment(room, op) {
    const e = G.edge(room.points, op.edge);
    const t = Math.max(0, Math.min(e.len, op.offset));
    const c = { x: e.a.x + e.ux * t, y: e.a.y + e.uy * t };
    const hw = op.width / 2;
    return {
      e,
      c,
      p0: { x: c.x - e.ux * hw, y: c.y - e.uy * hw },
      p1: { x: c.x + e.ux * hw, y: c.y + e.uy * hw },
    };
  }

  function hitTest(px, py) {
    const p = current();
    const w = toWorld(px, py);
    const sel = selectedRoom();
    if (sel) {
      for (let i = 0; i < sel.points.length; i++) {
        const q = S(sel.points[i]);
        if (Math.hypot(q.x - px, q.y - py) < (coarse ? 20 : 9)) return { kind: 'vertex', room: sel, i };
      }
    }
    // openings (any room)
    for (const op of p.openings) {
      const room = p.rooms.find((r) => r.id === op.roomId);
      if (!room) continue;
      const seg = openingSegment(room, op);
      const r = G.projectOnSegment({ x: px, y: py }, S(seg.p0), S(seg.p1));
      if (r.d < (coarse ? 14 : 8)) return { kind: 'opening', op, room };
    }
    if (sel) {
      for (let i = 0; i < sel.points.length; i++) {
        const a = S(sel.points[i]);
        const b = S(sel.points[(i + 1) % sel.points.length]);
        const r = G.projectOnSegment({ x: px, y: py }, a, b);
        const tol = coarse ? 16 : 7;
        const end = coarse ? 18 : 8;
        if (r.d < tol && r.t > end && r.t < r.len - end) return { kind: 'edge', room: sel, i };
      }
    }
    let best = null;
    for (const r of p.rooms) {
      if (G.pointInPolygon(w, r.points)) {
        const A = G.area(r.points);
        if (!best || A < best.A) best = { room: r, A };
      }
    }
    if (best) return { kind: 'room', room: best.room };
    return null;
  }

  // Nearest wall for placing a door or window.
  function nearestWall(px, py) {
    let best = null;
    for (const r of current().rooms) {
      for (let i = 0; i < r.points.length; i++) {
        const a = S(r.points[i]);
        const b = S(r.points[(i + 1) % r.points.length]);
        const q = G.projectOnSegment({ x: px, y: py }, a, b);
        if (q.d < (coarse ? 28 : 16) && (!best || q.d < best.d)) best = { room: r, i, d: q.d, t: q.t / view.s };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!W) return;
    readColors();
    const p = current();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors['--plan-bg'];
    ctx.fillRect(0, 0, W, H);
    drawGrid();
    drawImage(p);
    const imageOn = !!(state.planImage && p.plan && p.plan.visible !== false);
    const { links } = openingHosts(p);
    const linkedOps = new Set(links.map((l) => l.opId));
    for (const r of p.rooms) drawRoomFill(r, imageOn);
    drawPoche(p, imageOn);
    drawKitchen(p);
    for (const r of p.rooms) drawRoomOutline(r);
    for (const op of p.openings) {
      const room = p.rooms.find((r) => r.id === op.roomId);
      if (room) drawOpening(room, op, linkedOps.has(op.id));
    }
    for (const r of p.rooms) drawRoomLabel(r, p);
    drawSelection(p);
    drawHoverEdge(p);
    drawToolPreview();
    drawGuides();
    drawScaleBar();
  }

  function drawGrid() {
    const minor = view.s >= 70 ? 0.1 : view.s >= 30 ? 0.5 : 1;
    const tl = toWorld(0, 0);
    const br = toWorld(W, H);
    ctx.lineWidth = 1;
    const line = (x0, y0, x1, y1) => {
      ctx.beginPath();
      ctx.moveTo(Math.round(x0) + 0.5, Math.round(y0) + 0.5);
      ctx.lineTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
      ctx.stroke();
    };
    for (const [step, color] of [[minor, colors['--grid']], [1, colors['--grid-major']]]) {
      if (step === minor && minor === 1 && color === colors['--grid']) continue;
      ctx.strokeStyle = color;
      for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) line(sx(x), 0, sx(x), H);
      for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) line(0, sy(y), W, sy(y));
    }
  }

  function drawImage(p) {
    if (!state.planImage || !p.plan || p.plan.visible === false) return;
    const pl = p.plan;
    ctx.save();
    ctx.globalAlpha = pl.opacity ?? 0.6;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.planImage, sx(pl.x), sy(pl.y), pl.w * pl.mPerPx * view.s, pl.h * pl.mPerPx * view.s);
    ctx.restore();
  }

  function pathOf(pts) {
    ctx.beginPath();
    pts.forEach((q, i) => {
      const s = S(q);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
  }

  function drawRoomFill(r, imageOn) {
    pathOf(r.points);
    ctx.save();
    ctx.globalAlpha = imageOn ? 0.42 : 0.9;
    ctx.fillStyle = colors[purposeColorVar(r.purpose)];
    ctx.fill();
    ctx.restore();
  }

  // Walls as solid poché outside each room's contour, with passages cut for openings.
  function drawPoche(p, imageOn) {
    if (!p.rooms.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-10, -10, W + 20, H + 20);
    for (const r of p.rooms) {
      r.points.forEach((q, i) => {
        const s = S(q);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
    }
    ctx.clip('evenodd');
    ctx.globalAlpha = imageOn ? 0.45 : 1;
    ctx.strokeStyle = colors['--wall'];
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 3;
    for (const r of p.rooms) {
      const outdoor = PURPOSES[r.purpose]?.outdoor;
      ctx.lineWidth = (outdoor ? 0.07 : WALL_BAND) * 2 * view.s;
      pathOf(r.points);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors['--plan-bg'];
    for (const op of p.openings) {
      const room = p.rooms.find((r) => r.id === op.roomId);
      if (!room) continue;
      const { e, p0, p1 } = openingSegment(room, op);
      const d = 0.45;
      const q = [p0, p1, { x: p1.x - e.nx * d, y: p1.y - e.ny * d }, { x: p0.x - e.nx * d, y: p0.y - e.ny * d }].map(S);
      ctx.beginPath();
      q.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Kitchen base cabinets as a dashed footprint along their walls.
  function drawKitchen(p) {
    for (const r of p.rooms) {
      if (!PURPOSES[r.purpose]?.kitchen) continue;
      for (const run of kitchenRuns(r)) {
        const e = G.edge(r.points, run.edge);
        const a = { x: e.a.x + e.ux * run.start, y: e.a.y + e.uy * run.start };
        const b = { x: a.x + e.ux * run.length, y: a.y + e.uy * run.length };
        const d = 0.6;
        const q = [a, b, { x: b.x + e.nx * d, y: b.y + e.ny * d }, { x: a.x + e.nx * d, y: a.y + e.ny * d }].map(S);
        ctx.beginPath();
        q.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        ctx.closePath();
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = colors['--ink'];
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = colors['--ink'];
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawRoomOutline(r) {
    pathOf(r.points);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = colors['--wall'];
    ctx.stroke();
  }

  function drawOpening(room, op, linked) {
    const seg = openingSegment(room, op);
    const { e } = seg;
    const t = OPENING_TYPES[op.type];
    const a = S(seg.p0);
    const b = S(seg.p1);
    const selected = state.selection?.type === 'opening' && state.selection.id === op.id;
    const ink = selected ? colors['--accent'] : colors['--ink'];
    const wallT = WALL_BAND * view.s;
    const out = { x: -e.nx * wallT, y: -e.ny * wallT };
    // gap in the wall line
    ctx.lineCap = 'butt';
    ctx.strokeStyle = colors['--plan-bg'];
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = selected ? 2 : 1.3;
    if (t.kind === 'window') {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x + out.x, b.y + out.y);
      ctx.lineTo(a.x + out.x, a.y + out.y);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x + out.x / 2, a.y + out.y / 2);
      ctx.lineTo(b.x + out.x / 2, b.y + out.y / 2);
      ctx.stroke();
    }
    if (op.type === 'door' || op.type === 'entrance' || op.type === 'balcony') {
      const r = op.width * view.s;
      const n = { x: e.nx, y: e.ny };
      const leaf = { x: a.x + n.x * r, y: a.y + n.y * r };
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(leaf.x, leaf.y);
      ctx.stroke();
      const a0 = Math.atan2(n.y, n.x);
      const a1 = Math.atan2(e.uy, e.ux);
      const cross = n.x * e.uy - n.y * e.ux;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, a0, a1, cross < 0);
      ctx.stroke();
      ctx.restore();
      if (op.type === 'entrance') {
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc((a.x + b.x) / 2 + out.x / 2, (a.y + b.y) / 2 + out.y / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (op.type === 'arch') {
      for (const q of [a, b]) {
        ctx.beginPath();
        ctx.moveTo(q.x - out.x * 0.2, q.y - out.y * 0.2);
        ctx.lineTo(q.x + out.x * 1.2, q.y + out.y * 1.2);
        ctx.stroke();
      }
    }
    if (!linked && op.type !== 'window' && op.type !== 'entrance' && op.type !== 'balcony') {
      // a door that does not lead anywhere: probably on the wrong wall
      ctx.fillStyle = colors['--warn'];
      ctx.beginPath();
      ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRoomLabel(r, p) {
    const lp = S(G.labelPoint(r.points));
    const name = roomLabel(r, p.rooms);
    const areaTxt = `${fmtNum(G.area(r.points), 2)} მ²`;
    const b = G.bounds(r.points);
    const roomW = b.w * view.s;
    const fs = Math.max(10.5, Math.min(13.5, view.s * 0.2));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fs}px ${cssVar('--font-body')}`;
    const showName = ctx.measureText(name).width < roomW - 8 && b.h * view.s > 34;
    ctx.fillStyle = colors['--ink'];
    if (showName) {
      ctx.fillText(name, lp.x, lp.y - fs * 0.7);
      ctx.font = `500 ${fs - 0.5}px ${cssVar('--font-mono')}`;
      ctx.fillStyle = colors['--muted'];
      ctx.fillText(areaTxt, lp.x, lp.y + fs * 0.75);
    } else if (roomW > 36) {
      ctx.font = `500 ${fs - 1}px ${cssVar('--font-mono')}`;
      ctx.fillText(fmtNum(G.area(r.points), 1), lp.x, lp.y);
    }
  }

  function dimLabel(a, b, text, outward, color, badge) {
    const A = S(a);
    const B = S(b);
    const off = badge ? WALL_BAND * view.s + 13 : 15;
    const mx = (A.x + B.x) / 2 + outward.x * off;
    const my = (A.y + B.y) / 2 + outward.y * off;
    let ang = Math.atan2(B.y - A.y, B.x - A.x);
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ang);
    ctx.font = `500 11.5px ${cssVar('--font-mono')}`;
    const tw = ctx.measureText(text).width;
    const bw = badge ? 18 : 0;
    const total = tw + 8 + bw;
    ctx.fillStyle = colors['--panel'];
    ctx.globalAlpha = 0.94;
    ctx.fillRect(-total / 2, -9, total, 18);
    ctx.globalAlpha = 1;
    if (badge) {
      ctx.fillStyle = colors['--accent'];
      ctx.beginPath();
      ctx.arc(-total / 2 + 9, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors['--panel'];
      ctx.font = `600 10px ${cssVar('--font-mono')}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(badge), -total / 2 + 9, 0.5);
      ctx.font = `500 11.5px ${cssVar('--font-mono')}`;
    }
    ctx.fillStyle = color || colors['--accent'];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bw / 2, 0.5);
    ctx.restore();
  }

  function drawSelection(p) {
    const r = selectedRoom();
    if (!r) return;
    pathOf(r.points);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = colors['--accent'];
    ctx.stroke();
    const es = G.edges(r.points);
    for (const e of es) {
      dimLabel(e.a, e.b, fmtNum(e.len, 2), { x: -e.nx, y: -e.ny }, null, e.i + 1);
    }
    for (let i = 0; i < r.points.length; i++) {
      const q = S(r.points[i]);
      const hot = hover && hover.kind === 'vertex' && hover.room.id === r.id && hover.i === i;
      ctx.fillStyle = hot ? colors['--accent'] : colors['--panel'];
      ctx.strokeStyle = colors['--accent'];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const hs = coarse ? 7 : 4.5;
      ctx.rect(q.x - hs, q.y - hs, hs * 2, hs * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (coarse) {
      // Touch has no hover, so show a grip in the middle of every wall that can be dragged.
      for (const e of es) {
        const A = S(e.a);
        const B = S(e.b);
        if (Math.hypot(B.x - A.x, B.y - A.y) < 48) continue;
        const mx = (A.x + B.x) / 2;
        const my = (A.y + B.y) / 2;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(Math.atan2(B.y - A.y, B.x - A.x));
        ctx.fillStyle = colors['--panel'];
        ctx.strokeStyle = colors['--accent'];
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-11, -4.5, 22, 9, 4.5) : ctx.rect(-11, -4.5, 22, 9);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    if (hover && hover.kind === 'edge' && hover.room.id === r.id) {
      const e = es[hover.i];
      const A = S(e.a);
      const B = S(e.b);
      ctx.strokeStyle = colors['--accent'];
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawHoverEdge(p) {
    const hv = state.hoverEdge;
    if (!hv) return;
    const r = p.rooms.find((x) => x.id === hv.roomId);
    if (!r || hv.edge >= r.points.length) return;
    const e = G.edge(r.points, hv.edge);
    const A = S(e.a);
    const B = S(e.b);
    ctx.strokeStyle = colors['--accent'];
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawToolPreview() {
    const accent = colors['--accent'];
    if (state.tool === 'poly' && polyPts.length) {
      const pts = cursor ? [...polyPts, cursor] : polyPts;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((q, i) => {
        const s = S(q);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > 0.05) dimLabel(a, b, fmtNum(len, 2), { x: 0, y: -1 });
      }
      polyPts.forEach((q, i) => {
        const s = S(q);
        ctx.fillStyle = i === 0 ? accent : colors['--panel'];
        ctx.strokeStyle = accent;
        ctx.beginPath();
        ctx.arc(s.x, s.y, i === 0 ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
    if (state.tool === 'rect' && rectStart && cursor) {
      const pts = G.rectPoints(rectStart.x, rectStart.y, cursor.x, cursor.y);
      pathOf(pts);
      ctx.fillStyle = colors['--accent-soft'];
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      const es = G.edges(G.normalizeOrientation(pts));
      dimLabel(es[0].a, es[0].b, fmtNum(es[0].len, 2), { x: 0, y: -1 });
      dimLabel(es[1].a, es[1].b, fmtNum(es[1].len, 2), { x: 1, y: 0 });
      const c = S(G.centroid(pts));
      ctx.font = `600 13px ${cssVar('--font-mono')}`;
      ctx.fillStyle = accent;
      ctx.textAlign = 'center';
      ctx.fillText(`${fmtNum(G.area(pts), 2)} მ²`, c.x, c.y);
    }
    if (state.tool === 'scale') {
      const pts = cursor && scalePts.length === 1 ? [...scalePts, cursor] : scalePts;
      ctx.strokeStyle = colors['--warn'];
      ctx.fillStyle = colors['--warn'];
      ctx.lineWidth = 2;
      if (pts.length === 2) {
        const a = S(pts[0]);
        const b = S(pts[1]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (const q of pts) {
        const s = S(q);
        ctx.beginPath();
        ctx.moveTo(s.x - 7, s.y);
        ctx.lineTo(s.x + 7, s.y);
        ctx.moveTo(s.x, s.y - 7);
        ctx.lineTo(s.x, s.y + 7);
        ctx.stroke();
      }
    }
    if (placing) {
      const { room, i, offset, type } = placing;
      const fake = { ...makeOpening(room.id, i, offset, type), id: '__preview' };
      ctx.save();
      ctx.globalAlpha = 0.75;
      drawOpening(room, fake, true);
      ctx.restore();
    }
    if (state.tool !== 'select' && cursorScreen && state.tool !== 'door' && state.tool !== 'window') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      const s = cursor ? S(cursor) : cursorScreen;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawGuides() {
    if (!guides.length) return;
    ctx.save();
    ctx.strokeStyle = colors['--accent'];
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const g of guides) {
      ctx.beginPath();
      if (g.type === 'v') {
        ctx.moveTo(sx(g.x), 0);
        ctx.lineTo(sx(g.x), H);
      } else {
        ctx.moveTo(0, sy(g.y));
        ctx.lineTo(W, sy(g.y));
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawScaleBar() {
    const candidates = [0.5, 1, 2, 5, 10];
    const len = candidates.find((c) => c * view.s >= 70) || 10;
    const px = len * view.s;
    const x = 16;
    const y = H - 18;
    ctx.strokeStyle = colors['--ink'];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y);
    ctx.lineTo(x + px, y);
    ctx.lineTo(x + px, y - 5);
    ctx.stroke();
    ctx.fillStyle = colors['--ink'];
    ctx.font = `500 11px ${cssVar('--font-mono')}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${len} მ`, x + px + 6, y + 1);
  }

  // ---------------------------------------------------------------- actions
  function finishRoom(points) {
    const room = makeRoom(points, 'other', { unassigned: true });
    if (!G.isValidPolygon(room.points)) {
      toast('ოთახის კონტური არასწორია: კედლები ერთმანეთს კვეთს ან ძალიან მოკლეა.', 'warn');
      return;
    }
    const p = current();
    const overlap = p.rooms.some((r) => G.polygonsOverlap(r.points, room.points));
    commit(addRoom(p, room));
    setSelection({ type: 'room', id: room.id });
    if (overlap) toast('ახალი ოთახი სხვა ოთახს ფარავს. შეამოწმე კონტური.', 'warn');
    const lp = S(G.labelPoint(room.points));
    onRoomCreated?.(room, lp);
  }

  function closePoly() {
    if (polyPts.length < 3) return;
    const pts = polyPts.slice();
    polyPts = [];
    renderHint(true);
    finishRoom(pts);
    draw();
  }

  function placeOpening(target) {
    const p = current();
    const type = state.tool === 'door' ? 'door' : 'window';
    const e = G.edge(target.room.points, target.i);
    const width = OPENING_TYPES[type].width;
    const offset = clampOffset(e.len, width, G.round(target.t, 0.01));
    // An opening already on this spot (on either side of the wall) is selected instead.
    const { hosts } = openingHosts(p);
    const items = hosts.get(`${target.room.id}:${target.i}`) || [];
    const hit = items.find((it) => Math.abs(it.offset - offset) < (it.op.width + width) / 2);
    if (hit) {
      setSelection({ type: 'opening', id: hit.op.id });
      return;
    }
    const op = makeOpening(target.room.id, target.i, offset, type);
    commit(addOpening(p, op));
    setSelection({ type: 'opening', id: op.id });
  }

  function deleteSelection() {
    const s = state.selection;
    if (!s) return;
    const p = current();
    if (s.type === 'room') commit(deleteRoom(p, s.id));
    else commit(deleteOpening(p, s.id));
    setSelection(null);
  }

  function applyScale(meters) {
    const p = current();
    if (scalePts.length !== 2 || !p.plan) return false;
    const pl = p.plan;
    const [A, B] = scalePts;
    const pxA = { x: (A.x - pl.x) / pl.mPerPx, y: (A.y - pl.y) / pl.mPerPx };
    const pxB = { x: (B.x - pl.x) / pl.mPerPx, y: (B.y - pl.y) / pl.mPerPx };
    const dpx = Math.hypot(pxB.x - pxA.x, pxB.y - pxA.y);
    if (!(meters > 0) || dpx < 2) return false;
    const m = meters / dpx;
    const plan = { ...pl, mPerPx: m, x: A.x - pxA.x * m, y: A.y - pxA.y * m, calibrated: true };
    commit({ ...p, plan });
    scalePts = [];
    setTool('select');
    fit();
    toast('მასშტაბი დაყენებულია. ახლა შემოხაზე ოთახები.', 'ok');
    return true;
  }

  // ---------------------------------------------------------------- pointer handling
  function onPointerDown(e) {
    canvas.focus({ preventScroll: true });
    const wasCoarse = coarse;
    coarse = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (coarse !== wasCoarse) {
      renderHint();
      draw();
    }
    clearTimeout(holdTimer);
    const pos = eventPos(e);
    pointers.set(e.pointerId, pos);
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      if (mode && mode.startsWith('drag')) cancelPreview();
      // The first finger of a pinch must not leave a half-started rectangle behind,
      // otherwise the next tap would create a room by accident.
      if (mode === 'rect-drag') {
        rectStart = null;
        renderHint();
      }
      mode = 'pinch';
      return;
    }
    if (e.button === 1 || e.button === 2 || spaceDown) {
      mode = 'pan';
      drag = { start: pos, ox: view.ox, oy: view.oy };
      return;
    }
    const w = toWorld(pos.x, pos.y);
    drag = { start: pos, startWorld: w, ox: view.ox, oy: view.oy, moved: false };
    const tool = state.tool;
    if (tool === 'select') {
      const hit = hitTest(pos.x, pos.y);
      if (!hit) {
        setSelection(null);
        mode = 'pan';
        return;
      }
      if (hit.kind === 'vertex') {
        mode = 'drag-vertex';
        drag.room = hit.room;
        drag.i = hit.i;
      } else if (hit.kind === 'edge') {
        mode = 'drag-edge';
        drag.room = hit.room;
        drag.i = hit.i;
      } else if (hit.kind === 'opening') {
        setSelection({ type: 'opening', id: hit.op.id });
        mode = 'drag-opening';
        drag.op = hit.op;
        drag.room = hit.room;
      } else if (hit.kind === 'room') {
        const already = state.selection?.type === 'room' && state.selection.id === hit.room.id;
        setSelection({ type: 'room', id: hit.room.id });
        drag.room = hit.room;
        if (already && coarse) {
          // A selected room covers much of a phone screen; a plain swipe pans the view and
          // only a press-and-hold picks the room up, so it is not moved by accident.
          mode = 'pan-or-click';
          holdTimer = setTimeout(() => {
            if (mode === 'pan-or-click' && drag && !drag.moved && pointers.size === 1) {
              mode = 'drag-room';
              drag.moved = true;
              drag.startWorld = toWorld(cursorScreen?.x ?? pos.x, cursorScreen?.y ?? pos.y);
              navigator.vibrate?.(12);
              toast('ახლა გადაათრიე ოთახი.', 'info');
            }
          }, 420);
        } else {
          mode = already ? 'drag-room' : 'pan-or-click';
        }
      }
      return;
    }
    if (tool === 'rect') {
      const sp = snapPoint(w);
      if (!rectStart) {
        rectStart = { x: sp.x, y: sp.y };
        mode = 'rect-drag';
        renderHint();
      } else {
        mode = 'rect-second';
      }
      return;
    }
    mode = 'click-or-pan';
  }

  function onPointerMove(e) {
    const pos = eventPos(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pos);
    cursorScreen = pos;
    if (mode === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      view.ox += m.x - pinch.m.x;
      view.oy += m.y - pinch.m.y;
      zoomAt(m.x, m.y, d / pinch.d);
      pinch = { d, m };
      return;
    }
    const w = toWorld(pos.x, pos.y);
    const movedPx = drag ? Math.hypot(pos.x - drag.start.x, pos.y - drag.start.y) : 0;
    if (drag && movedPx > (coarse ? 8 : 5)) drag.moved = true;

    if (mode === 'pan' || ((mode === 'click-or-pan' || mode === 'pan-or-click') && drag.moved)) {
      if (mode !== 'pan') mode = 'pan';
      view.ox = drag.ox + (pos.x - drag.start.x);
      view.oy = drag.oy + (pos.y - drag.start.y);
      draw();
      return;
    }
    const p = state.project;
    // The dragged room or opening can disappear mid-drag (undo shortcut, another tab).
    if (mode && mode.startsWith('drag') && (!p.rooms.some((x) => x.id === drag.room?.id)
      || (mode === 'drag-opening' && !p.openings.some((o) => o.id === drag.op?.id)))) {
      mode = null;
      cancelPreview();
      return;
    }
    if (mode === 'drag-vertex' && drag.moved) {
      const r = p.rooms.find((x) => x.id === drag.room.id);
      const sp = snapPoint(w, { excludeRoomId: r.id, excludeIndex: drag.i });
      guides = sp.guides;
      const pts = r.points.map((q) => ({ ...q }));
      const n = pts.length;
      const i = drag.i;
      if (G.isOrthogonal(r.points)) {
        // Keep right angles: the neighbours follow along their shared axis.
        const prev = (i - 1 + n) % n;
        const next = (i + 1) % n;
        const ePrev = G.edge(r.points, prev);
        const eNext = G.edge(r.points, i);
        if (Math.abs(ePrev.uy) < 1e-3) pts[prev].y = sp.y; else pts[prev].x = sp.x;
        if (Math.abs(eNext.uy) < 1e-3) pts[next].y = sp.y; else pts[next].x = sp.x;
      }
      pts[i] = { x: sp.x, y: sp.y };
      if (G.isValidPolygon(pts) && G.signedArea(pts) > 0) preview(withRoomPoints(p, r.id, pts));
      return;
    }
    if (mode === 'drag-edge' && drag.moved) {
      const r = p.rooms.find((x) => x.id === drag.room.id);
      const e = G.edge(r.points, drag.i);
      const out = { x: -e.nx, y: -e.ny };
      let dist = (w.x - drag.startWorld.x) * out.x + (w.y - drag.startWorld.y) * out.y;
      guides = [];
      const verts = allVertices(r.id);
      const atol = 7 / view.s;
      if (Math.abs(e.ux) < 1e-3) {
        const target = e.a.x + out.x * dist;
        let best = null;
        for (const v of verts) if (Math.abs(v.x - target) < atol && (!best || Math.abs(v.x - target) < Math.abs(best.x - target))) best = v;
        const x = best ? best.x : G.round(target, 0.01);
        if (best) guides = [{ type: 'v', x }];
        dist = (x - e.a.x) / out.x;
      } else if (Math.abs(e.uy) < 1e-3) {
        const target = e.a.y + out.y * dist;
        let best = null;
        for (const v of verts) if (Math.abs(v.y - target) < atol && (!best || Math.abs(v.y - target) < Math.abs(best.y - target))) best = v;
        const y = best ? best.y : G.round(target, 0.01);
        if (best) guides = [{ type: 'h', y }];
        dist = (y - e.a.y) / out.y;
      } else {
        dist = G.round(dist, 0.01);
      }
      const pts = G.moveEdge(r.points, drag.i, dist);
      if (pts) preview(withRoomPoints(p, r.id, pts));
      return;
    }
    if (mode === 'drag-opening' && drag.moved) {
      const r = p.rooms.find((x) => x.id === drag.room.id);
      const op = p.openings.find((o) => o.id === drag.op.id);
      const e = G.edge(r.points, op.edge);
      const t = (w.x - e.a.x) * e.ux + (w.y - e.a.y) * e.uy;
      preview(updateOpening(p, op.id, { offset: G.round(clampOffset(e.len, op.width, t), 0.01) }));
      return;
    }
    if (mode === 'drag-room' && drag.moved) {
      const r = p.rooms.find((x) => x.id === drag.room.id);
      let dx = w.x - drag.startWorld.x;
      let dy = w.y - drag.startWorld.y;
      const atol = 7 / view.s;
      const verts = allVertices(r.id);
      guides = [];
      let bx = null;
      let by = null;
      for (const q of r.points) {
        for (const v of verts) {
          const ddx = v.x - (q.x + dx);
          const ddy = v.y - (q.y + dy);
          if (Math.abs(ddx) < atol && (!bx || Math.abs(ddx) < Math.abs(bx))) bx = ddx;
          if (Math.abs(ddy) < atol && (!by || Math.abs(ddy) < Math.abs(by))) by = ddy;
        }
      }
      dx = bx !== null ? dx + bx : G.round(dx, 0.01);
      dy = by !== null ? dy + by : G.round(dy, 0.01);
      preview(moveRoom(p, r.id, dx, dy));
      return;
    }

    // hover feedback
    if (state.tool === 'select' && !mode) {
      const hit = hitTest(pos.x, pos.y);
      const key = hit ? `${hit.kind}:${hit.room?.id}:${hit.i}:${hit.op?.id}` : '';
      const prevKey = hover ? `${hover.kind}:${hover.room?.id}:${hover.i}:${hover.op?.id}` : '';
      hover = hit;
      canvas.style.cursor = !hit ? 'grab'
        : hit.kind === 'vertex' ? 'move'
          : hit.kind === 'edge' ? (Math.abs(G.edge(hit.room.points, hit.i).ux) < 0.5 ? 'ew-resize' : 'ns-resize')
            : hit.kind === 'opening' ? 'pointer'
              : 'pointer';
      if (key !== prevKey) draw();
      return;
    }
    if (state.tool === 'rect') {
      const sp = snapPoint(w);
      cursor = { x: sp.x, y: sp.y };
      guides = sp.guides;
      draw();
      return;
    }
    if (state.tool === 'poly') {
      const last = polyPts[polyPts.length - 1];
      const first = polyPts[0];
      if (first && polyPts.length >= 3 && Math.hypot(sx(first.x) - pos.x, sy(first.y) - pos.y) < 12) {
        cursor = { ...first };
        guides = [];
      } else {
        const sp = snapPoint(w, { from: last, ortho: ortho && !!last, extra: polyPts });
        cursor = { x: sp.x, y: sp.y };
        guides = sp.guides;
      }
      draw();
      return;
    }
    if (state.tool === 'door' || state.tool === 'window') {
      const t = nearestWall(pos.x, pos.y);
      placing = t ? { room: t.room, i: t.i, offset: clampOffset(G.edge(t.room.points, t.i).len, OPENING_TYPES[state.tool === 'door' ? 'door' : 'window'].width, t.t), type: state.tool === 'door' ? 'door' : 'window' } : null;
      canvas.style.cursor = t ? 'copy' : 'default';
      draw();
      return;
    }
    if (state.tool === 'scale') {
      cursor = e.shiftKey && scalePts.length === 1 ? orthoFrom(scalePts[0], w) : w;
      draw();
    }
  }

  function orthoFrom(a, w) {
    return Math.abs(w.x - a.x) > Math.abs(w.y - a.y) ? { x: w.x, y: a.y } : { x: a.x, y: w.y };
  }

  function onPointerUp(e) {
    clearTimeout(holdTimer);
    const pos = eventPos(e);
    pointers.delete(e.pointerId);
    if (mode === 'pinch') {
      if (pointers.size < 2) {
        mode = null;
        pinch = null;
      }
      return;
    }
    const w = toWorld(pos.x, pos.y);
    const m = mode;
    mode = null;
    guides = [];
    if (m && m.startsWith('drag')) {
      if (state.draft) commit(state.draft);
      draw();
      return;
    }
    if (m === 'rect-drag') {
      if (drag.moved) {
        const sp = snapPoint(w);
        const pts = G.rectPoints(rectStart.x, rectStart.y, sp.x, sp.y);
        rectStart = null;
        renderHint();
        if (Math.abs(sp.x - pts[0].x) >= 0 && G.area(pts) > 0.1) finishRoom(pts);
      }
      draw();
      return;
    }
    if (m === 'rect-second') {
      const sp = snapPoint(w);
      const pts = G.rectPoints(rectStart.x, rectStart.y, sp.x, sp.y);
      rectStart = null;
      renderHint();
      if (G.area(pts) > 0.1) finishRoom(pts);
      draw();
      return;
    }
    if (m === 'click-or-pan' && !drag.moved) {
      if (state.tool === 'poly') {
        const first = polyPts[0];
        if (first && polyPts.length >= 3 && Math.hypot(sx(first.x) - pos.x, sy(first.y) - pos.y) < 12) {
          closePoly();
          return;
        }
        const last = polyPts[polyPts.length - 1];
        const sp = snapPoint(w, { from: last, ortho: ortho && !!last, extra: polyPts });
        if (!last || Math.hypot(sp.x - last.x, sp.y - last.y) > 0.02) polyPts.push({ x: sp.x, y: sp.y });
        renderHint();
        draw();
        return;
      }
      if (state.tool === 'door' || state.tool === 'window') {
        const t = nearestWall(pos.x, pos.y);
        if (t) placeOpening(t);
        else toast('დააჭირე ოთახის კედელს.', 'info');
        return;
      }
      if (state.tool === 'scale') {
        const pt = e.shiftKey && scalePts.length === 1 ? orthoFrom(scalePts[0], w) : w;
        if (scalePts.length >= 2) scalePts = [];
        scalePts.push(pt);
        renderHint();
        draw();
      }
    }
    if (m === 'pan-or-click') draw();
  }

  function onWheel(e) {
    e.preventDefault();
    const pos = eventPos(e);
    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      zoomAt(pos.x, pos.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    } else {
      view.ox -= e.deltaX;
      draw();
    }
  }

  function onKeyDown(e) {
    if (state.step !== 'plan' || document.querySelector('dialog[open]')) return;
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y' && !typing) {
      e.preventDefault();
      redo();
      return;
    }
    if (typing) return;
    // Keys that edit the plan only act when the plan itself (or nothing) has focus, so
    // pressing Backspace or an arrow on a focused button never deletes or moves a room.
    const onPlan = e.target === canvas || e.target === document.body || e.target === document.documentElement;
    if (e.key === ' ') {
      if (onPlan) {
        spaceDown = true;
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Escape') {
      if (polyPts.length || rectStart || scalePts.length) {
        polyPts = [];
        rectStart = null;
        scalePts = [];
        renderHint();
      } else if (state.tool !== 'select') setTool('select');
      else setSelection(null);
      draw();
      return;
    }
    if (e.key === 'Enter' && state.tool === 'poly') {
      closePoly();
      return;
    }
    if (onPlan && e.key.startsWith('Arrow') && state.tool === 'select' && state.selection && !mod) {
      // Keyboard editing: arrows move the selected room by 1 cm (Shift: 10 cm), or slide the
      // selected door/window along its wall. A burst of presses is one undo step.
      e.preventDefault();
      const step = e.shiftKey ? 0.1 : 0.01;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      const p = current();
      const sel = state.selection;
      let next = null;
      if (sel.type === 'room') next = moveRoom(p, sel.id, dx, dy);
      else {
        const op = p.openings.find((o) => o.id === sel.id);
        if (op) next = updateOpening(p, op.id, { offset: op.offset + (dx || dy) });
      }
      if (next) {
        const now = Date.now();
        const burst = nudge && nudge.id === sel.id && now - nudge.t < 800;
        nudge = { id: sel.id, t: now };
        commit(next, { history: !burst });
      }
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && onPlan) {
      if (state.tool === 'poly' && polyPts.length) {
        polyPts.pop();
        renderHint();
        draw();
      } else if (state.tool === 'select' && state.selection) {
        deleteSelection();
      }
      e.preventDefault();
      return;
    }
    if (state.tool === 'poly' && polyPts.length && /^[0-9.,]$/.test(e.key)) {
      const inp = hintEl.querySelector('#poly-len');
      if (inp) {
        inp.focus();
        inp.value = e.key;
        e.preventDefault();
      }
      return;
    }
    const shortcuts = { v: 'select', r: 'rect', p: 'poly', d: 'door', w: 'window' };
    const t = shortcuts[e.key.toLowerCase()];
    if (t && !mod) setTool(t);
  }

  function onKeyUp(e) {
    if (e.key === ' ') spaceDown = false;
  }

  // ---------------------------------------------------------------- hint bar
  let hintKey = '';
  function renderHint(force) {
    const tool = state.tool;
    const sel = state.selection;
    const p = current();
    const key = [tool, coarse, polyPts.length > 0, polyPts.length >= 3, !!rectStart, scalePts.length, sel?.type, !!p.plan?.calibrated, p.rooms.length > 0].join('|');
    if (key === hintKey && !force) return;
    hintKey = key;
    clear(hintEl);
    const text = (t) => h('span', { class: 'hint-text' }, t);
    const btn = (label, onclick, cls = '') => h('button', { type: 'button', class: `btn btn-sm ${cls}`, onclick }, label);
    if (tool === 'select') {
      if (sel?.type === 'room') add(hintEl, text(coarse
        ? 'გადაათრიე კედელი ან კუთხე. ოთახის გადასატანად დააჭირე და გააჩერე თითი. ზუსტი სიგრძე — პარამეტრებში.'
        : 'გადაათრიე კედელი ან კუთხე. ზუსტ სიგრძეს პარამეტრების პანელში ჩაწერ. ხელახლა გადათრევით ოთახი გადაადგილდება.'));
      else if (sel?.type === 'opening') add(hintEl, text('გადაათრიე კედლის გასწვრივ. ტიპი და ზომები მარჯვნივ.'));
      else if (!p.rooms.length) add(hintEl, text('დაიწყე ოთახით: აირჩიე „მართკუთხა ოთახი“ ან „რთული ფორმა“ და შემოხაზე პირველი ოთახი.'));
      else add(hintEl, text('აირჩიე ოთახი, კარი ან ფანჯარა. ბორბლით ან ორი თითით ზომას ცვლი, გადათრევით გადაადგილდები.'));
    } else if (tool === 'rect') {
      if (!rectStart) add(hintEl, text('დააჭირე ოთახის ერთ კუთხეს და გადაათრიე საპირისპირო კუთხემდე.'));
      else {
        const wIn = h('input', { id: 'rect-w', class: 'num-in', inputmode: 'decimal', placeholder: 'სიგანე', 'aria-label': 'სიგანე, მეტრი' });
        const hIn = h('input', { id: 'rect-h', class: 'num-in', inputmode: 'decimal', placeholder: 'სიღრმე', 'aria-label': 'სიღრმე, მეტრი' });
        const go = () => {
          const wv = parseNum(wIn.value);
          const hv = parseNum(hIn.value);
          if (!(wv > 0.2 && hv > 0.2)) {
            toast('ჩაწერე ორივე ზომა მეტრებში, მაგ. 3.65 და 4.20', 'warn');
            return;
          }
          const dirX = cursor && cursor.x < rectStart.x ? -1 : 1;
          const dirY = cursor && cursor.y < rectStart.y ? -1 : 1;
          const pts = G.rectPoints(rectStart.x, rectStart.y, rectStart.x + dirX * wv, rectStart.y + dirY * hv);
          rectStart = null;
          renderHint();
          finishRoom(pts);
          draw();
        };
        for (const inp of [wIn, hIn]) inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); if (ev.key === 'Escape') { rectStart = null; renderHint(); draw(); } });
        add(hintEl, text('დააჭირე საპირისპირო კუთხეს, ან ჩაწერე ზომები:'), wIn, h('span', { class: 'hint-x' }, '×'), hIn, h('span', { class: 'hint-unit' }, 'მ'), btn('შექმნა', go, 'btn-accent'));
      }
    } else if (tool === 'poly') {
      const orthoBox = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'ortho', checked: ortho, onchange: (ev) => { ortho = ev.target.checked; } }), ' სწორი კუთხეები');
      if (!polyPts.length) {
        add(hintEl, text('დააჭირე ოთახის პირველ კუთხეს, შემდეგ ყოველ მომდევნოს.'), orthoBox);
      } else {
        const lenIn = h('input', { id: 'poly-len', class: 'num-in', inputmode: 'decimal', placeholder: 'სიგრძე', 'aria-label': 'კედლის სიგრძე, მეტრი' });
        const go = () => {
          const L = parseNum(lenIn.value);
          if (!(L > 0.05)) return;
          const last = polyPts[polyPts.length - 1];
          let dir = cursor ? { x: cursor.x - last.x, y: cursor.y - last.y } : { x: 0, y: 0 };
          if (Math.hypot(dir.x, dir.y) < 1e-6) {
            // No pointer direction (touch screens, or the pointer is on the last corner):
            // turn 90° clockwise from the previous wall, or go right for the first wall.
            const prev = polyPts[polyPts.length - 2];
            dir = prev ? { x: -(last.y - prev.y), y: last.x - prev.x } : { x: 1, y: 0 };
          }
          if (ortho) dir = Math.abs(dir.x) >= Math.abs(dir.y) ? { x: Math.sign(dir.x) || 1, y: 0 } : { x: 0, y: Math.sign(dir.y) || 1 };
          const n = Math.hypot(dir.x, dir.y) || 1;
          polyPts.push(G.roundPoint({ x: last.x + (dir.x / n) * L, y: last.y + (dir.y / n) * L }));
          lenIn.value = '';
          renderHint(true);
          draw();
          hintEl.querySelector('#poly-len')?.focus();
        };
        lenIn.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); if (lenIn.value) go(); else closePoly(); }
          if (ev.key === 'Escape') { polyPts = []; renderHint(); draw(); canvas.focus(); }
        });
        add(hintEl, 
          text('შემდეგი კუთხე, ან კედლის სიგრძე კურსორის მიმართულებით:'), lenIn, h('span', { class: 'hint-unit' }, 'მ'),
          orthoBox,
          btn('უკან', () => { polyPts.pop(); renderHint(); draw(); }),
          polyPts.length >= 3 ? btn('დახურვა', closePoly, 'btn-accent') : null,
        );
      }
    } else if (tool === 'door') {
      add(hintEl, text('დააჭირე კედელს, სადაც კარი ან ღიობია. ერთი კარი ორივე ოთახს ეკუთვნის, საკმარისია ერთხელ დასმა.'));
    } else if (tool === 'window') {
      add(hintEl, text('დააჭირე გარე კედელს, სადაც ფანჯარა ან აივნის კარია.'));
    } else if (tool === 'scale') {
      if (scalePts.length < 2) {
        add(hintEl, text(scalePts.length === 0
          ? 'მონიშნე გეგმაზე წერტილი, საიდანაც ცნობილი ზომა იწყება (მაგ. კედლის ზომის ხაზის ბოლო). Shift ასწორებს ხაზს.'
          : 'ახლა მონიშნე მეორე წერტილი.'));
      } else {
        const dIn = h('input', { id: 'scale-len', class: 'num-in', inputmode: 'decimal', placeholder: 'მანძილი', 'aria-label': 'ცნობილი მანძილი' });
        const unit = h('select', { id: 'scale-unit', class: 'unit-sel', 'aria-label': 'ერთეული' },
          h('option', { value: '0.001' }, 'მმ'), h('option', { value: '0.01' }, 'სმ'), h('option', { value: '1' }, 'მ'));
        const go = () => {
          const v = parseNum(dIn.value) * parseFloat(unit.value);
          if (!applyScale(v)) toast('ჩაწერე მანძილი, მაგ. 3650 მმ', 'warn');
        };
        dIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); });
        add(hintEl, text('რამდენია ეს მანძილი სინამდვილეში?'), dIn, unit, btn('მასშტაბის დაყენება', go, 'btn-accent'), btn('თავიდან', () => { scalePts = []; renderHint(); draw(); }));
        setTimeout(() => dIn.focus(), 0);
      }
    }
  }

  // ---------------------------------------------------------------- wiring
  canvas.tabIndex = 0;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', (e) => { clearTimeout(holdTimer); pointers.delete(e.pointerId); mode = null; cancelPreview(); });
  canvas.addEventListener('pointerleave', () => { if (!mode) { cursor = null; cursorScreen = null; placing = null; hover = null; draw(); } });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('dblclick', () => { if (state.tool === 'poly') closePoly(); });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  new ResizeObserver(resize).observe(wrap);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', () => draw());

  subscribe((kind) => {
    if (kind === 'tool') {
      polyPts = [];
      rectStart = null;
      scalePts = [];
      placing = null;
      cursor = null;
      guides = [];
      canvas.style.cursor = state.tool === 'select' ? 'default' : 'crosshair';
    }
    if (['project', 'draft', 'selection', 'tool', 'image', 'hover', 'theme', 'opacity'].includes(kind)) {
      if (kind !== 'draft' && kind !== 'hover' && kind !== 'opacity') renderHint();
      draw();
    }
  });

  renderHint(true);
  return {
    fit,
    draw,
    resize,
    zoom: (f) => zoomAt(W / 2, H / 2, f),
    startScale() {
      setTool('scale');
      scalePts = [];
      renderHint(true);
    },
    deleteSelection,
    toScreen: (p) => S(p),
    // Pan (never zoom) so the given world points sit inside the part of the plan that is
    // not covered by a bottom sheet of `coverPx` screen pixels.
    reveal(points, coverPx = 0) {
      if (!points?.length || !W) return;
      const b = G.bounds(points);
      const visH = Math.max(80, H - coverPx);
      const top = sy(b.minY);
      const bottom = sy(b.maxY);
      const left = sx(b.minX);
      const right = sx(b.maxX);
      let dy = 0;
      if (bottom - top > visH - 24) dy = 12 - top + (visH - 24 - (bottom - top)) / 2;
      else if (bottom > visH - 12) dy = visH - 12 - bottom;
      else if (top < 12) dy = 12 - top;
      let dx = 0;
      if (right - left <= W - 24) {
        if (left < 12) dx = 12 - left;
        else if (right > W - 12) dx = W - 12 - right;
      }
      if (!dx && !dy) return;
      view.ox += dx;
      view.oy += dy;
      draw();
    },
  };
}
