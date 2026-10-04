/** Versioned save data. Parsing never throws: bad or old data falls back to defaults. */

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'save';

export interface Settings {
  /** 0..1 */
  volume: number;
  muted: boolean;
  haptics: boolean;
  reduceMotion: boolean;
}

export interface JobRecord {
  rating: 1 | 2 | 3;
  bricksUsed: number;
  offcutsReused: number;
  completedAt: number;
  /** Laid edge pieces, slotId -> flat [x0,y0,x1,y1,...] rounded to 0.1 mm. */
  edges: Record<string, number[]>;
}

export interface SaveData {
  version: number;
  completed: Record<string, JobRecord>;
  settings: Settings;
  tutorialDone: boolean;
}

export function defaultSettings(): Settings {
  return { volume: 0.8, muted: false, haptics: true, reduceMotion: false };
}

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, completed: {}, settings: defaultSettings(), tutorialDone: false };
}

function num(v: unknown, d: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
}
function bool(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d;
}

export function parseSave(text: string | null): SaveData {
  if (!text) return defaultSave();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaultSave();
  }
  return migrate(raw);
}

/** Bring any older save up to the current version. */
export function migrate(raw: unknown): SaveData {
  const out = defaultSave();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  const version = typeof r.version === 'number' ? r.version : 0;
  if (version > SAVE_VERSION) return out; // from a newer build; don't guess
  const s = (typeof r.settings === 'object' && r.settings) || {};
  const st = s as Record<string, unknown>;
  out.settings = {
    volume: num(st.volume, out.settings.volume, 0, 1),
    muted: bool(st.muted, out.settings.muted),
    haptics: bool(st.haptics, out.settings.haptics),
    reduceMotion: bool(st.reduceMotion, out.settings.reduceMotion),
  };
  out.tutorialDone = bool(r.tutorialDone, false);
  const completed = (typeof r.completed === 'object' && r.completed) || {};
  for (const [id, rec] of Object.entries(completed as Record<string, unknown>)) {
    if (typeof rec !== 'object' || rec === null) continue;
    const c = rec as Record<string, unknown>;
    const rating = c.rating === 1 || c.rating === 2 || c.rating === 3 ? c.rating : null;
    if (!rating) continue;
    const edges: Record<string, number[]> = {};
    if (version >= 1 && typeof c.edges === 'object' && c.edges) {
      for (const [k, v] of Object.entries(c.edges as Record<string, unknown>)) {
        if (Array.isArray(v) && v.every((x) => typeof x === 'number')) edges[k] = v as number[];
      }
    }
    out.completed[id] = {
      rating,
      bricksUsed: num(c.bricksUsed, 0, 0, 1e6),
      offcutsReused: num(c.offcutsReused, 0, 0, 1e6),
      completedAt: num(c.completedAt, 0, 0, Number.MAX_SAFE_INTEGER),
      edges,
    };
  }
  return out;
}

export function serializeSave(s: SaveData): string {
  return JSON.stringify({ ...s, version: SAVE_VERSION });
}

/** Keep the best rating when a job is replayed. */
export function recordCompletion(save: SaveData, id: string, rec: JobRecord): SaveData {
  const prev = save.completed[id];
  const keep = !prev || rec.rating >= prev.rating ? rec : prev;
  return { ...save, completed: { ...save.completed, [id]: keep } };
}
