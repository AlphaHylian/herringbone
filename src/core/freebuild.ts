/** Free Build: generate a level from a chosen border shape and pattern. No rating. */
import type { LevelData } from './level';
import type { PatternType } from './patterns';
import type { Pt } from './geom';

export const FREE_SHAPES = [
  'square',
  'path',
  'ell',
  'round',
  'arc',
  'octagon',
  'pointed',
  'tree',
] as const;
export type FreeShape = (typeof FREE_SHAPES)[number];

export const FREE_SHAPE_NAMES: Record<FreeShape, string> = {
  square: 'Patio',
  path: 'Path',
  ell: 'L-shape',
  round: 'Circle',
  arc: 'Curve',
  octagon: 'Octagon',
  pointed: 'Point',
  tree: 'Tree pit',
};

function arc(cx: number, cy: number, r: number, a0: number, a1: number, chord = 70): Pt[] {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / chord));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([
      Math.round((cx + r * Math.cos(a)) * 10) / 10,
      Math.round((cy + r * Math.sin(a)) * 10) / 10,
    ]);
  }
  return out;
}

export function freeShapeBorder(shape: FreeShape): { outer: Pt[]; holes?: Pt[][] } {
  switch (shape) {
    case 'square':
      return {
        outer: [
          [0, 0],
          [1000, 0],
          [1000, 1100],
          [0, 1100],
        ],
      };
    case 'path':
      return {
        outer: [
          [0, 0],
          [600, 0],
          [600, 1700],
          [0, 1700],
        ],
      };
    case 'ell':
      return {
        outer: [
          [0, 0],
          [1000, 0],
          [1000, 600],
          [500, 600],
          [500, 1400],
          [0, 1400],
        ],
      };
    case 'round':
      return { outer: arc(650, 650, 650, 0, 2 * Math.PI).slice(0, -1) };
    case 'arc':
      return { outer: [...arc(0, 0, 1500, 0, Math.PI / 2), ...arc(0, 0, 850, Math.PI / 2, 0)] };
    case 'octagon':
      return {
        outer: Array.from({ length: 8 }, (_, i) => {
          const a = Math.PI / 8 + (i * Math.PI) / 4;
          return [Math.round(600 + 600 * Math.cos(a)), Math.round(600 + 600 * Math.sin(a))] as Pt;
        }),
      };
    case 'pointed':
      return {
        outer: [
          [0, 0],
          [700, 0],
          [700, 1100],
          [350, 1600],
          [0, 1100],
        ],
      };
    case 'tree':
      return {
        outer: [
          [0, 0],
          [1000, 0],
          [1000, 1300],
          [0, 1300],
        ],
        holes: [arc(500, 650, 250, 0, 2 * Math.PI).slice(0, -1)],
      };
  }
}

export function freeLevel(shape: FreeShape, pattern: PatternType, colors: string[]): LevelData {
  return {
    id: `free-${shape}-${pattern}`,
    name: 'Free Build',
    neighborhood: 'free',
    clientNote: 'Your own patch. No client, no rush.',
    border: freeShapeBorder(shape),
    pattern: { type: pattern, offset: [23, 41] },
    brick: { length: 200, width: 100 },
    colors,
    decorations: shape === 'tree' ? [{ type: 'tree', at: [500, 650] }] : [],
  };
}
