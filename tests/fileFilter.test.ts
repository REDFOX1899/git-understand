import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  countLines,
  detectLanguageFromPath,
  formatTokenCount,
} from '../backend/src/utils/tokenCounter.js';
import {
  BINARY_EXTENSIONS,
  IGNORED_DIRECTORIES,
  KNOWN_LOCKFILES,
  DEFAULT_IGNORE_PATTERNS,
  globToRegExp,
  isBinaryOrIgnoredPath,
  matchesFilter,
  isTestFile,
  isConfigFile,
  isLikelyEntrypoint,
} from '../backend/src/utils/fileFilter.js';

describe('Token & Line Estimator (tokenCounter)', () => {
  describe('estimateTokens', () => {
    it('returns 0 for empty or null-like strings', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens(null as unknown as string)).toBe(0);
      expect(estimateTokens(undefined as unknown as string)).toBe(0);
    });

    it('estimates tokens for a simple single-line code statement', () => {
      const code = 'const answer = 42;';
      const tokens = estimateTokens(code);
      // 'const', 'answer', '=', '42', ';' -> ~5 tokens
      expect(tokens).toBeGreaterThanOrEqual(4);
      expect(tokens).toBeLessThanOrEqual(8);
    });

    it('accounts for line breaks as token boundaries', () => {
      const singleLine = 'const a = 1; const b = 2;';
      const multiLine = 'const a = 1;\nconst b = 2;';
      const tokensSingle = estimateTokens(singleLine);
      const tokensMulti = estimateTokens(multiLine);

      // multi-line has an extra newline token boundary
      expect(tokensMulti).toBeGreaterThan(tokensSingle - 2);
    });

    it('accounts for leading indentation (tabs and spaces)', () => {
      const unindented = 'return true;';
      const spacesIndented = '    return true;'; // 4 spaces = ~1 token
      const tabsIndented = '\t\treturn true;'; // 2 tabs = 2 tokens

      const tokensUnindented = estimateTokens(unindented);
      const tokensSpaces = estimateTokens(spacesIndented);
      const tokensTabs = estimateTokens(tabsIndented);

      expect(tokensSpaces).toBeGreaterThan(tokensUnindented);
      expect(tokensTabs).toBeGreaterThan(tokensUnindented);
      expect(tokensTabs - tokensUnindented).toBe(2);
    });

    it('handles compound operators and punctuation sequences as single tokens', () => {
      const code = 'if (x === 10 && y !== 20 || a >= b && c <= d) => { return obj?.prop ?? null; }';
      const tokens = estimateTokens(code);
      expect(tokens).toBeGreaterThan(10);
      expect(tokens).toBeLessThan(35);
    });

    it('penalizes longer identifiers appropriately', () => {
      const shortWord = 'short';
      const mediumWord = 'veryLongVariable'; // 16 chars -> ~4 tokens
      const veryLongWord = 'supercalifragilisticexpialidocious'; // 34 chars -> ~9 tokens

      expect(estimateTokens(shortWord)).toBe(1);
      expect(estimateTokens(mediumWord)).toBeGreaterThan(estimateTokens(shortWord));
      expect(estimateTokens(veryLongWord)).toBeGreaterThan(estimateTokens(mediumWord));
    });

    it('handles numbers and digits sequences', () => {
      const digitsCode = 'const val = 123456789;';
      const tokens = estimateTokens(digitsCode);
      expect(tokens).toBeGreaterThanOrEqual(5);
    });

    it('handles non-ASCII, Unicode, emoji, and CJK text', () => {
      const cjk = 'const message = "你好世界";';
      const emoji = 'const flag = "🚀🔥✨";';
      expect(estimateTokens(cjk)).toBeGreaterThan(estimateTokens('const message = "hi";'));
      expect(estimateTokens(emoji)).toBeGreaterThan(3);
    });

    it('handles English contractions', () => {
      const prose = "It's obvious that we'll win and they won't stop us.";
      const tokens = estimateTokens(prose);
      expect(tokens).toBeGreaterThan(8);
    });

    it('returns 0 for pure whitespace lines', () => {
      expect(estimateTokens('   ')).toBe(0);
      expect(estimateTokens('\t\t')).toBe(0);
    });
  });

  describe('countLines', () => {
    it('returns 0 for empty or falsy text', () => {
      expect(countLines('')).toBe(0);
      expect(countLines(null as unknown as string)).toBe(0);
      expect(countLines(undefined as unknown as string)).toBe(0);
    });

    it('returns 1 for a single line without newlines', () => {
      expect(countLines('console.log("hello world");')).toBe(1);
    });

    it('returns 1 for a string that is only a single newline', () => {
      expect(countLines('\n')).toBe(1);
      expect(countLines('\r\n')).toBe(1);
      expect(countLines('\r')).toBe(1);
    });

    it('accurately counts Unix (LF) multi-line text', () => {
      const text = 'line1\nline2\nline3';
      expect(countLines(text)).toBe(3);
    });

    it('accurately counts Windows (CRLF) multi-line text', () => {
      const text = 'line1\r\nline2\r\nline3';
      expect(countLines(text)).toBe(3);
    });

    it('accurately counts classic Mac (CR) multi-line text', () => {
      const text = 'line1\rline2\rline3';
      expect(countLines(text)).toBe(3);
    });

    it('strips single trailing POSIX newline without inflating count', () => {
      expect(countLines('line1\nline2\n')).toBe(2);
      expect(countLines('line1\r\nline2\r\n')).toBe(2);
      expect(countLines('line1\rline2\r')).toBe(2);
    });

    it('counts empty intermediate lines', () => {
      const text = 'line1\n\nline3\n';
      expect(countLines(text)).toBe(3);
    });
  });

  describe('formatTokenCount', () => {
    it('formats 0 or invalid numbers as "0"', () => {
      expect(formatTokenCount(0)).toBe('0');
      expect(formatTokenCount(NaN)).toBe('0');
      expect(formatTokenCount(Infinity)).toBe('0');
    });

    it('formats counts under 1,000 as rounded integers', () => {
      expect(formatTokenCount(42)).toBe('42');
      expect(formatTokenCount(500.4)).toBe('500');
      expect(formatTokenCount(999)).toBe('999');
    });

    it('formats counts from 1,000 to 999,999 in thousands (K)', () => {
      expect(formatTokenCount(1000)).toBe('1K');
      expect(formatTokenCount(1500)).toBe('1.5K');
      expect(formatTokenCount(2000)).toBe('2K');
      expect(formatTokenCount(142400)).toBe('142.4K');
      expect(formatTokenCount(999900)).toBe('999.9K');
    });

    it('formats counts from 1,000,000 to 999,999,999 in millions (M)', () => {
      expect(formatTokenCount(1000000)).toBe('1M');
      expect(formatTokenCount(1200000)).toBe('1.2M');
      expect(formatTokenCount(25000000)).toBe('25M');
      expect(formatTokenCount(250500000)).toBe('250.5M');
    });

    it('formats counts 1,000,000,000+ in billions (B)', () => {
      expect(formatTokenCount(1000000000)).toBe('1B');
      expect(formatTokenCount(2500000000)).toBe('2.5B');
    });

    it('formats negative counts with a leading minus sign', () => {
      expect(formatTokenCount(-500)).toBe('-500');
      expect(formatTokenCount(-1500)).toBe('-1.5K');
      expect(formatTokenCount(-2000000)).toBe('-2M');
    });
  });
});

describe('Language Detector (tokenCounter)', () => {
  describe('detectLanguageFromPath', () => {
    it('returns "Unknown" for empty or invalid paths', () => {
      expect(detectLanguageFromPath('')).toBe('Unknown');
      expect(detectLanguageFromPath(null as unknown as string)).toBe('Unknown');
      expect(detectLanguageFromPath(undefined as unknown as string)).toBe('Unknown');
    });

    it('identifies exact special configuration and build filenames', () => {
      expect(detectLanguageFromPath('Dockerfile')).toBe('Dockerfile');
      expect(detectLanguageFromPath('dockerfile')).toBe('Dockerfile');
      expect(detectLanguageFromPath('Containerfile')).toBe('Dockerfile');
      expect(detectLanguageFromPath('Makefile')).toBe('Makefile');
      expect(detectLanguageFromPath('CMakeLists.txt')).toBe('CMake');
      expect(detectLanguageFromPath('package.json')).toBe('JSON');
      expect(detectLanguageFromPath('tsconfig.json')).toBe('JSON');
      expect(detectLanguageFromPath('Cargo.toml')).toBe('TOML');
      expect(detectLanguageFromPath('Cargo.lock')).toBe('TOML');
      expect(detectLanguageFromPath('go.mod')).toBe('Go');
      expect(detectLanguageFromPath('go.sum')).toBe('Go');
      expect(detectLanguageFromPath('Gemfile')).toBe('Ruby');
      expect(detectLanguageFromPath('Rakefile')).toBe('Ruby');
      expect(detectLanguageFromPath('.gitignore')).toBe('Ignore File');
      expect(detectLanguageFromPath('.editorconfig')).toBe('EditorConfig');
    });

    it('identifies prefix-based filename conventions', () => {
      expect(detectLanguageFromPath('Dockerfile.dev')).toBe('Dockerfile');
      expect(detectLanguageFromPath('Containerfile.prod')).toBe('Dockerfile');
      expect(detectLanguageFromPath('Makefile.in')).toBe('Makefile');
      expect(detectLanguageFromPath('.env.local')).toBe('Environment');
      expect(detectLanguageFromPath('.env.production')).toBe('Environment');
    });

    it('identifies compound extensions like .d.ts as TypeScript', () => {
      expect(detectLanguageFromPath('types.d.ts')).toBe('TypeScript');
      expect(detectLanguageFromPath('src/typings/index.d.ts')).toBe('TypeScript');
    });

    it('identifies TypeScript & JavaScript variants', () => {
      expect(detectLanguageFromPath('app.ts')).toBe('TypeScript');
      expect(detectLanguageFromPath('component.tsx')).toBe('TypeScript');
      expect(detectLanguageFromPath('util.mts')).toBe('TypeScript');
      expect(detectLanguageFromPath('server.js')).toBe('JavaScript');
      expect(detectLanguageFromPath('view.jsx')).toBe('JavaScript');
      expect(detectLanguageFromPath('module.mjs')).toBe('JavaScript');
      expect(detectLanguageFromPath('common.cjs')).toBe('JavaScript');
    });

    it('identifies Systems & Compiled Languages', () => {
      expect(detectLanguageFromPath('main.rs')).toBe('Rust');
      expect(detectLanguageFromPath('main.go')).toBe('Go');
      expect(detectLanguageFromPath('main.c')).toBe('C');
      expect(detectLanguageFromPath('header.h')).toBe('C');
      expect(detectLanguageFromPath('engine.cpp')).toBe('C++');
      expect(detectLanguageFromPath('math.cc')).toBe('C++');
      expect(detectLanguageFromPath('kernel.zig')).toBe('Zig');
      expect(detectLanguageFromPath('script.nim')).toBe('Nim');
    });

    it('identifies JVM & .NET Languages', () => {
      expect(detectLanguageFromPath('App.java')).toBe('Java');
      expect(detectLanguageFromPath('Service.kt')).toBe('Kotlin');
      expect(detectLanguageFromPath('Build.gradle')).toBe('Groovy');
      expect(detectLanguageFromPath('Core.cs')).toBe('C#');
      expect(detectLanguageFromPath('Model.fs')).toBe('F#');
    });

    it('identifies Web, Mobile & Markup Frameworks', () => {
      expect(detectLanguageFromPath('main.dart')).toBe('Dart');
      expect(detectLanguageFromPath('App.swift')).toBe('Swift');
      expect(detectLanguageFromPath('Widget.vue')).toBe('Vue');
      expect(detectLanguageFromPath('Counter.svelte')).toBe('Svelte');
      expect(detectLanguageFromPath('index.astro')).toBe('Astro');
      expect(detectLanguageFromPath('index.html')).toBe('HTML');
      expect(detectLanguageFromPath('styles.scss')).toBe('SCSS');
      expect(detectLanguageFromPath('styles.css')).toBe('CSS');
    });

    it('identifies Data, Config & Database Formats', () => {
      expect(detectLanguageFromPath('schema.sql')).toBe('SQL');
      expect(detectLanguageFromPath('schema.prisma')).toBe('Prisma');
      expect(detectLanguageFromPath('config.yaml')).toBe('YAML');
      expect(detectLanguageFromPath('config.yml')).toBe('YAML');
      expect(detectLanguageFromPath('data.json')).toBe('JSON');
      expect(detectLanguageFromPath('manifest.toml')).toBe('TOML');
      expect(detectLanguageFromPath('feed.xml')).toBe('XML');
      expect(detectLanguageFromPath('main.tf')).toBe('Terraform');
      expect(detectLanguageFromPath('service.proto')).toBe('Protocol Buffers');
      expect(detectLanguageFromPath('query.graphql')).toBe('GraphQL');
    });

    it('identifies Shell and Scripting Languages', () => {
      expect(detectLanguageFromPath('deploy.sh')).toBe('Shell');
      expect(detectLanguageFromPath('build.bash')).toBe('Shell');
      expect(detectLanguageFromPath('env.zsh')).toBe('Shell');
      expect(detectLanguageFromPath('script.ps1')).toBe('PowerShell');
      expect(detectLanguageFromPath('batch.bat')).toBe('Batch');
    });

    it('normalizes Windows path backslashes', () => {
      expect(detectLanguageFromPath('src\\components\\Button.tsx')).toBe('TypeScript');
      expect(detectLanguageFromPath('backend\\src\\main.py')).toBe('Python');
    });

    it('falls back to "Plain Text" for unrecognized file extensions or license files', () => {
      expect(detectLanguageFromPath('LICENSE')).toBe('Plain Text');
      expect(detectLanguageFromPath('unknown.foobar')).toBe('Plain Text');
      expect(detectLanguageFromPath('notes.txt')).toBe('Plain Text');
    });
  });
});

describe('File Filter Engine (fileFilter)', () => {
  describe('Constants Verification', () => {
    it('exports expected BINARY_EXTENSIONS sets', () => {
      expect(BINARY_EXTENSIONS.has('.png')).toBe(true);
      expect(BINARY_EXTENSIONS.has('.jpg')).toBe(true);
      expect(BINARY_EXTENSIONS.has('.pdf')).toBe(true);
      expect(BINARY_EXTENSIONS.has('.wasm')).toBe(true);
      expect(BINARY_EXTENSIONS.has('.parquet')).toBe(true);
      expect(BINARY_EXTENSIONS.has('.exe')).toBe(true);
      expect(BINARY_EXTENSIONS.has('.zip')).toBe(true);
    });

    it('exports expected IGNORED_DIRECTORIES sets', () => {
      expect(IGNORED_DIRECTORIES.has('node_modules')).toBe(true);
      expect(IGNORED_DIRECTORIES.has('.git')).toBe(true);
      expect(IGNORED_DIRECTORIES.has('dist')).toBe(true);
      expect(IGNORED_DIRECTORIES.has('build')).toBe(true);
      expect(IGNORED_DIRECTORIES.has('.next')).toBe(true);
      expect(IGNORED_DIRECTORIES.has('coverage')).toBe(true);
      expect(IGNORED_DIRECTORIES.has('__pycache__')).toBe(true);
      expect(IGNORED_DIRECTORIES.has('.venv')).toBe(true);
    });

    it('exports expected KNOWN_LOCKFILES sets', () => {
      expect(KNOWN_LOCKFILES.has('package-lock.json')).toBe(true);
      expect(KNOWN_LOCKFILES.has('yarn.lock')).toBe(true);
      expect(KNOWN_LOCKFILES.has('pnpm-lock.yaml')).toBe(true);
      expect(KNOWN_LOCKFILES.has('uv.lock')).toBe(true);
      expect(KNOWN_LOCKFILES.has('bun.lockb')).toBe(true);
      expect(KNOWN_LOCKFILES.has('cargo.lock')).toBe(true);
      expect(KNOWN_LOCKFILES.has('poetry.lock')).toBe(true);
    });

    it('contains comprehensive DEFAULT_IGNORE_PATTERNS', () => {
      expect(DEFAULT_IGNORE_PATTERNS.length).toBeGreaterThan(30);
      expect(DEFAULT_IGNORE_PATTERNS).toContain('**/node_modules/**');
      expect(DEFAULT_IGNORE_PATTERNS).toContain('**/.git/**');
      expect(DEFAULT_IGNORE_PATTERNS).toContain('**/dist/**');
    });
  });

  describe('globToRegExp', () => {
    it('returns empty matcher for invalid globs', () => {
      expect(globToRegExp('').test('any')).toBe(false);
      expect(globToRegExp(null as unknown as string).test('any')).toBe(false);
    });

    it('compiles single star wildcard for single path segment', () => {
      const re = globToRegExp('src/*.ts');
      expect(re.test('src/index.ts')).toBe(true);
      expect(re.test('src/utils.ts')).toBe(true);
      expect(re.test('src/nested/utils.ts')).toBe(false);
      expect(re.test('other/index.ts')).toBe(false);
    });

    it('compiles recursive double star wildcards', () => {
      const re = globToRegExp('src/**/*.ts');
      expect(re.test('src/index.ts')).toBe(true);
      expect(re.test('src/a/b/c/index.ts')).toBe(true);
      expect(re.test('lib/index.ts')).toBe(false);
    });

    it('supports brace expansion syntax', () => {
      const re = globToRegExp('src/**/*.{ts,tsx,js}');
      expect(re.test('src/components/Header.tsx')).toBe(true);
      expect(re.test('src/index.ts')).toBe(true);
      expect(re.test('src/legacy.js')).toBe(true);
      expect(re.test('src/styles.css')).toBe(false);
    });

    it('supports question mark single-char wildcard', () => {
      const re = globToRegExp('file?.ts');
      expect(re.test('file1.ts')).toBe(true);
      expect(re.test('fileA.ts')).toBe(true);
      expect(re.test('file12.ts')).toBe(false);
    });

    it('handles trailing slash as recursive directory match', () => {
      const re = globToRegExp('dist/');
      expect(re.test('dist/bundle.js')).toBe(true);
      expect(re.test('dist/sub/chunk.js')).toBe(true);
    });

    it('handles root-anchored vs match-anywhere patterns', () => {
      const anywhereRe = globToRegExp('*.min.js');
      expect(anywhereRe.test('app.min.js')).toBe(true);
      expect(anywhereRe.test('dist/assets/app.min.js')).toBe(true);
    });

    it('safely handles consecutive wildcards preventing ReDoS', () => {
      const re = globToRegExp('**/**/**/test.ts');
      expect(re.test('a/b/c/test.ts')).toBe(true);
      expect(re.test('test.ts')).toBe(true);
    });

    it('reuses compiled regular expressions from cache', () => {
      const re1 = globToRegExp('src/**/*.ts');
      const re2 = globToRegExp('src/**/*.ts');
      expect(re1).toBe(re2);
    });
  });

  describe('isBinaryOrIgnoredPath', () => {
    it('returns true for invalid or empty paths', () => {
      expect(isBinaryOrIgnoredPath('')).toBe(true);
      expect(isBinaryOrIgnoredPath(null as unknown as string)).toBe(true);
      expect(isBinaryOrIgnoredPath('   ')).toBe(true);
    });

    it('filters out files inside ignored directories', () => {
      expect(isBinaryOrIgnoredPath('node_modules/react/index.js')).toBe(true);
      expect(isBinaryOrIgnoredPath('sub/node_modules/package/lib.js')).toBe(true);
      expect(isBinaryOrIgnoredPath('.git/objects/abc1234')).toBe(true);
      expect(isBinaryOrIgnoredPath('dist/bundle.js')).toBe(true);
      expect(isBinaryOrIgnoredPath('build/static/main.js')).toBe(true);
      expect(isBinaryOrIgnoredPath('.next/server/pages.js')).toBe(true);
      expect(isBinaryOrIgnoredPath('.cache/turbo/hash')).toBe(true);
      expect(isBinaryOrIgnoredPath('coverage/lcov-report/index.html')).toBe(true);
      expect(isBinaryOrIgnoredPath('.venv/bin/python')).toBe(true);
      expect(isBinaryOrIgnoredPath('__pycache__/app.cpython-311.pyc')).toBe(true);
    });

    it('filters out path target if it matches an ignored directory name', () => {
      expect(isBinaryOrIgnoredPath('node_modules')).toBe(true);
      expect(isBinaryOrIgnoredPath('dist')).toBe(true);
      expect(isBinaryOrIgnoredPath('.git')).toBe(true);
    });

    it('filters out known package lockfiles and OS artifacts', () => {
      expect(isBinaryOrIgnoredPath('package-lock.json')).toBe(true);
      expect(isBinaryOrIgnoredPath('frontend/package-lock.json')).toBe(true);
      expect(isBinaryOrIgnoredPath('yarn.lock')).toBe(true);
      expect(isBinaryOrIgnoredPath('pnpm-lock.yaml')).toBe(true);
      expect(isBinaryOrIgnoredPath('bun.lockb')).toBe(true);
      expect(isBinaryOrIgnoredPath('Cargo.lock')).toBe(true);
      expect(isBinaryOrIgnoredPath('poetry.lock')).toBe(true);
      expect(isBinaryOrIgnoredPath('.DS_Store')).toBe(true);
      expect(isBinaryOrIgnoredPath('subfolder/.DS_Store')).toBe(true);
      expect(isBinaryOrIgnoredPath('Thumbs.db')).toBe(true);
    });

    it('filters out minified bundles and sourcemaps', () => {
      expect(isBinaryOrIgnoredPath('public/bundle.min.js')).toBe(true);
      expect(isBinaryOrIgnoredPath('assets/vendor.bundle.js')).toBe(true);
      expect(isBinaryOrIgnoredPath('styles/app.min.css')).toBe(true);
      expect(isBinaryOrIgnoredPath('dist/index.js.map')).toBe(true);
    });

    it('filters out binary files by extension', () => {
      expect(isBinaryOrIgnoredPath('images/hero.png')).toBe(true);
      expect(isBinaryOrIgnoredPath('images/photo.jpg')).toBe(true);
      expect(isBinaryOrIgnoredPath('assets/icon.ico')).toBe(true);
      expect(isBinaryOrIgnoredPath('fonts/inter.woff2')).toBe(true);
      expect(isBinaryOrIgnoredPath('docs/whitepaper.pdf')).toBe(true);
      expect(isBinaryOrIgnoredPath('binaries/program.exe')).toBe(true);
      expect(isBinaryOrIgnoredPath('lib/libnative.dylib')).toBe(true);
      expect(isBinaryOrIgnoredPath('wasm/calc.wasm')).toBe(true);
      expect(isBinaryOrIgnoredPath('archives/backup.zip')).toBe(true);
      expect(isBinaryOrIgnoredPath('data/lake.parquet')).toBe(true);
      expect(isBinaryOrIgnoredPath('models/weights.safetensors')).toBe(true);
    });

    it('allows legitimate source and documentation files', () => {
      expect(isBinaryOrIgnoredPath('src/index.ts')).toBe(false);
      expect(isBinaryOrIgnoredPath('backend/src/server.ts')).toBe(false);
      expect(isBinaryOrIgnoredPath('studio/src/app/page.tsx')).toBe(false);
      expect(isBinaryOrIgnoredPath('README.md')).toBe(false);
      expect(isBinaryOrIgnoredPath('package.json')).toBe(false);
      expect(isBinaryOrIgnoredPath('tsconfig.json')).toBe(false);
      expect(isBinaryOrIgnoredPath('Cargo.toml')).toBe(false);
      expect(isBinaryOrIgnoredPath('pyproject.toml')).toBe(false);
      expect(isBinaryOrIgnoredPath('scripts/deploy.sh')).toBe(false);
    });

    it('normalizes leading ./ and Windows backslashes', () => {
      expect(isBinaryOrIgnoredPath('.\\node_modules\\react\\index.js')).toBe(true);
      expect(isBinaryOrIgnoredPath('./src/index.ts')).toBe(false);
      expect(isBinaryOrIgnoredPath('src\\components\\Button.tsx')).toBe(false);
    });
  });

  describe('matchesFilter', () => {
    it('returns false for empty or falsy paths', () => {
      expect(matchesFilter('')).toBe(false);
      expect(matchesFilter(null as unknown as string)).toBe(false);
    });

    it('returns true by default when no include or exclude patterns are specified', () => {
      expect(matchesFilter('src/index.ts')).toBe(true);
      expect(matchesFilter('README.md')).toBe(true);
    });

    it('enforces exclusion patterns with strict precedence over inclusion', () => {
      const include = ['src/**/*.ts'];
      const exclude = ['**/*.test.ts'];

      expect(matchesFilter('src/utils.ts', include, exclude)).toBe(true);
      expect(matchesFilter('src/utils.test.ts', include, exclude)).toBe(false);
    });

    it('filters according to inclusion globs', () => {
      const include = ['src/**/*.{ts,tsx}'];

      expect(matchesFilter('src/app.tsx', include)).toBe(true);
      expect(matchesFilter('src/service.ts', include)).toBe(true);
      expect(matchesFilter('src/styles.css', include)).toBe(false);
      expect(matchesFilter('docs/guide.md', include)).toBe(false);
    });

    it('supports multiple inclusion patterns (OR semantics)', () => {
      const include = ['src/**/*.ts', 'docs/**/*.md'];

      expect(matchesFilter('src/main.ts', include)).toBe(true);
      expect(matchesFilter('docs/readme.md', include)).toBe(true);
      expect(matchesFilter('package.json', include)).toBe(false);
    });

    it('supports multiple exclusion patterns', () => {
      const exclude = ['**/*.spec.ts', '**/fixtures/**'];

      expect(matchesFilter('src/app.ts', undefined, exclude)).toBe(true);
      expect(matchesFilter('src/app.spec.ts', undefined, exclude)).toBe(false);
      expect(matchesFilter('src/fixtures/mock.ts', undefined, exclude)).toBe(false);
    });
  });

  describe('isTestFile', () => {
    it('returns false for invalid inputs', () => {
      expect(isTestFile('')).toBe(false);
      expect(isTestFile(null as unknown as string)).toBe(false);
    });

    it('detects test directory conventions', () => {
      expect(isTestFile('__tests__/unit.ts')).toBe(true);
      expect(isTestFile('src/__tests__/component.tsx')).toBe(true);
      expect(isTestFile('tests/urlParser.test.ts')).toBe(true);
      expect(isTestFile('test/helper.py')).toBe(true);
      expect(isTestFile('specs/auth.spec.js')).toBe(true);
      expect(isTestFile('__mocks__/axios.ts')).toBe(true);
      expect(isTestFile('cypress/e2e/login.cy.ts')).toBe(true);
      expect(isTestFile('e2e/checkout.spec.ts')).toBe(true);
      expect(isTestFile('playwright/smoke.ts')).toBe(true);
    });

    it('detects JavaScript and TypeScript test filename patterns', () => {
      expect(isTestFile('src/auth.test.ts')).toBe(true);
      expect(isTestFile('src/auth.spec.tsx')).toBe(true);
      expect(isTestFile('src/utils.test.js')).toBe(true);
      expect(isTestFile('src/utils.spec.jsx')).toBe(true);
      expect(isTestFile('src/app.cy.ts')).toBe(true);
      expect(isTestFile('src/app.e2e.ts')).toBe(true);
    });

    it('detects Python test files', () => {
      expect(isTestFile('test_server.py')).toBe(true);
      expect(isTestFile('api_test.py')).toBe(true);
      expect(isTestFile('conftest.py')).toBe(true);
      expect(isTestFile('backend/test_models.py')).toBe(true);
    });

    it('detects Go, Rust, Java, Kotlin, and C# test files', () => {
      expect(isTestFile('server_test.go')).toBe(true);
      expect(isTestFile('tests.rs')).toBe(true);
      expect(isTestFile('integration_test.rs')).toBe(true);
      expect(isTestFile('UserServiceTest.java')).toBe(true);
      expect(isTestFile('OrderRepositoryTests.kt')).toBe(true);
      expect(isTestFile('ApiTestCase.cs')).toBe(true);
      expect(isTestFile('ControllerTestCase.php')).toBe(true);
    });

    it('does not classify regular application code as tests', () => {
      expect(isTestFile('src/index.ts')).toBe(false);
      expect(isTestFile('backend/src/server.ts')).toBe(false);
      expect(isTestFile('components/TestimonialCard.tsx')).toBe(false);
      expect(isTestFile('contest.py')).toBe(false);
      expect(isTestFile('testing_utils.ts')).toBe(false);
    });
  });

  describe('isConfigFile', () => {
    it('returns false for invalid inputs', () => {
      expect(isConfigFile('')).toBe(false);
      expect(isConfigFile(null as unknown as string)).toBe(false);
    });

    it('identifies GitHub Actions workflows', () => {
      expect(isConfigFile('.github/workflows/ci.yml')).toBe(true);
      expect(isConfigFile('.github/workflows/deploy.yaml')).toBe(true);
    });

    it('identifies exact config filenames across ecosystems', () => {
      expect(isConfigFile('package.json')).toBe(true);
      expect(isConfigFile('tsconfig.json')).toBe(true);
      expect(isConfigFile('dockerfile')).toBe(true);
      expect(isConfigFile('Dockerfile')).toBe(true);
      expect(isConfigFile('docker-compose.yml')).toBe(true);
      expect(isConfigFile('docker-compose.yaml')).toBe(true);
      expect(isConfigFile('.gitignore')).toBe(true);
      expect(isConfigFile('cargo.toml')).toBe(true);
      expect(isConfigFile('pyproject.toml')).toBe(true);
      expect(isConfigFile('go.mod')).toBe(true);
      expect(isConfigFile('go.sum')).toBe(true);
      expect(isConfigFile('vercel.json')).toBe(true);
      expect(isConfigFile('turbo.json')).toBe(true);
    });

    it('identifies environment variable manifests', () => {
      expect(isConfigFile('.env')).toBe(true);
      expect(isConfigFile('.env.local')).toBe(true);
      expect(isConfigFile('.env.production')).toBe(true);
      expect(isConfigFile('.env.test')).toBe(true);
    });

    it('identifies Python requirements files', () => {
      expect(isConfigFile('requirements.txt')).toBe(true);
      expect(isConfigFile('requirements-dev.txt')).toBe(true);
      expect(isConfigFile('requirements_test.txt')).toBe(true);
    });

    it('identifies tsconfig and jsconfig variants', () => {
      expect(isConfigFile('tsconfig.app.json')).toBe(true);
      expect(isConfigFile('tsconfig.node.json')).toBe(true);
      expect(isConfigFile('jsconfig.base.json')).toBe(true);
    });

    it('identifies tool configuration files', () => {
      expect(isConfigFile('vite.config.ts')).toBe(true);
      expect(isConfigFile('vitest.config.ts')).toBe(true);
      expect(isConfigFile('next.config.mjs')).toBe(true);
      expect(isConfigFile('tailwind.config.js')).toBe(true);
      expect(isConfigFile('eslint.config.js')).toBe(true);
      expect(isConfigFile('playwright.config.ts')).toBe(true);
    });

    it('identifies RC config files', () => {
      expect(isConfigFile('.eslintrc.json')).toBe(true);
      expect(isConfigFile('.prettierrc')).toBe(true);
      expect(isConfigFile('.babelrc.js')).toBe(true);
    });

    it('identifies standard config extension formats', () => {
      expect(isConfigFile('settings.ini')).toBe(true);
      expect(isConfigFile('supervisord.conf')).toBe(true);
      expect(isConfigFile('setup.cfg')).toBe(true);
      expect(isConfigFile('custom.toml')).toBe(true);
    });

    it('does not classify standard code or documentation as config', () => {
      expect(isConfigFile('src/index.ts')).toBe(false);
      expect(isConfigFile('README.md')).toBe(false);
      expect(isConfigFile('utils/configHelper.ts')).toBe(false);
    });
  });

  describe('isLikelyEntrypoint', () => {
    it('returns false for invalid inputs', () => {
      expect(isLikelyEntrypoint('')).toBe(false);
      expect(isLikelyEntrypoint(null as unknown as string)).toBe(false);
    });

    it('never classifies test files as entrypoints', () => {
      expect(isLikelyEntrypoint('tests/main.test.ts')).toBe(false);
      expect(isLikelyEntrypoint('__tests__/index.ts')).toBe(false);
      expect(isLikelyEntrypoint('src/index.test.ts')).toBe(false);
      expect(isLikelyEntrypoint('test_main.py')).toBe(false);
    });

    it('identifies root container definitions as entrypoints', () => {
      expect(isLikelyEntrypoint('Dockerfile')).toBe(true);
      expect(isLikelyEntrypoint('Dockerfile.prod')).toBe(true);
      expect(isLikelyEntrypoint('Containerfile')).toBe(true);
    });

    it('identifies standard base names with valid code extensions', () => {
      expect(isLikelyEntrypoint('src/server.ts')).toBe(true);
      expect(isLikelyEntrypoint('src/index.js')).toBe(true);
      expect(isLikelyEntrypoint('main.py')).toBe(true);
      expect(isLikelyEntrypoint('app.tsx')).toBe(true);
      expect(isLikelyEntrypoint('cli.ts')).toBe(true);
      expect(isLikelyEntrypoint('bin.js')).toBe(true);
      expect(isLikelyEntrypoint('src/routes.ts')).toBe(true);
      expect(isLikelyEntrypoint('router.js')).toBe(true);
      expect(isLikelyEntrypoint('manage.py')).toBe(true);
      expect(isLikelyEntrypoint('wsgi.py')).toBe(true);
      expect(isLikelyEntrypoint('lib.rs')).toBe(true);
    });

    it('identifies Next.js App and Pages Router conventions', () => {
      expect(isLikelyEntrypoint('pages/_app.tsx')).toBe(true);
      expect(isLikelyEntrypoint('pages/_document.tsx')).toBe(true);
      expect(isLikelyEntrypoint('app/loading.tsx')).toBe(true);
      expect(isLikelyEntrypoint('app/error.tsx')).toBe(true);
      expect(isLikelyEntrypoint('app/not-found.tsx')).toBe(true);
      expect(isLikelyEntrypoint('app/template.tsx')).toBe(true);
    });

    it('identifies files inside entrypoint directories (bin, cmd, routes, cli)', () => {
      expect(isLikelyEntrypoint('bin/cli.sh')).toBe(true);
      expect(isLikelyEntrypoint('bin/start')).toBe(true);
      expect(isLikelyEntrypoint('cmd/api/main.go')).toBe(true);
      expect(isLikelyEntrypoint('src/routes/users.ts')).toBe(true);
      expect(isLikelyEntrypoint('cli/command.ts')).toBe(true);
    });

    it('does not classify standard helper or component files as entrypoints', () => {
      expect(isLikelyEntrypoint('src/utils/tokenCounter.ts')).toBe(false);
      expect(isLikelyEntrypoint('src/components/Header.tsx')).toBe(false);
      expect(isLikelyEntrypoint('src/models/User.ts')).toBe(false);
      expect(isLikelyEntrypoint('docs/index.md')).toBe(false);
    });
  });
});
