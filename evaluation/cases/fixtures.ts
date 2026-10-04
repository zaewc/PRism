import { randomUUID } from 'node:crypto';
import { policySchema } from '@prism/domain';
import type { MergePolicy, RepositorySnapshot } from '@prism/domain';

export interface GoldenCase { name: string; expected: 'SAFE' | 'REVIEW' | 'BLOCK'; snapshot: RepositorySnapshot; policy: MergePolicy }
export function goldenCases(): GoldenCase[] {
  // Deliberate deterministic-only policy: this evaluation is not a claim about live Jev accuracy.
  const policy = policySchema.parse({ requirePassingCI: true, requiredChecks: [{ name: 'test', appId: 5 }], failureMode: { judge: 'open' } });
  const snapshot = (number: number, title: string, path: string, source: string, before = '', test = false): RepositorySnapshot => {
    const headSha = number.toString(16).padStart(40, 'a'), baseSha = 'b'.repeat(40);
    const testPath = path.replace(/\.ts$/, '.test.ts');
    const testContent = 'import { login } from "./login"; test("logs in", () => expect(login("user")).toBe("user"));';
    return { job: { id: randomUUID(), installationId: 1, repositoryId: 1, owner: 'acme', repo: 'payments', kind: 'pull_request', pullRequestNumber: number, headSha, baseSha, deliveryId: `fixture-${number}`, analyzerVersion: 'prism-0.1.0', configurationHash: 'fixture-policy', attempt: 'fixture' }, title,
      files: [{ path, status: before ? 'modified' : 'added', additions: 1, deletions: before ? 1 : 0, binary: false, patch: `@@ -1 +1 @@\n${before ? '-' + before + '\n' : ''}+${source}` }, ...(test ? [{ path: testPath, status: 'added' as const, additions: 1, deletions: 0, binary: false, patch: '@@ -0,0 +1 @@\n+' + testContent }] : [])],
      sources: path.endsWith('.ts') ? [{ path, content: source, sha: headSha }, ...(test ? [{ path: testPath, content: testContent, sha: headSha }] : [])] : [],
      baseSources: before && path.endsWith('.ts') ? [{ path, content: before, sha: baseSha }] : [],
      repositoryPaths: [path, ...(test ? [testPath] : [])], checks: [{ name: 'test', appId: 5, state: 'success', sha: headSha }], mergeable: true,
      externalEvidence: [], providers: [{ source: 'fixture', status: 'available', reason: 'Local synthetic fixture; no GitHub or Jev network call.' }, { source: 'coverage', status: 'disabled', reason: 'Executed coverage is not provided by this fixture.' }], limitations: [], history: { analyzed: 0, reverted: 0 },
    };
  };
  const removed = snapshot(383, 'refactor: remove the public parser', 'src/parse.ts', '', 'export function parse(input: string): string { return input; }');
  return [
    { name: 'safe-docs', expected: 'SAFE', snapshot: snapshot(381, 'docs: clarify the deployment guide', 'docs/deployment.md', 'Deploy the worker separately from the webhook receiver.'), policy },
    { name: 'auth-without-test', expected: 'BLOCK', snapshot: snapshot(382, 'feat: update authentication flow', 'src/auth/login.ts', 'export const login = (user: string) => user;'), policy },
    { name: 'tested-auth', expected: 'SAFE', snapshot: snapshot(379, 'test: cover the authentication flow', 'src/auth/login.ts', 'export const login = (user: string) => user;', '', true), policy },
    { name: 'breaking-api', expected: 'REVIEW', snapshot: snapshot(380, 'refactor: change the public parser API', 'src/parse.ts', 'export function parse(input: number): string { return String(input); }', 'export function parse(input: string): string { return input; }', true), policy },
    { name: 'credential-added', expected: 'BLOCK', snapshot: snapshot(378, 'chore: update provider configuration', 'src/config.ts', 'export const token = "ghp_' + 'x'.repeat(36) + '";'), policy },
    { name: 'pending-ci', expected: 'REVIEW', snapshot: { ...snapshot(377, 'docs: add policy examples', 'docs/policy.md', 'Require CI before merging.'), checks: [] }, policy },
    { name: 'api-removed', expected: 'REVIEW', snapshot: { ...removed, files: removed.files.map(f => ({ ...f, status: 'removed', additions: 0, patch: '@@ -1 +0,0 @@\n-export function parse(input: string): string { return input; }' })), sources: [], repositoryPaths: [] }, policy },
  ];
}
