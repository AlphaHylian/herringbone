import { expect, test } from '@playwright/test';

test('boots to a canvas without errors, and every sound plays', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#app canvas')).toBeVisible();
  await page.waitForFunction(() => (window as any).__hb?.ready);
  // A click unlocks Web Audio; then fire every effect.
  await page.mouse.click(5, 400);
  await page.evaluate(async () => {
    const sfx = (window as any).__hb.sfx;
    sfx.unlock();
    for (const name of ['clack', 'pickup', 'thunk', 'whoosh', 'tap', 'softDrop', 'undo'])
      sfx[name]();
    sfx.chime(0);
    sfx.chime(2);
    sfx.hiss(0.5);
    sfx.rumble(0.5);
    sfx.ambient(true);
    await new Promise((r) => setTimeout(r, 700));
  });
  expect(errors).toEqual([]);
});
