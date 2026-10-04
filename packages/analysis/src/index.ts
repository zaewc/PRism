import type { AnalysisContext, RepositoryAnalyzer, RiskEvidence } from '@prism/domain';
import { securityAnalyzer } from '@prism/security';
import { diffAnalyzer } from './diff.js';
import { semanticAnalyzer } from './semantic.js';
import { dependencyAnalyzer } from './dependency.js';
import { testAnalyzer } from './tests.js';
import { architectureAnalyzer } from './architecture.js';
export { ANALYZER_VERSION, addedLines } from './evidence.js';
export { dependencyEdges, resolveImport } from './dependency.js';
export { ParserRegistry } from '@prism/parser';
export const analyzers: RepositoryAnalyzer[] = [diffAnalyzer, semanticAnalyzer, dependencyAnalyzer, testAnalyzer, securityAnalyzer, architectureAnalyzer];
export function analyzeEvidence(context: AnalysisContext): RiskEvidence[] {
  return [...new Map([...context.snapshot.externalEvidence, ...analyzers.flatMap(a => a.analyze(context))].map(e => [e.id, e])).values()].sort((a, b) => a.id.localeCompare(b.id));
}
