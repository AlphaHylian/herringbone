import { describe, expect, it } from 'vitest';
import { buildJob, SLIVER_FRACTION, decomposeTarget } from '../../src/core/job';
import { validateLevel, type LevelData } from '../../src/core/level';
import { ringArea, shapeArea, intersect, union, isConvex, type Pt } from '../../src/core/geom';

function level(over: Partial<LevelData> & Pick<LevelData, 'border' | 'pattern'>): LevelData {
  return validateLevel({
    id: 'test',
    name: 'Test',
    neighborhood: 'maple',
    clientNote: 'note',
    brick: { length: 200, width: 100 },
    colors: ['#aa5533'],
    decorations: [],
    ...over,
  });
}

function circle(cx: number, cy: number, r: number, n = 64): Pt[] {
  return Array.from(
    { length: n },
    (_, i) =>
      [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)] as Pt,
  );
}

describe('buildJob', () => {
  it('a rectangle aligned to stretcher bond gives full bricks and half-brick edges', () => {
    const job = buildJob(
      level({
        border: {
          outer: [
            [0, 0],
            [400, 0],
            [400, 200],
            [0, 200],
          ],
        },
        pattern: { type: 'stretcher' },
      }),
    );
    // row 0: two full bricks; row 1: one full + two halves
    expect(job.fullCount).toBe(3);
    expect(job.edgeCount).toBe(2);
    for (const s of job.slots.filter((x) => x.kind === 'edge'))
      expect(s.targetArea).toBeCloseTo(10000);
  });

  it('slots exactly cover the border minus discarded slivers, without overlap', () => {
    for (const type of ['stretcher', 'herringbone90', 'herringbone45', 'basketweave'] as const) {
      const outer: Pt[] = [
        [0, 0],
        [900, 0],
        [900, 700],
        [300, 1100],
        [0, 1100],
      ];
      const job = buildJob(level({ border: { outer }, pattern: { type, offset: [17, 33] } }));
      const sum = job.slots.reduce((a, s) => a + s.targetArea, 0);
      const covered = shapeArea(union(job.slots.map((s) => [s.target])));
      expect(covered).toBeCloseTo(sum, 0); // no overlaps
      const total = ringArea(outer);
      expect(sum).toBeLessThanOrEqual(total + 1e-6);
      // Slivers are small, so coverage stays high.
      expect(sum / total).toBeGreaterThan(0.97);
      for (const s of job.slots) {
        // every target sits inside its brick and inside the border
        expect(shapeArea(intersect([s.target], [s.rect]))).toBeCloseTo(s.targetArea, 0);
        expect(shapeArea(intersect([s.target], [outer]))).toBeCloseTo(s.targetArea, 0);
      }
    }
  });

  it('discards slivers smaller than 8% of a brick', () => {
    // Border edge 5 mm into a row of bricks: those 5 mm strips (5%) are dropped.
    const job = buildJob(
      level({
        border: {
          outer: [
            [0, 0],
            [400, 0],
            [400, 105],
            [0, 105],
          ],
        },
        pattern: { type: 'stretcher', offset: [0, 0] },
      }),
    );
    const brickArea = 200 * 100;
    for (const s of job.slots)
      expect(s.targetArea).toBeGreaterThanOrEqual(SLIVER_FRACTION * brickArea);
    expect(job.slots.every((s) => s.target.every((p) => p[1] <= 100 + 1e-6))).toBe(true);
    // 9 mm strip (9%) is kept as edge pieces.
    const job2 = buildJob(
      level({
        border: {
          outer: [
            [0, 0],
            [400, 0],
            [400, 109],
            [0, 109],
          ],
        },
        pattern: { type: 'stretcher' },
      }),
    );
    expect(job2.edgeCount).toBeGreaterThan(0);
  });

  it('handles curved borders and curved holes', () => {
    const job = buildJob(
      level({
        border: { outer: circle(600, 600, 600), holes: [circle(600, 600, 220)] },
        pattern: { type: 'herringbone90', offset: [10, 20] },
      }),
    );
    expect(job.fullCount).toBeGreaterThan(20);
    expect(job.edgeCount).toBeGreaterThan(20);
    const area = Math.PI * (600 ** 2 - 220 ** 2);
    const sum = job.slots.reduce((a, s) => a + s.targetArea, 0);
    expect(sum / area).toBeGreaterThan(0.96);
    for (const s of job.slots) {
      // nothing over the hole
      expect(shapeArea(intersect([s.target], [circle(600, 600, 219)]))).toBeLessThan(1);
      // straight cuts can always make the hull, which is convex
      expect(isConvex(s.hull)).toBe(true);
      // the gap between a straight cut and the curve stays small
      expect(ringArea(s.hull) - s.targetArea).toBeLessThan(0.07 * 20000);
    }
  });

  it('splits targets at sharp inside corners', () => {
    // L-shaped target inside one brick
    const parts = decomposeTarget(
      [
        [0, 0],
        [200, 0],
        [200, 50],
        [100, 50],
        [100, 100],
        [0, 100],
      ],
      20000,
    );
    expect(parts).toHaveLength(2);
    expect(parts.reduce((a, p) => a + ringArea(p), 0)).toBeCloseTo(15000);
    for (const p of parts) expect(isConvex(p)).toBe(true);
  });

  it('L-shaped patio inside corner yields convex edge parts', () => {
    const job = buildJob(
      level({
        border: {
          outer: [
            [0, 0],
            [1000, 0],
            [1000, 600],
            [500, 600],
            [500, 1200],
            [0, 1200],
          ],
        },
        pattern: { type: 'herringbone90', offset: [37, 61] },
      }),
    );
    for (const s of job.slots) expect(ringArea(s.hull) - s.targetArea).toBeLessThan(0.02 * 20000);
  });
});
