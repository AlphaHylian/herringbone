import { describe, expect, it } from 'vitest';
import { ringArea } from '../../src/core/geom';
import { PathModel } from '../../src/paver/path';
import { BRICK_L, BRICK_W, buildChunk, cutEdges, slotAt } from '../../src/paver/slots';

describe('endless path', () => {
  it('starts at the origin heading towards -z and never turns back', () => {
    const path = new PathModel(7);
    const p0 = path.at(0);
    expect(p0.x).toBeCloseTo(0);
    expect(p0.z).toBeCloseTo(0);
    let prevForward = 0;
    for (let s = 1; s < 2000; s += 1) {
      const p = path.at(s);
      // Forward progress along -z is strictly increasing.
      expect(-p.z).toBeGreaterThan(prevForward);
      prevForward = -p.z;
      expect(p.w).toBeGreaterThan(2.2);
      expect(p.w).toBeLessThan(3);
    }
  });

  it('finds the nearest centreline point with a signed lateral offset', () => {
    const path = new PathModel(3);
    for (const s of [2, 40, 333]) {
      const p = path.at(s);
      const [lx, lz] = path.offset(s, 0.8);
      const n = path.nearest(lx, lz, s - 3, s + 3);
      expect(n.s).toBeCloseTo(s, 1);
      expect(n.lat).toBeCloseTo(0.8, 2);
      const [rx, rz] = path.offset(s, -0.5);
      expect(path.nearest(rx, rz, s - 3, s + 3).lat).toBeCloseTo(-0.5, 2);
      expect(path.inside(p.x, p.z, s)).toBe(true);
      expect(path.inside(lx + p.nx * 2, lz + p.nz * 2, s)).toBe(false);
    }
  });
});

describe('herringbone chunks', () => {
  const path = new PathModel(11);

  it('covers each stretch of path with bricks and cut pieces, without overlaps', () => {
    for (const k of [0, 1, 7, 30]) {
      const chunk = buildChunk(path, k);
      expect(chunk.fullCount).toBeGreaterThan(300);
      expect(chunk.edgeCount).toBeGreaterThan(20);
      let area = 0;
      for (const slot of chunk.slots) area += ringArea(slot.piece);
      // Paved area is close to the strip's area (slivers left for jointing sand).
      const strip = ringArea(path.strip(chunk.s0, chunk.s1, 0.05));
      expect(area / strip).toBeGreaterThan(0.97);
      expect(area / strip).toBeLessThan(1.02);
    }
  });

  it('assigns every brick to exactly one chunk', () => {
    const a = buildChunk(path, 4);
    const b = buildChunk(path, 5);
    const ids = (c: ReturnType<typeof buildChunk>): Set<string> =>
      new Set(c.slots.map((s) => `${s.x.toFixed(4)},${s.z.toFixed(4)},${s.angle.toFixed(3)}`));
    const sa = ids(a);
    for (const id of ids(b)) expect(sa.has(id)).toBe(false);
  });

  it('is deterministic for a seed', () => {
    const a = buildChunk(new PathModel(5), 3);
    const b = buildChunk(new PathModel(5), 3);
    expect(a.slots.length).toBe(b.slots.length);
    expect(a.slots[17]!.x).toBe(b.slots[17]!.x);
  });

  it('finds slots by point and marks the splitter cuts on edge pieces', () => {
    const chunk = buildChunk(path, 2);
    for (const slot of chunk.slots.slice(0, 50)) {
      const cx = slot.piece.reduce((t, p) => t + p[0], 0) / slot.piece.length;
      const cz = slot.piece.reduce((t, p) => t + p[1], 0) / slot.piece.length;
      expect(slotAt(chunk, cx, cz)?.i).toBe(slot.i);
    }
    const edges = chunk.slots.filter((s) => s.kind === 'edge');
    for (const slot of edges) {
      expect(ringArea(slot.piece)).toBeLessThan(BRICK_L * BRICK_W);
      expect(cutEdges(slot).length).toBeGreaterThan(0);
    }
    const full = chunk.slots.find((s) => s.kind === 'full')!;
    expect(cutEdges(full)).toHaveLength(0);
  });
});
