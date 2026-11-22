// =============================================================================
// GitUnderstand (git-understand.com) — Antigravity Managed Forensics Agent
// Autonomous repository forensics using antigravity-preview-09-2026 / deep-research
// on Gemini v1beta, with graceful fallback to gemini-4-carbon and deterministic audit.
// =============================================================================

import { ENV } from '../config/env.js';
import { withV1Client, withV1BetaClient, hasGeminiCredentials } from './clientPool.js';
import { extractInteractionText, extractJsonObject } from './mediaUtils.js';
import type { ForensicsReport, VisualAtlasBlueprint } from '../../../shared/types.js';

interface RawForensicFinding {
  severity?: unknown;
  title?: unknown;
  evidence?: unknown;
  filePath?: unknown;
  recommendation?: unknown;
}

interface RawForensicsOutput {
  summary?: unknown;
  findings?: unknown;
}

type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Normalizes an arbitrary severity string into canonical ForensicsReport severity.
 */
function normalizeSeverity(raw: unknown): FindingSeverity {
  if (typeof raw !== 'string') {
    return 'medium';
  }
  const clean = raw.trim().toLowerCase();
  if (clean === 'critical') return 'critical';
  if (clean === 'high') return 'high';
  if (clean === 'medium') return 'medium';
  if (clean === 'low') return 'low';
  if (clean === 'info' || clean === 'informational') return 'info';
  return 'medium';
}

/**
 * Normalizes raw parsed findings into strictly typed ForensicsReport findings.
 */
function normalizeFindings(rawFindings: unknown): ForensicsReport['findings'] {
  if (!Array.isArray(rawFindings)) {
    return [];
  }

  const results: ForensicsReport['findings'] = [];

  for (const item of rawFindings) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const finding = item as RawForensicFinding;
    const title = typeof finding.title === 'string' && finding.title.trim()
      ? finding.title.trim()
      : 'Architectural / Security Finding';
    const evidence = typeof finding.evidence === 'string' && finding.evidence.trim()
      ? finding.evidence.trim()
      : 'Identified during structural forensic analysis of codebase graph.';
    const recommendation = typeof finding.recommendation === 'string' && finding.recommendation.trim()
      ? finding.recommendation.trim()
      : 'Review file and subsystem boundaries to decouple modules and mitigate blast radius.';
    const filePath = typeof finding.filePath === 'string' && finding.filePath.trim()
      ? finding.filePath.trim()
      : undefined;

    results.push({
      severity: normalizeSeverity(finding.severity),
      title,
      evidence,
      filePath,
      recommendation,
    });
  }

  return results;
}

/**
 * Builds a dense architectural and security context prompt for the forensics agent.
 */
function buildForensicsPrompt(
  blueprint: VisualAtlasBlueprint,
  mode: 'managed_agent' | 'deep_research'
): string {
  const repoSlug = blueprint.metadata?.fullName || blueprint.repoId;
  const isDeepResearch = mode === 'deep_research';

  // High-risk nodes and bottleneck services
  const hotspotNodes = blueprint.nodes
    .filter((n) => n.centrality > 0.4 || n.fanIn > 4 || (n.riskScore && n.riskScore > 0.3))
    .slice(0, 15)
    .map(
      (n) =>
        `- Node: "${n.label}" (${n.primaryFile}) | Layer: ${n.layer} | Centrality: ${n.centrality.toFixed(
          2
        )} | FanIn: ${n.fanIn} | FanOut: ${n.fanOut} | Risk: ${n.riskScore?.toFixed(2) ?? 'N/A'}`
    );

  // Circular dependencies
  const circularEdges = blueprint.dependencyEdges
    .filter((e) => e.isCircular)
    .slice(0, 12)
    .map((e) => `- ${e.source} <--> ${e.target} (${e.kind})`);

  // Subsystem clusters
  const subsystemSummary = blueprint.subsystems.slice(0, 8).map(
    (s) =>
      `- Subsystem "${s.name}" (${s.layer}): ${s.filePaths.length} files, ${s.totalTokens} tokens. Invariants: ${
        s.invariants?.join('; ') || 'None stated'
      }`
  );

  // X-Ray insights if available
  const xrayFindings: string[] = [];
  if (blueprint.xray) {
    xrayFindings.push(
      `Overall X-Ray Health: ${blueprint.xray.overallScore}/100, Mean Entropy: ${blueprint.xray.meanEntropy}`
    );
    const lowHealthModules = blueprint.xray.modules
      .filter((m) => m.overallHealth < 75)
      .slice(0, 8);
    for (const mod of lowHealthModules) {
      xrayFindings.push(`- Module "${mod.label}" (${mod.primaryFile}): Health ${mod.overallHealth}/100. Finding: ${mod.topFinding}`);
    }
  }

  // Key execution flows
  const flowSummary = blueprint.flows.slice(0, 5).map(
    (f) => `- Flow "${f.title}" (${f.category}): ${f.trigger} -> ${f.steps.length} steps`
  );

  return `
You are the Antigravity Autonomous Codebase Forensics Agent for GitUnderstand (git-understand.com).
Your assignment is to conduct an uncompromising, visual-first architectural, security, and resilience forensics investigation for repository "${repoSlug}".

${isDeepResearch ? 'MODE: Deep Research Multi-Turn Investigation' : 'MODE: Antigravity Managed Forensics Agent'}

---
REPOSITORY BLUEPRINT & TOPOLOGY DIGEST:
- Repository: ${repoSlug} (${blueprint.metadata?.primaryLanguage ?? 'TypeScript'}, ${blueprint.metadata?.stars ?? 0} stars)
- Architecture Pattern: ${blueprint.architecturePattern}
- Tech Stack Badges: ${blueprint.techStackBadges.join(', ') || 'N/A'}
- Scale: ${blueprint.stats.totalFiles} files, ${blueprint.stats.totalLines} lines, ${blueprint.stats.totalTokens} estimated tokens
- Circular Dependencies: ${blueprint.stats.circularDeps} detected
- Average Fan-Out: ${blueprint.stats.avgFanOut.toFixed(2)}

CIRCULAR DEPENDENCY EDGES:
${circularEdges.length > 0 ? circularEdges.join('\n') : 'No circular dependencies detected.'}

HIGH CENTRALITY & BLAST RADIUS NODES:
${hotspotNodes.length > 0 ? hotspotNodes.join('\n') : 'No critical hotspots detected.'}

SUBSYSTEM CLUSTERS:
${subsystemSummary.join('\n') || 'No subsystems defined.'}

${xrayFindings.length > 0 ? `X-RAY DECISION MATRIX AUDIT:\n${xrayFindings.join('\n')}\n` : ''}
EXECUTION FLOW TRACES:
${flowSummary.join('\n') || 'No execution flows defined.'}

---
INVESTIGATION DIRECTIVES:
Conduct a comprehensive forensics audit across these five critical dimensions:
1. SECURITY & HYGIENE:
   - Identify secret leakage hazards, authentication/authorization gaps, unvalidated input boundaries, or insecure dependencies.
   - Flag any dangerous entrypoints, exposed internal endpoints, or lack of request validation.
2. ARCHITECTURE & MODULARITY:
   - Untangle circular dependencies, monolithic file risks, tight coupling, and layer violations (e.g. client directly bypassing orchestration to access data).
   - Evaluate single points of failure (SPOFs) and blast radius amplification.
3. CONCURRENCY & PERFORMANCE:
   - Unbounded memory consumption, missing backpressure in data pipelines, unhandled Promise rejections, and race conditions.
4. OPERATIONAL RESILIENCE:
   - Missing fallback mechanisms, unhandled error boundaries, crash propagation paths, or fragile external integrations.
5. REMEDIATION ROADMAP:
   - Provide concrete, prioritized, visual-first recommendations with exact file paths and evidence.

---
OUTPUT CONTRACT:
You MUST respond with valid JSON matching this schema:
{
  "summary": "<String: 2-3 paragraph executive summary of forensic findings, architectural risk profile, and overall posture>",
  "findings": [
    {
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "title": "<String: clear descriptive title>",
      "evidence": "<String: specific architectural, graph, or code evidence>",
      "filePath": "<String: optional relative file path>",
      "recommendation": "<String: actionable, precise remediation advice>"
    }
  ]
}

Ensure all JSON strings are valid, well-escaped, and strictly adhere to the schema. Output JSON ONLY.
`.trim();
}

/**
 * Performs a deterministic static security and architecture audit on a VisualAtlasBlueprint.
 * Used when Gemini API credentials are unconfigured or when both managed agent and fallback calls fail.
 */
export function runDeterministicStaticAudit(blueprint: VisualAtlasBlueprint): ForensicsReport {
  const findings: ForensicsReport['findings'] = [];
  const repoSlug = blueprint.metadata?.fullName || blueprint.repoId;

  // 1. Circular dependencies check
  const circularEdges = blueprint.dependencyEdges.filter((e) => e.isCircular);
  if (circularEdges.length > 0) {
    for (const edge of circularEdges.slice(0, 6)) {
      findings.push({
        severity: 'high',
        title: `Circular Dependency Cycle: ${edge.source} <--> ${edge.target}`,
        evidence: `Bidirectional architectural coupling detected between module "${edge.source}" and "${edge.target}" (${edge.kind} relationship). Breaks modular stratum isolation.`,
        filePath: edge.source.includes('/') ? edge.source : undefined,
        recommendation: `Decouple modules by introducing an event dispatcher, mediator interface, or dependency inversion contract.`,
      });
    }
  }

  // 2. High blast radius / bottleneck nodes
  const criticalNodes = blueprint.nodes.filter(
    (n) => n.centrality > 0.65 || n.fanIn >= 5 || (n.fanOut >= 8 && n.centrality > 0.4)
  );
  for (const node of criticalNodes.slice(0, 5)) {
    findings.push({
      severity: node.centrality > 0.8 ? 'high' : 'medium',
      title: `Architectural Hotspot & Blast Radius: ${node.label}`,
      evidence: `Node "${node.label}" in stratum "${node.layer}" has centrality ${node.centrality.toFixed(
        2
      )} with fan-in of ${node.fanIn} and fan-out of ${node.fanOut}. A regression here cascades across ${
        node.filePaths.length
      } associated files.`,
      filePath: node.primaryFile,
      recommendation: `Decompose monolithic responsibilities into smaller single-responsibility interfaces and apply defensive contract validation.`,
    });
  }

  // 3. Layer boundary violations (e.g. client directly touching data or infrastructure)
  const clientToDataEdges = blueprint.dependencyEdges.filter((e) => {
    const srcNode = blueprint.nodes.find((n) => n.id === e.source);
    const tgtNode = blueprint.nodes.find((n) => n.id === e.target);
    return (
      srcNode?.layer === 'client' &&
      (tgtNode?.layer === 'data' || tgtNode?.layer === 'infrastructure')
    );
  });
  for (const edge of clientToDataEdges.slice(0, 4)) {
    findings.push({
      severity: 'medium',
      title: `Architectural Layer Boundary Leakage: ${edge.source} -> ${edge.target}`,
      evidence: `Client-tier module "${edge.source}" directly invokes data/infrastructure module "${edge.target}", bypassing orchestration and domain security boundaries.`,
      filePath: edge.source.includes('/') ? edge.source : undefined,
      recommendation: `Route client requests through typed orchestration route handlers or API gateway proxies to prevent data tier exposure.`,
    });
  }

  // 4. Sensitive file / credential hazard heuristics
  const SENSITIVE_PATTERNS = [
    { regex: /(^|\/)\.env(\.(local|production|stage|prod|dev))?$/i, label: 'Environment Secret File' },
    { regex: /(^|\/)(credentials|secrets?|private_key|id_rsa)\b/i, label: 'Private Credential Store' },
    { regex: /\.(pem|key|pfx|p12)$/i, label: 'Cryptographic Key Pair' },
  ];

  for (const file of blueprint.files) {
    for (const pat of SENSITIVE_PATTERNS) {
      if (pat.regex.test(file.path)) {
        findings.push({
          severity: 'critical',
          title: `Sensitive Credential Exposure Hazard: ${file.name}`,
          evidence: `Repository manifest contains file "${file.path}" matching ${pat.label} pattern.`,
          filePath: file.path,
          recommendation: `Ensure file is added to .gitignore and that credentials are rotated immediately and migrated to a cloud secret manager.`,
        });
        break;
      }
    }
  }

  // 5. Monolithic file complexity hazards
  const monolithicFiles = blueprint.files.filter(
    (f) => f.lineCount > 800 || f.estimatedTokens > 10_000
  );
  for (const file of monolithicFiles.slice(0, 4)) {
    findings.push({
      severity: 'medium',
      title: `Monolithic Code Unit: ${file.path} (${file.lineCount} lines)`,
      evidence: `File spans ${file.lineCount} lines (~${file.estimatedTokens} tokens) with ${file.symbols.length} code symbols, posing high cognitive overhead and merge collision risks.`,
      filePath: file.path,
      recommendation: `Refactor into modular subcomponents or domain services to improve testability and maintainability.`,
    });
  }

  // 6. Test coverage deficit audit
  const testFiles = blueprint.files.filter((f) => f.isTest);
  const testRatio = testFiles.length / Math.max(1, blueprint.files.length);
  if (blueprint.files.length >= 15 && testRatio < 0.08) {
    findings.push({
      severity: 'medium',
      title: `Low Automated Test Ratio (${(testRatio * 100).toFixed(1)}%)`,
      evidence: `Repository contains ${blueprint.files.length} analyzed files but only ${testFiles.length} automated test units were detected.`,
      recommendation: `Establish regression coverage for high-centrality entrypoints and domain models before production promotion.`,
    });
  }

  // 7. X-Ray Matrix correlation if available
  if (blueprint.xray?.modules) {
    const unhealthyModules = blueprint.xray.modules.filter((m) => m.overallHealth < 50);
    for (const mod of unhealthyModules.slice(0, 4)) {
      findings.push({
        severity: 'high',
        title: `Decision-1 X-Ray Health Alert: ${mod.label}`,
        evidence: `X-Ray Matrix reported degraded health of ${mod.overallHealth}/100. Diagnostic finding: "${mod.topFinding}"`,
        filePath: mod.primaryFile,
        recommendation: `Address architectural friction points flagged in the X-Ray Decision Matrix inspection.`,
      });
    }
  }

  // Baseline reassurance if repository is exceptionally clean
  if (findings.length === 0) {
    findings.push({
      severity: 'info',
      title: `Clean Architectural Baseline Verified`,
      evidence: `Static topology scan across ${blueprint.stats.totalFiles} files detected zero circular dependencies, balanced stratum isolation, and healthy fan-out.`,
      recommendation: `Maintain modular hygiene, strict linting rules, and dependency boundaries as the codebase scales.`,
    });
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;

  const summary = [
    `Static Forensics Audit completed for "${repoSlug}".`,
    `Topology assessment evaluated ${blueprint.stats.totalFiles} files (${blueprint.stats.totalTokens} tokens) across ${blueprint.subsystems.length} architectural subsystems.`,
    `Identified ${findings.length} findings (${criticalCount} critical, ${highCount} high, ${mediumCount} medium). ${
      circularEdges.length > 0
        ? `Attention required for ${circularEdges.length} circular dependency cycle(s).`
        : 'Zero circular dependencies detected.'
    }`,
  ].join(' ');

  return {
    id: `forensics-${blueprint.repoId}-${Date.now()}`,
    agent: 'deterministic-static-audit',
    status: 'completed',
    summary,
    findings,
    environmentId: 'static-graph-evaluator',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Executes an autonomous repository forensics investigation for a repository blueprint.
 *
 * Tier 1: Uses `antigravity-preview-09-2026` or `deep-research-preview-04-2026` via v1beta Gemini API.
 * Tier 2: Falls back cleanly to `gemini-4-carbon` via v1 Gemini API.
 * Tier 3: Falls back to deterministic static graph & security audit if API fails or credentials are absent.
 *
 * @param blueprint The visual atlas blueprint of the ingested repository.
 * @param mode Either 'managed_agent' (Antigravity Forensics) or 'deep_research' (Deep Research Agent).
 * @param byokApiKey Optional user-supplied Bring Your Own Key.
 * @returns Comprehensive ForensicsReport with executive summary and prioritized findings.
 */
export async function runRepoForensics(
  blueprint: VisualAtlasBlueprint,
  mode: 'managed_agent' | 'deep_research',
  byokApiKey?: string
): Promise<ForensicsReport> {
  const repoSlug = blueprint.metadata?.fullName || blueprint.repoId;
  const prompt = buildForensicsPrompt(blueprint, mode);

  // Check if API credentials exist
  const hasCredentials = hasGeminiCredentials(byokApiKey);
  if (!hasCredentials) {
    console.info(
      `[ForensicsAgent] No Gemini credentials configured. Running deterministic static audit for "${repoSlug}"...`
    );
    return runDeterministicStaticAudit(blueprint);
  }

  // ---------------------------------------------------------------------------
  // Tier 1: Gemini v1beta Managed Agent (Antigravity / Deep Research)
  // ---------------------------------------------------------------------------
  const agentName =
    mode === 'managed_agent'
      ? ENV.GEMINI_MANAGED_AGENT || 'antigravity-preview-09-2026'
      : ENV.GEMINI_DEEP_RESEARCH || 'deep-research-preview-04-2026';

  try {
    console.info(
      `[ForensicsAgent] Dispatching managed agent "${agentName}" (v1beta) for "${repoSlug}"...`
    );

    const interaction = await withV1BetaClient(async (client) => {
      const agentConfig =
        mode === 'managed_agent'
          ? {
              type: 'antigravity' as const,
              model: ENV.GEMINI_MODEL_ARCHITECT,
            }
          : {
              collaborative_planning: false,
            };

      const params: Record<string, unknown> = {
        agent: agentName,
        input: prompt,
        agent_config: agentConfig,
        store: false,
      };

      // Type-safe SDK cast for beta agent parameter schema
      return await client.interactions.create(
        params as unknown as Parameters<typeof client.interactions.create>[0]
      );
    }, byokApiKey);

    const rawText = extractInteractionText(interaction);
    const parsed = extractJsonObject<RawForensicsOutput>(rawText);

    if (parsed && typeof parsed === 'object') {
      const summary =
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : `Forensics investigation completed by ${agentName} for ${repoSlug}.`;
      const findings = normalizeFindings(parsed.findings);

      if (findings.length > 0 || summary.length > 50) {
        // Extract environment ID if available from the interaction response
        let environmentId: string | undefined;
        if (interaction && typeof interaction === 'object') {
          const envObj = (interaction as Record<string, unknown>).environment;
          if (typeof envObj === 'string') {
            environmentId = envObj;
          } else if (envObj && typeof envObj === 'object') {
            const idVal = (envObj as Record<string, unknown>).id;
            if (typeof idVal === 'string') {
              environmentId = idVal;
            }
          }
        }

        return {
          id: `forensics-${blueprint.repoId}-${Date.now()}`,
          agent: agentName,
          status: 'completed',
          summary,
          findings,
          environmentId: environmentId || `managed-${mode}-env`,
          generatedAt: new Date().toISOString(),
        };
      }
    }

    console.warn(
      `[ForensicsAgent] Managed agent "${agentName}" returned unparseable or empty output. Proceeding to Gemini 4 Carbon fallback...`
    );
  } catch (agentErr) {
    console.warn(
      `[ForensicsAgent] Managed agent "${agentName}" failed: ${
        agentErr instanceof Error ? agentErr.message : String(agentErr)
      }. Proceeding to Gemini 4 Carbon fallback...`
    );
  }

  // ---------------------------------------------------------------------------
  // Tier 2: Gemini 4 Carbon Reasoning Model Fallback (v1)
  // ---------------------------------------------------------------------------
  const fallbackModel = ENV.GEMINI_MODEL_ARCHITECT || 'gemini-4-carbon';

  try {
    console.info(
      `[ForensicsAgent] Dispatching fallback reasoning audit with "${fallbackModel}" (v1) for "${repoSlug}"...`
    );

    const interaction = await withV1Client(async (client) => {
      const params: Record<string, unknown> = {
        model: fallbackModel,
        input: prompt,
        generation_config: {
          thinking_level: 'high',
          response_mime_type: 'application/json',
        },
      };

      return await client.interactions.create(
        params as unknown as Parameters<typeof client.interactions.create>[0]
      );
    }, byokApiKey);

    const rawText = extractInteractionText(interaction);
    const parsed = extractJsonObject<RawForensicsOutput>(rawText);

    if (parsed && typeof parsed === 'object') {
      const summary =
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : `Architectural and security forensics audit completed by ${fallbackModel} for ${repoSlug}.`;
      const findings = normalizeFindings(parsed.findings);

      if (findings.length > 0 || summary.length > 50) {
        return {
          id: `forensics-${blueprint.repoId}-${Date.now()}`,
          agent: `${fallbackModel}-fallback`,
          status: 'completed',
          summary,
          findings,
          environmentId: `gemini-4-reasoning-env`,
          generatedAt: new Date().toISOString(),
        };
      }
    }

    console.warn(
      `[ForensicsAgent] Fallback model "${fallbackModel}" returned unparseable output. Proceeding to deterministic static audit...`
    );
  } catch (fallbackErr) {
    console.warn(
      `[ForensicsAgent] Fallback model "${fallbackModel}" failed: ${
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      }. Proceeding to deterministic static audit...`
    );
  }

  // ---------------------------------------------------------------------------
  // Tier 3: Deterministic Static Security and Graph Audit Fallback
  // ---------------------------------------------------------------------------
  console.info(
    `[ForensicsAgent] Executing deterministic static graph & security audit for "${repoSlug}"...`
  );
  return runDeterministicStaticAudit(blueprint);
}
