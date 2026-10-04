import type { RepositoryAnalyzer } from '@prism/domain';
import { dependencyEdges } from './dependency.js';
import { evidence } from './evidence.js';
const layers = ['shared', 'entities', 'features', 'widgets', 'pages', 'app'];
const layer = (path: string) => layers.findIndex(name => path.split('/').includes(name));
export const architectureAnalyzer: RepositoryAnalyzer = {
  name: 'architecture', version: '1',
  analyze(context) {
    if (new Set(context.snapshot.repositoryPaths.map(layer).filter(l => l >= 0)).size < 3) return [];
    const changed = new Set(context.snapshot.files.map(f => f.path));
    return dependencyEdges(context.parsed, context.snapshot.repositoryPaths)
      .filter(e => changed.has(e.from) && layer(e.from) >= 0 && layer(e.to) > layer(e.from))
      .map(e => evidence(context, 'ARCHITECTURE_VIOLATION', 'architecture', 'high', 0.85, 'Inferred FSD layering contains an upward import.', e.from, 1, { target: e.to, inferredArchitecture: 'FSD' }));
  },
};
