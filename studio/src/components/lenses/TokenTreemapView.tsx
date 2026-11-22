'use client';

// =============================================================================
// GitUnderstand (git-understand.com) — Gitingest Visual Token Treemap Lens
// Agent 61: Interactive squarified SVG treemap, token budget gauge,
// AI Smart Filter, include/exclude glob controls, and 1-click digest export.
// =============================================================================

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type {
  VisualAtlasBlueprint,
  DigestFilterOptions,
  CompiledDigest,
  TreemapNode,
  ArchitectureLayer,
  RepoFileRecord,
} from '@shared/types';
import {
  computeSquarifiedTreemap,
  type TreemapRect,
} from '@/lib/graphLayout';
import {
  postCompileDigest,
  postSmartFilterDigest,
} from '@/lib/api';
import {
  Sparkles,
  Copy,
  Check,
  Download,
  FileText,
  Folder,
  FolderOpen,
  FileCode,
  Sliders,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  Eye,
  Gauge,
  Zap,
  Filter,
  Search,
  ArrowUpLeft,
  AlertTriangle,
} from 'lucide-react';

// =============================================================================
// Public Component Props
// =============================================================================

export interface TokenTreemapViewProps {
  blueprint: VisualAtlasBlueprint;
  externalFilterOptions?: Partial<DigestFilterOptions> | null;
  onPeekFile: (filePath: string) => void;
}

// =============================================================================
// Design System Layer Colors & Presets
// =============================================================================

const BUDGET_PRESETS = [
  { label: '128K', tokens: 128_000, description: 'Fast reasoning (Gemini Flash / Claude Sonnet)' },
  { label: '256K', tokens: 256_000, description: 'Standard deep context window' },
  { label: '1M', tokens: 1_000_000, description: 'Massive tier (Gemini 4 Full Archive)' },
] as const;

const LAYER_STYLE: Record<
  ArchitectureLayer | 'default',
  { fill: string; border: string; text: string; bgBadge: string }
> = {
  client: {
    fill: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.45)',
    text: '#38bdf8',
    bgBadge: 'rgba(56, 189, 248, 0.18)',
  },
  edge: {
    fill: 'rgba(129, 140, 248, 0.12)',
    border: 'rgba(129, 140, 248, 0.45)',
    text: '#818cf8',
    bgBadge: 'rgba(129, 140, 248, 0.18)',
  },
  orchestration: {
    fill: 'rgba(99, 102, 241, 0.12)',
    border: 'rgba(99, 102, 241, 0.45)',
    text: '#a5b4fc',
    bgBadge: 'rgba(99, 102, 241, 0.18)',
  },
  domain: {
    fill: 'rgba(26, 115, 232, 0.14)',
    border: 'rgba(66, 133, 244, 0.45)',
    text: '#8ab4f8',
    bgBadge: 'rgba(26, 115, 232, 0.22)',
  },
  infrastructure: {
    fill: 'rgba(14, 165, 233, 0.12)',
    border: 'rgba(14, 165, 233, 0.45)',
    text: '#38bdf8',
    bgBadge: 'rgba(14, 165, 233, 0.18)',
  },
  data: {
    fill: 'rgba(52, 211, 153, 0.12)',
    border: 'rgba(52, 211, 153, 0.45)',
    text: '#34d399',
    bgBadge: 'rgba(52, 211, 153, 0.18)',
  },
  tooling: {
    fill: 'rgba(251, 191, 36, 0.12)',
    border: 'rgba(251, 191, 36, 0.45)',
    text: '#fbbf24',
    bgBadge: 'rgba(251, 191, 36, 0.18)',
  },
  default: {
    fill: 'rgba(148, 163, 184, 0.08)',
    border: 'rgba(148, 163, 184, 0.25)',
    text: '#94a3b8',
    bgBadge: 'rgba(148, 163, 184, 0.12)',
  },
};

const SMART_FILTER_SUGGESTIONS = [
  'Focus on authentication, JWT, and session validation flows',
  'Ingest API endpoints, route handlers, and middleware only',
  'Core domain models, schemas, and database migrations',
  'State stores, client UI components, and reactive hooks',
  'Exclude all tests, build tools, and generated fixtures',
];

// =============================================================================
// Helper: Fallback Treemap Construction from Files
// =============================================================================

function buildFallbackTreemap(files: RepoFileRecord[]): TreemapNode {
  const root: TreemapNode = {
    id: 'root',
    name: 'repository',
    path: '',
    kind: 'dir',
    tokens: 0,
    bytes: 0,
    fileCount: files.length,
    children: [],
  };

  const dirMap = new Map<string, TreemapNode>();
  dirMap.set('', root);

  for (const file of files) {
    const parts = file.path.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!dirMap.has(currentPath)) {
        const dirNode: TreemapNode = {
          id: `dir_${currentPath}`,
          name: part,
          path: currentPath,
          kind: 'dir',
          tokens: 0,
          bytes: 0,
          fileCount: 0,
          children: [],
        };
        dirMap.set(currentPath, dirNode);
        const parentNode = dirMap.get(parentPath);
        if (parentNode && parentNode.children) {
          parentNode.children.push(dirNode);
        }
      }
    }

    const fileNode: TreemapNode = {
      id: `file_${file.path}`,
      name: file.name,
      path: file.path,
      kind: 'file',
      tokens: file.estimatedTokens || Math.round(file.sizeBytes / 4),
      bytes: file.sizeBytes,
      fileCount: 1,
      language: file.language,
      layer: file.layer,
    };

    const parentDir = dirMap.get(file.directory || '');
    if (parentDir && parentDir.children) {
      parentDir.children.push(fileNode);
    } else {
      root.children?.push(fileNode);
    }
  }

  // Roll up statistics
  function rollUp(node: TreemapNode): { tokens: number; bytes: number; count: number } {
    if (node.kind === 'file') {
      return { tokens: node.tokens, bytes: node.bytes, count: 1 };
    }
    let t = 0;
    let b = 0;
    let c = 0;
    if (node.children) {
      for (const child of node.children) {
        const stats = rollUp(child);
        t += stats.tokens;
        b += stats.bytes;
        c += stats.count;
      }
    }
    node.tokens = t;
    node.bytes = b;
    node.fileCount = c;
    return { tokens: t, bytes: b, count: c };
  }

  rollUp(root);
  return root;
}

// =============================================================================
// Helper: Pattern Glob Matcher
// =============================================================================

function matchesPattern(path: string, pattern: string): boolean {
  if (!pattern || !path) return false;
  const p = pattern.trim().toLowerCase();
  const target = path.toLowerCase();

  if (p === target) return true;
  if (p.startsWith('*.')) {
    const ext = p.slice(1);
    return target.endsWith(ext);
  }
  if (p.endsWith('/**')) {
    const prefix = p.slice(0, -3);
    return target.startsWith(prefix) || target.includes(`/${prefix}`);
  }
  if (p.includes('*')) {
    const regexPattern = p.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    return new RegExp(`^${regexPattern}$`).test(target) || target.includes(p.replace(/\*/g, ''));
  }
  return target.includes(p);
}

// =============================================================================
// Main Component: TokenTreemapView
// =============================================================================

export function TokenTreemapView({
  blueprint,
  externalFilterOptions,
  onPeekFile,
}: TokenTreemapViewProps) {
  // ---------------------------------------------------------------------------
  // Filter Options State
  // ---------------------------------------------------------------------------
  const [filterOptions, setFilterOptions] = useState<DigestFilterOptions>(() => ({
    includePatterns: externalFilterOptions?.includePatterns ?? [],
    excludePatterns: externalFilterOptions?.excludePatterns ?? [
      '*.lock',
      'package-lock.json',
      'pnpm-lock.yaml',
      'dist/**',
      'build/**',
      '.next/**',
      'node_modules/**',
    ],
    maxFileSizeBytes: externalFilterOptions?.maxFileSizeBytes ?? 250_000,
    maxTotalTokens: externalFilterOptions?.maxTotalTokens ?? 256_000,
    includeTests: externalFilterOptions?.includeTests ?? false,
    includeDocs: externalFilterOptions?.includeDocs ?? true,
    includeTreeHeader: externalFilterOptions?.includeTreeHeader ?? true,
    selectedSubsystems: externalFilterOptions?.selectedSubsystems ?? [],
  }));

  // Sync externalFilterOptions when prop changes
  useEffect(() => {
    if (externalFilterOptions) {
      setFilterOptions((prev) => ({
        ...prev,
        ...externalFilterOptions,
      }));
    }
  }, [externalFilterOptions]);

  // ---------------------------------------------------------------------------
  // AI Smart Filter State
  // ---------------------------------------------------------------------------
  const [smartPrompt, setSmartPrompt] = useState('');
  const [isSmartFiltering, setIsSmartFiltering] = useState(false);
  const [smartFilterFeedback, setSmartFilterFeedback] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Digest Compilation State
  // ---------------------------------------------------------------------------
  const [compiledDigest, setCompiledDigest] = useState<CompiledDigest | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // UI Interaction States
  // ---------------------------------------------------------------------------
  const [drillStack, setDrillStack] = useState<TreemapNode[]>([]);
  const [hoveredRect, setHoveredRect] = useState<{
    rect: TreemapRect;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreemapNode | null>(null);

  const [newIncludeInput, setNewIncludeInput] = useState('');
  const [newExcludeInput, setNewExcludeInput] = useState('');
  const [showRawDigest, setShowRawDigest] = useState(false);
  const [rawDigestSearch, setRawDigestSearch] = useState('');

  const [copyStatus, setCopyStatus] = useState<'idle' | 'digest' | 'markdown'>('idle');

  // SVG Treemap Container Ref for responsive sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 940, height: 520 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 200) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: Math.max(420, Math.min(680, Math.floor(entry.contentRect.width * 0.52))),
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ---------------------------------------------------------------------------
  // Base Root Treemap Resolution
  // ---------------------------------------------------------------------------
  const rootTreemap = useMemo<TreemapNode>(() => {
    if (blueprint.treemap && blueprint.treemap.children && blueprint.treemap.children.length > 0) {
      return blueprint.treemap;
    }
    return buildFallbackTreemap(blueprint.files || []);
  }, [blueprint]);

  // Current zoomed directory node
  const activeDirectoryNode = drillStack.length > 0 ? drillStack[drillStack.length - 1] : rootTreemap;

  // ---------------------------------------------------------------------------
  // Dynamic Filtering of Treemap for Visual Feedback
  // ---------------------------------------------------------------------------
  const filteredTreemap = useMemo<TreemapNode>(() => {
    function filterNode(node: TreemapNode): TreemapNode | null {
      if (node.kind === 'file') {
        const path = node.path;
        // Test file filter
        if (!filterOptions.includeTests) {
          const isTest =
            path.includes('.test.') ||
            path.includes('.spec.') ||
            path.includes('__tests__') ||
            path.endsWith('_test.go');
          if (isTest) return null;
        }

        // Docs filter
        if (!filterOptions.includeDocs) {
          const isDoc =
            path.endsWith('.md') ||
            path.endsWith('.markdown') ||
            path.includes('/docs/') ||
            path.includes('README');
          if (isDoc) return null;
        }

        // Exclude pattern check
        for (const pattern of filterOptions.excludePatterns) {
          if (matchesPattern(path, pattern)) return null;
        }

        // Include pattern check (if any patterns specified)
        if (filterOptions.includePatterns.length > 0) {
          const matchesAnyInclude = filterOptions.includePatterns.some((pattern) =>
            matchesPattern(path, pattern)
          );
          if (!matchesAnyInclude) return null;
        }

        return node;
      }

      // Directory handling
      if (!node.children || node.children.length === 0) return null;

      const keptChildren: TreemapNode[] = [];
      let totalTok = 0;
      let totalB = 0;
      let totalCount = 0;

      for (const child of node.children) {
        const filteredChild = filterNode(child);
        if (filteredChild) {
          keptChildren.push(filteredChild);
          totalTok += filteredChild.tokens;
          totalB += filteredChild.bytes;
          totalCount += filteredChild.fileCount;
        }
      }

      if (keptChildren.length === 0) return null;

      return {
        ...node,
        tokens: totalTok,
        bytes: totalB,
        fileCount: totalCount,
        children: keptChildren,
      };
    }

    const filtered = filterNode(activeDirectoryNode);
    return (
      filtered || {
        ...activeDirectoryNode,
        children: [],
        tokens: 0,
        bytes: 0,
        fileCount: 0,
      }
    );
  }, [activeDirectoryNode, filterOptions]);

  // ---------------------------------------------------------------------------
  // Compute Squarified Rectangles
  // ---------------------------------------------------------------------------
  const treemapRects = useMemo<TreemapRect[]>(() => {
    if (!filteredTreemap) return [];
    return computeSquarifiedTreemap(
      filteredTreemap,
      dimensions.width,
      dimensions.height,
      3
    );
  }, [filteredTreemap, dimensions.width, dimensions.height]);

  // Leaf file rectangles for rendering
  const leafRects = useMemo(() => {
    return treemapRects.filter((r) => r.depth > 0 && r.width >= 4 && r.height >= 4);
  }, [treemapRects]);

  // ---------------------------------------------------------------------------
  // Token Utilization Calculations
  // ---------------------------------------------------------------------------
  const totalTokens = compiledDigest ? compiledDigest.totalTokens : filteredTreemap.tokens;
  const budgetTarget = filterOptions.maxTotalTokens;
  const utilizationRatio = budgetTarget > 0 ? totalTokens / budgetTarget : 0;
  const utilizationPercent = (utilizationRatio * 100).toFixed(1);

  const includedFileCount = compiledDigest ? compiledDigest.includedFiles : filteredTreemap.fileCount;
  const totalRepoFiles = blueprint.stats?.totalFiles || blueprint.files?.length || 1;

  // Status tier for gauge
  const budgetStatusTier =
    utilizationRatio <= 0.8
      ? 'optimal'
      : utilizationRatio <= 1.0
      ? 'warning'
      : 'overflow';

  // ---------------------------------------------------------------------------
  // Compile Digest API Call
  // ---------------------------------------------------------------------------
  const handleTriggerCompile = useCallback(async () => {
    setIsCompiling(true);
    setCompileError(null);
    try {
      const digest = await postCompileDigest(blueprint.repoId, filterOptions);
      setCompiledDigest(digest);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to compile digest';
      setCompileError(msg);
    } finally {
      setIsCompiling(false);
    }
  }, [blueprint.repoId, filterOptions]);

  // Auto-compile on initial mount
  useEffect(() => {
    handleTriggerCompile();
  }, [handleTriggerCompile]);

  // ---------------------------------------------------------------------------
  // AI Smart Filter Execution
  // ---------------------------------------------------------------------------
  const handleExecuteSmartFilter = async (queryText?: string) => {
    const text = queryText ?? smartPrompt;
    if (!text.trim()) return;

    setIsSmartFiltering(true);
    setSmartFilterFeedback(null);
    try {
      const res = await postSmartFilterDigest(blueprint.repoId, text.trim());
      if (res.options) {
        setFilterOptions((prev) => ({
          ...prev,
          ...res.options,
        }));
      }
      if (res.digest) {
        setCompiledDigest(res.digest);
      }
      setSmartFilterFeedback(`Applied AI Smart Filter for: "${text.trim()}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Smart filter failed';
      setSmartFilterFeedback(`Error: ${msg}`);
    } finally {
      setIsSmartFiltering(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Glob Filter Controls
  // ---------------------------------------------------------------------------
  const handleAddIncludePattern = () => {
    const val = newIncludeInput.trim();
    if (!val || filterOptions.includePatterns.includes(val)) return;
    setFilterOptions((prev) => ({
      ...prev,
      includePatterns: [...prev.includePatterns, val],
    }));
    setNewIncludeInput('');
  };

  const handleRemoveIncludePattern = (pattern: string) => {
    setFilterOptions((prev) => ({
      ...prev,
      includePatterns: prev.includePatterns.filter((p) => p !== pattern),
    }));
  };

  const handleAddExcludePattern = () => {
    const val = newExcludeInput.trim();
    if (!val || filterOptions.excludePatterns.includes(val)) return;
    setFilterOptions((prev) => ({
      ...prev,
      excludePatterns: [...prev.excludePatterns, val],
    }));
    setNewExcludeInput('');
  };

  const handleRemoveExcludePattern = (pattern: string) => {
    setFilterOptions((prev) => ({
      ...prev,
      excludePatterns: prev.excludePatterns.filter((p) => p !== pattern),
    }));
  };

  // ---------------------------------------------------------------------------
  // Treemap Drilldown Navigation
  // ---------------------------------------------------------------------------
  const handleDrillIntoNode = (node: TreemapNode) => {
    if (node.kind === 'dir' && node.children && node.children.length > 0) {
      setDrillStack((prev) => [...prev, node]);
      setSelectedNode(node);
    } else if (node.kind === 'file') {
      setSelectedNode(node);
      onPeekFile(node.path);
    }
  };

  const handleDrillToBreadcrumb = (index: number) => {
    if (index === -1) {
      setDrillStack([]);
    } else {
      setDrillStack((prev) => prev.slice(0, index + 1));
    }
    setSelectedNode(null);
  };

  // ---------------------------------------------------------------------------
  // Clipboard and Download Exports
  // ---------------------------------------------------------------------------
  const rawDigestContent = useMemo(() => {
    if (compiledDigest?.digestText) {
      return compiledDigest.digestText;
    }
    // Fallback digest header & tree text
    return `===============================================================================
Repository Digest: ${blueprint.metadata?.fullName || blueprint.repoId}
Branch: ${blueprint.metadata?.defaultBranch || 'main'}
Total Included Files: ${includedFileCount} | Estimated Tokens: ${totalTokens.toLocaleString()}
Budget Target: ${budgetTarget.toLocaleString()} (${utilizationPercent}%)
Generated by GitUnderstand Gitingest++ Studio
===============================================================================

${blueprint.headline || ''}
${blueprint.architecturePattern || ''}

Active Directory: /${activeDirectoryNode.path}
${leafRects.map((r) => `- [${r.node.layer || 'domain'}] ${r.node.path} (${r.node.tokens.toLocaleString()} tokens)`).join('\n')}`;
  }, [compiledDigest, blueprint, includedFileCount, totalTokens, budgetTarget, utilizationPercent, activeDirectoryNode, leafRects]);

  const handleCopyDigest = async () => {
    try {
      await navigator.clipboard.writeText(rawDigestContent);
      setCopyStatus('digest');
      setTimeout(() => setCopyStatus('idle'), 2400);
    } catch {
      // Fallback
    }
  };

  const handleCopyMarkdown = async () => {
    const md = `\`\`\`markdown\n<!-- GitUnderstand Context Digest -->\n<!-- Repo: ${blueprint.metadata?.fullName || blueprint.repoId} | Branch: ${blueprint.metadata?.defaultBranch || 'main'} -->\n<!-- Tokens: ${totalTokens.toLocaleString()} / ${budgetTarget.toLocaleString()} (${utilizationPercent}%) -->\n\n${rawDigestContent}\n\`\`\``;
    try {
      await navigator.clipboard.writeText(md);
      setCopyStatus('markdown');
      setTimeout(() => setCopyStatus('idle'), 2400);
    } catch {
      // Fallback
    }
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([rawDigestContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const slug = (blueprint.metadata?.name || 'repository').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    link.href = url;
    link.download = `gitunderstand-${slug}-digest.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filtered raw digest preview lines
  const filteredRawPreviewLines = useMemo(() => {
    const lines = rawDigestContent.split('\n');
    if (!rawDigestSearch.trim()) return lines.slice(0, 300);
    const q = rawDigestSearch.toLowerCase();
    return lines.filter((l) => l.toLowerCase().includes(q)).slice(0, 300);
  }, [rawDigestContent, rawDigestSearch]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6 w-full text-[var(--ink-primary)]">
      {/* =====================================================================
          1. Lens Header & AI Smart Filter Bar
          ===================================================================== */}
      <div className="flex flex-col gap-4 p-5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--cobalt-tint)] border border-[var(--cobalt-ice)]/30 text-[var(--cobalt-bright)]">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-[var(--ink-primary)]">
                  Gitingest Visual Token Treemap
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-ice)]/30">
                  Gitingest++ Lens
                </span>
              </div>
              <p className="text-xs text-[var(--ink-secondary)]">
                Context-budgeted token treemap with interactive drilldown, Gemini 4 smart slicing, and 1-click LLM ingest.
              </p>
            </div>
          </div>

          {/* Quick Actions / Re-compile Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerCompile}
              disabled={isCompiling}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-card)] bg-[var(--bg-card-elevated)] hover:bg-[var(--cobalt-tint)] hover:border-[var(--cobalt-ice)]/50 transition-all text-[var(--ink-primary)] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCompiling ? 'animate-spin text-[var(--cobalt-bright)]' : ''}`} />
              <span>{isCompiling ? 'Compiling...' : 'Recompile Digest'}</span>
            </button>
          </div>
        </div>

        {/* AI Smart Filter Input */}
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-card)]/60">
          <div className="relative flex items-center w-full">
            <Sparkles className="absolute left-3.5 w-4 h-4 text-[var(--cobalt-bright)] pointer-events-none" />
            <input
              type="text"
              value={smartPrompt}
              onChange={(e) => setSmartPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExecuteSmartFilter()}
              placeholder="Ask Gemini to filter digest for your specific goal... (e.g. 'Focus on authentication and database layer')"
              className="w-full pl-10 pr-24 py-2.5 text-sm rounded-lg bg-[var(--bg-void)] border border-[var(--border-card)] focus:border-[var(--cobalt-ice)] focus:ring-1 focus:ring-[var(--cobalt-bright)] text-[var(--ink-primary)] placeholder-[var(--ink-muted)] outline-none transition-all"
            />
            <button
              onClick={() => handleExecuteSmartFilter()}
              disabled={isSmartFiltering || !smartPrompt.trim()}
              className="absolute right-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white transition-all disabled:opacity-40 disabled:hover:bg-[var(--cobalt-core)] cursor-pointer flex items-center gap-1"
            >
              {isSmartFiltering ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Thinking...</span>
                </>
              ) : (
                <>
                  <Filter className="w-3 h-3" />
                  <span>Smart Filter</span>
                </>
              )}
            </button>
          </div>

          {/* Quick AI Suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--ink-muted)]">
            <span className="font-mono text-[11px] text-[var(--ink-secondary)] mr-1">Quick prompts:</span>
            {SMART_FILTER_SUGGESTIONS.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setSmartPrompt(suggestion);
                  handleExecuteSmartFilter(suggestion);
                }}
                className="px-2 py-0.5 rounded text-[11px] bg-[var(--bg-card-elevated)] hover:bg-[var(--cobalt-tint)] border border-[var(--border-card)] hover:border-[var(--cobalt-ice)]/40 text-[var(--ink-secondary)] hover:text-[var(--cobalt-ice)] transition-colors cursor-pointer truncate max-w-[280px]"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Feedback banner if smart filter was applied */}
          {smartFilterFeedback && (
            <div className="flex items-center justify-between text-xs px-3 py-2 rounded-md bg-[var(--cobalt-tint)] border border-[var(--cobalt-ice)]/30 text-[var(--cobalt-ice)]">
              <span>{smartFilterFeedback}</span>
              <button
                onClick={() => setSmartFilterFeedback(null)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {compileError && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-md bg-[var(--vermilion)]/15 border border-[var(--vermilion)]/40 text-[var(--vermilion)]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{compileError}</span>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          2. Live Token Budget Gauge & Preset Controls
          ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Token Budget Gauge Card */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--cobalt-bright)]" />
              <span className="text-sm font-semibold text-[var(--ink-primary)]">
                Live Token Budget Gauge
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-medium border ${
                  budgetStatusTier === 'optimal'
                    ? 'bg-[var(--emerald)]/15 text-[var(--emerald)] border-[var(--emerald)]/30'
                    : budgetStatusTier === 'warning'
                    ? 'bg-[var(--amber)]/15 text-[var(--amber)] border-[var(--amber)]/30'
                    : 'bg-[var(--vermilion)]/15 text-[var(--vermilion)] border-[var(--vermilion)]/30'
                }`}
              >
                {budgetStatusTier === 'optimal' && 'Optimal Context'}
                {budgetStatusTier === 'warning' && 'Near Budget Limit'}
                {budgetStatusTier === 'overflow' && 'Over Budget (Truncation)'}
              </span>
            </div>
          </div>

          {/* Progress Bar Gauge */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between font-mono text-xs">
              <span className="text-base font-bold text-[var(--ink-primary)]">
                {totalTokens.toLocaleString()} <span className="text-xs font-normal text-[var(--ink-muted)]">tokens</span>
              </span>
              <span className="text-[var(--ink-secondary)]">
                Target: <span className="text-[var(--ink-primary)] font-semibold">{budgetTarget.toLocaleString()}</span> ({utilizationPercent}%)
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-[var(--bg-void)] border border-[var(--border-card)] overflow-hidden relative">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  budgetStatusTier === 'optimal'
                    ? 'bg-gradient-to-r from-[var(--cobalt-core)] to-[var(--emerald)]'
                    : budgetStatusTier === 'warning'
                    ? 'bg-gradient-to-r from-[var(--cobalt-core)] to-[var(--amber)]'
                    : 'bg-gradient-to-r from-[var(--amber)] to-[var(--vermilion)]'
                }`}
                style={{ width: `${Math.min(100, Math.max(2, utilizationRatio * 100))}%` }}
              />
              {/* Target 100% threshold marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/40"
                style={{ left: '100%' }}
              />
            </div>
          </div>

          {/* Stats Footnote */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-card)]/50 text-xs font-mono">
            <div>
              <span className="text-[var(--ink-muted)] block text-[11px]">Included Files</span>
              <span className="font-semibold text-[var(--ink-primary)]">
                {includedFileCount} <span className="text-[var(--ink-muted)] font-normal">/ {totalRepoFiles}</span>
              </span>
            </div>
            <div>
              <span className="text-[var(--ink-muted)] block text-[11px]">Source Volume</span>
              <span className="font-semibold text-[var(--ink-primary)]">
                {Math.round((filteredTreemap.bytes || 0) / 1024).toLocaleString()} KB
              </span>
            </div>
            <div>
              <span className="text-[var(--ink-muted)] block text-[11px]">Recommended Model</span>
              <span className="font-semibold text-[var(--cobalt-ice)]">
                {budgetTarget <= 128_000 ? 'Gemini 4 Flash' : budgetTarget <= 256_000 ? 'Gemini 4 Pro' : 'Gemini 4 Ultra'}
              </span>
            </div>
          </div>
        </div>

        {/* Budget Presets & Context Window Sizing */}
        <div className="p-5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sliders className="w-4 h-4 text-[var(--cobalt-bright)]" />
              <span className="text-sm font-semibold text-[var(--ink-primary)]">
                Budget Presets
              </span>
            </div>
            <p className="text-xs text-[var(--ink-muted)]">
              Choose context target size or enter custom token ceiling.
            </p>
          </div>

          {/* Presets Button Row */}
          <div className="grid grid-cols-3 gap-2">
            {BUDGET_PRESETS.map((preset) => {
              const isSelected = filterOptions.maxTotalTokens === preset.tokens;
              return (
                <button
                  key={preset.label}
                  onClick={() =>
                    setFilterOptions((prev) => ({
                      ...prev,
                      maxTotalTokens: preset.tokens,
                    }))
                  }
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--cobalt-tint)] border-[var(--cobalt-ice)] text-[var(--cobalt-ice)] shadow-sm'
                      : 'bg-[var(--bg-card-elevated)] border-[var(--border-card)] text-[var(--ink-secondary)] hover:border-[var(--cobalt-ice)]/40 hover:text-[var(--ink-primary)]'
                  }`}
                >
                  <span className="font-bold text-sm">{preset.label}</span>
                  <span className="text-[10px] text-[var(--ink-muted)]">
                    {preset.tokens >= 1_000_000
                      ? `${preset.tokens / 1_000_000}M`
                      : `${preset.tokens / 1000}k`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Budget Slider / Input */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-card)]/50">
            <span className="text-xs text-[var(--ink-secondary)]">Custom Cap:</span>
            <input
              type="number"
              step={10000}
              min={10000}
              max={2000000}
              value={filterOptions.maxTotalTokens}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val > 0) {
                  setFilterOptions((prev) => ({
                    ...prev,
                    maxTotalTokens: val,
                  }));
                }
              }}
              className="w-28 px-2 py-1 rounded bg-[var(--bg-void)] border border-[var(--border-card)] text-xs font-mono text-right text-[var(--ink-primary)] outline-none focus:border-[var(--cobalt-ice)]"
            />
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. Filter Toggles & Include/Exclude Glob Chips
          ===================================================================== */}
      <div className="p-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col gap-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Toggles: Tests, Docs, Directory Tree Header */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterOptions.includeTests}
                onChange={(e) =>
                  setFilterOptions((prev) => ({
                    ...prev,
                    includeTests: e.target.checked,
                  }))
                }
                className="rounded border-[var(--border-card)] bg-[var(--bg-void)] text-[var(--cobalt-core)] focus:ring-[var(--cobalt-bright)] w-4 h-4 cursor-pointer"
              />
              <span className="text-[var(--ink-primary)] font-medium">Include Test Suites</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterOptions.includeDocs}
                onChange={(e) =>
                  setFilterOptions((prev) => ({
                    ...prev,
                    includeDocs: e.target.checked,
                  }))
                }
                className="rounded border-[var(--border-card)] bg-[var(--bg-void)] text-[var(--cobalt-core)] focus:ring-[var(--cobalt-bright)] w-4 h-4 cursor-pointer"
              />
              <span className="text-[var(--ink-primary)] font-medium">Include Markdown & Docs</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterOptions.includeTreeHeader}
                onChange={(e) =>
                  setFilterOptions((prev) => ({
                    ...prev,
                    includeTreeHeader: e.target.checked,
                  }))
                }
                className="rounded border-[var(--border-card)] bg-[var(--bg-void)] text-[var(--cobalt-core)] focus:ring-[var(--cobalt-bright)] w-4 h-4 cursor-pointer"
              />
              <span className="text-[var(--ink-primary)] font-medium">Directory Tree Header</span>
            </label>
          </div>

          {/* Quick 1-Click Digest Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyDigest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card-elevated)] hover:bg-[var(--cobalt-tint)] hover:border-[var(--cobalt-ice)]/40 transition-all font-medium text-[var(--ink-primary)] cursor-pointer"
            >
              {copyStatus === 'digest' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--emerald)]" />
                  <span className="text-[var(--emerald)]">Digest Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Digest</span>
                </>
              )}
            </button>

            <button
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card-elevated)] hover:bg-[var(--cobalt-tint)] hover:border-[var(--cobalt-ice)]/40 transition-all font-medium text-[var(--ink-primary)] cursor-pointer"
            >
              {copyStatus === 'markdown' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--emerald)]" />
                  <span className="text-[var(--emerald)]">MD Copied!</span>
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5" />
                  <span>Copy .md</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadTxt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white transition-all font-medium cursor-pointer shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .txt</span>
            </button>
          </div>
        </div>

        {/* Include / Exclude Glob Chips Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-[var(--border-card)]/50">
          {/* Include Patterns */}
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-[var(--ink-secondary)] flex items-center gap-1">
              Include Globs <span className="text-[10px] text-[var(--ink-muted)]">(Whitelist)</span>
            </span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {filterOptions.includePatterns.length === 0 ? (
                <span className="text-[var(--ink-muted)] italic text-[11px]">
                  All files eligible (no whitelist restriction)
                </span>
              ) : (
                filterOptions.includePatterns.map((pat) => (
                  <span
                    key={pat}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--cobalt-tint)] border border-[var(--cobalt-ice)]/30 text-[var(--cobalt-ice)] font-mono text-[11px]"
                  >
                    <span>{pat}</span>
                    <button
                      onClick={() => handleRemoveIncludePattern(pat)}
                      className="hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="text"
                value={newIncludeInput}
                onChange={(e) => setNewIncludeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddIncludePattern()}
                placeholder="e.g. src/**, *.ts, api/**"
                className="flex-1 px-2.5 py-1 rounded bg-[var(--bg-void)] border border-[var(--border-card)] text-xs font-mono text-[var(--ink-primary)] placeholder-[var(--ink-muted)] outline-none focus:border-[var(--cobalt-ice)]"
              />
              <button
                onClick={handleAddIncludePattern}
                className="px-2.5 py-1 rounded bg-[var(--bg-card-elevated)] border border-[var(--border-card)] hover:border-[var(--cobalt-ice)]/40 text-[var(--ink-primary)] text-xs font-medium cursor-pointer"
              >
                + Include
              </button>
            </div>
          </div>

          {/* Exclude Patterns */}
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-[var(--ink-secondary)] flex items-center gap-1">
              Exclude Globs <span className="text-[10px] text-[var(--ink-muted)]">(Blacklist)</span>
            </span>
            <div className="flex flex-wrap gap-1.5 items-center max-h-24 overflow-y-auto">
              {filterOptions.excludePatterns.map((pat) => (
                <span
                  key={pat}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--vermilion)]/10 border border-[var(--vermilion)]/30 text-[var(--vermilion)] font-mono text-[11px]"
                >
                  <span>{pat}</span>
                  <button
                    onClick={() => handleRemoveExcludePattern(pat)}
                    className="hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="text"
                value={newExcludeInput}
                onChange={(e) => setNewExcludeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddExcludePattern()}
                placeholder="e.g. *.lock, build/**, **/*.min.js"
                className="flex-1 px-2.5 py-1 rounded bg-[var(--bg-void)] border border-[var(--border-card)] text-xs font-mono text-[var(--ink-primary)] placeholder-[var(--ink-muted)] outline-none focus:border-[var(--cobalt-ice)]"
              />
              <button
                onClick={handleAddExcludePattern}
                className="px-2.5 py-1 rounded bg-[var(--bg-card-elevated)] border border-[var(--border-card)] hover:border-[var(--vermilion)]/40 text-[var(--ink-primary)] text-xs font-medium cursor-pointer"
              >
                + Exclude
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          4. Interactive Squarified SVG Token Treemap
          ===================================================================== */}
      <div className="p-5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col gap-3">
        {/* Treemap Navigation Breadcrumbs & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-mono text-[var(--ink-secondary)]">
            <button
              onClick={() => handleDrillToBreadcrumb(-1)}
              className={`hover:text-[var(--cobalt-ice)] transition-colors cursor-pointer flex items-center gap-1 ${
                drillStack.length === 0 ? 'text-[var(--cobalt-bright)] font-bold' : ''
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              <span>root</span>
            </button>

            {drillStack.map((crumb, idx) => {
              const isLast = idx === drillStack.length - 1;
              return (
                <React.Fragment key={crumb.id || idx}>
                  <ChevronRight className="w-3 h-3 text-[var(--ink-muted)]" />
                  <button
                    onClick={() => handleDrillToBreadcrumb(idx)}
                    className={`hover:text-[var(--cobalt-ice)] transition-colors cursor-pointer ${
                      isLast ? 'text-[var(--cobalt-bright)] font-bold' : 'text-[var(--ink-secondary)]'
                    }`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-[var(--ink-muted)] font-mono">
            {drillStack.length > 0 && (
              <button
                onClick={() => setDrillStack((prev) => prev.slice(0, -1))}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-card-elevated)] border border-[var(--border-card)] hover:text-[var(--ink-primary)] cursor-pointer"
              >
                <ArrowUpLeft className="w-3 h-3" />
                <span>Up one level</span>
              </button>
            )}
            <span>
              Showing {leafRects.length} nodes ({Math.round(filteredTreemap.tokens).toLocaleString()} tok)
            </span>
          </div>
        </div>

        {/* SVG Canvas Area */}
        <div
          ref={containerRef}
          className="relative w-full rounded-lg bg-[var(--bg-void)] border border-[var(--border-card)] overflow-hidden select-none min-h-[420px]"
          onMouseLeave={() => setHoveredRect(null)}
        >
          {leafRects.length === 0 ? (
            <div className="w-full h-[420px] flex flex-col items-center justify-center gap-2 text-[var(--ink-muted)]">
              <FolderOpen className="w-8 h-8 opacity-40 text-[var(--cobalt-bright)]" />
              <p className="text-sm">No files match the active filters or directory path.</p>
              <button
                onClick={() => {
                  setDrillStack([]);
                  setFilterOptions((prev) => ({
                    ...prev,
                    includePatterns: [],
                    excludePatterns: ['*.lock', 'node_modules/**'],
                  }));
                }}
                className="text-xs text-[var(--cobalt-ice)] hover:underline cursor-pointer"
              >
                Reset filters & zoom to root
              </button>
            </div>
          ) : (
            <svg
              width={dimensions.width}
              height={dimensions.height}
              className="w-full h-auto block"
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            >
              <defs>
                <pattern id="grid-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255, 255, 255, 0.02)" strokeWidth="1" />
                </pattern>
              </defs>

              <rect width="100%" height="100%" fill="url(#grid-pattern)" />

              {/* Render Leaf Rectangles */}
              {leafRects.map((rect) => {
                const node = rect.node;
                const isDir = node.kind === 'dir';
                const layer = node.layer || 'default';
                const style = LAYER_STYLE[layer] || LAYER_STYLE.default;
                const isHovered = hoveredRect?.rect.node.id === node.id;
                const isSelected = selectedNode?.id === node.id;

                const pad = 1;
                const rx = rect.x + pad;
                const ry = rect.y + pad;
                const rw = Math.max(1, rect.width - pad * 2);
                const rh = Math.max(1, rect.height - pad * 2);

                const showFullLabel = rw >= 56 && rh >= 24;
                const showTokenBadge = rw >= 78 && rh >= 44;

                return (
                  <g
                    key={`${node.id}_${rect.x}_${rect.y}`}
                    onClick={() => handleDrillIntoNode(node)}
                    onMouseEnter={(e) =>
                      setHoveredRect({
                        rect,
                        clientX: e.clientX,
                        clientY: e.clientY,
                      })
                    }
                    onMouseMove={(e) =>
                      setHoveredRect({
                        rect,
                        clientX: e.clientX,
                        clientY: e.clientY,
                      })
                    }
                    className="cursor-pointer transition-opacity"
                    style={{ opacity: isHovered ? 1 : 0.92 }}
                  >
                    {/* Rectangle Background */}
                    <rect
                      x={rx}
                      y={ry}
                      width={rw}
                      height={rh}
                      rx={3}
                      ry={3}
                      fill={isDir ? 'rgba(30, 41, 59, 0.25)' : style.fill}
                      stroke={
                        isSelected
                          ? 'var(--cobalt-ice)'
                          : isHovered
                          ? '#ffffff'
                          : isDir
                          ? 'rgba(255, 255, 255, 0.12)'
                          : style.border
                      }
                      strokeWidth={isSelected || isHovered ? 2 : 1}
                      strokeDasharray={isDir ? '4 2' : undefined}
                    />

                    {/* Text Label */}
                    {showFullLabel && (
                      <text
                        x={rx + 6}
                        y={ry + 16}
                        fontSize={rw < 90 ? '10' : '11'}
                        fontFamily="var(--font-mono)"
                        fill={isDir ? '#cbd5e1' : style.text}
                        fontWeight={isDir ? '600' : '500'}
                        className="pointer-events-none select-none"
                      >
                        {truncateString(node.name, Math.floor(rw / 7.5))}
                      </text>
                    )}

                    {/* Token Count Sub-label */}
                    {showTokenBadge && (
                      <text
                        x={rx + 6}
                        y={ry + 32}
                        fontSize="9"
                        fontFamily="var(--font-mono)"
                        fill="rgba(255, 255, 255, 0.55)"
                        className="pointer-events-none select-none"
                      >
                        {formatTokensK(node.tokens)} tok
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          {/* Floating Hover Tooltip */}
          {hoveredRect && (
            <div
              className="absolute z-20 pointer-events-none p-3 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card-elevated)] shadow-2xl text-xs flex flex-col gap-1.5 min-w-[220px] max-w-[320px] backdrop-blur-md"
              style={{
                left: Math.min(dimensions.width - 240, Math.max(12, hoveredRect.rect.x + 12)),
                top: Math.min(dimensions.height - 130, Math.max(12, hoveredRect.rect.y + 12)),
              }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border-card)]/50 pb-1.5">
                <span className="font-mono font-semibold text-[var(--ink-primary)] truncate">
                  {hoveredRect.rect.node.name}
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase ${
                    hoveredRect.rect.node.kind === 'dir'
                      ? 'bg-[var(--border-card)] text-[var(--ink-secondary)]'
                      : 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]'
                  }`}
                >
                  {hoveredRect.rect.node.kind}
                </span>
              </div>

              <div className="text-[11px] font-mono text-[var(--ink-muted)] truncate">
                /{hoveredRect.rect.node.path}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                <div>
                  <span className="text-[var(--ink-muted)] block text-[10px]">Tokens:</span>
                  <span className="text-[var(--cobalt-ice)] font-bold">
                    {hoveredRect.rect.node.tokens.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--ink-muted)] block text-[10px]">Size:</span>
                  <span className="text-[var(--ink-primary)]">
                    {Math.round(hoveredRect.rect.node.bytes / 1024)} KB
                  </span>
                </div>
              </div>

              {hoveredRect.rect.node.layer && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--border-card)]/40 text-[10px]">
                  <span className="text-[var(--ink-muted)]">Layer:</span>
                  <span
                    className="font-mono px-1.5 py-0.2 rounded"
                    style={{
                      color: LAYER_STYLE[hoveredRect.rect.node.layer]?.text || '#94a3b8',
                      backgroundColor: LAYER_STYLE[hoveredRect.rect.node.layer]?.bgBadge || 'rgba(255,255,255,0.08)',
                    }}
                  >
                    {hoveredRect.rect.node.layer}
                  </span>
                </div>
              )}

              <div className="text-[10px] text-[var(--ink-muted)] italic pt-1">
                {hoveredRect.rect.node.kind === 'dir'
                  ? 'Click directory to zoom in'
                  : 'Click file to inspect / peek source'}
              </div>
            </div>
          )}
        </div>

        {/* Selected File Inspection Quick Bar */}
        {selectedNode && selectedNode.kind === 'file' && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--cobalt-ice)]/30 text-xs">
            <div className="flex items-center gap-2 truncate">
              <FileCode className="w-4 h-4 text-[var(--cobalt-bright)] shrink-0" />
              <span className="font-mono font-semibold text-[var(--ink-primary)] truncate">
                {selectedNode.path}
              </span>
              <span className="text-[var(--ink-muted)] font-mono">
                ({selectedNode.tokens.toLocaleString()} tokens)
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onPeekFile(selectedNode.path)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white text-xs font-medium cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Peek Source</span>
              </button>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 text-[var(--ink-muted)] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          5. Collapsible Raw Digest Preview (Collapsed by default)
          ===================================================================== */}
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] overflow-hidden">
        <button
          onClick={() => setShowRawDigest((prev) => !prev)}
          className="w-full flex items-center justify-between p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-card-elevated)] transition-colors cursor-pointer text-left select-none"
        >
          <div className="flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-[var(--cobalt-bright)]" />
            <span className="text-sm font-semibold text-[var(--ink-primary)]">
              Raw Digest Stream Preview
            </span>
            <span className="text-xs font-mono text-[var(--ink-muted)]">
              ({includedFileCount} files &bull; {totalTokens.toLocaleString()} tokens)
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--ink-secondary)]">
            <span>{showRawDigest ? 'Hide Stream' : 'Expand Stream Preview'}</span>
            {showRawDigest ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </button>

        {showRawDigest && (
          <div className="p-4 border-t border-[var(--border-card)] flex flex-col gap-3 bg-[var(--bg-void)]">
            {/* Search and Action Bar within Preview */}
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[var(--ink-muted)]" />
                <input
                  type="text"
                  value={rawDigestSearch}
                  onChange={(e) => setRawDigestSearch(e.target.value)}
                  placeholder="Search in digest text..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded bg-[var(--bg-card)] border border-[var(--border-card)] text-[var(--ink-primary)] placeholder-[var(--ink-muted)] outline-none focus:border-[var(--cobalt-ice)]"
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={handleCopyDigest}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--bg-card-elevated)] border border-[var(--border-card)] hover:text-white cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </button>
                <button
                  onClick={handleDownloadTxt}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--bg-card-elevated)] border border-[var(--border-card)] hover:text-white cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* Monospace Code Stream */}
            <pre className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-card)] font-mono text-[11px] text-[var(--ink-secondary)] overflow-x-auto max-h-96 overflow-y-auto leading-relaxed whitespace-pre select-text">
              {filteredRawPreviewLines.join('\n')}
            </pre>
            <p className="text-[10px] text-[var(--ink-muted)] italic">
              Showing preview of first 300 matching lines. Use &ldquo;Copy Digest&rdquo; or &ldquo;Download .txt&rdquo; for full payload.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Helper Formatting Functions
// =============================================================================

function truncateString(str: string, maxLen: number): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return `${str.slice(0, Math.max(1, maxLen - 1))}…`;
}

function formatTokensK(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(tokens);
}
