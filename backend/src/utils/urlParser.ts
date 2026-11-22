// =============================================================================
// GitUnderstand (git-understand.com) — GitHub URL & Ref Parser
// Production-grade parser for GitHub URLs, drop-in proxies, and bare slugs.
// =============================================================================

import type { ParsedGitHubRef } from '../../../shared/types.js';

/**
 * Valid character pattern for GitHub repository owners and repository names.
 * Strictly enforces alphanumeric characters, hyphens, periods, and underscores.
 */
const VALID_IDENTIFIER_PATTERN = /^[A-Za-z0-9_.-]+$/;

/**
 * Recognized supported hosts for GitHub repositories and seamless drop-in replacements.
 */
const SUPPORTED_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'git-understand.com',
  'www.git-understand.com',
  'gitingest.com',
  'www.gitingest.com',
  'gitdiagram.com',
  'www.gitdiagram.com',
  'deepwiki.com',
  'www.deepwiki.com',
  'localhost',
  '127.0.0.1',
]);

/**
 * Validates whether a hostname belongs to GitHub, GitUnderstand, or an authorized drop-in proxy.
 */
function isSupportedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (SUPPORTED_HOSTS.has(host)) {
    return true;
  }
  if (
    host.endsWith('.git-understand.com') ||
    host.endsWith('.git-understand.vercel.app') ||
    host.endsWith('.github.com')
  ) {
    return true;
  }
  return false;
}

/**
 * Strictly validates an owner or repo identifier against /^[A-Za-z0-9_.-]+$/
 * and explicitly guards against path traversal ("..") and reserved segments.
 */
function validateIdentifier(kind: 'owner' | 'repo', value: string): void {
  if (!value || typeof value !== 'string') {
    throw new Error(`Invalid GitHub repository ${kind}: value cannot be empty`);
  }

  // Explicit path traversal check
  if (value.includes('..')) {
    throw new Error(
      `Invalid GitHub repository ${kind} "${value}": path traversal ("..") is strictly forbidden`,
    );
  }

  // Strict regex match
  if (!VALID_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      `Invalid GitHub repository ${kind} "${value}": must contain only alphanumeric characters, periods, underscores, or hyphens`,
    );
  }

  // Guard against reserved single dot
  if (value === '.') {
    throw new Error(
      `Invalid GitHub repository ${kind} "${value}": reserved directory segment`,
    );
  }
}

/**
 * Validates branch and subpath strings to prevent directory traversal attacks.
 */
function validateSafePath(kind: 'branch' | 'subpath', value: string): void {
  if (value.includes('..')) {
    throw new Error(
      `Invalid repository ${kind} "${value}": path traversal ("..") is strictly forbidden`,
    );
  }
}

/**
 * Parses and normalizes various forms of GitHub inputs, including:
 * 1. Standard GitHub URLs: https://github.com/owner/repo (.git or trailing /)
 * 2. Tree and blob subpaths: https://github.com/owner/repo/tree/branch/sub/path or /blob/branch/file
 * 3. GitUnderstand URLs: https://git-understand.com/owner/repo and https://git-understand.com/owner/repo.md
 * 4. Drop-in replacements: gitingest.com/owner/repo, gitdiagram.com/owner/repo, deepwiki.com/owner/repo
 * 5. Bare inputs: owner/repo, owner/repo@branch, owner/repo.md
 *
 * @param rawInput The raw input string from user, URL bar, or API
 * @returns ParsedGitHubRef containing validated owner, repo, optional branch/subpath, and flags
 * @throws Error on invalid inputs, missing owner/repo, path traversal, or unsupported hosts
 */
export function parseGitHubInput(rawInput: string): ParsedGitHubRef {
  if (typeof rawInput !== 'string') {
    throw new Error('Input must be a string');
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Input URL or repository slug cannot be empty');
  }

  // Strict path traversal rejection (checks both literal and encoded variants like %2e%2e)
  const decodedEarly = (() => {
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  })();
  if (
    trimmed.includes('..') ||
    decodedEarly.includes('..') ||
    /%2e%2e/i.test(trimmed)
  ) {
    throw new Error('Path traversal sequence ("..") is strictly forbidden in GitHub inputs');
  }

  let isMarkdownRequest = false;
  let workStr = trimmed;

  // 1. Handle SSH format (e.g. git@github.com:owner/repo.git or git@github.com:owner/repo)
  if (workStr.startsWith('git@')) {
    workStr = workStr.replace(/^git@[^:]+:/, 'https://github.com/');
  }

  // 2. Normalize schema-relative or protocol-less domains (e.g. //github.com/...)
  if (workStr.startsWith('//')) {
    workStr = `https:${workStr}`;
  }

  let pathname = '';
  let extractedBranch: string | undefined;
  let extractedSubpath: string | undefined;

  // Check if input is an HTTP(S) URL or begins with a known domain
  const hasProtocol = /^https?:\/\//i.test(workStr);
  let urlCandidate = workStr;

  if (!hasProtocol) {
    const firstSlash = workStr.indexOf('/');
    const possibleHost =
      firstSlash !== -1 ? workStr.slice(0, firstSlash).toLowerCase() : '';
    if (possibleHost && isSupportedHost(possibleHost)) {
      urlCandidate = `https://${workStr}`;
    }
  }

  if (/^https?:\/\//i.test(urlCandidate)) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlCandidate);
    } catch {
      throw new Error(`Invalid URL format: "${trimmed}"`);
    }

    if (!isSupportedHost(parsedUrl.hostname)) {
      throw new Error(
        `Unsupported host "${parsedUrl.hostname}". Only GitHub (github.com), GitUnderstand, and compatible services (GitIngest, GitDiagram, DeepWiki) are supported.`,
      );
    }

    pathname = parsedUrl.pathname;

    // Check query params for markdown request indicator
    if (
      parsedUrl.searchParams.get('format') === 'md' ||
      parsedUrl.searchParams.has('markdown')
    ) {
      isMarkdownRequest = true;
    }

    // Check hash for branch (e.g. https://github.com/owner/repo.git#main)
    if (parsedUrl.hash) {
      const h = parsedUrl.hash.replace(/^#/, '').trim();
      if (h) {
        extractedBranch = h;
      }
    }
  } else {
    // Bare input (e.g. owner/repo, owner/repo@branch, owner/repo@branch:subpath, owner/repo.md)
    const [pathWithoutQuery, ...queryParts] = workStr.split('?');
    const [cleanPath, ...hashParts] = pathWithoutQuery.split('#');

    if (queryParts.length > 0) {
      const q = queryParts.join('?');
      if (q.includes('format=md') || q.includes('markdown')) {
        isMarkdownRequest = true;
      }
    }
    if (hashParts.length > 0) {
      const h = hashParts.join('#').trim();
      if (h) {
        extractedBranch = h;
      }
    }

    let bareTarget = cleanPath;

    // Handle @branch syntax before splitting path segments
    if (bareTarget.includes('@')) {
      const atIdx = bareTarget.indexOf('@');
      const branchAndSubpath = bareTarget.slice(atIdx + 1);
      bareTarget = bareTarget.slice(0, atIdx);

      if (branchAndSubpath.includes(':')) {
        const colonIdx = branchAndSubpath.indexOf(':');
        extractedBranch = branchAndSubpath.slice(0, colonIdx);
        extractedSubpath = branchAndSubpath.slice(colonIdx + 1);
      } else {
        extractedBranch = branchAndSubpath;
      }
    } else if (bareTarget.includes(':')) {
      // Handle :subpath syntax attached directly to repo (e.g. owner/repo:sub/path)
      const colonIdx = bareTarget.indexOf(':');
      extractedSubpath = bareTarget.slice(colonIdx + 1);
      bareTarget = bareTarget.slice(0, colonIdx);
    }

    pathname = bareTarget;
  }

  // Remove leading and trailing slashes
  pathname = pathname.replace(/^\/+|\/+$/g, '');

  if (!pathname) {
    throw new Error('Invalid GitHub repository path: expected format "owner/repo"');
  }

  const rawSegments = pathname.split('/').filter(Boolean);
  if (rawSegments.length < 2) {
    throw new Error(
      `Invalid GitHub repository path "${pathname}": expected at least "owner/repo"`,
    );
  }

  let owner = rawSegments[0];
  let repo = rawSegments[1];
  let branch: string | undefined = extractedBranch;
  let subpath: string | undefined = extractedSubpath;

  // Process /tree/ or /blob/ structures if not already extracted
  if (rawSegments.length >= 3 && !branch && !subpath) {
    const action = rawSegments[2];
    if (action === 'tree' || action === 'blob') {
      if (rawSegments.length > 3) {
        branch = rawSegments[3];
      }
      if (rawSegments.length > 4) {
        subpath = rawSegments.slice(4).join('/');
      }
    } else {
      // Direct subpath without tree/blob (e.g. owner/repo/src/index.ts)
      subpath = rawSegments.slice(2).join('/');
    }
  }

  // Handle @branch syntax inside repo segment if still present
  if (repo.includes('@')) {
    const atIndex = repo.indexOf('@');
    const branchPart = repo.slice(atIndex + 1);
    repo = repo.slice(0, atIndex);
    if (!branch && branchPart) {
      branch = branchPart;
    }
  }

  // Strip .git suffix from repo
  if (repo.endsWith('.git')) {
    repo = repo.slice(0, -4);
  }

  // Detect and handle .md extension for Markdown requests
  if (repo.endsWith('.md')) {
    isMarkdownRequest = true;
    repo = repo.slice(0, -3);
  }

  if (branch && branch.endsWith('.md')) {
    isMarkdownRequest = true;
    branch = branch.slice(0, -3);
  }

  // Strictly validate owner and repo against /^[A-Za-z0-9_.-]+$/ and block path traversal
  validateIdentifier('owner', owner);
  validateIdentifier('repo', repo);

  // Validate branch and subpath if present
  if (branch) {
    branch = branch.replace(/^\/+|\/+$/g, '').trim();
    if (branch) {
      validateSafePath('branch', branch);
    } else {
      branch = undefined;
    }
  }

  if (subpath) {
    subpath = subpath.replace(/^\/+|\/+$/g, '').trim();
    if (subpath) {
      validateSafePath('subpath', subpath);
    } else {
      subpath = undefined;
    }
  }

  const result: ParsedGitHubRef = {
    owner,
    repo,
    rawInput: trimmed,
    canonicalSlug: `${owner}/${repo}`,
    htmlUrl: `https://github.com/${owner}/${repo}`,
  };

  if (branch) {
    result.branch = branch;
  }
  if (subpath) {
    result.subpath = subpath;
  }
  if (isMarkdownRequest) {
    result.isMarkdownRequest = true;
  }

  return result;
}

/**
 * Builds a standardized lowercase repository identifier slug in the format:
 * `owner__repo` or `owner__repo__branch`.
 *
 * @param owner GitHub repository owner (username or organization)
 * @param repo Repository name
 * @param branch Optional branch or ref name
 * @returns Normalized lowercase identifier slug
 */
export function buildRepoId(owner: string, repo: string, branch?: string): string {
  if (!owner || typeof owner !== 'string' || !owner.trim()) {
    throw new Error('Owner is required to build a repoId');
  }
  if (!repo || typeof repo !== 'string' || !repo.trim()) {
    throw new Error('Repo is required to build a repoId');
  }

  const cleanOwner = owner.trim().toLowerCase();
  const cleanRepo = repo.trim().toLowerCase();
  const cleanBranch = branch?.trim().toLowerCase();

  if (cleanBranch) {
    // Replace slashes in branch names (e.g. "feat/auth" -> "feat-auth") for clean slug keys
    const normalizedBranch = cleanBranch.replace(/\//g, '-');
    return `${cleanOwner}__${cleanRepo}__${normalizedBranch}`;
  }

  return `${cleanOwner}__${cleanRepo}`;
}
