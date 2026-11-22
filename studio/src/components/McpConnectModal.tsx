'use client';

// =============================================================================
// GitUnderstand Studio — MCP & Agent Markdown Connect Modal
// Standards-compliant top-layer dialog for connecting AI coding agents
// (Claude Code, Cursor, Gemini CLI, VS Code) via MCP & raw agent .md briefs
// =============================================================================

import React, { useState, useId, useCallback, useMemo } from 'react';
import { NativeDialog } from './NativeDialog';
import { GitUnderstandPrismMark, GeminiSparkleMark, GitHubMark } from './BrandMarks';

export type McpClientTab = 'claude' | 'cursor' | 'gemini' | 'vscode' | 'markdown' | 'tools';

export interface McpConnectModalProps {
  /** Controlled open state of the dialog */
  open: boolean;
  /** Callback fired when the dialog is closed or dismissed */
  onClose: () => void;
  /** Repository owner (e.g. "facebook") */
  owner?: string;
  /** Repository name (e.g. "react") */
  repo?: string;
  /** Combined repository slug (e.g. "facebook/react") */
  repoSlug?: string;
  /** Initial active tab */
  initialTab?: McpClientTab;
  /** Custom extra CSS classes */
  className?: string;
}

export interface McpToolDefinition {
  name: string;
  badge: string;
  summary: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  sampleCall: Record<string, unknown>;
}

// =============================================================================
// Canonical 5 MCP Tools exposed by GitUnderstand MCP Server
// Endpoint: https://api.git-understand.com/mcp
// =============================================================================

export const GIT_UNDERSTAND_MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'understand_repo',
    badge: 'Atlas & Strata',
    summary: 'Synthesize complete codebase architecture, visual atlas, strata layers & clusters',
    description:
      'Extracts and synthesizes the full visual blueprint of any repository: 7 architecture strata (client, edge, orchestration, domain, infrastructure, data, tooling), subsystem clusters, high-centrality AtlasNodes, dependency edges, and tech stack badges.',
    parameters: [
      {
        name: 'repo',
        type: 'string',
        required: true,
        description: 'GitHub repository slug ("owner/repo") or full GitHub URL.',
      },
      {
        name: 'branch',
        type: 'string',
        required: false,
        description: 'Target git branch, tag, or commit SHA (defaults to default branch).',
      },
      {
        name: 'depth',
        type: 'number',
        required: false,
        description: 'Maximum dependency graph traversal depth (1–10, default 4).',
      },
    ],
    sampleCall: {
      tool: 'understand_repo',
      arguments: {
        repo: 'owner/repo',
        branch: 'main',
      },
    },
  },
  {
    name: 'search_codebase',
    badge: 'Vector & Symbol',
    summary: 'Fast semantic & symbol search across file definitions, functions & architecture layers',
    description:
      'Performs hybrid semantic and symbol queries across all parsed AST declarations (classes, functions, interfaces, routes, modules) and file paths, ranked by cosine similarity and PageRank graph centrality.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'Natural language search query, symbol name, or architectural concept.',
      },
      {
        name: 'repo',
        type: 'string',
        required: false,
        description: 'Target repository slug ("owner/repo") to constrain search scope.',
      },
      {
        name: 'layer',
        type: 'string',
        required: false,
        description: 'Filter by architecture layer ("client" | "edge" | "orchestration" | "domain" | "infrastructure" | "data" | "tooling").',
      },
      {
        name: 'limit',
        type: 'number',
        required: false,
        description: 'Maximum number of matching symbols/files to return (default 10, max 50).',
      },
    ],
    sampleCall: {
      tool: 'search_codebase',
      arguments: {
        query: 'auth middleware token verification',
        repo: 'owner/repo',
        layer: 'edge',
        limit: 8,
      },
    },
  },
  {
    name: 'trace_execution_flow',
    badge: 'Deterministic Trace',
    summary: 'Trace step-by-step hot paths & call graphs from UI triggers through domain to storage',
    description:
      'Traces deterministic sequence steps and call paths across subsystem boundaries for specific user interactions, HTTP routes, or pipeline triggers with file coordinates and code excerpts.',
    parameters: [
      {
        name: 'repo',
        type: 'string',
        required: true,
        description: 'Target repository slug ("owner/repo").',
      },
      {
        name: 'trigger',
        type: 'string',
        required: false,
        description: 'Interaction or route trigger to trace (e.g. "POST /api/ingest" or "user_login").',
      },
      {
        name: 'flowId',
        type: 'string',
        required: false,
        description: 'Specific ExecutionFlow identifier to inspect in full step-by-step detail.',
      },
    ],
    sampleCall: {
      tool: 'trace_execution_flow',
      arguments: {
        repo: 'owner/repo',
        trigger: 'ingest_repository_request',
      },
    },
  },
  {
    name: 'xray_architecture_audit',
    badge: 'Decision-1 Calibrated',
    summary: '9-pillar code health & modularity heatmap with calibrated Shannon entropy scores',
    description:
      'Evaluates repository quality against 9 architectural pillars (modularity, security, resilience, testability, api_clarity, concurrency, scalability, hygiene, onboarding) powered by dual-key Gemini Decision-1 probe verification.',
    parameters: [
      {
        name: 'repo',
        type: 'string',
        required: true,
        description: 'Target repository slug ("owner/repo").',
      },
      {
        name: 'pillar',
        type: 'string',
        required: false,
        description: 'Specific pillar identifier to audit in depth ("security" | "modularity" | "resilience" | etc.).',
      },
      {
        name: 'sharded',
        type: 'boolean',
        required: false,
        description: 'Whether to run dual-key shard consensus for high-stakes audits (default true).',
      },
    ],
    sampleCall: {
      tool: 'xray_architecture_audit',
      arguments: {
        repo: 'owner/repo',
        pillar: 'security',
      },
    },
  },
  {
    name: 'slice_context_digest',
    badge: 'Token-Budgeted Brief',
    summary: 'Compile surgical AST-pruned Markdown context & tree for agent LLM prompts',
    description:
      'Compiles a token-budgeted, noise-pruned Markdown digest containing repository hierarchy, critical subsystem entrypoints, architecture invariants, and source excerpts optimized for agent context windows.',
    parameters: [
      {
        name: 'repo',
        type: 'string',
        required: true,
        description: 'Target repository slug ("owner/repo").',
      },
      {
        name: 'maxTokens',
        type: 'number',
        required: false,
        description: 'Target token budget ceiling (default 200000, min 5000, max 1000000).',
      },
      {
        name: 'subsystems',
        type: 'string[]',
        required: false,
        description: 'Optional array of subsystem cluster IDs to focus compilation on.',
      },
      {
        name: 'includeTests',
        type: 'boolean',
        required: false,
        description: 'Whether to include test files in the compiled digest (default false).',
      },
    ],
    sampleCall: {
      tool: 'slice_context_digest',
      arguments: {
        repo: 'owner/repo',
        maxTokens: 120000,
        includeTests: false,
      },
    },
  },
];

// =============================================================================
// Helper Icons
// =============================================================================

function CopyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TerminalIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function ExternalLinkIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ChevronDownIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// =============================================================================
// McpConnectModal Component
// =============================================================================

export function McpConnectModal({
  open,
  onClose,
  owner = 'facebook',
  repo = 'react',
  repoSlug,
  initialTab = 'claude',
  className = '',
}: McpConnectModalProps) {
  // Parse slug fallback if passed
  const resolvedOwner = useMemo(() => {
    if (repoSlug && repoSlug.includes('/')) {
      return repoSlug.split('/')[0].trim();
    }
    return owner || 'owner';
  }, [owner, repoSlug]);

  const resolvedRepo = useMemo(() => {
    if (repoSlug && repoSlug.includes('/')) {
      return repoSlug.split('/')[1].trim();
    }
    return repo || 'repo';
  }, [repo, repoSlug]);

  const [activeTab, setActiveTab] = useState<McpClientTab>(initialTab);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const mcpServerUrl = 'https://api.git-understand.com/mcp';
  const rawMarkdownUrl = `https://git-understand.com/${resolvedOwner}/${resolvedRepo}.md`;

  const copyToClipboard = useCallback((text: string, key: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopiedKey(key);
          setTimeout(() => setCopiedKey(null), 2200);
        },
        () => {
          // Fallback
          const textArea = document.createElement('textarea');
          textArea.value = text;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          setCopiedKey(key);
          setTimeout(() => setCopiedKey(null), 2200);
        }
      );
    }
  }, []);

  // Snippets
  const claudeCodeCli = `claude mcp add --transport sse git-understand ${mcpServerUrl}`;
  const claudeConfigJson = `{
  "mcpServers": {
    "git-understand": {
      "url": "${mcpServerUrl}",
      "transport": "sse"
    }
  }
}`;

  const cursorJson = `{
  "mcpServers": {
    "git-understand": {
      "url": "${mcpServerUrl}"
    }
  }
}`;

  const geminiCliCmd = `gemini mcp add git-understand ${mcpServerUrl}`;
  const geminiSettingsJson = `{
  "mcpServers": {
    "git-understand": {
      "url": "${mcpServerUrl}",
      "protocol": "sse"
    }
  }
}`;

  const vsCodeJson = `{
  "mcpServers": {
    "git-understand": {
      "url": "${mcpServerUrl}",
      "disabled": false,
      "autoApprove": [
        "understand_repo",
        "search_codebase",
        "trace_execution_flow",
        "xray_architecture_audit",
        "slice_context_digest"
      ]
    }
  }
}`;

  const curlMarkdownCmd = `curl -sL ${rawMarkdownUrl} | pbcopy`;
  const pipeClaudeCmd = `curl -sL ${rawMarkdownUrl} | claude "Analyze architecture and pinpoint hotspots"`;
  const pipeGeminiCmd = `curl -sL ${rawMarkdownUrl} | gemini "Explain the high-level data flow across strata"`;

  const tabs: Array<{ id: McpClientTab; label: string; badge?: string }> = [
    { id: 'claude', label: 'Claude Code', badge: 'Anthropic' },
    { id: 'cursor', label: 'Cursor', badge: 'IDE' },
    { id: 'gemini', label: 'Gemini CLI', badge: 'Google GenAI' },
    { id: 'vscode', label: 'VS Code', badge: 'Cline/Roo' },
    { id: 'markdown', label: 'Raw .md Brief', badge: 'Universal' },
    { id: 'tools', label: '5 MCP Tools', badge: 'API Reference' },
  ];

  const headerExtra = (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono tracking-wide rounded-full"
        style={{
          backgroundColor: 'var(--cobalt-tint)',
          color: 'var(--cobalt-ice)',
          border: '1px solid var(--cobalt-border)',
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: 'var(--emerald)' }}
        />
        SSE Live: api.git-understand.com/mcp
      </span>
    </div>
  );

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs w-full">
      <div className="flex items-center gap-2" style={{ color: 'var(--ink-secondary)' }}>
        <GitUnderstandPrismMark size={16} />
        <span>
          Target Repository:{' '}
          <strong className="font-mono font-medium" style={{ color: 'var(--ink-primary)' }}>
            {resolvedOwner}/{resolvedRepo}
          </strong>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <a
          href={rawMarkdownUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            color: 'var(--cobalt-ice)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <span>Open Raw .md</span>
          <ExternalLinkIcon className="w-3.5 h-3.5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
          style={{
            backgroundColor: 'var(--btn-contrast-bg)',
            color: 'var(--btn-contrast-ink)',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      title="Connect AI Agents & MCP Server"
      subtitle="Expose live codebase visual strata, dependency graphs, and token-budgeted briefs to Claude Code, Cursor, Gemini CLI, or VS Code."
      widthClass="w-[min(96vw,840px)]"
      className={className}
      headerExtra={headerExtra}
      footer={footer}
    >
      <div className="space-y-6 pt-1">
        {/* Quick URL Banner Card */}
        <div
          className="rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          style={{
            backgroundColor: 'var(--bg-card-elevated)',
            border: '1px solid var(--border-card)',
          }}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider" style={{ color: 'var(--cobalt-ice)' }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--cobalt-core)' }} />
              Model Context Protocol Endpoint
            </div>
            <div className="font-mono text-sm font-semibold break-all" style={{ color: 'var(--ink-primary)' }}>
              {mcpServerUrl}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copyToClipboard(mcpServerUrl, 'endpoint')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-medium transition-all cursor-pointer"
              style={{
                backgroundColor: copiedKey === 'endpoint' ? 'var(--emerald-bg)' : 'var(--cobalt-tint)',
                color: copiedKey === 'endpoint' ? 'var(--emerald)' : 'var(--cobalt-ice)',
                border: `1px solid ${copiedKey === 'endpoint' ? 'var(--emerald-border)' : 'var(--cobalt-border)'}`,
              }}
              title="Copy MCP Endpoint URL"
            >
              {copiedKey === 'endpoint' ? <CheckIcon /> : <CopyIcon />}
              <span>{copiedKey === 'endpoint' ? 'Copied' : 'Copy URL'}</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
          role="tablist"
          aria-label="Agent Connection Methods"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all cursor-pointer"
                style={{
                  backgroundColor: isActive ? 'var(--cobalt-tint-strong)' : 'transparent',
                  color: isActive ? 'var(--cobalt-ice)' : 'var(--ink-secondary)',
                  border: isActive ? '1px solid var(--cobalt-border)' : '1px solid transparent',
                }}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-mono rounded"
                    style={{
                      backgroundColor: isActive ? 'var(--cobalt-core)' : 'var(--bg-subtle)',
                      color: isActive ? '#FFFFFF' : 'var(--ink-muted)',
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Claude Code */}
        {activeTab === 'claude' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
                Connect Claude Code CLI & Claude Desktop
              </h4>
              <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                Run the one-line command below in your terminal to register GitUnderstand as a live SSE tool provider for Claude Code.
              </p>
            </div>

            {/* CLI Command */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--ink-muted)' }}>
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  <TerminalIcon className="w-3.5 h-3.5" />
                  Terminal Command (Recommended)
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(claudeCodeCli, 'claude-cli')}
                  className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                  style={{ color: 'var(--cobalt-ice)' }}
                >
                  {copiedKey === 'claude-cli' ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'claude-cli' ? 'Copied' : 'Copy command'}</span>
                </button>
              </div>
              <pre
                className="p-3 rounded-lg font-mono text-xs overflow-x-auto select-all"
                style={{
                  backgroundColor: 'var(--bg-void)',
                  color: 'var(--ink-primary)',
                  border: '1px solid var(--border-card)',
                }}
              >
                <code>{claudeCodeCli}</code>
              </pre>
            </div>

            {/* Config JSON */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--ink-muted)' }}>
                <span className="font-mono text-[11px]">Or paste into ~/.claude/claude_desktop_config.json:</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(claudeConfigJson, 'claude-json')}
                  className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                  style={{ color: 'var(--cobalt-ice)' }}
                >
                  {copiedKey === 'claude-json' ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'claude-json' ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
              <pre
                className="p-3 rounded-lg font-mono text-xs overflow-x-auto select-all"
                style={{
                  backgroundColor: 'var(--bg-void)',
                  color: 'var(--ink-primary)',
                  border: '1px solid var(--border-card)',
                }}
              >
                <code>{claudeConfigJson}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Tab 2: Cursor */}
        {activeTab === 'cursor' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
                Connect Cursor IDE
              </h4>
              <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                In Cursor, navigate to <strong>Cursor Settings &gt; Features &gt; MCP &gt; Add New MCP Server</strong> or add to your project&apos;s <code className="font-mono px-1 py-0.5 rounded text-[11px]" style={{ backgroundColor: 'var(--bg-subtle)' }}>.cursor/mcp.json</code>.
              </p>
            </div>

            {/* Cursor Form Fields table */}
            <div
              className="rounded-lg p-3 text-xs space-y-2"
              style={{
                backgroundColor: 'var(--bg-card-elevated)',
                border: '1px solid var(--border-card)',
              }}
            >
              <div className="grid grid-cols-3 gap-2 py-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="font-medium" style={{ color: 'var(--ink-secondary)' }}>Name</span>
                <span className="col-span-2 font-mono font-semibold" style={{ color: 'var(--ink-primary)' }}>git-understand</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="font-medium" style={{ color: 'var(--ink-secondary)' }}>Type</span>
                <span className="col-span-2 font-mono font-semibold" style={{ color: 'var(--ink-primary)' }}>sse</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="font-medium" style={{ color: 'var(--ink-secondary)' }}>Server URL</span>
                <span className="col-span-2 font-mono font-semibold break-all" style={{ color: 'var(--cobalt-ice)' }}>{mcpServerUrl}</span>
              </div>
            </div>

            {/* Cursor JSON */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--ink-muted)' }}>
                <span className="font-mono text-[11px]">.cursor/mcp.json</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(cursorJson, 'cursor-json')}
                  className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                  style={{ color: 'var(--cobalt-ice)' }}
                >
                  {copiedKey === 'cursor-json' ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'cursor-json' ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
              <pre
                className="p-3 rounded-lg font-mono text-xs overflow-x-auto select-all"
                style={{
                  backgroundColor: 'var(--bg-void)',
                  color: 'var(--ink-primary)',
                  border: '1px solid var(--border-card)',
                }}
              >
                <code>{cursorJson}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Tab 3: Gemini CLI */}
        {activeTab === 'gemini' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <GeminiSparkleMark size={18} />
                <h4 className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  Connect Gemini CLI & Antigravity Agents
                </h4>
              </div>
              <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                Add GitUnderstand to your Gemini CLI or Google Antigravity environment to enable Gemini 4 reasoning over codebase strata.
              </p>
            </div>

            {/* CLI Command */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--ink-muted)' }}>
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  <TerminalIcon className="w-3.5 h-3.5" />
                  Terminal CLI Command
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(geminiCliCmd, 'gemini-cli')}
                  className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                  style={{ color: 'var(--cobalt-ice)' }}
                >
                  {copiedKey === 'gemini-cli' ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'gemini-cli' ? 'Copied' : 'Copy command'}</span>
                </button>
              </div>
              <pre
                className="p-3 rounded-lg font-mono text-xs overflow-x-auto select-all"
                style={{
                  backgroundColor: 'var(--bg-void)',
                  color: 'var(--ink-primary)',
                  border: '1px solid var(--border-card)',
                }}
              >
                <code>{geminiCliCmd}</code>
              </pre>
            </div>

            {/* Settings JSON */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--ink-muted)' }}>
                <span className="font-mono text-[11px]">~/.gemini/settings.json or antigravity.json</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(geminiSettingsJson, 'gemini-json')}
                  className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                  style={{ color: 'var(--cobalt-ice)' }}
                >
                  {copiedKey === 'gemini-json' ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'gemini-json' ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
              <pre
                className="p-3 rounded-lg font-mono text-xs overflow-x-auto select-all"
                style={{
                  backgroundColor: 'var(--bg-void)',
                  color: 'var(--ink-primary)',
                  border: '1px solid var(--border-card)',
                }}
              >
                <code>{geminiSettingsJson}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Tab 4: VS Code */}
        {activeTab === 'vscode' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
                Connect VS Code (Cline, Roo Code &amp; Copilot Agents)
              </h4>
              <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                Configure GitUnderstand in <code className="font-mono px-1 py-0.5 rounded text-[11px]" style={{ backgroundColor: 'var(--bg-subtle)' }}>cline_mcp_settings.json</code> or your workspace <code className="font-mono px-1 py-0.5 rounded text-[11px]" style={{ backgroundColor: 'var(--bg-subtle)' }}>.vscode/mcp.json</code> with pre-approved tools.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--ink-muted)' }}>
                <span className="font-mono text-[11px]">cline_mcp_settings.json / .vscode/mcp.json</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(vsCodeJson, 'vscode-json')}
                  className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                  style={{ color: 'var(--cobalt-ice)' }}
                >
                  {copiedKey === 'vscode-json' ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'vscode-json' ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
              <pre
                className="p-3 rounded-lg font-mono text-xs overflow-x-auto select-all"
                style={{
                  backgroundColor: 'var(--bg-void)',
                  color: 'var(--ink-primary)',
                  border: '1px solid var(--border-card)',
                }}
              >
                <code>{vsCodeJson}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Tab 5: Raw Agent Markdown Brief */}
        {activeTab === 'markdown' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <GitHubMark size={16} />
                <h4 className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  Raw Agent Markdown Brief (.md)
                </h4>
              </div>
              <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                Prefix any GitHub repository with <code className="font-mono px-1 py-0.5 rounded text-[11px]" style={{ backgroundColor: 'var(--bg-subtle)' }}>git-understand.com/&lt;owner&gt;/&lt;repo&gt;.md</code> to instantly stream a surgical, token-budgeted architecture brief directly into any LLM prompt or agent context.
              </p>
            </div>

            {/* Direct URL */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--ink-muted)' }}>
                <span className="font-mono text-[11px]">Direct Markdown Brief URL:</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(rawMarkdownUrl, 'md-url')}
                  className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                  style={{ color: 'var(--cobalt-ice)' }}
                >
                  {copiedKey === 'md-url' ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'md-url' ? 'Copied' : 'Copy URL'}</span>
                </button>
              </div>
              <div
                className="p-3 rounded-lg font-mono text-xs flex items-center justify-between gap-3 select-all"
                style={{
                  backgroundColor: 'var(--bg-void)',
                  color: 'var(--cobalt-bright)',
                  border: '1px solid var(--border-card)',
                }}
              >
                <span className="truncate">{rawMarkdownUrl}</span>
                <a
                  href={rawMarkdownUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1 hover:opacity-80 transition-opacity"
                  title="Open in new tab"
                >
                  <ExternalLinkIcon className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Quick Shell Pipes */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>
                One-Click Shell Pipe Examples
              </div>

              {/* Curl to Clipboard */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  <span>Copy raw repo brief directly to system clipboard:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(curlMarkdownCmd, 'curl-clip')}
                    className="hover:underline cursor-pointer"
                    style={{ color: 'var(--cobalt-ice)' }}
                  >
                    {copiedKey === 'curl-clip' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre
                  className="p-2.5 rounded-lg font-mono text-xs overflow-x-auto select-all"
                  style={{
                    backgroundColor: 'var(--bg-void)',
                    color: 'var(--ink-primary)',
                    border: '1px solid var(--border-card)',
                  }}
                >
                  <code>{curlMarkdownCmd}</code>
                </pre>
              </div>

              {/* Pipe into Claude */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  <span>Pipe directly into Claude Code CLI:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(pipeClaudeCmd, 'pipe-claude')}
                    className="hover:underline cursor-pointer"
                    style={{ color: 'var(--cobalt-ice)' }}
                  >
                    {copiedKey === 'pipe-claude' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre
                  className="p-2.5 rounded-lg font-mono text-xs overflow-x-auto select-all"
                  style={{
                    backgroundColor: 'var(--bg-void)',
                    color: 'var(--ink-primary)',
                    border: '1px solid var(--border-card)',
                  }}
                >
                  <code>{pipeClaudeCmd}</code>
                </pre>
              </div>

              {/* Pipe into Gemini */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  <span>Pipe directly into Gemini CLI:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(pipeGeminiCmd, 'pipe-gemini')}
                    className="hover:underline cursor-pointer"
                    style={{ color: 'var(--cobalt-ice)' }}
                  >
                    {copiedKey === 'pipe-gemini' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre
                  className="p-2.5 rounded-lg font-mono text-xs overflow-x-auto select-all"
                  style={{
                    backgroundColor: 'var(--bg-void)',
                    color: 'var(--ink-primary)',
                    border: '1px solid var(--border-card)',
                  }}
                >
                  <code>{pipeGeminiCmd}</code>
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: List of all 5 MCP Tools */}
        {activeTab === 'tools' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  5 Standard MCP Tools
                </h4>
                <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                  Exposed by GitUnderstand over SSE. Automatically discovered by Claude Code, Cursor, Gemini, and VS Code.
                </p>
              </div>
              <span
                className="px-2 py-0.5 text-xs font-mono rounded"
                style={{ backgroundColor: 'var(--cobalt-tint)', color: 'var(--cobalt-ice)' }}
              >
                Protocol: 2024-11-05
              </span>
            </div>

            <div className="space-y-3">
              {GIT_UNDERSTAND_MCP_TOOLS.map((tool) => {
                const isExpanded = expandedTool === tool.name;
                const sampleCallJson = JSON.stringify(tool.sampleCall, null, 2).replace(
                  'owner/repo',
                  `${resolvedOwner}/${resolvedRepo}`
                );

                return (
                  <div
                    key={tool.name}
                    className="rounded-xl overflow-hidden transition-all text-xs"
                    style={{
                      backgroundColor: 'var(--bg-card-elevated)',
                      border: '1px solid var(--border-card)',
                    }}
                  >
                    {/* Tool Summary Header */}
                    <div
                      className="p-3.5 flex items-start justify-between gap-3 cursor-pointer select-none"
                      onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono font-bold" style={{ color: 'var(--cobalt-bright)' }}>
                            {tool.name}
                          </code>
                          <span
                            className="px-2 py-0.5 text-[10px] font-mono rounded"
                            style={{
                              backgroundColor: 'var(--bg-subtle)',
                              color: 'var(--ink-muted)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            {tool.badge}
                          </span>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                          {tool.summary}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(sampleCallJson, `tool-${tool.name}`);
                          }}
                          className="p-1.5 rounded hover:bg-white/5 transition-colors"
                          title="Copy Tool Call JSON"
                        >
                          {copiedKey === `tool-${tool.name}` ? (
                            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <CopyIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <ChevronDownIcon
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>

                    {/* Expanded Tool Schema & Description */}
                    {isExpanded && (
                      <div
                        className="px-3.5 pb-3.5 pt-2 border-t space-y-3"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-primary)' }}>
                          {tool.description}
                        </p>

                        {/* Parameters table */}
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                            Parameters
                          </div>
                          <div
                            className="rounded-lg overflow-hidden border"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <table className="w-full text-left text-[11px]">
                              <thead>
                                <tr style={{ backgroundColor: 'var(--bg-void)', color: 'var(--ink-secondary)' }}>
                                  <th className="py-1.5 px-2.5 font-medium">Name</th>
                                  <th className="py-1.5 px-2.5 font-medium">Type</th>
                                  <th className="py-1.5 px-2.5 font-medium">Required</th>
                                  <th className="py-1.5 px-2.5 font-medium">Description</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                                {tool.parameters.map((param) => (
                                  <tr key={param.name}>
                                    <td className="py-1.5 px-2.5 font-mono font-semibold" style={{ color: 'var(--cobalt-ice)' }}>
                                      {param.name}
                                    </td>
                                    <td className="py-1.5 px-2.5 font-mono text-muted" style={{ color: 'var(--ink-muted)' }}>
                                      {param.type}
                                    </td>
                                    <td className="py-1.5 px-2.5">
                                      {param.required ? (
                                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--vermilion-bg)', color: 'var(--vermilion)' }}>
                                          required
                                        </span>
                                      ) : (
                                        <span className="font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                                          optional
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 px-2.5" style={{ color: 'var(--ink-secondary)' }}>
                                      {param.description}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Sample Tool Call */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                            <span className="font-mono">Example Tool Request Payload:</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(sampleCallJson, `sample-${tool.name}`)}
                              className="hover:underline cursor-pointer"
                              style={{ color: 'var(--cobalt-ice)' }}
                            >
                              {copiedKey === `sample-${tool.name}` ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          <pre
                            className="p-2.5 rounded-lg font-mono text-[11px] overflow-x-auto select-all"
                            style={{
                              backgroundColor: 'var(--bg-void)',
                              color: 'var(--ink-primary)',
                              border: '1px solid var(--border-card)',
                            }}
                          >
                            <code>{sampleCallJson}</code>
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </NativeDialog>
  );
}

export default McpConnectModal;
