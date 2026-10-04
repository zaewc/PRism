import { expect, test } from '@playwright/test';
test('landing renders on desktop and mobile without overflow or browser errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Know the risk before you merge.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View demo', exact: true })).toHaveAttribute('href', '/demo');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('operator workspace and API require authentication', async ({ request }) => {
  expect((await request.get('http://127.0.0.1:3101/dashboard')).status()).toBe(401);
  expect((await request.get('http://127.0.0.1:3101/api/analyses')).status()).toBe(401);
});
test('authenticated writes reject a different origin', async ({ request }) => {
  const response = await request.post('http://127.0.0.1:3101/api/policies', { headers: { authorization: 'Basic ' + Buffer.from('test:test-only-operator-password').toString('base64'), origin: 'https://untrusted.example' }, data: {} });
  expect(response.status()).toBe(403);
});
