'use client';

// =============================================================================
// GitUnderstand (git-understand.com) — BYOK & Theme Settings Modal
// Agent 54: Manages BYOK Gemini API Key, GitHub PAT, Deep Carbon toggle,
// 3-state Theme selector (System / Obsidian Dark / Archival Paper Light),
// and displays active Gemini 4 model routing status from backend health.
// =============================================================================

import React, {
  useState,
  useEffect,
  useCallback,
  useTransition,
  useId,
} from 'react';
import { NativeDialog } from './NativeDialog';
import { useTheme, type ThemePreference } from '@/lib/useTheme';
import {
  getByokConfig,
  setByokConfig,
  fetchHealth,
  type ByokConfig,
} from '@/lib/api';
import type { BackendHealthStatus } from '@shared/types';
import {
  GeminiSparkleMark,
  GitHubMark,
  GitUnderstandPrismMark,
} from './BrandMarks';

export interface ByokSettingsModalProps {
  /** Controlled visibility state */
  open: boolean;
  /** Invoked when user dismisses or closes the modal */
  onClose: () => void;
  /** Optional callback fired when new BYOK settings are persisted */
  onSaved?: (config: ByokConfig) => void;
  /** Default active tab ('credentials' | 'theme' | 'routing') */
  defaultTab?: 'credentials' | 'theme' | 'routing';
}

type TabId = 'credentials' | 'theme' | 'routing';

export function ByokSettingsModal({
  open,
  onClose,
  onSaved,
  defaultTab = 'credentials',
}: ByokSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  // Local BYOK inputs
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [deepThinking, setDeepThinking] = useState(false);

  // UI state
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'reset'>('idle');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Health and Model Routing State
  const [health, setHealth] = useState<BackendHealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [, startTransition] = useTransition();
  const { preference, resolvedTheme, setPreference } = useTheme();

  const geminiInputId = useId();
  const githubInputId = useId();
  const deepThinkingInputId = useId();

  // Load existing BYOK values into local state on open
  useEffect(() => {
    if (open) {
      const cfg = getByokConfig();
      setGeminiApiKey(cfg.geminiApiKey || '');
      setGithubToken(cfg.githubToken || '');
      setDeepThinking(Boolean(cfg.deepThinking));
      setSaveStatus('idle');
      loadHealthStatus();
    }
  }, [open]);

  // Sync defaultTab if changed
  useEffect(() => {
    if (open && defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  const loadHealthStatus = useCallback(() => {
    setHealthLoading(true);
    setHealthError(null);
    fetchHealth()
      .then((data) => {
        if (data) {
          setHealth(data);
        } else {
          setHealthError('Backend health probe returned an empty response.');
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to reach backend';
        setHealthError(msg);
      })
      .finally(() => {
        setHealthLoading(false);
      });
  }, []);

  // Save changes to localStorage & memory session
  const handleSave = useCallback(() => {
    const updated = setByokConfig({
      geminiApiKey: geminiApiKey.trim(),
      githubToken: githubToken.trim(),
      deepThinking,
    });

    setSaveStatus('saved');
    onSaved?.(updated);

    // Refresh health to verify authentication status with newly passed headers
    loadHealthStatus();

    // Auto-clear saved notification after 3 seconds
    const timer = setTimeout(() => {
      setSaveStatus('idle');
    }, 3000);

    return () => clearTimeout(timer);
  }, [geminiApiKey, githubToken, deepThinking, onSaved, loadHealthStatus]);

  // Reset to empty BYOK (fall back to server-side env keys)
  const handleReset = useCallback(() => {
    setGeminiApiKey('');
    setGithubToken('');
    setDeepThinking(false);

    const cleared = setByokConfig({
      geminiApiKey: '',
      githubToken: '',
      deepThinking: false,
    });

    setSaveStatus('reset');
    onSaved?.(cleared);
    loadHealthStatus();

    const timer = setTimeout(() => {
      setSaveStatus('idle');
    }, 2500);

    return () => clearTimeout(timer);
  }, [onSaved, loadHealthStatus]);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedKey(label);
      setTimeout(() => setCopiedKey(null), 1800);
    });
  };

  const hasCustomGemini = Boolean(geminiApiKey.trim());
  const hasCustomGithub = Boolean(githubToken.trim());

  // Model display mapping
  const models = health?.gemini?.models || {
    architect: 'gemini-4-carbon',
    visual: 'gemini-4-neon',
    fast: 'gemini-4-argon',
    oracle: 'gemini-4-carbon',
    decisions: 'gemini-decision-1',
    live: 'gemini-3.8-live',
    image: 'gemini-3.1-flash-image',
    tts: 'gemini-3.8-flash-tts',
    video: 'gemini-omni-1.2-flash',
    embedding: 'gemini-embedding-2',
    transcribe: 'gemini-3.5-transcribe',
  };

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      widthClass="w-[min(94vw,660px)]"
      title={
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{
              background: 'var(--cobalt-tint)',
              border: '1px solid var(--cobalt-border)',
            }}
          >
            <GitUnderstandPrismMark size={18} glow />
          </div>
          <span className="font-semibold text-base sm:text-lg tracking-tight">
            Settings &amp; BYOK Configuration
          </span>
        </div>
      }
      subtitle={
        <span className="text-xs sm:text-sm" style={{ color: 'var(--ink-secondary)' }}>
          Manage your Gemini 4 API credentials, GitHub access tokens, deep reasoning engine, and workspace aesthetic.
        </span>
      }
      footer={
        <div className="flex items-center justify-between w-full pt-1">
          <div className="flex items-center gap-2">
            {saveStatus === 'saved' && (
              <span
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full animate-fade-in"
                style={{
                  background: 'var(--emerald-bg)',
                  color: 'var(--emerald)',
                  border: '1px solid var(--emerald-border)',
                }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Preferences Saved
              </span>
            )}
            {saveStatus === 'reset' && (
              <span
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full animate-fade-in"
                style={{
                  background: 'var(--amber-bg)',
                  color: 'var(--amber)',
                  border: '1px solid var(--amber-border)',
                }}
              >
                Reset to Shared Defaults
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {(hasCustomGemini || hasCustomGithub || deepThinking) && (
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-white/5 active:scale-95"
                style={{
                  color: 'var(--ink-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
                title="Clear custom tokens and revert to backend pooled keys"
              >
                Clear Custom Keys
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors"
              style={{
                color: 'var(--ink-secondary)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-card)',
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg shadow-sm transition-all active:scale-95"
              style={{
                background: 'var(--cobalt-core)',
                color: '#FFFFFF',
                boxShadow: 'var(--cobalt-glow)',
              }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Apply Settings
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Navigation Tabs */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{
            background: 'var(--bg-card-elevated)',
            border: '1px solid var(--border-card)',
          }}
          role="tablist"
          aria-label="Settings categories"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'credentials'}
            onClick={() => setActiveTab('credentials')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'credentials'
                ? 'shadow-sm font-semibold'
                : 'opacity-75 hover:opacity-100'
            }`}
            style={{
              background:
                activeTab === 'credentials'
                  ? 'var(--bg-card)'
                  : 'transparent',
              color:
                activeTab === 'credentials'
                  ? 'var(--cobalt-bright)'
                  : 'var(--ink-secondary)',
              border:
                activeTab === 'credentials'
                  ? '1px solid var(--border-subtle)'
                  : '1px solid transparent',
            }}
          >
            <GeminiSparkleMark size={14} />
            <span>BYOK &amp; Tokens</span>
            {(hasCustomGemini || hasCustomGithub) && (
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--emerald)' }}
                title="Custom credentials active"
              />
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'theme'}
            onClick={() => setActiveTab('theme')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'theme'
                ? 'shadow-sm font-semibold'
                : 'opacity-75 hover:opacity-100'
            }`}
            style={{
              background:
                activeTab === 'theme' ? 'var(--bg-card)' : 'transparent',
              color:
                activeTab === 'theme'
                  ? 'var(--cobalt-bright)'
                  : 'var(--ink-secondary)',
              border:
                activeTab === 'theme'
                  ? '1px solid var(--border-subtle)'
                  : '1px solid transparent',
            }}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
              />
            </svg>
            <span>Aesthetics</span>
            <span
              className="text-[10px] px-1.5 py-0.2 rounded"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--ink-muted)',
              }}
            >
              {preference === 'system'
                ? 'System'
                : preference === 'dark'
                  ? 'Obsidian'
                  : 'Paper'}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'routing'}
            onClick={() => setActiveTab('routing')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'routing'
                ? 'shadow-sm font-semibold'
                : 'opacity-75 hover:opacity-100'
            }`}
            style={{
              background:
                activeTab === 'routing' ? 'var(--bg-card)' : 'transparent',
              color:
                activeTab === 'routing'
                  ? 'var(--cobalt-bright)'
                  : 'var(--ink-secondary)',
              border:
                activeTab === 'routing'
                  ? '1px solid var(--border-subtle)'
                  : '1px solid transparent',
            }}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                health?.ok
                  ? 'animate-pulse'
                  : healthError
                    ? 'opacity-80'
                    : 'animate-spin'
              }`}
              style={{
                background: health?.ok
                  ? 'var(--emerald)'
                  : healthError
                    ? 'var(--vermilion)'
                    : 'var(--amber)',
              }}
            />
            <span>Gemini 4 Engine</span>
          </button>
        </div>

        {/* TAB 1: CREDENTIALS (BYOK Gemini & GitHub PAT + Deep Carbon) */}
        {activeTab === 'credentials' && (
          <div className="space-y-4 animate-fade-in">
            {/* Gemini API Key Box */}
            <div
              className="p-4 rounded-xl space-y-3"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-card)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GeminiSparkleMark size={18} glow />
                  <div>
                    <label
                      htmlFor={geminiInputId}
                      className="text-xs font-semibold tracking-wide flex items-center gap-1.5 cursor-pointer"
                      style={{ color: 'var(--ink-primary)' }}
                    >
                      Gemini API Key (BYOK)
                      {hasCustomGemini ? (
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: 'var(--emerald-bg)',
                            color: 'var(--emerald)',
                            border: '1px solid var(--emerald-border)',
                          }}
                        >
                          Custom Key Active
                        </span>
                      ) : (
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: 'var(--bg-subtle)',
                            color: 'var(--ink-muted)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          Shared Server Pool
                        </span>
                      )}
                    </label>
                  </div>
                </div>

                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] flex items-center gap-1 transition-colors hover:underline"
                  style={{ color: 'var(--cobalt-ice)' }}
                >
                  <span>Get Gemini Key</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>

              <div className="relative flex items-center">
                <input
                  id={geminiInputId}
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy... (leave blank to use shared quota)"
                  autoComplete="off"
                  spellCheck="false"
                  className="w-full text-xs font-mono py-2.5 pl-3.5 pr-20 rounded-lg transition-all focus:outline-none"
                  style={{
                    background: 'var(--bg-card-elevated)',
                    color: 'var(--ink-primary)',
                    border: '1px solid var(--border-card)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
                  }}
                />

                <div className="absolute right-2 flex items-center gap-1">
                  {geminiApiKey && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(geminiApiKey, 'gemini')}
                      className="p-1 rounded text-xs opacity-60 hover:opacity-100 transition-opacity"
                      title="Copy Key"
                    >
                      {copiedKey === 'gemini' ? (
                        <span className="text-[10px]" style={{ color: 'var(--emerald)' }}>
                          Copied!
                        </span>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowGeminiKey((prev) => !prev)}
                    className="p-1 rounded text-xs opacity-60 hover:opacity-100 transition-opacity"
                    title={showGeminiKey ? 'Hide key' : 'Show key'}
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    {showGeminiKey ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                        />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                Your personal key unlocks unlimited rate limits for Gemini 4 Carbon, Neon, and Decision-1.
                Injected via client header <code className="font-mono px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-subtle)' }}>x-gemini-api-key</code>.
                Stored locally in your browser only; never persisted on disk.
              </p>
            </div>

            {/* GitHub PAT Box */}
            <div
              className="p-4 rounded-xl space-y-3"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-card)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitHubMark size={18} />
                  <div>
                    <label
                      htmlFor={githubInputId}
                      className="text-xs font-semibold tracking-wide flex items-center gap-1.5 cursor-pointer"
                      style={{ color: 'var(--ink-primary)' }}
                    >
                      GitHub Personal Access Token (PAT)
                      {hasCustomGithub ? (
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: 'var(--emerald-bg)',
                            color: 'var(--emerald)',
                            border: '1px solid var(--emerald-border)',
                          }}
                        >
                          Custom PAT Active
                        </span>
                      ) : (
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: 'var(--bg-subtle)',
                            color: 'var(--ink-muted)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          Public Repos Only
                        </span>
                      )}
                    </label>
                  </div>
                </div>

                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,read:packages&description=GitUnderstand%20Studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] flex items-center gap-1 transition-colors hover:underline"
                  style={{ color: 'var(--cobalt-ice)' }}
                >
                  <span>Generate Token</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>

              <div className="relative flex items-center">
                <input
                  id={githubInputId}
                  type={showGithubToken ? 'text' : 'password'}
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_... or github_pat_... (read:repo scope)"
                  autoComplete="off"
                  spellCheck="false"
                  className="w-full text-xs font-mono py-2.5 pl-3.5 pr-20 rounded-lg transition-all focus:outline-none"
                  style={{
                    background: 'var(--bg-card-elevated)',
                    color: 'var(--ink-primary)',
                    border: '1px solid var(--border-card)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
                  }}
                />

                <div className="absolute right-2 flex items-center gap-1">
                  {githubToken && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(githubToken, 'github')}
                      className="p-1 rounded text-xs opacity-60 hover:opacity-100 transition-opacity"
                      title="Copy Token"
                    >
                      {copiedKey === 'github' ? (
                        <span className="text-[10px]" style={{ color: 'var(--emerald)' }}>
                          Copied!
                        </span>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowGithubToken((prev) => !prev)}
                    className="p-1 rounded text-xs opacity-60 hover:opacity-100 transition-opacity"
                    title={showGithubToken ? 'Hide token' : 'Show token'}
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    {showGithubToken ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                        />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                Elevates GitHub rate limit from 60 req/hr to 5,000 req/hr and enables ingestion of private team repositories.
                Injected as <code className="font-mono px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-subtle)' }}>x-github-token</code>.
              </p>
            </div>

            {/* Deep Carbon Architecture Mode Toggle */}
            <div
              className="p-4 rounded-xl flex items-start justify-between gap-4 transition-all"
              style={{
                background: deepThinking ? 'var(--cobalt-tint)' : 'var(--bg-card)',
                border: deepThinking
                  ? '1px solid var(--cobalt-border)'
                  : '1px solid var(--border-card)',
              }}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold"
                    style={{
                      background: 'var(--cobalt-core)',
                      color: '#FFFFFF',
                    }}
                  >
                    4C
                  </span>
                  <label
                    htmlFor={deepThinkingInputId}
                    className="text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                    style={{ color: 'var(--ink-primary)' }}
                  >
                    Deep Carbon Architecture Mode
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.2 rounded"
                      style={{
                        background: 'var(--bg-subtle)',
                        color: 'var(--cobalt-bright)',
                      }}
                    >
                      thinking_level: high
                    </span>
                  </label>
                </div>

                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                  Instructs <code className="font-mono text-xs">gemini-4-carbon</code> to perform deep multi-turn chain-of-thought
                  invariants checks, cross-subsystem boundary validation, and circular call cycle resolution. Adds ~1.5s latency for maximum synthesis depth.
                </p>
              </div>

              <label
                htmlFor={deepThinkingInputId}
                className="relative inline-flex items-center cursor-pointer select-none pt-1"
              >
                <input
                  id={deepThinkingInputId}
                  type="checkbox"
                  checked={deepThinking}
                  onChange={(e) => setDeepThinking(e.target.checked)}
                  className="sr-only peer"
                />
                <div
                  className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[6px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"
                  style={{
                    background: deepThinking ? 'var(--cobalt-core)' : 'var(--bg-card-elevated)',
                    border: '1px solid var(--border-strong)',
                  }}
                />
              </label>
            </div>
          </div>
        )}

        {/* TAB 2: THEME SELECTOR (3-State: System, Obsidian Dark, Archival Paper Light) */}
        {activeTab === 'theme' && (
          <div className="space-y-4 animate-fade-in">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>
                Visual Studio Palette
              </h3>
              <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                GitUnderstand enforces AntiSlop visual minimalism: Obsidian spatial dark surfaces and Archival editorial paper for maximum legibility.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Option 1: System */}
              <button
                type="button"
                onClick={() => setPreference('system')}
                className="p-3.5 rounded-xl text-left flex flex-col justify-between gap-3 transition-all relative"
                style={{
                  background:
                    preference === 'system'
                      ? 'var(--cobalt-tint)'
                      : 'var(--bg-card)',
                  border:
                    preference === 'system'
                      ? '2px solid var(--cobalt-core)'
                      : '1px solid var(--border-card)',
                  boxShadow:
                    preference === 'system' ? 'var(--cobalt-glow)' : 'none',
                }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="p-2 rounded-lg"
                    style={{
                      background: 'var(--bg-card-elevated)',
                      color: 'var(--cobalt-bright)',
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>

                  {preference === 'system' && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--cobalt-core)',
                        color: '#FFFFFF',
                      }}
                    >
                      Active
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>
                    System Auto
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                    Follows OS mode ({resolvedTheme === 'dark' ? 'Obsidian' : 'Paper'})
                  </div>
                </div>
              </button>

              {/* Option 2: Obsidian Dark */}
              <button
                type="button"
                onClick={() => setPreference('dark')}
                className="p-3.5 rounded-xl text-left flex flex-col justify-between gap-3 transition-all relative"
                style={{
                  background:
                    preference === 'dark'
                      ? 'var(--cobalt-tint)'
                      : 'var(--bg-card)',
                  border:
                    preference === 'dark'
                      ? '2px solid var(--cobalt-core)'
                      : '1px solid var(--border-card)',
                  boxShadow:
                    preference === 'dark' ? 'var(--cobalt-glow)' : 'none',
                }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="p-2 rounded-lg"
                    style={{
                      background: '#000000',
                      color: 'var(--cobalt-ice)',
                      border: '1px solid rgba(255,255,255,0.12)',
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                      />
                    </svg>
                  </div>

                  {preference === 'dark' && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--cobalt-core)',
                        color: '#FFFFFF',
                      }}
                    >
                      Active
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>
                    Obsidian Dark
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                    Pitch-black void with Google cobalt neon
                  </div>
                </div>
              </button>

              {/* Option 3: Archival Paper Light */}
              <button
                type="button"
                onClick={() => setPreference('light')}
                className="p-3.5 rounded-xl text-left flex flex-col justify-between gap-3 transition-all relative"
                style={{
                  background:
                    preference === 'light'
                      ? 'var(--cobalt-tint)'
                      : 'var(--bg-card)',
                  border:
                    preference === 'light'
                      ? '2px solid var(--cobalt-core)'
                      : '1px solid var(--border-card)',
                  boxShadow:
                    preference === 'light' ? 'var(--cobalt-glow)' : 'none',
                }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="p-2 rounded-lg"
                    style={{
                      background: '#F8F9FA',
                      color: '#0B57D0',
                      border: '1px solid rgba(0,0,0,0.12)',
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                      />
                    </svg>
                  </div>

                  {preference === 'light' && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--cobalt-core)',
                        color: '#FFFFFF',
                      }}
                    >
                      Active
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>
                    Archival Paper
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                    Crisp warm print with high-contrast cobalt
                  </div>
                </div>
              </button>
            </div>

            {/* Design System Guarantee Box */}
            <div
              className="p-3.5 rounded-xl space-y-1.5"
              style={{
                background: 'var(--bg-card-elevated)',
                border: '1px solid var(--border-card)',
              }}
            >
              <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--ink-primary)' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--cobalt-bright)' }} />
                <span>Zero-Slop Color Invariants</span>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                Theme overrides are synchronized via modern HTML <code className="font-mono text-[10px]">&lt;meta name=&quot;color-scheme&quot;&gt;</code> tags
                and pure CSS variables. Switching themes maintains instantaneous rendering without visual jarring or gradient bleed.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: MODEL ROUTING & ENGINE HEALTH */}
        {activeTab === 'routing' && (
          <div className="space-y-4 animate-fade-in">
            {/* Health Overview Pill Bar */}
            <div
              className="p-3.5 rounded-xl flex items-center justify-between gap-3"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-card)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    health?.ok ? 'animate-pulse' : ''
                  }`}
                  style={{
                    background: health?.ok
                      ? 'var(--emerald)'
                      : healthError
                        ? 'var(--vermilion)'
                        : 'var(--amber)',
                  }}
                />
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>
                    {health?.service || 'GitUnderstand AI Engine'}
                    <span className="ml-1.5 font-mono text-[11px] font-normal opacity-70">
                      v{health?.version || '3.0.0'}
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    Domain: <code className="font-mono text-[10px]">{health?.domain || 'git-understand.com'}</code> • Cached:{' '}
                    {health?.cachedRepos ?? 0} repos
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={loadHealthStatus}
                disabled={healthLoading}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5 active:scale-95 disabled:opacity-50"
                style={{
                  color: 'var(--cobalt-ice)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <svg
                  className={`w-3 h-3 ${healthLoading ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>{healthLoading ? 'Probing...' : 'Refresh'}</span>
              </button>
            </div>

            {/* Error banner if backend health fails */}
            {healthError && (
              <div
                className="p-3 rounded-xl flex items-start gap-2 text-xs"
                style={{
                  background: 'var(--vermilion-bg)',
                  color: 'var(--vermilion)',
                  border: '1px solid var(--vermilion-border)',
                }}
              >
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <span className="font-semibold">Backend Unreachable:</span> {healthError}
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Showing nominal Gemini 4 model assignments. Backend requests will resume once local server is running.
                  </div>
                </div>
              </div>
            )}

            {/* Gemini 4 Model Routing Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  Active Gemini 4 Specialized Model Routing
                </h4>
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded"
                  style={{
                    background: 'var(--cobalt-tint)',
                    color: 'var(--cobalt-bright)',
                    border: '1px solid var(--cobalt-border)',
                  }}
                >
                  Strict SDK 3.6.1+
                </span>
              </div>

              <div
                className="rounded-xl overflow-hidden divide-y text-xs"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-card)',
                  borderColor: 'var(--border-card)',
                }}
              >
                {/* Architect */}
                <div className="p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--ink-primary)' }}>
                      Architectural Synthesis &amp; Invariants
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      Multi-file topological blueprints and structural layers
                    </div>
                  </div>
                  <code
                    className="font-mono text-xs px-2 py-0.5 rounded font-semibold"
                    style={{
                      background: 'var(--bg-card-elevated)',
                      color: 'var(--cobalt-ice)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {models.architect}
                  </code>
                </div>

                {/* Visual / Diagrams */}
                <div className="p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--ink-primary)' }}>
                      Visual Strata &amp; Mermaid Generation
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      Syntactic AST graphs, call hierarchies, and self-repairing diagrams
                    </div>
                  </div>
                  <code
                    className="font-mono text-xs px-2 py-0.5 rounded font-semibold"
                    style={{
                      background: 'var(--bg-card-elevated)',
                      color: 'var(--cobalt-ice)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {models.visual}
                  </code>
                </div>

                {/* Fast / Ingestion */}
                <div className="p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--ink-primary)' }}>
                      Fast Ingestion &amp; AST Clustering
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      High-throughput token budgeting and file centrality scoring
                    </div>
                  </div>
                  <code
                    className="font-mono text-xs px-2 py-0.5 rounded font-semibold"
                    style={{
                      background: 'var(--bg-card-elevated)',
                      color: 'var(--cobalt-ice)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {models.fast}
                  </code>
                </div>

                {/* Decisions X-Ray */}
                <div className="p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--ink-primary)' }}>
                      Decision-1 Calibrated X-Ray Matrix
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      Calibrated P(healthy), Shannon entropy, and vulnerability probes
                    </div>
                  </div>
                  <code
                    className="font-mono text-xs px-2 py-0.5 rounded font-semibold"
                    style={{
                      background: 'var(--bg-card-elevated)',
                      color: 'var(--emerald)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {models.decisions}
                  </code>
                </div>

                {/* Live Multimodal Voice & Stage */}
                <div className="p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--ink-primary)' }}>
                      Live Multimodal Voice Tutor
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      Bidirectional WebSocket audio/video stage with tool calling
                    </div>
                  </div>
                  <code
                    className="font-mono text-xs px-2 py-0.5 rounded font-semibold"
                    style={{
                      background: 'var(--bg-card-elevated)',
                      color: 'var(--amber)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {models.live}
                  </code>
                </div>

                {/* Neural Voice & Audio Tours */}
                <div className="p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--ink-primary)' }}>
                      Audio Tour Multi-Speaker Synthesis
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      Architect &amp; Explorer conversational audio walkthroughs
                    </div>
                  </div>
                  <code
                    className="font-mono text-xs px-2 py-0.5 rounded"
                    style={{
                      background: 'var(--bg-card-elevated)',
                      color: 'var(--ink-secondary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {models.tts}
                  </code>
                </div>

                {/* Video Generation */}
                <div className="p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--ink-primary)' }}>
                      Cinematic Video Reel Synthesis
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      Codebase flythroughs with graceful storyboard fallbacks
                    </div>
                  </div>
                  <code
                    className="font-mono text-xs px-2 py-0.5 rounded"
                    style={{
                      background: 'var(--bg-card-elevated)',
                      color: 'var(--ink-secondary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {models.video}
                  </code>
                </div>

                {/* Embeddings */}
                <div className="p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--ink-primary)' }}>
                      Vector Embeddings &amp; Visual Search
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      Semantic code representation and natural language symbol lookup
                    </div>
                  </div>
                  <code
                    className="font-mono text-xs px-2 py-0.5 rounded"
                    style={{
                      background: 'var(--bg-card-elevated)',
                      color: 'var(--ink-secondary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {models.embedding}
                  </code>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </NativeDialog>
  );
}

export default ByokSettingsModal;
