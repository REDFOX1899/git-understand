// =============================================================================
// GitUnderstand (git-understand.com) — Multimodal Circle-to-Explain Engine
// =============================================================================
// Analyzes user-circled subgraphs on the interactive visual atlas canvas.
// Fuses multimodal canvas snapshots, topological AST graphs, and code excerpts
// using Gemini 4 Neon (v1 Interactions API) with deterministic AST fallback.
// =============================================================================

import { performance } from 'node:perf_hooks';
import type {
  VisualAtlasBlueprint,
  CircleExplainRequest,
  CircleExplainResponse,
  AtlasNode,
  AtlasEdge,
  RepoFileRecord,
  SubsystemCluster,
} from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { withV1Client, hasGeminiCredentials } from './clientPool.js';
import {
  stripDataUriPrefix,
  normalizeMimeType,
  extractInteractionText,
  extractJsonObject,
} from './mediaUtils.js';

interface RawExplainPayload {
  headline?: string;
  visualSummary?: string;
  dataFlowNarrative?: string;
  keyContracts?: string[];
  potentialRisks?: string[];
  referencedFiles?: Array<{
    path?: string;
    lineStart?: number;
    reason?: string;
  }>;
}

/**
 * Resolves the target nodes indicated by the circle request.
 * Matches explicit selectedNodeIds first, falls back to bounding-box spatial intersection,
 * and defaults to top-centrality anchor nodes if the selection is empty.
 */
function resolveCircledNodes(
  blueprint: VisualAtlasBlueprint,
  request: CircleExplainRequest
): AtlasNode[] {
  const allNodes = blueprint.nodes || [];
  if (allNodes.length === 0) {
    return [];
  }

  // 1. Direct node ID match
  if (Array.isArray(request.selectedNodeIds) && request.selectedNodeIds.length > 0) {
    const idSet = new Set(request.selectedNodeIds);
    const matched = allNodes.filter((node) => idSet.has(node.id));
    if (matched.length > 0) {
      return matched;
    }
  }

  // 2. Stroke bounds spatial intersection (normalized or canvas coordinates)
  if (request.strokeBounds && typeof request.strokeBounds === 'object') {
    const { x, y, width, height } = request.strokeBounds;
    const minX = Math.min(x, x + width);
    const maxX = Math.max(x, x + width);
    const minY = Math.min(y, y + height);
    const maxY = Math.max(y, y + height);

    const spatiallyMatched = allNodes.filter((node) => {
      if (typeof node.x !== 'number' || typeof node.y !== 'number') {
        return false;
      }
      return node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY;
    });

    if (spatiallyMatched.length > 0) {
      return spatiallyMatched;
    }
  }

  // 3. Fallback: Select top 2-3 most central anchor nodes in the primary subsystem
  const sorted = [...allNodes].sort((a, b) => (b.centrality ?? 0) - (a.centrality ?? 0));
  return sorted.slice(0, Math.min(3, sorted.length));
}

/**
 * Identifies internal edges connecting selected nodes, plus inbound and outbound
 * boundary edges linking the circled subgraph with the rest of the repository.
 */
function extractSubgraphTopology(
  blueprint: VisualAtlasBlueprint,
  selectedNodes: AtlasNode[]
): {
  internalEdges: AtlasEdge[];
  inboundEdges: AtlasEdge[];
  outboundEdges: AtlasEdge[];
} {
  const selectedIdSet = new Set(selectedNodes.map((n) => n.id));
  const internalEdges: AtlasEdge[] = [];
  const inboundEdges: AtlasEdge[] = [];
  const outboundEdges: AtlasEdge[] = [];

  for (const edge of blueprint.edges || []) {
    const srcIn = selectedIdSet.has(edge.source);
    const dstIn = selectedIdSet.has(edge.target);

    if (srcIn && dstIn) {
      internalEdges.push(edge);
    } else if (!srcIn && dstIn) {
      inboundEdges.push(edge);
    } else if (srcIn && !dstIn) {
      outboundEdges.push(edge);
    }
  }

  return { internalEdges, inboundEdges, outboundEdges };
}

/**
 * Resolves file records associated with the selected nodes.
 */
function resolveNodeFiles(
  blueprint: VisualAtlasBlueprint,
  selectedNodes: AtlasNode[]
): RepoFileRecord[] {
  const filePaths = new Set<string>();
  for (const node of selectedNodes) {
    if (node.primaryFile) filePaths.add(node.primaryFile);
    if (Array.isArray(node.filePaths)) {
      for (const fp of node.filePaths) {
        filePaths.add(fp);
      }
    }
  }

  const filesMap = new Map<string, RepoFileRecord>();
  for (const file of blueprint.files || []) {
    if (filePaths.has(file.path)) {
      filesMap.set(file.path, file);
    }
  }

  return Array.from(filesMap.values());
}

/**
 * Formats a bounded code excerpt from a file record for multimodal LLM context.
 */
function formatFileExcerpt(file: RepoFileRecord): string {
  const lines: string[] = [];
  lines.push(`// FILE: ${file.path} (${file.language}, ${file.layer} layer, ${file.lineCount} lines)`);
  if (file.exports && file.exports.length > 0) {
    lines.push(`// EXPORTS: ${file.exports.join(', ')}`);
  }
  if (file.symbols && file.symbols.length > 0) {
    const symbolSummaries = file.symbols.slice(0, 8).map((s) => {
      const sig = s.signature ? ` [${s.signature}]` : '';
      return `${s.kind} ${s.name} (L${s.line})${sig}`;
    });
    lines.push(`// SYMBOLS: ${symbolSummaries.join(', ')}`);
  }

  if (file.content && file.content.trim()) {
    const rawLines = file.content.split('\n');
    const previewLines = rawLines.slice(0, 100);
    lines.push('```' + (file.language || 'text'));
    lines.push(previewLines.join('\n'));
    if (rawLines.length > 100) {
      lines.push(`// ... [${rawLines.length - 100} more lines omitted for conciseness]`);
    }
    lines.push('```');
  }

  return lines.join('\n');
}

/**
 * Rich deterministic AST fallback that synthesizes a high-fidelity explanation
 * of the circled subgraph when Gemini credentials are unset or the API call fails.
 */
function buildDeterministicFallback(
  blueprint: VisualAtlasBlueprint,
  request: CircleExplainRequest,
  startTime: number,
  isFallbackFromError = false
): CircleExplainResponse {
  const selectedNodes = resolveCircledNodes(blueprint, request);
  const { internalEdges, inboundEdges, outboundEdges } = extractSubgraphTopology(
    blueprint,
    selectedNodes
  );
  const files = resolveNodeFiles(blueprint, selectedNodes);

  // Group subsystems
  const subsystemIds = new Set(selectedNodes.map((n) => n.subsystemId).filter(Boolean));
  const subsystems = (blueprint.subsystems || []).filter((s) => subsystemIds.has(s.id));
  const subsystemNames = subsystems.map((s) => s.name).join(', ') || 'Core Subsystem';

  // Extract key contracts from exported symbols
  const keyContracts: string[] = [];
  for (const file of files) {
    for (const sym of file.symbols || []) {
      if (sym.exported || sym.kind === 'interface' || sym.kind === 'type' || sym.kind === 'class') {
        const sig = sym.signature ? `: ${sym.signature}` : '';
        keyContracts.push(`${sym.name} (${sym.kind}) in ${file.name} (line ${sym.line})${sig}`);
      }
    }
  }

  // Fallback contracts from node inputs/outputs if symbols are sparse
  if (keyContracts.length === 0) {
    for (const node of selectedNodes) {
      if (node.inputs.length > 0) {
        keyContracts.push(`${node.label} Ingress: ${node.inputs.join(', ')}`);
      }
      if (node.outputs.length > 0) {
        keyContracts.push(`${node.label} Egress: ${node.outputs.join(', ')}`);
      }
    }
  }

  // Derive potential risks
  const potentialRisks: string[] = [];
  const circulars = (blueprint.dependencyEdges || []).filter((e) => e.isCircular);
  const selectedFilePaths = new Set(files.map((f) => f.path));

  for (const circ of circulars) {
    if (selectedFilePaths.has(circ.source) || selectedFilePaths.has(circ.target)) {
      potentialRisks.push(
        `Circular Dependency: Detected cycle along ${circ.source} -> ${circ.target} which risks instantiation deadlocks during hot module reload.`
      );
    }
  }

  for (const node of selectedNodes) {
    if (node.fanOut > 6) {
      potentialRisks.push(
        `High Fan-Out (${node.fanOut} connections): ${node.label} acts as an architectural nexus; downstream contract changes may cascade broadly.`
      );
    }
    if ((node.riskScore ?? 0) > 0.6) {
      potentialRisks.push(
        `Elevated Complexity Risk: ${node.label} carries an elevated risk score of ${((node.riskScore ?? 0) * 100).toFixed(0)}% based on cyclomatic and structural metrics.`
      );
    }
  }

  for (const file of files) {
    if (file.fanIn > 5 && !file.isTest) {
      potentialRisks.push(
        `Critical Single Point of Failure: ${file.name} is referenced by ${file.fanIn} dependents across the codebase.`
      );
    }
  }

  if (potentialRisks.length === 0) {
    potentialRisks.push(
      'Contract Drift: Ensure boundary inputs are strictly validated with schemas before entering this subsystem.'
    );
    potentialRisks.push(
      'Boundary Encapsulation: Keep internal helper routines unexported to prevent accidental direct imports from outer layers.'
    );
  }

  // Data flow narrative
  const flowSteps: string[] = [];
  if (inboundEdges.length > 0) {
    const ingressLabels = inboundEdges.slice(0, 3).map((e) => `[${e.label || e.kind}] from ${e.source}`);
    flowSteps.push(`1. Ingress: Data enters the circled perimeter via ${ingressLabels.join(', ')}.`);
  } else {
    flowSteps.push(
      `1. Initiation: The circled modules operate as primary initiators or standalone entrypoints for ${subsystemNames}.`
    );
  }

  if (internalEdges.length > 0) {
    const internalFlows = internalEdges
      .slice(0, 3)
      .map((e) => `${e.source} passes ${e.label || e.kind} to ${e.target}`);
    flowSteps.push(`2. Subgraph Orchestration: Internally, ${internalFlows.join('; ')}.`);
  } else if (selectedNodes.length > 1) {
    const nodeNames = selectedNodes.map((n) => n.label).join(' and ');
    flowSteps.push(
      `2. Co-Located Modules: ${nodeNames} execute in parallel within the same ${selectedNodes[0]?.layer ?? 'architecture'} stratum.`
    );
  } else {
    flowSteps.push(
      `2. Internal Execution: ${selectedNodes[0]?.label ?? 'The module'} executes domain logic and computes transformations.`
    );
  }

  if (outboundEdges.length > 0) {
    const egressLabels = outboundEdges.slice(0, 3).map((e) => `[${e.label || e.kind}] to ${e.target}`);
    flowSteps.push(`3. Egress & Side-Effects: State mutations and outputs emit via ${egressLabels.join(', ')}.`);
  } else {
    flowSteps.push(
      '3. Termination: Responses and generated payloads resolve within the circled boundary.'
    );
  }

  const dataFlowNarrative = flowSteps.join('\n');

  // Visual summary
  const nodeSummary = selectedNodes.map((n) => `${n.label} (${n.kind})`).join(', ');
  const layerNames = Array.from(new Set(selectedNodes.map((n) => n.layer))).join('/');
  const visualSummary = `The circled area encapsulates ${selectedNodes.length} ${
    selectedNodes.length === 1 ? 'component' : 'collaborating components'
  } (${nodeSummary}) situated on the ${layerNames} stratum of ${blueprint.metadata.name}. It constitutes the core mechanics of the ${subsystemNames} subsystem, governing runtime orchestration and data transformations.`;

  // Headline
  const primaryName = selectedNodes[0]?.label || blueprint.metadata.name;
  const headline =
    selectedNodes.length === 1
      ? `${primaryName} Component Architecture`
      : `${primaryName} & ${selectedNodes.length - 1} Co-Circled Modules`;

  // Referenced files
  const referencedFiles = files.slice(0, 6).map((file) => {
    const sym = (file.symbols || [])[0];
    return {
      path: file.path,
      lineStart: sym?.line ?? 1,
      reason: `Hosts ${sym?.name || file.name} (${file.layer} layer, centrality ${((file.centrality ?? 0) * 100).toFixed(0)}%)`,
    };
  });

  if (referencedFiles.length === 0 && selectedNodes.length > 0) {
    for (const node of selectedNodes) {
      if (node.primaryFile) {
        referencedFiles.push({
          path: node.primaryFile,
          lineStart: node.lineStart ?? 1,
          reason: `Primary implementation for ${node.label} (${node.layer} stratum)`,
        });
      }
    }
  }

  return {
    headline,
    visualSummary,
    dataFlowNarrative,
    keyContracts: keyContracts.slice(0, 6),
    potentialRisks: potentialRisks.slice(0, 4),
    referencedFiles,
    model: isFallbackFromError ? 'deterministic-ast-fallback' : 'deterministic-ast',
    latencyMs: Math.max(1, Math.round(performance.now() - startTime)),
  };
}

/**
 * Builds the comprehensive prompt for Gemini 4 Neon visual interaction.
 */
function buildInteractionPrompt(
  blueprint: VisualAtlasBlueprint,
  request: CircleExplainRequest,
  selectedNodes: AtlasNode[],
  subsystems: SubsystemCluster[],
  topology: { internalEdges: AtlasEdge[]; inboundEdges: AtlasEdge[]; outboundEdges: AtlasEdge[] },
  files: RepoFileRecord[]
): string {
  const parts: string[] = [];

  parts.push(
    `# Circle-to-Explain Architectural Request`,
    `Repository: ${blueprint.metadata.fullName || blueprint.repoId}`,
    `Architecture Pattern: ${blueprint.architecturePattern || 'Modular Modern Application'}`,
    `Tech Stack: ${(blueprint.techStackBadges || []).join(', ') || 'TypeScript/Node'}`,
    ''
  );

  if (request.question && request.question.trim()) {
    parts.push(`## User Specific Question:`, `"${request.question.trim()}"`, '');
  } else {
    parts.push(
      `## User Task:`,
      `The user lassoed/circled this specific subgraph on the Visual Atlas canvas. Explain what these components do together, how data moves through them, what contracts bind them, and what architectural risks exist.`,
      ''
    );
  }

  parts.push(`## Circled Nodes (${selectedNodes.length} selected):`);
  for (const node of selectedNodes) {
    parts.push(
      `- Node ID: "${node.id}"`,
      `  Label: ${node.label} [${node.kind}, ${node.layer} layer]`,
      `  Subtitle: ${node.subtitle}`,
      `  Visual Brief: ${node.visualBrief}`,
      `  Primary File: ${node.primaryFile}`,
      `  Inputs: ${node.inputs.join(', ') || 'None'}`,
      `  Outputs: ${node.outputs.join(', ') || 'None'}`,
      `  Key Symbols: ${node.keySymbols.join(', ') || 'None'}`,
      `  Centrality: ${((node.centrality ?? 0) * 100).toFixed(0)}%, Fan-In: ${node.fanIn}, Fan-Out: ${node.fanOut}`
    );
  }
  parts.push('');

  if (subsystems.length > 0) {
    parts.push(`## Subsystems Involved:`);
    for (const sub of subsystems) {
      parts.push(
        `- Subsystem: ${sub.name} (${sub.layer} layer)`,
        `  Tagline: ${sub.tagline}`,
        `  Invariants: ${(sub.invariants || []).join('; ') || 'Standard layered boundaries'}`
      );
    }
    parts.push('');
  }

  parts.push(`## Subgraph Graph Connections:`);
  if (topology.internalEdges.length > 0) {
    parts.push(`- Internal Connections within Circle:`);
    for (const e of topology.internalEdges) {
      parts.push(`    ${e.source} -> ${e.target} [${e.kind}] label: "${e.label}"`);
    }
  } else {
    parts.push(`- Internal Connections: No direct internal edges; modules operate in parallel or via event bus.`);
  }

  if (topology.inboundEdges.length > 0) {
    parts.push(`- Inbound Boundaries (Entering Circle):`);
    for (const e of topology.inboundEdges.slice(0, 5)) {
      parts.push(`    ${e.source} -> ${e.target} [${e.kind}] label: "${e.label}"`);
    }
  }

  if (topology.outboundEdges.length > 0) {
    parts.push(`- Outbound Boundaries (Exiting Circle):`);
    for (const e of topology.outboundEdges.slice(0, 5)) {
      parts.push(`    ${e.source} -> ${e.target} [${e.kind}] label: "${e.label}"`);
    }
  }
  parts.push('');

  if (files.length > 0) {
    parts.push(`## Grounding Source Code Excerpts:`);
    for (const file of files.slice(0, 4)) {
      parts.push(formatFileExcerpt(file), '');
    }
  }

  parts.push(
    `## Output Schema:`,
    `Return strict JSON with exactly this structure:`,
    `{`,
    `  "headline": "Punchy 3-8 word title for this circled cluster",`,
    `  "visualSummary": "2-3 sentence visual synthesis explaining what this cluster represents on the canvas",`,
    `  "dataFlowNarrative": "Numbered multi-step narrative (Step 1 Ingress, Step 2 Processing, Step 3 Egress) detailing data/control movement",`,
    `  "keyContracts": ["Contract/Interface/Type 1 with file and purpose", "Contract 2..."],`,
    `  "potentialRisks": ["Specific architectural bottleneck, race condition, or high coupling hazard 1", "Risk 2..."],`,
    `  "referencedFiles": [`,
    `    { "path": "path/to/file.ts", "lineStart": 42, "reason": "Why this specific line/file is the critical handoff point" }`,
    `  ]`,
    `}`
  );

  return parts.join('\n');
}

/**
 * Explains a user-circled subgraph from the visual atlas canvas.
 *
 * Uses Gemini 4 Neon (`gemini-4-neon` via v1 Interactions API) with multimodal
 * snapshot input and code grounding. When no Gemini credentials are configured,
 * seamlessly falls back to a deterministic AST analysis engine.
 *
 * @param blueprint The full VisualAtlasBlueprint of the repository.
 * @param request The circle explain request with selected nodes and optional canvas snapshot.
 * @param byokApiKey Optional user-supplied Bring Your Own Key.
 * @returns Promise resolving to the structured CircleExplainResponse.
 */
export async function explainCircledSubgraph(
  blueprint: VisualAtlasBlueprint,
  request: CircleExplainRequest,
  byokApiKey?: string
): Promise<CircleExplainResponse> {
  const startTime = performance.now();

  // If no Gemini API keys are configured, execute the rich deterministic AST path immediately
  if (!hasGeminiCredentials(byokApiKey)) {
    return buildDeterministicFallback(blueprint, request, startTime, false);
  }

  const selectedNodes = resolveCircledNodes(blueprint, request);
  const topology = extractSubgraphTopology(blueprint, selectedNodes);
  const files = resolveNodeFiles(blueprint, selectedNodes);

  const subsystemIds = new Set(selectedNodes.map((n) => n.subsystemId).filter(Boolean));
  const subsystems = (blueprint.subsystems || []).filter((s) => subsystemIds.has(s.id));

  const promptText = buildInteractionPrompt(
    blueprint,
    request,
    selectedNodes,
    subsystems,
    topology,
    files
  );

  const systemInstruction = [
    'You are the GitUnderstand Multimodal Circle-to-Explain Engine.',
    'You analyze code atlas subgraphs circled by engineers and deliver high-contrast, crystal-clear architectural explanations.',
    'Strict visual-first philosophy: Focus on data flows, interface contracts, state mutations, and structural risks.',
    'Never use generic clichés, buzzwords, or hand-waving explanations. Ground every single claim in the provided source code, node labels, and topological edges.',
    'Respond ONLY in valid, well-formed JSON conforming exactly to the requested schema.',
  ].join(' ');

  const modelName = ENV.GEMINI_MODEL_VISUAL || 'gemini-4-neon';

  try {
    const response = await withV1Client(async (client) => {
      // Build multimodal inputs: canvas image (if present) + textual prompt
      const contentInputs: Array<
        | { type: 'image'; data: string; mime_type: string }
        | { type: 'text'; text: string }
      > = [];

      if (request.canvasSnapshotBase64 && typeof request.canvasSnapshotBase64 === 'string') {
        const stripped = stripDataUriPrefix(request.canvasSnapshotBase64);
        if (stripped.base64 && stripped.base64.length > 50) {
          const mime = normalizeMimeType(stripped.detectedMime, 'image/png');
          contentInputs.push({
            type: 'image',
            data: stripped.base64,
            mime_type: mime,
          });
        }
      }

      contentInputs.push({
        type: 'text',
        text: promptText,
      });

      // Call Gemini 4 Neon Interactions API on v1
      // Note: Never pass temperature, top_p, top_k or thinking_budget to Gemini 4 models.
      // Use generation_config: { thinking_level: 'medium' }.
      const createInteraction = client.interactions.create as (params: unknown) => Promise<unknown>;
      const interaction = await createInteraction({
        model: modelName,
        system_instruction: systemInstruction,
        input: contentInputs,
        generation_config: {
          thinking_level: 'medium',
        },
        response_mime_type: 'application/json',
      });

      // Extract raw output text across possible interaction structures
      let rawText = extractInteractionText(interaction);

      if (!rawText) {
        const anyInteraction = interaction as Record<string, unknown> | null | undefined;
        if (anyInteraction && Array.isArray(anyInteraction.outputs)) {
          const firstOut = anyInteraction.outputs[0] as Record<string, unknown> | undefined;
          if (typeof firstOut?.text === 'string') {
            rawText = firstOut.text;
          }
        }
      }

      if (!rawText) {
        throw new Error('Gemini 4 Neon interactions.create returned empty text response.');
      }

      const parsed = extractJsonObject<RawExplainPayload>(rawText);
      if (!parsed) {
        throw new Error(`Failed to extract valid JSON from Gemini output: ${rawText.slice(0, 150)}...`);
      }

      // Build and normalize referenced files
      const referencedFiles: Array<{ path: string; lineStart?: number; reason: string }> = [];
      if (Array.isArray(parsed.referencedFiles)) {
        for (const item of parsed.referencedFiles) {
          if (item && typeof item.path === 'string' && item.path.trim()) {
            referencedFiles.push({
              path: item.path.trim(),
              lineStart: typeof item.lineStart === 'number' ? item.lineStart : undefined,
              reason: item.reason || 'Referenced in circled interaction path',
            });
          }
        }
      }

      // Ensure fallback referenced files if AI omitted them
      if (referencedFiles.length === 0) {
        for (const f of files.slice(0, 4)) {
          referencedFiles.push({
            path: f.path,
            lineStart: f.symbols?.[0]?.line ?? 1,
            reason: `Core module implementing ${f.name}`,
          });
        }
      }

      const defaultHeadline =
        selectedNodes.length === 1
          ? `${selectedNodes[0]?.label} Architecture`
          : `${selectedNodes[0]?.label} & Subsystem Subgraph`;

      return {
        headline: parsed.headline?.trim() || defaultHeadline,
        visualSummary:
          parsed.visualSummary?.trim() ||
          `Circled cluster consisting of ${selectedNodes.length} modules within ${blueprint.metadata.name}.`,
        dataFlowNarrative:
          parsed.dataFlowNarrative?.trim() ||
          `Data flows through ${selectedNodes.map((n) => n.label).join(' -> ')}.`,
        keyContracts:
          Array.isArray(parsed.keyContracts) && parsed.keyContracts.length > 0
            ? parsed.keyContracts
            : selectedNodes.map((n) => `${n.label}: ${n.inputs.join(', ') || 'Internal invocation'}`),
        potentialRisks:
          Array.isArray(parsed.potentialRisks) && parsed.potentialRisks.length > 0
            ? parsed.potentialRisks
            : ['Verify interface validation at the boundary of this circled subsystem.'],
        referencedFiles,
        model: modelName,
        latencyMs: Math.max(1, Math.round(performance.now() - startTime)),
      };
    }, byokApiKey);

    return response;
  } catch (err: unknown) {
    console.warn(
      `[CircleExplainer] Gemini 4 Neon interaction failed (${err instanceof Error ? err.message : String(err)}). Reverting to rich deterministic AST fallback.`
    );
    return buildDeterministicFallback(blueprint, request, startTime, true);
  }
}
