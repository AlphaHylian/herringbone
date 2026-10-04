/**
 * Draws a job in world space (millimetres): grass, sand bed, kerb edging, chalk guides for empty
 * slots, and the laid pieces with soft shadows. The parent positions and scales it (the camera).
 */
import { Container, Graphics, Matrix, TilingSprite } from 'pixi.js';
import type { Job, Slot } from '../core/job';
import type { Placement } from '../core/game';
import { insetConvex, ringBBox, type Pt, type Ring } from '../core/geom';
import { affine, applyRing, invert, type Affine } from '../core/affine';
import { brickAtlas, grassTexture, sandTexture, type BrickAtlas } from './textures';
import { THEME } from './theme';

/** How a piece's texture maps: brick-local millimetres -> the piece's frame. */
export interface Skin {
  variant: number;
  m: Affine;
}

/** Joint half-width in mm for clean and loose pieces. */
export const JOINT = 2.2;
export const LOOSE_JOINT = 5;
const KERB = 70;
const SHADOW_OFFSET: Pt = [5, 8];

export function flat(r: Ring): number[] {
  const out = new Array<number>(r.length * 2);
  for (let i = 0; i < r.length; i++) {
    out[i * 2] = r[i]![0];
    out[i * 2 + 1] = r[i]![1];
  }
  return out;
}

export function slotSkin(slot: Slot, variant: number): Skin {
  return { variant, m: affine(slot.angle, slot.center[0], slot.center[1]) };
}

/**
 * Draw a textured piece into `g`. `polygon` is in the skin's frame; the graphics is given the
 * skin's transform so the texture stays glued to the brick it came from.
 */
export function drawPiece(
  g: Graphics,
  atlas: BrickAtlas,
  L: number,
  W: number,
  polygon: Ring,
  skin: Skin,
  joint = JOINT,
): void {
  const local = insetConvex(applyRing(invert(skin.m), polygon), joint);
  const [a, b, c, d, tx, ty] = skin.m;
  g.setFromMatrix(new Matrix(a, b, c, d, tx, ty));
  const texMatrix = new Matrix(L / atlas.w, 0, 0, W / atlas.h, -L / 2, -W / 2);
  g.poly(flat(local)).fill({
    texture: atlas.textures[skin.variant % atlas.textures.length]!,
    matrix: texMatrix,
    textureSpace: 'global',
  });
  // Cut edges are sharp and slightly paler than the chamfered factory edges.
  const tol = joint + 1.5;
  for (let i = 0; i < local.length; i++) {
    const p = local[i]!;
    const q = local[(i + 1) % local.length]!;
    const onX = (v: number): boolean => Math.abs(Math.abs(v) - L / 2) < tol;
    const onY = (v: number): boolean => Math.abs(Math.abs(v) - W / 2) < tol;
    const factory =
      (onX(p[0]) && onX(q[0]) && Math.sign(p[0]) === Math.sign(q[0])) ||
      (onY(p[1]) && onY(q[1]) && Math.sign(p[1]) === Math.sign(q[1]));
    if (factory) continue;
    g.moveTo(p[0], p[1]).lineTo(q[0], q[1]);
  }
  g.stroke({ width: 2.4, color: 0xfff1df, alpha: 0.35, cap: 'round' });
}

export function drawShadow(g: Graphics, polygon: Ring, skin: Skin, joint = JOINT): void {
  const local = insetConvex(applyRing(invert(skin.m), polygon), joint);
  const [a, b, c, d, tx, ty] = skin.m;
  g.setFromMatrix(new Matrix(a, b, c, d, tx + SHADOW_OFFSET[0], ty + SHADOW_OFFSET[1]));
  g.poly(flat(local)).fill({ color: THEME.shadow, alpha: 0.28 });
}

interface PieceView {
  g: Graphics;
  sh: Graphics;
}

export class JobView extends Container {
  readonly atlas: BrickAtlas;
  readonly ground: TilingSprite;
  readonly bed = new Graphics();
  readonly jointSand = new Graphics();
  readonly guides = new Graphics();
  readonly highlight = new Graphics();
  readonly shadows = new Container();
  readonly bricks = new Container();
  readonly fx = new Container();
  readonly decor = new Container();
  readonly over = new Container();
  private pieces = new Map<number, PieceView>();
  readonly L: number;
  readonly W: number;

  constructor(readonly job: Job) {
    super();
    this.L = job.brickLength;
    this.W = job.brickWidth;
    this.atlas = brickAtlas(job.level.colors, this.L / this.W);
    const bb = job.bbox;
    const M = 5000;
    this.ground = new TilingSprite({
      texture: grassTexture(),
      width: (bb.maxX - bb.minX + 2 * M) / 1.6,
      height: (bb.maxY - bb.minY + 2 * M) / 1.6,
    });
    this.ground.scale.set(1.6);
    this.ground.position.set(bb.minX - M, bb.minY - M);
    this.drawBed();
    this.jointSand.alpha = 0;
    this.addChild(
      this.ground,
      this.bed,
      this.guides,
      this.highlight,
      this.shadows,
      this.jointSand,
      this.bricks,
      this.fx,
      this.decor,
      this.over,
    );
  }

  private drawBed(): void {
    const { level } = this.job;
    const g = this.bed;
    const outer = level.border.outer;
    const holes = level.border.holes ?? [];
    // Kerb edging: a darker outline then the stone itself, centred on the border.
    for (const r of [outer, ...holes]) {
      g.poly(flat(r)).stroke({ width: KERB + 10, color: 0x6e6357, alpha: 0.55, join: 'round' });
    }
    for (const r of [outer, ...holes]) {
      g.poly(flat(r)).stroke({ width: KERB, color: 0xcfc4b0, join: 'round' });
    }
    for (const r of [outer, ...holes]) {
      g.poly(flat(r)).stroke({ width: KERB * 0.35, color: 0xe2d9c6, join: 'round' });
    }
    const sandM = new Matrix().scale(1.2, 1.2);
    g.poly(flat(outer)).fill({
      texture: sandTexture(false),
      matrix: sandM,
      textureSpace: 'global',
    });
    for (const h of holes) g.poly(flat(h)).cut();
    // Soil in tree pits.
    for (const h of holes) {
      g.poly(flat(h)).fill(0x5a4330);
      g.poly(flat(h)).fill({
        texture: sandTexture(false),
        matrix: sandM,
        textureSpace: 'global',
        alpha: 0.18,
      });
    }
    // Pale jointing sand, swept in by the finishing sequence.
    const j = this.jointSand;
    j.poly(flat(outer)).fill({ texture: sandTexture(true), matrix: sandM, textureSpace: 'global' });
    for (const h of holes) j.poly(flat(h)).cut();
  }

  /** Redraw chalk guides for empty slots. */
  drawGuides(isFilled: (id: number) => boolean, scale: number): void {
    const g = this.guides;
    g.clear();
    const px = 1 / scale;
    for (const s of this.job.slots) {
      if (isFilled(s.id) || s.kind !== 'full') continue;
      g.poly(flat(insetConvex(s.rect, JOINT))).fill({ color: THEME.chalk, alpha: 0.08 });
      g.poly(flat(insetConvex(s.rect, JOINT))).stroke({
        width: 1.2 * px,
        color: THEME.chalk,
        alpha: 0.4,
      });
    }
    for (const s of this.job.slots) {
      if (isFilled(s.id) || s.kind !== 'edge') continue;
      g.poly(flat(s.target)).fill({ color: THEME.chalk, alpha: 0.22 });
      g.poly(flat(s.target)).stroke({ width: 1.6 * px, color: THEME.chalk, alpha: 0.8 });
      // A small cut mark: a dashed tick across the hull's cut side.
      this.drawHatch(g, s, px);
    }
  }

  private drawHatch(g: Graphics, s: Slot, px: number): void {
    // Diagonal hatching clipped roughly by sampling lines inside the target bbox.
    const bb = ringBBox(s.target);
    const step = 18;
    const lines: number[] = [];
    for (let k = bb.minX - (bb.maxY - bb.minY); k < bb.maxX; k += step) {
      // segment of line x - y = k inside target: sample endpoints by clipping to target hull
      const a: Pt = [k, bb.minY];
      const b: Pt = [k + (bb.maxY - bb.minY), bb.maxY];
      const seg = clipSegmentConvex(a, b, s.hull);
      if (seg) lines.push(seg[0][0], seg[0][1], seg[1][0], seg[1][1]);
    }
    for (let i = 0; i < lines.length; i += 4)
      g.moveTo(lines[i]!, lines[i + 1]!).lineTo(lines[i + 2]!, lines[i + 3]!);
    g.stroke({ width: 1 * px, color: THEME.chalk, alpha: 0.35 });
  }

  setHighlight(slot: Slot | null, kind: 'snap' | 'cut' | 'fit' | 'bad', scale: number): void {
    const g = this.highlight;
    g.clear();
    if (!slot) return;
    const color = kind === 'bad' ? 0xd2694b : kind === 'cut' ? 0xffe9a8 : 0xfffdf6;
    const shape = slot.kind === 'full' ? slot.rect : slot.target;
    g.poly(flat(shape)).fill({ color, alpha: kind === 'bad' ? 0.25 : 0.45 });
    g.poly(flat(shape)).stroke({ width: 2.5 / scale, color, alpha: 0.95 });
  }

  addPiece(p: Placement, skin: Skin): PieceView {
    this.removePiece(p.slotId);
    const g = new Graphics();
    const sh = new Graphics();
    const joint = p.clean ? JOINT : LOOSE_JOINT;
    drawPiece(g, this.atlas, this.L, this.W, p.polygon, skin, joint);
    drawShadow(sh, p.polygon, skin, joint);
    this.bricks.addChild(g);
    this.shadows.addChild(sh);
    const v = { g, sh };
    this.pieces.set(p.slotId, v);
    return v;
  }

  piece(slotId: number): PieceView | undefined {
    return this.pieces.get(slotId);
  }

  removePiece(slotId: number): void {
    const v = this.pieces.get(slotId);
    if (!v) return;
    v.g.destroy();
    v.sh.destroy();
    this.pieces.delete(slotId);
  }

  /** Drop the record of a piece without destroying its graphics (they're being animated out). */
  forget(slotId: number): void {
    this.pieces.delete(slotId);
  }

  clearPieces(): void {
    for (const id of [...this.pieces.keys()]) this.removePiece(id);
  }
}

/** Clip a segment to a convex CCW ring (Cyrus-Beck). */
export function clipSegmentConvex(a: Pt, b: Pt, ring: Ring): [Pt, Pt] | null {
  let t0 = 0;
  let t1 = 1;
  const d: Pt = [b[0] - a[0], b[1] - a[1]];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    const e: Pt = [q[0] - p[0], q[1] - p[1]];
    // inside: cross(e, x - p) >= 0
    const num = e[0] * (a[1] - p[1]) - e[1] * (a[0] - p[0]);
    const den = e[0] * d[1] - e[1] * d[0];
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [a[0] + d[0] * t0, a[1] + d[1] * t0],
    [a[0] + d[0] * t1, a[1] + d[1] * t1],
  ];
}
