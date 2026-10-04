/** Unlock rules: jobs open one after another; each neighborhood brings a new pattern. */
import type { PatternType } from './patterns';
import type { SaveData } from './save';

export interface NeighborhoodInfo {
  id: string;
  pattern: PatternType;
  levels: string[];
}

export const STARTING_PATTERNS: PatternType[] = ['stretcher', 'herringbone90'];

export function isUnlocked(order: string[], id: string, save: SaveData): boolean {
  const i = order.indexOf(id);
  if (i < 0) return false;
  return i === 0 || save.completed[order[i - 1]!] !== undefined || save.completed[id] !== undefined;
}

export function neighborhoodUnlocked(
  n: NeighborhoodInfo,
  order: string[],
  save: SaveData,
): boolean {
  return n.levels.length > 0 && isUnlocked(order, n.levels[0]!, save);
}

export function unlockedPatterns(
  hoods: NeighborhoodInfo[],
  order: string[],
  save: SaveData,
): PatternType[] {
  const out = new Set<PatternType>(STARTING_PATTERNS);
  for (const n of hoods) if (neighborhoodUnlocked(n, order, save)) out.add(n.pattern);
  return [...out];
}

/** The first unlocked job that isn't finished yet (or null when everything is done). */
export function nextJob(order: string[], save: SaveData): string | null {
  for (const id of order) if (!save.completed[id] && isUnlocked(order, id, save)) return id;
  return null;
}

export function totalBricks(save: SaveData): number {
  return Object.values(save.completed).reduce((a, r) => a + r.rating, 0);
}
