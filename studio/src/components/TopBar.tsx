'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import type { VisualLensId } from '@shared/types';
import {
  GitUnderstandPrismMark,
  GeminiSparkleMark,
  GitHubMark,
} from '@/components/BrandMarks';
import { NativeDialog } from '@/components/NativeDialog';
import { useTheme } from '@/lib/useTheme';
import { getByokConfig, setByokConfig, type ByokConfig } from '@/lib/api';

// =============================================================================
// Lens Switcher Contract & Visual Metadata
// =============================================================================

export interface VisualLensDefinition {
  id: VisualLensId;
  label: string;
  shortLabel: string;
  description: string;
  shortcut: '1' | '2' | '3' | '4' | '5' | '6' | '7';
  icon: (props: { className?: string; active?: boolean }) => ReactNode;
}

export const LENS_DEFINITIONS: readonly VisualLensDefinition[] = [
  {
    id: 'atlas',
    label: 'Atlas',
    shortLabel: 'Atlas',
    description: 'Spatial Architecture Atlas & Force-Directed Topology',
    shortcut: '1',
    icon: ({ className = 'w-3.5 h-3.5', active }) => (
      <svg
        className={className}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="8"
          cy="8"
          r="2.25"
          fill={active ? 'var(--cobalt-ice)' : 'currentColor'}
        />
        <circle cx="2.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="13.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="3.5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="12.5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M3.7 4.8L6.2 6.8M12.3 4.8L9.8 6.8M4.6 11.5L6.6 9.5M11.4 11.5L9.4 9.5"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeOpacity={active ? '0.9' : '0.45'}
        />
      </svg>
    ),
  },
  {
    id: 'strata3d',
    label: '3D Strata',
    shortLabel: 'Strata',
    description: '3D Isometric Architectural Strata Layers Stack',
    shortcut: '2',
    icon: ({ className = 'w-3.5 h-3.5', active }) => (
      <svg
        className={className}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M8 1.5L14 4.5L8 7.5L2 4.5L8 1.5Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          fill={active ? 'var(--cobalt-tint)' : 'none'}
        />
        <path
          d="M2 7.5L8 10.5L14 7.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 10.5L8 13.5L14 10.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'flows',
    label: 'Flows',
    shortLabel: 'Flows',
    description: 'Dynamic Code Execution Flows & Request Pathways',
    shortcut: '3',
    icon: ({ className = 'w-3.5 h-3.5', active }) => (
      <svg
        className={className}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="3" cy="8" r="1.5" fill="currentColor" />
        <circle
          cx="13"
          cy="4"
          r="1.5"
          fill={active ? 'var(--cobalt-ice)' : 'currentColor'}
        />
        <circle cx="13" cy="12" r="1.5" fill="currentColor" />
        <path
          d="M4.5 8C7.5 8 9 4 11.5 4"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M4.5 8C7.5 8 9 12 11.5 12"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeDasharray={active ? 'none' : '2 2'}
        />
      </svg>
    ),
  },
  {
    id: 'treemap',
    label: 'Treemap',
    shortLabel: 'Treemap',
    description: 'Proportional Token Treemap & Code Weight Hierarchy',
    shortcut: '4',
    icon: ({ className = 'w-3.5 h-3.5', active }) => (
      <svg
        className={className}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="1.5"
          y="1.5"
          width="13"
          height="13"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <line x1="8.5" y1="1.5" x2="8.5" y2="14.5" stroke="currentColor" strokeWidth="1" />
        <line x1="1.5" y1="7.5" x2="8.5" y2="7.5" stroke="currentColor" strokeWidth="1" />
        <line x1="8.5" y1="10" x2="14.5" y2="10" stroke="currentColor" strokeWidth="1" />
        {active && (
          <rect
            x="2.5"
            y="2.5"
            width="5"
            height="4"
            rx="0.5"
            fill="var(--cobalt-tint-strong)"
          />
        )}
      </svg>
    ),
  },
  {
    id: 'xray',
    label: 'X-Ray',
    shortLabel: 'X-Ray',
    description: 'Decision-1 Calibrated Architectural Health & Risk Heatmap',
    shortcut: '5',
    icon: ({ className = 'w-3.5 h-3.5', active }) => (
      <svg
        className={className}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="8"
          cy="8"
          r="6"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray={active ? 'none' : '3 1.5'}
        />
        <circle
          cx="8"
          cy="8"
          r="2.5"
          stroke={active ? 'var(--cobalt-ice)' : 'currentColor'}
          strokeWidth="1"
        />
        <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="8" y1="12" x2="8" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="1" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="12" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'mermaid',
    label: 'Mermaid',
    shortLabel: 'Diagrams',
    description: 'Dynamic Sequence, Class, and ER Code Diagrams',
    shortcut: '6',
    icon: ({ className = 'w-3.5 h-3.5', active }) => (
      <svg
        className={className}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="1.5"
          y="2"
          width="4.5"
          height="3.5"
          rx="1"
          stroke="currentColor"
          strokeWidth="1"
          fill={active ? 'var(--cobalt-tint)' : 'none'}
        />
        <rect
          x="10"
          y="2"
          width="4.5"
          height="3.5"
          rx="1"
          stroke="currentColor"
          strokeWidth="1"
        />
        <rect
          x="5.75"
          y="10.5"
          width="4.5"
          height="3.5"
          rx="1"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path
          d="M3.75 5.5V7.5H8V10.5M12.25 5.5V7.5H8"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'media',
    label: 'Media',
    shortLabel: 'Media',
    description: 'Multimodal Audio Tour, Video Reel & Voice Digest Stage',
    shortcut: '7',
    icon: ({ className = 'w-3.5 h-3.5', active }) => (
      <svg
        className={className}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="1.5"
          y="2.5"
          width="13"
          height="11"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <polygon
          points="6.5,5.5 11,8 6.5,10.5"
          fill={active ? 'var(--cobalt-ice)' : 'currentColor'}
        />
      </svg>
    ),
  },
] as const;

// =============================================================================
// TopBar Component Props
// =============================================================================

export interface TopBarProps {
  /** Currently active visual lens */
  currentLens?: VisualLensId;
  /** Callback when user selects a visual lens */
  onSelectLens?: (lens: VisualLensId) => void;
  /** Repository canonical slug (e.g. 'owner/repo') */
  repoSlug?: string;
  /** Repository branch (defaults to 'main') */
  branch?: string;
  /** Direct link to GitHub repository */
  repoUrl?: string;
  /** Callback when repo pill is clicked */
  onRepoClick?: () => void;
  /** Whether Gemini 3.8 Live Voice tutor session is actively connected */
  isLiveVoiceActive?: boolean;
  /** Callback when Live Voice button is toggled */
  onToggleLiveVoice?: () => void;
  /** Callback when MCP / .md export button is clicked (falls back to built-in dialog) */
  onMcpClick?: () => void;
  /** Callback when BYOK Settings button is clicked (falls back to built-in dialog) */
  onSettingsClick?: () => void;
  /** Callback when brand logo / home return is clicked */
  onHomeClick?: () => void;
  /** Additional container class styling */
  className?: string;
}

// =============================================================================
// TopBar Component
// =============================================================================

export function TopBar({
  currentLens: controlledLens,
  onSelectLens,
  repoSlug = 'git-understand/showcase',
  branch = 'main',
  repoUrl,
  onRepoClick,
  isLiveVoiceActive = false,
  onToggleLiveVoice,
  onMcpClick,
  onSettingsClick,
  onHomeClick,
  className = '',
}: TopBarProps) {
  // Uncontrolled lens state fallback
  const [internalLens, setInternalLens] = useState<VisualLensId>('atlas');
  const activeLens = controlledLens ?? internalLens;

  // Theme integration
  const { resolvedTheme, toggleQuick } = useTheme();

  // Local built-in dialog state (used when no external click handlers are provided)
  const [isByokOpen, setIsByokOpen] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [byokForm, setByokForm] = useState<ByokConfig>({
    geminiApiKey: '',
    githubToken: '',
    deepThinking: false,
  });
  const [byokSavedToast, setByokSavedToast] = useState(false);
  const [mcpCopied, setMcpCopied] = useState<string | null>(null);

  // Sync initial BYOK config on mount
  useEffect(() => {
    setByokForm(getByokConfig());
  }, [isByokOpen]);

  // Lens selection handler
  const handleLensSelect = useCallback(
    (lensId: VisualLensId) => {
      if (onSelectLens) {
        onSelectLens(lensId);
      } else {
        setInternalLens(lensId);
      }
    },
    [onSelectLens]
  );

  // Global Keyboard Shortcuts (1..7 switches visual lens)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is holding modifiers (Cmd/Ctrl/Alt)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Ignore when focused inside interactive form elements or open dialogs
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('dialog[open]'))
      ) {
        return;
      }

      const shortcutMap: Record<string, VisualLensId> = {
        '1': 'atlas',
        '2': 'strata3d',
        '3': 'flows',
        '4': 'treemap',
        '5': 'xray',
        '6': 'mermaid',
        '7': 'media',
      };

      if (e.key in shortcutMap) {
        e.preventDefault();
        handleLensSelect(shortcutMap[e.key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleLensSelect]);

  // Open BYOK Settings
  const handleOpenSettings = () => {
    if (onSettingsClick) {
      onSettingsClick();
    } else {
      setIsByokOpen(true);
    }
  };

  // Open MCP / .md Dialog
  const handleOpenMcp = () => {
    if (onMcpClick) {
      onMcpClick();
    } else {
      setIsMcpOpen(true);
    }
  };

  // Save BYOK Form
  const handleSaveByok = (e: React.FormEvent) => {
    e.preventDefault();
    setByokConfig(byokForm);
    setByokSavedToast(true);
    setTimeout(() => {
      setByokSavedToast(false);
      setIsByokOpen(false);
    }, 800);
  };

  // Clear BYOK Key
  const handleClearByok = () => {
    const cleared: ByokConfig = {
      geminiApiKey: '',
      githubToken: '',
      deepThinking: false,
    };
    setByokForm(cleared);
    setByokConfig(cleared);
  };

  // Copy text helper
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMcpCopied(label);
      setTimeout(() => setMcpCopied(null), 2200);
    } catch {
      // Fallback
    }
  };

  const hasCustomByok = Boolean(byokForm.geminiApiKey.trim());
  const effectiveRepoUrl = repoUrl || `https://github.com/${repoSlug}`;

  return (
    <>
      <header
        className={`sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-void)]/90 backdrop-blur-md transition-colors duration-200 select-none ${className}`}
        role="banner"
      >
        <div className="mx-auto flex h-14 max-w-full items-center justify-between gap-2 px-3 sm:px-4 lg:px-6">
          {/* =============================================================== */}
          {/* SECTION 1: Brand Mark + Home Return & Repo Pill                 */}
          {/* =============================================================== */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Brand Logo & Home Return */}
            {onHomeClick ? (
              <button
                type="button"
                onClick={onHomeClick}
                className="group flex items-center gap-2 rounded-lg p-1 text-left transition-all hover:bg-[var(--bg-subtle-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobalt-ice)]"
                title="GitUnderstand Home"
                aria-label="GitUnderstand Home"
              >
                <GitUnderstandPrismMark
                  size={24}
                  className="transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3"
                  glow
                />
                <span className="flex items-center gap-1.5 font-semibold tracking-tight text-[var(--ink-primary)] text-sm sm:text-base">
                  Git
                  <span className="text-[var(--cobalt-ice)]">Understand</span>
                </span>
              </button>
            ) : (
              <Link
                href="/"
                className="group flex items-center gap-2 rounded-lg p-1 text-left transition-all hover:bg-[var(--bg-subtle-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobalt-ice)]"
                title="GitUnderstand Home"
                aria-label="GitUnderstand Home"
              >
                <GitUnderstandPrismMark
                  size={24}
                  className="transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3"
                  glow
                />
                <span className="flex items-center gap-1.5 font-semibold tracking-tight text-[var(--ink-primary)] text-sm sm:text-base">
                  Git
                  <span className="text-[var(--cobalt-ice)]">Understand</span>
                </span>
              </Link>
            )}

            {/* Subtle Divider */}
            <div className="hidden sm:block h-4 w-px bg-[var(--border-subtle)]" />

            {/* Repo Pill */}
            <div className="flex items-center">
              {onRepoClick ? (
                <button
                  type="button"
                  onClick={onRepoClick}
                  className="group flex items-center gap-1.5 rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] px-2.5 py-1 text-xs font-mono text-[var(--ink-primary)] transition-all hover:border-[var(--cobalt-border)] hover:bg-[var(--bg-pill-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cobalt-ice)]"
                  title="Switch repository or branch"
                  aria-label={`Current repository: ${repoSlug} on branch ${branch}. Click to switch.`}
                >
                  <GitHubMark size={14} className="opacity-80 group-hover:opacity-100" />
                  <span className="max-w-[120px] sm:max-w-[180px] truncate font-medium">
                    {repoSlug}
                  </span>
                  <span className="hidden md:inline-flex items-center gap-1 text-[var(--ink-muted)]">
                    <svg
                      className="w-2.5 h-2.5 opacity-70"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    >
                      <circle cx="3" cy="3" r="1.5" />
                      <circle cx="3" cy="9" r="1.5" />
                      <circle cx="9" cy="4.5" r="1.5" />
                      <path d="M3 4.5v3M3 4.5C3 6.5 9 6.5 9 4.5" />
                    </svg>
                    {branch}
                  </span>
                </button>
              ) : (
                <a
                  href={effectiveRepoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-1.5 rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] px-2.5 py-1 text-xs font-mono text-[var(--ink-primary)] transition-all hover:border-[var(--cobalt-border)] hover:bg-[var(--bg-pill-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cobalt-ice)]"
                  title={`View ${repoSlug} on GitHub`}
                  aria-label={`GitHub repository ${repoSlug} on branch ${branch}`}
                >
                  <GitHubMark size={14} className="opacity-80 group-hover:opacity-100" />
                  <span className="max-w-[120px] sm:max-w-[180px] truncate font-medium">
                    {repoSlug}
                  </span>
                  <span className="hidden md:inline-flex items-center gap-1 text-[var(--ink-muted)]">
                    <svg
                      className="w-2.5 h-2.5 opacity-70"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    >
                      <circle cx="3" cy="3" r="1.5" />
                      <circle cx="3" cy="9" r="1.5" />
                      <circle cx="9" cy="4.5" r="1.5" />
                      <path d="M3 4.5v3M3 4.5C3 6.5 9 6.5 9 4.5" />
                    </svg>
                    {branch}
                  </span>
                </a>
              )}
            </div>
          </div>

          {/* =============================================================== */}
          {/* SECTION 2: 7 Visual Lens Switcher Pills (Hero Navigation)       */}
          {/* =============================================================== */}
          <nav
            aria-label="Visual Lenses"
            className="flex items-center overflow-x-auto no-scrollbar py-1"
          >
            <div
              role="tablist"
              aria-orientation="horizontal"
              className="flex items-center gap-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0.5 shadow-sm"
            >
              {LENS_DEFINITIONS.map((lens) => {
                const isActive = activeLens === lens.id;
                return (
                  <button
                    key={lens.id}
                    role="tab"
                    id={`lens-tab-${lens.id}`}
                    aria-selected={isActive}
                    aria-controls={`lens-panel-${lens.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => handleLensSelect(lens.id)}
                    className={`group relative flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobalt-ice)] ${
                      isActive
                        ? 'border border-[var(--cobalt-border-strong)] bg-[var(--bg-card-elevated)] text-[var(--cobalt-ice)] shadow-[var(--cobalt-glow)]'
                        : 'border border-transparent text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]'
                    }`}
                    title={`${lens.label} (Press ${lens.shortcut}) — ${lens.description}`}
                  >
                    <span className="shrink-0">
                      {lens.icon({ active: isActive })}
                    </span>
                    <span className="hidden xl:inline">{lens.label}</span>
                    <span className="inline xl:hidden">{lens.shortLabel}</span>

                    {/* Keyboard Shortcut Badge */}
                    <kbd
                      className={`hidden lg:inline-flex h-3.5 min-w-[14px] items-center justify-center rounded px-0.5 font-mono text-[9px] font-semibold transition-colors ${
                        isActive
                          ? 'bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)]'
                          : 'bg-[var(--bg-subtle)] text-[var(--ink-muted)] border border-[var(--border-subtle)] group-hover:text-[var(--ink-secondary)]'
                      }`}
                      aria-hidden="true"
                    >
                      {lens.shortcut}
                    </kbd>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* =============================================================== */}
          {/* SECTION 3: Live Voice CTA + MCP + BYOK + 2-State Theme Toggle  */}
          {/* =============================================================== */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Live Voice CTA Button */}
            <button
              type="button"
              onClick={onToggleLiveVoice}
              className={`group relative flex items-center gap-1.5 rounded-full px-2.5 sm:px-3 py-1 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobalt-ice)] ${
                isLiveVoiceActive
                  ? 'border border-[var(--emerald-border)] bg-[var(--emerald-bg)] text-[var(--emerald)] shadow-[0_0_16px_rgba(52,211,153,0.35)]'
                  : 'border border-[var(--cobalt-border)] bg-[var(--bg-card-elevated)] text-[var(--ink-primary)] hover:border-[var(--cobalt-bright)] hover:bg-[var(--cobalt-tint)] hover:text-[var(--cobalt-ice)]'
              }`}
              title="Gemini 3.8 Live Voice Codebase Tutor"
              aria-label={
                isLiveVoiceActive
                  ? 'Gemini 3.8 Live Voice connected. Click to pause or disconnect.'
                  : 'Start Gemini 3.8 Live Voice Tutor session'
              }
              aria-pressed={isLiveVoiceActive}
            >
              {isLiveVoiceActive ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--emerald)] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--emerald)]" />
                </span>
              ) : (
                <GeminiSparkleMark
                  size={14}
                  className="transition-transform duration-200 group-hover:scale-110"
                  glow
                />
              )}
              <span className="hidden sm:inline">Live Voice</span>
              <span className="inline sm:hidden">Live</span>
              {isLiveVoiceActive && (
                <span className="rounded bg-[var(--emerald)]/20 px-1 py-0.2 text-[9px] font-mono font-bold tracking-wider text-[var(--emerald)] uppercase">
                  ON
                </span>
              )}
            </button>

            {/* MCP / .md Export Button */}
            <button
              type="button"
              onClick={handleOpenMcp}
              className="flex items-center gap-1 rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] px-2 sm:px-2.5 py-1 text-xs font-mono text-[var(--ink-secondary)] transition-all hover:border-[var(--cobalt-border)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--ink-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cobalt-ice)]"
              title="Model Context Protocol (MCP) server & Markdown digest export (.md)"
              aria-label="Export Markdown digest or connect MCP agent server"
            >
              <svg
                className="w-3.5 h-3.5 opacity-80"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2.5 3.5h11a1 1 0 011 1v8a1 1 0 01-1 1h-11a1 1 0 01-1-1v-8a1 1 0 011-1z" />
                <path d="M4.5 7l2 2-2 2M8.5 11h3" />
              </svg>
              <span className="hidden md:inline">MCP / .md</span>
              <span className="inline md:hidden">.md</span>
            </button>

            {/* BYOK Settings Button */}
            <button
              type="button"
              onClick={handleOpenSettings}
              className="relative flex items-center justify-center rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] p-1.5 text-[var(--ink-secondary)] transition-all hover:border-[var(--cobalt-border)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--ink-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cobalt-ice)]"
              title={
                hasCustomByok
                  ? 'BYOK Settings (Custom Gemini Key active)'
                  : 'BYOK Settings (Bring Your Own Key)'
              }
              aria-label="Bring Your Own Key (BYOK) and Studio Settings"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10.5 5.5a3 3 0 10-2.4 2.94L7 9.5v1.5h1.5v1.5H10v1.5h1.5l1.5-1.5v-2l-.5-.5a3 3 0 00-2-4.5z" />
                <circle cx="10.5" cy="5.5" r="0.75" fill="currentColor" />
              </svg>
              {hasCustomByok && (
                <span
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--cobalt-bright)] ring-2 ring-[var(--bg-void)]"
                  title="Custom key active"
                />
              )}
            </button>

            {/* 2-State Theme Toggle (Obsidian Dark <-> Archival Paper Light) */}
            <button
              type="button"
              onClick={toggleQuick}
              className="flex items-center justify-center rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] p-1.5 text-[var(--ink-secondary)] transition-all hover:border-[var(--cobalt-border)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--ink-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cobalt-ice)]"
              title={
                resolvedTheme === 'dark'
                  ? 'Switch to Archival Paper light scheme'
                  : 'Switch to Obsidian Cobalt dark scheme'
              }
              aria-label={
                resolvedTheme === 'dark'
                  ? 'Current theme: Obsidian Cobalt. Click to switch to Archival Paper light scheme.'
                  : 'Current theme: Archival Paper. Click to switch to Obsidian Cobalt dark scheme.'
              }
            >
              {resolvedTheme === 'dark' ? (
                /* Sun Icon (Switch to Light) */
                <svg
                  className="w-3.5 h-3.5 text-[var(--amber)]"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="8" r="3" />
                  <path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
                </svg>
              ) : (
                /* Moon / Crescent Icon (Switch to Dark) */
                <svg
                  className="w-3.5 h-3.5 text-[var(--cobalt-deep)]"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M13.5 9.5a5.5 5.5 0 11-7-7 4.5 4.5 0 007 7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* BUILT-IN MODAL: BYOK Settings                                       */}
      {/* =================================================================== */}
      <NativeDialog
        open={isByokOpen}
        onClose={() => setIsByokOpen(false)}
        title="BYOK & Studio Settings"
        subtitle="Bring Your Own Key — Securely stored in your browser session for direct Gemini 4 & GitHub API calls."
        widthClass="w-[min(94vw,560px)]"
      >
        <form onSubmit={handleSaveByok} className="space-y-4 p-6">
          {/* Gemini API Key */}
          <div>
            <label
              htmlFor="byok-gemini-key"
              className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)] mb-1.5"
            >
              Google Gemini API Key
            </label>
            <input
              id="byok-gemini-key"
              type="password"
              autoComplete="off"
              placeholder="AIzaSy..."
              value={byokForm.geminiApiKey}
              onChange={(e) =>
                setByokForm((prev) => ({ ...prev, geminiApiKey: e.target.value }))
              }
              className="w-full rounded-lg border border-[var(--border-composer)] bg-[var(--bg-composer)] px-3 py-2 text-sm font-mono text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--cobalt-ice)] focus:outline-none focus:ring-1 focus:ring-[var(--cobalt-ice)]"
            />
            <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
              Get an API key with free tier quota from{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--cobalt-ice)] hover:underline"
              >
                Google AI Studio
              </a>
              . Supports Gemini 4 Argon, Carbon, Neon, and Gemini 3.8 Live.
            </p>
          </div>

          {/* GitHub Personal Access Token */}
          <div>
            <label
              htmlFor="byok-github-token"
              className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)] mb-1.5"
            >
              GitHub Token (Optional)
            </label>
            <input
              id="byok-github-token"
              type="password"
              autoComplete="off"
              placeholder="ghp_... or github_pat_..."
              value={byokForm.githubToken}
              onChange={(e) =>
                setByokForm((prev) => ({ ...prev, githubToken: e.target.value }))
              }
              className="w-full rounded-lg border border-[var(--border-composer)] bg-[var(--bg-composer)] px-3 py-2 text-sm font-mono text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--cobalt-ice)] focus:outline-none focus:ring-1 focus:ring-[var(--cobalt-ice)]"
            />
            <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
              Needed only for private repositories or to bypass GitHub public API rate limits (60 req/hr).
            </p>
          </div>

          {/* Deep Thinking Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] p-3">
            <div>
              <span className="block text-sm font-medium text-[var(--ink-primary)]">
                Extended Deep Thinking
              </span>
              <span className="block text-[11px] text-[var(--ink-muted)]">
                Enables Gemini 4 thinking_level=&apos;high&apos; and Decision-1 deep calibration.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={byokForm.deepThinking}
                onChange={(e) =>
                  setByokForm((prev) => ({
                    ...prev,
                    deepThinking: e.target.checked,
                  }))
                }
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-[var(--bg-subtle)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--cobalt-core)]" />
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleClearByok}
              className="text-xs text-[var(--ink-muted)] hover:text-[var(--vermilion)] transition-colors"
            >
              Clear Stored Keys
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsByokOpen(false)}
                className="rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-[var(--cobalt-core)] px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[var(--btn-primary-hover)] transition-all"
              >
                {byokSavedToast ? (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor">
                      <path d="M2.5 6l2.5 2.5 4.5-5" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Saved!
                  </>
                ) : (
                  'Save Settings'
                )}
              </button>
            </div>
          </div>
        </form>
      </NativeDialog>

      {/* =================================================================== */}
      {/* BUILT-IN MODAL: MCP Server & Markdown Digest (.md)                  */}
      {/* =================================================================== */}
      <NativeDialog
        open={isMcpOpen}
        onClose={() => setIsMcpOpen(false)}
        title="MCP Server & Markdown Digest (.md)"
        subtitle="Connect any coding agent or copy clean codebase digest for prompt ingestion."
        widthClass="w-[min(94vw,620px)]"
      >
        <div className="space-y-5 p-6">
          {/* Section 1: Connect via MCP */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--cobalt-ice)]">
                1. Connect Agent via MCP
              </span>
              <span className="text-[11px] text-[var(--ink-muted)]">
                Claude Code / Cursor / Windsurf
              </span>
            </div>
            <p className="text-xs text-[var(--ink-secondary)] mb-2">
              Launch the GitUnderstand Model Context Protocol server for this repository:
            </p>
            <div className="relative rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-composer)] p-3 font-mono text-xs text-[var(--ink-primary)]">
              <pre className="overflow-x-auto whitespace-pre-wrap select-all">
                {`npx -y @gitunderstand/mcp-server --repo=${repoSlug}`}
              </pre>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    `npx -y @gitunderstand/mcp-server --repo=${repoSlug}`,
                    'mcp'
                  )
                }
                className="absolute top-2 right-2 rounded bg-[var(--bg-card)] border border-[var(--border-card)] px-2 py-1 text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
              >
                {mcpCopied === 'mcp' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Section 2: Gitingest Markdown Digest (.md) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--emerald)]">
                2. Gitingest Markdown Digest (.md)
              </span>
              <span className="text-[11px] text-[var(--ink-muted)]">
                Direct URL / Prompt Context
              </span>
            </div>
            <p className="text-xs text-[var(--ink-secondary)] mb-2">
              Append <code className="text-[var(--cobalt-ice)] font-mono">.md</code> to any GitUnderstand URL to fetch clean LLM prompt context:
            </p>
            <div className="relative rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-composer)] p-3 font-mono text-xs text-[var(--ink-primary)]">
              <pre className="overflow-x-auto select-all">
                {`https://git-understand.com/${repoSlug}.md`}
              </pre>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    `https://git-understand.com/${repoSlug}.md`,
                    'md'
                  )
                }
                className="absolute top-2 right-2 rounded bg-[var(--bg-card)] border border-[var(--border-card)] px-2 py-1 text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
              >
                {mcpCopied === 'md' ? 'Copied!' : 'Copy URL'}
              </button>
            </div>
          </div>

          {/* Quick Info Footer */}
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] p-3 text-xs text-[var(--ink-muted)] flex items-start gap-2.5">
            <svg
              className="w-4 h-4 shrink-0 text-[var(--cobalt-bright)] mt-0.5"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <circle cx="8" cy="8" r="7" />
              <line x1="8" y1="5" x2="8" y2="8" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11" r="1" fill="currentColor" />
            </svg>
            <div>
              <p className="text-[var(--ink-primary)] font-medium">
                Token-Budgeted Tree Digest
              </p>
              <p className="mt-0.5">
                Automatically trims test mocks, binary assets, and minified artifacts while retaining full AST exports, dependencies, and topological structure.
              </p>
            </div>
          </div>
        </div>
      </NativeDialog>
    </>
  );
}

export default TopBar;
