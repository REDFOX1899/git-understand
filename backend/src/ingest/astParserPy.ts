import type { CodeSymbol } from '../../../shared/types.js';

// =============================================================================
// Python Standard Library Modules (Python 3.8 - 3.13)
// Used to differentiate third-party external dependencies from stdlib imports
// =============================================================================
const PYTHON_STDLIB: ReadonlySet<string> = new Set([
  '__future__',
  '_thread',
  'abc',
  'aifc',
  'argparse',
  'array',
  'ast',
  'asynchat',
  'asyncio',
  'asyncore',
  'atexit',
  'audioop',
  'base64',
  'bdb',
  'binascii',
  'binhex',
  'bisect',
  'builtins',
  'bz2',
  'cProfile',
  'calendar',
  'cgi',
  'cgitb',
  'chunk',
  'cmath',
  'cmd',
  'code',
  'codecs',
  'codeop',
  'collections',
  'colorsys',
  'compileall',
  'concurrent',
  'configparser',
  'contextlib',
  'contextvars',
  'copy',
  'copyreg',
  'crypt',
  'csv',
  'ctypes',
  'curses',
  'dataclasses',
  'datetime',
  'dbm',
  'decimal',
  'difflib',
  'dis',
  'distutils',
  'doctest',
  'email',
  'encodings',
  'ensurepip',
  'enum',
  'errno',
  'faulthandler',
  'fcntl',
  'filecmp',
  'fileinput',
  'fnmatch',
  'fractions',
  'ftplib',
  'functools',
  'gc',
  'getopt',
  'getpass',
  'gettext',
  'glob',
  'graphlib',
  'grp',
  'gzip',
  'hashlib',
  'heapq',
  'hmac',
  'html',
  'http',
  'idlelib',
  'imaplib',
  'imghdr',
  'imp',
  'importlib',
  'inspect',
  'io',
  'ipaddress',
  'itertools',
  'json',
  'keyword',
  'lib2to3',
  'linecache',
  'locale',
  'logging',
  'lzma',
  'mailbox',
  'mailcap',
  'marshal',
  'math',
  'mimetypes',
  'mmap',
  'modulefinder',
  'msilib',
  'msvcrt',
  'multiprocessing',
  'netrc',
  'nis',
  'nntplib',
  'numbers',
  'operator',
  'optparse',
  'os',
  'ossaudiodev',
  'parser',
  'pathlib',
  'pdb',
  'pickle',
  'pickletools',
  'pipes',
  'pkgutil',
  'platform',
  'plistlib',
  'poplib',
  'posix',
  'posixpath',
  'pprint',
  'profile',
  'pstats',
  'pty',
  'pwd',
  'py_compile',
  'pyclbr',
  'pydoc',
  'queue',
  'quopri',
  'random',
  're',
  'readline',
  'reprlib',
  'resource',
  'rlcompleter',
  'runpy',
  'sched',
  'secrets',
  'select',
  'selectors',
  'shelve',
  'shlex',
  'shutil',
  'signal',
  'site',
  'smtpd',
  'smtplib',
  'sndhdr',
  'socket',
  'socketserver',
  'spwd',
  'sqlite3',
  'ssl',
  'stat',
  'statistics',
  'string',
  'stringprep',
  'struct',
  'subprocess',
  'sunau',
  'symbol',
  'symtable',
  'sys',
  'sysconfig',
  'syslog',
  'tabnanny',
  'tarfile',
  'telnetlib',
  'tempfile',
  'termios',
  'test',
  'textwrap',
  'threading',
  'time',
  'timeit',
  'tkinter',
  'token',
  'tokenize',
  'tomllib',
  'trace',
  'traceback',
  'tracemalloc',
  'tty',
  'turtle',
  'turtledemo',
  'types',
  'typing',
  'typing_extensions',
  'unicodedata',
  'unittest',
  'urllib',
  'uu',
  'uuid',
  'venv',
  'warnings',
  'wave',
  'weakref',
  'webbrowser',
  'winreg',
  'winsound',
  'wsgiref',
  'xdrlib',
  'xml',
  'xmlrpc',
  'zipapp',
  'zipfile',
  'zipimport',
  'zlib',
  'zoneinfo',
]);

// =============================================================================
// Contract Interfaces
// =============================================================================

export interface PythonParsedFile {
  imports: string[];
  exports: string[];
  symbols: CodeSymbol[];
  routes: string[];
  externalDeps: string[];
}

interface PreprocessedLine {
  raw: string;
  code: string;
  lineNum: number; // 1-based line number
  indent: number;
  isEmpty: boolean;
}

interface BlockScope {
  kind: 'class' | 'function';
  name: string;
  indent: number;
  symbolIndex: number;
}

interface PendingDecorator {
  raw: string;
  line: number;
}

interface ExtractedRoute {
  route: string;
  method: string;
  path: string;
  decoratorText: string;
  line: number;
}

// =============================================================================
// Preprocessor: Masks strings & comments, detects multiline string blocks
// =============================================================================

function preprocessLines(content: string): PreprocessedLine[] {
  const rawLines = content.split(/\r?\n/);
  const result: PreprocessedLine[] = [];

  let inTripleQuote: '"""' | "'''" | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const lineNum = i + 1;

    let codeBuilder = '';
    let j = 0;

    // Expand tabs to 4 spaces for indentation measurement
    const leadingWhitespaceMatch = raw.match(/^[ \t]*/);
    const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : '';
    let indent = 0;
    for (const char of leadingWhitespace) {
      if (char === '\t') {
        indent += 4 - (indent % 4);
      } else {
        indent += 1;
      }
    }

    while (j < raw.length) {
      if (inTripleQuote) {
        const closeIdx = raw.indexOf(inTripleQuote, j);
        if (closeIdx === -1) {
          // Entire remaining line is inside triple-quoted string
          j = raw.length;
        } else {
          // Closed triple quote
          j = closeIdx + 3;
          inTripleQuote = null;
        }
        continue;
      }

      const char = raw[j];

      // Comment start (outside strings)
      if (char === '#') {
        break; // Ignore rest of the line
      }

      // Check for triple-quote start
      if (raw.startsWith('"""', j)) {
        inTripleQuote = '"""';
        j += 3;
        codeBuilder += ' ';
        continue;
      }
      if (raw.startsWith("'''", j)) {
        inTripleQuote = "'''";
        j += 3;
        codeBuilder += ' ';
        continue;
      }

      // Single-line quotes: " or '
      if (char === '"' || char === "'") {
        const quoteChar = char;
        j++;
        codeBuilder += '"';
        while (j < raw.length) {
          if (raw[j] === '\\') {
            j += 2; // skip escaped character
            continue;
          }
          if (raw[j] === quoteChar) {
            j++;
            break;
          }
          j++;
        }
        codeBuilder += '"';
        continue;
      }

      codeBuilder += char;
      j++;
    }

    const trimmedCode = codeBuilder.trim();
    result.push({
      raw,
      code: codeBuilder,
      lineNum,
      indent,
      isEmpty: trimmedCode.length === 0,
    });
  }

  return result;
}

// =============================================================================
// Helper: Normalizes route paths (e.g. "items" -> "/items", "/" -> "/")
// =============================================================================

function normalizeRoutePath(rawPath: string): string {
  let path = rawPath.trim();
  if (!path) return '/';
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  return path;
}

// =============================================================================
// Route Decorator Analyzer: FastAPI / Starlette / Flask
// =============================================================================

function parseRouteDecorator(decoratorText: string, startLine: number): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];
  const text = decoratorText.trim();

  // Pattern A: Method-specific routes (@app.get, @router.post, @api.delete, etc.)
  const methodSpecificMatch = text.match(
    /^@(?:[a-zA-Z0-9_]+)\.(get|post|put|delete|patch|options|head|trace|websocket)\s*\(([\s\S]*)\)$/i
  );

  if (methodSpecificMatch) {
    const rawMethod = methodSpecificMatch[1].toUpperCase();
    const method = rawMethod === 'WEBSOCKET' ? 'WS' : rawMethod;
    const argsContent = methodSpecificMatch[2].trim();

    // Extract path from first string argument
    const pathMatch = argsContent.match(/^(?:f|r|rf|fr|b)?["']([^"']*)["']/);
    const path = pathMatch ? normalizeRoutePath(pathMatch[1]) : '/';

    routes.push({
      route: `${method} ${path}`,
      method,
      path,
      decoratorText: text,
      line: startLine,
    });
    return routes;
  }

  // Pattern B: Generic routes (@app.route, @router.api_route, @bp.route, etc.)
  const genericRouteMatch = text.match(
    /^@(?:[a-zA-Z0-9_]+)\.(?:route|api_route)\s*\(([\s\S]*)\)$/i
  );

  if (genericRouteMatch) {
    const argsContent = genericRouteMatch[1].trim();

    // Extract path from first string argument
    const pathMatch = argsContent.match(/^(?:f|r|rf|fr|b)?["']([^"']*)["']/);
    const path = pathMatch ? normalizeRoutePath(pathMatch[1]) : '/';

    // Check for methods argument: methods=['GET', 'POST']
    const methodsMatch = argsContent.match(/methods\s*=\s*\[([^\]]*)\]/i);
    let methods: string[] = [];

    if (methodsMatch) {
      const items = methodsMatch[1].split(',');
      for (const item of items) {
        const m = item.match(/["']([a-zA-Z]+)["']/);
        if (m) {
          methods.push(m[1].toUpperCase());
        }
      }
    }

    if (methods.length === 0) {
      // Flask default for @app.route is GET
      methods = ['GET'];
    }

    for (const m of methods) {
      routes.push({
        route: `${m} ${path}`,
        method: m,
        path,
        decoratorText: text,
        line: startLine,
      });
    }

    return routes;
  }

  return routes;
}

// =============================================================================
// Main Static Analyzer: parsePythonFile
// =============================================================================

/**
 * Fast deterministic static analyzer for Python (.py) files.
 * Extracts imports, exports, CodeSymbol records, route endpoints, and external dependencies.
 */
export function parsePythonFile(
  filePath: string,
  content: string
): PythonParsedFile {
  const importsSet = new Set<string>();
  const externalDepsSet = new Set<string>();
  const routesSet = new Set<string>();
  const symbols: CodeSymbol[] = [];
  const explicitAllExports: string[] = [];

  const lines = preprocessLines(content);
  const totalLines = lines.length;

  // Active block indentation stack
  const blockStack: BlockScope[] = [];

  // Helper to pop blocks when indentation decreases
  function unwindStack(currentIndent: number, currentLineNum: number) {
    while (blockStack.length > 0 && currentIndent <= blockStack[blockStack.length - 1].indent) {
      const popped = blockStack.pop()!;
      // Find the last non-empty line before currentLineNum for accurate endLine
      let endLine = currentLineNum - 1;
      while (endLine > 1 && endLine <= totalLines && lines[endLine - 1].isEmpty) {
        endLine--;
      }
      if (endLine < symbols[popped.symbolIndex].line) {
        endLine = symbols[popped.symbolIndex].line;
      }
      symbols[popped.symbolIndex].endLine = endLine;
    }
  }

  let lineIdx = 0;

  while (lineIdx < totalLines) {
    const cur = lines[lineIdx];

    if (cur.isEmpty) {
      lineIdx++;
      continue;
    }

    const trimmedCode = cur.code.trim();

    // -------------------------------------------------------------------------
    // 1. Unwind stack if indentation drops
    // -------------------------------------------------------------------------
    unwindStack(cur.indent, cur.lineNum);

    // -------------------------------------------------------------------------
    // 2. Parse `import x, y as z`
    // -------------------------------------------------------------------------
    if (trimmedCode.startsWith('import ')) {
      let importStatement = cur.raw.trim();
      let endImportIdx = lineIdx;

      // Handle trailing backslash continuation
      while (importStatement.endsWith('\\') && endImportIdx + 1 < totalLines) {
        endImportIdx++;
        importStatement = importStatement.slice(0, -1).trim() + ' ' + lines[endImportIdx].raw.trim();
      }

      // Remove comment if any
      const commentIdx = importStatement.indexOf('#');
      if (commentIdx !== -1) {
        importStatement = importStatement.substring(0, commentIdx).trim();
      }

      const rawTargets = importStatement.replace(/^import\s+/, '').trim();
      const targets = rawTargets.split(',');

      for (const target of targets) {
        const cleanTarget = target.trim().split(/\s+as\s+/)[0].trim();
        if (cleanTarget) {
          importsSet.add(cleanTarget);

          // Add to externalDeps if not relative and not in standard library
          if (!cleanTarget.startsWith('.')) {
            const rootPkg = cleanTarget.split('.')[0];
            if (rootPkg && !PYTHON_STDLIB.has(rootPkg)) {
              externalDepsSet.add(rootPkg);
            }
          }
        }
      }

      lineIdx = endImportIdx + 1;
      continue;
    }

    // -------------------------------------------------------------------------
    // 3. Parse `from x.y import z` or `from .foo import bar`
    // -------------------------------------------------------------------------
    if (trimmedCode.startsWith('from ')) {
      let fromStatement = cur.raw.trim();
      let endFromIdx = lineIdx;

      // Count open parentheses or backslashes
      let openParenCount = 0;
      for (const ch of fromStatement) {
        if (ch === '(') openParenCount++;
        if (ch === ')') openParenCount--;
      }

      while ((openParenCount > 0 || fromStatement.endsWith('\\')) && endFromIdx + 1 < totalLines) {
        endFromIdx++;
        const nextRaw = lines[endFromIdx].raw.trim();
        fromStatement += ' ' + nextRaw;
        for (const ch of nextRaw) {
          if (ch === '(') openParenCount++;
          if (ch === ')') openParenCount--;
        }
      }

      // Strip comments
      fromStatement = fromStatement.replace(/#[^\r\n]*/g, ' ').trim();

      const fromMatch = fromStatement.match(/^from\s+([.\w]+)\s+import\b/);
      if (fromMatch) {
        const modName = fromMatch[1].trim();
        importsSet.add(modName);

        // Determine if external dependency
        if (!modName.startsWith('.')) {
          const rootPkg = modName.split('.')[0];
          if (rootPkg && !PYTHON_STDLIB.has(rootPkg)) {
            externalDepsSet.add(rootPkg);
          }
        }
      }

      lineIdx = endFromIdx + 1;
      continue;
    }

    // -------------------------------------------------------------------------
    // 4. Parse `__all__ = [...]` or `__all__ = (...)`
    // -------------------------------------------------------------------------
    if (cur.indent === 0 && /^__all__\s*=\s*[\[(]/.test(trimmedCode)) {
      let allStatement = cur.raw;
      let endAllIdx = lineIdx;
      let bracketCount = 0;

      for (const ch of allStatement) {
        if (ch === '[' || ch === '(') bracketCount++;
        if (ch === ']' || ch === ')') bracketCount--;
      }

      while (bracketCount > 0 && endAllIdx + 1 < totalLines) {
        endAllIdx++;
        const nextRaw = lines[endAllIdx].raw;
        allStatement += ' ' + nextRaw;
        for (const ch of nextRaw) {
          if (ch === '[' || ch === '(') bracketCount++;
          if (ch === ']' || ch === ')') bracketCount--;
        }
      }

      const stringMatches = allStatement.matchAll(/["']([^"']+)["']/g);
      for (const sm of stringMatches) {
        if (sm[1] && !explicitAllExports.includes(sm[1])) {
          explicitAllExports.push(sm[1]);
        }
      }

      lineIdx = endAllIdx + 1;
      continue;
    }

    // -------------------------------------------------------------------------
    // 5. Accumulate Decorators (`@decorator(...)`)
    // -------------------------------------------------------------------------
    if (trimmedCode.startsWith('@')) {
      const decorators: PendingDecorator[] = [];
      let decIdx = lineIdx;

      while (decIdx < totalLines) {
        const decLine = lines[decIdx];
        if (decLine.isEmpty) {
          decIdx++;
          continue;
        }

        const decTrim = decLine.code.trim();
        if (!decTrim.startsWith('@')) {
          break;
        }

        let decRaw = decLine.raw.trim();
        const decStartLine = decLine.lineNum;
        let parenCount = 0;

        for (const ch of decRaw) {
          if (ch === '(') parenCount++;
          if (ch === ')') parenCount--;
        }

        while (parenCount > 0 && decIdx + 1 < totalLines) {
          decIdx++;
          const nextDecRaw = lines[decIdx].raw.trim();
          decRaw += ' ' + nextDecRaw;
          for (const ch of nextDecRaw) {
            if (ch === '(') parenCount++;
            if (ch === ')') parenCount--;
          }
        }

        decorators.push({
          raw: decRaw,
          line: decStartLine,
        });

        decIdx++;
      }

      // Check if decorators are followed by `def`, `async def`, or `class`
      if (decIdx < totalLines && !lines[decIdx].isEmpty) {
        const nextTrim = lines[decIdx].code.trim();
        const isDefOrClass =
          nextTrim.startsWith('def ') ||
          nextTrim.startsWith('async def ') ||
          nextTrim.startsWith('class ');

        if (isDefOrClass) {
          // Process definition with decorators attached
          const headerEndIdx = processDefinitionWithDecorators(lines, decIdx, decorators);
          lineIdx = headerEndIdx + 1;
          continue;
        }
      }

      // If standalone decorators or followed by something else, advance
      lineIdx = decIdx;
      continue;
    }

    // -------------------------------------------------------------------------
    // 6. Direct Class Definition (`class Name(...):`)
    // -------------------------------------------------------------------------
    if (trimmedCode.startsWith('class ')) {
      const headerEndIdx = processDefinitionWithDecorators(lines, lineIdx, []);
      lineIdx = headerEndIdx + 1;
      continue;
    }

    // -------------------------------------------------------------------------
    // 7. Direct Function Definition (`def func(...)` / `async def func(...)`)
    // -------------------------------------------------------------------------
    if (trimmedCode.startsWith('def ') || trimmedCode.startsWith('async def ')) {
      const headerEndIdx = processDefinitionWithDecorators(lines, lineIdx, []);
      lineIdx = headerEndIdx + 1;
      continue;
    }

    // -------------------------------------------------------------------------
    // 8. Top-Level Constants (`UPPER_CASE = ...`)
    // -------------------------------------------------------------------------
    if (cur.indent === 0 && blockStack.length === 0) {
      const constMatch = trimmedCode.match(/^(_?[A-Z][A-Z0-9_]*)\s*(?::\s*[^=]+)?\s*=\s*(.+)$/);
      if (constMatch) {
        const constName = constMatch[1];
        const isExported =
          explicitAllExports.length > 0
            ? explicitAllExports.includes(constName)
            : !constName.startsWith('_');

        symbols.push({
          name: constName,
          kind: 'const',
          line: cur.lineNum,
          endLine: cur.lineNum,
          exported: isExported,
          signature: cur.raw.trim(),
        });
      }
    }

    lineIdx++;
  }

  // Final stack unwinding to end of file
  unwindStack(-1, totalLines + 1);

  // ---------------------------------------------------------------------------
  // Helper: Parses class or function header, attaches decorators, routes, scope
  // ---------------------------------------------------------------------------
  function processDefinitionWithDecorators(
    allLines: PreprocessedLine[],
    defLineIdx: number,
    decorators: PendingDecorator[]
  ): number {
    const defLine = allLines[defLineIdx];
    const defIndent = defLine.indent;

    // Accumulate multiline signature header up to trailing ':'
    let headerText = defLine.raw.trim();
    let headerEndIdx = defLineIdx;
    let parenCount = 0;

    for (const ch of headerText) {
      if (ch === '(') parenCount++;
      if (ch === ')') parenCount--;
    }

    while (
      (parenCount > 0 || !headerText.endsWith(':')) &&
      headerEndIdx + 1 < totalLines &&
      !allLines[headerEndIdx + 1].code.trim().startsWith('class ') &&
      !allLines[headerEndIdx + 1].code.trim().startsWith('def ')
    ) {
      headerEndIdx++;
      const nextLineRaw = allLines[headerEndIdx].raw.trim();
      headerText += ' ' + nextLineRaw;
      for (const ch of nextLineRaw) {
        if (ch === '(') parenCount++;
        if (ch === ')') parenCount--;
      }
      if (headerText.endsWith(':')) break;
    }

    // Normalize whitespace in header
    const cleanHeader = headerText.replace(/\s+/g, ' ').trim();

    // Check for route decorators
    const extractedRoutes: ExtractedRoute[] = [];
    for (const dec of decorators) {
      const rList = parseRouteDecorator(dec.raw, dec.line);
      for (const r of rList) {
        extractedRoutes.push(r);
        routesSet.add(r.route);
      }
    }

    const isRoute = extractedRoutes.length > 0;
    const startLine = decorators.length > 0 ? decorators[0].line : defLine.lineNum;

    // Check parent scope
    const parentScope = blockStack.length > 0 ? blockStack[blockStack.length - 1] : null;

    // Check if class definition
    const classMatch = cleanHeader.match(/^class\s+([a-zA-Z0-9_]+)/);
    if (classMatch) {
      const className = classMatch[1];
      const isExported =
        explicitAllExports.length > 0
          ? explicitAllExports.includes(className)
          : !className.startsWith('_') && defIndent === 0;

      const fullSignature =
        decorators.length > 0
          ? `${decorators.map((d) => d.raw).join(' ')} ${cleanHeader}`
          : cleanHeader;

      const symIndex = symbols.length;
      symbols.push({
        name: className,
        kind: 'class',
        line: startLine,
        endLine: defLine.lineNum, // Updated when block is unwound
        exported: isExported,
        signature: fullSignature,
      });

      blockStack.push({
        kind: 'class',
        name: className,
        indent: defIndent,
        symbolIndex: symIndex,
      });
      return headerEndIdx;
    }

    // Check if function or async function definition
    const funcMatch = cleanHeader.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)/);
    if (funcMatch) {
      const funcName = funcMatch[1];

      let kind: CodeSymbol['kind'] = 'function';
      if (isRoute) {
        kind = 'route';
      } else if (parentScope && parentScope.kind === 'class') {
        kind = 'method';
      }

      let isExported = false;
      if (isRoute) {
        isExported = true;
      } else if (explicitAllExports.length > 0) {
        isExported = explicitAllExports.includes(funcName);
      } else if (defIndent === 0) {
        isExported = !funcName.startsWith('_');
      } else if (parentScope && parentScope.kind === 'class') {
        isExported = !funcName.startsWith('_') || funcName === '__init__';
      }

      const fullSignature =
        decorators.length > 0
          ? `${decorators.map((d) => d.raw).join(' ')} ${cleanHeader}`
          : cleanHeader;

      const symIndex = symbols.length;
      symbols.push({
        name: funcName,
        kind,
        line: startLine,
        endLine: defLine.lineNum, // Updated when block is unwound
        exported: isExported,
        signature: fullSignature,
      });

      blockStack.push({
        kind: 'function',
        name: funcName,
        indent: defIndent,
        symbolIndex: symIndex,
      });
    }

    return headerEndIdx;
  }

  // ---------------------------------------------------------------------------
  // 9. Calculate final exports list
  // ---------------------------------------------------------------------------
  let exports: string[];
  if (explicitAllExports.length > 0) {
    exports = explicitAllExports;
  } else {
    // Collect all top-level symbols exported by default
    exports = symbols
      .filter((s) => s.exported && (s.kind === 'class' || s.kind === 'function' || s.kind === 'route' || s.kind === 'const'))
      .map((s) => s.name);
    // Deduplicate
    exports = Array.from(new Set(exports));
  }

  return {
    imports: Array.from(importsSet),
    exports,
    symbols,
    routes: Array.from(routesSet),
    externalDeps: Array.from(externalDepsSet),
  };
}
