import { describe, expect, it } from 'vitest';
import { isUnlocked, nextJob, unlockedPatterns } from '../../src/core/progress';
import { defaultSave, recordCompletion } from '../../src/core/save';
import { FREE_SHAPES, freeLevel } from '../../src/core/freebuild';
import { validateLevel } from '../../src/core/level';
import { buildJob } from '../../src/core/job';
import { solveJob } from '../../src/core/solver';
import { NEIGHBORHOODS, LEVEL_ORDER } from '../../src/levels';
import { PATTERN_TYPES } from '../../src/core/patterns';

const done = (_id: string) => ({
  rating: 2 as const,
  bricksUsed: 1,
  offcutsReused: 0,
  completedAt: 1,
  edges: {},
  variants: '',
});

describe('progress', () => {
  it('opens jobs one after another', () => {
    let s = defaultSave();
    expect(isUnlocked(LEVEL_ORDER, LEVEL_ORDER[0]!, s)).toBe(true);
    expect(isUnlocked(LEVEL_ORDER, LEVEL_ORDER[1]!, s)).toBe(false);
    expect(nextJob(LEVEL_ORDER, s)).toBe(LEVEL_ORDER[0]);
    s = recordCompletion(s, LEVEL_ORDER[0]!, done(LEVEL_ORDER[0]!));
    expect(isUnlocked(LEVEL_ORDER, LEVEL_ORDER[1]!, s)).toBe(true);
    expect(nextJob(LEVEL_ORDER, s)).toBe(LEVEL_ORDER[1]);
  });
  it('unlocks one new pattern per neighborhood', () => {
    let s = defaultSave();
    expect(unlockedPatterns(NEIGHBORHOODS, LEVEL_ORDER, s).sort()).toEqual([
      'herringbone90',
      'stretcher',
    ]);
    for (const id of NEIGHBORHOODS[0]!.levels) s = recordCompletion(s, id, done(id));
    expect(unlockedPatterns(NEIGHBORHOODS, LEVEL_ORDER, s)).toContain('herringbone45');
    expect(unlockedPatterns(NEIGHBORHOODS, LEVEL_ORDER, s)).not.toContain('basketweave');
    for (const id of LEVEL_ORDER) s = recordCompletion(s, id, done(id));
    expect(nextJob(LEVEL_ORDER, s)).toBeNull();
    expect(unlockedPatterns(NEIGHBORHOODS, LEVEL_ORDER, s)).toHaveLength(4);
  });
});

describe('free build', () => {
  for (const shape of FREE_SHAPES) {
    it(`${shape} is valid and finishable with every pattern`, () => {
      for (const p of PATTERN_TYPES) {
        const level = validateLevel(freeLevel(shape, p, ['#aa5533']));
        const job = buildJob(level);
        expect(job.slots.length).toBeGreaterThan(10);
        expect(solveJob(job).state.isComplete()).toBe(true);
      }
    });
  }
});
