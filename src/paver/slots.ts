/**
 * The herringbone pattern laid along the endless path, generated chunk by chunk. Pure maths.
 *
 * The pattern is one global 45-degree herringbone, as a real crew would set it out, so as the
 * path bends the edges cross the pattern at ever-changing angles. Every brick (slot) belongs to
 * the chunk whose stretch of path its centre is nearest to, so neighbouring chunks never both
 * claim it. Slots fully inside the edges take a whole block; slots crossing an edge need a cut
 * piece; tiny slivers are left for the jointing sand, as on a real job.
 */
import {
  dedupeRing,
  ensureCCW,
  intersect,
  pointInRing,
  ringArea,
  rectRing,
  transformRing,
  type Pt,
  type Ring,
} from '../core/geom';
import { tilingFor } from '../core/patterns';
import { START_HEADING, type PathModel } from './path';

export const BRICK_L = 0.2;
export const BRICK_W = 0.1;
export const BRICK_T = 0.08;
export const CHUNK = 4;

const FULL_FRACTION = 0.995;
const SLIVER_FRACTION = 0.04;
const CELL = 0.25;
const PATTERN_ANGLE = START_HEADING + Math.PI / 4;
const PATTERN_ORIGIN: Pt = [0.037, 0.021];

export type SlotKind = 'full' | 'edge';

export interface Slot {
  /** Index within its chunk. */
  i: number;
  kind: SlotKind;
  /** Centre and rotation of the whole brick this slot is cut from. */
  x: number;
  z: number;
  angle: number;
  /** The whole brick's outline (world x/z). */
  rect: Ring;
  /** The part that's actually paved: equal to rect for full slots. */
  piece: Ring;
  /** Arc length of the nearest point on the centreline. */
  s: number;
}

export interface Chunk {
  k: number;
  s0: number;
  s1: number;
  slots: Slot[];
  fullCount: number;
  edgeCount: number;
  grid: Map<string, number[]>;
}

const key = (ix: number, iz: number): string => `${ix},${iz}`;

export function buildChunk(path: PathModel, k: number): Chunk {
  const s0 = k * CHUNK;
  const s1 = s0 + CHUNK;
  const tiling = tilingFor('herringbone90', BRICK_L, BRICK_W);
  const theta = tiling.baseAngle + PATTERN_ANGLE;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const toWorld = (p: Pt): Pt => [
    p[0] * cos - p[1] * sin + PATTERN_ORIGIN[0],
    p[0] * sin + p[1] * cos + PATTERN_ORIGIN[1],
  ];
  const toPattern = (p: Pt): Pt => {
    const x = p[0] - PATTERN_ORIGIN[0];
    const y = p[1] - PATTERN_ORIGIN[1];
    return [x * cos + y * sin, -x * sin + y * cos];
  };

  // Lattice range covering this stretch of path.
  const region = path.strip(s0 - 0.4, s1 + 0.4, 0.5);
  if (k === 0) region.push(path.offset(-0.4, 0));
  const { a, b } = tiling;
  const det = a[0] * b[1] - a[1] * b[0];
  let iMin = Infinity;
  let iMax = -Infinity;
  let jMin = Infinity;
  let jMax = -Infinity;
  for (const c of region) {
    const p = toPattern(c);
    const i = (p[0] * b[1] - p[1] * b[0]) / det;
    const j = (a[0] * p[1] - a[1] * p[0]) / det;
    iMin = Math.min(iMin, i);
    iMax = Math.max(iMax, i);
    jMin = Math.min(jMin, j);
    jMax = Math.max(jMax, j);
  }

  const brick = rectRing(BRICK_L, BRICK_W);
  const brickArea = BRICK_L * BRICK_W;
  const halfDiag = Math.hypot(BRICK_L, BRICK_W) / 2;
  const slots: Slot[] = [];
  const margin = 2;
  for (let j = Math.floor(jMin) - margin; j <= Math.ceil(jMax) + margin; j++) {
    for (let i = Math.floor(iMin) - margin; i <= Math.ceil(iMax) + margin; i++) {
      for (const m of tiling.motif) {
        const pc: Pt = [m.c[0] + i * a[0] + j * b[0], m.c[1] + i * a[1] + j * b[1]];
        const [x, z] = toWorld(pc);
        const n = path.nearest(x, z, s0 - 3, s1 + 3);
        // Each brick belongs to exactly one chunk; chunk 0 also owns anything before the start.
        if (n.s >= s1 || (n.s < s0 && k > 0)) continue;
        const half = path.width(Math.max(0, n.s)) / 2;
        if (Math.abs(n.lat) > half + halfDiag || n.s < -halfDiag) continue;
        const angle = m.angle + theta;
        const rect = ensureCCW(transformRing(brick, angle, [x, z]));
        if (Math.abs(n.lat) + halfDiag < half - 0.002 && n.s > halfDiag + 0.002) {
          slots.push({ i: slots.length, kind: 'full', x, z, angle, rect, piece: rect, s: n.s });
          continue;
        }
        const local = path.strip(n.s - 1.2, n.s + 1.2, 0.08);
        const inter = intersect([rect], [local]);
        let best: Ring | null = null;
        let bestArea = 0;
        for (const poly of inter) {
          const ring = poly[0];
          if (!ring) continue;
          const area = ringArea(ring);
          if (area > bestArea) {
            bestArea = area;
            best = ring;
          }
        }
        if (!best || bestArea < SLIVER_FRACTION * brickArea) continue;
        if (bestArea >= FULL_FRACTION * brickArea) {
          slots.push({ i: slots.length, kind: 'full', x, z, angle, rect, piece: rect, s: n.s });
          continue;
        }
        const piece = ensureCCW(dedupeRing(best, 1e-6));
        if (piece.length < 3) continue;
        slots.push({ i: slots.length, kind: 'edge', x, z, angle, rect, piece, s: n.s });
      }
    }
  }

  const grid = new Map<string, number[]>();
  for (const slot of slots) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of slot.piece) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[1]);
      maxZ = Math.max(maxZ, p[1]);
    }
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const kk = key(ix, iz);
        const list = grid.get(kk);
        if (list) list.push(slot.i);
        else grid.set(kk, [slot.i]);
      }
    }
  }
  const fullCount = slots.filter((s) => s.kind === 'full').length;
  return { k, s0, s1, slots, fullCount, edgeCount: slots.length - fullCount, grid };
}

/** The slot whose paved area contains (x, z), if any. */
export function slotAt(chunk: Chunk, x: number, z: number): Slot | null {
  const list = chunk.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return null;
  for (const i of list) {
    const slot = chunk.slots[i]!;
    if (pointInRing([x, z], slot.piece)) return slot;
  }
  return null;
}

/**
 * The edges of a cut piece that were made by the splitter (not part of the original brick's
 * outline), as segments in world x/z. These are where the chalk line goes.
 */
export function cutEdges(slot: Slot): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  const onRect = (p: Pt, q: Pt): boolean => {
    for (let i = 0; i < slot.rect.length; i++) {
      const a = slot.rect[i]!;
      const b = slot.rect[(i + 1) % slot.rect.length]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz);
      const d1 = Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / l;
      const d2 = Math.abs((q[0] - a[0]) * dz - (q[1] - a[1]) * dx) / l;
      if (d1 < 1e-4 && d2 < 1e-4) return true;
    }
    return false;
  };
  for (let i = 0; i < slot.piece.length; i++) {
    const p = slot.piece[i]!;
    const q = slot.piece[(i + 1) % slot.piece.length]!;
    if (!onRect(p, q)) out.push([p, q]);
  }
  return out;
}
