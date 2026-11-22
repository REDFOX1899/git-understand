/**
 * =============================================================================
 * GitUnderstand — File & Glob Filter Engine
 * utils/fileFilter.ts
 *
 * High-performance file filtering, glob-to-regex compilation with ReDoS
 * protection, and classification helpers for codebase ingestion, digests,
 * and visual atlas synthesis.
 * =============================================================================
 */

import type { DigestFilterOptions } from '../../../shared/types.js';

/**
 * Standard binary file extensions across images, audio, video, fonts,
 * compiled binaries, archives, and machine learning models.
 */
export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set<string>([
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.tif',
  '.avif',
  '.heic',
  '.psd',
  '.ai',
  '.sketch',
  '.fig',

  // Fonts
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',

  // Documents & Archives
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.7z',
  '.rar',
  '.bz2',
  '.xz',
  '.zst',
  '.jar',
  '.war',

  // Audio & Video
  '.mp4',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.flac',
  '.aac',
  '.mov',
  '.avi',
  '.webm',
  '.mkv',
  '.wmv',
  '.flv',
  '.m4v',

  // Executables & Compiled Binaries
  '.wasm',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.iso',
  '.dmg',
  '.class',
  '.o',
  '.obj',
  '.pyc',
  '.pyo',
  '.pyd',
  '.node',

  // Database files & serialized ML weights
  '.parquet',
  '.arrow',
  '.feather',
  '.sqlite',
  '.sqlite3',
  '.db',
  '.mdb',
  '.pickle',
  '.pkl',
  '.h5',
  '.hdf5',
  '.onnx',
  '.pt',
  '.pth',
  '.safetensors',
]);

/**
 * Common directory names that should be ignored by default during repo scans.
 */
export const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set<string>([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  '.svelte-kit',
  'out',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.cache',
  'coverage',
  '.nyc_output',
  'bower_components',
  'vendor',
]);

/**
 * Standard lockfiles and OS metadata files that should be ignored by default.
 */
export const KNOWN_LOCKFILES: ReadonlySet<string> = new Set<string>([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'uv.lock',
  'bun.lockb',
  'cargo.lock',
  'poetry.lock',
  'pipfile.lock',
  'composer.lock',
  'flake.lock',
]);

/**
 * Default glob patterns for ignoring dependencies, build artifacts,
 * lockfiles, binaries, minified bundles, and OS metadata.
 */
export const DEFAULT_IGNORE_PATTERNS: string[] = [
  // Version control & virtual environments
  '**/.git/**',
  '**/.git',
  '.git/**',
  '.git',
  '**/.svn/**',
  '**/.hg/**',
  '**/.venv/**',
  '.venv/**',
  '.venv',
  '**/venv/**',
  '**/env/**',
  '**/.env',
  '**/.env.*',

  // Dependencies and packages
  '**/node_modules/**',
  'node_modules/**',
  'node_modules',
  '**/bower_components/**',
  '**/vendor/**',

  // Build outputs and caches
  '**/dist/**',
  'dist/**',
  'dist',
  '**/build/**',
  'build/**',
  'build',
  '**/.next/**',
  '.next/**',
  '.next',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.turbo/**',
  '**/.svelte-kit/**',
  '**/out/**',
  '**/target/**',
  '**/__pycache__/**',
  '__pycache__/**',
  '__pycache__',
  '**/*.pyc',
  '**/*.pyo',
  '**/.pytest_cache/**',
  '**/.mypy_cache/**',
  '**/.ruff_cache/**',
  '**/.cache/**',
  '**/coverage/**',
  '**/.nyc_output/**',

  // Lockfiles
  '**/package-lock.json',
  'package-lock.json',
  '**/yarn.lock',
  'yarn.lock',
  '**/pnpm-lock.yaml',
  'pnpm-lock.yaml',
  '**/uv.lock',
  'uv.lock',
  '**/bun.lockb',
  'bun.lockb',
  '**/Cargo.lock',
  'Cargo.lock',
  '**/poetry.lock',
  'poetry.lock',
  '**/Pipfile.lock',
  'Pipfile.lock',
  '**/composer.lock',
  'composer.lock',
  '**/flake.lock',
  'flake.lock',

  // Binaries, media, and fonts
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.webp',
  '**/*.ico',
  '**/*.pdf',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.tgz',
  '**/*.7z',
  '**/*.rar',
  '**/*.mp4',
  '**/*.mp3',
  '**/*.wav',
  '**/*.ogg',
  '**/*.m4a',
  '**/*.mov',
  '**/*.avi',
  '**/*.webm',
  '**/*.wasm',
  '**/*.woff',
  '**/*.woff2',
  '**/*.ttf',
  '**/*.otf',
  '**/*.eot',
  '**/*.exe',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',
  '**/*.bin',
  '**/*.iso',
  '**/*.dmg',
  '**/*.parquet',

  // Minified files and source maps
  '**/*.min.js',
  '**/*.min.mjs',
  '**/*.min.cjs',
  '**/*.min.css',
  '**/*.map',

  // OS artifacts
  '**/.DS_Store',
  '.DS_Store',
  '**/Thumbs.db',
  'Thumbs.db',
];

/**
 * Cache for compiled glob Regular Expressions to avoid recompilation overhead
 * during high-volume directory traversals.
 */
const regexCache = new Map<string, RegExp>();
const MAX_REGEX_CACHE_SIZE = 1000;

/**
 * Safely converts a glob pattern string into a RegExp with strict ReDoS protection.
 * Supports:
 * - `**` (recursive directory matching without catastrophic backtracking)
 * - `*` (single segment wildcard matching non-slash characters)
 * - `?` (single character non-slash wildcard)
 * - `{a,b,c}` (brace expansion alternatives)
 * - Directory prefixes (e.g. `node_modules/`, `dist`, `.git`)
 *
 * @param glob The glob pattern to compile
 * @returns A safe, anchored RegExp
 */
export function globToRegExp(glob: string): RegExp {
  if (!glob || typeof glob !== 'string') {
    return /^$/;
  }

  const cached = regexCache.get(glob);
  if (cached) {
    return cached;
  }

  let p = glob.trim().replace(/\\/g, '/');

  // Strip redundant leading ./
  while (p.startsWith('./')) {
    p = p.slice(2);
  }

  const isRootAnchored = p.startsWith('/');
  if (isRootAnchored) {
    p = p.slice(1);
  }

  // If pattern ends with '/', e.g. 'node_modules/' or 'dist/'
  if (p.endsWith('/')) {
    p = p + '**';
  }

  // Check if pattern contains a slash (excluding any trailing slash we appended)
  const hasSlash = p.includes('/');
  const matchAnywhere = !hasSlash && !isRootAnchored;

  // Collapse consecutive redundant wildcards to prevent ReDoS
  p = p.replace(/\*\*\/(\*\*\/)+/g, '**/');
  p = p.replace(/(\*\*){2,}/g, '**');

  let regexStr = '';
  let i = 0;
  const n = p.length;

  // Prefix handling
  if (p.startsWith('**/')) {
    regexStr += '(?:^|.*/)';
    i = 3;
  } else if (matchAnywhere) {
    regexStr += '(?:^|.*/)';
  }

  while (i < n) {
    const c = p[i];

    if (c === '*' && p[i + 1] === '*') {
      // Encountered double-star '**'
      if (i + 2 === n) {
        // Ends with '**'
        if (regexStr.endsWith('/')) {
          regexStr = regexStr.slice(0, -1) + '(?:/.*)?';
        } else {
          regexStr += '.*';
        }
        i += 2;
      } else if (p[i + 2] === '/') {
        // '**/' in the middle of a pattern
        if (regexStr.endsWith('/')) {
          // Zero or more path segments: delimited by slashes to prevent backtracking
          regexStr += '(?:[^/]+/)*';
        } else {
          regexStr += '(?:^|.*/)';
        }
        i += 3;
      } else {
        regexStr += '.*';
        i += 2;
      }
    } else if (c === '*') {
      // Single-star: any character within a single path segment
      regexStr += '[^/]*';
      i++;
    } else if (c === '?') {
      // Single character non-slash
      regexStr += '[^/]';
      i++;
    } else if (c === '{') {
      // Brace expansion: {ts,tsx,js}
      const closeIdx = p.indexOf('}', i);
      if (closeIdx !== -1) {
        const inner = p.slice(i + 1, closeIdx);
        if (inner.includes(',')) {
          const parts = inner.split(',').map((part) =>
            part.trim().replace(/[.+^$(){}[\]\\]/g, '\\$&')
          );
          regexStr += `(?:${parts.join('|')})`;
          i = closeIdx + 1;
          continue;
        }
      }
      regexStr += '\\{';
      i++;
    } else if ('[].+^$()|\\'.includes(c)) {
      // Escape regex special characters
      regexStr += '\\' + c;
      i++;
    } else {
      regexStr += c;
      i++;
    }
  }

  // Directory prefix match: if plain folder without extension or wildcards (e.g. node_modules, dist, .git)
  if (
    !p.includes('*') &&
    !p.includes('?') &&
    !p.includes('{') &&
    (IGNORED_DIRECTORIES.has(p) || !p.includes('.'))
  ) {
    regexStr += '(?:/.*)?';
  }

  const compiled = new RegExp(`^${regexStr}$`);

  if (regexCache.size < MAX_REGEX_CACHE_SIZE) {
    regexCache.set(glob, compiled);
  }

  return compiled;
}

/**
 * Normalizes a file path for consistent matching across POSIX and Windows.
 */
function normalizePath(filePath: string): string {
  let normalized = filePath.trim().replace(/\\/g, '/');
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  while (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

/**
 * Evaluates whether a given file path is a known binary file, a minified asset,
 * or matches default repository ignore patterns (dependencies, VCS, caches, etc.).
 *
 * @param filePath Path of the file to check
 * @returns true if the file should be skipped as binary or ignored
 */
export function isBinaryOrIgnoredPath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return true;
  }

  const normalized = normalizePath(filePath);
  if (!normalized) {
    return true;
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) {
    return true;
  }

  const filename = segments[segments.length - 1];
  const lowerName = filename.toLowerCase();

  // 1. Check parent directory segments for ignored directories
  for (let i = 0; i < segments.length - 1; i++) {
    if (IGNORED_DIRECTORIES.has(segments[i])) {
      return true;
    }
  }

  // 2. If path target itself is an ignored directory name
  if (IGNORED_DIRECTORIES.has(filename)) {
    return true;
  }

  // 3. Check known lockfiles and OS artifacts
  if (KNOWN_LOCKFILES.has(lowerName) || lowerName === '.ds_store' || lowerName === 'thumbs.db') {
    return true;
  }

  // 4. Check minified bundles and source maps
  if (
    lowerName.endsWith('.min.js') ||
    lowerName.endsWith('.min.mjs') ||
    lowerName.endsWith('.min.cjs') ||
    lowerName.endsWith('.min.css') ||
    lowerName.endsWith('.map') ||
    lowerName.endsWith('.bundle.js')
  ) {
    return true;
  }

  // 5. Check binary extensions
  const dotIdx = lowerName.lastIndexOf('.');
  if (dotIdx >= 0) {
    const ext = lowerName.slice(dotIdx);
    if (BINARY_EXTENSIONS.has(ext)) {
      return true;
    }
  }

  // 6. Check against full DEFAULT_IGNORE_PATTERNS list for pattern-based matches
  for (const pattern of DEFAULT_IGNORE_PATTERNS) {
    if (globToRegExp(pattern).test(normalized)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a file path matches inclusion and exclusion glob rules.
 * - Exclusion patterns take precedence: if any matches, false is returned.
 * - Inclusion patterns: if specified and non-empty, path must match at least one.
 * - If inclusion patterns are omitted or empty, path is included (unless excluded).
 *
 * @param filePath The file path to test
 * @param includePatterns Optional array of glob patterns to include
 * @param excludePatterns Optional array of glob patterns to exclude
 * @returns true if the file path is accepted by the filter
 */
export function matchesFilter(
  filePath: string,
  includePatterns?: string[],
  excludePatterns?: string[]
): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  const normalized = normalizePath(filePath);
  if (!normalized) {
    return false;
  }

  // 1. Exclude patterns take strict precedence
  if (excludePatterns && excludePatterns.length > 0) {
    for (const pattern of excludePatterns) {
      if (!pattern || typeof pattern !== 'string') continue;
      if (globToRegExp(pattern).test(normalized)) {
        return false;
      }
    }
  }

  // 2. Include patterns: must match at least one if provided and non-empty
  if (includePatterns && includePatterns.length > 0) {
    let matchedAny = false;
    for (const pattern of includePatterns) {
      if (!pattern || typeof pattern !== 'string') continue;
      if (globToRegExp(pattern).test(normalized)) {
        matchedAny = true;
        break;
      }
    }
    return matchedAny;
  }

  // Default: pass when not excluded
  return true;
}

/**
 * Determines whether a file path belongs to automated tests, test fixtures,
 * mocks, end-to-end suites, or testing runners across languages.
 *
 * @param filePath Path of the file
 * @returns true if the file is identified as a test file
 */
export function isTestFile(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  const normalized = normalizePath(filePath).toLowerCase();
  const segments = normalized.split('/').filter(Boolean);
  const filename = segments.pop() || '';

  // 1. Test directory detection
  for (const seg of segments) {
    if (
      seg === '__tests__' ||
      seg === 'tests' ||
      seg === 'test' ||
      seg === 'specs' ||
      seg === 'spec' ||
      seg === '__mocks__' ||
      seg === 'cypress' ||
      seg === 'e2e' ||
      seg === 'playwright'
    ) {
      return true;
    }
  }

  // 2. JavaScript / TypeScript testing frameworks
  if (
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filename) ||
    /\.cy\.(ts|js|jsx|tsx)$/i.test(filename) ||
    /\.e2e\.(ts|js|jsx|tsx)$/i.test(filename)
  ) {
    return true;
  }

  // 3. Python: test_*.py, *_test.py, conftest.py
  if (
    filename === 'conftest.py' ||
    /^test_.+\.py$/i.test(filename) ||
    /^.+_test\.py$/i.test(filename)
  ) {
    return true;
  }

  // 4. Go: *_test.go
  if (/^.+_test\.go$/i.test(filename)) {
    return true;
  }

  // 5. Rust: tests.rs, *_test.rs
  if (filename === 'tests.rs' || /^.+_test\.rs$/i.test(filename)) {
    return true;
  }

  // 6. Java / Kotlin / C# / PHP: *Test.*, *Tests.*, *TestCase.*
  if (/(Test|Tests|TestCase)\.(java|kt|scala|cs|php)$/i.test(filename)) {
    return true;
  }

  return false;
}

/**
 * Set of exact filenames that represent configuration manifests across ecosystems.
 */
const CONFIG_FILENAMES: ReadonlySet<string> = new Set<string>([
  'package.json',
  'tsconfig.json',
  'jsconfig.json',
  'dockerfile',
  'containerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  '.dockerignore',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.npmrc',
  '.nvmrc',
  '.node-version',
  '.tool-versions',
  'cargo.toml',
  'pyproject.toml',
  'setup.cfg',
  'setup.py',
  'pipfile',
  'pipfile.lock',
  'tox.ini',
  'flake8',
  '.flake8',
  'ruff.toml',
  '.ruff.toml',
  'go.mod',
  'go.sum',
  'gemfile',
  'rakefile',
  'pom.xml',
  'build.gradle',
  'settings.gradle',
  'build.gradle.kts',
  'settings.gradle.kts',
  'vercel.json',
  'netlify.toml',
  'fly.toml',
  'app.yaml',
  'procfile',
  'render.yaml',
  'wrangler.toml',
  'turbo.json',
  'nx.json',
  'lerna.json',
  'components.json',
]);

/**
 * Determines whether a file path represents a project configuration, tooling
 * manifest, build definition, or environment declaration.
 *
 * @param filePath Path of the file
 * @returns true if the file is identified as a config file
 */
export function isConfigFile(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  const normalized = normalizePath(filePath);
  const segments = normalized.split('/').filter(Boolean);
  const filename = segments.pop() || '';
  const lowerName = filename.toLowerCase();

  // GitHub Actions workflow files
  if (normalized.includes('.github/workflows/')) {
    return true;
  }

  // Exact configuration filenames
  if (CONFIG_FILENAMES.has(lowerName)) {
    return true;
  }

  // Environment variables: .env, .env.local, .env.example, etc.
  if (lowerName === '.env' || lowerName.startsWith('.env.')) {
    return true;
  }

  // Python requirements files: requirements.txt, requirements-dev.txt, etc.
  if (/^requirements(-[a-z0-9_-]+)?\.txt$/i.test(lowerName)) {
    return true;
  }

  // TypeScript / JavaScript tsconfig and jsconfig variants
  if (/^(tsconfig|jsconfig)\..*\.json$/i.test(lowerName)) {
    return true;
  }

  // Docker variants: docker-compose.*.yml, Dockerfile.*
  if (/^docker-compose(\.[a-z0-9_-]+)?\.(ya?ml)$/i.test(lowerName)) {
    return true;
  }
  if (/^dockerfile(\.[a-z0-9_-]+)?$/i.test(lowerName)) {
    return true;
  }

  // Tool configurations: <tool>.config.<ext>
  if (
    /^(vite|vitest|next|webpack|rollup|tailwind|postcss|eslint|prettier|jest|playwright|cypress|babel|metro|rspack|turbo)\.config\.[a-z0-9]+$/i.test(
      lowerName
    )
  ) {
    return true;
  }

  // RC configuration files: .eslintrc*, .prettierrc*, .babelrc*, .stylelintrc*
  if (/^\.(eslint|prettier|babel|stylelint)rc(\.[a-z0-9]+)?$/i.test(lowerName)) {
    return true;
  }

  // Standard configuration extensions
  const dotIdx = lowerName.lastIndexOf('.');
  if (dotIdx > 0) {
    const ext = lowerName.slice(dotIdx);
    if (ext === '.toml' || ext === '.ini' || ext === '.cfg' || ext === '.conf') {
      return true;
    }
  }

  return false;
}

/**
 * Standard entrypoint base names across web frameworks, services, and CLI tools.
 */
const ENTRYPOINT_BASE_NAMES: ReadonlySet<string> = new Set<string>([
  'server',
  'index',
  'main',
  'app',
  'page',
  'layout',
  'route',
  'routes',
  'router',
  'cli',
  'bin',
  'handler',
  'manage',
  'wsgi',
  'asgi',
  'run',
  'lib', // Rust lib.rs
]);

/**
 * Detects if a file is likely an application entrypoint, main server module,
 * CLI executable, routing hub, or top-level framework layout/page.
 *
 * @param filePath Path of the file
 * @returns true if the file is likely an entrypoint
 */
export function isLikelyEntrypoint(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Test files should never be classified as entrypoints
  if (isTestFile(filePath)) {
    return false;
  }

  const normalized = normalizePath(filePath);
  const segments = normalized.split('/').filter(Boolean);
  const filename = segments.pop() || '';
  const lowerName = filename.toLowerCase();

  // Dockerfile and Containerfile represent root container entrypoints
  if (
    lowerName === 'dockerfile' ||
    lowerName.startsWith('dockerfile.') ||
    lowerName === 'containerfile'
  ) {
    return true;
  }

  const dotIdx = lowerName.lastIndexOf('.');
  const baseNoExt = dotIdx > 0 ? lowerName.slice(0, dotIdx) : lowerName;
  const ext = dotIdx > 0 ? lowerName.slice(dotIdx) : '';

  // Recognizable code file extensions
  const isCodeFile = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.py',
    '.go',
    '.rs',
    '.rb',
    '.php',
    '.java',
    '.c',
    '.cpp',
    '.cs',
    '.swift',
    '.kt',
  ].includes(ext);

  // 1. Matches standard entrypoint base name with code extension
  if (ENTRYPOINT_BASE_NAMES.has(baseNoExt) && isCodeFile) {
    return true;
  }

  // 2. Next.js App / Pages Router conventions
  if (
    ['_app', '_document', 'template', 'error', 'loading', 'not-found'].includes(baseNoExt) &&
    ['.tsx', '.ts', '.jsx', '.js'].includes(ext)
  ) {
    return true;
  }

  // 3. Files residing directly in bin/, cmd/, or routes/ directories
  for (const seg of segments) {
    const lowerSeg = seg.toLowerCase();
    if (
      lowerSeg === 'bin' ||
      lowerSeg === 'cmd' ||
      lowerSeg === 'routes' ||
      lowerSeg === 'cli'
    ) {
      if (
        isCodeFile ||
        ext === '.sh' ||
        ext === '.bash' ||
        ext === ''
      ) {
        return true;
      }
    }
  }

  return false;
}
