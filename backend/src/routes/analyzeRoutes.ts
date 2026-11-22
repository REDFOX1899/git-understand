// =============================================================================
// GitUnderstand (git-understand.com) — Analyze & SSE Real-Time Routes
// Agent 33: Primary repository ingestion, showcase fixtures, and SSE progress stream
// =============================================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import type {
  BackendHealthStatus,
  PipelineProgressEvent,
  VisualAtlasBlueprint,
} from '../../../shared/types.js';

import { ENV, PUBLIC_DOMAIN } from '../config/env.js';
import { getPoolStatus } from '../gemini/clientPool.js';
import {
  atlasCache,
  getShowcaseBlueprint,
  listShowcaseSummaries,
} from '../ingest/index.js';
import { analyzeRepositoryFull } from '../orchestrator/atlasPipeline.js';
import {
  getRecentProgress,
  subscribeProgress,
} from '../orchestrator/eventBus.js';

export const analyzeRoutes = Router();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Resolves a showcase blueprint by raw slug or identifier, seeds atlasCache,
 * and streams the resulting VisualAtlasBlueprint response matching studio/src/lib/api.ts.
 */
async function resolveAndSeedShowcase(slugOrId: string, res: Response): Promise<void> {
  const decoded = decodeURIComponent(slugOrId).trim();
  let blueprint = getShowcaseBlueprint(decoded);

  if (!blueprint) {
    // Attempt lookup with raw slug if decoding did not yield a match
    blueprint = getShowcaseBlueprint(slugOrId.trim());
  }

  if (!blueprint) {
    // Secondary check: examine LRU/disk cache for this slug or repo ID
    const cached = await atlasCache.get(decoded);
    if (cached) {
      res.json(cached);
      return;
    }

    res.status(404).json({
      error: `Showcase repository '${decoded}' not found.`,
      availableShowcases: listShowcaseSummaries().map((s) => s.slug),
    });
    return;
  }

  // Seed atlasCache with the retrieved blueprint
  await atlasCache.set(blueprint);
  res.json(blueprint);
}

/**
 * Retrieves a repository blueprint from cache or offline showcase fixtures.
 */
async function handleGetRepoBlueprint(repoIdParam: string, res: Response): Promise<void> {
  const repoId = decodeURIComponent(repoIdParam).trim();
  if (!repoId) {
    res.status(400).json({ error: 'Missing required repoId parameter.' });
    return;
  }

  // 1. Check LRU / disk cache
  let blueprint = await atlasCache.get(repoId);

  // 2. Fallback to offline showcase fixtures if not yet in cache, and seed cache on hit
  if (!blueprint) {
    blueprint = getShowcaseBlueprint(repoId);
    if (blueprint) {
      await atlasCache.set(blueprint);
    }
  }

  if (!blueprint) {
    res.status(404).json({
      error: `Repository '${repoId}' not found in cache. Analyze it first via POST /api/analyze.`,
    });
    return;
  }

  res.json(blueprint);
}

/**
 * Manages Server-Sent Events (SSE) connection for real-time pipeline progress streaming.
 */
function handleSseConnection(repoIdParam: string, req: Request, res: Response): void {
  const repoId = decodeURIComponent(repoIdParam).trim();
  if (!repoId) {
    res.status(400).json({ error: 'Missing required repoId parameter for SSE stream.' });
    return;
  }

  // Establish SSE stream headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  res.flushHeaders?.();

  // Send initial SSE connection comment
  res.write(`: git-understand sse connected for repoId=${repoId}\n\n`);

  // Replay buffered progress events for fast-refresh or late-joining clients
  const recentEvents = getRecentProgress(repoId);
  for (const ev of recentEvents) {
    const eventName =
      ev.stage === 'ready' ? 'ready' : ev.stage === 'error' ? 'error' : 'progress';
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(ev)}\n\n`);
  }

  // Subscribe to live pipeline events emitted by the orchestrator
  const unsubscribe = subscribeProgress(repoId, (event: PipelineProgressEvent) => {
    const eventName =
      event.stage === 'ready' ? 'ready' : event.stage === 'error' ? 'error' : 'progress';
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  // Heartbeat comment every 15s to keep socket alive through load balancers and proxies
  const heartbeatTimer = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  // Clean teardown upon client disconnection
  req.on('close', () => {
    clearInterval(heartbeatTimer);
    unsubscribe();
  });
}

// =============================================================================
// Route Definitions
// =============================================================================

/**
 * GET /health
 * Reports backend service status, Gemini client pool observability, and cached repository counts.
 */
analyzeRoutes.get('/health', (_req: Request, res: Response) => {
  const poolStatus = getPoolStatus();
  const healthStatus: BackendHealthStatus = {
    ok: true,
    service: 'git-understand-backend',
    version: '3.0.0',
    domain: PUBLIC_DOMAIN,
    gemini: {
      primaryConfigured: poolStatus.primaryConfigured,
      secondaryConfigured: poolStatus.secondaryConfigured,
      totalCalls: poolStatus.totalCalls,
      models: {
        architect: ENV.GEMINI_MODEL_ARCHITECT,
        visual: ENV.GEMINI_MODEL_VISUAL,
        fast: ENV.GEMINI_MODEL_FAST,
        oracle: ENV.GEMINI_MODEL_ORACLE,
        decisions: ENV.GEMINI_MODEL_DECISIONS,
        live: ENV.GEMINI_MODEL_LIVE,
        image: ENV.GEMINI_MODEL_IMAGE,
        tts: ENV.GEMINI_MODEL_TTS,
        video: ENV.GEMINI_MODEL_VIDEO,
        embedding: ENV.GEMINI_MODEL_EMBEDDING,
        transcribe: ENV.GEMINI_MODEL_TRANSCRIBE,
      },
    },
    githubTokenConfigured: Boolean(ENV.GITHUB_TOKEN && ENV.GITHUB_TOKEN.trim().length > 0),
    cachedRepos: atlasCache.size(),
  };

  res.json(healthStatus);
});

/**
 * GET /showcase
 * Lists summaries of pre-cached showcase repositories.
 * Matches studio/src/lib/api.ts fetchShowcaseList() by returning ShowcaseRepoSummary[] directly,
 * with opt-in object wrapping (?wrap=true) if explicitly requested.
 */
analyzeRoutes.get('/showcase', (req: Request, res: Response) => {
  const summaries = listShowcaseSummaries();
  if (req.query.wrap === 'true' || req.query.format === 'object') {
    res.json({ repos: summaries });
    return;
  }
  res.json(summaries);
});

/**
 * GET /showcase/:owner/:repo
 * Unencoded multi-segment showcase route (e.g. /api/showcase/coderamp-labs/gitingest).
 * Seeds atlasCache and returns the full VisualAtlasBlueprint.
 */
analyzeRoutes.get(
  '/showcase/:owner/:repo',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slug = `${req.params.owner}/${req.params.repo}`;
      await resolveAndSeedShowcase(slug, res);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /showcase/:slug
 * Encoded or single-token showcase route (e.g. /api/showcase/coderamp-labs%2Fgitingest or /api/showcase/gitingest).
 * Seeds atlasCache and returns the full VisualAtlasBlueprint.
 */
analyzeRoutes.get(
  '/showcase/:slug',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await resolveAndSeedShowcase(req.params.slug, res);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /analyze
 * Ingests and analyzes a GitHub repository URL or slug end-to-end.
 * Body: { repoUrl: string, forceRefresh?: boolean, skipAi?: boolean, runXRay?: boolean }
 * Accepts BYOK API keys via x-gemini-api-key / x-github-token headers.
 */
analyzeRoutes.post(
  '/analyze',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { repoUrl, forceRefresh, skipAi, runXRay } = req.body || {};

      if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) {
        res.status(400).json({
          error:
            'Missing or invalid "repoUrl" in request body. Provide a GitHub URL or canonical slug (e.g. "owner/repo").',
        });
        return;
      }

      // Resolve BYOK credentials from request headers or body overrides
      const byokApiKey =
        (typeof req.headers['x-gemini-api-key'] === 'string' &&
          req.headers['x-gemini-api-key'].trim()) ||
        (typeof req.body?.geminiApiKey === 'string' && req.body.geminiApiKey.trim()) ||
        undefined;

      const githubToken =
        (typeof req.headers['x-github-token'] === 'string' &&
          req.headers['x-github-token'].trim()) ||
        (typeof req.body?.githubToken === 'string' && req.body.githubToken.trim()) ||
        ENV.GITHUB_TOKEN ||
        undefined;

      const blueprint: VisualAtlasBlueprint = await analyzeRepositoryFull(repoUrl.trim(), {
        githubToken,
        byokApiKey,
        forceRefresh: Boolean(forceRefresh),
        skipAi: Boolean(skipAi),
        runXRay: runXRay !== undefined ? Boolean(runXRay) : true,
      });

      res.json(blueprint);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /repos
 * Lists all cached repositories alongside showcase summaries.
 */
analyzeRoutes.get('/repos', (_req: Request, res: Response) => {
  const cached = atlasCache.listCached();
  const showcase = listShowcaseSummaries();
  res.json({
    total: cached.length,
    repos: cached,
    showcase,
  });
});

/**
 * GET /repos/:repoId
 * Fetches an existing repository's VisualAtlasBlueprint from cache.
 */
analyzeRoutes.get(
  '/repos/:repoId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handleGetRepoBlueprint(req.params.repoId, res);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /repo/:repoId
 * Alias matching studio/src/lib/api.ts fetchRepoBlueprint route structure.
 */
analyzeRoutes.get(
  '/repo/:repoId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handleGetRepoBlueprint(req.params.repoId, res);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /events/:repoId
 * Subscribes to real-time pipeline progress events over Server-Sent Events (SSE).
 */
analyzeRoutes.get('/events/:repoId', (req: Request, res: Response) => {
  handleSseConnection(req.params.repoId, req, res);
});

/**
 * GET /repo/:repoId/events
 * Alias matching studio/src/lib/api.ts subscribeRepoEvents route structure.
 */
analyzeRoutes.get('/repo/:repoId/events', (req: Request, res: Response) => {
  handleSseConnection(req.params.repoId, req, res);
});

/**
 * GET /repos/:repoId/events
 * Plural alias for SSE subscription.
 */
analyzeRoutes.get('/repos/:repoId/events', (req: Request, res: Response) => {
  handleSseConnection(req.params.repoId, req, res);
});

export default analyzeRoutes;
