// =============================================================================
// GitUnderstand (git-understand.com) — Built-in HTTP MCP Server
// Model Context Protocol (MCP) Streamable HTTP Server & JSON-RPC 2.0 Router
// Exposes visual architecture intelligence, 3D strata, Decision-1 X-Ray audits,
// surgical Gitingest digests, and multimodal code search to coding agents.
// =============================================================================

import { Router, type Request, type Response } from 'express';
import type {
  VisualAtlasBlueprint,
  XRayPillarId,
  XRayMatrixReport,
  CompiledDigest,
  VisualSearchMatch,
} from '../../../shared/types.js';

import { analyzeRepositoryFull } from '../orchestrator/atlasPipeline.js';
import {
  compileDigest,
  compileAgentMarkdownBrief,
  renderAsciiTree,
} from '../ingest/digestCompiler.js';
import { runCodebaseXRay, XRAY_PILLARS } from '../gemini/xrayDecisions.js';
import { searchRepoMultimodal } from '../gemini/visualSearch.js';

/**
 * MCP Tool Definition conforming to Model Context Protocol specification.
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Standard JSON-RPC 2.0 Request envelope.
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

/**
 * Standard JSON-RPC 2.0 Response envelope.
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Canonical 5 MCP Tools exported by GitUnderstand.
 */
export const MCP_TOOLS_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'understand_repo',
    description:
      'Analyzes a GitHub repository and returns a progressive visual architecture blueprint summary, executive headline, one-liner, architecture pattern, 3D strata layers, subsystem clusters, key entrypoints, and interactive web canvas link.',
    inputSchema: {
      type: 'object',
      properties: {
        repoUrl: {
          type: 'string',
          description:
            "GitHub repository URL (e.g. 'https://github.com/facebook/react'), slug ('facebook/react'), or git-understand.com URL.",
        },
        byokApiKey: {
          type: 'string',
          description:
            'Optional user BYOK Google Gemini API key for deep architectural synthesis and visual choreography.',
        },
        forceRefresh: {
          type: 'boolean',
          description:
            'Whether to bypass LRU/disk cache and re-ingest/re-synthesize fresh blueprint (default: false).',
        },
      },
      required: ['repoUrl'],
    },
  },
  {
    name: 'get_architecture_diagram',
    description:
      'Generates and retrieves interconnected Mermaid diagrams (high-level subsystem architecture flowchart, request sequence diagram, class/interface hierarchy, or entity-relationship matrix) with node-to-source file mappings.',
    inputSchema: {
      type: 'object',
      properties: {
        repoUrl: {
          type: 'string',
          description: 'GitHub repository URL or slug.',
        },
        kind: {
          type: 'string',
          enum: ['all', 'architecture', 'sequence', 'class', 'er'],
          description:
            "Diagram type to retrieve: 'architecture' (Obsidian Cobalt subsystem strata flowchart), 'sequence' (core request lifecycle), 'class' (exported symbol interfaces), 'er' (subsystem entity relationships), or 'all' (default: 'all').",
        },
        byokApiKey: {
          type: 'string',
          description: 'Optional Gemini API key.',
        },
      },
      required: ['repoUrl'],
    },
  },
  {
    name: 'get_repo_digest',
    description:
      'Compiles a surgical Gitingest-compatible token-budgeted code digest, agent-ready visual architecture markdown brief, or directory structure with strict token budgeting and priority ranking.',
    inputSchema: {
      type: 'object',
      properties: {
        repoUrl: {
          type: 'string',
          description: 'GitHub repository URL or slug.',
        },
        format: {
          type: 'string',
          enum: ['digest', 'brief', 'tree'],
          description:
            "Digest format: 'digest' (Gitingest token-budgeted code file blocks), 'brief' (markdown visual architecture brief), or 'tree' (Unicode box-drawing tree). Default: 'digest'.",
        },
        maxTotalTokens: {
          type: 'number',
          description:
            'Maximum token budget for included source files (default: 100,000, max: 500,000).',
        },
        includeTests: {
          type: 'boolean',
          description: 'Whether to include unit/integration test files (default: false).',
        },
        includeDocs: {
          type: 'boolean',
          description: 'Whether to include documentation and markdown files (default: true).',
        },
        selectedSubsystems: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional array of subsystem names or IDs to surgically slice context to specific architectural layers.',
        },
        includePatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional glob patterns of files to explicitly include.',
        },
        excludePatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional glob patterns of files to exclude.',
        },
      },
      required: ['repoUrl'],
    },
  },
  {
    name: 'run_xray_audit',
    description:
      'Executes the Decision-1 9-pillar calibrated architectural health audit across key repository modules, providing Shannon entropy uncertainty scoring, blast radius analysis, and recommended Gemini model tier.',
    inputSchema: {
      type: 'object',
      properties: {
        repoUrl: {
          type: 'string',
          description: 'GitHub repository URL or slug.',
        },
        maxModules: {
          type: 'number',
          description:
            'Maximum candidate architectural modules to evaluate (default: 8, max: 20).',
        },
        byokApiKey: {
          type: 'string',
          description:
            'Optional user BYOK Google Gemini API key for live Decision-1 Noul questions.',
        },
      },
      required: ['repoUrl'],
    },
  },
  {
    name: 'search_codebase',
    description:
      'Performs semantic and multimodal vector search across visual Atlas nodes using Gemini Embedding-2 (or deterministic lexical AST fallback) to locate services, entrypoints, and functions matching queries or image lasso regions.',
    inputSchema: {
      type: 'object',
      properties: {
        repoUrl: {
          type: 'string',
          description: 'GitHub repository URL or slug.',
        },
        query: {
          type: 'string',
          description:
            'Semantic query describing component role, contract, algorithm, bug symptom, or symbol name.',
        },
        imageBase64: {
          type: 'string',
          description:
            'Optional base64-encoded image data (canvas lasso screenshot, architecture sketch, or diagram).',
        },
        imageMimeType: {
          type: 'string',
          description: "MIME type for imageBase64 (e.g. 'image/png', 'image/jpeg').",
        },
        topK: {
          type: 'number',
          description: 'Maximum number of ranked matching nodes to return (default: 5).',
        },
        byokApiKey: {
          type: 'string',
          description: 'Optional user BYOK Google Gemini API key.',
        },
      },
      required: ['repoUrl'],
    },
  },
];

/**
 * Server discovery metadata returned on GET /.
 */
export function getMcpDiscoveryPayload(): Record<string, unknown> {
  return {
    name: 'git-understand-mcp',
    version: '3.0.0',
    description:
      'GitUnderstand Built-in HTTP MCP Server — Visual repository intelligence, 3D architectural strata, Decision-1 X-Ray audits, Gitingest digests, and multimodal code search.',
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
    endpoints: {
      http: '/',
      rpc: '/',
    },
    tools: MCP_TOOLS_DEFINITIONS,
    status: 'online',
    timestamp: new Date().toISOString(),
  };
}

// -----------------------------------------------------------------------------
// Tool Executors
// -----------------------------------------------------------------------------

/**
 * Tool: understand_repo
 */
async function executeUnderstandRepo(
  args: Record<string, any>
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const repoUrl = String(args?.repoUrl || '').trim();
  if (!repoUrl) {
    throw new Error("Missing required argument: 'repoUrl'");
  }

  const blueprint: VisualAtlasBlueprint = await analyzeRepositoryFull(repoUrl, {
    byokApiKey: args?.byokApiKey,
    forceRefresh: Boolean(args?.forceRefresh),
  });

  const slug = blueprint.metadata.fullName || blueprint.repoId;
  const webAppUrl = `https://git-understand.com/${slug}`;

  const mdSections: string[] = [
    `# GitUnderstand Visual Architecture Blueprint: ${slug}`,
    `> **Interactive 3D Canvas:** [${webAppUrl}](${webAppUrl})`,
    `> **Pattern:** \`${blueprint.architecturePattern || 'Modular Multi-Tier Monorepo'}\``,
    '',
    `### Executive Architecture Summary`,
    blueprint.headline || blueprint.metadata.description || 'No description provided.',
    '',
    `*${blueprint.oneLiner || 'Decoupled multi-tier subsystem architecture.'}*`,
    '',
    `## Repository Strata & Topology`,
    `| Metric | Value |`,
    `| :--- | :--- |`,
    `| **Analyzed Files** | ${blueprint.stats.analyzedFiles} / ${blueprint.stats.totalFiles} |`,
    `| **Total Estimated Tokens** | ${blueprint.stats.totalTokens.toLocaleString()} |`,
    `| **Subsystems** | ${blueprint.subsystems.length} clusters |`,
    `| **Architectural Nodes** | ${blueprint.nodes.length} nodes |`,
    `| **Circular Dependencies** | ${blueprint.stats.circularDeps} |`,
    `| **Average Fan-Out** | ${blueprint.stats.avgFanOut.toFixed(2)} |`,
    `| **AI Enriched** | ${blueprint.aiEnriched ? `Yes (${blueprint.modelsUsed.join(', ')})` : 'Deterministic AST'} |`,
    '',
  ];

  // Subsystems Table
  if (blueprint.subsystems.length > 0) {
    mdSections.push(`## Architectural Subsystems`);
    mdSections.push(`| Subsystem | Layer | Files | Tokens | Key Invariant |`);
    mdSections.push(`| :--- | :---: | :---: | :---: | :--- |`);
    for (const sub of blueprint.subsystems) {
      const invariant = sub.invariants?.[0] || sub.tagline || 'Isolated stratum';
      mdSections.push(
        `| **${sub.name}** | \`${sub.layer}\` | ${sub.filePaths.length} | ${sub.totalTokens.toLocaleString()} | ${invariant} |`
      );
    }
    mdSections.push('');
  }

  // 3D Strata
  if (blueprint.strata.length > 0) {
    mdSections.push(`## 3D Strata Elevation Layout`);
    mdSections.push(`| Level | Layer | Title | Files | Description |`);
    mdSections.push(`| :---: | :--- | :--- | :---: | :--- |`);
    const sortedStrata = [...blueprint.strata].sort((a, b) => b.elevation - a.elevation);
    for (const st of sortedStrata) {
      mdSections.push(
        `| ${st.elevation} | \`${st.layer}\` | **${st.title}** | ${st.fileCount} | ${st.description} |`
      );
    }
    mdSections.push('');
  }

  // Critical Entrypoints
  const entrypoints = blueprint.files
    .filter((f) => f.isEntrypoint || f.centrality > 0.6)
    .sort((a, b) => b.centrality - a.centrality)
    .slice(0, 10);

  if (entrypoints.length > 0) {
    mdSections.push(`## Key Architectural Entrypoints`);
    for (const ep of entrypoints) {
      mdSections.push(
        `- **\`${ep.path}\`** (${ep.layer}, centrality: ${(ep.centrality * 100).toFixed(0)}%, tokens: ${ep.estimatedTokens})`
      );
    }
    mdSections.push('');
  }

  // Decision-1 X-Ray Health Glance
  if (blueprint.xray) {
    mdSections.push(`## Decision-1 X-Ray Architectural Health`);
    mdSections.push(`- **Overall Codebase Health:** **${blueprint.xray.overallScore}/100**`);
    mdSections.push(`- **Calibrated Mean Entropy:** \`${blueprint.xray.meanEntropy}\``);
    mdSections.push(`- **Recommended Model Tier:** \`${blueprint.xray.recommendedModelTier}\``);
    mdSections.push(`- **Routing Rationale:** ${blueprint.xray.routingRationale}`);
    mdSections.push('');
  }

  mdSections.push(`---`);
  mdSections.push(
    `💡 *Visual-first tip:* To explore diagrams, request \`get_architecture_diagram\` or view the interactive canvas at [${webAppUrl}](${webAppUrl}).`
  );

  return {
    content: [
      {
        type: 'text',
        text: mdSections.join('\n'),
      },
    ],
    isError: false,
  };
}

/**
 * Tool: get_architecture_diagram
 */
async function executeGetArchitectureDiagram(
  args: Record<string, any>
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const repoUrl = String(args?.repoUrl || '').trim();
  if (!repoUrl) {
    throw new Error("Missing required argument: 'repoUrl'");
  }

  const kind = String(args?.kind || 'all').toLowerCase();
  const blueprint: VisualAtlasBlueprint = await analyzeRepositoryFull(repoUrl, {
    byokApiKey: args?.byokApiKey,
  });

  const allDiagrams = blueprint.diagrams || [];
  let selected = allDiagrams;
  if (kind !== 'all') {
    selected = allDiagrams.filter((d) => d.kind.toLowerCase() === kind);
  }

  if (selected.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No diagrams found matching kind "${kind}" for repository ${blueprint.metadata.fullName}. Available diagrams: ${allDiagrams.map((d) => d.kind).join(', ') || 'none'}.`,
        },
      ],
      isError: false,
    };
  }

  const outputParts: string[] = [
    `# Architectural Diagrams: ${blueprint.metadata.fullName}`,
    `> **Interactive Visual Canvas:** [https://git-understand.com/${blueprint.metadata.fullName}](https://git-understand.com/${blueprint.metadata.fullName})`,
    '',
  ];

  for (const diag of selected) {
    outputParts.push(`## ${diag.title}`);
    if (diag.subtitle) {
      outputParts.push(`*${diag.subtitle}*`);
    }
    outputParts.push('');
    outputParts.push('```mermaid');
    outputParts.push(diag.code.trim());
    outputParts.push('```');
    outputParts.push('');

    if (diag.nodeFileMap && Object.keys(diag.nodeFileMap).length > 0) {
      const topMappings = Object.entries(diag.nodeFileMap).slice(0, 10);
      outputParts.push(`**Key Node to Source Mappings:**`);
      for (const [nodeId, filePath] of topMappings) {
        outputParts.push(`- \`${nodeId}\` ➔ \`${filePath}\``);
      }
      outputParts.push('');
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: outputParts.join('\n'),
      },
    ],
    isError: false,
  };
}

/**
 * Tool: get_repo_digest
 */
async function executeGetRepoDigest(
  args: Record<string, any>
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const repoUrl = String(args?.repoUrl || '').trim();
  if (!repoUrl) {
    throw new Error("Missing required argument: 'repoUrl'");
  }

  const format = String(args?.format || 'digest').toLowerCase();
  const blueprint: VisualAtlasBlueprint = await analyzeRepositoryFull(repoUrl);

  if (format === 'brief') {
    const briefText = compileAgentMarkdownBrief(blueprint);
    return {
      content: [{ type: 'text', text: briefText }],
      isError: false,
    };
  }

  if (format === 'tree') {
    const paths = (blueprint.files || []).map((f) => f.path);
    const treeText = renderAsciiTree(paths);
    const formatted = [
      `# Repository Directory Tree: ${blueprint.metadata.fullName}`,
      `Total Files: ${paths.length}`,
      '```',
      treeText,
      '```',
    ].join('\n');
    return {
      content: [{ type: 'text', text: formatted }],
      isError: false,
    };
  }

  // Canonical Gitingest token-budgeted digest
  const maxTotalTokens = Math.min(
    500_000,
    Math.max(5_000, Number(args?.maxTotalTokens) || 100_000)
  );

  const digestResult: CompiledDigest = compileDigest(blueprint, {
    maxTotalTokens,
    includeTests: Boolean(args?.includeTests),
    includeDocs: args?.includeDocs !== false,
    selectedSubsystems: Array.isArray(args?.selectedSubsystems)
      ? args.selectedSubsystems.map(String)
      : undefined,
    includePatterns: Array.isArray(args?.includePatterns)
      ? args.includePatterns.map(String)
      : undefined,
    excludePatterns: Array.isArray(args?.excludePatterns)
      ? args.excludePatterns.map(String)
      : undefined,
  });

  return {
    content: [
      {
        type: 'text',
        text: digestResult.digestText,
      },
    ],
    isError: false,
  };
}

/**
 * Tool: run_xray_audit
 */
async function executeRunXRayAudit(
  args: Record<string, any>
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const repoUrl = String(args?.repoUrl || '').trim();
  if (!repoUrl) {
    throw new Error("Missing required argument: 'repoUrl'");
  }

  const maxModules = Math.min(20, Math.max(1, Number(args?.maxModules) || 8));
  const blueprint: VisualAtlasBlueprint = await analyzeRepositoryFull(repoUrl, {
    byokApiKey: args?.byokApiKey,
  });

  const xray: XRayMatrixReport = await runCodebaseXRay(blueprint, {
    byokApiKey: args?.byokApiKey,
    maxModules,
  });

  const mdSections: string[] = [
    `# Decision-1 Calibrated Architectural X-Ray: ${blueprint.metadata.fullName}`,
    `> **Overall Health Score:** **${xray.overallScore}/100**`,
    `> **Calibrated Mean Entropy:** \`${xray.meanEntropy.toFixed(3)}\` *(lower indicates higher certainty)*`,
    `> **Recommended Model Tier:** \`${xray.recommendedModelTier}\``,
    `> **Evaluation Engine:** \`${xray.model}\` ${xray.dualKeySharded ? '(Dual-Key Sharded)' : ''}`,
    '',
    `### Routing Rationale`,
    xray.routingRationale,
    '',
    `## 9 Architectural Pillars Average Scores`,
    `| Pillar | Score | Assessment |`,
    `| :--- | :---: | :--- |`,
  ];

  for (const pillar of XRAY_PILLARS) {
    const score = xray.pillarAverages[pillar.id] ?? 0;
    const status =
      score >= 85 ? '🟢 Healthy' : score >= 70 ? '🟡 Moderate Risk' : '🔴 Fragile';
    mdSections.push(`| **${pillar.label}** | \`${score}%\` | ${status} |`);
  }
  mdSections.push('');

  // Module breakdown table
  if (xray.modules && xray.modules.length > 0) {
    mdSections.push(`## Evaluated Architectural Modules`);
    mdSections.push(`| Module | Primary File | Layer | Health | Blast Radius | Top Finding |`);
    mdSections.push(`| :--- | :--- | :---: | :---: | :---: | :--- |`);

    for (const m of xray.modules) {
      const blastPct = Math.round(m.blastRadius * 100);
      mdSections.push(
        `| **${m.label}** | \`${m.primaryFile}\` | \`${m.layer}\` | \`${m.overallHealth}%\` | \`${blastPct}%\` | ${m.topFinding} |`
      );
    }
    mdSections.push('');

    // Highlight any critical flags
    const flaggedCells: Array<{ module: string; pillar: string; flag: string }> = [];
    for (const m of xray.modules) {
      for (const [pId, cell] of Object.entries(m.cells)) {
        if (cell.flagSummary) {
          flaggedCells.push({
            module: m.label,
            pillar: pId,
            flag: cell.flagSummary,
          });
        }
      }
    }

    if (flaggedCells.length > 0) {
      mdSections.push(`### Architectural Risk Flags`);
      for (const item of flaggedCells.slice(0, 10)) {
        mdSections.push(
          `- ⚠️ **${item.module}** (\`${item.pillar}\`): ${item.flag}`
        );
      }
      mdSections.push('');
    }
  }

  mdSections.push(
    `Inspect the live Decision-1 interactive heatmap at [https://git-understand.com/${blueprint.metadata.fullName}](https://git-understand.com/${blueprint.metadata.fullName}).`
  );

  return {
    content: [
      {
        type: 'text',
        text: mdSections.join('\n'),
      },
    ],
    isError: false,
  };
}

/**
 * Tool: search_codebase
 */
async function executeSearchCodebase(
  args: Record<string, any>
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const repoUrl = String(args?.repoUrl || '').trim();
  if (!repoUrl) {
    throw new Error("Missing required argument: 'repoUrl'");
  }

  const query = args?.query ? String(args.query).trim() : '';
  const imageBase64 = args?.imageBase64 ? String(args.imageBase64).trim() : '';
  const imageMimeType = args?.imageMimeType ? String(args.imageMimeType).trim() : undefined;
  const topK = Math.min(20, Math.max(1, Number(args?.topK) || 5));

  if (!query && !imageBase64) {
    throw new Error("At least one of 'query' or 'imageBase64' must be provided.");
  }

  const blueprint: VisualAtlasBlueprint = await analyzeRepositoryFull(repoUrl, {
    byokApiKey: args?.byokApiKey,
  });

  const searchResult = await searchRepoMultimodal(blueprint, {
    queryText: query || undefined,
    imageBase64: imageBase64 || undefined,
    imageMimeType,
    topK,
    byokApiKey: args?.byokApiKey,
  });

  const matches: VisualSearchMatch[] = searchResult.matches || [];

  if (matches.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No matching architectural nodes found for query: "${query || '[Image query]'}" in repository ${blueprint.metadata.fullName}.`,
        },
      ],
      isError: false,
    };
  }

  const nodeMap = new Map<string, any>();
  for (const n of blueprint.nodes || []) {
    nodeMap.set(n.id, n);
  }

  const mdSections: string[] = [
    `# Semantic Codebase Search Results: ${blueprint.metadata.fullName}`,
    `> **Query:** "${query || '[Multimodal image lasso]'}" | **Engine:** \`${searchResult.model}\` | **Matches:** ${matches.length}`,
    '',
    `| Rank | Node / Component | Primary File | Stratum | Similarity | Context Reason |`,
    `| :---: | :--- | :--- | :---: | :---: | :--- |`,
  ];

  matches.forEach((m, idx) => {
    const node = nodeMap.get(m.nodeId);
    const layer = node?.layer || 'domain';
    const simPct = `${(m.similarity * 100).toFixed(1)}%`;
    mdSections.push(
      `| ${idx + 1} | **${m.label}** | \`${m.filePath}\` | \`${layer}\` | \`${simPct}\` | ${m.reason} |`
    );
  });
  mdSections.push('');

  // Expanded briefs for top 3 matches
  mdSections.push(`## Architectural Node Details (Top Matches)`);
  for (const m of matches.slice(0, 3)) {
    const node = nodeMap.get(m.nodeId);
    if (node) {
      mdSections.push(`### ${m.label} (\`${node.primaryFile}\`)`);
      mdSections.push(`- **Subsystem:** \`${node.subsystemId}\` (Stratum: \`${node.layer}\`)`);
      mdSections.push(`- **Visual Brief:** ${node.visualBrief}`);
      if (node.keySymbols && node.keySymbols.length > 0) {
        mdSections.push(
          `- **Key Exported Symbols:** ${node.keySymbols.slice(0, 6).map((s: string) => `\`${s}\``).join(', ')}`
        );
      }
      if (node.inputs && node.inputs.length > 0) {
        mdSections.push(
          `- **Dependencies (Fan-In/Fan-Out):** ${node.fanIn} callers, ${node.fanOut} dependencies`
        );
      }
      mdSections.push('');
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: mdSections.join('\n'),
      },
    ],
    isError: false,
  };
}

/**
 * Handles a single JSON-RPC 2.0 request according to the Model Context Protocol.
 */
export async function handleMcpRpcRequest(
  reqBody: any
): Promise<JsonRpcResponse | null> {
  if (!reqBody || typeof reqBody !== 'object') {
    return {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'Invalid Request: Body must be a JSON-RPC 2.0 object',
      },
    };
  }

  const { jsonrpc, id = null, method, params = {} } = reqBody;

  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32600,
        message: 'Invalid Request: jsonrpc version must be "2.0"',
      },
    };
  }

  switch (method) {
    case 'ping': {
      return {
        jsonrpc: '2.0',
        id,
        result: {},
      };
    }

    case 'initialize': {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: 'git-understand-mcp',
            version: '3.0.0',
          },
          instructions:
            'GitUnderstand MCP Server provides visual architectural intelligence, progressive blueprints, Mermaid diagrams, Gitingest-compatible token-budgeted digests, 9-pillar Decision-1 X-Ray audits, and semantic multimodal code search.',
        },
      };
    }

    case 'notifications/initialized':
    case 'initialized': {
      // Notification without required response if id is null
      if (id === null || id === undefined) {
        return null;
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {},
      };
    }

    case 'tools/list': {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: MCP_TOOLS_DEFINITIONS,
        },
      };
    }

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      try {
        let toolResult: {
          content: Array<{ type: string; text: string }>;
          isError?: boolean;
        };

        switch (toolName) {
          case 'understand_repo':
            toolResult = await executeUnderstandRepo(toolArgs);
            break;

          case 'get_architecture_diagram':
            toolResult = await executeGetArchitectureDiagram(toolArgs);
            break;

          case 'get_repo_digest':
            toolResult = await executeGetRepoDigest(toolArgs);
            break;

          case 'run_xray_audit':
            toolResult = await executeRunXRayAudit(toolArgs);
            break;

          case 'search_codebase':
            toolResult = await executeSearchCodebase(toolArgs);
            break;

          default:
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32601,
                message: `Tool not found: "${toolName}". Available tools: ${MCP_TOOLS_DEFINITIONS.map(
                  (t) => t.name
                ).join(', ')}`,
              },
            };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: toolResult,
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Tool execution failed: ${errorMsg}`,
              },
            ],
            isError: true,
          },
        };
      }
    }

    default: {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: "${method}"`,
        },
      };
    }
  }
}

// -----------------------------------------------------------------------------
// Router Factory
// -----------------------------------------------------------------------------

/**
 * Creates and configures the Express Router for the GitUnderstand HTTP MCP Server.
 * Handles:
 * - GET / : Server discovery metadata & available tool definitions.
 * - POST / : JSON-RPC 2.0 processor (initialize, tools/list, tools/call).
 */
export function createMcpRouter(): Router {
  const router = Router();

  // 1. Discovery Endpoint: GET /
  router.get('/', (_req: Request, res: Response): void => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).json(getMcpDiscoveryPayload());
  });

  // 2. JSON-RPC 2.0 Endpoint: POST /
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      const body = req.body;

      // Handle batch JSON-RPC requests
      if (Array.isArray(body)) {
        if (body.length === 0) {
          res.status(400).json({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32600,
              message: 'Invalid Request: Batch array cannot be empty',
            },
          });
          return;
        }

        const responses = await Promise.all(
          body.map((singleReq) => handleMcpRpcRequest(singleReq))
        );
        const filtered = responses.filter((r): r is JsonRpcResponse => r !== null);
        if (filtered.length === 0) {
          res.status(204).end();
          return;
        }
        res.status(200).json(filtered);
        return;
      }

      // Handle single JSON-RPC request
      const response = await handleMcpRpcRequest(body);
      if (response === null) {
        res.status(204).end();
        return;
      }

      res.status(200).json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: `Internal server error: ${message}`,
        },
      });
    }
  });

  return router;
}

export default createMcpRouter;
