// =============================================================================
// GitUnderstand (git-understand.com) — Multi-Language AST Extractor
// Agent 09: Multi-language AST symbol, import, export, route, and dependency extractor
// Supports Go, Rust, Java, Kotlin, C/C++, SQL, GraphQL, Dockerfile, manifests
// (package.json, pyproject.toml, Cargo.toml, go.mod, YAML/JSON), plus universal fallbacks.
// =============================================================================

import type { CodeSymbol } from '../../../shared/types.js';

// Sibling parsers (Agent 07 & Agent 08)
import { parseJsTsFile } from './astParserJs.js';
import { parsePythonFile } from './astParserPy.js';

export interface ExtractedFileSignals {
  imports: string[];
  exports: string[];
  symbols: CodeSymbol[];
  routes: string[];
  externalDeps: string[];
}

// -----------------------------------------------------------------------------
// Line offset helper for accurate line numbers (1-based)
// -----------------------------------------------------------------------------

function buildLineOffsets(content: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

function getLineNumber(offsets: number[], charIndex: number): number {
  if (charIndex <= 0) return 1;
  let low = 0;
  let high = offsets.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (offsets[mid] <= charIndex) {
      if (mid === offsets.length - 1 || offsets[mid + 1] > charIndex) {
        return mid + 1;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return 1;
}

function sanitizeSignals(signals: Partial<ExtractedFileSignals>): ExtractedFileSignals {
  return {
    imports: Array.from(new Set((signals.imports || []).map((s) => s.trim()).filter(Boolean))),
    exports: Array.from(new Set((signals.exports || []).map((s) => s.trim()).filter(Boolean))),
    symbols: signals.symbols || [],
    routes: Array.from(new Set((signals.routes || []).map((s) => s.trim()).filter(Boolean))),
    externalDeps: Array.from(new Set((signals.externalDeps || []).map((s) => s.trim()).filter(Boolean))),
  };
}

// -----------------------------------------------------------------------------
// Language Normalization & Detection
// -----------------------------------------------------------------------------

function getBasename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || '';
}

function getExtension(filePath: string): string {
  const base = getBasename(filePath);
  const dotIdx = base.lastIndexOf('.');
  return dotIdx >= 0 ? base.slice(dotIdx).toLowerCase() : '';
}

export function normalizeLanguage(filePath: string, language: string): string {
  const base = getBasename(filePath).toLowerCase();
  const ext = getExtension(filePath);

  // Exact manifest basenames take priority over generic language tags
  if (base === 'package.json') return 'manifest:package.json';
  if (base === 'pyproject.toml') return 'manifest:pyproject.toml';
  if (base === 'cargo.toml') return 'manifest:cargo.toml';
  if (base === 'go.mod') return 'manifest:go.mod';
  if (base === 'dockerfile' || base.startsWith('dockerfile.') || base === 'containerfile') return 'dockerfile';
  if (base.endsWith('.dockerfile')) return 'dockerfile';

  const lang = (language || '').trim().toLowerCase();
  if (lang) {
    if (lang === 'package.json') return 'manifest:package.json';
    if (lang === 'pyproject.toml' || lang === 'pyproject') return 'manifest:pyproject.toml';
    if (lang === 'cargo.toml' || lang === 'cargotoml') return 'manifest:cargo.toml';
    if (lang === 'go.mod' || lang === 'gomod') return 'manifest:go.mod';
    if (lang === 'js' || lang === 'jsx' || lang === 'javascript') return 'javascript';
    if (lang === 'ts' || lang === 'tsx' || lang === 'typescript') return 'typescript';
    if (lang === 'py' || lang === 'python') return 'python';
    if (lang === 'golang' || lang === 'go') return 'go';
    if (lang === 'rs' || lang === 'rust') return 'rust';
    if (lang === 'java') return 'java';
    if (lang === 'kt' || lang === 'kotlin') return 'kotlin';
    if (lang === 'c') return 'c';
    if (lang === 'cpp' || lang === 'c++' || lang === 'cxx' || lang === 'cc') return 'cpp';
    if (lang === 'sql') return 'sql';
    if (lang === 'graphql' || lang === 'gql') return 'graphql';
    if (lang === 'dockerfile' || lang === 'docker') return 'dockerfile';
    if (lang === 'json') return 'json';
    if (lang === 'toml') return 'toml';
    if (lang === 'yaml' || lang === 'yml') return 'yaml';
    return lang;
  }

  switch (ext) {
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.ts':
    case '.tsx':
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.py':
    case '.pyi':
    case '.pyw':
      return 'python';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.java':
      return 'java';
    case '.kt':
    case '.kts':
      return 'kotlin';
    case '.c':
    case '.h':
      return 'c';
    case '.cpp':
    case '.hpp':
    case '.cc':
    case '.hh':
    case '.cxx':
    case '.hxx':
    case '.c++':
    case '.h++':
      return 'cpp';
    case '.sql':
      return 'sql';
    case '.graphql':
    case '.gql':
      return 'graphql';
    case '.json':
      return 'json';
    case '.toml':
      return 'toml';
    case '.yaml':
    case '.yml':
      return 'yaml';
    case '.rb':
      return 'ruby';
    case '.php':
      return 'php';
    case '.cs':
      return 'csharp';
    case '.swift':
      return 'swift';
    case '.dart':
      return 'dart';
    case '.sh':
    case '.bash':
    case '.zsh':
      return 'shell';
    default:
      return 'unknown';
  }
}

function isJsTs(filePath: string, normLang: string): boolean {
  if (normLang === 'javascript' || normLang === 'typescript') return true;
  const ext = getExtension(filePath);
  return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'].includes(ext);
}

function isPython(filePath: string, normLang: string): boolean {
  if (normLang === 'python') return true;
  const ext = getExtension(filePath);
  return ['.py', '.pyi', '.pyw'].includes(ext);
}

// -----------------------------------------------------------------------------
// 1. Go AST Extractor (.go)
// -----------------------------------------------------------------------------

function parseGo(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  // Package declaration
  const pkgMatch = content.match(/^package\s+([a-zA-Z0-9_]+)/m);
  if (pkgMatch && pkgMatch.index !== undefined) {
    const pkgName = pkgMatch[1];
    symbols.push({
      name: pkgName,
      kind: 'module',
      line: getLineNumber(offsets, pkgMatch.index),
      exported: true,
      signature: `package ${pkgName}`,
    });
    exports.push(pkgName);
  }

  // Single import: import [alias] "path"
  const singleImportRegex = /^\s*import\s+(?:([a-zA-Z0-9_.]+|\.)\s+)?"([^"]+)"/gm;
  let match: RegExpExecArray | null;
  while ((match = singleImportRegex.exec(content)) !== null) {
    const importPath = match[2];
    imports.push(importPath);
    handleGoExternalDep(importPath, externalDeps);
  }

  // Grouped import: import ( ... )
  const groupImportRegex = /^\s*import\s*\(([\s\S]*?)\)/gm;
  while ((match = groupImportRegex.exec(content)) !== null) {
    const block = match[1];
    const lineRegex = /(?:([a-zA-Z0-9_.]+|\.)\s+)?"([^"]+)"/g;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = lineRegex.exec(block)) !== null) {
      const importPath = lineMatch[2];
      imports.push(importPath);
      handleGoExternalDep(importPath, externalDeps);
    }
  }

  // Functions: func FunctionName(...) ...
  const funcRegex = /^func\s+([a-zA-Z0-9_]+)\s*(\([^)]*\)[^{]*)/gm;
  while ((match = funcRegex.exec(content)) !== null) {
    const name = match[1];
    const sigParams = match[2].trim();
    const isExported = /^[A-Z]/.test(name);
    symbols.push({
      name,
      kind: 'function',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `func ${name}${sigParams}`,
    });
    if (isExported) exports.push(name);
  }

  // Methods: func (r *Receiver) MethodName(...) ...
  const methodRegex = /^func\s*\(\s*(?:[a-zA-Z0-9_]+\s+)?\*?([a-zA-Z0-9_]+)\s*\)\s*([a-zA-Z0-9_]+)\s*(\([^)]*\)[^{]*)/gm;
  while ((match = methodRegex.exec(content)) !== null) {
    const receiver = match[1];
    const methodName = match[2];
    const sigParams = match[3].trim();
    const fullName = `${receiver}.${methodName}`;
    const isExported = /^[A-Z]/.test(methodName);
    symbols.push({
      name: fullName,
      kind: 'method',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `func (${receiver}) ${methodName}${sigParams}`,
    });
    if (isExported) exports.push(fullName);
  }

  // Structs & Interfaces: type Name struct / interface
  const typeRegex = /^type\s+([A-Za-z0-9_]+)\s+(struct|interface)\s*\{/gm;
  while ((match = typeRegex.exec(content)) !== null) {
    const name = match[1];
    const kind = match[2] === 'struct' ? 'class' : 'interface';
    const isExported = /^[A-Z]/.test(name);
    symbols.push({
      name,
      kind,
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `type ${name} ${match[2]}`,
    });
    if (isExported) exports.push(name);
  }

  // Type aliases: type Name UnderlyingType
  const aliasRegex = /^type\s+([A-Za-z0-9_]+)\s+([A-Za-z0-9_\[\].*]+)(?:\s|$)/gm;
  while ((match = aliasRegex.exec(content)) !== null) {
    const name = match[1];
    if (name === 'struct' || name === 'interface') continue;
    const isExported = /^[A-Z]/.test(name);
    symbols.push({
      name,
      kind: 'type',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `type ${name} ${match[2]}`,
    });
    if (isExported) exports.push(name);
  }

  // Constants & Variables
  const constRegex = /^(?:const|var)\s+([A-Za-z0-9_]+)\s*(?:[a-zA-Z0-9_\[\].*]+)?\s*=/gm;
  while ((match = constRegex.exec(content)) !== null) {
    const name = match[1];
    const isExported = /^[A-Z]/.test(name);
    symbols.push({
      name,
      kind: 'const',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
    });
    if (isExported) exports.push(name);
  }

  // Common Go HTTP router endpoints (Gin, Echo, Fiber, Chi, net/http, Gorilla Mux)
  const routeRegex = /\b(?:router|r|e|app|v\d+|api|g|group|mux)\.(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|Handle|HandleFunc|Route)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  while ((match = routeRegex.exec(content)) !== null) {
    const verb = match[1].toUpperCase();
    const routePath = match[2];
    const routeLabel = verb === 'HANDLE' || verb === 'HANDLEFUNC' || verb === 'ROUTE'
      ? routePath
      : `${verb} ${routePath}`;
    routes.push(routeLabel);
    symbols.push({
      name: routeLabel,
      kind: 'route',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: match[0],
    });
  }

  // net/http standard library routes
  const httpRouteRegex = /http\.(?:HandleFunc|Handle)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while ((match = httpRouteRegex.exec(content)) !== null) {
    const routePath = match[1];
    routes.push(routePath);
    symbols.push({
      name: routePath,
      kind: 'route',
      line: getLineNumber(offsets, match.index),
      exported: true,
    });
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

function handleGoExternalDep(importPath: string, externalDeps: string[]) {
  // Check if domain-like (e.g. github.com/gin-gonic/gin/binding)
  if (importPath.includes('.') && !importPath.startsWith('./') && !importPath.startsWith('../')) {
    const segments = importPath.split('/');
    if (segments.length >= 3) {
      // e.g. github.com/owner/repo
      externalDeps.push(`${segments[0]}/${segments[1]}/${segments[2]}`);
    } else {
      externalDeps.push(importPath);
    }
  }
}

// -----------------------------------------------------------------------------
// 2. Rust AST Extractor (.rs)
// -----------------------------------------------------------------------------

function parseRust(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  // Modules: mod name; or pub mod name;
  const modRegex = /^(pub(?:\([^)]+\))?\s+)?mod\s+([a-zA-Z0-9_]+)\s*[{;]/gm;
  let match: RegExpExecArray | null;
  while ((match = modRegex.exec(content)) !== null) {
    const isExported = Boolean(match[1]);
    const name = match[2];
    symbols.push({
      name,
      kind: 'module',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `mod ${name}`,
    });
    if (isExported) exports.push(name);
  }

  // use statements: use path::to::Item;
  const useRegex = /^(pub(?:\([^)]+\))?\s+)?use\s+([^;]+);/gm;
  while ((match = useRegex.exec(content)) !== null) {
    const isExported = Boolean(match[1]);
    const rawUse = match[2].trim();
    imports.push(rawUse);

    // Extract root crate
    const rootCrate = rawUse.split('::')[0].trim();
    const internalRoots = ['std', 'core', 'alloc', 'crate', 'super', 'self'];
    if (rootCrate && !internalRoots.includes(rootCrate)) {
      externalDeps.push(rootCrate);
    }

    if (isExported) {
      // Extract exported symbol name if simple
      const lastSegment = rawUse.split('::').pop()?.replace(/[{}\s]/g, '') || '';
      if (lastSegment && lastSegment !== '*') {
        exports.push(lastSegment);
      }
    }
  }

  // extern crate name;
  const externRegex = /extern\s+crate\s+([a-zA-Z0-9_]+);/g;
  while ((match = externRegex.exec(content)) !== null) {
    const crateName = match[1];
    imports.push(crateName);
    externalDeps.push(crateName);
  }

  // Structs: (pub ...)? struct Name
  const structRegex = /^(pub(?:\([^)]+\))?\s+)?struct\s+([a-zA-Z0-9_]+)/gm;
  while ((match = structRegex.exec(content)) !== null) {
    const isExported = Boolean(match[1]);
    const name = match[2];
    symbols.push({
      name,
      kind: 'class',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `struct ${name}`,
    });
    if (isExported) exports.push(name);
  }

  // Enums: (pub ...)? enum Name
  const enumRegex = /^(pub(?:\([^)]+\))?\s+)?enum\s+([a-zA-Z0-9_]+)/gm;
  while ((match = enumRegex.exec(content)) !== null) {
    const isExported = Boolean(match[1]);
    const name = match[2];
    symbols.push({
      name,
      kind: 'type',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `enum ${name}`,
    });
    if (isExported) exports.push(name);
  }

  // Traits: (pub ...)? trait Name
  const traitRegex = /^(pub(?:\([^)]+\))?\s+)?trait\s+([a-zA-Z0-9_]+)/gm;
  while ((match = traitRegex.exec(content)) !== null) {
    const isExported = Boolean(match[1]);
    const name = match[2];
    symbols.push({
      name,
      kind: 'interface',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `trait ${name}`,
    });
    if (isExported) exports.push(name);
  }

  // Type aliases: (pub ...)? type Name = ...
  const typeRegex = /^(pub(?:\([^)]+\))?\s+)?type\s+([a-zA-Z0-9_]+)/gm;
  while ((match = typeRegex.exec(content)) !== null) {
    const isExported = Boolean(match[1]);
    const name = match[2];
    symbols.push({
      name,
      kind: 'type',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `type ${name}`,
    });
    if (isExported) exports.push(name);
  }

  // Constants & Statics
  const constRegex = /^(pub(?:\([^)]+\))?\s+)?(?:const|static)\s+([a-zA-Z0-9_]+)/gm;
  while ((match = constRegex.exec(content)) !== null) {
    const isExported = Boolean(match[1]);
    const name = match[2];
    symbols.push({
      name,
      kind: 'const',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
    });
    if (isExported) exports.push(name);
  }

  // Functions: (pub ...)? (async ...)? fn name(...)
  const fnRegex = /^(pub(?:\([^)]+\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]+"\s+)?fn\s+([a-zA-Z0-9_]+)\s*(?:<[^>]+>)?\s*(\([^)]*\)[^{;]*)/gm;
  while ((match = fnRegex.exec(content)) !== null) {
    const isExported = Boolean(match[1]);
    const name = match[2];
    const sig = match[3].trim();
    symbols.push({
      name,
      kind: 'function',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `fn ${name}${sig}`,
    });
    if (isExported) exports.push(name);
  }

  // Impl blocks: impl Trait for Target or impl Target
  const implRegex = /^impl(?:<[^>]+>)?\s+(?:([a-zA-Z0-9_:]+)\s+for\s+)?([a-zA-Z0-9_:]+)/gm;
  while ((match = implRegex.exec(content)) !== null) {
    const trait = match[1];
    const target = match[2];
    const label = trait ? `${trait} for ${target}` : target;
    symbols.push({
      name: `impl ${label}`,
      kind: 'class',
      line: getLineNumber(offsets, match.index),
      exported: false,
      signature: match[0].trim(),
    });
  }

  // Actix-web / Rocket route macros: #[get("/path")] or #[post("/path")]
  const actixRouteRegex = /#\[(?:actix_web::)?(get|post|put|delete|patch|head|options)\s*\(\s*["']([^"']+)["']\s*\)\]/gi;
  while ((match = actixRouteRegex.exec(content)) !== null) {
    const verb = match[1].toUpperCase();
    const routePath = match[2];
    const label = `${verb} ${routePath}`;
    routes.push(label);
    symbols.push({
      name: label,
      kind: 'route',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: match[0],
    });
  }

  // Axum route handlers: .route("/path", get(handler))
  const axumRouteRegex = /\.route\s*\(\s*["']([^"']+)["']\s*,\s*(get|post|put|delete|patch)/gi;
  while ((match = axumRouteRegex.exec(content)) !== null) {
    const routePath = match[1];
    const verb = match[2].toUpperCase();
    const label = `${verb} ${routePath}`;
    routes.push(label);
    symbols.push({
      name: label,
      kind: 'route',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: match[0],
    });
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

// -----------------------------------------------------------------------------
// 3. Java & Kotlin AST Extractor (.java, .kt)
// -----------------------------------------------------------------------------

function parseJava(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  // Package
  const pkgMatch = content.match(/^package\s+([a-zA-Z0-9_.]+);/m);
  if (pkgMatch && pkgMatch.index !== undefined) {
    const pkg = pkgMatch[1];
    symbols.push({
      name: pkg,
      kind: 'module',
      line: getLineNumber(offsets, pkgMatch.index),
      exported: true,
      signature: `package ${pkg};`,
    });
    exports.push(pkg);
  }

  // Imports
  const importRegex = /^import\s+(?:static\s+)?([a-zA-Z0-9_.]+)(?:\.\*)?;/gm;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const imp = match[1];
    imports.push(imp);
    handleJvmExternalDep(imp, externalDeps);
  }

  // Class, Record, Interface, Enum
  const classRegex = /^(?:[\t ]*)(?:@[\w()]+\s+)*(public|protected|private)?\s*(?:abstract|final|sealed|non-sealed|static)?\s*(class|record|interface|enum)\s+([A-Za-z0-9_]+)/gm;
  while ((match = classRegex.exec(content)) !== null) {
    const vis = match[1] || 'package';
    const rawKind = match[2];
    const name = match[3];
    const isExported = vis === 'public' || vis === 'protected';
    let kind: CodeSymbol['kind'] = 'class';
    if (rawKind === 'interface') kind = 'interface';
    if (rawKind === 'enum') kind = 'type';

    symbols.push({
      name,
      kind,
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `${vis} ${rawKind} ${name}`,
    });
    if (isExported) exports.push(name);
  }

  // Methods
  const methodRegex = /^(?:[\t ]*)(?:@[\w()]+\s+)*(public|protected|private)?\s*(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:<[^>]+>\s+)?([a-zA-Z0-9_<>[\]]+)\s+([a-zA-Z0-9_]+)\s*(\([^)]*\))\s*(?:throws\s+[^{]+)?\s*\{/gm;
  while ((match = methodRegex.exec(content)) !== null) {
    const vis = match[1] || 'package';
    const returnType = match[2];
    const name = match[3];
    const params = match[4];

    // Filter out control keywords
    const blacklist = ['if', 'while', 'for', 'switch', 'catch', 'synchronized', 'return'];
    if (blacklist.includes(name)) continue;

    const isExported = vis === 'public' || vis === 'protected';
    symbols.push({
      name,
      kind: 'method',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `${vis} ${returnType} ${name}${params}`,
    });
    if (isExported) exports.push(name);
  }

  // Spring & JAX-RS Routes
  extractSpringAndJaxRsRoutes(content, offsets, routes, symbols);

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

function parseKotlin(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  // Package
  const pkgMatch = content.match(/^package\s+([a-zA-Z0-9_.]+)/m);
  if (pkgMatch && pkgMatch.index !== undefined) {
    const pkg = pkgMatch[1];
    symbols.push({
      name: pkg,
      kind: 'module',
      line: getLineNumber(offsets, pkgMatch.index),
      exported: true,
      signature: `package ${pkg}`,
    });
    exports.push(pkg);
  }

  // Imports
  const importRegex = /^import\s+([a-zA-Z0-9_.]+)(?:\.\*)?/gm;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const imp = match[1];
    imports.push(imp);
    handleJvmExternalDep(imp, externalDeps);
  }

  // Classes, Data Classes, Objects, Interfaces
  const ktClassRegex = /^(?:[\t ]*)(?:@[\w()]+\s+)*(private|internal|public)?\s*(?:data\s+|sealed\s+|open\s+|abstract\s+|inner\s+)*(class|interface|object|enum\s+class)\s+([A-Za-z0-9_]+)/gm;
  while ((match = ktClassRegex.exec(content)) !== null) {
    const vis = match[1] || 'public';
    const rawKind = match[2];
    const name = match[3];
    const isExported = vis !== 'private' && vis !== 'internal';
    let kind: CodeSymbol['kind'] = 'class';
    if (rawKind === 'interface') kind = 'interface';
    if (rawKind.includes('enum')) kind = 'type';

    symbols.push({
      name,
      kind,
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `${vis} ${rawKind} ${name}`,
    });
    if (isExported) exports.push(name);
  }

  // Functions: fun name(...)
  const ktFunRegex = /^(?:[\t ]*)(?:@[\w()]+\s+)*(private|internal|public)?\s*(?:suspend\s+|inline\s+|override\s+|operator\s+|tailrec\s+)*fun\s+(?:<[^>]+>\s+)?(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*(\([^)]*\))/gm;
  while ((match = ktFunRegex.exec(content)) !== null) {
    const vis = match[1] || 'public';
    const receiver = match[2];
    const name = match[3];
    const params = match[4];
    const fullName = receiver ? `${receiver}.${name}` : name;
    const isExported = vis !== 'private' && vis !== 'internal';

    symbols.push({
      name: fullName,
      kind: receiver ? 'method' : 'function',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `fun ${fullName}${params}`,
    });
    if (isExported) exports.push(fullName);
  }

  // Spring & Ktor Routes
  extractSpringAndJaxRsRoutes(content, offsets, routes, symbols);

  // Ktor routes: get("/path") { ... }, post("/path")
  const ktorRegex = /\b(get|post|put|delete|patch|head|options)\s*\(\s*["']([^"']+)["']\s*\)/gi;
  while ((match = ktorRegex.exec(content)) !== null) {
    const verb = match[1].toUpperCase();
    const routePath = match[2];
    const label = `${verb} ${routePath}`;
    routes.push(label);
    symbols.push({
      name: label,
      kind: 'route',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: match[0],
    });
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

function handleJvmExternalDep(importPath: string, externalDeps: string[]) {
  if (
    importPath.startsWith('java.') ||
    importPath.startsWith('javax.') ||
    importPath.startsWith('kotlin.') ||
    importPath.startsWith('android.') ||
    importPath.startsWith('androidx.') ||
    importPath.startsWith('sun.')
  ) {
    return;
  }
  const parts = importPath.split('.');
  if (parts.length >= 2) {
    externalDeps.push(`${parts[0]}.${parts[1]}`);
  } else {
    externalDeps.push(importPath);
  }
}

function extractSpringAndJaxRsRoutes(
  content: string,
  offsets: number[],
  routes: string[],
  symbols: CodeSymbol[]
) {
  // Class level prefix: @RequestMapping("/api/v1")
  let classPrefix = '';
  let classMappingIndex = -1;
  const classMappingMatch = content.match(/@(?:RequestMapping)\s*\(\s*(?:(?:value|path)\s*=\s*)?["']([^"']+)["']/);
  if (classMappingMatch && classMappingMatch.index !== undefined) {
    classPrefix = classMappingMatch[1].replace(/\/+$/, '');
    classMappingIndex = classMappingMatch.index;
  }

  const springMethodRegex = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*\(\s*(?:(?:value|path)\s*=\s*)?["']?([^"',)]*)["']?/gi;
  let match: RegExpExecArray | null;
  while ((match = springMethodRegex.exec(content)) !== null) {
    // If this is the exact class-level @RequestMapping, don't emit a separate route for it
    if (match.index === classMappingIndex) {
      continue;
    }
    let verb = match[1].replace('Mapping', '').toUpperCase();
    if (verb === 'REQUEST') verb = 'ANY';
    let subPath = match[2] || '';
    if (subPath && !subPath.startsWith('/')) subPath = '/' + subPath;
    const fullPath = classPrefix + subPath || '/';
    const label = `${verb} ${fullPath}`;
    routes.push(label);
    symbols.push({
      name: label,
      kind: 'route',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: match[0],
    });
  }
}

// -----------------------------------------------------------------------------
// 4. C & C++ AST Extractor (.c, .h, .cpp, .hpp, .cc, .hh)
// -----------------------------------------------------------------------------

function parseCpp(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  const ext = getExtension(filePath);
  const isHeader = ['.h', '.hpp', '.hh', '.hxx', '.h++'].includes(ext);

  // #include <sys/header> or #include "local/header.h"
  const includeRegex = /#include\s+(?:<([^>]+)>|"([^"]+)")/g;
  let match: RegExpExecArray | null;
  while ((match = includeRegex.exec(content)) !== null) {
    const header = match[1] || match[2];
    imports.push(header);

    // Track prominent C/C++ third-party ecosystems
    if (match[1]) {
      const topSegment = match[1].split('/')[0];
      const recognized = ['boost', 'openssl', 'curl', 'nlohmann', 'grpc', 'fmt', 'spdlog', 'gtest', 'folly', 'eigen3', 'zlib', 'uv'];
      if (recognized.includes(topSegment.toLowerCase())) {
        externalDeps.push(topSegment);
      }
    }
  }

  // Namespaces: namespace my_ns {
  const nsRegex = /namespace\s+([a-zA-Z0-9_:]+)\s*\{/g;
  while ((match = nsRegex.exec(content)) !== null) {
    const ns = match[1];
    symbols.push({
      name: ns,
      kind: 'module',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: `namespace ${ns}`,
    });
    exports.push(ns);
  }

  // Classes & Structs: class Name : public Base {
  const classRegex = /^(?:[\t ]*)(?:class|struct)\s+(?:[A-Za-z0-9_]+_API\s+)?([A-Za-z0-9_]+)(?:\s*:\s*[^{]+)?\s*\{/gm;
  while ((match = classRegex.exec(content)) !== null) {
    const name = match[1];
    symbols.push({
      name,
      kind: 'class',
      line: getLineNumber(offsets, match.index),
      exported: isHeader,
      signature: match[0].trim(),
    });
    if (isHeader) exports.push(name);
  }

  // Enums: enum class Name or enum Name
  const enumRegex = /enum\s+(?:class\s+|struct\s+)?([A-Za-z0-9_]+)/g;
  while ((match = enumRegex.exec(content)) !== null) {
    const name = match[1];
    symbols.push({
      name,
      kind: 'type',
      line: getLineNumber(offsets, match.index),
      exported: isHeader,
      signature: `enum ${name}`,
    });
    if (isHeader) exports.push(name);
  }

  // Typedefs & using aliases
  const aliasRegex = /(?:using\s+([A-Za-z0-9_]+)\s*=|typedef\s+[^;]+(?:\s+|\*|&)([A-Za-z0-9_]+);)/g;
  while ((match = aliasRegex.exec(content)) !== null) {
    const name = match[1] || match[2];
    symbols.push({
      name,
      kind: 'type',
      line: getLineNumber(offsets, match.index),
      exported: isHeader,
      signature: match[0].trim(),
    });
    if (isHeader) exports.push(name);
  }

  // Preprocessor #define constants
  const defineRegex = /^#define\s+([A-Za-z0-9_]+)(?:\([^)]*\))?\s+(.*)$/gm;
  while ((match = defineRegex.exec(content)) !== null) {
    const name = match[1];
    // Exclude header guards
    if (name.endsWith('_H') || name.endsWith('_HPP') || name.startsWith('_')) continue;
    symbols.push({
      name,
      kind: 'const',
      line: getLineNumber(offsets, match.index),
      exported: isHeader,
      signature: `#define ${name}`,
    });
    if (isHeader) exports.push(name);
  }

  // Functions: ReturnType FuncName(params)
  const fnRegex = /^(?:[\t ]*)(?:extern\s+"C"\s+)?(?:inline\s+|virtual\s+|explicit\s+|static\s+)*([A-Za-z0-9_:<>&*]+)\s+([A-Za-z0-9_]+)\s*(\([^;{}]*\))\s*(?:const)?\s*(?:override)?\s*(?:final)?\s*(?:noexcept)?\s*[{;]/gm;
  while ((match = fnRegex.exec(content)) !== null) {
    const retType = match[1];
    const name = match[2];
    const params = match[3];

    const blacklist = ['if', 'for', 'while', 'switch', 'catch', 'sizeof', 'decltype'];
    if (blacklist.includes(name)) continue;

    const isExported = isHeader || !match[0].includes('static');
    symbols.push({
      name,
      kind: 'function',
      line: getLineNumber(offsets, match.index),
      exported: isExported,
      signature: `${retType} ${name}${params}`,
    });
    if (isExported) exports.push(name);
  }

  // Crow C++ framework routes: CROW_ROUTE(app, "/api/path")
  const crowRouteRegex = /CROW_ROUTE\s*\(\s*[a-zA-Z0-9_]+\s*,\s*["']([^"']+)["']\s*\)/g;
  while ((match = crowRouteRegex.exec(content)) !== null) {
    const routePath = match[1];
    routes.push(routePath);
    symbols.push({
      name: routePath,
      kind: 'route',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: match[0],
    });
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

// -----------------------------------------------------------------------------
// 5. SQL AST Extractor (.sql)
// -----------------------------------------------------------------------------

function parseSql(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  // CREATE TABLE [IF NOT EXISTS] name
  const tableRegex = /CREATE\s+(?:TEMPORARY\s+|TEMP\s+|UNLOGGED\s+)?TABLE\s+(?:IF NOT EXISTS\s+)?([a-zA-Z0-9_."]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1].replace(/["']/g, '');
    symbols.push({
      name: tableName,
      kind: 'class',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: `TABLE ${tableName}`,
    });
    exports.push(tableName);
  }

  // CREATE VIEW / MATERIALIZED VIEW [IF NOT EXISTS] name
  const viewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+|TEMP\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF NOT EXISTS\s+)?([a-zA-Z0-9_."]+)/gi;
  while ((match = viewRegex.exec(content)) !== null) {
    const viewName = match[1].replace(/["']/g, '');
    symbols.push({
      name: viewName,
      kind: 'type',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: `VIEW ${viewName}`,
    });
    exports.push(viewName);
  }

  // CREATE FUNCTION / PROCEDURE name
  const funcRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\s+([a-zA-Z0-9_."]+)/gi;
  while ((match = funcRegex.exec(content)) !== null) {
    const fnKind = match[1].toUpperCase();
    const fnName = match[2].replace(/["']/g, '');
    symbols.push({
      name: fnName,
      kind: 'function',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: `${fnKind} ${fnName}`,
    });
    exports.push(fnName);

    // If schema indicates API/RPC (PostgREST / Supabase rpc convention)
    if (fnName.startsWith('api.') || fnName.startsWith('rpc_')) {
      routes.push(`RPC ${fnName}`);
    }
  }

  // CREATE TRIGGER name
  const triggerRegex = /CREATE\s+TRIGGER\s+([a-zA-Z0-9_."]+)/gi;
  while ((match = triggerRegex.exec(content)) !== null) {
    const trigName = match[1].replace(/["']/g, '');
    symbols.push({
      name: trigName,
      kind: 'function',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: `TRIGGER ${trigName}`,
    });
  }

  // CREATE TYPE name
  const typeRegex = /CREATE\s+TYPE\s+([a-zA-Z0-9_."]+)/gi;
  while ((match = typeRegex.exec(content)) !== null) {
    const typeName = match[1].replace(/["']/g, '');
    symbols.push({
      name: typeName,
      kind: 'type',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: `TYPE ${typeName}`,
    });
    exports.push(typeName);
  }

  // CREATE EXTENSION name
  const extRegex = /CREATE\s+EXTENSION\s+(?:IF NOT EXISTS\s+)?["']?([a-zA-Z0-9_-]+)["']?/gi;
  while ((match = extRegex.exec(content)) !== null) {
    const extName = match[1];
    externalDeps.push(extName);
  }

  // References: FROM table, JOIN table, REFERENCES table
  const refRegex = /\b(?:FROM|JOIN|REFERENCES)\s+([a-zA-Z0-9_."]+)/gi;
  const sqlKeywords = ['select', 'where', 'unnest', 'lateral', 'values', 'table', 'dual', 'generate_series'];
  while ((match = refRegex.exec(content)) !== null) {
    const tbl = match[1].replace(/["']/g, '').trim();
    if (tbl && !sqlKeywords.includes(tbl.toLowerCase()) && !exports.includes(tbl)) {
      imports.push(tbl);
    }
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

// -----------------------------------------------------------------------------
// 6. GraphQL AST Extractor (.graphql, .gql)
// -----------------------------------------------------------------------------

function parseGraphQL(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  // Imports: #import "path"
  const importRegex = /#import\s+["']?([^"'\s]+)["']?/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Object Types: type Name [implements ...] {
  const typeRegex = /^(?:[\t ]*)(?:extend\s+)?(type|interface|input|enum|union|scalar)\s+([A-Za-z0-9_]+)/gm;
  while ((match = typeRegex.exec(content)) !== null) {
    const rawKind = match[1];
    const name = match[2];
    let kind: CodeSymbol['kind'] = 'class';
    if (rawKind === 'interface') kind = 'interface';
    if (rawKind === 'enum' || rawKind === 'union' || rawKind === 'input' || rawKind === 'scalar') {
      kind = 'type';
    }

    symbols.push({
      name,
      kind,
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: `${rawKind} ${name}`,
    });
    exports.push(name);
  }

  // Operations: query Name, mutation Name, subscription Name
  const opRegex = /^(?:[\t ]*)(query|mutation|subscription)\s+([A-Za-z0-9_]+)/gm;
  while ((match = opRegex.exec(content)) !== null) {
    const op = match[1];
    const name = match[2];
    symbols.push({
      name,
      kind: 'function',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: `${op} ${name}`,
    });
    exports.push(name);
    routes.push(`${op.toUpperCase()} ${name}`);
  }

  // Query & Mutation Fields: type Query { getUser: User }
  const blockRegex = /(?:type|extend\s+type)\s+(Query|Mutation|Subscription)\s*\{([^}]+)\}/g;
  while ((match = blockRegex.exec(content)) !== null) {
    const blockOp = match[1];
    const fieldsBlock = match[2];
    const fieldRegex = /^\s*([a-zA-Z0-9_]+)(?:\([^)]*\))?\s*:\s*([A-Za-z0-9_!\[\]]+)/gm;
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRegex.exec(fieldsBlock)) !== null) {
      const fieldName = fieldMatch[1];
      const returnType = fieldMatch[2];
      const routeLabel = `${blockOp}.${fieldName}`;
      routes.push(routeLabel);
      symbols.push({
        name: routeLabel,
        kind: 'route',
        line: getLineNumber(offsets, match.index),
        exported: true,
        signature: `${fieldName}: ${returnType}`,
      });
    }
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

// -----------------------------------------------------------------------------
// 7. Dockerfile Extractor
// -----------------------------------------------------------------------------

function parseDockerfile(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  // FROM image [AS stage]
  const fromRegex = /^\s*FROM\s+([^\s]+)(?:\s+[aA][sS]\s+([^\s]+))?/gm;
  let match: RegExpExecArray | null;
  while ((match = fromRegex.exec(content)) !== null) {
    const image = match[1];
    const stage = match[2];
    externalDeps.push(image);

    if (stage) {
      symbols.push({
        name: `stage:${stage}`,
        kind: 'module',
        line: getLineNumber(offsets, match.index),
        exported: true,
        signature: `FROM ${image} AS ${stage}`,
      });
      exports.push(`stage:${stage}`);
    }
  }

  // COPY --from=stage
  const copyFromRegex = /COPY\s+--from=([^\s]+)/g;
  while ((match = copyFromRegex.exec(content)) !== null) {
    imports.push(`stage:${match[1]}`);
  }

  // EXPOSE ports
  const exposeRegex = /^\s*EXPOSE\s+([0-9\s/tcpudp]+)/gm;
  while ((match = exposeRegex.exec(content)) !== null) {
    const ports = match[1].trim().split(/\s+/);
    for (const port of ports) {
      const label = `PORT ${port}`;
      routes.push(label);
      symbols.push({
        name: label,
        kind: 'route',
        line: getLineNumber(offsets, match.index),
        exported: true,
        signature: `EXPOSE ${port}`,
      });
    }
  }

  // ENTRYPOINT and CMD
  const entrypointRegex = /^\s*(ENTRYPOINT|CMD)\s+(.*)$/gm;
  while ((match = entrypointRegex.exec(content)) !== null) {
    const cmdKind = match[1];
    symbols.push({
      name: cmdKind,
      kind: 'function',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: `${cmdKind} ${match[2].trim()}`,
    });
  }

  // ENV and ARG
  const envArgRegex = /^\s*(ENV|ARG)\s+([A-Za-z0-9_]+)/gm;
  while ((match = envArgRegex.exec(content)) !== null) {
    const varKind = match[1];
    const varName = match[2];
    symbols.push({
      name: varName,
      kind: 'const',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: `${varKind} ${varName}`,
    });
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

// -----------------------------------------------------------------------------
// 8. Manifest Parsers (package.json, pyproject.toml, Cargo.toml, go.mod, YAML)
// -----------------------------------------------------------------------------

function parsePackageJson(filePath: string, content: string): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  try {
    const pkg = JSON.parse(content);
    if (pkg.name) {
      symbols.push({
        name: pkg.name,
        kind: 'module',
        line: 1,
        exported: true,
        signature: `package ${pkg.name}@${pkg.version || '0.0.0'}`,
      });
      exports.push(pkg.name);
    }

    if (pkg.dependencies && typeof pkg.dependencies === 'object') {
      for (const dep of Object.keys(pkg.dependencies)) {
        externalDeps.push(dep);
        imports.push(dep);
      }
    }

    if (pkg.devDependencies && typeof pkg.devDependencies === 'object') {
      for (const dep of Object.keys(pkg.devDependencies)) {
        externalDeps.push(dep);
      }
    }

    if (pkg.peerDependencies && typeof pkg.peerDependencies === 'object') {
      for (const dep of Object.keys(pkg.peerDependencies)) {
        externalDeps.push(dep);
      }
    }

    // Exports field
    if (pkg.exports) {
      if (typeof pkg.exports === 'string') {
        exports.push(pkg.exports);
      } else if (typeof pkg.exports === 'object') {
        for (const subpath of Object.keys(pkg.exports)) {
          exports.push(subpath);
        }
      }
    }

    if (pkg.main) exports.push(pkg.main);
    if (pkg.module) exports.push(pkg.module);

    if (pkg.bin) {
      if (typeof pkg.bin === 'string') {
        exports.push(pkg.name || 'bin');
      } else if (typeof pkg.bin === 'object') {
        for (const binName of Object.keys(pkg.bin)) {
          exports.push(binName);
        }
      }
    }

    // Scripts as functions
    if (pkg.scripts && typeof pkg.scripts === 'object') {
      for (const scriptName of Object.keys(pkg.scripts)) {
        symbols.push({
          name: `npm run ${scriptName}`,
          kind: 'function',
          line: 1,
          exported: true,
          signature: pkg.scripts[scriptName],
        });
      }
    }
  } catch {
    // If malformed JSON, return empty signals
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

function parsePyprojectToml(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  // Project name
  const nameMatch = content.match(/^name\s*=\s*["']([^"']+)["']/m);
  if (nameMatch && nameMatch.index !== undefined) {
    const name = nameMatch[1];
    symbols.push({
      name,
      kind: 'module',
      line: getLineNumber(offsets, nameMatch.index),
      exported: true,
      signature: `project ${name}`,
    });
    exports.push(name);
  }

  // Poetry dependencies block: [tool.poetry.dependencies]
  const poetryDepsMatch = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\[|$)/);
  if (poetryDepsMatch) {
    const block = poetryDepsMatch[1];
    const depRegex = /^([a-zA-Z0-9_-]+)\s*=\s*/gm;
    let match: RegExpExecArray | null;
    while ((match = depRegex.exec(block)) !== null) {
      const dep = match[1];
      if (dep.toLowerCase() !== 'python') {
        externalDeps.push(dep);
        imports.push(dep);
      }
    }
  }

  // Standard PEP 621 dependencies: dependencies = [ ... ]
  const pep621DepsMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (pep621DepsMatch) {
    const block = pep621DepsMatch[1];
    const itemRegex = /["']([a-zA-Z0-9_-]+)(?:[><=~^!].*)?["']/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(block)) !== null) {
      const dep = match[1];
      externalDeps.push(dep);
      imports.push(dep);
    }
  }

  // Scripts / Entrypoints
  const scriptsMatch = content.match(/\[(?:project\.scripts|tool\.poetry\.scripts)\]([\s\S]*?)(?:\[|$)/);
  if (scriptsMatch) {
    const block = scriptsMatch[1];
    const scriptRegex = /^([a-zA-Z0-9_-]+)\s*=\s*["']([^"']+)["']/gm;
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(block)) !== null) {
      const scriptName = match[1];
      symbols.push({
        name: scriptName,
        kind: 'function',
        line: 1,
        exported: true,
        signature: match[2],
      });
      exports.push(scriptName);
    }
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

function parseCargoToml(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  // Package name
  const nameMatch = content.match(/^name\s*=\s*["']([^"']+)["']/m);
  if (nameMatch && nameMatch.index !== undefined) {
    const name = nameMatch[1];
    symbols.push({
      name,
      kind: 'module',
      line: getLineNumber(offsets, nameMatch.index),
      exported: true,
      signature: `crate ${name}`,
    });
    exports.push(name);
  }

  // Dependency sections: [dependencies], [dev-dependencies], [build-dependencies], [workspace.dependencies]
  const depSectionRegex = /^\[(?:workspace\.)?(?:dev-)?(?:build-)?dependencies(?:\.[^\]]+)?\][^\n]*\n([\s\S]*?)(?=\n\[|(?![\s\S]))/gm;
  let match: RegExpExecArray | null;
  while ((match = depSectionRegex.exec(content)) !== null) {
    const block = match[1];
    const crateRegex = /^([a-zA-Z0-9_-]+)\s*=\s*/gm;
    let crateMatch: RegExpExecArray | null;
    while ((crateMatch = crateRegex.exec(block)) !== null) {
      const crateName = crateMatch[1];
      externalDeps.push(crateName);
      imports.push(crateName);
    }
  }

  // Bin targets: [[bin]] name = "..."
  const binRegex = /\[\[bin\]\][\s\S]*?name\s*=\s*["']([^"']+)["']/g;
  while ((match = binRegex.exec(content)) !== null) {
    const binName = match[1];
    symbols.push({
      name: binName,
      kind: 'function',
      line: 1,
      exported: true,
      signature: `bin ${binName}`,
    });
    exports.push(binName);
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

function parseGoMod(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  // Module path: module github.com/owner/repo
  const modMatch = content.match(/^module\s+([^\s]+)/m);
  if (modMatch && modMatch.index !== undefined) {
    const modPath = modMatch[1];
    symbols.push({
      name: modPath,
      kind: 'module',
      line: getLineNumber(offsets, modMatch.index),
      exported: true,
      signature: `module ${modPath}`,
    });
    exports.push(modPath);
  }

  // Single require: require github.com/gin-gonic/gin v1.9.1
  const singleRequireRegex = /^require\s+([^\s()\n]+)\s+([^\s\n]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = singleRequireRegex.exec(content)) !== null) {
    const dep = match[1];
    if (dep && dep !== '(') {
      externalDeps.push(dep);
      imports.push(dep);
    }
  }

  // Grouped require: require ( ... )
  const groupRequireRegex = /^require\s*\(([\s\S]*?)\)/gm;
  while ((match = groupRequireRegex.exec(content)) !== null) {
    const block = match[1];
    const lineRegex = /^\s*([^\s()\n]+)\s+([^\s\n]+)/gm;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = lineRegex.exec(block)) !== null) {
      const dep = lineMatch[1];
      if (dep && dep !== '//' && dep !== '(' && dep !== ')') {
        externalDeps.push(dep);
        imports.push(dep);
      }
    }
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

function parseYamlManifest(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  const base = getBasename(filePath).toLowerCase();

  // Docker Compose
  if (base.includes('compose') || base.includes('docker-compose')) {
    // Services:
    const serviceBlockMatch = content.match(/^services:([\s\S]*?)(?:^[a-zA-Z0-9_-]+:|$)/m);
    if (serviceBlockMatch) {
      const block = serviceBlockMatch[1];
      const svcRegex = /^[ \t]{2}([a-zA-Z0-9_-]+):/gm;
      let match: RegExpExecArray | null;
      while ((match = svcRegex.exec(block)) !== null) {
        const svc = match[1];
        symbols.push({
          name: `service:${svc}`,
          kind: 'module',
          line: 1,
          exported: true,
          signature: `service ${svc}`,
        });
        exports.push(`service:${svc}`);
      }
    }

    // Images
    const imageRegex = /^[ \t]+image:\s*["']?([^"'\s]+)["']?/gm;
    let match: RegExpExecArray | null;
    while ((match = imageRegex.exec(content)) !== null) {
      externalDeps.push(match[1]);
    }

    // Ports
    const portRegex = /^[ \t]+-[ \t]+["']?([0-9]+:[0-9]+)["']?/gm;
    while ((match = portRegex.exec(content)) !== null) {
      routes.push(`PORT ${match[1]}`);
    }
  }

  // GitHub Actions Workflows
  if (filePath.includes('.github/workflows/')) {
    const nameMatch = content.match(/^name:\s*(.*)$/m);
    if (nameMatch) {
      symbols.push({
        name: nameMatch[1].trim(),
        kind: 'module',
        line: 1,
        exported: true,
        signature: `workflow ${nameMatch[1].trim()}`,
      });
      exports.push(nameMatch[1].trim());
    }

    const usesRegex = /uses:\s*([^\s@]+)@([^\s]+)/g;
    let match: RegExpExecArray | null;
    while ((match = usesRegex.exec(content)) !== null) {
      const action = match[1];
      externalDeps.push(action);
      imports.push(action);
    }
  }

  // Kubernetes manifests
  const k8sKindMatch = content.match(/^kind:\s*([A-Za-z]+)/m);
  if (k8sKindMatch) {
    const kind = k8sKindMatch[1];
    const nameMatch = content.match(/^[ \t]+name:\s*([a-zA-Z0-9_-]+)/m);
    const k8sName = nameMatch ? nameMatch[1] : kind;
    symbols.push({
      name: `${kind}/${k8sName}`,
      kind: 'class',
      line: 1,
      exported: true,
      signature: `k8s ${kind} ${k8sName}`,
    });
    exports.push(`${kind}/${k8sName}`);

    // Ingress paths
    const pathRegex = /path:\s*([^\s]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pathRegex.exec(content)) !== null) {
      routes.push(match[1]);
    }
  }

  // OpenAPI / Swagger YAML paths
  const openApiPathRegex = /^[ \t]{2,4}(\/[a-zA-Z0-9_{}/-]+):/gm;
  let match: RegExpExecArray | null;
  while ((match = openApiPathRegex.exec(content)) !== null) {
    const path = match[1];
    routes.push(path);
    symbols.push({
      name: path,
      kind: 'route',
      line: getLineNumber(offsets, match.index),
      exported: true,
      signature: `endpoint ${path}`,
    });
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

// -----------------------------------------------------------------------------
// Universal Fallback Extractor (Generic scripts, C#, Ruby, PHP, Swift, Dart)
// -----------------------------------------------------------------------------

function parseGenericLanguage(filePath: string, content: string, offsets: number[]): ExtractedFileSignals {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: CodeSymbol[] = [];
  const routes: string[] = [];
  const externalDeps: string[] = [];

  // Generic class definitions
  const classRegex = /^(?:[\t ]*)(?:export\s+)?(?:public\s+|private\s+|protected\s+)?class\s+([A-Za-z0-9_]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = classRegex.exec(content)) !== null) {
    const name = match[1];
    symbols.push({
      name,
      kind: 'class',
      line: getLineNumber(offsets, match.index),
      exported: match[0].includes('export') || match[0].includes('public'),
      signature: `class ${name}`,
    });
    exports.push(name);
  }

  // Generic function definitions
  const fnRegex = /^(?:[\t ]*)(?:export\s+)?(?:public\s+|private\s+|def\s+|function\s+|func\s+)([A-Za-z0-9_]+)\s*\(/gm;
  while ((match = fnRegex.exec(content)) !== null) {
    const name = match[1];
    const blacklist = ['if', 'while', 'for', 'switch', 'catch'];
    if (blacklist.includes(name)) continue;

    symbols.push({
      name,
      kind: 'function',
      line: getLineNumber(offsets, match.index),
      exported: match[0].includes('export') || match[0].includes('public'),
      signature: `func ${name}`,
    });
    exports.push(name);
  }

  // Generic imports / requires
  const genericImportRegex = /^(?:[\t ]*)(?:import|require|using|include)\s+["']?([a-zA-Z0-9_./-]+)["']?/gm;
  while ((match = genericImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return sanitizeSignals({ imports, exports, symbols, routes, externalDeps });
}

// -----------------------------------------------------------------------------
// Main Multi-Language File Parser
// -----------------------------------------------------------------------------

/**
 * Static extractor for Go, Rust, Java, Kotlin, C/C++, SQL, GraphQL, Dockerfile,
 * and YAML/JSON/TOML manifests.
 */
export function parseMultiLangFile(
  filePath: string,
  language: string,
  content: string
): ExtractedFileSignals {
  const normLang = normalizeLanguage(filePath, language);
  const offsets = buildLineOffsets(content);

  switch (normLang) {
    case 'go':
      return parseGo(filePath, content, offsets);
    case 'rust':
      return parseRust(filePath, content, offsets);
    case 'java':
      return parseJava(filePath, content, offsets);
    case 'kotlin':
      return parseKotlin(filePath, content, offsets);
    case 'c':
    case 'cpp':
      return parseCpp(filePath, content, offsets);
    case 'sql':
      return parseSql(filePath, content, offsets);
    case 'graphql':
      return parseGraphQL(filePath, content, offsets);
    case 'dockerfile':
      return parseDockerfile(filePath, content, offsets);
    case 'manifest:package.json':
      return parsePackageJson(filePath, content);
    case 'manifest:pyproject.toml':
      return parsePyprojectToml(filePath, content, offsets);
    case 'manifest:cargo.toml':
      return parseCargoToml(filePath, content, offsets);
    case 'manifest:go.mod':
      return parseGoMod(filePath, content, offsets);
    case 'yaml':
      return parseYamlManifest(filePath, content, offsets);
    case 'json':
      if (getBasename(filePath).toLowerCase() === 'package.json') {
        return parsePackageJson(filePath, content);
      }
      return parseGenericLanguage(filePath, content, offsets);
    case 'toml':
      if (getBasename(filePath).toLowerCase() === 'pyproject.toml') {
        return parsePyprojectToml(filePath, content, offsets);
      }
      if (getBasename(filePath).toLowerCase() === 'cargo.toml') {
        return parseCargoToml(filePath, content, offsets);
      }
      return parseGenericLanguage(filePath, content, offsets);
    default:
      return parseGenericLanguage(filePath, content, offsets);
  }
}

// -----------------------------------------------------------------------------
// Universal Ingest Dispatcher
// -----------------------------------------------------------------------------

/**
 * Universal file signal extractor dispatcher.
 * Routes JavaScript/TypeScript files to parseJsTsFile (from ./astParserJs.js),
 * Python files to parsePythonFile (from ./astParserPy.js),
 * and all other languages / manifests to parseMultiLangFile.
 */
export function extractFileSignals(
  filePath: string,
  language: string,
  content: string
): ExtractedFileSignals {
  const normLang = normalizeLanguage(filePath, language);

  // JavaScript / TypeScript dispatcher
  if (isJsTs(filePath, normLang)) {
    try {
      if (typeof parseJsTsFile === 'function') {
        // Sibling parser may accept (filePath, content) or (filePath, language, content)
        const res =
          parseJsTsFile.length === 3
            ? (parseJsTsFile as any)(filePath, normLang, content) ??
              (parseJsTsFile as any)(filePath, content, normLang)
            : (parseJsTsFile as any)(filePath, content);
        if (res && (res.symbols || res.imports || res.exports)) {
          return sanitizeSignals(res);
        }
      }
    } catch {
      // Fall through to parseMultiLangFile on exception
    }
    return parseMultiLangFile(filePath, normLang, content);
  }

  // Python dispatcher
  if (isPython(filePath, normLang)) {
    try {
      if (typeof parsePythonFile === 'function') {
        // Sibling parser may accept (filePath, content) or (filePath, language, content)
        const res =
          parsePythonFile.length === 3
            ? (parsePythonFile as any)(filePath, normLang, content) ??
              (parsePythonFile as any)(filePath, content, normLang)
            : (parsePythonFile as any)(filePath, content);
        if (res && (res.symbols || res.imports || res.exports)) {
          return sanitizeSignals(res);
        }
      }
    } catch {
      // Fall through to parseMultiLangFile on exception
    }
    return parseMultiLangFile(filePath, normLang, content);
  }

  // Multi-language and manifests dispatcher
  return parseMultiLangFile(filePath, normLang, content);
}
