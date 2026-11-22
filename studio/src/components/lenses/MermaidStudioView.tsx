'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  MermaidDiagramSpec,
  VisualAtlasBlueprint,
} from '@shared/types';
import { postGenerateDiagram, postModifyDiagram } from '@/lib/api';
import { safeSetHTML, sanitizeMermaidSvg } from '@/lib/sanitize';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  Layers,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface MermaidStudioViewProps {
  blueprint: VisualAtlasBlueprint;
  resolvedTheme: 'dark' | 'light';
  onPeekFile: (filePath: string) => void;
  onDiagramsUpdated?: (diagrams: MermaidDiagramSpec[]) => void;
}

type DiagramKindTab = 'all' | 'architecture' | 'sequence' | 'class';

/**
 * Default fallback diagram generator if blueprint.diagrams is empty
 */
function createDefaultDiagramSpec(blueprint: VisualAtlasBlueprint): MermaidDiagramSpec {
  const repoName = blueprint.metadata?.name || 'Repository';
  const pattern = blueprint.architecturePattern || 'Modular System';

  // Build high-level flowchart from blueprint subsystems or nodes
  let nodesSnippet = '';
  const nodeFileMap: Record<string, string> = {};

  if (blueprint.subsystems && blueprint.subsystems.length > 0) {
    blueprint.subsystems.slice(0, 6).forEach((sub, idx) => {
      const cleanId = `Sub_${idx}_${sub.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const primaryFile = sub.entrypointPaths?.[0] || sub.filePaths?.[0] || '';
      if (primaryFile) {
        nodeFileMap[cleanId] = primaryFile;
      }
      nodesSnippet += `    ${cleanId}["${sub.name}<br/><small style='opacity:0.7'>${sub.layer}</small>"]\n`;
    });
  } else if (blueprint.nodes && blueprint.nodes.length > 0) {
    blueprint.nodes.slice(0, 8).forEach((node, idx) => {
      const cleanId = `Node_${idx}_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (node.primaryFile) {
        nodeFileMap[cleanId] = node.primaryFile;
      }
      nodesSnippet += `    ${cleanId}["${node.label}<br/><small style='opacity:0.7'>${node.kind}</small>"]\n`;
    });
  } else {
    nodesSnippet = `    Client["Client / Web UI"]\n    Gateway["API Gateway / Edge"]\n    Core["Core Intelligence Engine"]\n    Store[("Data Storage")]\n    Client --> Gateway\n    Gateway --> Core\n    Core --> Store\n`;
  }

  // Inter-connect nodes if not already wired
  let edgesSnippet = '';
  const keys = Object.keys(nodeFileMap);
  for (let i = 0; i < keys.length - 1; i++) {
    edgesSnippet += `    ${keys[i]} --> ${keys[i + 1]}\n`;
  }

  const code = `graph TD\n    title["${repoName} — ${pattern}"]\n${nodesSnippet}${edgesSnippet}`;

  return {
    id: 'default-arch-overview',
    kind: 'architecture',
    title: 'Architecture Overview',
    subtitle: pattern,
    code,
    nodeFileMap,
    modelUsed: 'architect-fallback',
    generatedAt: new Date().toISOString(),
  };
}

export function MermaidStudioView({
  blueprint,
  resolvedTheme,
  onPeekFile,
  onDiagramsUpdated,
}: MermaidStudioViewProps) {
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, '_');

  // Diagrams state initialized from blueprint
  const [diagrams, setDiagrams] = useState<MermaidDiagramSpec[]>(() => {
    if (blueprint.diagrams && blueprint.diagrams.length > 0) {
      return blueprint.diagrams;
    }
    return [createDefaultDiagramSpec(blueprint)];
  });

  // Keep in sync if parent blueprint updates
  useEffect(() => {
    if (blueprint.diagrams && blueprint.diagrams.length > 0) {
      setDiagrams(blueprint.diagrams);
    }
  }, [blueprint.diagrams]);

  // Tab filtering & Active selection
  const [activeTab, setActiveTab] = useState<DiagramKindTab>('architecture');
  const [activeDiagramId, setActiveDiagramId] = useState<string>(() => {
    if (diagrams.length > 0) return diagrams[0].id;
    return '';
  });

  const filteredDiagrams = useMemo(() => {
    if (activeTab === 'all') return diagrams;
    return diagrams.filter((d) => d.kind === activeTab);
  }, [diagrams, activeTab]);

  const activeDiagram = useMemo(() => {
    const found = diagrams.find((d) => d.id === activeDiagramId);
    if (found) return found;
    return filteredDiagrams[0] || diagrams[0] || null;
  }, [diagrams, activeDiagramId, filteredDiagrams]);

  // Live code editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editedCode, setEditedCode] = useState('');
  const [isCodeDirty, setIsCodeDirty] = useState(false);

  // Sync edited code when active diagram changes
  useEffect(() => {
    if (activeDiagram) {
      setEditedCode(activeDiagram.code);
      setIsCodeDirty(false);
    }
  }, [activeDiagram]);

  // Pan & Zoom canvas state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const svgOutputRef = useRef<HTMLDivElement>(null);

  // Rendering state
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rawSvgMarkup, setRawSvgMarkup] = useState<string>('');

  // AI Modification state
  const [customPrompt, setCustomPrompt] = useState('');
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customizeError, setCustomizeError] = useState<string | null>(null);

  // Generation dropdown
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);

  // Toast / feedback message
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Render diagram using Mermaid v11
  const renderCurrentDiagram = useCallback(
    async (codeToRender: string) => {
      if (typeof window === 'undefined') return;
      if (!codeToRender || !codeToRender.trim()) {
        setRenderError('Empty diagram code provided.');
        return;
      }

      setIsRendering(true);
      setRenderError(null);

      try {
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default || mermaidModule;

        const isDark = resolvedTheme === 'dark';

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: isDark ? 'base' : 'default',
          fontFamily: 'var(--font-sans), system-ui, -apple-system, sans-serif',
          themeVariables: isDark
            ? {
                darkMode: true,
                background: '#080A0E',
                primaryColor: '#0E1218',
                primaryTextColor: '#F1F3F4',
                primaryBorderColor: '#1A73E8',
                lineColor: '#8AB4F8',
                secondaryColor: '#141820',
                tertiaryColor: '#080A0E',
                nodeBorder: '#1A73E8',
                mainBkg: '#0E1218',
                textColor: '#F1F3F4',
                edgeLabelBackground: '#080A0E',
                actorBkg: '#0E1218',
                actorBorder: '#4285F4',
                actorTextColor: '#F1F3F4',
                signalColor: '#8AB4F8',
                signalTextColor: '#F1F3F4',
                labelBoxBkgColor: '#0E1218',
                labelBoxBorderColor: '#4285F4',
                labelTextColor: '#F1F3F4',
                loopTextColor: '#F1F3F4',
                noteBorderColor: '#4285F4',
                noteBkgColor: '#141820',
                noteTextColor: '#F1F3F4',
                activationBorderColor: '#4285F4',
                activationBkgColor: '#1A73E8',
                sequenceNumberColor: '#FFFFFF',
                classText: '#F1F3F4',
                fontSize: '13px',
              }
            : {
                darkMode: false,
                background: '#FFFFFF',
                primaryColor: '#F8F9FA',
                primaryTextColor: '#202124',
                primaryBorderColor: '#1A73E8',
                lineColor: '#1A73E8',
                secondaryColor: '#FFFFFF',
                tertiaryColor: '#F1F3F4',
                nodeBorder: '#1A73E8',
                mainBkg: '#FFFFFF',
                textColor: '#202124',
                edgeLabelBackground: '#FFFFFF',
                fontSize: '13px',
              },
        });

        const uniqueRenderId = `mermaid-canvas-${instanceId}-${Date.now().toString(36)}`;
        const { svg } = await mermaid.render(uniqueRenderId, codeToRender);

        // Sanitize generated SVG markup with DOMPurify SVG profile
        const cleanSvg = await sanitizeMermaidSvg(svg);
        setRawSvgMarkup(cleanSvg);

        if (svgOutputRef.current) {
          await safeSetHTML(svgOutputRef.current, cleanSvg);
          wireNodeClickListeners();
        }
      } catch (err: unknown) {
        console.error('[MermaidStudioView] render error:', err);
        const errorText = err instanceof Error ? err.message : String(err);
        setRenderError(errorText);
      } finally {
        setIsRendering(false);
      }
    },
    [instanceId, resolvedTheme]
  );

  // Attach interactive click listeners & hover styling to Mermaid SVG nodes
  const wireNodeClickListeners = useCallback(() => {
    if (!svgOutputRef.current || !activeDiagram) return;

    const container = svgOutputRef.current;
    const nodeFileMap = activeDiagram.nodeFileMap || {};
    const entries = Object.entries(nodeFileMap);
    if (entries.length === 0) return;

    // Mermaid generates elements like g.node, g.cluster, .flowchart-node
    const nodeNodes = container.querySelectorAll<SVGGElement>('.node, .cluster, [id*="flowchart-"]');

    nodeNodes.forEach((nodeEl) => {
      const elId = nodeEl.id || '';
      const elText = nodeEl.textContent?.trim().toLowerCase() || '';

      let matchedFile: string | undefined;

      for (const [key, filePath] of entries) {
        const keyLower = key.toLowerCase();
        if (
          elId.toLowerCase().includes(keyLower) ||
          elText.includes(keyLower) ||
          keyLower.includes(elText)
        ) {
          matchedFile = filePath;
          break;
        }
      }

      if (matchedFile) {
        nodeEl.style.cursor = 'pointer';
        nodeEl.setAttribute('role', 'button');
        nodeEl.setAttribute('tabindex', '0');
        nodeEl.setAttribute('aria-label', `Inspect code for ${matchedFile}`);
        nodeEl.classList.add('mermaid-studio-clickable-node');

        const handleClick = (e: MouseEvent) => {
          e.stopPropagation();
          onPeekFile(matchedFile!);
          showToast(`Peeking ${matchedFile}`);
        };

        nodeEl.onclick = handleClick;
      }
    });
  }, [activeDiagram, onPeekFile, showToast]);

  // Re-render when active diagram or resolved theme changes
  useEffect(() => {
    if (activeDiagram) {
      renderCurrentDiagram(activeDiagram.code);
    }
  }, [activeDiagram, renderCurrentDiagram]);

  // Pan interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only left click initiates pan on background
    if (e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((prev) => Math.min(Math.max(0.3, prev + delta), 3.0));
    }
  };

  // Zoom control helpers
  const zoomIn = () => setZoom((prev) => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setZoom((prev) => Math.max(prev - 0.2, 0.3));
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Export handlers
  const handleExportSvg = () => {
    if (!rawSvgMarkup || !activeDiagram) return;
    const blob = new Blob([rawSvgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDiagram.id || 'gitdiagram'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('SVG exported successfully');
  };

  const handleExportPng = () => {
    if (!svgOutputRef.current || !activeDiagram) return;
    const svgEl = svgOutputRef.current.querySelector('svg');
    if (!svgEl) return;

    try {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        const scale = 2; // high-dpi crisp rendering
        const rect = svgEl.getBoundingClientRect();
        const width = (rect.width || 800) * scale;
        const height = (rect.height || 600) * scale;

        canvas.width = width;
        canvas.height = height;

        if (ctx) {
          ctx.fillStyle = resolvedTheme === 'dark' ? '#080A0E' : '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `${activeDiagram.id || 'gitdiagram'}.png`;
          a.click();
          showToast('PNG exported successfully');
        }
        URL.revokeObjectURL(url);
      };

      img.src = url;
    } catch (err) {
      console.error('[MermaidStudioView] PNG export error:', err);
      showToast('PNG export failed, please use SVG export');
    }
  };

  const handleCopyMarkdown = () => {
    if (!activeDiagram) return;
    const snippet = `\`\`\`mermaid\n${activeDiagram.code}\n\`\`\``;
    navigator.clipboard.writeText(snippet);
    showToast('Mermaid markdown copied to clipboard');
  };

  // AI Modification handler
  const handleApplyAiCustomization = async (instructionToUse?: string) => {
    const prompt = instructionToUse || customPrompt;
    if (!prompt.trim() || !activeDiagram) return;

    setIsCustomizing(true);
    setCustomizeError(null);

    try {
      const modified = await postModifyDiagram(
        blueprint.repoId,
        activeDiagram.id,
        prompt.trim()
      );

      const nextDiagrams = diagrams.map((d) => (d.id === modified.id ? modified : d));
      setDiagrams(nextDiagrams);
      onDiagramsUpdated?.(nextDiagrams);
      setCustomPrompt('');
      showToast('Diagram updated with AI instructions');
    } catch (err: unknown) {
      console.error('[MermaidStudioView] modify diagram error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to modify diagram';
      setCustomizeError(msg);
      showToast(msg);
    } finally {
      setIsCustomizing(false);
    }
  };

  // AI Generation handler
  const handleGenerateKind = async (kind: 'architecture' | 'sequence' | 'class') => {
    setGenerateMenuOpen(false);
    setIsGenerating(true);

    try {
      const generatedSpecs = await postGenerateDiagram(blueprint.repoId, kind);

      if (generatedSpecs && generatedSpecs.length > 0) {
        // Merge or replace
        const existingIds = new Set(diagrams.map((d) => d.id));
        const newOnes = generatedSpecs.filter((s) => !existingIds.has(s.id));
        const nextDiagrams = [...newOnes, ...diagrams];

        setDiagrams(nextDiagrams);
        onDiagramsUpdated?.(nextDiagrams);
        setActiveDiagramId(generatedSpecs[0].id);
        setActiveTab(kind);
        showToast(`Generated ${kind} diagram (${generatedSpecs.length} specs)`);
      } else {
        showToast(`No new ${kind} diagrams generated`);
      }
    } catch (err: unknown) {
      console.error('[MermaidStudioView] generate diagram error:', err);
      const msg = err instanceof Error ? err.message : 'Generation failed';
      showToast(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Manual code editor apply
  const handleApplyEditorChanges = () => {
    if (!activeDiagram) return;
    const updated: MermaidDiagramSpec = {
      ...activeDiagram,
      code: editedCode,
    };
    const nextDiagrams = diagrams.map((d) => (d.id === updated.id ? updated : d));
    setDiagrams(nextDiagrams);
    onDiagramsUpdated?.(nextDiagrams);
    setIsCodeDirty(false);
    renderCurrentDiagram(editedCode);
    showToast('Code changes applied');
  };

  // Quick suggestion chips for the AI customizer bar
  const quickSuggestions = [
    'Highlight data ingress pipeline & caching layer',
    'Show authentication & JWT verification flow',
    'Add error handling and dead letter queue',
    'Group modules into bounded domain contexts',
  ];

  return (
    <div
      className={`relative flex flex-col w-full h-full select-none overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50 bg-[var(--bg-void)]' : 'bg-[var(--bg-void)]'
      }`}
    >
      {/* Top Header Bar: Kind Tabs, Diagram Selector, Actions */}
      <header className="flex-none flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-card)] bg-[var(--bg-card)]/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-none py-0.5">
          {/* Main kind tabs */}
          <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)]">
            {(['architecture', 'sequence', 'class', 'all'] as const).map((tab) => {
              const count =
                tab === 'all'
                  ? diagrams.length
                  : diagrams.filter((d) => d.kind === tab).length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    activeTab === tab
                      ? 'bg-[var(--cobalt-core)] text-white shadow-sm'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)]'
                  }`}
                >
                  <span className="capitalize">{tab}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        activeTab === tab
                          ? 'bg-white/20 text-white'
                          : 'bg-[var(--bg-subtle)] text-[var(--ink-muted)]'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Diagram Variant Pills (if multiple in this kind) */}
          {filteredDiagrams.length > 1 && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--border-subtle)] overflow-x-auto">
              {filteredDiagrams.map((d) => {
                const isSelected = activeDiagram?.id === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setActiveDiagramId(d.id)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-all whitespace-nowrap ${
                      isSelected
                        ? 'border-[var(--cobalt-core)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] font-medium shadow-xs'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    {d.title}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Toolbar: + Generate dropdown, Toggle Code, Export & Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Generate Dropdown */}
          <div className="relative">
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => setGenerateMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white transition-all shadow-xs disabled:opacity-50"
            >
              {isGenerating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>Generate</span>
              <ChevronDown className="w-3 h-3 opacity-80" />
            </button>

            {generateMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)] shadow-xl p-1 z-50">
                <button
                  type="button"
                  onClick={() => handleGenerateKind('architecture')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--ink-primary)] rounded-lg hover:bg-[var(--cobalt-tint)] hover:text-[var(--cobalt-ice)] transition-colors text-left"
                >
                  <Layers className="w-3.5 h-3.5 text-[var(--cobalt-ice)]" />
                  <div>
                    <div className="font-medium">Architecture</div>
                    <div className="text-[10px] text-[var(--ink-muted)]">Subsystems & Layers</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateKind('sequence')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--ink-primary)] rounded-lg hover:bg-[var(--cobalt-tint)] hover:text-[var(--cobalt-ice)] transition-colors text-left"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[var(--emerald)]" />
                  <div>
                    <div className="font-medium">Sequence Flow</div>
                    <div className="text-[10px] text-[var(--ink-muted)]">Request execution flow</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateKind('class')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--ink-primary)] rounded-lg hover:bg-[var(--cobalt-tint)] hover:text-[var(--cobalt-ice)] transition-colors text-left"
                >
                  <FileCode className="w-3.5 h-3.5 text-[var(--amber)]" />
                  <div>
                    <div className="font-medium">Class & Entity</div>
                    <div className="text-[10px] text-[var(--ink-muted)]">Types, interfaces & data</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Toggle Code / Peek Source Editor */}
          <button
            type="button"
            onClick={() => setEditorOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              editorOpen
                ? 'border-[var(--cobalt-ice)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Mermaid Code</span>
          </button>

          {/* Export Dropdown / Buttons */}
          <div className="flex items-center border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-card-elevated)] p-0.5">
            <button
              type="button"
              onClick={handleExportSvg}
              title="Export SVG"
              className="px-2 py-1 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] rounded transition-colors"
            >
              SVG
            </button>
            <div className="w-[1px] h-3 bg-[var(--border-subtle)]" />
            <button
              type="button"
              onClick={handleExportPng}
              title="Export PNG"
              className="px-2 py-1 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] rounded transition-colors"
            >
              PNG
            </button>
            <div className="w-[1px] h-3 bg-[var(--border-subtle)]" />
            <button
              type="button"
              onClick={handleCopyMarkdown}
              title="Copy Markdown"
              className="p-1.5 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] rounded transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Canvas'}
            className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Main Studio Body: Canvas + Drawer */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Canvas Area */}
        <div
          ref={canvasContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="relative flex-1 w-full h-full overflow-hidden cursor-grab active:cursor-grabbing bg-[radial-gradient(var(--stage-dot)_1px,transparent_1px)] bg-[size:24px_24px] bg-[var(--bg-void)] flex items-center justify-center"
        >
          {/* Floating Canvas Controls: Zoom, Pan Reset, Legend */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-card-elevated)]/90 backdrop-blur-md border border-[var(--border-card)] shadow-lg">
            <button
              type="button"
              onClick={zoomIn}
              title="Zoom In"
              className="p-1.5 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={zoomOut}
              title="Zoom Out"
              className="p-1.5 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="w-[1px] h-4 bg-[var(--border-subtle)]" />
            <button
              type="button"
              onClick={resetZoom}
              title="Reset Zoom & Pan"
              className="px-2 py-1 text-xs font-mono text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] rounded-lg transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{Math.round(zoom * 100)}%</span>
            </button>
          </div>

          {/* Active Diagram Details Banner */}
          {activeDiagram && (
            <div className="absolute top-4 right-4 z-10 max-w-sm p-2.5 rounded-xl bg-[var(--bg-card-elevated)]/90 backdrop-blur-md border border-[var(--border-card)] shadow-lg flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]">
                <Layers className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-xs font-semibold text-[var(--ink-primary)] truncate">
                    {activeDiagram.title}
                  </h2>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-[var(--bg-subtle)] text-[var(--cobalt-ice)]">
                    {activeDiagram.kind}
                  </span>
                </div>
                {activeDiagram.subtitle && (
                  <p className="text-[11px] text-[var(--ink-secondary)] truncate mt-0.5">
                    {activeDiagram.subtitle}
                  </p>
                )}
                <div className="text-[10px] text-[var(--ink-muted)] mt-1 flex items-center gap-2">
                  <span>Model: {activeDiagram.modelUsed || 'Gemini 4'}</span>
                  <span>•</span>
                  <span>
                    {Object.keys(activeDiagram.nodeFileMap || {}).length} clickable nodes
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Loading Shimmer Indicator */}
          {isRendering && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[var(--bg-void)]/60 backdrop-blur-xs">
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[var(--bg-card-elevated)] border border-[var(--cobalt-border)] shadow-xl">
                <RefreshCw className="w-4 h-4 text-[var(--cobalt-ice)] animate-spin" />
                <span className="text-xs text-[var(--ink-primary)] font-medium">
                  Rendering GitDiagram with Mermaid v11...
                </span>
              </div>
            </div>
          )}

          {/* Error Message Box */}
          {renderError && !isRendering && (
            <div className="absolute inset-x-8 top-16 z-20 max-w-xl mx-auto p-4 rounded-xl bg-[var(--vermilion-bg)] border border-[var(--vermilion-border)] shadow-2xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[var(--vermilion)] flex-none mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--vermilion)]">
                    Mermaid Rendering Error
                  </h3>
                  <p className="text-xs text-[var(--ink-secondary)] mt-1 font-mono break-all line-clamp-3">
                    {renderError}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => activeDiagram && renderCurrentDiagram(activeDiagram.code)}
                      className="px-3 py-1 text-xs font-medium rounded-lg bg-[var(--vermilion)] text-white hover:opacity-90 transition-opacity"
                    >
                      Retry Render
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorOpen(true)}
                      className="px-3 py-1 text-xs font-medium rounded-lg bg-[var(--bg-card)] border border-[var(--border-card)] text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)]"
                    >
                      Inspect Code
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Live Pan/Zoom SVG Render Container */}
          <div
            className="transition-transform duration-75 ease-out select-none flex items-center justify-center p-8"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            <div
              ref={svgOutputRef}
              className="mermaid-studio-svg-wrapper flex items-center justify-center [&_svg]:max-w-none [&_svg]:h-auto [&_svg]:drop-shadow-lg"
            />
          </div>

          {/* Bottom Dock: AI Customizer Bar & Clickable Node Mappings */}
          <div className="absolute bottom-4 inset-x-4 z-20 flex flex-col items-center gap-2 pointer-events-none">
            {/* Clickable Node Badges Strip (Quick Peek Shortcuts) */}
            {activeDiagram && Object.keys(activeDiagram.nodeFileMap || {}).length > 0 && (
              <div className="pointer-events-auto flex items-center gap-1.5 max-w-3xl overflow-x-auto scrollbar-none px-3 py-1.5 rounded-full bg-[var(--bg-card-elevated)]/90 backdrop-blur-md border border-[var(--border-card)] shadow-md">
                <span className="text-[10px] text-[var(--ink-muted)] flex items-center gap-1 flex-none mr-1">
                  <FileCode className="w-3 h-3 text-[var(--cobalt-ice)]" />
                  Bound files:
                </span>
                {Object.entries(activeDiagram.nodeFileMap).map(([nodeId, filePath]) => {
                  const fileName = filePath.split('/').pop() || filePath;
                  return (
                    <button
                      key={nodeId}
                      type="button"
                      onClick={() => {
                        onPeekFile(filePath);
                        showToast(`Peeking ${filePath}`);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:text-[var(--cobalt-ice)] hover:border-[var(--cobalt-border)] hover:bg-[var(--cobalt-tint)] transition-all whitespace-nowrap"
                    >
                      <span className="font-semibold text-[var(--ink-primary)]">{nodeId}:</span>
                      <span>{fileName}</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* AI Customizer Input Bar */}
            <div className="pointer-events-auto w-full max-w-2xl flex flex-col gap-1.5 p-2 rounded-2xl bg-[var(--bg-card)]/95 backdrop-blur-xl border border-[var(--border-card)] shadow-2xl">
              {/* Quick Prompt Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-1">
                {quickSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setCustomPrompt(suggestion);
                      handleApplyAiCustomization(suggestion);
                    }}
                    disabled={isCustomizing}
                    className="flex-none text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:text-[var(--cobalt-ice)] hover:border-[var(--cobalt-border)] hover:bg-[var(--cobalt-tint)] transition-all whitespace-nowrap disabled:opacity-40"
                  >
                    ✦ {suggestion}
                  </button>
                ))}
              </div>

              {/* Input row */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleApplyAiCustomization();
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1 flex items-center">
                  <div className="absolute left-3 text-[var(--cobalt-ice)]">
                    {isCustomizing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </div>
                  <input
                    type="text"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="AI Diagram Customizer: e.g. Highlight caching flow, add auth barrier, split into microservices..."
                    disabled={isCustomizing}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)] text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--cobalt-bright)] focus:ring-1 focus:ring-[var(--cobalt-bright)] transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isCustomizing || !customPrompt.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white shadow-xs disabled:opacity-40 transition-all flex-none"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Customize</span>
                </button>
              </form>

              {customizeError && (
                <div className="text-[11px] text-[var(--vermilion)] px-2 pt-0.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 flex-none" />
                  <span className="truncate">{customizeError}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Secondary Drawer: Mermaid Code Editor & Source Peeker */}
        {editorOpen && (
          <aside className="w-96 flex-none border-l border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col z-30 shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-card)]">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[var(--cobalt-ice)]" />
                <h3 className="text-xs font-semibold text-[var(--ink-primary)]">
                  Mermaid Source Editor
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {isCodeDirty && (
                  <button
                    type="button"
                    onClick={handleApplyEditorChanges}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-[var(--cobalt-core)] text-white hover:bg-[var(--cobalt-bright)] transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    <span>Apply</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="p-1 rounded-md text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)]"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Code Editor Textarea */}
            <div className="flex-1 flex flex-col p-3 overflow-hidden">
              <div className="text-[11px] text-[var(--ink-secondary)] mb-2 flex items-center justify-between">
                <span>Edit Mermaid markup live:</span>
                <button
                  type="button"
                  onClick={() => {
                    if (activeDiagram) {
                      setEditedCode(activeDiagram.code);
                      setIsCodeDirty(false);
                      renderCurrentDiagram(activeDiagram.code);
                    }
                  }}
                  className="text-[10px] text-[var(--cobalt-ice)] hover:underline"
                >
                  Reset to original
                </button>
              </div>

              <textarea
                value={editedCode}
                onChange={(e) => {
                  setEditedCode(e.target.value);
                  setIsCodeDirty(true);
                }}
                spellCheck={false}
                className="flex-1 w-full p-3 rounded-lg bg-[var(--bg-card-elevated)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--ink-primary)] leading-relaxed resize-none focus:outline-none focus:border-[var(--cobalt-bright)] focus:ring-1 focus:ring-[var(--cobalt-bright)] selection:bg-[var(--cobalt-tint-strong)]"
              />
            </div>

            {/* Secondary Tab: Bound Files in this diagram */}
            <div className="p-3 border-t border-[var(--border-card)] bg-[var(--bg-card-elevated)]">
              <div className="text-[11px] font-semibold text-[var(--ink-primary)] mb-2 flex items-center justify-between">
                <span>Node-to-File Bindings ({Object.keys(activeDiagram?.nodeFileMap || {}).length})</span>
                <span className="text-[10px] text-[var(--ink-muted)]">Click node to peek</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5 scrollbar-thin">
                {activeDiagram && Object.entries(activeDiagram.nodeFileMap || {}).length > 0 ? (
                  Object.entries(activeDiagram.nodeFileMap).map(([nodeId, filePath]) => (
                    <div
                      key={nodeId}
                      onClick={() => onPeekFile(filePath)}
                      className="group flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--cobalt-border)] cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-mono text-[var(--cobalt-ice)] font-medium">
                          {nodeId}
                        </span>
                        <span className="text-[11px] text-[var(--ink-secondary)] truncate">
                          {filePath}
                        </span>
                      </div>
                      <ExternalLink className="w-3 h-3 text-[var(--ink-muted)] group-hover:text-[var(--cobalt-ice)] transition-colors flex-none ml-2" />
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-[var(--ink-muted)] italic">
                    No explicit node-to-file bindings mapped in this diagram.
                  </p>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--cobalt-border)] text-xs text-[var(--ink-primary)] shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          <Sparkles className="w-3.5 h-3.5 text-[var(--cobalt-ice)]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default MermaidStudioView;
