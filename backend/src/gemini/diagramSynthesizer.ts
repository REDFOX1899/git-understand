// =============================================================================
// GitUnderstand (git-understand.com) — Gemini 4 Neon Diagram Synthesizer
// Synthesizes interactive Mermaid architecture, sequence, and class diagrams
// with Obsidian Cobalt styling, XSS-safe code sanitization, and verified node-file links.
// =============================================================================

import type {
  VisualAtlasBlueprint,
  MermaidDiagramSpec,
  ArchitectureLayer,
  AtlasNode,
  SubsystemCluster,
  ExecutionFlow,
  RepoFileRecord,
} from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { withV1Client, hasGeminiCredentials } from './clientPool.js';
import { extractInteractionText } from './mediaUtils.js';

// =============================================================================
// Obsidian Cobalt Styling Rules for Mermaid Flowcharts
// =============================================================================

const OBSIDIAN_COBALT_CLASS_DEFS = [
  '  classDef client fill:#0E1B2A,stroke:#38BDF8,stroke-width:1.5px,color:#F1F3F4',
  '  classDef edge fill:#0D192B,stroke:#4285F4,stroke-width:1.5px,color:#F1F3F4',
  '  classDef orchestration fill:#0B1A33,stroke:#1A73E8,stroke-width:2px,color:#F1F3F4',
  '  classDef domain fill:#151830,stroke:#818CF8,stroke-width:1.5px,color:#F1F3F4',
  '  classDef infrastructure fill:#0B1F22,stroke:#2DD4BF,stroke-width:1.5px,color:#F1F3F4',
  '  classDef data fill:#0B211A,stroke:#34D399,stroke-width:1.5px,color:#F1F3F4',
  '  classDef tooling fill:#211C0E,stroke:#FBBF24,stroke-width:1.5px,color:#F1F3F4',
].join('\n');

/**
 * Escapes special regex characters in a raw string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitizes and shortens a human label for safe display in Mermaid node blocks.
 */
function sanitizeMermaidLabel(text: string, maxLen = 48): string {
  if (!text) return 'Component';
  const clean = text
    .replace(/["\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}

/**
 * Extracts and cleans a JSON block from LLM interaction output.
 */
function extractJsonPayload(text: string): Record<string, unknown> | null {
  if (!text || !text.trim()) return null;

  // 1. Try markdown code block ```json ... ```
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
      // Continue to next heuristic
    }
  }

  // 2. Try outermost curly braces { ... }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue to next heuristic
    }
  }

  // 3. Direct JSON.parse
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

// =============================================================================
// 1. sanitizeMermaidCode
// =============================================================================

/**
 * Valid Mermaid diagram header matchers.
 */
const VALID_HEADER_REGEX =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|classDiagram-v2|erDiagram|stateDiagram|stateDiagram-v2|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|C4Context|architecture-beta)\b/m;

/**
 * Single-line label sanitizer scanning for unquoted characters inside node shapes.
 */
function sanitizeLineLabels(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('%%')) return line;
  if (/^\s*(classDef|class|style|click|link|subgraph|end)\b/.test(line)) {
    // Check for subgraph with unquoted label with parens: subgraph SG_1[Client (Layer)]
    const sgMatch = line.match(/^(\s*subgraph\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\[)(.*?)(\]\s*)$/);
    if (sgMatch) {
      const content = sgMatch[2].trim();
      if (!content.startsWith('"') && /[()[\]{}<>\":;,]/.test(content)) {
        return `${sgMatch[1]}"${content.replace(/"/g, "'")}"${sgMatch[3]}`;
      }
    }
    return line;
  }

  const shapeTokens: Array<{ open: string; close: string }> = [
    { open: '[(', close: ')]' },
    { open: '([', close: '])' },
    { open: '[[', close: ']]' },
    { open: '((', close: '))' },
    { open: '{{', close: '}}' },
    { open: '>', close: ']' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '{', close: '}' },
  ];

  let out = '';
  let i = 0;

  while (i < line.length) {
    // Check for edge label between pipes: |...|
    if (
      line[i] === '|' &&
      (out.endsWith('-->') ||
        out.endsWith('==>') ||
        out.endsWith('-.->') ||
        out.endsWith('--') ||
        out.endsWith('--> ') ||
        out.endsWith('==> ') ||
        out.endsWith('-.-> ') ||
        out.endsWith('-- '))
    ) {
      const closingPipe = line.indexOf('|', i + 1);
      if (closingPipe !== -1) {
        const edgeContent = line.slice(i + 1, closingPipe);
        const trimmedEdge = edgeContent.trim();
        if (trimmedEdge.startsWith('"') && trimmedEdge.endsWith('"')) {
          out += line.slice(i, closingPipe + 1);
        } else if (/[()[\]{}<>\":;,]/.test(trimmedEdge)) {
          out += `|"${trimmedEdge.replace(/"/g, "'")}"|`;
        } else {
          out += line.slice(i, closingPipe + 1);
        }
        i = closingPipe + 1;
        continue;
      }
    }

    // Check for node declaration: identifier starting with letter/underscore followed by shape
    const idMatch = line.slice(i).match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*/);
    if (idMatch) {
      const restIdx = i + idMatch[0].length;
      let matchedShape: { open: string; close: string } | null = null;

      for (const shape of shapeTokens) {
        if (line.startsWith(shape.open, restIdx)) {
          matchedShape = shape;
          break;
        }
      }

      if (matchedShape) {
        const contentStart = restIdx + matchedShape.open.length;
        // Scan for matching closing token while respecting quoted strings (so e.g. NodeB["Another [Good]"] is preserved intact)
        let closeIdx = -1;
        let inQuotes = false;
        for (let scan = contentStart; scan <= line.length - matchedShape.close.length; scan++) {
          const ch = line[scan];
          if (ch === '"' && line[scan - 1] !== '\\') {
            inQuotes = !inQuotes;
            continue;
          }
          if (!inQuotes && line.startsWith(matchedShape.close, scan)) {
            closeIdx = scan;
            break;
          }
        }
        if (closeIdx !== -1) {
          const content = line.slice(contentStart, closeIdx);
          const trimmedContent = content.trim();
          let newContent = content;

          if (trimmedContent.startsWith('"') && trimmedContent.endsWith('"')) {
            newContent = content;
          } else if (/[()[\]{}<>\":;,]/.test(trimmedContent)) {
            newContent = `"${trimmedContent.replace(/"/g, "'")}"`;
          }

          out += idMatch[1] + matchedShape.open + newContent + matchedShape.close;
          i = closeIdx + matchedShape.close.length;
          continue;
        }
      }
    }

    out += line[i];
    i++;
  }

  return out;
}

/**
 * Sanitizes raw Mermaid diagram text:
 * - Strips outer fences (```mermaid ... ```) and extraneous backticks
 * - Removes XSS threats (<script>, javascript:, inline event handlers like onerror=)
 * - Safely quotes node and edge labels containing parentheses, brackets, or special characters
 * - Validates and repairs missing diagram header (e.g. flowchart TD, sequenceDiagram, classDiagram)
 *
 * @param raw Raw input text from LLM or user.
 * @returns Object with sanitized code string and boolean indicating whether repairs were applied.
 */
export function sanitizeMermaidCode(raw: string): { code: string; repaired: boolean } {
  if (!raw || typeof raw !== 'string') {
    return { code: 'flowchart TD\n  Empty["Empty Diagram"]', repaired: true };
  }

  let code = raw.trim();
  let repaired = false;

  // 1. Strip Markdown code fences (e.g. ```mermaid ... ``` or ``` ...)
  const fenceRegex = /```(?:mermaid)?\s*([\s\S]*?)```/i;
  const fenceMatch = code.match(fenceRegex);
  if (fenceMatch && fenceMatch[1]) {
    code = fenceMatch[1].trim();
    repaired = true;
  } else {
    // Strip standalone leading or trailing backticks
    if (code.startsWith('```')) {
      code = code.replace(/^```[a-zA-Z0-9_-]*\s*/, '').trim();
      repaired = true;
    }
    if (code.endsWith('```')) {
      code = code.replace(/\s*```$/, '').trim();
      repaired = true;
    }
  }

  // 2. Remove XSS vectors: <script>, javascript:, inline event handlers (onerror=, onload=, etc.)
  const originalBeforeXss = code;
  code = code
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?script\b[^>]*>/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<\/?iframe\b[^>]*>/gi, '')
    .replace(/<\/?object\b[^>]*>/gi, '')
    .replace(/<\/?embed\b[^>]*>/gi, '')
    .replace(/<\/?applet\b[^>]*>/gi, '');

  if (code !== originalBeforeXss) {
    repaired = true;
  }

  // 3. Ensure valid Mermaid header
  // Find first non-empty, non-comment line
  const lines = code.split('\n');
  let firstCodeLineIndex = -1;
  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx].trim();
    if (l && !l.startsWith('%%')) {
      firstCodeLineIndex = idx;
      break;
    }
  }

  const hasValidHeader =
    firstCodeLineIndex !== -1 && VALID_HEADER_REGEX.test(lines[firstCodeLineIndex]);

  if (!hasValidHeader) {
    // Detect probable diagram kind
    const isSequence =
      lines.some((l) => /(-->>|->>|participant\b|autonumber\b|activate\b)/.test(l));
    const isClass =
      lines.some((l) => /(<\|--|\*--|o--|\.\.>|class\s+[a-zA-Z_]\w*\s*\{)/.test(l));
    const isEr =
      lines.some((l) => /(\|\|--|}\|--|}\|..|\|\{--)/.test(l));

    let injectedHeader = 'flowchart TD';
    if (isSequence) {
      injectedHeader = 'sequenceDiagram';
    } else if (isClass) {
      injectedHeader = 'classDiagram';
    } else if (isEr) {
      injectedHeader = 'erDiagram';
    }

    if (firstCodeLineIndex !== -1) {
      lines.splice(firstCodeLineIndex, 0, injectedHeader);
    } else {
      lines.unshift(injectedHeader);
    }
    code = lines.join('\n');
    repaired = true;
  }

  // 4. Safely quote labels containing parentheses, brackets, or braces in node definitions
  const linesAfterHeader = code.split('\n');
  const sanitizedLines = linesAfterHeader.map((l) => sanitizeLineLabels(l));
  const finalCode = sanitizedLines.join('\n').trim();

  if (finalCode !== raw.trim()) {
    repaired = true;
  }

  return {
    code: finalCode,
    repaired,
  };
}

// =============================================================================
// 2. bindClickableNodeLinks
// =============================================================================

/**
 * Appends clickable directives to a Mermaid diagram linking nodes to their source
 * files on GitHub / remote repository viewer:
 * - Flowchart / Graph: `click <nodeId> href "<url>" "View <file>" _blank`
 * - Sequence Diagram: `link <nodeId>: View source @ <url>`
 * - Class Diagram: `link <nodeId> href "<url>" "View <file>"`
 *
 * @param mermaidCode Existing Mermaid diagram source.
 * @param nodeFileMap Map of Mermaid node/participant identifiers to repository relative file paths.
 * @param repoHtmlUrl Base GitHub repository HTML URL (e.g. "https://github.com/owner/repo").
 * @param branch Repository branch name (e.g. "main").
 * @returns Mermaid diagram source with click/link directives bound.
 */
export function bindClickableNodeLinks(
  mermaidCode: string,
  nodeFileMap: Record<string, string>,
  repoHtmlUrl: string,
  branch: string
): string {
  if (!mermaidCode || !nodeFileMap || Object.keys(nodeFileMap).length === 0) {
    return mermaidCode || '';
  }

  const baseRepo = (repoHtmlUrl || 'https://github.com').replace(/\/+$/, '');
  const targetBranch = branch?.trim() || 'main';

  // Detect diagram kind from first non-comment line
  const lines = mermaidCode.split('\n');
  let headerLine = '';
  for (const l of lines) {
    const t = l.trim();
    if (t && !t.startsWith('%%')) {
      headerLine = t;
      break;
    }
  }

  const isSequence = /^\s*sequenceDiagram\b/i.test(headerLine);
  const isClass = /^\s*classDiagram(-v2)?\b/i.test(headerLine);

  const linkDirectives: string[] = [];

  for (const [nodeId, filePath] of Object.entries(nodeFileMap)) {
    if (!nodeId || !filePath) continue;

    // Verify node identifier exists in diagram code
    const nodeRegex = new RegExp(`\\b${escapeRegex(nodeId)}\\b`);
    if (!nodeRegex.test(mermaidCode)) continue;

    // Avoid duplicate click or link directives
    const alreadyLinked = new RegExp(
      `^\\s*(click|link)\\s+${escapeRegex(nodeId)}\\b`,
      'm'
    ).test(mermaidCode);
    if (alreadyLinked) continue;

    const cleanPath = filePath.replace(/^\/+/, '');
    const encodedPathSegments = cleanPath.split('/').map(encodeURIComponent).join('/');
    const fileUrl = `${baseRepo}/blob/${encodeURIComponent(targetBranch)}/${encodedPathSegments}`;

    if (isSequence) {
      linkDirectives.push(`  link ${nodeId}: View source @ ${fileUrl}`);
    } else if (isClass) {
      linkDirectives.push(`  link ${nodeId} href "${fileUrl}" "View ${cleanPath}"`);
    } else {
      // Flowchart & Graph
      linkDirectives.push(`  click ${nodeId} href "${fileUrl}" "View ${cleanPath}" _blank`);
    }
  }

  if (linkDirectives.length === 0) {
    return mermaidCode;
  }

  return `${mermaidCode.trimEnd()}\n\n  %% Interactive Source Links\n${linkDirectives.join('\n')}\n`;
}

// =============================================================================
// Deterministic Fallback Diagram Generators
// =============================================================================

/**
 * Builds a deterministic, production-grade architecture flowchart from the blueprint.
 */
function buildDeterministicArchitecture(blueprint: VisualAtlasBlueprint): MermaidDiagramSpec {
  const { metadata, subsystems, nodes, edges } = blueprint;
  const repoTitle = metadata.name || metadata.fullName || 'Repository';

  if (nodes.length === 0) {
    return {
      id: `diag-arch-${blueprint.repoId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      kind: 'architecture',
      title: `${repoTitle} Architecture Flowchart`,
      subtitle: 'Component topology & data contracts',
      code: `flowchart TD\n  Root["${repoTitle}"]`,
      nodeFileMap: {},
      repaired: false,
      modelUsed: 'deterministic-atlas-v1',
      generatedAt: new Date().toISOString(),
    };
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const mermaidIdByNodeId = new Map<string, string>();
  const nodeFileMap: Record<string, string> = {};

  nodes.forEach((node, idx) => {
    const token = node.label
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 16);
    const mId = `N${idx + 1}_${token || 'Mod'}`;
    mermaidIdByNodeId.set(node.id, mId);
    nodeFileMap[mId] = node.primaryFile;
  });

  const lines: string[] = ['flowchart TD', ''];
  lines.push('  %% Obsidian Cobalt Theme');
  lines.push(OBSIDIAN_COBALT_CLASS_DEFS);
  lines.push('');

  const emittedNodeIds = new Set<string>();
  let sgIndex = 1;

  for (const sub of subsystems) {
    const subNodes = sub.nodeIds
      .map((id) => nodeById.get(id))
      .filter((n): n is AtlasNode => n !== undefined);
    if (subNodes.length === 0) continue;

    const sgId = `SG_${sgIndex++}`;
    const sgLabel = sanitizeMermaidLabel(sub.name, 36);
    lines.push(`  subgraph ${sgId}["${sgLabel}"]`);
    for (const node of subNodes) {
      const mId = mermaidIdByNodeId.get(node.id)!;
      const fileHint = node.primaryFile.split('/').slice(-2).join('/');
      const nodeLabel = sanitizeMermaidLabel(`${node.label}<br/>${fileHint}`, 42);
      lines.push(`    ${mId}["${nodeLabel}"]`);
      emittedNodeIds.add(node.id);
    }
    lines.push('  end');
    lines.push('');
  }

  // Fallback for nodes not assigned to any subsystem
  for (const node of nodes) {
    if (emittedNodeIds.has(node.id)) continue;
    const mId = mermaidIdByNodeId.get(node.id)!;
    const fileHint = node.primaryFile.split('/').slice(-2).join('/');
    const nodeLabel = sanitizeMermaidLabel(`${node.label}<br/>${fileHint}`, 42);
    lines.push(`  ${mId}["${nodeLabel}"]`);
  }

  // Directed edges (cap at 36 highest-priority connections)
  const sortedEdges = [...edges].sort((a, b) => {
    const hotDiff = (b.isHotPath ? 1 : 0) - (a.isHotPath ? 1 : 0);
    if (hotDiff !== 0) return hotDiff;
    return b.weight - a.weight;
  });

  const topEdges = sortedEdges.slice(0, 36);
  for (const edge of topEdges) {
    const srcMId = mermaidIdByNodeId.get(edge.source);
    const dstMId = mermaidIdByNodeId.get(edge.target);
    if (!srcMId || !dstMId || srcMId === dstMId) continue;

    const arrow = edge.isHotPath ? '==>' : '-->';
    const edgeLabel = sanitizeMermaidLabel(edge.label, 20);
    if (edgeLabel) {
      lines.push(`  ${srcMId} ${arrow}|"${edgeLabel}"| ${dstMId}`);
    } else {
      lines.push(`  ${srcMId} ${arrow} ${dstMId}`);
    }
  }

  lines.push('');

  // Assign layer classes
  const nodesByLayer = new Map<ArchitectureLayer, string[]>();
  for (const node of nodes) {
    const mId = mermaidIdByNodeId.get(node.id)!;
    const list = nodesByLayer.get(node.layer) ?? [];
    list.push(mId);
    nodesByLayer.set(node.layer, list);
  }
  for (const [layer, mIds] of nodesByLayer.entries()) {
    if (mIds.length > 0) {
      lines.push(`  class ${mIds.join(',')} ${layer}`);
    }
  }

  return {
    id: `diag-arch-${blueprint.repoId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    kind: 'architecture',
    title: `${repoTitle} System Architecture`,
    subtitle: `${subsystems.length} subsystems · ${nodes.length} components · ${topEdges.length} verified connections`,
    code: lines.join('\n'),
    nodeFileMap,
    repaired: false,
    modelUsed: 'deterministic-atlas-v1',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Builds a deterministic sequence diagram from execution flows in the blueprint.
 */
function buildDeterministicSequence(blueprint: VisualAtlasBlueprint): MermaidDiagramSpec {
  const { metadata, flows, nodes } = blueprint;
  const repoTitle = metadata.name || metadata.fullName || 'Repository';

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const primaryFlow: ExecutionFlow | undefined = flows[0];

  const nodeFileMap: Record<string, string> = {};
  const lines: string[] = ['sequenceDiagram', '  autonumber', ''];

  if (primaryFlow && primaryFlow.steps.length > 0) {
    // Collect distinct participants in sequence order
    const participantAliasMap = new Map<string, string>();
    let aliasIndex = 1;

    for (const step of primaryFlow.steps) {
      for (const nid of [step.fromNodeId, step.toNodeId]) {
        if (!participantAliasMap.has(nid)) {
          const node = nodeById.get(nid);
          const alias = `P${aliasIndex++}`;
          participantAliasMap.set(nid, alias);
          const rawLabel = node?.label || nid;
          const fileHint = step.filePath ? step.filePath.split('/').slice(-1)[0] : '';
          const displayLabel = fileHint ? `${rawLabel} (${fileHint})` : rawLabel;
          lines.push(`  participant ${alias} as ${sanitizeMermaidLabel(displayLabel, 36)}`);
          if (step.filePath) {
            nodeFileMap[alias] = step.filePath;
          } else if (node?.primaryFile) {
            nodeFileMap[alias] = node.primaryFile;
          }
        }
      }
    }

    lines.push('');

    // Emit steps
    for (const step of primaryFlow.steps) {
      const fromAlias = participantAliasMap.get(step.fromNodeId);
      const toAlias = participantAliasMap.get(step.toNodeId);
      if (!fromAlias || !toAlias) continue;

      const action = sanitizeMermaidLabel(step.action || step.edgeLabel || 'calls', 32);
      lines.push(`  ${fromAlias}->>${toAlias}: ${action}`);
    }

    // Closing response
    if (primaryFlow.steps.length >= 2) {
      const firstAlias = participantAliasMap.get(primaryFlow.steps[0].fromNodeId);
      const lastToAlias = participantAliasMap.get(
        primaryFlow.steps[primaryFlow.steps.length - 1].toNodeId
      );
      if (firstAlias && lastToAlias && firstAlias !== lastToAlias) {
        lines.push(`  ${lastToAlias}-->>${firstAlias}: 200 OK / Response Payload`);
      }
    }

    return {
      id: `diag-seq-${blueprint.repoId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      kind: 'sequence',
      title: `${primaryFlow.title || `${repoTitle} Request Flow`}`,
      subtitle: `${primaryFlow.subtitle || `Lifecycle sequence for ${primaryFlow.trigger || 'primary transaction'}`}`,
      code: lines.join('\n'),
      nodeFileMap,
      repaired: false,
      modelUsed: 'deterministic-flow-v1',
      generatedAt: new Date().toISOString(),
    };
  }

  // Generic fallback sequence connecting outer layers to data store
  lines.push('  participant Client as Browser UI / Client');
  lines.push('  participant API as API Gateway / Router');
  lines.push('  participant Service as Core Domain Service');
  lines.push('  participant Store as Persistence Store');
  lines.push('');
  lines.push('  Client->>API: HTTP Request / Action');
  lines.push('  API->>Service: Dispatch Request Payload');
  lines.push('  Service->>Store: Query State & Entities');
  lines.push('  Store-->>Service: Return Stored Record');
  lines.push('  Service-->>API: Processed Domain Result');
  lines.push('  API-->>Client: 200 JSON Success Response');

  const clientNode = nodes.find((n) => n.layer === 'client');
  const edgeNode = nodes.find((n) => n.layer === 'edge' || n.layer === 'orchestration');
  const domainNode = nodes.find((n) => n.layer === 'domain');
  const dataNode = nodes.find((n) => n.layer === 'data');

  if (clientNode) nodeFileMap.Client = clientNode.primaryFile;
  if (edgeNode) nodeFileMap.API = edgeNode.primaryFile;
  if (domainNode) nodeFileMap.Service = domainNode.primaryFile;
  if (dataNode) nodeFileMap.Store = dataNode.primaryFile;

  return {
    id: `diag-seq-${blueprint.repoId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    kind: 'sequence',
    title: `${repoTitle} Request Lifecycle Sequence`,
    subtitle: 'End-to-end execution flow from client ingress to data persistence',
    code: lines.join('\n'),
    nodeFileMap,
    repaired: false,
    modelUsed: 'deterministic-flow-v1',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Builds a deterministic class diagram from code symbols and module interfaces.
 */
function buildDeterministicClass(blueprint: VisualAtlasBlueprint): MermaidDiagramSpec {
  const { metadata, files, nodes } = blueprint;
  const repoTitle = metadata.name || metadata.fullName || 'Repository';

  const nodeFileMap: Record<string, string> = {};
  const lines: string[] = ['classDiagram', ''];

  // 1. Inspect files for explicit class and interface symbols
  interface DiscoveredClass {
    name: string;
    filePath: string;
    methods: string[];
    attributes: string[];
  }

  const discoveredClasses: DiscoveredClass[] = [];

  for (const file of files) {
    if (!file.symbols || file.symbols.length === 0) continue;
    const classSymbols = file.symbols.filter((s) => s.kind === 'class' || s.kind === 'interface');

    for (const sym of classSymbols) {
      const cleanName = sym.name.replace(/[^a-zA-Z0-9_]/g, '');
      if (!cleanName || cleanName.length < 2) continue;

      // Extract sibling method symbols in the same file
      const methods = file.symbols
        .filter((s) => s.kind === 'method' || s.kind === 'function')
        .slice(0, 3)
        .map((m) => `+${m.name}()`);

      discoveredClasses.push({
        name: cleanName,
        filePath: file.path,
        methods,
        attributes: [`+${sym.kind}: string`],
      });

      if (discoveredClasses.length >= 8) break;
    }
    if (discoveredClasses.length >= 8) break;
  }

  // 2. If code symbols are sparse, synthesize classes from core nodes
  if (discoveredClasses.length < 3) {
    for (const node of nodes.slice(0, 6)) {
      const cleanName = node.label.replace(/[^a-zA-Z0-9]/g, '');
      if (!cleanName) continue;
      const methods = node.keySymbols.slice(0, 3).map((sym) => `+${sym.replace(/[^a-zA-Z0-9_]/g, '')}()`);
      discoveredClasses.push({
        name: cleanName,
        filePath: node.primaryFile,
        methods: methods.length > 0 ? methods : ['+execute()', '+getState()'],
        attributes: [`+layer: ${node.layer}`, `+primaryFile: string`],
      });
    }
  }

  // Emit class definitions
  const emittedNames = new Set<string>();
  for (const cls of discoveredClasses.slice(0, 8)) {
    if (emittedNames.has(cls.name)) continue;
    emittedNames.add(cls.name);

    nodeFileMap[cls.name] = cls.filePath;
    lines.push(`  class ${cls.name} {`);
    for (const attr of cls.attributes) {
      lines.push(`    ${attr}`);
    }
    for (const m of cls.methods) {
      lines.push(`    ${m}`);
    }
    lines.push('  }');
    lines.push('');
  }

  // Emit associations between successive classes
  const classList = Array.from(emittedNames);
  for (let i = 0; i < classList.length - 1; i++) {
    lines.push(`  ${classList[i]} --> ${classList[i + 1]} : references`);
  }

  return {
    id: `diag-class-${blueprint.repoId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    kind: 'class',
    title: `${repoTitle} Core Domain Class Diagram`,
    subtitle: `Domain entities, interfaces, and contracts across ${emittedNames.size} modules`,
    code: lines.join('\n'),
    nodeFileMap,
    repaired: false,
    modelUsed: 'deterministic-class-v1',
    generatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// 3. generateMermaidSuite
// =============================================================================

/**
 * Builds the specialized prompt for Gemini 4 Neon to synthesize a Mermaid diagram.
 */
function buildDiagramPrompt(
  kind: 'architecture' | 'sequence' | 'class',
  blueprint: VisualAtlasBlueprint
): string {
  const { metadata, architecturePattern, techStackBadges, subsystems, nodes, flows, files } =
    blueprint;

  const repoTitle = metadata.name || metadata.fullName || 'Repository';
  const desc = metadata.description || 'Modern software repository';

  const subsystemSummary = subsystems
    .slice(0, 8)
    .map((s) => `- ${s.name} (${s.layer}): ${s.tagline || s.summaryBullets.slice(0, 1).join(' ')} [Files: ${s.filePaths.slice(0, 2).join(', ')}]`)
    .join('\n');

  const nodeSummary = nodes
    .slice(0, 16)
    .map((n) => `- ${n.id} (${n.label}, layer: ${n.layer}, file: ${n.primaryFile}): ${n.visualBrief || n.subtitle}`)
    .join('\n');

  const fileList = files
    .slice(0, 24)
    .map((f) => `- ${f.path} (${f.language}, layer: ${f.layer})`)
    .join('\n');

  if (kind === 'architecture') {
    return `You are GitUnderstand's expert Visual Diagram Synthesizer powered by Gemini 4 Neon.
Visual-First Philosophy: "No one reads code anymore — MORE VISUALS."
Synthesize a production-grade Mermaid system architecture flowchart for "${repoTitle}".

Repository Context:
- Description: ${desc}
- Architecture Pattern: ${architecturePattern}
- Tech Stack: ${techStackBadges.join(', ')}
- Subsystems:
${subsystemSummary}
- Key Components:
${nodeSummary}
- Available Files:
${fileList}

MERMAID RULES FOR ARCHITECTURE:
1. Header: Must start with "flowchart TD" or "flowchart LR".
2. Subgraphs: Group components into subgraphs corresponding to subsystems (e.g. subgraph SG_Client["Client Layer"], etc.).
3. Node IDs: Use clean alphanumeric identifiers starting with a letter (e.g. WebUI, API, Engine, Postgres).
4. Node Labels: Put human-readable name and representative file path hint inside double quotes: NodeId["Display Name<br/>path/to/file.ext"].
5. NEVER leave unquoted parentheses or brackets inside node labels. Always use double quotes around labels: Node["Title (detail)"].
6. Obsidian Cobalt Styling: Include classDefs at top:
${OBSIDIAN_COBALT_CLASS_DEFS}
And assign classes at bottom: class Node1,Node2 client; class Node3 domain; etc.
7. Return JSON ONLY with strict schema:
{
  "title": "${repoTitle} Architecture Flowchart",
  "subtitle": "Component topology and data flow overview",
  "code": "flowchart TD\\n...",
  "nodeFileMap": {
    "MermaidNodeId": "exact/relative/file/path.ext"
  }
}`;
  }

  if (kind === 'sequence') {
    const flowContext =
      flows.length > 0
        ? `Primary Known Execution Flow: ${flows[0].title} (${flows[0].trigger})\nSteps:\n` +
          flows[0].steps
            .slice(0, 6)
            .map((s) => `  Step ${s.stepNumber}: ${s.fromNodeId} -> ${s.toNodeId} [${s.action}] (${s.filePath})`)
            .join('\n')
        : 'Synthesize standard request lifecycle flow.';

    return `You are GitUnderstand's expert Visual Diagram Synthesizer powered by Gemini 4 Neon.
Visual-First Philosophy: "No one reads code anymore — MORE VISUALS."
Synthesize a production-grade Mermaid sequence diagram for "${repoTitle}".

Repository Context:
- Description: ${desc}
- Architecture Pattern: ${architecturePattern}
- Tech Stack: ${techStackBadges.join(', ')}
- ${flowContext}
- Available Files:
${fileList}

MERMAID RULES FOR SEQUENCE:
1. Header: Must start with "sequenceDiagram" followed by "  autonumber".
2. Participants: Declare clear participants with human-readable aliases: participant User as Browser Client, participant API as API Gateway<br/>server.ts, etc.
3. Node-File Map: Map each participant alias to its representative file path.
4. Messages: Use clean arrows (->>, -->>), active method calls, and return values.
5. Return JSON ONLY with strict schema:
{
  "title": "${repoTitle} Request Lifecycle Sequence",
  "subtitle": "Asynchronous execution sequence and request boundary transitions",
  "code": "sequenceDiagram\\n  autonumber\\n...",
  "nodeFileMap": {
    "ParticipantAlias": "exact/relative/file/path.ext"
  }
}`;
  }

  // kind === 'class'
  return `You are GitUnderstand's expert Visual Diagram Synthesizer powered by Gemini 4 Neon.
Visual-First Philosophy: "No one reads code anymore — MORE VISUALS."
Synthesize a production-grade Mermaid class diagram for "${repoTitle}".

Repository Context:
- Description: ${desc}
- Architecture Pattern: ${architecturePattern}
- Tech Stack: ${techStackBadges.join(', ')}
- Key Modules:
${nodeSummary}
- Key Files:
${fileList}

MERMAID RULES FOR CLASS DIAGRAM:
1. Header: Must start with "classDiagram".
2. Classes & Interfaces: Declare 4 to 8 primary domain classes, interfaces, or service contracts. Include 2-3 key attributes and methods per class.
3. Relations: Use valid Mermaid relation syntax: <|-- (inheritance), *-- (composition), o-- (aggregation), --> (association).
4. Node-File Map: Map each class name to its representative source file path.
5. Return JSON ONLY with strict schema:
{
  "title": "${repoTitle} Core Domain Class Diagram",
  "subtitle": "Domain entities, contracts, and type hierarchies",
  "code": "classDiagram\\n...",
  "nodeFileMap": {
    "ClassName": "exact/relative/file/path.ext"
  }
}`;
}

/**
 * Generates interactive Mermaid diagram specifications for a given repository blueprint.
 * Synthesizes architecture, sequence, and class diagrams using Gemini 4 Neon,
 * falling back gracefully to deterministic synthesis on API errors or missing credentials.
 *
 * @param blueprint Complete visual atlas blueprint of the repository.
 * @param options Optional configuration specifying user BYOK key and diagram kinds.
 * @returns Array of valid MermaidDiagramSpec objects.
 */
export async function generateMermaidSuite(
  blueprint: VisualAtlasBlueprint,
  options?: {
    byokApiKey?: string;
    kinds?: Array<'architecture' | 'sequence' | 'class'>;
  }
): Promise<MermaidDiagramSpec[]> {
  const targetKinds: Array<'architecture' | 'sequence' | 'class'> =
    options?.kinds && options.kinds.length > 0
      ? options.kinds
      : ['architecture', 'sequence', 'class'];

  const results: MermaidDiagramSpec[] = [];
  const canUseGemini = hasGeminiCredentials(options?.byokApiKey);

  // Set of valid repo file paths for verifying nodeFileMap entries
  const validFilePaths = new Set(blueprint.files.map((f) => f.path));

  for (const kind of targetKinds) {
    let spec: MermaidDiagramSpec | null = null;

    if (canUseGemini) {
      try {
        const prompt = buildDiagramPrompt(kind, blueprint);
        const model = ENV.GEMINI_MODEL_VISUAL || 'gemini-4-neon';

        const rawText = await withV1Client(async (client) => {
          const createInteraction = client.interactions.create as (
            params: Record<string, unknown>
          ) => Promise<unknown>;

          const interaction = await createInteraction({
            model,
            input: prompt,
            generation_config: {
              thinking_level: 'medium',
            },
          });

          return extractInteractionText(interaction);
        }, options?.byokApiKey);

        const parsed = extractJsonPayload(rawText);

        if (parsed && typeof parsed.code === 'string' && parsed.code.trim().length > 0) {
          const sanitized = sanitizeMermaidCode(parsed.code);

          // Verify and normalize nodeFileMap
          const nodeFileMap: Record<string, string> = {};
          if (parsed.nodeFileMap && typeof parsed.nodeFileMap === 'object') {
            for (const [nodeId, rawFp] of Object.entries(
              parsed.nodeFileMap as Record<string, unknown>
            )) {
              if (typeof rawFp === 'string') {
                const cleanFp = rawFp.trim();
                if (validFilePaths.has(cleanFp)) {
                  nodeFileMap[nodeId] = cleanFp;
                } else {
                  // Fallback: match by filename
                  const baseName = cleanFp.split('/').slice(-1)[0];
                  const matched = blueprint.files.find(
                    (f) => f.name === baseName || f.path.endsWith(baseName)
                  );
                  if (matched) {
                    nodeFileMap[nodeId] = matched.path;
                  }
                }
              }
            }
          }

          const title =
            typeof parsed.title === 'string' && parsed.title.trim()
              ? parsed.title.trim()
              : `${blueprint.metadata.name || 'Repository'} ${kind.charAt(0).toUpperCase() + kind.slice(1)} Diagram`;

          const subtitle =
            typeof parsed.subtitle === 'string' && parsed.subtitle.trim()
              ? parsed.subtitle.trim()
              : `Synthesized via ${model}`;

          spec = {
            id: `diag-${kind}-${blueprint.repoId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
            kind,
            title,
            subtitle,
            code: sanitized.code,
            nodeFileMap,
            repaired: sanitized.repaired,
            modelUsed: model,
            generatedAt: new Date().toISOString(),
          };
        }
      } catch (err: unknown) {
        console.warn(
          `[DiagramSynthesizer] Gemini 4 Neon synthesis failed for ${kind}. Falling back to deterministic diagram. Error:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // Deterministic fallback if Gemini was unavailable or threw an error
    if (!spec) {
      if (kind === 'architecture') {
        spec = buildDeterministicArchitecture(blueprint);
      } else if (kind === 'sequence') {
        spec = buildDeterministicSequence(blueprint);
      } else {
        spec = buildDeterministicClass(blueprint);
      }
    }

    results.push(spec);
  }

  return results;
}

// =============================================================================
// 4. modifyMermaidDiagram
// =============================================================================

/**
 * Modifies an existing Mermaid diagram specification based on user natural language instructions.
 * Dispatches to Gemini 4 Neon for semantic adjustments (re-routing connections, adding components,
 * updating styles), ensuring the modified diagram remains valid Mermaid and maintains verified file bindings.
 *
 * @param blueprint Complete visual atlas blueprint of the repository.
 * @param currentDiagram Existing MermaidDiagramSpec being refined.
 * @param instruction User instruction (e.g. "Add a Redis caching node between API Gateway and DB").
 * @param byokApiKey Optional user Bring Your Own Key.
 * @returns Updated MermaidDiagramSpec.
 */
export async function modifyMermaidDiagram(
  blueprint: VisualAtlasBlueprint,
  currentDiagram: MermaidDiagramSpec,
  instruction: string,
  byokApiKey?: string
): Promise<MermaidDiagramSpec> {
  const model = ENV.GEMINI_MODEL_VISUAL || 'gemini-4-neon';
  const validFilePaths = new Set(blueprint.files.map((f) => f.path));

  if (hasGeminiCredentials(byokApiKey)) {
    try {
      const prompt = `You are GitUnderstand's expert Visual Diagram Synthesizer powered by Gemini 4 Neon.
The user wants to modify an existing Mermaid diagram.

Repository: ${blueprint.metadata.fullName || blueprint.metadata.name}
Architecture Pattern: ${blueprint.architecturePattern}
Diagram Kind: ${currentDiagram.kind}
Current Title: ${currentDiagram.title}
Current Subtitle: ${currentDiagram.subtitle}

CURRENT MERMAID CODE:
\`\`\`mermaid
${currentDiagram.code}
\`\`\`

CURRENT NODE-FILE MAP:
${JSON.stringify(currentDiagram.nodeFileMap, null, 2)}

USER MODIFICATION INSTRUCTION:
"${instruction}"

RULES:
1. Apply the user's instruction faithfully while preserving the diagram's overall structure and aesthetic.
2. Return 100% valid Mermaid code. Ensure all node labels with parentheses or brackets are enclosed in double quotes (e.g. Node["Label (detail)"]).
3. Maintain or update the nodeFileMap with exact repository relative file paths.
4. Return strict JSON ONLY:
{
  "title": "Updated Diagram Title",
  "subtitle": "Updated Subtitle describing change",
  "code": "flowchart TD\\n...",
  "nodeFileMap": {
    "NodeId": "relative/file/path.ext"
  }
}`;

      const rawText = await withV1Client(async (client) => {
        const createInteraction = client.interactions.create as (
          params: Record<string, unknown>
        ) => Promise<unknown>;

        const interaction = await createInteraction({
          model,
          input: prompt,
          generation_config: {
            thinking_level: 'medium',
          },
        });

        return extractInteractionText(interaction);
      }, byokApiKey);

      const parsed = extractJsonPayload(rawText);

      if (parsed && typeof parsed.code === 'string' && parsed.code.trim().length > 0) {
        const sanitized = sanitizeMermaidCode(parsed.code);

        const mergedNodeFileMap: Record<string, string> = {
          ...currentDiagram.nodeFileMap,
        };

        if (parsed.nodeFileMap && typeof parsed.nodeFileMap === 'object') {
          for (const [nodeId, rawFp] of Object.entries(
            parsed.nodeFileMap as Record<string, unknown>
          )) {
            if (typeof rawFp === 'string') {
              const cleanFp = rawFp.trim();
              if (validFilePaths.has(cleanFp)) {
                mergedNodeFileMap[nodeId] = cleanFp;
              } else {
                const baseName = cleanFp.split('/').slice(-1)[0];
                const matched = blueprint.files.find(
                  (f) => f.name === baseName || f.path.endsWith(baseName)
                );
                if (matched) {
                  mergedNodeFileMap[nodeId] = matched.path;
                }
              }
            }
          }
        }

        return {
          id: currentDiagram.id,
          kind: currentDiagram.kind,
          title:
            typeof parsed.title === 'string' && parsed.title.trim()
              ? parsed.title.trim()
              : currentDiagram.title,
          subtitle:
            typeof parsed.subtitle === 'string' && parsed.subtitle.trim()
              ? parsed.subtitle.trim()
              : currentDiagram.subtitle,
          code: sanitized.code,
          nodeFileMap: mergedNodeFileMap,
          repaired: sanitized.repaired,
          modelUsed: model,
          generatedAt: new Date().toISOString(),
        };
      }
    } catch (err: unknown) {
      console.warn(
        `[DiagramSynthesizer] modifyMermaidDiagram LLM call failed. Falling back to deterministic adjustment. Error:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Deterministic fallback adjustment
  let adjustedCode = currentDiagram.code;
  const lowerInst = instruction.toLowerCase();

  // Direction changes
  if (lowerInst.includes('left to right') || lowerInst.includes('lr')) {
    adjustedCode = adjustedCode.replace(/\bflowchart\s+(TD|TB|BT|RL)\b/, 'flowchart LR');
  } else if (lowerInst.includes('top down') || lowerInst.includes('td')) {
    adjustedCode = adjustedCode.replace(/\bflowchart\s+(LR|BT|RL)\b/, 'flowchart TD');
  }

  // Autonumber in sequence diagrams
  if (currentDiagram.kind === 'sequence' && lowerInst.includes('autonumber')) {
    if (!adjustedCode.includes('autonumber')) {
      adjustedCode = adjustedCode.replace(
        /^\s*sequenceDiagram\b/m,
        'sequenceDiagram\n  autonumber'
      );
    }
  }

  const sanitized = sanitizeMermaidCode(adjustedCode);

  return {
    id: currentDiagram.id,
    kind: currentDiagram.kind,
    title: currentDiagram.title,
    subtitle: `${currentDiagram.subtitle} (Refined: ${instruction.slice(0, 48)})`,
    code: sanitized.code,
    nodeFileMap: { ...currentDiagram.nodeFileMap },
    repaired: sanitized.repaired,
    modelUsed: currentDiagram.modelUsed || 'deterministic-edit-v1',
    generatedAt: new Date().toISOString(),
  };
}
