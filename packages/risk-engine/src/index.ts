import { riskCategories } from '@prism/domain';
import type { RiskAggregator, RiskEvidence, RiskScores } from '@prism/domain';
export { calibrateRisk, evaluatePredictions } from './evaluation.js';

const severity: Record<RiskEvidence['severity'], number> = { info: 2, low: 12, medium: 35, high: 65, critical: 95 };
export function deterministicScores(evidence: RiskEvidence[]): RiskScores {
  const scores: RiskScores = { bug: 0, breaking: 0, security: 0, tests: 0, dependencies: 0, architecture: 0, maintainability: 0, operational: 0 };
  for (const category of riskCategories) {
    // Duplicate analyzer reports must not inflate a finding. Keep the strongest report per code/location.
    const unique = new Map<string, number>();
    for (const item of evidence.filter(e => e.category === category)) {
      const key = `${item.code}:${item.location?.path ?? ''}:${item.location?.line ?? ''}`;
      unique.set(key, Math.max(unique.get(key) ?? 0, severity[item.severity] * item.confidence));
    }
    const values = [...unique.values()].sort((a, b) => b - a);
    const strongest = values[0] ?? 0;
    // Subsequent correlated evidence has a capped incremental contribution.
    scores[category] = Math.round(Math.min(100, strongest + values.slice(1).reduce((sum, v) => sum + v * 0.12, 0)));
  }
  return scores;
}

export class EvidenceRiskAggregator implements RiskAggregator {
  aggregate(evidence: RiskEvidence[], judge: Parameters<RiskAggregator['aggregate']>[1], policy: Parameters<RiskAggregator['aggregate']>[2]) {
    const scores = deterministicScores(evidence);
    const contributions: Record<keyof RiskScores, string[]> = { bug: [], breaking: [], security: [], tests: [], dependencies: [], architecture: [], maintainability: [], operational: [] };
    for (const category of riskCategories) {
      contributions[category] = evidence.filter(e => e.category === category).map(e => e.id);
      const judged = judge.status === 'available' ? judge.scores?.[category] : undefined;
      if (judged) {
        const weight = policy.judge.weight * judged.confidence;
        // AI may elevate a dimension but never erase deterministic risk.
        scores[category] = Math.max(scores[category], Math.round(scores[category] * (1 - weight) + judged.score * weight));
      }
    }
    const values = riskCategories.map(c => scores[c]);
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const overall = Math.round(Math.max(...values) * 0.8 + average * 0.2);
    return { scores, overall, contributions };
  }
}
