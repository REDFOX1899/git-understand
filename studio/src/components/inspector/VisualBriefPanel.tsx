'use client';

import React, { useMemo, useState, useCallback } from 'react';
import type {
  VisualAtlasBlueprint,
  AtlasNode,
  AtlasEdge,
  ArchitectureLayer,
  SubsystemCluster,
} from '@shared/types';
import {
  Layers,
  Cpu,
  Activity,
  ShieldAlert,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  FileCode,
  ExternalLink,
  Zap,
  Box,
  Compass,
  Sparkles,
  Hash,
  Database,
  Globe,
  Network,
  CheckCircle2,
  Copy,
  ChevronRight,
  Flame,
  GitBranch,
  FolderTree,
  Radio,
} from 'lucide-react';

// =============================================================================
// Props & Configuration
// =============================================================================

export interface VisualBriefPanelProps {
  blueprint: VisualAtlasBlueprint;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onPeekFile: (filePath: string, lineStart?: number, lineEnd?: number) => void;
  className?: string;
}

const LAYER_CONFIG: Record<
  ArchitectureLayer,
  { label: string; color: string; bg: string; border: string }
> = {
  client: {
    label: 'Client UI',
    color: 'var(--cyan-layer, #38BDF8)',
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.3)',
  },
  edge: {
    label: 'Edge & Gateway',
    color: 'var(--teal-layer, #2DD4BF)',
    bg: 'rgba(45, 212, 191, 0.12)',
    border: 'rgba(45, 212, 191, 0.3)',
  },
  orchestration: {
    label: 'Orchestration',
    color: 'var(--cobalt-bright, #4285F4)',
    bg: 'var(--cobalt-tint, rgba(26, 115, 232, 0.14))',
    border: 'var(--cobalt-border, rgba(138, 180, 248, 0.3))',
  },
  domain: {
    label: 'Domain Logic',
    color: 'var(--indigo-layer, #818CF8)',
    bg: 'rgba(129, 140, 248, 0.12)',
    border: 'rgba(129, 140, 248, 0.3)',
  },
  infrastructure: {
    label: 'Infrastructure',
    color: 'var(--amber, #FBBF24)',
    bg: 'var(--amber-bg, rgba(251, 191, 36, 0.11))',
    border: 'var(--amber-border, rgba(251, 191, 36, 0.28))',
  },
  data: {
    label: 'Data & Storage',
    color: 'var(--emerald, #34D399)',
    bg: 'var(--emerald-bg, rgba(52, 211, 153, 0.11))',
    border: 'var(--emerald-border, rgba(52, 211, 153, 0.28))',
  },
  tooling: {
    label: 'Tooling & CI',
    color: 'var(--ink-secondary, #9AA0A6)',
    bg: 'rgba(154, 160, 166, 0.12)',
    border: 'rgba(154, 160, 166, 0.28)',
  },
};

const KIND_CONFIG: Record<
  AtlasNode['kind'],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  service: { label: 'Service', icon: Cpu },
  module: { label: 'Module', icon: Box },
  ui: { label: 'UI Component', icon: Layers },
  api: { label: 'API Endpoint', icon: Globe },
  store: { label: 'State Store', icon: Database },
  agent: { label: 'AI Agent', icon: Sparkles },
  pipeline: { label: 'Pipeline', icon: Network },
  external: { label: 'External Dep', icon: ExternalLink },
  config: { label: 'Configuration', icon: Hash },
};

function getHealthBadge(score: number) {
  if (score >= 80) {
    return {
      label: 'Optimal',
      score,
      color: 'var(--emerald, #34D399)',
      bg: 'var(--emerald-bg, rgba(52, 211, 153, 0.11))',
      border: 'var(--emerald-border, rgba(52, 211, 153, 0.28))',
    };
  }
  if (score >= 60) {
    return {
      label: 'Guarded',
      score,
      color: 'var(--amber, #FBBF24)',
      bg: 'var(--amber-bg, rgba(251, 191, 36, 0.11))',
      border: 'var(--amber-border, rgba(251, 191, 36, 0.28))',
    };
  }
  return {
    label: 'At Risk',
    score,
    color: 'var(--vermilion, #FF5A4F)',
    bg: 'var(--vermilion-bg, rgba(255, 90, 79, 0.13))',
    border: 'var(--vermilion-border, rgba(255, 90, 79, 0.34))',
  };
}

function getBlastRadiusBadge(blastRadiusScore: number) {
  if (blastRadiusScore <= 30) {
    return {
      label: 'Contained',
      tier: 'Low',
      score: blastRadiusScore,
      color: 'var(--emerald, #34D399)',
      bg: 'var(--emerald-bg, rgba(52, 211, 153, 0.11))',
      border: 'var(--emerald-border, rgba(52, 211, 153, 0.28))',
    };
  }
  if (blastRadiusScore <= 65) {
    return {
      label: 'Moderate',
      tier: 'Mid',
      score: blastRadiusScore,
      color: 'var(--amber, #FBBF24)',
      bg: 'var(--amber-bg, rgba(251, 191, 36, 0.11))',
      border: 'var(--amber-border, rgba(251, 191, 36, 0.28))',
    };
  }
  return {
    label: 'Critical Hub',
    tier: 'High',
    score: blastRadiusScore,
    color: 'var(--vermilion, #FF5A4F)',
    bg: 'var(--vermilion-bg, rgba(255, 90, 79, 0.13))',
    border: 'var(--vermilion-border, rgba(255, 90, 79, 0.34))',
  };
}

// =============================================================================
// Main Component
// =============================================================================

export function VisualBriefPanel({
  blueprint,
  selectedNodeId,
  onSelectNode,
  onPeekFile,
  className = '',
}: VisualBriefPanelProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1800);
  }, []);

  // Selected node lookup
  const node = useMemo(() => {
    if (!selectedNodeId) return null;
    return blueprint.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [blueprint.nodes, selectedNodeId]);

  // Subsystem lookup
  const subsystem = useMemo(() => {
    if (!node) return null;
    return blueprint.subsystems.find((s) => s.id === node.subsystemId) || null;
  }, [blueprint.subsystems, node]);

  // XRay audit lookup
  const xrayModule = useMemo(() => {
    if (!node || !blueprint.xray) return null;
    return (
      blueprint.xray.modules.find(
        (m) => m.nodeId === node.id || m.primaryFile === node.primaryFile
      ) || null
    );
  }, [blueprint.xray, node]);

  // Incoming and outgoing edges and neighbors
  const { incoming, outgoing } = useMemo(() => {
    if (!node) return { incoming: [], outgoing: [] };

    const nodeMap = new Map<string, AtlasNode>();
    for (const n of blueprint.nodes) {
      nodeMap.set(n.id, n);
    }

    const inEdges = blueprint.edges
      .filter((e) => e.target === node.id)
      .map((edge) => ({
        edge,
        neighbor: nodeMap.get(edge.source) || null,
      }))
      .filter((item) => item.neighbor !== null);

    const outEdges = blueprint.edges
      .filter((e) => e.source === node.id)
      .map((edge) => ({
        edge,
        neighbor: nodeMap.get(edge.target) || null,
      }))
      .filter((item) => item.neighbor !== null);

    return { incoming: inEdges, outgoing: outEdges };
  }, [blueprint.edges, blueprint.nodes, node]);

  // Health and Blast Radius scores
  const healthBadge = useMemo(() => {
    if (!node) return null;
    let score = 85;
    if (xrayModule?.overallHealth !== undefined) {
      score = Math.round(xrayModule.overallHealth);
    } else if (subsystem?.healthScore !== undefined) {
      score = Math.round(subsystem.healthScore);
    } else if (node.riskScore !== undefined) {
      score = Math.round(100 - node.riskScore * 100);
    }
    return getHealthBadge(score);
  }, [node, xrayModule, subsystem]);

  const blastRadiusBadge = useMemo(() => {
    if (!node) return null;
    let score = 25;
    if (xrayModule?.blastRadius !== undefined) {
      score = Math.round(xrayModule.blastRadius * 100);
    } else {
      const centralityWeight = node.centrality * 65;
      const fanInWeight = Math.min(1, (node.fanIn || 0) / 8) * 35;
      score = Math.min(100, Math.round(centralityWeight + fanInWeight));
    }
    return getBlastRadiusBadge(score);
  }, [node, xrayModule]);

  // High-centrality hubs for the empty state
  const topHubs = useMemo(() => {
    return [...blueprint.nodes]
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, 5);
  }, [blueprint.nodes]);

  // ===========================================================================
  // Empty State: Repository Overview Dossier
  // ===========================================================================
  if (!node) {
    return (
      <div
        className={`flex flex-col h-full overflow-y-auto bg-[var(--bg-card)] text-[var(--ink-primary)] p-5 space-y-6 ${className}`}
      >
        {/* Repo Title & Architecture Banner */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)]">
              <Compass className="w-3.5 h-3.5" />
              Repository Visual Brief
            </span>
            <span className="text-xs text-[var(--ink-muted)] flex items-center gap-1 font-mono">
              <GitBranch className="w-3 h-3" />
              {blueprint.metadata.defaultBranch || 'main'}
            </span>
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--ink-primary)]">
              {blueprint.metadata.name}
            </h2>
            <p className="text-xs text-[var(--ink-secondary)] mt-0.5 line-clamp-2">
              {blueprint.metadata.description || blueprint.oneLiner}
            </p>
          </div>

          {/* Architecture Pattern Banner */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)] space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cobalt-ice)] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[var(--cobalt-bright)]" />
              Architecture Paradigm
            </div>
            <p className="text-sm font-medium text-[var(--ink-primary)]">
              {blueprint.architecturePattern}
            </p>
            <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
              {blueprint.headline}
            </p>
          </div>
        </div>

        {/* Tech Stack Badges */}
        {blueprint.techStackBadges && blueprint.techStackBadges.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
              Core Technologies
            </div>
            <div className="flex flex-wrap gap-1.5">
              {blueprint.techStackBadges.map((badge, idx) => (
                <span
                  key={`${badge}-${idx}`}
                  className="px-2.5 py-1 rounded-md text-xs font-mono bg-[var(--bg-card-elevated)] text-[var(--ink-primary)] border border-[var(--border-card)] shadow-xs"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Repository Vitals Matrix */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)] flex items-center justify-between">
            <span>Repository Vitals</span>
            <span className="text-[10px] font-normal text-[var(--ink-muted)]">
              {blueprint.stats.analyzedFiles} / {blueprint.stats.totalFiles} files
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-card)]">
              <span className="text-[10px] uppercase text-[var(--ink-muted)] block">
                Total Volume
              </span>
              <span className="text-base font-bold font-mono text-[var(--ink-primary)]">
                {blueprint.stats.totalTokens.toLocaleString()}
              </span>
              <span className="text-[10px] text-[var(--ink-secondary)] block mt-0.5">
                estimated tokens
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-card)]">
              <span className="text-[10px] uppercase text-[var(--ink-muted)] block">
                Code Scale
              </span>
              <span className="text-base font-bold font-mono text-[var(--ink-primary)]">
                {blueprint.stats.totalLines.toLocaleString()}
              </span>
              <span className="text-[10px] text-[var(--ink-secondary)] block mt-0.5">
                lines across tree
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-card)]">
              <span className="text-[10px] uppercase text-[var(--ink-muted)] block">
                Subsystems
              </span>
              <span className="text-base font-bold font-mono text-[var(--cobalt-ice)]">
                {blueprint.subsystems.length}
              </span>
              <span className="text-[10px] text-[var(--ink-secondary)] block mt-0.5">
                architectural strata
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-card)]">
              <span className="text-[10px] uppercase text-[var(--ink-muted)] block">
                Circular Deps
              </span>
              <span
                className={`text-base font-bold font-mono ${
                  blueprint.stats.circularDeps > 0
                    ? 'text-[var(--vermilion)]'
                    : 'text-[var(--emerald)]'
                }`}
              >
                {blueprint.stats.circularDeps}
              </span>
              <span className="text-[10px] text-[var(--ink-secondary)] block mt-0.5">
                {blueprint.stats.circularDeps === 0 ? 'zero loops' : 'actionable cycles'}
              </span>
            </div>
          </div>
        </div>

        {/* Subsystems Breakdown */}
        <div className="space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)] flex items-center justify-between">
            <span>Architectural Subsystems</span>
            <span className="text-[10px] text-[var(--ink-muted)]">
              Click node to inspect
            </span>
          </div>

          <div className="space-y-2">
            {blueprint.subsystems.map((sub) => {
              const layerStyle = LAYER_CONFIG[sub.layer] || LAYER_CONFIG.domain;
              return (
                <div
                  key={sub.id}
                  className="p-3 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)] space-y-2 hover:border-[var(--cobalt-border)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: sub.color || layerStyle.color }}
                      />
                      <span className="text-sm font-semibold text-[var(--ink-primary)]">
                        {sub.name}
                      </span>
                    </div>
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                      style={{
                        color: layerStyle.color,
                        backgroundColor: layerStyle.bg,
                        borderColor: layerStyle.border,
                      }}
                    >
                      {layerStyle.label}
                    </span>
                  </div>

                  <p className="text-xs text-[var(--ink-secondary)]">
                    {sub.tagline}
                  </p>

                  {/* Subsystem constituent nodes */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {sub.nodeIds.slice(0, 6).map((nodeId) => {
                      const atlasNode = blueprint.nodes.find((n) => n.id === nodeId);
                      if (!atlasNode) return null;
                      return (
                        <button
                          key={nodeId}
                          type="button"
                          onClick={() => onSelectNode(nodeId)}
                          className="px-2 py-1 rounded-md text-[11px] font-mono bg-[var(--bg-pill)] hover:bg-[var(--bg-pill-hover)] text-[var(--ink-primary)] border border-[var(--border-pill)] hover:border-[var(--cobalt-border)] transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <span>{atlasNode.label}</span>
                          <ChevronRight className="w-2.5 h-2.5 text-[var(--ink-muted)]" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* High-Centrality Hubs */}
        <div className="space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
            High-Impact Topology Hubs
          </div>
          <div className="space-y-1.5">
            {topHubs.map((hub) => {
              const layerStyle = LAYER_CONFIG[hub.layer] || LAYER_CONFIG.domain;
              const KindIcon = KIND_CONFIG[hub.kind]?.icon || Box;
              return (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => onSelectNode(hub.id)}
                  className="w-full text-left p-2.5 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-card)] hover:border-[var(--cobalt-bright)] hover:bg-[var(--bg-pill-hover)] transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="p-1.5 rounded-md flex-shrink-0"
                      style={{
                        backgroundColor: layerStyle.bg,
                        color: layerStyle.color,
                      }}
                    >
                      <KindIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--ink-primary)] group-hover:text-[var(--cobalt-ice)] transition-colors truncate">
                        {hub.label}
                      </div>
                      <div className="text-[10px] text-[var(--ink-muted)] truncate">
                        {hub.primaryFile}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-mono text-[var(--cobalt-ice)] bg-[var(--cobalt-tint)] px-1.5 py-0.5 rounded border border-[var(--cobalt-border)]">
                      {(hub.centrality * 100).toFixed(0)}% centrality
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--ink-muted)] group-hover:text-[var(--cobalt-ice)] group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Entrypoint CTA */}
        {blueprint.nodes[0] && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                const primary =
                  topHubs[0] ||
                  blueprint.nodes.find((n) => n.kind === 'service' || n.kind === 'api') ||
                  blueprint.nodes[0];
                onPeekFile(primary.primaryFile, primary.lineStart, primary.lineEnd);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-[var(--cobalt-core)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
            >
              <FileCode className="w-4 h-4" />
              Peek Primary Entrypoint ({blueprint.nodes[0]?.primaryFile.split('/').pop()})
            </button>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // Selected Node Dossier View
  // ===========================================================================
  const layerStyle = LAYER_CONFIG[node.layer] || LAYER_CONFIG.domain;
  const KindIcon = KIND_CONFIG[node.kind]?.icon || Box;

  return (
    <div
      className={`flex flex-col h-full overflow-y-auto bg-[var(--bg-card)] text-[var(--ink-primary)] p-5 space-y-6 ${className}`}
    >
      {/* Node Header & Identification */}
      <div className="space-y-2.5">
        {/* Subsystem & Quick Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: subsystem?.color || layerStyle.color,
              }}
            />
            <span className="text-xs font-medium text-[var(--ink-secondary)]">
              {subsystem?.name || 'Architecture Cluster'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleCopy(node.primaryFile)}
            className="text-[11px] font-mono text-[var(--ink-muted)] hover:text-[var(--ink-primary)] flex items-center gap-1 transition-colors cursor-pointer"
            title="Copy primary file path"
          >
            {copiedText === node.primaryFile ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-[var(--emerald)]" />
                <span className="text-[var(--emerald)]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy Path</span>
              </>
            )}
          </button>
        </div>

        {/* Node Label & Subtitle */}
        <div>
          <div className="flex items-center gap-2.5">
            <div
              className="p-2 rounded-lg flex-shrink-0"
              style={{
                backgroundColor: layerStyle.bg,
                color: layerStyle.color,
                border: `1px solid ${layerStyle.border}`,
              }}
            >
              <KindIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-[var(--ink-primary)] leading-snug">
                {node.label}
              </h2>
              <p className="text-xs text-[var(--ink-secondary)]">
                {node.subtitle || KIND_CONFIG[node.kind]?.label}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Badges Matrix: Layer / Kind / Health / Blast Radius */}
      <div className="grid grid-cols-2 gap-2">
        {/* Layer Badge */}
        <div
          className="p-2.5 rounded-xl border flex flex-col justify-between"
          style={{
            backgroundColor: layerStyle.bg,
            borderColor: layerStyle.border,
          }}
        >
          <span className="text-[10px] uppercase font-semibold text-[var(--ink-muted)]">
            Layer
          </span>
          <span
            className="text-xs font-bold mt-1"
            style={{ color: layerStyle.color }}
          >
            {layerStyle.label}
          </span>
        </div>

        {/* Kind Badge */}
        <div className="p-2.5 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)] flex flex-col justify-between">
          <span className="text-[10px] uppercase font-semibold text-[var(--ink-muted)]">
            Component Kind
          </span>
          <span className="text-xs font-bold text-[var(--ink-primary)] mt-1 flex items-center gap-1.5">
            <KindIcon className="w-3 h-3 text-[var(--cobalt-bright)]" />
            {KIND_CONFIG[node.kind]?.label || node.kind}
          </span>
        </div>

        {/* Health Score Badge */}
        {healthBadge && (
          <div
            className="p-2.5 rounded-xl border flex flex-col justify-between"
            style={{
              backgroundColor: healthBadge.bg,
              borderColor: healthBadge.border,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-semibold text-[var(--ink-muted)]">
                Health Index
              </span>
              <Activity
                className="w-3 h-3"
                style={{ color: healthBadge.color }}
              />
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span
                className="text-sm font-bold font-mono"
                style={{ color: healthBadge.color }}
              >
                {healthBadge.score}%
              </span>
              <span className="text-[10px] text-[var(--ink-secondary)]">
                ({healthBadge.label})
              </span>
            </div>
          </div>
        )}

        {/* Blast Radius Badge */}
        {blastRadiusBadge && (
          <div
            className="p-2.5 rounded-xl border flex flex-col justify-between"
            style={{
              backgroundColor: blastRadiusBadge.bg,
              borderColor: blastRadiusBadge.border,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-semibold text-[var(--ink-muted)]">
                Blast Radius
              </span>
              <Flame
                className="w-3 h-3"
                style={{ color: blastRadiusBadge.color }}
              />
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span
                className="text-sm font-bold font-mono"
                style={{ color: blastRadiusBadge.color }}
              >
                {blastRadiusBadge.score}%
              </span>
              <span className="text-[10px] text-[var(--ink-secondary)]">
                ({blastRadiusBadge.label})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Visual Dossier Summary */}
      <div className="p-3.5 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--cobalt-border)] shadow-xs relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-[var(--cobalt-core)]" />
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cobalt-ice)] mb-1.5 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-[var(--cobalt-bright)]" />
          Visual Brief Dossier
        </div>
        <p className="text-xs text-[var(--ink-primary)] leading-relaxed font-sans">
          {node.visualBrief ||
            `${node.label} encapsulates the primary ${node.kind} logic for the ${subsystem?.name || 'subsystem'}, orchestrating data flow and contracts.`}
        </p>

        {xrayModule?.topFinding && (
          <div className="mt-2.5 pt-2 border-t border-[var(--border-card)] flex items-start gap-1.5 text-[11px] text-[var(--amber)]">
            <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[var(--amber)]" />
            <span className="leading-tight">{xrayModule.topFinding}</span>
          </div>
        )}
      </div>

      {/* Inputs -> Outputs Data Flow Chips */}
      <div className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)] flex items-center justify-between">
          <span>Contracts & Data Flow</span>
          <span className="text-[10px] text-[var(--ink-muted)] flex items-center gap-1">
            <Radio className="w-2.5 h-2.5 text-[var(--cobalt-bright)] animate-pulse" />
            Inputs ➔ Outputs
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)] space-y-3">
          {/* Inputs Section */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase text-[var(--ink-muted)] flex items-center gap-1">
              <ArrowDownRight className="w-3 h-3 text-[var(--cyan-layer)]" />
              Incoming Invariants (Inputs)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {node.inputs && node.inputs.length > 0 ? (
                node.inputs.map((inp, idx) => (
                  <span
                    key={`inp-${idx}`}
                    className="px-2 py-1 rounded-md text-[11px] font-mono bg-[var(--bg-pill)] text-[var(--ink-primary)] border border-[var(--border-pill)]"
                  >
                    {inp}
                  </span>
                ))
              ) : (
                <span className="text-[11px] font-mono text-[var(--ink-muted)] italic">
                  Standard caller arguments & context payload
                </span>
              )}
            </div>
          </div>

          {/* Visual Divider / Arrow */}
          <div className="flex items-center justify-center my-1 text-[var(--cobalt-ice)] opacity-60">
            <div className="h-[1px] flex-1 bg-[var(--border-card)]" />
            <span className="px-2 text-xs font-mono">▼</span>
            <div className="h-[1px] flex-1 bg-[var(--border-card)]" />
          </div>

          {/* Outputs Section */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase text-[var(--ink-muted)] flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-[var(--emerald)]" />
              Emitted Contracts (Outputs)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {node.outputs && node.outputs.length > 0 ? (
                node.outputs.map((out, idx) => (
                  <span
                    key={`out-${idx}`}
                    className="px-2 py-1 rounded-md text-[11px] font-mono bg-[var(--bg-pill)] text-[var(--ink-primary)] border border-[var(--border-pill)]"
                  >
                    {out}
                  </span>
                ))
              ) : (
                <span className="text-[11px] font-mono text-[var(--ink-muted)] italic">
                  Normalized state transitions & return contract
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Neighbor Pills: Incoming (Callers) / Outgoing (Dependencies) */}
      <div className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)] flex items-center justify-between">
          <span>Topological Neighbors</span>
          <span className="text-[10px] text-[var(--ink-muted)] font-mono">
            Fan-In: {node.fanIn} | Fan-Out: {node.fanOut}
          </span>
        </div>

        {/* Incoming Providers */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
            Incoming Providers ({incoming.length})
          </div>
          {incoming.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {incoming.map(({ edge, neighbor }) => {
                if (!neighbor) return null;
                const nLayer = LAYER_CONFIG[neighbor.layer] || LAYER_CONFIG.domain;
                return (
                  <button
                    key={`inc-${neighbor.id}-${edge.id}`}
                    type="button"
                    onClick={() => onSelectNode(neighbor.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[var(--bg-card-elevated)] hover:bg-[var(--bg-pill-hover)] text-[var(--ink-primary)] border border-[var(--border-card)] hover:border-[var(--cobalt-bright)] transition-all flex items-center gap-1.5 cursor-pointer group"
                    title={`Edge: ${edge.label || edge.kind}`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: nLayer.color }}
                    />
                    <span className="font-semibold group-hover:text-[var(--cobalt-ice)] transition-colors">
                      {neighbor.label}
                    </span>
                    {edge.label && (
                      <span className="text-[10px] text-[var(--ink-muted)] font-normal border-l border-[var(--border-card)] pl-1.5">
                        {edge.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-[var(--ink-muted)] italic bg-[var(--bg-card-elevated)] p-2 rounded-lg border border-[var(--border-card)]">
              No direct incoming dependencies detected in current scope (Entrypoint).
            </div>
          )}
        </div>

        {/* Outgoing Consumers / Dependencies */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
            Outgoing Dependencies ({outgoing.length})
          </div>
          {outgoing.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {outgoing.map(({ edge, neighbor }) => {
                if (!neighbor) return null;
                const nLayer = LAYER_CONFIG[neighbor.layer] || LAYER_CONFIG.domain;
                return (
                  <button
                    key={`out-${neighbor.id}-${edge.id}`}
                    type="button"
                    onClick={() => onSelectNode(neighbor.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[var(--bg-card-elevated)] hover:bg-[var(--bg-pill-hover)] text-[var(--ink-primary)] border border-[var(--border-card)] hover:border-[var(--cobalt-bright)] transition-all flex items-center gap-1.5 cursor-pointer group"
                    title={`Edge: ${edge.label || edge.kind}`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: nLayer.color }}
                    />
                    <span className="font-semibold group-hover:text-[var(--cobalt-ice)] transition-colors">
                      {neighbor.label}
                    </span>
                    {edge.label && (
                      <span className="text-[10px] text-[var(--ink-muted)] font-normal border-l border-[var(--border-card)] pl-1.5">
                        {edge.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-[var(--ink-muted)] italic bg-[var(--bg-card-elevated)] p-2 rounded-lg border border-[var(--border-card)]">
              Terminal node (no downstream dependencies).
            </div>
          )}
        </div>
      </div>

      {/* Key Symbols & Exports */}
      {node.keySymbols && node.keySymbols.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)] flex items-center justify-between">
            <span>Key Symbols & Exports</span>
            <span className="text-[10px] text-[var(--ink-muted)]">
              {node.keySymbols.length} declarations
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {node.keySymbols.map((sym, idx) => (
              <span
                key={`${sym}-${idx}`}
                className="px-2 py-1 rounded-md text-[11px] font-mono bg-[var(--bg-card-elevated)] text-[var(--ink-primary)] border border-[var(--border-card)] flex items-center gap-1"
              >
                <span className="text-[var(--cobalt-ice)] font-bold">ƒ</span>
                <span>{sym}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Primary Source File Card & Peek Source CTA */}
      <div className="p-3.5 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)] space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5 text-[var(--cobalt-ice)]" />
            Source Anchor
          </div>
          <span className="text-[10px] font-mono text-[var(--ink-muted)]">
            {node.estimatedTokens.toLocaleString()} tokens
          </span>
        </div>

        <div className="space-y-0.5">
          <div
            className="text-xs font-mono text-[var(--ink-primary)] truncate"
            title={node.primaryFile}
          >
            {node.primaryFile}
          </div>
          <div className="text-[10px] font-mono text-[var(--ink-secondary)]">
            Lines {node.lineStart || 1}–{node.lineEnd || 'EOF'}
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            onPeekFile(node.primaryFile, node.lineStart, node.lineEnd)
          }
          className="w-full py-2.5 px-4 rounded-xl bg-[var(--cobalt-core)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer group"
        >
          <FileCode className="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span>Peek Source Code</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {node.filePaths && node.filePaths.length > 1 && (
          <div className="pt-2 border-t border-[var(--border-card)] space-y-1.5">
            <span className="text-[10px] uppercase font-semibold text-[var(--ink-muted)] block">
              Co-Located Cluster Files ({node.filePaths.length - 1} more)
            </span>
            <div className="space-y-1">
              {node.filePaths
                .filter((p) => p !== node.primaryFile)
                .slice(0, 4)
                .map((fp) => (
                  <button
                    key={fp}
                    type="button"
                    onClick={() => onPeekFile(fp)}
                    className="w-full text-left text-[11px] font-mono text-[var(--ink-secondary)] hover:text-[var(--cobalt-ice)] truncate block hover:underline cursor-pointer"
                  >
                    ↳ {fp}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
