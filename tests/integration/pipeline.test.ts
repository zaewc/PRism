import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresStore } from '@prism/database';
import { AnalysisRunner } from '@prism/application';
import { JevJudge } from '@prism/judge';
import type { Analysis, AnalysisJob, CheckReporter, GitHubProvider, RepositorySnapshot } from '@prism/domain';
import { createWebhookServer } from '../../apps/github-app/src/server.js';
import { analysisQueue, analysisWorker, relayOutbox } from '../../apps/worker/src/queue.js';

const database = process.env.TEST_DATABASE_URL ?? 'postgresql://prism:prism_local@localhost:5434/prism';
const redis = process.env.TEST_REDIS_URL ?? 'redis://localhost:6381';
const schema = 'prism_test_' + randomUUID().replaceAll('-', '');
const admin = new PostgresStore(database), store = new PostgresStore(database, { schema });
const secret = 'integration-webhook-secret-at-least-24';
let app: Awaited<ReturnType<typeof createWebhookServer>>;
const queue = analysisQueue(redis, 'prism-test-' + randomUUID());
let worker: ReturnType<typeof analysisWorker>;
const published: Analysis[] = [];
const reporter: CheckReporter = { start: async () => 42, publish: async (_job, _id, result) => { published.push(result); }, cancel: async () => {}, fail: async () => {} };
const snapshot = (job: AnalysisJob): RepositorySnapshot => ({ job, title: 'Change auth without tests', files: [{ path: 'src/auth/login.ts', status: 'added', additions: 1, deletions: 0, binary: false, patch: '@@ -0,0 +1 @@\n+export const login = (x: string) => x;' }], sources: [{ path: 'src/auth/login.ts', content: 'export const login = (x: string) => x;', sha: job.headSha }], baseSources: [], repositoryPaths: ['src/auth/login.ts'], checks: [], mergeable: true, externalEvidence: [], providers: [], limitations: [], history: { analyzed: 0, reverted: 0 } });
const github: GitHubProvider = { isCurrent: async () => true, collect: async (job) => snapshot(job) };
beforeAll(async () => {
  await admin.pool.query(`CREATE SCHEMA ${schema}`); await store.migrate();
  app = await createWebhookServer({ secret, appId: 1, store, analyzerVersion: 'prism-0.1.0' });
  const runner = new AnalysisRunner({ store, github: () => github, reporter: () => reporter, judge: new JevJudge({ apiKey: '' }) });
  worker = analysisWorker(redis, id => runner.run(id), queue.name);
  await worker.waitUntilReady();
});
afterAll(async () => { await worker?.close(); await queue.obliterate({ force: true }); await queue.close(); await app?.close(); await store.close(); await admin.pool.query(`DROP SCHEMA ${schema} CASCADE`); await admin.close(); });
function payload(head = 'a'.repeat(40)) { return { action: 'opened', installation: { id: 1 }, repository: { id: 2, name: 'repo', owner: { login: 'test' } }, number: 3, pull_request: { id: 123, title: 'Auth', state: 'open', head: { sha: head }, base: { sha: 'b'.repeat(40) } } }; }
function deliver(body: unknown, id: string, forged = false) {
  const text = JSON.stringify(body);
  return app.inject({ method: 'POST', url: '/api/github/webhooks', headers: { 'content-type': 'application/json', 'x-github-event': 'pull_request', 'x-github-delivery': id, 'x-hub-signature-256': forged ? 'sha256=' + '0'.repeat(64) : 'sha256=' + createHmac('sha256', secret).update(text).digest('hex') }, payload: text });
}
describe('signed webhook → PostgreSQL outbox → Redis queue → worker → analysis → check port', () => {
  it('rejects forged webhooks without persisting them', async () => {
    expect((await deliver(payload(), 'forged', true)).statusCode).toBe(401);
    expect((await store.pool.query('SELECT * FROM webhook_deliveries')).rows).toHaveLength(0);
  });
  it('persists one job for repeated deliveries and publishes BLOCK with an immutable result', async () => {
    const accepted = await deliver(payload(), 'delivery'); expect(accepted.statusCode).toBe(202);
    expect((await deliver(payload(), 'delivery')).json()).toMatchObject({ duplicate: true });
    const completion = new Promise<void>((resolve, reject) => { worker.once('completed', () => resolve()); worker.once('failed', (_job, error) => reject(error)); });
    await relayOutbox(store, queue); await completion;
    expect(published).toHaveLength(1); const analysis = published[0]; if (!analysis) throw new Error('Missing published analysis');
    expect(analysis.decision.outcome).toBe('BLOCK'); expect(analysis.evidence.map(e => e.code)).toContain('CRITICAL_PATH_WITHOUT_TEST');
    expect((await store.getJob(analysis.id))?.status).toBe('completed');
    await expect(store.pool.query("UPDATE analyses SET result='{}'::jsonb WHERE id=$1", [analysis.id])).rejects.toThrow('immutable record');
  });
  it('reuses a persisted result when publication fails, without invoking the judge again', async () => {
    await deliver(payload('c'.repeat(40)), 'retry-delivery');
    const id = (await store.pool.query("SELECT id FROM analysis_jobs WHERE input->>'headSha'=$1", ['c'.repeat(40)])).rows[0]?.id;
    if (typeof id !== 'string') throw new Error('Missing retry job');
    let judgeCalls = 0, publicationCalls = 0;
    const real = new JevJudge({ apiKey: '' });
    const judge = { choice: real.choice.bind(real), score: real.score.bind(real), noul: real.noul.bind(real), evaluate: async (input: Parameters<JevJudge['evaluate']>[0]) => { judgeCalls++; return real.evaluate(input); } };
    const runner = new AnalysisRunner({ store, github: () => github, judge, reporter: () => ({ ...reporter, publish: async () => { if (++publicationCalls === 1) throw new Error('REMOTE_UNAVAILABLE'); } }) });
    await expect(runner.run(id)).rejects.toThrow('REMOTE_UNAVAILABLE'); await runner.run(id);
    expect(judgeCalls).toBe(1); expect(publicationCalls).toBe(2); expect((await store.getJob(id))?.status).toBe('completed');
  });
  it('discards superseded jobs before collecting source or invoking the judge', async () => {
    const response = await deliver(payload('d'.repeat(40)), 'stale-delivery');
    const id = response.json<{ jobIds: string[] }>().jobIds[0]; if (!id) throw new Error('Missing stale job');
    let collected = false;
    const runner = new AnalysisRunner({ store, github: () => ({ isCurrent: async () => false, collect: async job => { collected = true; return snapshot(job); } }), reporter: () => reporter, judge: new JevJudge({ apiKey: '' }) });
    await runner.run(id); expect(collected).toBe(false); expect((await store.getJob(id))?.status).toBe('stale');
  });
});
