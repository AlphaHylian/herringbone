import { describe, expect, it } from 'vitest';
import { allLevels, NEIGHBORHOODS } from '../../src/levels';
import { buildJob, SLIVER_FRACTION } from '../../src/core/job';
import { solveJob } from '../../src/core/solver';
import { CLEAN_ACCURACY } from '../../src/core/cut';
import { ringArea, shapeArea, union, difference } from '../../src/core/geom';

describe('handcrafted levels', () => {
  it('has at least 12 jobs in 3 neighborhoods', () => {
    expect(allLevels().length).toBeGreaterThanOrEqual(12);
    expect(NEIGHBORHOODS).toHaveLength(3);
    const patterns = new Set(allLevels().map((l) => l.pattern.type));
    expect(patterns).toEqual(
      new Set(['stretcher', 'herringbone90', 'herringbone45', 'basketweave']),
    );
  });

  for (const level of allLevels()) {
    describe(level.id, () => {
      const job = buildJob(level);
      it('has a sensible number of slots', () => {
        expect(job.slots.length).toBeGreaterThan(20);
        expect(job.slots.length).toBeLessThan(130);
        expect(job.edgeCount).toBeGreaterThan(0);
      });
      it('has no slivers and no overlapping slots', () => {
        for (const s of job.slots)
          expect(s.targetArea).toBeGreaterThanOrEqual(SLIVER_FRACTION * job.brickArea - 1e-6);
        const sum = job.slots.reduce((a, s) => a + s.targetArea, 0);
        expect(shapeArea(union(job.slots.map((s) => [s.target])))).toBeCloseTo(sum, -1);
        const borderArea = shapeArea(
          difference([level.border.outer], ...(level.border.holes ?? []).map((h) => [h])),
        );
        expect(sum / borderArea).toBeGreaterThan(0.96);
      });
      it('is completable by the solver with clean cuts', () => {
        const { state } = solveJob(job);
        expect(state.isComplete()).toBe(true);
        for (const a of state.edgeAccuracies()) expect(a).toBeGreaterThanOrEqual(CLEAN_ACCURACY);
        expect(state.score().rating).toBe(3);
      });
      it('every hull is reachable with straight cuts', () => {
        for (const s of job.slots)
          expect(ringArea(s.hull)).toBeGreaterThanOrEqual(s.targetArea - 1e-6);
      });
    });
  }
});
