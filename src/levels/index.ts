/** Level registry: loads every JSON level in this folder and validates it. */
import { validateLevel, type LevelData } from '../core/level';
import type { PatternType } from '../core/patterns';
import indexJson from './index.json';

export interface Neighborhood {
  id: string;
  name: string;
  /** Pattern unlocked in this neighborhood. */
  pattern: PatternType;
  levels: string[];
}

const files = import.meta.glob<{ default: unknown }>('./*.json', { eager: true });

const byId = new Map<string, LevelData>();
for (const [path, mod] of Object.entries(files)) {
  if (path.endsWith('index.json')) continue;
  const level = validateLevel(mod.default);
  byId.set(level.id, level);
}

export const NEIGHBORHOODS: Neighborhood[] = (indexJson.neighborhoods as Neighborhood[]).map(
  (n) => {
    for (const id of n.levels)
      if (!byId.has(id)) throw new Error(`index.json lists unknown level ${id}`);
    return n;
  },
);

export const LEVEL_ORDER: string[] = NEIGHBORHOODS.flatMap((n) => n.levels);

export function getLevel(id: string): LevelData {
  const l = byId.get(id);
  if (!l) throw new Error(`unknown level ${id}`);
  return l;
}

export function allLevels(): LevelData[] {
  return LEVEL_ORDER.map(getLevel);
}
