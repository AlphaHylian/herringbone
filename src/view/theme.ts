/** Colours and type for the calm, warm look. */
export const THEME = {
  bg: 0xe8d9bf,
  ink: 0x4a3b2f,
  inkSoft: 0x7a6656,
  paper: 0xf7f0e3,
  paperShade: 0xe9dcc6,
  accent: 0xc0643f,
  accentDark: 0x9c4c2d,
  leaf: 0x6f8f4e,
  leafDark: 0x4f6b36,
  chalk: 0xfffaf0,
  shadow: 0x2b1d12,
  gold: 0xd9a441,
  font: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

export function hexToNum(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Mix two 0xRRGGBB colours. */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}
