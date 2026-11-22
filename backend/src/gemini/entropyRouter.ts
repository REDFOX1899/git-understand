// =============================================================================
// GitUnderstand — Entropy Adaptive Compute Router
// Routes repository synthesis & X-Ray inspection to the optimal Gemini 4 model
// tier based on structural graph complexity, token volume, and Shannon entropy.
// =============================================================================

import type { AdaptiveModelTier } from '../../../shared/types.js';

/**
 * Computes the Shannon entropy of a binary probability probe:
 * H(p) = -p * log2(p) - (1 - p) * log2(1 - p)
 *
 * Properties:
 * - H(0) = 0, H(1) = 0 (zero uncertainty at deterministic edges)
 * - H(0.5) = 1 (maximal uncertainty)
 * - Returns 0 for NaN, out-of-range, or edge values
 * - Result is strictly clamped within [0, 1]
 */
export function computeShannonEntropy(p: number): number {
  if (Number.isNaN(p) || p <= 0 || p >= 1) {
    return 0;
  }

  const h = -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
  if (Number.isNaN(h) || !Number.isFinite(h)) {
    return 0;
  }

  return Math.max(0, Math.min(1, h));
}

export interface RepoComputeRoute {
  tier: AdaptiveModelTier;
  entropy: number;
  rationale: string;
}

/**
 * Routes repository analysis to the optimal Gemini 4 compute tier based on
 * repository scale, topological entanglement (circular dependencies), and
 * Decision-1 X-Ray entropy.
 *
 * Tier Hierarchy:
 * - gemini-4-carbon: High complexity, circular dependencies, massive scale, high entropy
 * - gemini-4-neon: Moderate complexity, multi-subsystem visual synthesis, moderate entropy
 * - gemini-4-argon: Clean decoupled codebases, low entropy, rapid balanced turnarounds
 * - gemini-4-hydrogen: Compact single-module repos, zero circular deps, near-zero entropy
 */
export function routeRepoAnalysisModel(params: {
  fileCount: number;
  totalTokens: number;
  circularDeps: number;
  meanXRayEntropy?: number;
}): RepoComputeRoute {
  const { fileCount, totalTokens, circularDeps, meanXRayEntropy } = params;

  // Derive structural complexity factor in [0, 1]
  const circFactor = Math.min(1, circularDeps / 3);
  const tokenFactor = Math.min(1, totalTokens / 120_000);
  const fileFactor = Math.min(1, fileCount / 60);
  const structuralComplexity = 0.45 * circFactor + 0.35 * tokenFactor + 0.20 * fileFactor;

  // Determine effective entropy: use measured X-Ray entropy if provided, otherwise structural
  const effectiveEntropy =
    meanXRayEntropy !== undefined
      ? Number(Math.max(0, Math.min(1, meanXRayEntropy)).toFixed(3))
      : Number(Math.max(0, Math.min(1, structuralComplexity)).toFixed(3));

  const tokenK = Math.round(totalTokens / 1000);

  // 1. Carbon: Deepest diagnostic reasoning for entangled or high-uncertainty repos
  if (
    circularDeps >= 2 ||
    totalTokens >= 150_000 ||
    fileCount >= 100 ||
    (circularDeps >= 1 && totalTokens >= 80_000) ||
    (effectiveEntropy >= 0.65 && (totalTokens >= 50_000 || circularDeps >= 1 || fileCount >= 50))
  ) {
    const reasons: string[] = [];
    if (circularDeps > 0) reasons.push(`${circularDeps} circular ${circularDeps === 1 ? 'dependency' : 'dependencies'}`);
    if (totalTokens >= 80_000) reasons.push(`${tokenK}k tokens across ${fileCount} files`);
    if (effectiveEntropy >= 0.65) reasons.push(`high cross-module entropy (${effectiveEntropy})`);

    const detail = reasons.length > 0 ? reasons.join(', ') : `high architectural entropy (${effectiveEntropy})`;
    return {
      tier: 'gemini-4-carbon',
      entropy: effectiveEntropy,
      rationale: `Complex multi-subsystem architecture with ${detail} — gemini-4-carbon selected for deep reasoning and topological untangling.`,
    };
  }

  // 2. Neon: Visual synthesis & balanced deep dives for moderate-scale repos
  if (effectiveEntropy >= 0.40 || totalTokens >= 35_000 || fileCount >= 25 || circularDeps >= 1) {
    return {
      tier: 'gemini-4-neon',
      entropy: effectiveEntropy,
      rationale: `Moderate architectural entropy (${effectiveEntropy}) across ${fileCount} files (${tokenK}k tokens) — gemini-4-neon selected for balanced visual synthesis and execution flow mapping.`,
    };
  }

  // 3. Argon: Fast, high-fidelity analysis for clean, decoupled codebases
  if (effectiveEntropy >= 0.18 || totalTokens >= 8_000 || fileCount >= 8) {
    return {
      tier: 'gemini-4-argon',
      entropy: effectiveEntropy,
      rationale: `Decoupled architecture with low entropy (${effectiveEntropy}) and clean contract boundaries across ${fileCount} files (${tokenK}k tokens) — gemini-4-argon selected for fast, high-fidelity analysis.`,
    };
  }

  // 4. Hydrogen: Ultra-low latency oracle for compact, minimal repos
  return {
    tier: 'gemini-4-hydrogen',
    entropy: effectiveEntropy,
    rationale: `Compact, single-module architecture with near-zero entropy (${effectiveEntropy}) and no circular dependencies — gemini-4-hydrogen selected for rapid low-latency synthesis.`,
  };
}

/**
 * Routes model selection directly from an array of Decision-1 X-Ray probe
 * probabilities. Computes Shannon entropy per cell probe and determines
 * the required reasoning capacity.
 */
export function routeFromXRayProbs(probabilities: number[]): RepoComputeRoute {
  if (!probabilities || probabilities.length === 0) {
    return {
      tier: 'gemini-4-argon',
      entropy: 0,
      rationale: 'No X-Ray decision probabilities provided; default balanced tier gemini-4-argon selected.',
    };
  }

  let totalEntropy = 0;
  let validCount = 0;
  let highEntropyCount = 0; // probes with H(p) >= 0.80 (borderline/ambiguous health)

  for (const p of probabilities) {
    const h = computeShannonEntropy(p);
    totalEntropy += h;
    validCount++;
    if (h >= 0.8) {
      highEntropyCount++;
    }
  }

  const meanEntropy = validCount > 0 ? Number((totalEntropy / validCount).toFixed(3)) : 0;
  const highEntropyRatio = validCount > 0 ? highEntropyCount / validCount : 0;

  if (meanEntropy >= 0.62 || highEntropyRatio >= 0.35) {
    return {
      tier: 'gemini-4-carbon',
      entropy: meanEntropy,
      rationale: `High mean decision entropy (${meanEntropy}) with ${Math.round(highEntropyRatio * 100)}% high-ambiguity probes — gemini-4-carbon selected for deep diagnostic reasoning.`,
    };
  }

  if (meanEntropy >= 0.40 || highEntropyRatio >= 0.15) {
    return {
      tier: 'gemini-4-neon',
      entropy: meanEntropy,
      rationale: `Moderate decision entropy (${meanEntropy}) across ${validCount} X-Ray probes — gemini-4-neon selected for fast, accurate architectural synthesis.`,
    };
  }

  if (meanEntropy >= 0.18) {
    return {
      tier: 'gemini-4-argon',
      entropy: meanEntropy,
      rationale: `Low decision entropy (${meanEntropy}) indicates high probe confidence and clear module boundaries — gemini-4-argon selected for rapid analysis.`,
    };
  }

  return {
    tier: 'gemini-4-hydrogen',
    entropy: meanEntropy,
    rationale: `Minimal decision entropy (${meanEntropy}) with near-unanimous probe confidence — gemini-4-hydrogen selected for ultra-fast, low-latency execution.`,
  };
}
