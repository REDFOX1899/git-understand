// =============================================================================
// GitUnderstand (git-understand.com) — Showcase Fixtures Vitest Suite
// Agent 86: Tests verifying all 4 offline showcase blueprints have valid nodes,
// valid edge endpoints, strata, flows, diagrams, treemaps, and 9-pillar X-Rays.
// =============================================================================

import { describe, expect, it } from 'vitest';
import type {
  ArchitectureLayer,
  AtlasNode,
  TreemapNode,
  VisualAtlasBlueprint,
  XRayPillarId,
} from '../shared/types.js';
import {
  getShowcaseBlueprint,
  listShowcaseSummaries,
  SHOWCASE_REPOS,
} from '../backend/src/ingest/showcaseFixtures.js';

const EXPECTED_SLUGS = [
  'coderamp-labs/gitingest',
  'ahmedkhaleel2004/gitdiagram',
  'AsyncFuncAI/deepwiki-open',
  'REDFOX1899/antislop',
] as const;

const CANONICAL_9_PILLARS: readonly XRayPillarId[] = [
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

const VALID_LAYERS: readonly ArchitectureLayer[] = [
  'client',
  'edge',
  'orchestration',
  'domain',
  'infrastructure',
  'data',
  'tooling',
];

const VALID_NODE_KINDS = [
  'service',
  'module',
  'ui',
  'api',
  'store',
  'agent',
  'pipeline',
  'external',
  'config',
] as const;

const VALID_FLOW_CATEGORIES = [
  'request',
  'ingestion',
  'ai_pipeline',
  'auth',
  'state',
  'build',
] as const;

describe('Showcase Fixture Registry & Lookup Helpers', () => {
  it('registers exactly 4 curated showcase repositories', () => {
    expect(SHOWCASE_REPOS).toHaveLength(4);
    const slugs = SHOWCASE_REPOS.map((entry) => entry.slug);
    expect(slugs).toEqual(EXPECTED_SLUGS);
  });

  it('exposes listShowcaseSummaries() with valid metadata for cards and selector', () => {
    const summaries = listShowcaseSummaries();
    expect(summaries).toHaveLength(4);

    for (const summary of summaries) {
      expect(summary.repoId).toBeTypeOf('string');
      expect(summary.repoId.length).toBeGreaterThan(0);
      expect(summary.slug).toBeTypeOf('string');
      expect(EXPECTED_SLUGS).toContain(summary.slug);
      expect(summary.title).toBeTypeOf('string');
      expect(summary.title.length).toBeGreaterThan(0);
      expect(summary.subtitle).toBeTypeOf('string');
      expect(summary.badge).toBeTypeOf('string');
      expect(summary.stars).toBeGreaterThan(0);
      expect(summary.language).toBeTypeOf('string');
      expect(summary.architecturePattern).toBeTypeOf('string');
      expect(summary.nodeCount).toBeGreaterThan(0);
      expect(summary.tokenCount).toBeGreaterThan(0);
    }
  });

  it('resolves blueprints by exact slug, repoId, uppercase, and GitHub URL variants', () => {
    for (const entry of SHOWCASE_REPOS) {
      // 1. By exact slug
      const bySlug = getShowcaseBlueprint(entry.slug);
      expect(bySlug).not.toBeNull();
      expect(bySlug?.repoId).toBe(entry.blueprint.repoId);

      // 2. By repoId
      const byRepoId = getShowcaseBlueprint(entry.blueprint.repoId);
      expect(byRepoId).not.toBeNull();
      expect(byRepoId?.repoId).toBe(entry.blueprint.repoId);

      // 3. By GitHub URL
      const githubUrl = `https://github.com/${entry.slug}`;
      const byUrl = getShowcaseBlueprint(githubUrl);
      expect(byUrl).not.toBeNull();
      expect(byUrl?.repoId).toBe(entry.blueprint.repoId);

      // 4. Case-insensitive lookup
      const upperSlug = entry.slug.toUpperCase();
      const byUpper = getShowcaseBlueprint(upperSlug);
      expect(byUpper).not.toBeNull();
      expect(byUpper?.repoId).toBe(entry.blueprint.repoId);

      // 5. Returns a structured clone (mutations do not bleed)
      if (bySlug) {
        bySlug.headline = 'Mutated Copy';
        const fresh = getShowcaseBlueprint(entry.slug);
        expect(fresh?.headline).not.toBe('Mutated Copy');
      }
    }
  });

  it('returns null for empty strings or non-existent repository identifiers', () => {
    expect(getShowcaseBlueprint('')).toBeNull();
    expect(getShowcaseBlueprint('   ')).toBeNull();
    expect(getShowcaseBlueprint('nonexistent/repo')).toBeNull();
    expect(getShowcaseBlueprint('https://github.com/foo/bar')).toBeNull();
  });
});

describe.each(SHOWCASE_REPOS)(
  'Showcase Blueprint Integrity: $slug ($title)',
  ({ slug, blueprint }: { slug: string; blueprint: VisualAtlasBlueprint }) => {
    it('has valid metadata, stats, and badges', () => {
      expect(blueprint.repoId).toBeTypeOf('string');
      expect(blueprint.repoId.length).toBeGreaterThan(0);
      expect(blueprint.metadata.fullName).toBe(slug);
      expect(blueprint.metadata.stars).toBeGreaterThan(0);
      expect(blueprint.metadata.defaultBranch).toBe('main');
      expect(blueprint.metadata.isShowcase).toBe(true);

      expect(blueprint.headline).toBeTypeOf('string');
      expect(blueprint.headline.length).toBeGreaterThan(0);
      expect(blueprint.oneLiner).toBeTypeOf('string');
      expect(blueprint.oneLiner.length).toBeGreaterThan(0);
      expect(blueprint.architecturePattern).toBeTypeOf('string');
      expect(blueprint.techStackBadges.length).toBeGreaterThan(0);

      expect(blueprint.stats.totalFiles).toBeGreaterThanOrEqual(blueprint.stats.analyzedFiles);
      expect(blueprint.stats.analyzedFiles).toBe(blueprint.files.length);
      expect(blueprint.stats.totalLines).toBeGreaterThan(0);
      expect(blueprint.stats.totalTokens).toBeGreaterThan(0);
      expect(blueprint.stats.totalBytes).toBeGreaterThan(0);
      expect(blueprint.stats.ingestLatencyMs).toBeGreaterThan(0);
      expect(blueprint.aiEnriched).toBe(true);
      expect(blueprint.modelsUsed.length).toBeGreaterThan(0);
    });

    it('has valid nodes with unique IDs, legal layers, kinds, and existing files', () => {
      expect(blueprint.nodes.length).toBeGreaterThanOrEqual(5);

      const nodeIds = new Set<string>();
      const filePathsSet = new Set(blueprint.files.map((f) => f.path));
      const subsystemIds = new Set(blueprint.subsystems.map((s) => s.id));

      for (const node of blueprint.nodes) {
        // Unique ID
        expect(node.id).toBeTypeOf('string');
        expect(node.id.length).toBeGreaterThan(0);
        expect(nodeIds.has(node.id)).toBe(false);
        nodeIds.add(node.id);

        // Required display fields
        expect(node.label).toBeTypeOf('string');
        expect(node.label.length).toBeGreaterThan(0);
        expect(node.subtitle).toBeTypeOf('string');
        expect(node.visualBrief).toBeTypeOf('string');
        expect(node.visualBrief.length).toBeGreaterThan(0);

        // Architecture layer & kind
        expect(VALID_LAYERS).toContain(node.layer);
        expect(VALID_NODE_KINDS).toContain(node.kind);

        // Metrics & scores
        expect(node.estimatedTokens).toBeGreaterThanOrEqual(0);
        expect(node.centrality).toBeGreaterThanOrEqual(0);
        expect(node.centrality).toBeLessThanOrEqual(1);
        expect(node.fanIn).toBeGreaterThanOrEqual(0);
        expect(node.fanOut).toBeGreaterThanOrEqual(0);
        if (node.riskScore !== undefined) {
          expect(node.riskScore).toBeGreaterThanOrEqual(0);
          expect(node.riskScore).toBeLessThanOrEqual(1);
        }

        // Subsystem mapping
        expect(subsystemIds.has(node.subsystemId)).toBe(true);

        // Primary file and file paths
        expect(node.filePaths.length).toBeGreaterThan(0);
        expect(node.primaryFile).toBeTypeOf('string');
        expect(node.filePaths).toContain(node.primaryFile);
        expect(filePathsSet.has(node.primaryFile)).toBe(true);
      }
    });

    it('has valid Atlas edge endpoints referencing existing nodes', () => {
      expect(blueprint.edges.length).toBeGreaterThanOrEqual(5);

      const nodeIdSet = new Set(blueprint.nodes.map((n) => n.id));
      const edgeIdSet = new Set<string>();

      for (const edge of blueprint.edges) {
        expect(edge.id).toBeTypeOf('string');
        expect(edge.id.length).toBeGreaterThan(0);
        expect(edgeIdSet.has(edge.id)).toBe(false);
        edgeIdSet.add(edge.id);

        expect(edge.label).toBeTypeOf('string');
        expect(edge.label.length).toBeGreaterThan(0);
        expect(edge.weight).toBeGreaterThan(0);

        // CRITICAL: Both source and target MUST exist in the node set
        expect(
          nodeIdSet.has(edge.source),
          `Edge '${edge.id}' source '${edge.source}' does not exist in blueprint.nodes`,
        ).toBe(true);
        expect(
          nodeIdSet.has(edge.target),
          `Edge '${edge.id}' target '${edge.target}' does not exist in blueprint.nodes`,
        ).toBe(true);

        expect([
          'data',
          'control',
          'http',
          'stream',
          'storage',
          'dependency',
        ]).toContain(edge.kind);
      }
    });

    it('has valid dependency edges connecting existing file paths', () => {
      expect(blueprint.dependencyEdges.length).toBeGreaterThan(0);
      const filePathSet = new Set(blueprint.files.map((f) => f.path));

      for (const dep of blueprint.dependencyEdges) {
        expect(dep.id).toBeTypeOf('string');
        expect(filePathSet.has(dep.source)).toBe(true);
        expect(filePathSet.has(dep.target)).toBe(true);
        expect(dep.weight).toBeGreaterThanOrEqual(1);
      }
    });

    it('has valid strata layers with ordered elevations and valid node references', () => {
      expect(blueprint.strata.length).toBeGreaterThanOrEqual(3);

      const nodeIdSet = new Set(blueprint.nodes.map((n) => n.id));

      for (const stratum of blueprint.strata) {
        expect(VALID_LAYERS).toContain(stratum.layer);
        expect(stratum.title).toBeTypeOf('string');
        expect(stratum.title.length).toBeGreaterThan(0);
        expect(stratum.description).toBeTypeOf('string');
        expect(stratum.elevation).toBeGreaterThanOrEqual(0);
        expect(stratum.elevation).toBeLessThanOrEqual(6);
        expect(stratum.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);

        expect(stratum.fileCount).toBeGreaterThanOrEqual(0);
        expect(stratum.tokenCount).toBeGreaterThanOrEqual(0);

        // Every node assigned to this stratum layer must exist in nodes
        for (const nid of stratum.nodeIds) {
          expect(nodeIdSet.has(nid)).toBe(true);
        }
      }
    });

    it('has execution flows with sequential steps, valid categories, and valid node endpoints', () => {
      expect(blueprint.flows.length).toBeGreaterThanOrEqual(1);

      const nodeIdSet = new Set(blueprint.nodes.map((n) => n.id));
      const filePathSet = new Set(blueprint.files.map((f) => f.path));

      for (const flow of blueprint.flows) {
        expect(flow.id).toBeTypeOf('string');
        expect(flow.title).toBeTypeOf('string');
        expect(flow.title.length).toBeGreaterThan(0);
        expect(flow.subtitle).toBeTypeOf('string');
        expect(flow.trigger).toBeTypeOf('string');
        expect(VALID_FLOW_CATEGORIES).toContain(flow.category);
        expect(flow.steps.length).toBeGreaterThanOrEqual(2);

        let previousStepNumber = 0;
        for (const step of flow.steps) {
          expect(step.stepNumber).toBe(previousStepNumber + 1);
          previousStepNumber = step.stepNumber;

          expect(step.title).toBeTypeOf('string');
          expect(step.title.length).toBeGreaterThan(0);
          expect(step.action).toBeTypeOf('string');
          expect(step.action.length).toBeGreaterThan(0);
          expect(step.edgeLabel).toBeTypeOf('string');

          // Steps connect valid Atlas nodes
          expect(
            nodeIdSet.has(step.fromNodeId),
            `Flow '${flow.id}' step ${step.stepNumber} fromNodeId '${step.fromNodeId}' not found`,
          ).toBe(true);
          expect(
            nodeIdSet.has(step.toNodeId),
            `Flow '${flow.id}' step ${step.stepNumber} toNodeId '${step.toNodeId}' not found`,
          ).toBe(true);

          // Step points to an existing file
          expect(filePathSet.has(step.filePath)).toBe(true);
          expect(step.lineStart).toBeGreaterThanOrEqual(1);
          expect(step.lineEnd).toBeGreaterThanOrEqual(step.lineStart);
        }
      }
    });

    it('has Mermaid diagrams with valid syntax and mapped repo files', () => {
      expect(blueprint.diagrams.length).toBeGreaterThanOrEqual(1);
      const filePathSet = new Set(blueprint.files.map((f) => f.path));

      for (const diagram of blueprint.diagrams) {
        expect(diagram.id).toBeTypeOf('string');
        expect(diagram.title).toBeTypeOf('string');
        expect(diagram.subtitle).toBeTypeOf('string');
        expect(['architecture', 'sequence', 'class', 'er', 'custom']).toContain(
          diagram.kind,
        );

        // Diagram code must contain Mermaid syntax
        expect(diagram.code).toBeTypeOf('string');
        expect(diagram.code.trim().length).toBeGreaterThan(20);
        const hasMermaidKeyword =
          diagram.code.includes('graph') ||
          diagram.code.includes('flowchart') ||
          diagram.code.includes('sequenceDiagram') ||
          diagram.code.includes('classDiagram');
        expect(
          hasMermaidKeyword,
          `Diagram '${diagram.id}' code missing standard Mermaid keyword`,
        ).toBe(true);

        // nodeFileMap checks
        expect(diagram.nodeFileMap).toBeDefined();
        const mappedEntries = Object.entries(diagram.nodeFileMap);
        expect(mappedEntries.length).toBeGreaterThan(0);

        for (const [, mappedFilePath] of mappedEntries) {
          expect(
            filePathSet.has(mappedFilePath),
            `Diagram '${diagram.id}' maps node to '${mappedFilePath}' which is not in files`,
          ).toBe(true);
        }
      }
    });

    it('has a hierarchical token treemap with consistent rollups', () => {
      const treemap = blueprint.treemap;
      expect(treemap).toBeDefined();
      expect(treemap.kind).toBe('dir');
      expect(treemap.name).toBe(blueprint.metadata.name);
      expect(treemap.path).toBe('.');
      expect(treemap.tokens).toBeGreaterThan(0);
      expect(treemap.bytes).toBeGreaterThan(0);
      expect(treemap.fileCount).toBeGreaterThan(0);
      expect(treemap.children).toBeDefined();
      expect(treemap.children?.length).toBeGreaterThan(0);

      const filePathSet = new Set(blueprint.files.map((f) => f.path));

      function validateTreemapNode(node: TreemapNode, parentPath: string): number {
        expect(node.id).toBeTypeOf('string');
        expect(node.name).toBeTypeOf('string');
        expect(node.path).toBeTypeOf('string');

        if (node.kind === 'file') {
          expect(node.tokens).toBeGreaterThan(0);
          expect(node.bytes).toBeGreaterThan(0);
          expect(node.fileCount).toBe(1);
          expect(node.language).toBeTypeOf('string');
          expect(node.children).toBeUndefined();
          expect(
            filePathSet.has(node.path),
            `Treemap file '${node.path}' does not exist in blueprint.files`,
          ).toBe(true);
          return node.tokens;
        }

        // For directories:
        expect(node.kind).toBe('dir');
        expect(node.children).toBeDefined();
        expect(node.children?.length).toBeGreaterThan(0);

        let sumChildTokens = 0;
        for (const child of node.children ?? []) {
          sumChildTokens += validateTreemapNode(child, node.path);
        }

        // Rollup tokens should match sum of child tokens
        expect(node.tokens).toBe(sumChildTokens);
        return node.tokens;
      }

      const totalTokensFromTreemap = validateTreemapNode(treemap, '');
      expect(totalTokensFromTreemap).toBe(blueprint.stats.totalTokens);
    });

    it('has a calibrated 9-pillar Decision-1 X-Ray matrix report', () => {
      const xray = blueprint.xray;
      expect(xray).toBeDefined();
      if (!xray) return;

      expect(xray.model).toBe('gemini-decision-1');
      expect(xray.dualKeySharded).toBe(true);
      expect(xray.latencyMs).toBeGreaterThan(0);
      expect(xray.overallScore).toBeGreaterThanOrEqual(0);
      expect(xray.overallScore).toBeLessThanOrEqual(100);
      expect(xray.meanEntropy).toBeGreaterThanOrEqual(0);
      expect(xray.meanEntropy).toBeLessThanOrEqual(1);
      expect(xray.recommendedModelTier).toBeTypeOf('string');
      expect(xray.routingRationale).toBeTypeOf('string');
      expect(xray.routingRationale.length).toBeGreaterThan(0);

      // Verify all 9 canonical pillars are present in pillarAverages
      for (const pillar of CANONICAL_9_PILLARS) {
        expect(xray.pillarAverages[pillar]).toBeDefined();
        expect(xray.pillarAverages[pillar]).toBeGreaterThanOrEqual(0);
        expect(xray.pillarAverages[pillar]).toBeLessThanOrEqual(100);
      }

      // Verify audited modules
      expect(xray.modules.length).toBeGreaterThanOrEqual(5);
      const nodeIdSet = new Set(blueprint.nodes.map((n) => n.id));

      for (const mod of xray.modules) {
        expect(
          nodeIdSet.has(mod.nodeId),
          `X-Ray audited module nodeId '${mod.nodeId}' does not exist in blueprint.nodes`,
        ).toBe(true);
        expect(mod.label).toBeTypeOf('string');
        expect(mod.label.length).toBeGreaterThan(0);
        expect(VALID_LAYERS).toContain(mod.layer);
        expect(mod.overallHealth).toBeGreaterThanOrEqual(0);
        expect(mod.overallHealth).toBeLessThanOrEqual(100);
        expect(mod.blastRadius).toBeGreaterThanOrEqual(0);
        expect(mod.blastRadius).toBeLessThanOrEqual(1);
        expect(mod.topFinding).toBeTypeOf('string');
        expect(mod.topFinding.length).toBeGreaterThan(0);

        // Cell scores must contain exactly the 9 pillars
        for (const pillar of CANONICAL_9_PILLARS) {
          const cell = mod.cells[pillar];
          expect(cell, `Missing cell for pillar '${pillar}' in module '${mod.nodeId}'`).toBeDefined();
          expect(cell.pillar).toBe(pillar);
          expect(cell.probabilityHealthy).toBeGreaterThanOrEqual(0);
          expect(cell.probabilityHealthy).toBeLessThanOrEqual(1);
          expect(cell.confidence).toBeGreaterThanOrEqual(0);
          expect(cell.confidence).toBeLessThanOrEqual(1);
          expect(cell.entropy).toBeGreaterThanOrEqual(0);
          expect(cell.entropy).toBeLessThanOrEqual(1);
        }
      }

      expect(xray.totalProbes).toBe(xray.modules.length * CANONICAL_9_PILLARS.length);
    });

    it('has subsystems with invariants, summary bullets, and assigned nodes', () => {
      expect(blueprint.subsystems.length).toBeGreaterThanOrEqual(3);
      const nodeIdSet = new Set(blueprint.nodes.map((n) => n.id));
      const filePathSet = new Set(blueprint.files.map((f) => f.path));

      for (const sub of blueprint.subsystems) {
        expect(sub.id).toBeTypeOf('string');
        expect(sub.name).toBeTypeOf('string');
        expect(sub.tagline).toBeTypeOf('string');
        expect(VALID_LAYERS).toContain(sub.layer);
        expect(sub.color).toMatch(/^#[0-9a-fA-F]{6}$/);

        expect(sub.nodeIds.length).toBeGreaterThan(0);
        for (const nid of sub.nodeIds) {
          expect(nodeIdSet.has(nid)).toBe(true);
        }

        expect(sub.filePaths.length).toBeGreaterThan(0);
        for (const fp of sub.filePaths) {
          expect(filePathSet.has(fp)).toBe(true);
        }

        expect(sub.summaryBullets.length).toBeGreaterThan(0);
        expect(sub.invariants.length).toBeGreaterThan(0);
      }
    });

    it('has a codemap tour with valid focusNodeId references and ordered stops', () => {
      expect(blueprint.codemapTour.length).toBeGreaterThanOrEqual(2);
      const nodeIdSet = new Set(blueprint.nodes.map((n) => n.id));
      const filePathSet = new Set(blueprint.files.map((f) => f.path));

      let expectedOrder = 1;
      for (const stop of blueprint.codemapTour) {
        expect(stop.order).toBe(expectedOrder++);
        expect(stop.title).toBeTypeOf('string');
        expect(stop.visualHook).toBeTypeOf('string');
        expect(stop.explanation).toBeTypeOf('string');
        expect(nodeIdSet.has(stop.focusNodeId)).toBe(true);
        expect(filePathSet.has(stop.filePath)).toBe(true);
        expect(stop.lineStart).toBeGreaterThanOrEqual(1);
        expect(stop.lineEnd).toBeGreaterThanOrEqual(stop.lineStart);
      }
    });
  },
);
