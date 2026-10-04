import { describe, expect, it } from 'vitest';
import { cutPiece, idealCuts, simplify, splitConvex, CLEAN_ACCURACY } from '../../src/core/cut';
import {
  ringArea,
  rectRing,
  transformRing,
  convexHull,
  type Ring,
  type Pt,
} from '../../src/core/geom';
import type { Slot } from '../../src/core/job';

const brick = transformRing(rectRing(200, 100), 0, [100, 50]); // [0,200]x[0,100]
const half: Ring = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

function slotFor(target: Ring): Slot {
  return {
    id: 0,
    kind: 'edge',
    brickId: 0,
    center: [100, 50],
    angle: 0,
    rect: brick,
    target,
    targetArea: ringArea(target),
    hull: convexHull(target),
    centroid: [0, 0],
  };
}

describe('cutting', () => {
  it('splits a brick in two along a line', () => {
    const [l, r] = splitConvex(brick, [100, -50], [100, 150]);
    expect(ringArea(l) + ringArea(r)).toBeCloseTo(20000);
    expect(ringArea(l)).toBeCloseTo(10000);
  });

  it('keeps the side covering the target, whichever way the swipe goes', () => {
    for (const [a, b] of [
      [
        [100, -50],
        [100, 150],
      ],
      [
        [100, 150],
        [100, -50],
      ],
    ] as [Pt, Pt][]) {
      const r = cutPiece(brick, half, a, b)!;
      expect(r.accuracy).toBeCloseTo(1);
      expect(ringArea(r.kept)).toBeCloseTo(10000);
      expect(ringArea(r.removed)).toBeCloseTo(10000);
    }
  });

  it('scores sloppy cuts lower, but still produces a piece', () => {
    const r = cutPiece(brick, half, [130, -50], [125, 150])!;
    expect(r.accuracy).toBeLessThan(CLEAN_ACCURACY);
    expect(r.accuracy).toBeGreaterThan(0.7);
    const ok = cutPiece(brick, half, [104, -50], [104, 150])!;
    expect(ok.accuracy).toBeGreaterThan(CLEAN_ACCURACY);
  });

  it('ignores lines that miss the piece', () => {
    expect(cutPiece(brick, half, [300, -50], [300, 150])).toBeNull();
    expect(cutPiece(brick, half, [0.5, -50], [0.5, 150])).toBeNull(); // crumb
  });

  it('ideal cuts follow the target edges that are not brick edges', () => {
    const tri: Ring = [
      [0, 0],
      [200, 0],
      [0, 100],
    ];
    const cuts = idealCuts(slotFor(tri), 100);
    expect(cuts).toHaveLength(1);
    const corner: Ring = [
      [0, 0],
      [150, 0],
      [150, 30],
      [60, 100],
      [0, 100],
    ];
    expect(idealCuts(slotFor(corner), 100)).toHaveLength(2);
  });

  it('simplifies sampled curves into a few chords', () => {
    const arc: Pt[] = Array.from({ length: 20 }, (_, i) => {
      const a = (i / 19) * 0.3;
      return [800 * Math.sin(a), 800 * (1 - Math.cos(a))] as Pt;
    });
    const s = simplify(arc, 3);
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.length).toBeLessThanOrEqual(5);
  });
});
