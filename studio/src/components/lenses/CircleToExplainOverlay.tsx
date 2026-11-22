'use client';

// =============================================================================
// GitUnderstand (git-understand.com) — Circle-to-Explain Multimodal Lasso
// Freehand cobalt/vermilion spatial lasso overlay over AtlasGraphCanvas.
// Encloses intersecting architectural nodes, captures viewport snapshot,
// and invokes Gemini Multimodal reasoning for instant visual dossier generation.
// =============================================================================

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import type { CircleExplainResponse } from '@shared/types';
import type { PositionedNode } from '@/lib/graphLayout';
import { postCircleExplain } from '@/lib/api';
import {
  X,
  Sparkles,
  RotateCcw,
  FileCode,
  AlertTriangle,
  Layers,
  Copy,
  Check,
  ArrowRight,
  Send,
  ShieldAlert,
  Network,
  Activity,
  Maximize2,
  Minimize2,
} from 'lucide-react';

// =============================================================================
// Props & Types
// =============================================================================

export interface CircleToExplainOverlayProps {
  active: boolean;
  repoId: string;
  positionedNodes: PositionedNode[];
  viewportTransform: { x: number; y: number; scale: number };
  captureCanvasPng: () => Promise<string | null>;
  onClose: () => void;
  onSelectFile: (filePath: string, lineStart?: number) => void;
}

interface Point2D {
  x: number;
  y: number;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// =============================================================================
// Geometric Helper Functions (Ray-casting Point-in-Polygon & Intersection)
// =============================================================================

function isPointInPolygon(px: number, py: number, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function calculatePolygonBounds(points: Point2D[]): BoundingBox {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
  };
}

function doesLassoIntersectNode(
  node: PositionedNode,
  lasso: Point2D[],
  bounds: BoundingBox,
  transform: { x: number; y: number; scale: number }
): boolean {
  const { x: vx, y: vy, scale } = transform;
  const screenX = node.x * scale + vx;
  const screenY = node.y * scale + vy;
  const screenW = node.width * scale;
  const screenH = node.height * scale;

  // AABB Fast Rejection test against lasso bounding box
  if (
    screenX + screenW < bounds.x ||
    screenX > bounds.x + bounds.width ||
    screenY + screenH < bounds.y ||
    screenY > bounds.y + bounds.height
  ) {
    return false;
  }

  // 1. Check center point
  const centerX = screenX + screenW / 2;
  const centerY = screenY + screenH / 2;
  if (isPointInPolygon(centerX, centerY, lasso)) return true;

  // 2. Check four corners of the node in screen space
  const corners: Point2D[] = [
    { x: screenX, y: screenY },
    { x: screenX + screenW, y: screenY },
    { x: screenX + screenW, y: screenY + screenH },
    { x: screenX, y: screenY + screenH },
  ];
  for (const corner of corners) {
    if (isPointInPolygon(corner.x, corner.y, lasso)) return true;
  }

  // 3. Check if any lasso vertex lies inside the node's rectangle
  for (const pt of lasso) {
    if (
      pt.x >= screenX &&
      pt.x <= screenX + screenW &&
      pt.y >= screenY &&
      pt.y <= screenY + screenH
    ) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// CircleToExplainOverlay Component
// =============================================================================

export function CircleToExplainOverlay({
  active,
  repoId,
  positionedNodes,
  viewportTransform,
  captureCanvasPng,
  onClose,
  onSelectFile,
}: CircleToExplainOverlayProps): React.ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<Point2D[]>([]);
  const [enclosedNodes, setEnclosedNodes] = useState<PositionedNode[]>([]);
  const [strokeBounds, setStrokeBounds] = useState<BoundingBox | null>(null);

  // Analysis & Interaction state
  const [question, setQuestion] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [dossier, setDossier] = useState<CircleExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Sync canvas size with container dimensions and devicePixelRatio
  const updateCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    updateCanvasDimensions();
    window.addEventListener('resize', updateCanvasDimensions);
    return () => window.removeEventListener('resize', updateCanvasDimensions);
  }, [active, updateCanvasDimensions]);

  // Handle ESC key to exit or reset lasso
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dossier || lassoPoints.length > 0) {
          handleResetLasso();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, dossier, lassoPoints.length, onClose]);

  // Redraw canvas overlay whenever points or enclosed nodes change
  const renderOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.clearRect(0, 0, width, height);

    if (lassoPoints.length < 2) return;

    // 1. Draw glowing highlight halos over enclosed nodes in viewport space
    if (enclosedNodes.length > 0) {
      ctx.save();
      for (const pNode of enclosedNodes) {
        const nx = pNode.x * viewportTransform.scale + viewportTransform.x;
        const ny = pNode.y * viewportTransform.scale + viewportTransform.y;
        const nw = pNode.width * viewportTransform.scale;
        const nh = pNode.height * viewportTransform.scale;

        // Glowing outer halo
        ctx.shadowColor = '#1A73E8';
        ctx.shadowBlur = 16;
        ctx.strokeStyle = '#8AB4F8';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(26, 115, 232, 0.16)';

        const radius = 8;
        ctx.beginPath();
        ctx.roundRect(nx - 4, ny - 4, nw + 8, nh + 8, radius);
        ctx.fill();
        ctx.stroke();

        // Node badge label
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#A8C7FA';
        ctx.font = '600 11px var(--font-mono, monospace)';
        ctx.fillText(pNode.node.label, nx, Math.max(14, ny - 8));
      }
      ctx.restore();
    }

    // 2. Draw Lasso Stroke with Cobalt-to-Vermilion Dual Glow
    ctx.save();

    // Semi-transparent interior fill
    ctx.beginPath();
    ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
    for (let i = 1; i < lassoPoints.length; i++) {
      ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
    }
    if (!isDrawing && lassoPoints.length > 2) {
      ctx.closePath();
    }
    ctx.fillStyle = 'rgba(26, 115, 232, 0.08)';
    ctx.fill();

    // Outer Glow Pass (Cobalt core)
    ctx.shadowColor = '#4285F4';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = 'rgba(66, 133, 244, 0.65)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Inner Crisp Stroke (Cobalt-ice with vermilion pulsing dashes)
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#FF5A4F';
    ctx.strokeStyle = isDrawing ? '#8AB4F8' : '#FF5A4F';
    ctx.lineWidth = 2.5;
    if (!isDrawing) {
      ctx.setLineDash([8, 4]);
    }
    ctx.stroke();

    // Head particle marker while drawing
    if (isDrawing && lassoPoints.length > 0) {
      const head = lassoPoints[lassoPoints.length - 1];
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(head.x, head.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#FF5A4F';
      ctx.shadowColor = '#FF5A4F';
      ctx.shadowBlur = 12;
      ctx.fill();
    }

    ctx.restore();
  }, [lassoPoints, enclosedNodes, isDrawing, viewportTransform]);

  useEffect(() => {
    renderOverlay();
  }, [renderOverlay]);

  // Pointer event listeners for freehand drawing
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dossier || isExplaining) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setError(null);
    setLassoPoints([{ x, y }]);
    setEnclosedNodes([]);
    setStrokeBounds(null);

    // Capture pointer to allow seamless drawing beyond canvas boundary
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setLassoPoints((prev) => {
      if (prev.length === 0) return [{ x, y }];
      const last = prev[prev.length - 1];
      const distSq = (x - last.x) ** 2 + (y - last.y) ** 2;
      // Filter micro-jitter (min 3px movement)
      if (distSq < 9) return prev;
      return [...prev, { x, y }];
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }

    if (lassoPoints.length < 5) {
      // Stroke too short; reset
      setLassoPoints([]);
      setEnclosedNodes([]);
      setStrokeBounds(null);
      return;
    }

    // Auto-close polygon loop
    const closed = [...lassoPoints, lassoPoints[0]];
    const bounds = calculatePolygonBounds(closed);
    setStrokeBounds(bounds);

    // Detect enclosed / intersecting PositionedNodes in viewport space
    const matched: PositionedNode[] = [];
    for (const pNode of positionedNodes) {
      if (
        doesLassoIntersectNode(pNode, closed, bounds, viewportTransform)
      ) {
        matched.push(pNode);
      }
    }

    setEnclosedNodes(matched);
  };

  // Reset lasso and clear visual dossier
  const handleResetLasso = () => {
    setLassoPoints([]);
    setEnclosedNodes([]);
    setStrokeBounds(null);
    setDossier(null);
    setError(null);
    setQuestion('');
    setIsMinimized(false);
  };

  // Execute Gemini Multimodal Circle-to-Explain call
  const handleExplain = async () => {
    if (enclosedNodes.length === 0 || !repoId) return;

    setIsExplaining(true);
    setError(null);

    try {
      // 1. Capture snapshot from AtlasGraphCanvas background
      let snapshotBase64: string | undefined;
      try {
        const captured = await captureCanvasPng();
        if (captured) {
          // Normalize data URI to clean base64 if needed
          snapshotBase64 = captured.replace(/^data:image\/png;base64,/, '');
        }
      } catch (err) {
        console.warn(
          '[CircleToExplainOverlay] Canvas snapshot capture failed, proceeding with AST node IDs:',
          err
        );
      }

      // 2. Invoke backend multimodal Circle-to-Explain API
      const selectedNodeIds = enclosedNodes.map((n) => n.node.id);
      const res = await postCircleExplain({
        repoId,
        selectedNodeIds,
        canvasSnapshotBase64: snapshotBase64,
        question: question.trim() || undefined,
        strokeBounds: strokeBounds || undefined,
      });

      setDossier(res);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Multimodal analysis failed';
      setError(msg);
    } finally {
      setIsExplaining(false);
    }
  };

  const handleCopyDossier = () => {
    if (!dossier) return;
    const text = [
      `# ${dossier.headline}`,
      `**Visual Summary**: ${dossier.visualSummary}`,
      `\n## Data Flow Narrative\n${dossier.dataFlowNarrative}`,
      `\n## Key Contracts\n${dossier.keyContracts.map((c) => `- ${c}`).join('\n')}`,
      `\n## Potential Risks\n${dossier.potentialRisks.map((r) => `- ⚠️ ${r}`).join('\n')}`,
      `\n## Referenced Code Files\n${dossier.referencedFiles.map((f) => `- ${f.path}${f.lineStart ? `:#L${f.lineStart}` : ''}: ${f.reason}`).join('\n')}`,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Position for the floating selection pill or visual dossier
  const promptPosition = useMemo(() => {
    if (!strokeBounds) return { top: 120, left: 32 };
    const left = Math.min(
      window.innerWidth - 440,
      Math.max(24, strokeBounds.x + strokeBounds.width + 24)
    );
    const top = Math.min(
      window.innerHeight - 380,
      Math.max(80, strokeBounds.y)
    );
    return { top, left };
  }, [strokeBounds]);

  if (!active) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-40 overflow-hidden select-none"
      style={{ pointerEvents: 'auto' }}
    >
      {/* ---------------------------------------------------------------------
          1. Freehand Lasso Canvas Layer
          --------------------------------------------------------------------- */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${
          dossier || isExplaining ? 'cursor-default' : 'cursor-crosshair'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* ---------------------------------------------------------------------
          2. Top HUD Bar: Active Status & Close
          --------------------------------------------------------------------- */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-full border border-[var(--cobalt-border)] bg-[var(--bg-card)]/90 backdrop-blur-md shadow-[var(--shadow-float)]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--cobalt-bright)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--cobalt-core)]" />
          </span>
          <span className="text-xs font-semibold tracking-wide uppercase text-[var(--cobalt-ice)] font-mono">
            Circle-to-Explain
          </span>
        </div>

        <div className="h-3.5 w-px bg-[var(--border-subtle)]" />

        <span className="text-xs text-[var(--ink-secondary)]">
          {lassoPoints.length === 0
            ? 'Draw a freehand circle or loop around any modules'
            : isDrawing
              ? 'Release to enclose'
              : `${enclosedNodes.length} module${enclosedNodes.length === 1 ? '' : 's'} circled`}
        </span>

        <div className="h-3.5 w-px bg-[var(--border-subtle)]" />

        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center h-6 w-6 rounded-full hover:bg-[var(--bg-subtle-hover)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors"
          title="Exit Lasso Mode (Esc)"
          aria-label="Exit Lasso Mode"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ---------------------------------------------------------------------
          3. Pre-Analysis Selection Action Card (Shown right after circle is closed)
          --------------------------------------------------------------------- */}
      {strokeBounds && !dossier && (
        <div
          className="absolute z-50 w-96 max-w-[calc(100vw-48px)] p-4 rounded-2xl border border-[var(--cobalt-border-strong)] bg-[var(--bg-card-elevated)]/95 backdrop-blur-xl shadow-[var(--cobalt-glow)] animate-in fade-in zoom-in-95 duration-200"
          style={{
            top: `${promptPosition.top}px`,
            left: `${promptPosition.left}px`,
          }}
        >
          {/* Card Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-card)]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--cobalt-bright)]" />
              <h3 className="text-sm font-semibold text-[var(--ink-primary)]">
                Circled Architecture Region
              </h3>
            </div>
            <button
              type="button"
              onClick={handleResetLasso}
              className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink-secondary)] flex items-center gap-1 transition-colors"
              title="Redraw circle"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Redraw</span>
            </button>
          </div>

          {/* Enclosed Module Chips */}
          <div className="my-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-muted)] mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-[var(--cobalt-ice)]" />
              <span>
                {enclosedNodes.length} Enclosed Symbol
                {enclosedNodes.length === 1 ? '' : 's'}
              </span>
            </div>

            {enclosedNodes.length === 0 ? (
              <p className="text-xs text-[var(--amber)] bg-[var(--amber-bg)] border border-[var(--amber-border)] p-2 rounded-lg">
                No architectural modules detected inside your circle. Try circling
                a larger cluster or dragging over node badges.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                {enclosedNodes.map((pNode) => (
                  <span
                    key={pNode.node.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono font-medium border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)]"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: pNode.color }}
                    />
                    <span className="truncate max-w-[140px]">
                      {pNode.node.label}
                    </span>
                    <span className="text-[10px] text-[var(--ink-muted)]">
                      ({pNode.node.layer})
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 1-Line Question Input */}
          <div className="my-3">
            <label
              htmlFor="circle-question-input"
              className="block text-[11px] font-mono text-[var(--ink-secondary)] mb-1"
            >
              Specific Focus Question (Optional)
            </label>
            <div className="relative">
              <input
                id="circle-question-input"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && enclosedNodes.length > 0) {
                    handleExplain();
                  }
                }}
                placeholder="e.g. How does auth token sync across these modules?"
                disabled={isExplaining || enclosedNodes.length === 0}
                className="w-full bg-[var(--bg-composer)] border border-[var(--border-composer)] focus:border-[var(--cobalt-ice)] focus:ring-1 focus:ring-[var(--cobalt-core)] rounded-lg px-3 py-2 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] outline-none transition-all"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-3 p-2.5 rounded-lg bg-[var(--vermilion-bg)] border border-[var(--vermilion-border)] text-xs text-[var(--vermilion)] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 text-[11px] leading-relaxed">{error}</div>
            </div>
          )}

          {/* Action Trigger Button */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleResetLasso}
              disabled={isExplaining}
              className="px-3 py-1.5 rounded-lg text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExplain}
              disabled={isExplaining || enclosedNodes.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-ink)] shadow-[var(--cobalt-glow)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isExplaining ? (
                <>
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Dossier...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Explain Enclosed Region</span>
                  <ArrowRight className="w-3 h-3" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          4. Floating Obsidian Cobalt Visual Dossier Card
          --------------------------------------------------------------------- */}
      {dossier && (
        <div
          className={`absolute z-50 transition-all duration-200 ${
            isMinimized
              ? 'bottom-6 right-6 w-80'
              : 'top-16 right-8 w-[480px] max-w-[calc(100vw-64px)] max-h-[calc(100vh-100px)]'
          } flex flex-col rounded-2xl border border-[var(--cobalt-border-strong)] bg-[var(--bg-card)]/95 backdrop-blur-2xl shadow-[var(--shadow-card)]`}
        >
          {/* Dossier Header */}
          <div className="p-4 border-b border-[var(--border-card)] flex items-start justify-between gap-3 bg-[var(--bg-card-elevated)] rounded-t-2xl">
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-xl bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] text-[var(--cobalt-bright)] mt-0.5">
                <Network className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium tracking-wide uppercase bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)]">
                    {dossier.model || 'Gemini Multimodal'}
                  </span>
                  {dossier.latencyMs > 0 && (
                    <span className="text-[10px] font-mono text-[var(--ink-muted)]">
                      {dossier.latencyMs}ms
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-bold text-[var(--ink-primary)] leading-tight">
                  {dossier.headline}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopyDossier}
                className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
                title={copied ? 'Copied to clipboard' : 'Copy dossier markdown'}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-[var(--emerald)]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsMinimized((v) => !v)}
                className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
                title={isMinimized ? 'Expand dossier' : 'Minimize dossier'}
              >
                {isMinimized ? (
                  <Maximize2 className="w-3.5 h-3.5" />
                ) : (
                  <Minimize2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={handleResetLasso}
                className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
                title="Dismiss and redraw lasso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Dossier Body (Hidden if minimized) */}
          {!isMinimized && (
            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              {/* Visual Summary Callout */}
              <div className="p-3 rounded-xl bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] text-[var(--ink-primary)] leading-relaxed">
                <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--cobalt-ice)] mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Visual Architecture Summary</span>
                </div>
                <p className="text-[13px] text-[var(--ink-primary)]">
                  {dossier.visualSummary}
                </p>
              </div>

              {/* Data Flow Narrative */}
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-muted)] mb-1.5 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[var(--cobalt-bright)]" />
                  <span>Data Flow & Component Interplay</span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)] text-[var(--ink-secondary)] leading-relaxed whitespace-pre-line text-xs font-sans">
                  {dossier.dataFlowNarrative}
                </div>
              </div>

              {/* Key Contracts */}
              {dossier.keyContracts && dossier.keyContracts.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-muted)] mb-1.5 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[var(--emerald)]" />
                    <span>Key Interfaces & Contracts</span>
                  </div>
                  <div className="space-y-1.5">
                    {dossier.keyContracts.map((contract, i) => (
                      <div
                        key={i}
                        className="px-3 py-2 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--cobalt-mist)] flex items-start gap-2"
                      >
                        <span className="text-[var(--cobalt-ice)] select-none">
                          ›
                        </span>
                        <span className="break-all">{contract}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Potential Risks & Bottlenecks */}
              {dossier.potentialRisks && dossier.potentialRisks.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--vermilion)] mb-1.5 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Potential Risks & Coupling Bottlenecks</span>
                  </div>
                  <div className="space-y-1.5">
                    {dossier.potentialRisks.map((risk, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-[var(--vermilion-bg)] border border-[var(--vermilion-border)] text-xs text-[var(--ink-primary)] flex items-start gap-2"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-[var(--vermilion)] shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{risk}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clickable Referenced Files */}
              {dossier.referencedFiles && dossier.referencedFiles.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-muted)] mb-1.5 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-[var(--amber)]" />
                    <span>Relevant Source Code Files</span>
                  </div>
                  <div className="space-y-1">
                    {dossier.referencedFiles.map((file, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onSelectFile(file.path, file.lineStart)}
                        className="w-full text-left p-2.5 rounded-lg bg-[var(--bg-card-elevated)] hover:bg-[var(--bg-subtle-hover)] border border-[var(--border-card)] hover:border-[var(--cobalt-border)] transition-colors group flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--ink-primary)] group-hover:text-[var(--cobalt-ice)] transition-colors">
                            <span className="truncate">{file.path}</span>
                            {file.lineStart && (
                              <span className="text-[var(--amber)] shrink-0">
                                #L{file.lineStart}
                              </span>
                            )}
                          </div>
                          {file.reason && (
                            <p className="text-[11px] text-[var(--ink-secondary)] mt-0.5 line-clamp-1">
                              {file.reason}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-[var(--ink-muted)] group-hover:text-[var(--cobalt-bright)] group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dossier Footer Actions */}
          <div className="p-3 border-t border-[var(--border-card)] flex items-center justify-between gap-2 bg-[var(--bg-card-elevated)] rounded-b-2xl">
            <button
              type="button"
              onClick={handleResetLasso}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Circle Another Region</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-pill)] hover:bg-[var(--bg-pill-hover)] text-[var(--ink-primary)] border border-[var(--border-pill)] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CircleToExplainOverlay;
