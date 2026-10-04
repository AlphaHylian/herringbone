/**
 * The first-job tutorial, wordless: a ghost hand drags a brick into place, then carries one to
 * an edge, then shows the swipe in the splitter. Each step waits for the player to do it.
 */
import { Container, Graphics } from 'pixi.js';
import type { JobScene } from './jobScene';
import type { Slot } from '../core/job';
import { rectRing, type Pt } from '../core/geom';
import { drawPiece } from './jobView';
import { THEME } from './theme';

type Step = 'drag' | 'edge' | 'cut' | 'done';

function makeHand(): Container {
  const c = new Container();
  const g = new Graphics();
  const draw = (fill: number, alpha: number, grow: number): void => {
    g.roundRect(-9 - grow, -2 - grow, 18 + grow * 2, 44 + grow * 2, 9 + grow).fill({
      color: fill,
      alpha,
    }); // finger
    g.roundRect(-14 - grow, 26 - grow, 52 + grow * 2, 46 + grow * 2, 18 + grow).fill({
      color: fill,
      alpha,
    }); // palm
    g.roundRect(8 - grow, 18 - grow, 14 + grow * 2, 26 + grow * 2, 7 + grow).fill({
      color: fill,
      alpha,
    });
    g.roundRect(20 - grow, 21 - grow, 13 + grow * 2, 24 + grow * 2, 7 + grow).fill({
      color: fill,
      alpha,
    });
  };
  draw(THEME.shadow, 0.2, 3);
  draw(0xffffff, 0.95, 0);
  c.addChild(g);
  c.rotation = -0.35;
  return c;
}

export class Tutorial {
  private step: Step = 'drag';
  private hand = makeHand();
  private ring = new Graphics();
  private ghost = new Container();
  private t = 0;
  private edgeSlot: Slot | null = null;

  constructor(
    private scene: JobScene,
    private onDone: () => void,
  ) {
    scene.top.addChild(this.ring, this.ghost, this.hand);
    this.hand.alpha = 0;
    scene.tickers.push((dt) => this.tick(dt));
    scene.ctx.debug.tutorial = () => this.step;
  }

  private fullTarget(): Slot | null {
    const sc = this.scene;
    const bottom = sc.toWorld([sc.ctx.layout.width / 2, sc.ctx.layout.height]);
    return sc.state.nearestEmpty(bottom, 'full');
  }

  private tick(dt: number): void {
    const sc = this.scene;
    this.t += dt;
    // Advance on what the player has done.
    if (this.step === 'drag' && sc.state.filledCount > 0) this.go('edge');
    if ((this.step === 'drag' || this.step === 'edge') && sc.activeSplitter) this.go('cut');
    if (this.step === 'cut' && !sc.activeSplitter) {
      const anyEdge = sc.job.slots.some((s) => s.kind === 'edge' && sc.state.isFilled(s.id));
      this.go(anyEdge ? 'done' : 'edge');
    }
    if (this.step === 'done') return;
    if (sc.mode !== 'play' && sc.mode !== 'splitter') {
      this.hand.alpha = 0;
      return;
    }
    const cycle = 2.6;
    const k = (this.t % cycle) / cycle;
    if (this.step === 'drag' || this.step === 'edge') {
      const slot = this.step === 'drag' ? this.fullTarget() : this.pickEdge();
      if (!slot) return;
      const from = sc.debugPallet();
      const to = sc.toScreen(this.step === 'drag' ? slot.center : slot.centroid);
      this.animateDrag(from, to, k, slot);
    } else {
      this.ghost.visible = false;
      const sp = sc.activeSplitter;
      if (!sp || sp.isBusy || sp.session.cuts > 0) {
        this.hand.alpha = 0;
        this.ring.clear();
        return;
      }
      const lines = sp.idealLinesScreen();
      if (!lines.length) return;
      const [a, b] = lines[0]!;
      const d: Pt = [b[0] - a[0], b[1] - a[1]];
      const p0: Pt = [a[0] - d[0] * 0.25, a[1] - d[1] * 0.25];
      const p1: Pt = [b[0] + d[0] * 0.25, b[1] + d[1] * 0.25];
      const m = Math.min(1, Math.max(0, (k - 0.2) / 0.55));
      const e = m * m * (3 - 2 * m);
      this.hand.position.set(p0[0] + (p1[0] - p0[0]) * e, p0[1] + (p1[1] - p0[1]) * e);
      this.hand.alpha = k < 0.1 ? k * 10 : k > 0.85 ? (1 - k) / 0.15 : 1;
      this.ring.clear();
      if (k > 0.2 && k < 0.85) {
        const q: Pt = [this.hand.x, this.hand.y];
        this.ring
          .moveTo(p0[0], p0[1])
          .lineTo(q[0], q[1])
          .stroke({ width: 3, color: 0xffffff, alpha: 0.7, cap: 'round' });
      }
    }
  }

  private pickEdge(): Slot | null {
    const sc = this.scene;
    if (this.edgeSlot && !sc.state.isFilled(this.edgeSlot.id)) return this.edgeSlot;
    const bottom = sc.toWorld([sc.ctx.layout.width / 2, sc.ctx.layout.height]);
    this.edgeSlot = sc.state.nearestEmpty(bottom, 'edge');
    return this.edgeSlot;
  }

  private animateDrag(from: Pt, to: Pt, k: number, slot: Slot): void {
    const sc = this.scene;
    const press = 0.15;
    const travel = 0.65;
    let p: Pt;
    if (k < press) p = from;
    else if (k < travel) {
      const m = (k - press) / (travel - press);
      const e = m * m * (3 - 2 * m);
      p = [
        from[0] + (to[0] - from[0]) * e,
        from[1] + (to[1] - from[1]) * e - Math.sin(e * Math.PI) * 30,
      ];
    } else p = to;
    this.hand.position.set(p[0], p[1]);
    this.hand.scale.set(k > press * 0.6 && k < travel + 0.05 ? 0.9 : 1);
    this.hand.alpha = k < 0.08 ? k / 0.08 : k > 0.88 ? (1 - k) / 0.12 : 1;
    // A ghost brick rides along under the finger.
    if (this.ghost.children.length === 0) {
      const g = new Graphics();
      const L = sc.job.brickLength;
      const W = sc.job.brickWidth;
      drawPiece(g, sc.view.atlas, L, W, rectRing(L, W), { variant: 0, m: [1, 0, 0, 1, 0, 0] });
      this.ghost.addChild(g);
    }
    this.ghost.visible = k > press && k < travel + 0.1;
    this.ghost.alpha = 0.55;
    this.ghost.scale.set(sc.scale);
    this.ghost.position.set(p[0], p[1]);
    this.ghost.rotation =
      k >= travel ? slot.angle : slot.angle * Math.max(0, (k - press) / (travel - press));
    this.ring.clear();
    if (k > travel - 0.05) {
      const c = sc.toScreen(slot.kind === 'full' ? slot.center : slot.centroid);
      const r = 26 + (k - travel) * 60;
      this.ring
        .circle(c[0], c[1], r)
        .stroke({ width: 3, color: 0xffffff, alpha: Math.max(0, 0.8 - (k - travel) * 2.5) });
    }
  }

  private go(s: Step): void {
    if (this.step === s) return;
    this.step = s;
    this.t = 0;
    for (const c of this.ghost.removeChildren()) c.destroy();
    this.ring.clear();
    if (s === 'done') {
      this.hand.destroy();
      this.ring.destroy();
      this.ghost.destroy();
      this.onDone();
    }
  }
}
