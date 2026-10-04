import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { analyzeSnapshot } from '@prism/application';
import { JevJudge } from '@prism/judge';
import { defaultPolicy } from '@prism/domain';
import type { RepositorySnapshot } from '@prism/domain';
it('reuses versioned parsed snapshots without storing source literals or credential values', async () => {
  const secret = 'ghp_' + 'x'.repeat(36);
  const content = `export function parse(input: string = "${secret}") { return input; }`;
  const snapshot: RepositorySnapshot = { job: { id: randomUUID(), installationId: 1, repositoryId: 2, owner: 'test', repo: 'repo', kind: 'pull_request', pullRequestNumber: 3, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), deliveryId: 'cache-test', analyzerVersion: '1', configurationHash: 'configuration1', attempt: 'initial' }, title: 'Cache', files: [{ path: 'src/parse.ts', status: 'added', additions: 1, deletions: 0, binary: false, patch: '@@ -0,0 +1 @@\n+' + content }], sources: [{ path: 'src/parse.ts', content, sha: 'a'.repeat(40) }], baseSources: [], repositoryPaths: ['src/parse.ts'], checks: [], mergeable: true, externalEvidence: [], providers: [], limitations: [], history: { analyzed: 0, reverted: 0 } };
  const entries = new Map<string, unknown>(); let writes = 0;
  const cache = { getCache: async (key: string) => entries.get(key) ?? null, setCache: async (key: string, value: unknown) => { writes++; entries.set(key, value); } };
  const judge = new JevJudge({ apiKey: '' });
  const first = await analyzeSnapshot(snapshot, defaultPolicy, judge, cache), second = await analyzeSnapshot(snapshot, defaultPolicy, judge, cache);
  expect(first.evidence).toEqual(second.evidence); expect(first.scores).toEqual(second.scores); expect(writes).toBe(2);
  expect(JSON.stringify([...entries.values()])).not.toContain(secret); expect(JSON.stringify([...entries.values()])).not.toContain('return input');
  await analyzeSnapshot({ ...snapshot, job: { ...snapshot.job, analyzerVersion: '2' } }, defaultPolicy, judge, cache); expect(writes).toBe(4);
});
