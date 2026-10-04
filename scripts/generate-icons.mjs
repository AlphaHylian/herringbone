// Renders the app icon and splash screens procedurally (a herringbone tile) to PNG,
// then `npx capacitor-assets generate` turns them into every iOS/Android size.
// Run: pnpm icons
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'assets';
mkdirSync(OUT, { recursive: true });
mkdirSync('public', { recursive: true });

// Tiny seeded PRNG so the art is stable between runs.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = ['#a8513a', '#b65e43', '#9a4632', '#bc6a4a', '#c27250'];

/** SVG of herringbone bricks filling a size x size square, rotated 45 degrees. */
function herringbone(size, W, seed, { joint = '#d9c49b', rotate = 45 } = {}) {
  const r = rng(seed);
  const L = 2 * W;
  const g = W * 0.07; // joint
  const bricks = [];
  const range = Math.ceil((size * 1.6) / W) + 4;
  for (let i = -range; i <= range; i++) {
    for (let j = -range; j <= range; j++) {
      const ox = i * W + j * 2 * W;
      const oy = i * W - j * 2 * W;
      const c1 = COLORS[Math.floor(r() * COLORS.length)];
      const c2 = COLORS[Math.floor(r() * COLORS.length)];
      // horizontal brick [k, k+2]x[k, k+1] and vertical [k+2, k+3]x[k-1, k+1] (units of W)
      bricks.push(
        `<rect x="${ox + g / 2}" y="${oy + g / 2}" width="${L - g}" height="${W - g}" rx="${W * 0.08}" fill="${c1}"/>`,
      );
      bricks.push(
        `<rect x="${ox + 2 * W + g / 2}" y="${oy - W + g / 2}" width="${W - g}" height="${L - g}" rx="${W * 0.08}" fill="${c2}"/>`,
      );
    }
  }
  return `<g transform="translate(${size / 2} ${size / 2}) rotate(${rotate})">
    <rect x="${-size}" y="${-size}" width="${size * 2}" height="${size * 2}" fill="${joint}"/>
    ${bricks.join('')}
    <g fill="url(#sheen)">${''}</g>
  </g>`;
}

function defs() {
  return `<defs>
    <radialGradient id="vignette" cx="50%" cy="42%" r="70%">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#2b1d12" stop-opacity="0.35"/>
    </radialGradient>
    <linearGradient id="light" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff5e6" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="#fff5e6" stop-opacity="0"/>
    </linearGradient>
  </defs>`;
}

async function png(svg, file, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log('wrote', file);
}

// App icon: herringbone with a soft light and vignette.
const S = 1024;
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${defs()}
  ${herringbone(S, 128, 7)}
  <rect width="${S}" height="${S}" fill="url(#light)"/>
  <rect width="${S}" height="${S}" fill="url(#vignette)"/>
</svg>`;
await png(iconSvg, `${OUT}/icon-only.png`, 1024);
// Android adaptive icon: background + foreground layers.
await png(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${defs()}${herringbone(S, 128, 7)}<rect width="${S}" height="${S}" fill="url(#light)"/></svg>`,
  `${OUT}/icon-background.png`,
  1024,
);
await png(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
    <rect x="${S * 0.3}" y="${S * 0.41}" width="${S * 0.4}" height="${S * 0.2}" rx="${S * 0.03}" fill="#2b1d12" opacity="0.25" transform="translate(10 18)"/>
    <rect x="${S * 0.3}" y="${S * 0.41}" width="${S * 0.4}" height="${S * 0.2}" rx="${S * 0.03}" fill="#f7f0e3"/>
    <rect x="${S * 0.32}" y="${S * 0.425}" width="${S * 0.36}" height="${S * 0.04}" rx="${S * 0.02}" fill="#ffffff" opacity="0.6"/>
  </svg>`,
  `${OUT}/icon-foreground.png`,
  1024,
);
// Splash: sand background with a herringbone medallion in the middle.
const P = 2732;
const splash = (
  bg,
  joint,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="${P}" height="${P}">${defs()}
  <rect width="${P}" height="${P}" fill="${bg}"/>
  <clipPath id="c"><rect x="${P / 2 - 260}" y="${P / 2 - 260}" width="520" height="520" rx="110"/></clipPath>
  <rect x="${P / 2 - 260 + 8}" y="${P / 2 - 260 + 22}" width="520" height="520" rx="110" fill="#2b1d12" opacity="0.18"/>
  <g clip-path="url(#c)"><g transform="translate(${P / 2 - 260} ${P / 2 - 260})">${herringbone(520, 48, 7, { joint })}</g></g>
</svg>`;
await png(splash('#e8d9bf', '#d9c49b'), `${OUT}/splash.png`, P);
await png(splash('#2e261f', '#4a3d31'), `${OUT}/splash-dark.png`, P);
// Web favicon
await png(iconSvg, 'public/favicon.png', 128);
