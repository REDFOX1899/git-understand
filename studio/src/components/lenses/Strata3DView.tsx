'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type {
  VisualAtlasBlueprint,
  StratumLayer,
  AtlasNode,
  AtlasEdge,
  SubsystemCluster,
  XRayModuleAudit,
  ArchitectureLayer,
  ExecutionFlow,
} from '@shared/types';
import {
  Layers,
  Rotate3d,
  RotateCcw,
  Sliders,
  ShieldCheck,
  Activity,
  Zap,
  ArrowUpRight,
  GitFork,
  X,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Info,
  ChevronDown,
} from 'lucide-react';

export interface Strata3DViewProps {
  blueprint: VisualAtlasBlueprint;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

type ColorMode = 'subsystem' | 'xray';

const DEFAULT_TILT_X = 55;
const DEFAULT_ROTATE_Z = -35;
const DEFAULT_EXPLODE = 100;
const DEFAULT_ZOOM = 1.0;

const LAYER_ACCENT_FALLBACKS: Record<ArchitectureLayer, string> = {
  client: 'var(--cobalt-ice)',
  edge: 'var(--cyan-layer)',
  orchestration: 'var(--cobalt-bright)',
  domain: 'var(--indigo-layer)',
  infrastructure: 'var(--teal-layer)',
  data: 'var(--emerald)',
  tooling: 'var(--ink-secondary)',
};

function getHealthMetadata(score: number) {
  if (score >= 80) {
    return {
      label: 'Healthy',
      color: 'var(--emerald)',
      textColor: 'text-[var(--emerald)]',
      bgColor: 'bg-[var(--emerald-bg)]',
      borderColor: 'border-[var(--emerald-border)]',
      badgeClass: 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30',
      icon: CheckCircle2,
    };
  }
  if (score >= 50) {
    return {
      label: 'Caution',
      color: 'var(--amber)',
      textColor: 'text-[var(--amber)]',
      bgColor: 'bg-[var(--amber-bg)]',
      borderColor: 'border-[var(--amber-border)]',
      badgeClass: 'bg-amber-950/60 text-amber-400 border-amber-500/30',
      icon: AlertTriangle,
    };
  }
  return {
    label: 'Critical',
    color: 'var(--vermilion)',
    textColor: 'text-[var(--vermilion)]',
    bgColor: 'bg-[var(--vermilion-bg)]',
    borderColor: 'border-[var(--vermilion-border)]',
    badgeClass: 'bg-rose-950/60 text-rose-400 border-rose-500/30',
    icon: Flame,
  };
}

export function Strata3DView({ blueprint, selectedNodeId, onSelectNode }: Strata3DViewProps) {
  // Spatial Camera State
  const [tiltX, setTiltX] = useState<number>(DEFAULT_TILT_X);
  const [rotateZ, setRotateZ] = useState<number>(DEFAULT_ROTATE_Z);
  const [explodeSpacing, setExplodeSpacing] = useState<number>(DEFAULT_EXPLODE);
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);

  // Filter & Display State
  const [colorMode, setColorMode] = useState<ColorMode>('subsystem');
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [isolatedLayer, setIsolatedLayer] = useState<ArchitectureLayer | null>(null);
  const [showControls, setShowControls] = useState<boolean>(true);

  // Motion preference detection
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Quick lookup indexes
  const nodeById = useMemo(() => {
    const map = new Map<string, AtlasNode>();
    for (const node of blueprint.nodes || []) {
      map.set(node.id, node);
    }
    return map;
  }, [blueprint.nodes]);

  const subsystemById = useMemo(() => {
    const map = new Map<string, SubsystemCluster>();
    for (const sub of blueprint.subsystems || []) {
      map.set(sub.id, sub);
    }
    return map;
  }, [blueprint.subsystems]);

  const xrayByNodeId = useMemo(() => {
    const map = new Map<string, XRayModuleAudit>();
    if (blueprint.xray?.modules) {
      for (const mod of blueprint.xray.modules) {
        map.set(mod.nodeId, mod);
      }
    }
    return map;
  }, [blueprint.xray]);

  // Group nodes by architecture stratum
  const stratumNodesMap = useMemo(() => {
    const map = new Map<ArchitectureLayer, AtlasNode[]>();
    for (const stratum of blueprint.strata || []) {
      map.set(stratum.layer, []);
    }
    for (const node of blueprint.nodes || []) {
      const list = map.get(node.layer);
      if (list) {
        list.push(node);
      } else {
        map.set(node.layer, [node]);
      }
    }
    return map;
  }, [blueprint.strata, blueprint.nodes]);

  // Populated strata layers sorted by elevation (0 base to highest at top)
  const populatedStrata = useMemo(() => {
    const list: StratumLayer[] = [];
    const sourceStrata = blueprint.strata && blueprint.strata.length > 0 ? blueprint.strata : [];

    for (const s of sourceStrata) {
      const nodes = stratumNodesMap.get(s.layer) || [];
      if (nodes.length > 0 || (s.nodeIds && s.nodeIds.length > 0) || (s.fileCount && s.fileCount > 0)) {
        list.push(s);
      }
    }

    // Sort ascending: layer elevation 0 at bottom, top elevation stacked above
    list.sort((a, b) => a.elevation - b.elevation);

    // If isolatedLayer is set, filter to only that layer
    if (isolatedLayer) {
      return list.filter((s) => s.layer === isolatedLayer);
    }
    return list;
  }, [blueprint.strata, stratumNodesMap, isolatedLayer]);

  // Selected node entity
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodeById.get(selectedNodeId) || null;
  }, [selectedNodeId, nodeById]);

  // Cross-layer dependency edges
  const crossLayerEdges = useMemo(() => {
    const list: Array<{
      edge: AtlasEdge;
      sourceNode: AtlasNode;
      targetNode: AtlasNode;
      isCrossLayer: boolean;
    }> = [];

    for (const edge of blueprint.edges || []) {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      if (sourceNode && targetNode) {
        list.push({
          edge,
          sourceNode,
          targetNode,
          isCrossLayer: sourceNode.layer !== targetNode.layer,
        });
      }
    }
    return list;
  }, [blueprint.edges, nodeById]);

  // Active Execution Flow steps & nodes
  const activeFlow = useMemo<ExecutionFlow | null>(() => {
    if (!selectedFlowId) return null;
    return blueprint.flows?.find((f) => f.id === selectedFlowId) || null;
  }, [blueprint.flows, selectedFlowId]);

  const flowNodeIds = useMemo(() => {
    if (!activeFlow) return new Set<string>();
    const set = new Set<string>();
    for (const step of activeFlow.steps) {
      set.add(step.fromNodeId);
      set.add(step.toNodeId);
    }
    return set;
  }, [activeFlow]);

  // Connected node IDs for current selection
  const connectedNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const set = new Set<string>();
    set.add(selectedNodeId);
    for (const item of crossLayerEdges) {
      if (item.edge.source === selectedNodeId) {
        set.add(item.edge.target);
      } else if (item.edge.target === selectedNodeId) {
        set.add(item.edge.source);
      }
    }
    return set;
  }, [selectedNodeId, crossLayerEdges]);

  // Upstream & downstream links for the selected node
  const selectedNodeRelations = useMemo(() => {
    if (!selectedNodeId) return { upstream: [], downstream: [] };
    const upstream: Array<{ node: AtlasNode; edge: AtlasEdge; isCross: boolean }> = [];
    const downstream: Array<{ node: AtlasNode; edge: AtlasEdge; isCross: boolean }> = [];

    for (const item of crossLayerEdges) {
      if (item.edge.target === selectedNodeId) {
        upstream.push({ node: item.sourceNode, edge: item.edge, isCross: item.isCrossLayer });
      }
      if (item.edge.source === selectedNodeId) {
        downstream.push({ node: item.targetNode, edge: item.edge, isCross: item.isCrossLayer });
      }
    }
    return { upstream, downstream };
  }, [selectedNodeId, crossLayerEdges]);

  // Pointer drag to orbit 3D stack
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; tiltX: number; rotateZ: number }>({
    x: 0,
    y: 0,
    tiltX: DEFAULT_TILT_X,
    rotateZ: DEFAULT_ROTATE_Z,
  });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, a, textarea')) return;

    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tiltX,
      rotateZ,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, [tiltX, rotateZ]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const newTilt = Math.min(80, Math.max(15, dragStartRef.current.tiltX - dy * 0.35));
    const newRotateZ = dragStartRef.current.rotateZ + dx * 0.45;
    setTiltX(Math.round(newTilt));
    setRotateZ(Math.round(newRotateZ));
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const handleReset = useCallback(() => {
    setTiltX(DEFAULT_TILT_X);
    setRotateZ(DEFAULT_ROTATE_Z);
    setExplodeSpacing(DEFAULT_EXPLODE);
    setZoom(DEFAULT_ZOOM);
    setIsolatedLayer(null);
    setSelectedFlowId(null);
  }, []);

  // Compute node health for chip coloring
  const getNodeHealth = useCallback(
    (node: AtlasNode): { score: number; meta: ReturnType<typeof getHealthMetadata> } => {
      const audit = xrayByNodeId.get(node.id);
      if (audit && typeof audit.overallHealth === 'number') {
        return { score: audit.overallHealth, meta: getHealthMetadata(audit.overallHealth) };
      }
      if (typeof node.riskScore === 'number') {
        const score = Math.round(Math.max(0, Math.min(100, (1 - node.riskScore) * 100)));
        return { score, meta: getHealthMetadata(score) };
      }
      const sub = subsystemById.get(node.subsystemId);
      if (sub && typeof sub.healthScore === 'number') {
        return { score: sub.healthScore, meta: getHealthMetadata(sub.healthScore) };
      }
      return { score: 85, meta: getHealthMetadata(85) };
    },
    [xrayByNodeId, subsystemById]
  );

  return (
    <div className="relative w-full h-[820px] bg-[var(--bg-void)] select-none overflow-hidden rounded-xl border border-[var(--border-card)]">
      {/* Background Architectural Grid Pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(26, 115, 232, 0.12) 0%, transparent 65%),
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 32px 32px, 32px 32px',
        }}
      />

      {/* Top HUD Bar */}
      <header className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[var(--bg-card)]/90 backdrop-blur-md rounded-xl border border-[var(--border-card)] shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--cobalt-tint)] border border-[var(--cobalt-ice)]/30 text-[var(--cobalt-bright)]">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider uppercase text-[var(--cobalt-bright)]">
                3D Isometric Strata
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-card-elevated)] border border-[var(--border-card)] text-[var(--ink-secondary)]">
                {populatedStrata.length} Layers · {blueprint.nodes.length} Modules
              </span>
              {prefersReducedMotion && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30">
                  Reduced Motion
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-[var(--ink-primary)] truncate max-w-md">
              {blueprint.architecturePattern || blueprint.headline || 'System Architecture Stack'}
            </p>
          </div>
        </div>

        {/* Central Camera & View Controls */}
        <div className="flex items-center gap-2">
          {/* Color Mode Switcher */}
          <div className="flex items-center p-1 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-card)]">
            <button
              type="button"
              onClick={() => setColorMode('subsystem')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-all ${
                colorMode === 'subsystem'
                  ? 'bg-[var(--cobalt-core)] text-white shadow-sm'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>Subsystems</span>
            </button>
            <button
              type="button"
              onClick={() => setColorMode('xray')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-all ${
                colorMode === 'xray'
                  ? 'bg-[var(--cobalt-core)] text-white shadow-sm'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>X-Ray Health</span>
            </button>
          </div>

          {/* Execution Flow Filter Selector */}
          {blueprint.flows && blueprint.flows.length > 0 && (
            <div className="relative">
              <select
                aria-label="Highlight Execution Flow"
                value={selectedFlowId || ''}
                onChange={(e) => setSelectedFlowId(e.target.value ? e.target.value : null)}
                className="appearance-none text-xs bg-[var(--bg-card-elevated)] text-[var(--ink-primary)] border border-[var(--border-card)] rounded-lg pl-8 pr-8 py-1.5 font-medium focus:outline-none focus:border-[var(--cobalt-bright)] transition-colors cursor-pointer"
              >
                <option value="">Cross-Layer Flows: None</option>
                {blueprint.flows.map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    Flow: {flow.title} ({flow.steps.length} steps)
                  </option>
                ))}
              </select>
              <Zap className="w-3.5 h-3.5 text-[var(--cobalt-bright)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <ChevronDown className="w-3.5 h-3.5 text-[var(--ink-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* Toggle Sliders Panel */}
          <button
            type="button"
            onClick={() => setShowControls((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              showControls
                ? 'bg-[var(--cobalt-tint)] border-[var(--cobalt-ice)]/40 text-[var(--cobalt-ice)]'
                : 'bg-[var(--bg-card-elevated)] border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Controls</span>
          </button>

          {/* Reset Camera Button */}
          <button
            type="button"
            onClick={handleReset}
            title="Reset to default isometric stack"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-card)] text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--cobalt-border)] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </header>

      {/* Floating Interactive Controls Overlay (Explode Spacing & Tilt) */}
      {showControls && (
        <div className="absolute top-20 right-4 z-20 w-72 p-3.5 bg-[var(--bg-card)]/95 backdrop-blur-md rounded-xl border border-[var(--border-card)] shadow-2xl flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-card)]">
            <span className="text-xs font-bold tracking-wider uppercase text-[var(--ink-secondary)] flex items-center gap-1.5">
              <Rotate3d className="w-3.5 h-3.5 text-[var(--cobalt-bright)]" />
              Stack Geometry
            </span>
            <button
              type="button"
              onClick={() => setShowControls(false)}
              className="text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Explode Spacing Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--ink-secondary)]">Explode Spacing</span>
              <span className="font-mono text-[var(--cobalt-ice)]">{explodeSpacing}px</span>
            </div>
            <input
              type="range"
              min="35"
              max="220"
              step="5"
              value={explodeSpacing}
              onChange={(e) => setExplodeSpacing(Number(e.target.value))}
              className="w-full accent-[var(--cobalt-core)] bg-[var(--bg-card-elevated)] h-1.5 rounded cursor-pointer"
            />
          </div>

          {/* Tilt Angle Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--ink-secondary)]">Tilt Angle (X)</span>
              <span className="font-mono text-[var(--cobalt-ice)]">{tiltX}°</span>
            </div>
            <input
              type="range"
              min="15"
              max="75"
              step="1"
              value={tiltX}
              onChange={(e) => setTiltX(Number(e.target.value))}
              className="w-full accent-[var(--cobalt-core)] bg-[var(--bg-card-elevated)] h-1.5 rounded cursor-pointer"
            />
          </div>

          {/* Rotation Z Angle Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--ink-secondary)]">Orbit Azimuth (Z)</span>
              <span className="font-mono text-[var(--cobalt-ice)]">{rotateZ}°</span>
            </div>
            <input
              type="range"
              min="-120"
              max="60"
              step="1"
              value={rotateZ}
              onChange={(e) => setRotateZ(Number(e.target.value))}
              className="w-full accent-[var(--cobalt-core)] bg-[var(--bg-card-elevated)] h-1.5 rounded cursor-pointer"
            />
          </div>

          {/* Zoom Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--ink-secondary)]">Perspective Scale</span>
              <span className="font-mono text-[var(--cobalt-ice)]">{Math.round(zoom * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.5"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[var(--cobalt-core)] bg-[var(--bg-card-elevated)] h-1.5 rounded cursor-pointer"
            />
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-3 gap-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setTiltX(55);
                setRotateZ(-35);
              }}
              className="px-2 py-1 text-[11px] rounded bg-[var(--bg-card-elevated)] border border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-white transition-colors"
            >
              Isometric
            </button>
            <button
              type="button"
              onClick={() => {
                setTiltX(20);
                setRotateZ(0);
              }}
              className="px-2 py-1 text-[11px] rounded bg-[var(--bg-card-elevated)] border border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-white transition-colors"
            >
              Top-Down
            </button>
            <button
              type="button"
              onClick={() => {
                setTiltX(72);
                setRotateZ(-65);
              }}
              className="px-2 py-1 text-[11px] rounded bg-[var(--bg-card-elevated)] border border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-white transition-colors"
            >
              Cutaway
            </button>
          </div>

          <p className="text-[11px] text-[var(--ink-muted)] flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" />
            Drag on canvas to orbit view freely
          </p>
        </div>
      )}

      {/* Layer Filter / Elevation Breadcrumb Pills */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-1.5 p-2 bg-[var(--bg-card)]/90 backdrop-blur-md rounded-xl border border-[var(--border-card)]">
        <span className="text-[11px] font-bold text-[var(--ink-muted)] uppercase tracking-wider px-1">
          Strata:
        </span>
        <button
          type="button"
          onClick={() => setIsolatedLayer(null)}
          className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
            isolatedLayer === null
              ? 'bg-[var(--cobalt-core)] text-white font-bold'
              : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-card-elevated)]'
          }`}
        >
          All ({populatedStrata.length})
        </button>
        {populatedStrata.map((s) => (
          <button
            key={s.layer}
            type="button"
            onClick={() => setIsolatedLayer(isolatedLayer === s.layer ? null : s.layer)}
            className={`px-2 py-0.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
              isolatedLayer === s.layer
                ? 'bg-[var(--cobalt-core)] text-white font-bold'
                : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-card-elevated)]'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: s.accentColor || LAYER_ACCENT_FALLBACKS[s.layer] }}
            />
            <span>{s.title || s.layer}</span>
          </button>
        ))}
      </div>

      {/* Main 3D Viewport with Perspective & Drag Orbit */}
      <div
        className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          perspective: '1200px',
          perspectiveOrigin: '50% 50%',
        }}
      >
        {/* Gimbal Stage */}
        <div
          className="relative w-[780px] h-[520px] transition-transform"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${tiltX}deg) rotateZ(${rotateZ}deg) scale(${zoom})`,
            transition: prefersReducedMotion ? 'none' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Base Shadow Disk */}
          <div
            className="absolute inset-0 rounded-3xl opacity-60 pointer-events-none"
            style={{
              transform: 'translateZ(-40px) scale(1.15)',
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, transparent 70%)',
              filter: 'blur(30px)',
            }}
          />

          {/* Render each stratum layer slab in stacked isometric space */}
          {populatedStrata.map((stratum, index) => {
            const elevationZ = index * explodeSpacing;
            const nodes = stratumNodesMap.get(stratum.layer) || [];
            const accent = stratum.accentColor || LAYER_ACCENT_FALLBACKS[stratum.layer] || 'var(--cobalt-bright)';
            const isTargetOfSelection =
              selectedNode && nodes.some((n) => connectedNodeIds.has(n.id) && n.id !== selectedNode.id);
            const containsSelected = selectedNode && selectedNode.layer === stratum.layer;

            return (
              <div
                key={stratum.layer}
                className="absolute inset-0 rounded-2xl pointer-events-auto transition-transform"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: `translateZ(${elevationZ}px)`,
                  transition: prefersReducedMotion
                    ? 'none'
                    : 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease',
                }}
              >
                {/* Stratum Plane Slab Floor */}
                <div
                  className="w-full h-full rounded-2xl p-5 border flex flex-col justify-between backdrop-blur-md transition-all"
                  style={{
                    backgroundColor: containsSelected
                      ? 'rgba(14, 18, 24, 0.94)'
                      : isTargetOfSelection
                      ? 'rgba(11, 15, 22, 0.92)'
                      : 'rgba(8, 10, 14, 0.88)',
                    borderColor: containsSelected
                      ? 'var(--cobalt-bright)'
                      : isTargetOfSelection
                      ? 'rgba(138, 180, 248, 0.45)'
                      : 'rgba(255, 255, 255, 0.11)',
                    boxShadow: containsSelected
                      ? '0 0 35px -5px rgba(26, 115, 232, 0.45), inset 0 1px 0 rgba(255,255,255,0.18)'
                      : isTargetOfSelection
                      ? '0 0 25px -5px rgba(66, 133, 244, 0.28), inset 0 1px 0 rgba(255,255,255,0.12)'
                      : '0 20px 40px -15px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255,255,255,0.08)',
                    backgroundImage: `
                      radial-gradient(circle at 100% 0%, ${accent}18 0%, transparent 45%),
                      radial-gradient(circle, rgba(138, 180, 248, 0.12) 1px, transparent 1px)
                    `,
                    backgroundSize: '100% 100%, 20px 20px',
                  }}
                >
                  {/* Layer Header Pill & Metrics */}
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase"
                        style={{
                          backgroundColor: `${accent}25`,
                          color: accent,
                          border: `1px solid ${accent}50`,
                        }}
                      >
                        L{stratum.elevation ?? index} · {stratum.layer}
                      </span>
                      <h3 className="text-sm font-bold text-white tracking-wide">
                        {stratum.title || `${stratum.layer.toUpperCase()} LAYER`}
                      </h3>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[var(--ink-secondary)] font-mono">
                      <span>{nodes.length} modules</span>
                      {stratum.tokenCount ? (
                        <span>· {(stratum.tokenCount / 1000).toFixed(0)}k tokens</span>
                      ) : null}
                    </div>
                  </div>

                  {/* Modules Chip Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 my-auto py-2">
                    {nodes.map((node) => {
                      const isSelected = selectedNodeId === node.id;
                      const isConnected = connectedNodeIds.has(node.id);
                      const isPartOfFlow = flowNodeIds.has(node.id);
                      const sub = subsystemById.get(node.subsystemId);
                      const subColor = sub?.color || 'var(--cobalt-bright)';
                      const { score: healthScore, meta: healthMeta } = getNodeHealth(node);

                      // Primary chip highlight color depending on active mode
                      const chipColor = colorMode === 'xray' ? healthMeta.color : subColor;

                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectNode(node.id);
                          }}
                          className="group relative text-left p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5"
                          style={{
                            backgroundColor: isSelected
                              ? 'rgba(26, 115, 232, 0.22)'
                              : isConnected
                              ? 'rgba(14, 18, 24, 0.95)'
                              : 'rgba(10, 14, 20, 0.85)',
                            borderColor: isSelected
                              ? 'var(--cobalt-bright)'
                              : isConnected
                              ? 'rgba(138, 180, 248, 0.6)'
                              : isPartOfFlow
                              ? 'var(--amber)'
                              : 'rgba(255, 255, 255, 0.12)',
                            boxShadow: isSelected
                              ? '0 0 20px -2px rgba(66, 133, 244, 0.65), 0 4px 12px rgba(0,0,0,0.5)'
                              : isConnected
                              ? '0 0 12px -2px rgba(138, 180, 248, 0.35)'
                              : 'none',
                            transform: isSelected
                              ? 'translateZ(18px)'
                              : isConnected
                              ? 'translateZ(8px)'
                              : 'translateZ(2px)',
                            transformStyle: 'preserve-3d',
                          }}
                        >
                          {/* Module Header & Kind */}
                          <div className="flex items-start justify-between gap-1 w-full">
                            <span className="text-xs font-bold text-white group-hover:text-[var(--cobalt-ice)] transition-colors truncate">
                              {node.label}
                            </span>
                            <span
                              className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded shrink-0"
                              style={{
                                backgroundColor: `${chipColor}20`,
                                color: chipColor,
                                border: `1px solid ${chipColor}40`,
                              }}
                            >
                              {node.kind}
                            </span>
                          </div>

                          {/* Subtitle / File Path */}
                          <p className="text-[10px] text-[var(--ink-secondary)] truncate w-full font-mono">
                            {node.subtitle || node.primaryFile || ''}
                          </p>

                          {/* Indicators Footer: Subsystem or X-Ray health */}
                          <div className="flex items-center justify-between pt-1 border-t border-white/5 w-full text-[10px]">
                            {colorMode === 'xray' ? (
                              <div className="flex items-center gap-1 font-mono">
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: healthMeta.color }}
                                />
                                <span className={healthMeta.textColor}>{healthScore}% Health</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-[var(--ink-muted)] truncate max-w-[120px]">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: subColor }}
                                />
                                <span className="truncate">{sub?.name || 'Default Subsystem'}</span>
                              </div>
                            )}

                            {isPartOfFlow && (
                              <span className="flex items-center gap-0.5 text-amber-400 font-mono text-[9px] font-bold">
                                <Zap className="w-2.5 h-2.5" />
                                Flow
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}

                    {nodes.length === 0 && (
                      <div className="col-span-full py-6 text-center text-xs text-[var(--ink-muted)] font-mono">
                        No modules directly mapped to this stratum.
                      </div>
                    )}
                  </div>

                  {/* Layer Footer Description */}
                  <div className="text-[11px] text-[var(--ink-muted)] pt-2 border-t border-white/5 flex items-center justify-between">
                    <span className="truncate max-w-lg">{stratum.description}</span>
                    <span className="font-mono text-[10px] text-[var(--ink-secondary)] shrink-0">
                      Elevation {stratum.elevation}
                    </span>
                  </div>
                </div>

                {/* Animated Cross-Layer Conduits (Beams between layers) */}
                {index < populatedStrata.length - 1 && (
                  <div
                    className="absolute -top-12 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-8"
                    style={{
                      transform: 'translateZ(15px) rotateX(-90deg)',
                      transformOrigin: 'bottom center',
                    }}
                  >
                    <div className="h-10 w-0.5 bg-gradient-to-t from-[var(--cobalt-bright)] to-transparent opacity-40" />
                    <div className="h-10 w-0.5 bg-gradient-to-t from-[var(--cobalt-ice)] to-transparent opacity-60" />
                    <div className="h-10 w-0.5 bg-gradient-to-t from-[var(--cobalt-bright)] to-transparent opacity-40" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Node Inspector Bottom / Side Drawer */}
      {selectedNode && (
        <aside className="absolute bottom-4 right-4 z-20 w-96 p-4 bg-[var(--bg-card)]/95 backdrop-blur-xl rounded-xl border border-[var(--cobalt-border)] shadow-2xl flex flex-col gap-3 max-h-[420px] overflow-y-auto">
          <div className="flex items-start justify-between gap-2 pb-2 border-b border-[var(--border-card)]">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-[var(--cobalt-tint)] border border-[var(--cobalt-ice)]/30 text-[var(--cobalt-ice)]">
                  {selectedNode.kind}
                </span>
                <span className="text-xs font-mono text-[var(--ink-muted)]">
                  Layer: {selectedNode.layer}
                </span>
              </div>
              <h4 className="text-base font-bold text-white mt-1">{selectedNode.label}</h4>
            </div>
            <button
              type="button"
              onClick={() => onSelectNode('')}
              className="text-[var(--ink-muted)] hover:text-white transition-colors p-1"
              title="Close Inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary File & Visual Brief */}
          <div className="space-y-1">
            <span className="text-[11px] font-mono text-[var(--ink-muted)]">Source File:</span>
            <p className="text-xs font-mono text-[var(--ink-primary)] bg-[var(--bg-card-elevated)] p-1.5 rounded border border-[var(--border-card)] truncate">
              {selectedNode.primaryFile}
            </p>
          </div>

          {selectedNode.visualBrief && (
            <p className="text-xs text-[var(--ink-secondary)] leading-relaxed italic bg-[var(--bg-void)]/60 p-2 rounded border border-[var(--border-card)]">
              &ldquo;{selectedNode.visualBrief}&rdquo;
            </p>
          )}

          {/* Health & Centrality Metrics */}
          {(() => {
            const { score, meta } = getNodeHealth(selectedNode);
            const MetaIcon = meta.icon;
            return (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-card)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MetaIcon className={`w-4 h-4 ${meta.textColor}`} />
                    <span className="text-xs text-[var(--ink-secondary)]">X-Ray Health</span>
                  </div>
                  <span className={`text-xs font-mono font-bold ${meta.textColor}`}>{score}%</span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-card)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-[var(--cobalt-ice)]" />
                    <span className="text-xs text-[var(--ink-secondary)]">Fan-In / Out</span>
                  </div>
                  <span className="text-xs font-mono text-[var(--ink-primary)] font-bold">
                    {selectedNode.fanIn} / {selectedNode.fanOut}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Cross-Layer Upstream / Downstream Jump Links */}
          <div className="space-y-2 pt-1 border-t border-[var(--border-card)]">
            <span className="text-xs font-bold text-[var(--ink-secondary)] uppercase tracking-wider flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-[var(--cobalt-bright)]" />
              Cross-Layer Connections ({selectedNodeRelations.upstream.length + selectedNodeRelations.downstream.length})
            </span>

            {/* Downstream (Calls) */}
            {selectedNodeRelations.downstream.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--ink-muted)] uppercase font-mono">Calls Downstream:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedNodeRelations.downstream.map(({ node, isCross }) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => onSelectNode(node.id)}
                      className={`px-2 py-1 text-xs rounded border font-mono transition-colors flex items-center gap-1 ${
                        isCross
                          ? 'bg-[var(--cobalt-tint)] border-[var(--cobalt-ice)]/40 text-[var(--cobalt-ice)] hover:bg-[var(--cobalt-core)] hover:text-white'
                          : 'bg-[var(--bg-card-elevated)] border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-white'
                      }`}
                    >
                      <span>{node.label}</span>
                      {isCross && <span className="text-[10px] opacity-70">({node.layer})</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Upstream (Called by) */}
            {selectedNodeRelations.upstream.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--ink-muted)] uppercase font-mono">Invoked By:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedNodeRelations.upstream.map(({ node, isCross }) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => onSelectNode(node.id)}
                      className={`px-2 py-1 text-xs rounded border font-mono transition-colors flex items-center gap-1 ${
                        isCross
                          ? 'bg-amber-950/40 border-amber-500/30 text-amber-300 hover:bg-amber-500 hover:text-black'
                          : 'bg-[var(--bg-card-elevated)] border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-white'
                      }`}
                    >
                      <span>{node.label}</span>
                      {isCross && <span className="text-[10px] opacity-70">({node.layer})</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Subtle Legend footer note */}
      <footer className="absolute bottom-4 right-4 z-10 hidden lg:flex items-center gap-2 text-[10px] text-[var(--ink-muted)] bg-[var(--bg-card)]/70 px-2.5 py-1 rounded-md border border-[var(--border-card)] pointer-events-none">
        <Info className="w-3 h-3 text-[var(--cobalt-bright)]" />
        <span>Click any module chip to inspect cross-strata flows</span>
      </footer>
    </div>
  );
}

export default Strata3DView;
