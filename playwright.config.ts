import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
process.env.PRISM_BROWSER_SCHEMA ??= `prism_browser_${randomUUID().replaceAll('-', '')}`;
const testDatabase = new URL(process.env.DATABASE_URL ?? 'postgresql://prism:prism_local@localhost:5434/prism');
testDatabase.searchParams.set('options', `-c search_path=${process.env.PRISM_BROWSER_SCHEMA}`);
process.env.PRISM_BROWSER_DATABASE_URL = testDatabase.toString();
export default defineConfig({
  globalSetup: './tests/browser/setup.ts',
  testDir: './tests/browser', fullyParallel: true, workers: 2, retries: process.env.CI ? 1 : 0,
  timeout: 30_000, reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:3100', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node --import ../../scripts/load-env.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100', cwd: './apps/web', url: 'http://127.0.0.1:3100', env: { PRISM_DEMO: 'true', APP_URL: 'http://127.0.0.1:3100', GITHUB_APP_SLUG: 'prism-fixture-app' }, timeout: 60_000 },
    { command: 'node --import ../../scripts/load-env.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3101', cwd: './apps/web', url: 'http://127.0.0.1:3101', env: { PRISM_DEMO: 'false', APP_URL: 'http://127.0.0.1:3101', PRISM_ADMIN_USER: 'test', PRISM_ADMIN_PASSWORD: 'test-only-operator-password', DATABASE_URL: testDatabase.toString() }, timeout: 60_000 },
  ],
});
