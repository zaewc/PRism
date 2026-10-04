import { readFile } from 'node:fs/promises';
import { readServiceEnv } from '@prism/config';
import { startTelemetry, log } from '@prism/observability';

const env = readServiceEnv();
const sdk = startTelemetry('prism-worker');
const [{ PostgresStore }, { InstallationTransport, GitHubRepositoryProvider, GitHubCheckReporter }, { JevJudge }, { AnalysisRunner }, { analysisQueue, analysisWorker, relayOutbox }] = await Promise.all([import('@prism/database'), import('@prism/github'), import('@prism/judge'), import('@prism/application'), import('./queue.js')]);
const store = new PostgresStore(env.DATABASE_URL);
const privateKey = await readFile(env.GITHUB_PRIVATE_KEY_PATH, 'utf8');
const transports = new Map<string, InstanceType<typeof InstallationTransport>>();
const transport = (job: { installationId: number; repositoryId: number }) => {
  const key = `${job.installationId}:${job.repositoryId}`;
  let value = transports.get(key);
  if (!value) { value = new InstallationTransport({ appId: env.GITHUB_APP_ID, privateKey, ...job }, (remaining, reset) => log('github_rate_limit', { remaining, reset })); transports.set(key, value); }
  return value;
};
const runner = new AnalysisRunner({ store, github: job => new GitHubRepositoryProvider(transport(job), { codeScanning: env.GITHUB_CODE_SCANNING === 'true' }), reporter: job => new GitHubCheckReporter(transport(job), { appId: env.GITHUB_APP_ID, appUrl: env.APP_URL }), judge: new JevJudge({ apiKey: env.JEV_API_KEY, model: env.JEV_MODEL, timeoutMs: env.JEV_TIMEOUT_MS }) });
const queue = analysisQueue(env.REDIS_URL);
const worker = analysisWorker(env.REDIS_URL, id => runner.run(id), queue.name, env.WORKER_CONCURRENCY);
worker.on('error', () => log('queue_worker_error'));
worker.on('failed', job => log('queue_job_failed', { jobId: job?.id ?? null }));
let dispatching = false;
async function dispatch() {
  if (dispatching) return;
  dispatching = true;
  try { await relayOutbox(store, queue); } catch { log('outbox_relay_error'); } finally { dispatching = false; }
}
const relay = setInterval(() => void dispatch(), 1000);
await dispatch();
log('worker_ready', { concurrency: env.WORKER_CONCURRENCY });
async function shutdown() { clearInterval(relay); await worker.close(); await queue.close(); await store.close(); await sdk?.shutdown(); }
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
