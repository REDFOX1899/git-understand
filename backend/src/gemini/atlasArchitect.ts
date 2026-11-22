// =============================================================================
// GitUnderstand (git-understand.com) — Gemini 4 Carbon Atlas Architect
// Agent 18: Synthesizes high-level visual architectural blueprint from deterministic
// AST signals, topological dependency graphs, and code metrics.
// Refines headline, oneLiner, architecturePattern, subsystems (4-7),
// grounded nodes (8-18), semantic edges, and rebuilds 3D strata.
// =============================================================================

import type {
  ArchitectureLayer,
  AtlasEdge,
  AtlasNode,
  RepoFileRecord,
  StratumLayer,
  SubsystemCluster,
  VisualAtlasBlueprint,
} from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { hasGeminiCredentials, withV1Client } from './clientPool.js';
import { extractJsonObject } from './mediaUtils.js';

// =============================================================================
// Obsidian Cobalt + Archival Semantic Palettes
// =============================================================================

export const SUBSYSTEM_PALETTE: readonly string[] = [
  '#1A73E8', // Cobalt Core
  '#38BDF8', // Cyan Layer
  '#34D399', // Emerald
  '#818CF8', // Indigo Layer
  '#2DD4BF', // Teal Layer
  '#4285F4', // Cobalt Bright
  '#FBBF24', // Amber
  '#60A5FA', // Cobalt Steel
  '#0B57D0', // Cobalt Deep
  '#8AB4F8', // Cobalt Ice
];

export const LAYER_ORDER: readonly ArchitectureLayer[] = [
  'client',
  'edge',
  'orchestration',
  'domain',
  'infrastructure',
  'data',
  'tooling',
];

const VALID_LAYERS = new Set<ArchitectureLayer>(LAYER_ORDER);

const VALID_NODE_KINDS = new Set<AtlasNode['kind']>([
  'service',
  'module',
  'ui',
  'api',
  'store',
  'agent',
  'pipeline',
  'external',
  'config',
]);

const VALID_EDGE_KINDS = new Set<AtlasEdge['kind']>([
  'data',
  'control',
  'http',
  'stream',
  'storage',
  'dependency',
]);

export const STRATUM_METADATA: Record<
  ArchitectureLayer,
  { title: string; description: string; elevation: number; accentColor: string }
> = {
  client: {
    title: 'Client & Visual Surface',
    description: 'Interactive views, UI components, hooks, themes, and client state.',
    elevation: 6,
    accentColor: '#38BDF8',
  },
  edge: {
    title: 'Edge & API Gateway',
    description: 'HTTP routes, request handlers, WebSockets, middleware, and entrypoints.',
    elevation: 5,
    accentColor: '#4285F4',
  },
  orchestration: {
    title: 'Orchestration & Pipelines',
    description: 'Workflow engines, ingestion pipelines, AI synthesis, agents, and workers.',
    elevation: 4,
    accentColor: '#1A73E8',
  },
  domain: {
    title: 'Core Domain & Logic',
    description: 'Business rules, parsers, analyzers, algorithms, and canonical contracts.',
    elevation: 3,
    accentColor: '#818CF8',
  },
  infrastructure: {
    title: 'Infrastructure & Adapters',
    description: 'Configuration, auth, observability, cloud deployment, and SDK clients.',
    elevation: 2,
    accentColor: '#2DD4BF',
  },
  data: {
    title: 'Data & Persistence',
    description: 'Schemas, repositories, caches, vector indices, and storage backends.',
    elevation: 1,
    accentColor: '#34D399',
  },
  tooling: {
    title: 'Tooling, Tests & Docs',
    description: 'Test suites, build configuration, CI workflows, scripts, and documentation.',
    elevation: 0,
    accentColor: '#FBBF24',
  },
};

// =============================================================================
// LLM Response Contract
// =============================================================================

interface RawSubsystem {
  id?: string;
  name?: string;
  tagline?: string;
  layer?: string;
  filePaths?: string[];
  entrypointPaths?: string[];
  summaryBullets?: string[];
  invariants?: string[];
}

interface RawNode {
  id?: string;
  label?: string;
  subtitle?: string;
  subsystemId?: string;
  layer?: string;
  kind?: string;
  primaryFile?: string;
  filePaths?: string[];
  keySymbols?: string[];
  visualBrief?: string;
  inputs?: string[];
  outputs?: string[];
}

interface RawEdge {
  id?: string;
  source?: string;
  target?: string;
  label?: string;
  kind?: string;
  protocol?: string;
  weight?: number;
  isHotPath?: boolean;
}

interface GeminiArchitectResponse {
  headline?: string;
  oneLiner?: string;
  architecturePattern?: string;
  techStackBadges?: string[];
  subsystems?: RawSubsystem[];
  nodes?: RawNode[];
  edges?: RawEdge[];
}

// =============================================================================
// Synthesis Options
// =============================================================================

export interface SynthesizeVisualAtlasOptions {
  byokApiKey?: string;
  modelOverride?: string;
}

// =============================================================================
// Helper: Extract Text from Gemini Interaction
// =============================================================================

function extractInteractionText(interaction: unknown): string {
  if (!interaction || typeof interaction !== 'object') {
    return '';
  }

  const obj = interaction as Record<string, unknown>;

  // Check top-level output_text populated by @google/genai
  if (typeof obj.output_text === 'string' && obj.output_text.trim()) {
    return obj.output_text.trim();
  }

  // Check steps array if present
  if (Array.isArray(obj.steps)) {
    const textParts: string[] = [];
    for (const step of obj.steps) {
      if (!step || typeof step !== 'object') continue;
      const s = step as Record<string, unknown>;
      if (typeof s.text === 'string' && s.text.trim()) {
        textParts.push(s.text.trim());
      }
      if (Array.isArray(s.content)) {
        for (const item of s.content) {
          if (item && typeof item === 'object') {
            const part = item as Record<string, unknown>;
            if (typeof part.text === 'string' && part.text.trim()) {
              textParts.push(part.text.trim());
            }
          }
        }
      }
    }
    if (textParts.length > 0) {
      return textParts.join('\n').trim();
    }
  }

  return '';
}

// =============================================================================
// Strata Rebuilder
// =============================================================================

/**
 * Rebuilds the 3D visual strata layers based on all active files and refined nodes.
 */
export function rebuildStrata(
  files: RepoFileRecord[],
  nodes: AtlasNode[]
): StratumLayer[] {
  const strata: StratumLayer[] = [];

  for (const layer of LAYER_ORDER) {
    const layerFiles = files.filter((f) => f.layer === layer);
    const layerNodes = nodes.filter((n) => n.layer === layer).map((n) => n.id);

    // Only include populated stratum layers
    if (layerFiles.length === 0 && layerNodes.length === 0) {
      continue;
    }

    const meta = STRATUM_METADATA[layer];
    const tokenCount = layerFiles.reduce((sum, f) => sum + f.estimatedTokens, 0);

    strata.push({
      layer,
      title: meta.title,
      description: meta.description,
      elevation: meta.elevation,
      accentColor: meta.accentColor,
      nodeIds: layerNodes,
      fileCount: layerFiles.length,
      tokenCount,
    });
  }

  return strata;
}

// =============================================================================
// Canvas Coordinate Layout
// =============================================================================

/**
 * Positions Atlas nodes in an aesthetically balanced, non-overlapping canvas layout
 * grouped by architectural layer and centered horizontally.
 */
function applyVisualCanvasLayout(nodes: AtlasNode[]): void {
  const layerGroups = new Map<ArchitectureLayer, AtlasNode[]>();

  for (const layer of LAYER_ORDER) {
    layerGroups.set(layer, []);
  }

  for (const node of nodes) {
    const group = layerGroups.get(node.layer) || layerGroups.get('domain')!;
    group.push(node);
  }

  const activeLayers = LAYER_ORDER.filter((layer) => (layerGroups.get(layer)?.length ?? 0) > 0);

  const ROW_GAP = 210;
  const COL_GAP = 280;
  const TOP_MARGIN = 100;
  const CENTER_X = 640;

  activeLayers.forEach((layer, rowIndex) => {
    const row = layerGroups.get(layer)!;
    const totalWidth = (row.length - 1) * COL_GAP;
    const startX = Math.max(120, Math.round(CENTER_X - totalWidth / 2));
    const y = TOP_MARGIN + rowIndex * ROW_GAP;

    row.forEach((node, colIndex) => {
      node.x = startX + colIndex * COL_GAP;
      node.y = y;
    });
  });
}

// =============================================================================
// Grounding & Refinement Engine
// =============================================================================

function sanitizeString(val: unknown, fallback: string): string {
  if (typeof val === 'string' && val.trim().length > 0) {
    return val.trim();
  }
  return fallback;
}

function sanitizeStringArray(val: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(val)) {
    return val
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  }
  return fallback;
}

function groundFilePath(
  rawPath: string | undefined,
  filesMap: Map<string, RepoFileRecord>,
  basenameMap: Map<string, RepoFileRecord>
): string | null {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const clean = rawPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();

  // 1. Direct path match
  if (filesMap.has(clean)) {
    return clean;
  }

  // 2. Basename match
  const base = clean.split('/').pop();
  if (base && basenameMap.has(base)) {
    return basenameMap.get(base)!.path;
  }

  // 3. Suffix / Subpath match
  for (const candidatePath of filesMap.keys()) {
    if (candidatePath.endsWith(clean) || clean.endsWith(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

/**
 * Validates, grounds, and refines the LLM response against real repository files
 * and topological constraints.
 */
function refineAndGroundBlueprint(
  raw: GeminiArchitectResponse,
  deterministic: VisualAtlasBlueprint
): {
  headline: string;
  oneLiner: string;
  architecturePattern: string;
  techStackBadges: string[];
  subsystems: SubsystemCluster[];
  nodes: AtlasNode[];
  edges: AtlasEdge[];
} {
  // 1. File index maps for strict physical grounding
  const filesMap = new Map<string, RepoFileRecord>();
  const basenameMap = new Map<string, RepoFileRecord>();

  for (const f of deterministic.files) {
    filesMap.set(f.path, f);
    const base = f.path.split('/').pop();
    if (base && !basenameMap.has(base)) {
      basenameMap.set(base, f);
    }
  }

  // 2. Headline & Overview Refinement
  const headline = sanitizeString(raw.headline, deterministic.headline);
  const oneLiner = sanitizeString(raw.oneLiner, deterministic.oneLiner);
  const architecturePattern = sanitizeString(
    raw.architecturePattern,
    deterministic.architecturePattern
  );

  const rawBadges = sanitizeStringArray(raw.techStackBadges);
  const techStackBadges =
    rawBadges.length > 0 ? Array.from(new Set(rawBadges)).slice(0, 10) : deterministic.techStackBadges;

  // 3. Subsystem Refinement (Target: 4-7 subsystems)
  const refinedSubsystems: SubsystemCluster[] = [];
  const validSubsystemIds = new Set<string>();

  const rawSubsystems = Array.isArray(raw.subsystems) ? raw.subsystems : [];

  rawSubsystems.forEach((sub, idx) => {
    if (refinedSubsystems.length >= 7) return;

    const id = sanitizeString(
      sub.id,
      `subsystem-${idx + 1}`
    ).toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    if (validSubsystemIds.has(id)) return;

    const layer: ArchitectureLayer =
      sub.layer && VALID_LAYERS.has(sub.layer as ArchitectureLayer)
        ? (sub.layer as ArchitectureLayer)
        : 'domain';

    const rawFiles = sanitizeStringArray(sub.filePaths);
    const groundedFilePaths = Array.from(
      new Set(
        rawFiles
          .map((p) => groundFilePath(p, filesMap, basenameMap))
          .filter((p): p is string => Boolean(p))
      )
    );

    const rawEntries = sanitizeStringArray(sub.entrypointPaths);
    const groundedEntries = Array.from(
      new Set(
        rawEntries
          .map((p) => groundFilePath(p, filesMap, basenameMap))
          .filter((p): p is string => Boolean(p))
      )
    );

    const summaryBullets = sanitizeStringArray(sub.summaryBullets);
    const invariants = sanitizeStringArray(sub.invariants);

    const color = SUBSYSTEM_PALETTE[refinedSubsystems.length % SUBSYSTEM_PALETTE.length];

    refinedSubsystems.push({
      id,
      name: sanitizeString(sub.name, `Subsystem ${refinedSubsystems.length + 1}`),
      tagline: sanitizeString(sub.tagline, 'Core architectural component.'),
      layer,
      color,
      nodeIds: [],
      filePaths: groundedFilePaths,
      entrypointPaths: groundedEntries,
      totalTokens: groundedFilePaths.reduce(
        (sum, p) => sum + (filesMap.get(p)?.estimatedTokens ?? 0),
        0
      ),
      summaryBullets: summaryBullets.length > 0 ? summaryBullets.slice(0, 4) : ['Key subsystem responsibilities.'],
      invariants: invariants.length > 0 ? invariants.slice(0, 3) : ['Maintains modular boundary.'],
    });

    validSubsystemIds.add(id);
  });

  // Ensure 4 to 7 subsystems by supplementing from deterministic blueprint if needed
  if (refinedSubsystems.length < 4 && deterministic.subsystems.length > 0) {
    for (const detSub of deterministic.subsystems) {
      if (refinedSubsystems.length >= 4) break;
      if (!validSubsystemIds.has(detSub.id)) {
        const color = SUBSYSTEM_PALETTE[refinedSubsystems.length % SUBSYSTEM_PALETTE.length];
        refinedSubsystems.push({
          ...detSub,
          color,
          nodeIds: [],
        });
        validSubsystemIds.add(detSub.id);
      }
    }
  }

  // Fallback to deterministic subsystems if empty
  if (refinedSubsystems.length === 0) {
    deterministic.subsystems.slice(0, 7).forEach((sub, idx) => {
      const color = SUBSYSTEM_PALETTE[idx % SUBSYSTEM_PALETTE.length];
      refinedSubsystems.push({
        ...sub,
        color,
        nodeIds: [],
      });
      validSubsystemIds.add(sub.id);
    });
  }

  const primarySubsystemId = refinedSubsystems[0]?.id || 'subsystem-core';

  // 4. Grounded Atlas Nodes Refinement (Target: 8-18 nodes)
  const refinedNodes: AtlasNode[] = [];
  const assignedNodeIds = new Set<string>();
  const assignedPrimaryFiles = new Set<string>();

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];

  for (let i = 0; i < rawNodes.length && refinedNodes.length < 18; i++) {
    const rawNode = rawNodes[i];
    const candidatePrimary = groundFilePath(rawNode.primaryFile, filesMap, basenameMap);

    if (!candidatePrimary) {
      continue;
    }

    if (assignedPrimaryFiles.has(candidatePrimary)) {
      continue;
    }

    const fileRecord = filesMap.get(candidatePrimary)!;
    assignedPrimaryFiles.add(candidatePrimary);

    let id = sanitizeString(rawNode.id, `node-${candidatePrimary.replace(/[^a-zA-Z0-9_-]/g, '_')}`)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');

    if (assignedNodeIds.has(id)) {
      id = `${id}-${i + 1}`;
    }
    assignedNodeIds.add(id);

    // Ground related filePaths
    const rawFiles = sanitizeStringArray(rawNode.filePaths);
    const relatedFiles = Array.from(
      new Set(
        [
          candidatePrimary,
          ...rawFiles
            .map((p) => groundFilePath(p, filesMap, basenameMap))
            .filter((p): p is string => Boolean(p)),
        ]
      )
    );

    // Resolve subsystem
    let subId = rawNode.subsystemId && validSubsystemIds.has(rawNode.subsystemId)
      ? rawNode.subsystemId
      : primarySubsystemId;

    // Resolve architectural layer
    const layer: ArchitectureLayer =
      rawNode.layer && VALID_LAYERS.has(rawNode.layer as ArchitectureLayer)
        ? (rawNode.layer as ArchitectureLayer)
        : fileRecord.layer;

    // Resolve kind
    const kind: AtlasNode['kind'] =
      rawNode.kind && VALID_NODE_KINDS.has(rawNode.kind as AtlasNode['kind'])
        ? (rawNode.kind as AtlasNode['kind'])
        : fileRecord.layer === 'client'
        ? 'ui'
        : fileRecord.layer === 'edge'
        ? 'api'
        : fileRecord.layer === 'orchestration'
        ? 'pipeline'
        : 'module';

    const label = sanitizeString(rawNode.label, fileRecord.name);
    const subtitle = sanitizeString(rawNode.subtitle, `${fileRecord.layer} · ${fileRecord.name}`);
    const visualBrief = sanitizeString(
      rawNode.visualBrief,
      `Core ${fileRecord.name} component in the ${layer} layer.`
    );

    const keySymbols = sanitizeStringArray(rawNode.keySymbols);
    const fallbackSymbols = fileRecord.symbols.slice(0, 6).map((s) => s.name);
    const resolvedSymbols = keySymbols.length > 0 ? keySymbols.slice(0, 8) : fallbackSymbols;

    const inputs = sanitizeStringArray(rawNode.inputs);
    const outputs = sanitizeStringArray(rawNode.outputs);

    const estimatedTokens = relatedFiles.reduce(
      (sum, p) => sum + (filesMap.get(p)?.estimatedTokens ?? 0),
      0
    );

    refinedNodes.push({
      id,
      label,
      subtitle,
      subsystemId: subId,
      layer,
      kind,
      filePaths: relatedFiles,
      primaryFile: candidatePrimary,
      lineStart: 1,
      lineEnd: fileRecord.lineCount,
      estimatedTokens,
      centrality: fileRecord.centrality,
      fanIn: fileRecord.fanIn,
      fanOut: fileRecord.fanOut,
      keySymbols: resolvedSymbols,
      visualBrief,
      inputs: inputs.length > 0 ? inputs.slice(0, 4) : ['Data or invocation from caller.'],
      outputs: outputs.length > 0 ? outputs.slice(0, 4) : ['Processed signals or contracts.'],
    });
  }

  // If fewer than 8 nodes and more files are available, backfill from deterministic nodes
  const minTargetNodes = Math.min(8, deterministic.files.length);

  if (refinedNodes.length < minTargetNodes && deterministic.nodes.length > 0) {
    for (const detNode of deterministic.nodes) {
      if (refinedNodes.length >= 18 || refinedNodes.length >= minTargetNodes) break;
      if (!assignedPrimaryFiles.has(detNode.primaryFile) && filesMap.has(detNode.primaryFile)) {
        let id = detNode.id;
        if (assignedNodeIds.has(id)) {
          id = `det-${id}`;
        }
        assignedNodeIds.add(id);
        assignedPrimaryFiles.add(detNode.primaryFile);

        const subId = validSubsystemIds.has(detNode.subsystemId)
          ? detNode.subsystemId
          : primarySubsystemId;

        refinedNodes.push({
          ...detNode,
          id,
          subsystemId: subId,
        });
      }
    }
  }

  // Fallback to deterministic nodes if empty
  if (refinedNodes.length === 0) {
    deterministic.nodes.slice(0, 18).forEach((node) => {
      refinedNodes.push(node);
      assignedNodeIds.add(node.id);
    });
  }

  // Update subsystem node associations and file lists
  const nodeIdsBySubsystem = new Map<string, string[]>();
  for (const node of refinedNodes) {
    const list = nodeIdsBySubsystem.get(node.subsystemId) || [];
    list.push(node.id);
    nodeIdsBySubsystem.set(node.subsystemId, list);
  }

  for (const sub of refinedSubsystems) {
    sub.nodeIds = nodeIdsBySubsystem.get(sub.id) || [];
    // Ensure all node primaryFiles are in subsystem filePaths
    const subFiles = new Set(sub.filePaths);
    for (const nodeId of sub.nodeIds) {
      const node = refinedNodes.find((n) => n.id === nodeId);
      if (node) {
        subFiles.add(node.primaryFile);
        for (const fp of node.filePaths) {
          subFiles.add(fp);
        }
      }
    }
    sub.filePaths = Array.from(subFiles);
    sub.totalTokens = sub.filePaths.reduce(
      (sum, p) => sum + (filesMap.get(p)?.estimatedTokens ?? 0),
      0
    );
  }

  // Apply visual-first coordinates
  applyVisualCanvasLayout(refinedNodes);

  // 5. Semantic Edges Refinement
  const refinedEdges: AtlasEdge[] = [];
  const edgeKeys = new Set<string>();

  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];

  for (let i = 0; i < rawEdges.length; i++) {
    const edge = rawEdges[i];
    const source = edge.source?.trim();
    const target = edge.target?.trim();

    if (!source || !target || source === target) continue;
    if (!assignedNodeIds.has(source) || !assignedNodeIds.has(target)) continue;

    const key = `${source}->${target}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);

    const kind: AtlasEdge['kind'] =
      edge.kind && VALID_EDGE_KINDS.has(edge.kind as AtlasEdge['kind'])
        ? (edge.kind as AtlasEdge['kind'])
        : 'dependency';

    const label = sanitizeString(edge.label, 'connects to');
    const weight = typeof edge.weight === 'number' && Number.isFinite(edge.weight)
      ? Math.max(1, Math.min(5, Math.round(edge.weight)))
      : 1;

    refinedEdges.push({
      id: sanitizeString(edge.id, `edge-${source}-${target}`),
      source,
      target,
      label,
      kind,
      protocol: edge.protocol ? sanitizeString(edge.protocol, '') : undefined,
      weight,
      isHotPath: Boolean(edge.isHotPath),
    });
  }

  // If too few edges, augment from deterministic edges to maintain graph connectivity
  if (refinedEdges.length < Math.min(4, refinedNodes.length - 1)) {
    const primaryFileToNodeId = new Map<string, string>();
    for (const n of refinedNodes) {
      primaryFileToNodeId.set(n.primaryFile, n.id);
    }

    for (const detEdge of deterministic.edges) {
      const sourceNode = deterministic.nodes.find((n) => n.id === detEdge.source);
      const targetNode = deterministic.nodes.find((n) => n.id === detEdge.target);

      if (sourceNode && targetNode) {
        const source = primaryFileToNodeId.get(sourceNode.primaryFile);
        const target = primaryFileToNodeId.get(targetNode.primaryFile);

        if (source && target && source !== target) {
          const key = `${source}->${target}`;
          if (!edgeKeys.has(key)) {
            edgeKeys.add(key);
            refinedEdges.push({
              id: `edge-${source}-${target}`,
              source,
              target,
              label: detEdge.label || 'depends on',
              kind: detEdge.kind || 'dependency',
              weight: detEdge.weight || 1,
              isHotPath: Boolean(detEdge.isHotPath),
            });
          }
        }
      }
    }
  }

  return {
    headline,
    oneLiner,
    architecturePattern,
    techStackBadges,
    subsystems: refinedSubsystems,
    nodes: refinedNodes,
    edges: refinedEdges,
  };
}

// =============================================================================
// Prompt Compiler
// =============================================================================

function compileArchitectPrompt(blueprint: VisualAtlasBlueprint): string {
  const { metadata, stats, headline, oneLiner, architecturePattern, techStackBadges } = blueprint;

  // Select top files for context grounding
  const topFiles = blueprint.files
    .slice()
    .sort((a, b) => {
      // Prioritize entrypoints, high centrality, high fanIn
      const scoreA = (a.isEntrypoint ? 2 : 0) + a.centrality * 2 + Math.min(2, a.fanIn / 5);
      const scoreB = (b.isEntrypoint ? 2 : 0) + b.centrality * 2 + Math.min(2, b.fanIn / 5);
      return scoreB - scoreA;
    })
    .slice(0, 60);

  const fileLines = topFiles.map((f) => {
    const syms = f.symbols.slice(0, 4).map((s) => s.name).join(', ');
    const symDesc = syms ? ` exports: [${syms}]` : '';
    const entryDesc = f.isEntrypoint ? ' [ENTRYPOINT]' : '';
    return `- ${f.path} (${f.layer}, ${f.lineCount} lines, ${f.estimatedTokens} tok)${entryDesc}${symDesc}`;
  });

  const allFilePaths = blueprint.files.slice(0, 200).map((f) => f.path);

  return `You are Gemini 4 Carbon, an elite Principal Software Systems Architect.
Perform visual architectural synthesis on this codebase.

Visual-first philosophy: "No one reads code anymore — MORE VISUALS."
Synthesize a crystal-clear, structural mental model of the repository with:
1. headline: High-impact, punchy title.
2. oneLiner: One clear sentence explaining what the system does and how.
3. architecturePattern: Precise overarching pattern (e.g. "Edge-First Next.js 15 + Cloud Run Gemini 4 Intelligence Mesh").
4. techStackBadges: 4-8 core technologies, frameworks, and libraries.
5. subsystems: EXACTLY 4 to 7 high-level subsystems partitioning the codebase.
   - id: kebab-case unique ID
   - name: Descriptive title
   - tagline: Concise functional tagline
   - layer: One of "client" | "edge" | "orchestration" | "domain" | "infrastructure" | "data" | "tooling"
   - filePaths: Array of real file paths belonging to this subsystem
   - entrypointPaths: Primary entry files
   - summaryBullets: 2-4 key architectural responsibilities
   - invariants: 2-3 architectural invariants/guarantees
6. nodes: EXACTLY 8 to 18 critical visual architectural nodes.
   - id: kebab-case unique ID (e.g. "client-pool", "ast-parser", "studio-canvas")
   - label: Human-readable name (2-4 words)
   - subtitle: Role or responsibility summary
   - subsystemId: Must reference one of the subsystem IDs above
   - layer: One of "client" | "edge" | "orchestration" | "domain" | "infrastructure" | "data" | "tooling"
   - kind: One of "service" | "module" | "ui" | "api" | "store" | "agent" | "pipeline" | "external" | "config"
   - primaryFile: EXACT real file path from the repository files list (MUST be an exact match)
   - filePaths: Array of real file paths associated with this node (primaryFile first)
   - keySymbols: Notable exported symbols, classes, or methods
   - visualBrief: 1-2 sentence visual summary of its role in the architecture
   - inputs: Key inputs/triggers
   - outputs: Key outputs/artifacts
7. edges: Directed semantic relationships between nodes.
   - id: "edge-source-target"
   - source: Source node ID
   - target: Target node ID
   - label: Active semantic verb phrase (e.g. "streams tokens to", "compiles AST for", "persists cache to")
   - kind: One of "data" | "control" | "http" | "stream" | "storage" | "dependency"
   - protocol: Optional protocol (e.g. "HTTP", "WebSocket", "IPC", "ESM")
   - weight: 1 to 5
   - isHotPath: boolean (true if on primary critical path)

REPOSITORY CONTEXT:
- Repo: ${metadata.fullName || metadata.name || blueprint.repoId}
- Description: ${metadata.description || 'No description provided.'}
- Primary Language: ${metadata.primaryLanguage || 'Unknown'}
- Stats: ${stats.totalFiles} files, ${stats.totalLines} lines, ${stats.totalTokens} tokens, ${stats.circularDeps} circular dependencies.
- Current Headline: ${headline}
- Current One-Liner: ${oneLiner}
- Current Architecture Pattern: ${architecturePattern}
- Tech Stack: ${techStackBadges.join(', ')}

KEY CODEBASE FILES & AST SIGNALS:
${fileLines.join('\n')}

VALID REPOSITORY FILE PATHS (ground your nodes strictly to paths in this list):
${allFilePaths.join('\n')}

CRITICAL GROUNDING RULES:
- Every node's primaryFile MUST be an exact path from the valid repository file paths list.
- Do NOT hallucinate non-existent files.
- Return pure valid JSON only conforming to the schema.`;
}

// =============================================================================
// Primary Synthesis Export
// =============================================================================

/**
 * Synthesizes and enriches a VisualAtlasBlueprint using Gemini 4 Carbon.
 *
 * Dispatches via `withV1Client` using `client.interactions.create` with
 * `thinking_level: 'medium'` and strict JSON response mode.
 *
 * Refines:
 * - headline, oneLiner, architecturePattern, techStackBadges
 * - subsystems (4 to 7 partitioned clusters)
 * - nodes (8 to 18 grounded to real repository file paths)
 * - semantic directed edges with hot-path flags
 * - rebuilds 3D strata layers
 *
 * Falls back cleanly and safely to the deterministic blueprint on any error or missing credentials.
 *
 * @param blueprint Deterministic or initial VisualAtlasBlueprint.
 * @param options Optional BYOK API key and model override.
 * @returns Refined and enriched VisualAtlasBlueprint.
 */
export async function synthesizeVisualAtlas(
  blueprint: VisualAtlasBlueprint,
  options?: SynthesizeVisualAtlasOptions
): Promise<VisualAtlasBlueprint> {
  const startTime = Date.now();
  const model = options?.modelOverride || ENV.GEMINI_MODEL_ARCHITECT || 'gemini-4-carbon';

  // Check if credentials exist before initiating network calls
  if (!hasGeminiCredentials(options?.byokApiKey)) {
    console.warn(
      '[atlasArchitect] No Gemini API credentials configured. Returning deterministic blueprint.'
    );
    return blueprint;
  }

  try {
    const prompt = compileArchitectPrompt(blueprint);

    const rawResponse = await withV1Client(async (client) => {
      // client.interactions.create on v1 for Gemini 4 models
      // thinking_level: 'medium', NO temperature / top_p per Gemini 4 architecture rules
      const interaction = await (client.interactions as any).create({
        model,
        input: prompt,
        generation_config: {
          thinking_level: 'medium',
        },
        response_mime_type: 'application/json',
      });

      return interaction;
    }, options?.byokApiKey);

    const responseText = extractInteractionText(rawResponse);

    if (!responseText) {
      console.warn(
        '[atlasArchitect] Empty response text received from Gemini interaction. Falling back to deterministic blueprint.'
      );
      return blueprint;
    }

    const parsedJson = extractJsonObject<GeminiArchitectResponse>(responseText);

    if (!parsedJson) {
      console.warn(
        '[atlasArchitect] Failed to extract valid JSON from Gemini architect response. Falling back to deterministic blueprint.'
      );
      return blueprint;
    }

    // Refine and ground all entities against real repository files
    const refined = refineAndGroundBlueprint(parsedJson, blueprint);

    // Rebuild 3D strata layers based on refined nodes and all files
    const rebuiltStrata = rebuildStrata(blueprint.files, refined.nodes);

    const aiSynthesisLatencyMs = Date.now() - startTime;

    const modelsUsed = Array.from(new Set([...blueprint.modelsUsed, model]));

    const enrichedBlueprint: VisualAtlasBlueprint = {
      ...blueprint,
      headline: refined.headline,
      oneLiner: refined.oneLiner,
      architecturePattern: refined.architecturePattern,
      techStackBadges: refined.techStackBadges,
      subsystems: refined.subsystems,
      nodes: refined.nodes,
      edges: refined.edges,
      strata: rebuiltStrata,
      aiEnriched: true,
      modelsUsed,
      stats: {
        ...blueprint.stats,
        aiSynthesisLatencyMs,
      },
      generatedAt: new Date().toISOString(),
    };

    return enrichedBlueprint;
  } catch (err: unknown) {
    console.warn(
      '[atlasArchitect] Error during Gemini 4 Carbon visual atlas synthesis. Falling back cleanly to deterministic blueprint. Details:',
      err instanceof Error ? err.message : String(err)
    );
    return blueprint;
  }
}
