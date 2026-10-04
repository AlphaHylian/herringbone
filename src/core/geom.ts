/**
 * Pure 2D geometry helpers. Everything is in world units (millimetres), never pixels.
 * A `Ring` is an open polygon ring (the first point is not repeated at the end).
 */
import {
  booleanOpDWithPolyTree,
  ClipType,
  FillRule,
  PolyTreeD,
  type PathsD,
  type PolyPathD,
} from 'clipper2-ts';

export type Pt = [number, number];
export type Ring = Pt[];
/** A polygon with optional holes: [outer, ...holes]. */
export type Poly = Ring[];
/** A set of disjoint polygons. */
export type Shape = Poly[];

export const EPS = 1e-9;

export function sub(a: Pt, b: Pt): Pt {
  return [a[0] - b[0], a[1] - b[1]];
}
export function add(a: Pt, b: Pt): Pt {
  return [a[0] + b[0], a[1] + b[1]];
}
export function scale(a: Pt, s: number): Pt {
  return [a[0] * s, a[1] * s];
}
export function dot(a: Pt, b: Pt): number {
  return a[0] * b[0] + a[1] * b[1];
}
export function cross(a: Pt, b: Pt): number {
  return a[0] * b[1] - a[1] * b[0];
}
export function len(a: Pt): number {
  return Math.hypot(a[0], a[1]);
}
export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
export function rotate(p: Pt, angle: number): Pt {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

/** Signed area (positive for counter-clockwise rings in a y-up frame). */
export function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % n]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
export function ringArea(r: Ring): number {
  return Math.abs(signedArea(r));
}
export function polyArea(p: Poly): number {
  if (p.length === 0) return 0;
  let a = ringArea(p[0]!);
  for (let i = 1; i < p.length; i++) a -= ringArea(p[i]!);
  return a;
}
export function shapeArea(s: Shape): number {
  let a = 0;
  for (const p of s) a += polyArea(p);
  return a;
}

export function ringCentroid(r: Ring): Pt {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % n]!;
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
    a += f;
  }
  if (Math.abs(a) < EPS) {
    // Degenerate: average of points.
    let sx = 0;
    let sy = 0;
    for (const p of r) {
      sx += p[0];
      sy += p[1];
    }
    return [sx / Math.max(1, r.length), sy / Math.max(1, r.length)];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function ensureCCW(r: Ring): Ring {
  return signedArea(r) < 0 ? [...r].reverse() : r;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export function ringBBox(r: Ring): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of r) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}
export function bboxOverlap(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

export function pointInRing(p: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!;
    const b = r[j]!;
    if (a[1] > p[1] !== b[1] > p[1]) {
      const x = ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (p[0] < x) inside = !inside;
    }
  }
  return inside;
}
export function pointInPoly(p: Pt, poly: Poly): boolean {
  if (poly.length === 0 || !pointInRing(p, poly[0]!)) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(p, poly[i]!)) return false;
  return true;
}

/** Distance from a point to a segment. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t]);
}

/** Andrew's monotone chain. Returns a CCW hull without collinear points. */
export function convexHull(points: Pt[]): Ring {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower: Pt[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(
        sub(lower[lower.length - 1]!, lower[lower.length - 2]!),
        sub(p, lower[lower.length - 2]!),
      ) <= 1e-9
    )
      lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (
      upper.length >= 2 &&
      cross(
        sub(upper[upper.length - 1]!, upper[upper.length - 2]!),
        sub(p, upper[upper.length - 2]!),
      ) <= 1e-9
    )
      upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function isConvex(r: Ring, tol = 1e-6): boolean {
  const n = r.length;
  if (n < 4) return true;
  const sign = Math.sign(signedArea(r));
  for (let i = 0; i < n; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % n]!;
    const c = r[(i + 2) % n]!;
    const z = cross(sub(b, a), sub(c, b));
    if (z * sign < -tol * len(sub(b, a)) * len(sub(c, b))) return false;
  }
  return true;
}

/**
 * Clip a convex (or any) ring to the half-plane on the left of the directed line a->b
 * (Sutherland-Hodgman). For convex input the result is exact and convex.
 */
export function clipHalfPlane(r: Ring, a: Pt, b: Pt): Ring {
  const d = sub(b, a);
  const side = (p: Pt): number => cross(d, sub(p, a));
  const out: Ring = [];
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % n]!;
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0 && sq < 0) || (sp < 0 && sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return dedupeRing(out);
}

/** Remove consecutive duplicate points and collinear points. */
export function dedupeRing(r: Ring, tol = 1e-7): Ring {
  const out: Ring = [];
  for (const p of r) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > tol) out.push(p);
  }
  while (out.length > 1 && dist(out[0]!, out[out.length - 1]!) <= tol) out.pop();
  // drop collinear
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length]!;
      const b = out[i]!;
      const c = out[(i + 1) % out.length]!;
      const ab = sub(b, a);
      const bc = sub(c, b);
      if (Math.abs(cross(ab, bc)) <= 1e-9 * Math.max(1, len(ab) * len(bc)) && dot(ab, bc) > 0) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

// ---- Boolean operations (Clipper2) -------------------------------------------------------
// Clipper2 snaps to a fixed decimal precision internally and is robust for the many exactly
// touching edges a brick pattern produces.

const PRECISION = 4; // 0.0001 mm

function toPaths(x: Poly | Shape): PathsD {
  const out: PathsD = [];
  const addPoly = (p: Poly): void => {
    p.forEach((ring, i) => {
      if (ring.length < 3) return;
      // Outer rings positive, holes negative, so the NonZero fill rule is correct even when
      // several input polygons overlap.
      const pos = signedArea(ring) > 0;
      const r = pos === (i === 0) ? ring : [...ring].reverse();
      out.push(r.map((q) => ({ x: q[0], y: q[1] })));
    });
  };
  if (x.length === 0) return out;
  const first = x[0] as unknown[];
  const isShape = Array.isArray(first[0]) && Array.isArray((first[0] as unknown[])[0]);
  if (isShape) for (const p of x as Shape) addPoly(p);
  else addPoly(x as Poly);
  return out;
}

function treeToShape(tree: PolyPathD, out: Shape): Shape {
  for (let i = 0; i < tree.count; i++) {
    const outer = tree.child(i);
    const ring = outer.poly;
    if (!ring || ring.length < 3) continue;
    const poly: Poly = [ring.map((q) => [q.x, q.y] as Pt)];
    for (let j = 0; j < outer.count; j++) {
      const hole = outer.child(j);
      if (hole.poly && hole.poly.length >= 3) poly.push(hole.poly.map((q) => [q.x, q.y] as Pt));
      // islands inside holes
      treeToShape(hole, out);
    }
    out.push(poly);
  }
  return out;
}

function booleanOp(type: ClipType, a: Poly | Shape, b: (Poly | Shape)[]): Shape {
  const clip: PathsD = [];
  for (const x of b) clip.push(...toPaths(x));
  const tree = new PolyTreeD();
  booleanOpDWithPolyTree(type, toPaths(a), clip, tree, FillRule.NonZero, PRECISION);
  return treeToShape(tree, []);
}

export function intersect(a: Poly | Shape, ...b: (Poly | Shape)[]): Shape {
  // Intersection with several clips means "inside all of them".
  let acc = a;
  for (const x of b) acc = booleanOp(ClipType.Intersection, acc, [x]);
  return b.length === 0 ? booleanOp(ClipType.Union, a, []) : (acc as Shape);
}
export function union(a: Poly | Shape, ...b: (Poly | Shape)[]): Shape {
  return booleanOp(ClipType.Union, a, b);
}
export function difference(a: Poly | Shape, ...b: (Poly | Shape)[]): Shape {
  return booleanOp(ClipType.Difference, a, b);
}

/** Intersection-over-union of two polygons. 0 when disjoint, 1 when identical. */
export function iou(a: Poly | Shape, b: Poly | Shape): number {
  const i = shapeArea(intersect(a, b));
  if (i <= 0) return 0;
  const u = shapeArea(union(a, b));
  return u > 0 ? i / u : 0;
}

export function translateRing(r: Ring, d: Pt): Ring {
  return r.map((p) => [p[0] + d[0], p[1] + d[1]] as Pt);
}
export function rotateRing(r: Ring, angle: number, about: Pt = [0, 0]): Ring {
  return r.map((p) => add(rotate(sub(p, about), angle), about));
}
export function transformRing(r: Ring, angle: number, d: Pt): Ring {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return r.map((p) => [p[0] * c - p[1] * s + d[0], p[0] * s + p[1] * c + d[1]] as Pt);
}

/** Axis-aligned rectangle centred at the origin, CCW. */
export function rectRing(w: number, h: number): Ring {
  const x = w / 2;
  const y = h / 2;
  return [
    [-x, -y],
    [x, -y],
    [x, y],
    [-x, y],
  ];
}

/**
 * Shrink a convex ring by distance d (for drawing joints); a negative d grows it. Returns the
 * original ring if the inset would collapse it.
 */
export function insetConvex(r: Ring, d: number): Ring {
  const ring = ensureCCW(r);
  const n = ring.length;
  if (n < 3 || d === 0) return ring;
  const lines: [Pt, Pt][] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const e = sub(b, a);
    const l = len(e);
    if (l < 1e-9) continue;
    const nrm: Pt = [(-e[1] / l) * d, (e[0] / l) * d]; // inward for CCW
    lines.push([add(a, nrm), add(b, nrm)]);
  }
  const out: Ring = [];
  for (let i = 0; i < lines.length; i++) {
    const [p1, p2] = lines[(i - 1 + lines.length) % lines.length]!;
    const [q1, q2] = lines[i]!;
    const r1 = sub(p2, p1);
    const r2 = sub(q2, q1);
    const den = cross(r1, r2);
    if (Math.abs(den) < 1e-12) {
      out.push(q1);
      continue;
    }
    const t = cross(sub(q1, p1), r2) / den;
    out.push([p1[0] + r1[0] * t, p1[1] + r1[1] * t]);
  }
  if (out.length < 3 || signedArea(out) <= 0 || (d > 0 && ringArea(out) < ringArea(ring) * 0.2))
    return ring;
  return out;
}
