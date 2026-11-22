// =============================================================================
// GitUnderstand (git-understand.com) — Gemini Media & JSON Utilities
// Canonical media processing, resilient JSON extraction, and API error helpers.
// =============================================================================

/**
 * Strips data URI prefixes (e.g., "data:image/png;base64,...") and extracts the
 * pure base64 payload alongside any detected MIME type.
 *
 * @param input Raw base64 string or data URI string.
 * @returns Object with stripped base64 data and optional detectedMime.
 */
export function stripDataUriPrefix(input: string): { base64: string; detectedMime?: string } {
  if (!input || typeof input !== 'string') {
    return { base64: '' };
  }

  const trimmed = input.trim();

  // Pattern: data:<mediatype>[;charset=...];base64,<payload>
  const base64DataUriMatch = trimmed.match(
    /^data:([a-zA-Z0-9!#$&.+\-_]+\/[a-zA-Z0-9!#$&.+\-_]+)?(?:;[^;,]+)*;base64,(.*)$/is
  );
  if (base64DataUriMatch) {
    return {
      base64: (base64DataUriMatch[2] ?? '').trim(),
      detectedMime: base64DataUriMatch[1]?.toLowerCase(),
    };
  }

  // Generic data URI fallback: data:<mediatype>,<payload>
  const genericDataUriMatch = trimmed.match(
    /^data:([a-zA-Z0-9!#$&.+\-_]+\/[a-zA-Z0-9!#$&.+\-_]+)?(?:;[^;,]+)*,(.*)$/is
  );
  if (genericDataUriMatch) {
    return {
      base64: (genericDataUriMatch[2] ?? '').trim(),
      detectedMime: genericDataUriMatch[1]?.toLowerCase(),
    };
  }

  return {
    base64: trimmed,
  };
}

/**
 * Normalizes common MIME types and extensions into standard IANA MIME types.
 *
 * @param mime The raw or detected MIME type / file extension.
 * @param fallback The fallback MIME type to return if none or invalid.
 * @returns Normalized MIME type string.
 */
export function normalizeMimeType(mime: string | undefined, fallback: string): string {
  if (!mime || typeof mime !== 'string') {
    return fallback;
  }

  // Strip parameters like '; charset=utf-8' and whitespace
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!base) {
    return fallback;
  }

  const MIME_ALIASES: Record<string, string> = {
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    'image/jpg': 'image/jpeg',
    'image/pjpeg': 'image/jpeg',
    png: 'image/png',
    'image/x-png': 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    'image/svg': 'image/svg+xml',
    'image/svg+xml': 'image/svg+xml',

    // Audio
    mp3: 'audio/mpeg',
    'audio/mp3': 'audio/mpeg',
    'audio/mpeg': 'audio/mpeg',
    wav: 'audio/wav',
    'audio/wav': 'audio/wav',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    m4a: 'audio/mp4',
    'audio/m4a': 'audio/mp4',
    'audio/x-m4a': 'audio/mp4',
    aac: 'audio/aac',
    'audio/aac': 'audio/aac',
    ogg: 'audio/ogg',
    'audio/ogg': 'audio/ogg',
    webm: 'audio/webm',
    'audio/webm': 'audio/webm',
    flac: 'audio/flac',
    'audio/flac': 'audio/flac',
    'audio/x-flac': 'audio/flac',
    pcm: 'audio/pcm',
    'audio/pcm': 'audio/pcm',
    'audio/l16': 'audio/pcm',

    // Video
    mp4: 'video/mp4',
    'video/mp4': 'video/mp4',
    'video/webm': 'video/webm',
    'video/quicktime': 'video/quicktime',
    mov: 'video/quicktime',
    'video/x-matroska': 'video/x-matroska',
    mkv: 'video/x-matroska',

    // Documents & JSON
    json: 'application/json',
    'application/json': 'application/json',
    pdf: 'application/pdf',
    'application/pdf': 'application/pdf',
    txt: 'text/plain',
    'text/plain': 'text/plain',
    md: 'text/markdown',
    'text/markdown': 'text/markdown',
  };

  if (MIME_ALIASES[base]) {
    return MIME_ALIASES[base];
  }

  // Validate generic type/subtype format
  if (/^[a-zA-Z0-9!#$&.+\-_]+\/[a-zA-Z0-9!#$&.+\-_]+$/.test(base)) {
    return base;
  }

  return fallback;
}

/**
 * Determines whether a Gemini API error is transient and eligible for retry.
 * Handles HTTP 429, 500, 502, 503, 504, network socket timeouts, connection resets,
 * and standard Gemini/gRPC error codes like RESOURCE_EXHAUSTED and UNAVAILABLE.
 *
 * @param err Unknown error caught from an API call or network request.
 * @returns boolean True if error is transient / retryable.
 */
export function isTransientGeminiError(err: unknown): boolean {
  if (!err) {
    return false;
  }

  let status: number | undefined;
  let code: string | number | undefined;
  let message = '';

  if (typeof err === 'object') {
    const record = err as Record<string, unknown>;

    // Direct HTTP status or statusCode
    if (typeof record.status === 'number') {
      status = record.status;
    } else if (typeof record.statusCode === 'number') {
      status = record.statusCode;
    } else if (typeof record.status === 'string') {
      const parsed = parseInt(record.status, 10);
      if (!Number.isNaN(parsed)) status = parsed;
    }

    if (record.code !== undefined) {
      code = record.code as string | number;
    }

    if (typeof record.message === 'string') {
      message += record.message + ' ';
    }
    if (typeof record.error === 'string') {
      message += record.error + ' ';
    } else if (record.error && typeof record.error === 'object') {
      const errObj = record.error as Record<string, unknown>;
      if (typeof errObj.message === 'string') {
        message += errObj.message + ' ';
      }
      if (errObj.status !== undefined) {
        const parsed = typeof errObj.status === 'number' ? errObj.status : parseInt(String(errObj.status), 10);
        if (!Number.isNaN(parsed)) status = parsed;
      }
      if (errObj.code !== undefined) {
        code = errObj.code as string | number;
      }
    }
  } else if (typeof err === 'string') {
    message = err;
  }

  // Status code checks: 429 (Rate Limit), 500 (Internal), 502 (Bad Gateway), 503 (Unavailable), 504 (Timeout)
  if (status !== undefined) {
    if ([429, 500, 502, 503, 504].includes(status)) {
      return true;
    }
  }

  // Error code string checks
  if (code !== undefined) {
    const codeStr = String(code).toUpperCase();
    if (
      codeStr === '429' ||
      codeStr === '500' ||
      codeStr === '502' ||
      codeStr === '503' ||
      codeStr === '504' ||
      codeStr === 'RESOURCE_EXHAUSTED' ||
      codeStr === 'UNAVAILABLE' ||
      codeStr === 'DEADLINE_EXCEEDED' ||
      codeStr === 'ETIMEDOUT' ||
      codeStr === 'ECONNRESET' ||
      codeStr === 'ECONNREFUSED' ||
      codeStr === 'ENOTFOUND' ||
      codeStr === 'UND_ERR_CONNECT_TIMEOUT' ||
      codeStr === 'UND_ERR_SOCKET' ||
      codeStr === 'ABORT_ERR'
    ) {
      return true;
    }
  }

  // Substring checks in message
  const lower = message.toLowerCase();
  const TRANSIENT_PATTERNS = [
    'resource_exhausted',
    'resource has been exhausted',
    'quota exceeded',
    'rate limit',
    'too many requests',
    'unavailable',
    'service unavailable',
    'overloaded',
    'try again later',
    'deadline_exceeded',
    'timeout',
    'timed out',
    'econnreset',
    'etimedout',
    'econnrefused',
    'enotfound',
    'fetch failed',
    'socket hang up',
    'network error',
    'temporarily unavailable',
    '503 service',
    '502 bad gateway',
    '504 gateway timeout',
    'internal server error',
    'backend error',
  ];

  return TRANSIENT_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Recursively collects text fragments from Gemini interactions, steps, or parts.
 */
function collectTextFragments(node: unknown, fragments: string[]): void {
  if (!node) return;

  if (typeof node === 'string') {
    const trimmed = node.trim();
    if (trimmed) fragments.push(trimmed);
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectTextFragments(item, fragments);
    }
    return;
  }

  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;

    // Direct output_text
    if (typeof obj.output_text === 'string' && obj.output_text.trim()) {
      fragments.push(obj.output_text.trim());
      return;
    }

    // Direct text
    if (typeof obj.text === 'string' && obj.text.trim()) {
      fragments.push(obj.text.trim());
    }

    // Steps array (v1 interactions API)
    if (Array.isArray(obj.steps)) {
      for (const step of obj.steps) {
        if (step && typeof step === 'object') {
          const stepObj = step as Record<string, unknown>;
          if (stepObj.model_output !== undefined) {
            collectTextFragments(stepObj.model_output, fragments);
          } else if (stepObj.output !== undefined) {
            collectTextFragments(stepObj.output, fragments);
          } else if (stepObj.text !== undefined) {
            collectTextFragments(stepObj.text, fragments);
          }
        }
      }
    }

    // Direct model_output if not processed via steps
    if (obj.model_output !== undefined && !Array.isArray(obj.steps)) {
      collectTextFragments(obj.model_output, fragments);
    }

    // Candidates array (v1 generateContent fallback)
    if (Array.isArray(obj.candidates)) {
      for (const candidate of obj.candidates) {
        collectTextFragments(candidate, fragments);
      }
    }

    // Content container
    if (obj.content !== undefined) {
      collectTextFragments(obj.content, fragments);
    }

    // Parts array
    if (Array.isArray(obj.parts)) {
      for (const part of obj.parts) {
        collectTextFragments(part, fragments);
      }
    }
  }
}

/**
 * Extracts raw textual output from a Gemini interaction object, supporting both
 * Gemini 4 Interactions API responses (`output_text`, `steps` with `model_output`)
 * and standard Gemini generateContent responses.
 *
 * @param interaction The interaction or response object.
 * @returns Plain text representation.
 */
export function extractInteractionText(interaction: unknown): string {
  if (!interaction) {
    return '';
  }

  if (typeof interaction === 'string') {
    return interaction.trim();
  }

  if (typeof interaction === 'object') {
    const obj = interaction as Record<string, unknown>;

    // Fast-path: canonical output_text in Gemini 4 Interactions API
    if (typeof obj.output_text === 'string' && obj.output_text.trim()) {
      return obj.output_text.trim();
    }

    // Fast-path: top-level text getter or property
    if (typeof obj.text === 'string' && obj.text.trim()) {
      return obj.text.trim();
    }
  }

  const fragments: string[] = [];
  collectTextFragments(interaction, fragments);

  // Deduplicate consecutive identical fragments if any
  const filtered: string[] = [];
  for (const f of fragments) {
    if (filtered.length === 0 || filtered[filtered.length - 1] !== f) {
      filtered.push(f);
    }
  }

  return filtered.join('\n\n').trim();
}

/**
 * Internal helper to locate media (image, audio, video) in interaction nodes.
 */
function findMediaInNode(
  node: unknown,
  predicate: (mime: string) => boolean
): { data?: string; uri?: string; mimeType: string } | null {
  if (!node) return null;

  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;

    // 1. inlineData or inline_data
    const inline = (obj.inlineData || obj.inline_data) as Record<string, unknown> | undefined;
    if (inline) {
      const rawMime =
        typeof inline.mimeType === 'string'
          ? inline.mimeType
          : typeof inline.mime_type === 'string'
          ? inline.mime_type
          : '';
      const rawData =
        typeof inline.data === 'string'
          ? inline.data
          : typeof inline.bytes === 'string'
          ? inline.bytes
          : undefined;

      if (rawMime && predicate(rawMime) && rawData) {
        const stripped = stripDataUriPrefix(rawData);
        return {
          data: stripped.base64,
          mimeType: normalizeMimeType(stripped.detectedMime || rawMime, rawMime),
        };
      }
    }

    // 2. media object
    const media = obj.media as Record<string, unknown> | undefined;
    if (media) {
      const rawMime =
        typeof media.mimeType === 'string'
          ? media.mimeType
          : typeof media.mime_type === 'string'
          ? media.mime_type
          : '';
      const rawData =
        typeof media.data === 'string'
          ? media.data
          : typeof media.bytes === 'string'
          ? media.bytes
          : undefined;
      const rawUri =
        typeof media.uri === 'string'
          ? media.uri
          : typeof media.url === 'string'
          ? media.url
          : undefined;

      if (rawMime && predicate(rawMime) && (rawData || rawUri)) {
        if (rawData) {
          const stripped = stripDataUriPrefix(rawData);
          return {
            data: stripped.base64,
            uri: rawUri,
            mimeType: normalizeMimeType(stripped.detectedMime || rawMime, rawMime),
          };
        }
        return {
          uri: rawUri,
          mimeType: normalizeMimeType(rawMime, rawMime),
        };
      }
    }

    // 3. fileData or file_data
    const fileData = (obj.fileData || obj.file_data) as Record<string, unknown> | undefined;
    if (fileData) {
      const rawMime =
        typeof fileData.mimeType === 'string'
          ? fileData.mimeType
          : typeof fileData.mime_type === 'string'
          ? fileData.mime_type
          : '';
      const rawUri =
        typeof fileData.fileUri === 'string'
          ? fileData.fileUri
          : typeof fileData.file_uri === 'string'
          ? fileData.file_uri
          : typeof fileData.uri === 'string'
          ? fileData.uri
          : undefined;

      if (rawMime && predicate(rawMime) && rawUri) {
        return {
          uri: rawUri,
          mimeType: normalizeMimeType(rawMime, rawMime),
        };
      }
    }

    // 4. image, audio, or video sub-objects
    for (const key of ['image', 'audio', 'video']) {
      const sub = obj[key] as Record<string, unknown> | undefined;
      if (sub && typeof sub === 'object') {
        const rawMime =
          typeof sub.mimeType === 'string'
            ? sub.mimeType
            : typeof sub.mime_type === 'string'
            ? sub.mime_type
            : `${key}/png`;
        const rawData =
          typeof sub.data === 'string'
            ? sub.data
            : typeof sub.b64_json === 'string'
            ? sub.b64_json
            : typeof sub.bytes === 'string'
            ? sub.bytes
            : undefined;
        const rawUri =
          typeof sub.uri === 'string'
            ? sub.uri
            : typeof sub.url === 'string'
            ? sub.url
            : undefined;

        if (predicate(rawMime) && (rawData || rawUri)) {
          if (rawData) {
            const stripped = stripDataUriPrefix(rawData);
            return {
              data: stripped.base64,
              uri: rawUri,
              mimeType: normalizeMimeType(stripped.detectedMime || rawMime, rawMime),
            };
          }
          return {
            uri: rawUri,
            mimeType: normalizeMimeType(rawMime, rawMime),
          };
        }
      }
    }

    // 5. Direct data + mimeType on node
    const nodeMime =
      typeof obj.mimeType === 'string'
        ? obj.mimeType
        : typeof obj.mime_type === 'string'
        ? obj.mime_type
        : undefined;
    const nodeData =
      typeof obj.data === 'string'
        ? obj.data
        : typeof obj.bytes === 'string'
        ? obj.bytes
        : undefined;

    if (nodeMime && predicate(nodeMime) && nodeData) {
      const stripped = stripDataUriPrefix(nodeData);
      return {
        data: stripped.base64,
        mimeType: normalizeMimeType(stripped.detectedMime || nodeMime, nodeMime),
      };
    }

    // 6. Data URI inside string text
    if (typeof obj.text === 'string' && obj.text.startsWith('data:')) {
      const stripped = stripDataUriPrefix(obj.text);
      if (stripped.detectedMime && predicate(stripped.detectedMime)) {
        return {
          data: stripped.base64,
          mimeType: normalizeMimeType(stripped.detectedMime, stripped.detectedMime),
        };
      }
    }

    // 7. Recursive traversal of steps, model_output, candidates, parts
    for (const key of [
      'steps',
      'model_output',
      'outputs',
      'output',
      'candidates',
      'content',
      'parts',
      'artifacts',
    ]) {
      if (obj[key]) {
        const found = findMediaInNode(obj[key], predicate);
        if (found) return found;
      }
    }
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findMediaInNode(item, predicate);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Extracts an image base64 data payload and MIME type from an interaction or step.
 *
 * @param interaction Gemini interaction or response object.
 * @returns Object with base64 data and mimeType, or null if no image present.
 */
export function extractInteractionImage(
  interaction: unknown
): { data: string; mimeType: string } | null {
  const result = findMediaInNode(interaction, (mime) => mime.toLowerCase().startsWith('image/'));
  if (result && result.data) {
    return {
      data: result.data,
      mimeType: normalizeMimeType(result.mimeType, 'image/png'),
    };
  }
  return null;
}

/**
 * Extracts an audio base64 data payload and MIME type from an interaction or step.
 *
 * @param interaction Gemini interaction or response object.
 * @returns Object with base64 data and mimeType, or null if no audio present.
 */
export function extractInteractionAudio(
  interaction: unknown
): { data: string; mimeType: string } | null {
  const result = findMediaInNode(interaction, (mime) => mime.toLowerCase().startsWith('audio/'));
  if (result && result.data) {
    return {
      data: result.data,
      mimeType: normalizeMimeType(result.mimeType, 'audio/mpeg'),
    };
  }
  return null;
}

/**
 * Extracts a video payload (inline data or file URI) and MIME type from an interaction or step.
 *
 * @param interaction Gemini interaction or response object.
 * @returns Object with optional data, optional uri, and mimeType, or null if no video present.
 */
export function extractInteractionVideo(
  interaction: unknown
): { data?: string; uri?: string; mimeType: string } | null {
  const result = findMediaInNode(interaction, (mime) => mime.toLowerCase().startsWith('video/'));
  if (result && (result.data || result.uri)) {
    return {
      data: result.data,
      uri: result.uri,
      mimeType: normalizeMimeType(result.mimeType, 'video/mp4'),
    };
  }
  return null;
}

/**
 * Scans text to find balanced JSON blocks delimited by '{' and '}' or '[' and ']'.
 * Correctly handles nested braces and ignores braces inside string literals.
 */
function findBalancedJsonSubstrings(text: string): string[] {
  const candidates: string[] = [];
  const len = text.length;
  let i = 0;

  while (i < len) {
    const ch = text[i];
    if (ch === '{' || ch === '[') {
      const openChar = ch;
      const closeChar = openChar === '{' ? '}' : ']';
      let depth = 1;
      let inString = false;
      let escape = false;
      const start = i;
      i++;

      while (i < len && depth > 0) {
        const c = text[i];
        if (escape) {
          escape = false;
        } else if (c === '\\') {
          escape = true;
        } else if (c === '"') {
          inString = !inString;
        } else if (!inString) {
          if (c === openChar) {
            depth++;
          } else if (c === closeChar) {
            depth--;
          }
        }
        i++;
      }

      if (depth === 0) {
        candidates.push(text.slice(start, i));
      }
    } else {
      i++;
    }
  }

  return candidates;
}

/**
 * Sanitizes minor formatting issues commonly produced by LLMs (e.g. trailing commas).
 */
function sanitizeJsonString(str: string): string {
  // Remove trailing commas before closing braces/brackets
  return str.replace(/,\s*([}\]])/g, '$1');
}

/**
 * Tries to parse a candidate string as JSON, attempting light sanitization if needed.
 */
function tryParseCandidate<T>(candidate: string): T | null {
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Attempt with sanitized string
    try {
      const sanitized = sanitizeJsonString(trimmed);
      return JSON.parse(sanitized) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Extracts and parses a JSON object or array from raw text produced by LLMs.
 * Resiliently strips markdown code fences (```json ... ```), finds balanced JSON
 * structures, and safely handles surrounding prose or trailing commas.
 *
 * @param rawText Unstructured text potentially containing JSON.
 * @returns Parsed object/array typed as T, or null if no valid JSON could be extracted.
 */
export function extractJsonObject<T>(rawText: string): T | null {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  // 1. Direct parse attempt
  const direct = tryParseCandidate<T>(trimmed);
  if (direct !== null) {
    return direct;
  }

  // 2. Check for markdown code fences (```json ... ``` or ``` ... ```)
  const fenceRegex = /```(?:json|javascript|ts|typescript)?\s*\n?([\s\S]*?)\n?```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(trimmed)) !== null) {
    const fenceContent = match[1]?.trim();
    if (fenceContent) {
      const parsedFence = tryParseCandidate<T>(fenceContent);
      if (parsedFence !== null) {
        return parsedFence;
      }

      // If full fence content didn't parse, search for balanced structure inside it
      const balancedInFence = findBalancedJsonSubstrings(fenceContent);
      for (const candidate of balancedInFence) {
        const parsed = tryParseCandidate<T>(candidate);
        if (parsed !== null) {
          return parsed;
        }
      }
    }
  }

  // 3. Scan the entire text for balanced JSON objects/arrays
  const balancedCandidates = findBalancedJsonSubstrings(trimmed);
  for (const candidate of balancedCandidates) {
    const parsed = tryParseCandidate<T>(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}
