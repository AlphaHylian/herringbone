// Generates src/levels/*.json from compact shape descriptions.
// Curves are stored as sampled points, as the level format requires.
// Run: node scripts/build-levels.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../src/levels/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const r1 = (v) => Math.round(v * 10) / 10;
const P = (x, y) => [r1(x), r1(y)];

/** Points on an arc from a0 to a1 (radians), chord length about `chord` mm, endpoints included. */
function arc(cx, cy, r, a0, a1, chord = 70) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / chord));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(P(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return pts;
}
function circle(cx, cy, r, chord = 70) {
  return arc(cx, cy, r, 0, 2 * Math.PI, chord).slice(0, -1);
}
function rect(x0, y0, x1, y1) {
  return [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
}
function wave(x0, y0, y1, amp, period, step = 60) {
  const pts = [];
  for (let y = y0; y <= y1 + 1e-9; y += step)
    pts.push(P(x0 + amp * Math.sin((y / period) * 2 * Math.PI), y));
  return pts;
}

const RED = ['#a8513a', '#b65e43', '#9a4632', '#bc6a4a'];
const CLAY = ['#c48852', '#b47645', '#cf9861', '#a96a3f'];
const SLATE = ['#8e8781', '#9c938a', '#7f7873', '#a79d92'];
const BRICK = { length: 200, width: 100 };

const levels = [
  // ---- Maple Row: stretcher bond tutorial, then 90° herringbone ----
  {
    id: 'maple-1',
    name: 'Garden Path',
    neighborhood: 'maple',
    clientNote: 'Just a little path to the veg beds, please. Nothing fancy!',
    border: { outer: rect(0, 0, 600, 1000) },
    pattern: { type: 'stretcher' },
    colors: RED,
    decorations: [
      { type: 'plant', at: [-280, 150] },
      { type: 'watering-can', at: [830, 820] },
      { type: 'cat', at: [300, 1300] },
    ],
    tutorial: true,
  },
  {
    id: 'maple-2',
    name: 'Back Step',
    neighborhood: 'maple',
    clientNote: 'Herringbone by the back door, like my gran had.',
    border: { outer: rect(0, 0, 800, 1000) },
    pattern: { type: 'herringbone90', offset: [30, 40] },
    colors: RED,
    decorations: [
      { type: 'plant', at: [-280, 100] },
      { type: 'bench', at: [400, 1270] },
      { type: 'cat', at: [1080, 600] },
    ],
  },
  {
    id: 'maple-3',
    name: 'L-Shaped Patio',
    neighborhood: 'maple',
    clientNote: 'It wraps round the kitchen corner. Mind the inside corner!',
    border: {
      outer: [P(0, 0), P(1100, 0), P(1100, 650), P(550, 650), P(550, 1500), P(0, 1500)],
    },
    pattern: { type: 'herringbone90', offset: [10, 70] },
    colors: RED,
    decorations: [
      { type: 'table', at: [820, 330] },
      { type: 'plant', at: [760, 900] },
      { type: 'cat', at: [280, 1800] },
    ],
  },
  {
    id: 'maple-4',
    name: 'Pointed Path',
    neighborhood: 'maple',
    clientNote: 'The path meets the lawn at an angle. Can you follow the line?',
    border: { outer: [P(0, 0), P(650, 0), P(650, 1200), P(0, 1850)] },
    pattern: { type: 'herringbone90', offset: [55, 20] },
    colors: RED,
    decorations: [
      { type: 'lantern', at: [-140, 300] },
      { type: 'plant', at: [800, 1400] },
      { type: 'bike', at: [820, 400] },
    ],
  },
  {
    id: 'maple-5',
    name: 'Corner Nook',
    neighborhood: 'maple',
    clientNote: 'A quiet spot for a chair, tucked into the fence corner.',
    border: { outer: [P(0, 0), P(1000, 0), P(1000, 600), P(450, 1350), P(0, 1350)] },
    pattern: { type: 'stretcher', angle: 90, offset: [50, 0] },
    colors: RED,
    decorations: [
      { type: 'bench', at: [500, -280] },
      { type: 'birdbath', at: [900, 1100] },
      { type: 'cat', at: [-300, 900] },
    ],
  },

  // ---- Willow Lane: unlocks 45° herringbone; round and curved jobs ----
  {
    id: 'willow-1',
    name: 'Shed Apron',
    neighborhood: 'willow',
    clientNote: 'In front of the shed. I hear diagonal herringbone is very smart.',
    border: { outer: rect(0, 0, 900, 1150) },
    pattern: { type: 'herringbone45', offset: [0, 25] },
    colors: CLAY,
    decorations: [
      { type: 'watering-can', at: [-260, 500] },
      { type: 'bike', at: [1050, 300] },
      { type: 'cat', at: [450, 1420] },
    ],
  },
  {
    id: 'willow-2',
    name: 'Fire-Pit Circle',
    neighborhood: 'willow',
    clientNote: 'A round patio around the fire pit for autumn evenings.',
    border: { outer: circle(700, 700, 700), holes: [circle(700, 700, 250)] },
    pattern: { type: 'herringbone90', offset: [20, 50] },
    colors: CLAY,
    decorations: [
      { type: 'firepit', at: [700, 700] },
      { type: 'bench', at: [700, 1680] },
      { type: 'cat', at: [1550, 300] },
    ],
  },
  {
    id: 'willow-3',
    name: 'Curved Drive',
    neighborhood: 'willow',
    clientNote: 'The drive sweeps round the old oak. Follow the curve, please.',
    border: {
      outer: [...arc(0, 0, 1650, 0, Math.PI / 2), ...arc(0, 0, 900, Math.PI / 2, 0)],
    },
    pattern: { type: 'herringbone45', offset: [15, 30] },
    colors: CLAY,
    decorations: [
      { type: 'tree', at: [250, 250] },
      { type: 'car', at: [1300, 950] },
      { type: 'plant', at: [1900, 250] },
    ],
  },
  {
    id: 'willow-4',
    name: 'Bay Terrace',
    neighborhood: 'willow',
    clientNote: 'A terrace that bows out under the bay window.',
    border: {
      outer: [
        P(0, 600),
        ...arc(550, 600, 550, Math.PI, 2 * Math.PI).slice(1, -1),
        P(1100, 600),
        P(1100, 1550),
        P(0, 1550),
      ],
    },
    pattern: { type: 'herringbone45', offset: [40, 0] },
    colors: CLAY,
    decorations: [
      { type: 'table', at: [550, 450] },
      { type: 'parasol', at: [550, 450] },
      { type: 'plant', at: [-280, 1300] },
      { type: 'cat', at: [1380, 900] },
    ],
  },

  // ---- Harbour Hill: unlocks basketweave; cut-outs and wavy edges ----
  {
    id: 'harbour-1',
    name: 'Courtyard',
    neighborhood: 'harbour',
    clientNote: 'A neat square courtyard. Basketweave, like the old harbour walk.',
    border: { outer: rect(0, 0, 1000, 1100) },
    pattern: { type: 'basketweave', offset: [60, 30] },
    colors: SLATE,
    decorations: [
      { type: 'bench', at: [500, -290] },
      { type: 'plant', at: [1270, 1000] },
      { type: 'cat', at: [-300, 600] },
    ],
  },
  {
    id: 'harbour-2',
    name: 'Café Terrace',
    neighborhood: 'harbour',
    clientNote: 'Our plane tree stays! Pave around it, leave it room to breathe.',
    border: { outer: rect(0, 0, 1100, 1500), holes: [circle(550, 700, 260)] },
    pattern: { type: 'herringbone90', offset: [35, 15] },
    colors: SLATE,
    decorations: [
      { type: 'tree', at: [550, 700] },
      { type: 'table', at: [270, 1250] },
      { type: 'parasol', at: [270, 1250] },
      { type: 'table', at: [830, 250] },
      { type: 'cat', at: [1380, 1100] },
    ],
  },
  {
    id: 'harbour-3',
    name: 'Garden Round',
    neighborhood: 'harbour',
    clientNote: 'An eight-sided seating circle in the middle of the lawn.',
    border: {
      outer: Array.from({ length: 8 }, (_, i) => {
        const a = Math.PI / 8 + (i * Math.PI) / 4;
        return P(650 + 650 * Math.cos(a), 650 + 650 * Math.sin(a));
      }),
    },
    pattern: { type: 'basketweave', angle: 0, offset: [50, 50] },
    colors: SLATE,
    decorations: [
      { type: 'birdbath', at: [650, 650] },
      { type: 'bench', at: [650, 1530] },
      { type: 'cat', at: [1530, 650] },
    ],
  },
  {
    id: 'harbour-4',
    name: 'Promenade',
    neighborhood: 'harbour',
    clientNote: 'The seafront walk. The edge follows the sea wall, waves and all.',
    border: {
      outer: [P(0, 0), ...wave(850, 0, 1800, 90, 900), P(0, 1800)],
      holes: [circle(380, 1250, 210)],
    },
    pattern: { type: 'herringbone45', offset: [20, 10] },
    colors: SLATE,
    decorations: [
      { type: 'tree', at: [380, 1250] },
      { type: 'lantern', at: [-140, 400] },
      { type: 'bench', at: [-300, 900], rotation: 90 },
      { type: 'cat', at: [1250, 1300] },
    ],
  },
];

for (const l of levels) {
  const data = { ...l, brick: BRICK };
  writeFileSync(new URL(`${l.id}.json`, OUT), JSON.stringify(data, null, 2) + '\n');
}
writeFileSync(
  new URL('index.json', OUT),
  JSON.stringify(
    {
      neighborhoods: [
        {
          id: 'maple',
          name: 'Maple Row',
          pattern: 'herringbone90',
          levels: levels.filter((l) => l.neighborhood === 'maple').map((l) => l.id),
        },
        {
          id: 'willow',
          name: 'Willow Lane',
          pattern: 'herringbone45',
          levels: levels.filter((l) => l.neighborhood === 'willow').map((l) => l.id),
        },
        {
          id: 'harbour',
          name: 'Harbour Hill',
          pattern: 'basketweave',
          levels: levels.filter((l) => l.neighborhood === 'harbour').map((l) => l.id),
        },
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(`wrote ${levels.length} levels`);
