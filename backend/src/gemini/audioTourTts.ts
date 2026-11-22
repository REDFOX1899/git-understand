// =============================================================================
// GitUnderstand (git-understand.com) — Gemini 3.8 Flash TTS Audio Tour
// Generates 2-speaker (Architect + Explorer) node-synced audio tour cues, calls
// gemini-3.8-flash-tts via v1 Interactions API with speech_metadata annotations,
// writes WAV to ENV.ARTIFACTS_DIR, and provides browser Web Speech fallback.
// =============================================================================

import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { ENV } from '../config/env.js';
import { withV1Client, hasGeminiCredentials } from './clientPool.js';
import { extractInteractionAudio, stripDataUriPrefix } from './mediaUtils.js';
import type {
  VisualAtlasBlueprint,
  AudioTourArtifact,
  AudioTourCue,
  AtlasNode,
  CodemapTourStop,
} from '../../../shared/types.js';

interface RawDialogueTurn {
  speaker: 'Architect' | 'Explorer';
  text: string;
  focusNodeId?: string;
  filePath?: string;
  estimatedDurationSec: number;
}

/**
 * Parses WAV header to extract exact duration in seconds.
 * Returns null if the buffer is not a valid RIFF/WAVE container.
 */
function parseWavDurationSec(buffer: Buffer): number | null {
  if (buffer.length < 44) return null;
  if (
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return null;
  }

  let offset = 12;
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }

  if (sampleRate > 0 && channels > 0 && bitsPerSample > 0 && dataSize > 0) {
    const bytesPerSecond = (sampleRate * channels * bitsPerSample) / 8;
    return Math.round((dataSize / bytesPerSecond) * 10) / 10;
  }
  return null;
}

/**
 * Wraps raw linear PCM buffer in standard 44-byte RIFF/WAV header (defaults to 24 kHz, 16-bit mono).
 */
function wrapPcmInWav(
  pcmData: Buffer,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);

  // RIFF identifier & overall file size
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');

  // fmt subchunk
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // 16 bytes for PCM format chunk
  header.writeUInt16LE(1, 20); // PCM format tag = 1
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * Estimates natural speaking duration in seconds based on word count.
 * Calibrated to ~145 words/minute (~2.4 words/second) with minimum turn padding.
 */
function estimateSpeakingDurationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const duration = words / 2.4;
  return Math.max(2.8, Math.round(duration * 10) / 10);
}

/**
 * Synthesizes a 6-to-8 turn interactive dialogue between Architect (high-level invariants &
 * structural vision) and Explorer (curious developer tracing entrypoints & hot paths).
 */
function buildTourDialogue(blueprint: VisualAtlasBlueprint): RawDialogueTurn[] {
  const repoName = blueprint.metadata.name || blueprint.repoId || 'this repository';
  const pattern = blueprint.architecturePattern || 'modern modular architecture';
  const headline = blueprint.headline || 'visual software architecture';
  const oneLiner = blueprint.oneLiner || 'a high-performance application codebase';

  // 1. If explicit CodemapTour stops are precomputed, use them to anchor dialogue turns
  if (blueprint.codemapTour && blueprint.codemapTour.length >= 3) {
    const turns: RawDialogueTurn[] = [];
    const stops = blueprint.codemapTour.slice(0, 5);

    // Opening Turn: Architect welcomes listener and sets systemic context
    const firstStop = stops[0];
    turns.push({
      speaker: 'Architect',
      text: `Welcome to the architectural tour of ${repoName}. This system implements a ${pattern}, built for ${oneLiner}. Let's orient ourselves across the canvas, starting at ${firstStop.title}.`,
      focusNodeId: firstStop.focusNodeId,
      filePath: firstStop.filePath,
      estimatedDurationSec: estimateSpeakingDurationSec(
        `Welcome to the architectural tour of ${repoName}. This system implements a ${pattern}, built for ${oneLiner}. Let's orient ourselves across the canvas, starting at ${firstStop.title}.`
      ),
    });

    // Middle Turns: Interleaved discussion anchoring each codemap stop
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (i % 2 === 0) {
        const text = `I see ${stop.title} highlighted in the canvas. ${stop.visualHook}. How does this component fit into the hot path?`;
        turns.push({
          speaker: 'Explorer',
          text,
          focusNodeId: stop.focusNodeId,
          filePath: stop.filePath,
          estimatedDurationSec: estimateSpeakingDurationSec(text),
        });
      } else {
        const text = `${stop.explanation} It enforces a key boundary here, isolating presentation and orchestrating state transitions cleanly.`;
        turns.push({
          speaker: 'Architect',
          text,
          focusNodeId: stop.focusNodeId,
          filePath: stop.filePath,
          estimatedDurationSec: estimateSpeakingDurationSec(text),
        });
      }
    }

    // Closing Turn: Architect summarizes design principles and invites canvas exploration
    const lastStop = stops[stops.length - 1];
    const closingText = `Notice how these subsystems link together without circular friction. Use the 3D Strata and Execution Flows on your screen to inspect individual contracts and trace any hot path.`;
    turns.push({
      speaker: 'Architect',
      text: closingText,
      focusNodeId: lastStop.focusNodeId,
      filePath: lastStop.filePath,
      estimatedDurationSec: estimateSpeakingDurationSec(closingText),
    });

    return turns;
  }

  // 2. Fallback heuristic: construct dialogue from high-centrality nodes and subsystems
  const nodes = [...blueprint.nodes];
  const sortedByImportance = nodes.sort((a, b) => (b.centrality || 0) - (a.centrality || 0));

  const entryNode: AtlasNode | undefined =
    nodes.find((n) => n.layer === 'client' || n.layer === 'edge' || n.kind === 'api' || n.kind === 'ui') ||
    sortedByImportance[0];

  const domainNode: AtlasNode | undefined =
    nodes.find(
      (n) =>
        (n.layer === 'domain' || n.layer === 'orchestration' || n.kind === 'service') &&
        n.id !== entryNode?.id
    ) || sortedByImportance[1];

  const dataNode: AtlasNode | undefined =
    nodes.find(
      (n) =>
        (n.layer === 'data' || n.layer === 'infrastructure' || n.kind === 'store') &&
        n.id !== entryNode?.id &&
        n.id !== domainNode?.id
    ) || sortedByImportance[2];

  const resilientNode: AtlasNode | undefined =
    nodes.find(
      (n) =>
        n.id !== entryNode?.id &&
        n.id !== domainNode?.id &&
        n.id !== dataNode?.id
    ) || sortedByImportance[3];

  const turns: RawDialogueTurn[] = [];

  // Turn 0: Architect intro
  const t0 = `Welcome to the visual architecture tour of ${repoName}. At a high level, this system is modeled as a ${pattern}. Our goal today is to examine how data and control propagate across layers.`;
  turns.push({
    speaker: 'Architect',
    text: t0,
    focusNodeId: entryNode?.id,
    filePath: entryNode?.primaryFile,
    estimatedDurationSec: estimateSpeakingDurationSec(t0),
  });

  // Turn 1: Explorer on entrypoint
  const entryLabel = entryNode?.label || 'the root entrypoint';
  const entryFile = entryNode?.primaryFile || 'the top-level module';
  const t1 = `I am zooming into ${entryLabel} in ${entryFile}. This seems to be where requests and user actions originate. What happens immediately after ingress?`;
  turns.push({
    speaker: 'Explorer',
    text: t1,
    focusNodeId: entryNode?.id,
    filePath: entryNode?.primaryFile,
    estimatedDurationSec: estimateSpeakingDurationSec(t1),
  });

  // Turn 2: Architect on domain orchestration
  const domainLabel = domainNode?.label || 'the core domain engine';
  const domainBrief = domainNode?.visualBrief || 'handling state orchestration and contract verification';
  const t2 = `From ${entryLabel}, execution hands off directly to ${domainLabel}. This component serves as the operational spine, ${domainBrief}. It maintains invariants before committing changes.`;
  turns.push({
    speaker: 'Architect',
    text: t2,
    focusNodeId: domainNode?.id,
    filePath: domainNode?.primaryFile,
    estimatedDurationSec: estimateSpeakingDurationSec(t2),
  });

  // Turn 3: Explorer on persistence & data flow
  const dataLabel = dataNode?.label || 'the persistence and storage tier';
  const t3 = `Tracing downstream, I see substantial traffic converging on ${dataLabel}. Are these interactions synchronous, or buffered asynchronously?`;
  turns.push({
    speaker: 'Explorer',
    text: t3,
    focusNodeId: dataNode?.id,
    filePath: dataNode?.primaryFile,
    estimatedDurationSec: estimateSpeakingDurationSec(t3),
  });

  // Turn 4: Architect on storage invariants
  const t4 = `They are strictly decoupled. ${dataLabel} encapsulates storage boundaries so that upstream consumers remain resilient to transport shifts and persistence latency.`;
  turns.push({
    speaker: 'Architect',
    text: t4,
    focusNodeId: dataNode?.id,
    filePath: dataNode?.primaryFile,
    estimatedDurationSec: estimateSpeakingDurationSec(t4),
  });

  // Turn 5: Explorer on risk / edge cases
  const resLabel = resilientNode?.label || 'the supporting infrastructure';
  const t5 = `Looking at ${resLabel}, how does the architecture defend against downstream failures or high concurrency spikes?`;
  turns.push({
    speaker: 'Explorer',
    text: t5,
    focusNodeId: resilientNode?.id,
    filePath: resilientNode?.primaryFile,
    estimatedDurationSec: estimateSpeakingDurationSec(t5),
  });

  // Turn 6: Architect conclusion
  const t6 = `Through explicit boundaries and structured concurrency. You can click on any node or flow step in the studio canvas to inspect symbols, AST relations, and live metrics.`;
  turns.push({
    speaker: 'Architect',
    text: t6,
    focusNodeId: domainNode?.id || entryNode?.id,
    filePath: domainNode?.primaryFile || entryNode?.primaryFile,
    estimatedDurationSec: estimateSpeakingDurationSec(t6),
  });

  return turns;
}

/**
 * Extracts binary audio buffer and MIME type from Gemini interaction response.
 */
function extractAudioBuffer(interaction: unknown): { buffer: Buffer; mimeType: string } | null {
  if (!interaction || typeof interaction !== 'object') return null;

  const resp = interaction as Record<string, unknown>;

  // 1. Direct output_audio or outputAudio field on interaction
  const outputAudio = (resp.output_audio || resp.outputAudio) as Record<string, unknown> | undefined;
  if (outputAudio && typeof outputAudio === 'object') {
    const rawData =
      typeof outputAudio.data === 'string'
        ? outputAudio.data
        : typeof outputAudio.bytes === 'string'
        ? outputAudio.bytes
        : undefined;

    if (rawData) {
      const mime =
        typeof outputAudio.mime_type === 'string'
          ? outputAudio.mime_type
          : typeof outputAudio.mimeType === 'string'
          ? outputAudio.mimeType
          : 'audio/wav';
      const cleanData = stripDataUriPrefix(rawData).base64;
      return {
        buffer: Buffer.from(cleanData, 'base64'),
        mimeType: mime,
      };
    }
  }

  // 2. Delegate to mediaUtils canonical extractor
  const mediaResult = extractInteractionAudio(interaction);
  if (mediaResult && mediaResult.data) {
    return {
      buffer: Buffer.from(mediaResult.data, 'base64'),
      mimeType: mediaResult.mimeType || 'audio/wav',
    };
  }

  return null;
}

/**
 * Generates an interactive 2-speaker audio tour for a Visual Atlas blueprint.
 *
 * Calls gemini-3.8-flash-tts via the v1 Interactions API with speech_metadata annotations,
 * saves the resulting WAV to ENV.ARTIFACTS_DIR, and returns node-synchronized cues.
 * If no API key is available or synthesis fails, cleanly falls back to browser Web Speech cues.
 *
 * @param blueprint The synthesized repository VisualAtlasBlueprint.
 * @param byokApiKey Optional user-supplied Bring Your Own Key.
 * @returns Promise resolving to the AudioTourArtifact.
 */
export async function generateAudioTour(
  blueprint: VisualAtlasBlueprint,
  byokApiKey?: string
): Promise<AudioTourArtifact> {
  const safeRepoSlug = (blueprint.repoId || 'repo').replace(/[^a-zA-Z0-9_-]/g, '_');
  const tourTitle = `${blueprint.metadata?.name || blueprint.repoId} Architecture Tour`;
  const rawTurns = buildTourDialogue(blueprint);

  // Compute initial cue timings based on estimated speaking rates
  let runningTime = 0;
  const initialCues: AudioTourCue[] = rawTurns.map((turn, idx) => {
    const start = Math.round(runningTime * 10) / 10;
    runningTime += turn.estimatedDurationSec;
    return {
      turnIndex: idx,
      speaker: turn.speaker,
      text: turn.text,
      focusNodeId: turn.focusNodeId,
      filePath: turn.filePath,
      approxStartSec: start,
      approxDurationSec: turn.estimatedDurationSec,
    };
  });
  const totalEstimatedDuration = Math.round(runningTime * 10) / 10;

  // Fallback Artifact constructor (used if credentials absent or synthesis fails)
  const createWebSpeechFallback = (): AudioTourArtifact => ({
    id: `tour_${safeRepoSlug}_${Date.now()}`,
    title: tourTitle,
    audioUrl: '',
    mimeType: 'audio/wav',
    durationSec: totalEstimatedDuration,
    model: 'browser-web-speech',
    cues: initialCues,
    generatedAt: new Date().toISOString(),
  });

  // If no Gemini credentials exist, return Web Speech fallback immediately
  if (!hasGeminiCredentials(byokApiKey)) {
    return createWebSpeechFallback();
  }

  try {
    // Ensure artifacts directory exists
    await fsPromises.mkdir(ENV.ARTIFACTS_DIR, { recursive: true });

    // Format turn-level input for gemini-3.8-flash-tts with speech_metadata annotations
    const inputContents = rawTurns.map((turn) => ({
      type: 'text' as const,
      text: turn.text,
      annotations: [
        {
          type: 'speech_metadata' as const,
          speaker: turn.speaker,
          style:
            turn.speaker === 'Architect'
              ? 'authoritative, measured, architectural deep dive, clear cadence'
              : 'curious, analytical, conversational, observant engineer',
        },
      ],
    }));

    const ttsModel = ENV.GEMINI_MODEL_TTS || 'gemini-3.8-flash-tts';

    // Dispatch request to Gemini 3.8 Flash TTS via v1 Interactions API
    const response = await withV1Client(async (client) => {
      return await client.interactions.create({
        model: ttsModel,
        input: inputContents,
        generation_config: {
          speech_config: {
            speakers: [
              { speaker: 'Architect', voice: 'Fenrir' },
              { speaker: 'Explorer', voice: 'Puck' },
            ],
          },
        } as unknown as Record<string, unknown>,
        response_format: {
          type: 'audio',
          mime_type: 'audio/wav',
        } as unknown as Record<string, unknown>,
      } as unknown as Parameters<typeof client.interactions.create>[0]);
    }, byokApiKey);

    const extracted = extractAudioBuffer(response);
    if (!extracted || !extracted.buffer || extracted.buffer.length === 0) {
      console.warn(
        `[AudioTourTTS] Model ${ttsModel} returned response without audio payload. Falling back to Web Speech.`
      );
      return createWebSpeechFallback();
    }

    let audioBuffer = extracted.buffer;

    // Ensure audio has a valid WAV header (wrap raw PCM if needed)
    const isWav =
      audioBuffer.length >= 12 &&
      audioBuffer.toString('ascii', 0, 4) === 'RIFF' &&
      audioBuffer.toString('ascii', 8, 12) === 'WAVE';

    if (!isWav) {
      audioBuffer = wrapPcmInWav(audioBuffer, 24000, 1, 16);
    }

    // Determine exact audio duration from WAV container
    const parsedDuration = parseWavDurationSec(audioBuffer);
    const actualDuration = parsedDuration && parsedDuration > 0 ? parsedDuration : totalEstimatedDuration;

    // Save audio WAV file to ENV.ARTIFACTS_DIR
    const filename = `audio_tour_${safeRepoSlug}_${Date.now()}.wav`;
    const fullPath = path.join(ENV.ARTIFACTS_DIR, filename);
    await fsPromises.writeFile(fullPath, audioBuffer);

    // Rescale cue timings proportionally to match real audio duration
    const scaleRatio = actualDuration / (totalEstimatedDuration || 1);
    let cumulative = 0;
    const synchronizedCues: AudioTourCue[] = initialCues.map((cue) => {
      const scaledDuration = Math.round(cue.approxDurationSec * scaleRatio * 10) / 10;
      const start = Math.round(cumulative * 10) / 10;
      cumulative += scaledDuration;
      return {
        ...cue,
        approxStartSec: start,
        approxDurationSec: scaledDuration,
      };
    });

    return {
      id: `tour_${safeRepoSlug}_${Date.now()}`,
      title: tourTitle,
      audioUrl: `/artifacts/${filename}`,
      mimeType: 'audio/wav',
      durationSec: actualDuration,
      model: ttsModel,
      cues: synchronizedCues,
      generatedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    console.warn(
      '[AudioTourTTS] Failed to synthesize Gemini 3.8 Flash TTS audio. Falling back to browser Web Speech cues:',
      err instanceof Error ? err.message : String(err)
    );
    return createWebSpeechFallback();
  }
}
