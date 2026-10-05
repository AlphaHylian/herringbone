/**
 * Saving the endless site: the path's seed plus one bit per brick slot for every chunk that has
 * been touched, how many blocks have come off each pack, and where you were standing.
 */
import type { Settings } from './hud';
import type { SiteState } from './world';

const KEY = 'herringbone3d.save.v1';
const SETTINGS_KEY = 'herringbone3d.settings.v1';

export interface PlayerSave {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  stand: boolean;
  whole: number;
}

export interface SplitterSave {
  x: number;
  z: number;
  yaw: number;
}

interface SaveFile {
  v: 1;
  seed: number;
  laid: number;
  area: number;
  placed: Record<string, string>;
  packs: Record<string, number>;
  player: PlayerSave | null;
  splitter: SplitterSave | null;
}

function bitsToB64(bits: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[i >> 3]! |= 1 << (i & 7);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return `${bits.length}:${btoa(s)}`;
}

function b64ToBits(v: string): Uint8Array | null {
  const [n, data] = v.split(':');
  const len = Number(n);
  if (!Number.isFinite(len) || !data) return null;
  const s = atob(data);
  const bits = new Uint8Array(len);
  for (let i = 0; i < len; i++) bits[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return bits;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSite(): {
  state: SiteState;
  player: PlayerSave | null;
  splitter: SplitterSave | null;
} | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const f = JSON.parse(raw) as SaveFile;
    if (f.v !== 1 || typeof f.seed !== 'number') return null;
    const placed = new Map<number, Uint8Array>();
    for (const [k, v] of Object.entries(f.placed ?? {})) {
      const bits = b64ToBits(v);
      if (bits) placed.set(Number(k), bits);
    }
    const packTaken = new Map<number, number>();
    for (const [k, v] of Object.entries(f.packs ?? {})) packTaken.set(Number(k), v);
    return {
      state: { seed: f.seed, placed, packTaken, laid: f.laid ?? 0, area: f.area ?? 0 },
      player: f.player ?? null,
      splitter: f.splitter ?? null,
    };
  } catch {
    return null;
  }
}

export function saveSite(state: SiteState, player: PlayerSave, splitter: SplitterSave): void {
  const placed: Record<string, string> = {};
  for (const [k, bits] of state.placed) if (bits.some((b) => b)) placed[k] = bitsToB64(bits);
  const packs: Record<string, number> = {};
  for (const [k, n] of state.packTaken) if (n > 0) packs[k] = n;
  const f: SaveFile = {
    v: 1,
    seed: state.seed,
    laid: state.laid,
    area: state.area,
    placed,
    packs,
    player,
    splitter,
  };
  try {
    storage()?.setItem(KEY, JSON.stringify(f));
  } catch {
    // Storage full or unavailable: the game still plays, it just won't remember.
  }
}

export function clearSite(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function loadSettings(): Settings {
  const defaults: Settings = { volume: 0.8, muted: false, sensitivity: 1, quality: 'auto' };
  try {
    const raw = storage()?.getItem(SETTINGS_KEY);
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // ignore
  }
  return defaults;
}

export function saveSettings(s: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}
