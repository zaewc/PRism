import { expect, test } from '@playwright/test';
test('located evidence connects graph selection to the redacted diff', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demo');
  await page.getByRole('link', { name: 'Open analysis for PR 378', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Blocked from merging' })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect SECRET_ADDED', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.finding-detail h3')).toHaveText('SECRET_ADDED');
  await expect(page.locator('.diff-excerpt')).toContainText('[REDACTED_SECRET]');
  await expect(page.locator('.file-link')).toHaveAttribute('href', /\/blob\/[a-f0-9]{40}\/src\/config.ts#L1$/);
  await page.getByLabel('Search evidence', { exact: true }).fill('missing-finding');
  await expect(page.getByText('No matching evidence', { exact: true })).toBeVisible();
  await expect(page.locator('.finding-detail h3')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
