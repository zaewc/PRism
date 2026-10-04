import { createHash } from 'node:crypto';
import { z } from 'zod';
import { fileSchema, shaSchema } from '@prism/domain';
import type { AnalysisJob, ChangedFile, CheckState, GitHubProvider, MergePolicy, ProviderState, RepositorySnapshot, RiskEvidence, SourceFile } from '@prism/domain';
import { GitHubHttpError, paginated } from './client.js';
import type { GitHubTransport } from './client.js';

const prSchema = z.object({ title: z.string(), state: z.string(), head: z.object({ sha: shaSchema }), base: z.object({ sha: shaSchema }), mergeable: z.boolean().nullable(), changed_files: z.number() });
const ghFileSchema = z.object({ filename: z.string(), previous_filename: z.string().optional(), status: fileSchema.shape.status, additions: z.number(), deletions: z.number(), patch: z.string().optional() });
const treeSchema = z.object({ truncated: z.boolean(), tree: z.array(z.object({ path: z.string(), type: z.string(), sha: shaSchema, size: z.number().optional() })) });
const checkSchema = z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable(), head_sha: shaSchema, app: z.object({ id: z.number() }) });
const statusSchema = z.object({ context: z.string(), state: z.string(), sha: shaSchema });
const dependencySchema = z.object({ change_type: z.string(), manifest: z.string(), vulnerabilities: z.array(z.object({ severity: z.enum(['low', 'moderate', 'medium', 'high', 'critical']), advisory_ghsa_id: z.string() })).default([]) });
const scanningSchema = z.object({ number: z.number(), rule: z.object({ severity: z.string().optional(), security_severity_level: z.string().nullable().optional() }), most_recent_instance: z.object({ commit_sha: shaSchema, location: z.object({ path: z.string(), start_line: z.number().int().positive() }) }) });
export class StaleSnapshotError extends Error { constructor() { super('STALE_SNAPSHOT'); } }
export class GitHubRepositoryProvider implements GitHubProvider {
  constructor(private readonly transport: GitHubTransport, private readonly options: { codeScanning?: boolean; maxSources?: number } = {}) {}
  private prefix(job: AnalysisJob) { return `/repos/${encodeURIComponent(job.owner)}/${encodeURIComponent(job.repo)}`; }
  async isCurrent(job: AnalysisJob) {
    if (job.kind === 'merge_group') return true;
    const { data } = await this.transport.request('GET', `${this.prefix(job)}/pulls/${job.pullRequestNumber}`);
    const pr = prSchema.parse(data);
    return pr.state === 'open' && pr.head.sha === job.headSha && pr.base.sha === job.baseSha;
  }
  async collect(job: AnalysisJob, _policy: MergePolicy): Promise<RepositorySnapshot> {
    const prefix = this.prefix(job);
    const limitations: string[] = [];
    let title = 'Merge queue analysis', mergeable: boolean | null = true;
    let files: ChangedFile[];
    if (job.kind === 'pull_request') {
      const { data } = await this.transport.request('GET', `${prefix}/pulls/${job.pullRequestNumber}`);
      const pr = prSchema.parse(data);
      if (pr.head.sha !== job.headSha || pr.base.sha !== job.baseSha || pr.state !== 'open') throw new StaleSnapshotError();
      title = pr.title; mergeable = pr.mergeable;
      const records = await paginated(this.transport, `${prefix}/pulls/${job.pullRequestNumber}/files`, ghFileSchema, data => data, 3000);
      files = records.map(f => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, binary: f.patch === undefined, ...(f.patch !== undefined ? { patch: f.patch } : {}), ...(f.previous_filename ? { previousPath: f.previous_filename } : {}) }));
      if (files.length < pr.changed_files) limitations.push('PR diff is truncated by GitHub.');
    } else {
      const response = await this.transport.request('GET', `${prefix}/compare/${job.baseSha}...${job.headSha}?per_page=100&page=1`);
      const compare = z.object({ files: z.array(ghFileSchema), status: z.string() }).parse(response.data);
      files = compare.files.map(f => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, binary: f.patch === undefined, ...(f.patch !== undefined ? { patch: f.patch } : {}), ...(f.previous_filename ? { previousPath: f.previous_filename } : {}) }));
      if (files.length >= 300) limitations.push('Merge-group comparison may exceed the GitHub 300-file limit.');
    }
    const tree = treeSchema.parse((await this.transport.request('GET', `${prefix}/git/trees/${job.headSha}?recursive=1`)).data);
    if (tree.truncated) limitations.push('Repository tree is truncated.');
    const blobs = tree.tree.filter(t => t.type === 'blob');
    const paths = blobs.map(t => t.path);
    const supported = blobs.filter(t => /\.[cm]?[jt]sx?$/.test(t.path) && !/(^|\/)(node_modules|vendor|dist|build)\//.test(t.path));
    const changed = new Set(files.map(f => f.path));
    supported.sort((a, b) => Number(changed.has(b.path)) - Number(changed.has(a.path)) || a.path.localeCompare(b.path));
    const maxSources = this.options.maxSources ?? 100;
    if (supported.length > maxSources) limitations.push(`Dependency graph is partial: at most ${maxSources} source files are collected.`);
    const sources: SourceFile[] = [];
    // Bounded collection avoids running arbitrary repository code or an unbounded clone.
    for (const blob of supported.slice(0, maxSources)) {
      if ((blob.size ?? 0) > 200_000) { limitations.push('A source file exceeds the analysis size limit.'); continue; }
      const source = await this.blob(prefix, blob.sha);
      if (source === null) { limitations.push('A source blob could not be decoded.'); continue; }
      sources.push({ path: blob.path, content: source, sha: job.headSha });
    }
    const baseSources: SourceFile[] = [];
    for (const file of files.filter(f => f.status !== 'added' && /\.[cm]?[jt]sx?$/.test(f.path)).slice(0, maxSources)) {
      const basePath = file.previousPath ?? file.path;
      try {
        const response = await this.transport.request('GET', `${prefix}/contents/${basePath.split('/').map(encodeURIComponent).join('/')}?ref=${job.baseSha}`);
        const data = z.object({ content: z.string(), encoding: z.literal('base64'), size: z.number() }).parse(response.data);
        if (data.size <= 200_000) baseSources.push({ path: basePath, content: Buffer.from(data.content, 'base64').toString('utf8'), sha: job.baseSha });
        else limitations.push('A base source file exceeds the size limit.');
      } catch (error) { if (error instanceof GitHubHttpError && error.status === 404) limitations.push('A changed base file was not found.'); else throw error; }
    }
    const checks = await this.checks(job);
    const externalEvidence: RiskEvidence[] = [], providers: ProviderState[] = [];
    try {
      const deps = await paginated(this.transport, `${prefix}/dependency-graph/compare/${job.baseSha}...${job.headSha}`, dependencySchema);
      for (const dependency of deps.filter(d => d.change_type === 'added')) for (const vulnerability of dependency.vulnerabilities) externalEvidence.push({ id: createHash('sha256').update(`${job.headSha}:${dependency.manifest}:${vulnerability.advisory_ghsa_id}`).digest('hex').slice(0, 24), code: 'DEPENDENCY_VULNERABILITY', category: 'dependencies', severity: vulnerability.severity === 'moderate' ? 'medium' : vulnerability.severity, confidence: 0.99, source: 'github-dependency-review', analyzerVersion: 'github-api-2026-03-10', message: 'GitHub Dependency Review reports a vulnerability in an added dependency.', location: { path: dependency.manifest, line: 1, sha: job.headSha }, metadata: { advisory: vulnerability.advisory_ghsa_id } });
      providers.push({ source: 'dependency-review', status: 'available', reason: 'Collected GitHub dependency comparison.' });
    } catch (error) {
      if (!(error instanceof GitHubHttpError) || ![403, 404].includes(error.status)) throw error;
      providers.push({ source: 'dependency-review', status: 'unavailable', reason: 'Dependency Review permission or repository capability unavailable.' });
      if (files.some(f => /lock|package\.json|requirements|go\.mod|pom\.xml/.test(f.path))) limitations.push('Changed dependencies could not be checked by Dependency Review.');
    }
    if (this.options.codeScanning) {
      try {
        const alerts = await paginated(this.transport, `${prefix}/code-scanning/alerts?state=open&ref=${job.headSha}`, scanningSchema);
        for (const alert of alerts.filter(a => a.most_recent_instance.commit_sha === job.headSha && changed.has(a.most_recent_instance.location.path))) {
          const severity = alert.rule.security_severity_level;
          externalEvidence.push({ id: `code-scanning-${alert.number}-${job.headSha}`, code: 'CODE_SCANNING_FINDING', category: 'security', severity: severity === 'critical' || severity === 'high' || severity === 'low' ? severity : 'medium', confidence: 0.95, source: 'github-code-scanning', analyzerVersion: 'github-api-2026-03-10', message: 'GitHub code scanning reports an open finding in a changed file on this SHA.', location: { path: alert.most_recent_instance.location.path, line: alert.most_recent_instance.location.start_line, sha: job.headSha }, metadata: { alertNumber: alert.number } });
        }
        providers.push({ source: 'code-scanning', status: 'available', reason: 'Collected alerts on this SHA.' });
      } catch (error) {
        if (!(error instanceof GitHubHttpError) || ![403, 404].includes(error.status)) throw error;
        providers.push({ source: 'code-scanning', status: 'unavailable', reason: 'Code scanning permission or capability unavailable.' }); limitations.push('Configured code scanning provider is unavailable.');
      }
    } else providers.push({ source: 'code-scanning', status: 'disabled', reason: 'Optional permission was not requested.' });
    providers.push({ source: 'coverage', status: 'disabled', reason: 'Coverage artifacts are not collected in the MVP. Related tests do not establish executed coverage.' });
    if (files.some(f => /\.(py|go|java)$/.test(f.path))) limitations.push('AST adapters for Python, Go and Java are not implemented.');
    if (!(await this.isCurrent(job))) throw new StaleSnapshotError();
    return { job, title, files, sources, baseSources, repositoryPaths: paths, checks, mergeable, externalEvidence, providers, limitations: [...new Set(limitations)], history: { analyzed: 0, reverted: 0 } };
  }
  private async blob(prefix: string, sha: string): Promise<string | null> {
    const data = z.object({ content: z.string(), encoding: z.string(), size: z.number() }).parse((await this.transport.request('GET', `${prefix}/git/blobs/${sha}`)).data);
    if (data.encoding !== 'base64' || data.size > 200_000) return null;
    return Buffer.from(data.content, 'base64').toString('utf8');
  }
  private async checks(job: AnalysisJob): Promise<CheckState[]> {
    const prefix = this.prefix(job);
    const checks = await paginated(this.transport, `${prefix}/commits/${job.headSha}/check-runs?filter=latest`, checkSchema, data => z.object({ check_runs: z.array(z.unknown()) }).parse(data).check_runs);
    const statuses = await paginated(this.transport, `${prefix}/commits/${job.headSha}/statuses`, statusSchema);
    const seen = new Set<string>();
    return [
      ...checks.filter(c => c.name !== 'PRism' && c.head_sha === job.headSha).map(c => ({ name: c.name, appId: c.app.id, sha: c.head_sha, state: c.status !== 'completed' ? 'pending' as const : c.conclusion === 'success' ? 'success' as const : 'failure' as const })),
      ...statuses.filter(s => { if (seen.has(s.context) || s.sha !== job.headSha) return false; seen.add(s.context); return true; }).map(s => ({ name: s.context, sha: s.sha, state: s.state === 'success' ? 'success' as const : s.state === 'pending' ? 'pending' as const : 'failure' as const })),
    ];
  }
}
