import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresStore } from '@prism/database';
import { defaultPolicy } from '@prism/domain';
import type { IngestCommand } from '@prism/domain';

const url = process.env.TEST_DATABASE_URL ?? 'postgresql://prism:prism_local@localhost:5434/prism';
const schema = 'prism_test_' + randomUUID().replaceAll('-', '');
const admin = new PostgresStore(url), store = new PostgresStore(url, { schema });
const command: IngestCommand = { type: 'analyze', installationId: 1, repository: { id: 2, name: 'repo', owner: { login: 'test' } }, kind: 'pull_request', number: 3, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), title: 'PR', attempt: 'initial' };
beforeAll(async () => { await admin.pool.query(`CREATE SCHEMA ${schema}`); await store.migrate(); });
afterAll(async () => { await store.close(); await admin.pool.query(`DROP SCHEMA ${schema} CASCADE`); await admin.close(); });
describe('transactional ingestion and repository policies', () => {
  it('deduplicates concurrent deliveries and different delivery ids for one immutable snapshot', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => store.ingest('delivery-1', 'pull_request', command, '1')));
    expect(results.filter(r => !r.duplicate)).toHaveLength(1);
    expect(results.flatMap(r => r.jobIds)).toHaveLength(1);
    expect((await store.ingest('delivery-2', 'pull_request', command, '1')).jobIds).toHaveLength(0);
    expect(await store.claimOutbox()).toHaveLength(1);
    expect(await store.claimOutbox()).toHaveLength(0);
  });
  it('creates a distinct new-SHA job and stores the policy with it', async () => {
    const changed = await store.ingest('delivery-3', 'pull_request', { ...command, headSha: 'c'.repeat(40) }, '1');
    const id = changed.jobIds[0]; expect(id).toBeDefined(); if (!id) return;
    const stored = await store.getJob(id); expect(stored?.job.headSha).toBe('c'.repeat(40)); expect(stored?.policy).toEqual(defaultPolicy);
  });
  it('enforces optimistic policy versions and immutable audit logs', async () => {
    expect((await store.changePolicy(2, defaultPolicy, 0, 'operator')).version).toBe('1');
    await expect(store.changePolicy(2, defaultPolicy, 0, 'operator')).rejects.toThrow('POLICY_VERSION_CONFLICT');
    await expect(store.pool.query("UPDATE audit_logs SET action='tampered'")).rejects.toThrow('immutable record');
  });
  it('does not re-activate a deleted installation on later PR deliveries', async () => {
    await store.ingest('delete-1', 'installation', { type: 'installation', installationId: 1, active: false, account: 'test', repositories: [] }, '1');
    expect((await store.ingest('delivery-4', 'pull_request', { ...command, headSha: 'd'.repeat(40) }, '1')).jobIds).toHaveLength(0);
    expect(await store.isInstallationActive(1)).toBe(false);
  });
});
