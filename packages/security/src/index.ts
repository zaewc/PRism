import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AnalysisContext, RepositoryAnalyzer, RiskEvidence } from '@prism/domain';

const secretPatterns = [
  /(?:ghp_|gho_|ghu_|ghs_|github_pat_)[A-Za-z0-9_]{20,}/g,
  /AKIA[A-Z0-9]{16}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /(?:sk-(?:live|proj)-)[A-Za-z0-9_-]{20,}/g,
];
export function redactSecrets(text: string): string {
  return secretPatterns.reduce((current, pattern) => current.replace(new RegExp(pattern.source, 'g'), '[REDACTED_SECRET]'), text);
}
export function containsSecret(text: string): boolean {
  return secretPatterns.some(p => new RegExp(p.source).test(text));
}
function finding(context: AnalysisContext, code: string, severity: RiskEvidence['severity'], message: string, path: string, line: number, confidence: number): RiskEvidence {
  return { id: createHash('sha256').update(`${context.snapshot.job.headSha}:${code}:${path}:${line}`).digest('hex').slice(0, 24), code, category: 'security', severity, confidence, source: 'prism-ast-security', analyzerVersion: 'prism-0.1.0', message, location: { path, line, sha: context.snapshot.job.headSha }, metadata: {} };
}
function addedLines(patch: string): Array<{ line: number; text: string }> {
  let line = 0;
  const result: Array<{ line: number; text: string }> = [];
  for (const row of patch.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) line = Number(hunk[1]);
    else if (row.startsWith('+') && !row.startsWith('+++')) { result.push({ line, text: row.slice(1) }); line++; }
    else if (!row.startsWith('-') && !row.startsWith('\\')) line++;
  }
  return result;
}
export const securityAnalyzer: RepositoryAnalyzer = {
  name: 'security', version: '1',
  analyze(context) {
    const result: RiskEvidence[] = [];
    for (const file of context.snapshot.files) {
      const additions = addedLines(file.patch ?? '');
      const lines = new Set(additions.map(a => a.line));
      for (const row of additions) if (containsSecret(row.text)) result.push(finding(context, 'SECRET_ADDED', 'critical', 'A credential-shaped secret or private-key marker was added. Rotate any real credential.', file.path, row.line, 0.99));
      const parsed = context.parsed.find(p => p.path === file.path);
      for (const call of parsed?.calls.filter(c => lines.has(c.line)) ?? []) {
        if (['eval', 'Function', 'vm.runInNewContext', 'vm.runInThisContext'].includes(call.name)) result.push(finding(context, 'DYNAMIC_CODE_EXECUTION', 'high', 'A changed call evaluates code dynamically.', file.path, call.line, 0.95));
        if (/(^|\.)(exec|execSync|spawn|spawnSync)$/.test(call.name) && call.dynamicArguments) result.push(finding(context, 'DYNAMIC_SHELL_EXECUTION', 'high', 'A changed process execution call uses a dynamic argument; review injection boundaries.', file.path, call.line, 0.85));
        if (/(^|\.)(query|execute|raw)$/.test(call.name) && call.dynamicArguments) result.push(finding(context, 'DYNAMIC_QUERY_CONSTRUCTION', 'medium', 'A changed database-like call has dynamic arguments; verify parameterization.', file.path, call.line, 0.65));
        if (/(^|\.)(fetch|request|axios\.get)$/.test(call.name) && call.dynamicArguments) result.push(finding(context, 'DYNAMIC_NETWORK_DESTINATION', 'medium', 'A changed network call uses dynamic input; inspect destination validation.', file.path, call.line, 0.65));
      }
    }
    return result;
  },
};

const sarifSchema = z.object({ version: z.literal('2.1.0'), runs: z.array(z.object({ tool: z.object({ driver: z.object({ name: z.string() }) }), results: z.array(z.object({ ruleId: z.string().optional(), level: z.enum(['error', 'warning', 'note', 'none']).optional(), message: z.object({ text: z.string() }), locations: z.array(z.object({ physicalLocation: z.object({ artifactLocation: z.object({ uri: z.string() }), region: z.object({ startLine: z.number().int().positive() }).optional() }) })).optional() })).default([]) })) });
export function importSarif(input: unknown, sha: string): RiskEvidence[] {
  const sarif = sarifSchema.parse(input);
  return sarif.runs.flatMap(run => run.results.flatMap(result => {
    const location = result.locations?.[0]?.physicalLocation;
    if (!location || location.artifactLocation.uri.startsWith('/') || location.artifactLocation.uri.includes('..') || /^[a-z]+:/i.test(location.artifactLocation.uri)) return [];
    const path = location.artifactLocation.uri, line = location.region?.startLine ?? 1;
    const code = `SARIF:${result.ruleId ?? 'unknown'}`;
    return [{ id: createHash('sha256').update(`${sha}:${run.tool.driver.name}:${code}:${path}:${line}`).digest('hex').slice(0, 24), code, category: 'security' as const, severity: result.level === 'error' ? 'high' as const : result.level === 'warning' ? 'medium' as const : 'low' as const, confidence: 0.85, source: run.tool.driver.name, analyzerVersion: 'sarif-2.1.0', message: redactSecrets(result.message.text).slice(0, 2000), location: { path, line, sha }, metadata: {} }];
  }));
}
export function exportSarif(evidence: RiskEvidence[]) {
  return { $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0', runs: [{ tool: { driver: { name: 'PRism', version: '0.1.0', informationUri: 'https://github.com' } }, results: evidence.filter(e => e.location).map(e => ({ ruleId: e.code, level: ['critical', 'high'].includes(e.severity) ? 'error' : e.severity === 'medium' ? 'warning' : 'note', message: { text: redactSecrets(e.message) }, locations: e.location ? [{ physicalLocation: { artifactLocation: { uri: e.location.path, uriBaseId: '%SRCROOT%' }, region: { startLine: e.location.line } } }] : [] })) }] };
}
