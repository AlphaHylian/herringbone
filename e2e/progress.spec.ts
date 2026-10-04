import { expect, test, type Page } from '@playwright/test';

type Pt = [number, number];
const hb = (page: Page, expr: string): Promise<any> => page.evaluate(`(${expr})(window.__hb)`);

async function tapTile(page: Page, id: string): Promise<void> {
  await hb(page, `h => h.map.scrollTo('${id}')`);
  await page.waitForTimeout(900);
  const p: Pt = await hb(page, `h => h.map.tileScreen('${id}')`);
  await page.mouse.click(p[0], p[1]);
}

test('map -> note -> tutorial -> finish -> saved, reviewed and persisted', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => (window as any).__hb?.ready && (window as any).__hb?.map);
  await page.screenshot({ path: 'test-results/map-fresh.png' });

  // A locked job does nothing.
  await tapTile(page, 'maple-2');
  await page.waitForTimeout(600);
  expect(await hb(page, 'h => !!h.map')).toBe(true);

  await tapTile(page, 'maple-1');
  await page.waitForFunction(() => (window as any).__hb.job && (window as any).__hb.note);
  await hb(page, 'h => h.note()');
  await page.waitForFunction(() => (window as any).__hb.tutorial);
  expect(await hb(page, 'h => h.tutorial()')).toBe('drag');
  await hb(page, 'h => h.job.solve()');
  await page.waitForTimeout(800);
  await page.mouse.click(195, 300); // skip the finishing sequence
  await page.waitForFunction(() => (window as any).__hb.job.mode() === 'done', null, {
    timeout: 60000,
  });
  const saved = await hb(page, 'h => h.save.data');
  expect(saved.completed['maple-1'].rating).toBeGreaterThanOrEqual(1);
  expect(Object.keys(saved.completed['maple-1'].edges).length).toBeGreaterThan(0);

  // Reload: progress persists through the storage interface (localStorage on the web).
  await page.reload();
  await page.waitForFunction(() => (window as any).__hb?.ready && (window as any).__hb?.map);
  expect(await hb(page, `h => !!h.save.data.completed['maple-1']`)).toBe(true);
  await page.waitForFunction(() => (window as any).__hb.map.ready(), null, { timeout: 30000 });
  await page.screenshot({ path: 'test-results/map-progress.png' });

  // The next job is open now.
  await tapTile(page, 'maple-2');
  await page.waitForFunction(() => (window as any).__hb.job?.id === 'maple-2');
  await page.goBack().catch(() => undefined);
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__hb?.ready && (window as any).__hb?.map);

  // Finished jobs open in review.
  await tapTile(page, 'maple-1');
  await page.waitForFunction(() => (window as any).__hb.job?.id === 'maple-1');
  expect(await hb(page, 'h => h.job.complete()')).toBe(true);
  expect(await hb(page, 'h => h.job.mode()')).toBe('done');
});

test('settings persist', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => (window as any).__hb?.ready && (window as any).__hb?.map);
  await hb(page, 'h => h.map.openSettings()');
  await page.waitForTimeout(500);
  await hb(page, 'h => h.settings.toggleReduceMotion()');
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForFunction(() => (window as any).__hb?.ready);
  expect(await hb(page, 'h => h.save.data.settings.reduceMotion')).toBe(true);
});

test('free build: pave freely with no rating', async ({ page }) => {
  await page.goto('/?scene=freebuild');
  await page.waitForFunction(() => (window as any).__hb?.ready);
  await page.screenshot({ path: 'test-results/freebuild.png' });
  await page.mouse.click(195, 580); // Start paving
  await page.waitForFunction(() => (window as any).__hb.job);
  await hb(page, 'h => h.job.solve()');
  await page.waitForTimeout(800);
  await page.mouse.click(195, 300);
  await page.waitForFunction(() => (window as any).__hb.job.mode() === 'done', null, {
    timeout: 60000,
  });
  expect(await hb(page, 'h => Object.keys(h.save.data.completed).length')).toBe(0);
});

test('reduce motion: the finishing sequence plays through quickly without a skip', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem(
      'herringbone:save',
      JSON.stringify({
        version: 1,
        completed: {},
        tutorialDone: true,
        settings: { volume: 0.5, muted: true, haptics: false, reduceMotion: true },
      }),
    ),
  );
  await page.goto('/?level=maple-1');
  await page.waitForFunction(() => (window as any).__hb?.job);
  const t0 = Date.now();
  await hb(page, 'h => h.job.solve()');
  await page.waitForFunction(() => (window as any).__hb.job.mode() === 'done', null, {
    timeout: 30000,
  });
  expect(Date.now() - t0).toBeLessThan(15000);
  expect(await hb(page, 'h => !!h.finishSkipped')).toBe(false);
});
