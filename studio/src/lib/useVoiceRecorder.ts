'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface RecordedAudio {
  base64: string;
  mimeType: string;
}

export interface VoiceRecorderState {
  isRecording: boolean;
  durationMs: number;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<RecordedAudio | null>;
}

/**
 * Supported audio MIME types in order of preference for Gemini 4 and Whisper / Transcribe models.
 */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/wav',
];

/**
 * Converts a Blob to a raw base64 data string (excluding data-URL header).
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const commaIndex = reader.result.indexOf(',');
        resolve(commaIndex >= 0 ? reader.result.slice(commaIndex + 1) : reader.result);
      } else {
        reject(new Error('Failed to convert recorded audio blob to base64 string.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('FileReader error during audio conversion.'));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * useVoiceRecorder
 *
 * Production-ready voice memo recorder hook for GitUnderstand.
 * Handles microphone permissions, MediaRecorder lifecycle, audio chunk aggregation,
 * duration timer tracking, and base64 export formatted for Gemini transcription endpoints.
 */
export function useVoiceRecorder(): VoiceRecorderState {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [durationMs, setDurationMs] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | number | null>(null);
  const startTimeRef = useRef<number>(0);
  const activeMimeTypeRef = useRef<string>('audio/webm');

  // Helper to cleanup media stream tracks
  const stopTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore errors during track cleanup
        }
      });
      mediaStreamRef.current = null;
    }
  }, []);

  // Helper to clear timer
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current as number);
      timerRef.current = null;
    }
  }, []);

  // Ensure cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore errors on unmount stop
        }
      }
      stopTracks();
    };
  }, [clearTimer, stopTracks]);

  const startRecording = useCallback(async (): Promise<void> => {
    setError(null);

    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      const err = 'Microphone access is not supported in this browser environment.';
      setError(err);
      throw new Error(err);
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      return;
    }

    try {
      // Request audio stream with high-quality voice capture settings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // Select supported MIME type
      let selectedMime = '';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        for (const mime of PREFERRED_MIME_TYPES) {
          if (MediaRecorder.isTypeSupported(mime)) {
            selectedMime = mime;
            break;
          }
        }
      }

      const options: MediaRecorderOptions = selectedMime ? { mimeType: selectedMime } : {};
      const recorder = new MediaRecorder(stream, options);

      activeMimeTypeRef.current = recorder.mimeType || selectedMime || 'audio/webm';
      chunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event: Event) => {
        const errorEvent = event as unknown as { error?: Error };
        const msg = errorEvent.error?.message || 'MediaRecorder error occurred during recording.';
        setError(msg);
      };

      // Start recording with 100ms timeslices for smooth chunking
      recorder.start(100);
      mediaRecorderRef.current = recorder;

      startTimeRef.current = Date.now();
      setDurationMs(0);
      setIsRecording(true);

      // Start timer for duration tracking
      clearTimer();
      timerRef.current = setInterval(() => {
        setDurationMs(Date.now() - startTimeRef.current);
      }, 50);
    } catch (err: unknown) {
      stopTracks();
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to access microphone. Please check your browser audio permissions.';
      setError(message);
      setIsRecording(false);
      throw err;
    }
  }, [clearTimer, stopTracks]);

  const stopRecording = useCallback(async (): Promise<RecordedAudio | null> => {
    clearTimer();

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false);
      stopTracks();
      return null;
    }

    return new Promise<RecordedAudio | null>((resolve, reject) => {
      recorder.onstop = async () => {
        try {
          const mimeType = activeMimeTypeRef.current || recorder.mimeType || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: mimeType });

          chunksRef.current = [];
          stopTracks();
          mediaRecorderRef.current = null;
          setIsRecording(false);

          if (blob.size === 0) {
            resolve(null);
            return;
          }

          const base64 = await blobToBase64(blob);
          resolve({ base64, mimeType });
        } catch (err) {
          setIsRecording(false);
          stopTracks();
          reject(err);
        }
      };

      try {
        recorder.stop();
      } catch (err) {
        setIsRecording(false);
        stopTracks();
        mediaRecorderRef.current = null;
        reject(err);
      }
    });
  }, [clearTimer, stopTracks]);

  return {
    isRecording,
    durationMs,
    error,
    startRecording,
    stopRecording,
  };
}

export default useVoiceRecorder;
