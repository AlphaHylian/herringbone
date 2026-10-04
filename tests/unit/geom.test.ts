import { describe, expect, it } from 'vitest';
import {
  clipHalfPlane,
  convexHull,
  difference,
  intersect,
  iou,
  isConvex,
  pointInPoly,
  rectRing,
  ringArea,
  ringCentroid,
  shapeArea,
  signedArea,
  transformRing,
  union,
  type Ring,
} from '../../src/core/geom';

const sq: Ring = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe('geom', () => {
  it('computes area and centroid', () => {
    expect(signedArea(sq)).toBe(100);
    expect(signedArea([...sq].reverse())).toBe(-100);
    expect(ringCentroid(sq)).toEqual([5, 5]);
  });

  it('convex hull drops interior and collinear points', () => {
    const h = convexHull([...sq, [5, 5], [5, 0], [2, 3]]);
    expect(h).toHaveLength(4);
    expect(ringArea(h)).toBe(100);
  });

  it('detects convexity', () => {
    expect(isConvex(sq)).toBe(true);
    expect(
      isConvex([
        [0, 0],
        [10, 0],
        [10, 10],
        [5, 5],
        [0, 10],
      ]),
    ).toBe(false);
  });

  it('clips to a half-plane', () => {
    const left = clipHalfPlane(sq, [5, -1], [5, 11]); // keep x <= 5
    expect(ringArea(left)).toBeCloseTo(50);
    const diag = clipHalfPlane(sq, [0, 0], [10, 10]); // keep above diagonal
    expect(ringArea(diag)).toBeCloseTo(50);
    expect(clipHalfPlane(sq, [20, 0], [20, 10])).toHaveLength(4); // all kept
  });

  it('wraps polygon-clipping boolean ops', () => {
    const b = transformRing(rectRing(10, 10), 0, [10, 5]);
    expect(shapeArea(intersect([sq], [b]))).toBeCloseTo(50);
    expect(shapeArea(union([sq], [b]))).toBeCloseTo(150);
    expect(shapeArea(difference([sq], [b]))).toBeCloseTo(50);
    expect(iou([sq], [b])).toBeCloseTo(1 / 3);
    expect(iou([sq], [sq])).toBeCloseTo(1);
  });

  it('handles points in polygons with holes', () => {
    const hole: Ring = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
    ];
    expect(pointInPoly([1, 1], [sq, hole])).toBe(true);
    expect(pointInPoly([5, 5], [sq, hole])).toBe(false);
    expect(pointInPoly([15, 5], [sq, hole])).toBe(false);
  });

  it('survives 45 degree rotations that upset polygon-clipping', () => {
    const r = transformRing(rectRing(200, 100), Math.PI / 4, [166.42135623730951, 0]);
    expect(() => intersect([r], [rectRing(1000, 1000)])).not.toThrow();
  });
});
