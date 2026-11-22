// =============================================================================
// GitUnderstand (git-understand.com) — Gemini 3.5 Voice Transcribe
// Ultra-low-latency voice query transcription using gemini-3.5-transcribe
// with resilient dual-key round-robin failover and gemini-4-hydrogen fallback.
// =============================================================================

import { withV1Client } from './clientPool.js';
import { extractInteractionText, normalizeMimeType, stripDataUriPrefix } from './mediaUtils.js';
import { ENV } from '../config/env.js';

export interface TranscribeAudioResult {
  transcript: string;
  model: string;
  latencyMs: number;
}

const PRIMARY_TRANSCRIBE_MODEL = ENV.GEMINI_MODEL_TRANSCRIBE || 'gemini-3.5-transcribe';
const FALLBACK_TRANSCRIBE_MODEL = ENV.GEMINI_MODEL_ORACLE || 'gemini-4-hydrogen';

const TRANSCRIPTION_PROMPT =
  'Transcribe this spoken audio query verbatim. ' +
  'Output only the exact transcribed speech with proper capitalization and punctuation. ' +
  'Do not add any preamble, conversational commentary, explanations, speaker labels, quotes, or markdown formatting.';

/**
 * Transcribes base64-encoded audio speech into clean text using Gemini 3.5 Transcribe
 * (`gemini-3.5-transcribe`), falling back gracefully to Gemini 4 Hydrogen (`gemini-4-hydrogen`).
 *
 * Adheres strictly to the v1 Interactions API with dual-key pool failover and BYOK support.
 *
 * @param audioBase64 Raw base64 audio data or data URI string.
 * @param mimeType Audio MIME type (e.g. 'audio/webm', 'audio/wav', 'audio/mp4').
 * @param byokApiKey Optional user-supplied Bring-Your-Own-Key.
 * @returns Object with transcribed text, active model name, and end-to-end latency in ms.
 */
export async function transcribeAudioQuery(
  audioBase64: string,
  mimeType: string,
  byokApiKey?: string
): Promise<{ transcript: string; model: string; latencyMs: number }> {
  const start = performance.now();

  const { base64: cleanBase64, detectedMime } = stripDataUriPrefix(audioBase64);
  const effectiveMime = normalizeMimeType(detectedMime || mimeType, 'audio/webm');

  if (!cleanBase64 || cleanBase64.length === 0) {
    return {
      transcript: '',
      model: PRIMARY_TRANSCRIBE_MODEL,
      latencyMs: Math.max(1, Math.round(performance.now() - start)),
    };
  }

  return withV1Client(async (client) => {
    /**
     * Dispatches transcription request using the Gemini v1 Interactions API.
     */
    async function executeInteraction(modelName: string): Promise<string> {
      const interactionParams: Record<string, unknown> = {
        model: modelName,
        input: [
          {
            type: 'audio',
            data: cleanBase64,
            mime_type: effectiveMime,
          },
          {
            type: 'text',
            text: TRANSCRIPTION_PROMPT,
          },
        ],
      };

      // Gemini 4 models strictly require thinking_level rather than temperature/thinking_budget
      if (modelName.startsWith('gemini-4-')) {
        interactionParams.generation_config = {
          thinking_level: 'low',
        };
      }

      const interaction = await client.interactions.create(
        interactionParams as unknown as Parameters<typeof client.interactions.create>[0]
      );

      return extractInteractionText(interaction);
    }

    /**
     * Secondary fallback to generateContent if interactions endpoint is temporarily unavailable.
     */
    async function executeGenerateContent(modelName: string): Promise<string> {
      const generateContentParams: Record<string, unknown> = {
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: cleanBase64,
                  mimeType: effectiveMime,
                },
              },
              {
                text: TRANSCRIPTION_PROMPT,
              },
            ],
          },
        ],
      };

      if (modelName.startsWith('gemini-4-')) {
        generateContentParams.generationConfig = {
          thinking_level: 'low',
        };
      }

      const response = await client.models.generateContent(
        generateContentParams as unknown as Parameters<typeof client.models.generateContent>[0]
      );

      return extractInteractionText(response);
    }

    /**
     * Executes transcription on the specified model, trying interactions first, then generateContent.
     */
    async function transcribeWithModel(modelName: string): Promise<string> {
      try {
        const text = await executeInteraction(modelName);
        if (text && text.trim().length > 0) {
          return text.trim();
        }
      } catch (interactionErr: unknown) {
        console.warn(
          `[voiceTranscribe] interactions.create on "${modelName}" failed:`,
          interactionErr instanceof Error ? interactionErr.message : String(interactionErr)
        );
      }

      const fallbackText = await executeGenerateContent(modelName);
      return fallbackText ? fallbackText.trim() : '';
    }

    // Attempt 1: Dedicated Gemini 3.5 Transcribe
    try {
      const transcript = await transcribeWithModel(PRIMARY_TRANSCRIBE_MODEL);
      if (transcript.length > 0) {
        return {
          transcript,
          model: PRIMARY_TRANSCRIBE_MODEL,
          latencyMs: Math.max(1, Math.round(performance.now() - start)),
        };
      }
      throw new Error(`Empty transcript returned by ${PRIMARY_TRANSCRIBE_MODEL}`);
    } catch (primaryErr: unknown) {
      console.warn(
        `[voiceTranscribe] Primary model "${PRIMARY_TRANSCRIBE_MODEL}" failed, falling back to "${FALLBACK_TRANSCRIBE_MODEL}":`,
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      );

      // Attempt 2: Gemini 4 Hydrogen fallback
      const fallbackTranscript = await transcribeWithModel(FALLBACK_TRANSCRIBE_MODEL);
      return {
        transcript: fallbackTranscript,
        model: FALLBACK_TRANSCRIBE_MODEL,
        latencyMs: Math.max(1, Math.round(performance.now() - start)),
      };
    }
  }, byokApiKey);
}
