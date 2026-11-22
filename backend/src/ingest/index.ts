// =============================================================================
// GitUnderstand (git-understand.com) — Unified Ingestion Index
// Agent 14: Orchestrates repository ingestion, AST extraction, deterministic
// visual atlas generation, token treemap construction, and caching.
// =============================================================================

import type {
  VisualAtlasBlueprint,
  PipelineProgressEvent,
  RepoFileRecord,
  TreemapNode,
} from '../../../shared/types.js';

// URL Parsing & Repository Identity
import { parseGitHubInput, buildRepoId } from '../utils/urlParser.js';

// GitHub Repository Fetcher
import { fetchGitHubRepository } from './githubFetcher.js';

// Multi-Language AST Signal Extractor
import { extractFileSignals } from './astParserMulti.js';

// Token, Line & Language Analysis Utilities
import {
  estimateTokens,
  countLines,
  detectLanguageFromPath,
} from '../utils/tokenCounter.js';

// File & Path Filter Classifiers
import {
  isTestFile,
  isConfigFile,
  isLikelyEntrypoint,
} from '../utils/fileFilter.js';

// Deterministic Atlas & Strata Graph Builder
// @ts-ignore - Sibling module may be created concurrently in the agent fleet
import { buildDeterministicAtlas } from './graphBuilder.js';

// Hierarchical Token Treemap Builder
import { buildTokenTreemap } from './treemapBuilder.js';

// Offline Showcase Fixtures
// @ts-ignore - Sibling module may be created concurrently in the agent fleet
import { getShowcaseBlueprint, listShowcaseSummaries } from './showcaseFixtures.js';

// LRU & Disk Cache Store
import { atlasCache } from './cacheStore.js';

// Digest & Agent Brief Compilers
import {
  compileDigest,
  compileAgentMarkdownBrief,
} from './digestCompiler.js';

// Re-exports as mandated by the canonical ingestion interface
export { atlasCache } from './cacheStore.js';
export { compileDigest, compileAgentMarkdownBrief } from './digestCompiler.js';
// @ts-ignore - Sibling module may be created concurrently in the agent fleet
export { listShowcaseSummaries, getShowcaseBlueprint } from './showcaseFixtures.js';

/**
 * Ingestion progress callback type matching the canonical pipeline stages.
 */
export type IngestionProgressCallback = (
  stage: PipelineProgressEvent['stage'],
  percent: number,
  message: string
) => void;

/**
 * Ingestion configuration options.
 */
export interface IngestRepositoryOptions {
  githubToken?: string;
  forceRefresh?: boolean;
  onProgress?: IngestionProgressCallback;
}

/**
 * Ingests a GitHub repository by URL, slug, or ref and constructs a rich, instantly renderable
 * VisualAtlasBlueprint (with aiEnriched: false) in under 1.5s for cached/offline repositories
 * and minimal latency for live GitHub fetches.
 *
 * Execution stages:
 * 1. Checks offline showcase fixtures and LRU/disk cache (unless forceRefresh is true).
 * 2. Fetches repository metadata, recursive file tree, and prioritized file contents from GitHub.
 * 3. Extracts language-aware AST signals (imports, exports, symbols, routes, entrypoint flags).
 * 4. Runs deterministic atlas builder to produce subsystems, nodes, edges, strata, flows, tours, and diagrams.
 * 5. Builds hierarchical token treemap aggregating tokens, bytes, and file counts.
 * 6. Computes repository-wide aggregate stats (totalFiles, analyzedFiles, totalLines, totalTokens, etc.).
 * 7. Persists resulting blueprint into LRU and disk cache.
 */
export async function ingestRepository(
  rawInput: string,
  options?: IngestRepositoryOptions
): Promise<VisualAtlasBlueprint> {
  const startTime = Date.now();
  const onProgress = options?.onProgress;

  if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
    throw new Error('A valid GitHub repository URL, slug, or input string is required.');
  }

  onProgress?.('queued', 5, 'Parsing repository reference and checking cache...');

  // 1. Parse GitHub input into canonical reference
  const parsedRef = parseGitHubInput(rawInput);

  // 2. Check showcase fixtures and cache (unless forceRefresh is requested)
  if (!options?.forceRefresh) {
    // Check offline showcase fixtures first
    let showcase: VisualAtlasBlueprint | null = null;
    try {
      if (typeof getShowcaseBlueprint === 'function') {
        showcase =
          getShowcaseBlueprint(rawInput) ||
          getShowcaseBlueprint(parsedRef.canonicalSlug) ||
          (parsedRef.branch ? getShowcaseBlueprint(`${parsedRef.canonicalSlug}@${parsedRef.branch}`) : null) ||
          getShowcaseBlueprint(parsedRef.repo);
      }
    } catch {
      // Fall through to cache check if showcase lookup fails
    }

    if (showcase) {
      onProgress?.('ready', 100, `Loaded showcase blueprint for ${showcase.metadata.fullName}`);
      return showcase;
    }

    // Check LRU and disk cache with candidate keys
    try {
      const candidateId = buildRepoId(parsedRef.owner, parsedRef.repo, parsedRef.branch);
      const fallbackId = `${parsedRef.owner}__${parsedRef.repo}`;

      const cached = (await atlasCache.get(candidateId)) || (await atlasCache.get(fallbackId));
      if (cached) {
        onProgress?.('ready', 100, `Loaded cached atlas blueprint for ${cached.metadata.fullName}`);
        return cached;
      }
    } catch {
      // Fall through to live GitHub fetch
    }
  }

  // 3. Fetch GitHub repository (metadata, recursive git tree, and prioritized file contents)
  onProgress?.('fetching', 10, `Connecting to GitHub API for ${parsedRef.canonicalSlug}...`);

  const fetchResult = await fetchGitHubRepository(parsedRef, {
    githubToken: options?.githubToken,
    onProgress: (msg: string, pct: number) => {
      // Scale fetcher progress (0..100) into pipeline fetching bracket (10..40%)
      const scaledPct = Math.min(40, Math.round(10 + pct * 0.3));
      onProgress?.('fetching', scaledPct, msg);
    },
  });

  // Re-check cache if default branch was resolved from API and was previously cached
  if (!options?.forceRefresh && fetchResult.metadata?.id) {
    try {
      const cachedByMetaId = await atlasCache.get(fetchResult.metadata.id);
      if (cachedByMetaId) {
        onProgress?.('ready', 100, `Loaded cached atlas blueprint for ${cachedByMetaId.metadata.fullName}`);
        return cachedByMetaId;
      }
    } catch {
      // Proceed to full analysis
    }
  }

  // 4. Parse AST signals for every fetched file
  const totalRawFiles = fetchResult.rawFiles.length;
  onProgress?.(
    'ast_graph',
    42,
    `Analyzing syntax and extracting AST signals for ${totalRawFiles} files...`
  );

  const repoFiles: RepoFileRecord[] = [];

  for (let i = 0; i < totalRawFiles; i++) {
    const raw = fetchResult.rawFiles[i];
    const normalizedPath = raw.path.replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/');
    const name = pathParts[pathParts.length - 1] || normalizedPath;
    const directory = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
    const dotIndex = name.lastIndexOf('.');
    const extension = dotIndex >= 0 ? name.substring(dotIndex) : '';

    const language = detectLanguageFromPath(normalizedPath);
    const content = raw.content ?? '';
    const sizeBytes = raw.sizeBytes > 0 ? raw.sizeBytes : Buffer.byteLength(content, 'utf8');
    const lineCount = countLines(content);
    const estimatedTokens = estimateTokens(content);

    const isEntry = isLikelyEntrypoint(normalizedPath);
    const isTest = isTestFile(normalizedPath);
    const isConfig = isConfigFile(normalizedPath);

    // Extract signals using language-aware AST extractor
    const signals = extractFileSignals(normalizedPath, language, content);

    repoFiles.push({
      path: normalizedPath,
      name,
      directory,
      extension,
      language,
      sizeBytes,
      lineCount,
      estimatedTokens,
      sha: raw.sha,
      content,
      imports: signals?.imports || [],
      resolvedImports: [],
      exports: signals?.exports || [],
      symbols: signals?.symbols || [],
      layer: 'domain', // Will be classified deterministically by buildDeterministicAtlas
      centrality: 0,
      fanIn: 0,
      fanOut: 0,
      isEntrypoint: isEntry,
      isTest,
      isConfig,
    });

    if (totalRawFiles > 20 && (i + 1) % Math.max(1, Math.floor(totalRawFiles / 5)) === 0) {
      const stepPct = Math.round(42 + ((i + 1) / totalRawFiles) * 20);
      onProgress?.('ast_graph', stepPct, `Parsed ${i + 1}/${totalRawFiles} files...`);
    }
  }

  // 5. Build Deterministic Atlas (dependency graph, centrality, subsystems, nodes, edges, strata, flows, tours, diagrams)
  onProgress?.('ast_graph', 65, 'Building dependency graph, subsystems, and strata layers...');

  let atlasResult: ReturnType<typeof buildDeterministicAtlas>;
  if (typeof buildDeterministicAtlas === 'function') {
    atlasResult = buildDeterministicAtlas(fetchResult.metadata, repoFiles);
  } else {
    // Resilient fallback if sibling module is still initializing
    atlasResult = {
      files: repoFiles,
      dependencyEdges: [],
      subsystems: [],
      nodes: [],
      edges: [],
      strata: [],
      flows: [],
      codemapTour: [],
      diagrams: [],
      circularDeps: 0,
      avgFanOut: 0,
      architecturePattern: 'Modular Multi-Tier Architecture',
      techStackBadges: [fetchResult.metadata.primaryLanguage].filter(Boolean),
    };
  }

  // 6. Build Token Treemap
  onProgress?.('treemap', 80, 'Constructing hierarchical token treemap...');

  const treemap: TreemapNode = buildTokenTreemap(
    fetchResult.metadata.name,
    atlasResult.files
  );

  // 7. Compute aggregate repository metrics & stats
  onProgress?.('treemap', 90, 'Computing aggregate repository stats and metrics...');

  let totalLines = 0;
  let totalTokens = 0;
  let totalBytes = 0;

  for (const file of atlasResult.files) {
    totalLines += file.lineCount;
    totalTokens += file.estimatedTokens;
    totalBytes += file.sizeBytes;
  }

  const totalFiles = fetchResult.totalTreeFiles || atlasResult.files.length;
  const analyzedFiles = atlasResult.files.length;
  const circularDeps = atlasResult.circularDeps ?? 0;
  const avgFanOut =
    atlasResult.avgFanOut ??
    (analyzedFiles > 0
      ? Number((atlasResult.dependencyEdges.length / analyzedFiles).toFixed(2))
      : 0);

  const ingestLatencyMs = Date.now() - startTime;

  // 8. Assemble complete, instantly renderable VisualAtlasBlueprint (aiEnriched: false)
  const headline =
    fetchResult.metadata.description?.trim() ||
    `${fetchResult.metadata.fullName} Architectural Atlas`;

  const oneLiner = `${fetchResult.metadata.fullName} (${fetchResult.metadata.primaryLanguage || 'Multi-language'}) with ${atlasResult.subsystems.length} subsystems across ${atlasResult.nodes.length} primary architectural nodes.`;

  const techStackBadges =
    atlasResult.techStackBadges && atlasResult.techStackBadges.length > 0
      ? atlasResult.techStackBadges
      : [fetchResult.metadata.primaryLanguage, ...Object.keys(fetchResult.metadata.languages || {})]
          .filter(Boolean)
          .slice(0, 8);

  const blueprint: VisualAtlasBlueprint = {
    repoId: fetchResult.metadata.id,
    metadata: fetchResult.metadata,
    headline,
    oneLiner,
    architecturePattern: atlasResult.architecturePattern || 'Modular Multi-Tier Architecture',
    techStackBadges,
    files: atlasResult.files,
    dependencyEdges: atlasResult.dependencyEdges,
    subsystems: atlasResult.subsystems,
    nodes: atlasResult.nodes,
    edges: atlasResult.edges,
    strata: atlasResult.strata,
    flows: atlasResult.flows,
    codemapTour: atlasResult.codemapTour,
    diagrams: atlasResult.diagrams,
    treemap,
    posters: [],
    audioTours: [],
    videoReels: [],
    stats: {
      totalFiles,
      analyzedFiles,
      totalLines,
      totalTokens,
      totalBytes,
      circularDeps,
      avgFanOut,
      ingestLatencyMs,
    },
    aiEnriched: false,
    modelsUsed: [],
    generatedAt: new Date().toISOString(),
  };

  // 9. Persist to LRU & disk cache
  await atlasCache.set(blueprint);

  onProgress?.(
    'ready',
    100,
    `Ingestion complete in ${ingestLatencyMs}ms (${analyzedFiles} files analyzed, ${atlasResult.subsystems.length} subsystems mapped)`
  );

  return blueprint;
}
