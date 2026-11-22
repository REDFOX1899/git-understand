'use client';

// =============================================================================
// GitUnderstand (git-understand.com) — Dynamic /:owner/:repo/[[...rest]] Route
// Agent 72: Dynamic URL-Trick Route handler supporting:
//  1. Automatic repo analysis with fallback to showcase pre-cached blueprints
//  2. .md URL-trick instant Agent Markdown Context Digest view (gitingest-style)
//  3. 1-click seamless toggle to the full interactive Visual Atlas StudioWorkbench
//  4. Integrated BYOK & MCP Connect modals + SSE pipeline progress updates
// =============================================================================

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useTransition,
} from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Copy,
  Check,
  Download,
  Compass,
  FileText,
  RefreshCw,
  AlertCircle,
  Key,
  Terminal,
  ExternalLink,
  Layers,
  Sparkles,
  ArrowRight,
  Code2,
  ShieldCheck,
  Zap,
} from 'lucide-react';

import type {
  VisualAtlasBlueprint,
  PipelineProgressEvent,
  CompiledDigest,
  VisualLensId,
} from '@shared/types';

import {
  analyzeRepo,
  fetchShowcaseBlueprint,
  subscribeRepoEvents,
  postCompileDigest,
  ApiError,
} from '@/lib/api';

import { useTheme } from '@/lib/useTheme';
import { ByokSettingsModal } from '@/components/ByokSettingsModal';
import { McpConnectModal } from '@/components/McpConnectModal';
import { StudioWorkbench } from '@/components/StudioWorkbench';
import {
  GitUnderstandPrismMark,
  GeminiSparkleMark,
  GitHubMark,
} from '@/components/BrandMarks';

// =============================================================================
// Helper: Parse Dynamic URL & GitHub References
// =============================================================================

interface ParsedRouteParams {
  owner: string;
  cleanRepo: string;
  rawRepo: string;
  branch?: string;
  subpath?: string;
  isMarkdownRequested: boolean;
  repoSlug: string;
  githubUrl: string;
}

function parseDynamicRoute(
  rawOwner: string | string[] | undefined,
  rawRepo: string | string[] | undefined,
  rawRest: string | string[] | undefined,
  queryFormat?: string | null
): ParsedRouteParams {
  const owner =
    typeof rawOwner === 'string'
      ? rawOwner.trim()
      : Array.isArray(rawOwner)
        ? rawOwner[0]?.trim() || ''
        : '';

  const repo =
    typeof rawRepo === 'string'
      ? rawRepo.trim()
      : Array.isArray(rawRepo)
        ? rawRepo[0]?.trim() || ''
        : '';

  const restSegments: string[] = Array.isArray(rawRest)
    ? rawRest.map((s) => s.trim()).filter(Boolean)
    : typeof rawRest === 'string'
      ? [rawRest.trim()].filter(Boolean)
      : [];

  // Check for .md extension in repo slug (e.g. /facebook/react.md)
  let isMarkdown = repo.toLowerCase().endsWith('.md');
  const cleanRepo = isMarkdown ? repo.slice(0, -3) : repo;

  // Check for .md extension in rest path (e.g. /facebook/react/main.md or /tree/main.md)
  let branch: string | undefined;
  let subpath: string | undefined;

  if (restSegments.length > 0) {
    const fullRest = restSegments.join('/');
    if (fullRest.toLowerCase().endsWith('.md')) {
      isMarkdown = true;
    }

    if (restSegments[0] === 'tree' || restSegments[0] === 'blob') {
      branch = restSegments[1];
      if (restSegments.length > 2) {
        subpath = restSegments.slice(2).join('/');
      }
    } else {
      subpath = restSegments.join('/');
    }
  }

  // Also honour ?format=md or ?mode=md
  if (queryFormat === 'md' || queryFormat === 'markdown') {
    isMarkdown = true;
  }

  const repoSlug = owner && cleanRepo ? `${owner}/${cleanRepo}` : cleanRepo;
  const githubUrl =
    owner && cleanRepo
      ? `https://github.com/${owner}/${cleanRepo}${branch ? `/tree/${branch}` : ''}${subpath ? `/${subpath}` : ''}`
      : `https://github.com/${cleanRepo}`;

  return {
    owner,
    cleanRepo,
    rawRepo: repo,
    branch,
    subpath,
    isMarkdownRequested: isMarkdown,
    repoSlug,
    githubUrl,
  };
}

// =============================================================================
// Helper: Synthesize Quick Fallback Markdown Digest from Blueprint
// =============================================================================

function synthesizeMarkdownDigest(bp: VisualAtlasBlueprint): string {
  const meta = bp.metadata;
  const topSubsystems = bp.subsystems.slice(0, 8);
  const entrypoints = bp.files.filter((f) => f.isEntrypoint).slice(0, 10);
  const hotNodes = bp.nodes
    .slice()
    .sort((a, b) => b.centrality - a.centrality)
    .slice(0, 10);

  const lines: string[] = [
    `# =============================================================================`,
    `# GitUnderstand Codebase Context Digest — ${meta.fullName || bp.repoId}`,
    `# Synthesized with Gemini 4 Multimodal Architecture Engine (git-understand.com)`,
    `# =============================================================================`,
    ``,
    `## Repository Overview`,
    `- **Repository:** [${meta.fullName || bp.repoId}](${meta.htmlUrl})`,
    `- **Headline:** ${bp.headline}`,
    `- **One-Liner:** ${bp.oneLiner}`,
    `- **Architecture Pattern:** ${bp.architecturePattern}`,
    `- **Primary Language:** ${meta.primaryLanguage || 'TypeScript'} (${meta.stars.toLocaleString()} ★ stars)`,
    `- **Tech Stack:** ${bp.techStackBadges.join(', ')}`,
    `- **Analyzed Codebase:** ${bp.stats.totalFiles.toLocaleString()} files, ${bp.stats.totalLines.toLocaleString()} lines, ~${bp.stats.totalTokens.toLocaleString()} tokens`,
    `- **Health Matrix:** ${bp.xray ? `Overall score ${bp.xray.overallScore}/100 across 9 Decision-1 pillars` : 'Decision-1 X-Ray Calibrated'}`,
    ``,
    `## Core Architectural Strata & Subsystems`,
  ];

  for (const sub of topSubsystems) {
    lines.push(`### [${sub.layer.toUpperCase()}] ${sub.name}`);
    lines.push(`- **Tagline:** ${sub.tagline}`);
    lines.push(`- **Tokens:** ~${sub.totalTokens.toLocaleString()}`);
    if (sub.summaryBullets.length > 0) {
      lines.push(`- **Key Patterns:** ${sub.summaryBullets.join('; ')}`);
    }
    if (sub.invariants.length > 0) {
      lines.push(`- **Architectural Invariants:**`);
      for (const inv of sub.invariants) {
        lines.push(`  * ${inv}`);
      }
    }
    lines.push(``);
  }

  lines.push(`## Key Central Architecture Nodes`);
  for (const node of hotNodes) {
    lines.push(
      `- **${node.label}** (${node.kind} / ${node.layer}): \`${node.primaryFile}\` — ${node.visualBrief}`
    );
  }

  lines.push(``);
  lines.push(`## Critical Entrypoint Files`);
  for (const ep of entrypoints) {
    lines.push(
      `- \`${ep.path}\` (${ep.language}, ${ep.lineCount} lines, ~${ep.estimatedTokens} tokens)`
    );
  }

  if (bp.flows && bp.flows.length > 0) {
    lines.push(``);
    lines.push(`## Documented Execution Flows`);
    for (const flow of bp.flows.slice(0, 4)) {
      lines.push(`### Flow: ${flow.title}`);
      lines.push(`- **Trigger:** ${flow.trigger} (${flow.category})`);
      for (const step of flow.steps) {
        lines.push(
          `  ${step.stepNumber}. **${step.title}**: ${step.action} (\`${step.filePath}:${step.lineStart}\`)`
        );
      }
    }
  }

  lines.push(``);
  lines.push(`<!-- View full 3D Strata, Living Diagrams & Decision-1 X-Ray at: https://git-understand.com/${meta.fullName} -->`);

  return lines.join('\n');
}

// =============================================================================
// Page Component
// =============================================================================

export default function DynamicRepoPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const { resolvedTheme, toggleQuick } = useTheme();

  // Parse path & query params
  const queryFormat = searchParams?.get('format');
  const initialLens = (searchParams?.get('lens') as VisualLensId) || 'atlas';

  const routeInfo = useMemo(() => {
    return parseDynamicRoute(
      params.owner,
      params.repo,
      params.rest,
      queryFormat
    );
  }, [params.owner, params.repo, params.rest, queryFormat]);

  const {
    owner,
    cleanRepo,
    branch,
    subpath,
    isMarkdownRequested,
    repoSlug,
    githubUrl,
  } = routeInfo;

  // View state: 'atlas' (StudioWorkbench) vs 'markdown' (Agent Context Digest)
  const [activeView, setActiveView] = useState<'atlas' | 'markdown'>(
    isMarkdownRequested ? 'markdown' : 'atlas'
  );

  // Sync activeView if URL changes between .md and non-.md
  useEffect(() => {
    setActiveView(isMarkdownRequested ? 'markdown' : 'atlas');
  }, [isMarkdownRequested]);

  // Data state
  const [blueprint, setBlueprint] = useState<VisualAtlasBlueprint | null>(null);
  const [digest, setDigest] = useState<CompiledDigest | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCompilingDigest, setIsCompilingDigest] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PipelineProgressEvent | null>(null);

  // Modal controls
  const [byokOpen, setByokOpen] = useState<boolean>(false);
  const [mcpOpen, setMcpOpen] = useState<boolean>(false);
  const [copiedMd, setCopiedMd] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // Load Repository Blueprint
  // ---------------------------------------------------------------------------
  const loadRepository = useCallback(
    async (forceRefresh = false) => {
      if (!owner || !cleanRepo) {
        setIsLoading(false);
        setError('Invalid repository path specified in URL.');
        return;
      }

      setIsLoading(true);
      setError(null);

      // Subscribe to Server-Sent progress events if repoId is standard
      const tempRepoId = `${owner}__${cleanRepo}__${branch || 'main'}`;
      const unsubscribe = subscribeRepoEvents(tempRepoId, (ev) => {
        setProgress(ev);
      });

      try {
        // Step 1: Call analyzeRepo on backend
        const targetUrl = `https://github.com/${owner}/${cleanRepo}`;
        const bp = await analyzeRepo(targetUrl, { forceRefresh });
        setBlueprint(bp);
        setError(null);
      } catch (err: unknown) {
        console.warn(
          `[Agent 72] analyzeRepo failed for ${repoSlug}. Testing showcase fallback...`,
          err
        );

        // Step 2: Showcase fallback for pre-cached popular repositories
        try {
          // Try cleanRepo slug, full repoSlug, or hyphenated fallback
          const showcaseBp = await fetchShowcaseBlueprint(cleanRepo)
            .catch(() => fetchShowcaseBlueprint(repoSlug))
            .catch(() => fetchShowcaseBlueprint(`${owner}-${cleanRepo}`));

          setBlueprint(showcaseBp);
          setError(null);
        } catch (fallbackErr: unknown) {
          console.error(
            `[Agent 72] Both analyzeRepo and showcase fallback failed for ${repoSlug}:`,
            fallbackErr
          );

          let errorMsg = 'Failed to analyze repository.';
          if (err instanceof ApiError) {
            errorMsg = err.message;
          } else if (err instanceof Error) {
            errorMsg = err.message;
          }
          setError(errorMsg);
        }
      } finally {
        setIsLoading(false);
        unsubscribe();
      }
    },
    [owner, cleanRepo, branch, repoSlug]
  );

  useEffect(() => {
    void loadRepository(false);
  }, [loadRepository]);

  // ---------------------------------------------------------------------------
  // Fetch / Compile Digest when entering Markdown view
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (activeView === 'markdown' && blueprint?.repoId && !digest) {
      setIsCompilingDigest(true);
      postCompileDigest(blueprint.repoId)
        .then((d) => {
          setDigest(d);
        })
        .catch((err) => {
          console.warn('[Agent 72] postCompileDigest failed, using synthesized blueprint:', err);
        })
        .finally(() => {
          setIsCompilingDigest(false);
        });
    }
  }, [activeView, blueprint?.repoId, digest]);

  // ---------------------------------------------------------------------------
  // Computed Markdown Content
  // ---------------------------------------------------------------------------
  const activeMarkdownText = useMemo(() => {
    if (digest?.digestText) {
      const parts: string[] = [];
      if (digest.summaryHeader) parts.push(digest.summaryHeader);
      if (digest.treeText) parts.push(digest.treeText);
      parts.push(digest.digestText);
      return parts.join('\n\n');
    }
    if (blueprint) {
      return synthesizeMarkdownDigest(blueprint);
    }
    return `# Loading context digest for ${repoSlug}...\n\nSynthesizing architecture graph with Gemini 4.`;
  }, [digest, blueprint, repoSlug]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleCopyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(activeMarkdownText);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    } catch {
      // Fallback
    }
  }, [activeMarkdownText]);

  const handleDownloadMarkdown = useCallback(() => {
    try {
      const blob = new Blob([activeMarkdownText], {
        type: 'text/markdown;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cleanRepo}-context.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Ignored
    }
  }, [activeMarkdownText, cleanRepo]);

  const handleSwitchToAtlas = useCallback(() => {
    startTransition(() => {
      setActiveView('atlas');
      // Update browser URL seamlessly from .md to standard route if needed
      if (isMarkdownRequested) {
        router.replace(`/${owner}/${cleanRepo}${subpath ? `/${subpath}` : ''}`);
      }
    });
  }, [isMarkdownRequested, owner, cleanRepo, subpath, router]);

  const handleSwitchToMarkdown = useCallback(() => {
    startTransition(() => {
      setActiveView('markdown');
    });
  }, []);

  // ===========================================================================
  // Render: Loading Screen
  // ===========================================================================
  if (isLoading && !blueprint) {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center p-6 select-none"
        style={{
          backgroundColor: 'var(--bg-void)',
          color: 'var(--ink-primary)',
        }}
      >
        <div className="max-w-md w-full text-center space-y-6">
          <div className="relative inline-flex items-center justify-center">
            <div
              className="absolute -inset-4 rounded-full opacity-30 blur-xl animate-pulse"
              style={{ backgroundColor: 'var(--cobalt-core)' }}
            />
            <GitUnderstandPrismMark size={64} glow className="relative z-10" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">
              Ingesting {owner}/{cleanRepo}
            </h1>
            <p className="text-xs font-mono" style={{ color: 'var(--ink-muted)' }}>
              {progress?.message || 'Parsing repository AST & synthesizing spatial atlas with Gemini 4...'}
            </p>
          </div>

          {/* Progress Bar */}
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-card-elevated)' }}
          >
            <div
              className="h-full transition-all duration-300 ease-out"
              style={{
                width: `${progress?.percent ? Math.max(15, progress.percent) : 35}%`,
                backgroundColor: 'var(--cobalt-bright)',
                boxShadow: '0 0 10px var(--cobalt-bright)',
              }}
            />
          </div>

          <div className="flex items-center justify-center gap-4 text-xs" style={{ color: 'var(--ink-muted)' }}>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--cobalt-bright)' }} />
              Gemini 4 Multimodal
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--emerald)' }} />
              Decision-1 Calibrated
            </span>
          </div>
        </div>
      </main>
    );
  }

  // ===========================================================================
  // Render: Error Screen
  // ===========================================================================
  if (error && !blueprint) {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center p-6 select-none"
        style={{
          backgroundColor: 'var(--bg-void)',
          color: 'var(--ink-primary)',
        }}
      >
        <div
          className="max-w-lg w-full rounded-2xl p-8 space-y-6 border text-center shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-card)',
          }}
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 text-red-400 mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight">
              Unable to Analyze Repository
            </h1>
            <p className="text-sm font-mono text-red-300/80">
              {owner}/{cleanRepo}
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--ink-secondary)' }}>
              {error}
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void loadRepository(true)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-medium text-xs inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
              style={{
                backgroundColor: 'var(--cobalt-core)',
                color: '#ffffff',
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Analysis
            </button>

            <button
              type="button"
              onClick={() => setByokOpen(true)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-medium text-xs inline-flex items-center justify-center gap-2 border transition-all cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-card-elevated)',
                borderColor: 'var(--border-card)',
                color: 'var(--ink-primary)',
              }}
            >
              <Key className="w-3.5 h-3.5" style={{ color: 'var(--amber)' }} />
              Provide BYOK Token
            </button>
          </div>

          <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            For private or rate-limited repositories, supply a GitHub Personal Access Token or Gemini API Key in BYOK settings.
          </p>
        </div>

        <ByokSettingsModal open={byokOpen} onClose={() => setByokOpen(false)} />
      </main>
    );
  }

  // ===========================================================================
  // Render: Agent Markdown View (.md URL Trick)
  // ===========================================================================
  if (activeView === 'markdown') {
    return (
      <main
        className="min-h-screen flex flex-col"
        style={{
          backgroundColor: 'var(--bg-void)',
          color: 'var(--ink-primary)',
        }}
      >
        {/* Top Header Bar */}
        <header
          className="sticky top-0 z-30 px-6 py-3.5 border-b backdrop-blur-md flex flex-wrap items-center justify-between gap-4"
          style={{
            backgroundColor: 'rgba(11, 15, 23, 0.85)',
            borderColor: 'var(--border-card)',
          }}
        >
          {/* Brand & Repository Identifier */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold tracking-tight transition-opacity hover:opacity-80"
            >
              <GitUnderstandPrismMark size={22} glow />
              <span className="hidden sm:inline">GitUnderstand</span>
            </Link>

            <span style={{ color: 'var(--ink-muted)' }}>/</span>

            <div className="flex items-center gap-1.5 font-mono text-xs font-medium">
              <span style={{ color: 'var(--ink-secondary)' }}>{owner}</span>
              <span style={{ color: 'var(--ink-muted)' }}>/</span>
              <span style={{ color: 'var(--cobalt-bright)' }}>{cleanRepo}.md</span>
            </div>

            <span
              className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border"
              style={{
                backgroundColor: 'rgba(45, 91, 255, 0.12)',
                borderColor: 'rgba(45, 91, 255, 0.3)',
                color: 'var(--cobalt-bright)',
              }}
            >
              <FileText className="w-3 h-3" />
              Agent Context Ingestion
            </span>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2">
            {/* Primary 1-Click Button: Open Visual Atlas */}
            <button
              type="button"
              onClick={handleSwitchToAtlas}
              className="px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 shadow-lg transition-all transform active:scale-95 cursor-pointer"
              style={{
                backgroundColor: 'var(--cobalt-core)',
                color: '#ffffff',
                boxShadow: '0 0 16px rgba(45, 91, 255, 0.4)',
              }}
            >
              <Compass className="w-4 h-4 animate-spin-slow" />
              <span>Open Visual Atlas</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* Copy Markdown Button */}
            <button
              type="button"
              onClick={() => void handleCopyMarkdown()}
              className="px-3 py-2 rounded-xl text-xs font-medium border inline-flex items-center gap-1.5 transition-all cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-card-elevated)',
                borderColor: 'var(--border-card)',
                color: copiedMd ? 'var(--emerald)' : 'var(--ink-primary)',
              }}
              title="Copy entire markdown digest to clipboard"
            >
              {copiedMd ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Copy .md</span>
                </>
              )}
            </button>

            {/* Download Button */}
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="p-2 rounded-xl border transition-all cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-card-elevated)',
                borderColor: 'var(--border-card)',
                color: 'var(--ink-secondary)',
              }}
              title="Download markdown file"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* MCP Connect Button */}
            <button
              type="button"
              onClick={() => setMcpOpen(true)}
              className="px-3 py-2 rounded-xl text-xs font-medium border inline-flex items-center gap-1.5 transition-all cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-card-elevated)',
                borderColor: 'var(--border-card)',
                color: 'var(--ink-secondary)',
              }}
              title="Connect Claude, Cursor or Gemini via MCP"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">MCP Connect</span>
            </button>

            {/* BYOK Settings */}
            <button
              type="button"
              onClick={() => setByokOpen(true)}
              className="p-2 rounded-xl border transition-all cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-card-elevated)',
                borderColor: 'var(--border-card)',
                color: 'var(--ink-secondary)',
              }}
              title="BYOK & Model Settings"
            >
              <Key className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Sub-Banner: Visual-First Pitch */}
        <div
          className="px-6 py-2.5 border-b flex flex-wrap items-center justify-between text-xs"
          style={{
            backgroundColor: 'rgba(45, 91, 255, 0.05)',
            borderColor: 'var(--border-card)',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full animate-ping"
              style={{ backgroundColor: 'var(--emerald)' }}
            />
            <span style={{ color: 'var(--ink-secondary)' }}>
              Agent ingestion active for <strong>{repoSlug}</strong>. Feeding LLMs raw tokens?
            </span>
          </div>

          <button
            type="button"
            onClick={handleSwitchToAtlas}
            className="inline-flex items-center gap-1.5 font-medium transition-colors hover:underline cursor-pointer"
            style={{ color: 'var(--cobalt-bright)' }}
          >
            <span>Launch 3D Strata, Living Diagrams & Decision-1 X-Ray</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Main Code View Container */}
        <div className="flex-1 p-6 max-w-6xl w-full mx-auto flex flex-col gap-4">
          <div
            className="flex-1 rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-card)',
            }}
          >
            {/* Window Topbar */}
            <div
              className="px-4 py-2.5 border-b flex items-center justify-between font-mono text-xs select-none"
              style={{
                backgroundColor: 'var(--bg-card-elevated)',
                borderColor: 'var(--border-card)',
                color: 'var(--ink-muted)',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/40" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
                </div>
                <span className="ml-2 font-medium" style={{ color: 'var(--ink-secondary)' }}>
                  {cleanRepo}.md
                </span>
              </div>

              <div className="flex items-center gap-4 text-[11px]">
                {isCompilingDigest && (
                  <span className="inline-flex items-center gap-1.5 text-amber-400">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Compiling token digest...
                  </span>
                )}
                {blueprint && (
                  <span>
                    ~{blueprint.stats.totalTokens.toLocaleString()} tokens (
                    {blueprint.stats.totalFiles} files)
                  </span>
                )}
              </div>
            </div>

            {/* Markdown Text Area */}
            <div className="flex-1 p-6 overflow-auto font-mono text-xs leading-relaxed select-text">
              <pre
                className="whitespace-pre-wrap font-[family-name:var(--font-mono-loaded)]"
                style={{ color: 'var(--ink-primary)' }}
              >
                {activeMarkdownText}
              </pre>
            </div>
          </div>
        </div>

        {/* Modals */}
        <ByokSettingsModal open={byokOpen} onClose={() => setByokOpen(false)} />
        <McpConnectModal
          open={mcpOpen}
          onClose={() => setMcpOpen(false)}
          owner={owner}
          repo={cleanRepo}
          repoSlug={repoSlug}
        />
      </main>
    );
  }

  // ===========================================================================
  // Render: Full Interactive StudioWorkbench (Visual Atlas, 3D Strata, X-Ray)
  // ===========================================================================
  if (!blueprint) {
    return null;
  }

  return (
    <>
      <StudioWorkbench
        blueprint={blueprint}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleQuick}
        onReturnHome={() => router.push('/')}
        onAnalyzeNewRepo={async (nextRepoUrl) => {
          const bp = await analyzeRepo(nextRepoUrl);
          setBlueprint(bp);
        }}
        onOpenSettings={() => setByokOpen(true)}
        onOpenMcp={() => setMcpOpen(true)}
        onBlueprintUpdate={(bp) => setBlueprint(bp)}
        progressEvents={progress ? [progress] : []}
        isAnalyzing={isLoading}
      />

      {/* Persistent BYOK & MCP Modals */}
      <ByokSettingsModal open={byokOpen} onClose={() => setByokOpen(false)} />
      <McpConnectModal
        open={mcpOpen}
        onClose={() => setMcpOpen(false)}
        owner={owner}
        repo={cleanRepo}
        repoSlug={repoSlug}
      />
    </>
  );
}
