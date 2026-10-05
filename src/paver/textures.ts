/**
 * Every texture in the 3D site is painted in code: tileable value noise, speckles and stones
 * on a canvas, plus normal maps derived from the same height fields. No image files.
 */
import * as THREE from 'three';
import { mulberry32 } from './path';

type Rnd = () => number;

/** Tileable value noise with a given lattice period. */
function makeNoise(rnd: Rnd, period: number): (x: number, y: number) => number {
  const v = new Float32Array(period * period);
  for (let i = 0; i < v.length; i++) v[i] = rnd();
  const at = (i: number, j: number): number =>
    v[(((j % period) + period) % period) * period + (((i % period) + period) % period)]!;
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let tx = x - xi;
    let ty = y - yi;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/** Fractal noise field (0..1) of size n x n that tiles seamlessly. */
function fbmField(
  seed: number,
  n: number,
  base: number,
  octaves: number,
  gain = 0.5,
): Float32Array {
  const rnd = mulberry32(seed);
  const layers = Array.from({ length: octaves }, (_, o) => makeNoise(rnd, base << o));
  const out = new Float32Array(n * n);
  let norm = 0;
  for (let o = 0, amp = 1; o < octaves; o++, amp *= gain) norm += amp;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let sum = 0;
      for (let o = 0, amp = 1; o < octaves; o++, amp *= gain) {
        const f = (base << o) / n;
        sum += layers[o]!(x * f, y * f) * amp;
      }
      out[y * n + x] = sum / norm;
    }
  }
  return out;
}

interface Painted {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
}

function paint(n: number): Painted {
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx, img: ctx.createImageData(n, n) };
}

function colorTexture(canvas: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Normal map from a tileable height field (strength in texels of slope). */
function normalTexture(h: Float32Array, n: number, strength: number): THREE.DataTexture {
  const data = new Uint8Array(n * n * 4);
  const at = (x: number, y: number): number => h[((y + n) % n) * n + ((x + n) % n)]!;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * n + x) * 4;
      data[i] = Math.round(((-dx / l) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((dy / l) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export interface SurfaceTex {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap?: THREE.Texture;
}

/** Concrete paving block: mostly grey so per-block vertex colours set the shade. */
export function concreteTexture(seed: number, n = 512): SurfaceTex {
  const rnd = mulberry32(seed);
  const broad = fbmField(seed + 1, n, 4, 4, 0.55);
  const fine = fbmField(seed + 2, n, 64, 2, 0.5);
  const height = new Float32Array(n * n);
  const { canvas, ctx, img } = paint(n);
  for (let i = 0; i < n * n; i++) {
    const v = 0.78 + (broad[i]! - 0.5) * 0.22 + (fine[i]! - 0.5) * 0.22;
    const c = Math.max(0, Math.min(255, v * 255));
    img.data[i * 4] = c;
    img.data[i * 4 + 1] = c;
    img.data[i * 4 + 2] = c * 1.02;
    img.data[i * 4 + 3] = 255;
    height[i] = fine[i]! * 0.6;
  }
  // Pores and pale aggregate grains.
  for (let k = 0; k < n * n * 0.012; k++) {
    const x = Math.floor(rnd() * n);
    const y = Math.floor(rnd() * n);
    const pale = rnd() < 0.55;
    const r = 1 + Math.floor(rnd() * (pale ? 2 : 1.6));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = (x + dx + n) % n;
        const py = (y + dy + n) % n;
        const i = py * n + px;
        const f = pale ? 1.18 + rnd() * 0.12 : 0.55;
        img.data[i * 4] = Math.min(255, img.data[i * 4]! * f);
        img.data[i * 4 + 1] = Math.min(255, img.data[i * 4 + 1]! * f);
        img.data[i * 4 + 2] = Math.min(255, img.data[i * 4 + 2]! * f);
        height[i] = pale ? height[i]! + 0.25 : height[i]! - 0.6;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: colorTexture(canvas), normalMap: normalTexture(height, n, 2.2) };
}

/** Screeded sharp sand bed. */
export function sandTexture(seed: number, n = 512): SurfaceTex {
  const rnd = mulberry32(seed);
  const broad = fbmField(seed + 3, n, 6, 4, 0.5);
  const grain = fbmField(seed + 4, n, 128, 2, 0.5);
  const height = new Float32Array(n * n);
  const { canvas, ctx, img } = paint(n);
  for (let i = 0; i < n * n; i++) {
    const g = (grain[i]! - 0.5) * 0.35 + (rnd() - 0.5) * 0.12;
    const b = (broad[i]! - 0.5) * 0.25;
    const v = 1 + g + b;
    img.data[i * 4] = Math.min(255, 196 * v);
    img.data[i * 4 + 1] = Math.min(255, 152 * v);
    img.data[i * 4 + 2] = Math.min(255, 100 * v);
    img.data[i * 4 + 3] = 255;
    height[i] = grain[i]! * 0.7 + broad[i]! * 0.6;
  }
  ctx.putImageData(img, 0, 0);
  return { map: colorTexture(canvas), normalMap: normalTexture(height, n, 1.4) };
}

/** Disturbed site soil: sandy dirt with pebbles and the odd clump. */
export function dirtTexture(seed: number, n = 512): SurfaceTex {
  const rnd = mulberry32(seed);
  const broad = fbmField(seed + 5, n, 4, 5, 0.55);
  const mid = fbmField(seed + 6, n, 24, 3, 0.5);
  const height = new Float32Array(n * n);
  const { canvas, ctx, img } = paint(n);
  for (let i = 0; i < n * n; i++) {
    const b = broad[i]!;
    const m = mid[i]!;
    const v = 0.85 + (m - 0.5) * 0.45 + (rnd() - 0.5) * 0.1;
    // Blend between pale dry sand and darker brown soil.
    const t = Math.min(1, Math.max(0, (b - 0.35) * 2.2));
    const r = (178 * (1 - t) + 122 * t) * v;
    const g = (142 * (1 - t) + 96 * t) * v;
    const bl = (104 * (1 - t) + 72 * t) * v;
    img.data[i * 4] = Math.min(255, r);
    img.data[i * 4 + 1] = Math.min(255, g);
    img.data[i * 4 + 2] = Math.min(255, bl);
    img.data[i * 4 + 3] = 255;
    height[i] = m * 0.8 + b * 0.5;
  }
  ctx.putImageData(img, 0, 0);
  // Pebbles: shaded ellipses, mostly small.
  for (let k = 0; k < 1400; k++) {
    const x = rnd() * n;
    const y = rnd() * n;
    const r = (rnd() ** 4 * 5 + 0.8) * (n / 512);
    const a = rnd() * Math.PI;
    const tone = 95 + rnd() * 80;
    const warm = rnd() * 20;
    for (const [ox, oy] of [
      [0, 0],
      [n, 0],
      [-n, 0],
      [0, n],
      [0, -n],
    ] as const) {
      if (x + ox < -r * 2 || x + ox > n + r * 2 || y + oy < -r * 2 || y + oy > n + r * 2) continue;
      ctx.save();
      ctx.translate(x + ox, y + oy);
      ctx.rotate(a);
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, `rgb(${tone + 14 + warm},${tone + 8},${tone})`);
      g.addColorStop(1, `rgb(${tone * 0.78 + warm},${tone * 0.72},${tone * 0.66})`);
      ctx.fillStyle = 'rgba(50,38,26,0.18)';
      ctx.beginPath();
      ctx.ellipse(r * 0.12, r * 0.15, r * 1.05, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Raise the height field under the pebble.
    const rr = Math.ceil(r);
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        const d = (dx * dx + dy * dy) / (r * r);
        if (d > 1) continue;
        const i = ((Math.floor(y) + dy + n) % n) * n + ((Math.floor(x) + dx + n) % n);
        height[i] = height[i]! + Math.sqrt(1 - d) * 0.6;
      }
    }
  }
  return { map: colorTexture(canvas), normalMap: normalTexture(height, n, 1.6) };
}

/** Lawn seen from a standing height. */
export function lawnTexture(seed: number, n = 512): SurfaceTex {
  const rnd = mulberry32(seed);
  const broad = fbmField(seed + 7, n, 4, 4, 0.55);
  const height = new Float32Array(n * n);
  const { canvas, ctx, img } = paint(n);
  for (let i = 0; i < n * n; i++) {
    const b = broad[i]!;
    const v = 0.8 + (b - 0.5) * 0.5;
    img.data[i * 4] = 78 * v + 20 * (1 - b);
    img.data[i * 4 + 1] = 112 * v;
    img.data[i * 4 + 2] = 46 * v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Blades.
  for (let k = 0; k < 26000; k++) {
    const x = rnd() * n;
    const y = rnd() * n;
    const l = 3 + rnd() * 7;
    const a = rnd() * Math.PI * 2;
    const g = 90 + rnd() * 90;
    ctx.strokeStyle = `rgba(${g * 0.55 + rnd() * 40},${g},${g * 0.35},${0.5 + rnd() * 0.4})`;
    ctx.lineWidth = 0.8 + rnd() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  const data = ctx.getImageData(0, 0, n, n).data;
  for (let i = 0; i < n * n; i++) height[i] = data[i * 4 + 1]! / 255;
  return { map: colorTexture(canvas), normalMap: normalTexture(height, n, 2) };
}

/** Pale grey precast concrete (edging kerbs). */
export function kerbTexture(seed: number, n = 256): SurfaceTex {
  const broad = fbmField(seed + 8, n, 4, 4, 0.55);
  const fine = fbmField(seed + 9, n, 64, 2, 0.5);
  const height = new Float32Array(n * n);
  const { canvas, ctx, img } = paint(n);
  for (let i = 0; i < n * n; i++) {
    const v = 0.9 + (broad[i]! - 0.5) * 0.18 + (fine[i]! - 0.5) * 0.18;
    img.data[i * 4] = 158 * v;
    img.data[i * 4 + 1] = 155 * v;
    img.data[i * 4 + 2] = 149 * v;
    img.data[i * 4 + 3] = 255;
    height[i] = fine[i]!;
  }
  ctx.putImageData(img, 0, 0);
  return { map: colorTexture(canvas), normalMap: normalTexture(height, n, 1.5) };
}

/** Sawn pallet timber. */
export function woodTexture(seed: number, n = 256): THREE.Texture {
  const rnd = mulberry32(seed);
  const broad = fbmField(seed + 10, n, 4, 3, 0.5);
  const { canvas, ctx, img } = paint(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const grain = Math.sin((x / n) * 60 + broad[i]! * 12) * 0.5 + 0.5;
      const v = 0.82 + grain * 0.14 + (rnd() - 0.5) * 0.06;
      img.data[i * 4] = 196 * v;
      img.data[i * 4 + 1] = 160 * v;
      img.data[i * 4 + 2] = 112 * v;
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return colorTexture(canvas);
}

/** Bark: vertical furrows. */
export function barkTexture(seed: number, n = 256): SurfaceTex {
  const rnd = mulberry32(seed);
  const height = new Float32Array(n * n);
  const broad = fbmField(seed + 11, n, 8, 3, 0.5);
  const { canvas, ctx, img } = paint(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const f = Math.abs(Math.sin((x / n) * Math.PI * 14 + broad[i]! * 6));
      const v = 0.45 + f * 0.45 + (rnd() - 0.5) * 0.08;
      img.data[i * 4] = 112 * v;
      img.data[i * 4 + 1] = 100 * v;
      img.data[i * 4 + 2] = 88 * v;
      img.data[i * 4 + 3] = 255;
      height[i] = f;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: colorTexture(canvas), normalMap: normalTexture(height, n, 3) };
}

/** A card of leaves with alpha, for tree canopies. */
export function leafTexture(seed: number, n = 256): THREE.Texture {
  const rnd = mulberry32(seed);
  const { canvas, ctx } = paint(n);
  ctx.clearRect(0, 0, n, n);
  for (let k = 0; k < 70; k++) {
    // Keep leaves inside a soft circle so cards don't show square edges.
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * n * 0.4;
    const x = n / 2 + Math.cos(a) * r;
    const y = n / 2 + Math.sin(a) * r;
    const len = n * (0.07 + rnd() * 0.05);
    const ang = rnd() * Math.PI * 2;
    const g = 70 + rnd() * 70;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = `rgb(${g * 0.55 + rnd() * 25},${g + 25},${g * 0.35})`;
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.quadraticCurveTo(0, -len * 0.5, len, 0);
    ctx.quadraticCurveTo(0, len * 0.5, -len, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,50,20,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
  }
  const t = colorTexture(canvas, false);
  return t;
}

/** A tuft of grass blades with alpha. */
export function grassTuftTexture(seed: number, n = 128): THREE.Texture {
  const rnd = mulberry32(seed);
  const { canvas, ctx } = paint(n);
  ctx.clearRect(0, 0, n, n);
  for (let k = 0; k < 40; k++) {
    const x = n * (0.2 + rnd() * 0.6);
    const h = n * (0.45 + rnd() * 0.5);
    const lean = (rnd() - 0.5) * n * 0.35;
    const w = 1.5 + rnd() * 2.5;
    const g = 70 + rnd() * 60;
    ctx.fillStyle = `rgb(${g * 0.75 + rnd() * 30},${g + 6},${g * 0.42})`;
    ctx.beginPath();
    ctx.moveTo(x - w, n);
    ctx.quadraticCurveTo(x + lean * 0.3, n - h * 0.6, x + lean, n - h);
    ctx.quadraticCurveTo(x + lean * 0.3 + w * 0.5, n - h * 0.6, x + w, n);
    ctx.fill();
  }
  return colorTexture(canvas, false);
}

/** Knitted glove fabric: fine ribs, grey so vertex colours tint it. */
export function knitTexture(seed: number, n = 128): SurfaceTex {
  const rnd = mulberry32(seed);
  const height = new Float32Array(n * n);
  const { canvas, ctx, img } = paint(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      // Interlocking V stitches.
      const u = (x / n) * 16;
      const v = (y / n) * 24 + Math.abs((u % 1) - 0.5) * 1.2;
      const st = Math.sin(u * Math.PI * 2) * 0.5 + 0.5;
      const row = Math.sin(v * Math.PI * 2) * 0.5 + 0.5;
      const h = st * 0.6 + row * 0.4 + (rnd() - 0.5) * 0.15;
      const c = 200 + h * 55;
      img.data[i * 4] = c;
      img.data[i * 4 + 1] = c;
      img.data[i * 4 + 2] = c;
      img.data[i * 4 + 3] = 255;
      height[i] = h;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: colorTexture(canvas), normalMap: normalTexture(height, n, 1.2) };
}
