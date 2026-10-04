import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import ts from 'typescript';

async function walk(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const results = await Promise.all(entries.filter(e => !['node_modules', '.next', 'dist'].includes(e.name)).map(e => e.isDirectory() ? walk(join(dir, e.name)) : Promise.resolve(/\.[cm]?[jt]sx?$/.test(e.name) ? [join(dir, e.name)] : [])));
  return results.flat();
}
const dependencies = new Map<string, Set<string>>();
const errors: string[] = [];
const layers = ['shared', 'entities', 'features', 'widgets', 'pages', 'app'];
const files = [...await walk('packages'), ...await walk('apps')];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const owner = file.startsWith('packages/') ? file.split('/')[1] : undefined;
  const imports = ast.statements.filter(ts.isImportDeclaration).flatMap(s => ts.isStringLiteral(s.moduleSpecifier) ? [s.moduleSpecifier.text] : []);
  for (const module of imports) {
    if (owner) {
      const edges = dependencies.get(owner) ?? new Set<string>();
      if (module.startsWith('@prism/')) edges.add(module.slice(7));
      dependencies.set(owner, edges);
      if (owner === 'domain' && module !== 'zod') errors.push(`${file}: domain may only import its schema library`);
      if (['risk-engine', 'policy'].includes(owner) && /github|database|bullmq|octokit|fastify|next/.test(module)) errors.push(`${file}: infrastructure dependency in core engine`);
    }
    if (file.startsWith('apps/web/src/')) {
      const current = layers.indexOf(file.split('/')[3] ?? '');
      const target = layers.findIndex(layer => module.startsWith(`@/${layer}/`));
      if (target >= 0 && current >= 0 && target > current) errors.push(`${file}: upward FSD import: ${module}`);
    }
  }
}
function visit(node: string, stack: string[]) {
  if (stack.includes(node)) { errors.push(`Circular package dependency: ${[...stack, node].join(' -> ')}`); return; }
  for (const edge of dependencies.get(node) ?? []) visit(edge, [...stack, node]);
}
for (const node of dependencies.keys()) visit(node, []);
if (errors.length) { process.stderr.write([...new Set(errors)].join('\n') + '\n'); process.exitCode = 1; }
else process.stdout.write(`Architecture checked: ${files.length} files; no package cycles or prohibited import directions.\n`);
