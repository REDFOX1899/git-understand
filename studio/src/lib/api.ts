// =============================================================================
// GitUnderstand (git-understand.com) — Studio Typed API Client
// Agent 43: Complete typed frontend API client communicating with backend
// =============================================================================

import type {
  AudioTourArtifact,
  BackendHealthStatus,
  CircleExplainRequest,
  CircleExplainResponse,
  CodemapTourStop,
  CompiledDigest,
  DigestFilterOptions,
  ExecutionFlow,
  ForensicsReport,
  MediaPosterArtifact,
  MermaidDiagramSpec,
  OracleCitation,
  PipelineProgressEvent,
  VideoReelArtifact,
  VisualAtlasBlueprint,
  VisualSearchMatch,
  XRayMatrixReport,
} from '@shared/types';

// =============================================================================
// BYOK (Bring Your Own Key) & Session Configuration
// =============================================================================

export interface ByokConfig {
  geminiApiKey: string;
  githubToken: string;
  deepThinking: boolean;
}

const BYOK_STORAGE_KEY = 'gitunderstand_byok_config';

let memoryByok: ByokConfig = {
  geminiApiKey: '',
  githubToken: '',
  deepThinking: false,
};

export function getByokConfig(): ByokConfig {
  if (typeof window !== 'undefined') {
    try {
      const stored =
        sessionStorage.getItem(BYOK_STORAGE_KEY) ||
        localStorage.getItem(BYOK_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        memoryByok = {
          geminiApiKey:
            typeof parsed.geminiApiKey === 'string'
              ? parsed.geminiApiKey
              : memoryByok.geminiApiKey,
          githubToken:
            typeof parsed.githubToken === 'string'
              ? parsed.githubToken
              : memoryByok.githubToken,
          deepThinking: Boolean(parsed.deepThinking),
        };
      }
    } catch {
      // Safe fallback if storage quota exceeded or disabled in private mode
    }
  }
  return { ...memoryByok };
}

export function setByokConfig(cfg: Partial<ByokConfig>): ByokConfig {
  memoryByok = {
    ...memoryByok,
    ...cfg,
  };
  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(memoryByok);
      sessionStorage.setItem(BYOK_STORAGE_KEY, serialized);
      localStorage.setItem(BYOK_STORAGE_KEY, serialized);
    } catch {
      // Storage write error ignored
    }
  }
  return { ...memoryByok };
}

// =============================================================================
// Base URL and URL Resolution
// =============================================================================

export function getBackendBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://localhost:4000';
}

export function getWebSocketBaseUrl(): string {
  const httpUrl = getBackendBaseUrl();
  return httpUrl
    .replace(/^http:\/\//i, 'ws://')
    .replace(/^https:\/\//i, 'wss://');
}

export function resolveArtifactUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  const cleanPath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  return `${getBackendBaseUrl()}/${cleanPath}`;
}

// =============================================================================
// Error Handling & HTTP Helpers
// =============================================================================

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function getAuthHeaders(): Record<string, string> {
  const byok = getByokConfig();
  const headers: Record<string, string> = {};
  if (byok.geminiApiKey?.trim()) {
    headers['x-gemini-api-key'] = byok.geminiApiKey.trim();
  }
  if (byok.githubToken?.trim()) {
    headers['x-github-token'] = byok.githubToken.trim();
  }
  if (byok.deepThinking) {
    headers['x-deep-thinking'] = 'true';
  }
  return headers;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const base = getBackendBaseUrl();
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...getAuthHeaders(),
  };

  if (options.body && typeof options.body === 'string') {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const mergedHeaders = {
    ...defaultHeaders,
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(url, {
    ...options,
    headers: mergedHeaders,
  });

  if (!response.ok) {
    let errorMessage = `API request failed with status ${response.status} (${response.statusText})`;
    let details: unknown = undefined;

    try {
      const errJson = await response.json();
      details = errJson;
      if (errJson?.error && typeof errJson.error === 'string') {
        errorMessage = errJson.error;
      } else if (errJson?.message && typeof errJson.message === 'string') {
        errorMessage = errJson.message;
      }
    } catch {
      const errText = await response.text().catch(() => '');
      if (errText.trim()) {
        errorMessage = errText.trim();
      }
    }

    throw new ApiError(errorMessage, response.status, details);
  }

  return (await response.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  return requestJson<T>(path, { method: 'GET' });
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// =============================================================================
// Showcase Types
// =============================================================================

export interface ShowcaseRepoSummary {
  repoId: string;
  slug: string;
  title: string;
  subtitle: string;
  badge: string;
  stars: number;
  language: string;
  architecturePattern: string;
  nodeCount: number;
  tokenCount: number;
}

// =============================================================================
// Core API Methods
// =============================================================================

/**
 * Checks backend health, Gemini model status, and cache statistics.
 */
export async function fetchHealth(): Promise<BackendHealthStatus | null> {
  try {
    const base = getBackendBaseUrl();
    const res = await fetch(`${base}/api/health`, {
      headers: {
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
    });
    if (!res.ok) {
      // Fallback for non-prefixed health route
      const fallback = await fetch(`${base}/health`, {
        headers: { Accept: 'application/json', ...getAuthHeaders() },
      });
      if (!fallback.ok) return null;
      return (await fallback.json()) as BackendHealthStatus;
    }
    return (await res.json()) as BackendHealthStatus;
  } catch {
    return null;
  }
}

/**
 * Fetches summaries of all pre-cached showcase repositories.
 */
export async function fetchShowcaseList(): Promise<ShowcaseRepoSummary[]> {
  return getJson<ShowcaseRepoSummary[]>('/api/showcase');
}

/**
 * Fetches the complete VisualAtlasBlueprint for a showcase repository.
 */
export async function fetchShowcaseBlueprint(
  slug: string
): Promise<VisualAtlasBlueprint> {
  return getJson<VisualAtlasBlueprint>(
    `/api/showcase/${encodeURIComponent(slug)}`
  );
}

/**
 * Ingests and analyzes a GitHub repository URL or slug.
 */
export async function analyzeRepo(
  repoUrl: string,
  options?: { forceRefresh?: boolean; skipAi?: boolean }
): Promise<VisualAtlasBlueprint> {
  return postJson<VisualAtlasBlueprint>('/api/analyze', {
    repoUrl,
    forceRefresh: options?.forceRefresh,
    skipAi: options?.skipAi,
  });
}

/**
 * Fetches an existing repository's VisualAtlasBlueprint by repoId.
 */
export async function fetchRepoBlueprint(
  repoId: string
): Promise<VisualAtlasBlueprint> {
  return getJson<VisualAtlasBlueprint>(`/api/repo/${encodeURIComponent(repoId)}`);
}

/**
 * Subscribes to pipeline progress events via Server-Sent Events (SSE).
 * Returns an unsubscribe teardown function.
 */
export function subscribeRepoEvents(
  repoId: string,
  onEvent: (ev: PipelineProgressEvent) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const base = getBackendBaseUrl();
  const url = `${base}/api/repo/${encodeURIComponent(repoId)}/events`;
  const eventSource = new EventSource(url);

  const handleMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as PipelineProgressEvent;
      onEvent(data);
    } catch (err) {
      console.error('[subscribeRepoEvents] Failed to parse progress event:', err);
    }
  };

  eventSource.onmessage = handleMessage;
  eventSource.addEventListener('progress', handleMessage);
  eventSource.addEventListener('ready', handleMessage);
  eventSource.addEventListener('error', (event) => {
    if (eventSource.readyState === EventSource.CLOSED) {
      return;
    }
    const customEvent = event as MessageEvent;
    if (customEvent && customEvent.data) {
      try {
        const data = JSON.parse(customEvent.data) as PipelineProgressEvent;
        onEvent(data);
      } catch {
        // Ignored
      }
    }
  });

  return () => {
    eventSource.close();
  };
}

/**
 * Explains a visual lasso selection on the canvas using multimodal reasoning.
 */
export async function postCircleExplain(
  req: CircleExplainRequest
): Promise<CircleExplainResponse> {
  return postJson<CircleExplainResponse>('/api/circle-explain', req);
}

/**
 * Triggers a Decision-1 X-Ray architectural health analysis.
 */
export async function postRunXRay(repoId: string): Promise<XRayMatrixReport> {
  return postJson<XRayMatrixReport>('/api/xray', { repoId });
}

/**
 * Modifies an existing Mermaid diagram spec with natural language instructions.
 */
export async function postModifyDiagram(
  repoId: string,
  diagramId: string,
  instruction: string
): Promise<MermaidDiagramSpec> {
  return postJson<MermaidDiagramSpec>('/api/diagrams/modify', {
    repoId,
    diagramId,
    instruction,
  });
}

/**
 * Generates interactive Mermaid diagram specifications for a given kind.
 */
export async function postGenerateDiagram(
  repoId: string,
  kind: 'architecture' | 'sequence' | 'class'
): Promise<MermaidDiagramSpec[]> {
  return postJson<MermaidDiagramSpec[]>('/api/diagrams/generate', {
    repoId,
    kind,
  });
}

/**
 * Regenerates execution flows and codemap tour stops.
 */
export async function postRegenerateFlows(
  repoId: string
): Promise<{ flows: ExecutionFlow[]; codemapTour: CodemapTourStop[] }> {
  return postJson<{ flows: ExecutionFlow[]; codemapTour: CodemapTourStop[] }>(
    '/api/flows/regenerate',
    { repoId }
  );
}

/**
 * Compiles a context digest for LLM ingestion with specified filter options.
 */
export async function postCompileDigest(
  repoId: string,
  options?: Partial<DigestFilterOptions>
): Promise<CompiledDigest> {
  return postJson<CompiledDigest>('/api/digest/compile', {
    repoId,
    options,
  });
}

/**
 * Uses Gemini to translate a natural language prompt into optimal digest filter options.
 */
export async function postSmartFilterDigest(
  repoId: string,
  prompt: string
): Promise<{ options: Partial<DigestFilterOptions>; digest: CompiledDigest }> {
  return postJson<{
    options: Partial<DigestFilterOptions>;
    digest: CompiledDigest;
  }>('/api/digest/smart-filter', {
    repoId,
    prompt,
  });
}

/**
 * Streams conversational reasoning from the Oracle agent with citations and token deltas.
 */
export async function streamOracleChat(params: {
  repoId: string;
  message: string;
  previousInteractionId?: string;
  imageBase64?: string;
  imageMimeType?: string;
  deepMode?: boolean;
  onDelta: (t: string) => void;
}): Promise<{
  fullText: string;
  interactionId?: string;
  citations: OracleCitation[];
  model: string;
}> {
  const base = getBackendBaseUrl();
  const url = `${base}/api/oracle/chat`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream, application/json',
    ...getAuthHeaders(),
  };

  if (params.deepMode !== undefined) {
    headers['x-deep-thinking'] = params.deepMode ? 'true' : 'false';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      repoId: params.repoId,
      message: params.message,
      previousInteractionId: params.previousInteractionId,
      imageBase64: params.imageBase64,
      imageMimeType: params.imageMimeType,
      deepMode: params.deepMode,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    let errorMessage = `Oracle chat request failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed?.error) errorMessage = parsed.error;
      else if (parsed?.message) errorMessage = parsed.message;
    } catch {
      if (errorText.trim()) errorMessage = errorText.trim();
    }
    throw new ApiError(errorMessage, response.status);
  }

  let fullText = '';
  let interactionId = params.previousInteractionId;
  let citations: OracleCitation[] = [];
  let model = 'gemini-4-carbon';

  const contentType = response.headers.get('content-type') || '';

  // Non-streaming JSON fallback
  if (
    contentType.includes('application/json') &&
    !contentType.includes('event-stream')
  ) {
    const data = await response.json();
    fullText = data.fullText || data.text || data.message || '';
    if (fullText) {
      params.onDelta(fullText);
    }
    return {
      fullText,
      interactionId: data.interactionId || interactionId,
      citations: Array.isArray(data.citations) ? data.citations : [],
      model: data.model || model,
    };
  }

  if (!response.body) {
    return { fullText, interactionId, citations, model };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data:')) {
          const rawData = trimmed.slice(5).trim();
          if (rawData === '[DONE]') continue;

          try {
            const parsed = JSON.parse(rawData);
            if (parsed.delta) {
              fullText += parsed.delta;
              params.onDelta(parsed.delta);
            } else if (parsed.text && !fullText) {
              fullText += parsed.text;
              params.onDelta(parsed.text);
            }
            if (parsed.interactionId) interactionId = parsed.interactionId;
            if (Array.isArray(parsed.citations)) citations = parsed.citations;
            if (parsed.model) model = parsed.model;
          } catch {
            fullText += rawData;
            params.onDelta(rawData);
          }
        } else {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.delta) {
              fullText += parsed.delta;
              params.onDelta(parsed.delta);
            }
            if (parsed.interactionId) interactionId = parsed.interactionId;
            if (Array.isArray(parsed.citations)) citations = parsed.citations;
            if (parsed.model) model = parsed.model;
          } catch {
            fullText += trimmed;
            params.onDelta(trimmed);
          }
        }
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const rawData = trimmed.slice(5).trim();
        if (rawData !== '[DONE]') {
          try {
            const parsed = JSON.parse(rawData);
            if (parsed.delta) {
              fullText += parsed.delta;
              params.onDelta(parsed.delta);
            }
            if (parsed.interactionId) interactionId = parsed.interactionId;
            if (Array.isArray(parsed.citations)) citations = parsed.citations;
            if (parsed.model) model = parsed.model;
          } catch {
            fullText += rawData;
            params.onDelta(rawData);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    fullText,
    interactionId,
    citations,
    model,
  };
}

/**
 * Performs multimodal visual search across code symbols, diagrams, and files.
 */
export async function postVisualSearch(params: {
  repoId: string;
  queryText?: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<{ matches: VisualSearchMatch[]; model: string }> {
  return postJson<{ matches: VisualSearchMatch[]; model: string }>(
    '/api/search/visual',
    params
  );
}

/**
 * Transcribes audio via Gemini audio transcription model.
 */
export async function postTranscribeAudio(
  audioBase64: string,
  mimeType: string
): Promise<{ transcript: string; model: string }> {
  return postJson<{ transcript: string; model: string }>(
    '/api/media/transcribe',
    {
      audioBase64,
      mimeType,
    }
  );
}

/**
 * Generates an architectural blueprint poster artifact in the chosen style.
 */
export async function postGeneratePoster(
  repoId: string,
  style: MediaPosterArtifact['style']
): Promise<MediaPosterArtifact> {
  return postJson<MediaPosterArtifact>('/api/media/poster', {
    repoId,
    style,
  });
}

/**
 * Generates a two-speaker podcast-style audio tour artifact.
 */
export async function postGenerateAudioTour(
  repoId: string
): Promise<AudioTourArtifact> {
  return postJson<AudioTourArtifact>('/api/media/audio-tour', {
    repoId,
  });
}

/**
 * Generates an animated video reel artifact summarizing the codebase.
 */
export async function postGenerateVideoReel(
  repoId: string,
  firstFrameBase64?: string
): Promise<VideoReelArtifact> {
  return postJson<VideoReelArtifact>('/api/media/video-reel', {
    repoId,
    firstFrameBase64,
  });
}

/**
 * Runs autonomous forensics investigation using managed agent or deep research mode.
 */
export async function postRunForensics(
  repoId: string,
  mode: 'managed_agent' | 'deep_research'
): Promise<ForensicsReport> {
  return postJson<ForensicsReport>('/api/forensics', {
    repoId,
    mode,
  });
}
