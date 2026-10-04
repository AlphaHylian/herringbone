/** Turning a finished job into a save record and back into placed pieces. */
import type { JobRecord } from '../core/save';
import type { GameState } from '../core/game';
import type { Job } from '../core/job';
import type { Affine } from '../core/affine';
import { CutSession } from '../core/game';
import { idealCuts } from '../core/cut';
import type { Pt } from '../core/geom';
import { slotSkin, type Skin } from './jobView';

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r5 = (v: number): number => Math.round(v * 1e5) / 1e5;

export function makeRecord(state: GameState, skins: Map<number, Skin>): JobRecord {
  const score = state.score();
  const edges: Record<string, number[]> = {};
  let variants = '';
  for (const s of state.job.slots) {
    const skin = skins.get(s.id);
    const v = skin?.variant ?? 0;
    variants += Math.min(35, v).toString(36);
    const p = state.placements[s.id];
    if (!p || s.kind === 'full') continue;
    const m = skin?.m ?? slotSkin(s, v).m;
    edges[s.id] = [
      v,
      ...m.slice(0, 4).map(r5),
      r1(m[4]),
      r1(m[5]),
      ...p.polygon.flatMap((q) => [r1(q[0]), r1(q[1])]),
    ];
  }
  return {
    rating: score.rating,
    bricksUsed: score.bricksUsed,
    offcutsReused: score.offcutsReused,
    completedAt: Date.now(),
    edges,
    variants,
  };
}

export interface RestoredPiece {
  slotId: number;
  polygon: Pt[];
  skin: Skin;
  accuracy: number;
}

/** Pieces for every slot: saved ones where available, ideal cuts otherwise. */
export function restorePieces(job: Job, rec: JobRecord | null): RestoredPiece[] {
  const out: RestoredPiece[] = [];
  for (const s of job.slots) {
    const v = rec?.variants ? parseInt(rec.variants[s.id] ?? '0', 36) || 0 : (s.id * 7) % 12;
    if (s.kind === 'full') {
      out.push({ slotId: s.id, polygon: s.rect, skin: slotSkin(s, v), accuracy: 1 });
      continue;
    }
    const e = rec?.edges[String(s.id)];
    if (e && e.length >= 13) {
      const m = e.slice(1, 7) as Affine;
      const poly: Pt[] = [];
      for (let i = 7; i + 1 < e.length; i += 2) poly.push([e[i]!, e[i + 1]!]);
      out.push({ slotId: s.id, polygon: poly, skin: { variant: e[0]!, m }, accuracy: 1 });
      continue;
    }
    const session = new CutSession(s);
    for (const [a, b] of idealCuts(s, job.brickWidth)) session.cut(a, b);
    out.push({
      slotId: s.id,
      polygon: session.piece,
      skin: slotSkin(s, v),
      accuracy: session.accuracy,
    });
  }
  return out;
}
