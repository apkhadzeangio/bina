// Plan geometry. Units are metres; x grows to the right, y grows down (screen-like).
// Room polygons are stored with positive signed area, which in y-down coordinates means
// clockwise on screen. For that orientation the inward normal of an edge with unit
// direction (ux, uy) is (-uy, ux).

export const EPS = 1e-9;

export function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function area(pts) {
  return Math.abs(signedArea(pts));
}

export function normalizeOrientation(pts) {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts.slice();
}

export function perimeter(pts) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

export function edge(pts, i) {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = len > EPS ? dx / len : 1;
  const uy = len > EPS ? dy / len : 0;
  const s = signedArea(pts) >= 0 ? 1 : -1;
  return { i, a, b, len, ux, uy, nx: -uy * s, ny: ux * s };
}

export function edges(pts) {
  return pts.map((_, i) => edge(pts, i));
}

export function centroid(pts) {
  const A = signedArea(pts);
  if (Math.abs(A) < EPS) {
    const n = pts.length || 1;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}

export function bounds(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// Closest point on segment ab to p. t is the distance along the segment in metres.
export function projectOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return { x: a.x, y: a.y, d: Math.hypot(p.x - a.x, p.y - a.y), t: 0, len: 0 };
  let k = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  k = Math.max(0, Math.min(1, k));
  const x = a.x + k * dx;
  const y = a.y + k * dy;
  const len = Math.sqrt(len2);
  return { x, y, d: Math.hypot(p.x - x, p.y - y), t: k * len, len };
}

export function distToPolygonEdges(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const r = projectOnSegment(p, pts[i], pts[(i + 1) % pts.length]);
    if (r.d < best) best = r.d;
  }
  return best;
}

// A point well inside the polygon for placing a label (works for L and U shapes,
// where the centroid can fall outside).
export function labelPoint(pts) {
  const c = centroid(pts);
  if (pointInPolygon(c, pts) && distToPolygonEdges(c, pts) > 0.35) return c;
  const b = bounds(pts);
  const steps = 24;
  let best = c;
  let bestD = pointInPolygon(c, pts) ? distToPolygonEdges(c, pts) : -1;
  for (let ix = 1; ix < steps; ix++) {
    for (let iy = 1; iy < steps; iy++) {
      const p = { x: b.minX + (b.w * ix) / steps, y: b.minY + (b.h * iy) / steps };
      if (!pointInPolygon(p, pts)) continue;
      const d = distToPolygonEdges(p, pts);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

function segIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < EPS) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  const e = 1e-6;
  return t > e && t < 1 - e && u > e && u < 1 - e;
}

export function selfIntersects(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function polygonsOverlap(A, B) {
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      if (segIntersect(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
    }
  }
  // One fully inside the other: test a point that is clearly inside each.
  const a = labelPoint(A);
  const b = labelPoint(B);
  return pointInPolygon(a, B) || pointInPolygon(b, A);
}

export function isValidPolygon(pts, minEdge = 0.05) {
  if (pts.length < 3) return false;
  if (area(pts) < 0.05) return false;
  for (let i = 0; i < pts.length; i++) {
    if (edge(pts, i).len < minEdge) return false;
  }
  return !selfIntersects(pts);
}

// Round to a step. Dividing by the inverse step keeps decimal results exact in floating
// point (3.3, not 3.3000000000000003), so saved coordinates stay clean.
export function round(v, step = 0.001) {
  const inv = 1 / step;
  return Math.round(v * inv) / inv;
}

export function roundPoint(p, step = 0.001) {
  return { x: round(p.x, step), y: round(p.y, step) };
}

// Change the length of edge i by moving the next wall (edge i+1) along edge i.
// For rectangles and other right-angled rooms this keeps every angle and moves the
// opposite wall by the same amount. Returns null when the result would be invalid.
export function setEdgeLength(pts, i, newLen) {
  const n = pts.length;
  const e = edge(pts, i);
  const delta = newLen - e.len;
  if (!(newLen > 0.05)) return null;
  const out = pts.map((p) => ({ ...p }));
  const j1 = (i + 1) % n;
  const j2 = (i + 2) % n;
  if (n === 3) {
    out[j1] = { x: e.a.x + e.ux * newLen, y: e.a.y + e.uy * newLen };
  } else {
    for (const j of [j1, j2]) {
      out[j] = { x: out[j].x + e.ux * delta, y: out[j].y + e.uy * delta };
    }
  }
  const fixed = out.map((p) => roundPoint(p));
  return sameShapeFamily(pts, fixed) ? fixed : null;
}

// A changed polygon must stay valid, keep its orientation and keep every edge pointing
// the way it did (otherwise a notch has been folded inside out).
function sameShapeFamily(before, after) {
  if (!isValidPolygon(after) || signedArea(after) <= 0) return false;
  for (let k = 0; k < before.length; k++) {
    const a = edge(before, k);
    const b = edge(after, k);
    if (a.ux * b.ux + a.uy * b.uy < 0.5) return false;
  }
  return true;
}

// Move edge i perpendicular to itself by dist (positive = outward, growing the room).
export function moveEdge(pts, i, dist) {
  const n = pts.length;
  const e = edge(pts, i);
  const out = pts.map((p) => ({ ...p }));
  for (const j of [i, (i + 1) % n]) {
    out[j] = { x: out[j].x - e.nx * dist, y: out[j].y - e.ny * dist };
  }
  const fixed = out.map((p) => roundPoint(p));
  return sameShapeFamily(pts, fixed) ? fixed : null;
}

export function rectPoints(x0, y0, x1, y1) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

// True when the polygon has only horizontal and vertical edges.
export function isOrthogonal(pts, tol = 1e-3) {
  return edges(pts).every((e) => Math.abs(e.ux) < tol || Math.abs(e.uy) < tol);
}
