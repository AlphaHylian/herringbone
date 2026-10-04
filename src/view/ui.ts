/** Small procedural UI kit: buttons with drawn icons, panels, text. */
import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { THEME } from './theme';

export type IconName =
  | 'back'
  | 'undo'
  | 'gear'
  | 'close'
  | 'check'
  | 'play'
  | 'map'
  | 'brick'
  | 'hand'
  | 'blade'
  | 'replay'
  | 'sound'
  | 'mute'
  | 'build'
  | 'eye'
  | 'trash';

export function text(str: string, opts: TextStyleOptions = {}): Text {
  const t = new Text({
    text: str,
    style: {
      fontFamily: THEME.font,
      fontSize: 16,
      fill: THEME.ink,
      fontWeight: '600',
      ...opts,
    },
    resolution: Math.min(window.devicePixelRatio || 1, 3),
  });
  return t;
}

/** Draws an icon centred at 0,0 with size s. */
export function drawIcon(g: Graphics, name: IconName, s: number, color: number): void {
  const w = Math.max(2, s * 0.12);
  const st = { width: w, color, cap: 'round' as const, join: 'round' as const };
  const h = s / 2;
  switch (name) {
    case 'back':
      g.moveTo(h * 0.35, -h * 0.6)
        .lineTo(-h * 0.3, 0)
        .lineTo(h * 0.35, h * 0.6)
        .stroke(st);
      break;
    case 'undo':
      g.arc(h * 0.05, h * 0.12, h * 0.55, Math.PI * 1.05, Math.PI * 2.25).stroke(st);
      g.moveTo(-h * 0.85, -h * 0.35)
        .lineTo(-h * 0.52, h * 0.1)
        .lineTo(-h * 0.08, -h * 0.12)
        .stroke(st);
      break;
    case 'gear': {
      g.circle(0, 0, h * 0.32).stroke(st);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.moveTo(Math.cos(a) * h * 0.52, Math.sin(a) * h * 0.52)
          .lineTo(Math.cos(a) * h * 0.78, Math.sin(a) * h * 0.78)
          .stroke(st);
      }
      g.circle(0, 0, h * 0.6).stroke({ ...st, width: w * 0.8 });
      break;
    }
    case 'close':
      g.moveTo(-h * 0.5, -h * 0.5)
        .lineTo(h * 0.5, h * 0.5)
        .stroke(st);
      g.moveTo(h * 0.5, -h * 0.5)
        .lineTo(-h * 0.5, h * 0.5)
        .stroke(st);
      break;
    case 'check':
      g.moveTo(-h * 0.55, 0)
        .lineTo(-h * 0.15, h * 0.42)
        .lineTo(h * 0.6, -h * 0.45)
        .stroke(st);
      break;
    case 'play':
      g.poly([-h * 0.35, -h * 0.55, h * 0.6, 0, -h * 0.35, h * 0.55]).fill(color);
      break;
    case 'replay':
      g.arc(0, 0, h * 0.55, -Math.PI * 0.35, Math.PI * 1.4).stroke(st);
      g.moveTo(h * 0.1, -h * 0.85)
        .lineTo(h * 0.42, -h * 0.47)
        .lineTo(h * 0.02, -h * 0.25)
        .stroke(st);
      break;
    case 'map':
      g.poly([
        -h * 0.7,
        -h * 0.45,
        -h * 0.2,
        -h * 0.65,
        h * 0.2,
        -h * 0.45,
        h * 0.7,
        -h * 0.65,
        h * 0.7,
        h * 0.45,
        h * 0.2,
        h * 0.65,
        -h * 0.2,
        h * 0.45,
        -h * 0.7,
        h * 0.65,
      ]).stroke(st);
      g.moveTo(-h * 0.2, -h * 0.65)
        .lineTo(-h * 0.2, h * 0.45)
        .stroke({ ...st, width: w * 0.7 });
      g.moveTo(h * 0.2, -h * 0.45)
        .lineTo(h * 0.2, h * 0.65)
        .stroke({ ...st, width: w * 0.7 });
      break;
    case 'brick':
      g.roundRect(-h * 0.75, -h * 0.38, h * 1.5, h * 0.76, h * 0.12).fill(color);
      break;
    case 'hand':
      g.roundRect(-h * 0.18, -h * 0.85, h * 0.36, h * 1.1, h * 0.18).fill(color);
      g.roundRect(-h * 0.5, -h * 0.05, h * 1.1, h * 0.9, h * 0.35).fill(color);
      break;
    case 'blade':
      g.moveTo(-h * 0.7, h * 0.7)
        .lineTo(h * 0.7, -h * 0.7)
        .stroke(st);
      g.circle(h * 0.45, -h * 0.45, h * 0.18).fill(color);
      break;
    case 'sound':
    case 'mute':
      g.poly([
        -h * 0.7,
        -h * 0.25,
        -h * 0.35,
        -h * 0.25,
        h * 0.05,
        -h * 0.6,
        h * 0.05,
        h * 0.6,
        -h * 0.35,
        h * 0.25,
        -h * 0.7,
        h * 0.25,
      ]).fill(color);
      if (name === 'sound') {
        g.arc(h * 0.1, 0, h * 0.4, -0.7, 0.7).stroke(st);
        g.arc(h * 0.1, 0, h * 0.7, -0.7, 0.7).stroke(st);
      } else {
        g.moveTo(h * 0.3, -h * 0.3)
          .lineTo(h * 0.8, h * 0.3)
          .stroke(st);
        g.moveTo(h * 0.8, -h * 0.3)
          .lineTo(h * 0.3, h * 0.3)
          .stroke(st);
      }
      break;
    case 'build':
      // trowel
      g.poly([-h * 0.1, -h * 0.75, h * 0.7, -h * 0.05, h * 0.05, h * 0.2]).fill(color);
      g.moveTo(-h * 0.05, h * 0.15)
        .lineTo(-h * 0.6, h * 0.7)
        .stroke({ ...st, width: w * 1.3 });
      break;
    case 'eye':
      g.ellipse(0, 0, h * 0.75, h * 0.42).stroke(st);
      g.circle(0, 0, h * 0.18).fill(color);
      break;
    case 'trash':
      g.roundRect(-h * 0.45, -h * 0.4, h * 0.9, h * 1.1, h * 0.12).stroke(st);
      g.moveTo(-h * 0.7, -h * 0.55)
        .lineTo(h * 0.7, -h * 0.55)
        .stroke(st);
      break;
  }
}

export interface ButtonOptions {
  icon?: IconName;
  label?: string;
  width?: number;
  height?: number;
  fill?: number;
  color?: number;
  radius?: number;
  fontSize?: number;
  /** Draw as a flat round button without the raised edge. */
  flat?: boolean;
}

/** A soft, raised button. Calls `onTap` on release inside. */
export class Button extends Container {
  private bg = new Graphics();
  private face = new Container();
  private pressed = false;
  enabled = true;
  readonly w: number;
  readonly h: number;
  private labelText?: Text;

  constructor(
    private opts: ButtonOptions,
    public onTap: () => void,
  ) {
    super();
    this.w = opts.width ?? 52;
    this.h = opts.height ?? 52;
    this.addChild(this.bg, this.face);
    const color = opts.color ?? THEME.ink;
    let iconX = 0;
    if (opts.label) {
      this.labelText = text(opts.label, {
        fontSize: opts.fontSize ?? 18,
        fill: color,
        fontWeight: '700',
      });
      this.labelText.anchor.set(0.5);
      if (opts.icon) {
        const gap = 10;
        const iconSize = this.h * 0.42;
        const total = iconSize + gap + this.labelText.width;
        iconX = -total / 2 + iconSize / 2;
        this.labelText.x = iconX + iconSize / 2 + gap + this.labelText.width / 2;
      }
      this.face.addChild(this.labelText);
    }
    if (opts.icon) {
      const g = new Graphics();
      drawIcon(g, opts.icon, Math.min(this.w, this.h) * (opts.label ? 0.42 : 0.5), color);
      g.x = iconX;
      this.face.addChild(g);
    }
    this.draw();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', (e) => {
      e.stopPropagation();
      if (!this.enabled) return;
      this.pressed = true;
      this.draw();
    });
    this.on('pointerup', (e) => {
      e.stopPropagation();
      if (!this.pressed) return;
      this.pressed = false;
      this.draw();
      if (this.enabled) this.onTap();
    });
    this.on('pointerupoutside', () => {
      this.pressed = false;
      this.draw();
    });
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    this.alpha = v ? 1 : 0.4;
  }

  private draw(): void {
    const { w, h } = this;
    const r = this.opts.radius ?? Math.min(w, h) / 2;
    const fill = this.opts.fill ?? THEME.paper;
    const lift = this.opts.flat ? 0 : this.pressed ? 1 : 4;
    this.bg.clear();
    if (!this.opts.flat) {
      this.bg.roundRect(-w / 2, -h / 2 + 4, w, h, r).fill({ color: THEME.shadow, alpha: 0.18 });
      this.bg.roundRect(-w / 2, -h / 2 + (4 - lift), w, h, r).fill(darken(fill, 0.12));
    }
    this.bg
      .roundRect(
        -w / 2,
        -h / 2 - lift + (this.opts.flat ? 0 : 0),
        w,
        h - (this.opts.flat ? 0 : 0),
        r,
      )
      .fill(fill);
    this.face.y = -lift;
    this.face.scale.set(this.pressed ? 0.96 : 1);
  }
}

export function darken(c: number, k: number): number {
  const r = ((c >> 16) & 255) * (1 - k);
  const g = ((c >> 8) & 255) * (1 - k);
  const b = (c & 255) * (1 - k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** A rounded paper card with a soft shadow. */
export function panel(w: number, h: number, fill: number = THEME.paper, r = 22): Graphics {
  const g = new Graphics();
  g.roundRect(-w / 2 + 2, -h / 2 + 6, w, h, r).fill({ color: THEME.shadow, alpha: 0.16 });
  g.roundRect(-w / 2, -h / 2, w, h, r).fill(fill);
  return g;
}

/** Draw a small brick glyph used for ratings. `filled` false draws an outline. */
export function ratingBrick(g: Graphics, x: number, y: number, w: number, filled: boolean): void {
  const h = w * 0.5;
  if (filled) {
    g.roundRect(x - w / 2, y - h / 2 + 3, w, h, w * 0.08).fill({ color: THEME.shadow, alpha: 0.2 });
    g.roundRect(x - w / 2, y - h / 2, w, h, w * 0.08).fill(THEME.accent);
    g.roundRect(x - w / 2 + 3, y - h / 2 + 2, w - 6, h * 0.25, w * 0.05).fill({
      color: 0xffffff,
      alpha: 0.18,
    });
  } else {
    g.roundRect(x - w / 2, y - h / 2, w, h, w * 0.08).stroke({
      width: 2.5,
      color: THEME.inkSoft,
      alpha: 0.5,
    });
  }
}
