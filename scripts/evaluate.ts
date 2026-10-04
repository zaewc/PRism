import { goldenCases } from '../evaluation/cases/fixtures.js';
import { analyzeSnapshot } from '@prism/application';
import { JevJudge } from '@prism/judge';
import { evaluatePredictions } from '@prism/risk-engine';

const cases = goldenCases();
const predictions = await Promise.all(cases.map(async fixture => {
  const result = await analyzeSnapshot(fixture.snapshot, fixture.policy, new JevJudge({ apiKey: '' }));
  return { name: fixture.name, expected: fixture.expected, actual: result.decision.outcome, risk: result.overall };
}));
process.stdout.write(JSON.stringify({ mode: 'deterministic-golden-fixtures', modelCalls: 0, promptVersion: 'risk-rubric-1', predictions, metrics: evaluatePredictions(predictions) }, null, 2) + '\n');
if (predictions.some(p => p.actual !== p.expected)) process.exitCode = 1;
