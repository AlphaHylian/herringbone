/**
 * Procedural textures, drawn once on 2D canvases and cached. Nothing is loaded from files.
 */
import { Texture, Rectangle, type TextureSource } from 'pixi.js';
import { rng, hashString } from '../core/rng';

/** Pixels per brick in the atlas (a 2:1 brick is drawn at BRICK_PX x BRICK_PX/2). */
export const BRICK_PX = 256;
export const VARIANTS_PER_COLOR = 3;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${(h * 360).toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;
}

/** Add per-pixel grain to a region. */
function grain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  amount: number,
  rand: () => number,
): void {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (rand() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i]! + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + n * 0.95));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + n * 0.9));
  }
  ctx.putImageData(img, x, y);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBrick(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  w: number,
  h: number,
  base: string,
  seed: number,
): void {
  const rand = rng(seed);
  const [r, g, b] = hexToRgb(base);
  const [hh, ss, ll] = rgbToHsl(r, g, b);
  const H = hh + (rand() - 0.5) * 0.02;
  const S = Math.max(0, ss + (rand() - 0.5) * 0.08);
  const L = Math.max(0.1, Math.min(0.9, ll + (rand() - 0.5) * 0.08));
  ctx.save();
  roundRect(ctx, ox + 1, oy + 1, w - 2, h - 2, 5);
  ctx.clip();
  ctx.fillStyle = hsl(H, S, L);
  ctx.fillRect(ox, oy, w, h);
  // Mottling: soft blotches, a kiln-fired look.
  for (let i = 0; i < 14; i++) {
    const cx = ox + rand() * w;
    const cy = oy + rand() * h;
    const rad = 10 + rand() * 50;
    const light = rand() < 0.5;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, hsl(H + (rand() - 0.5) * 0.02, S, light ? L + 0.07 : L - 0.08, 0.35));
    grad.addColorStop(1, hsl(H, S, L, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(ox, oy, w, h);
  }
  // A darker "flash" along one long edge, like real fired bricks.
  if (rand() < 0.5) {
    const grad = ctx.createLinearGradient(0, oy, 0, oy + h);
    const top = rand() < 0.5;
    grad.addColorStop(top ? 0 : 1, hsl(H, S, L - 0.12, 0.35));
    grad.addColorStop(0.5, hsl(H, S, L, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(ox, oy, w, h);
  }
  grain(ctx, ox, oy, w, h, 22, rand);
  // Pits and specks.
  for (let i = 0; i < 40; i++) {
    const px = ox + 4 + rand() * (w - 8);
    const py = oy + 4 + rand() * (h - 8);
    const dark = rand() < 0.7;
    ctx.fillStyle = dark ? 'rgba(40,20,10,0.32)' : 'rgba(255,240,220,0.35)';
    ctx.beginPath();
    ctx.arc(px, py, 0.6 + rand() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Chamfered edges: light from the top-left.
  const bevel = 6;
  const edge = (x0: number, y0: number, x1: number, y1: number, color: string): void => {
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(ox, oy, w, h);
  };
  edge(ox, oy, ox, oy + bevel, 'rgba(255,245,230,0.38)');
  edge(ox, oy, ox + bevel, oy, 'rgba(255,245,230,0.28)');
  edge(ox, oy + h, ox, oy + h - bevel, 'rgba(30,12,4,0.42)');
  edge(ox + w, oy, ox + w - bevel, oy, 'rgba(30,12,4,0.34)');
  ctx.restore();
}

export interface BrickAtlas {
  source: TextureSource;
  /** One texture per variant; index with `variantFor`. */
  textures: Texture[];
  /** Pixel size of one brick in the atlas. */
  w: number;
  h: number;
  /** Average colour of each variant (for particles and thumbnails). */
  tints: number[];
}

const atlasCache = new Map<string, BrickAtlas>();

/** Build (or reuse) the atlas for a palette and brick proportions. */
export function brickAtlas(colors: string[], aspect: number): BrickAtlas {
  const key = colors.join(',') + '|' + aspect.toFixed(3);
  const hit = atlasCache.get(key);
  if (hit) return hit;
  const w = BRICK_PX;
  const h = Math.round(BRICK_PX / aspect);
  const pad = 2;
  const count = colors.length * VARIANTS_PER_COLOR;
  const cols = 4;
  const rows = Math.ceil(count / cols);
  const [c, ctx] = canvas(cols * (w + pad * 2), rows * (h + pad * 2));
  const tints: number[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const base = colors[Math.floor(i / VARIANTS_PER_COLOR)]!;
    drawBrick(
      ctx,
      col * (w + pad * 2) + pad,
      row * (h + pad * 2) + pad,
      w,
      h,
      base,
      hashString(key) + i * 7919,
    );
    tints.push(parseInt(base.slice(1), 16));
  }
  const tex = Texture.from(c);
  tex.source.style.scaleMode = 'linear';
  const textures: Texture[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    textures.push(
      new Texture({
        source: tex.source,
        frame: new Rectangle(col * (w + pad * 2) + pad, row * (h + pad * 2) + pad, w, h),
      }),
    );
  }
  const atlas = { source: tex.source, textures, w, h, tints };
  atlasCache.set(key, atlas);
  return atlas;
}

/** Stable variant choice for a slot. */
export function variantFor(atlas: BrickAtlas, seed: number): number {
  const r = rng(seed * 2654435761)();
  return Math.floor(r * atlas.textures.length);
}

let grassTex: Texture | null = null;
export function grassTexture(): Texture {
  if (grassTex) return grassTex;
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rand = rng(1234);
  ctx.fillStyle = '#7f9d58';
  ctx.fillRect(0, 0, S, S);
  // Patches
  for (let i = 0; i < 18; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 20 + rand() * 50;
    for (const dx of [-S, 0, S])
      for (const dy of [-S, 0, S]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        const dark = rand() < 0.5;
        g.addColorStop(0, dark ? 'rgba(70,100,50,0.25)' : 'rgba(160,180,100,0.22)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, S, S);
      }
  }
  // Blades
  const greens = ['#6d8c4a', '#8aa860', '#5f7d40', '#97b26a', '#78964f', '#a3bd74'];
  ctx.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const a = rand() * Math.PI * 2;
    const l = 2 + rand() * 5;
    ctx.strokeStyle = greens[Math.floor(rand() * greens.length)]!;
    ctx.globalAlpha = 0.5 + rand() * 0.5;
    ctx.lineWidth = 0.8 + rand() * 0.8;
    for (const dx of [-S, 0, S])
      for (const dy of [-S, 0, S]) {
        if (x + dx < -8 || x + dx > S + 8 || y + dy < -8 || y + dy > S + 8) continue;
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
        ctx.stroke();
      }
  }
  // A few tiny flowers
  ctx.globalAlpha = 1;
  for (let i = 0; i < 6; i++) {
    const x = 8 + rand() * (S - 16);
    const y = 8 + rand() * (S - 16);
    ctx.fillStyle = rand() < 0.5 ? '#f4f0dc' : '#f0d36a';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(
        x + Math.cos((k * Math.PI) / 2) * 1.6,
        y + Math.sin((k * Math.PI) / 2) * 1.6,
        1.2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  grain(ctx, 0, 0, S, S, 10, rand);
  grassTex = Texture.from(c);
  grassTex.source.style.addressMode = 'repeat';
  return grassTex;
}

const sandCache = new Map<string, Texture>();
/** Seamless sand: `fine` is the pale jointing sand, otherwise the coarser bedding layer. */
export function sandTexture(fine: boolean): Texture {
  const key = fine ? 'fine' : 'bed';
  const hit = sandCache.get(key);
  if (hit) return hit;
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rand = rng(fine ? 77 : 88);
  ctx.fillStyle = fine ? '#e3cf9f' : '#bfa67a';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < (fine ? 900 : 1400); i++) {
    const x = rand() * S;
    const y = rand() * S;
    const v = rand();
    ctx.fillStyle =
      v < 0.45
        ? 'rgba(120,95,60,0.35)'
        : v < 0.85
          ? 'rgba(255,245,220,0.4)'
          : 'rgba(90,80,70,0.45)';
    ctx.fillRect(x, y, fine ? 1 : 1 + rand(), fine ? 1 : 1 + rand());
  }
  grain(ctx, 0, 0, S, S, fine ? 14 : 24, rand);
  const tex = Texture.from(c);
  tex.source.style.addressMode = 'repeat';
  sandCache.set(key, tex);
  return tex;
}

let dotTex: Texture | null = null;
/** Soft round particle. */
export function softDot(): Texture {
  if (dotTex) return dotTex;
  const S = 64;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  dotTex = Texture.from(c);
  return dotTex;
}

let shadowTex: Texture | null = null;
/** Soft blurred rectangle for brick shadows (9-slice-free: drawn scaled). */
export function softShadow(): Texture {
  if (shadowTex) return shadowTex;
  const W = 160;
  const H = 96;
  const [c, ctx] = canvas(W, H);
  ctx.filter = 'blur(9px)';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fillRect(24, 24, W - 48, H - 48);
  shadowTex = Texture.from(c);
  return shadowTex;
}
