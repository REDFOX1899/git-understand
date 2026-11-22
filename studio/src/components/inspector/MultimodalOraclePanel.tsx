'use client';

// =============================================================================
// GitUnderstand (git-understand.com) — Multimodal Code Oracle & Visual Search Panel
// Agent 68: Multimodal Code Oracle with streaming Gemini 4 + Visual Search
// =============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type {
  VisualAtlasBlueprint,
  VisualSearchMatch,
  OracleCitation,
  OracleMessage,
} from '@shared/types';
import {
  streamOracleChat,
  postVisualSearch,
  postTranscribeAudio,
  ApiError,
} from '@/lib/api';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import {
  Sparkles,
  Search,
  Mic,
  MicOff,
  Send,
  Image as ImageIcon,
  X,
  RotateCcw,
  Compass,
  Brain,
  FileCode,
  Layers,
  Check,
  Loader2,
  AlertCircle,
  Copy,
  ExternalLink,
  Target,
  UploadCloud,
  FileText,
  Volume2,
} from 'lucide-react';

export interface MultimodalOraclePanelProps {
  blueprint: VisualAtlasBlueprint;
  onFocusNode: (nodeId: string) => void;
  onPeekFile: (filePath: string, lineStart?: number, lineEnd?: number) => void;
  onVisualSearchResults: (matches: VisualSearchMatch[]) => void;
}

type PanelMode = 'oracle' | 'visual_search';

interface AttachedImage {
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

const QUICK_ORACLE_PROMPTS = [
  'Explain the core request lifecycle and data flow across layers',
  'Where are the biggest architectural bottlenecks or single points of failure?',
  'How does authentication & session management work in this codebase?',
  'What are the primary external dependencies and how are they isolated?',
];

const QUICK_VISUAL_SEARCH_CHIPS = [
  'API Gateway & Route Handlers',
  'Auth & Token Validation',
  'State Management & Cache Stores',
  'Streaming SSE / WebSockets',
  'Database Connection & ORM',
];

/**
 * Converts a browser File object to raw base64 data string (excluding data: URL header).
 */
function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const commaIndex = reader.result.indexOf(',');
        const base64 = commaIndex >= 0 ? reader.result.slice(commaIndex + 1) : reader.result;
        resolve({
          base64,
          mimeType: file.type || 'image/png',
        });
      } else {
        reject(new Error('Failed to read image file as base64 string.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('File read error.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Safe markdown parser for code blocks, inline code, bold text, and bullet lists.
 */
function renderMarkdownContent(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map((part, index) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const firstLineEnd = part.indexOf('\n');
      const lang = firstLineEnd >= 0 ? part.slice(3, firstLineEnd).trim() : '';
      const code = firstLineEnd >= 0 ? part.slice(firstLineEnd + 1, -3).trim() : part.slice(3, -3).trim();

      return (
        <div key={index} className="my-2.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-void)] overflow-hidden">
          {lang && (
            <div className="flex items-center justify-between px-3 py-1 bg-[var(--bg-card-elevated)] border-b border-[var(--border-card)] text-[10px] font-mono text-[var(--ink-secondary)]">
              <span>{lang}</span>
              <CopyCodeButton code={code} />
            </div>
          )}
          <pre className="p-3 text-xs font-mono text-[var(--ink-primary)] overflow-x-auto whitespace-pre leading-relaxed">
            <code>{code}</code>
          </pre>
        </div>
      );
    }

    const lines = part.split('\n');
    return (
      <div key={index} className="space-y-1.5">
        {lines.map((line, lIdx) => {
          if (!line.trim()) return <div key={lIdx} className="h-1" />;

          if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            const bulletText = line.trim().slice(2);
            return (
              <div key={lIdx} className="flex items-start gap-2 pl-2">
                <span className="text-[var(--cobalt-ice)] mt-1.5 block w-1.5 h-1.5 rounded-full bg-[var(--cobalt-core)] shrink-0" />
                <span className="text-xs text-[var(--ink-primary)] leading-relaxed">
                  {renderInlineMarkdown(bulletText)}
                </span>
              </div>
            );
          }

          if (line.trim().startsWith('### ')) {
            return (
              <h4 key={lIdx} className="text-xs font-semibold text-[var(--ink-primary)] mt-2 pt-1 border-t border-[var(--border-card)]">
                {renderInlineMarkdown(line.trim().slice(4))}
              </h4>
            );
          }

          if (line.trim().startsWith('## ')) {
            return (
              <h3 key={lIdx} className="text-sm font-semibold text-[var(--ink-primary)] mt-3">
                {renderInlineMarkdown(line.trim().slice(3))}
              </h3>
            );
          }

          return (
            <p key={lIdx} className="text-xs text-[var(--ink-primary)] leading-relaxed">
              {renderInlineMarkdown(line)}
            </p>
          );
        })}
      </div>
    );
  });
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((token, i) => {
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-[var(--bg-void)] border border-[var(--border-card)] font-mono text-[11px] text-[var(--cobalt-ice)]">
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-[var(--ink-primary)]">
          {token.slice(2, -2)}
        </strong>
      );
    }
    return token;
  });
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard write failure
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 hover:text-[var(--ink-primary)] transition-colors"
      title="Copy code"
    >
      {copied ? <Check className="w-3 h-3 text-[var(--emerald)]" /> : <Copy className="w-3 h-3" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

export function MultimodalOraclePanel({
  blueprint,
  onFocusNode,
  onPeekFile,
  onVisualSearchResults,
}: MultimodalOraclePanelProps) {
  // Panel mode switch
  const [mode, setMode] = useState<PanelMode>('oracle');

  // Oracle state
  const [messages, setMessages] = useState<OracleMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [previousInteractionId, setPreviousInteractionId] = useState<string | undefined>(undefined);
  const [deepThinking, setDeepThinking] = useState(true);
  const [oracleError, setOracleError] = useState<string | null>(null);

  // Voice recording state
  const { isRecording, durationMs, error: voiceError, startRecording, stopRecording } = useVoiceRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Visual search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchImage, setSearchImage] = useState<AttachedImage | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<VisualSearchMatch[]>([]);
  const [searchModel, setSearchModel] = useState<string>('gemini-embedding-2');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Drag and drop states
  const [isDraggingOracleImage, setIsDraggingOracleImage] = useState(false);
  const [isDraggingSearchImage, setIsDraggingSearchImage] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchFileInputRef = useRef<HTMLInputElement | null>(null);

  // Scroll messages to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  // Adjust textarea height dynamically
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputPrompt(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  // Image upload handler for Oracle
  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setOracleError('Only image files (PNG, JPEG, WebP) are supported for multimodal analysis.');
      return;
    }
    setOracleError(null);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      setAttachedImage({ file, previewUrl, base64, mimeType });
    } catch {
      setOracleError('Failed to process image attachment.');
    }
  };

  // Image upload handler for Visual Search
  const handleSearchImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setSearchError('Only image files (diagrams, wireframes, screenshots) are supported for visual search.');
      return;
    }
    setSearchError(null);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      setSearchImage({ file, previewUrl, base64, mimeType });
    } catch {
      setSearchError('Failed to process search image.');
    }
  };

  // Toggle voice recording
  const handleToggleVoice = async () => {
    if (isRecording) {
      try {
        setIsTranscribing(true);
        const recorded = await stopRecording();
        if (recorded?.base64) {
          const { transcript } = await postTranscribeAudio(recorded.base64, recorded.mimeType);
          if (transcript.trim()) {
            setInputPrompt((prev) => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()));
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Voice transcription failed.';
        setOracleError(msg);
      } finally {
        setIsTranscribing(false);
      }
    } else {
      setOracleError(null);
      try {
        await startRecording();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Microphone access failed.';
        setOracleError(msg);
      }
    }
  };

  // Submit Oracle Chat message
  const handleSendOracleMessage = async (customPrompt?: string) => {
    const promptToSend = (customPrompt ?? inputPrompt).trim();
    if (!promptToSend && !attachedImage) return;
    if (isStreaming) return;

    setOracleError(null);

    const userMessageId = `user_${Date.now()}`;
    const userMessage: OracleMessage = {
      id: userMessageId,
      role: 'user',
      text: promptToSend,
      imagePreviewUrl: attachedImage?.previewUrl,
      citations: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const currentImage = attachedImage;
    setAttachedImage(null);
    setIsStreaming(true);
    setStreamingText('');

    try {
      const result = await streamOracleChat({
        repoId: blueprint.repoId,
        message: promptToSend,
        previousInteractionId,
        imageBase64: currentImage?.base64,
        imageMimeType: currentImage?.mimeType,
        deepMode: deepThinking,
        onDelta: (delta: string) => {
          setStreamingText((prev) => prev + delta);
        },
      });

      const assistantMessage: OracleMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        text: result.fullText || streamingText,
        citations: result.citations || [],
        interactionId: result.interactionId,
        model: result.model || (deepThinking ? 'gemini-4-hydrogen' : 'gemini-4-carbon'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      if (result.interactionId) {
        setPreviousInteractionId(result.interactionId);
      }

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      let msg = 'Failed to get answer from Oracle.';
      if (err instanceof ApiError) {
        msg = err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setOracleError(msg);
    } finally {
      setIsStreaming(false);
      setStreamingText('');
    }
  };

  // Reset conversation
  const handleResetConversation = () => {
    setMessages([]);
    setPreviousInteractionId(undefined);
    setStreamingText('');
    setIsStreaming(false);
    setAttachedImage(null);
    setOracleError(null);
  };

  // Perform Visual Search
  const handlePerformVisualSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? searchQuery).trim();
    if (!q && !searchImage) {
      setSearchError('Enter a search query or drop an image/wireframe to visually search the codebase.');
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const response = await postVisualSearch({
        repoId: blueprint.repoId,
        queryText: q || undefined,
        imageBase64: searchImage?.base64,
        imageMimeType: searchImage?.mimeType,
      });

      setSearchResults(response.matches || []);
      setSearchModel(response.model || 'gemini-embedding-2');

      // Notify parent to highlight matching nodes on Atlas Graph
      if (response.matches && response.matches.length > 0) {
        onVisualSearchResults(response.matches);
      }
    } catch (err: unknown) {
      let msg = 'Visual search failed.';
      if (err instanceof ApiError) {
        msg = err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const activeModelDisplay = deepThinking ? 'gemini-4-hydrogen (2M ctx)' : 'gemini-4-carbon (Fast)';

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg-card)] text-[var(--ink-primary)] font-sans select-text overflow-hidden border-l border-[var(--border-card)]">
      {/* =================================================================== */}
      {/* Top Header & Mode Switcher */}
      {/* =================================================================== */}
      <div className="p-3.5 border-b border-[var(--border-card)] bg-[var(--bg-card-elevated)] shrink-0 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] text-[var(--cobalt-ice)]">
              {mode === 'oracle' ? <Sparkles className="w-4 h-4" /> : <Compass className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-xs font-semibold text-[var(--ink-primary)] tracking-wide flex items-center gap-1.5">
                {mode === 'oracle' ? 'Multimodal Code Oracle' : 'Visual Semantic Search'}
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--bg-void)] border border-[var(--border-card)] text-[var(--ink-secondary)]">
                  {mode === 'oracle' ? (deepThinking ? 'H-Tier' : 'C-Tier') : 'Embedding-2'}
                </span>
              </h2>
              <p className="text-[10px] text-[var(--ink-muted)] truncate max-w-[200px]">
                {blueprint.metadata.fullName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {mode === 'oracle' && (
              <>
                <button
                  onClick={() => setDeepThinking((d) => !d)}
                  title={`Switch model tier (currently: ${activeModelDisplay})`}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                    deepThinking
                      ? 'bg-[var(--cobalt-tint-strong)] border-[var(--cobalt-border-strong)] text-[var(--cobalt-ice)]'
                      : 'bg-[var(--bg-void)] border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  <Brain className="w-3 h-3" />
                  <span className="hidden sm:inline">{deepThinking ? 'Deep Think' : 'Fast'}</span>
                </button>

                {messages.length > 0 && (
                  <button
                    onClick={handleResetConversation}
                    title="Clear conversation"
                    className="p-1.5 rounded text-[var(--ink-secondary)] hover:text-[var(--vermilion)] hover:bg-[var(--bg-void)] transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tab segmented switch */}
        <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg-void)] border border-[var(--border-card)]">
          <button
            onClick={() => setMode('oracle')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-medium transition-all ${
              mode === 'oracle'
                ? 'bg-[var(--bg-card-elevated)] text-[var(--ink-primary)] shadow-sm border border-[var(--border-card)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--cobalt-ice)]" />
            <span>Ask Oracle</span>
          </button>
          <button
            onClick={() => setMode('visual_search')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-medium transition-all ${
              mode === 'visual_search'
                ? 'bg-[var(--bg-card-elevated)] text-[var(--ink-primary)] shadow-sm border border-[var(--border-card)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-[var(--emerald)]" />
            <span>Visual Search</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODE 1: ASK ORACLE */}
      {/* =================================================================== */}
      {mode === 'oracle' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Messages list */}
          <div
            className={`flex-1 overflow-y-auto p-4 space-y-4 transition-colors ${
              isDraggingOracleImage ? 'bg-[var(--cobalt-tint)] border-2 border-dashed border-[var(--cobalt-bright)]' : ''
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOracleImage(true);
            }}
            onDragLeave={() => setIsDraggingOracleImage(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOracleImage(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleImageFile(e.dataTransfer.files[0]);
              }
            }}
          >
            {messages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center text-center py-6 px-2 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] flex items-center justify-center text-[var(--cobalt-ice)] shadow-lg shadow-[var(--cobalt-core)]/10">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="text-sm font-semibold text-[var(--ink-primary)]">
                    Gemini 4 Multimodal Architecture Oracle
                  </h3>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Ask questions with natural text, voice dictation, or dropped diagrams. All reasoning is grounded in the repository AST with clickable citations.
                  </p>
                </div>

                {/* Quick Prompts */}
                <div className="w-full max-w-md pt-2 space-y-1.5 text-left">
                  <span className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider block px-1">
                    Suggested Inquiries
                  </span>
                  {QUICK_ORACLE_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendOracleMessage(prompt)}
                      className="w-full text-left p-2.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card-elevated)] hover:bg-[var(--bg-void)] hover:border-[var(--cobalt-border)] transition-all group flex items-start gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[var(--cobalt-ice)] mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                      <span className="text-xs text-[var(--ink-primary)] group-hover:text-[var(--cobalt-ice)] transition-colors">
                        {prompt}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                {/* Role badge + timestamp */}
                <div className="flex items-center gap-1.5 px-1 mb-1 text-[10px] text-[var(--ink-muted)] font-mono">
                  {msg.role === 'assistant' ? (
                    <>
                      <Sparkles className="w-2.5 h-2.5 text-[var(--cobalt-ice)]" />
                      <span className="text-[var(--cobalt-ice)]">{msg.model || 'gemini-4'}</span>
                    </>
                  ) : (
                    <span>You</span>
                  )}
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>

                {/* Message Body */}
                <div
                  className={`max-w-[92%] rounded-xl p-3.5 text-xs shadow-md ${
                    msg.role === 'user'
                      ? 'bg-[var(--cobalt-deep)] text-white border border-[var(--cobalt-bright)]/30'
                      : 'bg-[var(--bg-card-elevated)] text-[var(--ink-primary)] border border-[var(--border-card)]'
                  }`}
                >
                  {/* User attached image preview */}
                  {msg.imagePreviewUrl && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-white/20 max-w-xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.imagePreviewUrl}
                        alt="Attached visual diagram"
                        className="w-full max-h-48 object-cover cursor-pointer hover:opacity-95"
                        onClick={() => window.open(msg.imagePreviewUrl, '_blank')}
                      />
                    </div>
                  )}

                  {/* Render content */}
                  {msg.role === 'assistant' ? (
                    renderMarkdownContent(msg.text)
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  )}

                  {/* Assistant Citations Pills */}
                  {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-[var(--border-card)] space-y-1.5">
                      <span className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider block">
                        Grounded Citations ({msg.citations.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((cite, cIdx) => (
                          <div
                            key={cIdx}
                            className="inline-flex items-center gap-1 rounded bg-[var(--bg-void)] border border-[var(--border-card)] px-2 py-0.5 text-[11px] text-[var(--ink-primary)]"
                          >
                            {cite.nodeId ? (
                              <button
                                onClick={() => onFocusNode(cite.nodeId!)}
                                className="flex items-center gap-1 text-[var(--cobalt-ice)] hover:underline"
                                title={`Focus node: ${cite.label || cite.nodeId}`}
                              >
                                <Target className="w-3 h-3 text-[var(--cobalt-bright)]" />
                                <span className="font-medium">{cite.label || cite.nodeId}</span>
                              </button>
                            ) : (
                              <span className="font-medium">{cite.label}</span>
                            )}

                            {cite.filePath && (
                              <button
                                onClick={() => onPeekFile(cite.filePath, cite.lineStart, cite.lineEnd)}
                                className="flex items-center gap-0.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] ml-1 pl-1 border-l border-[var(--border-card)]"
                                title={`Peek ${cite.filePath}${cite.lineStart ? `:${cite.lineStart}` : ''}`}
                              >
                                <FileCode className="w-2.5 h-2.5" />
                                <span className="font-mono text-[10px]">
                                  {cite.filePath.split('/').pop()}
                                  {cite.lineStart ? `:${cite.lineStart}` : ''}
                                </span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* In-flight streaming response */}
            {isStreaming && (
              <div className="flex flex-col items-start space-y-1">
                <div className="flex items-center gap-1.5 px-1 text-[10px] text-[var(--cobalt-ice)] font-mono">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  <span>{deepThinking ? 'gemini-4-hydrogen reasoning...' : 'gemini-4-carbon streaming...'}</span>
                </div>
                <div className="max-w-[92%] rounded-xl p-3.5 text-xs bg-[var(--bg-card-elevated)] border border-[var(--cobalt-border)] shadow-md">
                  {streamingText ? (
                    <>
                      {renderMarkdownContent(streamingText)}
                      <span className="inline-block w-1.5 h-3 ml-0.5 bg-[var(--cobalt-bright)] animate-pulse" />
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-[var(--ink-muted)]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--cobalt-bright)]" />
                      <span>Synthesizing architectural knowledge...</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error banner */}
            {oracleError && (
              <div className="p-2.5 rounded-lg bg-[var(--vermilion-bg)] border border-[var(--vermilion-border)] flex items-start gap-2 text-xs text-[var(--vermilion)]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">{oracleError}</div>
                <button
                  onClick={() => setOracleError(null)}
                  className="hover:opacity-80"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer Box */}
          <div className="p-3 border-t border-[var(--border-card)] bg-[var(--bg-card-elevated)] shrink-0 space-y-2">
            {/* Attached image indicator */}
            {attachedImage && (
              <div className="flex items-center justify-between p-1.5 px-2.5 rounded-lg bg-[var(--bg-void)] border border-[var(--border-card)]">
                <div className="flex items-center gap-2 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachedImage.previewUrl}
                    alt="Preview"
                    className="w-7 h-7 object-cover rounded border border-[var(--border-card)]"
                  />
                  <span className="text-xs text-[var(--ink-primary)] truncate max-w-[180px]">
                    {attachedImage.file.name}
                  </span>
                  <span className="text-[10px] text-[var(--ink-muted)]">
                    ({Math.round(attachedImage.file.size / 1024)} KB)
                  </span>
                </div>
                <button
                  onClick={() => setAttachedImage(null)}
                  className="p-1 text-[var(--ink-secondary)] hover:text-[var(--vermilion)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Voice Recording Active Banner */}
            {isRecording && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--vermilion-bg)] border border-[var(--vermilion-border)] animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--vermilion)] animate-ping" />
                  <span className="text-xs font-medium text-[var(--vermilion)]">
                    Recording audio memo...
                  </span>
                  <span className="font-mono text-xs text-[var(--ink-primary)]">
                    {Math.floor(durationMs / 1000)}s
                  </span>
                </div>
                <button
                  onClick={handleToggleVoice}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--vermilion)] text-white hover:opacity-90"
                >
                  Stop & Transcribe
                </button>
              </div>
            )}

            {isTranscribing && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--cobalt-tint)] border border-[var(--cobalt-border)] text-xs text-[var(--cobalt-ice)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Transcribing audio memo with Gemini...</span>
              </div>
            )}

            {voiceError && (
              <div className="text-[11px] text-[var(--vermilion)] flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>{voiceError}</span>
              </div>
            )}

            {/* Textarea and Actions */}
            <div className="flex items-end gap-1.5 rounded-xl bg-[var(--bg-void)] border border-[var(--border-card)] focus-within:border-[var(--cobalt-core)] focus-within:ring-1 focus-within:ring-[var(--cobalt-core)] p-1.5 transition-all">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImageFile(e.target.files[0]);
                  }
                }}
              />

              {/* Attach Image Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach architecture diagram or screenshot"
                className="p-1.5 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-card)] transition-colors shrink-0"
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              {/* Voice mic button */}
              <button
                type="button"
                onClick={handleToggleVoice}
                title={isRecording ? 'Stop recording voice' : 'Dictate with Gemini Speech-to-Text'}
                className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                  isRecording
                    ? 'text-[var(--vermilion)] bg-[var(--vermilion-bg)]'
                    : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-card)]'
                }`}
              >
                {isRecording ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputPrompt}
                onChange={handleTextareaInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendOracleMessage();
                  }
                }}
                placeholder={
                  attachedImage
                    ? 'Ask questions about this attached diagram or code...'
                    : 'Ask Oracle (Shift+Enter for newline, drop images)...'
                }
                className="flex-1 bg-transparent text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] resize-none border-none outline-none py-1.5 px-1 max-h-40 min-h-[28px] leading-relaxed"
              />

              {/* Send button */}
              <button
                type="button"
                onClick={() => handleSendOracleMessage()}
                disabled={isStreaming || (!inputPrompt.trim() && !attachedImage)}
                className="p-1.5 rounded-lg bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] disabled:opacity-40 disabled:hover:bg-[var(--cobalt-core)] text-white transition-all shrink-0 shadow-sm"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-[var(--ink-muted)] px-1">
              <span>Shift+Enter newline • Drop image anywhere</span>
              <span>Model: {activeModelDisplay}</span>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODE 2: VISUAL SEARCH (gemini-embedding-2) */}
      {/* =================================================================== */}
      {mode === 'visual_search' && (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Visual Search Hero explanation */}
          <div className="p-3 rounded-xl bg-[var(--bg-card-elevated)] border border-[var(--border-card)] space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-primary)]">
              <Compass className="w-4 h-4 text-[var(--emerald)]" />
              <span>Multimodal Visual Search (gemini-embedding-2)</span>
            </div>
            <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
              Find architecture nodes, data flow pathways, and key files by semantic concept or uploaded whiteboard diagram / screenshot. Results automatically highlight matching nodes on the Atlas canvas!
            </p>
          </div>

          {/* Search Inputs */}
          <div className="space-y-2.5">
            {/* Hidden file input for search */}
            <input
              ref={searchFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleSearchImageFile(e.target.files[0]);
                }
              }}
            />

            {/* Query text field */}
            <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--bg-void)] border border-[var(--border-card)] focus-within:border-[var(--cobalt-core)] focus-within:ring-1 focus-within:ring-[var(--cobalt-core)] transition-all">
              <Search className="w-4 h-4 text-[var(--ink-secondary)] shrink-0 ml-1" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handlePerformVisualSearch();
                  }
                }}
                placeholder="Search concepts (e.g. 'auth token refresher', 'event bus', 'cache middleware')..."
                className="flex-1 bg-transparent text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Diagram upload / drop zone */}
            {searchImage ? (
              <div className="relative rounded-xl border border-[var(--cobalt-border)] bg-[var(--bg-void)] p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={searchImage.previewUrl}
                    alt="Search Target"
                    className="w-12 h-12 object-cover rounded-lg border border-[var(--border-card)]"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-[var(--ink-primary)] block truncate">
                      {searchImage.file.name}
                    </span>
                    <span className="text-[10px] text-[var(--cobalt-ice)]">
                      Visual diagram query attached
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSearchImage(null)}
                  className="p-1.5 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--vermilion)] hover:bg-[var(--bg-card)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                className={`p-3 rounded-xl border border-dashed text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  isDraggingSearchImage
                    ? 'border-[var(--cobalt-bright)] bg-[var(--cobalt-tint)]'
                    : 'border-[var(--border-card)] bg-[var(--bg-card-elevated)] hover:border-[var(--cobalt-border)]'
                }`}
                onClick={() => searchFileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingSearchImage(true);
                }}
                onDragLeave={() => setIsDraggingSearchImage(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingSearchImage(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleSearchImageFile(e.dataTransfer.files[0]);
                  }
                }}
              >
                <UploadCloud className="w-5 h-5 text-[var(--cobalt-ice)]" />
                <span className="text-xs font-medium text-[var(--ink-primary)]">
                  Drop an architecture sketch, whiteboard, or screenshot
                </span>
                <span className="text-[10px] text-[var(--ink-muted)]">
                  Gemini multimodal embedding will match visual layout to AST nodes
                </span>
              </div>
            )}

            {/* Quick search chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_VISUAL_SEARCH_CHIPS.map((chip, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSearchQuery(chip);
                    handlePerformVisualSearch(chip);
                  }}
                  className="px-2 py-1 rounded-md text-[11px] font-medium bg-[var(--bg-void)] border border-[var(--border-card)] text-[var(--ink-secondary)] hover:text-[var(--cobalt-ice)] hover:border-[var(--cobalt-border)] transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Search Execute Button */}
            <button
              onClick={() => handlePerformVisualSearch()}
              disabled={isSearching || (!searchQuery.trim() && !searchImage)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--cobalt-core)] hover:bg-[var(--cobalt-bright)] disabled:opacity-40 disabled:hover:bg-[var(--cobalt-core)] text-white text-xs font-medium transition-all shadow-md"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Searching with gemini-embedding-2...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Execute Visual Search</span>
                </>
              )}
            </button>
          </div>

          {/* Search Error */}
          {searchError && (
            <div className="p-2.5 rounded-lg bg-[var(--vermilion-bg)] border border-[var(--vermilion-border)] flex items-start gap-2 text-xs text-[var(--vermilion)]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">{searchError}</div>
              <button onClick={() => setSearchError(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Search Results */}
          {hasSearched && (
            <div className="space-y-2.5 pt-2 border-t border-[var(--border-card)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--ink-primary)]">
                  Visual Matches ({searchResults.length})
                </span>
                <span className="text-[10px] font-mono text-[var(--emerald)] bg-[var(--emerald-bg)] px-2 py-0.5 rounded border border-[var(--emerald-border)]">
                  {searchModel}
                </span>
              </div>

              {searchResults.length === 0 ? (
                <div className="p-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-void)] text-center text-xs text-[var(--ink-muted)]">
                  No visual or semantic matches found. Try broadening the query or providing an architecture diagram sketch.
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((match, idx) => {
                    const simPercent = Math.round(match.similarity * 100);
                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] hover:border-[var(--cobalt-border)] transition-all space-y-2 group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Target className="w-3.5 h-3.5 text-[var(--cobalt-ice)] shrink-0" />
                            <span className="text-xs font-semibold text-[var(--ink-primary)] truncate">
                              {match.label || match.nodeId}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold shrink-0 ${
                              simPercent >= 85
                                ? 'bg-[var(--emerald-bg)] text-[var(--emerald)] border border-[var(--emerald-border)]'
                                : 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)]'
                            }`}
                          >
                            {simPercent}% Match
                          </span>
                        </div>

                        {/* Match Reason */}
                        <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                          {match.reason}
                        </p>

                        {/* File path + Actions */}
                        <div className="flex items-center justify-between pt-1 border-t border-[var(--border-card)] text-[11px]">
                          <span className="font-mono text-[10px] text-[var(--ink-muted)] truncate max-w-[180px]">
                            {match.filePath}
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => onFocusNode(match.nodeId)}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-void)] border border-[var(--border-card)] hover:border-[var(--cobalt-border)] hover:text-[var(--cobalt-ice)] text-[var(--ink-primary)] transition-colors"
                              title="Center and highlight this node on the Atlas canvas"
                            >
                              <Target className="w-3 h-3 text-[var(--cobalt-bright)]" />
                              <span>Focus Node</span>
                            </button>

                            {match.filePath && (
                              <button
                                onClick={() => onPeekFile(match.filePath)}
                                className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-void)] border border-[var(--border-card)] hover:border-[var(--cobalt-border)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
                                title="Peek source file"
                              >
                                <FileCode className="w-3 h-3" />
                                <span>Peek</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MultimodalOraclePanel;
