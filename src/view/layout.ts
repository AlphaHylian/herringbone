/** Screen metrics and safe-area insets (notch, home indicator). */
export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Layout {
  width: number;
  height: number;
  safe: Insets;
}

export function readSafeArea(): Insets {
  const probe = document.getElementById('safe-area-probe');
  if (!probe) return { top: 0, bottom: 0, left: 0, right: 0 };
  const cs = getComputedStyle(probe);
  const px = (v: string): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const insets = { top: px(cs.top), bottom: px(cs.bottom), left: px(cs.left), right: px(cs.right) };
  // Debug/testing override: ?safe=47,34 simulates a notch and home indicator.
  const q = new URLSearchParams(location.search).get('safe');
  if (q) {
    const [t, b] = q.split(',').map(Number);
    insets.top = t ?? insets.top;
    insets.bottom = b ?? insets.bottom;
  }
  return insets;
}
