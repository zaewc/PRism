import { defaultPolicy, policySchema } from '@prism/domain';
import type { Decision, MergePolicy, PolicyEngine } from '@prism/domain';
import { parseDocument } from 'yaml';

export { defaultPolicy, policySchema };
export function parsePolicyYaml(text: string): MergePolicy {
  if (Buffer.byteLength(text) > 64_000) throw new Error('Policy exceeds 64KB');
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length) throw new Error('Invalid policy YAML');
  return policySchema.parse(document.toJS({ maxAliasCount: 20 }));
}

export class DeterministicPolicyEngine implements PolicyEngine {
  evaluate(input: Parameters<PolicyEngine['evaluate']>[0], policy: MergePolicy): Decision {
    const reasons: Decision['reasons'] = [];
    let blocked = false;
    let review = false;
    const add = (level: 'block' | 'review', code: string, message: string, evidenceIds: string[] = []) => {
      if (level === 'block') blocked = true; else review = true;
      reasons.push({ code, message, evidenceIds });
    };
    const critical = input.evidence.filter(e => e.category === 'security' && e.severity === 'critical');
    if (policy.blockOnCriticalSecurity && critical.length) add('block', 'CRITICAL_SECURITY', 'Critical security evidence must be resolved.', critical.map(e => e.id));
    const dependency = input.evidence.filter(e => e.code === 'DEPENDENCY_VULNERABILITY' && ['high', 'critical'].includes(e.severity));
    if (policy.blockHighDependencySeverity && dependency.length) add('block', 'VULNERABLE_DEPENDENCY', 'High or critical dependency vulnerability introduced.', dependency.map(e => e.id));
    if (input.mergeable === false) add('block', 'MERGE_CONFLICT', 'GitHub reports a merge conflict.');
    if (input.kind === 'pull_request' && input.mergeable === null) add('review', 'MERGEABILITY_UNKNOWN', 'GitHub has not established mergeability.');
    if (policy.requirePassingCI) {
      if (!policy.requiredChecks.length) add('review', 'CI_POLICY_UNCONFIGURED', 'Configure the CI checks that this repository requires.');
      for (const requirement of policy.requiredChecks) {
        const checks = input.checks.filter(c => c.name === requirement.name && (requirement.appId === undefined || c.appId === requirement.appId));
        if (checks.some(c => c.state === 'failure')) add('block', 'FAILED_REQUIRED_CI', `Required CI failed: ${requirement.name}.`);
        else if (!checks.length || checks.some(c => c.state !== 'success')) add('review', 'PENDING_REQUIRED_CI', `Required CI is pending or missing: ${requirement.name}.`);
      }
    }
    const testless = input.evidence.filter(e => e.code === 'CRITICAL_PATH_WITHOUT_TEST');
    if (policy.requireTestsForCriticalPaths && testless.length) add('block', 'CRITICAL_PATH_TESTS_REQUIRED', 'Critical code changed without a related changed test.', testless.map(e => e.id));
    const apiChanges = input.evidence.filter(e => e.code === 'EXPORTED_API_CHANGED');
    if (policy.reviewOnPublicApiChange && apiChanges.length) add('review', 'PUBLIC_API_REVIEW_REQUIRED', 'An exported API changed and requires compatibility review.', apiChanges.map(e => e.id));
    if (input.limitations.length) add(policy.failureMode.analysis === 'closed' ? 'block' : 'review', 'ANALYSIS_INCOMPLETE', 'Analysis has explicit limitations; inspect missing evidence.');
    if (input.judge.status !== 'available') {
      if (policy.failureMode.judge !== 'open') add(policy.failureMode.judge === 'closed' ? 'block' : 'review', 'JUDGE_UNAVAILABLE', input.judge.status === 'mock' ? 'Fixture judge cannot authorize a live merge.' : 'Jev is unavailable.');
      else reasons.push({ code: 'EXPLICIT_JUDGE_FAIL_OPEN', message: 'Repository policy explicitly permits deterministic-only decisions during judge failure.', evidenceIds: [] });
    } else {
      const confidence = input.judge.choice?.confidence ?? 0;
      const support = input.evidence.filter(e => ['high', 'critical'].includes(e.severity) && e.confidence >= 0.8);
      if ((input.judge.trueProbability ?? 0) >= policy.judge.blockProbability && confidence >= policy.judge.minConfidence && support.length) add('block', 'JUDGE_CORROBORATED_BLOCK', 'Jev block probability is corroborated by high-confidence deterministic evidence.', support.map(e => e.id));
      else if ((input.judge.trueProbability ?? 0) >= policy.judge.blockProbability) add('review', 'JUDGE_UNCORROBORATED_BLOCK', 'Jev suggests blocking; corroboration or confidence is insufficient.');
      if (confidence < policy.judge.minConfidence) add('review', 'LOW_JUDGE_CONFIDENCE', 'Jev classification requires human review.');
    }
    if (input.overall >= policy.thresholds.block) add('block', 'RISK_BLOCK_THRESHOLD', `Overall risk meets the configured block threshold (${policy.thresholds.block}).`, input.evidence.map(e => e.id));
    else if (input.overall >= policy.thresholds.review) add('review', 'RISK_REVIEW_THRESHOLD', `Overall risk meets the configured review threshold (${policy.thresholds.review}).`, input.evidence.map(e => e.id));
    if (!reasons.length) reasons.push({ code: 'POLICY_SATISFIED', message: 'Collected evidence, judgment and required checks satisfy this policy.', evidenceIds: [] });
    return { outcome: blocked ? 'BLOCK' : review ? 'REVIEW' : 'SAFE', reasons, policyVersion: policy.version };
  }
}
