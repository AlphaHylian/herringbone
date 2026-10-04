/** Offcuts: leftover convex pieces that can be turned and dropped into other edge slots. */
import {
  clipHalfPlane,
  convexHull,
  ensureCCW,
  ringArea,
  ringCentroid,
  translateRing,
  transformRing,
  sub,
  type Pt,
  type Ring,
} from './geom';

/** Leftovers smaller than this fraction of a brick are swept away instead of kept. */
export const OFFCUT_MIN_FRACTION = 0.12;
/** A fitted offcut must cover at least this share of the target's hull. */
export const OFFCUT_MIN_COVERAGE = 0.95;
/** The tray holds this many pieces; when it overflows the smallest piece is discarded. */
export const TRAY_CAPACITY = 6;

export interface Offcut {
  id: number;
  /** Convex ring in local coordinates, centred on its centroid. */
  shape: Ring;
  area: number;
}

export function makeOffcut(id: number, worldRing: Ring): Offcut {
  const r = ensureCCW(worldRing);
  const c = ringCentroid(r);
  const shape = translateRing(r, [-c[0], -c[1]]);
  return { id, shape, area: ringArea(shape) };
}

export interface OffcutFit {
  angle: number;
  mirrored: boolean;
  offset: Pt;
  /** The offcut moved into place, in world coordinates. */
  placed: Ring;
  /** The placed offcut trimmed to the target's hull (what is actually laid). */
  laid: Ring;
}

function edgeAngles(r: Ring): number[] {
  const out: number[] = [];
  for (let i = 0; i < r.length; i++) {
    const d = sub(r[(i + 1) % r.length]!, r[i]!);
    out.push(Math.atan2(d[1], d[0]));
  }
  return out;
}

/**
 * Find a translation d so that every target vertex lies inside (convex, CCW) `piece + d`,
 * allowing each vertex to poke out by `tol`. Returns the most centred such d, or null.
 */
function feasibleOffset(piece: Ring, targetPts: Ring, tol: number): Pt | null {
  // Region of valid d: for each piece edge with outward normal n through p:
  // n.(t - d - p) <= tol for all t  <=>  n.d >= max_t n.(t - p) - tol.
  const R = 1e6;
  let region: Ring = [
    [-R, -R],
    [R, -R],
    [R, R],
    [-R, R],
  ];
  for (let i = 0; i < piece.length; i++) {
    const p = piece[i]!;
    const q = piece[(i + 1) % piece.length]!;
    const e = sub(q, p);
    const l = Math.hypot(e[0], e[1]);
    if (l < 1e-9) continue;
    const n: Pt = [e[1] / l, -e[0] / l]; // outward for CCW
    let c = -Infinity;
    for (const t of targetPts) c = Math.max(c, n[0] * (t[0] - p[0]) + n[1] * (t[1] - p[1]));
    c -= tol;
    // Keep n.d >= c: the left side of a line whose direction is n rotated by +90deg... build it
    // explicitly: points with n.d = c form a line; base point n*c, direction (-n.y, n.x) has
    // n on its right, so we need the side where n.d grows, i.e. the right side -> reverse.
    const base: Pt = [n[0] * c, n[1] * c];
    const dir: Pt = [n[1], -n[0]];
    region = clipHalfPlane(region, base, [base[0] + dir[0], base[1] + dir[1]]);
    if (region.length < 3) return null;
  }
  if (region.length < 3 || ringArea(region) <= 0) return null;
  return ringCentroid(region);
}

/**
 * Can this offcut be turned (and flipped) to cover the target? `hull` is the target's convex
 * hull in world coordinates; `tol` is how far (mm) a target corner may poke out.
 */
export function fitOffcut(offcut: Offcut, hull: Ring, tol: number): OffcutFit | null {
  if (offcut.area + 1e-6 < ringArea(hull) * 0.97) return null; // too small to ever cover
  const hullArea = ringArea(hull);
  const hc = ringCentroid(hull);
  const local = translateRing(hull, [-hc[0], -hc[1]]);
  const tAngles = edgeAngles(hull);
  for (const mirrored of [false, true]) {
    const base = mirrored ? ensureCCW(offcut.shape.map((p) => [-p[0], p[1]] as Pt)) : offcut.shape;
    const oAngles = edgeAngles(base);
    const candidates: number[] = [];
    for (const ta of tAngles) for (const oa of oAngles) candidates.push(ta - oa, ta - oa + Math.PI);
    for (let k = 0; k < 24; k++) candidates.push((k * Math.PI) / 12);
    const seen = new Set<number>();
    for (const angle of candidates) {
      const key = Math.round((((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * 1e4);
      if (seen.has(key)) continue;
      seen.add(key);
      const rotated = transformRing(base, angle, [0, 0]);
      const d = feasibleOffset(rotated, local, tol);
      if (!d) continue;
      const offset: Pt = [d[0] + hc[0], d[1] + hc[1]];
      const placed = translateRing(rotated, offset);
      let laid = placed;
      for (let i = 0; i < hull.length; i++)
        laid = clipHalfPlane(laid, hull[i]!, hull[(i + 1) % hull.length]!);
      if (laid.length < 3 || ringArea(laid) < OFFCUT_MIN_COVERAGE * hullArea) continue;
      return { angle, mirrored, offset, placed, laid: convexHull(laid) };
    }
  }
  return null;
}
