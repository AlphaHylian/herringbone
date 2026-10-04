/** The neighborhood map: a scrollable street of jobs with thumbnails of finished work. */
import { Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent } from 'pixi.js';
import type { Ctx, Scene } from './ctx';
import type { Layout } from './layout';
import { NEIGHBORHOODS, LEVEL_ORDER, getLevel } from '../levels';
import { isUnlocked, neighborhoodUnlocked, nextJob, totalBricks } from '../core/progress';
import { PATTERN_NAMES } from '../core/patterns';
import { Button, drawIcon, ratingBrick, text } from './ui';
import { THEME } from './theme';
import { grassTexture } from './textures';
import { renderThumb, cachedThumb } from './thumbs';
import { drawSwatch } from './swatch';
import { openSettings } from './settings';
import { ease } from './tween';

interface Tile {
  id: string;
  x: number;
  y: number;
  size: number;
  node: Container;
  thumb: Sprite;
  unlocked: boolean;
  done: boolean;
}

export class MapScene implements Scene {
  readonly root = new Container();
  private bg = new Graphics();
  private content = new Container();
  private fixed = new Container();
  private tiles: Tile[] = [];
  private pending: Tile[] = [];
  private scrollY = 0;
  private vel = 0;
  private minScroll = 0;
  private drag: {
    id: number;
    y0: number;
    s0: number;
    moved: number;
    lastY: number;
    lastT: number;
  } | null = null;
  private layout!: Layout;
  private time = 0;
  private nextId: string | null;
  private overlay = new Container();
  private modal = false;

  constructor(
    private ctx: Ctx,
    private focus?: string,
  ) {
    this.nextId = nextJob(LEVEL_ORDER, ctx.save.data);
    this.root.addChild(this.bg, this.content, this.fixed, this.overlay);
    this.root.eventMode = 'static';
    this.root.on('pointerdown', (e) => this.down(e));
    this.root.on('globalpointermove', (e) => this.move(e));
    this.root.on('pointerup', (e) => this.up(e));
    this.root.on('pointerupoutside', (e) => this.up(e));
    ctx.debug.map = {
      tileScreen: (id: string) => {
        const t = this.tiles.find((x) => x.id === id);
        if (!t) return null;
        const p = t.node.toGlobal({ x: 0, y: 0 });
        return [p.x, p.y];
      },
      scrollTo: (id: string) => this.scrollToTile(id),
      openSettings: () => this.settings(),
      ready: () => this.pending.length === 0,
    };
  }

  resize(l: Layout): void {
    this.layout = l;
    this.root.hitArea = new Rectangle(0, 0, l.width, l.height);
    this.build();
  }

  private build(): void {
    const l = this.layout;
    const ctx = this.ctx;
    const save = ctx.save.data;
    for (const c of this.content.removeChildren()) c.destroy({ children: true });
    for (const c of this.fixed.removeChildren()) c.destroy({ children: true });
    this.tiles = [];
    this.pending = [];
    // Background: soft sand with a band of grass texture fading in.
    this.bg.clear().rect(0, 0, l.width, l.height).fill(THEME.bg);
    let y = l.safe.top + 28;
    // Header
    const title = text('Herringbone', { fontSize: 34, fontWeight: '800', letterSpacing: 0.5 });
    title.position.set(24, y);
    this.content.addChild(title);
    const sub = text('Paths, patios & driveways', {
      fontSize: 15,
      fill: THEME.inkSoft,
      fontWeight: '600',
    });
    sub.position.set(25, y + 42);
    this.content.addChild(sub);
    const earned = totalBricks(save);
    const badge = new Container();
    const bg = new Graphics();
    ratingBrick(bg, 0, 0, 26, true);
    const count = text(`${earned} / ${LEVEL_ORDER.length * 3}`, {
      fontSize: 15,
      fill: THEME.inkSoft,
    });
    count.anchor.set(0, 0.5);
    count.x = 20;
    badge.addChild(bg, count);
    badge.position.set(28, y + 82);
    this.content.addChild(badge);
    y += 120;

    const T = Math.min(132, Math.floor(l.width * 0.34));
    const rowH = T + 118;
    for (const n of NEIGHBORHOODS) {
      const open = neighborhoodUnlocked(n, LEVEL_ORDER, save);
      // Section card
      const card = new Container();
      const cw = l.width - 32;
      const cg = new Graphics();
      cg.roundRect(0, 4, cw, 92, 20).fill({ color: THEME.shadow, alpha: 0.1 });
      cg.roundRect(0, 0, cw, 92, 20).fill(THEME.paper);
      card.addChild(cg);
      const sw = new Graphics();
      drawSwatch(sw, n.pattern, 64);
      const swMask = new Graphics().roundRect(0, 0, 64, 64, 14).fill(0xffffff);
      const swc = new Container();
      swc.addChild(sw, swMask);
      sw.mask = swMask;
      swc.position.set(14, 14);
      swc.alpha = open ? 1 : 0.45;
      card.addChild(swc);
      const name = text(n.name, { fontSize: 21, fontWeight: '800' });
      name.position.set(94, 16);
      card.addChild(name);
      const desc = text(
        open ? `New pattern: ${PATTERN_NAMES[n.pattern]}` : 'Finish the street before to move in',
        {
          fontSize: 14,
          fill: THEME.inkSoft,
        },
      );
      desc.position.set(94, 50);
      card.addChild(desc);
      if (!open) {
        const lock = new Graphics();
        lock.roundRect(-9, -2, 18, 14, 3).fill(THEME.inkSoft);
        lock.arc(0, -2, 6, Math.PI, 0).stroke({ width: 3, color: THEME.inkSoft });
        lock.position.set(cw - 28, 46);
        card.addChild(lock);
      }
      card.position.set(16, y);
      this.content.addChild(card);
      y += 118;
      // Stepping-stone path and tiles
      const path = new Graphics();
      this.content.addChild(path);
      const centers: [number, number][] = [];
      n.levels.forEach((id, i) => {
        const cx = i % 2 === 0 ? l.width * 0.3 : l.width * 0.7;
        const cy = y + T / 2 + i * rowH;
        centers.push([cx, cy]);
        this.addTile(id, cx, cy, T);
      });
      for (let i = 0; i + 1 < centers.length; i++) {
        // From below one tile's rating to the top of the next tile.
        const [ax, ay0] = centers[i]!;
        const [bx, by0] = centers[i + 1]!;
        const ay = ay0 + T / 2 + 62;
        const by = by0 - T / 2 - 4;
        const steps = 3;
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps;
          const x = ax + (bx - ax) * (t * t * (3 - 2 * t));
          const yy = ay + (by - ay) * t;
          path.ellipse(x, yy, 13, 9).fill({ color: 0xcdb48c, alpha: 0.9 });
          path.ellipse(x - 2, yy - 2, 9, 5).fill({ color: 0xe2cfaa, alpha: 0.8 });
        }
      }
      y += n.levels.length * rowH + 10;
    }
    y += 120 + l.safe.bottom;
    this.minScroll = Math.min(0, l.height - y);

    // Fixed controls
    const gear = new Button({ icon: 'gear', width: 48, height: 48 }, () => this.settings());
    gear.position.set(l.width - l.safe.right - 34, l.safe.top + 34);
    const fade = new Graphics();
    const fh = 110 + l.safe.bottom;
    for (let i = 0; i < 12; i++)
      fade
        .rect(0, l.height - fh + (i * fh) / 12, l.width, fh / 12 + 1)
        .fill({ color: THEME.bg, alpha: Math.min(1, (i / 12) * 1.6) });
    // Top fade so content slides softly under the status bar and the gear.
    const th = l.safe.top + 64;
    for (let i = 0; i < 10; i++)
      fade
        .rect(0, (i * th) / 10, l.width, th / 10 + 1)
        .fill({ color: THEME.bg, alpha: Math.min(1, 1 - i / 10) * 0.95 });
    fade.eventMode = 'none';
    const free = new Button(
      { icon: 'build', label: 'Free Build', width: 190, height: 54, fill: THEME.paper },
      () => ctx.goto({ name: 'freebuild' }),
    );
    free.position.set(l.width / 2, l.height - l.safe.bottom - 44);
    this.fixed.addChild(fade, gear, free);

    // Scroll position
    if (this.focus) this.scrollToTile(this.focus, false);
    else if (this.nextId && this.scrollY === 0) this.scrollToTile(this.nextId, false);
    this.applyScroll();
  }

  private addTile(id: string, cx: number, cy: number, T: number): void {
    const save = this.ctx.save.data;
    const level = getLevel(id);
    const rec = save.completed[id] ?? null;
    const unlocked = isUnlocked(LEVEL_ORDER, id, save);
    const node = new Container();
    const g = new Graphics();
    g.roundRect(-T / 2 + 2, -T / 2 + 6, T, T, 22).fill({ color: THEME.shadow, alpha: 0.18 });
    g.roundRect(-T / 2, -T / 2, T, T, 22).fill(rec ? THEME.paper : 0xf0e6d4);
    node.addChild(g);
    const inner = T - 12;
    const thumb = new Sprite(cachedThumb(level, rec) ?? grassTexture());
    thumb.width = thumb.height = inner;
    thumb.anchor.set(0.5);
    const tmask = new Graphics().roundRect(-inner / 2, -inner / 2, inner, inner, 17).fill(0xffffff);
    thumb.mask = tmask;
    node.addChild(thumb, tmask);
    if (!unlocked) {
      const veil = new Graphics()
        .roundRect(-inner / 2, -inner / 2, inner, inner, 17)
        .fill({ color: THEME.bg, alpha: 0.62 });
      const lock = new Graphics();
      lock.roundRect(-13, -4, 26, 20, 4).fill(THEME.inkSoft);
      lock.arc(0, -4, 9, Math.PI, 0).stroke({ width: 4, color: THEME.inkSoft });
      node.addChild(veil, lock);
    }
    const label = text(level.name, {
      fontSize: 15,
      fontWeight: '700',
      fill: unlocked ? THEME.ink : THEME.inkSoft,
    });
    label.anchor.set(0.5, 0);
    label.y = T / 2 + 8;
    node.addChild(label);
    if (rec) {
      const r = new Graphics();
      for (let i = 0; i < 3; i++) ratingBrick(r, (i - 1) * 30, T / 2 + 42, 24, i < rec.rating);
      node.addChild(r);
    } else if (unlocked) {
      const play = new Graphics();
      play.circle(0, 0, 18).fill({ color: THEME.leaf, alpha: 0.95 });
      drawIcon(play, 'play', 20, 0xffffff);
      play.position.set(T / 2 - 14, -T / 2 + 14);
      node.addChild(play);
    }
    node.position.set(cx, cy);
    this.content.addChild(node);
    const tile: Tile = { id, x: cx, y: cy, size: T, node, thumb, unlocked, done: !!rec };
    this.tiles.push(tile);
    if (!cachedThumb(level, rec)) this.pending.push(tile);
  }

  private scrollToTile(id: string, animate = true): void {
    const t = this.tiles.find((x) => x.id === id);
    if (!t) return;
    const target = Math.max(this.minScroll, Math.min(0, this.layout.height * 0.45 - t.y));
    if (!animate) {
      this.scrollY = target;
      this.applyScroll();
      return;
    }
    const from = this.scrollY;
    void this.ctx.tweens.add(
      this.ctx.motion(0.5),
      (v) => {
        this.scrollY = from + (target - from) * v;
        this.applyScroll();
      },
      { ease: ease.inOutCubic },
    );
  }

  private applyScroll(): void {
    this.content.y = this.scrollY;
  }

  private settings(): void {
    this.modal = true;
    openSettings(
      this.ctx,
      this.overlay,
      () => (this.modal = false),
      () => this.ctx.goto({ name: 'map' }),
    );
  }

  // ---- input --------------------------------------------------------------------------

  private down(e: FederatedPointerEvent): void {
    this.ctx.sfx.unlock();
    if (this.modal || this.drag) return;
    this.vel = 0;
    this.drag = {
      id: e.pointerId,
      y0: e.global.y,
      s0: this.scrollY,
      moved: 0,
      lastY: e.global.y,
      lastT: this.time,
    };
  }
  private move(e: FederatedPointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.global.y - d.y0;
    d.moved = Math.max(d.moved, Math.abs(dy));
    let s = d.s0 + dy;
    if (s > 0) s *= 0.4;
    if (s < this.minScroll) s = this.minScroll + (s - this.minScroll) * 0.4;
    this.scrollY = s;
    const dt = Math.max(1e-3, this.time - d.lastT);
    this.vel = (e.global.y - d.lastY) / dt;
    d.lastY = e.global.y;
    d.lastT = this.time;
    this.applyScroll();
  }
  private up(e: FederatedPointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (d.moved < 10) {
      this.vel = 0;
      this.tap(e.global.x, e.global.y);
    }
  }

  private tap(x: number, y: number): void {
    for (const t of this.tiles) {
      const p = t.node.toGlobal({ x: 0, y: 0 });
      if (Math.abs(x - p.x) <= t.size / 2 && Math.abs(y - p.y) <= t.size / 2 + 30) {
        if (!t.unlocked) {
          this.ctx.sfx.softDrop();
          const x0 = t.node.x;
          void this.ctx.tweens.add(
            0.3,
            (v) => (t.node.x = x0 + Math.sin(v * Math.PI * 4) * 6 * (1 - v)),
          );
          return;
        }
        this.ctx.sfx.tap();
        this.ctx.haptics.tick();
        void this.ctx.tweens.add(0.12, (v) => t.node.scale.set(1 - 0.06 * Math.sin(v * Math.PI)));
        if (t.done) this.ctx.goto({ name: 'job', levelId: t.id, review: true });
        else this.ctx.goto({ name: 'job', levelId: t.id });
        return;
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    // Render one thumbnail per frame so the map opens instantly.
    const t = this.pending.shift();
    if (t) {
      const rec = this.ctx.save.data.completed[t.id] ?? null;
      const inner = t.size - 12;
      t.thumb.texture = renderThumb(this.ctx.app.renderer, getLevel(t.id), rec, Math.round(inner));
      t.thumb.width = t.thumb.height = inner;
    }
    if (!this.drag) {
      if (Math.abs(this.vel) > 5) {
        this.scrollY += this.vel * dt;
        this.vel *= Math.pow(0.04, dt);
      } else this.vel = 0;
      // Spring back inside bounds.
      if (this.scrollY > 0) this.scrollY += (0 - this.scrollY) * Math.min(1, dt * 12);
      if (this.scrollY < this.minScroll)
        this.scrollY += (this.minScroll - this.scrollY) * Math.min(1, dt * 12);
      this.applyScroll();
    }
    // Gentle pulse on the next job.
    if (this.nextId && !this.ctx.reduceMotion) {
      const n = this.tiles.find((x) => x.id === this.nextId);
      if (n) n.node.scale.set(1 + Math.sin(this.time * 2.4) * 0.025);
    }
  }

  destroy(): void {
    delete this.ctx.debug.map;
    this.root.destroy({ children: true });
  }
}
