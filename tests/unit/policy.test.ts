import { describe, expect, it } from 'vitest';
import { defaultPolicy, judgeResultSchema, policySchema } from '@prism/domain';
import type { RiskEvidence } from '@prism/domain';
import { DeterministicPolicyEngine, parsePolicyYaml } from '@prism/policy';
import { EvidenceRiskAggregator, deterministicScores } from '@prism/risk-engine';

const engine = new DeterministicPolicyEngine();
const judge = judgeResultSchema.parse({ status: 'available', model: 'jev-1.13.0', modelVersion: 'jev-1.13.0', promptVersion: '1', inputHash: 'hash', requestHash: 'hash', timestamp: new Date().toISOString(), choice: { choice: 'SAFE', probabilities: { SAFE: 1 }, confidence: 0.99 }, scores: null, trueProbability: 0.01, falseProbability: 0.99, error: null });
const input = { evidence: [], overall: 0, judge, checks: [], mergeable: true, limitations: [], kind: 'pull_request' as const };
const policy = policySchema.parse({ requiredChecks: [{ name: 'test', appId: 1 }] });
const finding: RiskEvidence = { id: 'e1', code: 'SECRET_ADDED', category: 'security', severity: 'critical', confidence: 0.99, source: 'test', analyzerVersion: '1', message: 'Secret detected', metadata: {} };

describe('merge governance', () => {
  it('blocks a critical security finding despite a SAFE model choice', () => {
    expect(engine.evaluate({ ...input, evidence: [finding] }, policy).outcome).toBe('BLOCK');
  });
  it('requires configured CI and checks from the configured App', () => {
    expect(engine.evaluate(input, defaultPolicy).outcome).toBe('REVIEW');
    expect(engine.evaluate({ ...input, checks: [{ name: 'test', appId: 2, state: 'success', sha: 'a'.repeat(40) }] }, policy).outcome).toBe('REVIEW');
    expect(engine.evaluate({ ...input, checks: [{ name: 'test', appId: 1, state: 'success', sha: 'a'.repeat(40) }] }, policy).outcome).toBe('SAFE');
  });
  it('blocks failed CI and reviews missing or pending CI', () => {
    expect(engine.evaluate({ ...input, checks: [{ name: 'test', appId: 1, state: 'failure', sha: 'a'.repeat(40) }] }, policy).outcome).toBe('BLOCK');
    expect(engine.evaluate({ ...input, checks: [{ name: 'test', appId: 1, state: 'pending', sha: 'a'.repeat(40) }] }, policy).outcome).toBe('REVIEW');
  });
  it('does not block on Noul alone', () => {
    expect(engine.evaluate({ ...input, judge: { ...judge, trueProbability: 0.99 }, checks: [{ name: 'test', appId: 1, state: 'success', sha: 'a'.repeat(40) }] }, policy).outcome).toBe('REVIEW');
  });
  it('handles judge and analysis failure conservatively', () => {
    const noCI = policySchema.parse({ requirePassingCI: false });
    expect(engine.evaluate({ ...input, judge: { ...judge, status: 'unavailable' } }, noCI).outcome).toBe('REVIEW');
    expect(engine.evaluate({ ...input, judge: { ...judge, status: 'mock' } }, noCI).outcome).toBe('REVIEW');
    expect(engine.evaluate({ ...input, limitations: ['truncated diff'] }, noCI).outcome).toBe('REVIEW');
    expect(engine.evaluate({ ...input, judge: { ...judge, status: 'unavailable' } }, policySchema.parse({ requirePassingCI: false, failureMode: { judge: 'closed' } })).outcome).toBe('BLOCK');
  });
  it('supports explicit fail-open without erasing deterministic blockers', () => {
    const open = policySchema.parse({ requirePassingCI: false, failureMode: { judge: 'open' } });
    expect(engine.evaluate({ ...input, judge: { ...judge, status: 'unavailable' } }, open).outcome).toBe('SAFE');
    expect(engine.evaluate({ ...input, evidence: [finding], judge: { ...judge, status: 'unavailable' } }, open).outcome).toBe('BLOCK');
  });
  it('rejects invalid thresholds, self-required checks and unknown configuration', () => {
    expect(() => policySchema.parse({ thresholds: { review: 80, block: 40 } })).toThrow();
    expect(() => policySchema.parse({ requiredChecks: [{ name: 'PRism' }] })).toThrow();
    expect(() => parsePolicyYaml('version: "2"\nallowIgnore: false\nunknown: true')).toThrow();
    expect(() => parsePolicyYaml('version: "1"\nversion: "2"')).toThrow();
  });
});
describe('evidence aggregation', () => {
  it('deduplicates findings and returns bounded deterministic scores', () => {
    expect(deterministicScores([finding, { ...finding, id: 'duplicate' }])).toEqual(deterministicScores([finding]));
    expect(deterministicScores([finding]).security).toBe(94);
  });
  it('preserves evidence contributions and cannot lower deterministic scores', () => {
    const result = new EvidenceRiskAggregator().aggregate([finding], judge, policy);
    expect(result.contributions.security).toEqual(['e1']);
    expect(result.scores.security).toBeGreaterThanOrEqual(94);
    expect(result.overall).toBeGreaterThan(75);
  });
});
