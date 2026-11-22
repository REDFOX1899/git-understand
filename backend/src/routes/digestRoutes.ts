// =============================================================================
// GitUnderstand (git-understand.com) — Gitingest Digest & Raw Markdown Routes
// Agent 35: Surgical context digest compilation, smart-filtering & agent briefs
// =============================================================================

import { Router, type Request, type Response } from 'express';
import { extractInteractionText, extractJsonObject } from '../gemini/mediaUtils.js';
import { hasGeminiCredentials, withV1Client } from '../gemini/clientPool.js';
import { getShowcaseBlueprint } from '../ingest/showcaseFixtures.js';

// Canonical Ingest & Digest Compilers
import {
  compileDigest,
  compileAgentMarkdownBrief,
  DEFAULT_DIGEST_OPTIONS,
} from '../ingest/digestCompiler.js';

// LRU & Disk Blueprint Cache Store
import { atlasCache } from '../ingest/cacheStore.js';

// Unified Ingest Pipeline & Repository Fetcher
import { ingestRepository } from '../ingest/index.js';

// GitHub URL Parsing & Slug Normalization
import { buildRepoId, parseGitHubInput } from '../utils/urlParser.js';

// Backend Environment Configuration
import { ENV } from '../config/env.js';

// Gemini Dual-Pool Client imported above

// Canonical Shared Contracts
import type {
  VisualAtlasBlueprint,
  DigestFilterOptions,
  CompiledDigest,
} from '../../../shared/types.js';

const router = Router();

// =============================================================================
// Helper: Resolve Blueprint from Cache or Live Ingestion
// =============================================================================

async function resolveBlueprint(
  rawTarget: string,
  githubToken?: string
): Promise<VisualAtlasBlueprint | null> {
  const cleanTarget = rawTarget.trim();
  if (!cleanTarget) return null;

  // 1. Direct lookup by exact repoId in cache or showcase fixtures
  const cached = await atlasCache.get(cleanTarget);
  if (cached) return cached;

  const showcaseDirect = getShowcaseBlueprint(cleanTarget);
  if (showcaseDirect) {
    await atlasCache.set(showcaseDirect);
    return showcaseDirect;
  }

  // 2. Normalize via URL parser
  try {
    const parsed = parseGitHubInput(cleanTarget);
    const normalizedId = buildRepoId(parsed.owner, parsed.repo, parsed.branch);
    const cachedByNormalized = await atlasCache.get(normalizedId);
    if (cachedByNormalized) return cachedByNormalized;

    // Also check without branch if branch was default
    const cachedByBase = await atlasCache.get(buildRepoId(parsed.owner, parsed.repo));
    if (cachedByBase) return cachedByBase;

    // 3. Ingest on-demand if not yet cached
    const token = githubToken || ENV.GITHUB_TOKEN;
    return await ingestRepository(cleanTarget, { githubToken: token });
  } catch (err) {
    console.warn(`[DigestRoutes] Failed to resolve blueprint for "${cleanTarget}":`, err);
    return null;
  }
}

// =============================================================================
// Helper: Keyword-based Filter Heuristics Fallback
// =============================================================================

export function smartFilterWithKeywordFallback(
  prompt: string,
  blueprint: VisualAtlasBlueprint
): Partial<DigestFilterOptions> {
  const lower = prompt.toLowerCase();
  const options: Partial<DigestFilterOptions> = {
    includePatterns: [],
    excludePatterns: [...DEFAULT_DIGEST_OPTIONS.excludePatterns],
    includeTests: false,
    includeDocs: true,
    includeTreeHeader: true,
    maxTotalTokens: DEFAULT_DIGEST_OPTIONS.maxTotalTokens,
    maxFileSizeBytes: DEFAULT_DIGEST_OPTIONS.maxFileSizeBytes,
  };

  // 1. Token budget extraction (e.g. "50k", "100k", "300k", "25000 tokens")
  const tokenMatch = lower.match(/(\d+)\s*k(?:ib|b|[\s\w]*)?/);
  if (tokenMatch && tokenMatch[1]) {
    const parsedK = parseInt(tokenMatch[1], 10);
    if (parsedK > 0 && parsedK <= 2000) {
      options.maxTotalTokens = parsedK * 1000;
    }
  } else {
    const exactTokens = lower.match(/(\d{4,7})\s*tokens?/);
    if (exactTokens && exactTokens[1]) {
      options.maxTotalTokens = parseInt(exactTokens[1], 10);
    }
  }

  // 2. Test inclusion heuristic
  if (
    lower.includes('test') ||
    lower.includes('spec') ||
    lower.includes('jest') ||
    lower.includes('vitest') ||
    lower.includes('coverage')
  ) {
    options.includeTests = true;
  }

  // 3. Documentation heuristic
  if (
    lower.includes('no docs') ||
    lower.includes('skip docs') ||
    lower.includes('exclude docs') ||
    lower.includes('without docs')
  ) {
    options.includeDocs = false;
  }

  // 4. Subsystem matching based on prompt terms
  const matchedSubsystems = new Set<string>();
  const allSubsystems = blueprint.subsystems || [];

  for (const sub of allSubsystems) {
    const subName = sub.name.toLowerCase();
    const subId = sub.id.toLowerCase();
    const subTag = sub.tagline.toLowerCase();

    if (
      lower.includes(subName) ||
      lower.includes(subId) ||
      subName.split(/\s+/).some((word) => word.length > 3 && lower.includes(word)) ||
      subTag.split(/\s+/).some((word) => word.length > 4 && lower.includes(word))
    ) {
      matchedSubsystems.add(sub.id);
    }
  }

  // 5. Layer-specific matching
  const layerKeywords: Record<string, string[]> = {
    client: ['ui', 'frontend', 'client', 'component', 'components', 'view', 'react', 'next', 'tailwind', 'css', 'style', 'canvas'],
    edge: ['edge', 'middleware', 'gateway', 'proxy', 'cdn', 'routing'],
    orchestration: ['orchestration', 'pipeline', 'workflow', 'controller', 'service', 'agent', 'lifecycle'],
    domain: ['domain', 'business', 'logic', 'core', 'model', 'entities', 'rules'],
    infrastructure: ['infra', 'infrastructure', 'server', 'docker', 'k8s', 'deploy', 'cloud', 'aws', 'gcp'],
    data: ['data', 'database', 'db', 'storage', 'sql', 'prisma', 'orm', 'store', 'postgres', 'mongo', 'redis', 'cache'],
    tooling: ['tooling', 'script', 'build', 'ci', 'cd', 'lint', 'cli'],
  };

  for (const [layer, keywords] of Object.entries(layerKeywords)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      for (const sub of allSubsystems) {
        if (sub.layer === layer) {
          matchedSubsystems.add(sub.id);
        }
      }
    }
  }

  // 6. Common topic pattern matching
  if (lower.includes('auth') || lower.includes('login') || lower.includes('session') || lower.includes('jwt')) {
    options.includePatterns!.push('*auth*/**', '*login*/**', '*session*/**');
  }
  if (lower.includes('api') || lower.includes('endpoint') || lower.includes('route')) {
    options.includePatterns!.push('**/routes/**', '**/api/**', '**/controllers/**');
  }
  if (lower.includes('config') || lower.includes('env') || lower.includes('setting')) {
    options.includePatterns!.push('**/*config*', '**/*.env*', '**/settings*');
  }

  if (matchedSubsystems.size > 0) {
    options.selectedSubsystems = Array.from(matchedSubsystems);
  }

  return options;
}

// =============================================================================
// Helper: Gemini 4 Argon Smart Filter Inference
// =============================================================================

function buildSmartFilterPrompt(prompt: string, blueprint: VisualAtlasBlueprint): string {
  const subSummary = (blueprint.subsystems || [])
    .map(
      (s) =>
        `- ID: "${s.id}" | Name: "${s.name}" | Layer: "${s.layer}" | Files: ${s.filePaths?.length || 0} | Tagline: "${s.tagline}"`
    )
    .join('\n');

  return `You are an expert codebase intelligence architect and token budget strategist.
Analyze the user's focus prompt and select the surgical filter options for compiling an LLM context digest.

Repository: ${blueprint.metadata?.fullName || blueprint.repoId}
Primary Architecture: ${blueprint.architecturePattern}
Total Files: ${blueprint.files?.length || 0}
Total Subsystems: ${blueprint.subsystems?.length || 0}

Available Subsystems:
${subSummary || '(No subsystems parsed)'}

User Request:
"${prompt}"

Instructions:
1. Select relevant 'selectedSubsystems' (array of exact IDs from above) if the user focuses on specific areas (e.g. backend, auth, ui).
2. Set 'includePatterns' if specific directories or file globs are requested.
3. Configure 'includeTests' (true only if user specifically mentions tests/specs).
4. Configure 'includeDocs' (true unless user requests code-only or no documentation).
5. Set 'maxTotalTokens' based on any user budget constraints (default: 200000).

Return ONLY valid JSON matching this schema:
{
  "selectedSubsystems": string[],
  "includePatterns": string[],
  "excludePatterns": string[],
  "includeTests": boolean,
  "includeDocs": boolean,
  "maxTotalTokens": number,
  "maxFileSizeBytes": number
}`;
}

async function executeSmartFilterWithGemini(
  prompt: string,
  blueprint: VisualAtlasBlueprint,
  customApiKey?: string
): Promise<Partial<DigestFilterOptions> | null> {
  if (!hasGeminiCredentials(customApiKey)) {
    return null;
  }

  const smartPrompt = buildSmartFilterPrompt(prompt, blueprint);

  try {
    const rawJson = await withV1Client(async (client) => {
      const interaction = await client.interactions.create({
        model: ENV.GEMINI_MODEL_FAST,
        input: smartPrompt,
        generation_config: {
          thinking_level: 'low',
        },
        store: false,
      } as unknown as Parameters<typeof client.interactions.create>[0]);
      return extractInteractionText(interaction);
    }, customApiKey);

    if (!rawJson.trim()) return null;

    const parsed = extractJsonObject<Record<string, unknown>>(rawJson);
    if (!parsed) return null;

    const options: Partial<DigestFilterOptions> = {};

    if (Array.isArray(parsed.selectedSubsystems) && parsed.selectedSubsystems.length > 0) {
      const validIds = new Set((blueprint.subsystems || []).map((s) => s.id.toLowerCase()));
      options.selectedSubsystems = parsed.selectedSubsystems
        .map((id) => String(id))
        .filter((id) => validIds.has(id.toLowerCase()));
    }

    if (Array.isArray(parsed.includePatterns)) {
      options.includePatterns = parsed.includePatterns.map(String).filter(Boolean);
    }

    if (Array.isArray(parsed.excludePatterns)) {
      options.excludePatterns = parsed.excludePatterns.map(String).filter(Boolean);
    }

    if (typeof parsed.includeTests === 'boolean') {
      options.includeTests = parsed.includeTests;
    }

    if (typeof parsed.includeDocs === 'boolean') {
      options.includeDocs = parsed.includeDocs;
    }

    if (typeof parsed.maxTotalTokens === 'number' && parsed.maxTotalTokens > 1000) {
      options.maxTotalTokens = parsed.maxTotalTokens;
    }

    if (typeof parsed.maxFileSizeBytes === 'number' && parsed.maxFileSizeBytes > 1024) {
      options.maxFileSizeBytes = parsed.maxFileSizeBytes;
    }

    return options;
  } catch (err) {
    console.warn('[DigestRoutes] Gemini smart-filter inference failed:', err);
    return null;
  }
}

// =============================================================================
// Route 1: POST /digest & POST /digest/compile
// Compiles surgical token-budgeted Gitingest-compatible digest
// =============================================================================

router.post(['/', '/digest', '/compile', '/digest/compile'], async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const targetRef = body.repoId || body.url || body.repo || body.rawInput;

    if (!targetRef || typeof targetRef !== 'string' || !targetRef.trim()) {
      res.status(400).json({
        error: 'Missing required field: repoId, url, or repo',
      });
      return;
    }

    const githubToken = (req.headers['x-github-token'] as string) || ENV.GITHUB_TOKEN;
    const blueprint = await resolveBlueprint(targetRef, githubToken);

    if (!blueprint) {
      res.status(404).json({
        error: `Repository not found for "${targetRef}". Please ingest repository first.`,
      });
      return;
    }

    const filterOptions: Partial<DigestFilterOptions> = body.options || {};
    const digest: CompiledDigest = compileDigest(blueprint, filterOptions);

    res.status(200).json(digest);
  } catch (err) {
    console.error('[DigestRoutes] Error compiling digest:', err);
    res.status(500).json({
      error: 'Internal error compiling context digest',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Route 2: POST /digest/smart-filter
// Natural-language prompt to optimal digest options via gemini-4-argon with keyword fallback
// =============================================================================

router.post(['/smart-filter', '/digest/smart-filter'], async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const targetRef = body.repoId || body.url || body.repo;
    const prompt = body.prompt;

    if (!targetRef || typeof targetRef !== 'string' || !targetRef.trim()) {
      res.status(400).json({
        error: 'Missing required field: repoId',
      });
      return;
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({
        error: 'Missing required field: prompt',
      });
      return;
    }

    const githubToken = (req.headers['x-github-token'] as string) || ENV.GITHUB_TOKEN;
    const blueprint = await resolveBlueprint(targetRef, githubToken);

    if (!blueprint) {
      res.status(404).json({
        error: `Repository not found for "${targetRef}". Please ingest repository first.`,
      });
      return;
    }

    const customApiKey = req.headers['x-gemini-api-key'] as string | undefined;

    // 1. Attempt Gemini 4 Argon smart inference
    let filterOptions = await executeSmartFilterWithGemini(prompt, blueprint, customApiKey);

    // 2. Deterministic keyword fallback if Gemini fails or is unavailable
    if (!filterOptions) {
      filterOptions = smartFilterWithKeywordFallback(prompt, blueprint);
    }

    // 3. Compile digest with selected options
    const digest: CompiledDigest = compileDigest(blueprint, filterOptions);

    res.status(200).json({
      options: filterOptions,
      digest,
    });
  } catch (err) {
    console.error('[DigestRoutes] Error in smart-filter digest:', err);
    res.status(500).json({
      error: 'Internal error processing smart-filter digest',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Route 3: GET /raw/:owner/:repo
// Returns text/markdown; charset=utf-8 via compileAgentMarkdownBrief
// =============================================================================

router.get(['/raw/:owner/:repo', '/digest/raw/:owner/:repo'], async (req: Request, res: Response) => {
  try {
    const owner = Array.isArray(req.params.owner) ? req.params.owner[0] : req.params.owner;
    const repo = Array.isArray(req.params.repo) ? req.params.repo[0] : req.params.repo;

    if (!owner || !repo) {
      res.status(400).setHeader('Content-Type', 'text/markdown; charset=utf-8').send(
        '# GitUnderstand Error: Invalid Repository Reference\n\nBoth owner and repo parameters are required.'
      );
      return;
    }

    // Strip optional .md suffix if present (e.g. /raw/facebook/react.md -> react)
    const cleanRepo = repo.replace(/\.md$/i, '');
    const branch = (req.query.branch || req.query.ref) as string | undefined;

    const rawRef = branch ? `${owner}/${cleanRepo}@${branch}` : `${owner}/${cleanRepo}`;
    const githubToken = (req.headers['x-github-token'] as string) || ENV.GITHUB_TOKEN;

    const blueprint = await resolveBlueprint(rawRef, githubToken);

    if (!blueprint) {
      res.status(404).setHeader('Content-Type', 'text/markdown; charset=utf-8').send(
        `# GitUnderstand Error: Repository Not Found\n\nCould not resolve or ingest \`${owner}/${cleanRepo}\`.\nPlease ingest this repository at [https://git-understand.com](https://git-understand.com) first.`
      );
      return;
    }

    const markdownBrief = compileAgentMarkdownBrief(blueprint);

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    res.status(200).send(markdownBrief);
  } catch (err) {
    console.error('[DigestRoutes] Error rendering raw agent markdown brief:', err);
    res.status(500).setHeader('Content-Type', 'text/markdown; charset=utf-8').send(
      `# GitUnderstand Error: Failed to Generate Markdown Brief\n\n${err instanceof Error ? err.message : String(err)}`
    );
  }
});

// =============================================================================
// Exports
// =============================================================================

export const digestRoutes = router;
export default router;
