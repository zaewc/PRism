import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { analysisSchema, defaultPolicy, shaSchema } from '@prism/domain';
import { analyzeSnapshot } from '@prism/application';
import { JevJudge } from '@prism/judge';
import { parsePolicyYaml } from '@prism/policy';
import { policySchema } from '@prism/domain';
import { exportSarif } from '@prism/security';
import { calibrateRisk } from '@prism/risk-engine';
import { PostgresStore } from '@prism/database';
import { InstallationTransport } from '@prism/github';
import { loadLocalEnv } from '@prism/config';
import { snapshotSchema } from './input.js';

async function textFile(path: string | undefined) {
  if (!path || (await stat(path)).size > 12_000_000) throw new Error('INPUT_REQUIRED_OR_TOO_LARGE');
  return readFile(path, 'utf8');
}
const jsonFile = async (path: string | undefined): Promise<unknown> => JSON.parse(await textFile(path));
const output = (value: unknown) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
loadLocalEnv();
const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'policy' && args[0] === 'validate') {
    const text = await textFile(args[1]);
    output(args[1]?.endsWith('.json') ? policySchema.parse(JSON.parse(text)) : parsePolicyYaml(text));
  } else if (command === 'analyze') {
    const snapshot = snapshotSchema.parse(await jsonFile(args[0]));
    const policy = args[1] ? policySchema.parse(await jsonFile(args[1])) : defaultPolicy;
    const analysis = await analyzeSnapshot(snapshot, policy, new JevJudge({ apiKey: process.env.JEV_API_KEY ?? '', model: process.env.JEV_MODEL ?? 'jev-1.13.0', timeoutMs: 15_000 }));
    output(analysis);
    process.exitCode = analysis.decision.outcome === 'BLOCK' ? 2 : analysis.decision.outcome === 'REVIEW' ? 3 : 0;
  } else if (command === 'explain' || command === 'sarif') {
    const analysis = analysisSchema.parse(await jsonFile(args[0]));
    output(command === 'sarif' ? exportSarif(analysis.evidence) : { id: analysis.id, headSha: analysis.job.headSha, decision: analysis.decision, scores: analysis.scores, contributions: analysis.contributions, limitations: analysis.limitations, judgeStatus: analysis.judge.status });
  } else if (command === 'calibrate') {
    const observations = z.array(z.object({ risk: z.number().min(0).max(100), unsafe: z.boolean() }).strict()).parse(await jsonFile(args[0]));
    output({ kind: 'empirical-observed-outcomes', scoreIsProbability: false, minimumSamples: 30, buckets: calibrateRisk(observations) });
  } else if (command === 'enqueue') {
    const [repository, rawNumber] = args;
    const [owner, repo] = (repository ?? '').split('/');
    const target = z.object({ owner: z.string().regex(/^[a-zA-Z0-9-]+$/), repo: z.string().regex(/^[a-zA-Z0-9_.-]+$/), number: z.coerce.number().int().positive(), installationId: z.coerce.number().int().positive(), repositoryId: z.coerce.number().int().positive(), appId: z.coerce.number().int().positive(), database: z.url(), keyPath: z.string().min(1) }).parse({ owner, repo, number: rawNumber, installationId: process.env.GITHUB_INSTALLATION_ID, repositoryId: process.env.GITHUB_REPOSITORY_ID, appId: process.env.GITHUB_APP_ID, database: process.env.DATABASE_URL, keyPath: process.env.GITHUB_PRIVATE_KEY_PATH });
    const transport = new InstallationTransport({ appId: target.appId, privateKey: await readFile(target.keyPath, 'utf8'), installationId: target.installationId, repositoryId: target.repositoryId });
    const metadata = z.object({ id: z.number().int().positive() }).parse((await transport.request('GET', `/repos/${target.owner}/${target.repo}`)).data);
    if (metadata.id !== target.repositoryId) throw new Error('REPOSITORY_SCOPE_MISMATCH');
    const pr = z.object({ state: z.literal('open'), title: z.string(), head: z.object({ sha: shaSchema }), base: z.object({ sha: shaSchema }) }).parse((await transport.request('GET', `/repos/${target.owner}/${target.repo}/pulls/${target.number}`)).data);
    const store = new PostgresStore(target.database);
    try { const delivery = `cli-${randomUUID()}`; output(await store.ingest(delivery, 'cli.enqueue', { type: 'analyze', installationId: target.installationId, repository: { id: metadata.id, name: target.repo, owner: { login: target.owner } }, kind: 'pull_request', number: target.number, headSha: pr.head.sha, baseSha: pr.base.sha, title: pr.title, attempt: delivery }, 'prism-0.1.0')); }
    finally { await store.close(); }
  } else {
    process.stdout.write('PRism CLI\n  policy validate <policy.yaml|json>\n  analyze <snapshot.json> [policy.json]   (exit 0 SAFE, 2 BLOCK, 3 REVIEW)\n  explain <analysis.json>\n  sarif <analysis.json>\n  calibrate <observations.json>\n  enqueue <owner/repo> <PR-number>\n\nLocal golden replay: pnpm evaluate\n');
    if (command && command !== 'help') process.exitCode = 1;
  }
} catch {
  process.stderr.write('CLI_INPUT_OR_SERVICE_FAILURE: check the input, environment and service availability. No credential or source contents are logged.\n');
  process.exitCode = 1;
}
