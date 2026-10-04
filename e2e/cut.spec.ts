import { expect, test, type Page } from '@playwright/test';

type Pt = [number, number];
const hb = (page: Page, expr: string): Promise<any> => page.evaluate(`(${expr})(window.__hb)`);

async function swipe(page: Page, a: Pt, b: Pt): Promise<void> {
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.mouse.move(b[0], b[1], { steps: 8 });
  await page.mouse.up();
}

/** Extend a segment a little past both ends so the swipe crosses the whole brick. */
function longer(a: Pt, b: Pt, k = 0.25): [Pt, Pt] {
  const d: Pt = [b[0] - a[0], b[1] - a[1]];
  return [
    [a[0] - d[0] * k, a[1] - d[1] * k],
    [b[0] + d[0] * k, b[1] + d[1] * k],
  ];
}

test('tap an edge slot, swipe a clean cut, piece is laid and offcut kept', async ({ page }) => {
  await page.goto('/?level=maple-1');
  await page.waitForFunction(() => (window as any).__hb?.ready && (window as any).__hb?.job);
  const edges: number[] = await hb(page, 'h => h.job.edgeSlots()');
  const at: Pt = await hb(page, `h => h.job.slotScreen(${edges[0]})`);
  await page.mouse.click(at[0], at[1]);
  await page.waitForFunction(() => (window as any).__hb.splitter);
  await page.waitForTimeout(300);
  const ideal: [Pt, Pt][] = await hb(page, 'h => h.splitter.idealScreen()');
  expect(ideal.length).toBeGreaterThan(0);
  const [a, b] = longer(ideal[0]![0], ideal[0]![1]);
  await swipe(page, a, b);
  // Clean cut: the piece flies into the slot on its own.
  await page.waitForFunction(() => !(window as any).__hb.splitter, null, { timeout: 30000 });
  expect(await hb(page, 'h => h.job.filled()')).toBe(1);
  expect(await hb(page, 'h => h.job.bricksUsed()')).toBe(1);
  expect(await hb(page, 'h => h.job.tray()')).toBe(1);

  // Drag the offcut from the tray into another half-brick gap: no new brick used.
  const from: Pt = await hb(page, 'h => h.job.trayScreen(0)');
  const left: number[] = await hb(page, 'h => h.job.edgeSlots()');
  const to: Pt = await hb(page, `h => h.job.slotScreen(${left[2]})`);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  expect(await hb(page, 'h => h.job.filled()')).toBe(2);
  expect(await hb(page, 'h => h.job.bricksUsed()')).toBe(1);
  expect(await hb(page, 'h => h.job.tray()')).toBe(0);
});

test('a sloppy cut can be undone, cut again, or laid as it is', async ({ page }) => {
  await page.goto('/?level=maple-1');
  await page.waitForFunction(() => (window as any).__hb?.ready && (window as any).__hb?.job);
  const edges: number[] = await hb(page, 'h => h.job.edgeSlots()');
  const at: Pt = await hb(page, `h => h.job.slotScreen(${edges[1]})`);
  await page.mouse.click(at[0], at[1]);
  await page.waitForFunction(() => (window as any).__hb.splitter);
  await page.waitForTimeout(300);
  const ideal: [Pt, Pt][] = await hb(page, 'h => h.splitter.idealScreen()');
  const [a, b] = longer(ideal[0]![0], ideal[0]![1]);
  // 25 px off to one side and slanted: not clean.
  await swipe(page, [a[0] + 30, a[1]], [b[0] + 10, b[1]]);
  await page.waitForTimeout(1500);
  expect(await hb(page, 'h => h.splitter.cuts()')).toBe(1);
  const acc: number = await hb(page, 'h => h.splitter.accuracy()');
  expect(acc).toBeLessThan(0.9);
  await page.screenshot({ path: 'test-results/splitter-sloppy.png' });
  // The splitter's undo button takes the cut back.
  const u: Pt = await hb(page, 'h => h.splitter.undoScreen()');
  await page.mouse.click(u[0], u[1]);
  await page.waitForTimeout(300);
  expect(await hb(page, 'h => h.splitter.cuts()')).toBe(0);
  // Sloppy again, then lay it anyway.
  await swipe(page, [a[0] + 30, a[1]], [b[0] + 10, b[1]]);
  await page.waitForTimeout(1500);
  await hb(page, 'h => h.splitter.lay()');
  await page.waitForFunction(() => !(window as any).__hb.splitter, null, { timeout: 30000 });
  expect(await hb(page, 'h => h.job.filled()')).toBe(1);
});
