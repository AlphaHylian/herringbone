/** The splitter: cutting a convex piece with a straight line, and measuring how well it fits. */
import {
  clipHalfPlane,
  dist,
  distToSegment,
  intersect,
  iou,
  ringArea,
  shapeArea,
  sub,
  cross,
  type Pt,
  type Ring,
} from './geom';
import type { Slot } from './job';

/** At or above this accuracy a cut piece fits cleanly with a normal joint. */
export const CLEAN_ACCURACY = 0.9;
/** A cut must take off at least this fraction of the piece to count (stops accidental taps). */
export const MIN_CUT_FRACTION = 0.01;

export interface CutResult {
  /** The part kept on the target side. */
  kept: Ring;
  /** The part cut away. */
  removed: Ring;
  /** IoU of the kept part with the target. */
  accuracy: number;
}

/** Split a convex ring by the infinite line through a and b. Returns [left, right]. */
export function splitConvex(piece: Ring, a: Pt, b: Pt): [Ring, Ring] {
  return [clipHalfPlane(piece, a, b), clipHalfPlane(piece, b, a)];
}

/**
 * Cut `piece` along the line a-b and keep the side that covers more of the goal shape
 * (a slot's hull).
 * Returns null if the line misses the piece (or only shaves off a crumb).
 */
export function cutPiece(piece: Ring, goal: Ring, a: Pt, b: Pt): CutResult | null {
  if (dist(a, b) < 1e-6) return null;
  const [left, right] = splitConvex(piece, a, b);
  const total = ringArea(piece);
  const la = left.length >= 3 ? ringArea(left) : 0;
  const ra = right.length >= 3 ? ringArea(right) : 0;
  if (la < MIN_CUT_FRACTION * total || ra < MIN_CUT_FRACTION * total) return null;
  const lt = shapeArea(intersect([left], [goal]));
  const rt = shapeArea(intersect([right], [goal]));
  // Prefer the side with more target; on a tie keep the side with less waste.
  const keepLeft = lt > rt + 1e-9 || (Math.abs(lt - rt) <= 1e-9 && la < ra);
  const kept = keepLeft ? left : right;
  const removed = keepLeft ? right : left;
  return { kept, removed, accuracy: accuracyOf(kept, goal) };
}

/** Accuracy = overlap area / union area of the piece and the goal shape. */
export function accuracyOf(piece: Ring, goal: Ring): number {
  return iou([piece], [goal]);
}

/** True if segment p-q lies along one of the rectangle's edges. */
function onRectEdge(p: Pt, q: Pt, rect: Ring, tol: number): boolean {
  for (let i = 0; i < rect.length; i++) {
    const a = rect[i]!;
    const b = rect[(i + 1) % rect.length]!;
    if (distToSegment(p, a, b) <= tol && distToSegment(q, a, b) <= tol) return true;
  }
  return false;
}

/** Max distance (as a fraction of brick width) between a curve and the chords cutting it. */
export const CHORD_TOLERANCE = 0.03;

/**
 * The ideal cuts for a slot: along the edges of the target's convex hull that aren't brick
 * edges. Runs of short edges (a sampled curve) are simplified to a few chords, the way a paver
 * would cut a curve. Each cut is a directed line with the target on its left.
 */
export function idealCuts(slot: Slot, brickWidth = Math.sqrt(ringArea(slot.rect) / 2)): [Pt, Pt][] {
  const tol = 1e-3 * brickWidth;
  const h = slot.hull;
  const n = h.length;
  const onRect = h.map((p, i) => onRectEdge(p, h[(i + 1) % n]!, slot.rect, tol));
  // Group consecutive non-brick edges into chains of points.
  const chains: Pt[][] = [];
  const start = onRect.findIndex((x) => x);
  if (start < 0) {
    chains.push([...h, h[0]!]);
  } else {
    let cur: Pt[] | null = null;
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (onRect[i]) {
        if (cur) chains.push(cur);
        cur = null;
      } else {
        if (!cur) cur = [h[i]!];
        cur.push(h[(i + 1) % n]!);
      }
    }
    if (cur) chains.push(cur);
  }
  const out: [Pt, Pt][] = [];
  for (const chain of chains) {
    const pts = simplify(chain, CHORD_TOLERANCE * brickWidth);
    for (let i = 0; i + 1 < pts.length; i++) {
      if (dist(pts[i]!, pts[i + 1]!) > tol) out.push([pts[i]!, pts[i + 1]!]);
    }
  }
  // Longer cuts first: they remove the biggest offcuts.
  out.sort((x, y) => dist(y[0], y[1]) - dist(x[0], x[1]));
  return out;
}

/** Douglas-Peucker simplification of an open polyline. */
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts;
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  let worst = -1;
  let wd = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i]!, a, b);
    if (d > wd) {
      wd = d;
      worst = i;
    }
  }
  if (wd <= tol) return [a, b];
  const left = simplify(pts.slice(0, worst + 1), tol);
  const right = simplify(pts.slice(worst), tol);
  return [...left.slice(0, -1), ...right];
}

/** Signed side of point p relative to directed line a-b (positive = left). */
export function sideOf(p: Pt, a: Pt, b: Pt): number {
  return cross(sub(b, a), sub(p, a));
}
