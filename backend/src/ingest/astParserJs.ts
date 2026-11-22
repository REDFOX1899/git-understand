// =============================================================================
// GitUnderstand (git-understand.com) — JS/TS/TSX AST Extractor
// Fast, zero-native-dep static analyzer for .ts, .tsx, .js, .jsx, .mjs, .cjs
// =============================================================================

import ts from 'typescript';
import type { CodeSymbol } from '../../../shared/types.js';

export interface ParsedCodeSignals {
  imports: string[];
  exports: string[];
  symbols: CodeSymbol[];
  routes: string[];
  externalDeps: string[];
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']);
const EXPRESS_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'all', 'use']);
const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9_$]*$/;

/**
 * Determines the TypeScript ScriptKind from the file path.
 */
function getScriptKind(filePath: string): ts.ScriptKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (lower.endsWith('.ts')) return ts.ScriptKind.TS;
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    // JSX kind provides tolerant parsing of JSX inside .js/.mjs files
    return ts.ScriptKind.JSX;
  }
  return ts.ScriptKind.TSX;
}

/**
 * Extracts root package name for external dependency tracking.
 * Returns null for relative, absolute, or project alias paths.
 */
function extractPackageName(specifier: string): string | null {
  const trimmed = specifier.trim();
  if (
    !trimmed ||
    trimmed.startsWith('.') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('@/') ||
    trimmed.startsWith('~/') ||
    trimmed.startsWith('#')
  ) {
    return null;
  }

  // Node built-in scheme (e.g. node:path, node:fs)
  if (trimmed.startsWith('node:')) {
    return trimmed;
  }

  // Scoped package: @scope/pkg
  if (trimmed.startsWith('@')) {
    const parts = trimmed.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return trimmed;
  }

  // Standard package: pkg
  const parts = trimmed.split('/');
  return parts[0] || null;
}

/**
 * Infers Next.js route path from file path for App Router and Pages Router.
 */
function inferNextJsRoutePath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/');

  // Next.js App Router: .../app/(group)/api/users/route.ts -> /api/users
  const appMatch = normalized.match(/(?:^|\/)app\/(.+?)\/route\.[jt]sx?$/i);
  if (appMatch) {
    const segments = appMatch[1]
      .split('/')
      .filter((seg) => !(seg.startsWith('(') && seg.endsWith(')')));
    return '/' + segments.join('/');
  }

  // Next.js App Router root: .../app/route.ts -> /
  if (/(?:^|\/)app\/route\.[jt]sx?$/i.test(normalized)) {
    return '/';
  }

  // Next.js Pages Router API: .../pages/api/users/[id].ts -> /api/users/[id]
  const pagesApiMatch = normalized.match(/(?:^|\/)pages\/api\/(.+?)\.[jt]sx?$/i);
  if (pagesApiMatch) {
    let seg = pagesApiMatch[1];
    if (seg.endsWith('/index')) {
      seg = seg.slice(0, -6);
    } else if (seg === 'index') {
      seg = '';
    }
    return '/api' + (seg ? '/' + seg : '');
  }

  return null;
}

/**
 * Extracts route path string from string literal, template literal, or regex.
 */
function extractPathLiteral(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    for (const span of node.templateSpans) {
      result += ':' + (ts.isIdentifier(span.expression) ? span.expression.text : 'param');
      result += span.literal.text;
    }
    return result;
  }
  if (ts.isRegularExpressionLiteral(node)) {
    return node.text;
  }
  return null;
}

/**
 * Inspects a node subtree to detect JSX elements or fragments.
 */
function hasJsx(node: ts.Node): boolean {
  let found = false;
  function visit(child: ts.Node) {
    if (found) return;
    if (
      ts.isJsxElement(child) ||
      ts.isJsxSelfClosingElement(child) ||
      ts.isJsxFragment(child)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

/**
 * Checks if a declaration has explicit React return/type annotations.
 */
function hasReactTypeAnnotation(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    if (node.type) {
      const typeText = node.type.getText();
      if (/JSX\.Element|ReactNode|ReactElement/i.test(typeText)) {
        return true;
      }
    }
  }
  if (ts.isVariableDeclaration(node) && node.type) {
    const typeText = node.type.getText();
    if (/FC|FunctionComponent|ComponentType|JSX\.Element|ReactNode|ReactElement/i.test(typeText)) {
      return true;
    }
  }
  return false;
}

/**
 * Extracts a concise single-line or clean signature for CodeSymbol.
 */
function extractSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  const fullText = node.getText(sourceFile).trim();

  if (ts.isFunctionDeclaration(node)) {
    if (node.body) {
      const sigLength = node.body.getStart(sourceFile) - node.getStart(sourceFile);
      if (sigLength > 0) {
        return fullText.slice(0, sigLength).replace(/\s+/g, ' ').trim();
      }
    }
  } else if (ts.isMethodDeclaration(node)) {
    if (node.body) {
      const sigLength = node.body.getStart(sourceFile) - node.getStart(sourceFile);
      if (sigLength > 0) {
        return fullText.slice(0, sigLength).replace(/\s+/g, ' ').trim();
      }
    }
  } else if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    const braceIndex = fullText.indexOf('{');
    if (braceIndex > 0) {
      return fullText.slice(0, braceIndex).replace(/\s+/g, ' ').trim();
    }
  } else if (ts.isTypeAliasDeclaration(node)) {
    return fullText.replace(/;?$/, '').replace(/\s+/g, ' ').trim();
  } else if (ts.isVariableDeclaration(node)) {
    if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      const arrowIndex = fullText.indexOf('=>');
      if (arrowIndex > 0) {
        return fullText.slice(0, arrowIndex + 2).replace(/\s+/g, ' ').trim();
      }
      const braceIndex = fullText.indexOf('{');
      if (braceIndex > 0) {
        return fullText.slice(0, braceIndex).replace(/\s+/g, ' ').trim();
      }
    }
  }

  // Fallback: first line, max 160 characters
  const firstLine = fullText.split('\n')[0] || fullText;
  return firstLine.slice(0, 160).replace(/\s+/g, ' ').trim();
}

/**
 * Checks if a declaration has the export modifier.
 */
function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

/**
 * Checks if a declaration has the default modifier.
 */
function hasDefaultModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
}

/**
 * Parses a JS/TS/TSX/JSX/MJS/CJS source file and extracts rich architectural code signals.
 */
export function parseJsTsFile(filePath: string, content: string): ParsedCodeSignals {
  const importsSet = new Set<string>();
  const exportsSet = new Set<string>();
  const externalDepsSet = new Set<string>();
  const routesSet = new Set<string>();
  const symbols: CodeSymbol[] = [];

  if (!content || !content.trim()) {
    return {
      imports: [],
      exports: [],
      symbols: [],
      routes: [],
      externalDeps: [],
    };
  }

  const scriptKind = getScriptKind(filePath);
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true, // setParentNodes
      scriptKind
    );
  } catch {
    // If TypeScript parser fails catastrophically, return clean empty signals
    return {
      imports: [],
      exports: [],
      symbols: [],
      routes: [],
      externalDeps: [],
    };
  }

  const nextJsRoutePath = inferNextJsRoutePath(filePath);

  // Track explicitly exported identifiers
  const reExportedIdentifiers = new Set<string>();

  // Pass 1: Collect import statements, export declarations, and re-exports
  function collectImportsAndExports(node: ts.Node) {
    // Static ES import declarations: import ... from '...'
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        importsSet.add(specifier);
        const dep = extractPackageName(specifier);
        if (dep) externalDepsSet.add(dep);
      }
    }
    // TypeScript import equals declaration: import x = require('...')
    else if (ts.isImportEqualsDeclaration(node)) {
      if (
        ts.isExternalModuleReference(node.moduleReference) &&
        ts.isStringLiteral(node.moduleReference.expression)
      ) {
        const specifier = node.moduleReference.expression.text;
        importsSet.add(specifier);
        const dep = extractPackageName(specifier);
        if (dep) externalDepsSet.add(dep);
      }
    }
    // Static ES export ... from '...' and export { ... }
    else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        importsSet.add(specifier);
        const dep = extractPackageName(specifier);
        if (dep) externalDepsSet.add(dep);
      }

      if (node.exportClause) {
        if (ts.isNamedExports(node.exportClause)) {
          for (const elem of node.exportClause.elements) {
            const exportedName = elem.name.text;
            exportsSet.add(exportedName);
            const originalName = elem.propertyName ? elem.propertyName.text : exportedName;
            reExportedIdentifiers.add(originalName);
          }
        } else if (ts.isNamespaceExport(node.exportClause)) {
          exportsSet.add(node.exportClause.name.text);
        }
      } else if (node.moduleSpecifier) {
        // export * from '...'
        exportsSet.add('*');
      }
    }
    // Export assignment: export default expr or export = expr
    else if (ts.isExportAssignment(node)) {
      exportsSet.add('default');
      if (ts.isIdentifier(node.expression)) {
        reExportedIdentifiers.add(node.expression.text);
        exportsSet.add(node.expression.text);
      }
    }
    // Dynamic import('...') and CommonJS require('...')
    else if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
          const specifier = arg.text;
          importsSet.add(specifier);
          const dep = extractPackageName(specifier);
          if (dep) externalDepsSet.add(dep);
        }
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
          const specifier = arg.text;
          importsSet.add(specifier);
          const dep = extractPackageName(specifier);
          if (dep) externalDepsSet.add(dep);
        }
      }
    }
    // CommonJS exports detection (module.exports / exports.*)
    else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const left = node.left;
      if (ts.isPropertyAccessExpression(left)) {
        // exports.foo = ...
        if (ts.isIdentifier(left.expression) && left.expression.text === 'exports') {
          exportsSet.add(left.name.text);
        }
        // module.exports.foo = ...
        else if (
          ts.isPropertyAccessExpression(left.expression) &&
          ts.isIdentifier(left.expression.expression) &&
          left.expression.expression.text === 'module' &&
          left.expression.name.text === 'exports'
        ) {
          exportsSet.add(left.name.text);
        }
        // module.exports = ...
        else if (
          ts.isIdentifier(left.expression) &&
          left.expression.text === 'module' &&
          left.name.text === 'exports'
        ) {
          if (ts.isObjectLiteralExpression(node.right)) {
            for (const prop of node.right.properties) {
              if (prop.name && ts.isIdentifier(prop.name)) {
                exportsSet.add(prop.name.text);
              }
            }
          } else {
            exportsSet.add('default');
          }
        }
      }
    }

    ts.forEachChild(node, collectImportsAndExports);
  }

  collectImportsAndExports(sourceFile);

  // Pass 2: Extract CodeSymbols, React components, and HTTP routes
  function extractSymbolsAndRoutes(node: ts.Node) {
    const startPos = node.getStart(sourceFile);
    const endPos = node.getEnd();
    const line = sourceFile.getLineAndCharacterOfPosition(startPos).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(endPos).line + 1;

    // 1. Function declarations
    if (ts.isFunctionDeclaration(node)) {
      const isExport = hasExportModifier(node);
      const isDefault = hasDefaultModifier(node);
      const rawName = node.name ? node.name.text : isDefault ? 'default' : '';

      if (rawName) {
        const exported = isExport || isDefault || reExportedIdentifiers.has(rawName);
        if (exported) {
          exportsSet.add(rawName);
          if (isDefault) exportsSet.add('default');
        }

        // Check for Next.js App Router HTTP handlers: export async function GET()
        if (exported && HTTP_METHODS.has(rawName.toUpperCase())) {
          const method = rawName.toUpperCase();
          const routeStr = nextJsRoutePath ? `${method} ${nextJsRoutePath}` : method;
          routesSet.add(routeStr);
          symbols.push({
            name: routeStr,
            kind: 'route',
            line,
            endLine,
            exported: true,
            signature: extractSignature(node, sourceFile),
          });
          return;
        }

        // Check for Next.js Pages Router API route: export default function handler()
        if (isDefault && nextJsRoutePath && nextJsRoutePath.startsWith('/api')) {
          const routeStr = `ALL ${nextJsRoutePath}`;
          routesSet.add(routeStr);
          symbols.push({
            name: routeStr,
            kind: 'route',
            line,
            endLine,
            exported: true,
            signature: extractSignature(node, sourceFile),
          });
          return;
        }

        // Check if React component
        const isComp = PASCAL_CASE_RE.test(rawName) && (hasJsx(node) || hasReactTypeAnnotation(node));
        symbols.push({
          name: rawName,
          kind: isComp ? 'component' : 'function',
          line,
          endLine,
          exported,
          signature: extractSignature(node, sourceFile),
        });
      }
      return;
    }

    // 2. Class declarations
    if (ts.isClassDeclaration(node)) {
      const isExport = hasExportModifier(node);
      const isDefault = hasDefaultModifier(node);
      const rawName = node.name ? node.name.text : isDefault ? 'default' : '';

      if (rawName) {
        const exported = isExport || isDefault || reExportedIdentifiers.has(rawName);
        if (exported) {
          exportsSet.add(rawName);
          if (isDefault) exportsSet.add('default');
        }

        // Check if React class component
        const isComp = PASCAL_CASE_RE.test(rawName) && hasJsx(node);
        symbols.push({
          name: rawName,
          kind: isComp ? 'component' : 'class',
          line,
          endLine,
          exported,
          signature: extractSignature(node, sourceFile),
        });

        // Extract class methods
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
            const mStart = member.getStart(sourceFile);
            const mEnd = member.getEnd();
            const mLine = sourceFile.getLineAndCharacterOfPosition(mStart).line + 1;
            const mEndLine = sourceFile.getLineAndCharacterOfPosition(mEnd).line + 1;
            symbols.push({
              name: `${rawName}.${member.name.text}`,
              kind: 'method',
              line: mLine,
              endLine: mEndLine,
              exported,
              signature: extractSignature(member, sourceFile),
            });
          }
        }
      }
      return;
    }

    // 3. Interface declarations
    if (ts.isInterfaceDeclaration(node)) {
      const isExport = hasExportModifier(node);
      const name = node.name.text;
      const exported = isExport || reExportedIdentifiers.has(name);
      if (exported) exportsSet.add(name);

      symbols.push({
        name,
        kind: 'interface',
        line,
        endLine,
        exported,
        signature: extractSignature(node, sourceFile),
      });
      return;
    }

    // 4. Type alias declarations
    if (ts.isTypeAliasDeclaration(node)) {
      const isExport = hasExportModifier(node);
      const name = node.name.text;
      const exported = isExport || reExportedIdentifiers.has(name);
      if (exported) exportsSet.add(name);

      symbols.push({
        name,
        kind: 'type',
        line,
        endLine,
        exported,
        signature: extractSignature(node, sourceFile),
      });
      return;
    }

    // 5. Enum declarations
    if (ts.isEnumDeclaration(node)) {
      const isExport = hasExportModifier(node);
      const name = node.name.text;
      const exported = isExport || reExportedIdentifiers.has(name);
      if (exported) exportsSet.add(name);

      symbols.push({
        name,
        kind: 'type',
        line,
        endLine,
        exported,
        signature: extractSignature(node, sourceFile),
      });
      return;
    }

    // 6. Module / Namespace declarations
    if (ts.isModuleDeclaration(node)) {
      const isExport = hasExportModifier(node);
      const name = node.name.text;
      const exported = isExport || reExportedIdentifiers.has(name);
      if (exported) exportsSet.add(name);

      symbols.push({
        name,
        kind: 'module',
        line,
        endLine,
        exported,
        signature: extractSignature(node, sourceFile),
      });
      // Continue traversing inside namespace
      ts.forEachChild(node, extractSymbolsAndRoutes);
      return;
    }

    // 7. Variable statements (const / let / var)
    if (ts.isVariableStatement(node)) {
      const isExport = hasExportModifier(node);

      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const varName = decl.name.text;
          const exported = isExport || reExportedIdentifiers.has(varName);
          if (exported) exportsSet.add(varName);

          const dStart = decl.getStart(sourceFile);
          const dEnd = decl.getEnd();
          const dLine = sourceFile.getLineAndCharacterOfPosition(dStart).line + 1;
          const dEndLine = sourceFile.getLineAndCharacterOfPosition(dEnd).line + 1;

          // Check for Next.js App Router route: export const GET = async (...) => ...
          if (exported && HTTP_METHODS.has(varName.toUpperCase())) {
            const method = varName.toUpperCase();
            const routeStr = nextJsRoutePath ? `${method} ${nextJsRoutePath}` : method;
            routesSet.add(routeStr);
            symbols.push({
              name: routeStr,
              kind: 'route',
              line: dLine,
              endLine: dEndLine,
              exported: true,
              signature: extractSignature(decl, sourceFile),
            });
            continue;
          }

          // Check if function or arrow const
          const isFunc =
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer));

          if (isFunc) {
            const isComp =
              PASCAL_CASE_RE.test(varName) &&
              (hasJsx(decl) || hasReactTypeAnnotation(decl));

            symbols.push({
              name: varName,
              kind: isComp ? 'component' : 'function',
              line: dLine,
              endLine: dEndLine,
              exported,
              signature: extractSignature(decl, sourceFile),
            });
          } else {
            // General const / let / var
            symbols.push({
              name: varName,
              kind: 'const',
              line: dLine,
              endLine: dEndLine,
              exported,
              signature: extractSignature(decl, sourceFile),
            });
          }
        }
      }
      return;
    }

    // 8. Standalone ExportAssignment for anonymous default components or routes
    if (ts.isExportAssignment(node)) {
      const expr = node.expression;
      if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
        if (nextJsRoutePath && nextJsRoutePath.startsWith('/api')) {
          const routeStr = `ALL ${nextJsRoutePath}`;
          routesSet.add(routeStr);
          symbols.push({
            name: routeStr,
            kind: 'route',
            line,
            endLine,
            exported: true,
            signature: extractSignature(node, sourceFile),
          });
        } else {
          const isComp = hasJsx(expr);
          symbols.push({
            name: 'default',
            kind: isComp ? 'component' : 'function',
            line,
            endLine,
            exported: true,
            signature: extractSignature(node, sourceFile),
          });
        }
      }
    }

    // 9. Express / Fastify / Router routes
    // e.g. app.get('/api/users', ...), router.post('/login', ...), app.route('/path').get(...)
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text.toLowerCase();

      if (EXPRESS_METHODS.has(methodName)) {
        let routePath: string | null = null;

        // Pattern A: app.get('/api/users', handler)
        if (node.arguments.length > 0) {
          routePath = extractPathLiteral(node.arguments[0]);
        }

        // Pattern B: app.route('/api/users').get(handler)
        if (!routePath) {
          let curr = node.expression.expression;
          while (ts.isCallExpression(curr)) {
            if (
              ts.isPropertyAccessExpression(curr.expression) &&
              curr.expression.name.text === 'route'
            ) {
              if (curr.arguments.length > 0) {
                routePath = extractPathLiteral(curr.arguments[0]);
              }
              break;
            }
            if (ts.isCallExpression(curr.expression)) {
              curr = curr.expression;
            } else if (
              ts.isPropertyAccessExpression(curr.expression) &&
              ts.isCallExpression(curr.expression.expression)
            ) {
              curr = curr.expression.expression;
            } else {
              break;
            }
          }
        }

        // For 'use', only treat as route if it specifies a mount path starting with '/'
        if (methodName === 'use' && (!routePath || !routePath.startsWith('/'))) {
          routePath = null;
        }

        if (routePath) {
          const formattedMethod = methodName.toUpperCase();
          const routeStr = `${formattedMethod} ${routePath}`;
          routesSet.add(routeStr);
          symbols.push({
            name: routeStr,
            kind: 'route',
            line,
            endLine,
            exported: false,
            signature: extractSignature(node, sourceFile),
          });
        }
      }
      // Pattern C: Fastify fastify.route({ method: 'GET', url: '/path' })
      else if (methodName === 'route' && node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (ts.isObjectLiteralExpression(arg)) {
          const fastifyMethods: string[] = [];
          let fastifyUrl: string | null = null;

          for (const prop of arg.properties) {
            if (ts.isPropertyAssignment(prop) && prop.name && ts.isIdentifier(prop.name)) {
              const propKey = prop.name.text.toLowerCase();
              if (propKey === 'method' || propKey === 'methods') {
                if (
                  ts.isStringLiteral(prop.initializer) ||
                  ts.isNoSubstitutionTemplateLiteral(prop.initializer)
                ) {
                  fastifyMethods.push(prop.initializer.text.toUpperCase());
                } else if (ts.isArrayLiteralExpression(prop.initializer)) {
                  for (const elem of prop.initializer.elements) {
                    if (ts.isStringLiteral(elem) || ts.isNoSubstitutionTemplateLiteral(elem)) {
                      fastifyMethods.push(elem.text.toUpperCase());
                    }
                  }
                }
              } else if (propKey === 'url' || propKey === 'path') {
                fastifyUrl = extractPathLiteral(prop.initializer);
              }
            }
          }

          if (fastifyUrl && fastifyMethods.length > 0) {
            for (const fMethod of fastifyMethods) {
              const routeStr = `${fMethod} ${fastifyUrl}`;
              routesSet.add(routeStr);
              symbols.push({
                name: routeStr,
                kind: 'route',
                line,
                endLine,
                exported: false,
                signature: extractSignature(node, sourceFile),
              });
            }
          }
        }
      }
    }

    ts.forEachChild(node, extractSymbolsAndRoutes);
  }

  extractSymbolsAndRoutes(sourceFile);

  // Sort symbols deterministically by 1-based line number ascending
  symbols.sort((a, b) => a.line - b.line);

  return {
    imports: Array.from(importsSet),
    exports: Array.from(exportsSet),
    symbols,
    routes: Array.from(routesSet),
    externalDeps: Array.from(externalDepsSet),
  };
}
