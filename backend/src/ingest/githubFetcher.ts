// =============================================================================
// GitUnderstand — GitHub API Fetcher
// Ingests repository metadata, recursive git tree, and prioritized source files
// =============================================================================

import type { ParsedGitHubRef, RepoMetadata } from '../../../shared/types.js';

export interface RawFetchedFile {
  path: string;
  sizeBytes: number;
  sha?: string;
  content: string;
}

export interface GitHubFetchResult {
  metadata: RepoMetadata;
  rawFiles: RawFetchedFile[];
  allTreePaths: string[];
  totalTreeFiles: number;
}

export interface FetchGitHubOptions {
  githubToken?: string;
  maxFilesToFetch?: number;
  maxFileSizeBytes?: number;
  onProgress?: (msg: string, pct: number) => void;
}

interface GitHubRepoResponse {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
  };
  html_url: string;
  description: string | null;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  topics?: string[];
  license?: {
    key: string;
    name: string;
    spdx_id: string;
  } | null;
  homepage?: string | null;
  updated_at: string;
}

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
  url?: string;
}

interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated?: boolean;
}

interface GitHubApiErrorPayload {
  message?: string;
  documentation_url?: string;
}

const DEFAULT_MAX_FILES = 140;
const DEFAULT_MAX_FILE_SIZE_BYTES = 180 * 1024; // 180 KB
const BATCH_SIZE = 16;

const IGNORED_DIRECTORY_PREFIXES = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  'out/',
  '.next/',
  '.turbo/',
  '.cache/',
  'coverage/',
  'vendor/',
  'target/',
  'venv/',
  '.venv/',
  '__pycache__/',
  '.idea/',
  '.vscode/',
  '.svn/',
  '.hg/',
  'Pods/',
  '.yarn/',
];

const IGNORED_EXACT_FILENAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'cargo.lock',
  'poetry.lock',
  'composer.lock',
  'gemfile.lock',
  'go.sum',
  'bun.lockb',
  'flake.lock',
  '.ds_store',
  'thumbs.db',
]);

const IGNORED_EXTENSIONS = new Set([
  // Images & vector
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp', 'tiff', 'heic',
  // Documents & archives
  'pdf', 'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar',
  // Fonts
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  // Audio & video
  'mp3', 'mp4', 'mov', 'wav', 'avi', 'mkv', 'flac', 'ogg',
  // Binaries & compiled artifacts
  'exe', 'dll', 'so', 'dylib', 'bin', 'wasm', 'pyc', 'pyo', 'class', 'jar', 'war',
  // Databases & big data
  'db', 'sqlite', 'sqlite3', 'parquet', 'arrow',
  // Minified, bundles & maps
  'map', 'min.js', 'min.css', 'bundle.js', 'snap', 'snapshot',
]);

/**
 * Handle non-2xx responses from GitHub API with actionable error messages.
 */
async function handleApiError(res: Response, context: string): Promise<never> {
  const status = res.status;
  const remaining = res.headers.get('x-ratelimit-remaining');
  const resetEpoch = res.headers.get('x-ratelimit-reset');

  let resetHint = '';
  if (resetEpoch) {
    const resetTime = new Date(parseInt(resetEpoch, 10) * 1000).toISOString();
    resetHint = ` Rate limit resets at ${resetTime}.`;
  }

  let errorBody = '';
  try {
    const json = (await res.json()) as GitHubApiErrorPayload;
    if (json?.message) {
      errorBody = `: ${json.message}`;
    }
  } catch {
    // Non-JSON response, ignore
  }

  if (status === 404) {
    throw new Error(
      `GitHub repository resource not found (404) while ${context}. If this is a private repository, please configure a valid GitHub Personal Access Token (PAT)${errorBody}.`
    );
  }

  if (status === 403 || status === 429 || remaining === '0') {
    throw new Error(
      `GitHub API rate limit or access forbidden (${status}) while ${context}.${resetHint} Provide a valid GitHub Personal Access Token (PAT) with higher limits${errorBody}.`
    );
  }

  throw new Error(`GitHub API error (${status}) while ${context}${errorBody}`);
}

/**
 * Heuristically scores file paths so high-signal architecture files are ingested first.
 */
function scoreFilePath(path: string): number {
  const lower = path.toLowerCase();
  const filename = lower.split('/').pop() || '';
  let score = 0;

  const isRoot = !path.includes('/');

  // 1. Root manifests and key package definitions (highest architectural signal)
  if (filename === 'package.json') score += isRoot ? 120 : 80;
  else if (filename === 'pyproject.toml' || filename === 'cargo.toml' || filename === 'go.mod') score += isRoot ? 120 : 80;
  else if (filename === 'requirements.txt' || filename === 'setup.py' || filename === 'gemfile' || filename === 'pom.xml' || filename === 'build.gradle') score += isRoot ? 110 : 70;
  else if (filename === 'dockerfile' || filename === 'docker-compose.yml' || filename === 'docker-compose.yaml') score += 75;
  else if (filename === 'tsconfig.json' || filename === 'vite.config.ts' || filename === 'next.config.js' || filename === 'next.config.mjs' || filename === 'next.config.ts') score += 70;

  // 2. Readmes & Architecture documentation
  if (filename.startsWith('readme')) score += isRoot ? 100 : 70;
  else if (filename === 'architecture.md' || filename === 'design.md' || filename === 'contributing.md') score += 80;

  // 3. Known entrypoint names
  if (
    filename === 'index.ts' || filename === 'index.js' || filename === 'index.tsx' ||
    filename === 'main.ts' || filename === 'main.js' || filename === 'main.py' || filename === 'main.go' || filename === 'main.rs' ||
    filename === 'app.ts' || filename === 'app.js' || filename === 'app.tsx' || filename === 'app.py' ||
    filename === 'server.ts' || filename === 'server.js' ||
    filename === 'page.tsx' || filename === 'layout.tsx' ||
    filename === 'mod.rs' || filename === 'lib.rs'
  ) {
    score += 65;
  }

  // 4. High-signal directory paths (src, app, backend, api, studio, lib, etc.)
  if (lower.startsWith('src/') || lower.includes('/src/')) score += 40;
  if (lower.startsWith('app/') || lower.includes('/app/')) score += 35;
  if (lower.startsWith('backend/') || lower.includes('/backend/')) score += 40;
  if (lower.startsWith('api/') || lower.includes('/api/')) score += 35;
  if (lower.startsWith('studio/') || lower.includes('/studio/')) score += 35;
  if (lower.startsWith('lib/') || lower.includes('/lib/')) score += 30;
  if (lower.startsWith('shared/') || lower.includes('/shared/')) score += 35;
  if (lower.startsWith('packages/') || lower.includes('/packages/')) score += 25;
  if (lower.includes('/routes/') || lower.includes('/controllers/') || lower.includes('/services/') || lower.includes('/models/')) score += 25;

  // 5. Code extension preference
  const ext = filename.split('.').pop() || '';
  const primaryCodeExts = new Set([
    'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp',
    'h', 'hpp', 'cs', 'rb', 'php', 'swift', 'kt', 'scala', 'proto',
    'graphql', 'sql', 'prisma',
  ]);

  if (primaryCodeExts.has(ext)) {
    score += 20;
  } else if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml' || ext === 'md') {
    score += 10;
  }

  // 6. Deprioritize tests and test snapshots so production code takes priority
  if (
    lower.includes('.test.') || lower.includes('.spec.') ||
    lower.includes('__tests__') || lower.includes('__mocks__') ||
    lower.includes('/tests/') || lower.includes('/test/')
  ) {
    score -= 30;
  }

  // 7. Depth penalty: slightly favor shallow directories
  const depth = path.split('/').length - 1;
  score -= Math.min(depth * 3, 25);

  return score;
}

/**
 * Filter out binaries, lockfiles, and vendor files.
 */
function shouldIgnoreFile(path: string, size?: number, maxSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES): boolean {
  const lower = path.toLowerCase();
  const filename = lower.split('/').pop() || '';

  // Directory prefix exclusion
  for (const prefix of IGNORED_DIRECTORY_PREFIXES) {
    if (lower.startsWith(prefix) || lower.includes('/' + prefix)) {
      return true;
    }
  }

  // Exact filename exclusion
  if (IGNORED_EXACT_FILENAMES.has(filename)) {
    return true;
  }

  // Extension exclusion
  const ext = filename.split('.').pop() || '';
  if (IGNORED_EXTENSIONS.has(ext)) {
    return true;
  }

  // Compound extensions like .min.js
  if (lower.endsWith('.min.js') || lower.endsWith('.min.css') || lower.endsWith('.bundle.js')) {
    return true;
  }

  // Size limit check
  if (size != null && (size > maxSizeBytes || size === 0)) {
    return true;
  }

  return false;
}

/**
 * Fetches a single file's content via raw.githubusercontent.com,
 * with fallback to the GitHub Git Blob API for private repositories.
 */
async function fetchSingleFile(
  owner: string,
  repo: string,
  branch: string,
  item: GitHubTreeItem,
  token?: string
): Promise<RawFetchedFile | null> {
  const encodedBranch = encodeURIComponent(branch);
  const encodedPath = item.path.split('/').map(encodeURIComponent).join('/');
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodedBranch}/${encodedPath}`;

  const headers: Record<string, string> = {
    'User-Agent': 'GitUnderstand-Fetcher/3.0',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let textContent: string | null = null;

  try {
    const rawRes = await fetch(rawUrl, { headers });
    if (rawRes.ok) {
      textContent = await rawRes.text();
    } else if (item.sha) {
      // Fallback to GitHub Git Blob API (handles private repositories or raw CDN anomalies)
      const blobUrl = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${item.sha}`;
      const blobHeaders: Record<string, string> = {
        'User-Agent': 'GitUnderstand-Fetcher/3.0',
        'Accept': 'application/vnd.github.raw+json, application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (token) {
        blobHeaders['Authorization'] = `Bearer ${token}`;
      }

      const blobRes = await fetch(blobUrl, { headers: blobHeaders });
      if (blobRes.ok) {
        const contentType = blobRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = (await blobRes.json()) as { content?: string; encoding?: string };
          if (json.content && json.encoding === 'base64') {
            textContent = Buffer.from(json.content, 'base64').toString('utf-8');
          } else if (typeof json.content === 'string') {
            textContent = json.content;
          }
        } else {
          textContent = await blobRes.text();
        }
      }
    }
  } catch {
    // If an individual file fails, return null so batch processing continues
    return null;
  }

  if (textContent === null) {
    return null;
  }

  // Reject binary files (contains null bytes in leading sample)
  if (textContent.slice(0, 1000).includes('\0')) {
    return null;
  }

  return {
    path: item.path,
    sizeBytes: Buffer.byteLength(textContent, 'utf-8'),
    sha: item.sha,
    content: textContent,
  };
}

/**
 * Fetches repository metadata, recursive git tree, and prioritized source files
 * from GitHub REST and raw content endpoints.
 */
export async function fetchGitHubRepository(
  ref: ParsedGitHubRef,
  options?: FetchGitHubOptions
): Promise<GitHubFetchResult> {
  const token = options?.githubToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const maxFiles = options?.maxFilesToFetch ?? DEFAULT_MAX_FILES;
  const maxSizeBytes = options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  const authHeaders: Record<string, string> = {
    'User-Agent': 'GitUnderstand-Fetcher/3.0',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }

  // 1. Fetch Repository Metadata
  options?.onProgress?.(`Fetching repository metadata for ${ref.owner}/${ref.repo}...`, 5);
  const repoUrl = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;
  const repoRes = await fetch(repoUrl, { headers: authHeaders });

  if (!repoRes.ok) {
    await handleApiError(repoRes, `fetching metadata for "${ref.owner}/${ref.repo}"`);
  }

  const repoData = (await repoRes.json()) as GitHubRepoResponse;

  // Fetch languages in parallel or sequentially
  let languages: Record<string, number> = {};
  try {
    const langUrl = `https://api.github.com/repos/${ref.owner}/${ref.repo}/languages`;
    const langRes = await fetch(langUrl, { headers: authHeaders });
    if (langRes.ok) {
      languages = (await langRes.json()) as Record<string, number>;
    }
  } catch {
    // Languages is non-fatal
  }

  const defaultBranch = repoData.default_branch || 'main';
  const targetBranch = ref.branch && ref.branch.trim().length > 0 ? ref.branch.trim() : defaultBranch;

  const primaryLanguage = repoData.language || Object.keys(languages)[0] || 'Unknown';
  if (Object.keys(languages).length === 0 && primaryLanguage !== 'Unknown') {
    languages[primaryLanguage] = 1;
  }

  const metadata: RepoMetadata = {
    id: `${repoData.owner.login}__${repoData.name}__${targetBranch}`,
    owner: repoData.owner.login,
    name: repoData.name,
    fullName: repoData.full_name || `${repoData.owner.login}/${repoData.name}`,
    description: repoData.description || '',
    defaultBranch,
    branch: targetBranch,
    stars: repoData.stargazers_count ?? 0,
    forks: repoData.forks_count ?? 0,
    openIssues: repoData.open_issues_count ?? 0,
    primaryLanguage,
    languages,
    topics: Array.isArray(repoData.topics) ? repoData.topics : [],
    license: repoData.license?.spdx_id || repoData.license?.name || undefined,
    htmlUrl: repoData.html_url || `https://github.com/${repoData.owner.login}/${repoData.name}`,
    homepage: repoData.homepage || undefined,
    updatedAt: repoData.updated_at || new Date().toISOString(),
    isPrivate: Boolean(repoData.private),
    isShowcase: false,
  };

  options?.onProgress?.(`Loaded metadata for ${metadata.fullName}`, 15);

  // 2. Fetch Recursive Git Tree
  options?.onProgress?.(`Fetching git tree for branch "${targetBranch}"...`, 20);
  const treeUrl = `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(targetBranch)}?recursive=1`;
  const treeRes = await fetch(treeUrl, { headers: authHeaders });

  if (!treeRes.ok) {
    await handleApiError(treeRes, `fetching git tree for "${ref.owner}/${ref.repo}" on branch "${targetBranch}"`);
  }

  const treeData = (await treeRes.json()) as GitHubTreeResponse;
  const allTreeItems = Array.isArray(treeData.tree) ? treeData.tree : [];
  const blobItems = allTreeItems.filter(item => item.type === 'blob');

  const allTreePaths = blobItems.map(b => b.path);
  const totalTreeFiles = allTreePaths.length;

  // Filter for subpath if requested
  let candidateBlobs = blobItems;
  if (ref.subpath) {
    const normSubpath = ref.subpath.replace(/^\/+|\/+$/g, '');
    if (normSubpath) {
      const subpathBlobs = blobItems.filter(
        b => b.path === normSubpath || b.path.startsWith(normSubpath + '/')
      );
      if (subpathBlobs.length > 0) {
        candidateBlobs = subpathBlobs;
      }
    }
  }

  // 3. Filter and Prioritize High-Signal Files
  const eligibleFiles = candidateBlobs.filter(
    item => !shouldIgnoreFile(item.path, item.size, maxSizeBytes)
  );

  eligibleFiles.sort((a, b) => {
    const scoreDiff = scoreFilePath(b.path) - scoreFilePath(a.path);
    if (scoreDiff !== 0) return scoreDiff;
    return a.path.localeCompare(b.path);
  });

  const selectedFiles = eligibleFiles.slice(0, maxFiles);

  options?.onProgress?.(
    `Prioritized ${selectedFiles.length} high-signal source files from ${totalTreeFiles} repository files...`,
    30
  );

  if (selectedFiles.length === 0) {
    options?.onProgress?.('No eligible source files found to fetch', 100);
    return {
      metadata,
      rawFiles: [],
      allTreePaths,
      totalTreeFiles,
    };
  }

  // 4. Concurrently fetch file contents in batches of 16
  const rawFiles: RawFetchedFile[] = [];
  let completedCount = 0;

  for (let i = 0; i < selectedFiles.length; i += BATCH_SIZE) {
    const batch = selectedFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(file => fetchSingleFile(metadata.owner, metadata.name, metadata.branch, file, token))
    );

    for (const fetched of results) {
      if (fetched && fetched.content.length > 0) {
        rawFiles.push(fetched);
      }
    }

    completedCount += batch.length;
    const progressPct = Math.min(95, 30 + Math.round((completedCount / selectedFiles.length) * 65));
    options?.onProgress?.(
      `Fetched ${Math.min(completedCount, selectedFiles.length)} of ${selectedFiles.length} files...`,
      progressPct
    );
  }

  options?.onProgress?.(`Successfully fetched ${rawFiles.length} source files`, 100);

  return {
    metadata,
    rawFiles,
    allTreePaths,
    totalTreeFiles,
  };
}
