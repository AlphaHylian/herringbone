import { describe, expect, it } from 'vitest';
import { allLevels } from '../../src/levels';
import { distToSegment, pointInRing, type Pt } from '../../src/core/geom';

// Rough footprint radii (mm) of things that should stand on the grass, not on the paving.
const OFF_PATIO: Record<string, number> = {
  bench: 640,
  plant: 200,
  lantern: 90,
  bike: 560,
  'watering-can': 200,
  cat: 240,
};

describe('decorations', () => {
  for (const l of allLevels()) {
    it(`${l.id}: grass-side decorations stay clear of the paving`, () => {
      for (const d of l.decorations) {
        const r = OFF_PATIO[d.type];
        if (r === undefined) continue;
        const outer = l.border.outer;
        expect(pointInRing(d.at, outer), `${d.type} inside`).toBe(false);
        let min = Infinity;
        for (let i = 0; i < outer.length; i++)
          min = Math.min(min, distToSegment(d.at, outer[i]!, outer[(i + 1) % outer.length]! as Pt));
        // benches are wide but shallow; use their half-depth against the border
        const need = d.type === 'bench' ? 230 : d.type === 'bike' ? 120 : r;
        expect(min, `${l.id} ${d.type} at ${d.at}`).toBeGreaterThan(need);
      }
    });
  }
});
