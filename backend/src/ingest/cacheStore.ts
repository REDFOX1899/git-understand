// =============================================================================
// GitUnderstand (git-understand.com) — Ingest Cache Store (LRU & Disk)
// In-memory LRU Map (max 32 blueprints) + persistent JSON storage under ENV.CACHE_DIR
// =============================================================================

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { ENV } from '../config/env.js';
import type { VisualAtlasBlueprint } from '../../../shared/types.js';

export interface CachedBlueprintSummary {
  repoId: string;
  fullName: string;
  generatedAt: string;
  aiEnriched: boolean;
}

export interface AtlasCacheStoreOptions {
  maxEntries?: number;
  cacheDir?: string;
  diskPersistence?: boolean;
}

/**
 * High-performance, dual-tier cache store for VisualAtlasBlueprint objects.
 * Tier 1: In-memory LRU Map holding up to maxEntries (default 32) blueprints.
 * Tier 2: Atomic JSON disk cache persisted under ENV.CACHE_DIR.
 */
export class AtlasCacheStore {
  private readonly memory = new Map<string, VisualAtlasBlueprint>();
  private readonly manifest = new Map<string, CachedBlueprintSummary>();
  private readonly maxEntries: number;
  private readonly cacheDir: string;
  private readonly diskEnabled: boolean;

  constructor(options?: AtlasCacheStoreOptions) {
    this.maxEntries = options?.maxEntries ?? 32;
    this.cacheDir = options?.cacheDir ?? ENV.CACHE_DIR;
    this.diskEnabled = options?.diskPersistence ?? Boolean(this.cacheDir);

    this.loadDiskManifest();
  }

  /**
   * Sanitizes a repoId into a safe filesystem-compatible filename.
   */
  private getFilePath(repoId: string): string {
    const sanitized = repoId
      .trim()
      .replace(/[/\\]/g, '__')
      .replace(/[^a-zA-Z0-9_.-]/g, '_');
    return path.join(this.cacheDir, `${sanitized}.json`);
  }

  /**
   * Evicts least-recently-used items from memory if capacity is exceeded.
   * Evicted items remain available in the disk tier and manifest.
   */
  private evictIfNecessary(): void {
    while (this.memory.size > this.maxEntries) {
      const oldestKey = this.memory.keys().next().value;
      if (oldestKey !== undefined) {
        this.memory.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * Loads cached metadata summaries from disk into the fast manifest index.
   */
  private loadDiskManifest(): void {
    if (!this.diskEnabled || !this.cacheDir) {
      return;
    }

    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        return;
      }

      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith('.json') || file.startsWith('.') || file.endsWith('.tmp')) {
          continue;
        }

        const fullPath = path.join(this.cacheDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const data = JSON.parse(raw) as Partial<VisualAtlasBlueprint>;
          if (data && typeof data.repoId === 'string' && data.repoId.trim().length > 0) {
            const summary: CachedBlueprintSummary = {
              repoId: data.repoId,
              fullName: data.metadata?.fullName || data.repoId,
              generatedAt: data.generatedAt || new Date().toISOString(),
              aiEnriched: Boolean(data.aiEnriched),
            };
            this.manifest.set(data.repoId, summary);
          }
        } catch {
          // Skip corrupted or unreadable JSON files on startup
        }
      }
    } catch {
      // Graceful fallback if cache directory access is restricted
    }
  }

  /**
   * Re-scans disk to synchronize the manifest with external additions or deletions.
   */
  public refreshManifest(): void {
    this.loadDiskManifest();
  }

  /**
   * Retrieves a blueprint by repoId, checking in-memory LRU first, then disk storage.
   * Touches LRU order on access.
   */
  async get(repoId: string): Promise<VisualAtlasBlueprint | null> {
    if (!repoId) {
      return null;
    }

    // 1. In-memory LRU hit
    if (this.memory.has(repoId)) {
      const cached = this.memory.get(repoId)!;
      // Refresh LRU position (delete & re-set moves to end of Map)
      this.memory.delete(repoId);
      this.memory.set(repoId, cached);
      return cached;
    }

    // 2. Disk persistence fallback
    if (this.diskEnabled && this.cacheDir) {
      const filePath = this.getFilePath(repoId);
      try {
        const raw = await fsPromises.readFile(filePath, 'utf-8');
        const blueprint = JSON.parse(raw) as VisualAtlasBlueprint;

        if (blueprint && blueprint.repoId) {
          // Promote into in-memory LRU
          this.memory.set(blueprint.repoId, blueprint);
          this.evictIfNecessary();

          // Ensure manifest is up-to-date
          this.manifest.set(blueprint.repoId, {
            repoId: blueprint.repoId,
            fullName: blueprint.metadata?.fullName || blueprint.repoId,
            generatedAt: blueprint.generatedAt,
            aiEnriched: Boolean(blueprint.aiEnriched),
          });

          return blueprint;
        }
      } catch {
        // File does not exist, is inaccessible, or malformed
      }
    }

    return null;
  }

  /**
   * Stores a blueprint in memory (LRU order) and persists it asynchronously to disk.
   */
  async set(blueprint: VisualAtlasBlueprint): Promise<void> {
    if (!blueprint || !blueprint.repoId) {
      throw new Error('[AtlasCacheStore] Cannot store blueprint: missing valid repoId');
    }

    const { repoId } = blueprint;

    // 1. Update In-memory LRU
    if (this.memory.has(repoId)) {
      this.memory.delete(repoId);
    }
    this.memory.set(repoId, blueprint);
    this.evictIfNecessary();

    // 2. Update Manifest
    this.manifest.set(repoId, {
      repoId,
      fullName: blueprint.metadata?.fullName || repoId,
      generatedAt: blueprint.generatedAt || new Date().toISOString(),
      aiEnriched: Boolean(blueprint.aiEnriched),
    });

    // 3. Persist to Disk
    if (this.diskEnabled && this.cacheDir) {
      try {
        await fsPromises.mkdir(this.cacheDir, { recursive: true });
        const filePath = this.getFilePath(repoId);
        const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
        const jsonContent = JSON.stringify(blueprint, null, 2);

        await fsPromises.writeFile(tempPath, jsonContent, 'utf-8');
        await fsPromises.rename(tempPath, filePath);
      } catch (err) {
        // Fallback to direct write if atomic rename is unsupported (e.g. cross-volume)
        try {
          const filePath = this.getFilePath(repoId);
          await fsPromises.writeFile(filePath, JSON.stringify(blueprint, null, 2), 'utf-8');
        } catch (writeErr) {
          console.warn(`[AtlasCacheStore] Failed to persist blueprint for ${repoId} to disk:`, writeErr);
        }
      }
    }
  }

  /**
   * Synchronously checks whether a blueprint is cached in memory or on disk.
   */
  has(repoId: string): boolean {
    if (!repoId) {
      return false;
    }

    if (this.memory.has(repoId)) {
      return true;
    }

    if (this.manifest.has(repoId)) {
      return true;
    }

    if (this.diskEnabled && this.cacheDir) {
      try {
        return fs.existsSync(this.getFilePath(repoId));
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Returns a lightweight summary list of all cached blueprints across memory and disk.
   */
  listCached(): Array<{ repoId: string; fullName: string; generatedAt: string; aiEnriched: boolean }> {
    return Array.from(this.manifest.values());
  }

  /**
   * Deletes a blueprint from both in-memory LRU and disk storage.
   */
  async delete(repoId: string): Promise<void> {
    if (!repoId) {
      return;
    }

    this.memory.delete(repoId);
    this.manifest.delete(repoId);

    if (this.diskEnabled && this.cacheDir) {
      try {
        const filePath = this.getFilePath(repoId);
        await fsPromises.unlink(filePath);
      } catch (err: unknown) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr?.code !== 'ENOENT') {
          console.warn(`[AtlasCacheStore] Error deleting cache file for ${repoId}:`, err);
        }
      }
    }
  }

  /**
   * Returns the total number of cached blueprints.
   */
  size(): number {
    return this.manifest.size;
  }

  /**
   * Returns the current number of blueprints held directly in RAM.
   */
  memorySize(): number {
    return this.memory.size;
  }

  /**
   * Clears all cached blueprints from both memory and disk.
   */
  async clear(): Promise<void> {
    this.memory.clear();
    this.manifest.clear();

    if (this.diskEnabled && this.cacheDir) {
      try {
        const files = await fsPromises.readdir(this.cacheDir);
        for (const file of files) {
          if (file.endsWith('.json') || file.endsWith('.tmp')) {
            await fsPromises.unlink(path.join(this.cacheDir, file)).catch(() => {});
          }
        }
      } catch {
        // Ignore directory deletion errors
      }
    }
  }
}

/**
 * Singleton instance of AtlasCacheStore using canonical ENV.CACHE_DIR configuration.
 */
export const atlasCache = new AtlasCacheStore();
