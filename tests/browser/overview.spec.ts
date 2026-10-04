import { expect, test } from '@playwright/test';
test('fixture overview shows engine decisions and repository drilldown', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Repository health' })).toBeVisible();
  await expect(page.getByText('Synthetic PRs analyzed by the local engine.', { exact: false })).toBeVisible();
  await expect(page.locator('.decision-table tbody tr')).toHaveCount(7);
  const row = page.getByRole('row').filter({ hasText: '#378' });
  await expect(row).toContainText('Blocked');
  await page.getByRole('link', { name: 'Repositories', exact: true }).click();
  await page.getByRole('link', { name: /acme\/payments/ }).click();
  await expect(page.getByRole('heading', { name: 'acme/payments' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
