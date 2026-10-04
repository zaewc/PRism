import { z } from 'zod';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

export function loadLocalEnv() {
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (existsSync(candidate)) { config({ path: candidate, quiet: true }); break; }
  }
}
const envSchema = z.object({
  DATABASE_URL: z.url(), REDIS_URL: z.url(), APP_URL: z.url().default('http://localhost:3000'),
  GITHUB_APP_ID: z.coerce.number().int().positive(), GITHUB_PRIVATE_KEY_PATH: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(24), GITHUB_APP_SLUG: z.string().default(''),
  GITHUB_CODE_SCANNING: z.enum(['true', 'false']).default('false'),
  JEV_API_KEY: z.string().default(''), JEV_MODEL: z.string().default('jev-1.13.0'),
  JEV_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
  WEBHOOK_PORT: z.coerce.number().int().positive().default(3001),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
});
export function readServiceEnv() { loadLocalEnv(); return envSchema.omit({ GITHUB_WEBHOOK_SECRET: true, WEBHOOK_PORT: true }).parse(process.env); }
export function readWebhookEnv() {
  loadLocalEnv();
  return envSchema.pick({ DATABASE_URL: true, GITHUB_APP_ID: true, GITHUB_WEBHOOK_SECRET: true, WEBHOOK_PORT: true }).parse(process.env);
}
export function redisConnection(url: string) {
  const parsed = new URL(url);
  if (!['redis:', 'rediss:'].includes(parsed.protocol)) throw new Error('Invalid Redis URL');
  const db = Number(parsed.pathname.slice(1) || 0);
  if (!Number.isInteger(db) || db < 0) throw new Error('Invalid Redis database');
  return { host: parsed.hostname, port: Number(parsed.port || 6379), ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}), ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}), db, maxRetriesPerRequest: null, ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}) };
}
