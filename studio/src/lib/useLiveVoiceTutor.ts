'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { LiveVoiceToolAction } from '@shared/types';

export interface LiveTranscriptEntry {
  id: string;
  role: 'user' | 'model' | 'tool';
  text: string;
  timestamp: string;
}

export interface UseLiveVoiceTutorParams {
  repoId: string;
  onToolAction: (action: LiveVoiceToolAction) => void;
  captureCanvasFrame?: () => Promise<string | null>;
}

export interface LiveVoiceTutorState {
  isConnected: boolean;
  isConnecting: boolean;
  isRecording: boolean;
  isMuted: boolean;
  isModelSpeaking: boolean;
  isVisionStreaming: boolean;
  volumeLevel: number;
  error: string | null;
  transcripts: LiveTranscriptEntry[];
  connect: () => Promise<void>;
  disconnect: () => void;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  toggleMute: () => void;
  sendTextMessage: (text: string) => void;
  sendVisionFrame: (customBase64Jpeg?: string) => Promise<void>;
  toggleVisionStreaming: () => void;
  clearTranscripts: () => void;
}

/**
 * Generates an RFC4122-compliant or crypto UUID for live transcript tracking.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'entry_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
}

/**
 * Resolves the WebSocket URL for /ws/live-tutor with support for local development (port 4000),
 * production domains, and environment variable overrides.
 */
function getLiveTutorWsUrl(repoId: string): string {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  const customWsUrl = process.env.NEXT_PUBLIC_BACKEND_WS_URL;
  if (customWsUrl) {
    try {
      const url = new URL(customWsUrl);
      url.pathname = '/ws/live-tutor';
      url.searchParams.set('repoId', repoId);
      return url.toString();
    } catch {
      // Fallback below
    }
  }

  const backendHost =
    process.env.NEXT_PUBLIC_BACKEND_URL
      ? process.env.NEXT_PUBLIC_BACKEND_URL.replace(/^https?:\/\//, '')
      : window.location.hostname === 'localhost'
        ? 'localhost:4000'
        : window.location.host;

  return `${proto}//${backendHost}/ws/live-tutor?repoId=${encodeURIComponent(repoId)}`;
}

/**
 * Linear-interpolation downsampling/resampling for Float32 audio buffers.
 */
function resampleFloat32(
  sourceAudio: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number
): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return sourceAudio;
  }
  const ratio = sourceSampleRate / targetSampleRate;
  const targetLength = Math.round(sourceAudio.length / ratio);
  const result = new Float32Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    const sourceIndex = i * ratio;
    const indexFloor = Math.floor(sourceIndex);
    const indexCeil = Math.min(sourceAudio.length - 1, indexFloor + 1);
    const fraction = sourceIndex - indexFloor;
    result[i] = (1 - fraction) * sourceAudio[indexFloor] + fraction * sourceAudio[indexCeil];
  }
  return result;
}

/**
 * Converts Float32 audio samples (-1.0 .. 1.0) into Little-Endian 16-bit Signed Integer PCM.
 */
function float32ToInt16PCM(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/**
 * Encodes an Int16Array binary buffer into a base64 string.
 */
function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes base64-encoded 16-bit PCM audio back into Float32 audio samples for 24kHz Web Audio playback.
 */
function base64ToFloat32Array(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

/**
 * Calculates Root Mean Square (RMS) volume of Float32 audio chunk, normalized to 0..1.
 */
function calculateRMS(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  return Math.min(1, Math.max(0, rms * 4)); // Amplify slightly for responsive visualizer
}

/**
 * useLiveVoiceTutor
 *
 * Production WebSocket + Web Audio 16kHz PCM capture + 24kHz PCM playback queue + canvas vision frame
 * streamer for Gemini 3.8 Live Voice Tutor (`/ws/live-tutor`).
 *
 * Capabilities:
 * - Sub-second latency bidirectional voice tutoring
 * - High-fidelity 16kHz PCM microphone capture with live downsampling
 * - Glitch-free scheduled 24kHz PCM audio playback queue
 * - Instant playback queue flush upon Gemini 3.8 `interrupted` signal
 * - Hybrid VAD with explicit `{ type: 'audio_end' }` emission on mute and stop
 * - Automatic dispatch of Gemini function calls to `onToolAction` (LiveVoiceToolAction)
 * - Canvas vision snapshot frame streaming (manual or periodic) for visual grounding
 */
export function useLiveVoiceTutor({
  repoId,
  onToolAction,
  captureCanvasFrame,
}: UseLiveVoiceTutorParams): LiveVoiceTutorState {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState<boolean>(false);
  const [isVisionStreaming, setIsVisionStreaming] = useState<boolean>(false);
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<LiveTranscriptEntry[]>([]);

  // Persistent references
  const wsRef = useRef<WebSocket | null>(null);
  const onToolActionRef = useRef(onToolAction);
  onToolActionRef.current = onToolAction;

  const captureCanvasFrameRef = useRef(captureCanvasFrame);
  captureCanvasFrameRef.current = captureCanvasFrame;

  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;

  // Web Audio Capture references (16kHz PCM)
  const captureAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Web Audio Playback references (24kHz PCM)
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Vision streamer interval
  const visionTimerRef = useRef<NodeJS.Timeout | number | null>(null);

  /**
   * Appends or updates transcript entries.
   */
  const appendTranscript = useCallback(
    (entry: { role: 'user' | 'model' | 'tool'; text: string; id?: string }) => {
      setTranscripts((prev) => [
        ...prev,
        {
          id: entry.id || generateId(),
          role: entry.role,
          text: entry.text,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    []
  );

  /**
   * Immediately clears the 24kHz PCM playback queue.
   * Triggered when Gemini 3.8 Live signals user interruption or disconnect.
   */
  const clearPlaybackQueue = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source may already have ended naturally
      }
    }
    activeSourcesRef.current = [];

    if (playbackAudioContextRef.current) {
      nextPlayTimeRef.current = playbackAudioContextRef.current.currentTime;
    } else {
      nextPlayTimeRef.current = 0;
    }
    setIsModelSpeaking(false);
  }, []);

  /**
   * Enqueues and schedules a 24kHz PCM base64 chunk into the audio playback pipeline.
   */
  const enqueue24kHzAudioChunk = useCallback((base64Pcm: string) => {
    try {
      if (!playbackAudioContextRef.current || playbackAudioContextRef.current.state === 'closed') {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        playbackAudioContextRef.current = new AudioContextClass();
      }

      const ctx = playbackAudioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const float32Samples = base64ToFloat32Array(base64Pcm);
      if (float32Samples.length === 0) return;

      // 24kHz single-channel buffer (native Gemini 3.8 Live audio output)
      const audioBuffer = ctx.createBuffer(1, float32Samples.length, 24000);
      audioBuffer.getChannelData(0).set(float32Samples);

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      const scheduledStartTime = Math.max(currentTime, nextPlayTimeRef.current);
      sourceNode.start(scheduledStartTime);
      nextPlayTimeRef.current = scheduledStartTime + audioBuffer.duration;

      activeSourcesRef.current.push(sourceNode);
      setIsModelSpeaking(true);

      sourceNode.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== sourceNode);
        if (activeSourcesRef.current.length === 0) {
          setIsModelSpeaking(false);
        }
      };
    } catch (err) {
      console.error('[LiveVoiceTutor] Failed to decode and schedule audio chunk:', err);
    }
  }, []);

  /**
   * Stops microphone media tracks and cleans up recording processors.
   */
  const stopAudioCapture = useCallback(() => {
    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {}
      scriptProcessorRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }

    if (captureAudioContextRef.current && captureAudioContextRef.current.state !== 'closed') {
      try {
        captureAudioContextRef.current.close().catch(() => {});
      } catch {}
      captureAudioContextRef.current = null;
    }

    setVolumeLevel(0);
    setIsRecording(false);
  }, []);

  /**
   * Initializes microphone capture at 16kHz PCM and streams chunks over the active WebSocket.
   */
  const startRecording = useCallback(async (): Promise<void> => {
    setError(null);

    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      const msg = 'Microphone access is not available in this browser environment.';
      setError(msg);
      throw new Error(msg);
    }

    if (isRecordingRef.current) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const captureCtx = new AudioContextClass();
      captureAudioContextRef.current = captureCtx;

      const sourceNode = captureCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      // 2048 buffer length balances ~43ms latency with reliable callback scheduling
      const processor = captureCtx.createScriptProcessor(2048, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!isRecordingRef.current || isMutedRef.current) {
          setVolumeLevel(0);
          return;
        }

        const inputChannelData = event.inputBuffer.getChannelData(0);
        const rms = calculateRMS(inputChannelData);
        setVolumeLevel(rms);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          // Resample from hardware sample rate to Gemini 3.8 Live standard 16,000 Hz
          const resampled16k = resampleFloat32(inputChannelData, captureCtx.sampleRate, 16000);
          const pcm16Int = float32ToInt16PCM(resampled16k);
          const pcmBase64 = int16ToBase64(pcm16Int);

          wsRef.current.send(
            JSON.stringify({
              type: 'audio',
              pcmBase64,
              mimeType: 'audio/pcm;rate=16000',
            })
          );
        }
      };

      // Mute local loopback so the user does not hear their own microphone
      const silentGain = captureCtx.createGain();
      silentGain.gain.value = 0;

      sourceNode.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(captureCtx.destination);

      setIsRecording(true);
      isRecordingRef.current = true;
    } catch (err: unknown) {
      stopAudioCapture();
      const message =
        err instanceof Error
          ? err.message
          : 'Could not access microphone. Please grant audio permissions.';
      setError(message);
      throw err;
    }
  }, [stopAudioCapture]);

  /**
   * Stops recording and sends `{ type: 'audio_end' }` to backend/Gemini Hybrid VAD.
   */
  const stopRecording = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'audio_end' }));
      } catch (err) {
        console.warn('[LiveVoiceTutor] Failed to send audio_end on stop:', err);
      }
    }
    stopAudioCapture();
  }, [stopAudioCapture]);

  /**
   * Toggles microphone mute. Sends `{ type: 'audio_end' }` immediately when entering muted state.
   */
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;

      if (next && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'audio_end' }));
        } catch (err) {
          console.warn('[LiveVoiceTutor] Failed to send audio_end on mute:', err);
        }
      }
      return next;
    });
  }, []);

  /**
   * Sends an instantaneous vision snapshot of the active canvas to Gemini 3.8 Live.
   */
  const sendVisionFrame = useCallback(async (customBase64Jpeg?: string): Promise<void> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    try {
      let rawBase64 = customBase64Jpeg;
      if (!rawBase64 && captureCanvasFrameRef.current) {
        rawBase64 = (await captureCanvasFrameRef.current()) || undefined;
      }

      if (!rawBase64) return;

      const cleanBase64 = rawBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      wsRef.current.send(
        JSON.stringify({
          type: 'vision_frame',
          imageBase64: cleanBase64,
          mimeType: 'image/jpeg',
          timestamp: new Date().toISOString(),
        })
      );
    } catch (err) {
      console.error('[LiveVoiceTutor] Failed to send canvas vision frame:', err);
    }
  }, []);

  /**
   * Toggles periodic canvas vision frame streaming (every 2.5s).
   */
  const toggleVisionStreaming = useCallback(() => {
    setIsVisionStreaming((prev) => !prev);
  }, []);

  /**
   * Sends a typed text prompt over the live tutor WebSocket.
   */
  const sendTextMessage = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      appendTranscript({ role: 'user', text: clean });

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'text_input',
            text: clean,
          })
        );
      } else {
        setError('Voice tutor is not connected. Connect first to send instructions.');
      }
    },
    [appendTranscript]
  );

  /**
   * Closes WebSocket and stops all media audio/vision streaming.
   */
  const disconnect = useCallback(() => {
    if (visionTimerRef.current) {
      clearInterval(visionTimerRef.current as number);
      visionTimerRef.current = null;
    }

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'audio_end' }));
        }
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    stopAudioCapture();
    clearPlaybackQueue();

    setIsConnected(false);
    setIsConnecting(false);
    setIsVisionStreaming(false);
  }, [clearPlaybackQueue, stopAudioCapture]);

  /**
   * Connects to `/ws/live-tutor` and initializes the bidirectional Gemini 3.8 Live session.
   */
  const connect = useCallback(async (): Promise<void> => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setError(null);
    setIsConnecting(true);

    try {
      const wsUrl = getLiveTutorWsUrl(repoId);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);

        // Send initial setup handshake
        ws.send(
          JSON.stringify({
            type: 'init',
            repoId,
            timestamp: new Date().toISOString(),
          })
        );

        // Auto-start microphone recording once connected
        startRecording().catch((err) => {
          console.warn('[LiveVoiceTutor] Auto-start microphone failed, manual start required:', err);
        });
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'audio':
            case 'audio_chunk': {
              const pcmData = msg.pcmBase64 || msg.data;
              if (pcmData) {
                enqueue24kHzAudioChunk(pcmData);
              }
              break;
            }

            case 'interrupted': {
              // Rule: Clears playback queue immediately on interrupted
              clearPlaybackQueue();
              break;
            }

            case 'tool_action':
            case 'tool_call': {
              const action: LiveVoiceToolAction = msg.action || {
                tool: msg.tool,
                args: msg.args || {},
                callId: msg.callId,
              };

              if (action && action.tool) {
                // Rule: dispatches tool_action to onToolAction
                onToolActionRef.current(action);

                appendTranscript({
                  role: 'tool',
                  text: `Executed ${action.tool} with parameters: ${JSON.stringify(action.args)}`,
                });

                // Acknowledge non-blocking tool action back to server
                if (action.callId && ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: 'tool_response',
                      callId: action.callId,
                      result: { status: 'acknowledged' },
                    })
                  );
                }
              }
              break;
            }

            case 'transcript':
            case 'text': {
              const role: 'user' | 'model' | 'tool' = msg.role || 'model';
              const text = msg.text || '';
              if (text.trim()) {
                appendTranscript({ role, text });
              }
              break;
            }

            case 'error': {
              const errMessage = msg.message || 'Gemini 3.8 Live session encountered an error.';
              setError(errMessage);
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.error('[LiveVoiceTutor] Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (event: Event) => {
        console.error('[LiveVoiceTutor] WebSocket error:', event);
        setError('Connection to Gemini 3.8 Live Voice Tutor lost or failed to connect.');
        setIsConnecting(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        clearPlaybackQueue();
        stopAudioCapture();
      };
    } catch (err: unknown) {
      setIsConnecting(false);
      setIsConnected(false);
      const message = err instanceof Error ? err.message : 'Failed to establish Live Voice Tutor connection.';
      setError(message);
      throw err;
    }
  }, [
    appendTranscript,
    clearPlaybackQueue,
    enqueue24kHzAudioChunk,
    repoId,
    startRecording,
    stopAudioCapture,
  ]);

  /**
   * Periodic vision frame streamer lifecycle
   */
  useEffect(() => {
    if (isVisionStreaming && isConnected) {
      // Send an initial frame right away
      sendVisionFrame();

      visionTimerRef.current = setInterval(() => {
        sendVisionFrame();
      }, 2500);
    } else if (visionTimerRef.current) {
      clearInterval(visionTimerRef.current as number);
      visionTimerRef.current = null;
    }

    return () => {
      if (visionTimerRef.current) {
        clearInterval(visionTimerRef.current as number);
        visionTimerRef.current = null;
      }
    };
  }, [isVisionStreaming, isConnected, sendVisionFrame]);

  /**
   * Teardown on unmount or when switching repositories
   */
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  return {
    isConnected,
    isConnecting,
    isRecording,
    isMuted,
    isModelSpeaking,
    isVisionStreaming,
    volumeLevel,
    error,
    transcripts,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    toggleMute,
    sendTextMessage,
    sendVisionFrame,
    toggleVisionStreaming,
    clearTranscripts,
  };
}

export default useLiveVoiceTutor;
