// =============================================================================
// GitUnderstand (git-understand.com) — Gemini 4 Neon Flow Choreographer
// Visual-first execution flow synthesis & 5-stop architectural Codemap Tour.
// "No one reads code anymore — MORE VISUALS."
// =============================================================================

import { ENV } from '../config/env.js';
import { withV1Client, hasGeminiCredentials } from './clientPool.js';
import { extractJsonObject, extractInteractionText } from './mediaUtils.js';
import type {
  VisualAtlasBlueprint,
  ExecutionFlow,
  ExecutionFlowStep,
  CodemapTourStop,
  VisualLensId,
  AtlasNode,
  ArchitectureLayer,
} from '../../../shared/types.js';

export const CHOREOGRAPHER_MODEL = ENV.GEMINI_MODEL_VISUAL || 'gemini-4-neon';

const VALID_CATEGORIES: ReadonlySet<ExecutionFlow['category']> = new Set([
  'request',
  'ingestion',
  'ai_pipeline',
  'auth',
  'state',
  'build',
]);

const VALID_LENSES: ReadonlySet<VisualLensId> = new Set([
  'atlas',
  'strata3d',
  'flows',
  'treemap',
  'xray',
  'mermaid',
  'media',
]);

interface RawStep {
  stepNumber?: number;
  title?: string;
  action?: string;
  fromNodeId?: string;
  toNodeId?: string;
  edgeLabel?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  codeExcerpt?: string;
  dataPayload?: string;
}

interface RawFlow {
  id?: string;
  title?: string;
  subtitle?: string;
  trigger?: string;
  category?: string;
  steps?: RawStep[];
}

interface RawTourStop {
  id?: string;
  order?: number;
  title?: string;
  visualHook?: string;
  explanation?: string;
  focusNodeId?: string;
  highlightNodeIds?: string[];
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  recommendedLens?: string;
}

interface RawChoreographyResponse {
  flows?: RawFlow[];
  codemapTour?: RawTourStop[];
}

/**
 * Builds resilient lookup indexes for atlas nodes to validate and resolve LLM-generated IDs.
 */
function createNodeResolver(nodes: AtlasNode[]) {
  const nodeById = new Map<string, AtlasNode>();
  const nodeByNormalizedLabel = new Map<string, AtlasNode>();
  const nodeByFilePath = new Map<string, AtlasNode>();
  const nodeByBasename = new Map<string, AtlasNode>();

  for (const node of nodes) {
    nodeById.set(node.id, node);
    nodeByNormalizedLabel.set(node.label.trim().toLowerCase(), node);
    if (node.primaryFile) {
      const normalizedPath = node.primaryFile.trim().toLowerCase();
      nodeByFilePath.set(normalizedPath, node);
      const segments = normalizedPath.split('/');
      const basename = segments[segments.length - 1];
      if (basename) {
        nodeByBasename.set(basename, node);
      }
    }
  }

  // Pre-sort nodes by architectural hierarchy and centrality for optimal fallbacks
  const sortedByCentrality = [...nodes].sort((a, b) => (b.centrality ?? 0) - (a.centrality ?? 0));

  const defaultNode: AtlasNode = sortedByCentrality[0] ?? {
    id: 'node-root',
    label: 'Root Entrypoint',
    subtitle: 'System entrypoint module',
    subsystemId: 'subsystem-core',
    layer: 'orchestration',
    kind: 'module',
    filePaths: [],
    primaryFile: 'index.ts',
    estimatedTokens: 100,
    centrality: 1,
    fanIn: 0,
    fanOut: 0,
    keySymbols: [],
    visualBrief: 'Root entrypoint for application execution',
    inputs: [],
    outputs: [],
  };

  function resolveNode(rawId: unknown, fallback?: AtlasNode): AtlasNode {
    if (typeof rawId === 'string') {
      const clean = rawId.trim();
      if (nodeById.has(clean)) {
        return nodeById.get(clean)!;
      }
      const lower = clean.toLowerCase();
      if (nodeByNormalizedLabel.has(lower)) {
        return nodeByNormalizedLabel.get(lower)!;
      }
      if (nodeByFilePath.has(lower)) {
        return nodeByFilePath.get(lower)!;
      }
      const segments = lower.split('/');
      const basename = segments[segments.length - 1];
      if (basename && nodeByBasename.has(basename)) {
        return nodeByBasename.get(basename)!;
      }
      for (const [id, node] of nodeById) {
        if (id.toLowerCase().includes(lower) || lower.includes(id.toLowerCase())) {
          return node;
        }
      }
    }
    return fallback ?? defaultNode;
  }

  return {
    nodeById,
    resolveNode,
    defaultNode,
    sortedByCentrality,
  };
}

/**
 * Validates and normalizes flow steps against the blueprint's verified nodes.
 */
function sanitizeFlows(
  rawFlows: RawFlow[] | undefined,
  nodes: AtlasNode[],
  resolver: ReturnType<typeof createNodeResolver>
): ExecutionFlow[] {
  if (!rawFlows || !Array.isArray(rawFlows) || rawFlows.length === 0) {
    return [];
  }

  const sanitized: ExecutionFlow[] = [];

  for (let fIdx = 0; fIdx < rawFlows.length; fIdx++) {
    const rawFlow = rawFlows[fIdx];
    if (!rawFlow || typeof rawFlow !== 'object') continue;

    const category: ExecutionFlow['category'] =
      rawFlow.category && VALID_CATEGORIES.has(rawFlow.category as ExecutionFlow['category'])
        ? (rawFlow.category as ExecutionFlow['category'])
        : 'request';

    const flowId =
      typeof rawFlow.id === 'string' && rawFlow.id.trim()
        ? rawFlow.id.trim()
        : `flow-${fIdx + 1}-${category}`;

    const title =
      typeof rawFlow.title === 'string' && rawFlow.title.trim()
        ? rawFlow.title.trim()
        : `Execution Flow ${fIdx + 1}`;

    const subtitle =
      typeof rawFlow.subtitle === 'string' && rawFlow.subtitle.trim()
        ? rawFlow.subtitle.trim()
        : `End-to-end data transmission across architecture layers`;

    const trigger =
      typeof rawFlow.trigger === 'string' && rawFlow.trigger.trim()
        ? rawFlow.trigger.trim()
        : 'Incoming system invocation or client interaction';

    const rawSteps = Array.isArray(rawFlow.steps) ? rawFlow.steps : [];
    const sanitizedSteps: ExecutionFlowStep[] = [];

    let prevToNode: AtlasNode = resolver.defaultNode;

    for (let sIdx = 0; sIdx < rawSteps.length; sIdx++) {
      const step = rawSteps[sIdx];
      if (!step || typeof step !== 'object') continue;

      const fromNode = resolver.resolveNode(step.fromNodeId, sIdx === 0 ? undefined : prevToNode);
      const toNode = resolver.resolveNode(
        step.toNodeId,
        nodes.find((n) => n.id !== fromNode.id) ?? fromNode
      );
      prevToNode = toNode;

      const stepFilePath =
        typeof step.filePath === 'string' && step.filePath.trim()
          ? step.filePath.trim()
          : fromNode.primaryFile || toNode.primaryFile || 'index.ts';

      const lineStart =
        typeof step.lineStart === 'number' && Number.isFinite(step.lineStart) && step.lineStart > 0
          ? Math.floor(step.lineStart)
          : fromNode.lineStart ?? 1;

      const lineEnd =
        typeof step.lineEnd === 'number' && Number.isFinite(step.lineEnd) && step.lineEnd >= lineStart
          ? Math.floor(step.lineEnd)
          : fromNode.lineEnd ?? (lineStart + 25);

      const titleStep =
        typeof step.title === 'string' && step.title.trim()
          ? step.title.trim()
          : `Step ${sIdx + 1}: ${fromNode.label} → ${toNode.label}`;

      const action =
        typeof step.action === 'string' && step.action.trim()
          ? step.action.trim()
          : `Data and control pass from ${fromNode.label} to ${toNode.label}`;

      const edgeLabel =
        typeof step.edgeLabel === 'string' && step.edgeLabel.trim()
          ? step.edgeLabel.trim()
          : 'dispatch';

      sanitizedSteps.push({
        stepNumber: sanitizedSteps.length + 1,
        title: titleStep,
        action,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        edgeLabel,
        filePath: stepFilePath,
        lineStart,
        lineEnd,
        codeExcerpt: typeof step.codeExcerpt === 'string' ? step.codeExcerpt.trim() : undefined,
        dataPayload: typeof step.dataPayload === 'string' ? step.dataPayload.trim() : undefined,
      });
    }

    if (sanitizedSteps.length >= 2) {
      sanitized.push({
        id: flowId,
        title,
        subtitle,
        trigger,
        category,
        steps: sanitizedSteps,
      });
    }
  }

  return sanitized;
}

/**
 * Validates and normalizes 5-stop Codemap Tour stops with strictly valid node IDs.
 */
function sanitizeCodemapTour(
  rawStops: RawTourStop[] | undefined,
  resolver: ReturnType<typeof createNodeResolver>
): CodemapTourStop[] {
  if (!rawStops || !Array.isArray(rawStops) || rawStops.length === 0) {
    return [];
  }

  const defaultLenses: VisualLensId[] = ['atlas', 'strata3d', 'flows', 'xray', 'treemap'];
  const sanitized: CodemapTourStop[] = [];

  for (let idx = 0; idx < rawStops.length; idx++) {
    const rawStop = rawStops[idx];
    if (!rawStop || typeof rawStop !== 'object') continue;

    const fallbackLens = defaultLenses[idx % defaultLenses.length] ?? 'atlas';
    const recommendedLens: VisualLensId =
      rawStop.recommendedLens && VALID_LENSES.has(rawStop.recommendedLens as VisualLensId)
        ? (rawStop.recommendedLens as VisualLensId)
        : fallbackLens;

    const focusNode = resolver.resolveNode(rawStop.focusNodeId);

    // Filter and sanitize highlightNodeIds ensuring all point to valid nodes
    const rawHighlights = Array.isArray(rawStop.highlightNodeIds) ? rawStop.highlightNodeIds : [];
    const validHighlightSet = new Set<string>();

    for (const rawHL of rawHighlights) {
      const hlNode = resolver.resolveNode(rawHL);
      if (hlNode.id !== focusNode.id && resolver.nodeById.has(hlNode.id)) {
        validHighlightSet.add(hlNode.id);
      }
    }

    // If highlights are empty, find candidate neighbors from sorted nodes
    if (validHighlightSet.size === 0) {
      for (const candidate of resolver.sortedByCentrality) {
        if (candidate.id !== focusNode.id) {
          validHighlightSet.add(candidate.id);
          if (validHighlightSet.size >= 2) break;
        }
      }
    }

    const stopId =
      typeof rawStop.id === 'string' && rawStop.id.trim()
        ? rawStop.id.trim()
        : `tour-stop-${idx + 1}`;

    const title =
      typeof rawStop.title === 'string' && rawStop.title.trim()
        ? rawStop.title.trim()
        : `Stop ${idx + 1}: ${focusNode.label}`;

    const visualHook =
      typeof rawStop.visualHook === 'string' && rawStop.visualHook.trim()
        ? rawStop.visualHook.trim()
        : `Inspect ${focusNode.label} in the ${recommendedLens} visual lens`;

    const explanation =
      typeof rawStop.explanation === 'string' && rawStop.explanation.trim()
        ? rawStop.explanation.trim()
        : focusNode.visualBrief || `Key architectural anchor within the ${focusNode.layer} layer`;

    const filePath =
      typeof rawStop.filePath === 'string' && rawStop.filePath.trim()
        ? rawStop.filePath.trim()
        : focusNode.primaryFile || 'index.ts';

    const lineStart =
      typeof rawStop.lineStart === 'number' && Number.isFinite(rawStop.lineStart) && rawStop.lineStart > 0
        ? Math.floor(rawStop.lineStart)
        : focusNode.lineStart ?? 1;

    const lineEnd =
      typeof rawStop.lineEnd === 'number' && Number.isFinite(rawStop.lineEnd) && rawStop.lineEnd >= lineStart
        ? Math.floor(rawStop.lineEnd)
        : focusNode.lineEnd ?? (lineStart + 35);

    sanitized.push({
      id: stopId,
      order: sanitized.length + 1,
      title,
      visualHook,
      explanation,
      focusNodeId: focusNode.id,
      highlightNodeIds: Array.from(validHighlightSet),
      filePath,
      lineStart,
      lineEnd,
      recommendedLens,
    });
  }

  return sanitized;
}

/**
 * Synthesizes deterministic fallback flows and tour stops directly from blueprint topology.
 */
function createDeterministicFallback(blueprint: VisualAtlasBlueprint): {
  flows: ExecutionFlow[];
  codemapTour: CodemapTourStop[];
} {
  const nodes = blueprint.nodes ?? [];
  const edges = blueprint.edges ?? [];
  const resolver = createNodeResolver(nodes);

  // If blueprint already has rich verified flows from graphBuilder, validate & retain them
  const existingFlows = sanitizeFlows(blueprint.flows, nodes, resolver);
  const existingTour = sanitizeCodemapTour(blueprint.codemapTour, resolver);

  if (existingFlows.length >= 2 && existingTour.length >= 3) {
    return {
      flows: existingFlows,
      codemapTour: existingTour,
    };
  }

  // Synthesize deterministic flows along layer gradients (client/edge -> orchestration/domain -> data)
  const layerRanking: Record<ArchitectureLayer, number> = {
    client: 0,
    edge: 1,
    orchestration: 2,
    domain: 3,
    infrastructure: 4,
    data: 5,
    tooling: 6,
  };

  const sortedNodes = [...nodes].sort((a, b) => {
    const rankDiff = layerRanking[a.layer] - layerRanking[b.layer];
    if (rankDiff !== 0) return rankDiff;
    return (b.centrality ?? 0) - (a.centrality ?? 0);
  });

  const flows: ExecutionFlow[] = [...existingFlows];

  if (flows.length < 2 && sortedNodes.length >= 2) {
    const chain1 = sortedNodes.slice(0, Math.min(sortedNodes.length, 4));
    if (chain1.length >= 2) {
      const steps1: ExecutionFlowStep[] = [];
      for (let i = 0; i < chain1.length - 1; i++) {
        const from = chain1[i];
        const to = chain1[i + 1];
        const edge = edges.find((e) => e.source === from.id && e.target === to.id);
        steps1.push({
          stepNumber: i + 1,
          title: `Dispatch: ${from.label} → ${to.label}`,
          action: `${from.label} processes input payload and invokes ${to.label}`,
          fromNodeId: from.id,
          toNodeId: to.id,
          edgeLabel: edge?.label || 'forward',
          filePath: from.primaryFile || to.primaryFile || 'index.ts',
          lineStart: from.lineStart ?? 1,
          lineEnd: from.lineEnd ?? 30,
          dataPayload: edge?.protocol ? `{ protocol: "${edge.protocol}" }` : undefined,
        });
      }
      flows.unshift({
        id: 'flow-primary-lifecycle',
        title: 'Primary Ingress & Control Pipeline',
        subtitle: 'End-to-end execution path from perimeter surface to core business domain',
        trigger: 'System invocation or incoming API request',
        category: 'request',
        steps: steps1,
      });
    }

    if (flows.length < 2 && sortedNodes.length >= 3) {
      const chain2 = [
        sortedNodes[sortedNodes.length - 1],
        sortedNodes[Math.floor(sortedNodes.length / 2)],
        sortedNodes[0],
      ].filter(Boolean);

      const steps2: ExecutionFlowStep[] = [];
      for (let i = 0; i < chain2.length - 1; i++) {
        const from = chain2[i];
        const to = chain2[i + 1];
        steps2.push({
          stepNumber: i + 1,
          title: `State Transition: ${from.label} → ${to.label}`,
          action: `Synchronizes system state and invalidates caches between ${from.label} and ${to.label}`,
          fromNodeId: from.id,
          toNodeId: to.id,
          edgeLabel: 'state_sync',
          filePath: from.primaryFile || 'index.ts',
          lineStart: from.lineStart ?? 1,
          lineEnd: from.lineEnd ?? 40,
        });
      }

      flows.push({
        id: 'flow-domain-state-sync',
        title: 'Domain State Propagation & Sync',
        subtitle: 'Data flow cycle updating downstream stores and emitting telemetry events',
        trigger: 'Domain state mutation or database write operation',
        category: 'state',
        steps: steps2,
      });
    }
  }

  // Synthesize 5-stop Codemap Tour if insufficient
  const codemapTour: CodemapTourStop[] = [...existingTour];

  if (codemapTour.length < 3) {
    const stopsDef: Array<{
      order: number;
      title: string;
      visualHook: string;
      lens: VisualLensId;
      predicate: (n: AtlasNode) => boolean;
    }> = [
      {
        order: 1,
        title: 'Ingress & Perimeter Boundary',
        visualHook: 'Entrypoints routing external traffic into the core architecture',
        lens: 'atlas',
        predicate: (n) => n.layer === 'edge' || n.layer === 'client' || n.kind === 'api',
      },
      {
        order: 2,
        title: 'Stratified Domain Engine',
        visualHook: 'The vertical strata separating domain logic from persistence',
        lens: 'strata3d',
        predicate: (n) => n.layer === 'domain' || n.layer === 'orchestration',
      },
      {
        order: 3,
        title: 'Hot Path Execution Flow',
        visualHook: 'Live particle animation tracing the highest frequency critical path',
        lens: 'flows',
        predicate: (n) => (n.centrality ?? 0) > 0.5,
      },
      {
        order: 4,
        title: 'Architectural Health & Modularity',
        visualHook: 'Decision-1 X-Ray inspection highlighting structural blast radius',
        lens: 'xray',
        predicate: (n) => (n.fanIn ?? 0) >= (n.fanOut ?? 0),
      },
      {
        order: 5,
        title: 'Token Volume & Scale Treemap',
        visualHook: 'Hierarchical scale treemap visualizing module density and weights',
        lens: 'treemap',
        predicate: (n) => n.layer === 'data' || n.layer === 'infrastructure' || n.kind === 'store',
      },
    ];

    const usedNodeIds = new Set<string>();

    for (const def of stopsDef) {
      let candidate = nodes.find((n) => !usedNodeIds.has(n.id) && def.predicate(n));
      if (!candidate) {
        candidate = nodes.find((n) => !usedNodeIds.has(n.id)) ?? resolver.defaultNode;
      }
      usedNodeIds.add(candidate.id);

      const highlights = nodes
        .filter((n) => n.id !== candidate.id && (n.subsystemId === candidate.subsystemId || n.layer === candidate.layer))
        .slice(0, 3)
        .map((n) => n.id);

      codemapTour.push({
        id: `tour-stop-${def.order}`,
        order: def.order,
        title: `${def.title} (${candidate.label})`,
        visualHook: def.visualHook,
        explanation: candidate.visualBrief || `Key architectural hub in the ${candidate.layer} layer`,
        focusNodeId: candidate.id,
        highlightNodeIds: highlights.length > 0 ? highlights : [resolver.defaultNode.id],
        filePath: candidate.primaryFile || 'index.ts',
        lineStart: candidate.lineStart ?? 1,
        lineEnd: candidate.lineEnd ?? 35,
        recommendedLens: def.lens,
      });
    }
  }

  return {
    flows: flows.slice(0, 4),
    codemapTour: codemapTour.slice(0, 5),
  };
}

/**
 * Builds the choreography prompt passed to Gemini 4 Neon via the v1 Interactions API.
 */
function buildChoreographyPrompt(blueprint: VisualAtlasBlueprint): string {
  const metadata = blueprint.metadata;
  const nodes = blueprint.nodes ?? [];
  const edges = blueprint.edges ?? [];
  const subsystems = blueprint.subsystems ?? [];

  const compactNodes = nodes.slice(0, 40).map((n) => ({
    id: n.id,
    label: n.label,
    layer: n.layer,
    kind: n.kind,
    primaryFile: n.primaryFile,
    lineStart: n.lineStart,
    lineEnd: n.lineEnd,
    centrality: Number((n.centrality ?? 0).toFixed(2)),
    keySymbols: n.keySymbols.slice(0, 3),
    visualBrief: n.visualBrief,
  }));

  const compactEdges = edges
    .filter((e) => e.isHotPath || e.weight >= 2)
    .slice(0, 30)
    .map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label,
      kind: e.kind,
      isHotPath: Boolean(e.isHotPath),
    }));

  const compactSubsystems = subsystems.map((s) => ({
    id: s.id,
    name: s.name,
    layer: s.layer,
    tagline: s.tagline,
    nodeIds: s.nodeIds.slice(0, 6),
  }));

  return `
You are the Gemini 4 Neon Flow Choreographer for GitUnderstand (git-understand.com).
Our design philosophy: "No one reads code anymore — MORE VISUALS."
The interactive canvas, animated execution flows, 3D strata, and 5-stop Codemap Tour are the primary heroes.

Your task is to synthesize:
1. 3 to 4 distinct, multi-hop Execution Flows (ExecutionFlow[]) that animate data packets traveling across real architectural layers.
2. A compelling 5-Stop Architectural Codemap Tour (CodemapTourStop[]) that spotlights key nodes across our visual lenses.

CRITICAL INSTRUCTIONS:
- You MUST reference ONLY real node IDs from the "Available Nodes" list below. Every "fromNodeId", "toNodeId", and "focusNodeId" MUST exist in that list.
- Each execution flow must represent a realistic runtime lifecycle (e.g. client query dispatch, authentication lifecycle, ingestion pipeline, state mutation sync).
- Each step must have a concrete action, realistic line numbers from the node's primaryFile, and a concise edgeLabel.
- The 5 tour stops should cover:
  1. Entry & Surface Boundary (lens: "atlas")
  2. Stratified Subsystems (lens: "strata3d")
  3. Hot Execution Flow (lens: "flows")
  4. Health, Modularity & Blast Radius (lens: "xray")
  5. Structural Scale & Density (lens: "treemap")

REPOSITORY CONTEXT:
- Name: ${metadata.fullName}
- Description: ${metadata.description || 'Modern software architecture'}
- Architecture Pattern: ${blueprint.architecturePattern}
- Tech Stack: ${blueprint.techStackBadges.join(', ')}

AVAILABLE SUBSYSTEMS:
${JSON.stringify(compactSubsystems, null, 2)}

AVAILABLE NODES (VALID NODE IDs):
${JSON.stringify(compactNodes, null, 2)}

KEY ARCHITECTURAL EDGES:
${JSON.stringify(compactEdges, null, 2)}

Return STRICT JSON complying with this exact structure:
{
  "flows": [
    {
      "id": "flow-1-request-lifecycle",
      "title": "String (e.g. User Request & Query Ingress)",
      "subtitle": "String (concise 1-sentence narrative)",
      "trigger": "String (e.g. Client triggers search action)",
      "category": "request" | "ingestion" | "ai_pipeline" | "auth" | "state" | "build",
      "steps": [
        {
          "stepNumber": 1,
          "title": "String (step name)",
          "action": "String (what happens in this hop)",
          "fromNodeId": "MUST_BE_EXACT_NODE_ID_FROM_LIST",
          "toNodeId": "MUST_BE_EXACT_NODE_ID_FROM_LIST",
          "edgeLabel": "String (short verb phrase)",
          "filePath": "String (source file path)",
          "lineStart": 1,
          "lineEnd": 30,
          "codeExcerpt": "Optional short signature or snippet",
          "dataPayload": "Optional data payload type string"
        }
      ]
    }
  ],
  "codemapTour": [
    {
      "id": "tour-stop-1",
      "order": 1,
      "title": "String (stop title)",
      "visualHook": "String (visual cue for canvas spotlight)",
      "explanation": "String (crisp architectural insight)",
      "focusNodeId": "MUST_BE_EXACT_NODE_ID_FROM_LIST",
      "highlightNodeIds": ["EXACT_NODE_ID_FROM_LIST"],
      "filePath": "String (primary file)",
      "lineStart": 1,
      "lineEnd": 40,
      "recommendedLens": "atlas" | "strata3d" | "flows" | "treemap" | "xray" | "mermaid" | "media"
    }
  ]
}
`.trim();
}

/**
 * Choreographs animated execution flows and an architectural 5-stop Codemap Tour
 * using Gemini 4 Neon (v1 Interactions API), validating node IDs against blueprint.nodes
 * and falling back cleanly to deterministic graph-based choreography.
 *
 * @param blueprint The VisualAtlasBlueprint containing nodes, edges, and subsystems.
 * @param byokApiKey Optional user-supplied Bring Your Own Key.
 * @returns Promise resolving to validated execution flows, codemap tour stops, and model tier.
 */
export async function choreographFlowsAndTour(
  blueprint: VisualAtlasBlueprint,
  byokApiKey?: string
): Promise<{
  flows: ExecutionFlow[];
  codemapTour: CodemapTourStop[];
  model: string;
}> {
  const nodes = blueprint.nodes ?? [];

  // If blueprint has no nodes, return empty structure safely
  if (nodes.length === 0) {
    return {
      flows: [],
      codemapTour: [],
      model: CHOREOGRAPHER_MODEL,
    };
  }

  const resolver = createNodeResolver(nodes);

  // If no Gemini API credentials are configured, execute deterministic fallback immediately
  if (!hasGeminiCredentials(byokApiKey)) {
    console.info(
      `[FlowChoreographer] No Gemini credentials configured. Using deterministic fallback for "${blueprint.metadata.fullName}".`
    );
    const fallback = createDeterministicFallback(blueprint);
    return {
      flows: fallback.flows,
      codemapTour: fallback.codemapTour,
      model: 'fallback-deterministic',
    };
  }

  try {
    const prompt = buildChoreographyPrompt(blueprint);

    const rawResponseText = await withV1Client(async (client) => {
      // Use client.interactions.create on v1 for Gemini 4 Neon
      // NEVER pass temperature, top_p, top_k, or thinking_budget; use thinking_level
      const interaction = await (client.interactions.create as (params: unknown) => Promise<unknown>)({
        model: CHOREOGRAPHER_MODEL,
        input: prompt,
        generation_config: {
          thinking_level: 'medium',
        },
        response_format: {
          type: 'json_object',
        },
      });

      return extractInteractionText(interaction);
    }, byokApiKey);

    const parsed = extractJsonObject<RawChoreographyResponse>(rawResponseText);

    if (!parsed) {
      console.warn(
        `[FlowChoreographer] Failed to extract structured JSON from Gemini 4 Neon output. Falling back cleanly.`
      );
      const fallback = createDeterministicFallback(blueprint);
      return {
        flows: fallback.flows,
        codemapTour: fallback.codemapTour,
        model: CHOREOGRAPHER_MODEL,
      };
    }

    const validatedFlows = sanitizeFlows(parsed.flows, nodes, resolver);
    const validatedTour = sanitizeCodemapTour(parsed.codemapTour, resolver);

    // If validated output meets quality thresholds, return enriched flows and tour
    if (validatedFlows.length >= 2 && validatedTour.length >= 3) {
      return {
        flows: validatedFlows,
        codemapTour: validatedTour,
        model: CHOREOGRAPHER_MODEL,
      };
    }

    // Otherwise, supplement with deterministic fallback elements to guarantee a complete experience
    const fallback = createDeterministicFallback(blueprint);
    const mergedFlows = validatedFlows.length >= 2 ? validatedFlows : fallback.flows;
    const mergedTour = validatedTour.length >= 3 ? validatedTour : fallback.codemapTour;

    return {
      flows: mergedFlows,
      codemapTour: mergedTour,
      model: CHOREOGRAPHER_MODEL,
    };
  } catch (err: unknown) {
    console.warn(
      `[FlowChoreographer] Error dispatching choreography to ${CHOREOGRAPHER_MODEL}:`,
      err instanceof Error ? err.message : String(err)
    );
    const fallback = createDeterministicFallback(blueprint);
    return {
      flows: fallback.flows,
      codemapTour: fallback.codemapTour,
      model: CHOREOGRAPHER_MODEL,
    };
  }
}
