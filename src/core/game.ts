/**
 * Game state for one job: placements, offcut tray, brick count, and unlimited undo.
 * Pure logic; the view layer calls these methods and redraws from the state.
 */
import { CLEAN_ACCURACY, accuracyOf, cutPiece, type CutResult } from './cut';
import { clipHalfPlane, convexHull, ringArea, type Pt, type Ring } from './geom';
import type { Job, Slot } from './job';
import {
  OFFCUT_MIN_FRACTION,
  TRAY_CAPACITY,
  fitOffcut,
  makeOffcut,
  type Offcut,
  type OffcutFit,
} from './offcut';
import { scoreJob, type Score } from './scoring';

export type PlacementKind = 'brick' | 'cut' | 'offcut';

export interface Placement {
  slotId: number;
  kind: PlacementKind;
  /** What is drawn: the laid piece in world coordinates, trimmed to the target's hull. */
  polygon: Ring;
  accuracy: number;
  clean: boolean;
  /** Placement order (for animation and colour variety). */
  seq: number;
}

type Action = {
  type: 'place';
  slotId: number;
  usedBrick: boolean;
  addedOffcuts: number[];
  removedOffcuts: Offcut[];
  consumedOffcut?: Offcut;
};

export class GameState {
  readonly placements: (Placement | undefined)[];
  tray: Offcut[] = [];
  bricksUsed = 0;
  offcutsReused = 0;
  private history: Action[] = [];
  private nextOffcutId = 1;
  private seq = 0;
  private filled = 0;

  constructor(
    readonly job: Job,
    /** Bricks the greedy solver needs; set before scoring (see solverBricks()). */
    public solverBricks = job.slots.length,
  ) {
    this.placements = new Array<Placement | undefined>(job.slots.length).fill(undefined);
  }

  get filledCount(): number {
    return this.filled;
  }
  get historyLength(): number {
    return this.history.length;
  }
  isFilled(slotId: number): boolean {
    return this.placements[slotId] !== undefined;
  }
  isComplete(): boolean {
    return this.filled === this.job.slots.length;
  }
  slot(id: number): Slot {
    const s = this.job.slots[id];
    if (!s) throw new Error(`no slot ${id}`);
    return s;
  }

  /** Lay a whole brick in a full slot. */
  placeFull(slotId: number): Placement | null {
    const s = this.slot(slotId);
    if (s.kind !== 'full' || this.isFilled(slotId)) return null;
    const p = this.put(s, 'brick', s.rect, 1);
    this.bricksUsed++;
    this.history.push({
      type: 'place',
      slotId,
      usedBrick: true,
      addedOffcuts: [],
      removedOffcuts: [],
    });
    return p;
  }

  /**
   * Lay a piece cut from a fresh brick. `offcutsFromCuts` are the parts cut away, in world
   * coordinates; big enough ones go to the tray.
   */
  placeCut(slotId: number, piece: Ring, offcutsFromCuts: Ring[]): Placement | null {
    const s = this.slot(slotId);
    if (s.kind !== 'edge' || this.isFilled(slotId)) return null;
    const accuracy = accuracyOf(piece, s.hull);
    const p = this.put(s, 'cut', trimToHull(piece, s.hull), accuracy);
    this.bricksUsed++;
    const added: number[] = [];
    const removed: Offcut[] = [];
    for (const r of offcutsFromCuts) {
      if (r.length < 3 || ringArea(r) < OFFCUT_MIN_FRACTION * this.job.brickArea) continue;
      const o = makeOffcut(this.nextOffcutId++, r);
      this.tray.push(o);
      added.push(o.id);
    }
    while (this.tray.length > TRAY_CAPACITY) {
      // Discard the smallest piece.
      let k = 0;
      for (let i = 1; i < this.tray.length; i++) if (this.tray[i]!.area < this.tray[k]!.area) k = i;
      removed.push(this.tray.splice(k, 1)[0]!);
    }
    this.history.push({
      type: 'place',
      slotId,
      usedBrick: true,
      addedOffcuts: added,
      removedOffcuts: removed,
    });
    return p;
  }

  /** Put back a piece from a saved game (no history, no brick count). */
  restore(slotId: number, polygon: Ring, accuracy: number, kind: PlacementKind): Placement {
    return this.put(this.slot(slotId), kind, polygon, accuracy);
  }

  /** Check whether a tray piece fits an edge slot. */
  offcutFit(offcutId: number, slotId: number): OffcutFit | null {
    const s = this.slot(slotId);
    const o = this.tray.find((x) => x.id === offcutId);
    if (!o || s.kind !== 'edge' || this.isFilled(slotId)) return null;
    return fitOffcut(o, s.hull, offcutTolerance(this.job));
  }

  /** Lay a tray piece in an edge slot. Returns null if it doesn't fit. */
  placeOffcut(offcutId: number, slotId: number): { placement: Placement; fit: OffcutFit } | null {
    const fit = this.offcutFit(offcutId, slotId);
    if (!fit) return null;
    const s = this.slot(slotId);
    const idx = this.tray.findIndex((x) => x.id === offcutId);
    const consumed = this.tray.splice(idx, 1)[0]!;
    const accuracy = accuracyOf(fit.laid, s.hull);
    const placement = this.put(s, 'offcut', fit.laid, accuracy);
    this.offcutsReused++;
    this.history.push({
      type: 'place',
      slotId,
      usedBrick: false,
      addedOffcuts: [],
      removedOffcuts: [],
      consumedOffcut: consumed,
    });
    return { placement, fit };
  }

  /** Undo the most recent placement. Returns the slot that was cleared, or null. */
  undo(): number | null {
    const a = this.history.pop();
    if (!a) return null;
    this.placements[a.slotId] = undefined;
    this.filled--;
    if (a.usedBrick) this.bricksUsed--;
    this.tray = this.tray.filter((o) => !a.addedOffcuts.includes(o.id));
    // Pieces discarded to make room come back, unless this same action created them.
    this.tray.push(...a.removedOffcuts.filter((o) => !a.addedOffcuts.includes(o.id)));
    if (a.consumedOffcut) {
      this.tray.push(a.consumedOffcut);
      this.offcutsReused--;
    }
    this.tray.sort((x, y) => x.id - y.id);
    return a.slotId;
  }

  edgeAccuracies(): number[] {
    const out: number[] = [];
    for (const p of this.placements) if (p && p.kind !== 'brick') out.push(p.accuracy);
    return out;
  }

  score(): Score {
    return scoreJob({
      slotCount: this.job.slots.length,
      solverBricks: this.solverBricks,
      bricksUsed: this.bricksUsed,
      edgeAccuracies: this.edgeAccuracies(),
      offcutsReused: this.offcutsReused,
    });
  }

  /** Next empty slot of a kind, nearest to a point (for hints and tap-to-fill fallbacks). */
  nearestEmpty(p: Pt, kind?: 'full' | 'edge'): Slot | null {
    let best: Slot | null = null;
    let bd = Infinity;
    for (const s of this.job.slots) {
      if (this.isFilled(s.id) || (kind && s.kind !== kind)) continue;
      const d = (s.centroid[0] - p[0]) ** 2 + (s.centroid[1] - p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private put(s: Slot, kind: PlacementKind, polygon: Ring, accuracy: number): Placement {
    const p: Placement = {
      slotId: s.id,
      kind,
      polygon,
      accuracy,
      clean: accuracy >= CLEAN_ACCURACY,
      seq: this.seq++,
    };
    this.placements[s.id] = p;
    this.filled++;
    return p;
  }
}

/** How far (mm) a target corner may poke out of an offcut and still count as covered. */
export function offcutTolerance(job: Job): number {
  return job.brickWidth * 0.04;
}

/** The laid shape: the piece trimmed to the target's hull (anything beyond is knocked off). */
export function trimToHull(piece: Ring, hull: Ring): Ring {
  let r = piece;
  for (let i = 0; i < hull.length; i++)
    r = clipHalfPlane(r, hull[i]!, hull[(i + 1) % hull.length]!);
  return r.length >= 3 ? convexHull(r) : piece;
}

/** A splitter session: one brick, cut one or more times, then laid. Supports undoing cuts. */
export class CutSession {
  piece: Ring;
  readonly removed: Ring[] = [];
  private stack: Ring[] = [];

  constructor(readonly slot: Slot) {
    this.piece = slot.rect;
  }

  get cuts(): number {
    return this.stack.length;
  }
  get accuracy(): number {
    return accuracyOf(this.piece, this.slot.hull);
  }
  get clean(): boolean {
    return this.accuracy >= CLEAN_ACCURACY;
  }

  cut(a: Pt, b: Pt): CutResult | null {
    const r = cutPiece(this.piece, this.slot.hull, a, b);
    if (!r) return null;
    this.stack.push(this.piece);
    this.piece = r.kept;
    this.removed.push(r.removed);
    return r;
  }

  undoCut(): boolean {
    const prev = this.stack.pop();
    if (!prev) return false;
    this.piece = prev;
    this.removed.pop();
    return true;
  }

  commit(state: GameState): Placement | null {
    return state.placeCut(this.slot.id, this.piece, this.removed);
  }
}
