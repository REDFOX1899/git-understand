// =============================================================================
// GitUnderstand (git-understand.com) — Decision-1 Calibrated X-Ray Engine
// Evaluates codebase health across 9 calibrated architectural pillars using
// Gemini Decision-1 (Noul questions), dual-key sharded execution, Shannon
// entropy uncertainty scoring, adaptive compute routing, and AST fallbacks.
// =============================================================================

import type {
  ArchitectureLayer,
  AtlasNode,
  DependencyEdge,
  RepoFileRecord,
  VisualAtlasBlueprint,
  XRayCellScore,
  XRayMatrixReport,
  XRayModuleAudit,
  XRayPillarId,
} from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { getDualBetaClients } from './clientPool.js';
import { computeShannonEntropy, routeFromXRayProbs } from './entropyRouter.js';

/**
 * The 9 Canonical Architectural X-Ray Pillars evaluated by Decision-1.
 */
export const XRAY_PILLARS: Array<{
  id: XRayPillarId;
  label: string;
  shortLabel: string;
  questionTemplate: string;
}> = [
  {
    id: 'modularity',
    label: 'Modularity & Coupling',
    shortLabel: 'Modularity',
    questionTemplate:
      'Does module "{MODULE_LABEL}" exhibit strong encapsulation, high cohesion, and low coupling without leaky abstractions or circular dependency hazards?',
  },
  {
    id: 'security',
    label: 'Security & Access Control',
    shortLabel: 'Security',
    questionTemplate:
      'Is module "{MODULE_LABEL}" safely hardened against unvalidated inputs, unauthorized data exposure, injection attacks, and credential or memory safety leaks?',
  },
  {
    id: 'resilience',
    label: 'Resilience & Fault Tolerance',
    shortLabel: 'Resilience',
    questionTemplate:
      'Does module "{MODULE_LABEL}" gracefully handle unexpected faults, transient network failures, unhandled exceptions, and timeouts with robust fallback strategies?',
  },
  {
    id: 'testability',
    label: 'Testability & Determinism',
    shortLabel: 'Testability',
    questionTemplate:
      'Is module "{MODULE_LABEL}" architected for deterministic unit and integration verification with mockable contracts and minimal hidden side effects?',
  },
  {
    id: 'api_clarity',
    label: 'API Clarity & Contracts',
    shortLabel: 'API Clarity',
    questionTemplate:
      'Does module "{MODULE_LABEL}" expose clear, typed, self-documenting public interfaces and data contracts with well-defined semantics?',
  },
  {
    id: 'concurrency',
    label: 'Concurrency & State Safety',
    shortLabel: 'Concurrency',
    questionTemplate:
      'Is module "{MODULE_LABEL}" resilient against race conditions, deadlocks, shared mutable state corruption, and asynchronous order-of-operation hazards?',
  },
  {
    id: 'scalability',
    label: 'Scalability & Resource Hygiene',
    shortLabel: 'Scalability',
    questionTemplate:
      'Can module "{MODULE_LABEL}" handle high load, throughput, and large data volume without unbounded memory leaks or blocking bottlenecks?',
  },
  {
    id: 'hygiene',
    label: 'Code Hygiene & Maintainability',
    shortLabel: 'Hygiene',
    questionTemplate:
      'Is module "{MODULE_LABEL}" structured cleanly according to DRY principles and idiomatic standards, free from dead code and excessive cyclomatic complexity?',
  },
  {
    id: 'onboarding',
    label: 'Onboarding & Comprehensibility',
    shortLabel: 'Onboarding',
    questionTemplate:
      'Can a newly onboarded engineer quickly understand the responsibilities, execution lifecycle, invariants, and failure modes of "{MODULE_LABEL}"?',
  },
];

/**
 * Options for running codebase X-Ray analysis.
 */
export interface RunCodebaseXRayOptions {
  byokApiKey?: string;
  maxModules?: number;
}

/**
 * Builds rich, structured context describing a single module for Decision-1 evaluation.
 */
function buildModuleInputContext(
  node: AtlasNode,
  blueprint: VisualAtlasBlueprint,
  circularEdgeCount: number,
  primaryFile?: RepoFileRecord,
): string {
  const subsystem = blueprint.subsystems.find((s) => s.id === node.subsystemId);
  const callers = node.inputs.slice(0, 6).join(', ') || 'None (Entrypoint)';
  const dependencies = node.outputs.slice(0, 8).join(', ') || 'None (Leaf)';
  const keySymbols = node.keySymbols.slice(0, 8).join(', ') || 'No public symbols';

  let codeExcerpt = '';
  if (primaryFile?.content) {
    const lines = primaryFile.content.split('\n');
    codeExcerpt = lines.slice(0, 80).join('\n');
    if (lines.length > 80) {
      codeExcerpt += `\n... [${lines.length - 80} more lines truncated]`;
    }
  }

  return [
    `### Architectural Module: ${node.label} (${node.id})`,
    `- Subsystem: ${subsystem ? `${subsystem.name} (${subsystem.tagline})` : 'Standalone'}`,
    `- Architecture Layer: ${node.layer}`,
    `- Module Kind: ${node.kind}`,
    `- Primary File: ${node.primaryFile}`,
    `- Centrality Score: ${node.centrality.toFixed(2)} (normalized 0..1)`,
    `- Inbound Callers (Fan-In): ${node.fanIn} -> [${callers}]`,
    `- Outbound Dependencies (Fan-Out): ${node.fanOut} -> [${dependencies}]`,
    `- Circular Dependencies Involving Module: ${circularEdgeCount}`,
    `- Estimated Token Weight: ${node.estimatedTokens} tokens`,
    `- Key Exported Contracts / Symbols: ${keySymbols}`,
    `- Visual Synthesis Brief: ${node.visualBrief}`,
    codeExcerpt ? `\n### Primary Source Excerpt (${node.primaryFile}):\n\`\`\`\n${codeExcerpt}\n\`\`\`` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Generates an actionable warning / diagnostic flag when a pillar score indicates risk or uncertainty.
 */
function generatePillarFlag(
  pillarId: XRayPillarId,
  probability: number,
  entropy: number,
  node: AtlasNode,
  circularEdgeCount: number,
): string | undefined {
  if (probability >= 0.78 && entropy < 0.75) {
    return undefined;
  }

  switch (pillarId) {
    case 'modularity':
      if (circularEdgeCount > 0) {
        return `Participates in ${circularEdgeCount} circular dependency cycle(s); tightly coupled boundaries.`;
      }
      return `Elevated fan-out (${node.fanOut}) with porous boundary encapsulation.`;
    case 'security':
      return `Exposed at ${node.layer} boundary without explicit contract validation or auth guard.`;
    case 'resilience':
      return `High centrality (${node.centrality.toFixed(2)}) single point of failure; lacks circuit isolation.`;
    case 'testability':
      return `Deep transitive dependencies (${node.fanOut} callees) impede isolated deterministic unit testing.`;
    case 'api_clarity':
      return `Public surface contracts lack strict schema typing or explicit return invariants.`;
    case 'concurrency':
      return `Shared state mutations across asynchronous boundaries pose potential reentrancy hazards.`;
    case 'scalability':
      return `Heavy token footprint (${node.estimatedTokens} tokens) and fan-in pressure may bottleneck throughput.`;
    case 'hygiene':
      return `Dense cyclomatic complexity and divergent responsibilities warrant structural decomposition.`;
    case 'onboarding':
      return `Implicit invariants and undocumented state transitions elevate developer onboarding friction.`;
    default:
      return undefined;
  }
}

/**
 * Synthesizes a high-level executive finding for a module based on its weakest pillars.
 */
function synthesizeTopFinding(
  node: AtlasNode,
  cells: Record<XRayPillarId, XRayCellScore>,
  overallHealth: number,
): string {
  const sorted = Object.values(cells).sort(
    (a, b) => a.probabilityHealthy - b.probabilityHealthy,
  );
  const weakest = sorted[0];
  const secondWeakest = sorted[1];

  if (overallHealth >= 88) {
    return `Exemplary architectural health across all 9 pillars with clean contract boundaries and robust encapsulation.`;
  }

  if (weakest && weakest.probabilityHealthy < 0.72) {
    const flag = weakest.flagSummary ? ` (${weakest.flagSummary})` : '';
    return `Priority remediation required on ${weakest.pillar}${flag}; blast radius ${Math.round(
      (node.centrality * 0.65 + (node.fanIn / 10) * 0.35) * 100,
    )}%.`;
  }

  if (weakest && secondWeakest) {
    return `Moderate technical debt observed in ${weakest.pillar} and ${secondWeakest.pillar}; core functional paths remain viable.`;
  }

  return `Stable operational baseline with minor localized refactoring opportunities.`;
}

/**
 * Deterministic AST-based calculation for an X-Ray cell when the model is offline or unconfigured.
 */
function computeDeterministicPillarProb(
  pillarId: XRayPillarId,
  node: AtlasNode,
  circularCount: number,
  primaryFile?: RepoFileRecord,
): number {
  const centrality = node.centrality;
  const fanIn = Math.min(1, node.fanIn / 12);
  const fanOut = Math.min(1, node.fanOut / 12);
  const lineCount = primaryFile?.lineCount ?? 200;
  const sizeFactor = Math.min(1, lineCount / 600);
  const hasCirc = circularCount > 0;

  switch (pillarId) {
    case 'modularity': {
      let p = 0.94 - fanOut * 0.22 - (hasCirc ? 0.24 : 0);
      return Math.max(0.48, Math.min(0.98, Number(p.toFixed(3))));
    }
    case 'security': {
      let p = 0.92;
      if (node.layer === 'edge' || node.layer === 'client') p -= 0.12;
      if (node.kind === 'api' || node.kind === 'ui') p -= 0.08;
      if (fanIn > 0.6) p -= 0.06;
      return Math.max(0.55, Math.min(0.96, Number(p.toFixed(3))));
    }
    case 'resilience': {
      let p = 0.93 - centrality * 0.18 - fanIn * 0.10;
      return Math.max(0.52, Math.min(0.97, Number(p.toFixed(3))));
    }
    case 'testability': {
      let p = 0.94 - fanOut * 0.20 - sizeFactor * 0.14;
      if (primaryFile?.isTest) p = 0.97;
      return Math.max(0.50, Math.min(0.98, Number(p.toFixed(3))));
    }
    case 'api_clarity': {
      const symCount = node.keySymbols.length;
      let p = 0.88 + (symCount >= 2 ? 0.06 : -0.04) - sizeFactor * 0.05;
      return Math.max(0.60, Math.min(0.98, Number(p.toFixed(3))));
    }
    case 'concurrency': {
      let p = 0.92;
      if (node.kind === 'store' || node.kind === 'pipeline' || node.layer === 'data') p -= 0.15;
      if (node.layer === 'infrastructure') p -= 0.08;
      return Math.max(0.58, Math.min(0.96, Number(p.toFixed(3))));
    }
    case 'scalability': {
      let p = 0.93 - sizeFactor * 0.16 - fanIn * 0.12;
      return Math.max(0.55, Math.min(0.96, Number(p.toFixed(3))));
    }
    case 'hygiene': {
      let p = 0.94 - sizeFactor * 0.14 - (hasCirc ? 0.12 : 0);
      return Math.max(0.55, Math.min(0.98, Number(p.toFixed(3))));
    }
    case 'onboarding': {
      let p = 0.95 - centrality * 0.12 - sizeFactor * 0.10;
      if (node.visualBrief && node.visualBrief.length > 20) p += 0.03;
      return Math.max(0.60, Math.min(0.98, Number(p.toFixed(3))));
    }
  }
}

/**
 * Builds a deterministic AST fallback audit for a single module.
 */
function auditModuleWithDeterministicAST(
  node: AtlasNode,
  circularCount: number,
  primaryFile?: RepoFileRecord,
): XRayModuleAudit {
  const cells = {} as Record<XRayPillarId, XRayCellScore>;
  let probSum = 0;

  for (const pillar of XRAY_PILLARS) {
    const p = computeDeterministicPillarProb(pillar.id, node, circularCount, primaryFile);
    const entropy = computeShannonEntropy(p);
    const confidence = Number(Math.max(0.55, Math.min(0.99, 1 - entropy * 0.42)).toFixed(3));
    const flag = generatePillarFlag(pillar.id, p, entropy, node, circularCount);

    cells[pillar.id] = {
      pillar: pillar.id,
      probabilityHealthy: p,
      confidence,
      entropy,
      ...(flag ? { flagSummary: flag } : {}),
    };
    probSum += p;
  }

  const overallHealth = Math.round((probSum / XRAY_PILLARS.length) * 100);
  const blastRadius = Number(
    Math.min(0.98, Math.max(0.12, node.centrality * 0.65 + (node.fanIn / 10) * 0.35)).toFixed(2),
  );

  return {
    nodeId: node.id,
    label: node.label,
    primaryFile: node.primaryFile,
    layer: node.layer,
    overallHealth,
    blastRadius,
    cells,
    topFinding: synthesizeTopFinding(node, cells, overallHealth),
  };
}

/**
 * Evaluates a single module via Gemini Decision-1 binary Noul questions.
 */
async function auditModuleWithDecision1(
  client: any,
  node: AtlasNode,
  blueprint: VisualAtlasBlueprint,
  circularCount: number,
  primaryFile?: RepoFileRecord,
): Promise<XRayModuleAudit> {
  const moduleContext = buildModuleInputContext(node, blueprint, circularCount, primaryFile);

  const questions: Record<
    string,
    {
      type: 'noul';
      instructions: string;
      criteria: {
        true_description: string;
        false_description: string;
      };
    }
  > = {};

  for (const pillar of XRAY_PILLARS) {
    questions[pillar.id] = {
      type: 'noul',
      instructions: pillar.questionTemplate.replace('{MODULE_LABEL}', node.label),
      criteria: {
        true_description: `Module demonstrates healthy architectural design, high reliability, and low risk for ${pillar.label.toLowerCase()}.`,
        false_description: `Module demonstrates architectural vulnerabilities, coupling anti-patterns, or technical debt for ${pillar.label.toLowerCase()}.`,
      },
    };
  }

  const response = await client.decisions.create({
    model: ENV.GEMINI_MODEL_DECISIONS,
    input: moduleContext,
    questions,
    api_version: 'v1beta',
  } as unknown as Parameters<typeof client.decisions.create>[0]);

  const cells = {} as Record<XRayPillarId, XRayCellScore>;
  let probSum = 0;

  for (const pillar of XRAY_PILLARS) {
    const rawAnswer = response?.answers?.[pillar.id];
    let p = 0.85;
    let confidence = 0.82;

    if (rawAnswer && rawAnswer.type === 'noul' && typeof rawAnswer.noul === 'number') {
      p = Math.max(0.01, Math.min(0.99, Number(rawAnswer.noul.toFixed(3))));
      confidence =
        typeof rawAnswer.confidence === 'number'
          ? Math.max(0.01, Math.min(1, Number(rawAnswer.confidence.toFixed(3))))
          : Number((1 - computeShannonEntropy(p) * 0.42).toFixed(3));
    } else if (rawAnswer && typeof (rawAnswer as any).probability === 'number') {
      p = Math.max(0.01, Math.min(0.99, Number((rawAnswer as any).probability.toFixed(3))));
      confidence = Number((1 - computeShannonEntropy(p) * 0.42).toFixed(3));
    } else {
      // Fallback deterministic probe for this specific pillar
      p = computeDeterministicPillarProb(pillar.id, node, circularCount, primaryFile);
      confidence = Number((1 - computeShannonEntropy(p) * 0.42).toFixed(3));
    }

    const entropy = computeShannonEntropy(p);
    const flag = generatePillarFlag(pillar.id, p, entropy, node, circularCount);

    cells[pillar.id] = {
      pillar: pillar.id,
      probabilityHealthy: p,
      confidence,
      entropy,
      ...(flag ? { flagSummary: flag } : {}),
    };
    probSum += p;
  }

  const overallHealth = Math.round((probSum / XRAY_PILLARS.length) * 100);
  const blastRadius = Number(
    Math.min(0.98, Math.max(0.12, node.centrality * 0.65 + (node.fanIn / 10) * 0.35)).toFixed(2),
  );

  return {
    nodeId: node.id,
    label: node.label,
    primaryFile: node.primaryFile,
    layer: node.layer,
    overallHealth,
    blastRadius,
    cells,
    topFinding: synthesizeTopFinding(node, cells, overallHealth),
  };
}

/**
 * Counts circular dependencies involving any of the module's paths.
 */
function getCircularDependenciesForNode(
  node: AtlasNode,
  dependencyEdges: DependencyEdge[],
): number {
  const paths = new Set(node.filePaths.concat(node.primaryFile));
  return dependencyEdges.filter(
    (e) => e.isCircular && (paths.has(e.source) || paths.has(e.target)),
  ).length;
}

/**
 * Selects candidate modules from the blueprint for X-Ray audit, prioritized by
 * architectural centrality, fanIn/fanOut connectivity, and token weight.
 */
function selectCandidateModules(
  blueprint: VisualAtlasBlueprint,
  maxModules: number,
): AtlasNode[] {
  if (blueprint.nodes.length > 0) {
    const sorted = [...blueprint.nodes].sort((a, b) => {
      // Prioritize high-centrality and high-connectivity nodes
      const scoreA = a.centrality * 2.0 + (a.fanIn + a.fanOut) * 0.15 + a.estimatedTokens * 0.0001;
      const scoreB = b.centrality * 2.0 + (b.fanIn + b.fanOut) * 0.15 + b.estimatedTokens * 0.0001;
      return scoreB - scoreA;
    });
    return sorted.slice(0, Math.max(1, maxModules));
  }

  // Fallback: If no atlas nodes exist, synthesize mock nodes from top files
  const topFiles = [...blueprint.files]
    .sort((a, b) => b.centrality - a.centrality || b.estimatedTokens - a.estimatedTokens)
    .slice(0, Math.max(1, maxModules));

  return topFiles.map((file, idx) => ({
    id: `node-${idx}-${file.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    label: file.name,
    subtitle: file.path,
    subsystemId: 'core-subsystem',
    layer: file.layer,
    kind: file.isEntrypoint ? 'api' : 'module',
    filePaths: [file.path],
    primaryFile: file.path,
    estimatedTokens: file.estimatedTokens,
    centrality: file.centrality,
    fanIn: file.fanIn,
    fanOut: file.fanOut,
    keySymbols: file.symbols.map((s) => s.name).slice(0, 6),
    visualBrief: `Primary source file at ${file.path} (${file.lineCount} lines).`,
    inputs: file.resolvedImports.slice(0, 5),
    outputs: file.exports.slice(0, 5),
  }));
}

/**
 * Runs the Decision-1 Calibrated X-Ray Engine across the codebase blueprint.
 *
 * Architecture:
 * 1. Dual-Key Sharded Execution: Divides target modules across configured v1beta
 *    Gemini clients for concurrent probing and high throughput.
 * 2. Decision-1 Calibrated Probability (Noul): Uses closed-world calibrated P(healthy).
 * 3. Shannon Entropy: Computes H(p) per cell to gauge architectural uncertainty.
 * 4. Adaptive Compute Routing: Evaluates the distribution of probe probabilities via
 *    `routeFromXRayProbs` to select the optimal downstream Gemini 4 model tier.
 * 5. Deterministic AST Fallback: If no Gemini keys are active or if the API returns an error,
 *    gracefully falls back to high-fidelity AST metrics without crashing.
 *
 * @param blueprint The VisualAtlasBlueprint representing the repository.
 * @param options BYOK key and optional max module count (defaults to 12).
 * @returns Complete XRayMatrixReport ready for interactive heatmap rendering.
 */
export async function runCodebaseXRay(
  blueprint: VisualAtlasBlueprint,
  options?: RunCodebaseXRayOptions,
): Promise<XRayMatrixReport> {
  const startTime = performance.now();
  const maxModules = options?.maxModules ?? 12;
  const candidateNodes = selectCandidateModules(blueprint, maxModules);
  const fileMap = new Map(blueprint.files.map((f) => [f.path, f]));

  const betaClients = getDualBetaClients(options?.byokApiKey);
  const isDualKey = betaClients.length >= 2;
  let modelUsed = ENV.GEMINI_MODEL_DECISIONS;

  const moduleAudits: XRayModuleAudit[] = [];

  if (betaClients.length > 0) {
    try {
      if (isDualKey) {
        // Dual-key sharding: divide candidate nodes into 2 interleaved shards
        const shard0Nodes: AtlasNode[] = [];
        const shard1Nodes: AtlasNode[] = [];

        candidateNodes.forEach((node, idx) => {
          if (idx % 2 === 0) {
            shard0Nodes.push(node);
          } else {
            shard1Nodes.push(node);
          }
        });

        const client0 = betaClients[0]?.client;
        const client1 = betaClients[1]?.client;

        const processShard = async (nodes: AtlasNode[], client: any): Promise<XRayModuleAudit[]> => {
          const results: XRayModuleAudit[] = [];
          for (const node of nodes) {
            const circCount = getCircularDependenciesForNode(node, blueprint.dependencyEdges);
            const primaryFile = fileMap.get(node.primaryFile);
            try {
              const audit = await auditModuleWithDecision1(
                client,
                node,
                blueprint,
                circCount,
                primaryFile,
              );
              results.push(audit);
            } catch (err) {
              console.warn(
                `[XRayDecisions] Decision-1 probe failed for module "${node.id}". Applying AST fallback:`,
                err instanceof Error ? err.message : String(err),
              );
              results.push(auditModuleWithDeterministicAST(node, circCount, primaryFile));
            }
          }
          return results;
        };

        const [shard0Results, shard1Results] = await Promise.all([
          processShard(shard0Nodes, client0),
          processShard(shard1Nodes, client1),
        ]);

        // Recombine in original candidate order
        const auditMap = new Map<string, XRayModuleAudit>();
        [...shard0Results, ...shard1Results].forEach((a) => auditMap.set(a.nodeId, a));
        candidateNodes.forEach((node) => {
          const audit = auditMap.get(node.id);
          if (audit) moduleAudits.push(audit);
        });
      } else {
        // Single client execution (e.g. BYOK or single env key)
        const client = betaClients[0]?.client;
        for (const node of candidateNodes) {
          const circCount = getCircularDependenciesForNode(node, blueprint.dependencyEdges);
          const primaryFile = fileMap.get(node.primaryFile);
          try {
            const audit = await auditModuleWithDecision1(
              client,
              node,
              blueprint,
              circCount,
              primaryFile,
            );
            moduleAudits.push(audit);
          } catch (err) {
            console.warn(
              `[XRayDecisions] Decision-1 probe failed for module "${node.id}". Applying AST fallback:`,
              err instanceof Error ? err.message : String(err),
            );
            moduleAudits.push(auditModuleWithDeterministicAST(node, circCount, primaryFile));
          }
        }
      }
    } catch (err) {
      console.warn(
        '[XRayDecisions] Dual-key Decision-1 execution failed; falling back to deterministic AST X-Ray:',
        err instanceof Error ? err.message : String(err),
      );
      moduleAudits.length = 0;
      modelUsed = 'deterministic-ast-xray';
    }
  } else {
    modelUsed = 'deterministic-ast-xray';
  }

  // If no audits were completed (or if Decision-1 failed entirely), run deterministic AST for all candidates
  if (moduleAudits.length === 0) {
    modelUsed = 'deterministic-ast-xray';
    for (const node of candidateNodes) {
      const circCount = getCircularDependenciesForNode(node, blueprint.dependencyEdges);
      const primaryFile = fileMap.get(node.primaryFile);
      moduleAudits.push(auditModuleWithDeterministicAST(node, circCount, primaryFile));
    }
  }

  // Calculate pillar averages and aggregate metrics
  const pillarTotals: Record<XRayPillarId, number> = {
    modularity: 0,
    security: 0,
    resilience: 0,
    testability: 0,
    api_clarity: 0,
    concurrency: 0,
    scalability: 0,
    hygiene: 0,
    onboarding: 0,
  };

  const allProbs: number[] = [];
  let entropySum = 0;
  let totalCellCount = 0;

  for (const module of moduleAudits) {
    for (const pillar of XRAY_PILLARS) {
      const cell = module.cells[pillar.id];
      if (cell) {
        pillarTotals[pillar.id] += cell.probabilityHealthy * 100;
        allProbs.push(cell.probabilityHealthy);
        entropySum += cell.entropy;
        totalCellCount += 1;
      }
    }
  }

  const moduleCount = Math.max(1, moduleAudits.length);
  const pillarAverages = {} as Record<XRayPillarId, number>;
  let avgSum = 0;

  for (const pillar of XRAY_PILLARS) {
    const avg = Math.round(pillarTotals[pillar.id] / moduleCount);
    pillarAverages[pillar.id] = avg;
    avgSum += avg;
  }

  const overallScore = Math.round(avgSum / XRAY_PILLARS.length);
  const meanEntropy = Number((entropySum / Math.max(1, totalCellCount)).toFixed(3));

  // Determine compute tier routing from X-Ray probabilities
  const route = routeFromXRayProbs(allProbs);
  const latencyMs = Math.round(performance.now() - startTime);

  return {
    model: modelUsed,
    totalProbes: totalCellCount,
    dualKeySharded: isDualKey && modelUsed !== 'deterministic-ast-xray',
    latencyMs,
    overallScore,
    meanEntropy,
    recommendedModelTier: route.tier,
    routingRationale: route.rationale,
    pillarAverages,
    modules: moduleAudits,
    generatedAt: new Date().toISOString(),
  };
}
