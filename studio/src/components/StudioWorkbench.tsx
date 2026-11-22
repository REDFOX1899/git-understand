'use client';

// =============================================================================
// GitUnderstand (git-understand.com) — Master Studio Workbench
// Agent 70: Production-grade master workbench orchestrating TopBar, Telemetry,
// LeftNavigatorRail, 7 Visual Lenses, 3-Tab Multimodal Inspector, and Live Voice Dock.
// Visual-First Philosophy: "No one reads code anymore — MORE VISUALS."
// =============================================================================

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import type {
  VisualAtlasBlueprint,
  VisualLensId,
  XRayPillarId,
  VisualSearchMatch,
  PipelineProgressEvent,
  CodemapTourStop,
  ExecutionFlow,
  MermaidDiagramSpec,
  XRayMatrixReport,
  MediaPosterArtifact,
  AudioTourArtifact,
  VideoReelArtifact,
  LiveVoiceToolAction,
  CodeSymbol,
} from '@shared/types';

// TopBar & Telemetry
import { TopBar } from '@/components/TopBar';
import { PipelineTelemetryBar } from '@/components/PipelineTelemetryBar';

// Navigation & Inspector Panels
import { LeftNavigatorRail } from '@/components/sidebar/LeftNavigatorRail';
import { VisualBriefPanel } from '@/components/inspector/VisualBriefPanel';
import { MultimodalOraclePanel } from '@/components/inspector/MultimodalOraclePanel';
import { CodeLensPanel } from '@/components/inspector/CodeLensPanel';

// Live Voice Tutor Dock & Hook
import { LiveVoiceDock } from '@/components/voice/LiveVoiceDock';
import { useLiveVoiceTutor } from '@/lib/useLiveVoiceTutor';

// 7 Flagship Visual Lenses
import {
  AtlasGraphCanvas,
  type AtlasGraphHandle,
} from '@/components/lenses/AtlasGraphCanvas';
import { Strata3DView } from '@/components/lenses/Strata3DView';
import { FlowAnimatorView } from '@/components/lenses/FlowAnimatorView';
import { TokenTreemapView } from '@/components/lenses/TokenTreemapView';
import { XRayMatrixView } from '@/components/lenses/XRayMatrixView';
import { MermaidStudioView } from '@/components/lenses/MermaidStudioView';
import { MediaLabView } from '@/components/lenses/MediaLabView';

// UI Icons
import {
  Layers,
  Sparkles,
  FileCode,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Keyboard,
  Compass,
  ArrowRight,
  Search,
  X,
  ExternalLink,
} from 'lucide-react';

// =============================================================================
// StudioWorkbench Props Contract
// =============================================================================

export interface StudioWorkbenchProps {
  blueprint: VisualAtlasBlueprint;
  resolvedTheme: 'dark' | 'light';
  onToggleTheme: () => void;
  onReturnHome: () => void;
  onAnalyzeNewRepo: (repoUrl: string) => Promise<void>;
  onOpenSettings: () => void;
  onOpenMcp: () => void;
  onBlueprintUpdate: (bp: VisualAtlasBlueprint) => void;
  progressEvents?: PipelineProgressEvent[];
  isAnalyzing?: boolean;
}

export type InspectorTab = 'brief' | 'oracle' | 'code';

// =============================================================================
// StudioWorkbench Master Component
// =============================================================================

export function StudioWorkbench({
  blueprint,
  resolvedTheme,
  onToggleTheme,
  onReturnHome,
  onAnalyzeNewRepo,
  onOpenSettings,
  onOpenMcp,
  onBlueprintUpdate,
  progressEvents = [],
  isAnalyzing = false,
}: StudioWorkbenchProps) {
  // ---------------------------------------------------------------------------
  // 1. Core Navigation & Layout State (Visual-First Defaults)
  // ---------------------------------------------------------------------------
  const [activeLens, setActiveLens] = useState<VisualLensId>('atlas');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('brief');
  const [isLeftRailOpen, setIsLeftRailOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isTelemetryDismissed, setIsTelemetryDismissed] = useState(false);
  const [isLiveVoiceDockOpen, setIsLiveVoiceDockOpen] = useState(false);
  const [showShortcutPill, setShowShortcutPill] = useState(false);
  const [repoInputModalOpen, setRepoInputModalOpen] = useState(false);
  const [newRepoUrlInput, setNewRepoUrlInput] = useState('');
  const [isSubmittingRepo, setIsSubmittingRepo] = useState(false);

  // ---------------------------------------------------------------------------
  // 2. Selection & Inspection Context
  // ---------------------------------------------------------------------------
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => blueprint.nodes?.[0]?.id ?? null
  );
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(
    () => blueprint.nodes?.[0]?.id ?? null
  );
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
    () => blueprint.files?.[0]?.path ?? null
  );
  const [peekLines, setPeekLines] = useState<{ start: number; end: number } | null>(null);
  const [activeTourIndex, setActiveTourIndex] = useState(0);

  // Lens-specific state
  const [xrayOverlayPillar, setXrayOverlayPillar] = useState<XRayPillarId | null>(null);
  const [visualSearchMatches, setVisualSearchMatches] = useState<VisualSearchMatch[]>([]);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(
    () => blueprint.flows?.[0]?.id ?? null
  );
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [digestFilterOptions, setDigestFilterOptions] = useState<Record<string, unknown> | null>(null);
  const [lastVoiceToolAction, setLastVoiceToolAction] = useState<LiveVoiceToolAction | null>(null);

  // Ref to canvas handle for PNG frame captures & programmatic camera control
  const atlasCanvasRef = useRef<AtlasGraphHandle | null>(null);

  // Synchronize selection if blueprint identity changes
  useEffect(() => {
    if (blueprint.nodes?.length && !blueprint.nodes.some((n) => n.id === selectedNodeId)) {
      setSelectedNodeId(blueprint.nodes[0]?.id ?? null);
      setFocusedNodeId(blueprint.nodes[0]?.id ?? null);
    }
    if (blueprint.files?.length && !blueprint.files.some((f) => f.path === selectedFilePath)) {
      setSelectedFilePath(blueprint.files[0]?.path ?? null);
    }
    if (blueprint.flows?.length && !blueprint.flows.some((fl) => fl.id === activeFlowId)) {
      setActiveFlowId(blueprint.flows[0]?.id ?? null);
      setActiveStepIndex(0);
    }
  }, [blueprint.repoId]);

  // ---------------------------------------------------------------------------
  // 3. Atlas Frame Capture (Shared with Gemini 3.8 Live Voice & Media Lab)
  // ---------------------------------------------------------------------------
  const handleCaptureCanvasFrame = useCallback(async (): Promise<string | null> => {
    try {
      if (atlasCanvasRef.current) {
        return await atlasCanvasRef.current.capturePngBase64();
      }
    } catch {
      // Fallback if canvas is detached or busy
    }
    return null;
  }, []);

  // ---------------------------------------------------------------------------
  // 4. Gemini 3.8 Live Voice Integration & Tool Action Handler
  // ---------------------------------------------------------------------------
  const handleLiveVoiceToolAction = useCallback(
    (action: LiveVoiceToolAction) => {
      setLastVoiceToolAction(action);

      switch (action.tool) {
        case 'focus_node': {
          const nodeId = typeof action.args.nodeId === 'string' ? action.args.nodeId : null;
          if (nodeId) {
            setSelectedNodeId(nodeId);
            setFocusedNodeId(nodeId);
            atlasCanvasRef.current?.focusNode(nodeId);
            setInspectorTab('brief');
            setIsInspectorOpen(true);
          }
          break;
        }

        case 'trace_execution_flow': {
          const flowId = typeof action.args.flowId === 'string' ? action.args.flowId : null;
          const stepIndex = typeof action.args.stepIndex === 'number' ? action.args.stepIndex : 0;
          if (flowId) {
            setActiveFlowId(flowId);
          }
          setActiveStepIndex(stepIndex);
          setActiveLens('flows');
          break;
        }

        case 'toggle_xray_overlay': {
          const pillar =
            typeof action.args.pillar === 'string'
              ? (action.args.pillar as XRayPillarId)
              : action.args.enabled === false
              ? null
              : 'modularity';
          setXrayOverlayPillar(pillar);
          break;
        }

        case 'slice_digest_context': {
          setDigestFilterOptions(action.args);
          setActiveLens('treemap');
          break;
        }

        case 'switch_lens': {
          const targetLens = action.args.lens as VisualLensId;
          if (targetLens) {
            setActiveLens(targetLens);
          }
          break;
        }

        default:
          break;
      }
    },
    []
  );

  const liveVoice = useLiveVoiceTutor({
    repoId: blueprint.repoId,
    onToolAction: handleLiveVoiceToolAction,
    captureCanvasFrame: handleCaptureCanvasFrame,
  });

  // Toggle Live Voice Dock
  const handleToggleLiveVoice = useCallback(() => {
    setIsLiveVoiceDockOpen((prev) => {
      const next = !prev;
      if (next && !liveVoice.isConnected && !liveVoice.isConnecting) {
        liveVoice.connect().catch(() => {});
      }
      return next;
    });
  }, [liveVoice]);

  // Map LiveVoice status for dock
  const liveVoiceDockStatus = useMemo(() => {
    if (liveVoice.error) return 'error';
    if (liveVoice.isConnected) return 'live';
    if (liveVoice.isConnecting) return 'connecting';
    return 'idle';
  }, [liveVoice.error, liveVoice.isConnected, liveVoice.isConnecting]);

  // ---------------------------------------------------------------------------
  // 5. Node Selection, Peek Source & Tour Stop Handlers
  // ---------------------------------------------------------------------------
  const handleSelectNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setFocusedNodeId(nodeId);

      const targetNode = blueprint.nodes?.find((n) => n.id === nodeId);
      if (targetNode?.primaryFile) {
        setSelectedFilePath(targetNode.primaryFile);
        if (targetNode.lineStart !== undefined) {
          setPeekLines({
            start: targetNode.lineStart,
            end: targetNode.lineEnd ?? targetNode.lineStart,
          });
        }
      }

      atlasCanvasRef.current?.focusNode(nodeId);
    },
    [blueprint.nodes]
  );

  const handlePeekFile = useCallback(
    (filePath: string, lineStart?: number, lineEnd?: number) => {
      setSelectedFilePath(filePath);
      if (lineStart !== undefined) {
        setPeekLines({ start: lineStart, end: lineEnd ?? lineStart });
      } else {
        setPeekLines(null);
      }
      // Tucked in secondary Peek Source tab
      setInspectorTab('code');
      setIsInspectorOpen(true);
    },
    []
  );

  const handleSelectTourStop = useCallback(
    (index: number, stop: CodemapTourStop) => {
      setActiveTourIndex(index);

      if (stop.focusNodeId) {
        handleSelectNode(stop.focusNodeId);
      }

      if (stop.filePath) {
        setSelectedFilePath(stop.filePath);
        if (stop.lineStart !== undefined) {
          setPeekLines({
            start: stop.lineStart,
            end: stop.lineEnd ?? stop.lineStart,
          });
        }
      }

      if (stop.recommendedLens && stop.recommendedLens !== activeLens) {
        setActiveLens(stop.recommendedLens);
      }
    },
    [activeLens, handleSelectNode]
  );

  const handleVisualSearchResults = useCallback(
    (matches: VisualSearchMatch[]) => {
      setVisualSearchMatches(matches);
      if (matches.length > 0 && matches[0]?.nodeId) {
        handleSelectNode(matches[0].nodeId);
        if (activeLens !== 'atlas') {
          setActiveLens('atlas');
        }
      }
    },
    [activeLens, handleSelectNode]
  );

  // ---------------------------------------------------------------------------
  // 6. Keyboard Shortcuts Contract (1-7, [, ], Esc)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when user is actively typing in inputs or textareas
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      switch (e.key) {
        case '1':
          e.preventDefault();
          setActiveLens('atlas');
          break;
        case '2':
          e.preventDefault();
          setActiveLens('strata3d');
          break;
        case '3':
          e.preventDefault();
          setActiveLens('flows');
          break;
        case '4':
          e.preventDefault();
          setActiveLens('treemap');
          break;
        case '5':
          e.preventDefault();
          setActiveLens('xray');
          break;
        case '6':
          e.preventDefault();
          setActiveLens('mermaid');
          break;
        case '7':
          e.preventDefault();
          setActiveLens('media');
          break;
        case '[':
          e.preventDefault();
          setIsLeftRailOpen((prev) => !prev);
          break;
        case ']':
          e.preventDefault();
          setIsInspectorOpen((prev) => !prev);
          break;
        case 'Escape':
          e.preventDefault();
          if (repoInputModalOpen) {
            setRepoInputModalOpen(false);
          } else if (isLiveVoiceDockOpen) {
            setIsLiveVoiceDockOpen(false);
          } else if (visualSearchMatches.length > 0) {
            setVisualSearchMatches([]);
          } else if (xrayOverlayPillar) {
            setXrayOverlayPillar(null);
          } else if (focusedNodeId) {
            setFocusedNodeId(null);
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    repoInputModalOpen,
    isLiveVoiceDockOpen,
    visualSearchMatches.length,
    xrayOverlayPillar,
    focusedNodeId,
  ]);

  // ---------------------------------------------------------------------------
  // 7. Telemetry Event & Status
  // ---------------------------------------------------------------------------
  const latestTelemetryEvent = useMemo(() => {
    if (progressEvents.length > 0) {
      return progressEvents[progressEvents.length - 1] ?? null;
    }
    return null;
  }, [progressEvents]);

  const showTelemetryBar =
    !isTelemetryDismissed &&
    (isAnalyzing || (progressEvents.length > 0 && latestTelemetryEvent?.stage !== 'ready'));

  // Handler for analyzing new repo from quick modal
  const handleSubmitNewRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoUrlInput.trim() || isSubmittingRepo) return;
    try {
      setIsSubmittingRepo(true);
      await onAnalyzeNewRepo(newRepoUrlInput.trim());
      setRepoInputModalOpen(false);
      setNewRepoUrlInput('');
    } finally {
      setIsSubmittingRepo(false);
    }
  };

  // =============================================================================
  // Render: Master Studio Workbench
  // =============================================================================

  return (
    <div
      className="flex flex-col w-screen h-screen overflow-hidden select-none bg-[var(--bg-void)] text-[var(--ink-primary)]"
      style={{
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* -------------------------------------------------------------------- */}
      {/* A. TopBar Header Navigation                                          */}
      {/* -------------------------------------------------------------------- */}
      <TopBar
        currentLens={activeLens}
        onSelectLens={setActiveLens}
        repoSlug={blueprint.metadata?.fullName || 'repository'}
        branch={blueprint.metadata?.branch || 'main'}
        repoUrl={blueprint.metadata?.htmlUrl}
        onRepoClick={() => setRepoInputModalOpen(true)}
        isLiveVoiceActive={liveVoice.isConnected}
        onToggleLiveVoice={handleToggleLiveVoice}
        onMcpClick={onOpenMcp}
        onSettingsClick={onOpenSettings}
        onHomeClick={onReturnHome}
        className="shrink-0 z-30"
      />

      {/* -------------------------------------------------------------------- */}
      {/* B. Live Pipeline Telemetry Bar (Active during ingest/enrichment)      */}
      {/* -------------------------------------------------------------------- */}
      {showTelemetryBar && (
        <PipelineTelemetryBar
          repoId={blueprint.repoId}
          event={latestTelemetryEvent}
          isActive={isAnalyzing}
          onDismiss={() => setIsTelemetryDismissed(true)}
          className="shrink-0 z-20 border-b border-[var(--border-card)] shadow-xs"
        />
      )}

      {/* -------------------------------------------------------------------- */}
      {/* C. Primary Workspace Tri-Pane Layout                                 */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex flex-1 w-full min-h-0 relative overflow-hidden">
        {/* ------------------------------------------------------------------ */}
        {/* 1. Left Navigator Rail (Subsystems, Tour, File Tree)               */}
        {/* ------------------------------------------------------------------ */}
        {isLeftRailOpen ? (
          <aside className="w-80 shrink-0 h-full border-r border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col z-10 transition-all duration-200">
            <LeftNavigatorRail
              blueprint={blueprint}
              selectedNodeId={selectedNodeId}
              selectedFilePath={selectedFilePath}
              activeTourIndex={activeTourIndex}
              onSelectNode={handleSelectNode}
              onSelectFile={(filePath) => {
                setSelectedFilePath(filePath);
                setPeekLines(null);
                setInspectorTab('code');
              }}
              onSelectTourStop={handleSelectTourStop}
              onClose={() => setIsLeftRailOpen(false)}
            />
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setIsLeftRailOpen(true)}
            className="absolute top-3 left-3 z-20 p-2 rounded-lg bg-[var(--bg-card)]/90 backdrop-blur-md border border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--cobalt-core)] transition-colors shadow-md group cursor-pointer"
            title="Expand Left Navigator Rail ([)"
            aria-label="Expand Navigator"
          >
            <PanelLeftOpen className="w-4 h-4" />
            <span className="sr-only">Expand Rail</span>
          </button>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 2. Central Flagship Lens Viewport (100% Visual-First)              */}
        {/* ------------------------------------------------------------------ */}
        <main className="flex-1 h-full min-w-0 relative flex flex-col overflow-hidden bg-[var(--bg-void)]">
          {/* Active Lens Rendering */}
          <div className="flex-1 w-full h-full relative overflow-hidden">
            {activeLens === 'atlas' && (
              <AtlasGraphCanvas
                ref={atlasCanvasRef}
                blueprint={blueprint}
                selectedNodeId={selectedNodeId}
                focusedNodeId={focusedNodeId}
                xrayOverlayPillar={xrayOverlayPillar}
                visualSearchMatches={visualSearchMatches}
                onSelectNode={handleSelectNode}
                onPeekFile={handlePeekFile}
                onChangeXRayOverlay={setXrayOverlayPillar}
              />
            )}

            {activeLens === 'strata3d' && (
              <Strata3DView
                blueprint={blueprint}
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNode}
              />
            )}

            {activeLens === 'flows' && (
              <FlowAnimatorView
                blueprint={blueprint}
                activeFlowId={activeFlowId}
                activeStepIndex={activeStepIndex}
                onSelectNode={handleSelectNode}
                onPeekFile={handlePeekFile}
                onFlowsUpdated={(updatedFlows: ExecutionFlow[], updatedTour: CodemapTourStop[]) => {
                  onBlueprintUpdate({
                    ...blueprint,
                    flows: updatedFlows,
                    codemapTour: updatedTour,
                  });
                }}
              />
            )}

            {activeLens === 'treemap' && (
              <TokenTreemapView
                blueprint={blueprint}
                externalFilterOptions={digestFilterOptions}
                onPeekFile={(filePath: string) => handlePeekFile(filePath)}
              />
            )}

            {activeLens === 'xray' && (
              <XRayMatrixView
                blueprint={blueprint}
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNode}
                onXRayUpdated={(updatedXRay: XRayMatrixReport) => {
                  onBlueprintUpdate({
                    ...blueprint,
                    xray: updatedXRay,
                  });
                }}
              />
            )}

            {activeLens === 'mermaid' && (
              <MermaidStudioView
                blueprint={blueprint}
                resolvedTheme={resolvedTheme}
                onPeekFile={(filePath: string) => handlePeekFile(filePath)}
                onDiagramsUpdated={(updatedDiagrams: MermaidDiagramSpec[]) => {
                  onBlueprintUpdate({
                    ...blueprint,
                    diagrams: updatedDiagrams,
                  });
                }}
              />
            )}

            {activeLens === 'media' && (
              <MediaLabView
                blueprint={blueprint}
                captureCanvasFrame={handleCaptureCanvasFrame}
                onFocusNode={(nodeId: string, switchToAtlas?: boolean) => {
                  handleSelectNode(nodeId);
                  if (switchToAtlas) {
                    setActiveLens('atlas');
                  }
                }}
                onArtifactAdded={(update: {
                  poster?: MediaPosterArtifact;
                  audioTour?: AudioTourArtifact;
                  videoReel?: VideoReelArtifact;
                }) => {
                  onBlueprintUpdate({
                    ...blueprint,
                    posters: update.poster
                      ? [update.poster, ...(blueprint.posters || [])]
                      : blueprint.posters,
                    audioTours: update.audioTour
                      ? [update.audioTour, ...(blueprint.audioTours || [])]
                      : blueprint.audioTours,
                    videoReels: update.videoReel
                      ? [update.videoReel, ...(blueprint.videoReels || [])]
                      : blueprint.videoReels,
                  });
                }}
              />
            )}
          </div>

          {/* Quick Keyboard Shortcuts Badge (Bottom Left of Canvas) */}
          <div className="absolute bottom-3 left-4 z-10 flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={() => setShowShortcutPill((prev) => !prev)}
              className="px-2.5 py-1 rounded-full bg-[var(--bg-card)]/80 backdrop-blur-md border border-[var(--border-card)] text-xs text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:border-[var(--cobalt-core)] transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Toggle Keyboard Shortcuts"
            >
              <Keyboard className="w-3.5 h-3.5 text-[var(--cobalt-ice)]" />
              <span className="font-mono text-[11px]">Shortcuts</span>
            </button>

            {showShortcutPill && (
              <div className="px-3 py-1 rounded-full bg-[var(--bg-card)]/90 backdrop-blur-md border border-[var(--border-card)] text-[11px] font-mono text-[var(--ink-secondary)] flex items-center gap-3 shadow-md animate-fade-in">
                <span>
                  <strong className="text-[var(--cobalt-ice)]">1-7</strong> Lenses
                </span>
                <span>
                  <strong className="text-[var(--cobalt-ice)]">[</strong> Rail
                </span>
                <span>
                  <strong className="text-[var(--cobalt-ice)]">]</strong> Inspector
                </span>
                <span>
                  <strong className="text-[var(--cobalt-ice)]">Esc</strong> Clear
                </span>
              </div>
            )}
          </div>
        </main>

        {/* ------------------------------------------------------------------ */}
        {/* 3. Right Multimodal Inspector Panel (Brief, Oracle, Peek Source)   */}
        {/* ------------------------------------------------------------------ */}
        {isInspectorOpen ? (
          <aside className="w-96 shrink-0 h-full border-l border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col z-10 transition-all duration-200">
            {/* Inspector Tab Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-card)] bg-[var(--bg-card-elevated)] shrink-0">
              <nav className="flex items-center gap-1" aria-label="Inspector Tabs">
                {/* Tab 1: Visual Brief (Default & Primary) */}
                <button
                  type="button"
                  onClick={() => setInspectorTab('brief')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    inspectorTab === 'brief'
                      ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-core)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-void)]'
                  }`}
                  title="Visual Architecture Brief"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Visual Brief</span>
                </button>

                {/* Tab 2: Multimodal Oracle & Visual Search */}
                <button
                  type="button"
                  onClick={() => setInspectorTab('oracle')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    inspectorTab === 'oracle'
                      ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-core)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-void)]'
                  }`}
                  title="Multimodal Code Oracle & Visual Search"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[var(--amber)]" />
                  <span>Oracle</span>
                </button>

                {/* Tab 3: Peek Source (Secondary) */}
                <button
                  type="button"
                  onClick={() => setInspectorTab('code')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    inspectorTab === 'code'
                      ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-core)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-void)]'
                  }`}
                  title="Peek Raw Source Code"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Peek Source</span>
                </button>
              </nav>

              {/* Close Inspector Tab Button */}
              <button
                type="button"
                onClick={() => setIsInspectorOpen(false)}
                className="p-1.5 rounded-md text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-void)] transition-colors cursor-pointer"
                title="Collapse Inspector Panel (])"
                aria-label="Collapse Inspector"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>

            {/* Inspector Tab Content Body */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {inspectorTab === 'brief' && (
                <VisualBriefPanel
                  blueprint={blueprint}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={handleSelectNode}
                  onPeekFile={handlePeekFile}
                  className="h-full"
                />
              )}

              {inspectorTab === 'oracle' && (
                <MultimodalOraclePanel
                  blueprint={blueprint}
                  onFocusNode={handleSelectNode}
                  onPeekFile={handlePeekFile}
                  onVisualSearchResults={handleVisualSearchResults}
                />
              )}

              {inspectorTab === 'code' && (
                <CodeLensPanel
                  blueprint={blueprint}
                  filePath={selectedFilePath}
                  highlightLines={peekLines}
                  onSelectFile={(path: string) => {
                    setSelectedFilePath(path);
                    setPeekLines(null);
                  }}
                  onSelectSymbol={(sym: CodeSymbol) => {
                    if (sym.line) {
                      setPeekLines({
                        start: sym.line,
                        end: sym.endLine ?? sym.line,
                      });
                    }
                  }}
                />
              )}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setIsInspectorOpen(true)}
            className="absolute top-3 right-3 z-20 p-2 rounded-lg bg-[var(--bg-card)]/90 backdrop-blur-md border border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--cobalt-core)] transition-colors shadow-md group cursor-pointer"
            title="Expand Inspector Panel (])"
            aria-label="Expand Inspector"
          >
            <PanelRightOpen className="w-4 h-4" />
            <span className="sr-only">Expand Inspector</span>
          </button>
        )}
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* D. Gemini 3.8 Live Voice Floating Tutor Dock                         */}
      {/* -------------------------------------------------------------------- */}
      <LiveVoiceDock
        open={isLiveVoiceDockOpen}
        status={liveVoiceDockStatus}
        isMuted={liveVoice.isMuted}
        isSpeaking={liveVoice.isModelSpeaking}
        isVisionEnabled={liveVoice.isVisionStreaming}
        audioLevel={liveVoice.volumeLevel}
        transcripts={liveVoice.transcripts}
        lastToolAction={lastVoiceToolAction}
        error={liveVoice.error}
        onConnect={() => liveVoice.connect()}
        onDisconnect={() => liveVoice.disconnect()}
        onToggleMute={() => liveVoice.toggleMute()}
        onToggleVision={() => liveVoice.toggleVisionStreaming()}
        onSendText={(text: string) => liveVoice.sendTextMessage(text)}
        onClose={() => setIsLiveVoiceDockOpen(false)}
      />

      {/* -------------------------------------------------------------------- */}
      {/* E. Quick Repo Switcher Dialog Modal                                  */}
      {/* -------------------------------------------------------------------- */}
      {repoInputModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl bg-[var(--bg-card)] border border-[var(--border-card)] shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-[var(--cobalt-ice)]" />
                <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                  Analyze Another Repository
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setRepoInputModalOpen(false)}
                className="p-1 rounded-md text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
              Enter any public GitHub repository URL or slug (e.g.{' '}
              <code className="text-[var(--cobalt-ice)] font-mono">
                facebook/react
              </code>{' '}
              or{' '}
              <code className="text-[var(--cobalt-ice)] font-mono">
                https://github.com/torvalds/linux
              </code>
              ). Gemini 4 will immediately synthesize the spatial architecture atlas.
            </p>

            <form onSubmit={handleSubmitNewRepo} className="flex flex-col gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-[var(--ink-muted)]" />
                <input
                  type="text"
                  value={newRepoUrlInput}
                  onChange={(e) => setNewRepoUrlInput(e.target.value)}
                  placeholder="owner/repo or GitHub URL..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[var(--bg-void)] border border-[var(--border-card)] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--cobalt-core)] font-mono"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRepoInputModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-card-elevated)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newRepoUrlInput.trim() || isSubmittingRepo}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--cobalt-core)] text-white hover:bg-[var(--cobalt-bright)] disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span>{isSubmittingRepo ? 'Synthesizing...' : 'Synthesize Atlas'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
