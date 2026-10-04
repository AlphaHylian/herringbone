/** The gentle 1-3 brick rating. A finished job always earns at least one brick. */
import { CLEAN_ACCURACY } from './cut';

export interface ScoreInput {
  /** Number of slots (one new brick each, with no offcut reuse). */
  slotCount: number;
  /** Bricks the solver needs when it reuses offcuts greedily. */
  solverBricks: number;
  /** Bricks the player took from the pallet. */
  bricksUsed: number;
  /** Fit accuracy (0..1) of every edge piece laid. */
  edgeAccuracies: number[];
  offcutsReused: number;
}

export interface Score {
  rating: 1 | 2 | 3;
  /** 0..1, 1 = as frugal as the solver (or better). */
  material: number;
  /** Share of edge pieces that fit cleanly. */
  cleanShare: number;
  /** Mean edge accuracy, 0..1. */
  meanAccuracy: number;
  bricksUsed: number;
  offcutsReused: number;
}

export function scoreJob(s: ScoreInput): Score {
  const spare = s.slotCount - s.solverBricks;
  const material = spare <= 0 ? 1 : Math.max(0, Math.min(1, (s.slotCount - s.bricksUsed) / spare));
  const n = s.edgeAccuracies.length;
  const cleanShare = n === 0 ? 1 : s.edgeAccuracies.filter((a) => a >= CLEAN_ACCURACY).length / n;
  const meanAccuracy = n === 0 ? 1 : s.edgeAccuracies.reduce((x, y) => x + y, 0) / n;
  let rating: 1 | 2 | 3 = 1;
  if (cleanShare >= 0.6 || (material >= 0.5 && cleanShare >= 0.4)) rating = 2;
  if (cleanShare >= 0.85 && material >= 0.5) rating = 3;
  return {
    rating,
    material,
    cleanShare,
    meanAccuracy,
    bricksUsed: s.bricksUsed,
    offcutsReused: s.offcutsReused,
  };
}
