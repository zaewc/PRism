import { expect, test } from '@playwright/test';
test('operator saves a versioned policy and conflicting updates are rejected', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3101', httpCredentials: { username: 'test', password: 'test-only-operator-password' } });
  try {
    const page = await context.newPage(); await page.goto('/settings/policy');
    const editor = page.getByLabel('Repository policy configuration');
    const policy = JSON.parse(await editor.inputValue()); policy.thresholds.review = 55;
    await editor.fill(JSON.stringify(policy));
    const saved = page.waitForResponse(response => response.url().endsWith('/api/policies') && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save policy' }).click();
    const response = await saved; expect(response.status()).toBe(200); expect((await response.json()).version).toBe('2');
    await expect(page.getByText('Stored version 2.', { exact: false })).toBeVisible();
    const headers = { origin: 'http://127.0.0.1:3101' };
    const stale = await context.request.put('/api/policies', { headers, data: { repositoryId: 1, expectedVersion: 1, format: 'json', configuration: JSON.stringify(policy) } });
    expect(stale.status()).toBe(409);
    const invalid = await context.request.put('/api/policies', { headers, data: { repositoryId: 1, expectedVersion: 2, format: 'yaml', configuration: 'thresholds:\n review: 90\n block: 10' } });
    expect(invalid.status()).toBe(400);
    const oversized = await context.request.put('/api/policies', { headers, data: { padding: 'x'.repeat(65_000) } });
    expect(oversized.status()).toBe(413);
    const current = await context.request.get('/api/policies');
    expect(current.status()).toBe(200);
  } finally { await context.close(); }
});
test('demo policy stays read-only in both editor and API', async ({ page, request }) => {
  await page.goto('/settings/policy');
  await expect(page.getByRole('button', { name: 'Save policy' })).toBeDisabled();
  expect((await request.put('/api/policies', { data: {} })).status()).toBe(409);
});
