// =============================================================================
// GitUnderstand (git-understand.com) — Express API Integration Tests
// Agent 88: Production Vitest HTTP Integration Suite for Express 5 Visual Engine
// Validates: GET /api/health, GET /api/showcase, showcase blueprint fetch,
// POST /api/digest, POST /api/xray, and POST /api/circle-explain
// =============================================================================

import http, { type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createApp } from '../backend/src/server.js';
import { ensureRuntimeDirs } from '../backend/src/config/env.js';

import type {
  BackendHealthStatus,
  VisualAtlasBlueprint,
  CircleExplainRequest,
  CircleExplainResponse,
  XRayMatrixReport,
  CompiledDigest,
  MermaidDiagramSpec,
  ExecutionFlow,
  CodemapTourStop,
} from '../shared/types.js';

describe('Express 5 Production API Integration Tests', () => {
  let server: HttpServer;
  let baseUrl: string;

  beforeAll(async () => {
    // Ensure all runtime cache and artifact directories exist
    await ensureRuntimeDirs();

    // Create Express application instance and bind to ephemeral OS port
    const app = createApp();
    server = http.createServer(app);

    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        if (!address || typeof address.port !== 'number') {
          reject(new Error('Failed to obtain ephemeral port from test server'));
          return;
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });

      server.on('error', reject);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // ===========================================================================
  // 1. Health & Status Endpoints
  // ===========================================================================
  describe('GET /api/health', () => {
    it('returns 200 with service metadata, model inventory, and cached count', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const body = (await response.json()) as BackendHealthStatus;
      expect(body.ok).toBe(true);
      expect(body.service).toBe('git-understand-backend');
      expect(body.version).toBe('3.0.0');
      expect(body.domain).toBe('git-understand.com');
      expect(typeof body.cachedRepos).toBe('number');
      expect(body.cachedRepos).toBeGreaterThanOrEqual(0);

      // Gemini Model Registry
      expect(body.gemini).toBeDefined();
      expect(body.gemini.models).toBeDefined();
      expect(body.gemini.models.architect).toBeTruthy();
      expect(body.gemini.models.visual).toBeTruthy();
      expect(body.gemini.models.decisions).toBeTruthy();
      expect(body.gemini.models.live).toBeTruthy();
      expect(typeof body.githubTokenConfigured).toBe('boolean');
    });

    it('returns 200 on root /health container alias', async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.service).toBe('git-understand-backend');
      expect(body.version).toBe('3.0.0');
    });
  });

  // ===========================================================================
  // 2. Showcase Repositories Discovery: GET /api/showcase
  // ===========================================================================
  describe('GET /api/showcase', () => {
    it('returns list of curated visual showcase repositories', async () => {
      const response = await fetch(`${baseUrl}/api/showcase`);
      expect(response.status).toBe(200);

      const list = await response.json();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThanOrEqual(4);

      // Verify GitIngest showcase is present with rich metadata
      const gitingest = list.find((item: { slug: string }) => item.slug === 'coderamp-labs/gitingest');
      expect(gitingest).toBeDefined();
      expect(gitingest.title).toBe('GitIngest');
      expect(gitingest.language).toBe('Python');
      expect(typeof gitingest.stars).toBe('number');
      expect(gitingest.stars).toBeGreaterThan(1000);
      expect(gitingest.nodeCount).toBeGreaterThan(0);
      expect(gitingest.tokenCount).toBeGreaterThan(0);

      // Verify other showcases exist
      const gitdiagram = list.find((item: { slug: string }) => item.slug === 'ahmedkhaleel2004/gitdiagram');
      expect(gitdiagram).toBeDefined();
    });
  });

  // ===========================================================================
  // 3. Showcase Blueprint Fetch: GET /api/showcase/:slug & GET /api/repo/:repoId
  // ===========================================================================
  describe('Showcase Blueprint Fetch', () => {
    it('fetches full VisualAtlasBlueprint by exact slug (GET /api/showcase/:slug)', async () => {
      const slug = encodeURIComponent('coderamp-labs/gitingest');
      const response = await fetch(`${baseUrl}/api/showcase/${slug}`);
      expect(response.status).toBe(200);

      const blueprint = (await response.json()) as VisualAtlasBlueprint;
      expect(blueprint.repoId).toBeTruthy();
      expect(blueprint.metadata).toBeDefined();
      expect(blueprint.metadata.fullName).toBe('coderamp-labs/gitingest');
      expect(blueprint.architecturePattern).toBeTruthy();

      // Nodes, edges, subsystems, strata layers
      expect(Array.isArray(blueprint.nodes)).toBe(true);
      expect(blueprint.nodes.length).toBeGreaterThan(0);
      expect(Array.isArray(blueprint.edges)).toBe(true);
      expect(Array.isArray(blueprint.subsystems)).toBe(true);
      expect(blueprint.subsystems.length).toBeGreaterThan(0);
      expect(Array.isArray(blueprint.strata)).toBe(true);
      expect(blueprint.strata.length).toBeGreaterThan(0);

      // Pre-generated diagrams, tours, treemap
      expect(Array.isArray(blueprint.diagrams)).toBe(true);
      expect(blueprint.diagrams.length).toBeGreaterThan(0);
      expect(blueprint.treemap).toBeDefined();
      expect(blueprint.treemap.tokens).toBeGreaterThan(0);
      expect(blueprint.stats.totalFiles).toBeGreaterThan(0);
    });

    it('fetches full blueprint by short slug or repoId alias', async () => {
      const response = await fetch(`${baseUrl}/api/showcase/gitingest`);
      expect(response.status).toBe(200);

      const blueprint = (await response.json()) as VisualAtlasBlueprint;
      expect(blueprint.metadata.name).toBe('gitingest');
    });

    it('retrieves showcase blueprint via GET /api/repo/:repoId fallback', async () => {
      const response = await fetch(`${baseUrl}/api/repo/gitingest`);
      expect(response.status).toBe(200);

      const blueprint = (await response.json()) as VisualAtlasBlueprint;
      expect(blueprint.metadata.fullName).toBe('coderamp-labs/gitingest');
    });

    it('returns 404 for non-existent showcase slug', async () => {
      const response = await fetch(`${baseUrl}/api/showcase/non-existent-slug-xyz`);
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toContain('not found');
    });

    it('returns 404 for non-existent repository in GET /api/repo/:repoId', async () => {
      const response = await fetch(`${baseUrl}/api/repo/unknown-repo-id-404`);
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toContain('not found');
    });
  });

  // ===========================================================================
  // 4. Digest Compilation: POST /api/digest & POST /api/digest/compile
  // ===========================================================================
  describe('POST /api/digest & POST /api/digest/compile', () => {
    it('compiles token-budgeted digest with options via POST /api/digest', async () => {
      const response = await fetch(`${baseUrl}/api/digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoId: 'gitingest',
          options: {
            maxTotalTokens: 50_000,
            includeTests: false,
            includeDocs: true,
          },
        }),
      });

      expect(response.status).toBe(200);
      const digest = (await response.json()) as CompiledDigest;

      expect(digest.repoSlug).toBeTruthy();
      expect(digest.summaryHeader).toBeTruthy();
      expect(digest.treeText).toBeTruthy();
      expect(digest.digestText).toBeTruthy();
      expect(digest.includedFiles).toBeGreaterThan(0);
      expect(digest.totalTokens).toBeGreaterThan(0);
      expect(digest.totalTokens).toBeLessThanOrEqual(60_000);
      expect(typeof digest.budgetUtilization).toBe('number');
    });

    it('compiles digest via POST /api/digest/compile endpoint', async () => {
      const response = await fetch(`${baseUrl}/api/digest/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoId: 'coderamp-labs/gitingest',
          options: {
            maxTotalTokens: 100_000,
          },
        }),
      });

      expect(response.status).toBe(200);
      const digest = (await response.json()) as CompiledDigest;
      expect(digest.includedFiles).toBeGreaterThan(0);
      expect(digest.digestText).toContain('Repository:');
    });

    it('smart-filters digest based on natural language prompt (POST /api/digest/smart-filter)', async () => {
      const response = await fetch(`${baseUrl}/api/digest/smart-filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoId: 'gitingest',
          prompt: 'Focus exclusively on the core parser and AST extraction engine without tests',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.options).toBeDefined();
      expect(body.digest).toBeDefined();
      expect(body.digest.includedFiles).toBeGreaterThan(0);
      expect(body.digest.digestText).toBeTruthy();
    });

    it('returns 400 when missing repoId in POST /api/digest', async () => {
      const response = await fetch(`${baseUrl}/api/digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Missing required field: repoId');
    });

    it('returns 404 when repoId cannot be found in POST /api/digest', async () => {
      const response = await fetch(`${baseUrl}/api/digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: 'invalid-nonexistent-repo-9999' }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain('Repository not found');
    });
  });

  // ===========================================================================
  // 5. Decision-1 X-Ray Health Audit: POST /api/xray
  // ===========================================================================
  describe('POST /api/xray', () => {
    it('executes codebase X-Ray matrix audit across 9 architectural pillars', async () => {
      const response = await fetch(`${baseUrl}/api/xray`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoId: 'gitingest',
          maxModules: 4,
        }),
      });

      expect(response.status).toBe(200);
      const xray = (await response.json()) as XRayMatrixReport;

      // X-Ray Report Validation
      expect(xray).toBeDefined();
      expect(typeof xray.overallScore).toBe('number');
      expect(xray.overallScore).toBeGreaterThanOrEqual(0);
      expect(xray.overallScore).toBeLessThanOrEqual(100);

      // Model and compute routing
      expect(xray.model).toBeTruthy();
      expect(xray.recommendedModelTier).toBeTruthy();

      // Pillar Averages (9 canonical pillars)
      expect(xray.pillarAverages).toBeDefined();
      expect(typeof xray.pillarAverages.modularity).toBe('number');
      expect(typeof xray.pillarAverages.security).toBe('number');
      expect(typeof xray.pillarAverages.resilience).toBe('number');
      expect(typeof xray.pillarAverages.testability).toBe('number');
      expect(typeof xray.pillarAverages.api_clarity).toBe('number');
      expect(typeof xray.pillarAverages.concurrency).toBe('number');
      expect(typeof xray.pillarAverages.scalability).toBe('number');
      expect(typeof xray.pillarAverages.hygiene).toBe('number');
      expect(typeof xray.pillarAverages.onboarding).toBe('number');

      // Audited Modules
      expect(Array.isArray(xray.modules)).toBe(true);
      expect(xray.modules.length).toBeGreaterThan(0);
      const firstModule = xray.modules[0];
      expect(firstModule.nodeId).toBeTruthy();
      expect(firstModule.label).toBeTruthy();
      expect(typeof firstModule.overallHealth).toBe('number');
      expect(firstModule.cells).toBeDefined();
    });

    it('returns 400 when missing repoId in POST /api/xray', async () => {
      const response = await fetch(`${baseUrl}/api/xray`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Missing required field: repoId');
    });

    it('returns 404 when repoId cannot be found in POST /api/xray', async () => {
      const response = await fetch(`${baseUrl}/api/xray`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: 'unknown-repo-for-xray' }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain('Repository not found');
    });
  });

  // ===========================================================================
  // 6. Circle-to-Explain Multimodal Reasoning: POST /api/circle-explain
  // ===========================================================================
  describe('POST /api/circle-explain', () => {
    it('generates structured architectural explanation for lasso selection', async () => {
      const payload: CircleExplainRequest = {
        repoId: 'gitingest',
        selectedNodeIds: ['gitingest_entry', 'fastapi_routes'],
        question: 'How does the entrypoint route traffic to the AST parsing subsystems?',
        strokeBounds: { x: 120, y: 80, width: 400, height: 260 },
      };

      const response = await fetch(`${baseUrl}/api/circle-explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(200);
      const explanation = (await response.json()) as CircleExplainResponse;

      expect(explanation.headline).toBeTruthy();
      expect(explanation.visualSummary).toBeTruthy();
      expect(explanation.dataFlowNarrative).toBeTruthy();
      expect(Array.isArray(explanation.keyContracts)).toBe(true);
      expect(explanation.keyContracts.length).toBeGreaterThan(0);
      expect(Array.isArray(explanation.potentialRisks)).toBe(true);
      expect(Array.isArray(explanation.referencedFiles)).toBe(true);
      expect(typeof explanation.latencyMs).toBe('number');
      expect(explanation.latencyMs).toBeGreaterThanOrEqual(0);
      expect(explanation.model).toBeTruthy();
    });

    it('handles circle-explain with empty node selection gracefully', async () => {
      const payload: CircleExplainRequest = {
        repoId: 'gitingest',
        selectedNodeIds: [],
        question: 'Explain the general architectural design of this repository.',
      };

      const response = await fetch(`${baseUrl}/api/circle-explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(200);
      const explanation = (await response.json()) as CircleExplainResponse;
      expect(explanation.headline).toBeTruthy();
      expect(explanation.visualSummary).toBeTruthy();
    });

    it('returns 400 when missing repoId in POST /api/circle-explain', async () => {
      const response = await fetch(`${baseUrl}/api/circle-explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Missing required field: repoId');
    });

    it('returns 404 when repoId cannot be found in POST /api/circle-explain', async () => {
      const response = await fetch(`${baseUrl}/api/circle-explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: 'unknown-repo-lasso-404' }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain('Repository not found');
    });
  });

  // ===========================================================================
  // 7. Additional Visual Engine Endpoints & Error Guards
  // ===========================================================================
  describe('Visual Engine Auxiliary Endpoints', () => {
    it('POST /api/diagrams/generate returns Mermaid diagram specifications', async () => {
      const response = await fetch(`${baseUrl}/api/diagrams/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoId: 'gitingest',
          kind: 'architecture',
        }),
      });

      expect(response.status).toBe(200);
      const diagrams = (await response.json()) as MermaidDiagramSpec[];
      expect(Array.isArray(diagrams)).toBe(true);
      expect(diagrams.length).toBeGreaterThan(0);
      expect(diagrams[0].code).toContain('flowchart');
    });

    it('POST /api/flows/regenerate returns execution flows and tour stops', async () => {
      const response = await fetch(`${baseUrl}/api/flows/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: 'gitingest' }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        flows: ExecutionFlow[];
        codemapTour: CodemapTourStop[];
      };
      expect(Array.isArray(body.flows)).toBe(true);
      expect(Array.isArray(body.codemapTour)).toBe(true);
      expect(body.flows.length).toBeGreaterThan(0);
    });

    it('GET / returns root engine discovery with endpoint catalog', async () => {
      const response = await fetch(`${baseUrl}/`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.name).toBe('git-understand-engine');
      expect(body.status).toBe('online');
      expect(body.endpoints).toBeDefined();
      expect(body.endpoints.health).toBe('/api/health');
      expect(body.endpoints.apiShowcase).toBe('/api/showcase');
      expect(body.endpoints.apiDigestCompile).toBe('/api/digest/compile');
    });

    it('returns 404 for unmapped endpoints', async () => {
      const response = await fetch(`${baseUrl}/api/unmapped-endpoint-random-xyz`);
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.status).toBe(404);
      expect(body.error).toContain('Endpoint not found');
    });

    it('enforces strict security headers across responses', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(response.headers.get('x-xss-protection')).toBe('1; mode=block');
    });
  });
});
