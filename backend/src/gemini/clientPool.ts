// =============================================================================
// GitUnderstand (git-understand.com) — Gemini Dual-Key Client Pool
// High-availability round-robin, failover, BYOK, and version-targeted Gemini client pool.
// =============================================================================

import { GoogleGenAI } from '@google/genai';
import { ENV } from '../config/env.js';
import { isTransientGeminiError } from './mediaUtils.js';

export type KeySlot = 'primary' | 'secondary' | 'byok';

/**
 * Cache mapping cacheKey (`${apiKey}:::${apiVersion}`) to memoized GoogleGenAI instance.
 */
const clientCache = new Map<string, GoogleGenAI>();

/**
 * Global call counter tracking total requests dispatched across all pool slots.
 */
let totalCalls = 0;

/**
 * Counter used to alternate initial slots when both primary and secondary keys are active.
 */
let roundRobinCounter = 0;

/**
 * Retrieves an existing cached GoogleGenAI instance or instantiates a new one for
 * the specified API key and API version ('v1' | 'v1beta').
 */
function getOrCreateClient(apiKey: string, apiVersion: 'v1' | 'v1beta'): GoogleGenAI {
  const cacheKey = `${apiKey}:::${apiVersion}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new GoogleGenAI({
      apiKey,
      apiVersion,
    });
    clientCache.set(cacheKey, client);
  }
  return client;
}

/**
 * Resolves whether any Gemini credentials are configured either in the environment
 * or via an explicit user-supplied BYOK key.
 *
 * @param byokApiKey Optional user-supplied Bring Your Own Key.
 * @returns True if at least one valid key is available.
 */
export function hasGeminiCredentials(byokApiKey?: string): boolean {
  if (typeof byokApiKey === 'string' && byokApiKey.trim().length > 0) {
    return true;
  }
  const primary = ENV.GEMINI_API_KEY?.trim();
  if (primary && primary.length > 0) {
    return true;
  }
  const secondary = ENV.GEMINI_API_KEY_SECONDARY?.trim();
  if (secondary && secondary.length > 0) {
    return true;
  }
  return false;
}

/**
 * Resolves a single API key string suitable for direct WebSocket authentication
 * in real-time streaming protocols like Gemini 3.8 Live (`ai.live.connect`).
 *
 * Priority order:
 * 1. BYOK key (if provided)
 * 2. Primary key (ENV.GEMINI_API_KEY)
 * 3. Secondary key (ENV.GEMINI_API_KEY_SECONDARY)
 *
 * @param byokApiKey Optional user-supplied Bring Your Own Key.
 * @returns The resolved non-empty API key string or null if unconfigured.
 */
export function resolveLiveApiKey(byokApiKey?: string): string | null {
  if (typeof byokApiKey === 'string' && byokApiKey.trim().length > 0) {
    return byokApiKey.trim();
  }
  const primary = ENV.GEMINI_API_KEY?.trim();
  if (primary && primary.length > 0) {
    return primary;
  }
  const secondary = ENV.GEMINI_API_KEY_SECONDARY?.trim();
  if (secondary && secondary.length > 0) {
    return secondary;
  }
  return null;
}

/**
 * Returns current observability status of the Gemini client pool.
 */
export function getPoolStatus(): {
  primaryConfigured: boolean;
  secondaryConfigured: boolean;
  totalCalls: number;
} {
  const primaryConfigured = Boolean(ENV.GEMINI_API_KEY && ENV.GEMINI_API_KEY.trim().length > 0);
  const secondaryConfigured = Boolean(
    ENV.GEMINI_API_KEY_SECONDARY && ENV.GEMINI_API_KEY_SECONDARY.trim().length > 0
  );
  return {
    primaryConfigured,
    secondaryConfigured,
    totalCalls,
  };
}

/**
 * Returns an array containing all configured v1beta client instances and their associated slots.
 * If BYOK is provided, returns exclusively the BYOK client. If standard keys are used, returns
 * both primary and secondary clients if configured, enabling concurrent fan-out and speculative execution.
 *
 * @param byokApiKey Optional user-supplied Bring Your Own Key.
 * @returns Array of configured client instances tagged by KeySlot.
 */
export function getDualBetaClients(
  byokApiKey?: string
): Array<{ client: GoogleGenAI; slot: KeySlot }> {
  const result: Array<{ client: GoogleGenAI; slot: KeySlot }> = [];

  const trimmedByok = typeof byokApiKey === 'string' ? byokApiKey.trim() : '';
  if (trimmedByok) {
    result.push({
      client: getOrCreateClient(trimmedByok, 'v1beta'),
      slot: 'byok',
    });
    return result;
  }

  const primary = ENV.GEMINI_API_KEY?.trim();
  if (primary) {
    result.push({
      client: getOrCreateClient(primary, 'v1beta'),
      slot: 'primary',
    });
  }

  const secondary = ENV.GEMINI_API_KEY_SECONDARY?.trim();
  if (secondary) {
    result.push({
      client: getOrCreateClient(secondary, 'v1beta'),
      slot: 'secondary',
    });
  }

  return result;
}

/**
 * Internal executor orchestrating round-robin dispatch, dual-key failover on transient
 * errors (e.g. rate limit 429 or service unavailable 503), and backoff retries.
 */
async function executeWithPool<T>(
  apiVersion: 'v1' | 'v1beta',
  fn: (client: GoogleGenAI, slot: KeySlot) => Promise<T>,
  byokApiKey?: string
): Promise<T> {
  totalCalls++;

  const candidates: Array<{ key: string; slot: KeySlot }> = [];

  const trimmedByok = typeof byokApiKey === 'string' ? byokApiKey.trim() : '';
  if (trimmedByok) {
    candidates.push({ key: trimmedByok, slot: 'byok' });
  } else {
    const primary = ENV.GEMINI_API_KEY?.trim();
    const secondary = ENV.GEMINI_API_KEY_SECONDARY?.trim();

    if (primary && secondary) {
      const preferPrimary = roundRobinCounter++ % 2 === 0;
      if (preferPrimary) {
        candidates.push({ key: primary, slot: 'primary' });
        candidates.push({ key: secondary, slot: 'secondary' });
      } else {
        candidates.push({ key: secondary, slot: 'secondary' });
        candidates.push({ key: primary, slot: 'primary' });
      }
    } else if (primary) {
      candidates.push({ key: primary, slot: 'primary' });
    } else if (secondary) {
      candidates.push({ key: secondary, slot: 'secondary' });
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      'GitUnderstand Gemini Client Pool: No API credentials available. Set GEMINI_API_KEY in environment or provide a BYOK key.'
    );
  }

  let lastError: unknown;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const client = getOrCreateClient(candidate.key, apiVersion);

    try {
      return await fn(client, candidate.slot);
    } catch (err: unknown) {
      lastError = err;
      const isTransient = isTransientGeminiError(err);

      // If it is not a transient error (e.g. 400 Bad Request, invalid argument), do not retry across keys
      if (!isTransient) {
        throw err;
      }

      // If another candidate slot is available, fail over immediately
      if (i < candidates.length - 1) {
        const nextSlot = candidates[i + 1].slot;
        console.warn(
          `[GeminiClientPool] Transient error on slot "${candidate.slot}" (${apiVersion}). Failing over to slot "${nextSlot}". Error:`,
          err instanceof Error ? err.message : String(err)
        );
        continue;
      }

      // If this was the last candidate slot, perform a single quick exponential backoff retry (800ms)
      console.warn(
        `[GeminiClientPool] Transient error on slot "${candidate.slot}" (${apiVersion}) and no more slots. Retrying once after 800ms backoff...`
      );
      try {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return await fn(client, candidate.slot);
      } catch (retryErr: unknown) {
        lastError = retryErr;
        throw retryErr;
      }
    }
  }

  throw lastError;
}

/**
 * Executes a callback with a GoogleGenAI client configured for the v1 stable API.
 * Uses round-robin dual-key scheduling and automatic failover on transient errors.
 *
 * @param fn Callback receiving the client and active KeySlot.
 * @param byokApiKey Optional user-supplied Bring Your Own Key.
 * @returns Promise resolving to the result of `fn`.
 */
export async function withV1Client<T>(
  fn: (client: GoogleGenAI, slot: KeySlot) => Promise<T>,
  byokApiKey?: string
): Promise<T> {
  return executeWithPool('v1', fn, byokApiKey);
}

/**
 * Executes a callback with a GoogleGenAI client configured for the v1beta API.
 * Uses round-robin dual-key scheduling and automatic failover on transient errors.
 *
 * @param fn Callback receiving the client and active KeySlot.
 * @param byokApiKey Optional user-supplied Bring Your Own Key.
 * @returns Promise resolving to the result of `fn`.
 */
export async function withV1BetaClient<T>(
  fn: (client: GoogleGenAI, slot: KeySlot) => Promise<T>,
  byokApiKey?: string
): Promise<T> {
  return executeWithPool('v1beta', fn, byokApiKey);
}
