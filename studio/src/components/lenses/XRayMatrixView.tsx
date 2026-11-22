'use client';

// =============================================================================
// GitUnderstand Studio — Decision-1 Calibrated X-Ray Matrix Lens
// Visual-first architectural health matrix with 9-pillar calibrated probes,
// Shannon entropy confidence scoring, and interactive radar topology.
// =============================================================================

import React, { useState, useMemo, useEffect, useId } from 'react';
import type {
  ArchitectureLayer,
  VisualAtlasBlueprint,
  XRayCellScore,
  XRayMatrixReport,
  XRayModuleAudit,
  XRayPillarId,
  AdaptiveModelTier,
} from '@shared/types';
import { postRunXRay } from '@/lib/api';
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  CheckCircle2,
  Compass,
  Cpu,
  Eye,
  FileCode2,
  Filter,
  Flame,
  GitFork,
  HeartPulse,
  Info,
  Key,
  Layers,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';

// =============================================================================
// Canonical 9-Pillar Constants & Metadata
// =============================================================================

export const XRAY_PILLAR_ORDER: XRayPillarId[] = [
  'modularity',
  'security',
  'resilience',
  'testability',
  'api_clarity',
  'concurrency',
  'scalability',
  'hygiene',
  'onboarding',
];

interface PillarMeta {
  id: XRayPillarId;
  label: string;
  short: string;
  description: string;
}

export const PILLAR_META_MAP: Record<XRayPillarId, PillarMeta> = {
  modularity: {
    id: 'modularity',
    label: 'Modularity & Coupling',
    short: 'Modularity',
    description: 'Degree of abstraction isolation, package boundaries, and cross-layer entanglement.',
  },
  security: {
    id: 'security',
    label: 'Security & Boundaries',
    short: 'Security',
    description: 'Input sanitization, secret management, boundary exposure, and permission guarantees.',
  },
  resilience: {
    id: 'resilience',
    label: 'Resilience & Errors',
    short: 'Resilience',
    description: 'Fault containment, retry budgets, circuit breakers, and deterministic failure semantics.',
  },
  testability: {
    id: 'testability',
    label: 'Testability & Inversion',
    short: 'Testability',
    description: 'Dependency inversion, mocking boundaries, deterministic harnesses, and pure functions.',
  },
  api_clarity: {
    id: 'api_clarity',
    label: 'API Surface & Clarity',
    short: 'API Clarity',
    description: 'Interface ergonomics, strict type schemas, payload transparency, and minimal side effects.',
  },
  concurrency: {
    id: 'concurrency',
    label: 'Concurrency & Race Safety',
    short: 'Concurrency',
    description: 'Lock contention, async context lifecycle, race-condition immunity, and re-entrancy hygiene.',
  },
  scalability: {
    id: 'scalability',
    label: 'Scalability & State Contention',
    short: 'Scalability',
    description: 'Memory leak hazards, algorithmic hot-paths, N+1 query patterns, and connection pooling.',
  },
  hygiene: {
    id: 'hygiene',
    label: 'Code Hygiene & Dead Logic',
    short: 'Hygiene',
    description: 'Zombie code paths, cyclomatic complexity spikes, circular dependencies, and technical debt.',
  },
  onboarding: {
    id: 'onboarding',
    label: 'Cognitive Load & Onboarding',
    short: 'Onboarding',
    description: 'Mental model clarity, convention adherence, discoverability, and architecture readability.',
  },
};

const TIER_CONFIG: Record<
  AdaptiveModelTier,
  { name: string; tag: string; border: string; bg: string; text: string; rationaleDefault: string }
> = {
  'gemini-4-argon': {
    name: 'Gemini 4 Argon',
    tag: 'Argon Tier (Deep Reasoner)',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    rationaleDefault: 'High entropy variance and architectural entanglement require deep tree-of-thought verification.',
  },
  'gemini-4-carbon': {
    name: 'Gemini 4 Carbon',
    tag: 'Carbon Tier (Standard Matrix)',
    border: 'border-sky-500/40',
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    rationaleDefault: 'Well-formed modularity with focused entropy pockets; optimal for architectural synthesis.',
  },
  'gemini-4-neon': {
    name: 'Gemini 4 Neon',
    tag: 'Neon Tier (Fast Flash)',
    border: 'border-indigo-500/40',
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    rationaleDefault: 'Linear call chains with minimal structural ambiguity; suitable for fast matrix sweeps.',
  },
  'gemini-4-hydrogen': {
    name: 'Gemini 4 Hydrogen',
    tag: 'Hydrogen Tier (Edge Light)',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    rationaleDefault: 'Lightweight repository graph with high consensus across all 9 architectural pillars.',
  },
};

// =============================================================================
// Props Contract
// =============================================================================

export interface XRayMatrixViewProps {
  blueprint: VisualAtlasBlueprint;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onXRayUpdated?: (xray: XRayMatrixReport) => void;
}

// =============================================================================
// Helper Color Resolvers
// =============================================================================

function getHealthColor(score: number): {
  text: string;
  bg: string;
  border: string;
  glow: string;
} {
  if (score >= 80) {
    return {
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/15',
      border: 'border-emerald-500/30',
      glow: 'shadow-[0_0_12px_rgba(52,211,153,0.35)]',
    };
  }
  if (score >= 65) {
    return {
      text: 'text-sky-300',
      bg: 'bg-sky-500/15',
      border: 'border-sky-500/30',
      glow: 'shadow-[0_0_12px_rgba(56,189,248,0.25)]',
    };
  }
  if (score >= 45) {
    return {
      text: 'text-amber-400',
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/30',
      glow: 'shadow-[0_0_12px_rgba(251,191,36,0.3)]',
    };
  }
  return {
    text: 'text-rose-400',
    bg: 'bg-rose-500/15',
    border: 'border-rose-500/30',
    glow: 'shadow-[0_0_12px_rgba(244,63,94,0.35)]',
  };
}

function getProbabilityColor(prob: number): {
  bg: string;
  text: string;
  border: string;
  indicator: string;
} {
  if (prob >= 0.85) {
    return {
      bg: 'bg-emerald-500/15 hover:bg-emerald-500/25',
      text: 'text-emerald-300',
      border: 'border-emerald-500/30',
      indicator: 'bg-emerald-400',
    };
  }
  if (prob >= 0.70) {
    return {
      bg: 'bg-sky-500/15 hover:bg-sky-500/25',
      text: 'text-sky-200',
      border: 'border-sky-500/30',
      indicator: 'bg-sky-400',
    };
  }
  if (prob >= 0.50) {
    return {
      bg: 'bg-amber-500/15 hover:bg-amber-500/25',
      text: 'text-amber-200',
      border: 'border-amber-500/30',
      indicator: 'bg-amber-400',
    };
  }
  return {
    bg: 'bg-rose-500/20 hover:bg-rose-500/30',
    text: 'text-rose-300',
    border: 'border-rose-500/40',
    indicator: 'bg-rose-500',
  };
}

function getEntropyBadge(entropy: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (entropy <= 0.3) {
    return { label: 'High Consensus', color: 'text-emerald-300', bg: 'bg-emerald-500/15' };
  }
  if (entropy <= 0.6) {
    return { label: 'Calibrated', color: 'text-sky-300', bg: 'bg-sky-500/15' };
  }
  return { label: 'Ambiguous', color: 'text-amber-300', bg: 'bg-amber-500/15' };
}

// =============================================================================
// Interactive 9-Pillar SVG Radar Component
// =============================================================================

interface RadarChartProps {
  pillarAverages: Record<XRayPillarId, number>;
  selectedModule?: XRayModuleAudit | null;
  hoveredPillar: XRayPillarId | null;
  onHoverPillar: (pillar: XRayPillarId | null) => void;
}

function NinePillarRadarChart({
  pillarAverages,
  selectedModule,
  hoveredPillar,
  onHoverPillar,
}: RadarChartProps) {
  const gradientId = useId();
  const selectedGradId = useId();

  const size = 360;
  const center = size / 2;
  const radius = 135;
  const totalAxes = XRAY_PILLAR_ORDER.length;

  const getCoordinates = (index: number, normalizedValue: number) => {
    // Top axis starts at -90deg (-PI/2)
    const angle = (Math.PI * 2 * index) / totalAxes - Math.PI / 2;
    const r = normalizedValue * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Build grid polygon rings at 20%, 40%, 60%, 80%, 100%
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];
  const gridPolygons = gridLevels.map((lvl) => {
    const points = XRAY_PILLAR_ORDER.map((_, i) => {
      const { x, y } = getCoordinates(i, lvl);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return { level: lvl, points };
  });

  // Calculate polygon points for System Global Average
  const globalPoints = XRAY_PILLAR_ORDER.map((pillar, i) => {
    const val = (pillarAverages[pillar] ?? 70) / 100;
    const { x, y } = getCoordinates(i, Math.max(0.08, Math.min(1.0, val)));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Calculate polygon points for Selected Module (if any)
  const modulePoints = selectedModule
    ? XRAY_PILLAR_ORDER.map((pillar, i) => {
        const cell = selectedModule.cells[pillar];
        const val = cell ? cell.probabilityHealthy : 0.5;
        const { x, y } = getCoordinates(i, Math.max(0.08, Math.min(1.0, val)));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ')
    : null;

  return (
    <div className="relative flex flex-col items-center justify-center p-2">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[360px] h-auto overflow-visible select-none drop-shadow-xl"
      >
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1A73E8" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0B57D0" stopOpacity="0.10" />
          </radialGradient>
          <radialGradient id={selectedGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#D97706" stopOpacity="0.08" />
          </radialGradient>
        </defs>

        {/* Concentric grid rings */}
        {gridPolygons.map((grid) => (
          <polygon
            key={grid.level}
            points={grid.points}
            fill={grid.level === 1.0 ? 'rgba(14, 18, 24, 0.65)' : 'none'}
            stroke={grid.level === 1.0 ? 'rgba(138, 180, 248, 0.28)' : 'rgba(255, 255, 255, 0.07)'}
            strokeWidth={grid.level === 1.0 ? 1.5 : 1}
            strokeDasharray={grid.level === 1.0 ? undefined : '3 3'}
          />
        ))}

        {/* Axis rays */}
        {XRAY_PILLAR_ORDER.map((pillar, i) => {
          const outer = getCoordinates(i, 1.0);
          const isHovered = hoveredPillar === pillar;
          return (
            <line
              key={pillar}
              x1={center}
              y1={center}
              x2={outer.x}
              y2={outer.y}
              stroke={isHovered ? 'var(--cobalt-ice)' : 'rgba(255, 255, 255, 0.12)'}
              strokeWidth={isHovered ? 2 : 1}
              className="transition-colors duration-200"
            />
          );
        })}

        {/* Radar Fill & Outline: Global Average */}
        <polygon
          points={globalPoints}
          fill={`url(#${gradientId})`}
          stroke="#4285F4"
          strokeWidth="2.2"
          className="transition-all duration-300"
        />

        {/* Radar Fill & Outline: Selected Module (Overlay) */}
        {modulePoints && (
          <polygon
            points={modulePoints}
            fill={`url(#${selectedGradId})`}
            stroke="#FBBF24"
            strokeWidth="2.4"
            strokeDasharray="4 2"
            className="transition-all duration-300 animate-in fade-in"
          />
        )}

        {/* Axis Vertices & Hover Handles */}
        {XRAY_PILLAR_ORDER.map((pillar, i) => {
          const globalVal = (pillarAverages[pillar] ?? 70) / 100;
          const { x: gx, y: gy } = getCoordinates(i, globalVal);
          const labelCoord = getCoordinates(i, 1.18);
          const isHovered = hoveredPillar === pillar;
          const meta = PILLAR_META_MAP[pillar];

          return (
            <g
              key={pillar}
              className="cursor-pointer"
              onMouseEnter={() => onHoverPillar(pillar)}
              onMouseLeave={() => onHoverPillar(null)}
            >
              {/* Vertex circle for Global */}
              <circle
                cx={gx}
                cy={gy}
                r={isHovered ? 5.5 : 3.5}
                fill="#8AB4F8"
                stroke="#080A0E"
                strokeWidth="1.5"
                className="transition-all duration-200"
              />

              {/* Vertex circle for Module if present */}
              {selectedModule && (
                (() => {
                  const cell = selectedModule.cells[pillar];
                  const mVal = cell ? cell.probabilityHealthy : 0.5;
                  const { x: mx, y: my } = getCoordinates(i, mVal);
                  return (
                    <circle
                      cx={mx}
                      cy={my}
                      r={isHovered ? 6 : 4}
                      fill="#FBBF24"
                      stroke="#080A0E"
                      strokeWidth="1.5"
                      className="transition-all duration-200"
                    />
                  );
                })()
              )}

              {/* Pillar Label Text around perimeter */}
              <text
                x={labelCoord.x}
                y={labelCoord.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={isHovered ? '10.5' : '9.5'}
                fontWeight={isHovered ? '700' : '500'}
                fill={isHovered ? '#8AB4F8' : 'rgba(241, 243, 244, 0.85)'}
                className="transition-colors duration-150 font-sans pointer-events-auto"
              >
                {meta.short}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend below Radar */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-3 text-xs text-[var(--ink-secondary)]">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-sky-400 rounded-full" />
          <span>System Baseline Mean</span>
        </div>
        {selectedModule ? (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-400 rounded-full border-t border-dashed" />
            <span className="text-amber-300 font-medium truncate max-w-[150px]">
              {selectedModule.label}
            </span>
          </div>
        ) : (
          <span className="text-[var(--ink-muted)] text-[11px] italic">
            Click any row to overlay module
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Lens Component: XRayMatrixView
// =============================================================================

export function XRayMatrixView({
  blueprint,
  selectedNodeId,
  onSelectNode,
  onXRayUpdated,
}: XRayMatrixViewProps) {
  const [report, setReport] = useState<XRayMatrixReport | null>(
    blueprint.xray || null
  );
  const [isReRunning, setIsReRunning] = useState<boolean>(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  // Interaction State
  const [hoveredPillar, setHoveredPillar] = useState<XRayPillarId | null>(null);
  const [activeCellDetail, setActiveCellDetail] = useState<{
    module: XRayModuleAudit;
    pillar: XRayPillarId;
    cell: XRayCellScore;
  } | null>(null);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [layerFilter, setLayerFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'health' | 'blastRadius' | 'entropy' | 'name'>('health');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Synchronize when blueprint prop updates
  useEffect(() => {
    if (blueprint.xray) {
      setReport(blueprint.xray);
    }
  }, [blueprint.xray]);

  // Handle re-running Decision-1 X-Ray
  const handleRunXRay = async () => {
    setIsReRunning(true);
    setRerunError(null);
    try {
      const freshReport = await postRunXRay(blueprint.repoId);
      setReport(freshReport);
      onXRayUpdated?.(freshReport);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to run Decision-1 X-Ray probe suite.';
      setRerunError(msg);
    } finally {
      setIsReRunning(false);
    }
  };

  // Find currently selected module in matrix
  const selectedModule = useMemo(() => {
    if (!report || !selectedNodeId) return null;
    return report.modules.find((m) => m.nodeId === selectedNodeId) || null;
  }, [report, selectedNodeId]);

  // Unique layers present in matrix
  const availableLayers = useMemo(() => {
    if (!report) return [];
    const layers = new Set<ArchitectureLayer>();
    report.modules.forEach((m) => layers.add(m.layer));
    return Array.from(layers);
  }, [report]);

  // Filtered and sorted modules
  const filteredModules = useMemo(() => {
    if (!report) return [];
    let list = [...report.modules];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.primaryFile.toLowerCase().includes(q) ||
          m.topFinding.toLowerCase().includes(q)
      );
    }

    if (layerFilter !== 'all') {
      list = list.filter((m) => m.layer === layerFilter);
    }

    list.sort((a, b) => {
      let diff = 0;
      if (sortField === 'health') {
        diff = a.overallHealth - b.overallHealth;
      } else if (sortField === 'blastRadius') {
        diff = a.blastRadius - b.blastRadius;
      } else if (sortField === 'name') {
        diff = a.label.localeCompare(b.label);
      } else if (sortField === 'entropy') {
        // Compute average cell entropy
        const avgEntropyA =
          Object.values(a.cells).reduce((acc, c) => acc + c.entropy, 0) /
          Math.max(1, Object.keys(a.cells).length);
        const avgEntropyB =
          Object.values(b.cells).reduce((acc, c) => acc + c.entropy, 0) /
          Math.max(1, Object.keys(b.cells).length);
        diff = avgEntropyA - avgEntropyB;
      }
      return sortOrder === 'asc' ? diff : -diff;
    });

    return list;
  }, [report, searchQuery, layerFilter, sortField, sortOrder]);

  // Fallback initial state when no X-Ray report exists yet
  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[540px] p-8 text-center bg-[var(--bg-card)] rounded-2xl border border-[var(--border-card)]">
        <div className="w-16 h-16 rounded-2xl bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] flex items-center justify-center mb-6 shadow-[var(--cobalt-glow)]">
          <Activity className="w-8 h-8 text-[var(--cobalt-bright)]" />
        </div>
        <h3 className="text-xl font-semibold text-[var(--ink-primary)] mb-2 tracking-tight">
          Calibrated Decision-1 Architectural X-Ray
        </h3>
        <p className="max-w-md text-sm text-[var(--ink-secondary)] mb-6 leading-relaxed">
          Probe all 9 structural dimensions with calibrated probability scoring, dual-key sharded
          inference, and Shannon entropy uncertainty estimation.
        </p>

        {rerunError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs max-w-lg text-left flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Audit Generation Error</p>
              <p>{rerunError}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleRunXRay}
          disabled={isReRunning}
          className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white font-medium text-sm transition-all duration-200 shadow-[var(--cobalt-glow)] disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isReRunning ? 'animate-spin' : ''}`} />
          <span>{isReRunning ? 'Synthesizing Calibrated Matrix...' : 'Launch Decision-1 X-Ray Audit'}</span>
        </button>
      </div>
    );
  }

  const overallHealth = report.overallScore;
  const healthStyle = getHealthColor(overallHealth);
  const tierInfo = TIER_CONFIG[report.recommendedModelTier] || TIER_CONFIG['gemini-4-carbon'];
  const meanEntropyBadge = getEntropyBadge(report.meanEntropy);

  return (
    <div className="flex flex-col gap-6 w-full text-[var(--ink-primary)] font-sans">
      {/* =====================================================================
          Header & Metrics Command Center
          ===================================================================== */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-card)] shadow-lg">
        {/* Left: Overall Health & Diagnostics */}
        <div className="flex flex-wrap items-center gap-5">
          {/* Prominent Circular Overall Score */}
          <div
            className={`flex flex-col items-center justify-center w-20 h-20 rounded-2xl border ${healthStyle.border} ${healthStyle.bg} ${healthStyle.glow} transition-all`}
          >
            <span className={`text-2xl font-bold font-mono tracking-tight ${healthStyle.text}`}>
              {Math.round(overallHealth)}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-[var(--ink-secondary)] font-semibold mt-0.5">
              Health
            </span>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold tracking-tight text-[var(--ink-primary)]">
                Calibrated X-Ray Matrix
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] text-[var(--cobalt-ice)] font-mono">
                {report.model}
              </span>
            </div>
            <p className="text-xs text-[var(--ink-secondary)] max-w-xl line-clamp-1">
              9-Pillar multidimensional confidence scoring calibrated against Bayesian invariants.
            </p>

            {/* Badges Bar */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* Dual-Key Sharded Badge */}
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                  report.dualKeySharded
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
                title="Dual-Key Sharding splits evaluation across orthogonal prompt schemas to neutralize confirmation bias"
              >
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>Dual-Key Sharded</span>
              </div>

              {/* Probe Count */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)] text-[var(--ink-secondary)]">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span>{report.totalProbes} Total Probes</span>
              </div>

              {/* Mean Shannon Entropy */}
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--border-subtle)] ${meanEntropyBadge.bg}`}
                title="Shannon Entropy H(P) = -sum(P log2 P). Low entropy signals high calibration confidence."
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                <span>
                  Mean H: <strong className="font-mono">{report.meanEntropy.toFixed(2)}</strong>
                </span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${meanEntropyBadge.color}`}>
                  {meanEntropyBadge.label}
                </span>
              </div>

              {/* Latency */}
              {report.latencyMs > 0 && (
                <div className="text-[11px] text-[var(--ink-muted)] font-mono flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  <span>{report.latencyMs}ms</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Adaptive Router Pill & Re-run Action */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {/* Adaptive Model Router Pill */}
          <div
            className={`flex flex-col px-3.5 py-2 rounded-xl border ${tierInfo.border} ${tierInfo.bg}`}
            title={report.routingRationale || tierInfo.rationaleDefault}
          >
            <div className="flex items-center gap-1.5">
              <Zap className={`w-3.5 h-3.5 ${tierInfo.text}`} />
              <span className={`text-xs font-bold ${tierInfo.text}`}>{tierInfo.tag}</span>
            </div>
            <span className="text-[11px] text-[var(--ink-secondary)] line-clamp-1 max-w-[220px]">
              {report.routingRationale || 'Optimized inference tier'}
            </span>
          </div>

          {/* Re-run Button */}
          <button
            onClick={handleRunXRay}
            disabled={isReRunning}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white text-xs font-medium shadow-[var(--cobalt-glow)] transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReRunning ? 'animate-spin' : ''}`} />
            <span>{isReRunning ? 'Auditing...' : 'Re-run Decision-1 X-Ray'}</span>
          </button>
        </div>
      </div>

      {/* Error banner if rerun fails */}
      {rerunError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{rerunError}</span>
          </div>
          <button
            onClick={() => setRerunError(null)}
            className="text-rose-400 hover:text-white text-xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          Visual Stage: 9-Pillar Radar Chart + Invariant Findings
          ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Radar Chart (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-card)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[var(--cobalt-ice)]" />
              <h3 className="text-sm font-semibold tracking-tight text-[var(--ink-primary)]">
                9-Pillar Architectural Balance
              </h3>
            </div>
            <span className="text-[11px] text-[var(--ink-muted)]">Radar Topography</span>
          </div>

          <NinePillarRadarChart
            pillarAverages={report.pillarAverages}
            selectedModule={selectedModule}
            hoveredPillar={hoveredPillar}
            onHoverPillar={setHoveredPillar}
          />

          {/* Active Hovered Pillar Tooltip Details */}
          <div className="mt-4 p-3 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)] min-h-[64px] flex items-center">
            {hoveredPillar ? (
              <div className="flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--cobalt-ice)]">
                    {PILLAR_META_MAP[hoveredPillar].label}
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    System Avg: {Math.round(report.pillarAverages[hoveredPillar] ?? 0)}%
                  </span>
                </div>
                <p className="text-[11px] text-[var(--ink-secondary)] mt-1">
                  {PILLAR_META_MAP[hoveredPillar].description}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                <Info className="w-4 h-4 flex-shrink-0 text-sky-400" />
                <span>Hover over any radar vertex to inspect pillar evaluation semantics.</span>
              </div>
            )}
          </div>
        </div>

        {/* Pillar Averages Summary Bars & Selected Module Card (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-card)]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--cobalt-ice)]" />
                <h3 className="text-sm font-semibold tracking-tight text-[var(--ink-primary)]">
                  Pillar Averages & Calibrated Health
                </h3>
              </div>
              <span className="text-[11px] text-[var(--ink-muted)] font-mono">
                {report.modules.length} modules surveyed
              </span>
            </div>

            {/* Micro Progress Bars for the 9 Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              {XRAY_PILLAR_ORDER.map((pillar) => {
                const score = report.pillarAverages[pillar] ?? 70;
                const pColor = getHealthColor(score);
                const meta = PILLAR_META_MAP[pillar];
                const isHovered = hoveredPillar === pillar;

                return (
                  <div
                    key={pillar}
                    onMouseEnter={() => setHoveredPillar(pillar)}
                    onMouseLeave={() => setHoveredPillar(null)}
                    className={`flex flex-col p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isHovered
                        ? 'border-[var(--cobalt-ice)] bg-[var(--cobalt-tint)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] hover:border-[var(--cobalt-border)]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium truncate text-[var(--ink-primary)]">
                        {meta.short}
                      </span>
                      <span className={`font-mono font-bold text-[11px] ${pColor.text}`}>
                        {Math.round(score)}%
                      </span>
                    </div>
                    {/* Bar */}
                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          score >= 80 ? 'bg-emerald-400' : score >= 65 ? 'bg-sky-400' : score >= 45 ? 'bg-amber-400' : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.max(5, score)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Inspection Callout for Selected Module */}
          {selectedModule ? (
            <div className="p-4 rounded-xl bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] transition-all animate-in fade-in">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{selectedModule.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-card)] text-[var(--ink-secondary)] uppercase">
                      {selectedModule.layer}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--ink-secondary)] font-mono mt-0.5">
                    {selectedModule.primaryFile}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-xs font-bold text-amber-300">
                      Blast Radius {(selectedModule.blastRadius * 100).toFixed(0)}%
                    </span>
                    <p className="text-[10px] text-[var(--ink-muted)]">Graph Centrality</p>
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-card)] text-xs text-[var(--ink-primary)]">
                <span className="text-[10px] uppercase font-bold text-amber-400 block mb-0.5">
                  Critical Decision-1 Finding:
                </span>
                <p className="text-[12px] leading-relaxed text-[var(--ink-primary)]">
                  {selectedModule.topFinding || 'No severe architectural deviations detected.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--ink-secondary)]">
              <div className="flex items-center gap-2.5">
                <Eye className="w-4 h-4 text-[var(--cobalt-ice)]" />
                <span>Select any module from the matrix below to inspect its calibrated 9-pillar probes.</span>
              </div>
              <span className="text-[10px] text-[var(--ink-muted)]">Click-to-Inspect</span>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          Interactive Probability Heatmap Table
          Module × 9-Pillar Calibrated Scores & Blast Radius
          ===================================================================== */}
      <div className="flex flex-col rounded-2xl bg-[var(--bg-card)] border border-[var(--border-card)] shadow-xl overflow-hidden">
        {/* Table Controls & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--border-card)] bg-[var(--bg-card-elevated)]">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-3 text-[var(--ink-muted)]" />
              <input
                type="text"
                placeholder="Filter module, file, finding..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--cobalt-ice)] w-56"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 text-[var(--ink-muted)] hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Layer Filter */}
            <div className="flex items-center gap-1 text-xs">
              <Filter className="w-3 h-3 text-[var(--ink-muted)]" />
              <select
                value={layerFilter}
                onChange={(e) => setLayerFilter(e.target.value)}
                aria-label="Filter modules by architectural layer"
                className="px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--ink-secondary)] focus:outline-none focus:border-[var(--cobalt-ice)]"
              >
                <option value="all">All Layers ({report.modules.length})</option>
                {availableLayers.map((layer) => (
                  <option key={layer} value={layer}>
                    {layer.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-2 text-xs text-[var(--ink-secondary)]">
            <ArrowUpDown className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
            <span className="text-[11px]">Sort:</span>
            <button
              onClick={() => {
                if (sortField === 'health') {
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortField('health');
                  setSortOrder('asc');
                }
              }}
              className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                sortField === 'health'
                  ? 'border-[var(--cobalt-ice)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:text-white'
              }`}
            >
              Health {sortField === 'health' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => {
                if (sortField === 'blastRadius') {
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortField('blastRadius');
                  setSortOrder('desc');
                }
              }}
              className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                sortField === 'blastRadius'
                  ? 'border-[var(--cobalt-ice)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:text-white'
              }`}
            >
              Blast Radius {sortField === 'blastRadius' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => {
                if (sortField === 'entropy') {
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortField('entropy');
                  setSortOrder('desc');
                }
              }}
              className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                sortField === 'entropy'
                  ? 'border-[var(--cobalt-ice)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:text-white'
              }`}
            >
              Entropy H {sortField === 'entropy' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
          </div>
        </div>

        {/* Scrollable Matrix Table */}
        <div className="overflow-x-auto max-h-[640px] relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-[var(--bg-card-elevated)] border-b border-[var(--border-card)] select-none">
              <tr>
                {/* Module Column */}
                <th className="p-3 font-semibold text-[var(--ink-primary)] min-w-[200px] sticky left-0 z-30 bg-[var(--bg-card-elevated)] shadow-[2px_0_8px_rgba(0,0,0,0.5)]">
                  Module / Primary File
                </th>
                {/* Overall Health */}
                <th className="p-3 font-semibold text-[var(--ink-primary)] text-center min-w-[70px]">
                  Health
                </th>
                {/* Blast Radius */}
                <th className="p-3 font-semibold text-[var(--ink-primary)] min-w-[120px]">
                  Blast Radius
                </th>
                {/* 9 Pillars */}
                {XRAY_PILLAR_ORDER.map((pillar) => {
                  const meta = PILLAR_META_MAP[pillar];
                  const isHovered = hoveredPillar === pillar;
                  return (
                    <th
                      key={pillar}
                      onMouseEnter={() => setHoveredPillar(pillar)}
                      onMouseLeave={() => setHoveredPillar(null)}
                      className={`p-2.5 font-semibold text-center min-w-[85px] cursor-pointer transition-colors ${
                        isHovered
                          ? 'text-[var(--cobalt-ice)] bg-[var(--cobalt-tint)]'
                          : 'text-[var(--ink-secondary)] hover:text-white'
                      }`}
                      title={`${meta.label}: ${meta.description}`}
                    >
                      <span className="block truncate">{meta.short}</span>
                      <span className="text-[10px] text-[var(--ink-muted)] block font-normal">
                        {Math.round(report.pillarAverages[pillar] ?? 0)}%
                      </span>
                    </th>
                  );
                })}
                {/* Top Finding */}
                <th className="p-3 font-semibold text-[var(--ink-primary)] min-w-[240px]">
                  Top Decision-1 Finding
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[11px]">
              {filteredModules.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="p-8 text-center text-[var(--ink-muted)] font-sans italic"
                  >
                    No modules match the current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredModules.map((mod) => {
                  const isSelected = selectedNodeId === mod.nodeId;
                  const modHealth = getHealthColor(mod.overallHealth);
                  const blastPct = Math.min(100, Math.round(mod.blastRadius * 100));

                  return (
                    <tr
                      key={mod.nodeId}
                      onClick={() => onSelectNode(mod.nodeId)}
                      className={`group transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--cobalt-tint-strong)]'
                          : 'hover:bg-[var(--bg-card-elevated)]'
                      }`}
                    >
                      {/* Sticky Module Name & Layer */}
                      <td
                        className={`p-3 sticky left-0 z-10 transition-colors font-sans shadow-[2px_0_8px_rgba(0,0,0,0.5)] ${
                          isSelected
                            ? 'bg-[var(--bg-card-elevated)]'
                            : 'bg-[var(--bg-card)] group-hover:bg-[var(--bg-card-elevated)]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              isSelected ? 'bg-amber-400' : 'bg-[var(--cobalt-bright)]'
                            }`}
                          />
                          <span className="font-semibold text-[var(--ink-primary)] text-xs truncate max-w-[150px]">
                            {mod.label}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-[var(--ink-muted)] uppercase font-mono">
                            {mod.layer}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--ink-muted)] truncate max-w-[200px] mt-0.5 font-mono">
                          {mod.primaryFile}
                        </p>
                      </td>

                      {/* Health Score */}
                      <td className="p-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md font-bold text-xs ${modHealth.bg} ${modHealth.text} border ${modHealth.border}`}
                        >
                          {Math.round(mod.overallHealth)}
                        </span>
                      </td>

                      {/* Blast Radius Bar */}
                      <td className="p-3 font-sans">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                blastPct >= 70
                                  ? 'bg-rose-500'
                                  : blastPct >= 40
                                  ? 'bg-amber-400'
                                  : 'bg-sky-400'
                              }`}
                              style={{ width: `${Math.max(4, blastPct)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-[var(--ink-muted)] w-8 text-right">
                            {blastPct}%
                          </span>
                        </div>
                      </td>

                      {/* 9 Pillar Probability Cells */}
                      {XRAY_PILLAR_ORDER.map((pillar) => {
                        const cell = mod.cells[pillar];
                        const prob = cell ? cell.probabilityHealthy : 0.5;
                        const pStyle = getProbabilityColor(prob);
                        const isHovered = hoveredPillar === pillar;

                        return (
                          <td
                            key={pillar}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectNode(mod.nodeId);
                              if (cell) {
                                setActiveCellDetail({
                                  module: mod,
                                  pillar,
                                  cell,
                                });
                              }
                            }}
                            className={`p-2 text-center transition-all ${
                              isHovered ? 'bg-[var(--cobalt-tint)]' : ''
                            }`}
                          >
                            <div
                              className={`inline-flex flex-col items-center justify-center w-full py-1.5 px-1 rounded-lg border ${pStyle.border} ${pStyle.bg} transition-transform hover:scale-105`}
                              title={`P(healthy): ${(prob * 100).toFixed(1)}% | H: ${
                                cell ? cell.entropy.toFixed(2) : '0'
                              } | Conf: ${cell ? (cell.confidence * 100).toFixed(0) : '0'}%`}
                            >
                              <span className={`font-bold text-[11px] ${pStyle.text}`}>
                                {(prob * 100).toFixed(0)}%
                              </span>
                              {cell && (
                                <span className="text-[9px] text-[var(--ink-muted)] flex items-center gap-0.5">
                                  <span
                                    className={`w-1 h-1 rounded-full ${pStyle.indicator}`}
                                  />
                                  H:{cell.entropy.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Top Finding */}
                      <td className="p-3 font-sans text-xs text-[var(--ink-secondary)] max-w-xs">
                        <p className="line-clamp-2 leading-relaxed">
                          {mod.topFinding || 'Healthy structural invariants confirmed.'}
                        </p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          Cell Detail Modal / Inspector Drawer
          ===================================================================== */}
      {activeCellDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="flex flex-col w-full max-w-lg rounded-2xl bg-[var(--bg-card)] border border-[var(--border-card)] shadow-2xl p-6 text-[var(--ink-primary)] relative">
            <button
              onClick={() => setActiveCellDetail(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] flex items-center justify-center">
                <Shield className="w-5 h-5 text-[var(--cobalt-bright)]" />
              </div>
              <div>
                <h4 className="text-base font-bold text-[var(--ink-primary)]">
                  {PILLAR_META_MAP[activeCellDetail.pillar].label}
                </h4>
                <p className="text-xs text-[var(--ink-secondary)]">
                  {activeCellDetail.module.label} • {activeCellDetail.module.primaryFile}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
              <div className="p-3 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--ink-muted)] uppercase block">
                  P(Healthy)
                </span>
                <span className="text-lg font-bold font-mono text-emerald-400">
                  {(activeCellDetail.cell.probabilityHealthy * 100).toFixed(1)}%
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--ink-muted)] uppercase block">
                  Confidence
                </span>
                <span className="text-lg font-bold font-mono text-sky-400">
                  {(activeCellDetail.cell.confidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--ink-muted)] uppercase block">
                  Entropy (H)
                </span>
                <span className="text-lg font-bold font-mono text-amber-300">
                  {activeCellDetail.cell.entropy.toFixed(3)}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)] mb-5">
              <span className="text-[10px] uppercase font-bold text-[var(--cobalt-ice)] block mb-1">
                Calibrated Probe Summary
              </span>
              <p className="text-xs leading-relaxed text-[var(--ink-secondary)]">
                {activeCellDetail.cell.flagSummary ||
                  'No structural flags raised. Code complies with calibrated invariant verification.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setActiveCellDetail(null)}
                className="px-4 py-2 rounded-xl bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white text-xs font-medium cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default XRayMatrixView;
