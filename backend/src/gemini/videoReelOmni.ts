// =============================================================================
// GitUnderstand (git-understand.com) — Gemini Omni 1.2 Flash Video Reel Generator
// Visual-first architectural flythrough video generation with timecoded storyboard fallback.
// =============================================================================

import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { ENV } from '../config/env.js';
import { withV1Client, hasGeminiCredentials } from './clientPool.js';
import {
  stripDataUriPrefix,
  normalizeMimeType,
  extractInteractionVideo,
} from './mediaUtils.js';
import type { VisualAtlasBlueprint, VideoReelArtifact, AtlasNode } from '../../../shared/types.js';

export interface GenerateVideoReelOptions {
  firstFrameBase64?: string;
  firstFrameMime?: string;
  durationSec?: number;
  resolution?: '360p' | '720p' | '1080p';
  byokApiKey?: string;
}

/**
 * Storyboard frame with timecode, visual action caption, and associated canvas node ID.
 */
export interface StoryboardFrameItem {
  timecode: string;
  caption: string;
  focusNodeId?: string;
}

/**
 * Formats seconds into standard MM:SS timecode string (e.g. 3 -> "00:03").
 */
function formatTimecode(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Cleans string for safe filesystem usage.
 */
function sanitizeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
}

/**
 * Synthesizes rich, timecoded storyboard frames bound directly to real `focusNodeId`s
 * in the VisualAtlasBlueprint. Used as interactive chapter anchors and graceful fallback
 * when regional restrictions or API limits prevent live MP4 generation.
 */
export function buildStoryboardFrames(
  blueprint: VisualAtlasBlueprint,
  durationSec: number
): StoryboardFrameItem[] {
  const nodes = blueprint.nodes || [];
  const flows = blueprint.flows || [];
  const codemapTour = blueprint.codemapTour || [];
  const subsystems = blueprint.subsystems || [];

  // Identify candidate nodes for each architectural phase
  const entryCandidate =
    (codemapTour[0]?.focusNodeId && nodes.find((n) => n.id === codemapTour[0].focusNodeId)) ||
    nodes.find((n) => n.kind === 'api' || n.kind === 'ui' || n.layer === 'client') ||
    [...nodes].sort((a, b) => (b.centrality ?? 0) - (a.centrality ?? 0))[0] ||
    nodes[0];

  const orchestrationCandidate =
    nodes.find((n) => n.layer === 'orchestration' || n.layer === 'domain' || n.kind === 'service') ||
    nodes.find((n) => n.id !== entryCandidate?.id && (n.centrality ?? 0) > 0.4) ||
    nodes[1] ||
    entryCandidate;

  const firstFlow = flows[0];
  const flowTargetId = firstFlow?.steps?.[0]?.toNodeId || firstFlow?.steps?.[1]?.toNodeId;
  const flowCandidate =
    (flowTargetId && nodes.find((n) => n.id === flowTargetId)) ||
    nodes.find((n) => n.id !== entryCandidate?.id && n.id !== orchestrationCandidate?.id) ||
    orchestrationCandidate;

  const dataCandidate =
    nodes.find((n) => n.layer === 'data' || n.layer === 'infrastructure' || n.kind === 'store') ||
    nodes.find(
      (n) =>
        n.id !== entryCandidate?.id &&
        n.id !== orchestrationCandidate?.id &&
        n.id !== flowCandidate?.id
    ) ||
    nodes[2] ||
    entryCandidate;

  const finalCandidate =
    (codemapTour[codemapTour.length - 1]?.focusNodeId &&
      nodes.find((n) => n.id === codemapTour[codemapTour.length - 1].focusNodeId)) ||
    nodes.find((n) => n.layer === 'tooling' || n.kind === 'agent' || n.kind === 'pipeline') ||
    entryCandidate;

  // Build target interval timestamps across the requested duration (3s - 15s)
  const timestamps: number[] = [];
  const step = durationSec <= 5 ? 2 : durationSec <= 10 ? 3 : Math.max(2, Math.floor(durationSec / 4));
  for (let t = 0; t < durationSec; t += step) {
    timestamps.push(t);
  }
  if (timestamps[timestamps.length - 1] < durationSec - 1) {
    timestamps.push(durationSec);
  }

  const roleMap: Array<{ candidate?: AtlasNode; phase: string; defaultAction: string }> = [
    {
      candidate: entryCandidate,
      phase: 'Ingress & Entrypoint',
      defaultAction: `Camera sweeps into entrypoint '${entryCandidate?.label || 'Entry'}', framing the initial ingress contract and public surface.`,
    },
    {
      candidate: orchestrationCandidate,
      phase: 'Domain Orchestration',
      defaultAction: `Volumetric zoom onto '${orchestrationCandidate?.label || 'Core Service'}', tracing state dispatch and module coordination.`,
    },
    {
      candidate: flowCandidate,
      phase: 'Hot Execution Flow',
      defaultAction: `Luminous cobalt telemetry illuminates active execution flow '${firstFlow?.title || 'Primary Request Flow'}' routing into '${flowCandidate?.label || 'Target Module'}'.`,
    },
    {
      candidate: dataCandidate,
      phase: 'Persistence & Invariants',
      defaultAction: `Isometric tilt downward into storage layer '${dataCandidate?.label || 'Data Store'}', verifying ACID persistence and schema invariants.`,
    },
    {
      candidate: finalCandidate,
      phase: 'Strata Topology Overview',
      defaultAction: `Wide-angle pull-back revealing full Obsidian Cobalt strata stack (${subsystems.length} subsystems, ${nodes.length} nodes) in synchronized harmony.`,
    },
  ];

  return timestamps.map((sec, index) => {
    const role = roleMap[index % roleMap.length];
    const node = role.candidate;
    const timecode = formatTimecode(sec);

    let caption = `[${timecode}] ${role.phase}: `;
    if (node) {
      const symbolsStr = node.keySymbols && node.keySymbols.length > 0
        ? ` (symbols: ${node.keySymbols.slice(0, 3).join(', ')})`
        : '';
      caption += `${role.defaultAction} Focus: '${node.label}'${symbolsStr} at ${node.primaryFile || 'root'}.`;
    } else {
      caption += `${role.defaultAction} Global architecture strata active.`;
    }

    return {
      timecode,
      caption,
      focusNodeId: node?.id,
    };
  });
}

/**
 * Builds the natural-language prompt tailored for Gemini Omni 1.2 Flash (`gemini-omni-1.2-flash`).
 * Applies natural-language image binding (NO deprecated <FIRST_FRAME> tags) to ensure strict
 * compliance with official Gemini Omni guidelines.
 */
function buildOmniPrompt(
  blueprint: VisualAtlasBlueprint,
  hasFirstFrame: boolean,
  durationSec: number
): string {
  const repoName = blueprint.metadata?.name || blueprint.repoId || 'Repository';
  const headline = blueprint.headline || blueprint.oneLiner || 'Software Architecture Topology';
  const pattern = blueprint.architecturePattern || 'Modular Multi-tier System';
  const keyNodes = (blueprint.nodes || []).slice(0, 5).map((n) => n.label).filter(Boolean);
  const nodesList = keyNodes.length > 0 ? keyNodes.join(', ') : 'core domain and data modules';

  const baseInstructions =
    `Dynamic, cinematic 3D architectural flythrough visualization of software repository '${repoName}' (${pattern}: ${headline}). ` +
    `Visual aesthetic: AntiSlop Obsidian Cobalt dark mode with luminous cobalt blue pipelines, glowing node coordinates, ` +
    `ambient cybernetic depth, and crisp architectural paper typography. Volumetric camera moves gracefully across layered strata ` +
    `illuminating key subsystems (${nodesList}), streaming luminous data packets along hot dependency edges between client, orchestration, and persistence layers. ` +
    `Sound design: Subtle atmospheric ambient synth drone, high-fidelity digital hums, and crisp data transmission pulses. No spoken dialogue. ` +
    `Total duration: approximately ${durationSec} seconds with smooth continuous camera motion.`;

  if (hasFirstFrame) {
    // Natural-language binding to the first image input without deprecated tags
    return `Use this image as the starting frame. ${baseInstructions} The scene begins precisely from this starting topological snapshot and smoothly pushes forward into a fluid 3D flythrough.`;
  }

  return baseInstructions;
}

/**
 * Generates an explainer video reel for a VisualAtlasBlueprint using `gemini-omni-1.2-flash`
 * via the v1 Interactions API.
 *
 * Saves generated MP4 video and poster frames to `ENV.ARTIFACTS_DIR`.
 * If API keys are missing, or regional restrictions apply (EEA, UK, Switzerland, or select US states),
 * gracefully returns a rich timecoded `fallback_storyboard` artifact bound directly to real `focusNodeId`s.
 *
 * @param blueprint The comprehensive VisualAtlasBlueprint of the codebase.
 * @param options Video generation options including optional firstFrameBase64, duration, resolution, and BYOK.
 * @returns Promise resolving to a VideoReelArtifact.
 */
export async function generateExplainerVideoReel(
  blueprint: VisualAtlasBlueprint,
  options?: GenerateVideoReelOptions
): Promise<VideoReelArtifact> {
  const rawDuration = options?.durationSec ?? 10;
  // Gemini Omni 1.2 Flash duration range: 3s to 15s
  const durationSec = Math.min(Math.max(Number.isFinite(rawDuration) ? rawDuration : 10, 3), 15);
  const resolution = options?.resolution ?? '720p';

  const safeSlug = sanitizeFilename(blueprint.metadata?.name || blueprint.repoId || 'repo');
  const timestamp = Date.now();
  const reelId = `reel_${safeSlug}_${timestamp}`;
  const title = `${blueprint.metadata?.name || blueprint.repoId} Architecture Video Reel`;

  // Always compute rich timecoded storyboard frames anchored to real nodes
  const storyboardFrames = buildStoryboardFrames(blueprint, durationSec);

  // Prepare poster from firstFrameBase64 if provided, or fallback to existing poster artifact
  let posterUrl: string | undefined = blueprint.posters?.[0]?.imageUrl;
  let cleanedBase64: string | undefined;
  let normalizedMime = 'image/png';

  if (options?.firstFrameBase64) {
    const stripped = stripDataUriPrefix(options.firstFrameBase64);
    if (stripped.base64) {
      cleanedBase64 = stripped.base64;
      normalizedMime = normalizeMimeType(
        options.firstFrameMime || stripped.detectedMime,
        'image/png'
      );

      try {
        await fsPromises.mkdir(ENV.ARTIFACTS_DIR, { recursive: true });
        const posterFilename = `poster_${safeSlug}_${timestamp}.png`;
        const posterFilePath = path.join(ENV.ARTIFACTS_DIR, posterFilename);
        await fsPromises.writeFile(posterFilePath, Buffer.from(cleanedBase64, 'base64'));
        posterUrl = `/api/artifacts/${posterFilename}`;
      } catch (saveErr) {
        console.warn('[VideoReelOmni] Failed to write poster frame to disk:', saveErr);
      }
    }
  }

  // Check credentials; if missing, return interactive fallback storyboard immediately
  if (!hasGeminiCredentials(options?.byokApiKey)) {
    return {
      id: reelId,
      title,
      status: 'fallback_storyboard',
      posterUrl,
      durationSec,
      resolution,
      model: ENV.GEMINI_MODEL_VIDEO || 'gemini-omni-1.2-flash',
      storyboardFrames,
      note: 'Gemini API key unconfigured. Provided rich timecoded interactive storyboard bound to architectural nodes.',
      generatedAt: new Date().toISOString(),
    };
  }

  // Construct natural-language prompt without deprecated tags
  const promptText = buildOmniPrompt(blueprint, Boolean(cleanedBase64), durationSec);

  try {
    const modelName = ENV.GEMINI_MODEL_VIDEO || 'gemini-omni-1.2-flash';

    const result = await withV1Client(async (client) => {
      await fsPromises.mkdir(ENV.ARTIFACTS_DIR, { recursive: true });

      // Construct input content parts using official Interactions format
      const inputParts: Array<Record<string, unknown>> = [];

      if (cleanedBase64) {
        inputParts.push({
          type: 'image',
          data: cleanedBase64,
          mime_type: normalizedMime,
        });
      }

      inputParts.push({
        type: 'text',
        text: promptText,
      });

      const videoConfig: Record<string, unknown> = {
        type: 'video',
        delivery: 'uri',
        aspect_ratio: '16:9',
        duration: `${durationSec}s`,
        resolution,
      };

      const interactionParams: Record<string, unknown> = {
        model: modelName,
        input: inputParts,
        response_format: videoConfig,
      };

      const interaction = await client.interactions.create(
        interactionParams as unknown as Parameters<typeof client.interactions.create>[0]
      );

      // Extract generated video metadata from response
      const extractedVideo = extractInteractionVideo(interaction);
      const outputVideo = (interaction as Record<string, unknown>)?.output_video as
        | { data?: string; uri?: string; mime_type?: string }
        | undefined;

      const videoData = extractedVideo?.data || outputVideo?.data;
      const videoUri = extractedVideo?.uri || outputVideo?.uri;

      if (!videoData && !videoUri) {
        throw new Error(
          'Gemini Omni 1.2 Flash returned empty video content. ' +
          'This frequently indicates regional restrictions on generative video (EEA, UK, Switzerland, and select US jurisdictions).'
        );
      }

      const videoFilename = `reel_${safeSlug}_${timestamp}.mp4`;
      const videoFilePath = path.join(ENV.ARTIFACTS_DIR, videoFilename);
      let localSaved = false;

      // 1. Direct inline base64 bytes
      if (videoData) {
        const videoBuffer = Buffer.from(videoData, 'base64');
        await fsPromises.writeFile(videoFilePath, videoBuffer);
        localSaved = true;
      }
      // 2. Remote URI download via Files API or HTTP fetch
      else if (videoUri) {
        try {
          if (typeof (client as unknown as { files?: { download: (params: unknown) => Promise<void> } }).files?.download === 'function') {
            await (client as unknown as { files: { download: (params: unknown) => Promise<void> } }).files.download({
              file: outputVideo || videoUri,
              downloadPath: videoFilePath,
            });
            localSaved = true;
          }
        } catch (downloadErr) {
          console.warn('[VideoReelOmni] SDK files.download failed, attempting direct fetch:', downloadErr);
        }

        if (!localSaved && videoUri.startsWith('http')) {
          try {
            const resp = await fetch(videoUri);
            if (resp.ok) {
              const arrayBuf = await resp.arrayBuffer();
              await fsPromises.writeFile(videoFilePath, Buffer.from(arrayBuf));
              localSaved = true;
            }
          } catch (fetchErr) {
            console.warn('[VideoReelOmni] HTTP video fetch failed:', fetchErr);
          }
        }
      }

      const finalVideoUrl = localSaved ? `/api/artifacts/${videoFilename}` : videoUri;

      return {
        videoUrl: finalVideoUrl,
        saved: localSaved,
      };
    }, options?.byokApiKey);

    return {
      id: reelId,
      title,
      status: 'completed',
      videoUrl: result.videoUrl,
      posterUrl,
      durationSec,
      resolution,
      model: modelName,
      storyboardFrames,
      note: 'Generated high-fidelity architectural video reel via Gemini Omni 1.2 Flash Interactions API.',
      generatedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isRegional =
      errorMsg.toLowerCase().includes('region') ||
      errorMsg.toLowerCase().includes('location') ||
      errorMsg.toLowerCase().includes('not available') ||
      errorMsg.toLowerCase().includes('restriction') ||
      errorMsg.toLowerCase().includes('empty video content');

    console.warn(
      `[VideoReelOmni] Omni Flash video generation failed (${isRegional ? 'regional restriction / quota' : 'transient error'}). Gracefully falling back to interactive storyboard:`,
      errorMsg
    );

    return {
      id: reelId,
      title,
      status: 'fallback_storyboard',
      posterUrl,
      durationSec,
      resolution,
      model: ENV.GEMINI_MODEL_VIDEO || 'gemini-omni-1.2-flash',
      storyboardFrames,
      note: isRegional
        ? 'Gemini Omni 1.2 Flash video generation is currently restricted in this region (EEA/UK/CH/select US states). Displaying interactive timecoded storyboard synchronized with canvas nodes.'
        : `Gemini Omni video generation unavailable (${errorMsg.slice(0, 120)}...). Displaying interactive timecoded storyboard synchronized with canvas nodes.`,
      generatedAt: new Date().toISOString(),
    };
  }
}
