/**
 * Turns a level into a job: the list of brick slots the player has to fill.
 * A slot is either `full` (a whole brick fits) or `edge` (the brick crosses the border, and its
 * target is the brick clipped to the border, possibly split into convex-enough parts).
 */
import {
  bboxOverlap,
  convexHull,
  dedupeRing,
  intersect,
  ringArea,
  ringBBox,
  ringCentroid,
  rectRing,
  transformRing,
  ensureCCW,
  sub,
  cross,
  distToSegment,
  type BBox,
  type Poly,
  type Pt,
  type Ring,
} from './geom';
import { levelPoly, type LevelData } from './level';
import { tilingFor } from './patterns';

/** Edge pieces smaller than this fraction of a brick are dropped (no tiny fiddly pieces). */
export const SLIVER_FRACTION = 0.08;
/** A brick counts as full if at least this fraction of it lies inside the border. */
export const FULL_FRACTION = 0.999;
/**
 * Inside corners sharper than this (radians of turn) can't be made with straight cuts from one
 * brick, so the target is split there into separate pieces. Gentle concave curves (around a
 * tree pit) stay whole; their straight-cut goal is the convex hull.
 */
export const SHARP_REFLEX = (22 * Math.PI) / 180;
/**
 * A gently concave target whose hull exceeds it by more than this fraction of a brick (a tight
 * curve around a small hole) is split in two at its deepest point, so each piece's straight
 * chord hugs the curve better.
 */
export const CURVE_GAP_FRACTION = 0.05;

export type SlotKind = 'full' | 'edge';

export interface Slot {
  id: number;
  kind: SlotKind;
  /** Lattice brick this slot belongs to (edge parts of one brick share it). */
  brickId: number;
  /** World centre and angle of the whole brick. */
  center: Pt;
  angle: number;
  /** The whole brick rectangle in world coordinates (CCW). */
  rect: Ring;
  /** The shape to fill (equals rect for full slots), CCW. */
  target: Ring;
  targetArea: number;
  /**
   * Convex hull of the target: the ideal straight-cut shape, and what cut accuracy is
   * measured against (equal to the target unless it bends gently inwards).
   */
  hull: Ring;
  /** Centroid of the target. */
  centroid: Pt;
}

export interface Job {
  level: LevelData;
  border: Poly;
  bbox: BBox;
  brickLength: number;
  brickWidth: number;
  brickArea: number;
  slots: Slot[];
  fullCount: number;
  edgeCount: number;
}

function halfPlaneBox(p: Pt, d: Pt, R: number): Ring {
  // Large rectangle covering the left side of the line through p with direction d.
  const l = Math.hypot(d[0], d[1]);
  const u: Pt = [d[0] / l, d[1] / l];
  const n: Pt = [-u[1], u[0]];
  const a: Pt = [p[0] - u[0] * R, p[1] - u[1] * R];
  const b: Pt = [p[0] + u[0] * R, p[1] + u[1] * R];
  return [a, b, [b[0] + n[0] * R, b[1] + n[1] * R], [a[0] + n[0] * R, a[1] + n[1] * R]];
}

function splitByLine(ring: Ring, p: Pt, d: Pt): Ring[][] {
  const R = 1e6;
  const left = intersect([ring], [halfPlaneBox(p, d, R)]);
  const right = intersect([ring], [halfPlaneBox(p, [-d[0], -d[1]], R)]);
  const outer = (s: Poly[]): Ring[] =>
    s.map((poly) => ensureCCW(dedupeRing(poly[0]!))).filter((r) => r.length >= 3);
  return [outer(left), outer(right)];
}

/** Split a target into parts that can each be made with straight cuts from one brick. */
export function decomposeTarget(ring: Ring, brickArea: number, depth = 0): Ring[] {
  if (depth > 6) return [ring];
  // Find the cut through a reflex vertex along one of its edges that splits most evenly.
  const n = ring.length;
  let best: Ring[] | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n]!;
    const v = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const turn = cross(sub(v, a), sub(b, v));
    if (turn >= -1e-9) continue; // convex vertex (ring is CCW)
    const e1 = sub(v, a);
    const e2 = sub(b, v);
    const ang = Math.atan2(Math.abs(turn), e1[0] * e2[0] + e1[1] * e2[1]);
    if (ang < SHARP_REFLEX) continue; // gentle bend of a curve
    for (const dir of [sub(v, a), sub(v, b)]) {
      const [l, r] = splitByLine(ring, v, dir);
      const parts = [...l!, ...r!];
      if (parts.length < 2) continue;
      const minPart = Math.min(...parts.map(ringArea));
      // Prefer splits that leave no pieces we'd have to discard, then balanced splits.
      const score =
        minPart >= SLIVER_FRACTION * brickArea ? 1e9 + minPart - parts.length * 1e6 : minPart;
      if (score > bestScore) {
        bestScore = score;
        best = parts;
      }
    }
  }
  if (!best) best = splitDeepCurve(ring, brickArea);
  if (!best) return [ring];
  return best.flatMap((p) => decomposeTarget(p, brickArea, depth + 1));
}

/** Split a gently concave ring at its deepest point, perpendicular to the hull chord there. */
function splitDeepCurve(ring: Ring, brickArea: number): Ring[] | null {
  const hull = convexHull(ring);
  if (ringArea(hull) - ringArea(ring) <= CURVE_GAP_FRACTION * brickArea) return null;
  // Deepest ring vertex measured from the hull boundary.
  let deepest: Pt | null = null;
  let chordDir: Pt = [1, 0];
  let depthMax = 0;
  for (const v of ring) {
    let best = Infinity;
    let dir: Pt = [1, 0];
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i]!;
      const b = hull[(i + 1) % hull.length]!;
      const d = distToSegment(v, a, b);
      if (d < best) {
        best = d;
        dir = sub(b, a);
      }
    }
    if (best > depthMax) {
      depthMax = best;
      deepest = v;
      chordDir = dir;
    }
  }
  if (!deepest) return null;
  const [l, r] = splitByLine(ring, deepest, [-chordDir[1], chordDir[0]]);
  const parts = [...l!, ...r!];
  if (parts.length < 2 || parts.some((p) => ringArea(p) < SLIVER_FRACTION * brickArea)) return null;
  return parts;
}

export function buildJob(level: LevelData): Job {
  const L = level.brick.length;
  const W = level.brick.width;
  const brickArea = L * W;
  const border = levelPoly(level);
  const bbox = ringBBox(level.border.outer);
  const tiling = tilingFor(level.pattern.type, L, W);
  const theta = tiling.baseAngle + ((level.pattern.angle ?? 0) * Math.PI) / 180;
  const off = level.pattern.offset ?? [0, 0];
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const toWorld = (p: Pt): Pt => [
    p[0] * cos - p[1] * sin + off[0],
    p[0] * sin + p[1] * cos + off[1],
  ];
  const toPattern = (p: Pt): Pt => {
    const x = p[0] - off[0];
    const y = p[1] - off[1];
    return [x * cos + y * sin, -x * sin + y * cos];
  };
  // Lattice range covering the bbox: solve corners in lattice coordinates.
  const { a, b } = tiling;
  const det = a[0] * b[1] - a[1] * b[0];
  let iMin = Infinity;
  let iMax = -Infinity;
  let jMin = Infinity;
  let jMax = -Infinity;
  const corners: Pt[] = [
    [bbox.minX, bbox.minY],
    [bbox.maxX, bbox.minY],
    [bbox.maxX, bbox.maxY],
    [bbox.minX, bbox.maxY],
  ];
  for (const c of corners) {
    const p = toPattern(c);
    const i = (p[0] * b[1] - p[1] * b[0]) / det;
    const j = (a[0] * p[1] - a[1] * p[0]) / det;
    iMin = Math.min(iMin, i);
    iMax = Math.max(iMax, i);
    jMin = Math.min(jMin, j);
    jMax = Math.max(jMax, j);
  }
  const margin = 3;
  const brick = rectRing(L, W);
  const slots: Slot[] = [];
  let brickId = 0;
  for (let j = Math.floor(jMin) - margin; j <= Math.ceil(jMax) + margin; j++) {
    for (let i = Math.floor(iMin) - margin; i <= Math.ceil(iMax) + margin; i++) {
      for (const m of tiling.motif) {
        const pc: Pt = [m.c[0] + i * a[0] + j * b[0], m.c[1] + i * a[1] + j * b[1]];
        const center = toWorld(pc);
        const angle = m.angle + theta;
        const rect = ensureCCW(transformRing(brick, angle, center));
        if (!bboxOverlap(ringBBox(rect), bbox)) continue;
        const inter = intersect([rect], border);
        let interArea = 0;
        for (const poly of inter)
          for (let k = 0; k < poly.length; k++)
            interArea += (k === 0 ? 1 : -1) * ringArea(poly[k]!);
        if (interArea < SLIVER_FRACTION * brickArea) continue;
        const id = brickId++;
        if (interArea >= FULL_FRACTION * brickArea) {
          slots.push(makeSlot(slots.length, 'full', id, center, angle, rect, rect));
          continue;
        }
        for (const poly of inter) {
          // Holes inside a single brick can't be cut with a splitter; levels avoid them, and we
          // fill them in if they ever occur.
          const outer = ensureCCW(dedupeRing(poly[0]!));
          if (outer.length < 3 || ringArea(outer) < SLIVER_FRACTION * brickArea) continue;
          for (const part of decomposeTarget(outer, brickArea)) {
            if (ringArea(part) < SLIVER_FRACTION * brickArea) continue;
            slots.push(makeSlot(slots.length, 'edge', id, center, angle, rect, part));
          }
        }
      }
    }
  }
  const fullCount = slots.filter((s) => s.kind === 'full').length;
  return {
    level,
    border,
    bbox,
    brickLength: L,
    brickWidth: W,
    brickArea,
    slots,
    fullCount,
    edgeCount: slots.length - fullCount,
  };
}

function makeSlot(
  id: number,
  kind: 'full' | 'edge',
  brickId: number,
  center: Pt,
  angle: number,
  rect: Ring,
  target: Ring,
): Slot {
  const hull = kind === 'full' ? rect : convexHull(target);
  return {
    id,
    kind,
    brickId,
    center,
    angle,
    rect,
    target,
    targetArea: ringArea(target),
    hull,
    centroid: ringCentroid(target),
  };
}
