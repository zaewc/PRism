import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { parseWebhook, verifySignature } from '@prism/github';
import type { PostgresStore } from '@prism/database';
import { log, stage } from '@prism/observability';
import { z } from 'zod';

export async function createWebhookServer(options: { secret: string; appId: number; store: PostgresStore; analyzerVersion: string }) {
  if (options.secret.length < 24) throw new Error('Webhook secret must contain at least 24 characters');
  const app = Fastify({ logger: false, bodyLimit: 2_000_000, requestTimeout: 15_000 });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => { try { await options.store.pool.query('SELECT 1'); return { status: 'ready' }; } catch { return reply.code(503).send({ status: 'database-unavailable' }); } });
  app.post('/api/github/webhooks', async (request, reply) => {
    const raw = request.body;
    if (!Buffer.isBuffer(raw)) return reply.code(400).send({ error: 'Raw JSON body required' });
    const signature = request.headers['x-hub-signature-256'];
    if (typeof signature !== 'string' || !verifySignature(raw, signature, options.secret)) return reply.code(401).send({ error: 'Invalid signature' });
    const delivery = request.headers['x-github-delivery'], event = request.headers['x-github-event'];
    if (typeof delivery !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(delivery) || typeof event !== 'string' || !/^[a-z_]{1,80}$/.test(event)) return reply.code(400).send({ error: 'Invalid delivery headers' });
    try {
      const command = parseWebhook(event, JSON.parse(raw.toString('utf8')), options.appId, delivery);
      const accepted = await stage('webhook-ingestion', () => options.store.ingest(delivery, event, command, options.analyzerVersion));
      return reply.code(202).send({ accepted: true, duplicate: accepted.duplicate, jobIds: accepted.jobIds });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid event payload' });
      log('webhook_persistence_failed', { event, deliveryId: delivery });
      return reply.code(503).send({ error: 'Delivery was not persisted; retry required' });
    }
  });
  return app;
}
