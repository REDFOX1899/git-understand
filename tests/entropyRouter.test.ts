// =============================================================================
// GitUnderstand — Tests: Entropy Router & Decision-1 X-Ray Engine
// Verifies Shannon entropy bounds, adaptive Gemini 4 compute routing tiers,
// 9-pillar architectural coverage, and deterministic AST fallbacks.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeShannonEntropy,
  routeRepoAnalysisModel,
  routeFromXRayProbs,
  type RepoComputeRoute,
} from '../backend/src/gemini/entropyRouter.js';
import {
  XRAY_PILLARS,
  runCodebaseXRay,
  type RunCodebaseXRayOptions,
} from '../backend/src/gemini/xrayDecisions.js';
import * as clientPool from '../backend/src/gemini/clientPool.js';
import type {
  VisualAtlasBlueprint,
  AtlasNode,
  RepoFileRecord,
  DependencyEdge,
  XRayPillarId,
  AdaptiveModelTier,
} from '../shared/types.js';

// =============================================================================
// Blueprint Test Fixture Factory
// =============================================================================

function createMockBlueprint(overrides?: Partial<VisualAtlasBlueprint>): VisualAtlasBlueprint {
  const defaultFile: RepoFileRecord = {
    path: 'src/core/orchestrator.ts',
    name: 'orchestrator.ts',
    directory: 'src/core',
    extension: '.ts',
    language: 'typescript',
    sizeBytes: 4200,
    lineCount: 120,
    estimatedTokens: 980,
    imports: ['./storage.js', './types.js'],
    resolvedImports: ['src/core/storage.ts', 'src/core/types.ts'],
    exports: ['Orchestrator', 'runOrchestration'],
    symbols: [
      { name: 'Orchestrator', kind: 'class', line: 15, exported: true },
      { name: 'runOrchestration', kind: 'function', line: 65, exported: true },
    ],
    layer: 'domain',
    centrality: 0.72,
    fanIn: 4,
    fanOut: 5,
    isEntrypoint: true,
    isTest: false,
    isConfig: false,
    content: [
      'export class Orchestrator {',
      '  async execute() { return true; }',
      '}',
      'export function runOrchestration() {',
      '  return new Orchestrator().execute();',
      '}',
    ].join('\n'),
  };

  const defaultNode: AtlasNode = {
    id: 'node-orchestrator',
    label: 'Orchestrator Core',
    subtitle: 'src/core/orchestrator.ts',
    subsystemId: 'subsystem-core',
    layer: 'domain',
    kind: 'module',
    filePaths: ['src/core/orchestrator.ts'],
    primaryFile: 'src/core/orchestrator.ts',
    estimatedTokens: 980,
    centrality: 0.72,
    fanIn: 4,
    fanOut: 5,
    keySymbols: ['Orchestrator', 'runOrchestration'],
    visualBrief: 'Central domain coordinator dispatching pipeline stages and managing session lifecycle.',
    inputs: ['src/api/router.ts', 'src/cli/index.ts'],
    outputs: ['src/core/storage.ts', 'src/core/types.ts'],
  };

  return {
    repoId: 'test-org__git-understand-engine',
    metadata: {
      id: 'test-org__git-understand-engine',
      owner: 'test-org',
      name: 'git-understand-engine',
      fullName: 'test-org/git-understand-engine',
      description: 'Test repository blueprint for entropy routing and X-Ray unit tests',
      defaultBranch: 'main',
      branch: 'main',
      stars: 128,
      forks: 14,
      openIssues: 2,
      primaryLanguage: 'TypeScript',
      languages: { TypeScript: 92, Python: 8 },
      topics: ['ast', 'visualization', 'entropy'],
      htmlUrl: 'https://github.com/test-org/git-understand-engine',
      updatedAt: '2026-11-22T00:00:00Z',
      isPrivate: false,
    },
    headline: 'Autonomous Codebase Visual Engine',
    oneLiner: 'Comprehensive architecture mapping and Decision-1 health diagnosis',
    architecturePattern: 'Layered Hexagonal Core + Dual-Key Pipeline',
    techStackBadges: ['TypeScript', 'Gemini 4', 'Next.js 15'],
    files: [defaultFile],
    dependencyEdges: [],
    subsystems: [
      {
        id: 'subsystem-core',
        name: 'Core Pipeline',
        tagline: 'Orchestration and analysis engine',
        layer: 'domain',
        color: '#2563eb',
        nodeIds: ['node-orchestrator'],
        filePaths: ['src/core/orchestrator.ts'],
        entrypointPaths: ['src/core/orchestrator.ts'],
        totalTokens: 980,
        summaryBullets: ['Directs execution flows', 'Aggregates multi-tier reports'],
        invariants: ['Thread-safe coordinator', 'Immutable state transitions'],
      },
    ],
    nodes: [defaultNode],
    edges: [],
    strata: [],
    flows: [],
    codemapTour: [],
    diagrams: [],
    treemap: {
      id: 'root',
      name: 'root',
      path: '',
      kind: 'dir',
      tokens: 980,
      bytes: 4200,
      fileCount: 1,
    },
    posters: [],
    audioTours: [],
    videoReels: [],
    stats: {
      totalFiles: 1,
      analyzedFiles: 1,
      totalLines: 120,
      totalTokens: 980,
      totalBytes: 4200,
      circularDeps: 0,
      avgFanOut: 5,
      ingestLatencyMs: 18,
    },
    aiEnriched: false,
    modelsUsed: [],
    ...overrides,
  };
}

// =============================================================================
// Test Suites
// =============================================================================

describe('Entropy Router & Decision-1 X-Ray Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. Shannon Entropy Bounds & Mathematical Properties
  // ===========================================================================
  describe('Shannon Entropy Formula (computeShannonEntropy)', () => {
    it('returns exactly 0 at deterministic edges (p = 0 and p = 1)', () => {
      expect(computeShannonEntropy(0)).toBe(0);
      expect(computeShannonEntropy(1)).toBe(0);
    });

    it('returns maximal uncertainty 1.0 at p = 0.5', () => {
      const h = computeShannonEntropy(0.5);
      expect(h).toBe(1);
    });

    it('clamps negative values and values >= 1 to 0', () => {
      expect(computeShannonEntropy(-0.01)).toBe(0);
      expect(computeShannonEntropy(-10)).toBe(0);
      expect(computeShannonEntropy(1.0001)).toBe(0);
      expect(computeShannonEntropy(2.5)).toBe(0);
      expect(computeShannonEntropy(100)).toBe(0);
    });

    it('handles non-finite and NaN inputs gracefully without throwing', () => {
      expect(computeShannonEntropy(Number.NaN)).toBe(0);
      expect(computeShannonEntropy(Number.POSITIVE_INFINITY)).toBe(0);
      expect(computeShannonEntropy(Number.NEGATIVE_INFINITY)).toBe(0);
    });

    it('demonstrates exact mathematical symmetry H(p) == H(1 - p)', () => {
      const testPoints = [0.05, 0.1, 0.2, 0.35, 0.42, 0.49];
      for (const p of testPoints) {
        const h1 = computeShannonEntropy(p);
        const h2 = computeShannonEntropy(1 - p);
        expect(Math.abs(h1 - h2)).toBeLessThan(1e-12);
      }
    });

    it('remains strictly clamped within [0, 1] across continuous spectrum', () => {
      for (let i = 0; i <= 100; i++) {
        const p = i / 100;
        const h = computeShannonEntropy(p);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(1);
      }
    });

    it('is strictly monotonic increasing on (0, 0.5] and decreasing on [0.5, 1)', () => {
      const pAscending = [0.05, 0.15, 0.25, 0.35, 0.45, 0.5];
      for (let i = 0; i < pAscending.length - 1; i++) {
        expect(computeShannonEntropy(pAscending[i])).toBeLessThan(
          computeShannonEntropy(pAscending[i + 1]),
        );
      }

      const pDescending = [0.5, 0.55, 0.65, 0.75, 0.85, 0.95];
      for (let i = 0; i < pDescending.length - 1; i++) {
        expect(computeShannonEntropy(pDescending[i])).toBeGreaterThan(
          computeShannonEntropy(pDescending[i + 1]),
        );
      }
    });

    it('computes accurate values matching known binary entropy thresholds', () => {
      // H(0.85) ≈ -0.85 * log2(0.85) - 0.15 * log2(0.15) ≈ 0.6098
      const h85 = computeShannonEntropy(0.85);
      expect(h85).toBeCloseTo(0.6098, 3);

      // H(0.95) ≈ -0.95 * log2(0.95) - 0.05 * log2(0.05) ≈ 0.2864
      const h95 = computeShannonEntropy(0.95);
      expect(h95).toBeCloseTo(0.2864, 3);
    });
  });

  // ===========================================================================
  // 2. Adaptive Model Tier Routing (routeRepoAnalysisModel)
  // ===========================================================================
  describe('Adaptive Model Tier Routing (routeRepoAnalysisModel)', () => {
    describe('Tier: gemini-4-carbon (Deep Diagnostic Reasoning)', () => {
      it('routes to carbon when circular dependencies >= 2', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 15,
          totalTokens: 20_000,
          circularDeps: 2,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-carbon');
        expect(route.rationale).toContain('gemini-4-carbon');
        expect(route.rationale).toContain('2 circular dependencies');
      });

      it('routes to carbon when total tokens >= 150,000', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 40,
          totalTokens: 160_000,
          circularDeps: 0,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-carbon');
        expect(route.rationale).toContain('gemini-4-carbon');
        expect(route.rationale).toContain('160k tokens');
      });

      it('routes to carbon when file count >= 100', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 105,
          totalTokens: 40_000,
          circularDeps: 0,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-carbon');
        expect(route.rationale).toContain('gemini-4-carbon');
      });

      it('routes to carbon with single circular dependency and >= 80,000 tokens', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 35,
          totalTokens: 85_000,
          circularDeps: 1,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-carbon');
        expect(route.rationale).toContain('1 circular dependency');
        expect(route.rationale).toContain('85k tokens');
      });

      it('routes to carbon when mean X-Ray entropy >= 0.65 with large token scale', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 30,
          totalTokens: 55_000,
          circularDeps: 0,
          meanXRayEntropy: 0.72,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-carbon');
        expect(route.entropy).toBe(0.72);
        expect(route.rationale).toContain('high cross-module entropy (0.72)');
      });
    });

    describe('Tier: gemini-4-neon (Balanced Visual Synthesis)', () => {
      it('routes to neon for moderate file scale (>= 25 files)', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 28,
          totalTokens: 25_000,
          circularDeps: 0,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-neon');
        expect(route.rationale).toContain('gemini-4-neon');
        expect(route.rationale).toContain('28 files');
      });

      it('routes to neon for moderate token volume (>= 35,000 tokens)', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 18,
          totalTokens: 38_000,
          circularDeps: 0,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-neon');
        expect(route.rationale).toContain('gemini-4-neon');
      });

      it('routes to neon when single circular dependency is present with low tokens', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 10,
          totalTokens: 12_000,
          circularDeps: 1,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-neon');
      });

      it('routes to neon when measured X-Ray entropy >= 0.40', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 12,
          totalTokens: 14_000,
          circularDeps: 0,
          meanXRayEntropy: 0.48,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-neon');
        expect(route.entropy).toBe(0.48);
      });
    });

    describe('Tier: gemini-4-argon (Fast Decoupled Synthesis)', () => {
      it('routes to argon for clean codebases (>= 8 files or >= 8,000 tokens)', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 12,
          totalTokens: 15_000,
          circularDeps: 0,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-argon');
        expect(route.rationale).toContain('gemini-4-argon');
        expect(route.rationale).toContain('Decoupled architecture');
      });

      it('routes to argon when measured X-Ray entropy is in [0.18, 0.40)', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 5,
          totalTokens: 5_000,
          circularDeps: 0,
          meanXRayEntropy: 0.25,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-argon');
        expect(route.entropy).toBe(0.25);
      });
    });

    describe('Tier: gemini-4-hydrogen (Ultra Low-Latency Minimal Tier)', () => {
      it('routes to hydrogen for compact, minimal single-module repos', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 2,
          totalTokens: 1_200,
          circularDeps: 0,
          meanXRayEntropy: 0.05,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-hydrogen');
        expect(route.entropy).toBe(0.05);
        expect(route.rationale).toContain('gemini-4-hydrogen');
        expect(route.rationale).toContain('Compact, single-module architecture');
      });

      it('handles empty / zero-metric inputs cleanly by selecting hydrogen', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 0,
          totalTokens: 0,
          circularDeps: 0,
        });
        expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-hydrogen');
        expect(route.entropy).toBe(0);
      });
    });

    describe('Entropy Override vs Structural Complexity', () => {
      it('computes structural complexity factor correctly when meanXRayEntropy is omitted', () => {
        // circFactor = 1/3 (0.333), tokenFactor = 60000/120000 (0.5), fileFactor = 30/60 (0.5)
        // structuralComplexity = 0.45*(1/3) + 0.35*(0.5) + 0.20*(0.5) = 0.15 + 0.175 + 0.10 = 0.425
        const route = routeRepoAnalysisModel({
          fileCount: 30,
          totalTokens: 60_000,
          circularDeps: 1,
        });
        expect(route.entropy).toBe(0.425);
      });

      it('overrides structural complexity when meanXRayEntropy is explicitly supplied', () => {
        const route = routeRepoAnalysisModel({
          fileCount: 30,
          totalTokens: 60_000,
          circularDeps: 1,
          meanXRayEntropy: 0.12,
        });
        expect(route.entropy).toBe(0.12);
      });
    });
  });

  // ===========================================================================
  // 3. Routing From Decision-1 X-Ray Probes (routeFromXRayProbs)
  // ===========================================================================
  describe('Routing from X-Ray Probe Probabilities (routeFromXRayProbs)', () => {
    it('returns default gemini-4-argon when probabilities array is empty', () => {
      const route = routeFromXRayProbs([]);
      expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-argon');
      expect(route.entropy).toBe(0);
      expect(route.rationale).toContain('No X-Ray decision probabilities provided');
    });

    it('routes to carbon when mean entropy >= 0.62 (ambiguous / high-uncertainty probes)', () => {
      // p = 0.5 has H(p) = 1.0 (maximal uncertainty)
      const ambiguousProbes = [0.5, 0.5, 0.5, 0.5, 0.5];
      const route = routeFromXRayProbs(ambiguousProbes);
      expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-carbon');
      expect(route.entropy).toBe(1);
      expect(route.rationale).toContain('gemini-4-carbon');
    });

    it('routes to carbon when highEntropyRatio >= 0.35 even if mean is borderline', () => {
      // 4 probes with H(p) >= 0.8 (e.g. p = 0.65 -> H ≈ 0.934), 6 probes with p = 0.98 -> H ≈ 0.141
      // highEntropyRatio = 4/10 = 0.40 >= 0.35
      const mixedProbes = [0.65, 0.65, 0.65, 0.65, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98];
      const route = routeFromXRayProbs(mixedProbes);
      expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-carbon');
    });

    it('routes to neon for moderate entropy probes (meanEntropy >= 0.40)', () => {
      // p = 0.85 -> H(p) ≈ 0.61 (H < 0.8 so not counted in highEntropyCount)
      const moderateProbes = [0.85, 0.85, 0.85, 0.85];
      const route = routeFromXRayProbs(moderateProbes);
      expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-neon');
      expect(route.entropy).toBeCloseTo(0.61, 2);
    });

    it('routes to argon for low entropy probes (meanEntropy in [0.18, 0.40))', () => {
      // p = 0.96 -> H(p) ≈ 0.242
      const healthyProbes = [0.96, 0.96, 0.96, 0.96];
      const route = routeFromXRayProbs(healthyProbes);
      expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-argon');
      expect(route.entropy).toBeCloseTo(0.242, 2);
    });

    it('routes to hydrogen for near-deterministic / unanimous probes (meanEntropy < 0.18)', () => {
      // p = 0.99 -> H(p) ≈ 0.081
      const pristineProbes = [0.99, 0.99, 0.99, 0.99];
      const route = routeFromXRayProbs(pristineProbes);
      expect(route.tier).toBe<AdaptiveModelTier>('gemini-4-hydrogen');
      expect(route.entropy).toBeLessThan(0.18);
      expect(route.rationale).toContain('gemini-4-hydrogen');
    });
  });

  // ===========================================================================
  // 4. 9 Canonical Architectural X-Ray Pillars Validation
  // ===========================================================================
  describe('9 Canonical Architectural X-Ray Pillars (XRAY_PILLARS)', () => {
    it('defines exactly 9 canonical architectural pillars', () => {
      expect(XRAY_PILLARS).toHaveLength(9);
    });

    it('contains all 9 expected pillar IDs matching XRayPillarId union', () => {
      const expectedIds: XRayPillarId[] = [
        'modularity',
        'security',
        'resilience',
        'testability',
        'api_clarity',
        'concurrency',
        'scalability',
        'hygiene',
        'onboarding',
      ];

      const actualIds = XRAY_PILLARS.map((p) => p.id);
      expect(actualIds).toEqual(expectedIds);
    });

    it('ensures each pillar has valid label, shortLabel, and {MODULE_LABEL} question template', () => {
      for (const pillar of XRAY_PILLARS) {
        expect(pillar.label).toBeTruthy();
        expect(pillar.shortLabel).toBeTruthy();
        expect(pillar.questionTemplate).toContain('{MODULE_LABEL}');
        expect(pillar.questionTemplate.endsWith('?')).toBe(true);
      }
    });

    it('has unique IDs and shortLabels across all pillars', () => {
      const ids = new Set(XRAY_PILLARS.map((p) => p.id));
      const shortLabels = new Set(XRAY_PILLARS.map((p) => p.shortLabel));
      expect(ids.size).toBe(9);
      expect(shortLabels.size).toBe(9);
    });
  });

  // ===========================================================================
  // 5. Deterministic 9-Pillar X-Ray Fallback (runCodebaseXRay)
  // ===========================================================================
  describe('Deterministic 9-Pillar X-Ray Fallback (runCodebaseXRay)', () => {
    it('executes deterministic AST fallback when no Gemini beta clients are configured', async () => {
      // Mock clientPool to return no beta clients
      vi.spyOn(clientPool, 'getDualBetaClients').mockReturnValue([]);

      const blueprint = createMockBlueprint();
      const report = await runCodebaseXRay(blueprint);

      expect(report.model).toBe('deterministic-ast-xray');
      expect(report.dualKeySharded).toBe(false);
      expect(report.totalProbes).toBe(9); // 1 node * 9 pillars
      expect(report.modules).toHaveLength(1);

      const moduleAudit = report.modules[0];
      expect(moduleAudit.nodeId).toBe('node-orchestrator');
      expect(moduleAudit.label).toBe('Orchestrator Core');
      expect(moduleAudit.layer).toBe('domain');
      expect(moduleAudit.overallHealth).toBeGreaterThanOrEqual(0);
      expect(moduleAudit.overallHealth).toBeLessThanOrEqual(100);
      expect(moduleAudit.blastRadius).toBeGreaterThanOrEqual(0.12);
      expect(moduleAudit.blastRadius).toBeLessThanOrEqual(0.98);
      expect(moduleAudit.topFinding).toBeTruthy();

      // Check all 9 pillars exist in cell scores
      for (const pillar of XRAY_PILLARS) {
        const cell = moduleAudit.cells[pillar.id];
        expect(cell).toBeDefined();
        expect(cell.pillar).toBe(pillar.id);
        expect(cell.probabilityHealthy).toBeGreaterThanOrEqual(0.48);
        expect(cell.probabilityHealthy).toBeLessThanOrEqual(0.98);
        expect(cell.confidence).toBeGreaterThanOrEqual(0.55);
        expect(cell.confidence).toBeLessThanOrEqual(0.99);
        expect(cell.entropy).toBeCloseTo(computeShannonEntropy(cell.probabilityHealthy), 3);
      }

      // Check aggregate metrics and recommended tier
      expect(report.overallScore).toBeGreaterThanOrEqual(50);
      expect(report.overallScore).toBeLessThanOrEqual(100);
      expect(report.meanEntropy).toBeGreaterThan(0);
      expect(['gemini-4-argon', 'gemini-4-neon', 'gemini-4-carbon', 'gemini-4-hydrogen']).toContain(
        report.recommendedModelTier,
      );
      expect(report.routingRationale).toBeTruthy();

      // Check pillar averages
      for (const pillar of XRAY_PILLARS) {
        expect(typeof report.pillarAverages[pillar.id]).toBe('number');
        expect(report.pillarAverages[pillar.id]).toBeGreaterThanOrEqual(0);
        expect(report.pillarAverages[pillar.id]).toBeLessThanOrEqual(100);
      }
    });

    it('penalizes modularity and flags circular dependency cycles in deterministic mode', async () => {
      vi.spyOn(clientPool, 'getDualBetaClients').mockReturnValue([]);

      const circularEdge: DependencyEdge = {
        id: 'edge-circular-1',
        source: 'src/core/orchestrator.ts',
        target: 'src/core/storage.ts',
        kind: 'import',
        weight: 2,
        isCircular: true,
      };

      const blueprintWithCirc = createMockBlueprint({
        dependencyEdges: [circularEdge],
      });

      const report = await runCodebaseXRay(blueprintWithCirc);
      const modCell = report.modules[0].cells.modularity;

      // Participation in circular dependency subtracts 0.24 from modularity baseline
      expect(modCell.flagSummary).toBeDefined();
      expect(modCell.flagSummary).toContain('1 circular dependency cycle(s)');
      expect(modCell.probabilityHealthy).toBeLessThan(0.85);
    });

    it('adjusts layer-specific probabilities (edge layer & API kind penalty on security)', async () => {
      vi.spyOn(clientPool, 'getDualBetaClients').mockReturnValue([]);

      const edgeNode: AtlasNode = {
        id: 'node-edge-api',
        label: 'Edge Gateway API',
        subtitle: 'src/edge/api.ts',
        subsystemId: 'subsystem-edge',
        layer: 'edge',
        kind: 'api',
        filePaths: ['src/edge/api.ts'],
        primaryFile: 'src/edge/api.ts',
        estimatedTokens: 600,
        centrality: 0.85,
        fanIn: 10,
        fanOut: 8,
        keySymbols: ['handleRequest'],
        visualBrief: 'Public facing API gateway.',
        inputs: [],
        outputs: ['src/core/orchestrator.ts'],
      };

      const edgeFile: RepoFileRecord = {
        path: 'src/edge/api.ts',
        name: 'api.ts',
        directory: 'src/edge',
        extension: '.ts',
        language: 'typescript',
        sizeBytes: 2500,
        lineCount: 90,
        estimatedTokens: 600,
        imports: [],
        resolvedImports: [],
        exports: ['handleRequest'],
        symbols: [{ name: 'handleRequest', kind: 'function', line: 10, exported: true }],
        layer: 'edge',
        centrality: 0.85,
        fanIn: 10,
        fanOut: 8,
        isEntrypoint: true,
        isTest: false,
        isConfig: false,
      };

      const blueprint = createMockBlueprint({
        nodes: [edgeNode],
        files: [edgeFile],
      });

      const report = await runCodebaseXRay(blueprint);
      const secCell = report.modules[0].cells.security;

      // Edge layer (-0.12) and API kind (-0.08) reduce security score
      expect(secCell.probabilityHealthy).toBeLessThanOrEqual(0.72);
      expect(secCell.flagSummary).toBeDefined();
      expect(secCell.flagSummary).toContain('Exposed at edge boundary');
    });

    it('boosts testability when primary file is marked as test', async () => {
      vi.spyOn(clientPool, 'getDualBetaClients').mockReturnValue([]);

      const testFile: RepoFileRecord = {
        path: 'tests/core.test.ts',
        name: 'core.test.ts',
        directory: 'tests',
        extension: '.ts',
        language: 'typescript',
        sizeBytes: 1500,
        lineCount: 50,
        estimatedTokens: 400,
        imports: [],
        resolvedImports: [],
        exports: [],
        symbols: [],
        layer: 'tooling',
        centrality: 0.1,
        fanIn: 0,
        fanOut: 2,
        isEntrypoint: false,
        isTest: true,
        isConfig: false,
      };

      const testNode: AtlasNode = {
        id: 'node-test',
        label: 'Core Test Suite',
        subtitle: 'tests/core.test.ts',
        subsystemId: 'subsystem-core',
        layer: 'tooling',
        kind: 'module',
        filePaths: ['tests/core.test.ts'],
        primaryFile: 'tests/core.test.ts',
        estimatedTokens: 400,
        centrality: 0.1,
        fanIn: 0,
        fanOut: 2,
        keySymbols: ['describe', 'it'],
        visualBrief: 'Unit tests for core.',
        inputs: [],
        outputs: [],
      };

      const blueprint = createMockBlueprint({
        nodes: [testNode],
        files: [testFile],
      });

      const report = await runCodebaseXRay(blueprint);
      const testCell = report.modules[0].cells.testability;
      expect(testCell.probabilityHealthy).toBe(0.97);
    });

    it('synthesizes candidate nodes from blueprint.files when blueprint.nodes is empty', async () => {
      vi.spyOn(clientPool, 'getDualBetaClients').mockReturnValue([]);

      const fileA: RepoFileRecord = {
        path: 'src/server.ts',
        name: 'server.ts',
        directory: 'src',
        extension: '.ts',
        language: 'typescript',
        sizeBytes: 3000,
        lineCount: 100,
        estimatedTokens: 800,
        imports: [],
        resolvedImports: [],
        exports: ['startServer'],
        symbols: [{ name: 'startServer', kind: 'function', line: 12, exported: true }],
        layer: 'infrastructure',
        centrality: 0.9,
        fanIn: 2,
        fanOut: 6,
        isEntrypoint: true,
        isTest: false,
        isConfig: false,
      };

      const fileB: RepoFileRecord = {
        path: 'src/client.ts',
        name: 'client.ts',
        directory: 'src',
        extension: '.ts',
        language: 'typescript',
        sizeBytes: 2000,
        lineCount: 80,
        estimatedTokens: 500,
        imports: [],
        resolvedImports: [],
        exports: ['ClientApp'],
        symbols: [{ name: 'ClientApp', kind: 'class', line: 5, exported: true }],
        layer: 'client',
        centrality: 0.5,
        fanIn: 1,
        fanOut: 2,
        isEntrypoint: false,
        isTest: false,
        isConfig: false,
      };

      const blueprintNoNodes = createMockBlueprint({
        nodes: [],
        files: [fileA, fileB],
      });

      const report = await runCodebaseXRay(blueprintNoNodes, { maxModules: 5 });

      expect(report.modules).toHaveLength(2);
      expect(report.totalProbes).toBe(18); // 2 synthesized modules * 9 pillars
      expect(report.modules.map((m) => m.primaryFile)).toContain('src/server.ts');
      expect(report.modules.map((m) => m.primaryFile)).toContain('src/client.ts');
    });

    it('falls back gracefully to deterministic AST when Decision-1 API probe throws', async () => {
      // Mock client whose decisions.create throws an error
      const mockFailingClient = {
        decisions: {
          create: vi.fn().mockRejectedValue(new Error('Simulated Gemini 503 Overloaded')),
        },
      };

      vi.spyOn(clientPool, 'getDualBetaClients').mockReturnValue([
        { client: mockFailingClient as any, slot: 'primary' },
      ]);

      const blueprint = createMockBlueprint();
      const report = await runCodebaseXRay(blueprint);

      // Verify execution completed without crashing
      expect(report).toBeDefined();
      expect(report.modules).toHaveLength(1);
      expect(report.totalProbes).toBe(9);
      expect(Object.keys(report.modules[0].cells)).toHaveLength(9);
    });

    it('shards candidate modules across dual clients and collects calibrated Noul answers', async () => {
      // Create 2 mock clients returning calibrated Noul answers
      const createMockDecisionClient = (noulScore: number) => ({
        decisions: {
          create: vi.fn().mockResolvedValue({
            answers: {
              modularity: { type: 'noul', noul: noulScore, confidence: 0.92 },
              security: { type: 'noul', noul: noulScore, confidence: 0.88 },
              resilience: { type: 'noul', noul: noulScore, confidence: 0.90 },
              testability: { type: 'noul', noul: noulScore, confidence: 0.85 },
              api_clarity: { type: 'noul', noul: noulScore, confidence: 0.95 },
              concurrency: { type: 'noul', noul: noulScore, confidence: 0.89 },
              scalability: { type: 'noul', noul: noulScore, confidence: 0.86 },
              hygiene: { type: 'noul', noul: noulScore, confidence: 0.91 },
              onboarding: { type: 'noul', noul: noulScore, confidence: 0.94 },
            },
          }),
        },
      });

      const client0 = createMockDecisionClient(0.92);
      const client1 = createMockDecisionClient(0.88);

      vi.spyOn(clientPool, 'getDualBetaClients').mockReturnValue([
        { client: client0 as any, slot: 'primary' },
        { client: client1 as any, slot: 'secondary' },
      ]);

      const nodeA: AtlasNode = {
        id: 'node-a',
        label: 'Module A',
        subtitle: 'src/a.ts',
        subsystemId: 'subsystem-core',
        layer: 'domain',
        kind: 'module',
        filePaths: ['src/a.ts'],
        primaryFile: 'src/a.ts',
        estimatedTokens: 500,
        centrality: 0.7,
        fanIn: 2,
        fanOut: 3,
        keySymbols: ['A'],
        visualBrief: 'Module A.',
        inputs: [],
        outputs: [],
      };

      const nodeB: AtlasNode = {
        id: 'node-b',
        label: 'Module B',
        subtitle: 'src/b.ts',
        subsystemId: 'subsystem-core',
        layer: 'domain',
        kind: 'module',
        filePaths: ['src/b.ts'],
        primaryFile: 'src/b.ts',
        estimatedTokens: 600,
        centrality: 0.6,
        fanIn: 1,
        fanOut: 2,
        keySymbols: ['B'],
        visualBrief: 'Module B.',
        inputs: [],
        outputs: [],
      };

      const blueprint = createMockBlueprint({
        nodes: [nodeA, nodeB],
      });

      const report = await runCodebaseXRay(blueprint);

      expect(report.dualKeySharded).toBe(true);
      expect(report.modules).toHaveLength(2);
      expect(client0.decisions.create).toHaveBeenCalledTimes(1);
      expect(client1.decisions.create).toHaveBeenCalledTimes(1);

      // Verify probability values came from Decision-1 noul response
      expect(report.modules[0].cells.modularity.probabilityHealthy).toBe(0.92);
      expect(report.modules[1].cells.modularity.probabilityHealthy).toBe(0.88);
    });
  });
});
