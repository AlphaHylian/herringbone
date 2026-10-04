import { describe, expect, it } from 'vitest';
import { LevelValidationError, validateLevel } from '../../src/core/level';

const good = {
  id: 'ok',
  name: 'OK',
  neighborhood: 'maple',
  clientNote: 'hi',
  border: {
    outer: [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ],
  },
  pattern: { type: 'herringbone90' },
  brick: { length: 200, width: 100 },
  colors: ['#aa5533'],
  decorations: [{ type: 'cat', at: [1, 2] }],
};

describe('validateLevel', () => {
  it('accepts a good level', () => {
    expect(validateLevel(good).id).toBe('ok');
  });
  const bad: [string, unknown][] = [
    ['not an object', 5],
    ['missing name', { ...good, name: '' }],
    [
      'too few points',
      {
        ...good,
        border: {
          outer: [
            [0, 0],
            [1, 1],
          ],
        },
      },
    ],
    [
      'bad point',
      {
        ...good,
        border: {
          outer: [
            [0, 0],
            [1, 'x'],
            [1, 1],
          ],
        },
      },
    ],
    [
      'self-intersecting',
      {
        ...good,
        border: {
          outer: [
            [0, 0],
            [100, 100],
            [100, 0],
            [0, 100],
          ],
        },
      },
    ],
    [
      'hole outside',
      {
        ...good,
        border: {
          outer: good.border.outer,
          holes: [
            [
              [200, 200],
              [300, 200],
              [300, 300],
            ],
          ],
        },
      },
    ],
    ['unknown pattern', { ...good, pattern: { type: 'zigzag' } }],
    ['herringbone with wrong proportions', { ...good, brick: { length: 210, width: 100 } }],
    ['bad colour', { ...good, colors: ['red'] }],
    ['unknown decoration', { ...good, decorations: [{ type: 'dragon', at: [0, 0] }] }],
  ];
  for (const [name, raw] of bad) {
    it(`rejects: ${name}`, () => {
      expect(() => validateLevel(raw)).toThrow(LevelValidationError);
    });
  }
});
