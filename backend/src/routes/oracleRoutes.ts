// =============================================================================
// GitUnderstand (git-understand.com) — Oracle Streaming, Visual Search & Voice Routes
// Delegates strictly to Gemini 4 Hydrogen/Carbon, Gemini Embedding-2 & 3.5 Transcribe
// =============================================================================

import { Router, type Request, type Response } from 'express';
import type { VisualAtlasBlueprint } from '../../../shared/types.js';
import { atlasCache, getShowcaseBlueprint } from '../ingest/index.js';
import { streamCodeOracle } from '../gemini/codeOracle.js';
import { searchRepoMultimodal } from '../gemini/visualSearch.js';
import { transcribeAudioQuery } from '../gemini/voiceTranscribe.js';

export const oracleRoutes = Router();

function extractByokKey(req: Request): string | undefined {
  const header = req.headers['x-gemini-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  if (Array.isArray(header) && header[0]?.trim()) return header[0].trim();
  return undefined;
}

async function resolveBlueprint(repoId: string): Promise<VisualAtlasBlueprint | null> {
  const trimmed = repoId.trim();
  if (!trimmed) return null;
  const cached = await atlasCache.get(trimmed);
  if (cached) return cached;
  const showcase = getShowcaseBlueprint(trimmed);
  if (showcase) {
    await atlasCache.set(showcase);
    return showcase;
  }
  return null;
}

function writeSse(res: Response, event: string, data: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// -----------------------------------------------------------------------------
// 1. POST /oracle/chat & /oracle/stream — Streaming Multimodal Code Oracle
// -----------------------------------------------------------------------------
async function handleOracleStream(req: Request, res: Response): Promise<void> {
  const {
    repoId,
    message,
    previousInteractionId,
    imageBase64,
    imageMimeType,
    deepMode,
  } = (req.body || {}) as {
    repoId?: string;
    message?: string;
    previousInteractionId?: string;
    imageBase64?: string;
    imageMimeType?: string;
    deepMode?: boolean;
  };

  if (!repoId || typeof repoId !== 'string') {
    res.status(400).json({ error: 'Missing required field: repoId' });
    return;
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'Missing required field: message' });
    return;
  }

  const blueprint = await resolveBlueprint(repoId);
  if (!blueprint) {
    res.status(404).json({ error: `Repository not found for repoId "${repoId}"` });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    const result = await streamCodeOracle({
      blueprint,
      message: message.trim(),
      previousInteractionId,
      imageBase64,
      imageMimeType,
      deepMode: Boolean(deepMode),
      byokApiKey: extractByokKey(req),
      onDelta: (text) => {
        writeSse(res, 'delta', { text });
      },
    });

    writeSse(res, 'done', result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writeSse(res, 'error', { error: msg });
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}

oracleRoutes.post('/oracle/chat', handleOracleStream);
oracleRoutes.post('/oracle/stream', handleOracleStream);

// -----------------------------------------------------------------------------
// 2. POST /search/visual — Gemini Embedding-2 Multimodal Code & Sketch Search
// -----------------------------------------------------------------------------
oracleRoutes.post('/search/visual', async (req: Request, res: Response) => {
  try {
    const { repoId, queryText, imageBase64, imageMimeType, topK } = (req.body || {}) as {
      repoId?: string;
      queryText?: string;
      imageBase64?: string;
      imageMimeType?: string;
      topK?: number;
    };

    if (!repoId || typeof repoId !== 'string') {
      res.status(400).json({ error: 'Missing required field: repoId' });
      return;
    }

    if (!queryText && !imageBase64) {
      res.status(400).json({ error: 'Provide queryText or imageBase64 for visual search' });
      return;
    }

    const blueprint = await resolveBlueprint(repoId);
    if (!blueprint) {
      res.status(404).json({ error: `Repository not found for repoId "${repoId}"` });
      return;
    }

    const result = await searchRepoMultimodal(blueprint, {
      queryText,
      imageBase64,
      imageMimeType,
      topK: typeof topK === 'number' ? topK : 8,
      byokApiKey: extractByokKey(req),
    });

    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Visual search failed: ${message}` });
  }
});

// -----------------------------------------------------------------------------
// 3. POST /transcribe — Gemini 3.5 Transcribe Speech-to-Text Alias
// -----------------------------------------------------------------------------
oracleRoutes.post('/transcribe', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType = 'audio/webm' } = (req.body || {}) as {
      audioBase64?: string;
      mimeType?: string;
    };

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      res.status(400).json({ error: 'Missing required field: audioBase64' });
      return;
    }

    const result = await transcribeAudioQuery(audioBase64, mimeType, extractByokKey(req));
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Transcription failed: ${message}` });
  }
});

export default oracleRoutes;
