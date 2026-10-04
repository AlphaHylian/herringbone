import { describe, expect, it } from 'vitest';
import { CutSession, GameState } from '../../src/core/game';
import { buildJob } from '../../src/core/job';
import { validateLevel } from '../../src/core/level';
import { TRAY_CAPACITY } from '../../src/core/offcut';

const job = buildJob(
  validateLevel({
    id: 't',
    name: 'T',
    neighborhood: 'maple',
    clientNote: 'n',
    brick: { length: 200, width: 100 },
    colors: ['#aa5533'],
    decorations: [],
    border: {
      outer: [
        [0, 0],
        [600, 0],
        [600, 400],
        [0, 400],
      ],
    },
    pattern: { type: 'stretcher' },
  }),
);

describe('GameState', () => {
  it('places full bricks, refuses doubles, and undoes', () => {
    const g = new GameState(job);
    const full = job.slots.find((s) => s.kind === 'full')!;
    expect(g.placeFull(full.id)).not.toBeNull();
    expect(g.placeFull(full.id)).toBeNull();
    expect(g.bricksUsed).toBe(1);
    expect(g.undo()).toBe(full.id);
    expect(g.bricksUsed).toBe(0);
    expect(g.isFilled(full.id)).toBe(false);
    expect(g.undo()).toBeNull();
  });

  it('does not lay a whole brick in an edge slot', () => {
    const g = new GameState(job);
    const edge = job.slots.find((s) => s.kind === 'edge')!;
    expect(g.placeFull(edge.id)).toBeNull();
  });

  it('cuts a half brick, keeps the other half as an offcut, and reuses it', () => {
    const g = new GameState(job);
    const edges = job.slots.filter((s) => s.kind === 'edge');
    expect(edges.length).toBeGreaterThanOrEqual(2);
    const a = edges[0]!;
    // The cut runs along the border: x = 0 or x = 600.
    const cutX = Math.min(...a.target.map((p) => p[0])) < 1 ? 0 : 600;
    const session = new CutSession(a);
    expect(session.cut([cutX, -100], [cutX, 1000])).not.toBeNull();
    expect(session.clean).toBe(true);
    session.commit(g);
    expect(g.tray).toHaveLength(1);
    expect(g.bricksUsed).toBe(1);
    const b = edges[1]!;
    const placed = g.placeOffcut(g.tray[0]!.id, b.id);
    expect(placed).not.toBeNull();
    expect(placed!.placement.clean).toBe(true);
    expect(g.tray).toHaveLength(0);
    expect(g.bricksUsed).toBe(1);
    expect(g.offcutsReused).toBe(1);
    // Undo restores the offcut, then undo again removes it
    g.undo();
    expect(g.tray).toHaveLength(1);
    expect(g.offcutsReused).toBe(0);
    g.undo();
    expect(g.tray).toHaveLength(0);
    expect(g.bricksUsed).toBe(0);
  });

  it('a cut session can undo a cut and make a second cut', () => {
    const edge = job.slots.find(
      (s) => s.kind === 'edge' && Math.min(...s.rect.map((p) => p[0])) < 0,
    )!;
    const x0 = Math.min(...edge.rect.map((p) => p[0]));
    const s = new CutSession(edge);
    expect(s.cut([x0 + 50, -100], [x0 + 50, 1000])).not.toBeNull();
    expect(s.cut([x0 + 80, -100], [x0 + 80, 1000])).not.toBeNull();
    expect(s.cuts).toBe(2);
    expect(s.undoCut()).toBe(true);
    expect(s.cuts).toBe(1);
    expect(s.removed).toHaveLength(1);
  });

  it('keeps the tray within capacity', () => {
    const g = new GameState(job);
    const edge = job.slots.find((s) => s.kind === 'edge')!;
    const big = Array.from({ length: TRAY_CAPACITY + 3 }, (_, i) => [
      [0, 0],
      [100 + i, 0],
      [100 + i, 100],
      [0, 100],
    ]) as [number, number][][];
    g.placeCut(edge.id, edge.target, big);
    expect(g.tray).toHaveLength(TRAY_CAPACITY);
    // the smallest were discarded
    expect(Math.min(...g.tray.map((o) => o.area))).toBeCloseTo(103 * 100);
    g.undo();
    expect(g.tray).toHaveLength(0);
  });

  it('detects completion', () => {
    const g = new GameState(job);
    for (const s of job.slots) {
      if (s.kind === 'full') g.placeFull(s.id);
      else g.placeCut(s.id, s.target, []);
    }
    expect(g.isComplete()).toBe(true);
    expect(g.score().rating).toBeGreaterThanOrEqual(1);
  });
});
