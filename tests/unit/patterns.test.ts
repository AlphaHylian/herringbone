import { describe, expect, it } from 'vitest';
import { PATTERN_TYPES, tilingFor } from '../../src/core/patterns';
import {
  rectRing,
  transformRing,
  intersect,
  shapeArea,
  union,
  type Ring,
} from '../../src/core/geom';

function bricksInWindow(type: (typeof PATTERN_TYPES)[number], L: number, W: number, R: number) {
  const t = tilingFor(type, L, W);
  const out: Ring[] = [];
  for (let i = -30; i <= 30; i++) {
    for (let j = -30; j <= 30; j++) {
      for (const m of t.motif) {
        const c: [number, number] = [
          m.c[0] + i * t.a[0] + j * t.b[0],
          m.c[1] + i * t.a[1] + j * t.b[1],
        ];
        if (Math.abs(c[0]) > R + L || Math.abs(c[1]) > R + L) continue;
        out.push(transformRing(rectRing(L, W), m.angle, c));
      }
    }
  }
  return out;
}

describe('pattern tilings', () => {
  for (const type of PATTERN_TYPES) {
    it(`${type} tiles the plane with no gaps or overlaps`, () => {
      const L = 200;
      const W = 100;
      const R = 500;
      const win = [rectRing(2 * R, 2 * R)];
      const bricks = bricksInWindow(type, L, W, R);
      let sum = 0;
      for (const b of bricks) sum += shapeArea(intersect([b], win));
      const covered = shapeArea(intersect(union(bricks.map((b) => [b])), win));
      expect(covered).toBeCloseTo(4 * R * R, 0);
      // sum of clipped areas equal to covered area means no overlaps
      expect(sum).toBeCloseTo(4 * R * R, 0);
    });
  }
});
