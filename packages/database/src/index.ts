import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { z } from 'zod';
import { analysisSchema, defaultPolicy, jobSchema, policySchema } from '@prism/domain';
import type { Analysis, AnalysisJob, AnalysisStore, IngestCommand, JobStatus, MergePolicy, StoredJob } from '@prism/domain';

const jobRow = z.object({ input: jobSchema, policy: policySchema, status: z.enum(['queued', 'running', 'completed', 'stale', 'failed']), check_run_id: z.coerce.number().nullable(), result: analysisSchema.nullable(), error: z.string().nullable() });
export const repositoryRowSchema = z.object({ id: z.coerce.number(), installation_id: z.coerce.number(), owner: z.string(), name: z.string(), active: z.boolean(), configuration: policySchema.nullable() });
export type RepositoryRow = z.infer<typeof repositoryRowSchema>;
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class PostgresStore implements AnalysisStore {
  readonly pool: pg.Pool;
  constructor(connectionString: string, options: { pool?: pg.Pool; schema?: string } = {}) {
    if (options.schema && !/^[a-z0-9_]+$/.test(options.schema)) throw new Error('Invalid schema name');
    this.pool = options.pool ?? new pg.Pool({ connectionString, max: 8, statement_timeout: 10_000, ...(options.schema ? { options: `-c search_path=${options.schema}` } : {}) });
  }
  async migrate() { await this.pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8')); }
  async close() { await this.pool.end(); }
  private async transaction<T>(action: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await action(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async ingest(deliveryId: string, event: string, command: IngestCommand, analyzerVersion: string): Promise<{ duplicate: boolean; jobIds: string[] }> {
    return this.transaction(async client => {
      const delivery = await client.query('INSERT INTO webhook_deliveries(delivery_id,event) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING delivery_id', [deliveryId, event]);
      if (!delivery.rowCount) return { duplicate: true, jobIds: [] };
      if (command.type === 'ignored') return { duplicate: false, jobIds: [] };
      if (command.type === 'installation') {
        await client.query('INSERT INTO installations(id,account,active) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET account=EXCLUDED.account, active=EXCLUDED.active', [command.installationId, command.account, command.active]);
        for (const repository of command.repositories) await client.query('INSERT INTO repositories(id,installation_id,owner,name) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET installation_id=EXCLUDED.installation_id,owner=EXCLUDED.owner,name=EXCLUDED.name', [repository.id, command.installationId, repository.owner.login, repository.name]);
        await client.query('INSERT INTO audit_logs(action,subject,details) VALUES($1,$2,$3)', [command.active ? 'app_installed' : 'app_deactivated', String(command.installationId), '{}']);
        return { duplicate: false, jobIds: [] };
      }
      await client.query('INSERT INTO installations(id) VALUES($1) ON CONFLICT DO NOTHING', [command.installationId]);
      const active = z.object({ active: z.boolean() }).parse((await client.query('SELECT active FROM installations WHERE id=$1', [command.installationId])).rows[0]);
      if (!active.active) return { duplicate: false, jobIds: [] };
      await client.query('INSERT INTO repositories(id,installation_id,owner,name) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET installation_id=EXCLUDED.installation_id,owner=EXCLUDED.owner,name=EXCLUDED.name', [command.repository.id, command.installationId, command.repository.owner.login, command.repository.name]);
      if (command.type === 'closed') {
        await client.query('INSERT INTO pull_request_outcomes(repository_id,number,head_sha,merged,delivery_id) VALUES($1,$2,$3,$4,$5)', [command.repository.id, command.number, command.headSha, command.merged, deliveryId]);
        return { duplicate: false, jobIds: [] };
      }
      const configurationRow = (await client.query('SELECT configuration FROM repository_policies WHERE repository_id=$1', [command.repository.id])).rows[0];
      const policy = configurationRow ? policySchema.parse(z.object({ configuration: z.unknown() }).parse(configurationRow).configuration) : defaultPolicy;
      const inputs: Array<{ kind: AnalysisJob['kind']; number: number | null; headSha: string; baseSha: string; attempt: string }> = [];
      if (command.type === 'analyze') inputs.push(command);
      if (command.type === 'refresh') {
        const previous = await client.query("SELECT DISTINCT ON (input->>'kind',input->>'pullRequestNumber') input FROM analysis_jobs WHERE repository_id=$1 AND input->>'headSha'=$2 ORDER BY input->>'kind',input->>'pullRequestNumber',created_at DESC", [command.repository.id, command.headSha]);
        for (const row of previous.rows) { const old = jobSchema.parse(z.object({ input: z.unknown() }).parse(row).input); inputs.push({ kind: old.kind, number: old.pullRequestNumber, headSha: old.headSha, baseSha: old.baseSha, attempt: deliveryId }); }
      }
      if (command.type === 'rerequest') {
        const previous = await client.query('SELECT input FROM analysis_jobs WHERE id=$1 AND installation_id=$2 AND repository_id=$3', [z.uuid().parse(command.externalId), command.installationId, command.repository.id]);
        if (previous.rows[0]) { const old = jobSchema.parse(z.object({ input: z.unknown() }).parse(previous.rows[0]).input); inputs.push({ kind: old.kind, number: old.pullRequestNumber, headSha: old.headSha, baseSha: old.baseSha, attempt: deliveryId }); }
        await client.query('INSERT INTO audit_logs(action,subject,details) VALUES($1,$2,$3)', ['manual_reanalysis', command.externalId, JSON.stringify({ actor: command.actor })]);
      }
      const jobIds: string[] = [];
      for (const input of inputs) {
        const job = jobSchema.parse({ id: randomUUID(), installationId: command.installationId, repositoryId: command.repository.id, owner: command.repository.owner.login, repo: command.repository.name, kind: input.kind, pullRequestNumber: input.number, headSha: input.headSha, baseSha: input.baseSha, deliveryId, analyzerVersion, configurationHash: fingerprint(policy), attempt: input.attempt });
        const identity = fingerprint({ installationId: job.installationId, repositoryId: job.repositoryId, kind: job.kind, number: job.pullRequestNumber, headSha: job.headSha, baseSha: job.baseSha, analyzerVersion, configurationHash: job.configurationHash, attempt: job.attempt });
        const inserted = await client.query('INSERT INTO analysis_jobs(id,identity,installation_id,repository_id,input,policy) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(identity) DO NOTHING RETURNING id', [job.id, identity, job.installationId, job.repositoryId, JSON.stringify(job), JSON.stringify(policy)]);
        if (inserted.rowCount) { await client.query('INSERT INTO job_outbox(job_id) VALUES($1)', [job.id]); jobIds.push(job.id); }
      }
      return { duplicate: false, jobIds };
    });
  }
  async claimOutbox(limit = 10): Promise<string[]> {
    const result = await this.pool.query("UPDATE job_outbox SET lease_until=now()+interval '30 seconds',attempts=attempts+1 WHERE job_id IN (SELECT job_id FROM job_outbox WHERE sent_at IS NULL AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING job_id", [limit]);
    return z.array(z.object({ job_id: z.uuid() })).parse(result.rows).map(row => row.job_id);
  }
  async markOutboxSent(id: string) { await this.pool.query('UPDATE job_outbox SET sent_at=now(),lease_until=NULL WHERE job_id=$1', [id]); }
  async releaseOutbox(id: string) { await this.pool.query('UPDATE job_outbox SET lease_until=NULL WHERE job_id=$1', [id]); }
  async getJob(id: string): Promise<StoredJob | null> {
    const row = (await this.pool.query('SELECT j.*,a.result FROM analysis_jobs j LEFT JOIN analyses a ON a.id=j.id WHERE j.id=$1', [id])).rows[0];
    if (!row) return null;
    const parsed = jobRow.parse(row);
    return { job: parsed.input, policy: parsed.policy, status: parsed.status, checkRunId: parsed.check_run_id, result: parsed.result, error: parsed.error };
  }
  async isInstallationActive(id: number) { const row = (await this.pool.query('SELECT active FROM installations WHERE id=$1', [id])).rows[0]; return row ? z.object({ active: z.boolean() }).parse(row).active : false; }
  async isLatestJob(id: string) {
    const row = (await this.pool.query("SELECT NOT EXISTS (SELECT 1 FROM analysis_jobs newer WHERE newer.repository_id=current.repository_id AND newer.input->>'kind'=current.input->>'kind' AND COALESCE(newer.input->>'pullRequestNumber',newer.input->>'headSha')=COALESCE(current.input->>'pullRequestNumber',current.input->>'headSha') AND newer.created_at>current.created_at AND newer.status<>'stale') AS latest FROM analysis_jobs current WHERE current.id=$1", [id])).rows[0];
    return row ? z.object({ latest: z.boolean() }).parse(row).latest : false;
  }
  async markRunning(id: string) { await this.pool.query("UPDATE analysis_jobs SET status='running',error=NULL,updated_at=now() WHERE id=$1 AND status NOT IN ('completed','stale')", [id]); }
  async saveCheckRun(id: string, checkRunId: number) { await this.pool.query('UPDATE analysis_jobs SET check_run_id=$2 WHERE id=$1 AND (check_run_id IS NULL OR check_run_id=$2)', [id, checkRunId]); }
  async saveResult(analysis: Analysis) {
    analysisSchema.parse(analysis);
    await this.transaction(async client => {
      const saved = await client.query('INSERT INTO analyses(id,repository_id,result,completed_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id', [analysis.id, analysis.job.repositoryId, JSON.stringify(analysis), analysis.completedAt]);
      if (saved.rowCount) await client.query('INSERT INTO audit_logs(action,subject,details) VALUES($1,$2,$3)', ['analysis_completed', analysis.id, JSON.stringify({ outcome: analysis.decision.outcome, headSha: analysis.job.headSha })]);
    });
  }
  async finish(id: string, status: JobStatus, error?: string) { await this.pool.query('UPDATE analysis_jobs SET status=$2,error=$3,updated_at=now() WHERE id=$1', [id, status, error ?? null]); }
  async audit(action: string, subject: string, details: Record<string, unknown>) { await this.pool.query('INSERT INTO audit_logs(action,subject,details) VALUES($1,$2,$3)', [action, subject, JSON.stringify(details)]); }
  async repositories(): Promise<RepositoryRow[]> { return z.array(repositoryRowSchema).parse((await this.pool.query('SELECT r.*,i.active,p.configuration FROM repositories r JOIN installations i ON i.id=r.installation_id LEFT JOIN repository_policies p ON p.repository_id=r.id ORDER BY r.owner,r.name')).rows); }
  async analyses(repositoryId?: number, limit = 100): Promise<Analysis[]> {
    const rows = await this.pool.query('SELECT result FROM analyses WHERE ($1::bigint IS NULL OR repository_id=$1) ORDER BY completed_at DESC LIMIT $2', [repositoryId ?? null, Math.min(limit, 1000)]);
    return z.array(z.object({ result: analysisSchema })).parse(rows.rows).map(r => r.result);
  }
  async analysis(id: string): Promise<Analysis | null> { const row = (await this.pool.query('SELECT result FROM analyses WHERE id=$1', [id])).rows[0]; return row ? analysisSchema.parse(z.object({ result: z.unknown() }).parse(row).result) : null; }
  async changePolicy(repositoryId: number, configuration: MergePolicy, expectedVersion: number, actor: string) {
    return this.transaction(async client => {
      await client.query('SELECT id FROM repositories WHERE id=$1 FOR UPDATE', [repositoryId]);
      const row = (await client.query('SELECT version FROM repository_policies WHERE repository_id=$1', [repositoryId])).rows[0];
      const current = row ? z.object({ version: z.number() }).parse(row).version : 0;
      if (current !== expectedVersion) throw new Error('POLICY_VERSION_CONFLICT');
      const next = current + 1, policy = policySchema.parse({ ...configuration, version: String(next) });
      await client.query('INSERT INTO repository_policies(repository_id,version,configuration) VALUES($1,$2,$3) ON CONFLICT(repository_id) DO UPDATE SET version=EXCLUDED.version,configuration=EXCLUDED.configuration,updated_at=now()', [repositoryId, next, JSON.stringify(policy)]);
      await client.query('INSERT INTO audit_logs(action,subject,details) VALUES($1,$2,$3)', ['policy_changed', String(repositoryId), JSON.stringify({ actor, previousVersion: current, nextVersion: next, configuration: policy })]);
      return policy;
    });
  }
  async addFeedback(analysisId: string, evidenceId: string | null, actor: string, kind: 'safe' | 'incorrect' | 'reverted' | 'bugfix' | 'incident', reason: string) {
    const analysis = await this.analysis(analysisId);
    if (!analysis || (evidenceId && !analysis.evidence.some(e => e.id === evidenceId))) throw new Error('FINDING_NOT_FOUND');
    const id = randomUUID();
    await this.transaction(async client => {
      await client.query('INSERT INTO feedback(id,analysis_id,evidence_id,actor,kind,reason) VALUES($1,$2,$3,$4,$5,$6)', [id, analysisId, evidenceId, actor, kind, reason]);
      await client.query('INSERT INTO audit_logs(action,subject,details) VALUES($1,$2,$3)', ['finding_feedback', analysisId, JSON.stringify({ actor, evidenceId, feedbackId: id, kind })]);
    });
    return id;
  }
  async getCache(key: string): Promise<unknown | null> { const row = (await this.pool.query('SELECT value FROM snapshot_cache WHERE cache_key=$1 AND expires_at>now()', [key])).rows[0]; return row ? z.object({ value: z.unknown() }).parse(row).value : null; }
  async setCache(key: string, value: unknown): Promise<void> { await this.pool.query("INSERT INTO snapshot_cache(cache_key,value,expires_at) VALUES($1,$2,now()+interval '7 days') ON CONFLICT(cache_key) DO UPDATE SET value=EXCLUDED.value,expires_at=EXCLUDED.expires_at", [key, JSON.stringify(value)]); }
}
