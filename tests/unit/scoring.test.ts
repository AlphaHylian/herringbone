import { describe, expect, it } from 'vitest';
import { scoreJob } from '../../src/core/scoring';

describe('scoreJob', () => {
  const base = { slotCount: 50, solverBricks: 40, offcutsReused: 0 };
  it('always gives at least one brick', () => {
    expect(scoreJob({ ...base, bricksUsed: 50, edgeAccuracies: [0.2, 0.3] }).rating).toBe(1);
  });
  it('clean cuts earn two bricks', () => {
    expect(scoreJob({ ...base, bricksUsed: 50, edgeAccuracies: [0.95, 0.97, 0.99] }).rating).toBe(
      2,
    );
  });
  it('clean cuts plus offcut reuse earn three', () => {
    const s = scoreJob({
      ...base,
      bricksUsed: 44,
      offcutsReused: 6,
      edgeAccuracies: [0.95, 0.97, 0.99],
    });
    expect(s.material).toBeCloseTo(0.6);
    expect(s.rating).toBe(3);
  });
  it('treats beating the solver as perfect material use', () => {
    expect(scoreJob({ ...base, bricksUsed: 38, edgeAccuracies: [1] }).material).toBe(1);
  });
  it('handles jobs with no edges', () => {
    expect(
      scoreJob({
        slotCount: 4,
        solverBricks: 4,
        bricksUsed: 4,
        offcutsReused: 0,
        edgeAccuracies: [],
      }).rating,
    ).toBe(3);
  });
});
