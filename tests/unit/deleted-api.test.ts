import { expect, it } from 'vitest';
import { analyzeSnapshot } from '@prism/application';
import { JevJudge } from '@prism/judge';
import { goldenCases } from '../../evaluation/cases/fixtures.js';
it('requires review when an entire exported module is deleted and locates its base source', async () => {
  const fixture = goldenCases().find(c => c.name === 'api-removed'); if (!fixture) throw new Error('Missing fixture');
  const result = await analyzeSnapshot(fixture.snapshot, fixture.policy, new JevJudge({ apiKey: '' }));
  expect(result.decision.outcome).toBe('REVIEW');
  expect(result.decision.reasons.map(r => r.code)).toContain('PUBLIC_API_REVIEW_REQUIRED');
  expect(result.evidence.find(e => e.code === 'EXPORTED_API_CHANGED')?.location?.sha).toBe(fixture.snapshot.baseSources[0]?.sha);
});
it('detects removed default, type-only and star exports', async () => {
  const fixture = goldenCases().find(c => c.name === 'api-removed'); if (!fixture) throw new Error('Missing fixture');
  for (const content of ['export default (input: string) => input;', 'export interface Input { value: string }', 'export * from "./implementation";']) {
    const snapshot = { ...fixture.snapshot, baseSources: [{ path: 'src/parse.ts', content, sha: fixture.snapshot.job.baseSha }] };
    const result = await analyzeSnapshot(snapshot, fixture.policy, new JevJudge({ apiKey: '' }));
    expect(result.decision.reasons.map(r => r.code)).toContain('PUBLIC_API_REVIEW_REQUIRED');
  }
});
it('requires API review when a named re-export disappears without a declaration change', async () => {
  const fixture = goldenCases().find(c => c.name === 'breaking-api'); if (!fixture) throw new Error('Missing fixture');
  const snapshot = { ...fixture.snapshot, sources: [{ path: 'src/parse.ts', content: 'export const internal = 1;', sha: fixture.snapshot.job.headSha }], baseSources: [{ path: 'src/parse.ts', content: 'export { parse } from "./implementation";', sha: fixture.snapshot.job.baseSha }] };
  const result = await analyzeSnapshot(snapshot, fixture.policy, new JevJudge({ apiKey: '' }));
  expect(result.decision.reasons.map(r => r.code)).toContain('PUBLIC_API_REVIEW_REQUIRED');
});
