/**
 * An endless, gently winding garden path. Pure maths, no rendering.
 *
 * The centreline is described by arc length s >= 0. Heading and width are closed-form
 * functions of s (sums of slow sines with seeded phases), so they never drift; positions are
 * integrated lazily in fixed steps as the player walks further. The heading never strays more
 * than about 70 degrees from the start direction, so the path always moves forward and can
 * never cross itself.
 *
 * World coordinates are the ground plane (x, z) of a y-up scene. The path starts at the origin
 * heading towards -z.
 */

export const START_HEADING = -Math.PI / 2;

export interface PathPoint {
  x: number;
  z: number;
  /** Heading in radians; direction is (cos th, sin th). */
  th: number;
  /** Full width of the paved area at this point. */
  w: number;
  /** Unit normal pointing to the left of the direction of travel. */
  nx: number;
  nz: number;
}

export interface Nearest {
  s: number;
  /** Signed distance from the centreline, positive to the left. */
  lat: number;
  /** Unsigned distance from the centreline. */
  dist: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class PathModel {
  readonly ds = 0.25;
  private readonly xs: number[] = [0];
  private readonly zs: number[] = [0];
  private readonly p1: number;
  private readonly p2: number;
  private readonly p3: number;
  private readonly p4: number;

  constructor(readonly seed: number) {
    const rnd = mulberry32(seed);
    this.p1 = rnd() * Math.PI * 2;
    this.p2 = rnd() * Math.PI * 2;
    this.p3 = rnd() * Math.PI * 2;
    this.p4 = rnd() * Math.PI * 2;
  }

  /**
   * Max curvature is 0.75/31 + 0.42/11 ~ 0.062 per metre, so the tightest bend has a radius of
   * about 16 m: far wider than the path, so the edges are always smooth offset curves.
   */
  heading(s: number): number {
    const ramp = smoothstep(4, 16, s);
    const a = 0.75 * (Math.sin(s / 31 + this.p1) - Math.sin(this.p1));
    const b = 0.42 * (Math.sin(s / 11 + this.p2) - Math.sin(this.p2));
    return START_HEADING + ramp * (a + b);
  }

  width(s: number): number {
    return 2.6 + 0.3 * Math.sin(s / 19 + this.p3) + 0.08 * Math.sin(s / 5.3 + this.p4);
  }

  /** Make sure positions are integrated up to arc length s. */
  ensure(s: number): void {
    const ds = this.ds;
    while ((this.xs.length - 1) * ds < s + ds) {
      const i = this.xs.length - 1;
      const th = this.heading((i + 0.5) * ds);
      this.xs.push(this.xs[i]! + Math.cos(th) * ds);
      this.zs.push(this.zs[i]! + Math.sin(th) * ds);
    }
  }

  at(s: number): PathPoint {
    const sc = Math.max(0, s);
    this.ensure(sc);
    const f = sc / this.ds;
    const i = Math.floor(f);
    const t = f - i;
    const x0 = this.xs[i]!;
    const z0 = this.zs[i]!;
    const x1 = this.xs[i + 1]!;
    const z1 = this.zs[i + 1]!;
    const th = this.heading(sc);
    let x = x0 + (x1 - x0) * t;
    let z = z0 + (z1 - z0) * t;
    if (s < 0) {
      // Extend straight backwards from the start.
      x += Math.cos(th) * s;
      z += Math.sin(th) * s;
    }
    return { x, z, th, w: this.width(sc), nx: Math.sin(th), nz: -Math.cos(th) };
  }

  /** Point at arc length s and lateral offset lat (positive = left). */
  offset(s: number, lat: number): [number, number] {
    const p = this.at(s);
    return [p.x + p.nx * lat, p.z + p.nz * lat];
  }

  /** Closest point on the centreline, searching arc lengths [s0, s1]. */
  nearest(x: number, z: number, s0: number, s1: number): Nearest {
    const ds = this.ds;
    const lo = Math.max(0, Math.floor(s0 / ds));
    this.ensure(s1 + ds);
    const hi = Math.max(lo + 1, Math.ceil(s1 / ds));
    let best = Infinity;
    let bestS = 0;
    let bestLat = 0;
    for (let i = lo; i < hi; i++) {
      const ax = this.xs[i]!;
      const az = this.zs[i]!;
      const dx = this.xs[i + 1]! - ax;
      const dz = this.zs[i + 1]! - az;
      const l2 = dx * dx + dz * dz;
      let t = ((x - ax) * dx + (z - az) * dz) / l2;
      // Before the start, measure along the straight extension instead.
      if (i > lo || lo > 0) t = Math.max(0, t);
      t = Math.min(1, t);
      const px = ax + dx * t;
      const pz = az + dz * t;
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 < best) {
        best = d2;
        bestS = (i + t) * ds;
        // (x - p) . n, where n = (dz, -dx) / l is the segment's left normal.
        bestLat = ((x - px) * dz - (z - pz) * dx) / Math.sqrt(l2);
      }
    }
    return { s: bestS, lat: bestLat, dist: Math.sqrt(best) };
  }

  /** Is (x, z) on the paved area (between the edges, past the start)? */
  inside(x: number, z: number, sHint: number, margin = 0): boolean {
    const n = this.nearest(x, z, sHint - 6, sHint + 6);
    return n.s >= margin && Math.abs(n.lat) <= this.width(n.s) / 2 - margin;
  }

  /** The paved area between arc lengths s0 and s1 as a polygon. */
  strip(s0: number, s1: number, step = 0.25): [number, number][] {
    const a = Math.max(0, s0);
    const n = Math.max(1, Math.ceil((s1 - a) / step));
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const s = a + ((s1 - a) * i) / n;
      const w = this.width(s) / 2;
      left.push(this.offset(s, w));
      right.push(this.offset(s, -w));
    }
    return [...right, ...left.reverse()];
  }
}
