import { devices, expect, test, type Page } from '@playwright/test';

// Safari's engine (WebKit) on an iPad-sized touch screen, driven with real taps.
const URL = 'http://localhost:4174/?quality=low&shadows=0';

test.use({
  ...devices['iPad Pro 11 landscape'],
  browserName: 'webkit',
  launchOptions: {},
});

type V3 = [number, number, number];

const pv = <T>(page: Page, fn: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([f, a]) => (window as any).__pv[f as string](...(a as unknown[])), [
    fn,
    args,
  ] as const) as Promise<T>;

const state = (page: Page): Promise<Record<string, number>> => pv(page, 'debugState');

test('iPad (WebKit, touch): start, tap a pack, tap to lay', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => (window as any).__pv?.ready, null, { timeout: 90000 });
  expect(await page.evaluate(() => (window as any).__pv.input.touch)).toBe(true);
  const start = page.locator('button:has-text("Start paving")');
  const box = (await start.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.hud .hint')).toContainText(/Tap a pack/, { timeout: 30000 });

  // Tap the pack where it appears on screen (on the right half, away from the joystick).
  const pack = await pv<V3>(page, 'debugPack');
  await pv(page, 'debugMove', pack[0] * 0.35, pack[2]);
  await pv(page, 'debugLookAt', pack[0], pack[1], pack[2]);
  const size = page.viewportSize()!;
  await page.touchscreen.tap(size.width * 0.5 + 2, size.height * 0.5);
  await expect.poll(async () => (await state(page)).whole, { timeout: 30000 }).toBeGreaterThan(4);

  // Tap a gap in the sand bed to lay a block there.
  const slot = await pv<[number, number]>(page, 'debugNearestSlot', 'full');
  await pv(page, 'debugLookAt', slot[0], 0, slot[1]);
  await page.touchscreen.tap(size.width * 0.5 + 2, size.height * 0.5);
  await expect.poll(async () => (await state(page)).laid, { timeout: 40000 }).toBe(1);
  await page.screenshot({ path: 'test-results/paver-ipad.png' });
  expect(errors).toEqual([]);
});
