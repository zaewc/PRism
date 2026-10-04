import ts from 'typescript';
import type { ParsedCall, ParsedFile, ParsedSymbol, ParserAdapter, SourceFile } from '@prism/domain';

export class TypeScriptParser implements ParserAdapter {
  supports(path: string) { return /\.[cm]?[jt]sx?$/.test(path); }
  parse(file: SourceFile): ParsedFile {
    const kind = file.path.endsWith('.tsx') ? ts.ScriptKind.TSX : file.path.endsWith('.jsx') ? ts.ScriptKind.JSX : file.path.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const ast = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, kind);
    const imports: string[] = [], exports: string[] = [], symbols: ParsedSymbol[] = [], calls: ParsedCall[] = [];
    let branches = 0, unsafeAssertions = 0;
    const line = (node: ts.Node) => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    const exported = (node: ts.Node) => ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      if (ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
        if (node.exportClause && ts.isNamedExports(node.exportClause)) exports.push(...node.exportClause.elements.map(e => e.name.text));
      }
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(ast);
        const literalArguments = node.arguments.filter(ts.isStringLiteralLike).map(a => a.text);
        calls.push({ name, line: line(node), literalArguments, dynamicArguments: node.arguments.some(a => !ts.isStringLiteralLike(a) && !ts.isNumericLiteral(a) && a.kind !== ts.SyntaxKind.TrueKeyword && a.kind !== ts.SyntaxKind.FalseKeyword) });
        if ((name === 'require' || name === 'import') && literalArguments[0]) imports.push(literalArguments[0]);
      }
      if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
        const name = node.name?.text ?? 'default';
        let signature: string;
        if (ts.isFunctionDeclaration(node)) signature = `${name}(${node.parameters.map(p => p.getText(ast)).join(',')}):${node.type?.getText(ast) ?? 'inferred'}`;
        else signature = `${name}:${node.heritageClauses?.map(h => h.getText(ast)).join(';') ?? ''}:${node.members.filter(m => !ts.canHaveModifiers(m) || !ts.getModifiers(m)?.some(t => t.kind === ts.SyntaxKind.PrivateKeyword)).map(m => m.name?.getText(ast) ?? '').join(',')}`;
        symbols.push({ name, signature, line: line(node), endLine: ast.getLineAndCharacterOfPosition(node.end).line + 1, exported: exported(node), kind: ts.isClassDeclaration(node) ? 'class' : 'function' });
        if (exported(node)) exports.push(name);
      }
      if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
        const name = declaration.name.getText(ast);
        const value = declaration.initializer;
        const signature = value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? `${name}(${value.parameters.map(p => p.getText(ast)).join(',')}):${value.type?.getText(ast) ?? 'inferred'}` : `${name}:${declaration.type?.getText(ast) ?? 'inferred'}`;
        symbols.push({ name, signature, line: line(declaration), endLine: ast.getLineAndCharacterOfPosition(declaration.end).line + 1, exported: exported(node), kind: value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? 'function' : 'variable' });
        if (exported(node)) exports.push(name);
      }
      if (ts.isIfStatement(node) || ts.isConditionalExpression(node) || ts.isCaseClause(node) || ts.isForStatement(node) || ts.isWhileStatement(node) || ts.isCatchClause(node)) branches++;
      if (node.kind === ts.SyntaxKind.AnyKeyword || ts.isNonNullExpression(node)) unsafeAssertions++;
      ts.forEachChild(node, visit);
    };
    visit(ast);
    // Public parser diagnostics through a compiler host; no repository module resolution or execution.
    const host = ts.createCompilerHost({ noResolve: true, noLib: true });
    host.getSourceFile = name => name === file.path ? ast : undefined;
    const program = ts.createProgram([file.path], { noResolve: true, noLib: true, allowJs: true }, host);
    return { path: file.path, language: /\.[cm]?jsx?$/.test(file.path) ? 'JavaScript' : 'TypeScript', imports: [...new Set(imports)].sort(), exports: [...new Set(exports)].sort(), symbols, calls, branches, parseErrors: program.getSyntacticDiagnostics(ast).length, unsafeAssertions };
  }
}

export class ParserRegistry {
  constructor(private readonly adapters: ParserAdapter[] = [new TypeScriptParser()]) {}
  parse(file: SourceFile): ParsedFile | null { return this.adapters.find(a => a.supports(file.path))?.parse(file) ?? null; }
}
