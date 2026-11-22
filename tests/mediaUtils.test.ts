import { describe, it, expect } from 'vitest';
import {
  stripDataUriPrefix,
  normalizeMimeType,
  isTransientGeminiError,
  extractInteractionText,
  extractInteractionImage,
  extractInteractionAudio,
  extractInteractionVideo,
  extractJsonObject,
} from '../backend/src/gemini/mediaUtils.js';

describe('Gemini Media & JSON Utilities (mediaUtils)', () => {
  describe('stripDataUriPrefix', () => {
    it('returns empty base64 for empty, null, or non-string inputs', () => {
      // @ts-expect-error testing invalid inputs
      expect(stripDataUriPrefix(null)).toEqual({ base64: '' });
      // @ts-expect-error testing invalid inputs
      expect(stripDataUriPrefix(undefined)).toEqual({ base64: '' });
      expect(stripDataUriPrefix('')).toEqual({ base64: '' });
    });

    it('returns pure base64 unchanged when no data URI prefix is present', () => {
      const raw = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const result = stripDataUriPrefix(raw);
      expect(result.base64).toBe(raw);
      expect(result.detectedMime).toBeUndefined();
    });

    it('trims leading and trailing whitespace from pure base64', () => {
      const raw = '  YWJjZGVmZw==  \n';
      const result = stripDataUriPrefix(raw);
      expect(result.base64).toBe('YWJjZGVmZw==');
    });

    it('strips standard image/png data URI prefix and extracts MIME type', () => {
      const input = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA';
      const result = stripDataUriPrefix(input);
      expect(result.base64).toBe('iVBORw0KGgoAAAANSUhEUgAA');
      expect(result.detectedMime).toBe('image/png');
    });

    it('strips audio data URI prefix and lowercases detected MIME type', () => {
      const input = 'data:Audio/MPEG;base64,//uQZAAAAAAAAAAAAAAAAAAAAAA';
      const result = stripDataUriPrefix(input);
      expect(result.base64).toBe('//uQZAAAAAAAAAAAAAAAAAAAAAA');
      expect(result.detectedMime).toBe('audio/mpeg');
    });

    it('handles extra parameters in data URI such as charset or name', () => {
      const input = 'data:image/jpeg;charset=utf-8;base64,/9j/4AAQSkZJRgABAQ';
      const result = stripDataUriPrefix(input);
      expect(result.base64).toBe('/9j/4AAQSkZJRgABAQ');
      expect(result.detectedMime).toBe('image/jpeg');
    });

    it('handles generic non-base64 data URI fallback', () => {
      const input = 'data:text/plain;charset=utf-8,Hello%20World';
      const result = stripDataUriPrefix(input);
      expect(result.base64).toBe('Hello%20World');
      expect(result.detectedMime).toBe('text/plain');
    });
  });

  describe('normalizeMimeType', () => {
    it('returns fallback for undefined, null, or empty string', () => {
      expect(normalizeMimeType(undefined, 'application/octet-stream')).toBe('application/octet-stream');
      // @ts-expect-error testing invalid input
      expect(normalizeMimeType(null, 'text/plain')).toBe('text/plain');
      expect(normalizeMimeType('', 'application/json')).toBe('application/json');
    });

    it('normalizes common image extensions and aliases', () => {
      expect(normalizeMimeType('jpg', 'image/png')).toBe('image/jpeg');
      expect(normalizeMimeType('jpeg', 'image/png')).toBe('image/jpeg');
      expect(normalizeMimeType('image/jpg', 'image/png')).toBe('image/jpeg');
      expect(normalizeMimeType('png', 'application/octet-stream')).toBe('image/png');
      expect(normalizeMimeType('image/x-png', 'image/png')).toBe('image/png');
      expect(normalizeMimeType('webp', 'image/png')).toBe('image/webp');
      expect(normalizeMimeType('gif', 'image/png')).toBe('image/gif');
      expect(normalizeMimeType('svg', 'image/png')).toBe('image/svg+xml');
      expect(normalizeMimeType('image/svg', 'image/png')).toBe('image/svg+xml');
    });

    it('normalizes common audio extensions and aliases', () => {
      expect(normalizeMimeType('mp3', 'audio/wav')).toBe('audio/mpeg');
      expect(normalizeMimeType('audio/mp3', 'audio/wav')).toBe('audio/mpeg');
      expect(normalizeMimeType('wav', 'audio/mpeg')).toBe('audio/wav');
      expect(normalizeMimeType('audio/x-wav', 'audio/mpeg')).toBe('audio/wav');
      expect(normalizeMimeType('m4a', 'audio/mpeg')).toBe('audio/mp4');
      expect(normalizeMimeType('audio/x-m4a', 'audio/mpeg')).toBe('audio/mp4');
      expect(normalizeMimeType('aac', 'audio/mpeg')).toBe('audio/aac');
      expect(normalizeMimeType('ogg', 'audio/mpeg')).toBe('audio/ogg');
      expect(normalizeMimeType('flac', 'audio/mpeg')).toBe('audio/flac');
      expect(normalizeMimeType('pcm', 'audio/mpeg')).toBe('audio/pcm');
      expect(normalizeMimeType('audio/l16', 'audio/mpeg')).toBe('audio/pcm');
    });

    it('normalizes video extensions and aliases', () => {
      expect(normalizeMimeType('mp4', 'video/mp4')).toBe('video/mp4');
      expect(normalizeMimeType('mov', 'video/mp4')).toBe('video/quicktime');
      expect(normalizeMimeType('mkv', 'video/mp4')).toBe('video/x-matroska');
      expect(normalizeMimeType('video/webm', 'video/mp4')).toBe('video/webm');
    });

    it('normalizes documents and text', () => {
      expect(normalizeMimeType('json', 'text/plain')).toBe('application/json');
      expect(normalizeMimeType('pdf', 'text/plain')).toBe('application/pdf');
      expect(normalizeMimeType('md', 'text/plain')).toBe('text/markdown');
      expect(normalizeMimeType('txt', 'application/json')).toBe('text/plain');
    });

    it('strips MIME parameters like charset before resolving', () => {
      expect(normalizeMimeType('text/plain; charset=utf-8', 'text/html')).toBe('text/plain');
      expect(normalizeMimeType('image/jpeg; charset=binary', 'image/png')).toBe('image/jpeg');
    });

    it('preserves valid RFC-compliant type/subtype strings not in the alias map', () => {
      expect(normalizeMimeType('application/x-custom-model', 'application/octet-stream')).toBe(
        'application/x-custom-model'
      );
    });

    it('falls back when MIME string format is invalid', () => {
      expect(normalizeMimeType('invalid-non-mime-string', 'image/png')).toBe('image/png');
    });
  });

  describe('isTransientGeminiError', () => {
    it('returns false for null, undefined, or empty error', () => {
      expect(isTransientGeminiError(null)).toBe(false);
      expect(isTransientGeminiError(undefined)).toBe(false);
      expect(isTransientGeminiError('')).toBe(false);
      expect(isTransientGeminiError({})).toBe(false);
    });

    it('detects HTTP status numbers: 429, 500, 502, 503, 504', () => {
      expect(isTransientGeminiError({ status: 429 })).toBe(true);
      expect(isTransientGeminiError({ status: 500 })).toBe(true);
      expect(isTransientGeminiError({ status: 502 })).toBe(true);
      expect(isTransientGeminiError({ statusCode: 503 })).toBe(true);
      expect(isTransientGeminiError({ statusCode: 504 })).toBe(true);
      expect(isTransientGeminiError({ status: '429' })).toBe(true);
      expect(isTransientGeminiError({ status: '503' })).toBe(true);
    });

    it('returns false for non-transient HTTP statuses like 400, 401, 403, 404', () => {
      expect(isTransientGeminiError({ status: 400 })).toBe(false);
      expect(isTransientGeminiError({ status: 401 })).toBe(false);
      expect(isTransientGeminiError({ status: 403 })).toBe(false);
      expect(isTransientGeminiError({ status: 404 })).toBe(false);
    });

    it('detects nested error objects with status or code', () => {
      expect(isTransientGeminiError({ error: { status: 503, message: 'Service Unavailable' } })).toBe(true);
      expect(isTransientGeminiError({ error: { code: 'RESOURCE_EXHAUSTED' } })).toBe(true);
      expect(isTransientGeminiError({ error: { status: 404, message: 'Not Found' } })).toBe(false);
    });

    it('detects known transient gRPC and network error codes', () => {
      expect(isTransientGeminiError({ code: 'RESOURCE_EXHAUSTED' })).toBe(true);
      expect(isTransientGeminiError({ code: 'UNAVAILABLE' })).toBe(true);
      expect(isTransientGeminiError({ code: 'DEADLINE_EXCEEDED' })).toBe(true);
      expect(isTransientGeminiError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isTransientGeminiError({ code: 'ECONNRESET' })).toBe(true);
      expect(isTransientGeminiError({ code: 'ECONNREFUSED' })).toBe(true);
      expect(isTransientGeminiError({ code: 'ENOTFOUND' })).toBe(true);
      expect(isTransientGeminiError({ code: 'UND_ERR_CONNECT_TIMEOUT' })).toBe(true);
      expect(isTransientGeminiError({ code: 'UND_ERR_SOCKET' })).toBe(true);
      expect(isTransientGeminiError({ code: 'ABORT_ERR' })).toBe(true);
      expect(isTransientGeminiError({ code: 429 })).toBe(true);
      expect(isTransientGeminiError({ code: 503 })).toBe(true);
    });

    it('detects transient phrases in error message strings', () => {
      expect(isTransientGeminiError('Error: Resource has been exhausted for quota')).toBe(true);
      expect(isTransientGeminiError(new Error('Rate limit exceeded: please try again later'))).toBe(true);
      expect(isTransientGeminiError({ message: 'Overloaded. Service temporarily unavailable.' })).toBe(true);
      expect(isTransientGeminiError({ message: 'fetch failed: socket hang up' })).toBe(true);
      expect(isTransientGeminiError({ message: 'Internal Server Error occurred during inference' })).toBe(true);
      expect(isTransientGeminiError({ message: '504 Gateway Timeout' })).toBe(true);
      expect(isTransientGeminiError('Network error: connection reset by peer')).toBe(true);
    });

    it('returns false for permanent application errors', () => {
      expect(isTransientGeminiError(new Error('Invalid argument: prompt cannot be empty'))).toBe(false);
      expect(isTransientGeminiError({ message: 'API key not valid. Please pass a valid API key.' })).toBe(false);
      expect(isTransientGeminiError('TypeError: Cannot read properties of undefined')).toBe(false);
    });
  });

  describe('extractInteractionText', () => {
    it('returns empty string for null, undefined, or empty inputs', () => {
      expect(extractInteractionText(null)).toBe('');
      expect(extractInteractionText(undefined)).toBe('');
      expect(extractInteractionText('')).toBe('');
      expect(extractInteractionText({})).toBe('');
    });

    it('returns raw string trimmed directly', () => {
      expect(extractInteractionText('  Hello Gemini World!  ')).toBe('Hello Gemini World!');
    });

    it('extracts top-level output_text fast-path', () => {
      const interaction = {
        output_text: 'Generated documentation overview.\nLine 2.',
        other_field: 123,
      };
      expect(extractInteractionText(interaction)).toBe('Generated documentation overview.\nLine 2.');
    });

    it('extracts top-level text property', () => {
      const interaction = {
        text: 'Summary of the AST parse.',
      };
      expect(extractInteractionText(interaction)).toBe('Summary of the AST parse.');
    });

    it('extracts text from Gemini 4 steps array with model_output', () => {
      const interaction = {
        steps: [
          {
            model_output: {
              text: 'Step 1: Analyzed call graph.',
            },
          },
          {
            model_output: {
              text: 'Step 2: Computed strata depth.',
            },
          },
        ],
      };
      const text = extractInteractionText(interaction);
      expect(text).toContain('Step 1: Analyzed call graph.');
      expect(text).toContain('Step 2: Computed strata depth.');
    });

    it('extracts text from standard Gemini candidates and parts structure', () => {
      const interaction = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'First part of response.' },
                { text: 'Second part of response.' },
              ],
            },
          },
        ],
      };
      const text = extractInteractionText(interaction);
      expect(text).toBe('First part of response.\n\nSecond part of response.');
    });

    it('deduplicates consecutive identical text fragments', () => {
      const interaction = {
        parts: [
          { text: 'Identical paragraph.' },
          { text: 'Identical paragraph.' },
          { text: 'Different paragraph.' },
        ],
      };
      expect(extractInteractionText(interaction)).toBe('Identical paragraph.\n\nDifferent paragraph.');
    });
  });

  describe('extractInteractionImage', () => {
    it('returns null when no image data is present', () => {
      expect(extractInteractionImage(null)).toBeNull();
      expect(extractInteractionImage({})).toBeNull();
      expect(extractInteractionImage({ text: 'No image here' })).toBeNull();
      expect(extractInteractionImage({ inlineData: { mimeType: 'audio/mp3', data: 'AAA=' } })).toBeNull();
    });

    it('extracts image from inlineData with base64 and mimeType', () => {
      const rawBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const interaction = {
        inlineData: {
          mimeType: 'image/png',
          data: rawBase64,
        },
      };
      const result = extractInteractionImage(interaction);
      expect(result).not.toBeNull();
      expect(result?.data).toBe(rawBase64);
      expect(result?.mimeType).toBe('image/png');
    });

    it('strips data URI prefix inside inlineData data payload', () => {
      const interaction = {
        inline_data: {
          mime_type: 'image/jpeg',
          data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        },
      };
      const result = extractInteractionImage(interaction);
      expect(result).not.toBeNull();
      expect(result?.data).toBe('/9j/4AAQSkZJRg==');
      expect(result?.mimeType).toBe('image/jpeg');
    });

    it('extracts image from media object', () => {
      const interaction = {
        media: {
          mimeType: 'image/webp',
          data: 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
        },
      };
      const result = extractInteractionImage(interaction);
      expect(result).not.toBeNull();
      expect(result?.data).toBe('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA');
      expect(result?.mimeType).toBe('image/webp');
    });

    it('extracts image from image sub-object with b64_json', () => {
      const interaction = {
        image: {
          mimeType: 'image/png',
          b64_json: 'QUJDREVGR0g=',
        },
      };
      const result = extractInteractionImage(interaction);
      expect(result).not.toBeNull();
      expect(result?.data).toBe('QUJDREVGR0g=');
      expect(result?.mimeType).toBe('image/png');
    });

    it('extracts image embedded in text as data URI', () => {
      const interaction = {
        text: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
      };
      const result = extractInteractionImage(interaction);
      expect(result).not.toBeNull();
      expect(result?.data).toBe('iVBORw0KGgoAAAANSUhEUgAA');
      expect(result?.mimeType).toBe('image/png');
    });

    it('finds image deeply nested in steps and parts', () => {
      const interaction = {
        steps: [
          {
            model_output: {
              parts: [
                { text: 'Diagram generation complete:' },
                {
                  inlineData: {
                    mimeType: 'image/svg+xml',
                    data: 'PHN2Zz48L3N2Zz4=',
                  },
                },
              ],
            },
          },
        ],
      };
      const result = extractInteractionImage(interaction);
      expect(result).not.toBeNull();
      expect(result?.data).toBe('PHN2Zz48L3N2Zz4=');
      expect(result?.mimeType).toBe('image/svg+xml');
    });
  });

  describe('extractInteractionAudio', () => {
    it('returns null when no audio data is present', () => {
      expect(extractInteractionAudio(null)).toBeNull();
      expect(extractInteractionAudio({})).toBeNull();
      expect(extractInteractionAudio({ inlineData: { mimeType: 'image/png', data: 'AAA=' } })).toBeNull();
    });

    it('extracts audio from inlineData', () => {
      const interaction = {
        inlineData: {
          mimeType: 'audio/mp3',
          data: '//uQZAAAAAAAAAAAAAAAAAAAAAA',
        },
      };
      const result = extractInteractionAudio(interaction);
      expect(result).not.toBeNull();
      expect(result?.data).toBe('//uQZAAAAAAAAAAAAAAAAAAAAAA');
      expect(result?.mimeType).toBe('audio/mpeg');
    });

    it('extracts audio from audio sub-object', () => {
      const interaction = {
        audio: {
          mimeType: 'audio/wav',
          data: 'UklGRi4AAABXQVZFZm10IBAAAAABAAEA',
        },
      };
      const result = extractInteractionAudio(interaction);
      expect(result).not.toBeNull();
      expect(result?.data).toBe('UklGRi4AAABXQVZFZm10IBAAAAABAAEA');
      expect(result?.mimeType).toBe('audio/wav');
    });

    it('extracts audio from data URI embedded in text', () => {
      const interaction = {
        text: 'data:audio/ogg;base64,T2dnUwACAAAAAAAAAAAA',
      };
      const result = extractInteractionAudio(interaction);
      expect(result).not.toBeNull();
      expect(result?.data).toBe('T2dnUwACAAAAAAAAAAAA');
      expect(result?.mimeType).toBe('audio/ogg');
    });
  });

  describe('extractInteractionVideo', () => {
    it('returns null when no video data or uri is present', () => {
      expect(extractInteractionVideo(null)).toBeNull();
      expect(extractInteractionVideo({})).toBeNull();
      expect(extractInteractionVideo({ text: 'just text' })).toBeNull();
    });

    it('extracts video from fileData with fileUri', () => {
      const interaction = {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/video123',
        },
      };
      const result = extractInteractionVideo(interaction);
      expect(result).not.toBeNull();
      expect(result?.uri).toBe('https://generativelanguage.googleapis.com/v1beta/files/video123');
      expect(result?.mimeType).toBe('video/mp4');
      expect(result?.data).toBeUndefined();
    });

    it('extracts video with inline data', () => {
      const interaction = {
        video: {
          mimeType: 'video/webm',
          data: 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJ7',
        },
      };
      const result = extractInteractionVideo(interaction);
      expect(result).not.toBeNull();
      expect(result?.data).toBe('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJ7');
      expect(result?.mimeType).toBe('video/webm');
    });
  });

  describe('extractJsonObject', () => {
    it('returns null for empty, null, or invalid strings', () => {
      // @ts-expect-error testing invalid inputs
      expect(extractJsonObject(null)).toBeNull();
      // @ts-expect-error testing invalid inputs
      expect(extractJsonObject(undefined)).toBeNull();
      expect(extractJsonObject('')).toBeNull();
      expect(extractJsonObject('   ')).toBeNull();
      expect(extractJsonObject('No JSON here at all.')).toBeNull();
    });

    it('parses direct JSON objects directly', () => {
      const input = '{"repo": "facebook/react", "stars": 220000, "verified": true}';
      const parsed = extractJsonObject<{ repo: string; stars: number; verified: boolean }>(input);
      expect(parsed).toEqual({
        repo: 'facebook/react',
        stars: 220000,
        verified: true,
      });
    });

    it('parses direct JSON arrays directly', () => {
      const input = '["strata", "decision-xray", "lasso", "token-treemap"]';
      const parsed = extractJsonObject<string[]>(input);
      expect(parsed).toEqual(['strata', 'decision-xray', 'lasso', 'token-treemap']);
    });

    it('extracts JSON enclosed in markdown code fences ```json ... ```', () => {
      const input = `
Here is the architectural overview you requested:

\`\`\`json
{
  "strataDepth": 4,
  "nodes": ["auth.ts", "server.ts", "router.ts"],
  "entrypoint": "index.ts"
}
\`\`\`

Let me know if you need more details.
      `;
      const parsed = extractJsonObject<{ strataDepth: number; nodes: string[]; entrypoint: string }>(input);
      expect(parsed).toEqual({
        strataDepth: 4,
        nodes: ['auth.ts', 'server.ts', 'router.ts'],
        entrypoint: 'index.ts',
      });
    });

    it('extracts JSON from untagged markdown code fences ``` ... ```', () => {
      const input = `
\`\`\`
{
  "status": "ready",
  "score": 98.5
}
\`\`\`
      `;
      const parsed = extractJsonObject<{ status: string; score: number }>(input);
      expect(parsed).toEqual({ status: 'ready', score: 98.5 });
    });

    it('extracts JSON from typescript/javascript tagged code fences', () => {
      const input = `
\`\`\`ts
{
  "type": "AST_NODE",
  "name": "DecisionXRay"
}
\`\`\`
      `;
      const parsed = extractJsonObject<{ type: string; name: string }>(input);
      expect(parsed).toEqual({ type: 'AST_NODE', name: 'DecisionXRay' });
    });

    it('extracts balanced JSON embedded directly inside prose without code fences', () => {
      const input = 'The analysis determined that {"action": "accept", "reason": "clean diff"} is the best path.';
      const parsed = extractJsonObject<{ action: string; reason: string }>(input);
      expect(parsed).toEqual({ action: 'accept', reason: 'clean diff' });
    });

    it('extracts balanced JSON array embedded in prose', () => {
      const input = 'Found the following layers: [{"depth": 1, "name": "core"}, {"depth": 2, "name": "ui"}] in the tree.';
      const parsed = extractJsonObject<Array<{ depth: number; name: string }>>(input);
      expect(parsed).toEqual([
        { depth: 1, name: 'core' },
        { depth: 2, name: 'ui' },
      ]);
    });

    it('sanitizes trailing commas before closing braces/brackets', () => {
      const trailingCommaObject = `
\`\`\`json
{
  "key1": "value1",
  "key2": "value2",
}
\`\`\`
      `;
      const parsedObj = extractJsonObject<{ key1: string; key2: string }>(trailingCommaObject);
      expect(parsedObj).toEqual({ key1: 'value1', key2: 'value2' });

      const trailingCommaArray = '  [ 10, 20, 30, ] ';
      const parsedArr = extractJsonObject<number[]>(trailingCommaArray);
      expect(parsedArr).toEqual([10, 20, 30]);
    });

    it('correctly handles nested braces and strings containing braces without confusion', () => {
      const input = `
The response payload:
{
  "query": "SELECT * WHERE code LIKE '{pattern}'",
  "meta": {
    "sub": {
      "expression": "if (x) { return true; }"
    }
  }
}
End of report.
      `;
      const parsed = extractJsonObject<{ query: string; meta: { sub: { expression: string } } }>(input);
      expect(parsed).not.toBeNull();
      expect(parsed?.query).toBe("SELECT * WHERE code LIKE '{pattern}'");
      expect(parsed?.meta.sub.expression).toBe('if (x) { return true; }');
    });

    it('correctly handles escaped quotes inside JSON string literals', () => {
      const input = `{"headline": "He said \\"GitUnderstand is fast\\" and smiled."}`;
      const parsed = extractJsonObject<{ headline: string }>(input);
      expect(parsed).toEqual({ headline: 'He said "GitUnderstand is fast" and smiled.' });
    });

    it('returns null when candidates fail to parse as JSON', () => {
      const input = 'This has broken { non: json, syntax: } braces.';
      expect(extractJsonObject(input)).toBeNull();
    });
  });
});
