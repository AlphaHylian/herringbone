import { expect, test } from '@playwright/test';
import index from '../src/levels/index.json' with { type: 'json' };

const ids = index.neighborhoods.flatMap((n) => n.levels);

test('every level loads, renders and is completed by the solver in the real scene', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const id of ids) {
    await page.goto(`/?level=${id}`);
    await page.waitForFunction(
      (lid) => (window as any).__hb?.ready && (window as any).__hb?.job?.id === lid,
      id,
    );
    await page.evaluate(() => (window as any).__hb.job.solve());
    expect(await page.evaluate(() => (window as any).__hb.job.complete()), id).toBe(true);
  }
  expect(errors).toEqual([]);
});
