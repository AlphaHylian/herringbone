/**
 * Paving patterns as periodic tilings: a lattice (two basis vectors) plus a motif of bricks
 * placed in each cell. Bricks are described by centre and angle in pattern space; the whole
 * pattern is then rotated and offset into world space.
 */
import type { Pt } from './geom';

export type PatternType = 'stretcher' | 'herringbone90' | 'herringbone45' | 'basketweave';

export const PATTERN_TYPES: readonly PatternType[] = [
  'stretcher',
  'herringbone90',
  'herringbone45',
  'basketweave',
];

export const PATTERN_NAMES: Record<PatternType, string> = {
  stretcher: 'Stretcher bond',
  herringbone90: 'Herringbone 90°',
  herringbone45: 'Herringbone 45°',
  basketweave: 'Basketweave',
};

export interface MotifBrick {
  /** Centre of the brick within the cell. */
  c: Pt;
  /** 0 = long side along x, PI/2 = long side along y. */
  angle: number;
}

export interface Tiling {
  a: Pt;
  b: Pt;
  motif: MotifBrick[];
  /** Extra rotation applied to the whole pattern (radians). */
  baseAngle: number;
}

/**
 * Herringbone and basketweave need bricks whose length is exactly twice their width
 * (the level loader enforces this). Stretcher bond works with any proportions.
 */
export function tilingFor(type: PatternType, L: number, W: number): Tiling {
  const H = Math.PI / 2;
  switch (type) {
    case 'stretcher':
      return {
        a: [L, 0],
        b: [L / 2, W],
        motif: [{ c: [L / 2, W / 2], angle: 0 }],
        baseAngle: 0,
      };
    case 'herringbone90':
    case 'herringbone45':
      // A staircase of horizontal brick [k, k+2]x[k, k+1] and vertical brick
      // [k+2, k+3]x[k-1, k+1] (in units of W), stepping by (1,1); bands repeat by (2,-2).
      return {
        a: [W, W],
        b: [2 * W, -2 * W],
        motif: [
          { c: [W, W / 2], angle: 0 },
          { c: [2.5 * W, 0], angle: H },
        ],
        baseAngle: type === 'herringbone45' ? Math.PI / 4 : 0,
      };
    case 'basketweave':
      // Checkerboard of LxL blocks: two horizontal bricks, then two vertical bricks.
      return {
        a: [2 * L, 0],
        b: [L, L],
        motif: [
          { c: [L / 2, W / 2], angle: 0 },
          { c: [L / 2, W * 1.5], angle: 0 },
          { c: [L + W / 2, L / 2], angle: H },
          { c: [L + W * 1.5, L / 2], angle: H },
        ],
        baseAngle: 0,
      };
  }
}
