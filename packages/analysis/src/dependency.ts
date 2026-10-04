import path from 'node:path';
import type { ParsedFile, RepositoryAnalyzer } from '@prism/domain';
import { evidence, isCritical } from './evidence.js';

export function resolveImport(from: string, specifier: string, paths: Set<string>): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  if (base.startsWith('../') || base.startsWith('/')) return null;
  const candidates = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), ...['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'].map(e => base + e)];
  return candidates.find(c => paths.has(c)) ?? null;
}
export function dependencyEdges(parsed: ParsedFile[], paths: string[]): Array<{ from: string; to: string }> {
  const all = new Set(paths);
  return parsed.flatMap(file => file.imports.flatMap(specifier => { const target = resolveImport(file.path, specifier, all); return target ? [{ from: file.path, to: target }] : []; }));
}
export const dependencyAnalyzer: RepositoryAnalyzer = {
  name: 'dependency', version: '1',
  analyze(context) {
    const result = [];
    const edges = dependencyEdges(context.parsed, context.snapshot.repositoryPaths);
    for (const file of context.snapshot.files) {
      if (/(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|go\.(mod|sum)|requirements[^/]*\.txt|pom\.xml)$/.test(file.path)) result.push(evidence(context, 'DEPENDENCY_MANIFEST_CHANGED', 'dependencies', 'medium', 0.95, 'A dependency manifest or lockfile changed.', file.path));
      const visited = new Set([file.path]);
      let frontier = [file.path];
      while (frontier.length && visited.size < 5000) {
        const next = edges.filter(e => frontier.includes(e.to) && !visited.has(e.from)).map(e => e.from);
        next.forEach(n => visited.add(n)); frontier = next;
      }
      const impacted = [...visited].filter(p => p !== file.path && isCritical(p, context.policy.criticalPaths));
      if (impacted.length) result.push(evidence(context, 'CRITICAL_DEPENDENCY_PATH', 'architecture', 'high', 0.85, 'A changed module has reverse dependency paths to critical code.', file.path, 1, { impactedFiles: impacted.sort().slice(0, 20), reachable: visited.size - 1 }));
    }
    return result;
  },
};
