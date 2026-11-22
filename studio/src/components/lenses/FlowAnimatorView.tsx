'use client';

// =============================================================================
// GitUnderstand (git-understand.com) — Execution Flow Theater Lens
// Agent 60: Interactive animated step-by-step execution sequence theater
// =============================================================================

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RefreshCw,
  FileCode,
  Zap,
  ArrowRight,
  Clock,
  Layers,
  Activity,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Database,
  Globe,
  Cpu,
  ShieldCheck,
  Workflow,
  Sparkles,
} from 'lucide-react';
import type {
  VisualAtlasBlueprint,
  ExecutionFlow,
  ExecutionFlowStep,
  CodemapTourStop,
  AtlasNode,
  ArchitectureLayer,
} from '@shared/types';
import { postRegenerateFlows } from '@/lib/api';

// =============================================================================
// Types & Props
// =============================================================================

export interface FlowAnimatorViewProps {
  blueprint: VisualAtlasBlueprint;
  activeFlowId?: string | null;
  activeStepIndex?: number;
  onSelectNode: (nodeId: string) => void;
  onPeekFile: (filePath: string, lineStart?: number, lineEnd?: number) => void;
  onFlowsUpdated?: (flows: ExecutionFlow[], tour: CodemapTourStop[]) => void;
}

type PlaybackSpeed = 0.5 | 1 | 2;

// Layer color mappings following Obsidian Cobalt + Archival Paper standards
const LAYER_ACCENTS: Record<ArchitectureLayer, { border: string; bg: string; text: string }> = {
  client: { border: '#4285F4', bg: 'rgba(66, 133, 244, 0.12)', text: '#8AB4F8' },
  edge: { border: '#38BDF8', bg: 'rgba(56, 189, 248, 0.12)', text: '#7DD3FC' },
  orchestration: { border: '#818CF8', bg: 'rgba(129, 140, 248, 0.12)', text: '#A5B4FC' },
  domain: { border: '#1A73E8', bg: 'rgba(26, 115, 232, 0.16)', text: '#A8C7FA' },
  infrastructure: { border: '#FBBF24', bg: 'rgba(251, 191, 36, 0.12)', text: '#FDE68A' },
  data: { border: '#34D399', bg: 'rgba(52, 211, 153, 0.12)', text: '#6EE7B7' },
  tooling: { border: '#9AA0A6', bg: 'rgba(154, 160, 166, 0.12)', text: '#E8EAED' },
};

const CATEGORY_META: Record<ExecutionFlow['category'], { label: string; color: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  request: { label: 'Request Flow', color: '#8AB4F8', icon: Globe },
  ingestion: { label: 'Data Ingestion', color: '#34D399', icon: Database },
  ai_pipeline: { label: 'AI Pipeline', color: '#38BDF8', icon: Sparkles },
  auth: { label: 'Authentication', color: '#FBBF24', icon: ShieldCheck },
  state: { label: 'State Sync', color: '#818CF8', icon: Activity },
  build: { label: 'Build & Deploy', color: '#9AA0A6', icon: Cpu },
};

// =============================================================================
// Main Component: FlowAnimatorView
// =============================================================================

export function FlowAnimatorView({
  blueprint,
  activeFlowId,
  activeStepIndex = 0,
  onSelectNode,
  onPeekFile,
  onFlowsUpdated,
}: FlowAnimatorViewProps) {
  // Local state for flows (can be refreshed dynamically)
  const [flows, setFlows] = useState<ExecutionFlow[]>(blueprint.flows || []);
  const [selectedFlowId, setSelectedFlowId] = useState<string>(
    activeFlowId || blueprint.flows?.[0]?.id || ''
  );
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(activeStepIndex);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [isCodeExpanded, setIsCodeExpanded] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync flows if blueprint updates externally
  useEffect(() => {
    if (blueprint.flows && blueprint.flows.length > 0) {
      setFlows(blueprint.flows);
      if (!selectedFlowId || !blueprint.flows.some((f) => f.id === selectedFlowId)) {
        setSelectedFlowId(blueprint.flows[0].id);
        setCurrentStepIndex(0);
      }
    }
  }, [blueprint.flows, selectedFlowId]);

  // Sync activeFlowId prop if controlled externally
  useEffect(() => {
    if (activeFlowId && activeFlowId !== selectedFlowId) {
      setSelectedFlowId(activeFlowId);
      setCurrentStepIndex(0);
      setIsPlaying(false);
    }
  }, [activeFlowId, selectedFlowId]);

  // Active Flow and Step resolution
  const activeFlow = useMemo(() => {
    return flows.find((f) => f.id === selectedFlowId) || flows[0] || null;
  }, [flows, selectedFlowId]);

  const totalSteps = activeFlow?.steps?.length || 0;

  const currentStep = useMemo<ExecutionFlowStep | null>(() => {
    if (!activeFlow || !activeFlow.steps || activeFlow.steps.length === 0) return null;
    const clampedIndex = Math.max(0, Math.min(currentStepIndex, activeFlow.steps.length - 1));
    return activeFlow.steps[clampedIndex] || null;
  }, [activeFlow, currentStepIndex]);

  // Node Map for rapid lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, AtlasNode>();
    for (const node of blueprint.nodes || []) {
      map.set(node.id, node);
    }
    return map;
  }, [blueprint.nodes]);

  // Auto-advance timeline timer
  useEffect(() => {
    if (!isPlaying || totalSteps <= 1) return;

    const intervalMs = Math.round(2800 / speed);
    const timer = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev >= totalSteps - 1) {
          // Loop seamlessly
          return 0;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, totalSteps, speed]);

  // Keyboard navigation shortcuts (Space to toggle play/pause, Left/Right for steps)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalSteps]);

  // Flow regeneration handler
  const handleRegenerateFlows = useCallback(async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    setRegenerateError(null);

    try {
      const result = await postRegenerateFlows(blueprint.repoId);
      if (result && result.flows && result.flows.length > 0) {
        setFlows(result.flows);
        setSelectedFlowId(result.flows[0].id);
        setCurrentStepIndex(0);
        setIsPlaying(false);
        if (onFlowsUpdated) {
          onFlowsUpdated(result.flows, result.codemapTour || []);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to regenerate execution flows';
      setRegenerateError(msg);
    } finally {
      setIsRegenerating(false);
    }
  }, [blueprint.repoId, isRegenerating, onFlowsUpdated]);

  // Controls Handlers
  const handleTogglePlay = () => setIsPlaying((p) => !p);
  const handlePrevStep = () => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };
  const handleNextStep = () => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.min(totalSteps - 1, prev + 1));
  };
  const handleSelectStep = (index: number) => {
    setIsPlaying(false);
    setCurrentStepIndex(index);
  };

  // Node Sequence in Current Flow for Spatial Graph Visualization
  const flowNodesSequence = useMemo(() => {
    if (!activeFlow || !activeFlow.steps) return [];
    const orderedNodeIds: string[] = [];
    activeFlow.steps.forEach((step) => {
      if (step.fromNodeId && !orderedNodeIds.includes(step.fromNodeId)) {
        orderedNodeIds.push(step.fromNodeId);
      }
      if (step.toNodeId && !orderedNodeIds.includes(step.toNodeId)) {
        orderedNodeIds.push(step.toNodeId);
      }
    });

    return orderedNodeIds.map((id, index) => {
      const node = nodeMap.get(id);
      return {
        id,
        index,
        label: node?.label || id,
        layer: node?.layer || 'orchestration',
        primaryFile: node?.primaryFile || '',
        brief: node?.visualBrief || node?.subtitle || '',
      };
    });
  }, [activeFlow, nodeMap]);

  // Compute Layout Positions for SVG Graph
  const svgWidth = 880;
  const svgHeight = 220;
  const nodeSpacing = flowNodesSequence.length > 1
    ? (svgWidth - 160) / (flowNodesSequence.length - 1)
    : 0;

  const nodePositions = useMemo(() => {
    const posMap = new Map<string, { x: number; y: number }>();
    flowNodesSequence.forEach((node, i) => {
      const x = 80 + i * nodeSpacing;
      // Ergonomic undulating circuit wave
      const y = i % 2 === 0 ? 95 : 125;
      posMap.set(node.id, { x, y });
    });
    return posMap;
  }, [flowNodesSequence, nodeSpacing]);

  // Active step endpoints & path
  const activeHop = useMemo(() => {
    if (!currentStep) return null;
    const from = nodePositions.get(currentStep.fromNodeId);
    const to = nodePositions.get(currentStep.toNodeId);
    if (!from || !to) return null;

    // Curved cubic bezier
    const dx = to.x - from.x;
    const midX = (from.x + to.x) / 2;
    // Arch upward or downward depending on direction
    const archOffset = dx >= 0 ? -45 : 45;
    const midY = (from.y + to.y) / 2 + archOffset;
    const pathD = `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;

    return {
      from,
      to,
      midX,
      midY,
      pathD,
      label: currentStep.edgeLabel || currentStep.action,
      payload: currentStep.dataPayload,
    };
  }, [currentStep, nodePositions]);

  // If no flows exist at all
  if (!activeFlow || flows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[480px] p-8 text-center bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl m-4">
        <div className="w-16 h-16 rounded-2xl bg-[var(--cobalt-tint)] border border-[var(--cobalt-ice)]/30 flex items-center justify-center mb-4 text-[var(--cobalt-ice)]">
          <Workflow className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-semibold text-[var(--ink-primary)] mb-2">
          No Execution Flows Synthesized
        </h3>
        <p className="text-sm text-[var(--ink-secondary)] max-w-md mb-6 leading-relaxed">
          Synthesize high-fidelity execution flows and runtime sequences across critical codepaths
          using Gemini architecture telemetry.
        </p>
        <button
          onClick={handleRegenerateFlows}
          disabled={isRegenerating}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white shadow-lg transition-all disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
          {isRegenerating ? 'Synthesizing Runtime Flows...' : 'Synthesize Execution Flows'}
        </button>
        {regenerateError && (
          <p className="mt-4 text-xs text-[var(--vermilion)] flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            {regenerateError}
          </p>
        )}
      </div>
    );
  }

  const categoryMeta = CATEGORY_META[activeFlow.category] || CATEGORY_META.request;
  const CategoryIcon = categoryMeta.icon;

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full h-full min-h-[640px] bg-[var(--bg-void)] text-[var(--ink-primary)] overflow-y-auto select-none p-4 md:p-6 gap-5"
    >
      {/* =====================================================================
          Header: Flow Selector Tabs + Actions
          ===================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--border-card)]">
        {/* Flow Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar">
          {flows.map((flow) => {
            const isSelected = flow.id === activeFlow.id;
            const cat = CATEGORY_META[flow.category] || CATEGORY_META.request;
            const CatIcon = cat.icon;

            return (
              <button
                key={flow.id}
                onClick={() => {
                  setSelectedFlowId(flow.id);
                  setCurrentStepIndex(0);
                  setIsPlaying(false);
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--bg-card-elevated)] border-[var(--cobalt-core)] text-[var(--ink-primary)] shadow-[0_0_16px_-4px_rgba(26,115,232,0.4)]'
                    : 'bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--ink-muted)]'
                }`}
              >
                <CatIcon
                  className="w-3.5 h-3.5"
                  style={{ color: isSelected ? 'var(--cobalt-ice)' : cat.color }}
                />
                <span>{flow.title}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isSelected
                      ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-ice)]/30'
                      : 'bg-white/5 text-[var(--ink-muted)]'
                  }`}
                >
                  {flow.steps?.length || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Regenerate Flows Button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleRegenerateFlows}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-card)] border border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--cobalt-ice)]/50 transition-all cursor-pointer disabled:opacity-50"
            title="Re-run deep LLM flow synthesis to uncover new runtime traces"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[var(--cobalt-ice)] ${
                isRegenerating ? 'animate-spin' : ''
              }`}
            />
            <span>{isRegenerating ? 'Regenerating Flows...' : 'Regenerate Flows'}</span>
          </button>
        </div>
      </div>

      {regenerateError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--vermilion)]/10 border border-[var(--vermilion)]/30 text-xs text-[var(--vermilion)]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{regenerateError}</span>
        </div>
      )}

      {/* =====================================================================
          Active Flow Banner & Trigger Spec
          ===================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-card)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border"
              style={{
                backgroundColor: `${categoryMeta.color}18`,
                borderColor: `${categoryMeta.color}40`,
                color: categoryMeta.color,
              }}
            >
              <CategoryIcon className="w-3 h-3" />
              {categoryMeta.label}
            </span>
            <h2 className="text-base font-semibold text-[var(--ink-primary)] tracking-tight">
              {activeFlow.title}
            </h2>
          </div>
          <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
            {activeFlow.subtitle}
          </p>
        </div>

        {activeFlow.trigger && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-void)] border border-[var(--border-card)] text-xs shrink-0 self-start sm:self-auto">
            <Zap className="w-3.5 h-3.5 text-[var(--amber)]" />
            <span className="text-[var(--ink-muted)]">Trigger:</span>
            <span className="font-mono text-[var(--ink-primary)] text-[11px]">
              {activeFlow.trigger}
            </span>
          </div>
        )}
      </div>

      {/* =====================================================================
          Theater Stage: Interactive Animated SVG Hop Canvas
          ===================================================================== */}
      <div className="relative flex flex-col items-center justify-center w-full min-h-[260px] rounded-2xl bg-[var(--bg-card)] border border-[var(--border-card)] overflow-hidden shadow-2xl p-4">
        {/* Ambient Subtle Grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(var(--cobalt-ice) 0.75px, transparent 0.75px), radial-gradient(var(--cobalt-deep) 0.5px, var(--bg-card) 0.5px)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0, 12px 12px',
          }}
        />

        {/* SVG Node-Hop Circuit */}
        <div className="w-full overflow-x-auto no-scrollbar flex justify-center z-10">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full max-w-[940px] h-auto min-w-[700px] overflow-visible"
          >
            <defs>
              {/* Active glow filter */}
              <filter id="flowGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              {/* Cobalt Linear Gradient for Hop Tracks */}
              <linearGradient id="activeTrackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1A73E8" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#8AB4F8" stopOpacity="1" />
                <stop offset="100%" stopColor="#4285F4" stopOpacity="0.8" />
              </linearGradient>

              {/* Inactive Track Gradient */}
              <linearGradient id="inactiveTrackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.06)" />
              </linearGradient>

              {/* Arrowhead marker */}
              <marker
                id="flowArrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#8AB4F8" />
              </marker>
            </defs>

            {/* Inactive Base Backbone Lines between nodes */}
            {flowNodesSequence.map((node, i) => {
              if (i === flowNodesSequence.length - 1) return null;
              const nextNode = flowNodesSequence[i + 1];
              const p1 = nodePositions.get(node.id);
              const p2 = nodePositions.get(nextNode.id);
              if (!p1 || !p2) return null;

              return (
                <path
                  key={`base-track-${node.id}-${nextNode.id}`}
                  d={`M ${p1.x} ${p1.y} C ${(p1.x + p2.x) / 2} ${p1.y - 20}, ${(p1.x + p2.x) / 2} ${p2.y - 20}, ${p2.x} ${p2.y}`}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              );
            })}

            {/* Active Hop Highlighting Curve */}
            {activeHop && (
              <g className="transition-all duration-300">
                {/* Glow underlay */}
                <path
                  d={activeHop.pathD}
                  fill="none"
                  stroke="#1A73E8"
                  strokeWidth="6"
                  opacity="0.4"
                  filter="url(#flowGlow)"
                />

                {/* Main animated active hop curve */}
                <path
                  d={activeHop.pathD}
                  fill="none"
                  stroke="url(#activeTrackGrad)"
                  strokeWidth="3.5"
                  markerEnd="url(#flowArrow)"
                  className="transition-all"
                />

                {/* Animated Traveling Photon / Particle */}
                <circle r="5" fill="#8AB4F8" filter="url(#flowGlow)">
                  <animateMotion
                    path={activeHop.pathD}
                    dur={`${Math.max(0.8, 2.2 / speed)}s`}
                    repeatCount="indefinite"
                  />
                </circle>

                {/* Pulsing Payload Badge at Arc Midpoint */}
                <g
                  transform={`translate(${activeHop.midX}, ${activeHop.midY})`}
                  className="cursor-pointer"
                >
                  {/* Outer pulse wave */}
                  <rect
                    x="-65"
                    y="-16"
                    width="130"
                    height="26"
                    rx="13"
                    fill="none"
                    stroke="#4285F4"
                    strokeWidth="1.5"
                    opacity="0.6"
                  >
                    <animate
                      attributeName="opacity"
                      values="0.8;0;0.8"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="transform"
                      type="scale"
                      values="1;1.08;1"
                      transform-origin="center"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </rect>

                  {/* Payload badge pill */}
                  <rect
                    x="-62"
                    y="-14"
                    width="124"
                    height="24"
                    rx="12"
                    fill="#080A0E"
                    stroke="#8AB4F8"
                    strokeWidth="1.5"
                    filter="drop-shadow(0 4px 12px rgba(26,115,232,0.45))"
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fill="#F1F3F4"
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                    fontWeight="600"
                    className="select-none pointer-events-none"
                  >
                    {activeHop.payload
                      ? activeHop.payload.length > 18
                        ? `${activeHop.payload.slice(0, 16)}…`
                        : activeHop.payload
                      : activeHop.label.length > 18
                      ? `${activeHop.label.slice(0, 16)}…`
                      : activeHop.label}
                  </text>
                </g>
              </g>
            )}

            {/* Interactive Nodes across the Sequence */}
            {flowNodesSequence.map((node) => {
              const pos = nodePositions.get(node.id);
              if (!pos) return null;

              const isFromNode = currentStep?.fromNodeId === node.id;
              const isToNode = currentStep?.toNodeId === node.id;
              const isCurrentNode = isFromNode || isToNode;
              const layerStyle = LAYER_ACCENTS[node.layer] || LAYER_ACCENTS.orchestration;

              return (
                <g
                  key={`node-${node.id}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => onSelectNode(node.id)}
                  className="cursor-pointer group"
                >
                  {/* Active Highlight Halo */}
                  {isCurrentNode && (
                    <circle
                      r="28"
                      fill="none"
                      stroke={isToNode ? '#34D399' : '#8AB4F8'}
                      strokeWidth="2"
                      opacity="0.8"
                      filter="url(#flowGlow)"
                    >
                      <animate
                        attributeName="r"
                        values="26;31;26"
                        dur="2.2s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.9;0.3;0.9"
                        dur="2.2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* Node Base Circle Card */}
                  <circle
                    r="20"
                    fill="#0E1218"
                    stroke={
                      isCurrentNode
                        ? isToNode
                          ? '#34D399'
                          : '#4285F4'
                        : 'rgba(255, 255, 255, 0.18)'
                    }
                    strokeWidth={isCurrentNode ? '2.5' : '1.5'}
                    filter="drop-shadow(0 6px 16px rgba(0,0,0,0.8))"
                    className="transition-colors group-hover:stroke-[var(--cobalt-bright)]"
                  />

                  {/* Inner Status Indicator */}
                  <circle
                    r="6"
                    fill={isCurrentNode ? (isToNode ? '#34D399' : '#4285F4') : layerStyle.text}
                    opacity={isCurrentNode ? 1 : 0.7}
                  />

                  {/* Node Label Text */}
                  <text
                    x="0"
                    y="36"
                    textAnchor="middle"
                    fill={isCurrentNode ? '#F1F3F4' : '#9AA0A6'}
                    fontSize="11"
                    fontWeight={isCurrentNode ? '700' : '500'}
                    fontFamily="var(--font-sans)"
                    className="select-none transition-colors group-hover:fill-[var(--cobalt-ice)]"
                  >
                    {node.label.length > 15 ? `${node.label.slice(0, 13)}…` : node.label}
                  </text>

                  {/* Layer Subtitle Tag */}
                  <text
                    x="0"
                    y="49"
                    textAnchor="middle"
                    fill={layerStyle.text}
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                    className="select-none opacity-80"
                  >
                    {node.layer}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Ambient Legend Info Pill */}
        <div className="flex items-center gap-4 text-[11px] text-[var(--ink-muted)] mt-2 z-10">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--cobalt-core)] ring-2 ring-[var(--cobalt-ice)]/30" />
            <span>Active Source</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--emerald)] ring-2 ring-[var(--emerald)]/30" />
            <span>Target / Sink</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white/20" />
            <span>Dormant Hop</span>
          </div>
          <div className="text-[10px] text-[var(--ink-muted)] hidden sm:block">
            (Click any node to focus spatial canvas)
          </div>
        </div>
      </div>

      {/* =====================================================================
          Playback Controls & Scrubber Timeline
          ===================================================================== */}
      <div className="flex flex-col gap-3.5 p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-card)]">
        {/* Top Control Bar: Play/Pause/Prev/Next/Speed */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Prev Step */}
            <button
              onClick={handlePrevStep}
              disabled={currentStepIndex <= 0}
              aria-label="Previous Step"
              className="p-2 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--cobalt-ice)]/40 transition-all disabled:opacity-40 cursor-pointer"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            {/* Play / Pause Primary Button */}
            <button
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Pause Flow Animation' : 'Play Flow Animation'}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white shadow-[0_0_20px_-4px_rgba(26,115,232,0.6)] transition-all cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-white" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Play Flow</span>
                </>
              )}
            </button>

            {/* Next Step */}
            <button
              onClick={handleNextStep}
              disabled={currentStepIndex >= totalSteps - 1}
              aria-label="Next Step"
              className="p-2 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--cobalt-ice)]/40 transition-all disabled:opacity-40 cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Center: Step Indicator */}
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--ink-secondary)]">
            <span className="text-[var(--cobalt-ice)] font-bold">
              STEP {currentStepIndex + 1}
            </span>
            <span className="text-[var(--ink-muted)]">/</span>
            <span>{totalSteps}</span>
            {currentStep && (
              <span className="hidden sm:inline-block max-w-[220px] truncate text-[var(--ink-primary)] font-sans ml-1">
                — {currentStep.title}
              </span>
            )}
          </div>

          {/* Speed Presets */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)]">
            {([0.5, 1, 2] as PlaybackSpeed[]).map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                  speed === s
                    ? 'bg-[var(--cobalt-core)] text-white shadow-sm'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Step Scrubber / Timeline Track */}
        <div className="flex items-center gap-1.5 w-full pt-1">
          {activeFlow.steps?.map((step, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;

            return (
              <button
                key={`scrubber-step-${step.stepNumber || idx}`}
                onClick={() => handleSelectStep(idx)}
                className={`group relative flex-1 h-3 rounded-full transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-[var(--cobalt-bright)] ring-2 ring-[var(--cobalt-ice)] shadow-[0_0_12px_rgba(66,133,244,0.6)]'
                    : isCompleted
                    ? 'bg-[var(--cobalt-core)] opacity-70 hover:opacity-100'
                    : 'bg-white/10 hover:bg-white/20'
                }`}
                title={`Step ${idx + 1}: ${step.title}`}
              >
                {/* Tooltip on hover */}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center pointer-events-none z-30">
                  <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-card)] text-[11px] text-[var(--ink-primary)] whitespace-nowrap shadow-xl">
                    <span className="text-[var(--cobalt-ice)] font-mono mr-1">#{idx + 1}</span>
                    {step.title}
                  </span>
                  <span className="w-1.5 h-1.5 bg-[var(--bg-card-elevated)] border-r border-b border-[var(--border-card)] rotate-45 -mt-1" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          Active Step Card: Excerpt, Node Transition, & Peek Source Button
          ===================================================================== */}
      {currentStep && (
        <div className="flex flex-col gap-4 p-5 rounded-2xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)] shadow-xl transition-all">
          {/* Card Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--cobalt-tint)] border border-[var(--cobalt-ice)]/30 text-xs font-mono font-bold text-[var(--cobalt-ice)]">
                {currentStep.stepNumber || currentStepIndex + 1}
              </span>
              <h3 className="text-sm font-semibold text-[var(--ink-primary)]">
                {currentStep.title}
              </h3>
            </div>

            {/* Transition endpoints pill */}
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--ink-secondary)] bg-[var(--bg-void)] px-3 py-1.5 rounded-xl border border-[var(--border-card)]">
              <button
                onClick={() => onSelectNode(currentStep.fromNodeId)}
                className="hover:text-[var(--cobalt-ice)] hover:underline cursor-pointer"
              >
                {nodeMap.get(currentStep.fromNodeId)?.label || currentStep.fromNodeId}
              </button>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--cobalt-bright)]" />
              <button
                onClick={() => onSelectNode(currentStep.toNodeId)}
                className="hover:text-[var(--emerald)] hover:underline cursor-pointer"
              >
                {nodeMap.get(currentStep.toNodeId)?.label || currentStep.toNodeId}
              </button>
            </div>
          </div>

          {/* Action Description */}
          <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
            {currentStep.action}
          </p>

          {/* Code Excerpt Box (4-line preview) */}
          <div className="flex flex-col rounded-xl bg-[var(--bg-void)] border border-[var(--border-card)] overflow-hidden">
            {/* File Path & Peek Source Action Bar */}
            <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--bg-card)] border-b border-[var(--border-card)] text-xs">
              <div className="flex items-center gap-2 text-[var(--ink-secondary)] font-mono text-[11px] truncate">
                <FileCode className="w-3.5 h-3.5 text-[var(--cobalt-ice)] shrink-0" />
                <span className="truncate">{currentStep.filePath}</span>
                {currentStep.lineStart > 0 && (
                  <span className="text-[var(--ink-muted)] shrink-0">
                    :L{currentStep.lineStart}
                    {currentStep.lineEnd ? `-L${currentStep.lineEnd}` : ''}
                  </span>
                )}
              </div>

              {/* Primary "Peek Source" Button */}
              <button
                onClick={() =>
                  onPeekFile(
                    currentStep.filePath,
                    currentStep.lineStart,
                    currentStep.lineEnd
                  )
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--cobalt-tint)] hover:bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)] border border-[var(--cobalt-ice)]/30 transition-all cursor-pointer shrink-0"
              >
                <FileCode className="w-3 h-3" />
                <span>Peek Source</span>
              </button>
            </div>

            {/* Code Content */}
            <div className="p-3 font-mono text-[11px] leading-relaxed text-[var(--ink-primary)] bg-[var(--bg-void)] overflow-x-auto">
              {currentStep.codeExcerpt ? (
                <pre className="m-0 p-0 font-mono">
                  <code>
                    {(() => {
                      const lines = currentStep.codeExcerpt.split('\n');
                      const displayLines = isCodeExpanded ? lines : lines.slice(0, 4);
                      return displayLines.map((line, i) => (
                        <div key={i} className="flex gap-3">
                          <span className="w-6 text-right select-none text-[var(--ink-muted)] opacity-60">
                            {currentStep.lineStart ? currentStep.lineStart + i : i + 1}
                          </span>
                          <span className="flex-1 whitespace-pre">{line || ' '}</span>
                        </div>
                      ));
                    })()}
                  </code>
                </pre>
              ) : (
                <div className="text-[var(--ink-muted)] italic py-1">
                  // Runtime invocation through {currentStep.filePath}
                </div>
              )}

              {currentStep.codeExcerpt && currentStep.codeExcerpt.split('\n').length > 4 && (
                <button
                  onClick={() => setIsCodeExpanded((p) => !p)}
                  className="mt-2 text-[10px] text-[var(--cobalt-ice)] hover:underline cursor-pointer"
                >
                  {isCodeExpanded ? 'Show less' : 'Expand full excerpt'}
                </button>
              )}
            </div>
          </div>

          {/* Data Payload Chip */}
          {currentStep.dataPayload && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[10px] uppercase font-mono tracking-wider text-[var(--ink-muted)]">
                Payload Contract:
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-void)] border border-[var(--border-card)] font-mono text-[11px] text-[var(--cobalt-ice)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--cobalt-core)] animate-pulse" />
                {currentStep.dataPayload}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
