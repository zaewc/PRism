import { createHash } from 'node:crypto';
import type { AnalysisContext, RiskEvidence } from '@prism/domain';
export const ANALYZER_VERSION = 'prism-0.1.0';
export function evidence(context: AnalysisContext, code: string, category: RiskEvidence['category'], severity: RiskEvidence['severity'], confidence: number, message: string, path?: string, line = 1, metadata: Record<string, unknown> = {}): RiskEvidence {
  const key = `${context.snapshot.job.headSha}:${code}:${path ?? ''}:${line}`;
  const removed = context.snapshot.files.some(f => f.path === path && f.status === 'removed');
  const locationSha = removed ? context.snapshot.baseSources.find(s => s.path === path)?.sha ?? context.snapshot.job.baseSha : context.snapshot.job.headSha;
  return { id: createHash('sha256').update(key).digest('hex').slice(0, 24), code, category, severity, confidence, message, source: 'prism-static', analyzerVersion: ANALYZER_VERSION, metadata, ...(path ? { location: { path, line, sha: locationSha } } : {}) };
}
export const isTest = (path: string) => /(?:^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]+\.py$|_test\.go$/.test(path);
export const isProduction = (path: string) => /\.[cm]?[jt]sx?$|\.py$|\.go$|\.java$/.test(path) && !isTest(path);
export const isCritical = (path: string, patterns: string[]) => patterns.some(p => path.split('/').some((_, i, segments) => segments.slice(i).join('/').startsWith(p)));
export function addedLines(patch: string | undefined): Array<{ line: number; text: string }> {
  if (!patch) return [];
  const added: Array<{ line: number; text: string }> = [];
  let headLine = 0;
  for (const row of patch.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) { headLine = Number(hunk[1]); continue; }
    if (row.startsWith('+') && !row.startsWith('+++')) { added.push({ line: headLine, text: row.slice(1) }); headLine++; }
    else if (!row.startsWith('-') && !row.startsWith('\\')) headLine++;
  }
  return added;
}
