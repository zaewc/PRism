import { readWebhookEnv } from '@prism/config';
import { startTelemetry, log } from '@prism/observability';

const env = readWebhookEnv();
const sdk = startTelemetry('prism-github-app');
const { PostgresStore } = await import('@prism/database');
const { createWebhookServer } = await import('./server.js');
const store = new PostgresStore(env.DATABASE_URL);
const app = await createWebhookServer({ secret: env.GITHUB_WEBHOOK_SECRET, appId: env.GITHUB_APP_ID, store, analyzerVersion: 'prism-0.1.0' });
await app.listen({ port: env.WEBHOOK_PORT, host: '0.0.0.0' });
log('webhook_listening', { port: env.WEBHOOK_PORT });
async function shutdown() { await app.close(); await store.close(); await sdk?.shutdown(); }
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
