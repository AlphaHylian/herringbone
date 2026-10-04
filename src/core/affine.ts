/** 2D affine transforms [a, b, c, d, tx, ty]: x' = a*x + c*y + tx, y' = b*x + d*y + ty. */
import type { Pt, Ring } from './geom';

export type Affine = [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export function affine(angle: number, tx: number, ty: number, mirrorX = false): Affine {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = mirrorX ? -1 : 1;
  // R(angle) * diag(m, 1)
  return [c * m, s * m, -s, c, tx, ty];
}

/** compose(A, B) applies B first, then A. */
export function compose(A: Affine, B: Affine): Affine {
  return [
    A[0] * B[0] + A[2] * B[1],
    A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3],
    A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}

export function invert(m: Affine): Affine {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function apply(m: Affine, p: Pt): Pt {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

export function applyRing(m: Affine, r: Ring): Ring {
  return r.map((p) => apply(m, p));
}

export function translation(tx: number, ty: number): Affine {
  return [1, 0, 0, 1, tx, ty];
}
