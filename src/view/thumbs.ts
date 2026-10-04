/** Map thumbnails rendered from the real level: finished jobs show the player's bricks. */
import { Container, Rectangle, type Renderer, type Texture } from 'pixi.js';
import type { LevelData } from '../core/level';
import type { JobRecord } from '../core/save';
import { buildJob } from '../core/job';
import { GameState } from '../core/game';
import { JobView } from './jobView';
import { restorePieces } from './persist';

const cache = new Map<string, Texture>();

export function thumbKey(level: LevelData, rec: JobRecord | null): string {
  return `${level.id}:${rec ? rec.completedAt : 'open'}`;
}

export function cachedThumb(level: LevelData, rec: JobRecord | null): Texture | undefined {
  return cache.get(thumbKey(level, rec));
}

/** Render (or fetch) a square thumbnail `px` wide. */
export function renderThumb(
  renderer: Renderer,
  level: LevelData,
  rec: JobRecord | null,
  px: number,
): Texture {
  const key = thumbKey(level, rec);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = buildJob(level);
  const view = new JobView(job);
  if (rec) {
    const state = new GameState(job);
    for (const p of restorePieces(job, rec)) {
      const slot = job.slots[p.slotId]!;
      view.addPiece(
        state.restore(p.slotId, p.polygon, p.accuracy, slot.kind === 'full' ? 'brick' : 'cut'),
        p.skin,
      );
    }
    view.jointSand.alpha = 1;
  } else {
    view.drawGuides(() => false, 0.12);
  }
  const bb = job.bbox;
  const margin = 160;
  const w = bb.maxX - bb.minX + margin * 2;
  const h = bb.maxY - bb.minY + margin * 2;
  const size = Math.max(w, h);
  const s = px / size;
  const holder = new Container();
  holder.addChild(view);
  view.scale.set(s);
  view.position.set(
    -(bb.minX - margin - (size - w) / 2) * s,
    -(bb.minY - margin - (size - h) / 2) * s,
  );
  // Clip to the square.
  const tex = renderer.generateTexture({
    target: holder,
    frame: new Rectangle(0, 0, px, px),
    resolution: Math.min(2, window.devicePixelRatio || 1),
    antialias: true,
  });
  holder.destroy({ children: true });
  cache.set(key, tex);
  return tex;
}

export function clearThumbs(): void {
  for (const t of cache.values()) t.destroy(true);
  cache.clear();
}
