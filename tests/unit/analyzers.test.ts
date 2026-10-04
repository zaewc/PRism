import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { defaultPolicy } from '@prism/domain';
import type { AnalysisContext, RepositorySnapshot } from '@prism/domain';
import { ParserRegistry, TypeScriptParser } from '@prism/parser';
import { analyzeEvidence, dependencyEdges } from '@prism/analysis';
import { containsSecret, exportSarif, importSarif, redactSecrets } from '@prism/security';

function context(content: string, base = '', tests = ''): AnalysisContext {
  const sha = 'a'.repeat(40), baseSha = 'b'.repeat(40);
  const snapshot: RepositorySnapshot = { job: { id: randomUUID(), installationId: 1, repositoryId: 1, owner: 'test', repo: 'test', kind: 'pull_request', pullRequestNumber: 1, headSha: sha, baseSha, deliveryId: 'delivery', analyzerVersion: '1', configurationHash: 'hash', attempt: 'initial' }, title: 'Test', files: [{ path: 'src/auth/login.ts', additions: 1, deletions: 1, binary: false, status: 'modified', patch: `@@ -1 +1 @@\n-${base}\n+${content}` }, ...(tests ? [{ path: 'src/auth/login.test.ts', additions: 1, deletions: 0, binary: false, status: 'added' as const, patch: `@@ -0,0 +1 @@\n+${tests}` }] : [])], sources: [{ path: 'src/auth/login.ts', content, sha }, ...(tests ? [{ path: 'src/auth/login.test.ts', content: tests, sha }] : [])], baseSources: [{ path: 'src/auth/login.ts', content: base, sha: baseSha }], repositoryPaths: ['src/auth/login.ts', 'src/auth/login.test.ts'], checks: [], mergeable: true, externalEvidence: [], providers: [], limitations: [], history: { analyzed: 0, reverted: 0 } };
  const parser = new ParserRegistry();
  return { snapshot, policy: defaultPolicy, parsed: snapshot.sources.flatMap(f => parser.parse(f) ?? []), baseParsed: snapshot.baseSources.flatMap(f => parser.parse(f) ?? []) };
}
describe('source parsers and evidence', () => {
  it('extracts imports and symbols without treating comments as calls', () => {
    const parsed = new TypeScriptParser().parse({ path: 'a.ts', sha: 'a'.repeat(40), content: 'import {readFile} from "node:fs"; // eval("bad")\nexport function foo(x: string): boolean { if(x) return true; return false; }' });
    expect(parsed.imports).toEqual(['node:fs']); expect(parsed.exports).toEqual(['foo']); expect(parsed.calls).toHaveLength(0); expect(parsed.branches).toBe(1);
  });
  it('detects a changed public signature and critical code without related tests', () => {
    const results = analyzeEvidence(context('export function login(x: number) { return x; }', 'export function login(x: string) { return x; }'));
    expect(results.map(e => e.code)).toContain('EXPORTED_API_CHANGED'); expect(results.map(e => e.code)).toContain('CRITICAL_PATH_WITHOUT_TEST');
  });
  it('does not treat an unrelated test file as coverage for critical code', () => {
    const ctx = context('export const login = () => true;', '', 'export const unrelated = true;');
    ctx.snapshot.files[1] = { path: 'src/unrelated.test.ts', status: 'added', additions: 1, deletions: 0, binary: false };
    expect(analyzeEvidence(ctx).map(e => e.code)).toContain('CRITICAL_PATH_WITHOUT_TEST');
  });
  it('recognizes a colocated changed test and parser errors', () => {
    expect(analyzeEvidence(context('export const login = () => true;', '', 'import {login} from "./login"; it("login", () => expect(login()).toBe(true));')).map(e => e.code)).not.toContain('CRITICAL_PATH_WITHOUT_TEST');
    expect(analyzeEvidence(context('export function login( {')).map(e => e.code)).toContain('SYNTAX_ERROR');
  });
  it('does not consider test filenames or comments alone to be behavioral assertions', () => {
    expect(analyzeEvidence(context('export const login = () => true;', '', '// add coverage later')).map(e => e.code)).toContain('CRITICAL_PATH_WITHOUT_TEST');
  });
  it('locates changed dangerous calls and redacts secret values', () => {
    const fake = 'ghp_' + 'x'.repeat(36);
    const results = analyzeEvidence(context(`const token = "${fake}"; eval(input);`));
    expect(results.map(e => e.code)).toContain('SECRET_ADDED'); expect(results.map(e => e.code)).toContain('DYNAMIC_CODE_EXECUTION');
    expect(JSON.stringify(results)).not.toContain(fake); expect(containsSecret(fake)).toBe(true); expect(redactSecrets(fake)).toBe('[REDACTED_SECRET]');
  });
  it('resolves relative dependencies and detects reverse critical impact', () => {
    const ctx = context('import { db } from "../db"; export const login = db;');
    ctx.snapshot.repositoryPaths.push('src/db.ts'); ctx.snapshot.files = [{ path: 'src/db.ts', status: 'modified', additions: 1, deletions: 1, binary: false }];
    expect(dependencyEdges(ctx.parsed, ctx.snapshot.repositoryPaths)).toEqual([{ from: 'src/auth/login.ts', to: 'src/db.ts' }]);
    expect(analyzeEvidence(ctx).map(e => e.code)).toContain('CRITICAL_DEPENDENCY_PATH');
  });
  it('round-trips located evidence through SARIF', () => {
    const findings = analyzeEvidence(context('eval(input);'));
    const imported = importSarif(exportSarif(findings), 'a'.repeat(40));
    expect(imported.length).toBeGreaterThan(0); expect(imported.every(e => e.location?.path === 'src/auth/login.ts')).toBe(true);
  });
});
