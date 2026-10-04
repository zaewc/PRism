import { expect, it } from 'vitest';
import { defaultPolicy } from '@prism/domain';
import { DeterministicPolicyEngine } from '@prism/policy';
import { ParserRegistry } from '@prism/parser';
import { analyzeEvidence } from '@prism/analysis';
import { redactSecrets } from '@prism/security';
import { goldenCases } from '../../evaluation/cases/fixtures.js';
it('does not assign critical production dependency impact to a test consumer', () => {
  const fixture = goldenCases().find(c => c.name === 'tested-auth'); if (!fixture) throw new Error('Missing fixture');
  const parser = new ParserRegistry();
  const results = analyzeEvidence({ snapshot: fixture.snapshot, policy: fixture.policy, parsed: fixture.snapshot.sources.flatMap(s => parser.parse(s) ?? []), baseParsed: [] });
  expect(results.map(e => e.code)).not.toContain('CRITICAL_DEPENDENCY_PATH');
  expect(results.filter(e => e.code === 'AUTHENTICATION_PATH_CHANGED')).toHaveLength(1);
});
it('requires public API review even when the numeric aggregate is below the review threshold', () => {
  const judge = { status: 'unavailable' as const, model: '', modelVersion: '', promptVersion: '', inputHash: '', requestHash: '', timestamp: new Date().toISOString(), choice: null, scores: null, trueProbability: null, falseProbability: null, error: 'Unavailable' };
  const evidence = [{ id: 'api-change', code: 'EXPORTED_API_CHANGED', category: 'breaking' as const, severity: 'high' as const, confidence: 0.9, source: 'ast', analyzerVersion: '1', message: 'Signature changed', metadata: {} }];
  const result = new DeterministicPolicyEngine().evaluate({ evidence, overall: 49, judge, checks: [], mergeable: true, kind: 'pull_request', limitations: [] }, { ...defaultPolicy, requirePassingCI: false, failureMode: { judge: 'open', analysis: 'review' } });
  expect(result.outcome).toBe('REVIEW'); expect(result.reasons.map(r => r.code)).toContain('PUBLIC_API_REVIEW_REQUIRED');
});
it('redacts private-key content beyond its header, including incomplete patch excerpts', () => {
  const key = '+-----BEGIN PRIVATE KEY-----\n+secret-key-body\n+-----END PRIVATE KEY-----';
  expect(redactSecrets(key)).not.toContain('secret-key-body');
  expect(redactSecrets(key.split('END')[0] ?? '')).not.toContain('secret-key-body');
});
