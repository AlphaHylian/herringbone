/**
 * A simple solver that finishes a job: whole bricks in full slots, ideal straight cuts for edge
 * slots, reusing tray offcuts greedily. Used to prove levels are completable, to set the
 * material target for the rating, and by the end-to-end tests.
 */
import { CutSession, GameState } from './game';
import { idealCuts } from './cut';
import type { Job } from './job';

export type SolverStep =
  | { type: 'full'; slotId: number }
  | { type: 'cut'; slotId: number; cuts: [number, number, number, number][] }
  | { type: 'offcut'; slotId: number; offcutId: number };

export interface SolveResult {
  state: GameState;
  steps: SolverStep[];
  bricks: number;
}

export function solveJob(job: Job, reuse = true): SolveResult {
  const state = new GameState(job);
  const steps: SolverStep[] = [];
  for (const s of job.slots) {
    if (s.kind !== 'full') continue;
    state.placeFull(s.id);
    steps.push({ type: 'full', slotId: s.id });
  }
  // Big edge pieces first: they leave offcuts the small ones can use.
  const edges = job.slots
    .filter((s) => s.kind === 'edge')
    .sort((a, b) => b.targetArea - a.targetArea);
  for (const s of edges) {
    if (reuse) {
      const tray = [...state.tray].sort((a, b) => a.area - b.area);
      const hit = tray.find((o) => state.offcutFit(o.id, s.id));
      if (hit) {
        state.placeOffcut(hit.id, s.id);
        steps.push({ type: 'offcut', slotId: s.id, offcutId: hit.id });
        continue;
      }
    }
    const session = new CutSession(s);
    const cuts: [number, number, number, number][] = [];
    for (const [a, b] of idealCuts(s, job.brickWidth)) {
      if (session.cut(a, b)) cuts.push([a[0], a[1], b[0], b[1]]);
    }
    session.commit(state);
    steps.push({ type: 'cut', slotId: s.id, cuts });
  }
  return { state, steps, bricks: state.bricksUsed };
}

/** Bricks needed by the greedy solver; the 3-brick material target. */
export function solverBricks(job: Job): number {
  return solveJob(job, true).bricks;
}
