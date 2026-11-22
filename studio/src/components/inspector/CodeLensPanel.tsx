'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { VisualAtlasBlueprint, RepoFileRecord, CodeSymbol, ArchitectureLayer } from '@shared/types';
import {
  FileCode2,
  Copy,
  Check,
  ExternalLink,
  Search,
  X,
  Code2,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  Hash,
  Boxes,
  FileText,
  Sparkles,
  GitBranch,
  ShieldAlert,
  ChevronRight,
  FolderOpen,
} from 'lucide-react';

export interface CodeLensPanelProps {
  blueprint: VisualAtlasBlueprint;
  filePath: string | null;
  highlightLines?: { start: number; end: number } | null;
  onSelectFile?: (path: string) => void;
  onSelectSymbol?: (symbol: CodeSymbol) => void;
}

// Language color accents matching Obsidian Cobalt & Archival design
const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178C6',
  ts: '#3178C6',
  tsx: '#3178C6',
  javascript: '#F7DF1E',
  js: '#F7DF1E',
  jsx: '#F7DF1E',
  python: '#3572A5',
  py: '#3572A5',
  rust: '#DEA584',
  rs: '#DEA584',
  go: '#00ADD8',
  golang: '#00ADD8',
  java: '#B07219',
  kotlin: '#A97BFF',
  swift: '#F05138',
  ruby: '#701516',
  c: '#555555',
  cpp: '#F34B7D',
  csharp: '#178600',
  html: '#E34C26',
  css: '#563D7C',
  json: '#CBCB41',
  yaml: '#CB171E',
  markdown: '#083fa1',
  md: '#083fa1',
  sql: '#E38C00',
  shell: '#89E051',
  sh: '#89E051',
};

// Architecture layer colors
const LAYER_ACCENTS: Record<ArchitectureLayer, { border: string; bg: string; text: string }> = {
  client: { border: 'rgba(66, 133, 244, 0.4)', bg: 'rgba(66, 133, 244, 0.12)', text: '#8AB4F8' },
  edge: { border: 'rgba(244, 114, 182, 0.4)', bg: 'rgba(244, 114, 182, 0.12)', text: '#F472B6' },
  orchestration: { border: 'rgba(168, 85, 247, 0.4)', bg: 'rgba(168, 85, 247, 0.12)', text: '#C084FC' },
  domain: { border: 'rgba(26, 115, 232, 0.4)', bg: 'rgba(26, 115, 232, 0.14)', text: '#8AB4F8' },
  infrastructure: { border: 'rgba(245, 158, 11, 0.4)', bg: 'rgba(245, 158, 11, 0.12)', text: '#FBBF24' },
  data: { border: 'rgba(52, 211, 153, 0.4)', bg: 'rgba(52, 211, 153, 0.12)', text: '#34D399' },
  tooling: { border: 'rgba(156, 163, 175, 0.4)', bg: 'rgba(156, 163, 175, 0.12)', text: '#D1D5DB' },
};

// AST Symbol kinds badge styling
const SYMBOL_KIND_STYLES: Record<string, { label: string; color: string; border: string }> = {
  function: { label: 'fn', color: '#8AB4F8', border: 'rgba(138, 180, 248, 0.3)' },
  method: { label: 'm', color: '#8AB4F8', border: 'rgba(138, 180, 248, 0.3)' },
  class: { label: 'cls', color: '#FBBF24', border: 'rgba(251, 191, 36, 0.3)' },
  interface: { label: 'itf', color: '#34D399', border: 'rgba(52, 211, 153, 0.3)' },
  type: { label: 'type', color: '#C084FC', border: 'rgba(192, 132, 252, 0.3)' },
  const: { label: 'val', color: '#F472B6', border: 'rgba(244, 114, 182, 0.3)' },
  route: { label: 'api', color: '#38BDF8', border: 'rgba(56, 189, 248, 0.3)' },
  component: { label: 'ui', color: '#60A5FA', border: 'rgba(96, 165, 250, 0.3)' },
  module: { label: 'mod', color: '#9CA3AF', border: 'rgba(156, 163, 175, 0.3)' },
};

/**
 * Lightweight syntax tokenizer for crisp, dependency-free JetBrains Mono rendering.
 */
function highlightCodeLine(lineText: string): React.ReactNode {
  if (!lineText) return <span className="text-[var(--ink-muted)]"> </span>;

  // Single-line comment check
  const trimmed = lineText.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
    return <span className="text-[var(--ink-muted)] italic">{lineText}</span>;
  }

  // Tokenize keywords, strings, comments, numbers, types, punctuation
  const tokenRegex =
    /(\/\/.*$|#[^!].*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:import|export|from|const|let|var|function|return|class|interface|type|async|await|if|else|for|while|switch|case|default|try|catch|finally|throw|new|this|extends|implements|public|private|protected|readonly|static|as|typeof|keyof|in|of|def|self|None|True|False|enum)\b)|(\b(?:string|number|boolean|any|void|unknown|never|Promise|Record|Array|null|undefined|true|false)\b)|(\b\d+(?:\.\d+)?\b)|([{}()[\];,.:])/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(lineText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(lineText.substring(lastIndex, match.index));
    }

    const [full, comment, stringLiteral, keyword, builtInType, numberLiteral, punctuation] = match;

    if (comment) {
      parts.push(
        <span key={match.index} className="text-[var(--ink-muted)] italic">
          {comment}
        </span>
      );
    } else if (stringLiteral) {
      parts.push(
        <span key={match.index} className="text-[#34D399]">
          {stringLiteral}
        </span>
      );
    } else if (keyword) {
      parts.push(
        <span key={match.index} className="text-[#8AB4F8] font-semibold">
          {keyword}
        </span>
      );
    } else if (builtInType) {
      parts.push(
        <span key={match.index} className="text-[#FBBF24]">
          {builtInType}
        </span>
      );
    } else if (numberLiteral) {
      parts.push(
        <span key={match.index} className="text-[#F472B6]">
          {numberLiteral}
        </span>
      );
    } else if (punctuation) {
      parts.push(
        <span key={match.index} className="text-[var(--ink-secondary)]">
          {punctuation}
        </span>
      );
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < lineText.length) {
    parts.push(lineText.substring(lastIndex));
  }

  return parts;
}

/**
 * Reconstructs plausible code representation when raw file content was omitted in AST blueprint.
 */
function reconstructSyntheticSource(file: RepoFileRecord): string[] {
  const lines: string[] = [];
  const lineCount = Math.max(file.lineCount || 20, 20);

  // Header comment
  lines.push(`// =============================================================================`);
  lines.push(`// ${file.path}`);
  lines.push(`// Architecture Layer: ${file.layer.toUpperCase()} | Tokens: ~${file.estimatedTokens.toLocaleString()}`);
  lines.push(`// =============================================================================`);
  lines.push('');

  // Imports
  if (file.imports && file.imports.length > 0) {
    file.imports.forEach((imp) => {
      lines.push(`import { ... } from '${imp}';`);
    });
    lines.push('');
  }

  // Group symbols by line number or arrange sequentially
  const sortedSymbols = [...(file.symbols || [])].sort((a, b) => a.line - b.line);

  let currentLine = lines.length + 1;

  for (const sym of sortedSymbols) {
    // Pad lines until symbol target line if realistic
    while (currentLine < sym.line && lines.length < lineCount) {
      lines.push('');
      currentLine++;
    }

    const exportPrefix = sym.exported ? 'export ' : '';
    if (sym.kind === 'function') {
      lines.push(`${exportPrefix}function ${sym.name}(${sym.signature || ''}): void {`);
      lines.push(`  // Implementation for ${sym.name}`);
      lines.push(`}`);
      currentLine += 3;
    } else if (sym.kind === 'class') {
      lines.push(`${exportPrefix}class ${sym.name} {`);
      lines.push(`  // Class definition for ${sym.name}`);
      lines.push(`}`);
      currentLine += 3;
    } else if (sym.kind === 'interface' || sym.kind === 'type') {
      lines.push(`${exportPrefix}${sym.kind} ${sym.name} {`);
      lines.push(`  // Contract definition`);
      lines.push(`}`);
      currentLine += 3;
    } else {
      lines.push(`${exportPrefix}const ${sym.name} = ...;`);
      currentLine += 1;
    }
    lines.push('');
    currentLine++;
  }

  // Pad remaining lines up to lineCount
  while (lines.length < lineCount) {
    lines.push('');
  }

  return lines;
}

export function CodeLensPanel({
  blueprint,
  filePath,
  highlightLines,
  onSelectFile,
  onSelectSymbol,
}: CodeLensPanelProps) {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeSymbolFilter, setActiveSymbolFilter] = useState<string>('all');
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  const codeContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Find target file record
  const fileRecord: RepoFileRecord | null = useMemo(() => {
    if (!filePath) return null;
    return (
      blueprint.files.find(
        (f) => f.path === filePath || f.path.endsWith(filePath) || filePath.endsWith(f.path)
      ) || null
    );
  }, [blueprint.files, filePath]);

  // Prepared lines of code
  const codeLines: string[] = useMemo(() => {
    if (!fileRecord) return [];
    if (fileRecord.content && fileRecord.content.trim().length > 0) {
      return fileRecord.content.split('\n');
    }
    return reconstructSyntheticSource(fileRecord);
  }, [fileRecord]);

  // Derived effective highlight range
  const effectiveHighlight = useMemo(() => {
    if (selectedLine !== null) {
      return { start: selectedLine, end: selectedLine };
    }
    return highlightLines || null;
  }, [highlightLines, selectedLine]);

  // Scroll to active highlight when it changes
  useEffect(() => {
    if (effectiveHighlight && codeContainerRef.current) {
      const targetLine = effectiveHighlight.start;
      const lineEl = lineRefs.current.get(targetLine);
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [effectiveHighlight]);

  // Copy code handler
  const handleCopy = useCallback(async () => {
    if (!codeLines.length) return;
    try {
      await navigator.clipboard.writeText(codeLines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [codeLines]);

  // Jump to symbol handler
  const handleSymbolClick = useCallback(
    (symbol: CodeSymbol) => {
      setSelectedLine(symbol.line);
      onSelectSymbol?.(symbol);

      const el = lineRefs.current.get(symbol.line);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [onSelectSymbol]
  );

  // GitHub file URL with branch and line anchoring
  const gitHubUrl = useMemo(() => {
    if (!fileRecord) return null;
    const base = blueprint.metadata.htmlUrl || `https://github.com/${blueprint.metadata.fullName}`;
    const branch = blueprint.metadata.branch || blueprint.metadata.defaultBranch || 'main';
    let url = `${base}/blob/${branch}/${fileRecord.path}`;
    if (effectiveHighlight) {
      if (effectiveHighlight.start === effectiveHighlight.end) {
        url += `#L${effectiveHighlight.start}`;
      } else {
        url += `#L${effectiveHighlight.start}-L${effectiveHighlight.end}`;
      }
    }
    return url;
  }, [blueprint.metadata, fileRecord, effectiveHighlight]);

  // Filtered symbols
  const filteredSymbols = useMemo(() => {
    if (!fileRecord?.symbols) return [];
    if (activeSymbolFilter === 'all') return fileRecord.symbols;
    return fileRecord.symbols.filter((s) => s.kind === activeSymbolFilter);
  }, [fileRecord?.symbols, activeSymbolFilter]);

  // Symbol kinds present in this file
  const availableKinds = useMemo(() => {
    if (!fileRecord?.symbols) return [];
    const kinds = new Set(fileRecord.symbols.map((s) => s.kind));
    return Array.from(kinds);
  }, [fileRecord?.symbols]);

  // Breadcrumb path parts
  const breadcrumbSegments = useMemo(() => {
    if (!fileRecord) return [];
    return fileRecord.path.split('/');
  }, [fileRecord]);

  // Language color
  const langColor = useMemo(() => {
    if (!fileRecord) return '#8AB4F8';
    const langKey = fileRecord.language.toLowerCase();
    const extKey = fileRecord.extension.replace('.', '').toLowerCase();
    return LANGUAGE_COLORS[langKey] || LANGUAGE_COLORS[extKey] || '#8AB4F8';
  }, [fileRecord]);

  // Layer styling
  const layerStyle = fileRecord ? LAYER_ACCENTS[fileRecord.layer] : LAYER_ACCENTS.domain;

  // Empty state when no file is selected
  if (!fileRecord) {
    // Show top central files as recommendations
    const topFiles = [...blueprint.files]
      .sort((a, b) => b.centrality - a.centrality || b.fanIn - a.fanIn)
      .slice(0, 6);

    return (
      <div className="flex flex-col h-full bg-[var(--bg-void)] border border-[var(--border-card)] rounded-xl p-6 text-[var(--ink-secondary)]">
        <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-card)]">
          <div className="p-2 rounded-lg bg-[var(--cobalt-tint)] border border-[var(--cobalt-core)]/30 text-[var(--cobalt-ice)]">
            <FileCode2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--ink-primary)]">Peek Source Code Lens</h3>
            <p className="text-xs text-[var(--ink-muted)]">
              Secondary source inspector with AST symbol navigation and line-level context
            </p>
          </div>
        </div>

        <div className="my-auto py-8 text-center max-w-md mx-auto">
          <div className="inline-flex p-3 rounded-full bg-[var(--bg-card)] border border-[var(--border-card)] mb-3 text-[var(--ink-muted)]">
            <Code2 className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-[var(--ink-primary)] mb-1">
            No file currently selected
          </p>
          <p className="text-xs text-[var(--ink-muted)] mb-5">
            Select a node on the Visual Atlas, trace a flow step, or pick a pivotal entrypoint file below to inspect AST symbols and source code.
          </p>

          <div className="text-left bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg p-3">
            <div className="text-[11px] font-semibold tracking-wider uppercase text-[var(--ink-muted)] mb-2 px-1 flex items-center justify-between">
              <span>Top Architectural Anchor Files</span>
              <Sparkles className="w-3 h-3 text-[var(--cobalt-bright)]" />
            </div>
            <div className="space-y-1">
              {topFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => onSelectFile?.(file.path)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[var(--cobalt-tint)] border border-transparent hover:border-[var(--cobalt-core)]/30 flex items-center justify-between text-xs transition-colors group"
                >
                  <span className="font-mono text-[var(--ink-primary)] truncate max-w-[280px]">
                    {file.path}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--ink-muted)]">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--bg-void)] border border-[var(--border-card)]">
                      {file.language}
                    </span>
                    <span className="text-[var(--cobalt-ice)] group-hover:translate-x-0.5 transition-transform">
                      →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-void)] border border-[var(--border-card)] rounded-xl overflow-hidden shadow-2xl">
      {/* 1. Header Bar: Breadcrumb + Action Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-card)] border-b border-[var(--border-card)] gap-3 shrink-0">
        {/* Breadcrumb path */}
        <div className="flex items-center gap-1.5 text-xs min-w-0 font-mono overflow-x-auto no-scrollbar">
          <FolderOpen className="w-3.5 h-3.5 text-[var(--cobalt-ice)] shrink-0" />
          <span className="text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]">
            {blueprint.metadata.name}
          </span>
          {breadcrumbSegments.map((segment, idx) => {
            const isLast = idx === breadcrumbSegments.length - 1;
            return (
              <React.Fragment key={idx}>
                <ChevronRight className="w-3 h-3 text-[var(--ink-muted)] shrink-0 opacity-40" />
                <span
                  className={
                    isLast
                      ? 'text-[var(--ink-primary)] font-semibold truncate'
                      : 'text-[var(--ink-muted)] truncate'
                  }
                >
                  {segment}
                </span>
              </React.Fragment>
            );
          })}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Search Toggle */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-1.5 rounded-md text-xs border transition-colors flex items-center gap-1 ${
              showSearch
                ? 'bg-[var(--cobalt-tint)] border-[var(--cobalt-bright)] text-[var(--cobalt-ice)]'
                : 'bg-[var(--bg-void)] border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
            title="Search inside file"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Copy Code */}
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--bg-void)] border border-[var(--border-card)] hover:border-[var(--cobalt-core)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-all flex items-center gap-1.5"
            title="Copy full source"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[var(--emerald)]" />
                <span className="text-[var(--emerald)] text-[11px]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="text-[11px]">Copy</span>
              </>
            )}
          </button>

          {/* GitHub link */}
          {gitHubUrl && (
            <a
              href={gitHubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--bg-void)] border border-[var(--border-card)] hover:border-[var(--cobalt-core)] text-[var(--ink-secondary)] hover:text-[var(--cobalt-ice)] transition-all flex items-center gap-1.5 group"
              title="Open on GitHub"
            >
              <GitBranch className="w-3.5 h-3.5 text-[var(--cobalt-ice)]" />
              <span className="text-[11px]">GitHub</span>
              <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
            </a>
          )}
        </div>
      </div>

      {/* Optional Search Input bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-[var(--bg-card-elevated)] border-b border-[var(--border-card)] shrink-0">
          <Search className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search lines or tokens..."
            className="flex-1 bg-transparent text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] outline-none font-mono"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* 2. Metadata & Metrics Ribbon */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card-elevated)]/60 border-b border-[var(--border-card)] overflow-x-auto no-scrollbar shrink-0 text-xs">
        {/* Language Badge */}
        <div
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[11px] font-medium border"
          style={{
            borderColor: `${langColor}44`,
            backgroundColor: `${langColor}14`,
            color: langColor,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: langColor }} />
          {fileRecord.language || 'Code'}
        </div>

        {/* Layer Badge */}
        <div
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[11px] font-medium border uppercase tracking-wider"
          style={{
            borderColor: layerStyle.border,
            backgroundColor: layerStyle.bg,
            color: layerStyle.text,
          }}
        >
          <Layers className="w-3 h-3" />
          {fileRecord.layer}
        </div>

        {/* Tokens Badge */}
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-void)] border border-[var(--border-card)] text-[var(--ink-secondary)] text-[11px]">
          <span className="text-[var(--ink-muted)]">Tokens:</span>
          <span className="font-mono text-[var(--ink-primary)]">
            ~{fileRecord.estimatedTokens.toLocaleString()}
          </span>
        </div>

        {/* Lines Badge */}
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-void)] border border-[var(--border-card)] text-[var(--ink-secondary)] text-[11px]">
          <Hash className="w-3 h-3 text-[var(--ink-muted)]" />
          <span className="font-mono text-[var(--ink-primary)]">{codeLines.length} lines</span>
        </div>

        {/* Fan-In / Fan-Out Badges */}
        <div
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--emerald-bg)] border border-[var(--emerald-border)] text-[var(--emerald)] text-[11px]"
          title="Fan-in: Files that import this file"
        >
          <ArrowDownRight className="w-3 h-3" />
          <span>In: {fileRecord.fanIn}</span>
        </div>

        <div
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] text-[var(--cobalt-ice)] text-[11px]"
          title="Fan-out: Files imported by this file"
        >
          <ArrowUpRight className="w-3 h-3" />
          <span>Out: {fileRecord.fanOut}</span>
        </div>

        {/* Centrality */}
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-void)] border border-[var(--border-card)] text-[var(--ink-secondary)] text-[11px]">
          <span className="text-[var(--ink-muted)]">Centrality:</span>
          <span className="font-mono text-[var(--cobalt-ice)] font-medium">
            {Math.round(fileRecord.centrality * 100)}%
          </span>
        </div>

        {/* Entrypoint / Test indicators */}
        {fileRecord.isEntrypoint && (
          <span className="px-2 py-0.5 rounded bg-[var(--cobalt-tint)] text-[var(--cobalt-bright)] font-semibold text-[10px] tracking-wide border border-[var(--cobalt-border)] uppercase">
            Entrypoint
          </span>
        )}
        {fileRecord.isTest && (
          <span className="px-2 py-0.5 rounded bg-[var(--bg-void)] text-[var(--ink-muted)] text-[10px] border border-[var(--border-card)] uppercase">
            Test
          </span>
        )}
      </div>

      {/* 3. Interactive AST Symbol Navigation Chips */}
      {fileRecord.symbols && fileRecord.symbols.length > 0 && (
        <div className="px-4 py-2 bg-[var(--bg-card)] border-b border-[var(--border-card)] shrink-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ink-secondary)]">
              <Boxes className="w-3.5 h-3.5 text-[var(--cobalt-ice)]" />
              <span>AST Symbols ({fileRecord.symbols.length})</span>
            </div>

            {/* Quick kind filter tabs */}
            {availableKinds.length > 1 && (
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  onClick={() => setActiveSymbolFilter('all')}
                  className={`px-1.5 py-0.5 rounded ${
                    activeSymbolFilter === 'all'
                      ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] font-semibold'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]'
                  }`}
                >
                  All
                </button>
                {availableKinds.map((kind) => (
                  <button
                    key={kind}
                    onClick={() => setActiveSymbolFilter(kind)}
                    className={`px-1.5 py-0.5 rounded capitalize ${
                      activeSymbolFilter === kind
                        ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] font-semibold'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]'
                    }`}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Horizontal scrollable chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {filteredSymbols.map((sym, idx) => {
              const kindCfg = SYMBOL_KIND_STYLES[sym.kind] || {
                label: sym.kind.slice(0, 3),
                color: '#8AB4F8',
                border: 'rgba(138, 180, 248, 0.3)',
              };
              const isSelected = selectedLine === sym.line;

              return (
                <button
                  key={`${sym.name}-${idx}`}
                  onClick={() => handleSymbolClick(sym)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-all flex items-center gap-1.5 shrink-0 ${
                    isSelected
                      ? 'bg-[var(--cobalt-tint-strong)] border-[var(--cobalt-bright)] text-[var(--ink-primary)] shadow-[0_0_12px_rgba(26,115,232,0.3)]'
                      : 'bg-[var(--bg-void)] border-[var(--border-card)] text-[var(--ink-secondary)] hover:border-[var(--cobalt-border)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  <span
                    className="text-[9px] font-bold px-1 rounded uppercase tracking-wider"
                    style={{
                      color: kindCfg.color,
                      border: `1px solid ${kindCfg.border}`,
                      backgroundColor: `${kindCfg.color}15`,
                    }}
                  >
                    {kindCfg.label}
                  </span>
                  <span className="font-medium">{sym.name}</span>
                  <span className="text-[10px] text-[var(--ink-muted)]">:{sym.line}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Line-Numbered JetBrains Mono Code Viewer with Cobalt Active Line Highlight Band */}
      <div
        ref={codeContainerRef}
        className="flex-1 overflow-auto bg-[var(--bg-void)] font-[family-name:var(--font-mono)] text-xs leading-relaxed"
      >
        <div className="min-w-full inline-block py-2">
          {codeLines.map((lineText, idx) => {
            const lineNum = idx + 1;
            const isHighlighted =
              effectiveHighlight &&
              lineNum >= effectiveHighlight.start &&
              lineNum <= effectiveHighlight.end;

            const isStartLine = effectiveHighlight && lineNum === effectiveHighlight.start;

            const isSearchMatch =
              searchQuery.trim().length > 0 &&
              lineText.toLowerCase().includes(searchQuery.toLowerCase());

            return (
              <div
                key={lineNum}
                ref={(el) => {
                  if (el) {
                    lineRefs.current.set(lineNum, el);
                  } else {
                    lineRefs.current.delete(lineNum);
                  }
                }}
                onClick={() => setSelectedLine(lineNum)}
                className={`group flex items-center min-w-full px-2 cursor-pointer transition-colors relative ${
                  isHighlighted
                    ? 'bg-[var(--cobalt-tint)] border-l-2 border-[var(--cobalt-bright)]'
                    : isSearchMatch
                    ? 'bg-[rgba(251,191,36,0.12)] border-l-2 border-[#FBBF24]'
                    : 'hover:bg-[var(--bg-subtle-hover)] border-l-2 border-transparent'
                }`}
              >
                {/* Line Number Column */}
                <span
                  className={`w-12 pr-4 text-right select-none shrink-0 font-mono text-[11px] ${
                    isHighlighted
                      ? 'text-[var(--cobalt-ice)] font-semibold'
                      : 'text-[var(--ink-muted)] group-hover:text-[var(--ink-secondary)]'
                  }`}
                >
                  {lineNum}
                </span>

                {/* Line Marker Indicator for Highlight Range Start */}
                {isStartLine && (
                  <span className="absolute left-14 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--cobalt-bright)] shadow-[0_0_6px_var(--cobalt-core)]" />
                )}

                {/* Code Text Content */}
                <span className="flex-1 whitespace-pre pl-2 text-[var(--ink-primary)]">
                  {highlightCodeLine(lineText)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Footer: Status Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[var(--bg-card)] border-t border-[var(--border-card)] text-[10px] text-[var(--ink-muted)] font-mono shrink-0">
        <div className="flex items-center gap-3">
          <span>
            UTF-8 • {fileRecord.extension.toUpperCase() || 'SRC'}
          </span>
          {effectiveHighlight && (
            <span className="text-[var(--cobalt-ice)] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--cobalt-core)]" />
              Focus: L{effectiveHighlight.start}
              {effectiveHighlight.start !== effectiveHighlight.end ? `-L${effectiveHighlight.end}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span>GitUnderstand Peek Source Lens</span>
        </div>
      </div>
    </div>
  );
}

export default CodeLensPanel;
