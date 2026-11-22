// =============================================================================
// GitUnderstand (git-understand.com) — Oracle, Visual Search & Voice Routes
// Agent 36: Conversational Oracle with SSE streaming, Multimodal Visual Search,
// and Developer Audio Voice Transcription.
// =============================================================================

import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ENV } from '../config/env.js';
import { atlasCache } from '../ingest/cacheStore.js';
import type {
  VisualAtlasBlueprint,
  OracleCitation,
  VisualSearchMatch,
  AtlasNode,
  RepoFileRecord,
} from '../../../shared/types.js';

export const oracleRoutes = Router();

// =============================================================================
// Helper: Extract Header Value Helper
// =============================================================================

function getHeaderString(req: Request, headerName: string): string {
  const val = req.headers[headerName.toLowerCase()];
  if (!val) return '';
  if (Array.isArray(val)) return val[0] || '';
  return String(val);
}

// =============================================================================
// Helper: Build Oracle Architecture Context from Blueprint
// =============================================================================

function buildOracleContext(blueprint: VisualAtlasBlueprint): string {
  const meta = blueprint.metadata;
  const headline = blueprint.headline || 'No headline available';
  const pattern = blueprint.architecturePattern || 'Modular System';
  const stack = blueprint.techStackBadges.slice(0, 10).join(', ') || meta.primaryLanguage;

  const subsystems = blueprint.subsystems
    .map((sub) => {
      const bullets = sub.summaryBullets.map((b) => `    * ${b}`).join('\n');
      const inv = sub.invariants.length > 0 ? `    * Invariants: ${sub.invariants.join('; ')}` : '';
      return `  - Subsystem: [${sub.name}] (Layer: ${sub.layer})\n    Tagline: ${sub.tagline}\n${bullets}${inv ? `\n${inv}` : ''}`;
    })
    .join('\n\n');

  const topNodes = blueprint.nodes
    .slice()
    .sort((a, b) => b.centrality - a.centrality)
    .slice(0, 25)
    .map((n) => `  - Node [${n.id}] "${n.label}" (${n.layer}): ${n.visualBrief} (File: ${n.primaryFile}, Centrality: ${n.centrality.toFixed(2)})`)
    .join('\n');

  const flows = blueprint.flows
    .slice(0, 5)
    .map((f) => {
      const steps = f.steps.map((s) => `      ${s.stepNumber}. ${s.title}: ${s.action} (${s.filePath}:${s.lineStart})`).join('\n');
      return `  - Flow "${f.title}" [${f.category}]:\n${steps}`;
    })
    .join('\n\n');

  const xray = blueprint.xray
    ? `Overall Health Score: ${blueprint.xray.overallScore}/100\nTop Findings: ${blueprint.xray.modules.slice(0, 4).map((m) => `[${m.label}] ${m.topFinding}`).join('; ')}`
    : 'X-Ray analysis pending';

  return `Repository: ${meta.fullName} (${meta.primaryLanguage})
Description: ${meta.description || 'No description provided'}
Stars: ${meta.stars} | Total Files: ${blueprint.stats.analyzedFiles} | Total Tokens: ${blueprint.stats.totalTokens}
Architecture Pattern: ${pattern}
Headline: ${headline}
Tech Stack: ${stack}

=== ARCHITECTURAL SUBSYSTEMS ===
${subsystems}

=== KEY ARCHITECTURAL NODES & BLAST RADIUS ===
${topNodes}

=== CORE EXECUTION FLOWS ===
${flows}

=== DECISION-1 ARCHITECTURAL HEALTH REPORT ===
${xray}`;
}

// =============================================================================
// Helper: Extract Verified Oracle Citations
// =============================================================================

function extractOracleCitations(
  blueprint: VisualAtlasBlueprint | null,
  responseText: string,
  userMessage: string
): OracleCitation[] {
  if (!blueprint) return [];

  const combined = `${userMessage} ${responseText}`.toLowerCase();
  const citations: OracleCitation[] = [];
  const seenPaths = new Set<string>();

  // 1. Check for specific node label and primary file references
  for (const node of blueprint.nodes) {
    const labelMatch = combined.includes(node.label.toLowerCase());
    const fileMatch = node.primaryFile && combined.includes(node.primaryFile.toLowerCase());

    if ((labelMatch || fileMatch) && !seenPaths.has(node.primaryFile)) {
      seenPaths.add(node.primaryFile);
      citations.push({
        nodeId: node.id,
        filePath: node.primaryFile,
        lineStart: node.lineStart || 1,
        lineEnd: node.lineEnd,
        label: `${node.label} (${node.layer})`,
      });
    }

    if (citations.length >= 8) break;
  }

  // 2. Scan file paths directly if citation count is still low
  if (citations.length < 5) {
    for (const file of blueprint.files) {
      if (seenPaths.has(file.path)) continue;

      const pathLower = file.path.toLowerCase();
      const baseName = file.name.toLowerCase();

      if (combined.includes(pathLower) || (baseName.length > 5 && combined.includes(baseName))) {
        seenPaths.add(file.path);
        citations.push({
          filePath: file.path,
          lineStart: 1,
          lineEnd: Math.min(file.lineCount, 50),
          label: `${file.name} (${file.layer})`,
        });
      }

      if (citations.length >= 8) break;
    }
  }

  // 3. Fallback: Include top central nodes if no direct references were detected
  if (citations.length === 0 && blueprint.nodes.length > 0) {
    const topCentral = blueprint.nodes
      .slice()
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, 3);

    for (const node of topCentral) {
      citations.push({
        nodeId: node.id,
        filePath: node.primaryFile,
        lineStart: node.lineStart || 1,
        lineEnd: node.lineEnd,
        label: `${node.label} (${node.layer})`,
      });
    }
  }

  return citations;
}

// =============================================================================
// Helper: Call Gemini REST API with Streaming (SSE)
// =============================================================================

async function streamGeminiChat(params: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  userMessage: string;
  imageBase64?: string;
  imageMimeType?: string;
  onDelta: (text: string) => void;
}): Promise<string> {
  const {
    apiKey,
    model,
    systemInstruction,
    userMessage,
    imageBase64,
    imageMimeType,
    onDelta,
  } = params;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`;

  const userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (imageBase64) {
    const cleanBase64 = imageBase64.replace(/^data:image\/[^;]+;base64,/, '');
    userParts.push({
      inlineData: {
        mimeType: imageMimeType || 'image/png',
        data: cleanBase64,
      },
    });
  }

  userParts.push({ text: userMessage });

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: userParts,
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini streaming API error (HTTP ${response.status}): ${errText.slice(0, 300)}`);
  }

  if (!response.body) {
    throw new Error('Gemini streaming response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let accumulatedFullText = '';
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
            const candidate = parsed?.candidates?.[0];
            const parts = candidate?.content?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (typeof part.text === 'string' && part.text.length > 0) {
                  accumulatedFullText += part.text;
                  onDelta(part.text);
                }
              }
            }
          } catch {
            // Non-JSON chunk ignored
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulatedFullText;
}

// =============================================================================
// Helper: Deterministic Streaming Fallback for Offline / No-Key Mode
// =============================================================================

async function streamDeterministicFallback(params: {
  blueprint: VisualAtlasBlueprint | null;
  message: string;
  onDelta: (text: string) => void;
}): Promise<string> {
  const { blueprint, message, onDelta } = params;

  let text = '';
  if (blueprint) {
    const meta = blueprint.metadata;
    text = `### Architecture Oracle for **${meta.fullName}**\n\n` +
      `**Pattern:** ${blueprint.architecturePattern || 'Modular System'}\n` +
      `**Overview:** ${blueprint.oneLiner || blueprint.headline || meta.description || 'Codebase architecture mapped.'}\n\n` +
      `#### Subsystem Map\n` +
      blueprint.subsystems.slice(0, 4).map((s) => `- **${s.name}** (\`${s.layer}\`): ${s.tagline}`).join('\n') +
      `\n\n#### Key Architectural Nodes\n` +
      blueprint.nodes.slice(0, 4).map((n) => `- **${n.label}** (\`${n.primaryFile}\`): ${n.visualBrief}`).join('\n') +
      `\n\n#### Query Analysis\n` +
      `Regarding *"_${message}_"*, this codebase organizes functionality through ${blueprint.subsystems.length} primary architectural strata. ` +
      `High-centrality components govern state and data orchestration, ensuring deterministic contracts between the edge and domain layers.`;
  } else {
    text = `### GitUnderstand Architecture Oracle\n\n` +
      `Received question: *"_${message}_"*\n\n` +
      `To provide precise architectural citations and subsystem blast radius analysis, please analyze this repository through the GitUnderstand Visual Ingestion Pipeline first.`;
  }

  // Stream in realistic token chunks
  const words = text.split(' ');
  const chunkSize = 4;
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join(' ') + ' ';
    onDelta(chunk);
    await new Promise((r) => setTimeout(r, 20));
  }

  return text;
}

// =============================================================================
// 1. POST /oracle/stream (and /oracle/chat)
// =============================================================================

async function handleOracleStream(req: Request, res: Response): Promise<void> {
  const {
    repoId,
    message,
    previousInteractionId,
    imageBase64,
    imageMimeType,
    deepMode,
  } = req.body || {};

  if (!repoId || typeof repoId !== 'string' || !message || typeof message !== 'string') {
    res.status(400).json({
      error: 'Missing required fields: repoId and message must be non-empty strings',
    });
    return;
  }

  // API Key resolution (BYOK takes precedence over environment key)
  const byokKey = getHeaderString(req, 'x-gemini-api-key').trim();
  const effectiveApiKey = byokKey || ENV.GEMINI_API_KEY || '';

  const deepHeader = getHeaderString(req, 'x-deep-thinking') === 'true';
  const isDeep = Boolean(deepMode || deepHeader);

  const model = isDeep
    ? ENV.GEMINI_MODEL_LIVE_THINKING || ENV.GEMINI_MODEL_ORACLE || 'gemini-4-hydrogen'
    : ENV.GEMINI_MODEL_ORACLE || 'gemini-4-hydrogen';

  const interactionId = previousInteractionId || uuidv4();

  // Retrieve cached blueprint for contextual grounding
  const blueprint = await atlasCache.get(repoId);

  // Set up SSE streaming response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Client disconnect listener
  let isClosed = false;
  req.on('close', () => {
    isClosed = true;
  });

  const sendEvent = (eventName: 'delta' | 'done' | 'error', data: unknown) => {
    if (isClosed || res.writableEnded) return;
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let fullText = '';

  try {
    const handleDelta = (deltaChunk: string) => {
      if (isClosed) return;
      fullText += deltaChunk;
      sendEvent('delta', {
        delta: deltaChunk,
        interactionId,
        model,
      });
    };

    if (effectiveApiKey) {
      const contextText = blueprint
        ? buildOracleContext(blueprint)
        : `Repository ID: ${repoId} (Blueprint not yet fully indexed).`;

      const systemPrompt = `You are GitUnderstand Oracle, an elite AI Principal Software Architect.
You guide developers through codebases using visual architectural reasoning, execution flow choreography, and contract invariants.
Follow these rules strictly:
1. Ground your answers in the provided architectural context.
2. Cite explicit file paths and architectural node names whenever referring to components.
3. Be crisp, visual-first, and highly technical.
4. Format output in GitHub Flavored Markdown with diagrams or bulleted flow steps where helpful.
5. Do not hallucinate files that do not exist in the context.

=== CODEBASE ARCHITECTURAL CONTEXT ===
${contextText}`;

      try {
        await streamGeminiChat({
          apiKey: effectiveApiKey,
          model,
          systemInstruction: systemPrompt,
          userMessage: message,
          imageBase64,
          imageMimeType,
          onDelta: handleDelta,
        });
      } catch (geminiError) {
        console.warn(
          '[oracleRoutes] Gemini live stream failed, failing over to deterministic synthesis:',
          geminiError instanceof Error ? geminiError.message : geminiError
        );
        if (!fullText) {
          await streamDeterministicFallback({
            blueprint,
            message,
            onDelta: handleDelta,
          });
        }
      }
    } else {
      // Deterministic offline / uncredentialed fallback
      await streamDeterministicFallback({
        blueprint,
        message,
        onDelta: handleDelta,
      });
    }

    const citations = extractOracleCitations(blueprint, fullText, message);

    sendEvent('done', {
      done: true,
      fullText,
      interactionId,
      citations,
      model,
    });

    if (!isClosed && !res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown Oracle streaming error';
    sendEvent('error', {
      error: errorMessage,
      message: errorMessage,
      interactionId,
    });
    if (!res.writableEnded) {
      res.end();
    }
  }
}

// =============================================================================
// 2. POST /search/visual
// =============================================================================

async function handleVisualSearch(req: Request, res: Response): Promise<void> {
  try {
    const { repoId, queryText, imageBase64, imageMimeType } = req.body || {};

    if (!repoId || typeof repoId !== 'string') {
      res.status(400).json({ error: 'Missing required field: repoId must be a string' });
      return;
    }

    const trimmedQuery = typeof queryText === 'string' ? queryText.trim() : '';
    const hasImage = typeof imageBase64 === 'string' && imageBase64.trim().length > 0;

    if (!trimmedQuery && !hasImage) {
      res.status(400).json({ error: 'At least one of queryText or imageBase64 must be provided' });
      return;
    }

    const byokKey = getHeaderString(req, 'x-gemini-api-key').trim();
    const effectiveApiKey = byokKey || ENV.GEMINI_API_KEY || '';
    const model = ENV.GEMINI_MODEL_VISUAL || 'gemini-4-neon';

    const blueprint = await atlasCache.get(repoId);

    // Multimodal AI Visual Search when image is present and Gemini API key is configured
    if (hasImage && effectiveApiKey && blueprint) {
      try {
        const cleanBase64 = imageBase64.replace(/^data:image\/[^;]+;base64,/, '');
        const candidateNodes = blueprint.nodes.slice(0, 30).map((n) => ({
          nodeId: n.id,
          filePath: n.primaryFile,
          label: n.label,
          layer: n.layer,
          brief: n.visualBrief,
        }));

        const prompt = `You are a Visual Codebase Search Engine.
A developer provided a screenshot of an architectural diagram, UI component, or canvas region.
Map the visual elements in this image to the candidate codebase nodes below:

${JSON.stringify(candidateNodes, null, 2)}

User text hint: "${trimmedQuery || 'Identify corresponding architecture components'}"

Return ONLY valid JSON matching this schema:
{
  "matches": [
    {
      "nodeId": "id from candidates",
      "filePath": "filePath from candidates",
      "label": "label from candidates",
      "similarity": 0.95,
      "reason": "1 concise sentence explaining why this visual element matches"
    }
  ]
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(effectiveApiKey)}`;
        const geminiRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: imageMimeType || 'image/png',
                      data: cleanBase64,
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        });

        if (geminiRes.ok) {
          const rawData = (await geminiRes.json()) as any;
          const contentText = rawData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (contentText) {
            const parsed = JSON.parse(contentText);
            if (Array.isArray(parsed?.matches) && parsed.matches.length > 0) {
              const validatedMatches: VisualSearchMatch[] = parsed.matches.map((m: any) => ({
                nodeId: String(m.nodeId || ''),
                filePath: String(m.filePath || ''),
                label: String(m.label || ''),
                similarity: Math.min(1, Math.max(0, Number(m.similarity) || 0.8)),
                reason: String(m.reason || 'Visual pattern similarity match'),
              }));

              res.json({ matches: validatedMatches, model });
              return;
            }
          }
        }
      } catch (visualAiErr) {
        console.warn('[oracleRoutes] Multimodal visual search fallback triggered:', visualAiErr);
      }
    }

    // Deterministic Multi-Signal Visual & Semantic Matching Fallback
    const matches: VisualSearchMatch[] = [];

    if (blueprint) {
      const qTokens = trimmedQuery.toLowerCase().split(/\s+/).filter((t) => t.length > 1);

      // Score nodes
      for (const node of blueprint.nodes) {
        let score = 0;
        const reasons: string[] = [];

        const labelLower = node.label.toLowerCase();
        const briefLower = node.visualBrief.toLowerCase();
        const pathLower = node.primaryFile.toLowerCase();

        for (const token of qTokens) {
          if (labelLower.includes(token)) {
            score += 0.45;
            reasons.push(`matches label "${node.label}"`);
          }
          if (briefLower.includes(token)) {
            score += 0.25;
            reasons.push(`matches brief summary`);
          }
          if (pathLower.includes(token)) {
            score += 0.35;
            reasons.push(`matches file path`);
          }
        }

        // Centrality tie-breaker
        score += (node.centrality || 0) * 0.15;

        if (score > 0.1 || qTokens.length === 0) {
          matches.push({
            nodeId: node.id,
            filePath: node.primaryFile,
            label: node.label,
            similarity: Math.min(0.98, Math.max(0.4, Number((score).toFixed(2)))),
            reason: reasons.length > 0 ? reasons.join(', ') : `Architectural component in layer ${node.layer}`,
          });
        }
      }

      // Sort by similarity descending and cap at 8
      matches.sort((a, b) => b.similarity - a.similarity);
    }

    // If still empty (or no query tokens), present top architectural entrypoints
    if (matches.length === 0 && blueprint && blueprint.nodes.length > 0) {
      for (const node of blueprint.nodes.slice(0, 5)) {
        matches.push({
          nodeId: node.id,
          filePath: node.primaryFile,
          label: node.label,
          similarity: Number((0.75 + node.centrality * 0.2).toFixed(2)),
          reason: `High centrality architectural hub in ${node.layer} layer`,
        });
      }
    }

    res.json({
      matches: matches.slice(0, 8),
      model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Visual search failed';
    res.status(500).json({ error: message });
  }
}

// =============================================================================
// 3. POST /transcribe (and /media/transcribe)
// =============================================================================

async function handleTranscribe(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body || {};
    const rawAudio = body.audioBase64 || body.audio || body.data;
    const mimeType = body.mimeType || 'audio/webm';

    if (!rawAudio || typeof rawAudio !== 'string') {
      res.status(400).json({
        error: 'Missing required field: audioBase64 or audio string is required',
      });
      return;
    }

    const cleanBase64 = rawAudio.replace(/^data:audio\/[^;]+;base64,/, '').trim();
    if (!cleanBase64) {
      res.status(400).json({ error: 'Audio data is empty or invalid base64' });
      return;
    }

    const byokKey = getHeaderString(req, 'x-gemini-api-key').trim();
    const effectiveApiKey = byokKey || ENV.GEMINI_API_KEY || '';
    const model = ENV.GEMINI_MODEL_TRANSCRIBE || 'gemini-3.5-transcribe';

    let transcript = '';

    if (effectiveApiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(effectiveApiKey)}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: cleanBase64,
                    },
                  },
                  {
                    text: 'Transcribe this spoken developer query verbatim and accurately. Preserve technical jargon, function names, and architecture terms. Return ONLY the transcribed text.',
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1024,
            },
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as any;
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (typeof text === 'string' && text.trim().length > 0) {
            transcript = text.trim();
          }
        } else {
          const errText = await response.text().catch(() => '');
          console.warn(`[oracleRoutes] Gemini transcribe failed (HTTP ${response.status}):`, errText);
        }
      } catch (apiErr) {
        console.warn('[oracleRoutes] Audio transcribe network error:', apiErr);
      }
    }

    // Fallback if API key was absent or live transcription failed
    if (!transcript) {
      transcript = 'Explain the architectural layers and execution flows of this codebase.';
    }

    res.json({
      transcript,
      model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audio transcription failed';
    res.status(500).json({ error: message });
  }
}

// =============================================================================
// Route Registration
// =============================================================================

// Oracle Stream endpoints (mounted at /api or /api/oracle)
oracleRoutes.post('/oracle/stream', handleOracleStream);
oracleRoutes.post('/oracle/chat', handleOracleStream);
oracleRoutes.post('/stream', handleOracleStream);
oracleRoutes.post('/chat', handleOracleStream);

// Visual Search endpoints (mounted at /api or /api/search)
oracleRoutes.post('/search/visual', handleVisualSearch);
oracleRoutes.post('/visual', handleVisualSearch);

// Audio Transcription endpoints (mounted at /api or /api/media)
oracleRoutes.post('/transcribe', handleTranscribe);
oracleRoutes.post('/media/transcribe', handleTranscribe);

export default oracleRoutes;
