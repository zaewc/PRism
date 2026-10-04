import type { RepositoryAnalyzer } from '@prism/domain';
import { addedLines, evidence, isCritical, isProduction, isTest } from './evidence.js';
import { dependencyEdges } from './dependency.js';
export const testAnalyzer: RepositoryAnalyzer = {
  name: 'tests', version: '1',
  analyze(context) {
    const result = [];
    const changedTests = new Set(context.snapshot.files.filter(f => {
      if (!isTest(f.path) || f.status === 'removed' || f.additions === 0) return false;
      const changedLines = new Set(addedLines(f.patch).map(row => row.line));
      return context.parsed.find(p => p.path === f.path)?.calls.some(call => changedLines.has(call.line) && (call.name === 'expect' || call.name === 'assert' || call.name.startsWith('assert.'))) ?? false;
    }).map(f => f.path));
    const edges = dependencyEdges(context.parsed, context.snapshot.repositoryPaths);
    for (const file of context.snapshot.files.filter(f => isProduction(f.path))) {
      const stem = file.path.replace(/\.[^.]+$/, '');
      const related = [...changedTests].filter(test => test.startsWith(stem + '.test.') || test.startsWith(stem + '.spec.') || edges.some(e => e.from === test && e.to === file.path));
      if (!related.length) result.push(evidence(context, isCritical(file.path, context.policy.criticalPaths) ? 'CRITICAL_PATH_WITHOUT_TEST' : 'NO_CORRESPONDING_TEST', 'tests', isCritical(file.path, context.policy.criticalPaths) ? 'high' : 'medium', 0.9, 'No related changed test was found by module imports or colocated naming.', file.path));
    }
    for (const file of context.snapshot.files.filter(f => isTest(f.path) && f.deletions > f.additions)) result.push(evidence(context, 'TESTS_REMOVED', 'tests', 'medium', 0.9, 'Test code was reduced; verify retained behavioral coverage.', file.path));
    return result;
  },
};
