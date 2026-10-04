// Regenerates docs/screenshots. Run: SCREENSHOTS=1 pnpm e2e e2e/screenshots.spec.ts
import { test, type Page } from '@playwright/test';
import sharp from 'sharp';

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate docs/screenshots');
test.use({ deviceScaleFactor: 2 });
test.setTimeout(300_000);

const hb = (page: Page, expr: string): Promise<any> => page.evaluate(`(${expr})(window.__hb)`);
async function shot(page: Page, name: string): Promise<void> {
  const buf = await page.screenshot();
  await sharp(buf)
    .resize(585)
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(`docs/screenshots/${name}.png`);
}
async function done(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__hb.job.mode() === 'done', null, {
    timeout: 120000,
  });
  await page.waitForTimeout(1500);
}

test('screenshots', async ({ page }) => {
  // Map with a little progress
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?level=maple-1');
  await page.waitForFunction(() => (window as any).__hb?.job);
  await hb(page, 'h => h.job.solve()');
  await page.mouse.click(195, 300);
  await done(page);
  await shot(page, '06-finished');
  await page.goto('/?level=maple-2');
  await page.waitForFunction(() => (window as any).__hb?.job);
  await hb(page, 'h => h.job.solve()');
  await page.mouse.click(195, 300);
  await done(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__hb?.map?.ready());
  await page.waitForTimeout(800);
  await shot(page, '01-map');

  // Client note
  await page.goto('/?level=willow-2&note=1');
  await page.waitForFunction(() => (window as any).__hb?.note);
  await page.waitForTimeout(900);
  await shot(page, '02-client-note');

  // A job in progress
  await page.goto('/?level=harbour-2');
  await page.waitForFunction(() => (window as any).__hb?.job);
  await hb(page, 'h => h.job.solveSome(70)');
  await page.waitForTimeout(800);
  await shot(page, '03-paving');

  // The splitter mid-swipe
  const edges: number[] = await hb(page, 'h => h.job.edgeSlots()');
  const at = await hb(page, `h => h.job.slotScreen(${edges[0]})`);
  await page.mouse.click(at[0], at[1]);
  await page.waitForFunction(() => (window as any).__hb.splitter);
  await page.waitForTimeout(500);
  const [[a, b]] = await hb(page, 'h => h.splitter.idealScreen()');
  await page.mouse.move(a[0] - (b[0] - a[0]) * 0.2, a[1] - (b[1] - a[1]) * 0.2);
  await page.mouse.down();
  await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 6 });
  await shot(page, '04-splitter');
  await page.mouse.up();

  // Finishing sequence mid-sweep
  await page.goto('/?level=willow-3');
  await page.waitForFunction(() => (window as any).__hb?.job);
  await hb(page, 'h => h.job.solve()');
  await page.waitForTimeout(1300);
  await shot(page, '05-sand-sweep');
  await done(page);
  await page.waitForTimeout(3000);
  await shot(page, '07-rating');

  // Tutorial
  await page.goto('/?level=maple-1&tutorial=1');
  await page.waitForFunction(() => (window as any).__hb?.tutorial);
  await page.waitForTimeout(1900);
  await shot(page, '08-tutorial');

  // Free Build and settings
  await page.goto('/?scene=freebuild');
  await page.waitForFunction(() => (window as any).__hb?.ready);
  await page.waitForTimeout(600);
  await shot(page, '09-free-build');
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__hb?.map);
  await hb(page, 'h => h.map.openSettings()');
  await page.waitForTimeout(700);
  await shot(page, '10-settings');
});
