'use client';

// =============================================================================
// GitUnderstand (git-understand.com) — Multimodal Media Lab Lens
// Agent 64: Complete Gemini Multimodal Showcase
// 1. Nano Banana 2.1 Editorial Architecture Poster
// 2. Gemini 3.8 TTS 2-Speaker Audio Walkthrough (Live Cues -> Fly Atlas Camera)
// 3. Gemini Omni 1.2 Flash 10s Video Reel (MP4 + Animated Interactive Storyboard)
// 4. Antigravity Managed Agent / Deep Research Forensics
// =============================================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type {
  VisualAtlasBlueprint,
  MediaPosterArtifact,
  AudioTourArtifact,
  AudioTourCue,
  VideoReelArtifact,
  ForensicsReport,
} from '@shared/types';
import {
  postGeneratePoster,
  postGenerateAudioTour,
  postGenerateVideoReel,
  postRunForensics,
  resolveArtifactUrl,
} from '@/lib/api';
import {
  Sparkles,
  Palette,
  Download,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Mic,
  Film,
  Video,
  ShieldAlert,
  AlertTriangle,
  AlertOctagon,
  AlertCircle,
  CheckCircle2,
  Info,
  ExternalLink,
  Eye,
  RefreshCw,
  Compass,
  SkipForward,
  SkipBack,
  SlidersHorizontal,
  Bot,
  Flame,
  Radio,
  FileCode2,
  Layers,
} from 'lucide-react';

export interface MediaLabViewProps {
  blueprint: VisualAtlasBlueprint;
  captureCanvasFrame?: () => Promise<string | null>;
  onFocusNode: (nodeId: string, switchToAtlas?: boolean) => void;
  onArtifactAdded?: (update: {
    poster?: MediaPosterArtifact;
    audioTour?: AudioTourArtifact;
    videoReel?: VideoReelArtifact;
  }) => void;
}

export function MediaLabView({
  blueprint,
  captureCanvasFrame,
  onFocusNode,
  onArtifactAdded,
}: MediaLabViewProps) {
  // ---------------------------------------------------------------------------
  // 1. Poster State
  // ---------------------------------------------------------------------------
  const [posters, setPosters] = useState<MediaPosterArtifact[]>(
    blueprint.posters || []
  );
  const [selectedStyle, setSelectedStyle] = useState<
    MediaPosterArtifact['style']
  >('cobalt_blueprint');
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);
  const [selectedPosterIndex, setSelectedPosterIndex] = useState(0);
  const [isPosterLightboxOpen, setIsPosterLightboxOpen] = useState(false);

  // Sync external posters if blueprint changes
  useEffect(() => {
    if (blueprint.posters && blueprint.posters.length > 0) {
      setPosters(blueprint.posters);
    }
  }, [blueprint.posters]);

  const activePoster = posters[selectedPosterIndex] || posters[0] || null;

  const handleGeneratePoster = async () => {
    setIsGeneratingPoster(true);
    setPosterError(null);
    try {
      const newPoster = await postGeneratePoster(blueprint.repoId, selectedStyle);
      setPosters((prev) => [newPoster, ...prev]);
      setSelectedPosterIndex(0);
      onArtifactAdded?.({ poster: newPoster });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate poster';
      setPosterError(msg);
    } finally {
      setIsGeneratingPoster(false);
    }
  };

  const handleDownloadPoster = (poster: MediaPosterArtifact) => {
    const url = resolveArtifactUrl(poster.imageUrl);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gitunderstand-poster-${poster.style}-${Date.now()}.png`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ---------------------------------------------------------------------------
  // 2. Audio Tour State (Gemini 3.8 TTS + Web Speech Fallback)
  // ---------------------------------------------------------------------------
  const [audioTours, setAudioTours] = useState<AudioTourArtifact[]>(
    blueprint.audioTours || []
  );
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [useWebSpeech, setUseWebSpeech] = useState(false);
  const [webSpeechActiveIndex, setWebSpeechActiveIndex] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cuesScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (blueprint.audioTours && blueprint.audioTours.length > 0) {
      setAudioTours(blueprint.audioTours);
    }
  }, [blueprint.audioTours]);

  const activeAudioTour =
    audioTours[selectedAudioIndex] || audioTours[0] || null;

  // Find active cue based on current time or Web Speech
  const activeCueIndex = useMemo(() => {
    if (!activeAudioTour || !activeAudioTour.cues) return -1;
    if (useWebSpeech) return webSpeechActiveIndex ?? -1;

    return activeAudioTour.cues.findIndex((c) => {
      const start = c.approxStartSec;
      const end = c.approxStartSec + Math.max(c.approxDurationSec, 2);
      return currentTimeSec >= start && currentTimeSec <= end;
    });
  }, [activeAudioTour, currentTimeSec, useWebSpeech, webSpeechActiveIndex]);

  // Synchronize Atlas camera when cue changes
  useEffect(() => {
    if (activeCueIndex >= 0 && activeAudioTour?.cues?.[activeCueIndex]) {
      const cue = activeAudioTour.cues[activeCueIndex];
      if (cue.focusNodeId) {
        onFocusNode(cue.focusNodeId, false);
      }
    }
  }, [activeCueIndex, activeAudioTour, onFocusNode]);

  // Audio element events
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTimeSec(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDurationSec(audioRef.current.duration || activeAudioTour?.durationSec || 0);
    }
  };

  const togglePlayAudio = () => {
    if (useWebSpeech) {
      if (isPlayingAudio) {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        setIsPlayingAudio(false);
      } else {
        startWebSpeechPlayback(0);
      }
      return;
    }

    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlayingAudio(true))
        .catch(() => {
          // If native audio playback fails, gracefully suggest/switch to Web Speech
          setUseWebSpeech(true);
          startWebSpeechPlayback(0);
        });
    }
  };

  const seekToCue = (index: number) => {
    if (!activeAudioTour?.cues?.[index]) return;
    const cue = activeAudioTour.cues[index];

    if (cue.focusNodeId) {
      onFocusNode(cue.focusNodeId, false);
    }

    if (useWebSpeech) {
      startWebSpeechPlayback(index);
      return;
    }

    if (audioRef.current) {
      audioRef.current.currentTime = cue.approxStartSec;
      setCurrentTimeSec(cue.approxStartSec);
      if (!isPlayingAudio) {
        audioRef.current
          .play()
          .then(() => setIsPlayingAudio(true))
          .catch(() => {});
      }
    }
  };

  // Web Speech Fallback synthesis
  const startWebSpeechPlayback = useCallback(
    (startIndex: number) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setAudioError('Web Speech Synthesis is not supported in this environment.');
        return;
      }

      window.speechSynthesis.cancel();
      const cues = activeAudioTour?.cues || [];
      if (startIndex >= cues.length) {
        setIsPlayingAudio(false);
        setWebSpeechActiveIndex(null);
        return;
      }

      setIsPlayingAudio(true);
      setWebSpeechActiveIndex(startIndex);

      const cue = cues[startIndex];
      if (cue.focusNodeId) {
        onFocusNode(cue.focusNodeId, false);
      }

      const utterance = new SpeechSynthesisUtterance(cue.text);
      // Give Architect a deeper, steady tone; Explorer a slightly higher pitch
      if (cue.speaker === 'Architect') {
        utterance.pitch = 0.9;
        utterance.rate = 1.0;
      } else {
        utterance.pitch = 1.15;
        utterance.rate = 1.05;
      }

      utterance.onend = () => {
        if (startIndex + 1 < cues.length) {
          startWebSpeechPlayback(startIndex + 1);
        } else {
          setIsPlayingAudio(false);
          setWebSpeechActiveIndex(null);
        }
      };

      utterance.onerror = () => {
        setIsPlayingAudio(false);
      };

      window.speechSynthesis.speak(utterance);
    },
    [activeAudioTour, onFocusNode]
  );

  const handleGenerateAudioTour = async () => {
    setIsGeneratingAudio(true);
    setAudioError(null);
    try {
      const tour = await postGenerateAudioTour(blueprint.repoId);
      setAudioTours((prev) => [tour, ...prev]);
      setSelectedAudioIndex(0);
      onArtifactAdded?.({ audioTour: tour });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate audio tour';
      setAudioError(msg);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  // Cleanup Web Speech when component unmounts
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 3. Video Reel State (Gemini Omni 1.2 Flash + Animated Interactive Storyboard)
  // ---------------------------------------------------------------------------
  const [videoReels, setVideoReels] = useState<VideoReelArtifact[]>(
    blueprint.videoReels || []
  );
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);

  // Storyboard Interactive Player State
  const [storyboardFrameIdx, setStoryboardFrameIdx] = useState(0);
  const [isStoryboardPlaying, setIsStoryboardPlaying] = useState(false);
  const [viewMode, setViewMode] = useState<'video' | 'storyboard'>('video');

  useEffect(() => {
    if (blueprint.videoReels && blueprint.videoReels.length > 0) {
      setVideoReels(blueprint.videoReels);
    }
  }, [blueprint.videoReels]);

  const activeVideoReel =
    videoReels[selectedVideoIndex] || videoReels[0] || null;

  // Auto-switch to storyboard mode if video is fallback_storyboard
  useEffect(() => {
    if (activeVideoReel?.status === 'fallback_storyboard') {
      setViewMode('storyboard');
    }
  }, [activeVideoReel]);

  // Storyboard Auto-advance loop
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const frames = activeVideoReel?.storyboardFrames || [];

    if (isStoryboardPlaying && frames.length > 0) {
      interval = setInterval(() => {
        setStoryboardFrameIdx((prev) => {
          const next = (prev + 1) % frames.length;
          const targetFrame = frames[next];
          if (targetFrame?.focusNodeId) {
            onFocusNode(targetFrame.focusNodeId, false);
          }
          return next;
        });
      }, 2600);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isStoryboardPlaying, activeVideoReel, onFocusNode]);

  const handleStepStoryboard = (direction: 'prev' | 'next') => {
    const frames = activeVideoReel?.storyboardFrames || [];
    if (frames.length === 0) return;

    setStoryboardFrameIdx((prev) => {
      let next = direction === 'next' ? prev + 1 : prev - 1;
      if (next < 0) next = frames.length - 1;
      if (next >= frames.length) next = 0;
      const targetFrame = frames[next];
      if (targetFrame?.focusNodeId) {
        onFocusNode(targetFrame.focusNodeId, false);
      }
      return next;
    });
  };

  const handleGenerateVideoReel = async () => {
    setIsGeneratingVideo(true);
    setVideoError(null);
    try {
      let firstFrameBase64: string | undefined = undefined;
      if (captureCanvasFrame) {
        try {
          const captured = await captureCanvasFrame();
          if (captured) firstFrameBase64 = captured;
        } catch {
          // Continue without first frame
        }
      }

      const reel = await postGenerateVideoReel(
        blueprint.repoId,
        firstFrameBase64
      );
      setVideoReels((prev) => [reel, ...prev]);
      setSelectedVideoIndex(0);
      onArtifactAdded?.({ videoReel: reel });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate video reel';
      setVideoError(msg);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. Forensics State (Antigravity Managed Agent & Deep Research)
  // ---------------------------------------------------------------------------
  const [forensicsMode, setForensicsMode] = useState<
    'managed_agent' | 'deep_research'
  >('managed_agent');
  const [isRunningForensics, setIsRunningForensics] = useState(false);
  const [forensicsReport, setForensicsReport] = useState<ForensicsReport | null>(null);
  const [forensicsError, setForensicsError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<
    'all' | 'critical' | 'high' | 'medium' | 'low' | 'info'
  >('all');
  const [forensicsStep, setForensicsStep] = useState(0);

  const handleRunForensics = async () => {
    setIsRunningForensics(true);
    setForensicsError(null);
    setForensicsStep(1);

    const stepInterval = setInterval(() => {
      setForensicsStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 1800);

    try {
      const report = await postRunForensics(blueprint.repoId, forensicsMode);
      setForensicsReport(report);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Forensics investigation failed';
      setForensicsError(msg);
    } finally {
      clearInterval(stepInterval);
      setIsRunningForensics(false);
      setForensicsStep(0);
    }
  };

  const filteredFindings = useMemo(() => {
    if (!forensicsReport?.findings) return [];
    if (severityFilter === 'all') return forensicsReport.findings;
    return forensicsReport.findings.filter((f) => f.severity === severityFilter);
  }, [forensicsReport, severityFilter]);

  // Helper to find node by primary file or file paths
  const findNodeByPath = useCallback(
    (filePath?: string) => {
      if (!filePath) return null;
      return (
        blueprint.nodes.find(
          (n) =>
            n.primaryFile === filePath ||
            n.filePaths.includes(filePath) ||
            filePath.includes(n.primaryFile)
        ) || null
      );
    },
    [blueprint.nodes]
  );

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto px-4 py-5 md:px-8 md:py-6 space-y-6 bg-[var(--bg-void)] text-[var(--ink-primary)]">
      {/* --------------------------------------------------------------------- */}
      {/* Media Lab Showcase Header Banner                                      */}
      {/* --------------------------------------------------------------------- */}
      <div className="relative rounded-2xl p-6 border border-[var(--border-card)] bg-[var(--bg-card)] overflow-hidden shadow-[var(--shadow-card)]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--cobalt-tint)] rounded-full blur-3xl -z-0 pointer-events-none opacity-50" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium tracking-wide bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)]">
                <Sparkles className="w-3.5 h-3.5" />
                GEMINI MULTIMODAL SHOWCASE
              </span>
              <span className="text-xs text-[var(--ink-muted)] font-mono">
                {blueprint.repoId}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-[var(--ink-primary)]">
              Multimodal Media Lab
            </h1>
            <p className="text-sm text-[var(--ink-secondary)] max-w-3xl leading-relaxed">
              Explore codebase synthesis powered by Nano Banana 2.1, Gemini 3.8
              TTS live cues, Gemini Omni 1.2 Flash video reels, and Antigravity
              Managed Agent forensics.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-[var(--cobalt-ice)]" />
              <span>{posters.length} Posters</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-[var(--emerald)]" />
              <span>{audioTours.length} Audio Tours</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] flex items-center gap-2">
              <Film className="w-3.5 h-3.5 text-[var(--amber)]" />
              <span>{videoReels.length} Video Reels</span>
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 4-Card Showcase Grid                                                  */}
      {/* --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* =================================================================== */}
        {/* CARD 1: Nano Banana 2.1 Editorial Architecture Poster               */}
        {/* =================================================================== */}
        <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col p-5 shadow-[var(--shadow-card)] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]">
                  <Palette className="w-4 h-4" />
                </div>
                <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                  Nano Banana 2.1 Poster
                </h2>
              </div>
              <p className="text-xs text-[var(--ink-secondary)] mt-1">
                Visual synthesis in Obsidian Blueprint, Isometric, or Editorial
                formats.
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={selectedStyle}
                onChange={(e) =>
                  setSelectedStyle(e.target.value as MediaPosterArtifact['style'])
                }
                disabled={isGeneratingPoster}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card-elevated)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--cobalt-ice)]"
              >
                <option value="cobalt_blueprint">Obsidian Blueprint</option>
                <option value="isometric_cutaway">Isometric Cutaway</option>
                <option value="editorial_diagram">Editorial Diagram</option>
              </select>

              <button
                onClick={handleGeneratePoster}
                disabled={isGeneratingPoster}
                className="px-3 py-1.5 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-[var(--cobalt-glow)]"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isGeneratingPoster ? 'animate-spin' : ''}`}
                />
                {isGeneratingPoster ? 'Rendering...' : 'Generate'}
              </button>
            </div>
          </div>

          {posterError && (
            <div className="p-3 rounded-lg border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] text-[var(--vermilion)] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{posterError}</span>
            </div>
          )}

          {/* Poster Preview Viewport */}
          <div className="relative w-full h-80 rounded-xl border border-[var(--border-card)] bg-[var(--bg-stage-grid)] overflow-hidden flex items-center justify-center group">
            {activePoster ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveArtifactUrl(activePoster.imageUrl)}
                  alt={activePoster.title}
                  className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                />

                {/* Overlay actions */}
                <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setIsPosterLightboxOpen(true)}
                    className="p-2 rounded-lg bg-[var(--backdrop-scrim)] backdrop-blur-md text-white hover:bg-black/80 transition-colors border border-white/20"
                    title="Fullscreen Preview"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDownloadPoster(activePoster)}
                    className="p-2 rounded-lg bg-[var(--backdrop-scrim)] backdrop-blur-md text-white hover:bg-black/80 transition-colors border border-white/20"
                    title="Download Poster"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>

                {/* Bottom Poster Meta Badge */}
                <div className="absolute bottom-3 left-3 right-3 p-2.5 rounded-lg bg-[var(--backdrop-scrim)] backdrop-blur-md border border-white/10 flex items-center justify-between text-xs">
                  <div className="truncate mr-2">
                    <p className="font-medium text-white truncate">
                      {activePoster.title}
                    </p>
                    <p className="text-[11px] text-[var(--ink-secondary)] font-mono">
                      {activePoster.style} • {activePoster.model}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownloadPoster(activePoster)}
                    className="px-2.5 py-1 rounded bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0"
                  >
                    <Download className="w-3 h-3" />
                    Save
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center p-6 space-y-3">
                <div className="w-12 h-12 rounded-full bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] mx-auto flex items-center justify-center border border-[var(--cobalt-border)]">
                  <Palette className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--ink-primary)]">
                    No Poster Generated Yet
                  </p>
                  <p className="text-xs text-[var(--ink-muted)] max-w-xs mx-auto">
                    Choose a style above and click Generate to produce an Imagen
                    3 / Nano Banana 2.1 high-resolution architectural poster.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Thumbnail Carousel if multiple */}
          {posters.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
              {posters.map((p, idx) => (
                <button
                  key={p.id || idx}
                  onClick={() => setSelectedPosterIndex(idx)}
                  className={`relative w-16 h-16 rounded-lg overflow-hidden border shrink-0 transition-all ${
                    idx === selectedPosterIndex
                      ? 'border-[var(--cobalt-bright)] ring-2 ring-[var(--cobalt-tint-strong)]'
                      : 'border-[var(--border-card)] opacity-60 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveArtifactUrl(p.imageUrl)}
                    alt={p.title}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* CARD 2: Gemini 3.8 TTS 2-Speaker Audio Walkthrough                 */}
        {/* =================================================================== */}
        <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col p-5 shadow-[var(--shadow-card)] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[var(--emerald-bg)] text-[var(--emerald)]">
                  <Radio className="w-4 h-4" />
                </div>
                <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                  Gemini 3.8 Live TTS Audio Walkthrough
                </h2>
              </div>
              <p className="text-xs text-[var(--ink-secondary)] mt-1">
                Two-speaker podcast (Architect &amp; Explorer) with live Atlas
                camera sync.
              </p>
            </div>

            <button
              onClick={handleGenerateAudioTour}
              disabled={isGeneratingAudio}
              className="px-3 py-1.5 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-[var(--cobalt-glow)] shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isGeneratingAudio ? 'animate-spin' : ''}`}
              />
              {isGeneratingAudio ? 'Synthesizing...' : 'Generate Tour'}
            </button>
          </div>

          {audioError && (
            <div className="p-3 rounded-lg border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] text-[var(--vermilion)] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{audioError}</span>
            </div>
          )}

          {activeAudioTour ? (
            <div className="space-y-3 flex-1 flex flex-col justify-between">
              {/* Native Audio Player (Hidden when fallback) */}
              <audio
                ref={audioRef}
                src={resolveArtifactUrl(activeAudioTour.audioUrl)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlayingAudio(false)}
                className="hidden"
              />

              {/* Custom Player Controls Bar */}
              <div className="p-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlayAudio}
                      className="w-10 h-10 rounded-full bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white flex items-center justify-center transition-colors shadow-[var(--cobalt-glow)]"
                    >
                      {isPlayingAudio ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>
                    <div>
                      <p className="text-xs font-semibold text-[var(--ink-primary)]">
                        {activeAudioTour.title}
                      </p>
                      <p className="text-[11px] text-[var(--ink-muted)] font-mono">
                        {useWebSpeech
                          ? 'Web Speech API Engine'
                          : activeAudioTour.model || 'Gemini 3.8 Live TTS'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUseWebSpeech(!useWebSpeech)}
                      className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors ${
                        useWebSpeech
                          ? 'bg-[var(--amber-bg)] text-[var(--amber)] border-[var(--amber-border)]'
                          : 'bg-[var(--bg-subtle)] text-[var(--ink-muted)] border-[var(--border-subtle)]'
                      }`}
                      title="Toggle between Gemini Audio WAV & Web Speech API"
                    >
                      {useWebSpeech ? 'SpeechSynth active' : 'WAV stream'}
                    </button>
                    <button
                      onClick={() => {
                        if (audioRef.current) {
                          audioRef.current.muted = !isMuted;
                          setIsMuted(!isMuted);
                        }
                      }}
                      className="p-1.5 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="w-full bg-[var(--border-card)] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[var(--cobalt-ice)] h-full transition-all duration-150"
                      style={{
                        width: `${
                          audioDurationSec > 0
                            ? Math.min(100, (currentTimeSec / audioDurationSec) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[var(--ink-muted)]">
                    <span>{formatTime(currentTimeSec)}</span>
                    <span>
                      {formatTime(audioDurationSec || activeAudioTour.durationSec || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Synchronized Cues List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[var(--ink-secondary)] px-1">
                  <span className="font-medium">
                    Live Transcript &amp; Camera Cues (
                    {activeAudioTour.cues?.length || 0})
                  </span>
                  <span className="text-[11px] text-[var(--cobalt-ice)] flex items-center gap-1">
                    <Compass className="w-3 h-3" />
                    Clicks fly Atlas camera
                  </span>
                </div>

                <div
                  ref={cuesScrollRef}
                  className="max-h-52 overflow-y-auto rounded-xl border border-[var(--border-card)] bg-[var(--bg-void)] p-2 space-y-1.5"
                >
                  {activeAudioTour.cues && activeAudioTour.cues.length > 0 ? (
                    activeAudioTour.cues.map((cue, idx) => {
                      const isActive = idx === activeCueIndex;
                      const isArchitect = cue.speaker === 'Architect';
                      return (
                        <div
                          key={idx}
                          onClick={() => seekToCue(idx)}
                          className={`p-2.5 rounded-lg border transition-all cursor-pointer text-xs flex flex-col gap-1 ${
                            isActive
                              ? 'border-[var(--cobalt-ice)] bg-[var(--cobalt-tint)] shadow-[var(--cobalt-glow)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                isArchitect
                                  ? 'bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)]'
                                  : 'bg-[var(--emerald-bg)] text-[var(--emerald)] border border-[var(--emerald-border)]'
                              }`}
                            >
                              {cue.speaker}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--ink-muted)]">
                              {formatTime(cue.approxStartSec)}
                            </span>
                          </div>

                          <p
                            className={`leading-relaxed ${
                              isActive
                                ? 'text-[var(--ink-primary)] font-medium'
                                : 'text-[var(--ink-secondary)]'
                            }`}
                          >
                            {cue.text}
                          </p>

                          {cue.focusNodeId && (
                            <div className="flex items-center gap-1 text-[10px] text-[var(--cobalt-ice)] font-mono self-start mt-0.5">
                              <Compass className="w-2.5 h-2.5" />
                              <span>Focus: {cue.focusNodeId}</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-[var(--ink-muted)] p-3 text-center">
                      No timestamped cues available in this tour.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-80 rounded-xl border border-[var(--border-card)] bg-[var(--bg-stage-grid)] flex items-center justify-center p-6 text-center">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-full bg-[var(--emerald-bg)] text-[var(--emerald)] mx-auto flex items-center justify-center border border-[var(--emerald-border)]">
                  <Mic className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--ink-primary)]">
                    No Audio Tour Yet
                  </p>
                  <p className="text-xs text-[var(--ink-muted)] max-w-xs mx-auto">
                    Generate a two-speaker podcast walkthrough of this
                    architecture. As voices speak, the camera smoothly pans to
                    the relevant Atlas nodes.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* CARD 3: Gemini Omni 1.2 Flash 10s Video Reel                       */}
        {/* =================================================================== */}
        <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col p-5 shadow-[var(--shadow-card)] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[var(--amber-bg)] text-[var(--amber)]">
                  <Film className="w-4 h-4" />
                </div>
                <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                  Gemini Omni 1.2 Flash Video Reel
                </h2>
              </div>
              <p className="text-xs text-[var(--ink-secondary)] mt-1">
                10-second cinematic code reel or animated interactive
                storyboard.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {activeVideoReel && (
                <div className="flex rounded-lg border border-[var(--border-card)] p-0.5 bg-[var(--bg-card-elevated)]">
                  <button
                    onClick={() => setViewMode('video')}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      viewMode === 'video'
                        ? 'bg-[var(--cobalt-core)] text-white'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    Video
                  </button>
                  <button
                    onClick={() => setViewMode('storyboard')}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      viewMode === 'storyboard'
                        ? 'bg-[var(--cobalt-core)] text-white'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    Storyboard
                  </button>
                </div>
              )}

              <button
                onClick={handleGenerateVideoReel}
                disabled={isGeneratingVideo}
                className="px-3 py-1.5 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-[var(--cobalt-glow)] shrink-0"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isGeneratingVideo ? 'animate-spin' : ''}`}
                />
                {isGeneratingVideo ? 'Directing...' : 'Render Reel'}
              </button>
            </div>
          </div>

          {videoError && (
            <div className="p-3 rounded-lg border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] text-[var(--vermilion)] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{videoError}</span>
            </div>
          )}

          {activeVideoReel ? (
            <div className="space-y-3">
              {viewMode === 'video' && activeVideoReel.videoUrl ? (
                <div className="relative w-full h-80 rounded-xl border border-[var(--border-card)] bg-black overflow-hidden flex items-center justify-center">
                  <video
                    src={resolveArtifactUrl(activeVideoReel.videoUrl)}
                    poster={
                      activeVideoReel.posterUrl
                        ? resolveArtifactUrl(activeVideoReel.posterUrl)
                        : undefined
                    }
                    controls
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                /* Animated Interactive Storyboard Player */
                <div className="space-y-3">
                  <div className="relative w-full h-64 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-5 flex flex-col justify-between overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--cobalt-tint)] rounded-full blur-2xl pointer-events-none -z-0" />

                    {/* Frame Header */}
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[var(--amber-bg)] text-[var(--amber)] border border-[var(--amber-border)]">
                          {activeVideoReel.storyboardFrames?.[storyboardFrameIdx]
                            ?.timecode || '00:00'}
                        </span>
                        <span className="text-xs text-[var(--ink-muted)] font-mono">
                          Frame {storyboardFrameIdx + 1} of{' '}
                          {activeVideoReel.storyboardFrames?.length || 1}
                        </span>
                      </div>

                      {activeVideoReel.storyboardFrames?.[storyboardFrameIdx]
                        ?.focusNodeId && (
                        <button
                          onClick={() => {
                            const node =
                              activeVideoReel.storyboardFrames?.[storyboardFrameIdx]
                                ?.focusNodeId;
                            if (node) onFocusNode(node, true);
                          }}
                          className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)] hover:bg-[var(--cobalt-core)] hover:text-white transition-colors flex items-center gap-1"
                        >
                          <Compass className="w-3 h-3" />
                          Fly Camera: {activeVideoReel.storyboardFrames[storyboardFrameIdx].focusNodeId}
                        </button>
                      )}
                    </div>

                    {/* Frame Visual / Caption */}
                    <div className="relative z-10 py-4 text-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] mx-auto flex items-center justify-center border border-[var(--cobalt-border)] shadow-[var(--cobalt-glow)]">
                        <Video className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-medium text-[var(--ink-primary)] max-w-md mx-auto leading-relaxed">
                        {activeVideoReel.storyboardFrames?.[storyboardFrameIdx]
                          ?.caption || 'Storyboarding architecture flow...'}
                      </p>
                    </div>

                    {/* Storyboard Controls */}
                    <div className="relative z-10 flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                      <button
                        onClick={() => handleStepStoryboard('prev')}
                        className="p-1.5 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                      >
                        <SkipBack className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() =>
                          setIsStoryboardPlaying(!isStoryboardPlaying)
                        }
                        className="px-3 py-1 rounded-lg bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                      >
                        {isStoryboardPlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5" /> Pause Flow
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" /> Auto-Cycle
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleStepStoryboard('next')}
                        className="p-1.5 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Frame Thumbnails Indicator */}
                  <div className="grid grid-cols-4 gap-2">
                    {activeVideoReel.storyboardFrames?.map((f, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setStoryboardFrameIdx(idx);
                          if (f.focusNodeId) onFocusNode(f.focusNodeId, false);
                        }}
                        className={`p-2 rounded-lg border text-left transition-all ${
                          idx === storyboardFrameIdx
                            ? 'border-[var(--cobalt-ice)] bg-[var(--cobalt-tint)]'
                            : 'border-[var(--border-card)] bg-[var(--bg-card)] opacity-70 hover:opacity-100'
                        }`}
                      >
                        <p className="text-[10px] font-mono text-[var(--ink-muted)]">
                          {f.timecode}
                        </p>
                        <p className="text-[11px] font-medium text-[var(--ink-primary)] truncate mt-0.5">
                          {f.caption}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-[var(--ink-muted)] font-mono">
                <span>Model: {activeVideoReel.model}</span>
                <span>Duration: {activeVideoReel.durationSec}s</span>
              </div>
            </div>
          ) : (
            <div className="h-80 rounded-xl border border-[var(--border-card)] bg-[var(--bg-stage-grid)] flex items-center justify-center p-6 text-center">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-full bg-[var(--amber-bg)] text-[var(--amber)] mx-auto flex items-center justify-center border border-[var(--amber-border)]">
                  <Film className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--ink-primary)]">
                    No Video Reel Generated
                  </p>
                  <p className="text-xs text-[var(--ink-muted)] max-w-xs mx-auto">
                    Render an animated 10s video walkthrough using Gemini Omni
                    1.2 Flash, captured from your current Atlas state.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* CARD 4: Antigravity Managed Agent / Deep Research Forensics        */}
        {/* =================================================================== */}
        <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col p-5 shadow-[var(--shadow-card)] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[var(--vermilion-bg)] text-[var(--vermilion)]">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                  Autonomous Forensics &amp; Deep Research
                </h2>
              </div>
              <p className="text-xs text-[var(--ink-secondary)] mt-1">
                Managed Agent autonomous code inspection &amp; invariant audit.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-[var(--border-card)] p-0.5 bg-[var(--bg-card-elevated)]">
                <button
                  onClick={() => setForensicsMode('managed_agent')}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    forensicsMode === 'managed_agent'
                      ? 'bg-[var(--cobalt-core)] text-white'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  Managed Agent
                </button>
                <button
                  onClick={() => setForensicsMode('deep_research')}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    forensicsMode === 'deep_research'
                      ? 'bg-[var(--cobalt-core)] text-white'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  Deep Research
                </button>
              </div>

              <button
                onClick={handleRunForensics}
                disabled={isRunningForensics}
                className="px-3 py-1.5 rounded-lg bg-[var(--vermilion)] hover:bg-[var(--vermilion-hover)] text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_0_20px_-4px_rgba(255,90,79,0.5)] shrink-0"
              >
                <Flame
                  className={`w-3.5 h-3.5 ${isRunningForensics ? 'animate-bounce' : ''}`}
                />
                {isRunningForensics ? 'Investigating...' : 'Launch Agent'}
              </button>
            </div>
          </div>

          {forensicsError && (
            <div className="p-3 rounded-lg border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] text-[var(--vermilion)] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{forensicsError}</span>
            </div>
          )}

          {/* Running State Telemetry Banner */}
          {isRunningForensics && (
            <div className="p-4 rounded-xl border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[var(--cobalt-ice)] font-medium flex items-center gap-2">
                  <Bot className="w-4 h-4 animate-spin" />
                  Antigravity Agent Active ({forensicsMode})
                </span>
                <span className="text-[var(--ink-muted)]">Step {forensicsStep}/4</span>
              </div>
              <div className="w-full bg-[var(--border-card)] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[var(--cobalt-core)] h-full transition-all duration-500"
                  style={{ width: `${(forensicsStep / 4) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-[var(--ink-secondary)]">
                {forensicsStep === 1 && 'Traversing AST graph & entrypoint fan-in paths...'}
                {forensicsStep === 2 && 'Calibrating module security blast radius & concurrency...'}
                {forensicsStep === 3 && 'Probing invariant boundaries against repo contracts...'}
                {forensicsStep === 4 && 'Synthesizing actionable forensic remediation report...'}
              </p>
            </div>
          )}

          {forensicsReport ? (
            <div className="space-y-3 flex-1 flex flex-col">
              {/* Summary Header */}
              <div className="p-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--ink-primary)]">
                    Agent Investigation Summary
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--ink-muted)]">
                    {forensicsReport.agent}
                  </span>
                </div>
                <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                  {forensicsReport.summary}
                </p>
              </div>

              {/* Severity Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-mono">
                {(['all', 'critical', 'high', 'medium', 'low', 'info'] as const).map(
                  (sev) => (
                    <button
                      key={sev}
                      onClick={() => setSeverityFilter(sev)}
                      className={`px-2.5 py-1 rounded-md border transition-colors capitalize ${
                        severityFilter === sev
                          ? 'border-[var(--cobalt-ice)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] font-semibold'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                      }`}
                    >
                      {sev}
                    </button>
                  )
                )}
              </div>

              {/* Findings List */}
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {filteredFindings.length > 0 ? (
                  filteredFindings.map((finding, idx) => {
                    const matchedNode = findNodeByPath(finding.filePath);
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border space-y-2 text-xs transition-colors ${getSeverityStyles(
                          finding.severity
                        )}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {getSeverityIcon(finding.severity)}
                            <span className="font-semibold">{finding.title}</span>
                          </div>
                          <span className="uppercase text-[10px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded">
                            {finding.severity}
                          </span>
                        </div>

                        {/* Evidence */}
                        <div className="space-y-1">
                          <p className="text-[11px] opacity-90 leading-relaxed font-sans">
                            {finding.evidence}
                          </p>
                          {finding.filePath && (
                            <div className="flex items-center gap-1.5 font-mono text-[10px] opacity-75">
                              <FileCode2 className="w-3 h-3" />
                              <span>{finding.filePath}</span>
                            </div>
                          )}
                        </div>

                        {/* Recommendation + Node Focus */}
                        <div className="pt-2 border-t border-current/15 flex items-center justify-between gap-2">
                          <p className="text-[11px] font-medium leading-relaxed">
                            💡 {finding.recommendation}
                          </p>

                          {matchedNode && (
                            <button
                              onClick={() => onFocusNode(matchedNode.id, true)}
                              className="px-2 py-1 rounded bg-[var(--bg-void)]/60 hover:bg-[var(--bg-void)] text-white text-[10px] font-mono flex items-center gap-1 transition-colors shrink-0 border border-white/20"
                            >
                              <Compass className="w-2.5 h-2.5" />
                              Atlas
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-[var(--ink-muted)] text-center py-6">
                    No findings match severity filter &ldquo;{severityFilter}&rdquo;.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="h-80 rounded-xl border border-[var(--border-card)] bg-[var(--bg-stage-grid)] flex items-center justify-center p-6 text-center">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-full bg-[var(--vermilion-bg)] text-[var(--vermilion)] mx-auto flex items-center justify-center border border-[var(--vermilion-border)]">
                  <Bot className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--ink-primary)]">
                    Forensics Ready to Deploy
                  </p>
                  <p className="text-xs text-[var(--ink-muted)] max-w-xs mx-auto">
                    Run an autonomous Deep Research agent to discover hidden
                    invariant regressions, cyclical memory bottlenecks, and
                    security boundaries.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* Lightbox Modal for Poster Zoom                                        */}
      {/* --------------------------------------------------------------------- */}
      {isPosterLightboxOpen && activePoster && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
          onClick={() => setIsPosterLightboxOpen(false)}
        >
          <div
            className="relative max-w-6xl max-h-[90vh] w-full h-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-2 right-2 flex items-center gap-2 z-20">
              <button
                onClick={() => handleDownloadPoster(activePoster)}
                className="px-3 py-1.5 rounded-lg bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
              <button
                onClick={() => setIsPosterLightboxOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveArtifactUrl(activePoster.imageUrl)}
              alt={activePoster.title}
              className="max-w-full max-h-[85vh] object-contain rounded-xl border border-white/10 shadow-2xl"
            />

            <div className="mt-3 text-center">
              <p className="text-sm font-semibold text-white">
                {activePoster.title}
              </p>
              <p className="text-xs text-[var(--ink-secondary)] font-mono">
                {activePoster.style} • {activePoster.model}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Utility Helpers
// -----------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getSeverityStyles(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] text-[var(--vermilion)]';
    case 'high':
      return 'border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]';
    case 'medium':
      return 'border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]';
    case 'low':
      return 'border-[var(--emerald-border)] bg-[var(--emerald-bg)] text-[var(--emerald)]';
    default:
      return 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-secondary)]';
  }
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'critical':
      return <AlertOctagon className="w-4 h-4 shrink-0 text-[var(--vermilion)]" />;
    case 'high':
      return <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--amber)]" />;
    case 'medium':
      return <AlertCircle className="w-4 h-4 shrink-0 text-[var(--cobalt-ice)]" />;
    case 'low':
      return <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--emerald)]" />;
    default:
      return <Info className="w-4 h-4 shrink-0 text-[var(--ink-muted)]" />;
  }
}
