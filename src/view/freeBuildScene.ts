/** Free Build menu: pick a border shape, a pattern and a brick colour, then pave freely. */
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { Ctx, Scene } from './ctx';
import type { Layout } from './layout';
import { FREE_SHAPES, FREE_SHAPE_NAMES, freeShapeBorder, type FreeShape } from '../core/freebuild';
import { PATTERN_NAMES, PATTERN_TYPES, type PatternType } from '../core/patterns';
import { unlockedPatterns } from '../core/progress';
import { NEIGHBORHOODS, LEVEL_ORDER } from '../levels';
import { ringBBox, type Pt } from '../core/geom';
import { Button, text } from './ui';
import { THEME } from './theme';
import { drawSwatch } from './swatch';

export const FREE_PALETTES: Record<string, string[]> = {
  red: ['#a8513a', '#b65e43', '#9a4632', '#bc6a4a'],
  clay: ['#c48852', '#b47645', '#cf9861', '#a96a3f'],
  slate: ['#8e8781', '#9c938a', '#7f7873', '#a79d92'],
};

let lastShape: FreeShape = 'square';
let lastPattern: PatternType = 'herringbone90';
let lastPalette = 'red';

export class FreeBuildScene implements Scene {
  readonly root = new Container();
  private layout!: Layout;

  constructor(private ctx: Ctx) {}

  resize(l: Layout): void {
    this.layout = l;
    this.build();
  }

  private build(): void {
    const l = this.layout;
    const ctx = this.ctx;
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    this.root.addChild(new Graphics().rect(0, 0, l.width, l.height).fill(THEME.bg));
    const back = new Button({ icon: 'back', width: 48, height: 48 }, () =>
      ctx.goto({ name: 'map' }),
    );
    back.position.set(l.safe.left + 34, l.safe.top + 34);
    const title = text('Free Build', { fontSize: 24, fontWeight: '800' });
    title.anchor.set(0.5);
    title.position.set(l.width / 2, l.safe.top + 34);
    this.root.addChild(back, title);
    const sub = text('No client, no rating. Just paving.', { fontSize: 15, fill: THEME.inkSoft });
    sub.anchor.set(0.5, 0);
    sub.position.set(l.width / 2, l.safe.top + 62);
    this.root.addChild(sub);

    let y = l.safe.top + 104;
    const unlocked = unlockedPatterns(NEIGHBORHOODS, LEVEL_ORDER, ctx.save.data);
    if (!unlocked.includes(lastPattern)) lastPattern = 'herringbone90';
    // Shapes: 4 x 2 grid
    const cols = 4;
    const gap = 10;
    const tw = Math.min(84, (l.width - 32 - gap * (cols - 1)) / cols);
    const gridW = tw * cols + gap * (cols - 1);
    const x0 = (l.width - gridW) / 2;
    FREE_SHAPES.forEach((shape, i) => {
      const c = new Container();
      const g = new Graphics();
      const sel = shape === lastShape;
      g.roundRect(0, 3, tw, tw + 20, 16).fill({ color: THEME.shadow, alpha: 0.1 });
      g.roundRect(0, 0, tw, tw + 20, 16).fill(sel ? 0xfffaf0 : THEME.paper);
      if (sel) g.roundRect(0, 0, tw, tw + 20, 16).stroke({ width: 3, color: THEME.accent });
      const b = freeShapeBorder(shape);
      const bb = ringBBox(b.outer);
      const s = (tw - 22) / Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
      const ox = tw / 2 - ((bb.minX + bb.maxX) / 2) * s;
      const oy = (tw - 4) / 2 - ((bb.minY + bb.maxY) / 2) * s + 4;
      const map = (r: Pt[]): number[] => r.flatMap((p) => [p[0] * s + ox, p[1] * s + oy]);
      g.poly(map(b.outer)).fill(0xc9ae84);
      for (const h of b.holes ?? []) g.poly(map(h)).fill(0x6f8f4e);
      g.poly(map(b.outer)).stroke({ width: 2, color: 0x8e7a5c });
      c.addChild(g);
      const name = text(FREE_SHAPE_NAMES[shape], { fontSize: 12, fill: THEME.inkSoft });
      name.anchor.set(0.5, 0);
      name.position.set(tw / 2, tw - 2);
      c.addChild(name);
      c.position.set(x0 + (i % cols) * (tw + gap), y + Math.floor(i / cols) * (tw + 20 + gap));
      this.tappable(c, new Rectangle(0, 0, tw, tw + 20), () => {
        lastShape = shape;
        this.build();
      });
      this.root.addChild(c);
    });
    y += 2 * (tw + 20 + gap) + 14;
    // Patterns
    const pw = Math.min(84, (l.width - 32 - gap * 3) / 4);
    PATTERN_TYPES.forEach((p, i) => {
      const open = unlocked.includes(p);
      const c = new Container();
      const g = new Graphics();
      const sel = p === lastPattern;
      g.roundRect(0, 3, pw, pw + 34, 16).fill({ color: THEME.shadow, alpha: 0.1 });
      g.roundRect(0, 0, pw, pw + 34, 16).fill(sel ? 0xfffaf0 : THEME.paper);
      if (sel) g.roundRect(0, 0, pw, pw + 34, 16).stroke({ width: 3, color: THEME.accent });
      const sw = new Graphics();
      drawSwatch(sw, p, pw - 16);
      const m = new Graphics().roundRect(8, 8, pw - 16, pw - 16, 10).fill(0xffffff);
      sw.position.set(8, 8);
      sw.mask = m;
      c.addChild(g, sw, m);
      const name = text(PATTERN_NAMES[p].replace(' ', '\n'), {
        fontSize: 11,
        fill: THEME.inkSoft,
        align: 'center',
        lineHeight: 13,
      });
      name.anchor.set(0.5, 0);
      name.position.set(pw / 2, pw - 4);
      c.addChild(name);
      if (!open) {
        c.alpha = 0.4;
        const lock = new Graphics();
        lock.roundRect(-9, -2, 18, 14, 3).fill(THEME.ink);
        lock.arc(0, -2, 6, Math.PI, 0).stroke({ width: 3, color: THEME.ink });
        lock.position.set(pw / 2, pw / 2);
        c.addChild(lock);
      }
      c.position.set((l.width - (pw * 4 + gap * 3)) / 2 + i * (pw + gap), y);
      this.tappable(c, new Rectangle(0, 0, pw, pw + 34), () => {
        if (!open) {
          ctx.sfx.softDrop();
          return;
        }
        lastPattern = p;
        this.build();
      });
      this.root.addChild(c);
    });
    y += pw + 34 + 24;
    // Colours
    const names = Object.keys(FREE_PALETTES);
    names.forEach((n, i) => {
      const c = new Container();
      const g = new Graphics();
      const pal = FREE_PALETTES[n]!;
      const r = 24;
      g.circle(0, 2, r + 2).fill({ color: THEME.shadow, alpha: 0.12 });
      pal.forEach((hex, k) => {
        const a0 = (k / pal.length) * Math.PI * 2;
        const a1 = ((k + 1) / pal.length) * Math.PI * 2;
        g.moveTo(0, 0)
          .arc(0, 0, r, a0, a1)
          .lineTo(0, 0)
          .fill(parseInt(hex.slice(1), 16));
      });
      if (n === lastPalette) g.circle(0, 0, r + 5).stroke({ width: 3, color: THEME.accent });
      c.addChild(g);
      c.position.set(l.width / 2 + (i - 1) * 76, y + r);
      this.tappable(c, new Rectangle(-r - 6, -r - 6, 2 * r + 12, 2 * r + 12), () => {
        lastPalette = n;
        this.build();
      });
      this.root.addChild(c);
    });
    y += 90;
    const start = new Button(
      {
        icon: 'build',
        label: 'Start paving',
        width: 230,
        height: 56,
        fill: THEME.leaf,
        color: 0xffffff,
      },
      () =>
        ctx.goto({ name: 'freejob', shape: lastShape, pattern: `${lastPattern}:${lastPalette}` }),
    );
    start.position.set(l.width / 2, Math.min(y + 10, l.height - l.safe.bottom - 50));
    this.root.addChild(start);
  }

  private tappable(c: Container, area: Rectangle, fn: () => void): void {
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.hitArea = area;
    c.on('pointertap', () => {
      this.ctx.sfx.unlock();
      this.ctx.sfx.tap();
      this.ctx.haptics.tick();
      fn();
    });
  }

  update(): void {}

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
