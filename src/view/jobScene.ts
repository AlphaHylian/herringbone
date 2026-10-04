/**
 * The job screen: the patio in the middle, pallet and tray at the bottom, back/undo on top.
 * Handles drag-and-snap, tap-to-fill, offcuts, undo, and hands off to the splitter and the
 * finishing sequence.
 */
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import type { LevelData } from '../core/level';
import { buildJob, type Job, type Slot } from '../core/job';
import { CutSession, GameState, type Placement } from '../core/game';
import { affine, compose, translation, type Affine } from '../core/affine';
import { pointInRing, rectRing, type Pt } from '../core/geom';
import { rng, hashString } from '../core/rng';
import { solverBricks, solveJob } from '../core/solver';
import { idealCuts } from '../core/cut';
import type { OffcutFit } from '../core/offcut';
import type { Ctx, Scene } from './ctx';
import type { Layout } from './layout';
import { JobView, drawPiece, drawShadow, slotSkin, type Skin } from './jobView';
import { BottomBar } from './bottomBar';
import { Button, text } from './ui';
import { THEME } from './theme';
import { ease } from './tween';
import { softDot } from './textures';
import type { Text } from 'pixi.js';

export interface JobSceneOptions {
  /** Free Build: no rating, no saving. */
  free?: boolean;
  /** Called when the job is finished and the player continues. */
  onExit: () => void;
  /** Called when complete with the final state (for saving). */
  onComplete?: (state: GameState, skins: Map<number, Skin>) => void;
}

type Drag =
  | {
      kind: 'brick';
      pointerId: number;
      variant: number;
      node: Container;
      lift: number;
      angle: number;
      pos: Pt;
      target: Slot | null;
    }
  | {
      kind: 'offcut';
      pointerId: number;
      offcutId: number;
      node: Container;
      lift: number;
      pos: Pt;
      target: Slot | null;
      fit: OffcutFit | null;
    };

const SNAP = 0.62; // snap radius in brick lengths

export class JobScene implements Scene {
  readonly root = new Container();
  readonly job: Job;
  readonly state: GameState;
  readonly view: JobView;
  readonly cam = new Container();
  private ui = new Container();
  readonly overlay = new Container();
  private bar: BottomBar;
  private topBg = new Graphics();
  private backBtn: Button;
  private undoBtn: Button;
  private title: Text;
  private layout!: Layout;
  scale = 1;
  private drag: Drag | null = null;
  private tapStart: { id: number; at: Pt; t: number } | null = null;
  readonly skins = new Map<number, Skin>();
  readonly offcutSkins = new Map<number, Skin>();
  private fitCache = new Map<string, OffcutFit | null>();
  private variantRng: () => number;
  private nextVariants: number[] = [];
  mode: 'play' | 'splitter' | 'finish' | 'done' = 'play';
  private time = 0;
  private playTop = 0;
  private playBottom = 0;
  /** Hooks other modules (splitter, finish, tutorial) attach to. */
  splitterOpener:
    ((slot: Slot, variant: number, from: { pos: Pt; angle: number } | null) => void) | null = null;
  finisher: ((scene: JobScene) => Promise<void>) | null = null;
  onPlaced: ((p: Placement) => void) | null = null;

  constructor(
    readonly ctx: Ctx,
    readonly level: LevelData,
    readonly opts: JobSceneOptions,
  ) {
    this.job = buildJob(level);
    this.state = new GameState(this.job);
    this.view = new JobView(this.job);
    this.variantRng = rng(hashString(level.id) ^ 0x5eed);
    for (let i = 0; i < 8; i++) this.nextVariants.push(this.rollVariant());
    this.cam.addChild(this.view);
    this.bar = new BottomBar(this.view.atlas, this.job.brickLength, this.job.brickWidth, true);
    this.backBtn = new Button({ icon: 'back', width: 48, height: 48 }, () => this.exit());
    this.undoBtn = new Button({ icon: 'undo', width: 48, height: 48 }, () => this.undo());
    this.title = text(level.name, { fontSize: 19, fontWeight: '700' });
    this.title.anchor.set(0.5);
    this.ui.addChild(this.topBg, this.backBtn, this.undoBtn, this.title, this.bar);
    this.root.addChild(this.cam, this.ui, this.overlay);
    this.root.eventMode = 'static';
    this.root.on('pointerdown', (e) => this.onDown(e));
    this.root.on('globalpointermove', (e) => this.onMove(e));
    this.root.on('pointerup', (e) => this.onUp(e));
    this.root.on('pointerupoutside', (e) => this.onUp(e));
    this.refresh();
    this.exposeDebug();
  }

  // ---- layout and camera ----------------------------------------------------------------

  resize(l: Layout): void {
    this.layout = l;
    this.root.hitArea = new Rectangle(0, 0, l.width, l.height);
    const topH = l.safe.top + 64;
    this.topBg.clear().rect(0, 0, l.width, topH).fill({ color: THEME.bg, alpha: 0.0 });
    this.backBtn.position.set(l.safe.left + 34, l.safe.top + 34);
    this.undoBtn.position.set(l.width - l.safe.right - 34, l.safe.top + 34);
    this.title.position.set(l.width / 2, l.safe.top + 34);
    const barH = this.bar.layout(l.width, l.safe.bottom);
    this.bar.position.set(0, l.height - barH);
    this.playTop = topH;
    this.playBottom = l.height - barH;
    this.fitCamera();
    this.refresh();
  }

  /** Fit the job into the play area. */
  fitCamera(): void {
    const l = this.layout;
    const bb = this.job.bbox;
    const pad = 26;
    const kerb = 60;
    const w = bb.maxX - bb.minX + kerb * 2;
    const h = bb.maxY - bb.minY + kerb * 2;
    const availW = l.width - pad * 2 - l.safe.left - l.safe.right;
    const availH = this.playBottom - this.playTop - pad * 2;
    const s = Math.min(availW / w, availH / h);
    this.scale = s;
    this.cam.scale.set(s);
    const cx = (bb.minX + bb.maxX) / 2;
    const cy = (bb.minY + bb.maxY) / 2;
    this.cam.position.set(l.width / 2 - cx * s, (this.playTop + this.playBottom) / 2 - cy * s);
    this.view.drawGuides((id) => this.state.isFilled(id), s);
  }

  toWorld(p: Pt): Pt {
    return [(p[0] - this.cam.x) / this.cam.scale.x, (p[1] - this.cam.y) / this.cam.scale.y];
  }
  toScreen(p: Pt): Pt {
    return [p[0] * this.cam.scale.x + this.cam.x, p[1] * this.cam.scale.y + this.cam.y];
  }
  private toBar(p: Pt): Pt {
    return [p[0] - this.bar.x, p[1] - this.bar.y];
  }

  // ---- state refresh ----------------------------------------------------------------------

  private rollVariant(): number {
    return Math.floor(this.variantRng() * this.view.atlas.textures.length);
  }
  /** Take the top brick off the pallet. */
  takeVariant(): number {
    const v = this.nextVariants.shift()!;
    this.nextVariants.push(this.rollVariant());
    this.bar.setPallet(this.nextVariants[0]!, this.nextVariants.slice(1));
    return v;
  }

  refresh(): void {
    this.view.drawGuides((id) => this.state.isFilled(id), this.scale);
    this.bar.setPallet(this.nextVariants[0]!, this.nextVariants.slice(1));
    this.bar.setTray(
      this.state.tray,
      this.offcutSkins,
      this.drag?.kind === 'offcut' ? this.drag.offcutId : null,
    );
    this.bar.setUsed(this.state.bricksUsed);
    this.bar.setProgress(this.state.filledCount, this.job.slots.length);
    this.undoBtn.setEnabled(
      this.state.historyLength > 0 && this.mode !== 'finish' && this.mode !== 'done',
    );
  }

  // ---- input --------------------------------------------------------------------------------

  private onDown(e: FederatedPointerEvent): void {
    this.ctx.sfx.unlock();
    if (this.mode !== 'play' || this.drag) return;
    const g: Pt = [e.global.x, e.global.y];
    const b = this.toBar(g);
    const lift = e.pointerType === 'mouse' ? 0 : 44;
    if (this.bar.inPallet(b)) {
      this.startBrickDrag(e.pointerId, g, lift);
      return;
    }
    const off = this.bar.offcutAt(b);
    if (off !== null) {
      this.startOffcutDrag(e.pointerId, off, g, lift);
      return;
    }
    if (g[1] > this.playTop - 10 && g[1] < this.playBottom)
      this.tapStart = { id: e.pointerId, at: g, t: this.time };
  }

  private onMove(e: FederatedPointerEvent): void {
    const g: Pt = [e.global.x, e.global.y];
    if (this.drag && e.pointerId === this.drag.pointerId) this.updateDrag(g);
    if (this.tapStart && e.pointerId === this.tapStart.id) {
      if (Math.hypot(g[0] - this.tapStart.at[0], g[1] - this.tapStart.at[1]) > 14)
        this.tapStart = null;
    }
  }

  private onUp(e: FederatedPointerEvent): void {
    const g: Pt = [e.global.x, e.global.y];
    if (this.drag && e.pointerId === this.drag.pointerId) {
      this.endDrag(g);
      return;
    }
    if (this.tapStart && e.pointerId === this.tapStart.id) {
      this.tapStart = null;
      if (this.mode === 'play') this.tapAt(g);
    }
  }

  // ---- dragging -----------------------------------------------------------------------------

  private makeBrickNode(variant: number): Container {
    const node = new Container();
    const sh = new Graphics();
    const g = new Graphics();
    const r = rectRing(this.job.brickLength, this.job.brickWidth);
    const skin: Skin = { variant, m: affine(0, 0, 0) };
    drawShadow(sh, r, skin);
    sh.label = 'shadow';
    drawPiece(g, this.view.atlas, this.job.brickLength, this.job.brickWidth, r, skin);
    node.addChild(sh, g);
    return node;
  }

  private startBrickDrag(pointerId: number, g: Pt, lift: number): void {
    const variant = this.takeVariant();
    const node = this.makeBrickNode(variant);
    this.view.over.addChild(node);
    const top = this.bar.palletTop();
    const from = this.toWorld([top.at[0] + this.bar.x, top.at[1] + this.bar.y]);
    node.position.set(from[0], from[1]);
    const s0 = top.scale / this.scale;
    node.scale.set(s0);
    this.ctx.tweens.add(this.ctx.motion(0.14), (v) => node.scale.set(s0 + (1.06 - s0) * v));
    this.drag = {
      kind: 'brick',
      pointerId,
      variant,
      node,
      lift,
      angle: 0,
      pos: from,
      target: null,
    };
    this.ctx.sfx.pickup();
    this.ctx.haptics.tick();
    this.updateDrag(g);
  }

  private startOffcutDrag(pointerId: number, offcutId: number, g: Pt, lift: number): void {
    const o = this.state.tray.find((x) => x.id === offcutId);
    const skin = this.offcutSkins.get(offcutId);
    if (!o || !skin) return;
    const node = new Container();
    const sh = new Graphics();
    sh.label = 'shadow';
    const pg = new Graphics();
    drawShadow(sh, o.shape, skin);
    drawPiece(pg, this.view.atlas, this.job.brickLength, this.job.brickWidth, o.shape, skin);
    node.addChild(sh, pg);
    this.view.over.addChild(node);
    const wc = this.bar.wellCenter(offcutId) ?? this.toBar(g);
    const from = this.toWorld([wc[0] + this.bar.x, wc[1] + this.bar.y]);
    node.position.set(from[0], from[1]);
    const s0 = this.bar.pieceScale / this.scale;
    node.scale.set(s0);
    this.ctx.tweens.add(this.ctx.motion(0.14), (v) => node.scale.set(s0 + (1.06 - s0) * v));
    this.drag = {
      kind: 'offcut',
      pointerId,
      offcutId,
      node,
      lift,
      pos: from,
      target: null,
      fit: null,
    };
    this.bar.setTray(this.state.tray, this.offcutSkins, offcutId);
    this.ctx.sfx.pickup();
    this.ctx.haptics.tick();
    this.updateDrag(g);
  }

  /** Nearest empty slot to a world point within the snap radius. */
  private nearestSlot(p: Pt, kind?: 'edge'): Slot | null {
    const R = SNAP * this.job.brickLength;
    let best: Slot | null = null;
    let bd = R * R;
    for (const s of this.job.slots) {
      if (this.state.isFilled(s.id) || (kind && s.kind !== kind)) continue;
      const c = s.kind === 'full' ? s.center : s.centroid;
      const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    // A point inside a target always wins.
    for (const s of this.job.slots) {
      if (this.state.isFilled(s.id) || (kind && s.kind !== kind)) continue;
      if (pointInRing(p, s.kind === 'full' ? s.rect : s.target)) return s;
    }
    return best;
  }

  private offcutFit(offcutId: number, slotId: number): OffcutFit | null {
    const key = `${offcutId}:${slotId}`;
    if (!this.fitCache.has(key)) this.fitCache.set(key, this.state.offcutFit(offcutId, slotId));
    return this.fitCache.get(key) ?? null;
  }

  private updateDrag(g: Pt): void {
    const d = this.drag;
    if (!d) return;
    const finger = this.toWorld([g[0], g[1] - d.lift]);
    d.pos = finger;
    const prev = d.target;
    if (d.kind === 'brick') {
      const s = this.nearestSlot(finger);
      d.target = s;
      let x = finger[0];
      let y = finger[1];
      let angle: number;
      if (s) {
        const c = s.kind === 'full' ? s.center : s.centroid;
        const dist = Math.hypot(c[0] - finger[0], c[1] - finger[1]);
        const k =
          s.kind === 'full' ? 0.25 + 0.6 * smooth(1 - dist / (SNAP * this.job.brickLength)) : 0.15;
        x += (s.center[0] - x) * k;
        y += (s.center[1] - y) * k;
        angle = nearestEquivalent(s.angle, d.angle);
        angle = d.angle + (angle - d.angle) * Math.min(1, k * 1.6);
      } else {
        angle = d.angle * 0.8;
      }
      d.angle = angle;
      d.node.position.set(x, y);
      d.node.rotation = angle;
      this.view.setHighlight(s, s?.kind === 'edge' ? 'cut' : 'snap', this.scale);
    } else {
      const s = this.nearestSlot(finger, 'edge');
      d.target = s;
      d.fit = s ? this.offcutFit(d.offcutId, s.id) : null;
      if (s && d.fit) {
        const f = d.fit;
        const c = s.centroid;
        const dist = Math.hypot(c[0] - finger[0], c[1] - finger[1]);
        const k = 0.3 + 0.6 * smooth(1 - dist / (SNAP * this.job.brickLength));
        d.node.position.set(
          finger[0] + (f.offset[0] - finger[0]) * k,
          finger[1] + (f.offset[1] - finger[1]) * k,
        );
        const ang = nearestEquivalent(f.angle, 0, 2 * Math.PI);
        d.node.rotation = ang * k;
        d.node.scale.x = (f.mirrored ? 1 - 2 * k : 1) * 1.06;
        this.view.setHighlight(s, 'fit', this.scale);
      } else {
        d.node.position.set(finger[0], finger[1]);
        d.node.rotation *= 0.7;
        d.node.scale.x = Math.abs(d.node.scale.x);
        this.view.setHighlight(s, s ? 'bad' : 'snap', this.scale);
      }
    }
    if (d.target && d.target !== prev) this.ctx.haptics.tick();
  }

  private endDrag(g: Pt): void {
    const d = this.drag;
    if (!d) return;
    this.updateDrag(g);
    this.drag = null;
    this.view.setHighlight(null, 'snap', this.scale);
    if (d.kind === 'brick') {
      const s = d.target;
      if (s && s.kind === 'full') {
        const p = this.state.placeFull(s.id)!;
        this.animateTo(d.node, s.center, s.angle, 1, this.ctx.motion(0.09)).then(() => {
          d.node.destroy();
          this.landed(p, slotSkin(s, d.variant));
        });
        return;
      }
      if (s && s.kind === 'edge') {
        const pos: Pt = [d.node.x, d.node.y];
        const angle = d.node.rotation;
        d.node.destroy();
        this.openSplitter(s, d.variant, { pos, angle });
        return;
      }
      // Back to the pallet.
      this.returnToBar(d.node, this.bar.palletTop().at, this.bar.palletTop().scale, () => {
        this.nextVariants.unshift(d.variant);
        this.nextVariants.pop();
        this.refresh();
      });
      return;
    }
    // Offcut
    const s = d.target;
    if (s && d.fit) {
      const fit = d.fit;
      const skin = this.offcutSkins.get(d.offcutId)!;
      const res = this.state.placeOffcut(d.offcutId, s.id);
      if (res) {
        this.fitCache.clear();
        d.node.scale.y = 1;
        this.ctx.tweens
          .add(this.ctx.motion(0.1), (v) => {
            d.node.position.set(
              d.node.x + (fit.offset[0] - d.node.x) * v,
              d.node.y + (fit.offset[1] - d.node.y) * v,
            );
            d.node.rotation = d.node.rotation + (fit.angle - d.node.rotation) * v;
            const sx = fit.mirrored ? -1 : 1;
            d.node.scale.x = d.node.scale.x + (sx - d.node.scale.x) * v;
            d.node.scale.y = 1;
          })
          .promise.then(() => {
            d.node.destroy();
            const fitM: Affine = affine(fit.angle, fit.offset[0], fit.offset[1], fit.mirrored);
            this.landed(res.placement, { variant: skin.variant, m: compose(fitM, skin.m) });
          });
        return;
      }
    }
    if (s && !d.fit) {
      this.ctx.sfx.softDrop();
      this.wiggle(s);
    }
    const wc = this.bar.wellCenter(d.offcutId);
    this.returnToBar(d.node, wc ?? this.bar.palletTop().at, this.bar.pieceScale, () =>
      this.refresh(),
    );
  }

  private returnToBar(node: Container, at: Pt, scale: number, done: () => void): void {
    const to = this.toWorld([at[0] + this.bar.x, at[1] + this.bar.y]);
    const s1 = scale / this.scale;
    const from: Pt = [node.x, node.y];
    const s0 = node.scale.y;
    const r0 = node.rotation;
    this.ctx.tweens
      .add(
        this.ctx.motion(0.2),
        (v) => {
          node.position.set(from[0] + (to[0] - from[0]) * v, from[1] + (to[1] - from[1]) * v);
          node.scale.set(s0 + (s1 - s0) * v);
          node.rotation = r0 * (1 - v);
        },
        { ease: ease.inOutCubic },
      )
      .promise.then(() => {
        node.destroy();
        done();
      });
  }

  private animateTo(
    node: Container,
    pos: Pt,
    angle: number,
    scale: number,
    dur: number,
  ): Promise<void> {
    const from: Pt = [node.x, node.y];
    const a0 = node.rotation;
    const a1 = nearestEquivalent(angle, a0);
    const s0 = node.scale.x;
    return this.ctx.tweens.add(dur, (v) => {
      node.position.set(from[0] + (pos[0] - from[0]) * v, from[1] + (pos[1] - from[1]) * v);
      node.rotation = a0 + (a1 - a0) * v;
      node.scale.set(s0 + (scale - s0) * v);
    }).promise;
  }

  private wiggle(s: Slot): void {
    this.view.setHighlight(s, 'bad', this.scale);
    this.ctx.tweens.add(this.ctx.motion(0.4), (v) => (this.view.highlight.alpha = 1 - v), {
      onDone: () => {
        this.view.setHighlight(null, 'snap', this.scale);
        this.view.highlight.alpha = 1;
      },
    });
  }

  // ---- taps -----------------------------------------------------------------------------

  private tapAt(g: Pt): void {
    const w = this.toWorld(g);
    let hit: Slot | null = null;
    for (const s of this.job.slots) {
      if (this.state.isFilled(s.id)) continue;
      if (pointInRing(w, s.kind === 'full' ? s.rect : s.target)) {
        hit = s;
        break;
      }
    }
    if (!hit) hit = this.nearestSlotWithin(w, 0.25 * this.job.brickLength);
    if (!hit) return;
    if (hit.kind === 'full') this.flyBrickTo(hit);
    else this.openSplitter(hit, this.takeVariant(), null);
  }

  private nearestSlotWithin(p: Pt, r: number): Slot | null {
    let best: Slot | null = null;
    let bd = r * r;
    for (const s of this.job.slots) {
      if (this.state.isFilled(s.id)) continue;
      const d = (s.centroid[0] - p[0]) ** 2 + (s.centroid[1] - p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Tap-to-fill: a brick flies from the pallet into a full slot. */
  flyBrickTo(s: Slot, instant = false): void {
    const variant = this.takeVariant();
    const p = this.state.placeFull(s.id);
    if (!p) return;
    if (instant) {
      this.landed(p, slotSkin(s, variant), true);
      return;
    }
    const node = this.makeBrickNode(variant);
    this.view.over.addChild(node);
    const top = this.bar.palletTop();
    const from = this.toWorld([top.at[0] + this.bar.x, top.at[1] + this.bar.y]);
    node.position.set(from[0], from[1]);
    const s0 = top.scale / this.scale;
    node.scale.set(s0);
    const dur = this.ctx.motion(0.26);
    const a1 = s.angle;
    const seq = p.seq;
    const shadow = node.getChildByLabel('shadow');
    this.ctx.tweens
      .add(
        dur,
        (v) => {
          const arc = Math.sin(v * Math.PI) * 0.12;
          node.position.set(
            from[0] + (s.center[0] - from[0]) * v,
            from[1] + (s.center[1] - from[1]) * v,
          );
          node.rotation = a1 * v;
          node.scale.set(s0 + (1 - s0) * v + arc);
          if (shadow) shadow.alpha = 0.6 + arc * 3;
        },
        { ease: ease.inOutCubic },
      )
      .promise.then(() => {
        node.destroy();
        if (this.state.placements[s.id]?.seq === seq) this.landed(p, slotSkin(s, variant));
      });
    this.ctx.sfx.whoosh();
  }

  // ---- splitter and offcuts -------------------------------------------------------------------

  openSplitter(s: Slot, variant: number, from: { pos: Pt; angle: number } | null): void {
    if (this.splitterOpener) {
      this.mode = 'splitter';
      this.splitterOpener(s, variant, from);
    } else {
      // Without a splitter the brick goes back to the pallet.
      this.nextVariants.unshift(variant);
      this.nextVariants.pop();
      this.refresh();
    }
  }

  /** Called by the splitter when a cut piece is laid. */
  commitCut(s: Slot, variant: number, piece: Pt[], removed: Pt[][]): Placement | null {
    const before = new Set(this.state.tray.map((o) => o.id));
    const p = this.state.placeCut(s.id, piece, removed);
    if (!p) return null;
    const skin = slotSkin(s, variant);
    this.skins.set(s.id, skin);
    for (const o of this.state.tray) {
      if (before.has(o.id)) continue;
      this.offcutSkins.set(o.id, {
        variant,
        m: compose(translation(-o.origin[0], -o.origin[1]), skin.m),
      });
    }
    this.fitCache.clear();
    return p;
  }

  /** Splitter closed without laying: put the brick back. */
  returnBrick(variant: number): void {
    this.nextVariants.unshift(variant);
    this.nextVariants.pop();
    this.mode = 'play';
    this.refresh();
  }

  // ---- landing, undo, completion --------------------------------------------------------------

  landed(p: Placement, skin: Skin, quiet = false): void {
    this.skins.set(p.slotId, skin);
    const v = this.view.addPiece(p, skin);
    if (!quiet) {
      const sh = v.sh;
      const g = v.g;
      const baseX = sh.x;
      const baseY = sh.y;
      const ox = 10;
      const oy = 14;
      const isSlotSkin = p.kind !== 'offcut';
      this.ctx.tweens.add(
        this.ctx.motion(0.16),
        (t) => {
          sh.position.set(baseX + ox * (1 - t), baseY + oy * (1 - t));
          if (isSlotSkin) g.scale.set(1.05 - 0.05 * t);
        },
        { ease: ease.outBack },
      );
      this.dust(p);
      this.ctx.sfx.clack(p.kind === 'brick' ? 1 : 0.85);
      this.ctx.haptics.impact('light');
    }
    this.refresh();
    this.onPlaced?.(p);
    if (this.state.isComplete() && this.mode !== 'finish' && this.mode !== 'done')
      void this.complete();
  }

  private dust(p: Placement): void {
    if (this.ctx.reduceMotion) return;
    const tex = softDot();
    const r = rng(p.seq * 31 + 7);
    const poly = p.polygon;
    for (let i = 0; i < 7; i++) {
      const a = poly[Math.floor(r() * poly.length)]!;
      const b = poly[(poly.indexOf(a) + 1) % poly.length]!;
      const t = r();
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      const dot = new Graphics();
      dot.circle(0, 0, 14).fill({ color: 0xe9dcc0, alpha: 0.7 });
      dot.position.set(x, y);
      void tex;
      this.view.fx.addChild(dot);
      const dx = (r() - 0.5) * 60;
      const dy = (r() - 0.5) * 60;
      const s0 = 0.4 + r() * 0.5;
      this.ctx.tweens.add(
        0.5 + r() * 0.3,
        (v) => {
          dot.position.set(x + dx * v, y + dy * v);
          dot.scale.set(s0 + v * 1.2);
          dot.alpha = 0.6 * (1 - v);
        },
        { ease: ease.outQuad, onDone: () => dot.destroy() },
      );
    }
  }

  undo(): void {
    if (this.mode === 'finish' || this.mode === 'done') return;
    if (this.mode === 'splitter') {
      this.splitterUndo?.();
      return;
    }
    const slotId = this.state.undo();
    if (slotId === null) return;
    this.fitCache.clear();
    const v = this.view.piece(slotId);
    if (v && !this.ctx.reduceMotion) {
      const { g, sh } = v;
      this.view.bricks.removeChild(g);
      this.view.shadows.removeChild(sh);
      this.view.over.addChild(sh, g);
      this.ctx.tweens.add(
        0.18,
        (t) => {
          g.alpha = 1 - t;
          sh.alpha = 1 - t;
          sh.position.set(sh.x + 1, sh.y + 1.5);
        },
        {
          onDone: () => {
            g.destroy();
            sh.destroy();
          },
        },
      );
      // forget the view entry without destroying the fading graphics
      this.view.forget(slotId);
    } else {
      this.view.removePiece(slotId);
    }
    this.skins.delete(slotId);
    this.ctx.sfx.undo();
    this.ctx.haptics.tick();
    this.refresh();
  }

  /** Set by the splitter while open. */
  splitterUndo: (() => void) | null = null;

  private async complete(): Promise<void> {
    this.mode = 'finish';
    this.refresh();
    this.state.solverBricks = solverBricks(this.job);
    this.opts.onComplete?.(this.state, this.skins);
    if (this.finisher) await this.finisher(this);
    this.mode = 'done';
  }

  exit(): void {
    this.opts.onExit();
  }

  update(dt: number): void {
    this.time += dt;
  }

  destroy(): void {
    delete this.ctx.debug.job;
    this.root.destroy({ children: true });
  }

  // ---- test hooks -----------------------------------------------------------------------------

  private exposeDebug(): void {
    this.ctx.debug.job = {
      id: this.level.id,
      slots: () => this.job.slots.length,
      filled: () => this.state.filledCount,
      complete: () => this.state.isComplete(),
      mode: () => this.mode,
      bricksUsed: () => this.state.bricksUsed,
      tray: () => this.state.tray.length,
      /** Screen position of a slot's centre, for driving real pointer input. */
      slotScreen: (id: number) => this.toScreen(this.job.slots[id]!.centroid),
      fullSlots: () =>
        this.job.slots
          .filter((s) => s.kind === 'full' && !this.state.isFilled(s.id))
          .map((s) => s.id),
      edgeSlots: () =>
        this.job.slots
          .filter((s) => s.kind === 'edge' && !this.state.isFilled(s.id))
          .map((s) => s.id),
      palletScreen: () => {
        const t = this.bar.palletTop();
        return [t.at[0] + this.bar.x, t.at[1] + this.bar.y];
      },
      /** Ideal cut lines for an edge slot, in screen coordinates. */
      idealCutsScreen: (id: number) =>
        idealCuts(this.job.slots[id]!, this.job.brickWidth).map(([a, b]) => [
          this.toScreen(a),
          this.toScreen(b),
        ]),
      /** Finish the job with the solver, through the same placement paths the UI uses. */
      solve: () => this.solveAll(),
    };
  }

  /** Fill everything with the solver (used by tests and the debug menu). */
  solveAll(): void {
    const plan = solveJob(this.job);
    for (const step of plan.steps) {
      if (this.state.isFilled(step.slotId)) continue;
      const s = this.job.slots[step.slotId]!;
      if (step.type === 'full') {
        this.landed(this.state.placeFull(s.id)!, slotSkin(s, this.takeVariant()), true);
      } else if (step.type === 'cut') {
        const cut = cutWith(s, step.cuts);
        const p = this.commitCut(s, this.takeVariant(), cut.piece, cut.removed);
        if (p) this.landed(p, this.skins.get(s.id) ?? slotSkin(s, 0), true);
      } else {
        // Use any tray piece that fits (the tray may differ from the solver's own run if the
        // player already laid some pieces); otherwise cut a fresh brick.
        const hit = this.state.tray.find((o) => this.state.offcutFit(o.id, s.id));
        if (hit) {
          const fit = this.state.offcutFit(hit.id, s.id)!;
          const skin = this.offcutSkins.get(hit.id)!;
          const res = this.state.placeOffcut(hit.id, s.id)!;
          this.landed(
            res.placement,
            {
              variant: skin.variant,
              m: compose(affine(fit.angle, fit.offset[0], fit.offset[1], fit.mirrored), skin.m),
            },
            true,
          );
        } else {
          const cut = cutWith(
            s,
            idealCuts(s, this.job.brickWidth).map(([a, b]) => [a[0], a[1], b[0], b[1]]),
          );
          const p = this.commitCut(s, this.takeVariant(), cut.piece, cut.removed);
          if (p) this.landed(p, this.skins.get(s.id) ?? slotSkin(s, 0), true);
        }
      }
    }
  }
}

function cutWith(
  s: Slot,
  cuts: [number, number, number, number][],
): { piece: Pt[]; removed: Pt[][] } {
  const session = new CutSession(s);
  for (const c of cuts) session.cut([c[0], c[1]], [c[2], c[3]]);
  return { piece: session.piece, removed: [...session.removed] };
}

function smooth(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** The angle equivalent to `a` (mod period) closest to `ref`. Bricks look the same turned 180°. */
export function nearestEquivalent(a: number, ref: number, period = Math.PI): number {
  let x = a;
  while (x - ref > period / 2) x -= period;
  while (ref - x > period / 2) x += period;
  return x;
}
