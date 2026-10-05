import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ resolve: { alias: [{ find: /^@prism\/(.+)$/, replacement: fileURLToPath(new URL('./packages/$1/src/index.ts', import.meta.url)) }] }, test: { include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'], environment: 'node', testTimeout: 30_000, hookTimeout: 30_000, fileParallelism: false } });
