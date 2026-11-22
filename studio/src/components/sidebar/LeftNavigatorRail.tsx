'use client';

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import type {
  VisualAtlasBlueprint,
  CodemapTourStop,
  SubsystemCluster,
  AtlasNode,
  RepoFileRecord,
  ArchitectureLayer,
} from '@shared/types';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Layers,
  Compass,
  FolderTree,
  FileCode,
  FileText,
  File,
  Folder,
  FolderOpen,
  Search,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Activity,
  Sparkles,
  CheckCircle2,
  Target,
  Box,
} from 'lucide-react';

// =============================================================================
// Props Contract
// =============================================================================

export interface LeftNavigatorRailProps {
  blueprint: VisualAtlasBlueprint;
  selectedNodeId: string | null;
  selectedFilePath: string | null;
  activeTourIndex: number;
  onSelectNode: (nodeId: string) => void;
  onSelectFile: (filePath: string) => void;
  onSelectTourStop: (index: number, stop: CodemapTourStop) => void;
  onClose?: () => void;
}

type NavigatorTab = 'subsystems' | 'tour' | 'files';

// =============================================================================
// Helper Utilities & Formatters
// =============================================================================

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return `${tokens}`;
}

function getHealthBadge(score?: number) {
  const s = score ?? 85;
  if (s >= 80) {
    return {
      label: `${s}%`,
      bg: 'var(--emerald-bg)',
      border: 'var(--emerald-border)',
      text: 'var(--emerald)',
    };
  }
  if (s >= 60) {
    return {
      label: `${s}%`,
      bg: 'var(--amber-bg)',
      border: 'var(--amber-border)',
      text: 'var(--amber)',
    };
  }
  return {
    label: `${s}%`,
    bg: 'var(--vermilion-bg)',
    border: 'var(--vermilion-border)',
    text: 'var(--vermilion)',
  };
}

function getLayerColor(layer: ArchitectureLayer): string {
  switch (layer) {
    case 'client':
      return 'var(--cyan-layer)';
    case 'edge':
      return 'var(--teal-layer)';
    case 'orchestration':
      return 'var(--indigo-layer)';
    case 'domain':
      return 'var(--cobalt-bright)';
    case 'infrastructure':
      return 'var(--amber)';
    case 'data':
      return 'var(--emerald)';
    case 'tooling':
      return 'var(--ink-secondary)';
    default:
      return 'var(--cobalt-core)';
  }
}

function getFileIcon(extension: string) {
  const ext = extension.toLowerCase().replace('.', '');
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp'].includes(ext)) {
    return <FileCode className="w-3.5 h-3.5 text-[var(--cobalt-ice)] shrink-0" />;
  }
  if (['json', 'yaml', 'yml', 'toml', 'env', 'config'].includes(ext)) {
    return <FileText className="w-3.5 h-3.5 text-[var(--amber)] shrink-0" />;
  }
  if (['md', 'mdx', 'txt', 'rst'].includes(ext)) {
    return <FileText className="w-3.5 h-3.5 text-[var(--emerald)] shrink-0" />;
  }
  return <File className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />;
}

// Tree node definition for compact Files tree
interface FileTreeNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  children: Map<string, FileTreeNode>;
  fileRecord?: RepoFileRecord;
}

function buildFileTree(files: RepoFileRecord[]): FileTreeNode {
  const root: FileTreeNode = {
    name: 'root',
    fullPath: '',
    isDir: true,
    children: new Map(),
  };

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      const subPath = segments.slice(0, i + 1).join('/');

      if (isLast) {
        current.children.set(seg, {
          name: seg,
          fullPath: file.path,
          isDir: false,
          children: new Map(),
          fileRecord: file,
        });
      } else {
        if (!current.children.has(seg)) {
          current.children.set(seg, {
            name: seg,
            fullPath: subPath,
            isDir: true,
            children: new Map(),
          });
        }
        current = current.children.get(seg)!;
      }
    }
  }

  return root;
}

// =============================================================================
// Main Component: LeftNavigatorRail
// =============================================================================

export function LeftNavigatorRail({
  blueprint,
  selectedNodeId,
  selectedFilePath,
  activeTourIndex,
  onSelectNode,
  onSelectFile,
  onSelectTourStop,
  onClose,
}: LeftNavigatorRailProps) {
  // Rail state: defaults to Subsystems tab, uncollapsed (272px)
  const [activeTab, setActiveTab] = useState<NavigatorTab>('subsystems');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Search filter query
  const [searchQuery, setSearchQuery] = useState('');

  // Subsystem accordion expanded state (cluster ID -> boolean)
  const [expandedSubsystems, setExpandedSubsystems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    blueprint.subsystems.forEach((sub, idx) => {
      initial[sub.id] = idx === 0; // expand first cluster by default
    });
    return initial;
  });

  // Tour Auto-Walk state
  const [isAutoWalking, setIsAutoWalking] = useState(false);
  const autoWalkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Files directory expanded state (path -> boolean)
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({
    '': true,
  });

  // Maximum tokens across files for micro-bar scaling
  const maxTokens = useMemo(() => {
    return Math.max(...blueprint.files.map((f) => f.estimatedTokens || 1), 100);
  }, [blueprint.files]);

  // Synchronize expanded subsystem when selectedNodeId changes
  useEffect(() => {
    if (!selectedNodeId) return;
    const targetNode = blueprint.nodes.find((n) => n.id === selectedNodeId);
    if (targetNode?.subsystemId) {
      setExpandedSubsystems((prev) => ({
        ...prev,
        [targetNode.subsystemId]: true,
      }));
    }
  }, [selectedNodeId, blueprint.nodes]);

  // Auto-walk execution
  useEffect(() => {
    if (!isAutoWalking) {
      if (autoWalkIntervalRef.current) {
        clearInterval(autoWalkIntervalRef.current);
        autoWalkIntervalRef.current = null;
      }
      return;
    }

    const stops = blueprint.codemapTour;
    if (stops.length === 0) return;

    autoWalkIntervalRef.current = setInterval(() => {
      const nextIndex = (activeTourIndex + 1) % stops.length;
      onSelectTourStop(nextIndex, stops[nextIndex]);
    }, 4500);

    return () => {
      if (autoWalkIntervalRef.current) {
        clearInterval(autoWalkIntervalRef.current);
        autoWalkIntervalRef.current = null;
      }
    };
  }, [isAutoWalking, activeTourIndex, blueprint.codemapTour, onSelectTourStop]);

  // Toggle subsystem expansion
  const toggleSubsystem = useCallback((id: string) => {
    setExpandedSubsystems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  // Toggle directory expansion
  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => ({
      ...prev,
      [path]: prev[path] === undefined ? false : !prev[path],
    }));
  }, []);

  // Filtered subsystems and their matching nodes
  const filteredSubsystems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return blueprint.subsystems.map((sub) => ({
        subsystem: sub,
        nodes: blueprint.nodes.filter(
          (n) => n.subsystemId === sub.id || sub.nodeIds.includes(n.id)
        ),
      }));
    }

    return blueprint.subsystems
      .map((sub) => {
        const matchesSubsystem =
          sub.name.toLowerCase().includes(query) ||
          sub.tagline.toLowerCase().includes(query) ||
          sub.layer.toLowerCase().includes(query);

        const subNodes = blueprint.nodes.filter(
          (n) => n.subsystemId === sub.id || sub.nodeIds.includes(n.id)
        );

        const matchedNodes = subNodes.filter(
          (n) =>
            matchesSubsystem ||
            n.label.toLowerCase().includes(query) ||
            n.subtitle.toLowerCase().includes(query) ||
            n.kind.toLowerCase().includes(query) ||
            n.primaryFile.toLowerCase().includes(query)
        );

        return {
          subsystem: sub,
          nodes: matchedNodes,
          hasMatch: matchesSubsystem || matchedNodes.length > 0,
        };
      })
      .filter((item) => item.hasMatch);
  }, [blueprint.subsystems, blueprint.nodes, searchQuery]);

  // Filtered files list
  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return blueprint.files;
    return blueprint.files.filter(
      (f) =>
        f.path.toLowerCase().includes(query) ||
        f.name.toLowerCase().includes(query) ||
        f.layer.toLowerCase().includes(query)
    );
  }, [blueprint.files, searchQuery]);

  // File tree from filtered files
  const fileTree = useMemo(() => {
    return buildFileTree(filteredFiles);
  }, [filteredFiles]);

  // Handle tour navigation buttons
  const handlePrevTourStop = useCallback(() => {
    const stops = blueprint.codemapTour;
    if (stops.length === 0) return;
    const prevIdx = activeTourIndex > 0 ? activeTourIndex - 1 : stops.length - 1;
    onSelectTourStop(prevIdx, stops[prevIdx]);
  }, [activeTourIndex, blueprint.codemapTour, onSelectTourStop]);

  const handleNextTourStop = useCallback(() => {
    const stops = blueprint.codemapTour;
    if (stops.length === 0) return;
    const nextIdx = (activeTourIndex + 1) % stops.length;
    onSelectTourStop(nextIdx, stops[nextIdx]);
  }, [activeTourIndex, blueprint.codemapTour, onSelectTourStop]);

  // ===========================================================================
  // Collapsed Minimalist Strip Mode (48px)
  // ===========================================================================

  if (isCollapsed) {
    return (
      <aside
        className="w-12 shrink-0 flex flex-col h-full bg-[var(--bg-card)] border-r border-[var(--border-card)] select-none z-20 transition-all duration-200"
        aria-label="Collapsed Left Navigator Rail"
      >
        <div className="flex flex-col items-center py-3.5 gap-3 border-b border-[var(--border-card)]">
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--cobalt-ice)]"
            title="Expand Navigator (272px)"
            aria-label="Expand Navigator"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex flex-col items-center py-4 gap-2 flex-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'subsystems'}
            onClick={() => {
              setActiveTab('subsystems');
              setIsCollapsed(false);
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              activeTab === 'subsystems'
                ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)] shadow-sm'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)]'
            }`}
            title={`Subsystems (${blueprint.subsystems.length})`}
          >
            <Layers className="w-4 h-4" />
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tour'}
            onClick={() => {
              setActiveTab('tour');
              setIsCollapsed(false);
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              activeTab === 'tour'
                ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)] shadow-sm'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)]'
            }`}
            title={`Codemap Tour (${blueprint.codemapTour.length})`}
          >
            <Compass className="w-4 h-4" />
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'files'}
            onClick={() => {
              setActiveTab('files');
              setIsCollapsed(false);
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              activeTab === 'files'
                ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)] shadow-sm'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)]'
            }`}
            title={`Files (${blueprint.files.length})`}
          >
            <FolderTree className="w-4 h-4" />
          </button>
        </nav>
      </aside>
    );
  }

  // ===========================================================================
  // Expanded 272px Rail
  // ===========================================================================

  return (
    <aside
      className="w-[272px] shrink-0 flex flex-col h-full bg-[var(--bg-card)] border-r border-[var(--border-card)] select-none z-20 text-[var(--ink-primary)] overflow-hidden transition-all duration-200"
      aria-label="Left Visual Navigator Rail"
    >
      {/* ---------------------------------------------------------------------
          Rail Top Header: Tabs & Collapse Controls
          --------------------------------------------------------------------- */}
      <div className="p-2.5 pb-2 border-b border-[var(--border-card)] bg-[var(--bg-card-elevated)]/60 backdrop-blur-md shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold tracking-wider uppercase text-[var(--ink-muted)] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--cobalt-bright)] inline-block" />
            Visual Navigator
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
              title="Collapse Rail (Ctrl+B)"
              aria-label="Collapse Navigator Rail"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
                title="Close Navigator"
                aria-label="Close Navigator"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Tab Switcher Segmented Control */}
        <div
          role="tablist"
          className="grid grid-cols-3 p-0.5 rounded-lg bg-[var(--bg-void)] border border-[var(--border-subtle)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'subsystems'}
            onClick={() => setActiveTab('subsystems')}
            className={`flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-md text-[11px] font-medium transition-all ${
              activeTab === 'subsystems'
                ? 'bg-[var(--bg-card)] text-[var(--cobalt-ice)] shadow-xs border border-[var(--cobalt-border)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <Layers className="w-3 h-3 shrink-0" />
            <span>Clusters</span>
            <span className="text-[9px] px-1 py-0.2 rounded-full bg-[var(--bg-subtle)] text-[var(--ink-muted)]">
              {blueprint.subsystems.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tour'}
            onClick={() => setActiveTab('tour')}
            className={`flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-md text-[11px] font-medium transition-all ${
              activeTab === 'tour'
                ? 'bg-[var(--bg-card)] text-[var(--cobalt-ice)] shadow-xs border border-[var(--cobalt-border)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <Compass className="w-3 h-3 shrink-0" />
            <span>Tour</span>
            <span className="text-[9px] px-1 py-0.2 rounded-full bg-[var(--bg-subtle)] text-[var(--ink-muted)]">
              {blueprint.codemapTour.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'files'}
            onClick={() => setActiveTab('files')}
            className={`flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-md text-[11px] font-medium transition-all ${
              activeTab === 'files'
                ? 'bg-[var(--bg-card)] text-[var(--cobalt-ice)] shadow-xs border border-[var(--cobalt-border)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <FolderTree className="w-3 h-3 shrink-0" />
            <span>Files</span>
            <span className="text-[9px] px-1 py-0.2 rounded-full bg-[var(--bg-subtle)] text-[var(--ink-muted)]">
              {blueprint.files.length}
            </span>
          </button>
        </div>

        {/* Search input for Subsystems and Files tabs */}
        {activeTab !== 'tour' && (
          <div className="relative mt-2">
            <Search className="w-3 h-3 absolute left-2 top-2 text-[var(--ink-muted)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'subsystems'
                  ? 'Filter clusters & nodes...'
                  : 'Search repo files...'
              }
              className="w-full bg-[var(--bg-void)] border border-[var(--border-subtle)] rounded-md pl-6.5 pr-6 py-1 text-[11px] text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--cobalt-bright)] focus:ring-1 focus:ring-[var(--cobalt-bright)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                title="Clear filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------------
          TAB 1: SUBSYSTEMS CLUSTERS & MODULE NODES
          --------------------------------------------------------------------- */}
      {activeTab === 'subsystems' && (
        <div
          role="tabpanel"
          className="flex-1 overflow-y-auto p-2 space-y-2.5 divide-y divide-[var(--border-subtle)]"
        >
          {filteredSubsystems.length === 0 ? (
            <div className="py-8 text-center text-[var(--ink-muted)] text-[12px]">
              No subsystems or nodes match &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            filteredSubsystems.map(({ subsystem, nodes }) => {
              const isExpanded = !!expandedSubsystems[subsystem.id];
              const health = getHealthBadge(subsystem.healthScore);
              const layerColor = getLayerColor(subsystem.layer);

              return (
                <div key={subsystem.id} className="pt-2 first:pt-0">
                  {/* Subsystem Cluster Accordion Header */}
                  <div
                    onClick={() => toggleSubsystem(subsystem.id)}
                    className="group cursor-pointer rounded-lg p-2 transition-all hover:bg-[var(--bg-subtle-hover)] border border-transparent hover:border-[var(--border-subtle)]"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0 shadow-xs"
                          style={{ backgroundColor: subsystem.color || layerColor }}
                          title={`Subsystem layer: ${subsystem.layer}`}
                        />
                        <span className="text-[12px] font-semibold text-[var(--ink-primary)] truncate group-hover:text-[var(--cobalt-ice)] transition-colors">
                          {subsystem.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Health Pill */}
                        <span
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded-full border flex items-center gap-0.5"
                          style={{
                            backgroundColor: health.bg,
                            borderColor: health.border,
                            color: health.text,
                          }}
                          title={`X-Ray Health Score: ${health.label}`}
                        >
                          <Activity className="w-2.5 h-2.5" />
                          {health.label}
                        </span>

                        <span className="text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] transition-transform duration-150">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10.5px] text-[var(--ink-secondary)] line-clamp-1 mb-1.5 font-normal">
                      {subsystem.tagline}
                    </p>

                    <div className="flex items-center gap-2 text-[10px] text-[var(--ink-muted)] font-mono">
                      <span className="capitalize">{subsystem.layer}</span>
                      <span>&bull;</span>
                      <span>{nodes.length} nodes</span>
                      <span>&bull;</span>
                      <span>{formatTokens(subsystem.totalTokens)} tok</span>
                    </div>
                  </div>

                  {/* Expandable Module Nodes List */}
                  {isExpanded && (
                    <div className="mt-1 ml-2 pl-2 border-l border-[var(--border-subtle)] space-y-1 py-1">
                      {nodes.length === 0 ? (
                        <div className="text-[10px] text-[var(--ink-muted)] py-1 italic">
                          No module nodes matching filter
                        </div>
                      ) : (
                        nodes.map((node) => {
                          const isSelected = selectedNodeId === node.id;
                          return (
                            <div
                              key={node.id}
                              onClick={() => onSelectNode(node.id)}
                              className={`group cursor-pointer rounded-md p-1.5 transition-all text-left ${
                                isSelected
                                  ? 'bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] shadow-xs'
                                  : 'hover:bg-[var(--bg-subtle-hover)] border border-transparent'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span
                                  className={`text-[11.5px] font-medium truncate ${
                                    isSelected
                                      ? 'text-[var(--cobalt-ice)] font-semibold'
                                      : 'text-[var(--ink-primary)] group-hover:text-[var(--cobalt-bright)]'
                                  }`}
                                >
                                  {node.label}
                                </span>
                                <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-[var(--bg-void)] border border-[var(--border-subtle)] text-[var(--ink-muted)] shrink-0 font-mono">
                                  {node.kind}
                                </span>
                              </div>

                              <p className="text-[10px] text-[var(--ink-secondary)] line-clamp-1 font-normal">
                                {node.visualBrief || node.subtitle}
                              </p>

                              <div className="flex items-center justify-between mt-1 text-[9px] text-[var(--ink-muted)] font-mono">
                                <span className="truncate max-w-[130px]" title={node.primaryFile}>
                                  {node.primaryFile.split('/').pop()}
                                </span>
                                <span>{formatTokens(node.estimatedTokens)} tok</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------
          TAB 2: CODEMAP TOUR (Guided Visual Walkthrough)
          --------------------------------------------------------------------- */}
      {activeTab === 'tour' && (
        <div
          role="tabpanel"
          className="flex-1 flex flex-col overflow-hidden"
        >
          {/* Tour Controls Bar */}
          <div className="p-2 border-b border-[var(--border-card)] bg-[var(--bg-card-elevated)] shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-[var(--ink-secondary)] flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-[var(--cobalt-ice)]" />
                Stop {activeTourIndex + 1} of {blueprint.codemapTour.length}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)]">
                Auto-Guided
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[var(--bg-void)] h-1 rounded-full overflow-hidden mb-2">
              <div
                className="bg-[var(--cobalt-core)] h-full transition-all duration-300"
                style={{
                  width: `${
                    blueprint.codemapTour.length > 0
                      ? ((activeTourIndex + 1) / blueprint.codemapTour.length) * 100
                      : 0
                  }%`,
                }}
              />
            </div>

            {/* Stepper Buttons & Auto-Walk */}
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={handlePrevTourStop}
                disabled={blueprint.codemapTour.length <= 1}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--bg-void)] border border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--border-strong)] disabled:opacity-40 transition-colors"
                title="Previous Stop"
              >
                <SkipBack className="w-3 h-3" />
                <span>Prev</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAutoWalking((prev) => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                  isAutoWalking
                    ? 'bg-[var(--cobalt-core)] text-white shadow-xs'
                    : 'bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] text-[var(--cobalt-ice)] hover:bg-[var(--cobalt-tint-strong)]'
                }`}
                title={isAutoWalking ? 'Pause Auto-Walk' : 'Start Auto-Walk (5s intervals)'}
              >
                {isAutoWalking ? (
                  <>
                    <Pause className="w-3 h-3 fill-current" />
                    <span>Walking...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" />
                    <span>Auto-Walk</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleNextTourStop}
                disabled={blueprint.codemapTour.length <= 1}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--bg-void)] border border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--border-strong)] disabled:opacity-40 transition-colors"
                title="Next Stop"
              >
                <span>Next</span>
                <SkipForward className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Tour Stops List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {blueprint.codemapTour.length === 0 ? (
              <div className="py-8 text-center text-[var(--ink-muted)] text-[12px]">
                No tour stops generated for this blueprint.
              </div>
            ) : (
              blueprint.codemapTour.map((stop, idx) => {
                const isActive = activeTourIndex === idx;
                return (
                  <div
                    key={stop.id || idx}
                    onClick={() => onSelectTourStop(idx, stop)}
                    className={`cursor-pointer rounded-lg p-2.5 transition-all text-left relative ${
                      isActive
                        ? 'bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] shadow-sm'
                        : 'bg-[var(--bg-card)] hover:bg-[var(--bg-subtle-hover)] border border-[var(--border-subtle)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono shrink-0 ${
                            isActive
                              ? 'bg-[var(--cobalt-core)] text-white font-bold'
                              : 'bg-[var(--bg-void)] text-[var(--ink-muted)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span
                          className={`text-[12px] font-semibold truncate ${
                            isActive
                              ? 'text-[var(--cobalt-ice)]'
                              : 'text-[var(--ink-primary)]'
                          }`}
                        >
                          {stop.title}
                        </span>
                      </div>

                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[var(--bg-void)] border border-[var(--border-subtle)] text-[var(--cobalt-bright)] font-mono shrink-0">
                        {stop.recommendedLens}
                      </span>
                    </div>

                    <p className="text-[10.5px] text-[var(--ink-secondary)] italic line-clamp-2 mb-1.5">
                      &ldquo;{stop.visualHook}&rdquo;
                    </p>

                    <p className="text-[10px] text-[var(--ink-muted)] line-clamp-2 mb-1.5">
                      {stop.explanation}
                    </p>

                    <div className="flex items-center justify-between text-[9px] text-[var(--ink-muted)] font-mono border-t border-[var(--border-subtle)]/60 pt-1">
                      <span className="truncate max-w-[130px]" title={stop.filePath}>
                        {stop.filePath.split('/').pop()}
                      </span>
                      <span className="text-[var(--cobalt-ice)]">
                        {stop.focusNodeId}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          TAB 3: REPO FILES (Compact Searchable Tree + Token Micro-Bars)
          --------------------------------------------------------------------- */}
      {activeTab === 'files' && (
        <div
          role="tabpanel"
          className="flex-1 overflow-y-auto p-2 space-y-0.5"
        >
          {filteredFiles.length === 0 ? (
            <div className="py-8 text-center text-[var(--ink-muted)] text-[12px]">
              No files match &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            <FileTreeRenderer
              node={fileTree}
              depth={0}
              maxTokens={maxTokens}
              expandedDirs={expandedDirs}
              selectedFilePath={selectedFilePath}
              onToggleDir={toggleDir}
              onSelectFile={onSelectFile}
            />
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------
          Rail Footer: Stats & Overview
          --------------------------------------------------------------------- */}
      <div className="p-2 border-t border-[var(--border-card)] bg-[var(--bg-card-elevated)] shrink-0 flex items-center justify-between text-[10px] font-mono text-[var(--ink-muted)]">
        <span className="truncate max-w-[150px]">
          {blueprint.metadata.fullName || blueprint.repoId}
        </span>
        <span>{formatTokens(blueprint.stats?.totalTokens || 0)} tok</span>
      </div>
    </aside>
  );
}

// =============================================================================
// Recursive File Tree Renderer Component
// =============================================================================

interface FileTreeRendererProps {
  node: FileTreeNode;
  depth: number;
  maxTokens: number;
  expandedDirs: Record<string, boolean>;
  selectedFilePath: string | null;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
}

function FileTreeRenderer({
  node,
  depth,
  maxTokens,
  expandedDirs,
  selectedFilePath,
  onToggleDir,
  onSelectFile,
}: FileTreeRendererProps) {
  // Sort children: directories first alphabetically, then files
  const sortedEntries = useMemo(() => {
    return Array.from(node.children.entries()).sort(([, a], [, b]) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [node.children]);

  return (
    <>
      {sortedEntries.map(([key, child]) => {
        if (child.isDir) {
          const isExpanded = expandedDirs[child.fullPath] !== false; // default open
          return (
            <div key={child.fullPath || key} className="select-none">
              <div
                onClick={() => onToggleDir(child.fullPath)}
                style={{ paddingLeft: `${Math.max(depth * 8 + 4, 4)}px` }}
                className="flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
              >
                <span className="text-[var(--ink-muted)]">
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </span>
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-[var(--cobalt-ice)] shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-[var(--cobalt-bright)] shrink-0" />
                )}
                <span className="font-medium truncate">{child.name}</span>
              </div>

              {isExpanded && (
                <FileTreeRenderer
                  node={child}
                  depth={depth + 1}
                  maxTokens={maxTokens}
                  expandedDirs={expandedDirs}
                  selectedFilePath={selectedFilePath}
                  onToggleDir={onToggleDir}
                  onSelectFile={onSelectFile}
                />
              )}
            </div>
          );
        }

        // File Leaf Node
        const file = child.fileRecord;
        const isSelected = selectedFilePath === child.fullPath;
        const tokens = file?.estimatedTokens || 0;
        const tokenRatio = Math.min(Math.max(tokens / maxTokens, 0.05), 1);

        return (
          <div
            key={child.fullPath}
            onClick={() => onSelectFile(child.fullPath)}
            style={{ paddingLeft: `${Math.max(depth * 8 + 14, 14)}px` }}
            className={`group flex items-center justify-between gap-1.5 py-1 px-1.5 rounded cursor-pointer text-[11px] transition-all ${
              isSelected
                ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] font-medium border border-[var(--cobalt-border)] shadow-2xs'
                : 'text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] border border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {getFileIcon(file?.extension || '')}
              <span className="truncate">{child.name}</span>
              {file?.isEntrypoint && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[var(--emerald)] shrink-0"
                  title="Application Entrypoint"
                />
              )}
            </div>

            {/* Token Micro-Bar Indicator */}
            <div className="flex items-center gap-1 shrink-0 font-mono text-[9px] text-[var(--ink-muted)]">
              <div
                className="w-10 bg-[var(--bg-void)] h-1.5 rounded-full overflow-hidden border border-[var(--border-subtle)]"
                title={`${tokens.toLocaleString()} estimated tokens`}
              >
                <div
                  className="bg-[var(--cobalt-core)] h-full rounded-full transition-all"
                  style={{ width: `${tokenRatio * 100}%` }}
                />
              </div>
              <span className="w-6 text-right">{formatTokens(tokens)}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}
