'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Radio,
  PhoneOff,
  Send,
  X,
  ChevronUp,
  ChevronDown,
  Sparkles,
  AlertCircle,
  MessageSquareQuote,
  Zap,
} from 'lucide-react';
import type { LiveVoiceToolAction } from '@shared/types';
import type { LiveTranscriptEntry } from '@/lib/useLiveVoiceTutor';

export interface LiveVoiceDockProps {
  open: boolean;
  status: 'idle' | 'connecting' | 'live' | 'error';
  isMuted: boolean;
  isSpeaking: boolean;
  isVisionEnabled: boolean;
  audioLevel: number;
  transcripts: LiveTranscriptEntry[];
  lastToolAction: LiveVoiceToolAction | null;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleMute: () => void;
  onToggleVision: () => void;
  onSendText: (text: string) => void;
  onClose: () => void;
}

/**
 * Format tool action name and parameters for concise pill representation
 */
function formatToolActionDisplay(action: LiveVoiceToolAction): { title: string; detail: string } {
  const toolName = action.tool.replace(/_/g, ' ');
  const entries = Object.entries(action.args || {});
  if (entries.length === 0) {
    return { title: toolName, detail: 'Executing...' };
  }
  const summary = entries
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ');
  return {
    title: toolName,
    detail: summary.length > 50 ? `${summary.slice(0, 48)}…` : summary,
  };
}

export function LiveVoiceDock({
  open,
  status,
  isMuted,
  isSpeaking,
  isVisionEnabled,
  audioLevel,
  transcripts,
  lastToolAction,
  error,
  onConnect,
  onDisconnect,
  onToggleMute,
  onToggleVision,
  onSendText,
  onClose,
}: LiveVoiceDockProps) {
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [showTextInput, setShowTextInput] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript container when history is open
  useEffect(() => {
    if (showHistory && historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts, showHistory]);

  // Focus input when text bar is revealed
  useEffect(() => {
    if (showTextInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showTextInput]);

  // Most recent transcript entry
  const latestTranscript = useMemo(() => {
    if (transcripts.length === 0) return null;
    return transcripts[transcripts.length - 1];
  }, [transcripts]);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setInputText('');
    setShowTextInput(false);
  };

  if (!open) {
    return null;
  }

  // Reactive heights for the 5 audio visualizer bars
  const clampedLevel = Math.max(0, Math.min(1, audioLevel));
  const barHeights = [
    Math.max(4, Math.round(clampedLevel * 24 * 0.5)),
    Math.max(6, Math.round(clampedLevel * 24 * 0.85)),
    Math.max(8, Math.round(clampedLevel * 24 * 1.0)),
    Math.max(6, Math.round(clampedLevel * 24 * 0.75)),
    Math.max(4, Math.round(clampedLevel * 24 * 0.45)),
  ];

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 max-w-2xl w-[calc(100vw-2rem)] select-none pointer-events-auto transition-all duration-300"
      aria-label="Gemini 3.8 Live Voice Tutor Floating Dock"
    >
      {/* 1. Luminous Tool Action Flyout (if active) */}
      {lastToolAction && (
        <div
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono backdrop-blur-xl animate-fade-in shadow-lg border"
          style={{
            backgroundColor: 'var(--bg-card-elevated)',
            borderColor: 'var(--cobalt-ice)',
            boxShadow: '0 0 16px -4px var(--cobalt-core)',
          }}
        >
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]">
            <Zap className="w-2.5 h-2.5 fill-current animate-pulse" />
          </span>
          <span className="font-semibold capitalize text-[var(--cobalt-ice)]">
            {formatToolActionDisplay(lastToolAction).title}
          </span>
          <span className="text-[var(--ink-muted)]">|</span>
          <span className="text-[var(--ink-secondary)] truncate max-w-xs">
            {formatToolActionDisplay(lastToolAction).detail}
          </span>
        </div>
      )}

      {/* 2. Error Notification Pill (if any) */}
      {error && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono border backdrop-blur-xl shadow-lg"
          style={{
            backgroundColor: 'var(--vermilion-bg)',
            borderColor: 'var(--vermilion-border)',
            color: 'var(--vermilion)',
          }}
        >
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate max-w-sm">{error}</span>
          {status !== 'connecting' && (
            <button
              onClick={onConnect}
              className="ml-1 underline font-semibold hover:opacity-80 transition-opacity"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* 3. Live Caption / Speaking Indicator Bubble (collapsible drawer toggle) */}
      {status === 'live' && latestTranscript && !showHistory && (
        <div
          onClick={() => setShowHistory(true)}
          className="cursor-pointer max-w-md w-full px-4 py-2 rounded-2xl backdrop-blur-md border shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99] flex items-start gap-2.5"
          style={{
            backgroundColor: 'var(--bg-card-elevated)',
            borderColor: 'var(--border-card)',
          }}
          title="Click to view full transcript history"
        >
          <div className="mt-0.5 flex-shrink-0">
            {latestTranscript.role === 'model' ? (
              <Sparkles className="w-3.5 h-3.5 text-[var(--cobalt-bright)]" />
            ) : latestTranscript.role === 'tool' ? (
              <Zap className="w-3.5 h-3.5 text-[var(--cobalt-ice)]" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-[var(--emerald)]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-[var(--ink-muted)] mb-0.5">
              <span className="uppercase tracking-wider">
                {latestTranscript.role === 'model'
                  ? 'Gemini Live'
                  : latestTranscript.role === 'tool'
                  ? 'Tool Executed'
                  : 'You'}
              </span>
              <span>{new Date(latestTranscript.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
            <p className="text-xs text-[var(--ink-primary)] line-clamp-2 leading-relaxed">
              {latestTranscript.text}
            </p>
          </div>
          <ChevronUp className="w-3.5 h-3.5 text-[var(--ink-muted)] flex-shrink-0 self-center" />
        </div>
      )}

      {/* 4. Full Transcript History Drawer (Expanded) */}
      {showHistory && (
        <div
          className="w-full max-h-64 flex flex-col rounded-2xl backdrop-blur-xl border shadow-2xl overflow-hidden transition-all duration-300"
          style={{
            backgroundColor: 'var(--bg-card-elevated)',
            borderColor: 'var(--border-card)',
          }}
        >
          <div className="px-4 py-2 border-b flex items-center justify-between text-xs font-mono" style={{ borderColor: 'var(--border-card)' }}>
            <span className="flex items-center gap-1.5 text-[var(--ink-primary)] font-semibold">
              <MessageSquareQuote className="w-3.5 h-3.5 text-[var(--cobalt-bright)]" />
              Live Conversation Transcripts
            </span>
            <button
              onClick={() => setShowHistory(false)}
              className="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 rounded-md transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
            {transcripts.length === 0 ? (
              <div className="text-center py-6 text-[var(--ink-muted)] italic font-mono text-xs">
                No transcripts yet. Speak or type to start tutoring.
              </div>
            ) : (
              transcripts.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex flex-col gap-1 p-2.5 rounded-xl border ${
                    entry.role === 'user'
                      ? 'ml-8 bg-[var(--cobalt-tint)] border-[var(--cobalt-border)] text-[var(--ink-primary)]'
                      : entry.role === 'tool'
                      ? 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--cobalt-ice)] font-mono'
                      : 'mr-8 bg-[var(--bg-card)] border-[var(--border-card)] text-[var(--ink-primary)]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-[var(--ink-muted)]">
                    <span className="font-semibold uppercase">
                      {entry.role === 'user' ? 'You' : entry.role === 'tool' ? 'System Action' : 'Gemini Tutor'}
                    </span>
                    <span>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  <div className="leading-relaxed whitespace-pre-wrap">{entry.text}</div>
                </div>
              ))
            )}
            <div ref={historyEndRef} />
          </div>
        </div>
      )}

      {/* 5. Quick Text Turn Input Overlay (if open) */}
      {showTextInput && (
        <form
          onSubmit={handleSendText}
          className="w-full max-w-md flex items-center gap-2 p-1.5 rounded-full backdrop-blur-xl border shadow-xl"
          style={{
            backgroundColor: 'var(--bg-card-elevated)',
            borderColor: 'var(--cobalt-border)',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type instructions or questions for live tutor..."
            className="flex-1 bg-transparent px-3 py-1 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] outline-none font-sans"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="w-7 h-7 rounded-full flex items-center justify-center text-white disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: 'var(--cobalt-core)' }}
            title="Send text message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowTextInput(false)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors"
            title="Cancel text input"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* 6. Main Obsidian Cobalt Floating Pill Dock */}
      <div
        className="backdrop-blur-2xl px-3.5 py-2 rounded-full border shadow-2xl flex items-center gap-3 transition-all duration-200"
        style={{
          backgroundColor: 'var(--bg-card-elevated)',
          borderColor: status === 'live' ? 'var(--cobalt-border)' : 'var(--border-card)',
          boxShadow: status === 'live' ? '0 8px 32px -4px rgba(26, 115, 232, 0.28)' : '0 8px 24px -6px rgba(0,0,0,0.6)',
        }}
      >
        {/* Connection status badge & Reactive Audio Bars */}
        <div className="flex items-center gap-2.5 pl-1 pr-2 border-r" style={{ borderColor: 'var(--border-card)' }}>
          {status === 'idle' && (
            <button
              onClick={onConnect}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium text-[var(--ink-primary)] bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] hover:bg-[var(--cobalt-core)] hover:text-white transition-all cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 text-[var(--cobalt-ice)]" />
              <span>Start Tutor</span>
            </button>
          )}

          {status === 'connecting' && (
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--amber)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--amber)] animate-ping" />
              <span>Connecting…</span>
            </div>
          )}

          {status === 'live' && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--emerald)] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--emerald)]" />
              </span>
              <span className="text-[11px] font-mono font-semibold tracking-wider text-[var(--ink-primary)] hidden sm:inline">
                GEMINI 3.8
              </span>

              {/* Reactive Audio Equalizer Waveform */}
              <div
                className="flex items-end gap-1 h-5 px-1.5 py-0.5 rounded-md bg-[var(--bg-void)] border border-[var(--border-subtle)]"
                title={
                  isMuted
                    ? 'Microphone muted'
                    : isSpeaking
                    ? 'Gemini speaking'
                    : 'Listening to your microphone'
                }
              >
                {isMuted ? (
                  <span className="text-[9px] font-mono text-[var(--vermilion)] px-1">MUTED</span>
                ) : (
                  barHeights.map((h, i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full transition-all duration-75"
                      style={{
                        height: isSpeaking ? `${Math.max(6, (i % 2 === 0 ? 16 : 22))}px` : `${h}px`,
                        backgroundColor: isSpeaking
                          ? 'var(--cobalt-bright)'
                          : audioLevel > 0.1
                          ? 'var(--emerald)'
                          : 'var(--cobalt-ice)',
                        opacity: isSpeaking || audioLevel > 0.05 ? 1 : 0.4,
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-[var(--vermilion)]">
              <AlertCircle className="w-3.5 h-3.5" />
              <button
                onClick={onConnect}
                className="underline font-semibold hover:opacity-80 transition-opacity"
              >
                Reconnect
              </button>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Mute Toggle */}
          <button
            onClick={onToggleMute}
            disabled={status !== 'live'}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              isMuted
                ? 'bg-[var(--vermilion-bg)] text-[var(--vermilion)] border border-[var(--vermilion-border)] hover:opacity-90'
                : 'text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] active:scale-95'
            } disabled:opacity-30 disabled:pointer-events-none`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Canvas Vision Toggle */}
          <button
            onClick={onToggleVision}
            disabled={status !== 'live'}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              isVisionEnabled
                ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)] shadow-[0_0_12px_rgba(26,115,232,0.4)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] active:scale-95'
            } disabled:opacity-30 disabled:pointer-events-none`}
            title={
              isVisionEnabled
                ? 'Canvas Vision Active (streaming snapshots every 2.5s)'
                : 'Enable Canvas Vision (Gemini sees your active architecture)'
            }
            aria-label="Toggle Canvas Vision"
          >
            {isVisionEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
          </button>

          {/* Quick Text Turn Prompt Toggle */}
          <button
            onClick={() => setShowTextInput((prev) => !prev)}
            disabled={status !== 'live'}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              showTextInput
                ? 'bg-[var(--cobalt-core)] text-white'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] active:scale-95'
            } disabled:opacity-30 disabled:pointer-events-none`}
            title="Type a quick prompt or question"
            aria-label="Type text instruction"
          >
            <Send className="w-3.5 h-3.5" />
          </button>

          {/* Transcripts toggle */}
          <button
            onClick={() => setShowHistory((prev) => !prev)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              showHistory
                ? 'bg-[var(--bg-subtle-hover)] text-[var(--cobalt-bright)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)]'
            }`}
            title="Toggle transcript drawer"
            aria-label="Toggle transcripts"
          >
            <MessageSquareQuote className="w-4 h-4" />
          </button>

          {/* Disconnect Call */}
          {status === 'live' && (
            <button
              onClick={onDisconnect}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white bg-[var(--vermilion)] hover:bg-[var(--vermilion-hover)] transition-transform active:scale-95 cursor-pointer shadow-md"
              title="End Voice Tutor session"
              aria-label="Disconnect Voice Tutor"
            >
              <PhoneOff className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Close Dock Pill */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] transition-colors cursor-pointer ml-1"
            title="Close voice dock"
            aria-label="Close voice tutor dock"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default LiveVoiceDock;
