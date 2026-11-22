// =============================================================================
// GitUnderstand (git-understand.com) — Tests: URL Parser
// Comprehensive Vitest suite for GitHub URL, ref, and drop-in proxy parsing.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { parseGitHubInput, buildRepoId } from '../backend/src/utils/urlParser.js';

describe('urlParser — parseGitHubInput', () => {
  // ---------------------------------------------------------------------------
  // 1. Standard GitHub URLs
  // ---------------------------------------------------------------------------
  describe('Standard GitHub URLs', () => {
    it('parses standard HTTPS GitHub URL', () => {
      const res = parseGitHubInput('https://github.com/octocat/Hello-World');
      expect(res).toEqual({
        owner: 'octocat',
        repo: 'Hello-World',
        canonicalSlug: 'octocat/Hello-World',
        htmlUrl: 'https://github.com/octocat/Hello-World',
        rawInput: 'https://github.com/octocat/Hello-World',
      });
    });

    it('parses URL with trailing slash', () => {
      const res = parseGitHubInput('https://github.com/octocat/Hello-World/');
      expect(res.owner).toBe('octocat');
      expect(res.repo).toBe('Hello-World');
      expect(res.canonicalSlug).toBe('octocat/Hello-World');
    });

    it('strips .git extension from repository name', () => {
      const res = parseGitHubInput('https://github.com/octocat/Hello-World.git');
      expect(res.owner).toBe('octocat');
      expect(res.repo).toBe('Hello-World');
      expect(res.canonicalSlug).toBe('octocat/Hello-World');
    });

    it('parses HTTP GitHub URL', () => {
      const res = parseGitHubInput('http://github.com/facebook/react');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.htmlUrl).toBe('https://github.com/facebook/react');
    });

    it('parses www.github.com URL', () => {
      const res = parseGitHubInput('https://www.github.com/vercel/next.js');
      expect(res.owner).toBe('vercel');
      expect(res.repo).toBe('next.js');
    });

    it('parses SSH git@ format with .git suffix', () => {
      const res = parseGitHubInput('git@github.com:torvalds/linux.git');
      expect(res.owner).toBe('torvalds');
      expect(res.repo).toBe('linux');
      expect(res.canonicalSlug).toBe('torvalds/linux');
      expect(res.htmlUrl).toBe('https://github.com/torvalds/linux');
    });

    it('parses SSH git@ format without .git suffix', () => {
      const res = parseGitHubInput('git@github.com:torvalds/linux');
      expect(res.owner).toBe('torvalds');
      expect(res.repo).toBe('linux');
      expect(res.canonicalSlug).toBe('torvalds/linux');
    });

    it('parses schema-relative URLs (//github.com/...)', () => {
      const res = parseGitHubInput('//github.com/nodejs/node');
      expect(res.owner).toBe('nodejs');
      expect(res.repo).toBe('node');
    });

    it('parses protocol-less github.com inputs', () => {
      const res = parseGitHubInput('github.com/astral-sh/uv');
      expect(res.owner).toBe('astral-sh');
      expect(res.repo).toBe('uv');
    });

    it('extracts branch from URL hash segment', () => {
      const res = parseGitHubInput('https://github.com/octocat/Hello-World.git#main');
      expect(res.owner).toBe('octocat');
      expect(res.repo).toBe('Hello-World');
      expect(res.branch).toBe('main');
    });

    it('extracts complex branch name from URL hash', () => {
      const res = parseGitHubInput('https://github.com/octocat/Hello-World#feat/3d-strata');
      expect(res.owner).toBe('octocat');
      expect(res.repo).toBe('Hello-World');
      expect(res.branch).toBe('feat/3d-strata');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Tree and Blob Subpaths
  // ---------------------------------------------------------------------------
  describe('Tree and Blob Subpaths', () => {
    it('parses /tree/branch without subpath', () => {
      const res = parseGitHubInput('https://github.com/facebook/react/tree/main');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('main');
      expect(res.subpath).toBeUndefined();
    });

    it('parses /tree/branch with deep folder subpath', () => {
      const res = parseGitHubInput(
        'https://github.com/facebook/react/tree/main/packages/react-dom/src',
      );
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('main');
      expect(res.subpath).toBe('packages/react-dom/src');
    });

    it('parses /blob/branch with file subpath', () => {
      const res = parseGitHubInput(
        'https://github.com/facebook/react/blob/v18.2.0/package.json',
      );
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('v18.2.0');
      expect(res.subpath).toBe('package.json');
    });

    it('parses /blob/branch with deeply nested file path', () => {
      const res = parseGitHubInput(
        'https://github.com/facebook/react/blob/main/packages/shared/ReactSymbols.js',
      );
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('main');
      expect(res.subpath).toBe('packages/shared/ReactSymbols.js');
    });

    it('parses direct subpath without tree/blob keyword', () => {
      const res = parseGitHubInput('https://github.com/facebook/react/src/index.ts');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBeUndefined();
      expect(res.subpath).toBe('src/index.ts');
    });

    it('handles branch with semver and dots in /tree/', () => {
      const res = parseGitHubInput(
        'https://github.com/owner/repo/tree/v2.1.0-alpha.1/src/core',
      );
      expect(res.owner).toBe('owner');
      expect(res.repo).toBe('repo');
      expect(res.branch).toBe('v2.1.0-alpha.1');
      expect(res.subpath).toBe('src/core');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. git-understand.com URLs and Markdown (.md) Requests
  // ---------------------------------------------------------------------------
  describe('git-understand.com and Markdown (.md) Requests', () => {
    it('parses clean git-understand.com URL', () => {
      const res = parseGitHubInput('https://git-understand.com/tailwindlabs/tailwindcss');
      expect(res.owner).toBe('tailwindlabs');
      expect(res.repo).toBe('tailwindcss');
      expect(res.canonicalSlug).toBe('tailwindlabs/tailwindcss');
      expect(res.htmlUrl).toBe('https://github.com/tailwindlabs/tailwindcss');
      expect(res.isMarkdownRequest).toBeUndefined();
    });

    it('detects .md request on git-understand.com URL and strips .md', () => {
      const res = parseGitHubInput('https://git-understand.com/tailwindlabs/tailwindcss.md');
      expect(res.owner).toBe('tailwindlabs');
      expect(res.repo).toBe('tailwindcss');
      expect(res.canonicalSlug).toBe('tailwindlabs/tailwindcss');
      expect(res.isMarkdownRequest).toBe(true);
    });

    it('parses www.git-understand.com URL', () => {
      const res = parseGitHubInput('https://www.git-understand.com/prisma/prisma');
      expect(res.owner).toBe('prisma');
      expect(res.repo).toBe('prisma');
    });

    it('supports git-understand.com subdomains', () => {
      const res = parseGitHubInput('https://preview.git-understand.com/shadcn/ui');
      expect(res.owner).toBe('shadcn');
      expect(res.repo).toBe('ui');
    });

    it('supports git-understand Vercel preview domains', () => {
      const res = parseGitHubInput('https://feature-branch.git-understand.vercel.app/shadcn/ui');
      expect(res.owner).toBe('shadcn');
      expect(res.repo).toBe('ui');
    });

    it('detects markdown request via format=md query param', () => {
      const res = parseGitHubInput('https://github.com/facebook/react?format=md');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.isMarkdownRequest).toBe(true);
    });

    it('detects markdown request via markdown query flag', () => {
      const res = parseGitHubInput('https://github.com/facebook/react?markdown');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.isMarkdownRequest).toBe(true);
    });

    it('detects markdown request on bare slug with .md extension', () => {
      const res = parseGitHubInput('facebook/react.md');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.isMarkdownRequest).toBe(true);
    });

    it('detects markdown request on bare slug with ?format=md query', () => {
      const res = parseGitHubInput('facebook/react?format=md');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.isMarkdownRequest).toBe(true);
    });

    it('strips .md from branch name and flags markdown request', () => {
      const res = parseGitHubInput('facebook/react@main.md');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('main');
      expect(res.isMarkdownRequest).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Drop-in Proxies & Compatible Services
  // ---------------------------------------------------------------------------
  describe('Drop-in Proxies & Compatible Hosts', () => {
    it('parses gitingest.com HTTPS URL', () => {
      const res = parseGitHubInput('https://gitingest.com/torvalds/linux');
      expect(res.owner).toBe('torvalds');
      expect(res.repo).toBe('linux');
      expect(res.canonicalSlug).toBe('torvalds/linux');
      expect(res.htmlUrl).toBe('https://github.com/torvalds/linux');
    });

    it('parses www.gitingest.com URL', () => {
      const res = parseGitHubInput('https://www.gitingest.com/torvalds/linux');
      expect(res.owner).toBe('torvalds');
      expect(res.repo).toBe('linux');
    });

    it('parses protocol-less gitingest.com input', () => {
      const res = parseGitHubInput('gitingest.com/astral-sh/uv');
      expect(res.owner).toBe('astral-sh');
      expect(res.repo).toBe('uv');
    });

    it('parses gitdiagram.com URL', () => {
      const res = parseGitHubInput('https://gitdiagram.com/astral-sh/uv');
      expect(res.owner).toBe('astral-sh');
      expect(res.repo).toBe('uv');
      expect(res.htmlUrl).toBe('https://github.com/astral-sh/uv');
    });

    it('parses www.gitdiagram.com URL', () => {
      const res = parseGitHubInput('https://www.gitdiagram.com/astral-sh/uv');
      expect(res.owner).toBe('astral-sh');
      expect(res.repo).toBe('uv');
    });

    it('parses protocol-less gitdiagram.com input', () => {
      const res = parseGitHubInput('gitdiagram.com/astral-sh/uv');
      expect(res.owner).toBe('astral-sh');
      expect(res.repo).toBe('uv');
    });

    it('parses deepwiki.com URL', () => {
      const res = parseGitHubInput('https://deepwiki.com/anthropics/anthropic-sdk-python');
      expect(res.owner).toBe('anthropics');
      expect(res.repo).toBe('anthropic-sdk-python');
    });

    it('parses localhost and 127.0.0.1 for local development/testing', () => {
      const localRes = parseGitHubInput('http://localhost/test-org/test-repo');
      expect(localRes.owner).toBe('test-org');
      expect(localRes.repo).toBe('test-repo');

      const ipRes = parseGitHubInput('http://127.0.0.1/test-org/test-repo');
      expect(ipRes.owner).toBe('test-org');
      expect(ipRes.repo).toBe('test-repo');
    });

    it('rejects unsupported hosts like gitlab.com with descriptive error', () => {
      expect(() => parseGitHubInput('https://gitlab.com/owner/repo')).toThrowError(
        /Unsupported host "gitlab\.com"/,
      );
    });

    it('rejects unsupported hosts like bitbucket.org', () => {
      expect(() => parseGitHubInput('https://bitbucket.org/owner/repo')).toThrowError(
        /Unsupported host "bitbucket\.org"/,
      );
    });

    it('rejects arbitrary unknown domains', () => {
      expect(() => parseGitHubInput('https://malicious-site.com/owner/repo')).toThrowError(
        /Unsupported host "malicious-site\.com"/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Bare Slugs and Extended Syntax
  // ---------------------------------------------------------------------------
  describe('Bare Slugs and Extended Syntax', () => {
    it('parses bare "owner/repo"', () => {
      const res = parseGitHubInput('facebook/react');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.canonicalSlug).toBe('facebook/react');
      expect(res.htmlUrl).toBe('https://github.com/facebook/react');
    });

    it('trims leading and trailing whitespace from input', () => {
      const res = parseGitHubInput('   facebook/react   ');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
    });

    it('handles valid special characters: hyphens, underscores, and periods', () => {
      const res = parseGitHubInput('my-org_01/app.ui-v2');
      expect(res.owner).toBe('my-org_01');
      expect(res.repo).toBe('app.ui-v2');
      expect(res.canonicalSlug).toBe('my-org_01/app.ui-v2');
    });

    it('parses bare owner/repo@branch', () => {
      const res = parseGitHubInput('facebook/react@v18.0.0');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('v18.0.0');
    });

    it('parses bare owner/repo@branch with slashes in branch name', () => {
      const res = parseGitHubInput('facebook/react@feature/canvas-3d');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('feature/canvas-3d');
    });

    it('parses bare owner/repo@branch:subpath syntax', () => {
      const res = parseGitHubInput('facebook/react@main:packages/react/index.js');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('main');
      expect(res.subpath).toBe('packages/react/index.js');
    });

    it('parses bare owner/repo:subpath syntax without explicit branch', () => {
      const res = parseGitHubInput('facebook/react:src/App.tsx');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBeUndefined();
      expect(res.subpath).toBe('src/App.tsx');
    });

    it('parses bare owner/repo#branch syntax', () => {
      const res = parseGitHubInput('facebook/react#experimental');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('experimental');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Path Traversal Rejection and Security Validation
  // ---------------------------------------------------------------------------
  describe('Path Traversal and Security Validation', () => {
    it('rejects literal path traversal ("..") in bare slug middle', () => {
      expect(() => parseGitHubInput('owner/../repo')).toThrowError(
        /Path traversal sequence \("\.\."\) is strictly forbidden/,
      );
    });

    it('rejects literal path traversal at beginning of slug', () => {
      expect(() => parseGitHubInput('../owner/repo')).toThrowError(
        /Path traversal sequence \("\.\."\) is strictly forbidden/,
      );
    });

    it('rejects literal path traversal at end of slug', () => {
      expect(() => parseGitHubInput('owner/repo/..')).toThrowError(
        /Path traversal sequence \("\.\."\) is strictly forbidden/,
      );
    });

    it('rejects path traversal in URL tree subpath', () => {
      expect(() =>
        parseGitHubInput('https://github.com/owner/repo/tree/../secrets'),
      ).toThrowError(/Path traversal sequence \("\.\."\) is strictly forbidden/);
    });

    it('rejects path traversal in URL blob subpath', () => {
      expect(() =>
        parseGitHubInput('https://github.com/owner/repo/blob/main/../../etc/passwd'),
      ).toThrowError(/Path traversal sequence \("\.\."\) is strictly forbidden/);
    });

    it('rejects lowercase URL-encoded path traversal (%2e%2e)', () => {
      expect(() =>
        parseGitHubInput('https://github.com/owner/%2e%2e/repo'),
      ).toThrowError(/Path traversal sequence \("\.\."\) is strictly forbidden/);
    });

    it('rejects uppercase URL-encoded path traversal (%2E%2E)', () => {
      expect(() => parseGitHubInput('owner/%2E%2E/repo')).toThrowError(
        /Path traversal sequence \("\.\."\) is strictly forbidden/,
      );
    });

    it('rejects single dot reserved directory segment as owner', () => {
      expect(() => parseGitHubInput('./repo')).toThrowError(
        /reserved directory segment/,
      );
    });

    it('rejects single dot reserved directory segment as repo', () => {
      expect(() => parseGitHubInput('owner/.')).toThrowError(
        /reserved directory segment/,
      );
    });

    it('rejects invalid characters in owner (dollar sign)', () => {
      expect(() => parseGitHubInput('bad$owner/repo')).toThrowError(
        /must contain only alphanumeric characters, periods, underscores, or hyphens/,
      );
    });

    it('rejects command injection characters in repo (semicolon)', () => {
      expect(() => parseGitHubInput('owner/repo;rm -rf')).toThrowError(
        /must contain only alphanumeric characters, periods, underscores, or hyphens/,
      );
    });

    it('rejects HTML/XSS injection attempts', () => {
      expect(() => parseGitHubInput('owner/<script>alert(1)</script>')).toThrowError(
        /must contain only alphanumeric characters, periods, underscores, or hyphens/,
      );
    });

    it('rejects spaces inside identifiers', () => {
      expect(() => parseGitHubInput('owner name/repo')).toThrowError(
        /must contain only alphanumeric characters, periods, underscores, or hyphens/,
      );
    });

    it('rejects empty input or whitespace only', () => {
      expect(() => parseGitHubInput('')).toThrowError(
        /Input URL or repository slug cannot be empty/,
      );
      expect(() => parseGitHubInput('   ')).toThrowError(
        /Input URL or repository slug cannot be empty/,
      );
    });

    it('rejects non-string input', () => {
      expect(() => parseGitHubInput(null as unknown as string)).toThrowError(
        /Input must be a string/,
      );
      expect(() => parseGitHubInput(123 as unknown as string)).toThrowError(
        /Input must be a string/,
      );
    });

    it('rejects single-segment input without repo', () => {
      expect(() => parseGitHubInput('onlyowner')).toThrowError(
        /expected at least "owner\/repo"/,
      );
    });

    it('rejects root GitHub URL without owner and repo', () => {
      expect(() => parseGitHubInput('https://github.com/')).toThrowError(
        /expected format "owner\/repo"/,
      );
    });
  });
});

describe('urlParser — buildRepoId', () => {
  it('constructs standard owner__repo identifier', () => {
    expect(buildRepoId('facebook', 'react')).toBe('facebook__react');
  });

  it('constructs owner__repo__branch identifier when branch is supplied', () => {
    expect(buildRepoId('vercel', 'next.js', 'main')).toBe('vercel__next.js__main');
  });

  it('normalizes slashes in branch names to hyphens', () => {
    expect(buildRepoId('owner', 'repo', 'feature/canvas/3d-strata')).toBe(
      'owner__repo__feature-canvas-3d-strata',
    );
  });

  it('converts owner, repo, and branch to lowercase', () => {
    expect(buildRepoId('FaceBook', 'REACT', 'MAIN')).toBe('facebook__react__main');
  });

  it('trims whitespace around owner, repo, and branch', () => {
    expect(buildRepoId('  tailwindlabs  ', '  tailwindcss  ', '  master  ')).toBe(
      'tailwindlabs__tailwindcss__master',
    );
  });

  it('throws if owner is missing or empty', () => {
    expect(() => buildRepoId('', 'repo')).toThrowError(
      /Owner is required to build a repoId/,
    );
    expect(() => buildRepoId('   ', 'repo')).toThrowError(
      /Owner is required to build a repoId/,
    );
  });

  it('throws if repo is missing or empty', () => {
    expect(() => buildRepoId('owner', '')).toThrowError(
      /Repo is required to build a repoId/,
    );
    expect(() => buildRepoId('owner', '   ')).toThrowError(
      /Repo is required to build a repoId/,
    );
  });
});
