// =============================================================================
// GitUnderstand (git-understand.com) — Gemini Embedding-2 Visual Search
// Multimodal vector indexing & retrieval across Atlas nodes using gemini-embedding-2
// with fast deterministic lexical AST fallback when unauthenticated.
// =============================================================================

import { withV1Client, hasGeminiCredentials } from './clientPool.js';
import { stripDataUriPrefix } from './mediaUtils.js';
import { ENV } from '../config/env.js';
import type {
  VisualAtlasBlueprint,
  VisualSearchMatch,
  AtlasNode,
  RepoFileRecord,
} from '../../../shared/types.js';

/**
 * In-memory vector entry for an indexed architectural node.
 */
interface NodeEmbeddingEntry {
  nodeId: string;
  filePath: string;
  label: string;
  layer: string;
  kind: string;
  vector: number[];
  text: string;
}

/**
 * Cached vector index for a repository blueprint.
 */
interface RepoEmbeddingCache {
  repoId: string;
  model: string;
  updatedAt: number;
  entries: NodeEmbeddingEntry[];
}

/**
 * Global in-memory cache mapping repoId to its vector embeddings.
 */
const repoEmbeddingCache = new Map<string, RepoEmbeddingCache>();

/**
 * Concurrency limit for embedding calls to avoid rate limiting.
 */
const EMBEDDING_CONCURRENCY_LIMIT = 4;

/**
 * Safely extracts floating point vector values from Gemini embedContent response.
 */
function extractEmbeddingValues(response: unknown): number[] {
  if (!response || typeof response !== 'object') {
    return [];
  }
  const r = response as Record<string, unknown>;

  if (Array.isArray(r.embeddings) && r.embeddings.length > 0) {
    const first = r.embeddings[0] as Record<string, unknown> | undefined;
    if (first && Array.isArray(first.values)) {
      return first.values as number[];
    }
  }

  if (r.embedding && typeof r.embedding === 'object') {
    const emb = r.embedding as Record<string, unknown>;
    if (Array.isArray(emb.values)) {
      return emb.values as number[];
    }
  }

  return [];
}

/**
 * Computes standard cosine similarity between two numerical vectors.
 * Returns a value clamped to [0, 1].
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA <= 0 || normB <= 0) {
    return 0;
  }
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1, sim));
}

/**
 * Builds rich, visual-first semantic text summarizing an AtlasNode for embedding.
 */
function buildNodeEmbeddingText(node: AtlasNode, fileRecord?: RepoFileRecord): string {
  const lines: string[] = [
    `Node: ${node.label} (${node.kind})`,
    `Layer: ${node.layer}`,
    `Subsystem: ${node.subsystemId}`,
    `Primary File: ${node.primaryFile}`,
  ];

  if (node.subtitle && node.subtitle.trim().length > 0) {
    lines.push(`Subtitle: ${node.subtitle.trim()}`);
  }

  if (node.visualBrief && node.visualBrief.trim().length > 0) {
    lines.push(`Visual Summary: ${node.visualBrief.trim()}`);
  }

  if (node.keySymbols && node.keySymbols.length > 0) {
    lines.push(`Key Symbols: ${node.keySymbols.slice(0, 12).join(', ')}`);
  }

  if (node.inputs && node.inputs.length > 0) {
    lines.push(`Inputs: ${node.inputs.slice(0, 8).join(', ')}`);
  }

  if (node.outputs && node.outputs.length > 0) {
    lines.push(`Outputs: ${node.outputs.slice(0, 8).join(', ')}`);
  }

  if (fileRecord) {
    if (fileRecord.exports && fileRecord.exports.length > 0) {
      lines.push(`Exports: ${fileRecord.exports.slice(0, 10).join(', ')}`);
    }
    if (fileRecord.symbols && fileRecord.symbols.length > 0) {
      const symSummary = fileRecord.symbols
        .slice(0, 10)
        .map((s) => `${s.kind} ${s.name}`)
        .join(', ');
      lines.push(`AST Declarations: ${symSummary}`);
    }
  }

  return lines.join('\n');
}

/**
 * Splits input text into lowercase alphanumeric search tokens, expanding camelCase & snake_case.
 */
function tokenizeQuery(raw: string): string[] {
  if (!raw || typeof raw !== 'string') {
    return [];
  }

  const normalized = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-./\\:;=()[\]{}'"`]/g, ' ')
    .toLowerCase();

  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were',
  ]);

  return normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !stopWords.has(t));
}

/**
 * Fast deterministic lexical AST fallback search when no Gemini API credentials exist
 * or when multimodal embedContent encounters transient network limits.
 */
function searchRepoLexicalAst(
  blueprint: VisualAtlasBlueprint,
  queryText?: string,
  topK: number = 5
): VisualSearchMatch[] {
  const nodes = blueprint.nodes || [];
  if (nodes.length === 0) {
    return [];
  }

  const query = (queryText || '').trim();
  const queryTokens = tokenizeQuery(query);
  const queryLower = query.toLowerCase();

  const fileMap = new Map<string, RepoFileRecord>();
  for (const f of blueprint.files || []) {
    fileMap.set(f.path, f);
  }

  const scored: Array<{
    node: AtlasNode;
    score: number;
    reason: string;
  }> = [];

  for (const node of nodes) {
    let score = 0;
    const reasons: string[] = [];
    const nodeLabelLower = node.label.toLowerCase();
    const primaryFileLower = node.primaryFile.toLowerCase();
    const fileRecord = fileMap.get(node.primaryFile);

    // 1. Exact or whole-string query matches
    if (queryLower && nodeLabelLower === queryLower) {
      score += 0.95;
      reasons.push(`Exact node label match for "${node.label}"`);
    } else if (queryLower && nodeLabelLower.includes(queryLower)) {
      score += 0.65;
      reasons.push(`Node label contains "${query}"`);
    }

    if (queryLower && primaryFileLower.includes(queryLower)) {
      score += 0.55;
      reasons.push(`Primary file path contains "${query}"`);
    }

    // 2. Tokenized keyword scoring across AST symbols and visual briefs
    for (const token of queryTokens) {
      if (nodeLabelLower.includes(token)) {
        score += 0.35;
        if (!reasons.some((r) => r.includes(token))) {
          reasons.push(`Label matches token "${token}"`);
        }
      }

      if (node.visualBrief && node.visualBrief.toLowerCase().includes(token)) {
        score += 0.25;
        if (!reasons.some((r) => r.includes(token))) {
          reasons.push(`Visual brief mentions "${token}"`);
        }
      }

      if (node.subtitle && node.subtitle.toLowerCase().includes(token)) {
        score += 0.2;
      }

      if (node.layer.toLowerCase().includes(token)) {
        score += 0.25;
        reasons.push(`Matches architectural layer "${node.layer}"`);
      }

      if (node.kind.toLowerCase().includes(token)) {
        score += 0.25;
        reasons.push(`Matches component kind "${node.kind}"`);
      }

      if (node.keySymbols && node.keySymbols.some((s) => s.toLowerCase().includes(token))) {
        score += 0.4;
        reasons.push(`Exported symbol matches "${token}"`);
      }

      if (fileRecord) {
        if (fileRecord.exports && fileRecord.exports.some((e) => e.toLowerCase().includes(token))) {
          score += 0.35;
          reasons.push(`File exports match "${token}"`);
        }
        if (fileRecord.symbols && fileRecord.symbols.some((s) => s.name.toLowerCase().includes(token))) {
          score += 0.45;
          reasons.push(`AST symbol declaration matches "${token}"`);
        }
      }
    }

    // 3. Centrality weight ensures hub services rank higher in ambiguous queries
    const centralityBonus = (node.centrality || 0) * 0.12;
    score += centralityBonus;

    if (score > 0 || queryTokens.length === 0) {
      let finalReason = reasons.slice(0, 2).join('; ');
      if (!finalReason) {
        finalReason = `Architectural node in ${node.layer} layer (${node.kind}): ${node.visualBrief || node.subtitle || node.primaryFile}`;
      }
      scored.push({
        node,
        score,
        reason: finalReason,
      });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, topK);
  const maxScore = top.length > 0 && top[0].score > 0 ? top[0].score : 1;

  return top.map((item) => {
    // Normalize to 0.05..0.98 similarity range
    const normalizedSim = Math.min(0.98, Math.max(0.1, Number((item.score / (maxScore + 0.1)).toFixed(4))));
    return {
      nodeId: item.node.id,
      filePath: item.node.primaryFile,
      label: item.node.label,
      similarity: normalizedSim,
      reason: item.reason,
    };
  });
}

/**
 * Generates and caches dense multimodal embeddings for all architectural Atlas nodes
 * in the blueprint using Gemini Embedding-2 (`gemini-embedding-2` on `v1`).
 *
 * @param blueprint The comprehensive VisualAtlasBlueprint of the repository.
 * @param byokApiKey Optional user-supplied BYOK key.
 * @returns Total count of nodes successfully embedded and cached.
 */
export async function indexRepoEmbeddings(
  blueprint: VisualAtlasBlueprint,
  byokApiKey?: string
): Promise<number> {
  const nodes = blueprint.nodes || [];
  if (nodes.length === 0) {
    return 0;
  }

  // If credentials are unconfigured, return 0 indicating vector index was deferred to lexical fallback
  if (!hasGeminiCredentials(byokApiKey)) {
    return 0;
  }

  const fileMap = new Map<string, RepoFileRecord>();
  for (const f of blueprint.files || []) {
    fileMap.set(f.path, f);
  }

  const modelName = ENV.GEMINI_MODEL_EMBEDDING || 'gemini-embedding-2';
  const entries: NodeEmbeddingEntry[] = [];

  // Embed nodes with controlled concurrency
  for (let i = 0; i < nodes.length; i += EMBEDDING_CONCURRENCY_LIMIT) {
    const chunk = nodes.slice(i, i + EMBEDDING_CONCURRENCY_LIMIT);

    const chunkResults = await Promise.all(
      chunk.map(async (node) => {
        const fileRecord = fileMap.get(node.primaryFile);
        const text = buildNodeEmbeddingText(node, fileRecord);

        try {
          const vector = await withV1Client(async (client) => {
            const res = await client.models.embedContent({
              model: modelName,
              contents: text,
            });
            return extractEmbeddingValues(res);
          }, byokApiKey);

          if (vector.length > 0) {
            return {
              nodeId: node.id,
              filePath: node.primaryFile,
              label: node.label,
              layer: node.layer,
              kind: node.kind,
              vector,
              text,
            };
          }
        } catch (err: unknown) {
          console.warn(
            `[VisualSearch] Failed to embed node "${node.id}" (${node.label}):`,
            err instanceof Error ? err.message : String(err)
          );
        }
        return null;
      })
    );

    for (const res of chunkResults) {
      if (res) {
        entries.push(res);
      }
    }
  }

  repoEmbeddingCache.set(blueprint.repoId, {
    repoId: blueprint.repoId,
    model: modelName,
    updatedAt: Date.now(),
    entries,
  });

  return entries.length;
}

/**
 * Searches the repository blueprint across visual Atlas nodes using Gemini Embedding-2
 * multimodal embeddings (for text queries, image sketches/screenshots, or both).
 * Gracefully and deterministically falls back to fast lexical AST analysis when unauthenticated.
 *
 * @param blueprint The repository VisualAtlasBlueprint.
 * @param params Query text, base64 image (canvas lasso, screenshot, diagram sketch), topK, and BYOK.
 * @returns Ranked VisualSearchMatch items and the model identifier used.
 */
export async function searchRepoMultimodal(
  blueprint: VisualAtlasBlueprint,
  params: {
    queryText?: string;
    imageBase64?: string;
    imageMimeType?: string;
    topK?: number;
    byokApiKey?: string;
  }
): Promise<{ matches: VisualSearchMatch[]; model: string }> {
  const topK = Math.max(1, params.topK ?? 5);
  const queryText = params.queryText?.trim();
  const rawImage = params.imageBase64?.trim();

  // If neither text nor image is present, return empty result
  if (!queryText && !rawImage) {
    return {
      matches: [],
      model: hasGeminiCredentials(params.byokApiKey)
        ? (ENV.GEMINI_MODEL_EMBEDDING || 'gemini-embedding-2')
        : 'lexical-ast-fallback',
    };
  }

  // Fallback to lexical AST search if Gemini credentials are not available
  if (!hasGeminiCredentials(params.byokApiKey)) {
    const matches = searchRepoLexicalAst(blueprint, queryText, topK);
    return {
      matches,
      model: 'lexical-ast-fallback',
    };
  }

  const modelName = ENV.GEMINI_MODEL_EMBEDDING || 'gemini-embedding-2';

  try {
    // Ensure repository embeddings are indexed and cached
    let cached = repoEmbeddingCache.get(blueprint.repoId);
    if (!cached || cached.entries.length === 0) {
      await indexRepoEmbeddings(blueprint, params.byokApiKey);
      cached = repoEmbeddingCache.get(blueprint.repoId);
    }

    // If cache is still empty after indexing attempt, fall back to lexical AST
    if (!cached || cached.entries.length === 0) {
      const matches = searchRepoLexicalAst(blueprint, queryText, topK);
      return {
        matches,
        model: 'lexical-ast-fallback',
      };
    }

    // Prepare multimodal query contents
    let contents: unknown;

    if (rawImage) {
      const { base64: cleanBase64, detectedMime } = stripDataUriPrefix(rawImage);
      const mimeType = params.imageMimeType || detectedMime || 'image/png';

      const imagePart = {
        inlineData: {
          data: cleanBase64,
          mimeType,
        },
      };

      if (queryText) {
        contents = [imagePart, { text: queryText }];
      } else {
        contents = [imagePart];
      }
    } else {
      contents = queryText;
    }

    // Embed the multimodal query vector on v1
    const queryVector = await withV1Client(async (client) => {
      const res = await client.models.embedContent({
        model: modelName,
        contents: contents as string,
      });
      return extractEmbeddingValues(res);
    }, params.byokApiKey);

    if (queryVector.length === 0) {
      const matches = searchRepoLexicalAst(blueprint, queryText, topK);
      return {
        matches,
        model: 'lexical-ast-fallback',
      };
    }

    // Map of nodes by ID for fast lookup
    const nodeMap = new Map<string, AtlasNode>();
    for (const n of blueprint.nodes || []) {
      nodeMap.set(n.id, n);
    }

    // Score all indexed node vectors via cosine similarity
    const scored = cached.entries.map((entry) => {
      const sim = cosineSimilarity(queryVector, entry.vector);
      const node = nodeMap.get(entry.nodeId);

      let reason: string;
      if (rawImage && queryText) {
        reason = `Multimodal visual + semantic match (${(sim * 100).toFixed(1)}%) in ${entry.layer} layer: ${node?.visualBrief || entry.label}`;
      } else if (rawImage) {
        reason = `Visual diagram / canvas match (${(sim * 100).toFixed(1)}%) in ${entry.layer} layer: ${node?.visualBrief || entry.label}`;
      } else {
        reason = `Semantic embedding match (${(sim * 100).toFixed(1)}%) in ${entry.layer} layer: ${node?.visualBrief || entry.label}`;
      }

      return {
        nodeId: entry.nodeId,
        filePath: entry.filePath,
        label: entry.label,
        similarity: Number(sim.toFixed(4)),
        reason,
      };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    const matches = scored.slice(0, topK);

    return {
      matches,
      model: modelName,
    };
  } catch (err: unknown) {
    console.warn(
      `[VisualSearch] Gemini Embedding-2 failed, falling back to lexical AST search:`,
      err instanceof Error ? err.message : String(err)
    );

    const matches = searchRepoLexicalAst(blueprint, queryText, topK);
    return {
      matches,
      model: 'lexical-ast-fallback',
    };
  }
}
