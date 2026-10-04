import { expect, test } from '@playwright/test';

test('boots to a canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/boot.png' });
});
