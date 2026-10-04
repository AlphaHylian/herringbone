import { describe, expect, it } from 'vitest';
import { fitOffcut, makeOffcut } from '../../src/core/offcut';
import { ringArea, transformRing, type Ring } from '../../src/core/geom';

const tri: Ring = [
  [0, 0],
  [200, 0],
  [0, 100],
];

describe('offcut fit', () => {
  it('turns a piece to cover a target', () => {
    // A right triangle offcut, moved and rotated arbitrarily
    const piece = makeOffcut(1, transformRing(tri, 2.1, [500, 300]));
    const target = transformRing(tri, -0.7, [40, 900]);
    const fit = fitOffcut(piece, target, 4)!;
    expect(fit).not.toBeNull();
    expect(ringArea(fit.laid)).toBeGreaterThan(0.95 * ringArea(target));
  });

  it('flips a piece over when needed', () => {
    const piece = makeOffcut(1, tri);
    const mirrored: Ring = [
      [0, 0],
      [0, 100],
      [-200, 0],
    ];
    const fit = fitOffcut(piece, mirrored, 4);
    expect(fit).not.toBeNull();
  });

  it('a bigger piece covers a smaller target and is trimmed', () => {
    const piece = makeOffcut(1, [
      [0, 0],
      [120, 0],
      [120, 100],
      [0, 100],
    ]);
    const target: Ring = [
      [0, 0],
      [100, 0],
      [0, 90],
    ];
    const fit = fitOffcut(piece, target, 4)!;
    expect(fit).not.toBeNull();
    expect(ringArea(fit.laid)).toBeCloseTo(ringArea(target), -1);
  });

  it('rejects pieces that are too small or the wrong shape', () => {
    const small = makeOffcut(1, [
      [0, 0],
      [90, 0],
      [90, 90],
      [0, 90],
    ]);
    expect(
      fitOffcut(
        small,
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        4,
      ),
    ).toBeNull();
    // Same area, wrong shape: a long thin strip can't cover a square
    const strip = makeOffcut(2, [
      [0, 0],
      [200, 0],
      [200, 50],
      [0, 50],
    ]);
    expect(
      fitOffcut(
        strip,
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        4,
      ),
    ).toBeNull();
  });
});
