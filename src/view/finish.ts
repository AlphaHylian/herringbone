/**
 * The finishing sequence (about 6-7 s, tap to skip): jointing sand is swept across and settles
 * into the joints, a plate compactor rumbles over, the camera pulls back, and the decorations
 * appear. Also used instantly when revisiting a finished job.
 */
import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { JobScene } from './jobScene';
import { makeDecoration, DECOR_LAYER, type DecorNode } from './decor';
import { softDot } from './textures';
import { ease, type Ease } from './tween';
import { rng } from '../core/rng';
import type { BBox, Pt } from '../core/geom';

class Sequence {
  skipped = false;
  private current: { cancel(): void } | null = null;
  private finals: (() => void)[] = [];
  constructor(private scene: JobScene) {}

  /** Animate `update` over `seconds`, or jump to the end if skipped. */
  async step(
    seconds: number,
    update: (v: number) => void,
    e: Ease = ease.inOutSine,
  ): Promise<void> {
    if (this.skipped) {
      update(1);
      return;
    }
    const t = this.scene.ctx.tweens.add(this.scene.ctx.motion(seconds), update, { ease: e });
    this.current = t;
    this.finals.push(() => update(1));
    await t.promise;
    this.finals.pop();
    this.current = null;
  }

  skip(): void {
    if (this.skipped) return;
    this.skipped = true;
    this.current?.cancel();
    for (const f of this.finals.splice(0)) f();
  }
}

export interface FinishResult {
  decor: DecorNode[];
}

export function worldBounds(scene: JobScene): BBox {
  const bb = { ...scene.job.bbox };
  for (const d of scene.level.decorations) {
    const r =
      d.type === 'tree'
        ? 560
        : d.type === 'car'
          ? 900
          : d.type === 'parasol'
            ? 640
            : d.type === 'bench'
              ? 620
              : 300;
    bb.minX = Math.min(bb.minX, d.at[0] - r);
    bb.maxX = Math.max(bb.maxX, d.at[0] + r);
    bb.minY = Math.min(bb.minY, d.at[1] - r);
    bb.maxY = Math.max(bb.maxY, d.at[1] + r);
  }
  return bb;
}

/** Where the camera ends up: everything visible in the top part of the screen. */
export function finalCamera(
  scene: JobScene,
  cardSpace: number,
): { x: number; y: number; s: number } {
  const l = scene.ctx.layout;
  const bb = worldBounds(scene);
  const pad = 30;
  const top = l.safe.top + 56;
  const bottom = l.height - cardSpace - l.safe.bottom;
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const s = Math.min((l.width - pad * 2) / w, (bottom - top - pad) / h);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  return { s, x: l.width / 2 - cx * s, y: (top + bottom) / 2 - cy * s };
}

/** Put decorations into the view. Returns them (some animate). */
export function addDecorations(scene: JobScene): DecorNode[] {
  const list = [...scene.level.decorations].sort(
    (a, b) => DECOR_LAYER[a.type] - DECOR_LAYER[b.type],
  );
  const out: DecorNode[] = [];
  for (const d of list) {
    const n = makeDecoration(d);
    scene.view.decor.addChild(n.node);
    out.push(n);
  }
  // Animate the living ones (cat, fire, tree, lantern, birdbath).
  let t = 0;
  const ticking = out.filter((n) => n.tick);
  if (ticking.length && !scene.ctx.reduceMotion) {
    scene.tickers.push((dt) => {
      t += dt;
      for (const n of ticking) if (!n.node.destroyed) n.tick!(t, dt);
    });
  }
  return out;
}

export async function runFinish(
  scene: JobScene,
  opts: { cardSpace: number },
): Promise<FinishResult> {
  const { ctx, view, job } = scene;
  const seq = new Sequence(scene);
  const bb = job.bbox;
  // Tap anywhere to skip.
  const catcher = new Container();
  catcher.eventMode = 'static';
  catcher.hitArea = new Rectangle(0, 0, ctx.layout.width, ctx.layout.height);
  catcher.on('pointerdown', () => {
    seq.skip();
    ctx.debug.finishSkipped = true;
  });
  scene.overlay.addChild(catcher);
  view.highlight.clear();

  // ---- 1. Sand sweep -------------------------------------------------------------------
  const sweepT = 1.9;
  ctx.sfx.hiss(sweepT + 0.2);
  const reveal = new Graphics();
  const band = new Graphics();
  view.addChild(reveal, band);
  const dusting = view.jointSand.clone();
  view.fx.addChild(dusting);
  dusting.mask = band;
  view.jointSand.alpha = 1;
  view.jointSand.mask = reveal;
  const broom = makeBroom(Math.max(380, (bb.maxY - bb.minY) * 0.35));
  view.fx.addChild(broom);
  const r = rng(99);
  const H = bb.maxY - bb.minY;
  const span = bb.maxX - bb.minX + 1200;
  let last = 0;
  await seq.step(
    sweepT,
    (v) => {
      const front = bb.minX - 600 + span * v;
      reveal
        .clear()
        .rect(bb.minX - 2000, bb.minY - 2000, front - (bb.minX - 2000), H + 4000)
        .fill(0xffffff);
      band
        .clear()
        .rect(front - 260, bb.minY - 2000, 300, H + 4000)
        .fill(0xffffff);
      dusting.alpha = 0.7;
      const y = bb.minY + H * (0.5 + 0.45 * Math.sin(v * Math.PI * 7));
      broom.position.set(front + 40, y);
      broom.rotation = Math.sin(v * Math.PI * 7) * 0.25;
      broom.visible = v < 1;
      if (!seq.skipped && !ctx.reduceMotion && v - last > 0.012) {
        last = v;
        for (let i = 0; i < 3; i++)
          grain(view.fx, [front + r() * 60, y + (r() - 0.5) * 300], r, scene);
      }
    },
    ease.linear,
  );
  view.jointSand.mask = null;
  reveal.destroy();
  dusting.mask = null;
  band.destroy();
  dusting.destroy();
  broom.destroy();

  // ---- 2. Plate compactor -----------------------------------------------------------------
  const compT = 2.3;
  ctx.sfx.rumble(compT + 0.3);
  const comp = makeCompactor();
  view.fx.addChild(comp);
  const rows = Math.max(1, Math.min(3, Math.ceil(H / 700)));
  const path: Pt[] = [];
  for (let i = 0; i < rows; i++) {
    const y = bb.minY + (H * (i + 0.5)) / rows;
    const xs = i % 2 === 0 ? [bb.minX - 700, bb.maxX + 700] : [bb.maxX + 700, bb.minX - 700];
    path.push([xs[0]!, y], [xs[1]!, y]);
  }
  const camX = scene.cam.x;
  const camY = scene.cam.y;
  let pulse = 0;
  await seq.step(
    compT,
    (v) => {
      const f = v * (path.length - 1);
      const i = Math.min(path.length - 2, Math.floor(f));
      const t = f - i;
      const a = path[i]!;
      const b = path[i + 1]!;
      comp.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(v * 140) * 4);
      comp.rotation = b[0] > a[0] ? 0 : Math.PI;
      comp.visible = v < 1;
      if (!ctx.reduceMotion && v < 1) {
        scene.cam.position.set(
          camX + (Math.random() - 0.5) * 2.2,
          camY + (Math.random() - 0.5) * 2.2,
        );
      } else scene.cam.position.set(camX, camY);
      if (v - pulse > 0.08 && v < 1) {
        pulse = v;
        ctx.haptics.impact('light');
      }
    },
    ease.linear,
  );
  comp.destroy();
  scene.cam.position.set(camX, camY);

  // ---- 3. Camera pull-back ------------------------------------------------------------------
  const cam = finalCamera(scene, opts.cardSpace);
  const from = { x: scene.cam.x, y: scene.cam.y, s: scene.cam.scale.x };
  const uiFrom = scene.uiReveal;
  await seq.step(
    1.3,
    (v) => {
      scene.cam.scale.set(from.s + (cam.s - from.s) * v);
      scene.cam.position.set(from.x + (cam.x - from.x) * v, from.y + (cam.y - from.y) * v);
      scene.setUiReveal(uiFrom * (1 - v));
    },
    ease.inOutCubic,
  );

  // ---- 4. Decorations -------------------------------------------------------------------
  const decor = addDecorations(scene);
  const cat = decor.find(isCat);
  for (const d of decor) d.node.alpha = 0;
  const appear = decor.map((d, i) =>
    seq
      .step(
        0.35,
        (v) => {
          d.node.alpha = Math.min(1, v * 1.4);
          d.node.scale.set(0.85 + 0.15 * v);
        },
        ease.outBack,
      )
      .then(() => i),
  );
  // Stagger by awaiting sequentially with short pauses.
  for (let i = 0; i < appear.length; i++) {
    if (!seq.skipped) await scene.ctx.tweens.wait(ctx.motion(0.15));
  }
  await Promise.all(appear);
  if (cat) void walkCatIn(scene, cat, seq);
  catcher.destroy();
  return { decor };
}

function isCat(d: DecorNode): boolean {
  return (d.node as Container & { isCat?: boolean }).isCat === true;
}

/** The cat strolls in from the side to its spot. */
async function walkCatIn(scene: JobScene, cat: DecorNode, seq: Sequence): Promise<void> {
  if (seq.skipped || scene.ctx.reduceMotion) return;
  const node = cat.node as Container & { walking?: boolean };
  const end: Pt = [node.x, node.y];
  const bb = worldBounds(scene);
  const start: Pt = [bb.minX - 800, end[1] + 200];
  node.position.set(start[0], start[1]);
  node.rotation = Math.atan2(end[1] - start[1], end[0] - start[0]);
  node.walking = true;
  await scene.ctx.tweens.add(
    4.5,
    (v) =>
      node.position.set(start[0] + (end[0] - start[0]) * v, start[1] + (end[1] - start[1]) * v),
    { ease: ease.linear },
  ).promise;
  node.walking = false;
}

function grain(layer: Container, at: Pt, r: () => number, scene: JobScene): void {
  const s = new Sprite(softDot());
  s.anchor.set(0.5);
  s.tint = 0xe8d4a4;
  s.width = s.height = 24 + r() * 26;
  s.position.set(at[0], at[1]);
  layer.addChild(s);
  const dx = (r() - 0.2) * 160;
  const dy = (r() - 0.5) * 120;
  const x0 = at[0];
  const y0 = at[1];
  scene.ctx.tweens.add(
    0.6 + r() * 0.4,
    (v) => {
      if (s.destroyed) return;
      s.position.set(x0 + dx * v, y0 + dy * v);
      s.alpha = 0.8 * (1 - v);
    },
    { ease: ease.outQuad, onDone: () => s.destroy() },
  );
}

function makeBroom(width: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(-30, -width / 2, 60, width, 16).fill(0x6b4a2e); // head
  for (let i = 0; i < 26; i++) {
    const y = -width / 2 + 8 + (i * (width - 16)) / 25;
    g.moveTo(-28, y)
      .lineTo(-70, y + 4)
      .stroke({ width: 7, color: 0xd9b86c, cap: 'round' });
  }
  g.moveTo(30, 0).lineTo(420, -40).stroke({ width: 26, color: 0x9a7048, cap: 'round' }); // handle
  c.addChild(g);
  return c;
}

function makeCompactor(): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(-250 + 30, -230 + 40, 500, 460, 40).fill({ color: 0x1e140c, alpha: 0.25 });
  g.roundRect(-250, -230, 500, 460, 40).fill(0x4b4f52); // base plate
  g.roundRect(-210, -190, 420, 380, 30).fill(0x5d6266);
  g.roundRect(-150, -150, 260, 300, 40).fill(0xe0a032); // engine cowl
  g.roundRect(-130, -130, 220, 120, 30).fill({ color: 0xffffff, alpha: 0.18 });
  g.circle(-20, 60, 50).fill(0x333333);
  // handle
  g.moveTo(-230, -170).lineTo(-620, -120).stroke({ width: 26, color: 0x333333, cap: 'round' });
  g.moveTo(-230, 170).lineTo(-620, 120).stroke({ width: 26, color: 0x333333, cap: 'round' });
  g.moveTo(-620, -150).lineTo(-620, 150).stroke({ width: 34, color: 0x222222, cap: 'round' });
  c.addChild(g);
  return c;
}
