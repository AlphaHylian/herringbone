/**
 * The splitter: the brick shown large on a cutting bench, the target faintly outlined on it.
 * Swipe across to draw a cut line; release to drop the blade. Clean pieces fly into the slot;
 * otherwise cut again, undo the cut, or lay it as it is.
 */
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import { CutSession } from '../core/game';
import type { Slot } from '../core/job';
import { apply, applyRing, invert, type Affine } from '../core/affine';
import { ringArea, ringCentroid, rectRing, type Pt, type Ring } from '../core/geom';
import { OFFCUT_MIN_FRACTION } from '../core/offcut';
import { CLEAN_ACCURACY } from '../core/cut';
import { drawPiece, drawShadow, flat, slotSkin, clipSegmentConvex, type Skin } from './jobView';
import type { JobScene } from './jobScene';
import { Button, text } from './ui';
import { THEME } from './theme';
import { ease } from './tween';

const MIN_SWIPE_PX = 26;

export class Splitter {
  readonly root = new Container();
  private backdrop = new Graphics();
  private bench = new Container(); // brick-local millimetres
  private board = new Graphics();
  private targetG = new Graphics();
  private pieceNode = new Container();
  private lineG = new Graphics();
  private bladeG = new Graphics();
  private meter = new Graphics();
  private layBtn: Button;
  private undoBtn: Button;
  private closeBtn: Button;
  private hint = text('', { fontSize: 15, fill: 0xfff6e6 });
  readonly session: CutSession;
  private skin: Skin;
  private local: Affine; // world -> brick-local
  private S = 1; // px per mm on the bench
  private swipe: { id: number; a: Pt; b: Pt } | null = null;
  private busy = false;
  private closed = false;

  constructor(
    private scene: JobScene,
    readonly slot: Slot,
    readonly variant: number,
    from: { pos: Pt; angle: number } | null,
  ) {
    const ctx = scene.ctx;
    this.session = new CutSession(slot);
    this.skin = slotSkin(slot, variant);
    this.local = invert(this.skin.m);
    const l = ctx.layout;
    this.backdrop.rect(0, 0, l.width, l.height).fill({ color: 0x2a1e14, alpha: 0.6 });
    this.backdrop.eventMode = 'static';
    this.backdrop.hitArea = new Rectangle(0, 0, l.width, l.height);
    const L = scene.job.brickLength;
    const W = scene.job.brickWidth;
    this.S = Math.min((l.width - 48) / (L + 70), (l.height * 0.3) / (W + 110));
    this.bench.position.set(l.width / 2, l.height * 0.44);
    this.bench.scale.set(this.S);
    // A slate cutting bench under the brick
    // A wooden cutting bench under the brick.
    const bw = L + 70;
    const bh = W + 110;
    this.board
      .roundRect(-bw / 2 + 4, -bh / 2 + 10, bw, bh, 16)
      .fill({ color: 0x000000, alpha: 0.3 });
    this.board.roundRect(-bw / 2, -bh / 2, bw, bh, 16).fill(0x8a6646);
    this.board.roundRect(-bw / 2 + 5, -bh / 2 + 5, bw - 10, bh - 10, 12).fill(0x9b7552);
    for (let i = 0; i < 9; i++) {
      const y = -bh / 2 + 14 + i * ((bh - 28) / 8);
      this.board
        .moveTo(-bw / 2 + 12, y)
        .bezierCurveTo(-bw / 6, y + 3, bw / 6, y - 3, bw / 2 - 12, y + 1);
    }
    this.board.stroke({ width: 1.2, color: 0x7a5a3c, alpha: 0.45 });
    // Target outline in brick-local coords
    const tgt = applyRing(this.local, slot.target);
    const hull = applyRing(this.local, slot.hull);
    this.targetG.poly(flat(hull)).stroke({ width: 3 / this.S, color: THEME.chalk, alpha: 0.35 });
    this.targetG.poly(flat(tgt)).fill({ color: THEME.chalk, alpha: 0.16 });
    dashed(this.targetG, tgt, 9, 6);
    this.targetG.stroke({
      width: (3.2 / this.S) * 1.3,
      color: THEME.chalk,
      alpha: 0.95,
      cap: 'round',
    });
    this.bench.addChild(this.board, this.pieceNode, this.targetG, this.lineG, this.bladeG);
    this.layBtn = new Button(
      { icon: 'check', label: 'Lay it', width: 150, height: 54, fill: THEME.leaf, color: 0xffffff },
      () => void this.lay(),
    );
    this.undoBtn = new Button({ icon: 'undo', width: 54, height: 54 }, () => this.undoCut());
    this.closeBtn = new Button({ icon: 'close', width: 48, height: 48 }, () => void this.cancel());
    const by = Math.min(l.height - l.safe.bottom - 60, this.bench.y + (bh / 2) * this.S + 90);
    this.layBtn.position.set(l.width / 2 + 34, by);
    this.undoBtn.position.set(l.width / 2 - 86, by);
    this.closeBtn.position.set(l.width - l.safe.right - 34, l.safe.top + 34);
    this.meter.position.set(l.width / 2, this.bench.y + (bh / 2) * this.S + 30);
    this.hint.anchor.set(0.5);
    this.hint.position.set(l.width / 2, this.bench.y - (bh / 2) * this.S - 34);
    this.root.addChild(
      this.backdrop,
      this.bench,
      this.meter,
      this.hint,
      this.layBtn,
      this.undoBtn,
      this.closeBtn,
    );
    this.root.eventMode = 'static';
    this.backdrop.on('pointerdown', (e) => this.down(e));
    this.backdrop.on('globalpointermove', (e) => this.move(e));
    this.backdrop.on('pointerup', (e) => this.up(e));
    this.backdrop.on('pointerupoutside', (e) => this.up(e));
    this.bench.eventMode = 'none';
    this.drawPieceNode();
    this.updateUi();
    scene.splitterUndo = () => (this.session.cuts > 0 ? this.undoCut() : void this.cancel());
    this.enter(from);
  }

  private async enter(from: { pos: Pt; angle: number } | null): Promise<void> {
    const ctx = this.scene.ctx;
    const d = ctx.motion(0.28);
    this.backdrop.alpha = 0;
    const target = { x: this.bench.x, y: this.bench.y, s: this.S };
    const start = from
      ? this.scene.toScreen(from.pos)
      : [ctx.layout.width * 0.25, ctx.layout.height - 80];
    const s0 = this.scene.scale;
    const r0 = from ? from.angle - this.slot.angle : 0;
    this.busy = true;
    ctx.sfx.whoosh();
    await ctx.tweens.add(
      d,
      (v) => {
        this.backdrop.alpha = v;
        this.bench.position.set(
          start[0]! + (target.x - start[0]!) * v,
          start[1]! + (target.y - start[1]!) * v,
        );
        this.bench.scale.set(s0 + (target.s - s0) * v);
        this.bench.rotation = r0 * (1 - v);
        this.board.alpha = v;
        this.targetG.alpha = v;
      },
      { ease: ease.outCubic },
    ).promise;
    this.busy = false;
    this.scene.ctx.debug.splitter = this.debugApi();
  }

  private drawPieceNode(): void {
    for (const c of this.pieceNode.removeChildren()) c.destroy();
    const g = new Graphics();
    const sh = new Graphics();
    const localSkin: Skin = { variant: this.variant, m: [1, 0, 0, 1, 0, 0] };
    const piece = applyRing(this.local, this.session.piece);
    drawShadow(sh, piece, localSkin);
    drawPiece(
      g,
      this.scene.view.atlas,
      this.scene.job.brickLength,
      this.scene.job.brickWidth,
      piece,
      localSkin,
    );
    this.pieceNode.addChild(sh, g);
  }

  private updateUi(): void {
    const cuts = this.session.cuts;
    this.undoBtn.visible = cuts > 0;
    this.layBtn.visible = cuts > 0;
    this.closeBtn.visible = cuts === 0;
    const m = this.meter;
    m.clear();
    if (cuts > 0) {
      const acc = this.session.accuracy;
      const w = 160;
      m.roundRect(-w / 2, -5, w, 10, 5).fill({ color: 0xffffff, alpha: 0.18 });
      m.roundRect(-w / 2, -5, Math.max(10, w * acc), 10, 5).fill(
        acc >= CLEAN_ACCURACY ? 0x9fc46f : 0xe2a54b,
      );
      m.rect(-w / 2 + w * CLEAN_ACCURACY - 1, -9, 2, 18).fill({ color: 0xffffff, alpha: 0.7 });
    }
  }

  // ---- swipe ----------------------------------------------------------------------------

  private toLocal(e: FederatedPointerEvent): Pt {
    const p = this.bench.toLocal(e.global);
    return [p.x, p.y];
  }

  private down(e: FederatedPointerEvent): void {
    if (this.busy || this.swipe) return;
    const p = this.toLocal(e);
    this.swipe = { id: e.pointerId, a: p, b: p };
    this.drawLine();
  }

  private move(e: FederatedPointerEvent): void {
    if (!this.swipe || e.pointerId !== this.swipe.id) return;
    this.swipe.b = this.toLocal(e);
    this.drawLine();
  }

  private up(e: FederatedPointerEvent): void {
    if (!this.swipe || e.pointerId !== this.swipe.id) return;
    const { a, b } = this.swipe;
    this.swipe = null;
    this.lineG.clear();
    const px = Math.hypot(b[0] - a[0], b[1] - a[1]) * this.S;
    if (px < MIN_SWIPE_PX) return;
    void this.cutAlong(a, b);
  }

  /** The swipe extended to a full line across the bench. */
  private extended(a: Pt, b: Pt): [Pt, Pt] | null {
    const L = this.scene.job.brickLength;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    const ux = dx / len;
    const uy = dy / len;
    const far = L * 2;
    const box = rectRing(L + 80, L + 80).map((p) => [p[0], p[1] * 0.6] as Pt);
    return clipSegmentConvex(
      [a[0] - ux * far, a[1] - uy * far],
      [a[0] + ux * far, a[1] + uy * far],
      box,
    );
  }

  private drawLine(): void {
    const g = this.lineG;
    g.clear();
    if (!this.swipe) return;
    const { a, b } = this.swipe;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) * this.S < 6) return;
    const ext = this.extended(a, b);
    if (!ext) return;
    g.moveTo(ext[0][0], ext[0][1]).lineTo(ext[1][0], ext[1][1]);
    g.stroke({ width: 7 / this.S, color: 0xffffff, alpha: 0.18, cap: 'round' });
    dashedLine(g, ext[0], ext[1], 10, 7);
    g.stroke({ width: 2.4 / this.S, color: 0xffffff, alpha: 0.95, cap: 'round' });
    g.circle(a[0], a[1], 5 / this.S).fill({ color: 0xffffff, alpha: 0.9 });
    g.circle(b[0], b[1], 5 / this.S).fill({ color: 0xffffff, alpha: 0.9 });
  }

  /** Cut along a line given in brick-local coordinates. */
  async cutAlong(a: Pt, b: Pt): Promise<boolean> {
    if (this.busy || this.closed) return false;
    const ctx = this.scene.ctx;
    const ext = this.extended(a, b) ?? [a, b];
    const wa = apply(this.skin.m, ext[0]);
    const wb = apply(this.skin.m, ext[1]);
    const r = this.session.cut(wa, wb);
    if (!r) {
      ctx.sfx.softDrop();
      this.shake(0.12, 3);
      return false;
    }
    this.busy = true;
    await this.blade(ext[0], ext[1]);
    ctx.sfx.thunk();
    ctx.haptics.impact('medium');
    this.shake(0.18, 5);
    // The removed part slides away.
    const removedLocal = applyRing(this.local, r.removed);
    const keptLocal = applyRing(this.local, r.kept);
    const away = this.awayDir(keptLocal, removedLocal);
    const big = ringArea(r.removed) >= OFFCUT_MIN_FRACTION * this.scene.job.brickArea;
    const rem = new Container();
    const rg = new Graphics();
    drawPiece(
      rg,
      this.scene.view.atlas,
      this.scene.job.brickLength,
      this.scene.job.brickWidth,
      removedLocal,
      { variant: this.variant, m: [1, 0, 0, 1, 0, 0] },
    );
    rem.addChild(rg);
    this.bench.addChildAt(rem, this.bench.getChildIndex(this.pieceNode) + 1);
    this.drawPieceNode();
    this.updateUi();
    const slide = 40;
    await ctx.tweens.add(
      ctx.motion(0.22),
      (v) => {
        rem.position.set(away[0] * slide * v, away[1] * slide * v);
        rem.rotation = away[0] * 0.08 * v;
      },
      { ease: ease.outCubic },
    ).promise;
    // Off to the tray (or swept away if it's too small to keep).
    const to = big ? this.trayPoint() : null;
    await ctx.tweens.add(
      ctx.motion(0.32),
      (v) => {
        if (to) {
          rem.position.set(rem.x + (to[0] - rem.x) * v * 0.35, rem.y + (to[1] - rem.y) * v * 0.35);
          rem.scale.set(1 - 0.6 * v);
        } else {
          rem.position.y += 4 * v;
          rem.scale.set(1 - 0.3 * v);
        }
        rem.alpha = 1 - v;
      },
      { ease: ease.inQuad },
    ).promise;
    rem.destroy({ children: true });
    this.busy = false;
    if (this.session.clean) {
      await ctx.tweens.wait(ctx.motion(0.18));
      if (!this.closed && this.session.clean) await this.lay();
    }
    return true;
  }

  private trayPoint(): Pt {
    const l = this.scene.ctx.layout;
    const p = this.bench.toLocal({ x: l.width * 0.7, y: l.height - 70 });
    return [p.x, p.y];
  }

  private awayDir(kept: Ring, removed: Ring): Pt {
    const a = ringCentroid(kept);
    const b = ringCentroid(removed);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  }

  private async blade(a: Pt, b: Pt): Promise<void> {
    const ctx = this.scene.ctx;
    const g = this.bladeG;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const n: Pt = [-dy / len, dx / len];
    const ang = Math.atan2(dy, dx);
    g.clear();
    g.rect(-len / 2, -9, len, 18).fill(0x50565c);
    g.rect(-len / 2, -9, len, 6).fill(0x9aa3aa);
    g.rect(-len / 2, 5, len, 4).fill(0xd9dee2);
    g.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    g.rotation = ang;
    const lift = 70;
    const cx = g.x;
    const cy = g.y;
    await ctx.tweens.add(
      ctx.motion(0.12),
      (v) => {
        g.alpha = Math.min(1, v * 2);
        g.position.set(cx - n[0] * lift * (1 - v), cy - n[1] * lift * (1 - v));
        g.scale.set(1, 1.6 - 0.6 * v);
      },
      { ease: ease.inCubic },
    ).promise;
    void ctx.tweens.add(ctx.motion(0.3), (v) => (g.alpha = 1 - v), {
      delay: ctx.motion(0.08),
      onDone: () => g.clear(),
    });
  }

  private shake(seconds: number, px: number): void {
    const ctx = this.scene.ctx;
    if (ctx.reduceMotion) return;
    const x0 = this.scene.ctx.layout.width / 2;
    const y0 = this.scene.ctx.layout.height * 0.44;
    ctx.tweens.add(
      seconds,
      (v) => {
        const k = (1 - v) * px;
        this.bench.position.set(x0 + (Math.random() - 0.5) * k, y0 + (Math.random() - 0.5) * k);
      },
      { ease: ease.linear, onDone: () => this.bench.position.set(x0, y0) },
    );
  }

  undoCut(): void {
    if (this.busy || !this.session.undoCut()) return;
    this.scene.ctx.sfx.undo();
    this.drawPieceNode();
    this.updateUi();
  }

  /** Lay the current piece into the slot. */
  async lay(): Promise<void> {
    // A tap during the cut animation still counts: wait for it to settle.
    while (this.busy && !this.closed) await this.scene.ctx.tweens.wait(0.05);
    if (this.closed || this.session.cuts === 0) return;
    this.closed = true;
    this.busy = true;
    const scene = this.scene;
    const ctx = scene.ctx;
    const p = scene.commitCut(this.slot, this.variant, this.session.piece, this.session.removed);
    // Fly from the bench to the slot.
    const to = scene.toScreen(this.slot.center);
    const from = { x: this.bench.x, y: this.bench.y, s: this.bench.scale.x };
    this.layBtn.visible = this.undoBtn.visible = false;
    this.meter.visible = false;
    this.targetG.visible = false;
    this.lineG.clear();
    ctx.sfx.whoosh();
    await ctx.tweens.add(
      ctx.motion(0.34),
      (v) => {
        this.bench.position.set(from.x + (to[0] - from.x) * v, from.y + (to[1] - from.y) * v);
        this.bench.scale.set(from.s + (scene.scale - from.s) * v);
        this.bench.rotation = this.slot.angle * v;
        this.backdrop.alpha = 1 - v;
        this.board.alpha = 1 - v * 1.5;
      },
      { ease: ease.inOutCubic },
    ).promise;
    this.close();
    if (p) scene.landed(p, scene.skins.get(this.slot.id) ?? slotSkin(this.slot, this.variant));
  }

  async cancel(): Promise<void> {
    if (this.busy || this.closed || this.session.cuts > 0) return;
    this.closed = true;
    const ctx = this.scene.ctx;
    await ctx.tweens.add(ctx.motion(0.2), (v) => (this.root.alpha = 1 - v)).promise;
    this.close();
    this.scene.returnBrick(this.variant);
  }

  private close(): void {
    this.scene.splitterUndo = null;
    delete this.scene.ctx.debug.splitter;
    if (this.scene.mode === 'splitter') this.scene.mode = 'play';
    this.root.destroy({ children: true });
    this.scene.refresh();
  }

  private debugApi(): Record<string, unknown> {
    return {
      slotId: this.slot.id,
      cuts: () => this.session.cuts,
      accuracy: () => this.session.accuracy,
      /** Bench-local -> screen, for driving swipes in tests. */
      toScreen: (x: number, y: number) => {
        const p = this.bench.toGlobal({ x, y });
        return [p.x, p.y];
      },
      /** The ideal cuts in screen coordinates. */
      idealScreen: () =>
        this.scene.ctx.debug.job &&
        (this.scene.ctx.debug.job as { idealCutsScreen: (id: number) => [Pt, Pt][] })
          .idealCutsScreen(this.slot.id)
          .map(([a, b]) => {
            const la = apply(this.local, this.scene.toWorld(a));
            const lb = apply(this.local, this.scene.toWorld(b));
            const pa = this.bench.toGlobal({ x: la[0], y: la[1] });
            const pb = this.bench.toGlobal({ x: lb[0], y: lb[1] });
            return [
              [pa.x, pa.y],
              [pb.x, pb.y],
            ];
          }),
      lay: () => this.lay(),
      undoScreen: () => [this.undoBtn.x, this.undoBtn.y],
    };
  }
}

/** Open the splitter for a slot inside a job scene. */
export function attachSplitter(scene: JobScene): void {
  scene.splitterOpener = (slot, variant, from) => {
    const s = new Splitter(scene, slot, variant, from);
    scene.overlay.addChild(s.root);
  };
}

function dashedLine(g: Graphics, a: Pt, b: Pt, dash: number, gap: number): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  for (let t = 0; t < len; t += dash + gap) {
    const e = Math.min(len, t + dash);
    g.moveTo(a[0] + ux * t, a[1] + uy * t).lineTo(a[0] + ux * e, a[1] + uy * e);
  }
}

function dashed(g: Graphics, ring: Ring, dash: number, gap: number): void {
  for (let i = 0; i < ring.length; i++)
    dashedLine(g, ring[i]!, ring[(i + 1) % ring.length]!, dash, gap);
}
