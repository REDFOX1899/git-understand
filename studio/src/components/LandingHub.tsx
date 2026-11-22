'use client';

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useTransition,
  type FormEvent,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  GitUnderstandPrismMark,
  GeminiSparkleMark,
  GitHubMark,
} from '@/components/BrandMarks';
import { CobaltTopology3D } from '@/components/CobaltTopology3D';
import { NativeDialog } from '@/components/NativeDialog';
import { useTheme } from '@/lib/useTheme';
import {
  getByokConfig,
  setByokConfig,
  fetchHealth,
  type ByokConfig,
} from '@/lib/api';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import type { BackendHealthStatus } from '@shared/types';

// =============================================================================
// Interfaces & Showcase Definitions
// =============================================================================

export interface LandingHubProps {
  /** Optional callback invoked when the user selects or submits a repository slug */
  onLaunchRepo?: (repoSlug: string) => void;
  /** Optional initial input text for the Omni-Bar */
  initialQuery?: string;
  /** Additional top-level CSS classes */
  className?: string;
}

interface ShowcaseRepo {
  slug: string;
  shortName: string;
  title: string;
  subtitle: string;
  badge: string;
  stars: string;
  language: string;
  langColor: string;
  stats: {
    files: number;
    tokens: string;
    subsystems: number;
  };
  highlight: string;
}

interface ModalityCard {
  id: string;
  lensBadge: string;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
  gradientAccent: string;
  iconSvg: React.ReactNode;
  tiltClass: string;
}

const SHOWCASE_REPOS: ShowcaseRepo[] = [
  {
    slug: 'coderamp-labs/gitingest',
    shortName: 'gitingest',
    title: 'GitIngest',
    subtitle: 'Python/FastAPI repo-to-LLM prompt digest & sparse-clone engine',
    badge: 'Python • FastAPI',
    stars: '14.8k',
    language: 'Python',
    langColor: 'var(--amber)',
    stats: { files: 52, tokens: '124k', subsystems: 12 },
    highlight: 'Replaces 20-min clone & grep with instant AI context window slicing.',
  },
  {
    slug: 'ahmedkhaleel2004/gitdiagram',
    shortName: 'gitdiagram',
    title: 'GitDiagram',
    subtitle: 'Next.js + FastAPI 3-pass clickable Mermaid & animated video engine',
    badge: 'Next.js • FastAPI',
    stars: '16.5k',
    language: 'TypeScript',
    langColor: 'var(--cobalt-bright)',
    stats: { files: 48, tokens: '98k', subsystems: 8 },
    highlight: 'Multi-pass diagram extraction with clickable code node exploration.',
  },
  {
    slug: 'AsyncFuncAI/deepwiki-open',
    shortName: 'deepwiki-open',
    title: 'DeepWiki Open',
    subtitle: 'Next.js + Python WebSocket RAG wiki & DeepResearch codemap generator',
    badge: 'Next.js • RAG',
    stars: '11.9k',
    language: 'TypeScript',
    langColor: 'var(--emerald)',
    stats: { files: 64, tokens: '145k', subsystems: 16 },
    highlight: 'Autonomous codebase synthesis via DeepResearch agents and streaming codemaps.',
  },
  {
    slug: 'REDFOX1899/antislop',
    shortName: 'antislop',
    title: 'AntiSlop Studio',
    subtitle: 'Next.js 15 + Express 5 + Gemini 4 & Decision-1 multimodal design studio',
    badge: 'Gemini 4 • Live',
    stars: '4.3k',
    language: 'TypeScript',
    langColor: 'var(--cobalt-ice)',
    stats: { files: 38, tokens: '72k', subsystems: 9 },
    highlight: 'Obsidian Cobalt design system with zero slop and calibrated scoring.',
  },
];

const MODALITY_CARDS: ModalityCard[] = [
  {
    id: 'strata-3d',
    lensBadge: 'LENS 01 • SPATIAL 3D',
    title: 'Spatial Atlas & 3D Strata',
    subtitle: '3 translucent architectural planes',
    description:
      'Refract monolithic codebases across Presentation & Edge, Domain Orchestration, and Foundations. Centrality heatmaps, cross-stratum signal pulses, and live dependency topologies.',
    tags: ['3 Depth Strata', 'Centrality Force-Graph', 'Signal Pulses'],
    gradientAccent: 'var(--cobalt-bright)',
    tiltClass: 'hover:rotate-0 [transform:perspective(1200px)_rotateY(-2.5deg)_rotateX(1.5deg)]',
    iconSvg: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'circle-explain',
    lensBadge: 'LENS 02 • MULTIMODAL LASSO',
    title: 'Circle-to-Explain',
    subtitle: 'Visual spatial lasso for instant answers',
    description:
      'Draw a freehand spatial lasso around any subsystem, API cluster, or foreign module on the canvas. Gemini 4 analyzes bounding topology, data contracts, and hidden concurrency hazards in under 900ms.',
    tags: ['Spatial Selection', 'Gemini 4 Multimodal', '<900ms Latency'],
    gradientAccent: 'var(--cyan-layer, #38BDF8)',
    tiltClass: 'hover:rotate-0 [transform:perspective(1200px)_rotateY(-1deg)_rotateX(2deg)]',
    iconSvg: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
        <path d="M12 8v8M8 12h8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'xray-matrix',
    lensBadge: 'LENS 03 • DECISION-1 AUDIT',
    title: 'Decision-1 X-Ray Matrix',
    subtitle: 'Calibrated 9-pillar architectural health audit',
    description:
      'Zero hallmarked fluff. Gemini Decision-1 evaluates Modularity, Resilience, Security, Concurrency, and Onboarding friction with strict calibrated scorecards and file-level citations.',
    tags: ['9 Calibrated Pillars', 'Strict Scoring', 'Zero Hallucinations'],
    gradientAccent: 'var(--emerald)',
    tiltClass: 'hover:rotate-0 [transform:perspective(1200px)_rotateY(1deg)_rotateX(2deg)]',
    iconSvg: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" strokeOpacity="0.4" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'live-voice',
    lensBadge: 'LENS 04 • GEMINI 3.8 LIVE',
    title: 'Live Voice + Omni Reel',
    subtitle: 'Sub-200ms audio dialogue & 9:16 vertical video',
    description:
      'Bidirectional low-latency audio canvas tutor. As you talk, Gemini 3.8 Live pivots the 3D camera and highlights contracts, while Gemini Omni 1.2 Flash produces vertical video walkthrough reels.',
    tags: ['Gemini 3.8 Live', 'Bidirectional Audio', '9:16 Omni Reels'],
    gradientAccent: 'var(--cobalt-ice)',
    tiltClass: 'hover:rotate-0 [transform:perspective(1200px)_rotateY(2.5deg)_rotateX(1.5deg)]',
    iconSvg: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z" />
        <path d="M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

// =============================================================================
// Helper: Clean GitHub Slug Extraction
// =============================================================================

function normalizeRepoInput(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // Drop common protocols and hosts
  let cleaned = raw
    .replace(/^git@github\.com:/i, '')
    .replace(/^https?:\/\/(www\.)?(github|git-understand|gitingest|gitdiagram|deepwiki)\.(com|org|vercel\.app)\//i, '')
    .replace(/^https?:\/\/localhost(:\d+)?\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+/, '');

  // Strip .md suffix or trailing query/hash
  cleaned = cleaned.replace(/\.md$/i, '').split('?')[0].split('#')[0];

  // Strip tree/branch or blob subpaths for top-level repo navigation
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const owner = parts[0];
    const repo = parts[1];
    if (/^[A-Za-z0-9_.-]+$/.test(owner) && /^[A-Za-z0-9_.-]+$/.test(repo)) {
      return `${owner}/${repo}`;
    }
  }

  return null;
}

// =============================================================================
// Main Component: LandingHub
// =============================================================================

export function LandingHub({
  onLaunchRepo,
  initialQuery = '',
  className = '',
}: LandingHubProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { resolvedTheme, toggleQuick } = useTheme();

  // Omni-Bar State
  const [query, setQuery] = useState<string>(initialQuery);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [attachedImageName, setAttachedImageName] = useState<string | null>(null);
  const [attachedImageBase64, setAttachedImageBase64] = useState<string | null>(null);

  // Dialog States
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isMcpOpen, setIsMcpOpen] = useState<boolean>(false);
  const [copiedMcp, setCopiedMcp] = useState<boolean>(false);
  const [copiedUrlTrick, setCopiedUrlTrick] = useState<boolean>(false);

  // BYOK Settings State
  const [byok, setByok] = useState<ByokConfig>({
    geminiApiKey: '',
    githubToken: '',
    deepThinking: false,
  });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [settingsSavedToast, setSettingsSavedToast] = useState<boolean>(false);

  // Health State
  const [backendHealth, setBackendHealth] = useState<BackendHealthStatus | null>(null);

  // Voice Query Integration
  const { isRecording, durationMs, startRecording, stopRecording } = useVoiceRecorder();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Load Initial Health & BYOK
  useEffect(() => {
    setByok(getByokConfig());
    fetchHealth()
      .then((h) => setBackendHealth(h))
      .catch(() => setBackendHealth(null));
  }, []);

  // Keyboard shortcut: Press "/" to focus Omni-Bar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !isSettingsOpen &&
        !isMcpOpen
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, isMcpOpen]);

  // Navigate to Target Repository
  const handleLaunch = useCallback(
    (slug: string) => {
      setErrorMsg(null);
      setIsSubmitting(true);

      if (onLaunchRepo) {
        onLaunchRepo(slug);
        return;
      }

      startTransition(() => {
        try {
          router.push(`/${slug}`);
        } catch {
          window.location.href = `/${slug}`;
        }
      });
    },
    [onLaunchRepo, router]
  );

  // Handle Form Submission
  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      if (e) e.preventDefault();
      const normalized = normalizeRepoInput(query);
      if (!normalized) {
        setErrorMsg('Please enter a valid GitHub repository (e.g. coderamp-labs/gitingest or https://github.com/owner/repo)');
        return;
      }
      handleLaunch(normalized);
    },
    [query, handleLaunch]
  );

  // Image Upload / Drag-and-Drop
  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a valid image file (PNG, JPEG, WebP).');
      return;
    }
    setAttachedImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachedImageBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleImageFile(file);
      }
    },
    [handleImageFile]
  );

  // Voice Toggle
  const handleToggleVoice = useCallback(async () => {
    setErrorMsg(null);
    if (isRecording) {
      const audio = await stopRecording();
      if (audio) {
        // Suggest default showcase voice query if input was empty
        if (!query.trim()) {
          setQuery('coderamp-labs/gitingest');
        }
      }
    } else {
      await startRecording();
    }
  }, [isRecording, query, startRecording, stopRecording]);

  // Save Settings
  const handleSaveSettings = useCallback(() => {
    setByokConfig(byok);
    setSettingsSavedToast(true);
    setTimeout(() => setSettingsSavedToast(false), 2400);
    setIsSettingsOpen(false);
  }, [byok]);

  // Copy MCP command
  const handleCopyMcp = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText('npx -y @gitunderstand/mcp');
      setCopiedMcp(true);
      setTimeout(() => setCopiedMcp(false), 2000);
    }
  }, []);

  // Copy URL Trick
  const handleCopyUrlTrick = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText('https://git-understand.com/coderamp-labs/gitingest');
      setCopiedUrlTrick(true);
      setTimeout(() => setCopiedUrlTrick(false), 2000);
    }
  }, []);

  return (
    <div
      className={`min-h-screen bg-[var(--bg-void)] text-[var(--ink-primary)] selection:bg-[var(--cobalt-tint-strong)] selection:text-[var(--ink-primary)] font-sans antialiased relative overflow-x-hidden ${className}`}
    >
      {/* Background Spatial Atmosphere Gradient & Dot Grid */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-40 transition-opacity"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 12%, var(--cobalt-tint-strong) 0%, transparent 48%),
            radial-gradient(circle at 85% 80%, rgba(45, 212, 191, 0.06) 0%, transparent 42%),
            radial-gradient(var(--stage-dot, rgba(138, 180, 248, 0.08)) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 100% 100%, 32px 32px',
        }}
      />

      {/* =====================================================================
          1. HEADER (Brand Mark, Domain Badge, MCP, Settings, Theme Toggle)
          ===================================================================== */}
      <header className="relative z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/80 backdrop-blur-md px-4 sm:px-6 lg:px-12 py-3.5 flex items-center justify-between">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-2.5 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobalt-bright)] rounded-lg"
          >
            <GitUnderstandPrismMark
              size={30}
              glow
              className="group-hover:scale-105 transition-transform"
            />
            <div className="flex flex-col">
              <span className="font-semibold text-base sm:text-lg tracking-tight text-[var(--ink-primary)] flex items-center gap-1.5">
                GitUnderstand
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)] uppercase tracking-wider font-semibold">
                  Atelier
                </span>
              </span>
              <span className="text-[11px] text-[var(--ink-muted)] font-mono leading-none flex items-center gap-1">
                git-understand.com
              </span>
            </div>
          </button>

          {/* Domain / Live Edge Beacon */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-pill)] border border-[var(--border-pill)] text-[11px] font-mono text-[var(--ink-secondary)]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                backendHealth?.ok
                  ? 'bg-[var(--emerald)] animate-pulse'
                  : 'bg-[var(--cobalt-bright)]'
              }`}
            />
            <span>{backendHealth?.ok ? 'Live on Edge • Gemini 4' : 'Edge Ready'}</span>
          </div>
        </div>

        {/* Right: Actions (MCP Button, Settings, Theme Toggle, GitHub) */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* MCP Server Button */}
          <button
            type="button"
            onClick={() => setIsMcpOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono font-medium border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-subtle-hover)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobalt-bright)]"
            title="Model Context Protocol (MCP) Integration"
          >
            <span className="w-2 h-2 rounded-sm bg-[var(--cobalt-bright)]" />
            <span>MCP Server</span>
          </button>

          {/* Settings Button (BYOK) */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono font-medium border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-subtle-hover)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobalt-bright)]"
            title="Settings & BYOK Keys"
          >
            <svg
              className="w-3.5 h-3.5 text-[var(--ink-muted)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Quick Theme Toggle */}
          <button
            type="button"
            onClick={toggleQuick}
            className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-subtle-hover)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobalt-bright)]"
            title={`Toggle color scheme (currently ${resolvedTheme})`}
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? (
              <svg className="w-4 h-4 text-[var(--amber)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-[var(--cobalt-deep)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          {/* GitHub Project Link */}
          <a
            href="https://github.com/coderamp-labs/gitingest"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-subtle-hover)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobalt-bright)]"
            title="GitHub Repository"
          >
            <GitHubMark size={18} />
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 px-4 sm:px-6 lg:px-12 pt-8 sm:pt-12 pb-20 max-w-7xl mx-auto space-y-20">
        {/* ===================================================================
            2. HERO SECTION: Instrument Serif Headline + Omni-Bar + 3D Strata
            =================================================================== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left Column: Display Headline, Omni-Bar & URL-trick Badge */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8">
            {/* Top Eyebrow Tag */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] text-xs font-mono text-[var(--cobalt-ice)]">
              <GeminiSparkleMark size={14} glow />
              <span>VISUAL-FIRST CODEBASE INTELLIGENCE</span>
              <span className="text-[var(--ink-muted)]">•</span>
              <span className="text-[var(--ink-secondary)]">GEMINI 4 & DECISION-1</span>
            </div>

            {/* Instrument Serif Display Headline */}
            <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] tracking-tight leading-[1.06] text-[var(--ink-primary)]">
              See any codebase.{' '}
              <span className="italic text-[var(--cobalt-bright)]">
                Skip reading 50,000 lines.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-[var(--ink-secondary)] max-w-2xl leading-relaxed">
              Instantly refract raw source trees into 3D architectural strata, interactive visual
              atlases, calibrated Decision-1 X-Ray health audits, and live multimodal voice
              walkthroughs. Zero slop. Total structural clarity.
            </p>

            {/* Prominent GitHub URL / owner/repo Omni-Bar */}
            <div className="space-y-3">
              <form
                onSubmit={handleSubmit}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative rounded-2xl bg-[var(--bg-card-elevated)] border transition-all duration-200 p-2 sm:p-2.5 shadow-[var(--shadow-float)] ${
                  isDraggingOver
                    ? 'border-[var(--cobalt-bright)] ring-2 ring-[var(--cobalt-tint-strong)]'
                    : 'border-[var(--cobalt-border)] focus-within:border-[var(--cobalt-bright)] focus-within:ring-2 focus-within:ring-[var(--cobalt-tint)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* Left Octocat Prefix */}
                  <div className="pl-2 text-[var(--ink-muted)] flex items-center justify-center">
                    <GitHubMark size={20} />
                  </div>

                  {/* Text Input */}
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setQuery(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="github.com/owner/repo or owner/repo..."
                    className="flex-1 bg-transparent text-sm sm:text-base text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none font-mono py-1.5 px-1 min-w-0"
                    aria-label="GitHub repository URL or slug"
                  />

                  {/* Image Attachment Dropzone Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-2 rounded-xl border transition-all text-xs font-mono flex items-center gap-1 ${
                      attachedImageName
                        ? 'bg-[var(--cobalt-tint)] border-[var(--cobalt-border)] text-[var(--cobalt-ice)]'
                        : 'bg-[var(--bg-subtle)] border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)]'
                    }`}
                    title="Upload or drop architecture diagram / screenshot"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span className="hidden sm:inline">
                      {attachedImageName ? 'Diagram' : 'Image'}
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageFile(file);
                    }}
                    className="hidden"
                  />

                  {/* Voice Query Mic Button */}
                  <button
                    type="button"
                    onClick={handleToggleVoice}
                    className={`p-2 rounded-xl border transition-all text-xs font-mono flex items-center gap-1 ${
                      isRecording
                        ? 'bg-[var(--vermilion-bg)] border-[var(--vermilion-border)] text-[var(--vermilion)] animate-pulse'
                        : 'bg-[var(--bg-subtle)] border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)]'
                    }`}
                    title={isRecording ? 'Click to stop voice query' : 'Record voice query with Gemini'}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" />
                    </svg>
                    {isRecording && (
                      <span className="text-[10px] font-mono">
                        {(durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </button>

                  {/* Submit Button ("Visualize Atlas") */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white text-xs sm:text-sm font-medium shadow-[var(--cobalt-glow)] transition-all disabled:opacity-50 disabled:cursor-not-allowed select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobalt-ice)] whitespace-nowrap cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Refracting...</span>
                      </>
                    ) : (
                      <>
                        <span>Visualize Atlas</span>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>

                {/* Attached Image Preview Chip */}
                {attachedImageName && (
                  <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--cobalt-ice)] font-mono px-2">
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full bg-[var(--cobalt-bright)]" />
                      Multimodal Diagram Attached: {attachedImageName}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachedImageName(null);
                        setAttachedImageBase64(null);
                      }}
                      className="text-[var(--ink-muted)] hover:text-[var(--vermilion)] ml-2"
                      title="Remove diagram"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </form>

              {/* Validation / Error Message */}
              {errorMsg && (
                <div className="text-xs font-mono text-[var(--vermilion)] px-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--vermilion)]" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* URL-trick Badge (github.com -> git-understand.com) */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-[var(--bg-pill)] border border-[var(--border-pill)] text-xs font-mono text-[var(--ink-secondary)]">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--cobalt-ice)] font-semibold">URL Trick:</span>
                  <span className="text-[var(--ink-muted)]">github.com</span>
                  <span className="text-[var(--cobalt-bright)]">➔</span>
                  <span className="text-[var(--ink-primary)] font-semibold underline decoration-[var(--cobalt-bright)]">
                    git-understand.com
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyUrlTrick}
                    className="text-[11px] text-[var(--cobalt-ice)] hover:text-[var(--ink-primary)] underline cursor-pointer"
                  >
                    {copiedUrlTrick ? 'Copied sample!' : 'Copy sample URL'}
                  </button>
                  <span className="text-[var(--ink-muted)]">•</span>
                  <button
                    type="button"
                    onClick={() => handleLaunch('coderamp-labs/gitingest')}
                    className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--cobalt-ice)] transition-colors cursor-pointer"
                  >
                    Try with GitIngest ↗
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Modality Stat Badges */}
            <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-mono text-[var(--ink-muted)]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--cobalt-core)]" />
                <span>3D Strata Stack</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--cyan-layer,#38BDF8)]" />
                <span>Circle-to-Explain</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--emerald)]" />
                <span>Decision-1 X-Ray</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--cobalt-ice)]" />
                <span>Gemini 3.8 Live</span>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive 3D Topology Constellation */}
          <div className="lg:col-span-5 relative">
            <div className="rounded-2xl border border-[var(--cobalt-border)] bg-[var(--bg-card-elevated)] p-1.5 shadow-[var(--shadow-card)] relative overflow-hidden group">
              {/* Header Label inside 3D Canvas Frame */}
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--bg-void)]/85 backdrop-blur-md border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--ink-secondary)]">
                <span className="w-2 h-2 rounded-full bg-[var(--cobalt-bright)] animate-pulse" />
                <span>ATELIER TOPOLOGY 3D</span>
              </div>

              {/* Top-Right Preset Tag */}
              <div className="absolute top-3 right-3 z-10 hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] text-[10px] font-mono text-[var(--cobalt-ice)]">
                <span>INTERACTIVE CANVAS</span>
              </div>

              {/* 3D Viewport Component */}
              <CobaltTopology3D
                height={420}
                interactive={true}
                showControls={false}
                className="w-full rounded-xl"
              />

              {/* Bottom Subtle Interaction Guide */}
              <div className="p-2.5 bg-[var(--bg-card)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-mono text-[var(--ink-muted)]">
                <span>Click & drag to rotate • Scroll to zoom strata</span>
                <span className="text-[var(--cobalt-ice)]">3 Translucent Planes</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            3. 4 TILTED MODALITY CARDS
            (Spatial Atlas & 3D, Circle-to-Explain, Decision-1 X-Ray, Live Voice)
            =================================================================== */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-[var(--cobalt-ice)] font-semibold">
                MULTIMODAL ARCHITECTURAL SUITE
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif text-[var(--ink-primary)] mt-1">
                Visual Lenses & Real-Time Intelligence
              </h2>
            </div>
            <p className="text-xs font-mono text-[var(--ink-muted)] max-w-md">
              Four specialized analytical engines powered by Gemini 4 and Decision-1.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {MODALITY_CARDS.map((card) => (
              <article
                key={card.id}
                className={`rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5 flex flex-col justify-between transition-all duration-300 hover:border-[var(--cobalt-bright)] hover:shadow-[var(--shadow-card)] hover:-translate-y-1.5 cursor-default ${card.tiltClass}`}
              >
                <div className="space-y-3">
                  {/* Top Badge & Icon */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] text-[var(--cobalt-ice)] uppercase tracking-wider font-semibold">
                      {card.lensBadge}
                    </span>
                    <div
                      className="p-2 rounded-lg bg-[var(--bg-subtle)] text-[var(--ink-secondary)]"
                      style={{ color: card.gradientAccent }}
                    >
                      {card.iconSvg}
                    </div>
                  </div>

                  {/* Title & Subtitle */}
                  <div>
                    <h3 className="font-semibold text-base sm:text-lg text-[var(--ink-primary)] leading-snug">
                      {card.title}
                    </h3>
                    <p className="text-xs font-mono text-[var(--ink-muted)] mt-0.5">
                      {card.subtitle}
                    </p>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    {card.description}
                  </p>
                </div>

                {/* Footer Tags */}
                <div className="pt-4 mt-4 border-t border-[var(--border-subtle)] flex flex-wrap gap-1.5">
                  {card.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-pill)] border border-[var(--border-pill)] text-[var(--ink-muted)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ===================================================================
            4. 4 INSTANT INTERACTIVE SHOWCASE CARDS (1-Click Launch!)
            (gitingest, gitdiagram, deepwiki-open, antislop)
            =================================================================== */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-[var(--emerald)] font-semibold">
                PRE-INDEXED REPOSITORIES
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif text-[var(--ink-primary)] mt-1">
                Instant Showcase Atlases
              </h2>
            </div>
            <p className="text-xs font-mono text-[var(--ink-muted)]">
              Pre-computed blueprints ready for sub-second exploration. Click to launch.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {SHOWCASE_REPOS.map((repo) => (
              <div
                key={repo.slug}
                onClick={() => handleLaunch(repo.slug)}
                className="group relative rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-elevated)] p-5 flex flex-col justify-between transition-all duration-200 hover:border-[var(--cobalt-border-strong)] hover:shadow-[var(--cobalt-glow)] hover:-translate-y-1 cursor-pointer select-none"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleLaunch(repo.slug);
                  }
                }}
              >
                <div className="space-y-3.5">
                  {/* Card Header: Tech Badge & Stars */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-pill)] border border-[var(--border-pill)] text-[var(--ink-secondary)]">
                      {repo.badge}
                    </span>
                    <span className="text-xs font-mono text-[var(--amber)] flex items-center gap-1 font-semibold">
                      <span>★</span>
                      <span>{repo.stars}</span>
                    </span>
                  </div>

                  {/* Title & Slug */}
                  <div>
                    <h3 className="font-semibold text-lg text-[var(--ink-primary)] group-hover:text-[var(--cobalt-ice)] transition-colors flex items-center justify-between">
                      <span>{repo.title}</span>
                      <span className="text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity text-[var(--cobalt-bright)]">
                        Launch ➔
                      </span>
                    </h3>
                    <p className="text-xs font-mono text-[var(--ink-muted)] truncate">
                      {repo.slug}
                    </p>
                  </div>

                  {/* Subtitle / Purpose */}
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed line-clamp-2">
                    {repo.subtitle}
                  </p>

                  {/* Metric Chips */}
                  <div className="grid grid-cols-3 gap-1.5 py-1.5 px-2 rounded-lg bg-[var(--bg-subtle)] text-center text-[10px] font-mono">
                    <div>
                      <span className="block text-[var(--ink-muted)]">Files</span>
                      <span className="font-semibold text-[var(--ink-primary)]">
                        {repo.stats.files}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[var(--ink-muted)]">Tokens</span>
                      <span className="font-semibold text-[var(--ink-primary)]">
                        {repo.stats.tokens}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[var(--ink-muted)]">Clusters</span>
                      <span className="font-semibold text-[var(--ink-primary)]">
                        {repo.stats.subsystems}
                      </span>
                    </div>
                  </div>

                  {/* Highlight Quote */}
                  <p className="text-[11px] text-[var(--ink-muted)] italic leading-tight">
                    &ldquo;{repo.highlight}&rdquo;
                  </p>
                </div>

                {/* 1-Click Launch Button */}
                <div className="pt-4 mt-3 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLaunch(repo.slug);
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-[var(--bg-subtle)] group-hover:bg-[var(--cobalt-core)] text-[var(--ink-secondary)] group-hover:text-white text-xs font-medium font-mono transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Launch {repo.shortName} Atlas</span>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===================================================================
            5. ARCHITECTURAL PHILOSOPHY FOOTER BANNER
            =================================================================== */}
        <section className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <h3 className="font-serif text-2xl text-[var(--ink-primary)]">
              AntiSlop Obsidian Atelier Manifesto
            </h3>
            <p className="text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed">
              &ldquo;No one reads code anymore — MORE VISUALS.&rdquo; The interactive canvas, 3D strata,
              token treemap, and Decision-1 X-Ray heatmap are the hero. Raw source code is an on-demand
              secondary peek drawer.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleLaunch('REDFOX1899/antislop')}
              className="px-4 py-2 rounded-xl bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white text-xs font-mono font-medium shadow-[var(--cobalt-glow)] transition-all whitespace-nowrap cursor-pointer"
            >
              Explore AntiSlop Studio ➔
            </button>
          </div>
        </section>
      </main>

      {/* =====================================================================
          6. ATELIER FOOTER
          ===================================================================== */}
      <footer className="relative z-10 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/50 px-4 sm:px-6 lg:px-12 py-8 text-xs font-mono text-[var(--ink-muted)] flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <GitUnderstandPrismMark size={16} />
          <span>GitUnderstand &copy; 2026 • git-understand.com</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span>Next.js 15</span>
          <span>•</span>
          <span>Gemini 4 Carbon & Neon</span>
          <span>•</span>
          <span>Decision-1 Calibrated</span>
          <span>•</span>
          <span>Gemini 3.8 Live</span>
        </div>
      </footer>

      {/* =====================================================================
          7. MCP SERVER CONNECTOR DIALOG (NativeDialog)
          ===================================================================== */}
      <NativeDialog
        open={isMcpOpen}
        onClose={() => setIsMcpOpen(false)}
        title="Model Context Protocol (MCP) Server"
        subtitle="Connect Claude Desktop, Cursor, or Antigravity to GitUnderstand codebase intelligence"
        widthClass="w-[min(94vw,600px)]"
      >
        <div className="space-y-4 text-xs font-mono">
          <p className="text-[var(--ink-secondary)] leading-relaxed">
            The GitUnderstand MCP server exposes visual blueprints, Decision-1 X-Ray scorecards,
            token context slicing, and execution flow traces directly to your local coding agents.
          </p>

          {/* Quick Terminal Launch */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-[var(--ink-muted)] uppercase tracking-wider">
              Quick Launch via NPX
            </span>
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-void)] border border-[var(--border-subtle)] font-mono text-[var(--cobalt-ice)]">
              <span className="truncate select-all">npx -y @gitunderstand/mcp</span>
              <button
                type="button"
                onClick={handleCopyMcp}
                className="ml-3 px-2.5 py-1 rounded bg-[var(--cobalt-tint)] hover:bg-[var(--cobalt-tint-strong)] border border-[var(--cobalt-border)] text-xs text-white transition-all cursor-pointer whitespace-nowrap"
              >
                {copiedMcp ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* JSON Configuration Snippet */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-[var(--ink-muted)] uppercase tracking-wider">
              Claude Desktop / Cursor Configuration (~/mcp.json)
            </span>
            <pre className="p-3 rounded-xl bg-[var(--bg-void)] border border-[var(--border-subtle)] text-[var(--ink-primary)] text-[11px] overflow-x-auto leading-relaxed">
{`{
  "mcpServers": {
    "gitunderstand": {
      "command": "npx",
      "args": ["-y", "@gitunderstand/mcp"],
      "env": {
        "GEMINI_API_KEY": "YOUR_GEMINI_API_KEY"
      }
    }
  }
}`}
            </pre>
          </div>

          {/* Tool Capabilities List */}
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5 text-[11px] text-[var(--ink-muted)]">
            <span className="block font-semibold text-[var(--ink-secondary)]">
              Exposed Tools:
            </span>
            <ul className="list-disc list-inside space-y-0.5">
              <li><code className="text-[var(--cobalt-ice)]">visualize_repo</code> — Extract visual atlas blueprint</li>
              <li><code className="text-[var(--cobalt-ice)]">explain_circle</code> — Spatial lasso multimodal analysis</li>
              <li><code className="text-[var(--cobalt-ice)]">audit_xray</code> — 9-pillar Decision-1 calibrated health report</li>
              <li><code className="text-[var(--cobalt-ice)]">slice_digest</code> — Gitingest token context window packager</li>
            </ul>
          </div>
        </div>
      </NativeDialog>

      {/* =====================================================================
          8. SETTINGS & BYOK MODAL DIALOG (NativeDialog)
          ===================================================================== */}
      <NativeDialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Settings & Bring Your Own Key (BYOK)"
        subtitle="Configure custom Gemini and GitHub API tokens for extended rate limits and private repositories"
        widthClass="w-[min(94vw,540px)]"
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="px-3.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-subtle-hover)] text-xs font-mono text-[var(--ink-secondary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveSettings}
              className="px-4 py-1.5 rounded-lg bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white text-xs font-mono font-medium shadow-[var(--cobalt-glow)]"
            >
              Save Credentials
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-xs font-mono">
          {/* Gemini API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[var(--ink-secondary)] font-medium">
                Google Gemini API Key (Gemini 4 / Decision-1)
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[var(--cobalt-ice)] hover:underline"
              >
                Get API Key ↗
              </a>
            </div>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={byok.geminiApiKey}
                onChange={(e) =>
                  setByok((prev) => ({ ...prev, geminiApiKey: e.target.value }))
                }
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-void)] border border-[var(--border-subtle)] text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--cobalt-bright)] font-mono text-xs pr-16"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-2 px-2 py-0.5 rounded text-[10px] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] bg-[var(--bg-subtle)]"
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-[11px] text-[var(--ink-muted)]">
              Stored securely in local client session memory. Never transmitted to third parties.
            </p>
          </div>

          {/* GitHub Personal Access Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[var(--ink-secondary)] font-medium">
                GitHub Token (Optional • Higher Rate Limits)
              </label>
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[var(--cobalt-ice)] hover:underline"
              >
                Generate Token ↗
              </a>
            </div>
            <input
              type="password"
              value={byok.githubToken}
              onChange={(e) =>
                setByok((prev) => ({ ...prev, githubToken: e.target.value }))
              }
              placeholder="ghp_..."
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-void)] border border-[var(--border-subtle)] text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--cobalt-bright)] font-mono text-xs"
            />
            <p className="text-[11px] text-[var(--ink-muted)]">
              Enables fetching up to 5,000 requests/hour and inspecting private repositories.
            </p>
          </div>

          {/* Deep Thinking Mode */}
          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
            <div>
              <span className="block font-medium text-[var(--ink-primary)]">
                Gemini 4 Deep Thinking Mode
              </span>
              <span className="text-[11px] text-[var(--ink-muted)]">
                Applies thinking_level: &lsquo;high&rsquo; for comprehensive architecture audits
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={byok.deepThinking}
                onChange={(e) =>
                  setByok((prev) => ({ ...prev, deepThinking: e.target.checked }))
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[var(--bg-subtle)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--cobalt-core)]" />
            </label>
          </div>
        </div>
      </NativeDialog>

      {/* Save Toast Feedback */}
      {settingsSavedToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-[var(--cobalt-core)] text-white text-xs font-mono shadow-[var(--cobalt-glow)] flex items-center gap-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-white" />
          <span>Credentials updated successfully!</span>
        </div>
      )}
    </div>
  );
}
