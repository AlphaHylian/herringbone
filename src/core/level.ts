/** Level data model and validating loader. Levels live as JSON in src/levels/. */
import { PATTERN_TYPES, type PatternType } from './patterns';
import { difference, polyArea, ringArea, shapeArea, type Poly, type Pt, type Ring } from './geom';

export const DECORATION_TYPES = [
  'bench',
  'plant',
  'cat',
  'lantern',
  'bike',
  'table',
  'firepit',
  'tree',
  'car',
  'watering-can',
  'birdbath',
  'parasol',
] as const;
export type DecorationType = (typeof DECORATION_TYPES)[number];

export interface Decoration {
  type: DecorationType;
  /** World position (mm). */
  at: Pt;
  /** Optional rotation in degrees. */
  rotation?: number;
}

export interface LevelData {
  id: string;
  name: string;
  neighborhood: string;
  /** Short note from the client shown before the job. */
  clientNote: string;
  border: {
    /** Outer boundary, sampled points, any winding. Curves are stored as dense samples. */
    outer: Pt[];
    /** Optional cut-outs (tree pits, drains). */
    holes?: Pt[][];
  };
  pattern: {
    type: PatternType;
    /** Extra rotation of the pattern in degrees. */
    angle?: number;
    /** Offset of the pattern origin in mm. */
    offset?: Pt;
  };
  brick: { length: number; width: number };
  /** Base colours for bricks (hex). Each brick picks one with slight variation. */
  colors: string[];
  decorations: Decoration[];
  /** Show the drag/cut tutorial. */
  tutorial?: boolean;
}

export class LevelValidationError extends Error {
  constructor(
    public readonly levelId: string,
    message: string,
  ) {
    super(`Level "${levelId}": ${message}`);
    this.name = 'LevelValidationError';
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isPt(v: unknown): v is Pt {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}
const HEX = /^#[0-9a-fA-F]{6}$/;

function validRing(id: string, what: string, v: unknown): Ring {
  if (!Array.isArray(v) || v.length < 3)
    throw new LevelValidationError(id, `${what} needs at least 3 points`);
  for (const p of v)
    if (!isPt(p)) throw new LevelValidationError(id, `${what} has an invalid point`);
  const ring = v as Ring;
  if (ringArea(ring) <= 0) throw new LevelValidationError(id, `${what} has zero area`);
  return ring;
}

/** Validates raw JSON and returns a typed level. Throws LevelValidationError on bad data. */
export function validateLevel(raw: unknown): LevelData {
  const id = isObj(raw) && typeof raw.id === 'string' ? raw.id : '(unknown)';
  if (!isObj(raw)) throw new LevelValidationError(id, 'not an object');
  for (const key of ['id', 'name', 'neighborhood', 'clientNote'] as const) {
    if (typeof raw[key] !== 'string' || (raw[key] as string).length === 0)
      throw new LevelValidationError(id, `missing string field "${key}"`);
  }
  const border = raw.border;
  if (!isObj(border)) throw new LevelValidationError(id, 'missing border');
  const outer = validRing(id, 'border.outer', border.outer);
  const holes: Ring[] = [];
  if (border.holes !== undefined) {
    if (!Array.isArray(border.holes))
      throw new LevelValidationError(id, 'border.holes must be an array');
    border.holes.forEach((h, i) => holes.push(validRing(id, `border.holes[${i}]`, h)));
  }
  // A self-intersecting outline would make the clipped area differ from the shoelace area.
  const clipped = shapeArea(difference([outer], ...holes.map((h) => [h])));
  const expected = polyArea([outer, ...holes]);
  if (Math.abs(clipped - expected) > 1e-6 * Math.max(1, expected))
    throw new LevelValidationError(id, 'border is self-intersecting or holes leave the outline');

  const pattern = raw.pattern;
  if (!isObj(pattern) || !PATTERN_TYPES.includes(pattern.type as PatternType))
    throw new LevelValidationError(id, `pattern.type must be one of ${PATTERN_TYPES.join(', ')}`);
  if (
    pattern.angle !== undefined &&
    (typeof pattern.angle !== 'number' || !Number.isFinite(pattern.angle))
  )
    throw new LevelValidationError(id, 'pattern.angle must be a number');
  if (pattern.offset !== undefined && !isPt(pattern.offset))
    throw new LevelValidationError(id, 'pattern.offset must be [x, y]');

  const brick = raw.brick;
  if (
    !isObj(brick) ||
    typeof brick.length !== 'number' ||
    typeof brick.width !== 'number' ||
    !(brick.length > 0) ||
    !(brick.width > 0) ||
    brick.width > brick.length
  )
    throw new LevelValidationError(id, 'brick needs positive length >= width');
  if (pattern.type !== 'stretcher' && Math.abs(brick.length - 2 * brick.width) > 1e-9)
    throw new LevelValidationError(
      id,
      `${String(pattern.type)} needs bricks with length = 2 x width`,
    );

  if (
    !Array.isArray(raw.colors) ||
    raw.colors.length === 0 ||
    !raw.colors.every((c) => typeof c === 'string' && HEX.test(c))
  )
    throw new LevelValidationError(id, 'colors must be a non-empty list of #rrggbb strings');

  if (!Array.isArray(raw.decorations))
    throw new LevelValidationError(id, 'decorations must be an array');
  for (const d of raw.decorations) {
    if (!isObj(d) || !DECORATION_TYPES.includes(d.type as DecorationType) || !isPt(d.at))
      throw new LevelValidationError(id, `invalid decoration ${JSON.stringify(d)}`);
  }
  if (raw.tutorial !== undefined && typeof raw.tutorial !== 'boolean')
    throw new LevelValidationError(id, 'tutorial must be a boolean');

  return raw as unknown as LevelData;
}

export function levelPoly(level: LevelData): Poly {
  return [level.border.outer, ...(level.border.holes ?? [])];
}
