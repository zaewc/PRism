import 'server-only';
import { cache } from 'react';
import { PostgresStore } from '@prism/database';
import type { RepositoryRow } from '@prism/database';
import type { Analysis } from '@prism/domain';
import { defaultPolicy } from '@prism/domain';

export interface WorkspaceData { analyses: Analysis[]; repositories: RepositoryRow[]; demo: boolean }
let store: PostgresStore | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  store ??= new PostgresStore(process.env.DATABASE_URL);
  return store;
}
let demoResults: Promise<Analysis[]> | undefined;
export async function demoData(): Promise<WorkspaceData> {
  demoResults ??= (async () => {
    const [{ goldenCases }, { analyzeSnapshot }, { JevJudge }] = await Promise.all([import('../../../../evaluation/cases/fixtures'), import('@prism/application'), import('@prism/judge')]);
    const cases = goldenCases();
    return Promise.all(cases.map(async (fixture, index) => {
      const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      const result = await analyzeSnapshot({ ...fixture.snapshot, job: { ...fixture.snapshot.job, id } }, fixture.policy, new JevJudge({ apiKey: '' }));
      const date = new Date(Date.UTC(2026, 9, 4, 10, index * 12)).toISOString();
      return { ...result, startedAt: date, completedAt: date };
    }));
  })();
  return { analyses: await demoResults, repositories: [{ id: 1, installation_id: 1, owner: 'acme', name: 'payments', active: true, configuration: { ...defaultPolicy, requirePassingCI: true, requiredChecks: [{ name: 'test', appId: 5 }], failureMode: { judge: 'open', analysis: 'review' } } }], demo: true };
}
export const workspaceData = cache(async (): Promise<WorkspaceData> => {
  if (process.env.PRISM_DEMO === 'true') return demoData();
  const db = database();
  const [analyses, repositories] = await Promise.all([db.analyses(), db.repositories()]);
  return { analyses, repositories, demo: false };
});
export const analysisData = cache(async (id: string, demo = false) => {
  if (demo || process.env.PRISM_DEMO === 'true') return (await demoData()).analyses.find(a => a.id === id) ?? null;
  return database().analysis(id);
});
export function latestSnapshots(analyses: Analysis[]) {
  const seen = new Set<string>();
  return [...analyses].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).filter(a => {
    const key = `${a.job.repositoryId}:${a.job.kind}:${a.job.pullRequestNumber ?? a.job.headSha}`;
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}
