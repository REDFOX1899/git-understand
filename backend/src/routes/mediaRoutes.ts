// =============================================================================
// GitUnderstand (git-understand.com) — Media Lab & Forensics Routes
// Delegates strictly to Nano Banana 2.1, Gemini 3.8 TTS, Omni 1.2 Flash & Antigravity Agent
// =============================================================================

import { Router, type Request, type Response } from 'express';
import type {
  MediaPosterArtifact,
  VisualAtlasBlueprint,
} from '../../../shared/types.js';
import { atlasCache, getShowcaseBlueprint } from '../ingest/index.js';
import { generateArchitecturePoster } from '../gemini/posterAtelier.js';
import { generateAudioTour } from '../gemini/audioTourTts.js';
import { generateExplainerVideoReel } from '../gemini/videoReelOmni.js';
import { runRepoForensics } from '../gemini/forensicsAgent.js';
import { transcribeAudioQuery } from '../gemini/voiceTranscribe.js';

const router = Router();

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

// -----------------------------------------------------------------------------
// 1. POST /media/poster — Nano Banana 2.1 Editorial Architecture Poster
// -----------------------------------------------------------------------------
router.post('/media/poster', async (req: Request, res: Response) => {
  try {
    const { repoId, style = 'cobalt_blueprint' } = (req.body || {}) as {
      repoId?: string;
      style?: MediaPosterArtifact['style'];
    };

    if (!repoId || typeof repoId !== 'string') {
      res.status(400).json({ error: 'Missing required field: repoId' });
      return;
    }

    const blueprint = await resolveBlueprint(repoId);
    if (!blueprint) {
      res.status(404).json({ error: `Repository not found for repoId "${repoId}"` });
      return;
    }

    const poster = await generateArchitecturePoster(blueprint, style, extractByokKey(req));
    blueprint.posters.unshift(poster);
    await atlasCache.set(blueprint);

    res.status(200).json(poster);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Poster generation failed: ${message}` });
  }
});

// -----------------------------------------------------------------------------
// 2. POST /media/audio-tour — Gemini 3.8 TTS Multi-Speaker Audio Walkthrough
// -----------------------------------------------------------------------------
router.post('/media/audio-tour', async (req: Request, res: Response) => {
  try {
    const { repoId } = (req.body || {}) as { repoId?: string };
    if (!repoId || typeof repoId !== 'string') {
      res.status(400).json({ error: 'Missing required field: repoId' });
      return;
    }

    const blueprint = await resolveBlueprint(repoId);
    if (!blueprint) {
      res.status(404).json({ error: `Repository not found for repoId "${repoId}"` });
      return;
    }

    const audioTour = await generateAudioTour(blueprint, extractByokKey(req));
    blueprint.audioTours.unshift(audioTour);
    await atlasCache.set(blueprint);

    res.status(200).json(audioTour);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Audio tour generation failed: ${message}` });
  }
});

// -----------------------------------------------------------------------------
// 3. POST /media/video-reel — Gemini Omni 1.2 Flash Explainer Video Reel
// -----------------------------------------------------------------------------
router.post('/media/video-reel', async (req: Request, res: Response) => {
  try {
    const { repoId, firstFrameBase64, firstFrameMime, durationSec, resolution } = (req.body || {}) as {
      repoId?: string;
      firstFrameBase64?: string;
      firstFrameMime?: string;
      durationSec?: number;
      resolution?: '360p' | '720p' | '1080p';
    };

    if (!repoId || typeof repoId !== 'string') {
      res.status(400).json({ error: 'Missing required field: repoId' });
      return;
    }

    const blueprint = await resolveBlueprint(repoId);
    if (!blueprint) {
      res.status(404).json({ error: `Repository not found for repoId "${repoId}"` });
      return;
    }

    const videoReel = await generateExplainerVideoReel(blueprint, {
      firstFrameBase64,
      firstFrameMime,
      durationSec,
      resolution,
      byokApiKey: extractByokKey(req),
    });

    blueprint.videoReels.unshift(videoReel);
    await atlasCache.set(blueprint);

    res.status(200).json(videoReel);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Video reel generation failed: ${message}` });
  }
});

// -----------------------------------------------------------------------------
// 4. POST /media/transcribe — Gemini 3.5 Transcribe Voice Note Endpoint
// -----------------------------------------------------------------------------
router.post('/media/transcribe', async (req: Request, res: Response) => {
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
    res.status(500).json({ error: `Audio transcription failed: ${message}` });
  }
});

// -----------------------------------------------------------------------------
// 5. POST /forensics — Antigravity Managed Agent / Deep Research Forensics
// -----------------------------------------------------------------------------
router.post('/forensics', async (req: Request, res: Response) => {
  try {
    const { repoId, mode = 'managed_agent' } = (req.body || {}) as {
      repoId?: string;
      mode?: 'managed_agent' | 'deep_research';
    };

    if (!repoId || typeof repoId !== 'string') {
      res.status(400).json({ error: 'Missing required field: repoId' });
      return;
    }

    const blueprint = await resolveBlueprint(repoId);
    if (!blueprint) {
      res.status(404).json({ error: `Repository not found for repoId "${repoId}"` });
      return;
    }

    const report = await runRepoForensics(blueprint, mode, extractByokKey(req));
    res.status(200).json(report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Forensics audit failed: ${message}` });
  }
});

export const mediaRoutes = router;
export default router;
