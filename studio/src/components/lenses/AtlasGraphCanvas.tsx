'use client';

// =============================================================================
// GitUnderstand (git-understand.com) — Flagship Atlas Graph Canvas Lens
// Agent 57: Pan/zoom spatial architectural graph with animated flow curves,
// interactive subsystem hulls, X-Ray risk halos, Circle-to-Explain lasso,
// Visual Search match rings, programmatic camera fly-to, and interactive minimap.
// =============================================================================

import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import type {
  VisualAtlasBlueprint,
  XRayPillarId,
  VisualSearchMatch,
  AtlasNode,
  AtlasEdge,
  SubsystemCluster,
  ArchitectureLayer,
} from '@shared/types';
import {
  computeAtlasLayout,
  buildCurvedEdgePath,
  type PositionedNode,
  type ClusterHull,
} from '@/lib/graphLayout';
import { CircleToExplainOverlay } from '@/components/lenses/CircleToExplainOverlay';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  ShieldAlert,
  Layers,
  Activity,
  FileCode,
  MapPin,
  Search,
  ChevronDown,
  Compass,
  Cpu,
  Zap,
} from 'lucide-react';

// =============================================================================
// Public Contracts & Component Props
// =============================================================================

export interface AtlasGraphHandle {
  capturePngBase64: () => Promise<string | null>;
  focusNode: (nodeId: string) => void;
  fitView: () => void;
}

export interface AtlasGraphCanvasProps {
  blueprint: VisualAtlasBlueprint;
  selectedNodeId: string | null;
  focusedNodeId: string | null;
  xrayOverlayPillar: XRayPillarId | null;
  visualSearchMatches?: VisualSearchMatch[];
  onSelectNode: (nodeId: string) => void;
  onPeekFile: (filePath: string, lineStart?: number) => void;
  onChangeXRayOverlay: (pillar: XRayPillarId | null) => void;
}

interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
}

// X-Ray Pillar Human Labels & Badges
const XRAY_PILLARS: Array<{ id: XRayPillarId; label: string }> = [
  { id: 'modularity', label: 'Modularity' },
  { id: 'security', label: 'Security' },
  { id: 'resilience', label: 'Resilience' },
  { id: 'testability', label: 'Testability' },
  { id: 'api_clarity', label: 'API Clarity' },
  { id: 'concurrency', label: 'Concurrency' },
  { id: 'scalability', label: 'Scalability' },
  { id: 'hygiene', label: 'Hygiene' },
  { id: 'onboarding', label: 'Onboarding' },
];

// =============================================================================
// Component Implementation
// =============================================================================

export const AtlasGraphCanvas = forwardRef<AtlasGraphHandle, AtlasGraphCanvasProps>(
  function AtlasGraphCanvas(
    {
      blueprint,
      selectedNodeId,
      focusedNodeId,
      xrayOverlayPillar,
      visualSearchMatches = [],
      onSelectNode,
      onPeekFile,
      onChangeXRayOverlay,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    // Viewport transform state
    const [transform, setTransform] = useState<ViewportTransform>({
      x: 0,
      y: 0,
      scale: 0.85,
    });
    const [isAnimating, setIsAnimating] = useState(false);
    const [circleExplainActive, setCircleExplainActive] = useState(false);
    const [showXRayDropdown, setShowXRayDropdown] = useState(false);
    const [minimapMinimized, setMinimapMinimized] = useState(false);

    // Pan interaction tracking
    const isPanningRef = useRef(false);
    const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const panOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // ---------------------------------------------------------------------------
    // Deterministic Layout Computation
    // ---------------------------------------------------------------------------
    const { positionedNodes, hulls, bounds } = useMemo(() => {
      return computeAtlasLayout(
        blueprint.nodes || [],
        blueprint.edges || [],
        blueprint.subsystems || []
      );
    }, [blueprint.nodes, blueprint.edges, blueprint.subsystems]);

    // Fast lookup dictionaries
    const nodeMap = useMemo(() => {
      const map = new Map<string, PositionedNode>();
      for (const pn of positionedNodes) {
        map.set(pn.node.id, pn);
      }
      return map;
    }, [positionedNodes]);

    const visualSearchMap = useMemo(() => {
      const map = new Map<string, VisualSearchMatch>();
      for (const match of visualSearchMatches) {
        map.set(match.nodeId, match);
      }
      return map;
    }, [visualSearchMatches]);

    const xrayModuleMap = useMemo(() => {
      const map = new Map<string, NonNullable<VisualAtlasBlueprint['xray']>['modules'][number]>();
      if (blueprint.xray?.modules) {
        for (const mod of blueprint.xray.modules) {
          map.set(mod.nodeId, mod);
        }
      }
      return map;
    }, [blueprint.xray]);

    // ---------------------------------------------------------------------------
    // Camera Navigation: fitView & focusNode
    // ---------------------------------------------------------------------------
    const fitView = useCallback(
      (animate = true) => {
        const container = containerRef.current;
        if (!container) return;
        const { clientWidth, clientHeight } = container;
        if (clientWidth <= 0 || clientHeight <= 0) return;

        const padding = 100;
        const availableW = Math.max(200, clientWidth - padding * 2);
        const availableH = Math.max(200, clientHeight - padding * 2);

        const scaleX = availableW / bounds.width;
        const scaleY = availableH / bounds.height;
        const targetScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.22), 1.15);

        const targetX = Math.round((clientWidth - bounds.width * targetScale) / 2);
        const targetY = Math.round((clientHeight - bounds.height * targetScale) / 2);

        if (animate) {
          setIsAnimating(true);
          setTransform({ x: targetX, y: targetY, scale: targetScale });
          const timer = setTimeout(() => setIsAnimating(false), 420);
          return () => clearTimeout(timer);
        } else {
          setTransform({ x: targetX, y: targetY, scale: targetScale });
        }
      },
      [bounds]
    );

    const focusNode = useCallback(
      (nodeId: string, animate = true) => {
        const pn = nodeMap.get(nodeId);
        const container = containerRef.current;
        if (!pn || !container) return;
        const { clientWidth, clientHeight } = container;
        if (clientWidth <= 0 || clientHeight <= 0) return;

        const targetScale = Math.min(Math.max(transform.scale, 0.95), 1.4);
        const nodeCenterX = pn.x + pn.width / 2;
        const nodeCenterY = pn.y + pn.height / 2;

        const targetX = Math.round(clientWidth / 2 - nodeCenterX * targetScale);
        const targetY = Math.round(clientHeight / 2 - nodeCenterY * targetScale);

        if (animate) {
          setIsAnimating(true);
          setTransform({ x: targetX, y: targetY, scale: targetScale });
          const timer = setTimeout(() => setIsAnimating(false), 420);
          return () => clearTimeout(timer);
        } else {
          setTransform({ x: targetX, y: targetY, scale: targetScale });
        }
      },
      [nodeMap, transform.scale]
    );

    // Initial Auto-Fit on Mount
    const initialFitDoneRef = useRef(false);
    useEffect(() => {
      if (!initialFitDoneRef.current && positionedNodes.length > 0) {
        initialFitDoneRef.current = true;
        const t = setTimeout(() => fitView(false), 60);
        return () => clearTimeout(t);
      }
    }, [positionedNodes.length, fitView]);

    // Reactive camera fly-to on focusedNodeId prop change
    useEffect(() => {
      if (focusedNodeId) {
        focusNode(focusedNodeId, true);
      }
    }, [focusedNodeId, focusNode]);

    // ---------------------------------------------------------------------------
    // High-Resolution PNG Canvas Capture
    // ---------------------------------------------------------------------------
    const capturePngBase64 = useCallback(async (): Promise<string | null> => {
      const svg = svgRef.current;
      if (!svg) return null;

      try {
        const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
        clonedSvg.setAttribute('width', String(bounds.width));
        clonedSvg.setAttribute('height', String(bounds.height));
        clonedSvg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);

        // Reset transform on top-level group in clone so entire graph is rendered
        const innerG = clonedSvg.querySelector('g[data-stage-inner="true"]');
        if (innerG) {
          innerG.removeAttribute('transform');
          innerG.removeAttribute('style');
        }

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clonedSvg);
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const img = new Image();
        const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = (e) => reject(e);
        });
        img.src = url;
        await loaded;

        const canvas = document.createElement('canvas');
        canvas.width = bounds.width;
        canvas.height = bounds.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          return null;
        }

        // Obsidian pitch-black canvas background
        ctx.fillStyle = '#080A0E';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        return canvas.toDataURL('image/png');
      } catch (err) {
        console.warn('[AtlasGraphCanvas] capturePngBase64 warning:', err);
        return null;
      }
    }, [bounds]);

    // Expose imperative handle methods
    useImperativeHandle(
      ref,
      () => ({
        capturePngBase64,
        focusNode,
        fitView: () => fitView(true),
      }),
      [capturePngBase64, focusNode, fitView]
    );

    // ---------------------------------------------------------------------------
    // Pan & Zoom Wheel Listener with Non-Passive preventDefault
    // ---------------------------------------------------------------------------
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleWheel = (e: WheelEvent) => {
        if (circleExplainActive) return; // Allow lasso overlay drawing
        e.preventDefault();

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (e.ctrlKey || e.metaKey) {
          // Pinch zoom
          const zoomFactor = Math.exp(-e.deltaY * 0.008);
          setTransform((prev) => {
            const nextScale = Math.min(Math.max(prev.scale * zoomFactor, 0.18), 2.8);
            const ratio = nextScale / prev.scale;
            return {
              scale: nextScale,
              x: mouseX - (mouseX - prev.x) * ratio,
              y: mouseY - (mouseY - prev.y) * ratio,
            };
          });
        } else {
          // Trackpad 2-finger pan or vertical wheel pan
          setTransform((prev) => ({
            ...prev,
            x: prev.x - e.deltaX,
            y: prev.y - e.deltaY,
          }));
        }
      };

      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }, [circleExplainActive]);

    // ---------------------------------------------------------------------------
    // Pointer Dragging for Background Stage Pan
    // ---------------------------------------------------------------------------
    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (circleExplainActive) return;
      if (e.button !== 0 && e.button !== 1) return;

      // Only initiate pan when clicking directly on background SVG or canvas surface
      const target = e.target as HTMLElement | SVGElement;
      const isCard = target.closest('[data-node-card="true"]');
      const isControl = target.closest('[data-control-panel="true"]');
      if (isCard || isControl) return;

      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOriginRef.current = { x: transform.x, y: transform.y };
      setIsAnimating(false);

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isPanningRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;

      setTransform((prev) => ({
        ...prev,
        x: panOriginRef.current.x + dx,
        y: panOriginRef.current.y + dy,
      }));
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
    };

    // Zoom Buttons
    const handleZoomIn = () => {
      setIsAnimating(true);
      const container = containerRef.current;
      const cx = (container?.clientWidth || 800) / 2;
      const cy = (container?.clientHeight || 600) / 2;
      setTransform((prev) => {
        const nextScale = Math.min(prev.scale * 1.25, 2.8);
        const ratio = nextScale / prev.scale;
        return {
          scale: nextScale,
          x: cx - (cx - prev.x) * ratio,
          y: cy - (cy - prev.y) * ratio,
        };
      });
      setTimeout(() => setIsAnimating(false), 300);
    };

    const handleZoomOut = () => {
      setIsAnimating(true);
      const container = containerRef.current;
      const cx = (container?.clientWidth || 800) / 2;
      const cy = (container?.clientHeight || 600) / 2;
      setTransform((prev) => {
        const nextScale = Math.max(prev.scale * 0.8, 0.18);
        const ratio = nextScale / prev.scale;
        return {
          scale: nextScale,
          x: cx - (cx - prev.x) * ratio,
          y: cy - (cy - prev.y) * ratio,
        };
      });
      setTimeout(() => setIsAnimating(false), 300);
    };

    // ---------------------------------------------------------------------------
    // Minimap Metrics & Math
    // ---------------------------------------------------------------------------
    const minimapWidth = 200;
    const minimapScale = minimapWidth / bounds.width;
    const minimapHeight = Math.round(bounds.height * minimapScale);

    const viewportRect = useMemo(() => {
      const container = containerRef.current;
      const cw = container?.clientWidth || 1000;
      const ch = container?.clientHeight || 700;

      const vx = (-transform.x / transform.scale) * minimapScale;
      const vy = (-transform.y / transform.scale) * minimapScale;
      const vw = (cw / transform.scale) * minimapScale;
      const vh = (ch / transform.scale) * minimapScale;

      return {
        x: Math.max(0, vx),
        y: Math.max(0, vy),
        width: Math.min(minimapWidth, vw),
        height: Math.min(minimapHeight, vh),
      };
    }, [transform, minimapScale, bounds, minimapHeight]);

    const handleMinimapClick = (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const targetGraphX = clickX / minimapScale;
      const targetGraphY = clickY / minimapScale;

      const container = containerRef.current;
      const cw = container?.clientWidth || 1000;
      const ch = container?.clientHeight || 700;

      setIsAnimating(true);
      setTransform((prev) => ({
        scale: prev.scale,
        x: Math.round(cw / 2 - targetGraphX * prev.scale),
        y: Math.round(ch / 2 - targetGraphY * prev.scale),
      }));
      setTimeout(() => setIsAnimating(false), 380);
    };

    return (
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden select-none stage-grid-bg bg-[var(--bg-stage-grid)]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ touchAction: 'none' }}
      >
        {/* -------------------------------------------------------------------
            1. Primary Interactive SVG Graph Stage
            ------------------------------------------------------------------- */}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          style={{ willChange: 'transform' }}
        >
          <defs>
            {/* Edge Hot Path & Default Arrowhead Markers */}
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="rgba(138, 180, 248, 0.45)" />
            </marker>

            <marker
              id="arrow-hot"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#4285F4" />
            </marker>

            <marker
              id="arrow-selected"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#8AB4F8" />
            </marker>

            {/* Glowing filter for hot paths and active selections */}
            <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Root Transform Group with Hardware Accelerated CSS Smooth Transition */}
          <g
            data-stage-inner="true"
            transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
            style={{
              transition: isAnimating
                ? 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                : 'none',
              transformOrigin: '0 0',
            }}
          >
            {/* -----------------------------------------------------------------
                A. Subsystem Cluster Hulls
                ----------------------------------------------------------------- */}
            <g id="subsystem-hulls">
              {hulls.map((hull) => {
                const subColor = hull.subsystem.color || '#2563eb';
                return (
                  <g key={hull.subsystem.id} className="transition-opacity duration-300">
                    {/* Bounding Hull Rounded Fill */}
                    <rect
                      x={hull.x}
                      y={hull.y}
                      width={hull.width}
                      height={hull.height}
                      rx={24}
                      ry={24}
                      fill={subColor}
                      fillOpacity={0.045}
                      stroke={subColor}
                      strokeOpacity={0.32}
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                    />

                    {/* Subsystem Header Tagline Bar */}
                    <g transform={`translate(${hull.x + 20}, ${hull.y + 14})`}>
                      <rect
                        x={0}
                        y={0}
                        width={Math.min(
                          hull.width - 40,
                          Math.max(160, hull.subsystem.name.length * 8 + 70)
                        )}
                        height={26}
                        rx={13}
                        ry={13}
                        fill="#080A0E"
                        stroke={subColor}
                        strokeOpacity={0.4}
                        strokeWidth={1}
                      />
                      <circle cx={13} cy={13} r={4.5} fill={subColor} />
                      <text
                        x={25}
                        y={17}
                        fill="#F1F3F4"
                        fontSize={11}
                        fontWeight="600"
                        fontFamily="var(--font-mono, monospace)"
                        letterSpacing="0.02em"
                      >
                        {hull.subsystem.name.toUpperCase()}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>

            {/* -----------------------------------------------------------------
                B. Curved Cubic Bezier Edges
                ----------------------------------------------------------------- */}
            <g id="dependency-edges">
              {(blueprint.edges || []).map((edge) => {
                const src = nodeMap.get(edge.source);
                const tgt = nodeMap.get(edge.target);
                if (!src || !tgt) return null;

                const { path, midX, midY } = buildCurvedEdgePath(src, tgt);

                const isConnected =
                  selectedNodeId === edge.source ||
                  selectedNodeId === edge.target ||
                  focusedNodeId === edge.source ||
                  focusedNodeId === edge.target;

                const isHot = Boolean(edge.isHotPath);

                const strokeColor = isConnected
                  ? 'var(--cobalt-ice)'
                  : isHot
                    ? '#4285F4'
                    : 'var(--svg-edge-stroke)';

                const strokeWidth = isConnected ? 2.5 : isHot ? 2.2 : 1.2;
                const markerEnd = isConnected
                  ? 'url(#arrow-selected)'
                  : isHot
                    ? 'url(#arrow-hot)'
                    : 'url(#arrow-default)';

                return (
                  <g key={edge.id} className="group">
                    {/* Underlying wider hit-area path */}
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      className="cursor-pointer"
                    />

                    {/* Visible Edge Path */}
                    <path
                      d={path}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeOpacity={isConnected ? 0.95 : isHot ? 0.85 : 0.4}
                      markerEnd={markerEnd}
                      className={isHot ? 'edge-flow-animated' : undefined}
                      filter={isConnected || isHot ? 'url(#glow-filter)' : undefined}
                    />

                    {/* Edge Midpoint Label / Hot Path Pill */}
                    {(edge.label || isHot) && (
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect
                          x={-45}
                          y={-10}
                          width={90}
                          height={20}
                          rx={10}
                          ry={10}
                          fill="#080A0E"
                          stroke={isHot ? 'rgba(66, 133, 244, 0.5)' : 'rgba(255, 255, 255, 0.12)'}
                          strokeWidth={1}
                        />
                        <text
                          x={0}
                          y={3.5}
                          textAnchor="middle"
                          fill={isHot ? '#8AB4F8' : '#9AA0A6'}
                          fontSize={9}
                          fontWeight="600"
                          fontFamily="var(--font-mono, monospace)"
                        >
                          {isHot ? '⚡ HOT PATH' : edge.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>

            {/* -----------------------------------------------------------------
                C. Interactive Node Cards
                ----------------------------------------------------------------- */}
            <g id="positioned-nodes">
              {positionedNodes.map((pn) => {
                const isSelected = selectedNodeId === pn.node.id;
                const isFocused = focusedNodeId === pn.node.id;
                const searchMatch = visualSearchMap.get(pn.node.id);

                // X-Ray overlay computation for active pillar
                const xrayAudit = xrayModuleMap.get(pn.node.id);
                const xrayCell = xrayOverlayPillar
                  ? xrayAudit?.cells?.[xrayOverlayPillar]
                  : null;

                const healthProb = xrayCell?.probabilityHealthy ?? null;
                const isXRayActive = xrayOverlayPillar !== null;

                // Color accent calculation
                const baseColor = pn.color || '#1A73E8';

                let riskBorderClass = 'border-[var(--border-card)]';
                let riskHaloStyle: React.CSSProperties = {};

                if (isXRayActive && healthProb !== null) {
                  if (healthProb < 0.6) {
                    riskBorderClass = 'border-[var(--vermilion)]';
                    riskHaloStyle = {
                      boxShadow: '0 0 22px rgba(255, 90, 79, 0.45)',
                    };
                  } else if (healthProb < 0.8) {
                    riskBorderClass = 'border-[var(--amber)]';
                    riskHaloStyle = {
                      boxShadow: '0 0 18px rgba(251, 191, 36, 0.35)',
                    };
                  } else {
                    riskBorderClass = 'border-[var(--emerald)]';
                    riskHaloStyle = {
                      boxShadow: '0 0 14px rgba(52, 211, 153, 0.25)',
                    };
                  }
                } else if (searchMatch) {
                  riskBorderClass = 'border-[var(--cobalt-ice)] ring-2 ring-[var(--cobalt-ice)]';
                  riskHaloStyle = {
                    boxShadow: '0 0 24px rgba(138, 180, 248, 0.55)',
                  };
                } else if (isSelected) {
                  riskBorderClass = 'border-[var(--cobalt-core)] ring-2 ring-[var(--cobalt-core)]';
                  riskHaloStyle = {
                    boxShadow: 'var(--cobalt-glow)',
                  };
                }

                return (
                  <foreignObject
                    key={pn.node.id}
                    x={pn.x}
                    y={pn.y}
                    width={pn.width}
                    height={pn.height}
                    className="overflow-visible"
                  >
                    <div
                      data-node-card="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectNode(pn.node.id);
                      }}
                      style={{
                        width: `${pn.width}px`,
                        height: `${pn.height}px`,
                        ...riskHaloStyle,
                      }}
                      className={`group relative flex flex-col justify-between p-3 rounded-xl border bg-[var(--bg-card)]/95 backdrop-blur-md cursor-pointer transition-all duration-200 select-none ${riskBorderClass} ${
                        isSelected
                          ? 'scale-[1.03] z-30'
                          : isFocused
                            ? 'scale-[1.02] ring-2 ring-[var(--cobalt-ice)] z-20'
                            : 'hover:scale-[1.02] hover:border-[var(--cobalt-border)] hover:bg-[var(--bg-card-elevated)] z-10'
                      }`}
                    >
                      {/* Top Bar: Layer & Kind Chip + Quick Peek File Button */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: baseColor }}
                          />
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-muted)] truncate">
                            {pn.node.kind || pn.node.layer}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Visual Search Match Pill */}
                          {searchMatch && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)]">
                              {Math.round(searchMatch.similarity * 100)}%
                            </span>
                          )}

                          {/* Peek Source File Button */}
                          <button
                            type="button"
                            title={`Peek file: ${pn.node.primaryFile}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onPeekFile(pn.node.primaryFile, pn.node.lineStart);
                            }}
                            className="p-1 rounded-md text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
                          >
                            <FileCode className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Center: Module Label & Subtitle */}
                      <div className="my-1 min-w-0">
                        <h4 className="text-xs font-bold text-[var(--ink-primary)] truncate font-mono group-hover:text-[var(--cobalt-mist)] transition-colors">
                          {pn.node.label}
                        </h4>
                        {pn.node.subtitle && (
                          <p className="text-[11px] text-[var(--ink-secondary)] truncate leading-tight mt-0.5">
                            {pn.node.subtitle}
                          </p>
                        )}
                      </div>

                      {/* Bottom Footer: Centrality/Tokens or X-Ray Pillar Badge */}
                      <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--ink-muted)]">
                        {isXRayActive && healthProb !== null ? (
                          <div className="flex items-center gap-1.5 w-full justify-between">
                            <span className="text-[9px] uppercase tracking-wider text-[var(--ink-secondary)]">
                              {xrayOverlayPillar}
                            </span>
                            <span
                              className={`font-semibold ${
                                healthProb < 0.6
                                  ? 'text-[var(--vermilion)]'
                                  : healthProb < 0.8
                                    ? 'text-[var(--amber)]'
                                    : 'text-[var(--emerald)]'
                              }`}
                            >
                              {Math.round(healthProb * 100)}%
                            </span>
                          </div>
                        ) : (
                          <>
                            <span className="truncate">
                              {pn.node.keySymbols?.[0]
                                ? `ƒ ${pn.node.keySymbols[0]}`
                                : `${pn.node.estimatedTokens || 0} tokens`}
                            </span>
                            <span className="shrink-0 text-[9px] text-[var(--ink-muted)]">
                              in:{pn.node.fanIn} out:{pn.node.fanOut}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </foreignObject>
                );
              })}
            </g>
          </g>
        </svg>

        {/* -------------------------------------------------------------------
            2. Top Control HUD Bar (Zoom, Fit, Circle-to-Explain, X-Ray)
            ------------------------------------------------------------------- */}
        <div
          data-control-panel="true"
          className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 pointer-events-auto"
        >
          {/* Zoom / Camera Controls */}
          <div className="flex items-center rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)]/90 backdrop-blur-md shadow-[var(--shadow-card)] p-1 gap-1">
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-2 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
              title="Zoom In (+)"
              aria-label="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-2 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
              title="Zoom Out (-)"
              aria-label="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="h-4 w-px bg-[var(--border-subtle)]" />
            <button
              type="button"
              onClick={() => fitView(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
              title="Fit Entire Graph into View"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Fit</span>
            </button>
          </div>

          {/* Circle-to-Explain Lasso Trigger */}
          <button
            type="button"
            onClick={() => setCircleExplainActive((prev) => !prev)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border backdrop-blur-md transition-all shadow-[var(--shadow-card)] ${
              circleExplainActive
                ? 'bg-[var(--cobalt-core)] border-[var(--cobalt-ice)] text-white shadow-[var(--cobalt-glow)]'
                : 'bg-[var(--bg-card)]/90 border-[var(--cobalt-border)] text-[var(--cobalt-ice)] hover:bg-[var(--bg-card-elevated)]'
            }`}
            title="Circle-to-Explain Freehand Multimodal Lasso"
          >
            <Sparkles className="w-4 h-4 text-inherit" />
            <span>{circleExplainActive ? 'Lasso Active (Esc)' : 'Circle to Explain'}</span>
          </button>

          {/* X-Ray Risk Overlay Pillar Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowXRayDropdown((prev) => !prev)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border backdrop-blur-md transition-all shadow-[var(--shadow-card)] ${
                xrayOverlayPillar
                  ? 'bg-[var(--bg-card-elevated)] border-[var(--cobalt-border-strong)] text-[var(--cobalt-ice)]'
                  : 'bg-[var(--bg-card)]/90 border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-card-elevated)]'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-[var(--amber)]" />
              <span className="font-mono text-xs">
                {xrayOverlayPillar
                  ? `X-Ray: ${
                      XRAY_PILLARS.find((p) => p.id === xrayOverlayPillar)?.label ||
                      xrayOverlayPillar
                    }`
                  : 'X-Ray Overlay'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>

            {showXRayDropdown && (
              <div className="absolute top-full left-0 mt-2 w-56 rounded-xl border border-[var(--cobalt-border)] bg-[var(--bg-card-elevated)]/95 backdrop-blur-2xl shadow-[var(--shadow-card)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    onChangeXRayOverlay(null);
                    setShowXRayDropdown(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center justify-between ${
                    xrayOverlayPillar === null
                      ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] font-semibold'
                      : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  <span>None (Default)</span>
                  {xrayOverlayPillar === null && <span className="text-[10px]">✓</span>}
                </button>

                <div className="h-px bg-[var(--border-subtle)] my-1" />

                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {XRAY_PILLARS.map((p) => {
                    const avgScore = blueprint.xray?.pillarAverages?.[p.id];
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onChangeXRayOverlay(p.id);
                          setShowXRayDropdown(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center justify-between ${
                          xrayOverlayPillar === p.id
                            ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] font-semibold'
                            : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        <span>{p.label}</span>
                        {avgScore !== undefined && (
                          <span
                            className={`text-[10px] font-bold ${
                              avgScore < 60
                                ? 'text-[var(--vermilion)]'
                                : avgScore < 80
                                  ? 'text-[var(--amber)]'
                                  : 'text-[var(--emerald)]'
                            }`}
                          >
                            {Math.round(avgScore)}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* -------------------------------------------------------------------
            3. Floating Bottom-Left Minimap
            ------------------------------------------------------------------- */}
        <div
          data-control-panel="true"
          className="absolute bottom-5 left-5 z-20 pointer-events-auto"
        >
          <div className="p-2 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)]/90 backdrop-blur-md shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between pb-1.5 px-1">
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-medium text-[var(--ink-muted)]">
                <Compass className="w-3 h-3 text-[var(--cobalt-ice)]" />
                <span>SPATIAL RADAR</span>
              </div>
              <button
                type="button"
                onClick={() => setMinimapMinimized((prev) => !prev)}
                className="text-[10px] font-mono text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]"
              >
                {minimapMinimized ? 'EXPAND' : 'COLLAPSE'}
              </button>
            </div>

            {!minimapMinimized && (
              <div
                style={{ width: `${minimapWidth}px`, height: `${minimapHeight}px` }}
                className="relative rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-void)] cursor-crosshair"
              >
                <svg
                  width={minimapWidth}
                  height={minimapHeight}
                  onClick={handleMinimapClick}
                  className="w-full h-full block"
                >
                  {/* Mini Cluster Hulls */}
                  {hulls.map((hull) => (
                    <rect
                      key={hull.subsystem.id}
                      x={hull.x * minimapScale}
                      y={hull.y * minimapScale}
                      width={hull.width * minimapScale}
                      height={hull.height * minimapScale}
                      fill={hull.subsystem.color || '#2563eb'}
                      fillOpacity={0.12}
                    />
                  ))}

                  {/* Mini Nodes */}
                  {positionedNodes.map((pn) => (
                    <rect
                      key={pn.node.id}
                      x={pn.x * minimapScale}
                      y={pn.y * minimapScale}
                      width={Math.max(2, pn.width * minimapScale)}
                      height={Math.max(2, pn.height * minimapScale)}
                      rx={1}
                      fill={
                        selectedNodeId === pn.node.id
                          ? '#8AB4F8'
                          : pn.color || '#1A73E8'
                      }
                      fillOpacity={selectedNodeId === pn.node.id ? 1.0 : 0.75}
                    />
                  ))}

                  {/* Current Camera Viewport Rect */}
                  <rect
                    x={viewportRect.x}
                    y={viewportRect.y}
                    width={viewportRect.width}
                    height={viewportRect.height}
                    fill="rgba(66, 133, 244, 0.12)"
                    stroke="#8AB4F8"
                    strokeWidth={1.5}
                    rx={2}
                  />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* -------------------------------------------------------------------
            4. Circle-to-Explain Multimodal Spatial Lasso Overlay
            ------------------------------------------------------------------- */}
        <CircleToExplainOverlay
          active={circleExplainActive}
          repoId={blueprint.repoId}
          positionedNodes={positionedNodes}
          viewportTransform={transform}
          captureCanvasPng={capturePngBase64}
          onClose={() => setCircleExplainActive(false)}
          onSelectFile={(filePath, lineStart) => onPeekFile(filePath, lineStart)}
        />
      </div>
    );
  }
);

AtlasGraphCanvas.displayName = 'AtlasGraphCanvas';

export default AtlasGraphCanvas;
