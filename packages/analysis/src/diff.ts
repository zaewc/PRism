import type { RepositoryAnalyzer } from '@prism/domain';
import { evidence, isCritical, isProduction } from './evidence.js';
export const diffAnalyzer: RepositoryAnalyzer = {
  name: 'diff', version: '1',
  analyze(context) {
    const result = [];
    for (const file of context.snapshot.files) {
      if (isProduction(file.path) && isCritical(file.path, context.policy.criticalPaths)) result.push(evidence(context, 'CRITICAL_PATH_CHANGED', 'bug', 'high', 0.9, 'A configured critical application path changed.', file.path));
      if (/(^|\/)auth\/|authorization|authentication/.test(file.path)) result.push(evidence(context, 'AUTHENTICATION_PATH_CHANGED', 'security', 'medium', 0.9, 'Authentication or authorization code changed; inspect behavior.', file.path));
      if (/(^|\/)(Dockerfile|docker-compose[^/]*|\.github|infra(?:structure)?|migration|migrations)(\/|$)|(^|\/)\.env/.test(file.path)) result.push(evidence(context, 'OPERATIONAL_CONFIGURATION_CHANGED', 'operational', 'medium', 0.95, 'Deployment, CI, environment or migration configuration changed.', file.path));
      if (file.binary) result.push(evidence(context, 'BINARY_CHANGE', 'maintainability', 'low', 0.99, 'Binary change cannot be inspected as source.', file.path));
      if (file.additions + file.deletions > 500) result.push(evidence(context, 'LARGE_FILE_CHANGE', 'maintainability', 'medium', 0.85, 'This file has a large review surface.', file.path, 1, { changedLines: file.additions + file.deletions }));
      if (file.status === 'removed' && isProduction(file.path)) result.push(evidence(context, 'PRODUCTION_FILE_REMOVED', 'breaking', 'medium', 0.9, 'Production source was removed.', file.path, 1));
    }
    return result;
  },
};
