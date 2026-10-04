import { PostgresStore } from '@prism/database';
import { goldenCases } from '../evaluation/cases/fixtures.js';
import { analyzeSnapshot } from '@prism/application';
import { JevJudge } from '@prism/judge';
const schema = process.env.PRISM_BROWSER_SCHEMA;
if (!schema || !/^prism_browser_[a-f0-9]+$/.test(schema)) throw new Error('INVALID_BROWSER_SCHEMA');
const store = new PostgresStore(process.env.DATABASE_URL ?? 'postgresql://prism:prism_local@localhost:5434/prism');
try {
  if (process.argv[2] === 'drop') { await store.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
  else {
    await store.pool.query(`CREATE SCHEMA ${schema}`);
    await store.migrate();
    const fixture = goldenCases().find(c => c.name === 'credential-added'); if (!fixture) throw new Error('MISSING_FIXTURE');
    const repository = { id: 1, name: 'payments', owner: { login: 'acme' } };
    await store.ingest('browser-install', 'installation', { type: 'installation', installationId: 1, account: 'acme', active: true, repositories: [repository] }, 'prism-0.1.0');
    await store.changePolicy(1, fixture.policy, 0, 'browser-setup');
    const result = await store.ingest('browser-pr', 'pull_request', { type: 'analyze', installationId: 1, repository, kind: 'pull_request', number: 378, headSha: fixture.snapshot.job.headSha, baseSha: fixture.snapshot.job.baseSha, title: fixture.snapshot.title, attempt: 'initial' }, 'prism-0.1.0');
    const id = result.jobIds[0]; if (!id) throw new Error('MISSING_JOB');
    const stored = await store.getJob(id); if (!stored) throw new Error('MISSING_JOB');
    await store.saveResult(await analyzeSnapshot({ ...fixture.snapshot, job: stored.job }, stored.policy, new JevJudge({ apiKey: '' })));
    await store.finish(id, 'completed');
  }
} finally { await store.close(); }
