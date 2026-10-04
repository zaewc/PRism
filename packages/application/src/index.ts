import { createHash } from 'node:crypto';
import { analysisSchema, parsedFileSchema } from '@prism/domain';
import type { Analysis, AnalysisCache, AnalysisJob, AnalysisStore, CheckReporter, GitHubProvider, JudgeModel, JudgeResult, MergePolicy, RepositorySnapshot, SourceFile } from '@prism/domain';
import { analyzers, ParserRegistry } from '@prism/analysis';
import { EvidenceRiskAggregator, deterministicScores } from '@prism/risk-engine';
import { DeterministicPolicyEngine } from '@prism/policy';
import { redactSecrets } from '@prism/security';
import { log, stage } from '@prism/observability';

export async function analyzeSnapshot(snapshot: RepositorySnapshot, policy: MergePolicy, judge: JudgeModel, cache?: AnalysisCache): Promise<Analysis> {
  const startedAt = new Date().toISOString();
  const durations: Record<string, number> = {};
  const timed = async <T>(name: string, action: () => Promise<T> | T) => { const begin = performance.now(); const value = await stage(name, action); durations[name] = Math.round(performance.now() - begin); return value; };
  const registry = new ParserRegistry();
  const parse = async (sources: SourceFile[], sha: string) => {
    const configuration = createHash('sha256').update(JSON.stringify(sources.map(s => [s.path, createHash('sha256').update(s.content).digest('hex')]))).digest('hex');
    const key = `${snapshot.job.repositoryId}:${sha}:${snapshot.job.analyzerVersion}:${snapshot.job.configurationHash}:${configuration}:parser1`;
    const cached = await cache?.getCache(key);
    if (Array.isArray(cached)) return cached.map(item => parsedFileSchema.parse(item));
    const result = sources.flatMap(source => {
      const file = registry.parse(source); if (!file) return [];
      return [{ ...file, imports: file.imports.map(redactSecrets), symbols: file.symbols.map(s => ({ ...s, signature: createHash('sha256').update(s.signature).digest('hex') })), calls: file.calls.map(c => ({ ...c, name: /^[$\w]+(?:\.[$\w]+)*$/.test(c.name) ? c.name : 'dynamic-call', literalArguments: [] })) }];
    });
    if (cache) await cache.setCache(key, result);
    return result;
  };
  const parsed = await timed('ast', () => parse(snapshot.sources, snapshot.job.headSha));
  const baseParsed = await timed('base-ast', () => parse(snapshot.baseSources, snapshot.job.baseSha));
  const context = { snapshot, policy, parsed, baseParsed };
  const evidence = [...snapshot.externalEvidence];
  for (const analyzer of analyzers) evidence.push(...await timed(analyzer.name, () => analyzer.analyze(context)));
  const unique = [...new Map(evidence.map(e => [e.id, e])).values()].sort((a, b) => a.id.localeCompare(b.id));
  const deterministic = deterministicScores(unique);
  let judgment: JudgeResult;
  try { judgment = await timed('jev', () => judge.evaluate({ evidence: unique, deterministicScores: deterministic, limitations: snapshot.limitations })); }
  catch {
    judgment = { status: 'unavailable', model: 'unavailable', modelVersion: 'unavailable', promptVersion: 'unknown', inputHash: createHash('sha256').update(JSON.stringify(deterministic)).digest('hex'), requestHash: '', timestamp: new Date().toISOString(), choice: null, scores: null, trueProbability: null, falseProbability: null, error: 'JUDGE_ADAPTER_FAILURE' };
  }
  const aggregated = await timed('risk', () => new EvidenceRiskAggregator().aggregate(unique, judgment, policy));
  const checks = snapshot.checks.filter(c => c.sha === snapshot.job.headSha);
  const decision = await timed('policy', () => new DeterministicPolicyEngine().evaluate({ evidence: unique, overall: aggregated.overall, judge: judgment, checks, mergeable: snapshot.mergeable, limitations: snapshot.limitations, kind: snapshot.job.kind }, policy));
  return analysisSchema.parse({ id: snapshot.job.id, job: snapshot.job, title: redactSecrets(snapshot.title).slice(0, 1000), startedAt, completedAt: new Date().toISOString(), evidence: unique, ...aggregated, deterministicScores: deterministic, judge: judgment, decision, files: snapshot.files.map(f => ({ ...f, ...(f.patch ? { patch: redactSecrets(f.patch).slice(0, 12_000) } : {}) })), limitations: snapshot.limitations, providers: snapshot.providers, checks, policy, analyzerVersion: snapshot.job.analyzerVersion, durations });
}

export class AnalysisRunner {
  constructor(private readonly ports: { store: AnalysisStore; github: (job: AnalysisJob) => GitHubProvider; reporter: (job: AnalysisJob) => CheckReporter; judge: JudgeModel; cache?: AnalysisCache }) {}
  async run(id: string): Promise<void> {
    await stage('analysis', async () => {
      const stored = await this.ports.store.getJob(id);
      if (!stored || stored.status === 'completed' || stored.status === 'stale') return;
      const { job, policy } = stored;
      if (!(await this.ports.store.isInstallationActive(job.installationId))) { await this.ports.store.finish(id, 'stale', 'INSTALLATION_INACTIVE'); return; }
      const github = this.ports.github(job), reporter = this.ports.reporter(job);
      let checkId = stored.checkRunId;
      try {
        if (!(await stage('github-current', () => github.isCurrent(job))) || !(await this.ports.store.isLatestJob(id))) {
          if (checkId) await reporter.cancel(job, checkId, 'A newer head or base SHA superseded this snapshot.');
          await this.ports.store.finish(id, 'stale'); return;
        }
        await this.ports.store.markRunning(id);
        checkId = await stage('check-start', () => reporter.start(job, checkId));
        await this.ports.store.saveCheckRun(id, checkId);
        await this.ports.store.audit('analysis_started', id, { headSha: job.headSha, baseSha: job.baseSha });
        const result = stored.result ?? await analyzeSnapshot(await stage('repository-collection', () => github.collect(job, policy)), policy, this.ports.judge, this.ports.cache);
        if (!stored.result) await this.ports.store.saveResult(result);
        // A result is an immutable historical snapshot; publication uses a second live freshness guard.
        if (!(await github.isCurrent(job)) || !(await this.ports.store.isLatestJob(id))) {
          await reporter.cancel(job, checkId, 'A newer commit arrived during analysis.');
          await this.ports.store.finish(id, 'stale'); return;
        }
        const publicationCheckId = checkId;
        await stage('check-publish', () => reporter.publish(job, publicationCheckId, result));
        await this.ports.store.finish(id, 'completed');
        log('analysis_completed', { analysisId: id, outcome: result.decision.outcome, headSha: job.headSha });
      } catch (error) {
        const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'ANALYSIS_STAGE_FAILED';
        if (code === 'STALE_SNAPSHOT') {
          if (checkId) await reporter.cancel(job, checkId, 'Snapshot changed during collection.');
          await this.ports.store.finish(id, 'stale'); return;
        }
        await this.ports.store.finish(id, 'failed', code);
        if (checkId) {
          try { await reporter.fail(job, checkId, 'Analysis could not complete. Review is required; the worker will retry.'); }
          catch { log('check_failure_publication_failed', { analysisId: id }); }
        }
        log('analysis_failed', { analysisId: id, code });
        throw error;
      }
    });
  }
}
