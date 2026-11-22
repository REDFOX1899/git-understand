'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type {
  VisualAtlasBlueprint,
  AtlasNode,
  AtlasEdge,
  ArchitectureLayer,
  StratumLayer,
} from '@shared/types';

// =============================================================================
// Interfaces & Types
// =============================================================================

export interface CobaltTopology3DProps {
  blueprint?: VisualAtlasBlueprint | null;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  activeLayer?: ArchitectureLayer | 'all';
  className?: string;
  height?: number | string;
  showControls?: boolean;
  interactive?: boolean;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
  z: number; // depth
  scale: number;
  visible: boolean;
}

interface ConstellationNode {
  id: string;
  label: string;
  subtitle: string;
  layer: ArchitectureLayer;
  kind: string;
  stratumIndex: number; // 0: Top (Client/Edge), 1: Mid (Orchestration/Domain), 2: Base (Infra/Data)
  pos: Point3D;
  centrality: number;
  tokens: number;
  riskScore: number;
  primaryFile?: string;
  fanIn: number;
  fanOut: number;
  accentColor: string;
}

interface ConstellationEdge {
  id: string;
  source: string;
  target: string;
  sourceNode: ConstellationNode;
  targetNode: ConstellationNode;
  weight: number;
  isHotPath: boolean;
  kind: string;
}

interface SignalPulse {
  edgeId: string;
  sourceNode: ConstellationNode;
  targetNode: ConstellationNode;
  progress: number; // 0..1
  speed: number;
  color: string;
  size: number;
  intensity: number;
}

interface RippleRing {
  pos: Point3D;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

interface RenderableItem {
  type: 'plane' | 'pillar' | 'edge' | 'node' | 'pulse' | 'ripple';
  depth: number;
  render: (ctx: CanvasRenderingContext2D, theme: CanvasTheme) => void;
}

interface CanvasTheme {
  isDark: boolean;
  bgVoid: string;
  bgCard: string;
  bgElevated: string;
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  cobaltCore: string;
  cobaltBright: string;
  cobaltIce: string;
  cobaltMist: string;
  cobaltTint: string;
  cobaltTintStrong: string;
  borderSubtle: string;
  borderStrong: string;
  emerald: string;
  amber: string;
  vermilion: string;
}

// =============================================================================
// Stratum Definitions (3 Translucent Strata Stack)
// =============================================================================

const STRATA_META = [
  {
    index: 0,
    title: 'Presentation & Edge Runtime',
    code: 'STRATA-1',
    description: 'Client UI, SSR Route Handlers & Edge Ingress',
    layers: ['client', 'edge'] as ArchitectureLayer[],
    baseY: -130,
    accentHex: '#4285F4', // Cobalt Bright
  },
  {
    index: 1,
    title: 'Domain & Gemini Orchestration',
    code: 'STRATA-2',
    description: 'Workflows, Decision-1 Matrices & Synthesis Engines',
    layers: ['orchestration', 'domain'] as ArchitectureLayer[],
    baseY: 0,
    accentHex: '#2DD4BF', // Teal Layer
  },
  {
    index: 2,
    title: 'Storage, Vector & Foundations',
    code: 'STRATA-3',
    description: 'Postgres Vector, Cache, Cloud Run & Pipeline I/O',
    layers: ['infrastructure', 'data', 'tooling'] as ArchitectureLayer[],
    baseY: 130,
    accentHex: '#818CF8', // Indigo Layer
  },
];

// Fallback Mock Topology for immediate zero-latency preview
const FALLBACK_NODES: Omit<ConstellationNode, 'pos'>[] = [
  // Strata 1: Client & Edge
  {
    id: 'studio-ui',
    label: 'Studio Canvas Hub',
    subtitle: 'Next.js 15 Client App',
    layer: 'client',
    kind: 'ui',
    stratumIndex: 0,
    centrality: 0.92,
    tokens: 42000,
    riskScore: 0.12,
    primaryFile: 'studio/src/app/page.tsx',
    fanIn: 3,
    fanOut: 4,
    accentColor: '#4285F4',
  },
  {
    id: 'edge-router',
    label: 'Edge Gateway & Auth',
    subtitle: 'Vercel Edge Proxy',
    layer: 'edge',
    kind: 'api',
    stratumIndex: 0,
    centrality: 0.85,
    tokens: 18000,
    riskScore: 0.18,
    primaryFile: 'studio/src/middleware.ts',
    fanIn: 2,
    fanOut: 3,
    accentColor: '#38BDF8',
  },
  {
    id: 'voice-stage',
    label: 'Gemini 3.8 Live Stage',
    subtitle: 'Audio/Video Ingress',
    layer: 'client',
    kind: 'agent',
    stratumIndex: 0,
    centrality: 0.78,
    tokens: 28000,
    riskScore: 0.22,
    primaryFile: 'studio/src/components/LiveVoiceStage.tsx',
    fanIn: 1,
    fanOut: 2,
    accentColor: '#8AB4F8',
  },
  // Strata 2: Domain & Orchestrator
  {
    id: 'atlas-architect',
    label: 'Atlas Architect Engine',
    subtitle: 'Gemini 4 Argon Core',
    layer: 'orchestration',
    kind: 'service',
    stratumIndex: 1,
    centrality: 0.98,
    tokens: 65000,
    riskScore: 0.15,
    primaryFile: 'backend/src/services/atlas.ts',
    fanIn: 5,
    fanOut: 6,
    accentColor: '#2DD4BF',
  },
  {
    id: 'xray-engine',
    label: 'Decision-1 X-Ray Matrix',
    subtitle: 'Calibrated Health Audit',
    layer: 'domain',
    kind: 'pipeline',
    stratumIndex: 1,
    centrality: 0.88,
    tokens: 41000,
    riskScore: 0.25,
    primaryFile: 'backend/src/services/xray.ts',
    fanIn: 4,
    fanOut: 3,
    accentColor: '#34D399',
  },
  {
    id: 'digest-slicer',
    label: 'Token Digest Slicer',
    subtitle: 'Tree AST & Context Window',
    layer: 'domain',
    kind: 'module',
    stratumIndex: 1,
    centrality: 0.74,
    tokens: 32000,
    riskScore: 0.1,
    primaryFile: 'backend/src/services/digest.ts',
    fanIn: 2,
    fanOut: 2,
    accentColor: '#1A73E8',
  },
  // Strata 3: Infra & Data
  {
    id: 'vector-store',
    label: 'Gemini Embedding Index',
    subtitle: 'gemini-embedding-2 Vault',
    layer: 'data',
    kind: 'store',
    stratumIndex: 2,
    centrality: 0.82,
    tokens: 24000,
    riskScore: 0.14,
    primaryFile: 'backend/src/db/vector.ts',
    fanIn: 4,
    fanOut: 1,
    accentColor: '#818CF8',
  },
  {
    id: 'github-stream',
    label: 'Octokit Tarball Ingest',
    subtitle: 'Stream Pipeline Cache',
    layer: 'infrastructure',
    kind: 'external',
    stratumIndex: 2,
    centrality: 0.79,
    tokens: 19500,
    riskScore: 0.3,
    primaryFile: 'backend/src/ingestion/github.ts',
    fanIn: 3,
    fanOut: 2,
    accentColor: '#A8C7FA',
  },
  {
    id: 'media-synthesizer',
    label: 'Multimodal Media Stage',
    subtitle: 'Omni & Flash Audio/Reels',
    layer: 'tooling',
    kind: 'pipeline',
    stratumIndex: 2,
    centrality: 0.65,
    tokens: 21000,
    riskScore: 0.2,
    primaryFile: 'backend/src/services/media.ts',
    fanIn: 2,
    fanOut: 1,
    accentColor: '#FBBF24',
  },
];

const FALLBACK_EDGES: Array<[string, string, number, boolean, string]> = [
  ['studio-ui', 'edge-router', 3, true, 'http'],
  ['studio-ui', 'atlas-architect', 5, true, 'control'],
  ['edge-router', 'atlas-architect', 4, true, 'stream'],
  ['voice-stage', 'atlas-architect', 3, false, 'stream'],
  ['atlas-architect', 'xray-engine', 4, true, 'data'],
  ['atlas-architect', 'digest-slicer', 3, false, 'data'],
  ['atlas-architect', 'vector-store', 4, true, 'storage'],
  ['digest-slicer', 'vector-store', 2, false, 'storage'],
  ['xray-engine', 'vector-store', 3, false, 'storage'],
  ['github-stream', 'digest-slicer', 4, true, 'stream'],
  ['atlas-architect', 'media-synthesizer', 2, false, 'control'],
];

// =============================================================================
// Helper Functions for 3D Math & Projection
// =============================================================================

function project3D(
  p: Point3D,
  rotX: number,
  rotY: number,
  cameraDistance: number,
  zoom: number,
  cx: number,
  cy: number
): ProjectedPoint {
  // 1. Rotate Y (yaw)
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const x1 = p.x * cosY + p.z * sinY;
  const z1 = -p.x * sinY + p.z * cosY;
  const y1 = p.y;

  // 2. Rotate X (pitch)
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const y2 = y1 * cosX - z1 * sinX;
  const z2 = y1 * sinX + z1 * cosX;
  const x2 = x1;

  // 3. Perspective camera projection
  const zCam = z2 + cameraDistance;
  if (zCam < 30) {
    return { x: cx, y: cy, z: z2, scale: 0.1, visible: false };
  }

  const fov = 750;
  const scale = (fov / zCam) * zoom;
  const screenX = cx + x2 * scale;
  const screenY = cy + y2 * scale;

  return {
    x: screenX,
    y: screenY,
    z: z2,
    scale,
    visible: true,
  };
}

function resolveCanvasTheme(): CanvasTheme {
  if (typeof window === 'undefined') {
    return {
      isDark: true,
      bgVoid: '#000000',
      bgCard: '#080A0E',
      bgElevated: '#0E1218',
      inkPrimary: '#F1F3F4',
      inkSecondary: '#9AA0A6',
      inkMuted: '#6E747B',
      cobaltCore: '#1A73E8',
      cobaltBright: '#4285F4',
      cobaltIce: '#8AB4F8',
      cobaltMist: '#A8C7FA',
      cobaltTint: 'rgba(26, 115, 232, 0.14)',
      cobaltTintStrong: 'rgba(26, 115, 232, 0.24)',
      borderSubtle: 'rgba(255, 255, 255, 0.08)',
      borderStrong: 'rgba(255, 255, 255, 0.18)',
      emerald: '#34D399',
      amber: '#FBBF24',
      vermilion: '#FF5A4F',
    };
  }

  const rootStyle = getComputedStyle(document.documentElement);
  const cs = rootStyle.colorScheme || '';
  const isDark = cs.includes('dark') || !cs.includes('light');

  return {
    isDark,
    bgVoid: rootStyle.getPropertyValue('--bg-void').trim() || (isDark ? '#000000' : '#F8F9FA'),
    bgCard: rootStyle.getPropertyValue('--bg-card').trim() || (isDark ? '#080A0E' : '#FFFFFF'),
    bgElevated:
      rootStyle.getPropertyValue('--bg-card-elevated').trim() || (isDark ? '#0E1218' : '#F1F3F4'),
    inkPrimary:
      rootStyle.getPropertyValue('--ink-primary').trim() || (isDark ? '#F1F3F4' : '#111827'),
    inkSecondary:
      rootStyle.getPropertyValue('--ink-secondary').trim() || (isDark ? '#9AA0A6' : '#4B5563'),
    inkMuted: rootStyle.getPropertyValue('--ink-muted').trim() || (isDark ? '#6E747B' : '#6B7280'),
    cobaltCore: rootStyle.getPropertyValue('--cobalt-core').trim() || '#1A73E8',
    cobaltBright: rootStyle.getPropertyValue('--cobalt-bright').trim() || '#4285F4',
    cobaltIce: rootStyle.getPropertyValue('--cobalt-ice').trim() || (isDark ? '#8AB4F8' : '#0B57D0'),
    cobaltMist: rootStyle.getPropertyValue('--cobalt-mist').trim() || '#A8C7FA',
    cobaltTint:
      rootStyle.getPropertyValue('--cobalt-tint').trim() ||
      (isDark ? 'rgba(26, 115, 232, 0.14)' : 'rgba(26, 115, 232, 0.08)'),
    cobaltTintStrong:
      rootStyle.getPropertyValue('--cobalt-tint-strong').trim() ||
      (isDark ? 'rgba(26, 115, 232, 0.24)' : 'rgba(26, 115, 232, 0.14)'),
    borderSubtle:
      rootStyle.getPropertyValue('--border-subtle').trim() ||
      (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.09)'),
    borderStrong:
      rootStyle.getPropertyValue('--border-strong').trim() ||
      (isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(15, 23, 42, 0.20)'),
    emerald: rootStyle.getPropertyValue('--emerald').trim() || (isDark ? '#34D399' : '#059669'),
    amber: rootStyle.getPropertyValue('--amber').trim() || (isDark ? '#FBBF24' : '#D97706'),
    vermilion: rootStyle.getPropertyValue('--vermilion').trim() || (isDark ? '#FF5A4F' : '#DC2626'),
  };
}

// Map any architecture layer to one of the 3 canonical strata tiers
function getStratumTier(layer: ArchitectureLayer): number {
  switch (layer) {
    case 'client':
    case 'edge':
      return 0;
    case 'orchestration':
    case 'domain':
      return 1;
    case 'infrastructure':
    case 'data':
    case 'tooling':
    default:
      return 2;
  }
}

// =============================================================================
// Main Component: CobaltTopology3D
// =============================================================================

export function CobaltTopology3D({
  blueprint,
  selectedNodeId,
  onSelectNode,
  activeLayer = 'all',
  className = '',
  height = 540,
  showControls = true,
  interactive = true,
}: CobaltTopology3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Camera & Interaction State
  const [rotX, setRotX] = useState<number>(0.42); // Hero isometric pitch ~24deg
  const [rotY, setRotY] = useState<number>(-0.55); // Hero isometric yaw ~-31deg
  const [zoom, setZoom] = useState<number>(1.0);
  const [explosion, setExplosion] = useState<number>(1.0); // 1.0 normal, up to 1.8 exploded
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(true);
  const [hoveredNode, setHoveredNode] = useState<ConstellationNode | null>(null);
  const [fps, setFps] = useState<number>(60);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [filterStratum, setFilterStratum] = useState<number | 'all'>('all');

  // Animation Refs (to avoid re-renders inside 60fps loop)
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const fpsFramesRef = useRef<number>(0);
  const fpsTimeRef = useRef<number>(performance.now());

  // Dragging interaction state
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; rotX: number; rotY: number }>({
    x: 0,
    y: 0,
    rotX: 0.42,
    rotY: -0.55,
  });
  const velRotXRef = useRef<number>(0);
  const velRotYRef = useRef<number>(0);

  // Dynamic Pulses & Ripple rings state ref (persistent across frames)
  const pulsesRef = useRef<SignalPulse[]>([]);
  const ripplesRef = useRef<RippleRing[]>([]);
  const projectedNodesRef = useRef<Map<string, { screenX: number; screenY: number; radius: number; node: ConstellationNode }>>(
    new Map()
  );

  // Detect Reduced Motion preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    if (mediaQuery.matches) {
      setIsAutoRotating(false);
    }

    const handler = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
      if (e.matches) setIsAutoRotating(false);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Build Node and Edge Constellation Models from blueprint or fallback
  const { nodes, edges } = useMemo(() => {
    const rawNodes: AtlasNode[] = blueprint?.nodes?.length ? blueprint.nodes : [];
    const rawEdges: AtlasEdge[] = blueprint?.edges?.length ? blueprint.edges : [];

    let constellationNodes: ConstellationNode[] = [];

    if (rawNodes.length > 0) {
      // Group nodes by stratum tier (0, 1, 2)
      const strataBuckets: AtlasNode[][] = [[], [], []];
      for (const n of rawNodes) {
        const tier = getStratumTier(n.layer);
        strataBuckets[tier].push(n);
      }

      const planeRadius = 180;

      for (let tier = 0; tier < 3; tier++) {
        const bucket = strataBuckets[tier];
        const count = bucket.length;

        bucket.forEach((node, idx) => {
          // Distribute in a golden ratio / concentric spiral or circle on the stratum plane
          let x = 0;
          let z = 0;

          if (count === 1) {
            x = 0;
            z = 0;
          } else {
            const angle = (idx / count) * Math.PI * 2 + tier * 0.45;
            const r = count > 4 ? planeRadius * (0.4 + 0.55 * ((idx % 3) / 2)) : planeRadius * 0.65;
            x = Math.cos(angle) * r;
            z = Math.sin(angle) * r;
          }

          const accent =
            tier === 0 ? '#4285F4' : tier === 1 ? '#2DD4BF' : '#818CF8';

          const stratumMeta = STRATA_META[tier];
          const baseY = stratumMeta.baseY;

          const kind = node.kind || 'module';
          const centrality = typeof node.centrality === 'number' ? node.centrality : 0.5;
          const tokens = typeof node.estimatedTokens === 'number' ? node.estimatedTokens : 12000;
          const riskScore = typeof node.riskScore === 'number' ? node.riskScore : 0.15;
          const fanIn = typeof node.fanIn === 'number' ? node.fanIn : 1;
          const fanOut = typeof node.fanOut === 'number' ? node.fanOut : 1;

          const primaryFile = node.primaryFile || (node.filePaths && node.filePaths[0]) || '';

          const constNode: ConstellationNode = {
            id: node.id,
            label: node.label || node.id,
            subtitle: node.subtitle || node.layer,
            layer: node.layer,
            kind,
            stratumIndex: tier,
            pos: { x, y: baseY, z },
            centrality,
            tokens,
            riskScore,
            primaryFile,
            fanIn,
            fanOut,
            accentColor: accent,
          };
          constellationNodes.push(constNode);
        });
      }
    } else {
      // Fallback topology
      constellationNodes = FALLBACK_NODES.map((fn, idx) => {
        const tier = fn.stratumIndex;
        const tierNodes = FALLBACK_NODES.filter((n) => n.stratumIndex === tier);
        const idxInTier = tierNodes.indexOf(fn);
        const angle = (idxInTier / Math.max(tierNodes.length, 1)) * Math.PI * 2 + tier * 0.5;
        const r = tierNodes.length === 1 ? 0 : 120 + (idxInTier % 2) * 35;
        return {
          ...fn,
          pos: {
            x: Math.cos(angle) * r,
            y: STRATA_META[tier].baseY,
            z: Math.sin(angle) * r,
          },
        };
      });
    }

    const nodeMap = new Map<string, ConstellationNode>();
    for (const cn of constellationNodes) {
      nodeMap.set(cn.id, cn);
    }

    // Build Edges
    const constellationEdges: ConstellationEdge[] = [];
    if (rawEdges.length > 0) {
      for (const edge of rawEdges) {
        const sNode = nodeMap.get(edge.source);
        const tNode = nodeMap.get(edge.target);
        if (sNode && tNode) {
          constellationEdges.push({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceNode: sNode,
            targetNode: tNode,
            weight: edge.weight || 1,
            isHotPath: !!edge.isHotPath,
            kind: edge.kind || 'data',
          });
        }
      }
    } else {
      for (const [src, tgt, w, hot, k] of FALLBACK_EDGES) {
        const sNode = nodeMap.get(src);
        const tNode = nodeMap.get(tgt);
        if (sNode && tNode) {
          constellationEdges.push({
            id: `${src}->${tgt}`,
            source: src,
            target: tgt,
            sourceNode: sNode,
            targetNode: tNode,
            weight: w,
            isHotPath: hot,
            kind: k,
          });
        }
      }
    }

    return { nodes: constellationNodes, edges: constellationEdges };
  }, [blueprint]);

  // Seed signal pulses along edges
  useEffect(() => {
    if (edges.length === 0) return;
    const initialPulses: SignalPulse[] = [];
    const count = Math.min(edges.length * 2, 24);

    for (let i = 0; i < count; i++) {
      const edge = edges[i % edges.length];
      const isInterStrata = edge.sourceNode.stratumIndex !== edge.targetNode.stratumIndex;
      initialPulses.push({
        edgeId: edge.id,
        sourceNode: edge.sourceNode,
        targetNode: edge.targetNode,
        progress: (i / count) + Math.random() * 0.1,
        speed: 0.28 + Math.random() * 0.22,
        color: isInterStrata ? '#8AB4F8' : edge.isHotPath ? '#34D399' : '#1A73E8',
        size: edge.isHotPath ? 3.5 : 2.5,
        intensity: edge.isHotPath ? 1.0 : 0.75,
      });
    }

    pulsesRef.current = initialPulses;
  }, [edges]);

  // Reset or adjust auto-rotation
  const toggleAutoRotate = useCallback(() => {
    setIsAutoRotating((prev) => !prev);
  }, []);

  const handleResetCamera = useCallback(() => {
    setRotX(0.42);
    setRotY(-0.55);
    setZoom(1.0);
    setExplosion(1.0);
    velRotXRef.current = 0;
    velRotYRef.current = 0;
  }, []);

  // Pointer Drag & Tilt Controls
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!interactive) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      rotX,
      rotY,
    };
    velRotXRef.current = 0;
    velRotYRef.current = 0;
  }, [interactive, rotX, rotY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      const sensitivity = 0.0065;
      const newRotY = dragStartRef.current.rotY + dx * sensitivity;
      // Clamp pitch to avoid flipping upside down
      const rawRotX = dragStartRef.current.rotX + dy * sensitivity;
      const newRotX = Math.max(-0.25, Math.min(1.2, rawRotX));

      velRotYRef.current = dx * 0.0004;
      velRotXRef.current = dy * 0.0004;

      setRotY(newRotY);
      setRotX(newRotX);
      return;
    }

    // Hover raycast / distance check
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let closestNode: ConstellationNode | null = null;
    let minDistance = 22; // hit radius in pixels

    projectedNodesRef.current.forEach(({ screenX, screenY, radius, node }) => {
      if (filterStratum !== 'all' && node.stratumIndex !== filterStratum) return;
      if (activeLayer !== 'all' && node.layer !== activeLayer) return;

      const dist = Math.hypot(mouseX - screenX, mouseY - screenY);
      const hitRadius = Math.max(radius * 1.8, 16);
      if (dist < hitRadius && dist < minDistance) {
        minDistance = dist;
        closestNode = node;
      }
    });

    setHoveredNode(closestNode);
    canvas.style.cursor = closestNode ? 'pointer' : 'grab';
  }, [filterStratum, activeLayer]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
      isDraggingRef.current = false;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (hoveredNode && onSelectNode) {
      onSelectNode(hoveredNode.id);
    }
  }, [hoveredNode, onSelectNode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!interactive) return;
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 0.08;
    setZoom((prev) => Math.max(0.45, Math.min(2.4, prev + delta)));
  }, [interactive]);

  // =============================================================================
  // 60FPS Render Engine
  // =============================================================================

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let isRunning = true;

    const render = (now: number) => {
      if (!isRunning) return;

      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      // FPS Counter
      fpsFramesRef.current++;
      if (now - fpsTimeRef.current >= 1000) {
        setFps(fpsFramesRef.current);
        fpsFramesRef.current = 0;
        fpsTimeRef.current = now;
      }

      // Auto rotation physics & inertia dampening
      if (!isDraggingRef.current) {
        if (isAutoRotating && !reducedMotion) {
          setRotY((prev) => prev + dt * 0.18);
        } else if (Math.abs(velRotXRef.current) > 0.0001 || Math.abs(velRotYRef.current) > 0.0001) {
          setRotY((prev) => prev + velRotYRef.current);
          setRotX((prev) => Math.max(-0.25, Math.min(1.2, prev + velRotXRef.current)));
          velRotYRef.current *= 0.92;
          velRotXRef.current *= 0.92;
        }
      }

      // Dynamic canvas sizing with devicePixelRatio
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = rect.width;
      const height = rect.height;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Resolve theme tokens
      const theme = resolveCanvasTheme();

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      // Render Spatial Cobalt Radial Gradient Backdrop
      const cx = width / 2;
      const cy = height / 2 + 10;
      const gradRadius = Math.max(width, height) * 0.75;
      const radialGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, gradRadius);

      if (theme.isDark) {
        radialGrad.addColorStop(0, 'rgba(26, 115, 232, 0.12)');
        radialGrad.addColorStop(0.45, 'rgba(8, 10, 14, 0.85)');
        radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
      } else {
        radialGrad.addColorStop(0, 'rgba(26, 115, 232, 0.08)');
        radialGrad.addColorStop(0.5, 'rgba(241, 243, 244, 0.7)');
        radialGrad.addColorStop(1, 'rgba(248, 249, 250, 0.95)');
      }

      ctx.fillStyle = radialGrad;
      ctx.fillRect(0, 0, width, height);

      // Camera parameters
      const cameraDist = 800;

      // Update signal pulses along edges
      if (!reducedMotion) {
        for (const pulse of pulsesRef.current) {
          pulse.progress += pulse.speed * dt;
          if (pulse.progress >= 1.0) {
            pulse.progress = 0;
            // Spawn ripple ring at destination node
            if (ripplesRef.current.length < 18) {
              ripplesRef.current.push({
                pos: {
                  x: pulse.targetNode.pos.x,
                  y: pulse.targetNode.pos.y * explosion,
                  z: pulse.targetNode.pos.z,
                },
                radius: 4,
                maxRadius: 28,
                alpha: 0.9,
                color: pulse.color,
              });
            }
          }
        }

        // Update ripple rings
        for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
          const ring = ripplesRef.current[i];
          ring.radius += 24 * dt;
          ring.alpha -= 0.8 * dt;
          if (ring.alpha <= 0 || ring.radius >= ring.maxRadius) {
            ripplesRef.current.splice(i, 1);
          }
        }
      }

      // Collect all 3D renderable primitives for Painter's Algorithm (Depth Sort)
      const renderables: RenderableItem[] = [];

      // 1. Add 3 Strata Translucent Floor Slabs
      const planeRadius = 220;
      const cornerAngles = [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, (4 * Math.PI) / 3, (5 * Math.PI) / 3];

      for (const stratum of STRATA_META) {
        if (filterStratum !== 'all' && stratum.index !== filterStratum) continue;

        const stratumY = stratum.baseY * explosion;
        const center3D: Point3D = { x: 0, y: stratumY, z: 0 };
        const projCenter = project3D(center3D, rotX, rotY, cameraDist, zoom, cx, cy);

        // Compute 3D polygon corners of the hexagonal stratum slab
        const corners3D: Point3D[] = cornerAngles.map((a) => ({
          x: Math.cos(a) * planeRadius,
          y: stratumY,
          z: Math.sin(a) * planeRadius,
        }));

        const projCorners = corners3D.map((p) =>
          project3D(p, rotX, rotY, cameraDist, zoom, cx, cy)
        );

        renderables.push({
          type: 'plane',
          depth: projCenter.z,
          render: (renderCtx, t) => {
            // Fill translucent hexagonal slab
            renderCtx.beginPath();
            projCorners.forEach((pt, i) => {
              if (i === 0) renderCtx.moveTo(pt.x, pt.y);
              else renderCtx.lineTo(pt.x, pt.y);
            });
            renderCtx.closePath();

            // Glassmorphism translucent fill
            renderCtx.fillStyle = t.isDark
              ? 'rgba(14, 18, 24, 0.48)'
              : 'rgba(255, 255, 255, 0.65)';
            renderCtx.fill();

            // Glowing boundary wireframe
            renderCtx.lineWidth = 1.2;
            renderCtx.strokeStyle = stratum.accentHex + (t.isDark ? '44' : '66');
            renderCtx.stroke();

            // Internal subtle isometric grid lines
            renderCtx.save();
            renderCtx.beginPath();
            renderCtx.setLineDash([2, 4]);
            renderCtx.strokeStyle = t.isDark ? 'rgba(138, 180, 248, 0.12)' : 'rgba(26, 115, 232, 0.15)';
            for (let i = 0; i < projCorners.length; i += 2) {
              const pA = projCorners[i];
              const pB = projCorners[(i + 3) % projCorners.length];
              renderCtx.moveTo(pA.x, pA.y);
              renderCtx.lineTo(pB.x, pB.y);
            }
            renderCtx.stroke();
            renderCtx.restore();

            // Stratum Label Badge in 3D projection
            const badgeCorner = projCorners[0];
            renderCtx.save();
            renderCtx.font = '600 10px var(--font-mono, monospace)';
            renderCtx.fillStyle = stratum.accentHex;
            renderCtx.fillText(`${stratum.code} · ${stratum.title.toUpperCase()}`, badgeCorner.x + 8, badgeCorner.y - 6);
            renderCtx.restore();
          },
        });
      }

      // 2. Add Cobalt Prism Bounding Corner Pillars
      for (let ci = 0; ci < cornerAngles.length; ci++) {
        const a = cornerAngles[ci];
        const cornerX = Math.cos(a) * planeRadius;
        const cornerZ = Math.sin(a) * planeRadius;

        const topY = STRATA_META[0].baseY * explosion;
        const botY = STRATA_META[2].baseY * explosion;

        const pTop = project3D({ x: cornerX, y: topY, z: cornerZ }, rotX, rotY, cameraDist, zoom, cx, cy);
        const pBot = project3D({ x: cornerX, y: botY, z: cornerZ }, rotX, rotY, cameraDist, zoom, cx, cy);

        const avgDepth = (pTop.z + pBot.z) / 2;

        renderables.push({
          type: 'pillar',
          depth: avgDepth,
          render: (renderCtx, t) => {
            renderCtx.save();
            renderCtx.beginPath();
            renderCtx.setLineDash([4, 6]);
            renderCtx.strokeStyle = t.isDark ? 'rgba(66, 133, 244, 0.18)' : 'rgba(26, 115, 232, 0.22)';
            renderCtx.lineWidth = 1;
            renderCtx.moveTo(pTop.x, pTop.y);
            renderCtx.lineTo(pBot.x, pBot.y);
            renderCtx.stroke();

            // Tiny vertex beacon
            renderCtx.fillStyle = t.cobaltIce;
            renderCtx.beginPath();
            renderCtx.arc(pTop.x, pTop.y, 2, 0, Math.PI * 2);
            renderCtx.fill();
            renderCtx.beginPath();
            renderCtx.arc(pBot.x, pBot.y, 2, 0, Math.PI * 2);
            renderCtx.fill();
            renderCtx.restore();
          },
        });
      }

      // 3. Add Edges & Signal Pulses
      for (const edge of edges) {
        if (filterStratum !== 'all') {
          if (edge.sourceNode.stratumIndex !== filterStratum && edge.targetNode.stratumIndex !== filterStratum) {
            continue;
          }
        }
        if (activeLayer !== 'all') {
          if (edge.sourceNode.layer !== activeLayer && edge.targetNode.layer !== activeLayer) {
            continue;
          }
        }

        const pS = project3D(
          { x: edge.sourceNode.pos.x, y: edge.sourceNode.pos.y * explosion, z: edge.sourceNode.pos.z },
          rotX,
          rotY,
          cameraDist,
          zoom,
          cx,
          cy
        );
        const pT = project3D(
          { x: edge.targetNode.pos.x, y: edge.targetNode.pos.y * explosion, z: edge.targetNode.pos.z },
          rotX,
          rotY,
          cameraDist,
          zoom,
          cx,
          cy
        );

        if (!pS.visible || !pT.visible) continue;

        const edgeDepth = (pS.z + pT.z) / 2;
        const isInterStrata = edge.sourceNode.stratumIndex !== edge.targetNode.stratumIndex;
        const isSelectedEdge =
          selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId);

        renderables.push({
          type: 'edge',
          depth: edgeDepth,
          render: (renderCtx, t) => {
            renderCtx.save();
            renderCtx.beginPath();

            if (isInterStrata) {
              // Cubic bezier bridge between strata
              const midY = (pS.y + pT.y) / 2;
              renderCtx.moveTo(pS.x, pS.y);
              renderCtx.bezierCurveTo(pS.x, midY, pT.x, midY, pT.x, pT.y);
            } else {
              renderCtx.moveTo(pS.x, pS.y);
              renderCtx.lineTo(pT.x, pT.y);
            }

            if (isSelectedEdge) {
              renderCtx.strokeStyle = t.cobaltBright;
              renderCtx.lineWidth = 2.5;
              renderCtx.shadowColor = t.cobaltBright;
              renderCtx.shadowBlur = 8;
            } else if (edge.isHotPath) {
              renderCtx.strokeStyle = t.isDark ? 'rgba(52, 211, 153, 0.45)' : 'rgba(5, 150, 105, 0.42)';
              renderCtx.lineWidth = 1.6;
            } else {
              renderCtx.strokeStyle = t.isDark ? 'rgba(138, 180, 248, 0.22)' : 'rgba(26, 115, 232, 0.22)';
              renderCtx.lineWidth = 1.0;
            }

            renderCtx.stroke();
            renderCtx.restore();
          },
        });
      }

      // 4. Add Signal Pulses
      for (const pulse of pulsesRef.current) {
        if (filterStratum !== 'all') {
          if (
            pulse.sourceNode.stratumIndex !== filterStratum &&
            pulse.targetNode.stratumIndex !== filterStratum
          ) {
            continue;
          }
        }

        const pS = project3D(
          { x: pulse.sourceNode.pos.x, y: pulse.sourceNode.pos.y * explosion, z: pulse.sourceNode.pos.z },
          rotX,
          rotY,
          cameraDist,
          zoom,
          cx,
          cy
        );
        const pT = project3D(
          { x: pulse.targetNode.pos.x, y: pulse.targetNode.pos.y * explosion, z: pulse.targetNode.pos.z },
          rotX,
          rotY,
          cameraDist,
          zoom,
          cx,
          cy
        );

        if (!pS.visible || !pT.visible) continue;

        const isInterStrata = pulse.sourceNode.stratumIndex !== pulse.targetNode.stratumIndex;
        let px = 0;
        let py = 0;

        if (isInterStrata) {
          const tP = pulse.progress;
          const midY = (pS.y + pT.y) / 2;
          const u = 1 - tP;
          // Cubic Bezier interpolation
          px = u * u * u * pS.x + 3 * u * u * tP * pS.x + 3 * u * tP * tP * pT.x + tP * tP * tP * pT.x;
          py = u * u * u * pS.y + 3 * u * u * tP * midY + 3 * u * tP * tP * midY + tP * tP * tP * pT.y;
        } else {
          px = pS.x + (pT.x - pS.x) * pulse.progress;
          py = pS.y + (pT.y - pS.y) * pulse.progress;
        }

        const pulseDepth = pS.z + (pT.z - pS.z) * pulse.progress;

        renderables.push({
          type: 'pulse',
          depth: pulseDepth,
          render: (renderCtx) => {
            renderCtx.save();
            renderCtx.beginPath();
            renderCtx.arc(px, py, pulse.size, 0, Math.PI * 2);
            renderCtx.fillStyle = pulse.color;
            renderCtx.shadowColor = pulse.color;
            renderCtx.shadowBlur = 10;
            renderCtx.fill();
            renderCtx.restore();
          },
        });
      }

      // 5. Add Ripple Rings
      for (const ring of ripplesRef.current) {
        const pR = project3D(ring.pos, rotX, rotY, cameraDist, zoom, cx, cy);
        if (!pR.visible) continue;

        renderables.push({
          type: 'ripple',
          depth: pR.z,
          render: (renderCtx) => {
            renderCtx.save();
            renderCtx.beginPath();
            renderCtx.arc(pR.x, pR.y, ring.radius * pR.scale, 0, Math.PI * 2);
            renderCtx.strokeStyle = ring.color;
            renderCtx.globalAlpha = Math.max(0, ring.alpha);
            renderCtx.lineWidth = 1.2;
            renderCtx.stroke();
            renderCtx.restore();
          },
        });
      }

      // 6. Add Constellation Nodes
      const nextProjectedNodes = new Map<string, { screenX: number; screenY: number; radius: number; node: ConstellationNode }>();

      for (const node of nodes) {
        if (filterStratum !== 'all' && node.stratumIndex !== filterStratum) continue;
        if (activeLayer !== 'all' && node.layer !== activeLayer) continue;

        const nodePos: Point3D = {
          x: node.pos.x,
          y: node.pos.y * explosion,
          z: node.pos.z,
        };

        const proj = project3D(nodePos, rotX, rotY, cameraDist, zoom, cx, cy);
        if (!proj.visible) continue;

        const baseRadius = 7 + node.centrality * 6;
        const radius = Math.max(5, baseRadius * proj.scale);

        nextProjectedNodes.set(node.id, {
          screenX: proj.x,
          screenY: proj.y,
          radius,
          node,
        });

        const isSelected = selectedNodeId === node.id;
        const isHovered = hoveredNode?.id === node.id;

        renderables.push({
          type: 'node',
          depth: proj.z,
          render: (renderCtx, t) => {
            renderCtx.save();

            // Glow / Selection Halo
            if (isSelected || isHovered) {
              renderCtx.beginPath();
              renderCtx.arc(proj.x, proj.y, radius + 7, 0, Math.PI * 2);
              renderCtx.fillStyle = t.isDark
                ? 'rgba(66, 133, 244, 0.28)'
                : 'rgba(26, 115, 232, 0.20)';
              renderCtx.fill();

              renderCtx.strokeStyle = t.cobaltBright;
              renderCtx.lineWidth = 1.5;
              renderCtx.stroke();
            }

            // Outer Node Ring
            renderCtx.beginPath();
            renderCtx.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
            renderCtx.fillStyle = t.isDark ? '#080A0E' : '#FFFFFF';
            renderCtx.fill();

            renderCtx.lineWidth = isSelected ? 2.5 : 1.8;
            renderCtx.strokeStyle = node.accentColor;
            renderCtx.stroke();

            // Inner Core Luminous Dot
            renderCtx.beginPath();
            renderCtx.arc(proj.x, proj.y, radius * 0.42, 0, Math.PI * 2);
            renderCtx.fillStyle = node.accentColor;
            renderCtx.shadowColor = node.accentColor;
            renderCtx.shadowBlur = 8;
            renderCtx.fill();

            // Node Typography Label
            renderCtx.shadowBlur = 0;
            renderCtx.font = '600 11px var(--font-sans, sans-serif)';
            renderCtx.textAlign = 'center';
            renderCtx.textBaseline = 'top';

            // Text background pill for contrast
            const labelY = proj.y + radius + 4;
            const labelText = node.label;
            const textWidth = renderCtx.measureText(labelText).width;

            renderCtx.fillStyle = t.isDark ? 'rgba(8, 10, 14, 0.85)' : 'rgba(255, 255, 255, 0.88)';
            renderCtx.beginPath();
            renderCtx.roundRect(proj.x - textWidth / 2 - 4, labelY - 2, textWidth + 8, 16, 4);
            renderCtx.fill();

            renderCtx.fillStyle = t.inkPrimary;
            renderCtx.fillText(labelText, proj.x, labelY);

            // Subtitle / Kind
            renderCtx.font = '500 9px var(--font-mono, monospace)';
            renderCtx.fillStyle = t.inkSecondary;
            renderCtx.fillText(node.kind.toUpperCase(), proj.x, labelY + 14);

            renderCtx.restore();
          },
        });
      }

      projectedNodesRef.current = nextProjectedNodes;

      // 7. Depth Sort (Painter's Algorithm: back to front, larger depth rendered first)
      renderables.sort((a, b) => b.depth - a.depth);

      // 8. Execute all render commands
      for (const item of renderables) {
        item.render(ctx, theme);
      }

      ctx.restore();

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [
    rotX,
    rotY,
    zoom,
    explosion,
    isAutoRotating,
    reducedMotion,
    nodes,
    edges,
    filterStratum,
    activeLayer,
    selectedNodeId,
    hoveredNode,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden select-none rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      {/* 3D Web Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Hero Badge & Stratum Legend */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-pill)] border border-[var(--border-pill)] backdrop-blur-md shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[var(--cobalt-core)] animate-pulse" />
          <span className="text-xs font-semibold tracking-wider font-mono text-[var(--ink-primary)]">
            COBALT 3D TOPOLOGY PRISM
          </span>
          <span className="text-[10px] font-mono text-[var(--ink-muted)]">
            {nodes.length} nodes · {edges.length} edges · {fps} fps
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1 text-[11px] font-mono">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[rgba(66,133,244,0.12)] text-[var(--cobalt-bright)] border border-[rgba(66,133,244,0.25)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--cobalt-bright)]" /> L1 Presentation
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[rgba(45,212,191,0.12)] text-[#2DD4BF] border border-[rgba(45,212,191,0.25)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF]" /> L2 Orchestration
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[rgba(129,140,248,0.12)] text-[#818CF8] border border-[rgba(129,140,248,0.25)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#818CF8]" /> L3 Infrastructure
          </span>
        </div>
      </div>

      {/* Interactive Controls Overlay */}
      {showControls && (
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 bg-[var(--bg-pill)] border border-[var(--border-pill)] p-1.5 rounded-xl shadow-lg backdrop-blur-md">
          {/* Strata Filter Buttons */}
          <div className="flex items-center rounded-lg bg-[var(--bg-subtle)] p-0.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => setFilterStratum('all')}
              className={`px-2 py-1 rounded transition-colors ${
                filterStratum === 'all'
                  ? 'bg-[var(--cobalt-core)] text-white font-semibold'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
              title="Show all 3 Strata"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterStratum(0)}
              className={`px-2 py-1 rounded transition-colors ${
                filterStratum === 0
                  ? 'bg-[var(--cobalt-bright)] text-white font-semibold'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
              title="Filter to L1 Client & Edge"
            >
              L1
            </button>
            <button
              type="button"
              onClick={() => setFilterStratum(1)}
              className={`px-2 py-1 rounded transition-colors ${
                filterStratum === 1
                  ? 'bg-[#2DD4BF] text-black font-semibold'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
              title="Filter to L2 Domain & Orchestration"
            >
              L2
            </button>
            <button
              type="button"
              onClick={() => setFilterStratum(2)}
              className={`px-2 py-1 rounded transition-colors ${
                filterStratum === 2
                  ? 'bg-[#818CF8] text-white font-semibold'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
              title="Filter to L3 Infra & Storage"
            >
              L3
            </button>
          </div>

          <div className="w-[1px] h-5 bg-[var(--border-subtle)]" />

          {/* Explosion / Strata Spacer */}
          <button
            type="button"
            onClick={() => setExplosion((prev) => (prev > 1.3 ? 1.0 : 1.6))}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
              explosion > 1.2
                ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)] font-semibold'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
            title="Toggle Exploded Strata View"
          >
            {explosion > 1.2 ? 'Exploded (1.6x)' : 'Stack (1.0x)'}
          </button>

          {/* Auto-Rotation Toggle */}
          <button
            type="button"
            onClick={toggleAutoRotate}
            className={`p-1.5 text-xs rounded transition-colors ${
              isAutoRotating && !reducedMotion
                ? 'text-[var(--cobalt-ice)] bg-[var(--cobalt-tint)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
            title={isAutoRotating ? 'Pause Rotation' : 'Start Auto-Rotation'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isAutoRotating ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
              )}
            </svg>
          </button>

          {/* Zoom Out */}
          <button
            type="button"
            onClick={() => setZoom((prev) => Math.max(0.45, prev - 0.15))}
            className="p-1.5 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] rounded"
            title="Zoom Out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>

          {/* Zoom In */}
          <button
            type="button"
            onClick={() => setZoom((prev) => Math.min(2.4, prev + 0.15))}
            className="p-1.5 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] rounded"
            title="Zoom In"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Reset Camera */}
          <button
            type="button"
            onClick={handleResetCamera}
            className="p-1.5 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] rounded"
            title="Reset Perspective"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Hovered Node Tooltip HUD */}
      {hoveredNode && (
        <div className="absolute top-4 right-4 z-20 pointer-events-none p-3.5 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-strong)] shadow-2xl backdrop-blur-md max-w-xs transition-all duration-150">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase tracking-wider"
              style={{
                backgroundColor: `${hoveredNode.accentColor}22`,
                color: hoveredNode.accentColor,
              }}
            >
              {hoveredNode.kind}
            </span>
            <span className="text-[10px] font-mono text-[var(--ink-muted)]">
              L{hoveredNode.stratumIndex + 1} · {hoveredNode.layer}
            </span>
          </div>

          <h4 className="text-sm font-semibold text-[var(--ink-primary)] leading-tight">
            {hoveredNode.label}
          </h4>

          {hoveredNode.subtitle && (
            <p className="text-xs text-[var(--ink-secondary)] mt-0.5 line-clamp-1">
              {hoveredNode.subtitle}
            </p>
          )}

          {hoveredNode.primaryFile && (
            <div className="mt-2 text-[10px] font-mono text-[var(--cobalt-ice)] bg-[var(--cobalt-tint)] px-2 py-1 rounded truncate">
              {hoveredNode.primaryFile}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono">
            <div>
              <span className="text-[var(--ink-muted)] block">Tokens</span>
              <span className="text-[var(--ink-primary)] font-semibold">
                {Math.round(hoveredNode.tokens / 1000)}k
              </span>
            </div>
            <div>
              <span className="text-[var(--ink-muted)] block">Centrality</span>
              <span className="text-[var(--ink-primary)] font-semibold">
                {Math.round(hoveredNode.centrality * 100)}%
              </span>
            </div>
            <div>
              <span className="text-[var(--ink-muted)] block">I/O Fan</span>
              <span className="text-[var(--ink-primary)] font-semibold">
                {hoveredNode.fanIn} in / {hoveredNode.fanOut} out
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CobaltTopology3D;
