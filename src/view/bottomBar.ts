/** The bottom bar: the brick pallet on the left, the offcut tray on the right, progress on top. */
import { Container, Graphics } from 'pixi.js';
import type { Offcut } from '../core/offcut';
import { compose, affine, type Affine } from '../core/affine';
import { rectRing, ringBBox, type Pt } from '../core/geom';
import { drawPiece, type Skin } from './jobView';
import type { BrickAtlas } from './textures';
import { THEME } from './theme';
import { text } from './ui';
import type { Text } from 'pixi.js';

export const TRAY_SLOTS = 6;

interface Well {
  x: number;
  y: number;
  w: number;
  h: number;
  node: Container;
  offcutId: number | null;
}

export class BottomBar extends Container {
  private bg = new Graphics();
  private progressBg = new Graphics();
  private progressFill = new Graphics();
  readonly palletNode = new Container();
  private palletBase = new Graphics();
  private palletStack = new Container();
  private wellsG = new Graphics();
  private wells: Well[] = [];
  private usedText: Text;
  private progressText: Text;
  width_ = 0;
  height_ = 0;
  /** Pallet hit area in bar coordinates. */
  palletRect = { x: 0, y: 0, w: 0, h: 0 };
  /** Screen scale (px per mm) used to draw pieces in the tray and pallet. */
  pieceScale = 0.3;

  constructor(
    private atlas: BrickAtlas,
    private L: number,
    private W: number,
    private showTray = true,
  ) {
    super();
    this.usedText = text('0', { fontSize: 15, fill: THEME.inkSoft });
    this.progressText = text('', { fontSize: 13, fill: THEME.inkSoft });
    this.palletNode.addChild(this.palletBase, this.palletStack);
    this.addChild(
      this.bg,
      this.progressBg,
      this.progressFill,
      this.palletNode,
      this.wellsG,
      this.usedText,
      this.progressText,
    );
    for (let i = 0; i < TRAY_SLOTS; i++) {
      const node = new Container();
      this.addChild(node);
      this.wells.push({ x: 0, y: 0, w: 0, h: 0, node, offcutId: null });
    }
  }

  layout(width: number, safeBottom: number): number {
    const h = 152 + safeBottom;
    this.width_ = width;
    this.height_ = h;
    const g = this.bg;
    g.clear();
    g.roundRect(0, -6, width, h + 30, 26).fill({ color: THEME.shadow, alpha: 0.12 });
    g.roundRect(0, 0, width, h + 30, 26).fill(THEME.paper);
    // Pallet on the left.
    const pw = Math.min(140, width * 0.34);
    this.palletRect = { x: 14, y: 24, w: pw, h: 100 };
    this.drawPallet();
    // Tray wells on the right: 3 x 2.
    const trayX = this.palletRect.x + pw + 16;
    const trayW = width - trayX - 14;
    const cols = 3;
    const gap = 8;
    const ww = (trayW - gap * (cols - 1)) / cols;
    const wh = 44;
    this.wellsG.clear();
    if (this.showTray) {
      this.wellsG
        .roundRect(trayX - 6, 22, trayW + 12, wh * 2 + gap + 12, 16)
        .fill({ color: THEME.paperShade, alpha: 0.9 });
      for (let i = 0; i < TRAY_SLOTS; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const well = this.wells[i]!;
        well.x = trayX + c * (ww + gap);
        well.y = 28 + r * (wh + gap);
        well.w = ww;
        well.h = wh;
        this.wellsG.roundRect(well.x, well.y, ww, wh, 10).fill({ color: 0xd8c8ad, alpha: 0.75 });
        this.wellsG
          .roundRect(well.x, well.y + 2, ww, wh - 2, 10)
          .fill({ color: 0xe3d5bd, alpha: 0.9 });
      }
    }
    // Tray pieces drawn at a fixed scale so sizes compare honestly.
    this.pieceScale = Math.min((ww * 0.9) / this.L, (wh * 0.92) / (this.W * 1.3));
    this.progressBg
      .clear()
      .roundRect(24, 9, width - 48, 5, 2.5)
      .fill({ color: THEME.paperShade });
    this.usedText.position.set(this.palletRect.x + 4, this.palletRect.y + this.palletRect.h + 2);
    this.progressText.anchor.set(1, 0);
    this.progressText.position.set(width - 22, 16);
    this.progressText.visible = false;
    return h;
  }

  private drawPallet(): void {
    const { x, y, w, h } = this.palletRect;
    const g = this.palletBase;
    g.clear();
    // wooden pallet slats
    const py = y + h - 34;
    g.roundRect(x + 2, py + 6, w - 4, 26, 6).fill({ color: THEME.shadow, alpha: 0.15 });
    for (let i = 0; i < 4; i++) {
      g.roundRect(x, py + i * 6.5, w, 5.5, 2).fill(i % 2 ? 0xb88a5a : 0xc89a68);
    }
    g.rect(x + 8, py + 2, 10, 24).fill(0xa47a4c);
    g.rect(x + w / 2 - 5, py + 2, 10, 24).fill(0xa47a4c);
    g.rect(x + w - 18, py + 2, 10, 24).fill(0xa47a4c);
  }

  /** Redraw the brick stack; `topVariant` is the next brick to come off the pallet. */
  setPallet(topVariant: number, nextVariants: number[]): void {
    for (const c of this.palletStack.removeChildren()) c.destroy();
    const { x, y, w, h } = this.palletRect;
    const s = this.palletScale();
    const bw = this.L * s;
    const bh = this.W * s;
    const baseY = y + h - 38;
    const rows = 3;
    const variants = [...nextVariants.slice(0, 7).reverse(), topVariant];
    let k = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 2; col++) {
        if (row === rows - 1 && col === 1) continue;
        const v = variants[k++ % variants.length]!;
        const cx =
          x + w / 2 + (col === 0 ? -bw / 2 - 1 : bw / 2 + 1) + (row === rows - 1 ? bw / 2 : 0);
        const cy = baseY - row * (bh + 2) - bh / 2 - 2;
        const last = row === rows - 1;
        const g = new Graphics();
        const skin: Skin = {
          variant: last ? topVariant : v,
          m: compose(affine(0, cx, cy), [s, 0, 0, s, 0, 0]),
        };
        const sh = new Graphics();
        sh.roundRect(cx - bw / 2 + 1, cy - bh / 2 + 3, bw, bh, 2).fill({
          color: THEME.shadow,
          alpha: 0.2,
        });
        drawPiece(g, this.atlas, this.L, this.W, scaledRect(this.L, this.W, s, cx, cy), skin, 1.5);
        this.palletStack.addChild(sh, g);
      }
    }
  }

  private palletScale(): number {
    const { w, h } = this.palletRect;
    // two bricks side by side, three rows above the pallet slats
    return Math.min((w * 0.44) / this.L, (h - 44) / (3 * this.W + 6));
  }

  /** Centre (bar coordinates) and scale of the top pallet brick, for fly-out animations. */
  palletTop(): { at: Pt; scale: number } {
    const { x, y, w, h } = this.palletRect;
    const s = this.palletScale();
    const bh = this.W * s;
    return { at: [x + w / 2 + (this.L * s) / 2, y + h - 38 - 2 * (bh + 2) - bh / 2 - 2], scale: s };
  }

  setUsed(n: number): void {
    this.usedText.text = `${n}`;
    this.usedText.visible = n > 0;
  }

  setProgress(filled: number, total: number): void {
    const w = (this.width_ - 48) * (total ? filled / total : 0);
    this.progressFill.clear();
    if (w > 0) this.progressFill.roundRect(24, 9, Math.max(5, w), 5, 2.5).fill(THEME.leaf);
    this.progressText.text = `${filled}/${total}`;
  }

  /** Show tray contents. `skins` maps offcut id -> skin in the offcut's local frame. */
  setTray(tray: Offcut[], skins: Map<number, Skin>, hidden: number | null = null): void {
    for (const w of this.wells) {
      for (const c of w.node.removeChildren()) c.destroy();
      w.offcutId = null;
    }
    if (!this.showTray) return;
    tray.slice(0, TRAY_SLOTS).forEach((o, i) => {
      const w = this.wells[i]!;
      w.offcutId = o.id;
      if (o.id === hidden) return;
      const skin = skins.get(o.id);
      if (!skin) return;
      const bb = ringBBox(o.shape);
      // Same scale for every piece so sizes compare honestly, shrunk only if it won't fit.
      const s = Math.min(
        this.pieceScale,
        (w.w * 0.88) / (bb.maxX - bb.minX),
        (w.h * 0.86) / (bb.maxY - bb.minY),
      );
      const cx = w.x + w.w / 2 - ((bb.minX + bb.maxX) / 2) * s;
      const cy = w.y + w.h / 2 - ((bb.minY + bb.maxY) / 2) * s;
      const toBar: Affine = [s, 0, 0, s, cx, cy];
      const g = new Graphics();
      const sh = new Graphics();
      const poly = o.shape.map((p) => [p[0] * s + cx, p[1] * s + cy] as Pt);
      sh.poly(poly.flat()).fill({ color: THEME.shadow, alpha: 0.2 });
      sh.position.set(1, 2);
      drawPiece(
        g,
        this.atlas,
        this.L,
        this.W,
        poly,
        { variant: skin.variant, m: compose(toBar, skin.m) },
        1.2,
      );
      w.node.addChild(sh, g);
    });
  }

  /** Which offcut (if any) is under a point in bar coordinates. */
  offcutAt(p: Pt): number | null {
    for (const w of this.wells) {
      if (w.offcutId === null) continue;
      if (p[0] >= w.x - 4 && p[0] <= w.x + w.w + 4 && p[1] >= w.y - 4 && p[1] <= w.y + w.h + 4)
        return w.offcutId;
    }
    return null;
  }

  wellCenter(offcutId: number): Pt | null {
    const w = this.wells.find((x) => x.offcutId === offcutId);
    return w ? [w.x + w.w / 2, w.y + w.h / 2] : null;
  }

  inPallet(p: Pt): boolean {
    const r = this.palletRect;
    return p[0] >= r.x - 6 && p[0] <= r.x + r.w + 6 && p[1] >= r.y - 10 && p[1] <= r.y + r.h + 6;
  }
}

function scaledRect(L: number, W: number, s: number, cx: number, cy: number): Pt[] {
  return rectRing(L * s, W * s).map((p) => [p[0] + cx, p[1] + cy] as Pt);
}
