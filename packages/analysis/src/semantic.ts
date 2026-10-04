import type { RepositoryAnalyzer } from '@prism/domain';
import { evidence } from './evidence.js';
export const semanticAnalyzer: RepositoryAnalyzer = {
  name: 'semantic', version: '1',
  analyze(context) {
    const result = [];
    for (const changed of context.snapshot.files.filter(f => f.status === 'removed')) {
      const before = context.baseParsed.find(p => p.path === changed.path);
      if (before?.exports.length) result.push(evidence(context, 'EXPORTED_API_CHANGED', 'breaking', 'high', 0.9, 'A source module exposing a public API was removed.', changed.path));
    }
    for (const file of context.parsed.filter(p => context.snapshot.files.some(f => f.path === p.path))) {
      const changed = context.snapshot.files.find(f => f.path === file.path);
      const before = context.baseParsed.find(p => p.path === (changed?.previousPath ?? file.path));
      if (file.parseErrors) result.push(evidence(context, 'SYNTAX_ERROR', 'bug', 'high', 1, 'The source parser reports syntax errors.', file.path, 1, { count: file.parseErrors }));
      for (const symbol of before?.symbols.filter(s => s.exported) ?? []) {
        const current = file.symbols.find(s => s.name === symbol.name && s.exported);
        if (!current || current.signature !== symbol.signature) result.push(evidence(context, 'EXPORTED_API_CHANGED', 'breaking', 'high', 0.9, 'An exported API was removed or its syntax-level signature changed.', file.path, current?.line ?? 1));
      }
      if (before?.exports.some(name => !file.exports.includes(name)) && !result.some(e => e.code === 'EXPORTED_API_CHANGED' && e.location?.path === file.path)) result.push(evidence(context, 'EXPORTED_API_CHANGED', 'breaking', 'high', 0.9, 'An exported binding or re-export was removed.', file.path));
      if (file.branches > (before?.branches ?? 0) + 5) result.push(evidence(context, 'CONTROL_FLOW_COMPLEXITY_INCREASE', 'maintainability', 'medium', 0.85, 'Control-flow branching increased substantially.', file.path, 1, { before: before?.branches ?? 0, after: file.branches }));
      if (file.unsafeAssertions > (before?.unsafeAssertions ?? 0)) result.push(evidence(context, 'TYPE_SAFETY_ESCAPE_ADDED', 'bug', 'medium', 0.85, 'A new any type or non-null assertion weakens type guarantees.', file.path));
    }
    return result;
  },
};
