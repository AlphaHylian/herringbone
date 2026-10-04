import { expect, test, type Page } from '@playwright/test';

type Pt = [number, number];

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__hb?.ready && (window as any).__hb?.job);
  await page.waitForTimeout(400);
}

const job = <T>(page: Page, fn: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([f, a]) => (window as any).__hb.job[f as string](...(a as unknown[])), [
    fn,
    args,
  ] as const) as Promise<T>;

test('drag, tap, undo, then finish a job', async ({ page }) => {
  await ready(page, '/?level=maple-2');
  const total = await job<number>(page, 'slots');
  expect(total).toBeGreaterThan(20);

  // Drag a brick from the pallet onto a full slot.
  const fulls = await job<number[]>(page, 'fullSlots');
  const target = await job<Pt>(page, 'slotScreen', fulls[0]);
  const pallet = await job<Pt>(page, 'palletScreen');
  await page.mouse.move(pallet[0], pallet[1]);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      pallet[0] + ((target[0] - pallet[0]) * i) / 12,
      pallet[1] + ((target[1] - pallet[1]) * i) / 12,
    );
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await job<number>(page, 'filled')).toBe(1);

  // Tap another full slot to auto-fill it.
  const second = await job<Pt>(page, 'slotScreen', fulls[5]);
  await page.mouse.click(second[0], second[1]);
  await page.waitForTimeout(500);
  expect(await job<number>(page, 'filled')).toBe(2);
  expect(await job<number>(page, 'bricksUsed')).toBe(2);

  // Undo it.
  await page.mouse.click(390 - 34, 34);
  await page.waitForTimeout(300);
  expect(await job<number>(page, 'filled')).toBe(1);

  // Dropping a brick on open grass sends it back to the pallet.
  await page.mouse.move(pallet[0], pallet[1]);
  await page.mouse.down();
  await page.mouse.move(200, 140, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(await job<number>(page, 'filled')).toBe(1);

  // Finish with the solver and wait for the results card.
  await job(page, 'solve');
  await page.waitForTimeout(300);
  expect(await job<boolean>(page, 'complete')).toBe(true);
  await page.waitForFunction(() => (window as any).__hb.job.mode() === 'done', null, {
    timeout: 20000,
  });
  await page.screenshot({ path: 'test-results/job-done.png' });
});
