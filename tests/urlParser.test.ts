import { describe, it, expect } from 'vitest';
import { parseGitHubInput, buildRepoId } from '../backend/src/utils/urlParser.js';

describe('GitHub URL Parser', () => {
  describe('Format 1: https://github.com/owner/repo and trailing .git or /', () => {
    it('parses standard https url', () => {
      const res = parseGitHubInput('https://github.com/facebook/react');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.canonicalSlug).toBe('facebook/react');
      expect(res.htmlUrl).toBe('https://github.com/facebook/react');
      expect(res.branch).toBeUndefined();
      expect(res.subpath).toBeUndefined();
      expect(res.isMarkdownRequest).toBeUndefined();
    });

    it('handles trailing slash', () => {
      const res = parseGitHubInput('https://github.com/facebook/react/');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.canonicalSlug).toBe('facebook/react');
      expect(res.htmlUrl).toBe('https://github.com/facebook/react');
    });

    it('handles trailing .git', () => {
      const res = parseGitHubInput('https://github.com/facebook/react.git');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.canonicalSlug).toBe('facebook/react');
      expect(res.htmlUrl).toBe('https://github.com/facebook/react');
    });

    it('handles trailing .git/', () => {
      const res = parseGitHubInput('https://github.com/facebook/react.git/');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.canonicalSlug).toBe('facebook/react');
    });

    it('handles www.github.com', () => {
      const res = parseGitHubInput('https://www.github.com/facebook/react');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
    });

    it('handles git@ SSH format', () => {
      const res = parseGitHubInput('git@github.com:facebook/react.git');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.canonicalSlug).toBe('facebook/react');
      expect(res.htmlUrl).toBe('https://github.com/facebook/react');
    });

    it('handles URL hash for branch', () => {
      const res = parseGitHubInput('https://github.com/facebook/react.git#canary');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('canary');
    });

    it('handles uppercase names', () => {
      const res = parseGitHubInput('https://github.com/Facebook/React');
      expect(res.owner).toBe('Facebook');
      expect(res.repo).toBe('React');
      expect(res.canonicalSlug).toBe('Facebook/React');
      expect(res.htmlUrl).toBe('https://github.com/Facebook/React');
    });
  });

  describe('Format 2: Tree and Blob subpaths', () => {
    it('handles tree with branch only', () => {
      const res = parseGitHubInput('https://github.com/facebook/react/tree/canary');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('canary');
      expect(res.subpath).toBeUndefined();
      expect(res.canonicalSlug).toBe('facebook/react');
    });

    it('handles tree with branch and deep subpath', () => {
      const res = parseGitHubInput('https://github.com/facebook/react/tree/main/packages/react');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('main');
      expect(res.subpath).toBe('packages/react');
      expect(res.canonicalSlug).toBe('facebook/react');
    });

    it('handles blob with branch and file', () => {
      const res = parseGitHubInput('https://github.com/facebook/react/blob/v18.2.0/packages/react/index.js');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('v18.2.0');
      expect(res.subpath).toBe('packages/react/index.js');
      expect(res.isMarkdownRequest).toBeUndefined();
    });

    it('handles direct subpath without tree/blob keyword', () => {
      const res = parseGitHubInput('https://github.com/facebook/react/packages/react');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.subpath).toBe('packages/react');
    });
  });

  describe('Format 3: git-understand.com and .md', () => {
    it('handles git-understand.com/owner/repo', () => {
      const res = parseGitHubInput('https://git-understand.com/owner/repo');
      expect(res.owner).toBe('owner');
      expect(res.repo).toBe('repo');
      expect(res.canonicalSlug).toBe('owner/repo');
      expect(res.htmlUrl).toBe('https://github.com/owner/repo');
      expect(res.isMarkdownRequest).toBeUndefined();
    });

    it('handles git-understand.com/owner/repo.md and sets isMarkdownRequest', () => {
      const res = parseGitHubInput('https://git-understand.com/owner/repo.md');
      expect(res.owner).toBe('owner');
      expect(res.repo).toBe('repo');
      expect(res.isMarkdownRequest).toBe(true);
      expect(res.canonicalSlug).toBe('owner/repo');
      expect(res.htmlUrl).toBe('https://github.com/owner/repo');
    });

    it('handles query param format=md', () => {
      const res = parseGitHubInput('https://git-understand.com/owner/repo?format=md');
      expect(res.owner).toBe('owner');
      expect(res.repo).toBe('repo');
      expect(res.isMarkdownRequest).toBe(true);
    });

    it('handles subdomain staging.git-understand.com', () => {
      const res = parseGitHubInput('https://staging.git-understand.com/owner/repo');
      expect(res.owner).toBe('owner');
      expect(res.repo).toBe('repo');
    });
  });

  describe('Format 4: Drop-in replacements (gitingest, gitdiagram, deepwiki)', () => {
    it('handles gitingest.com', () => {
      const res = parseGitHubInput('https://gitingest.com/tailwindlabs/tailwindcss');
      expect(res.owner).toBe('tailwindlabs');
      expect(res.repo).toBe('tailwindcss');
      expect(res.canonicalSlug).toBe('tailwindlabs/tailwindcss');
      expect(res.htmlUrl).toBe('https://github.com/tailwindlabs/tailwindcss');
    });

    it('handles gitingest.com/owner/repo.md', () => {
      const res = parseGitHubInput('https://gitingest.com/tailwindlabs/tailwindcss.md');
      expect(res.owner).toBe('tailwindlabs');
      expect(res.repo).toBe('tailwindcss');
      expect(res.isMarkdownRequest).toBe(true);
    });

    it('handles gitdiagram.com', () => {
      const res = parseGitHubInput('https://gitdiagram.com/tailwindlabs/tailwindcss');
      expect(res.owner).toBe('tailwindlabs');
      expect(res.repo).toBe('tailwindcss');
    });

    it('handles deepwiki.com', () => {
      const res = parseGitHubInput('https://deepwiki.com/tailwindlabs/tailwindcss');
      expect(res.owner).toBe('tailwindlabs');
      expect(res.repo).toBe('tailwindcss');
    });

    it('handles domain without https:// prefix', () => {
      const res = parseGitHubInput('gitingest.com/owner/repo');
      expect(res.owner).toBe('owner');
      expect(res.repo).toBe('repo');
      expect(res.htmlUrl).toBe('https://github.com/owner/repo');
    });
  });

  describe('Format 5: Bare inputs', () => {
    it('handles bare owner/repo', () => {
      const res = parseGitHubInput('facebook/react');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.canonicalSlug).toBe('facebook/react');
      expect(res.htmlUrl).toBe('https://github.com/facebook/react');
    });

    it('handles bare owner/repo@branch', () => {
      const res = parseGitHubInput('facebook/react@canary');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('canary');
      expect(res.canonicalSlug).toBe('facebook/react');
    });

    it('handles bare owner/repo.md', () => {
      const res = parseGitHubInput('facebook/react.md');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.isMarkdownRequest).toBe(true);
      expect(res.canonicalSlug).toBe('facebook/react');
    });

    it('handles bare owner/repo@branch.md', () => {
      const res = parseGitHubInput('facebook/react@main.md');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('main');
      expect(res.isMarkdownRequest).toBe(true);
    });

    it('handles bare owner/repo@branch:subpath', () => {
      const res = parseGitHubInput('facebook/react@main:packages/react');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBe('main');
      expect(res.subpath).toBe('packages/react');
    });

    it('handles bare owner/repo:subpath without branch', () => {
      const res = parseGitHubInput('facebook/react:src/index.ts');
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
      expect(res.branch).toBeUndefined();
      expect(res.subpath).toBe('src/index.ts');
    });
  });

  describe('Security and strict validation', () => {
    it('blocks path traversal .. in owner', () => {
      expect(() => parseGitHubInput('../evil/repo')).toThrow(/path traversal/i);
    });

    it('blocks path traversal .. in repo', () => {
      expect(() => parseGitHubInput('owner/../evil')).toThrow(/path traversal/i);
    });

    it('blocks path traversal in URL pathname', () => {
      expect(() => parseGitHubInput('https://github.com/../foo')).toThrow(/path traversal/i);
      expect(() => parseGitHubInput('https://github.com/foo/..')).toThrow(/path traversal/i);
      expect(() => parseGitHubInput('https://github.com/foo/bar/tree/../secret')).toThrow(/path traversal/i);
    });

    it('blocks URI-encoded path traversal (%2e%2e)', () => {
      expect(() => parseGitHubInput('https://github.com/foo/%2e%2e/bar')).toThrow(/path traversal/i);
    });

    it('rejects empty inputs', () => {
      expect(() => parseGitHubInput('')).toThrow(/empty/i);
      expect(() => parseGitHubInput('   ')).toThrow(/empty/i);
    });

    it('rejects inputs missing owner or repo', () => {
      expect(() => parseGitHubInput('facebook')).toThrow(/expected at least "owner\/repo"/i);
      expect(() => parseGitHubInput('https://github.com/')).toThrow(/expected/i);
    });

    it('rejects invalid identifier characters', () => {
      expect(() => parseGitHubInput('owner$name/repo')).toThrow(/must contain only alphanumeric/i);
      expect(() => parseGitHubInput('owner/repo;rm -rf')).toThrow(/must contain only alphanumeric/i);
      expect(() => parseGitHubInput('owner/repo<script>')).toThrow(/must contain only alphanumeric/i);
    });

    it('rejects unsupported hosts', () => {
      expect(() => parseGitHubInput('https://gitlab.com/owner/repo')).toThrow(/unsupported host/i);
      expect(() => parseGitHubInput('https://bitbucket.org/owner/repo')).toThrow(/unsupported host/i);
    });
  });

  describe('buildRepoId', () => {
    it('builds slug without branch', () => {
      expect(buildRepoId('Facebook', 'React')).toBe('facebook__react');
    });

    it('builds slug with branch', () => {
      expect(buildRepoId('Facebook', 'React', 'Main')).toBe('facebook__react__main');
    });

    it('normalizes slashes in branch', () => {
      expect(buildRepoId('owner', 'repo', 'feat/login-flow')).toBe('owner__repo__feat-login-flow');
    });

    it('throws on empty owner or repo', () => {
      expect(() => buildRepoId('', 'repo')).toThrow(/owner is required/i);
      expect(() => buildRepoId('owner', '')).toThrow(/repo is required/i);
    });
  });
});
