import { expect, test, type Page } from '@playwright/test';

// The 3D game is a separate bundle served on its own port.
const URL = 'http://localhost:4174/?quality=low&shadows=0';

type V3 = [number, number, number];

const pv = <T>(page: Page, fn: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([f, a]) => (window as any).__pv[f as string](...(a as unknown[])), [
    fn,
    args,
  ] as const) as Promise<T>;

const state = (page: Page): Promise<Record<string, number>> => pv(page, 'debugState');

async function start(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => (window as any).__pv?.ready, null, { timeout: 60000 });
  await page.click('button:has-text("Start paving")', { force: true });
  await page.waitForTimeout(300);
}

/** Look at a world point and click the middle of the screen. */
async function actAt(page: Page, p: V3): Promise<void> {
  await pv(page, 'debugLookAt', ...p);
  await page.waitForTimeout(100);
  const size = page.viewportSize()!;
  await page.mouse.click(size.width / 2, size.height / 2);
}

test.use({ viewport: { width: 960, height: 600 } });

test('3D site: pick up, lay, mark, cut on the splitter, lay the cut piece, reload', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);

  // Walk up to the first pack and take an armful.
  const pack = await pv<V3>(page, 'debugPack');
  await pv(page, 'debugMove', pack[0] * 0.35, pack[2]);
  await actAt(page, pack);
  await expect.poll(async () => (await state(page)).whole).toBeGreaterThan(4);

  // Lay a whole block in the nearest gap.
  const full = await pv<[number, number]>(page, 'debugNearestSlot', 'full');
  await actAt(page, [full[0], 0, full[1]]);
  await expect.poll(async () => (await state(page)).laid, { timeout: 20000 }).toBe(1);

  // Mark a block for an edge gap.
  const edge = await pv<[number, number]>(page, 'debugNearestSlot', 'edge');
  await pv(page, 'debugMove', edge[0] * 0.7, edge[1] + 0.6);
  await actAt(page, [edge[0], 0, edge[1]]);
  await expect.poll(async () => (await state(page)).marked).toBe(1);

  // Cut it on the splitter.
  const sp = await pv<V3>(page, 'debugSplitter');
  await pv(page, 'debugMove', sp[0] + 1.1, sp[2] + 0.2);
  await actAt(page, sp);
  await expect.poll(async () => (await state(page)).cut, { timeout: 30000 }).toBe(1);

  // Lay the cut piece in its gap.
  const gap = (await pv<[number, number]>(page, 'debugCutSlot'))!;
  await pv(page, 'debugMove', gap[0] * 0.7, gap[1] + 0.6);
  await actAt(page, [gap[0], 0, gap[1]]);
  await expect.poll(async () => (await state(page)).laid, { timeout: 20000 }).toBe(2);
  expect((await state(page)).cut).toBe(0);
  await page.screenshot({ path: 'test-results/paver-laid.png' });

  // Progress survives a reload.
  await pv(page, 'save');
  await start(page);
  expect((await state(page)).laid).toBe(2);
  expect(errors).toEqual([]);
});

test('3D site loads on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => (window as any).__pv?.ready, null, { timeout: 60000 });
  await expect(page.locator('button:has-text("Start paving")')).toBeVisible();
  await page.click('button:has-text("Start paving")', { force: true });
  await page.waitForTimeout(800);
  await expect(page.locator('.hud .hint')).toContainText(/pack/i);
  await page.screenshot({ path: 'test-results/paver-phone.png' });
  expect(errors).toEqual([]);
});
