import { expect, test } from '@playwright/test';
test('operator feedback commits to PostgreSQL and reanalysis enters the outbox', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3101', httpCredentials: { username: 'test', password: 'test-only-operator-password' } });
  try {
    const page = await context.newPage(); await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Open analysis for PR 378', exact: true }).click();
    await page.getByRole('button', { name: 'Feedback', exact: true }).click();
    await page.getByLabel('Reason', { exact: true }).fill('Reviewed against the credential fixture; preserve this decision.');
    const saved = page.waitForResponse(response => response.url().endsWith('/api/feedback') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Record feedback' }).click();
    expect((await saved).status()).toBe(201);
    await expect(page.getByText('Feedback recorded. The existing decision is preserved.', { exact: true })).toBeVisible();
    const queued = page.waitForResponse(response => response.url().endsWith('/reanalyze'));
    await page.getByRole('button', { name: 'Re-analyze', exact: true }).click();
    const response = await queued; expect(response.status()).toBe(202);
    expect((await response.json()).jobIds).toHaveLength(1);
    await expect(page.getByRole('heading', { name: 'Blocked from merging' })).toBeVisible();
  } finally { await context.close(); }
});
test('demo actions are disabled and mutations are rejected by the server', async ({ page, request }) => {
  await page.goto('/demo'); await page.getByRole('link', { name: 'Open analysis for PR 378', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Re-analyze', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Feedback', exact: true })).toBeDisabled();
  expect((await request.post('/api/feedback', { data: {} })).status()).toBe(409);
});
