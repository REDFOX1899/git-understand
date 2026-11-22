/**
 * GitUnderstand — Visual Token Treemap Builder
 *
 * Constructs hierarchical TreemapNode structures from ingested repo file records,
 * aggregating tokens, bytes, and file counts bottom-up across nested directories.
 * Attaches dominant architectural layer and programming language to each node
 * and calculates global repository language distributions.
 */

import type {
  ArchitectureLayer,
  RepoFileRecord,
  TreemapNode,
} from '../../../shared/types.js';

export interface LanguageDistributionItem {
  language: string;
  files: number;
  tokens: number;
  percentage: number;
}

interface IntermediateDir {
  name: string;
  path: string;
  subdirs: Map<string, IntermediateDir>;
  files: RepoFileRecord[];
}

interface AggregateStats {
  tokens: number;
  bytes: number;
  fileCount: number;
  languageTokens: Map<string, number>;
  languageFiles: Map<string, number>;
  layerTokens: Map<ArchitectureLayer, number>;
  layerFiles: Map<ArchitectureLayer, number>;
  weightedRiskSum: number;
  riskWeight: number;
}

/**
 * Normalizes a file path by replacing backslashes, removing leading/trailing slashes,
 * and resolving `./` prefixes.
 */
function normalizeFilePath(rawPath: string): string {
  if (!rawPath) return '';
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Determines the dominant string key from token and file count distributions.
 * Prioritizes token volume; falls back to file frequency if all tokens are zero.
 * Breaks ties deterministically via alphabetical comparison.
 */
function findDominant<T extends string>(
  tokenMap: Map<T, number>,
  fileMap: Map<T, number>
): T | undefined {
  let bestKey: T | undefined;
  let maxTokens = -1;

  for (const [key, tokens] of tokenMap.entries()) {
    if (
      tokens > maxTokens ||
      (tokens === maxTokens && bestKey !== undefined && key.localeCompare(bestKey) < 0)
    ) {
      maxTokens = tokens;
      bestKey = key;
    }
  }

  if (bestKey !== undefined && maxTokens > 0) {
    return bestKey;
  }

  let fallbackKey: T | undefined;
  let maxFiles = -1;

  for (const [key, files] of fileMap.entries()) {
    if (
      files > maxFiles ||
      (files === maxFiles && fallbackKey !== undefined && key.localeCompare(fallbackKey) < 0)
    ) {
      maxFiles = files;
      fallbackKey = key;
    }
  }

  return fallbackKey ?? bestKey;
}

/**
 * Recursively converts an intermediate directory trie node into a TreemapNode.
 * Bottom-up aggregates tokens, bytes, file count, language, and architectural layer.
 * Sorts children descending by token count (with byte and name fallbacks).
 */
function convertDirToTreemapNode(
  dir: IntermediateDir,
  isRoot: boolean,
  repoName: string
): { node: TreemapNode; stats: AggregateStats } {
  const currentStats: AggregateStats = {
    tokens: 0,
    bytes: 0,
    fileCount: 0,
    languageTokens: new Map<string, number>(),
    languageFiles: new Map<string, number>(),
    layerTokens: new Map<ArchitectureLayer, number>(),
    layerFiles: new Map<ArchitectureLayer, number>(),
    weightedRiskSum: 0,
    riskWeight: 0,
  };

  const children: TreemapNode[] = [];

  // 1. Process nested subdirectories bottom-up
  for (const subdir of dir.subdirs.values()) {
    const { node: childNode, stats: childStats } = convertDirToTreemapNode(
      subdir,
      false,
      repoName
    );

    children.push(childNode);

    currentStats.tokens += childStats.tokens;
    currentStats.bytes += childStats.bytes;
    currentStats.fileCount += childStats.fileCount;

    for (const [lang, tokens] of childStats.languageTokens.entries()) {
      currentStats.languageTokens.set(
        lang,
        (currentStats.languageTokens.get(lang) || 0) + tokens
      );
    }
    for (const [lang, count] of childStats.languageFiles.entries()) {
      currentStats.languageFiles.set(
        lang,
        (currentStats.languageFiles.get(lang) || 0) + count
      );
    }

    for (const [layer, tokens] of childStats.layerTokens.entries()) {
      currentStats.layerTokens.set(
        layer,
        (currentStats.layerTokens.get(layer) || 0) + tokens
      );
    }
    for (const [layer, count] of childStats.layerFiles.entries()) {
      currentStats.layerFiles.set(
        layer,
        (currentStats.layerFiles.get(layer) || 0) + count
      );
    }

    currentStats.weightedRiskSum += childStats.weightedRiskSum;
    currentStats.riskWeight += childStats.riskWeight;
  }

  // 2. Process immediate files in this directory
  for (const file of dir.files) {
    const tokens = Number.isFinite(file.estimatedTokens)
      ? Math.max(0, file.estimatedTokens)
      : 0;
    const bytes = Number.isFinite(file.sizeBytes)
      ? Math.max(0, file.sizeBytes)
      : 0;
    const cleanPath = normalizeFilePath(file.path);
    const fileName = file.name || cleanPath.split('/').pop() || 'file';

    const riskScore = (file as { riskScore?: number }).riskScore;
    const validRisk =
      typeof riskScore === 'number' && Number.isFinite(riskScore)
        ? riskScore
        : undefined;

    const fileNode: TreemapNode = {
      id: cleanPath || fileName,
      name: fileName,
      path: cleanPath,
      kind: 'file',
      tokens,
      bytes,
      fileCount: 1,
      language: file.language?.trim() || undefined,
      layer: file.layer || undefined,
      ...(validRisk !== undefined ? { riskScore: validRisk } : {}),
    };

    children.push(fileNode);

    currentStats.tokens += tokens;
    currentStats.bytes += bytes;
    currentStats.fileCount += 1;

    if (file.language?.trim()) {
      const lang = file.language.trim();
      currentStats.languageTokens.set(
        lang,
        (currentStats.languageTokens.get(lang) || 0) + tokens
      );
      currentStats.languageFiles.set(
        lang,
        (currentStats.languageFiles.get(lang) || 0) + 1
      );
    }

    if (file.layer) {
      currentStats.layerTokens.set(
        file.layer,
        (currentStats.layerTokens.get(file.layer) || 0) + tokens
      );
      currentStats.layerFiles.set(
        file.layer,
        (currentStats.layerFiles.get(file.layer) || 0) + 1
      );
    }

    if (validRisk !== undefined) {
      const weight = tokens > 0 ? tokens : 1;
      currentStats.weightedRiskSum += validRisk * weight;
      currentStats.riskWeight += weight;
    }
  }

  // 3. Sort children descending by tokens (with deterministic tie-breakers)
  children.sort((a, b) => {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    if (b.bytes !== a.bytes) return b.bytes - a.bytes;
    return a.name.localeCompare(b.name);
  });

  // 4. Derive dominant language and architectural layer
  const dominantLang = findDominant(
    currentStats.languageTokens,
    currentStats.languageFiles
  );
  const dominantLayer = findDominant(
    currentStats.layerTokens,
    currentStats.layerFiles
  );

  const averageRisk =
    currentStats.riskWeight > 0
      ? Number((currentStats.weightedRiskSum / currentStats.riskWeight).toFixed(3))
      : undefined;

  const displayName = isRoot ? (repoName.trim() || 'root') : dir.name;
  const nodeId = isRoot ? (repoName.trim() || 'root') : dir.path;

  const node: TreemapNode = {
    id: nodeId,
    name: displayName,
    path: isRoot ? '' : dir.path,
    kind: 'dir',
    tokens: currentStats.tokens,
    bytes: currentStats.bytes,
    fileCount: currentStats.fileCount,
    ...(dominantLang ? { language: dominantLang } : {}),
    ...(dominantLayer ? { layer: dominantLayer } : {}),
    ...(averageRisk !== undefined ? { riskScore: averageRisk } : {}),
    children,
  };

  return { node, stats: currentStats };
}

/**
 * Builds the hierarchical `TreemapNode` tree for the GitUnderstand Visual Token Treemap lens.
 *
 * Recursively aggregates estimated tokens, byte sizes, and file counts bottom-up
 * across nested directories, sorts all children descending by token count, and attaches
 * dominant programming language and architectural layer to every directory and file node.
 *
 * @param repoName - Identifier or display name of the repository (e.g. "owner/repo" or "react")
 * @param files - Ingested repository file records with token estimates, sizes, and layers
 * @returns The root `TreemapNode` containing the complete sorted directory/file hierarchy
 */
export function buildTokenTreemap(
  repoName: string,
  files: RepoFileRecord[]
): TreemapNode {
  const rootDir: IntermediateDir = {
    name: repoName.trim() || 'root',
    path: '',
    subdirs: new Map<string, IntermediateDir>(),
    files: [],
  };

  if (!Array.isArray(files) || files.length === 0) {
    return {
      id: repoName.trim() || 'root',
      name: repoName.trim() || 'root',
      path: '',
      kind: 'dir',
      tokens: 0,
      bytes: 0,
      fileCount: 0,
      children: [],
    };
  }

  // Populate intermediate trie structure
  for (const file of files) {
    if (!file || typeof file.path !== 'string') continue;

    const normalized = normalizeFilePath(file.path);
    if (!normalized) {
      rootDir.files.push(file);
      continue;
    }

    const segments = normalized.split('/').filter(Boolean);
    if (segments.length <= 1) {
      rootDir.files.push(file);
      continue;
    }

    let current = rootDir;
    let accumulatedPath = '';

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment;

      let nextDir = current.subdirs.get(segment);
      if (!nextDir) {
        nextDir = {
          name: segment,
          path: accumulatedPath,
          subdirs: new Map<string, IntermediateDir>(),
          files: [],
        };
        current.subdirs.set(segment, nextDir);
      }
      current = nextDir;
    }

    current.files.push(file);
  }

  const { node } = convertDirToTreemapNode(rootDir, true, repoName);
  return node;
}

/**
 * Computes the language distribution breakdown across all repository files.
 *
 * Calculates file count, token totals, and token share percentages for each language.
 * Sorts descending by token volume (with file count and name fallbacks).
 *
 * @param files - Ingested repository file records
 * @returns Sorted array of language distribution items
 */
export function computeLanguageDistribution(
  files: RepoFileRecord[]
): LanguageDistributionItem[] {
  if (!Array.isArray(files) || files.length === 0) {
    return [];
  }

  const map = new Map<string, { files: number; tokens: number }>();
  let totalTokens = 0;
  let totalFiles = 0;

  for (const file of files) {
    if (!file) continue;

    const lang = file.language?.trim() || 'Other';
    const tokens = Number.isFinite(file.estimatedTokens)
      ? Math.max(0, file.estimatedTokens)
      : 0;

    totalTokens += tokens;
    totalFiles += 1;

    const existing = map.get(lang);
    if (existing) {
      existing.files += 1;
      existing.tokens += tokens;
    } else {
      map.set(lang, { files: 1, tokens });
    }
  }

  const result: LanguageDistributionItem[] = [];

  for (const [language, data] of map.entries()) {
    let percentage = 0;
    if (totalTokens > 0) {
      percentage = Number(((data.tokens / totalTokens) * 100).toFixed(2));
    } else if (totalFiles > 0) {
      percentage = Number(((data.files / totalFiles) * 100).toFixed(2));
    }

    result.push({
      language,
      files: data.files,
      tokens: data.tokens,
      percentage,
    });
  }

  result.sort((a, b) => {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    if (b.files !== a.files) return b.files - a.files;
    return a.language.localeCompare(b.language);
  });

  return result;
}
