// =============================================================================
// GitUnderstand (git-understand.com) — SSE Pipeline Event Bus
// Real-time pub/sub event bus for pipeline execution progress with replay buffer
// =============================================================================

import type { PipelineProgressEvent } from '../../../shared/types.js';

export type ProgressListener = (event: PipelineProgressEvent) => void;

/**
 * Configuration options for the pipeline event bus history buffer.
 */
export interface PipelineEventBusOptions {
  /** Maximum number of progress events retained per repository (default: 100) */
  maxEventsPerRepo?: number;
  /** Maximum number of distinct repositories tracked in memory (default: 500) */
  maxTrackedRepos?: number;
}

const DEFAULT_MAX_EVENTS_PER_REPO = 100;
const DEFAULT_MAX_TRACKED_REPOS = 500;

/**
 * In-memory pipeline event bus with subscription management and replay history.
 */
export class PipelineEventBus {
  private readonly maxEventsPerRepo: number;
  private readonly maxTrackedRepos: number;

  /**
   * Subscriber sets keyed by repoId.
   * Special key '*' receives events for all repositories.
   */
  private readonly subscribers: Map<string, Set<ProgressListener>> = new Map();

  /**
   * Ring buffer of recent progress events keyed by repoId.
   */
  private readonly history: Map<string, PipelineProgressEvent[]> = new Map();

  /**
   * Insertion-order tracking for LRU eviction of historical repository entries.
   */
  private readonly repoAccessOrder: string[] = [];

  constructor(options: PipelineEventBusOptions = {}) {
    this.maxEventsPerRepo = options.maxEventsPerRepo ?? DEFAULT_MAX_EVENTS_PER_REPO;
    this.maxTrackedRepos = options.maxTrackedRepos ?? DEFAULT_MAX_TRACKED_REPOS;
  }

  /**
   * Publishes a pipeline progress event to all active subscribers for the repoId,
   * plus any wildcard subscribers. Records event into recent progress history.
   */
  public publish(event: PipelineProgressEvent): void {
    if (!event || !event.repoId) {
      return;
    }

    const normalizedEvent: PipelineProgressEvent = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    // 1. Record event in history buffer with LRU eviction
    this.recordHistory(normalizedEvent);

    // 2. Dispatch to specific repo listeners
    const repoListeners = this.subscribers.get(normalizedEvent.repoId);
    if (repoListeners && repoListeners.size > 0) {
      for (const listener of repoListeners) {
        try {
          listener(normalizedEvent);
        } catch (err) {
          console.error(
            `[PipelineEventBus] Error in subscriber for repo ${normalizedEvent.repoId}:`,
            err
          );
        }
      }
    }

    // 3. Dispatch to wildcard listeners ('*')
    const wildcardListeners = this.subscribers.get('*');
    if (wildcardListeners && wildcardListeners.size > 0) {
      for (const listener of wildcardListeners) {
        try {
          listener(normalizedEvent);
        } catch (err) {
          console.error('[PipelineEventBus] Error in wildcard subscriber:', err);
        }
      }
    }
  }

  /**
   * Subscribes a listener to progress events for a specific repoId (or '*' for all).
   * Returns an unsubscribe function to cleanly detach the listener.
   */
  public subscribe(repoId: string, listener: ProgressListener): () => void {
    if (!this.subscribers.has(repoId)) {
      this.subscribers.set(repoId, new Set());
    }

    const set = this.subscribers.get(repoId)!;
    set.add(listener);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;

      set.delete(listener);
      if (set.size === 0) {
        this.subscribers.delete(repoId);
      }
    };
  }

  /**
   * Retrieves recent progress events for a specific repository.
   * Returns a fresh shallow array copy to prevent external mutation.
   */
  public getRecent(repoId: string): PipelineProgressEvent[] {
    const list = this.history.get(repoId);
    if (!list || list.length === 0) {
      return [];
    }
    return [...list];
  }

  /**
   * Clears progress history for a given repoId, or for all repositories if omitted.
   */
  public clearHistory(repoId?: string): void {
    if (repoId) {
      this.history.delete(repoId);
      const idx = this.repoAccessOrder.indexOf(repoId);
      if (idx !== -1) {
        this.repoAccessOrder.splice(idx, 1);
      }
    } else {
      this.history.clear();
      this.repoAccessOrder.length = 0;
    }
  }

  /**
   * Returns total count of active subscribers for a repository or across all repositories.
   */
  public getSubscriberCount(repoId?: string): number {
    if (repoId) {
      return this.subscribers.get(repoId)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.subscribers.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Records event in repository history ring buffer and updates LRU order.
   */
  private recordHistory(event: PipelineProgressEvent): void {
    const repoId = event.repoId;
    let list = this.history.get(repoId);

    if (!list) {
      // Check if we need to evict oldest tracked repo
      if (this.history.size >= this.maxTrackedRepos) {
        const oldestRepoId = this.repoAccessOrder.shift();
        if (oldestRepoId) {
          this.history.delete(oldestRepoId);
        }
      }

      list = [];
      this.history.set(repoId, list);
      this.repoAccessOrder.push(repoId);
    } else {
      // Touch repo in LRU access order
      const orderIdx = this.repoAccessOrder.indexOf(repoId);
      if (orderIdx !== -1) {
        this.repoAccessOrder.splice(orderIdx, 1);
      }
      this.repoAccessOrder.push(repoId);
    }

    list.push(event);

    // Enforce ring buffer ceiling
    if (list.length > this.maxEventsPerRepo) {
      list.splice(0, list.length - this.maxEventsPerRepo);
    }
  }
}

// -----------------------------------------------------------------------------
// Singleton Instance & Canonical Exports
// -----------------------------------------------------------------------------

const globalEventBus = new PipelineEventBus();

/**
 * Publishes a pipeline progress event to all active listeners and records it
 * in the recent progress buffer.
 */
export function publishProgress(event: PipelineProgressEvent): void {
  globalEventBus.publish(event);
}

/**
 * Subscribes to pipeline progress events for a given repository.
 * Returns an unsubscription callback `() => void`.
 */
export function subscribeProgress(
  repoId: string,
  listener: (event: PipelineProgressEvent) => void
): () => void {
  return globalEventBus.subscribe(repoId, listener);
}

/**
 * Returns a list of recent progress events recorded for the given repository.
 */
export function getRecentProgress(repoId: string): PipelineProgressEvent[] {
  return globalEventBus.getRecent(repoId);
}

/**
 * Optional utility to clear history for testing or cache resets.
 */
export function clearProgressHistory(repoId?: string): void {
  globalEventBus.clearHistory(repoId);
}

/**
 * Optional utility to check active subscriber counts for debugging.
 */
export function getActiveSubscriberCount(repoId?: string): number {
  return globalEventBus.getSubscriberCount(repoId);
}
