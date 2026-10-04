import { Queue, Worker } from 'bullmq';
import { z } from 'zod';
import { GitHubHttpError } from '@prism/github';
import type { PostgresStore } from '@prism/database';
import { redisConnection } from '@prism/config';
import { log } from '@prism/observability';
export const QUEUE_NAME = 'prism-analysis';
export function analysisQueue(redisUrl: string, name = QUEUE_NAME) { return new Queue<{ jobId: string }>(name, { connection: redisConnection(redisUrl), defaultJobOptions: { attempts: 5, backoff: { type: 'prism', delay: 2000 }, removeOnComplete: { count: 1000, age: 86400 }, removeOnFail: { count: 1000 } } }); }
export function analysisWorker(redisUrl: string, run: (jobId: string) => Promise<void>, name = QUEUE_NAME, concurrency = 2) {
  return new Worker(name, async queued => { const { jobId } = z.object({ jobId: z.uuid() }).parse(queued.data); await run(jobId); }, { connection: redisConnection(redisUrl), concurrency, limiter: { max: 5, duration: 1000 }, settings: { backoffStrategy: (attempts, _type, error) => error instanceof GitHubHttpError && error.retryAfterMs !== null ? error.retryAfterMs : Math.min(60_000, 2000 * 2 ** (attempts - 1)) } });
}
export async function relayOutbox(store: PostgresStore, queue: ReturnType<typeof analysisQueue>): Promise<number> {
  const ids = await store.claimOutbox();
  for (const id of ids) {
    try { await queue.add('analyze', { jobId: id }, { jobId: id }); await store.markOutboxSent(id); }
    catch { await store.releaseOutbox(id); log('outbox_dispatch_failed', { jobId: id }); }
  }
  return ids.length;
}
