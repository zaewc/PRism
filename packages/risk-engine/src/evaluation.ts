export function evaluatePredictions(rows: Array<{ expected: 'SAFE' | 'REVIEW' | 'BLOCK'; actual: 'SAFE' | 'REVIEW' | 'BLOCK' }>) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const row of rows) {
    const unsafe = row.expected === 'BLOCK', predicted = row.actual === 'BLOCK';
    if (unsafe && predicted) tp++; else if (unsafe) fn++; else if (predicted) fp++; else tn++;
  }
  const ratio = (a: number, b: number) => b ? a / b : null;
  const precision = ratio(tp, tp + fp), recall = ratio(tp, tp + fn);
  return { cases: rows.length, accuracy: ratio(rows.filter(r => r.expected === r.actual).length, rows.length), precision, recall, f1: precision !== null && recall !== null && precision + recall ? 2 * precision * recall / (precision + recall) : null, falsePositiveRate: ratio(fp, fp + tn), falseNegativeRate: ratio(fn, fn + tp), falseNegatives: fn };
}
export function calibrateRisk(observations: Array<{ risk: number; unsafe: boolean }>, minimumSamples = 30) {
  return [0, 20, 40, 60, 80].map(from => {
    const to = from + 20;
    const rows = observations.filter(o => o.risk >= from && (to === 100 ? o.risk <= to : o.risk < to));
    const safe = rows.filter(r => !r.unsafe).length;
    const fraction = rows.length ? safe / rows.length : null;
    const z = 1.96, n = rows.length;
    const interval = fraction !== null && n ? { lower: Math.max(0, (fraction + z * z / (2 * n) - z * Math.sqrt(fraction * (1 - fraction) / n + z * z / (4 * n * n))) / (1 + z * z / n)), upper: Math.min(1, (fraction + z * z / (2 * n) + z * Math.sqrt(fraction * (1 - fraction) / n + z * z / (4 * n * n))) / (1 + z * z / n)) } : null;
    return { from, to, samples: n, safeRate: n >= minimumSamples ? fraction : null, interval: n >= minimumSamples ? interval : null, sufficient: n >= minimumSamples };
  });
}
