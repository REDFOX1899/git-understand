'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import type { PipelineProgressEvent } from '@shared/types';
import { subscribeRepoEvents } from '@/lib/api';

// =============================================================================
// Telemetry Stage Definitions & Types
// =============================================================================

export type TelemetryStageId =
  | 'fetch'
  | 'ast'
  | 'carbon'
  | 'diagrams_flows'
  | 'xray'
  | 'embed';

export type StageStatus = 'pending' | 'active' | 'completed' | 'error';

interface StageMeta {
  id: TelemetryStageId;
  label: string;
  compactLabel: string;
  defaultModel: string;
  fallbackPercent: number;
  description: string;
}

const PIPELINE_STAGES: readonly StageMeta[] = [
  {
    id: 'fetch',
    label: 'Fetch',
    compactLabel: 'Fetch',
    defaultModel: 'github-api',
    fallbackPercent: 12,
    description: 'Fetching repository tree & source files from GitHub',
  },
  {
    id: 'ast',
    label: 'AST',
    compactLabel: 'AST',
    defaultModel: 'oxc-ast-parser',
    fallbackPercent: 28,
    description: 'Parsing multi-language AST, imports, exports & routes',
  },
  {
    id: 'carbon',
    label: 'Carbon',
    compactLabel: 'Carbon',
    defaultModel: 'gemini-4-carbon',
    fallbackPercent: 52,
    description: 'Gemini 4 Carbon architectural synthesis & strata layering',
  },
  {
    id: 'diagrams_flows',
    label: 'Diagrams & Flows',
    compactLabel: 'Flows',
    defaultModel: 'gemini-4-carbon',
    fallbackPercent: 72,
    description: 'Synthesizing Mermaid sequence diagrams & execution flows',
  },
  {
    id: 'xray',
    label: 'Decision-1 X-Ray',
    compactLabel: 'X-Ray',
    defaultModel: 'gemini-decision-1',
    fallbackPercent: 88,
    description: 'Gemini Decision-1 calibrated architectural audit & entropy matrix',
  },
  {
    id: 'embed',
    label: 'Embed-2',
    compactLabel: 'Embed-2',
    defaultModel: 'gemini-embedding-2',
    fallbackPercent: 100,
    description: 'Gemini Embedding 2 semantic indexing for visual search',
  },
] as const;

/**
 * Maps raw backend PipelineProgressEvent stage names to our 6 canonical visual stages.
 */
function mapBackendStageToTelemetryStage(stage: PipelineProgressEvent['stage']): {
  stageId: TelemetryStageId;
  stageIndex: number;
  isReady: boolean;
  isError: boolean;
} {
  switch (stage) {
    case 'queued':
    case 'fetching':
      return { stageId: 'fetch', stageIndex: 0, isReady: false, isError: false };
    case 'ast_graph':
    case 'treemap':
      return { stageId: 'ast', stageIndex: 1, isReady: false, isError: false };
    case 'architect':
      return { stageId: 'carbon', stageIndex: 2, isReady: false, isError: false };
    case 'diagrams':
    case 'flows':
      return { stageId: 'diagrams_flows', stageIndex: 3, isReady: false, isError: false };
    case 'xray':
      return { stageId: 'xray', stageIndex: 4, isReady: false, isError: false };
    case 'embeddings':
      return { stageId: 'embed', stageIndex: 5, isReady: false, isError: false };
    case 'ready':
      return { stageId: 'embed', stageIndex: 5, isReady: true, isError: false };
    case 'error':
      return { stageId: 'fetch', stageIndex: 0, isReady: false, isError: true };
    default:
      return { stageId: 'fetch', stageIndex: 0, isReady: false, isError: false };
  }
}

// =============================================================================
// Props Interface
// =============================================================================

export interface PipelineTelemetryBarProps {
  /** Optional repository identifier to automatically subscribe to live SSE progress events */
  repoId?: string;
  /** Direct controlled event override */
  event?: PipelineProgressEvent | null;
  /** Explicit active state override (defaults to true if event/repoId is present) */
  isActive?: boolean;
  /** Optional custom active model string override */
  activeModel?: string;
  /** Callback invoked when the user dismisses the telemetry bar */
  onDismiss?: () => void;
  /** Callback invoked when pipeline completes successfully ('ready') */
  onComplete?: (event: PipelineProgressEvent) => void;
  /** Callback invoked when a pipeline error event is received */
  onError?: (errorMessage: string) => void;
  /** Optional custom CSS classes */
  className?: string;
  /** Optional inline styles */
  style?: React.CSSProperties;
}

// =============================================================================
// Component Implementation
// =============================================================================

export function PipelineTelemetryBar({
  repoId,
  event: controlledEvent,
  isActive: controlledIsActive,
  activeModel: controlledActiveModel,
  onDismiss,
  onComplete,
  onError,
  className = '',
  style,
}: PipelineTelemetryBarProps) {
  const [internalEvent, setInternalEvent] = useState<PipelineProgressEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // Sync controlled event if supplied
  const activeEvent = controlledEvent !== undefined ? controlledEvent : internalEvent;

  // Subscribe to live SSE events when repoId is supplied
  useEffect(() => {
    if (!repoId || controlledEvent !== undefined) {
      return;
    }

    const unsubscribe = subscribeRepoEvents(repoId, (incomingEvent) => {
      setInternalEvent(incomingEvent);

      if (incomingEvent.stage === 'ready') {
        onComplete?.(incomingEvent);
      } else if (incomingEvent.stage === 'error') {
        onError?.(incomingEvent.message || 'Pipeline analysis failed');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [repoId, controlledEvent, onComplete, onError]);

  // Compute stage progress metrics
  const stageInfo = useMemo(() => {
    if (!activeEvent) {
      return {
        stageId: 'fetch' as TelemetryStageId,
        stageIndex: 0,
        isReady: false,
        isError: false,
      };
    }
    return mapBackendStageToTelemetryStage(activeEvent.stage);
  }, [activeEvent]);

  // Determine stage statuses (pending, active, completed, error)
  const stagesWithStatus = useMemo(() => {
    const { stageIndex, isReady, isError } = stageInfo;

    return PIPELINE_STAGES.map((stage, idx) => {
      let status: StageStatus = 'pending';

      if (isReady) {
        status = 'completed';
      } else if (isError && idx === stageIndex) {
        status = 'error';
      } else if (idx < stageIndex) {
        status = 'completed';
      } else if (idx === stageIndex) {
        status = 'active';
      } else {
        status = 'pending';
      }

      return {
        ...stage,
        status,
      };
    });
  }, [stageInfo]);

  // Calculate percentage
  const currentPercent = useMemo(() => {
    if (stageInfo.isReady) return 100;
    if (activeEvent?.percent !== undefined && activeEvent.percent > 0) {
      return Math.min(100, Math.max(0, Math.round(activeEvent.percent)));
    }
    const currentMeta = PIPELINE_STAGES[stageInfo.stageIndex];
    return currentMeta ? currentMeta.fallbackPercent : 10;
  }, [stageInfo, activeEvent]);

  // Determine active model display
  const displayModel = useMemo(() => {
    if (controlledActiveModel) {
      return controlledActiveModel;
    }
    if (activeEvent?.model && activeEvent.model.trim()) {
      return activeEvent.model.trim();
    }
    const currentStage = PIPELINE_STAGES[stageInfo.stageIndex];
    return currentStage ? currentStage.defaultModel : 'gemini-4-carbon';
  }, [controlledActiveModel, activeEvent, stageInfo.stageIndex]);

  // Handle dismissal
  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  // Don't render if dismissed
  if (isDismissed) {
    return null;
  }

  // Determine if active animation should run
  const isPipelineActive =
    controlledIsActive ?? (!stageInfo.isReady && !stageInfo.isError);

  return (
    <div
      role="region"
      aria-label="Pipeline progress and telemetry"
      className={`relative w-full h-[36px] max-h-[36px] min-h-[36px] flex items-center justify-between px-3.5 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--ink-primary)] select-none overflow-hidden backdrop-blur-md z-30 transition-all ${className}`}
      style={style}
    >
      {/* 1. Left Cluster: Status beacon, current percentage, and message */}
      <div className="flex items-center gap-2.5 shrink-0 max-w-[220px] md:max-w-[260px] truncate">
        {/* State Indicator Icon */}
        <div className="flex items-center justify-center w-3.5 h-3.5 shrink-0">
          {stageInfo.isError ? (
            <svg
              className="w-3.5 h-3.5 text-[var(--vermilion)]"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="7" />
              <line x1="8" y1="5" x2="8" y2="8" />
              <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
            </svg>
          ) : stageInfo.isReady ? (
            <svg
              className="w-3.5 h-3.5 text-[var(--emerald)]"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 8.5 6.5 12 13 4.5" />
            </svg>
          ) : (
            <span
              className={`w-2 h-2 rounded-full ${
                isPipelineActive
                  ? 'bg-[var(--cobalt-bright)] shadow-[0_0_8px_var(--cobalt-bright)] animate-pulse'
                  : 'bg-[var(--ink-muted)]'
              }`}
              aria-hidden="true"
            />
          )}
        </div>

        {/* Progress Percentage Badge */}
        <span
          className={`font-mono text-[10px] font-semibold tabular-nums shrink-0 ${
            stageInfo.isReady
              ? 'text-[var(--emerald)]'
              : stageInfo.isError
                ? 'text-[var(--vermilion)]'
                : 'text-[var(--cobalt-ice)]'
          }`}
        >
          {currentPercent}%
        </span>

        {/* Status Message */}
        <span
          className="text-[var(--ink-secondary)] truncate hidden sm:inline"
          title={activeEvent?.message || 'Processing codebase strata...'}
        >
          {activeEvent?.message || (stageInfo.isReady ? 'Analysis Ready' : 'Synthesizing...')}
        </span>
      </div>

      {/* 2. Center Cluster: Progressive SSE Pipeline Stages */}
      <nav
        aria-label="Pipeline Stages"
        className="flex items-center gap-1 sm:gap-1.5 md:gap-2 overflow-x-auto no-scrollbar py-0.5 px-2"
      >
        {stagesWithStatus.map((stage, idx) => {
          const isCurrentActive = stage.status === 'active';
          const isCompleted = stage.status === 'completed';
          const isFailed = stage.status === 'error';

          return (
            <React.Fragment key={stage.id}>
              {idx > 0 && (
                <svg
                  className={`w-2.5 h-2.5 shrink-0 transition-colors ${
                    isCompleted || isCurrentActive
                      ? 'text-[var(--cobalt-border-strong)]'
                      : 'text-[var(--border-card)]'
                  }`}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 3 11 8 6 13" />
                </svg>
              )}

              <div
                title={`${stage.label}: ${stage.description} (${stage.status})`}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all cursor-default shrink-0 ${
                  isCurrentActive
                    ? 'bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border-strong)] shadow-[0_0_10px_-2px_var(--cobalt-core)] font-semibold'
                    : isCompleted
                      ? 'text-[var(--ink-primary)] hover:text-[var(--cobalt-ice)]'
                      : isFailed
                        ? 'bg-[var(--vermilion-bg)] text-[var(--vermilion)] border border-[var(--vermilion-border)]'
                        : 'text-[var(--ink-muted)] opacity-60'
                }`}
              >
                {/* Stage Indicator Dot/Check */}
                <span className="w-3 h-3 flex items-center justify-center shrink-0">
                  {isCompleted ? (
                    <svg
                      className="w-2.5 h-2.5 text-[var(--emerald)]"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="2.5 8.5 6 12 13.5 3.5" />
                    </svg>
                  ) : isCurrentActive ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--cobalt-bright)] shadow-[0_0_6px_var(--cobalt-bright)] animate-ping" />
                  ) : isFailed ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--vermilion)]" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--border-strong)]" />
                  )}
                </span>

                {/* Stage Label */}
                <span className="text-[10px] tracking-tight whitespace-nowrap">
                  <span className="hidden lg:inline">{stage.label}</span>
                  <span className="lg:hidden">{stage.compactLabel}</span>
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </nav>

      {/* 3. Right Cluster: Active Model Badge & Dismiss Button */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Active Model Badge */}
        <div
          title={`Active Gemini Model: ${displayModel}`}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium tracking-tight bg-[var(--bg-card-elevated)] border border-[var(--cobalt-border)] text-[var(--cobalt-ice)] shadow-xs transition-colors"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isPipelineActive
                ? 'bg-[var(--cobalt-bright)] shadow-[0_0_6px_var(--cobalt-bright)] animate-pulse'
                : 'bg-[var(--emerald)]'
            }`}
            aria-hidden="true"
          />
          <span className="max-w-[110px] sm:max-w-[140px] truncate">{displayModel}</span>
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss telemetry bar"
          title="Dismiss telemetry bar"
          className="p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)] active:scale-95 transition-all focus:outline-none focus:ring-1 focus:ring-[var(--cobalt-ice)]"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="3" y1="3" x2="13" y2="13" />
            <line x1="13" y1="3" x2="3" y2="13" />
          </svg>
        </button>
      </div>

      {/* 4. Progressive Baseline Track Fill */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--bg-subtle)] overflow-hidden"
        role="progressbar"
        aria-valuenow={currentPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full transition-all duration-300 ease-out ${
            stageInfo.isReady
              ? 'bg-[var(--emerald)] shadow-[0_0_8px_var(--emerald)]'
              : stageInfo.isError
                ? 'bg-[var(--vermilion)]'
                : 'bg-gradient-to-r from-[var(--cobalt-deep)] via-[var(--cobalt-core)] to-[var(--cobalt-ice)] shadow-[0_0_8px_var(--cobalt-core)]'
          }`}
          style={{ width: `${currentPercent}%` }}
        />
      </div>
    </div>
  );
}

export default PipelineTelemetryBar;
