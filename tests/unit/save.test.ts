import { describe, expect, it } from 'vitest';
import {
  defaultSave,
  parseSave,
  recordCompletion,
  serializeSave,
  SAVE_VERSION,
} from '../../src/core/save';

describe('save data', () => {
  it('round-trips', () => {
    let s = defaultSave();
    s = recordCompletion(s, 'maple-1', {
      rating: 2,
      bricksUsed: 30,
      offcutsReused: 1,
      completedAt: 5,
      edges: { '3': [0, 0, 1, 0, 1, 1] },
      variants: '01a',
    });
    s.settings.volume = 0.3;
    const back = parseSave(serializeSave(s));
    expect(back).toEqual({ ...s, version: SAVE_VERSION });
  });
  it('falls back to defaults for garbage', () => {
    expect(parseSave(null)).toEqual(defaultSave());
    expect(parseSave('{not json')).toEqual(defaultSave());
    expect(parseSave('42')).toEqual(defaultSave());
  });
  it('migrates a version 0 save and clamps bad values', () => {
    const old = JSON.stringify({
      completed: { a: { rating: 3 }, b: { rating: 7 } },
      settings: { volume: 4, haptics: 'yes' },
    });
    const s = parseSave(old);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.completed.a?.rating).toBe(3);
    expect(s.completed.b).toBeUndefined();
    expect(s.settings.volume).toBe(1);
    expect(s.settings.haptics).toBe(true);
  });
  it('ignores saves from a newer version', () => {
    expect(parseSave(JSON.stringify({ version: 999, tutorialDone: true }))).toEqual(defaultSave());
  });
  it('keeps the best rating on replay', () => {
    let s = defaultSave();
    s = recordCompletion(s, 'x', {
      rating: 3,
      bricksUsed: 1,
      offcutsReused: 0,
      completedAt: 1,
      edges: {},
      variants: '',
    });
    s = recordCompletion(s, 'x', {
      rating: 1,
      bricksUsed: 9,
      offcutsReused: 0,
      completedAt: 2,
      edges: {},
      variants: '',
    });
    expect(s.completed.x?.rating).toBe(3);
  });
});
