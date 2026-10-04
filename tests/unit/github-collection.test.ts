import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GitHubRepositoryProvider } from '@prism/github';
import type { GitHubTransport } from '@prism/github';
import { defaultPolicy } from '@prism/domain';
import type { AnalysisJob } from '@prism/domain';
it('compares source against the PR merge base and reports unsupported or missing diffs', async () => {
  const job: AnalysisJob = { id: randomUUID(), installationId: 1, repositoryId: 2, owner: 'test', repo: 'repo', kind: 'pull_request', pullRequestNumber: 3, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), deliveryId: 'collect', analyzerVersion: '1', configurationHash: 'configuration', attempt: 'initial' };
  const mergeBase = 'c'.repeat(40), paths: string[] = [];
  const transport: GitHubTransport = { request: async (_method, path) => {
    paths.push(path); let data: unknown;
    if (path.endsWith('/pulls/3')) data = { title: 'Change', state: 'open', head: { sha: job.headSha }, base: { sha: job.baseSha }, mergeable: true, changed_files: 2 };
    else if (path.includes('/dependency-graph/')) data = [];
    else if (path.includes('/compare/')) data = { merge_base_commit: { sha: mergeBase } };
    else if (path.includes('/pulls/3/files')) data = [{ filename: 'src/api.ts', status: 'modified', additions: 1, deletions: 1 }, { filename: 'lib/source.rs', status: 'added', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+fn main() {}' }];
    else if (path.includes('/git/trees/')) data = { truncated: false, tree: [{ path: 'src/api.ts', type: 'blob', sha: 'd'.repeat(40), size: 30 }] };
    else if (path.includes('/git/blobs/') || path.includes('/contents/')) data = { encoding: 'base64', content: Buffer.from('export const api = 1;').toString('base64'), size: 21 };
    else if (path.includes('/check-runs')) data = { check_runs: [] };
    else data = [];
    return { data, headers: new Headers() };
  } };
  const snapshot = await new GitHubRepositoryProvider(transport).collect(job, defaultPolicy);
  expect(paths).toContain(`/repos/test/repo/contents/src/api.ts?ref=${mergeBase}`);
  expect(snapshot.baseSources[0]?.sha).toBe(mergeBase);
  expect(snapshot.job.baseSha).toBe(job.baseSha);
  expect(snapshot.limitations).toContain('A changed source language has no implemented AST adapter.');
  expect(snapshot.limitations).toContain('A changed source file has no complete textual diff; changed-line checks are incomplete.');
});
