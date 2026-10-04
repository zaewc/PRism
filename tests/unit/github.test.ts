import { createHmac, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseWebhook, verifySignature, paginated, conclusionFor, GitHubCheckReporter, GitHubRepositoryProvider } from '@prism/github';
import type { GitHubTransport } from '@prism/github';
import { defaultPolicy, shaSchema } from '@prism/domain';
import type { AnalysisJob } from '@prism/domain';
const job: AnalysisJob = { id: randomUUID(), installationId: 1, repositoryId: 2, owner: 'test', repo: 'repo', kind: 'pull_request', pullRequestNumber: 3, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), deliveryId: 'delivery', analyzerVersion: '1', configurationHash: 'hash', attempt: 'initial' };
const repository = { id: 2, name: 'repo', owner: { login: 'test' } };
describe('GitHub contracts', () => {
  it('verifies exact raw bytes and rejects forged signatures', () => {
    const raw = Buffer.from('{ "x": 1 }'), secret = 'test-secret';
    const signature = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    expect(verifySignature(raw, signature, secret)).toBe(true);
    expect(verifySignature(Buffer.from('{"x":1}'), signature, secret)).toBe(false);
    expect(verifySignature(raw, 'sha256=invalid', secret)).toBe(false);
    expect(verifySignature(raw, undefined, secret)).toBe(false);
  });
  it('keeps merge-group identity separate from PR identity', () => {
    const event = parseWebhook('merge_group', { action: 'checks_requested', installation: { id: 1 }, repository, merge_group: { head_sha: 'c'.repeat(40), base_sha: job.baseSha, head_ref: 'refs/heads/gh-readonly-queue/main/test', base_ref: 'refs/heads/main' } }, 1, 'delivery');
    expect(event).toMatchObject({ type: 'analyze', kind: 'merge_group', number: null, headSha: 'c'.repeat(40) });
  });
  it('accepts reanalysis only from this App and ignores its own completion', () => {
    const payload = { action: 'rerequested', installation: { id: 1 }, repository, check_run: { id: 1, name: 'PRism', head_sha: job.headSha, external_id: job.id, app: { id: 4 } } };
    expect(parseWebhook('check_run', payload, 4, 'delivery').type).toBe('rerequest');
    expect(parseWebhook('check_run', payload, 5, 'delivery').type).toBe('ignored');
    expect(parseWebhook('check_run', { ...payload, action: 'completed' }, 4, 'delivery').type).toBe('ignored');
  });
  it('follows pagination while ignoring the host supplied in Link', async () => {
    const paths: string[] = [];
    const transport: GitHubTransport = { request: async (_method, path) => { paths.push(path); return { data: paths.length === 1 ? ['a'.repeat(40)] : ['b'.repeat(40)], headers: new Headers(paths.length === 1 ? { link: '<https://attacker.invalid/next>; rel="next"' } : {}) }; } };
    expect(await paginated(transport, '/repos/test/repo/files', shaSchema)).toEqual(['a'.repeat(40), 'b'.repeat(40)]);
    expect(paths[1]).toBe('/repos/test/repo/files?per_page=100&page=2');
  });
  it('maps REVIEW to a non-passing required check conclusion', () => {
    expect(conclusionFor('REVIEW')).toBe('action_required'); expect(conclusionFor('BLOCK')).toBe('failure'); expect(conclusionFor('SAFE')).toBe('success');
  });
  it('recovers an existing remote check by immutable external job id', async () => {
    const transport: GitHubTransport = { request: async method => { expect(method).toBe('GET'); return { data: { check_runs: [{ id: 42, external_id: job.id }] }, headers: new Headers() }; } };
    expect(await new GitHubCheckReporter(transport, { appId: 1, appUrl: 'http://localhost:3000' }).start(job, null)).toBe(42);
  });
  it('does not collect a PR that has been superseded', async () => {
    const transport: GitHubTransport = { request: async () => ({ data: { title: 'Changed', state: 'open', head: { sha: 'c'.repeat(40) }, base: { sha: job.baseSha }, mergeable: true, changed_files: 0 }, headers: new Headers() }) };
    const provider = new GitHubRepositoryProvider(transport);
    expect(await provider.isCurrent(job)).toBe(false); await expect(provider.collect(job, defaultPolicy)).rejects.toThrow('STALE_SNAPSHOT');
  });
});
