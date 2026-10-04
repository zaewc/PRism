import { expect, it } from 'vitest';
import { calibrateRisk, evaluatePredictions } from '@prism/risk-engine';
it('distinguishes false safe decisions from false blocks and abstentions', () => {
  const report = evaluatePredictions([{ expected: 'BLOCK', actual: 'SAFE' }, { expected: 'SAFE', actual: 'BLOCK' }, { expected: 'REVIEW', actual: 'REVIEW' }, { expected: 'BLOCK', actual: 'BLOCK' }]);
  expect(report).toMatchObject({ accuracy: 0.5, precision: 0.5, recall: 0.5, falsePositiveRate: 0.5, falseNegativeRate: 0.5, falseNegatives: 1 });
  expect(evaluatePredictions([]).accuracy).toBeNull();
});
it('withholds empirical calibration until enough observations exist', () => {
  expect(calibrateRisk([{ risk: 10, unsafe: false }])[0]).toMatchObject({ sufficient: false, safeRate: null, interval: null });
  const bucket = calibrateRisk(Array.from({ length: 30 }, (_, i) => ({ risk: 100, unsafe: i < 6 })))[4];
  expect(bucket?.safeRate).toBe(0.8);
  expect(bucket?.interval?.lower).toBeLessThan(0.8);
  expect(bucket?.interval?.upper).toBeGreaterThan(0.8);
});
