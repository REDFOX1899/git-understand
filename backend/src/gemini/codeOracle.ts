// =============================================================================
// GitUnderstand (git-understand.com) — Streaming Multimodal Code Oracle
// Architectural code intelligence engine powered by Gemini 4 Hydrogen / Carbon
// with previous_interaction_id state continuity and deterministic local AST fallback.
// =============================================================================

import type {
  VisualAtlasBlueprint,
  OracleCitation,
  RepoFileRecord,
  AtlasNode,
  ExecutionFlow,
  SubsystemCluster,
  ArchitectureLayer,
  XRayPillarId,
} from '../../../shared/types.js';
import { withV1Client, hasGeminiCredentials } from './clientPool.js';
import { extractInteractionText } from './mediaUtils.js';

export interface StreamCodeOracleParams {
  blueprint: VisualAtlasBlueprint;
  message: string;
  previousInteractionId?: string;
  imageBase64?: string;
  imageMimeType?: string;
  deepMode?: boolean;
  byokApiKey?: string;
  onDelta: (text: string) => void;
}

export interface CodeOracleResult {
  fullText: string;
  interactionId?: string;
  citations: OracleCitation[];
  model: string;
}

// -----------------------------------------------------------------------------
// Visual-First System Prompt & Context Construction
// -----------------------------------------------------------------------------

function buildSystemInstruction(): string {
  return `You are GitUnderstand's Streaming Multimodal Code Oracle (git-understand.com).
Your mission is to provide visual-first, architecturally grounded explanations of codebases based on their Visual Atlas Blueprint.

Visual-First Core Rules:
1. "No one reads code anymore — MORE VISUALS." Ground every answer in the repository's visual constructs:
   - Architecture Strata (Layers): client, edge, orchestration, domain, infrastructure, data, tooling.
   - Subsystem Clusters: Explicitly name which subsystem owns the logic.
   - Execution Flows: Reference the end-to-end data/control flow (e.g. entrypoint -> middleware -> domain core -> storage).
   - Treemap & Strata weights: Highlight central vs peripheral modules.
   - Decision-1 X-Ray pillars (security, modularity, resilience, hygiene, testability) when evaluating architecture.
2. Grounded Source Citations:
   - ALWAYS cite specific files and line ranges using standard markdown notation:
     Format: [path/to/file.ext#L10-L40] or \`path/to/file.ext#L10-L40\`.
   - Accompany code references with the architectural layer and subsystem label.
3. Multimodal Sight (Lasso / Screenshot / Diagram):
   - When an image or UI lasso is provided, visually connect the UI component or diagram box to its backing code symbols, layers, and AST file records.
4. Tone & Style:
   - Anti-slop Obsidian Cobalt / Archival Paper aesthetics: crisp, concise, technical, and authoritative.
   - Zero buzzwords or generic boilerplate. Use Markdown headings, bullet points, and compact code excerpts.`;
}

function buildRepositoryContext(blueprint: VisualAtlasBlueprint): string {
  const meta = blueprint.metadata;
  const layers = blueprint.strata?.map((s) => `${s.layer} (${s.fileCount} files)`).join(', ') ?? 'N/A';

  // Summarize subsystems
  const subsystems = (blueprint.subsystems || [])
    .slice(0, 8)
    .map(
      (sub: SubsystemCluster) =>
        `- **${sub.name}** [${sub.layer}]: ${sub.tagline} (${sub.filePaths?.length ?? 0} files)`
    )
    .join('\n');

  // Summarize key execution flows
  const flows = (blueprint.flows || [])
    .slice(0, 5)
    .map(
      (flow: ExecutionFlow) =>
        `- **${flow.title}** (${flow.trigger}): ${flow.subtitle} [${flow.steps?.length ?? 0} steps]`
    )
    .join('\n');

  // Select top central files with symbols and line numbers
  const topFiles = [...(blueprint.files || [])]
    .sort((a, b) => (b.centrality ?? 0) - (a.centrality ?? 0))
    .slice(0, 28)
    .map((file: RepoFileRecord) => {
      const topSymbols = (file.symbols || [])
        .slice(0, 5)
        .map((s) => `${s.kind} ${s.name}(L${s.line}${s.endLine ? `-L${s.endLine}` : ''})`)
        .join(', ');
      return `- \`${file.path}\` [${file.layer}, ${file.lineCount} lines, centrality ${(file.centrality ?? 0).toFixed(2)}]${
        topSymbols ? ` → symbols: ${topSymbols}` : ''
      }`;
    })
    .join('\n');

  // X-Ray diagnostic summary if present
  let xraySummary = '';
  if (blueprint.xray) {
    const pillarEntries = Object.entries(blueprint.xray.pillarAverages || {}) as Array<[XRayPillarId, number]>;
    const pillars = pillarEntries
      .slice(0, 5)
      .map(([id, score]) => `${id}: ${score.toFixed(0)}/100`)
      .join('; ');
    xraySummary = `\nDecision-1 X-Ray Architecture Health: Score ${blueprint.xray.overallScore.toFixed(0)}/100. Pillars: ${pillars}`;
  }

  return `Repository: ${meta.fullName} (${meta.primaryLanguage})
Headline: ${blueprint.headline}
One-Liner: ${blueprint.oneLiner}
Architecture Pattern: ${blueprint.architecturePattern}
Tech Stack: ${(blueprint.techStackBadges || []).join(', ') || 'N/A'}
Active Strata Layers: ${layers}

Subsystems:
${subsystems || 'None defined'}

Key Execution Flows:
${flows || 'None defined'}

Core Central Files & Exported Symbols:
${topFiles || 'None defined'}
${xraySummary}`;
}

function buildUserPrompt(params: StreamCodeOracleParams): string {
  const { blueprint, message, previousInteractionId } = params;

  if (previousInteractionId) {
    // Stateful continuation turn
    return `[Repository: ${blueprint.metadata.fullName}]\n${message}`;
  }

  // Turn 1: Attach full architectural context
  const repoContext = buildRepositoryContext(blueprint);
  return `=== VISUAL ATLAS BLUEPRINT CONTEXT ===
${repoContext}

=== USER INQUIRY ===
${message}`;
}

// -----------------------------------------------------------------------------
// Citation Extraction
// -----------------------------------------------------------------------------

export function extractOracleCitations(
  text: string,
  blueprint: VisualAtlasBlueprint
): OracleCitation[] {
  const citations: OracleCitation[] = [];
  const seen = new Set<string>();

  const files = blueprint.files || [];
  const nodes = blueprint.nodes || [];

  // Build lookup indices
  const fileByPath = new Map<string, RepoFileRecord>();
  const fileByBaseName = new Map<string, RepoFileRecord>();
  for (const f of files) {
    fileByPath.set(f.path.toLowerCase(), f);
    fileByBaseName.set(f.name.toLowerCase(), f);
  }

  const nodeByFilePath = new Map<string, AtlasNode>();
  for (const n of nodes) {
    if (n.primaryFile) {
      nodeByFilePath.set(n.primaryFile.toLowerCase(), n);
    }
    for (const fp of n.filePaths || []) {
      nodeByFilePath.set(fp.toLowerCase(), n);
    }
    nodeByFilePath.set(n.id.toLowerCase(), n);
  }

  // Match file paths and line ranges:
  // e.g. [path/to/file.ts#L10-L40], path/to/file.ts:10-40, `path/to/file.ts`
  const citationRegex =
    /(?:\[|`|\b)([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)(?:#L?(\d+)(?:-L?(\d+))?|:(\d+)(?:-(\d+))?)?(?:\]|`|\b)/g;

  let match: RegExpExecArray | null;
  while ((match = citationRegex.exec(text)) !== null) {
    const rawPath = match[1].replace(/^\.?\//, '').trim();
    const lineStart = match[2] ? parseInt(match[2], 10) : match[4] ? parseInt(match[4], 10) : undefined;
    const lineEnd = match[3] ? parseInt(match[3], 10) : match[5] ? parseInt(match[5], 10) : undefined;

    const lowerPath = rawPath.toLowerCase();
    let matchedFile: RepoFileRecord | undefined = fileByPath.get(lowerPath);

    if (!matchedFile) {
      // Try suffix match (e.g. "server.ts" or "src/server.ts" matching "backend/src/server.ts")
      for (const f of files) {
        if (f.path.toLowerCase().endsWith(lowerPath)) {
          matchedFile = f;
          break;
        }
      }
    }

    if (!matchedFile) {
      // Try base name match if specific
      const baseName = rawPath.split('/').pop()?.toLowerCase();
      if (baseName && fileByBaseName.has(baseName)) {
        matchedFile = fileByBaseName.get(baseName);
      }
    }

    if (matchedFile) {
      const key = `${matchedFile.path}:${lineStart ?? 0}:${lineEnd ?? 0}`;
      if (!seen.has(key)) {
        seen.add(key);
        const node = nodeByFilePath.get(matchedFile.path.toLowerCase());
        const label = lineStart
          ? `${matchedFile.name}:${lineStart}${lineEnd ? `-${lineEnd}` : ''}`
          : `${matchedFile.name} (${matchedFile.layer})`;

        citations.push({
          nodeId: node?.id,
          filePath: matchedFile.path,
          lineStart,
          lineEnd,
          label,
        });
      }
    }
  }

  // Fallback: If no explicit citations were caught by regex, match top files mentioned in text
  if (citations.length === 0) {
    for (const f of files) {
      if (text.includes(f.path) || text.includes(f.name)) {
        const key = `${f.path}:0:0`;
        if (!seen.has(key)) {
          seen.add(key);
          const node = nodeByFilePath.get(f.path.toLowerCase());
          citations.push({
            nodeId: node?.id,
            filePath: f.path,
            label: `${f.name} (${f.layer})`,
          });
          if (citations.length >= 4) break;
        }
      }
    }
  }

  return citations.slice(0, 8);
}

// -----------------------------------------------------------------------------
// Deterministic Local AST Fallback Engine
// -----------------------------------------------------------------------------

interface ScoredFile {
  file: RepoFileRecord;
  score: number;
  matchedSymbols: string[];
}

export function generateLocalASTResponse(
  blueprint: VisualAtlasBlueprint,
  message: string
): { fullText: string; citations: OracleCitation[] } {
  const queryTokens = message
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !['how', 'does', 'what', 'where', 'when', 'with', 'from', 'this', 'that', 'explain'].includes(t));

  const files = blueprint.files || [];
  const subsystems = blueprint.subsystems || [];
  const flows = blueprint.flows || [];

  // 1. Score files by query relevance
  const scoredFiles: ScoredFile[] = [];
  for (const file of files) {
    let score = (file.centrality ?? 0) * 10;
    const lowerPath = file.path.toLowerCase();
    const lowerName = file.name.toLowerCase();
    const matchedSymbols: string[] = [];

    for (const token of queryTokens) {
      if (lowerPath.includes(token)) score += 15;
      if (lowerName.includes(token)) score += 20;

      for (const sym of file.symbols || []) {
        if (sym.name.toLowerCase().includes(token)) {
          score += 25;
          matchedSymbols.push(`${sym.kind} \`${sym.name}\` (L${sym.line})`);
        }
      }
    }

    if (score > 5) {
      scoredFiles.push({ file, score, matchedSymbols });
    }
  }

  scoredFiles.sort((a, b) => b.score - a.score);
  const primaryFiles = scoredFiles.slice(0, 5);

  // 2. Identify top relevant subsystem
  let topSubsystem: SubsystemCluster | undefined;
  let topSubsystemScore = 0;
  for (const sub of subsystems) {
    let subScore = 0;
    const subText = `${sub.name} ${sub.tagline} ${sub.layer}`.toLowerCase();
    for (const token of queryTokens) {
      if (subText.includes(token)) subScore += 10;
    }
    if (subScore > topSubsystemScore) {
      topSubsystemScore = subScore;
      topSubsystem = sub;
    }
  }

  // 3. Identify matching execution flow
  let matchedFlow: ExecutionFlow | undefined;
  for (const flow of flows) {
    const flowText = `${flow.title} ${flow.subtitle} ${flow.trigger}`.toLowerCase();
    for (const token of queryTokens) {
      if (flowText.includes(token)) {
        matchedFlow = flow;
        break;
      }
    }
    if (matchedFlow) break;
  }

  // 4. Construct Markdown Answer
  const meta = blueprint.metadata;
  const dominantLayer: ArchitectureLayer = primaryFiles[0]?.file.layer || topSubsystem?.layer || 'domain';

  const sections: string[] = [];

  sections.push(`### Architectural Digest: ${meta.fullName}`);
  sections.push(
    `Based on the repository's AST dependency graph and **${blueprint.architecturePattern}** blueprint, here is how the architecture addresses your inquiry:`
  );

  if (topSubsystem) {
    sections.push(
      `**Subsystem Ownership:** The logic centers primarily within the **${topSubsystem.name}** cluster (${topSubsystem.layer} layer).\n> ${topSubsystem.tagline}`
    );
  }

  if (primaryFiles.length > 0) {
    sections.push(`#### Key AST Modules & Symbols`);
    for (const { file, matchedSymbols } of primaryFiles) {
      const symList = matchedSymbols.length > 0 ? matchedSymbols.slice(0, 4).join(', ') : 'Central module exports';
      sections.push(
        `- [\`${file.path}#L1-L${file.lineCount}\`](${file.path}) — **${file.layer}** layer (${file.lineCount} lines)\n  - Exported symbols: ${symList}`
      );
    }
  } else {
    sections.push(`#### Architectural Core`);
    sections.push(`The codebase coordinates across ${blueprint.stats?.totalFiles ?? files.length} files. Review the **${dominantLayer}** layer for core contracts.`);
  }

  if (matchedFlow) {
    sections.push(`#### Execution Flow: ${matchedFlow.title}`);
    sections.push(`*Trigger:* \`${matchedFlow.trigger}\` — ${matchedFlow.subtitle}`);
    if (matchedFlow.steps && matchedFlow.steps.length > 0) {
      const stepLines = matchedFlow.steps
        .slice(0, 4)
        .map((s, idx) => `${idx + 1}. **${s.title}**: ${s.action} [\`${s.filePath}#L${s.lineStart}-L${s.lineEnd}\`]`);
      sections.push(stepLines.join('\n'));
    }
  } else {
    sections.push(`#### Architectural Path`);
    sections.push(
      `In this architecture, incoming requests traverse from the **${dominantLayer}** layer into integrated subsystems, maintaining clear module boundaries and contract-driven isolation.`
    );
  }

  sections.push(`> [!TIP]\n> **Visual Explorer Tip:** Use the **Atlas Canvas** to inspect live dependency links or open the **3D Strata** lens to explore layer boundaries.`);

  const fullText = sections.join('\n\n');
  const citations = extractOracleCitations(fullText, blueprint);

  return { fullText, citations };
}

async function runLocalASTFallback(params: StreamCodeOracleParams): Promise<CodeOracleResult> {
  const { fullText, citations } = generateLocalASTResponse(params.blueprint, params.message);

  // Simulate streaming deltas for seamless UI feedback
  const chunks = fullText.split(/(\n\n|[.?!]\s+)/);
  for (const chunk of chunks) {
    if (chunk) {
      params.onDelta(chunk);
      // Small micro-delay between chunks to mimic organic streaming
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }

  return {
    fullText,
    interactionId: `local-ast-${Date.now()}`,
    citations,
    model: 'local-ast-oracle',
  };
}

// -----------------------------------------------------------------------------
// Primary Export: streamCodeOracle
// -----------------------------------------------------------------------------

/**
 * Streams code oracle explanations grounded in the repository's VisualAtlasBlueprint.
 *
 * Uses Gemini 4 Hydrogen (fast balanced oracle) or Carbon (deep reasoning mode) via
 * `client.interactions.create` with `stream: true` and server-side `previous_interaction_id`.
 * Falls back deterministically to local AST graph synthesis when credentials are unset or on error.
 */
export async function streamCodeOracle(params: {
  blueprint: VisualAtlasBlueprint;
  message: string;
  previousInteractionId?: string;
  imageBase64?: string;
  imageMimeType?: string;
  deepMode?: boolean;
  byokApiKey?: string;
  onDelta: (text: string) => void;
}): Promise<{
  fullText: string;
  interactionId?: string;
  citations: OracleCitation[];
  model: string;
}> {
  const { blueprint, message, previousInteractionId, imageBase64, imageMimeType, deepMode, byokApiKey, onDelta } =
    params;

  // 1. Check credentials — if none available, trigger local AST fallback immediately
  if (!hasGeminiCredentials(byokApiKey)) {
    return runLocalASTFallback(params);
  }

  // 2. Select Gemini 4 compute tier
  const model = deepMode ? 'gemini-4-carbon' : 'gemini-4-hydrogen';
  const thinkingLevel: 'low' | 'medium' | 'high' = deepMode ? 'high' : 'low';

  try {
    return await withV1Client(async (client) => {
      const userPromptText = buildUserPrompt(params);

      // Construct input (multimodal if image provided, otherwise plain string)
      let input: unknown;
      if (imageBase64 && imageBase64.trim().length > 0) {
        input = [
          { type: 'text', text: userPromptText },
          {
            type: 'image',
            data: imageBase64.trim(),
            mime_type: imageMimeType || 'image/png',
          },
        ];
      } else {
        input = userPromptText;
      }

      const createParams: Record<string, unknown> = {
        model,
        input,
        stream: true,
        generation_config: {
          thinking_level: thinkingLevel,
        },
      };

      if (previousInteractionId) {
        createParams.previous_interaction_id = previousInteractionId;
      }
      createParams.system_instruction = buildSystemInstruction();

      // Call Gemini 4 Interactions API v1 with streaming enabled
      const stream = (await (client.interactions as unknown as {
        create: (args: Record<string, unknown>) => Promise<unknown>;
      }).create(createParams)) as unknown;

      let fullText = '';
      let interactionId: string | undefined;

      if (stream && typeof stream === 'object' && Symbol.asyncIterator in stream) {
        const asyncStream = stream as AsyncIterable<Record<string, unknown>>;
        for await (const event of asyncStream) {
          // 1. Text delta events
          if (event?.event_type === 'step.delta') {
            const delta = event.delta as Record<string, unknown> | undefined;
            let chunk = '';
            if (delta) {
              if (typeof delta.text === 'string') {
                chunk = delta.text;
              } else if (typeof delta.output_text === 'string') {
                chunk = delta.output_text;
              }
            }
            if (chunk) {
              fullText += chunk;
              onDelta(chunk);
            }
          }

          // 2. Interaction lifecycle events containing ID
          if (
            (event?.event_type === 'interaction.created' || event?.event_type === 'interaction.completed') &&
            event.interaction &&
            typeof (event.interaction as Record<string, unknown>).id === 'string'
          ) {
            interactionId = (event.interaction as Record<string, unknown>).id as string;
          }

          if (!interactionId && event?.interaction && typeof (event.interaction as Record<string, unknown>).id === 'string') {
            interactionId = (event.interaction as Record<string, unknown>).id as string;
          }
        }
      } else {
        // Fallback for non-streaming response object
        const extracted = extractInteractionText(stream);
        if (extracted) {
          fullText = extracted;
          onDelta(extracted);
        }
        const recordStream = stream as Record<string, unknown> | null | undefined;
        if (recordStream?.id && typeof recordStream.id === 'string') {
          interactionId = recordStream.id;
        }
      }

      // If streaming produced no output, fallback to local AST engine
      if (!fullText.trim()) {
        console.warn(`[streamCodeOracle] ${model} returned empty stream; falling back to local AST engine`);
        return runLocalASTFallback(params);
      }

      const citations = extractOracleCitations(fullText, blueprint);

      return {
        fullText,
        interactionId,
        citations,
        model,
      };
    }, byokApiKey);
  } catch (err: unknown) {
    console.warn(
      `[streamCodeOracle] Gemini API (${model}) failed, engaging local AST fallback engine:`,
      err instanceof Error ? err.message : String(err)
    );
    return runLocalASTFallback(params);
  }
}
