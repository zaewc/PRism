import type { NextConfig } from 'next';
import { resolve } from 'node:path';
const config: NextConfig = { reactCompiler: true, transpilePackages: ['@prism/domain', '@prism/database', '@prism/policy', '@prism/config', '@prism/ui', '@prism/application', '@prism/analysis', '@prism/parser', '@prism/security', '@prism/judge', '@prism/risk-engine', '@prism/observability'], serverExternalPackages: ['pg', '@opentelemetry/sdk-node'], turbopack: { root: resolve(process.cwd(), '../..') }, poweredByHeader: false, webpack(config) { config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'], '.mjs': ['.mts', '.mjs'], '.cjs': ['.cts', '.cjs'] }; return config; } };
export default config;
