/** A small square preview of a paving pattern. */
import { Graphics } from 'pixi.js';
import { tilingFor, type PatternType } from '../core/patterns';
import { intersect, rectRing, transformRing, type Pt } from '../core/geom';

export function drawSwatch(
  g: Graphics,
  type: PatternType,
  size: number,
  colors = [0xb65e43, 0xa8513a, 0xc06c4c],
): void {
  const L = 200;
  const W = 100;
  const t = tilingFor(type, L, W);
  const win = 520; // mm shown
  const s = size / win;
  const box = rectRing(win, win).map((p) => [p[0] + win / 2, p[1] + win / 2] as Pt);
  g.rect(0, 0, size, size).fill(0xcdb88f);
  const cos = Math.cos(t.baseAngle);
  const sin = Math.sin(t.baseAngle);
  let k = 0;
  for (let i = -8; i <= 8; i++) {
    for (let j = -8; j <= 8; j++) {
      for (const m of t.motif) {
        const px = m.c[0] + i * t.a[0] + j * t.b[0];
        const py = m.c[1] + i * t.a[1] + j * t.b[1];
        const c: Pt = [px * cos - py * sin + 13, px * sin + py * cos + 29];
        if (c[0] < -L || c[0] > win + L || c[1] < -L || c[1] > win + L) continue;
        const r = transformRing(rectRing(L - 14, W - 14), m.angle + t.baseAngle, c);
        for (const poly of intersect([r], [box])) {
          g.poly(poly[0]!.flatMap((p) => [p[0] * s, p[1] * s])).fill(colors[k++ % colors.length]!);
        }
      }
    }
  }
}
