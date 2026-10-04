import { z } from 'zod';
import type { Analysis, AnalysisJob, CheckReporter } from '@prism/domain';
import { redactSecrets } from '@prism/security';
import { paginated } from './client.js';
import type { GitHubTransport } from './client.js';

export const conclusionFor = (outcome: Analysis['decision']['outcome']) => outcome === 'SAFE' ? 'success' : outcome === 'BLOCK' ? 'failure' : 'action_required';
const escape = (text: string) => redactSecrets(text).replace(/[\\`*_{}[\]<>|]/g, '\\$&');
export function checkSummary(analysis: Analysis): string {
  return [`## ${analysis.decision.outcome} · Risk ${analysis.overall}/100`, '', `Snapshot: \`${analysis.job.headSha}\` against \`${analysis.job.baseSha}\`.`, '', '| Dimension | Risk |', '| --- | ---: |', ...Object.entries(analysis.scores).map(([name, score]) => `| ${name} | ${score} |`), '', '### Why', ...analysis.decision.reasons.map(reason => `- **${escape(reason.code)}**: ${escape(reason.message)}`), '', '### Evidence', ...analysis.evidence.slice(0, 30).map(e => `- ${escape(e.code)} (${e.severity}, ${Math.round(e.confidence * 100)}%): ${escape(e.message)}${e.location ? ` — ${escape(e.location.path)}:${e.location.line}` : ''}`), '', `Jev: ${analysis.judge.status}; model ${escape(analysis.judge.modelVersion)}; prompt ${analysis.judge.promptVersion}.`, `Versions: analyzer ${analysis.analyzerVersion}, policy ${analysis.policy.version}.`, ...analysis.limitations.map(l => `- Limitation: ${escape(l)}`)].join('\n').slice(0, 60_000);
}
export class GitHubCheckReporter implements CheckReporter {
  constructor(private readonly transport: GitHubTransport, private readonly options: { appId: number; appUrl: string }) {}
  private prefix(job: AnalysisJob) { return `/repos/${encodeURIComponent(job.owner)}/${encodeURIComponent(job.repo)}/check-runs`; }
  async start(job: AnalysisJob, existingId: number | null): Promise<number> {
    if (existingId) return existingId;
    const runs = await paginated(this.transport, `/repos/${encodeURIComponent(job.owner)}/${encodeURIComponent(job.repo)}/commits/${job.headSha}/check-runs?check_name=PRism&filter=all&app_id=${this.options.appId}`, z.object({ id: z.number(), external_id: z.string().nullable() }), data => z.object({ check_runs: z.array(z.unknown()) }).parse(data).check_runs);
    const recovered = runs.find(run => run.external_id === job.id);
    if (recovered) return recovered.id;
    const response = await this.transport.request('POST', this.prefix(job), { name: 'PRism', head_sha: job.headSha, external_id: job.id, status: 'in_progress', started_at: new Date().toISOString(), details_url: `${this.options.appUrl}/analyses/${job.id}`, output: { title: 'Analyzing merge risk', summary: 'Collecting repository evidence, Jev judgment and policy results.' } });
    return z.object({ id: z.number() }).parse(response.data).id;
  }
  async publish(job: AnalysisJob, checkRunId: number, analysis: Analysis) {
    const current = z.object({ output: z.object({ annotations_count: z.number().default(0) }).optional() }).parse((await this.transport.request('GET', `${this.prefix(job)}/${checkRunId}`)).data);
    const annotations = current.output?.annotations_count ? [] : analysis.evidence.filter(e => e.location && analysis.files.some(f => f.path === e.location?.path && f.status !== 'removed')).slice(0, 50).map(e => ({ path: e.location?.path, start_line: e.location?.line, end_line: e.location?.line, annotation_level: ['critical', 'high'].includes(e.severity) ? 'failure' : e.severity === 'medium' ? 'warning' : 'notice', title: e.code.slice(0, 255), message: redactSecrets(e.message).slice(0, 2000) }));
    await this.transport.request('PATCH', `${this.prefix(job)}/${checkRunId}`, { status: 'completed', conclusion: conclusionFor(analysis.decision.outcome), completed_at: analysis.completedAt, output: { title: `${analysis.decision.outcome} · ${analysis.overall}/100 risk`, summary: checkSummary(analysis), ...(annotations.length ? { annotations } : {}) }, actions: [{ label: 'Re-analyze', description: 'Run a new immutable analysis', identifier: 'reanalyze' }] });
  }
  async cancel(job: AnalysisJob, checkRunId: number, reason: string) {
    await this.transport.request('PATCH', `${this.prefix(job)}/${checkRunId}`, { status: 'completed', conclusion: 'cancelled', output: { title: 'Superseded snapshot', summary: escape(reason) } });
  }
  async fail(job: AnalysisJob, checkRunId: number, reason: string) {
    await this.transport.request('PATCH', `${this.prefix(job)}/${checkRunId}`, { status: 'completed', conclusion: 'action_required', output: { title: 'Analysis unavailable · REVIEW', summary: escape(reason) } });
  }
}
