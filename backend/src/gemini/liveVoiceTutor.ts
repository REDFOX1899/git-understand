// =============================================================================
// GitUnderstand (git-understand.com) — Gemini 3.8 Live Voice Tutor WebSocket
// Sub-second bidirectional voice & visual tutoring over WebSockets using Gemini 3.8 Live
// =============================================================================

import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  Behavior,
  Modality,
  Type,
  type FunctionDeclaration,
  type LiveServerMessage,
} from '@google/genai';
import { ENV } from '../config/env.js';
import { resolveLiveApiKey } from './clientPool.js';
import { atlasCache } from '../ingest/cacheStore.js';
import type { LiveVoiceToolAction } from '../../../shared/types.js';

/**
 * 5 Non-blocking tool declarations for Gemini 3.8 Live to control the visual studio canvas.
 */
const focusNodeDeclaration: FunctionDeclaration = {
  name: 'focus_node',
  description:
    'Focuses or highlights a specific architectural node or primary file module on the interactive visual canvas.',
  behavior: Behavior.NON_BLOCKING,
  parameters: {
    type: Type.OBJECT,
    properties: {
      nodeId: {
        type: Type.STRING,
        description: 'The unique ID or primary file path of the architectural node to focus.',
      },
      reason: {
        type: Type.STRING,
        description: 'Crisp reason or visual hook explaining why this node is being highlighted.',
      },
    },
    required: ['nodeId'],
  },
};

const traceExecutionFlowDeclaration: FunctionDeclaration = {
  name: 'trace_execution_flow',
  description:
    'Traces and animates an execution flow path across nodes and edges on the interactive visual canvas.',
  behavior: Behavior.NON_BLOCKING,
  parameters: {
    type: Type.OBJECT,
    properties: {
      flowId: {
        type: Type.STRING,
        description:
          'Predefined flow ID or category (e.g. request, ingestion, ai_pipeline, auth, state, build).',
      },
      startNodeId: {
        type: Type.STRING,
        description: 'Source node ID to begin the execution trace from.',
      },
      endNodeId: {
        type: Type.STRING,
        description: 'Destination node ID where the execution flow completes.',
      },
      stepDescription: {
        type: Type.STRING,
        description: 'Narrative summary of what this execution flow or step achieves.',
      },
    },
  },
};

const toggleXrayOverlayDeclaration: FunctionDeclaration = {
  name: 'toggle_xray_overlay',
  description:
    'Toggles or activates the Decision-1 X-Ray health heatmap overlay on the visual canvas for a specific engineering pillar.',
  behavior: Behavior.NON_BLOCKING,
  parameters: {
    type: Type.OBJECT,
    properties: {
      pillar: {
        type: Type.STRING,
        description:
          'The X-Ray pillar to visualize: modularity, security, resilience, testability, api_clarity, concurrency, scalability, hygiene, or onboarding.',
      },
      enabled: {
        type: Type.BOOLEAN,
        description: 'Whether the X-Ray heatmap overlay is enabled (default true).',
      },
    },
  },
};

const sliceDigestContextDeclaration: FunctionDeclaration = {
  name: 'slice_digest_context',
  description:
    'Slices and extracts markdown digest context for selected files or subsystems to inspect code contracts.',
  behavior: Behavior.NON_BLOCKING,
  parameters: {
    type: Type.OBJECT,
    properties: {
      paths: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
        },
        description: 'List of file or directory paths to slice into active context.',
      },
      maxTokens: {
        type: Type.INTEGER,
        description: 'Maximum token budget for the slice (default 8000).',
      },
    },
    required: ['paths'],
  },
};

const switchLensDeclaration: FunctionDeclaration = {
  name: 'switch_lens',
  description:
    'Switches the active visual studio lens to another architectural projection.',
  behavior: Behavior.NON_BLOCKING,
  parameters: {
    type: Type.OBJECT,
    properties: {
      lens: {
        type: Type.STRING,
        description:
          'Target visual lens: atlas, strata3d, flows, treemap, xray, mermaid, or media.',
      },
      reason: {
        type: Type.STRING,
        description: 'Brief architectural reason for switching lenses.',
      },
    },
    required: ['lens'],
  },
};

const LIVE_VOICE_TOOLS = [
  {
    functionDeclarations: [
      focusNodeDeclaration,
      traceExecutionFlowDeclaration,
      toggleXrayOverlayDeclaration,
      sliceDigestContextDeclaration,
      switchLensDeclaration,
    ],
  },
];

/**
 * Builds the visual-first system instruction for Gemini 3.8 Live Voice Tutor,
 * dynamically enriched with cached repository blueprint context if available.
 */
async function buildSystemInstruction(repoId?: string): Promise<string> {
  let blueprintContext = '';

  if (repoId) {
    try {
      const blueprint = await atlasCache.get(repoId);
      if (blueprint) {
        const topNodes = blueprint.nodes
          .slice(0, 16)
          .map((n) => `${n.id} (${n.label}: ${n.subtitle})`)
          .join(', ');

        const topSubsystems = blueprint.subsystems
          .slice(0, 8)
          .map((s) => `${s.name} (${s.layer}): [${s.nodeIds.slice(0, 4).join(', ')}]`)
          .join('; ');

        const topFlows = blueprint.flows
          .slice(0, 5)
          .map((f) => `${f.id} (${f.title}: trigger="${f.trigger}")`)
          .join(', ');

        blueprintContext = `

ACTIVE REPOSITORY BLUEPRINT CONTEXT:
- Repository: ${blueprint.metadata.fullName}
- Headline: ${blueprint.headline}
- Pattern: ${blueprint.architecturePattern}
- Subsystems: ${topSubsystems}
- Key Architecture Nodes: ${topNodes}
- Precomputed Flows: ${topFlows || 'None precomputed'}
- Analyzed Files: ${blueprint.stats.analyzedFiles} / ${blueprint.stats.totalFiles}
`;
      }
    } catch (err) {
      console.warn('[LiveVoiceTutor] Error fetching blueprint context for system instruction:', err);
    }
  }

  return `You are the GitUnderstand Live Voice Tutor — an elite, visual-first software architecture guide.

CORE PHILOSOPHY:
"No one reads code anymore — MORE VISUALS."
You converse with engineers over low-latency audio while simultaneously driving their visual studio canvas in real time.
The interactive canvas, 3D strata, animated flows, token treemap, Decision-1 X-Ray heatmap, Circle-to-Explain lasso, and multimodal stages are the hero. Raw source code is an on-demand secondary "Peek Source" drawer.

VOICE & BEHAVIOR GUIDELINES:
1. Speak concisely, conversationally, with high engineering precision. Keep spoken turns punchy (1-3 sentences) so the conversation flows naturally.
2. NEVER read raw code aloud. Describe data flow, module boundaries, architectural trade-offs, bottlenecks, and invariants.
3. As you speak, proactively call your non-blocking tools to visually ground the user:
   - Call focus_node(nodeId, reason) to illuminate modules on the canvas as you discuss them.
   - Call trace_execution_flow(flowId, startNodeId, endNodeId, stepDescription) when explaining request or data lifecycles.
   - Call toggle_xray_overlay(pillar, enabled) when analyzing code health, risk, or technical debt.
   - Call switch_lens(lens, reason) when switching perspectives (e.g. to 'strata3d' for layering, 'flows' for execution, 'xray' for health, 'treemap' for token density).
   - Call slice_digest_context(paths, maxTokens) when deep diving into specific contracts.
4. If the user asks a question, answer with direct clarity and highlight the corresponding canvas node immediately.${blueprintContext}`;
}

/**
 * Attaches the Gemini 3.8 Live Voice Tutor WebSocket upgrade listener to the Node.js HTTP server.
 * Handles incoming connection requests matching path '/ws/live-tutor'.
 *
 * @param server The Node.js HTTP server instance to hook upgrades onto.
 */
export function attachLiveVoiceUpgrade(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || 'localhost';
      const parsedUrl = new URL(request.url || '', `http://${host}`);

      if (parsedUrl.pathname === '/ws/live-tutor') {
        wss.handleUpgrade(request, socket, head, (clientWs) => {
          wss.emit('connection', clientWs, request);
        });
      }
    } catch (err) {
      console.error('[LiveVoiceTutor] Error during HTTP upgrade evaluation:', err);
      socket.destroy();
    }
  });

  wss.on('connection', async (clientWs: WebSocket, request) => {
    let host = 'localhost';
    if (request.headers && typeof request.headers.host === 'string') {
      host = request.headers.host;
    }

    const parsedUrl = new URL(request.url || '', `http://${host}`);
    let repoId = parsedUrl.searchParams.get('repoId') || '';
    let byokApiKey =
      parsedUrl.searchParams.get('byok') ||
      parsedUrl.searchParams.get('apiKey') ||
      undefined;

    let geminiSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isConnecting = false;
    let isClosed = false;

    // Buffer inputs while the Gemini 3.8 Live session establishes
    const pendingInputs: Array<() => void> = [];

    /**
     * Safely dispatch an action to the active Gemini Live session or buffer it if connecting.
     */
    const dispatchToSession = (action: (session: NonNullable<typeof geminiSession>) => void) => {
      if (isClosed) return;
      if (geminiSession) {
        try {
          action(geminiSession);
        } catch (err) {
          console.error('[LiveVoiceTutor] Failed to send input to Gemini session:', err);
        }
      } else if (isConnecting) {
        pendingInputs.push(() => {
          if (geminiSession && !isClosed) {
            try {
              action(geminiSession);
            } catch (err) {
              console.error('[LiveVoiceTutor] Failed to send buffered input to Gemini session:', err);
            }
          }
        });
      }
    };

    /**
     * Initializes the bidirectional Gemini 3.8 Live session.
     */
    const initGeminiLiveSession = async (targetRepoId: string, customByok?: string) => {
      if (geminiSession || isConnecting || isClosed) {
        return;
      }

      isConnecting = true;

      try {
        const apiKey = resolveLiveApiKey(customByok || byokApiKey);
        if (!apiKey) {
          throw new Error(
            'No Gemini API credentials configured. Set GEMINI_API_KEY in environment or provide Bring-Your-Own-Key (?byok=...).'
          );
        }

        const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
        const systemInstructionText = await buildSystemInstruction(targetRepoId);

        const session = await ai.live.connect({
          model: ENV.GEMINI_MODEL_LIVE || 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Puck',
                },
              },
            },
            systemInstruction: {
              parts: [{ text: systemInstructionText }],
            },
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            tools: LIVE_VOICE_TOOLS,
          },
          callbacks: {
            onopen: () => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: 'status',
                    status: 'connected',
                    model: ENV.GEMINI_MODEL_LIVE || 'gemini-3.8-live',
                  })
                );
              }
            },

            onmessage: (serverMessage: LiveServerMessage) => {
              if (clientWs.readyState !== WebSocket.OPEN) return;

              try {
                const serverContent = serverMessage.serverContent;

                // 1. Handle user interruption signal
                if (serverContent?.interrupted) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'interrupted',
                    })
                  );
                }

                // 2. Iterate all modelTurn.parts for audio chunks and text
                const modelTurn = serverContent?.modelTurn;
                if (modelTurn?.parts && Array.isArray(modelTurn.parts)) {
                  for (const part of modelTurn.parts) {
                    // Check for inline audio PCM data
                    const inlineData =
                      part.inlineData ||
                      (part as unknown as { inline_data?: { data?: string; mimeType?: string } })
                        .inline_data;

                    if (inlineData?.data) {
                      clientWs.send(
                        JSON.stringify({
                          type: 'audio',
                          pcmBase64: inlineData.data,
                          mimeType: inlineData.mimeType || 'audio/pcm;rate=24000',
                        })
                      );
                    }

                    // Check for textual parts
                    if (part.text && part.text.trim()) {
                      clientWs.send(
                        JSON.stringify({
                          type: 'transcript',
                          role: 'model',
                          text: part.text,
                        })
                      );
                    }
                  }
                }

                // 3. Output speech-to-text transcription
                if (serverContent?.outputTranscription?.text) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'transcript',
                      role: 'model',
                      text: serverContent.outputTranscription.text,
                    })
                  );
                }

                // 4. Input user audio transcription
                if (serverContent?.inputTranscription?.text) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'transcript',
                      role: 'user',
                      text: serverContent.inputTranscription.text,
                    })
                  );
                }

                // 5. Handle non-blocking function calls: dispatch tool_action + sendToolResponse
                const toolCall = serverMessage.toolCall;
                if (toolCall?.functionCalls && Array.isArray(toolCall.functionCalls)) {
                  const functionResponses: Array<{
                    id?: string;
                    name?: string;
                    response: Record<string, unknown>;
                  }> = [];

                  for (const call of toolCall.functionCalls) {
                    const toolName = (call.name || '') as LiveVoiceToolAction['tool'];
                    const toolArgs = (call.args as Record<string, unknown>) || {};
                    const callId =
                      call.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

                    const action: LiveVoiceToolAction = {
                      tool: toolName,
                      args: toolArgs,
                      callId,
                    };

                    // Send tool_action event to Studio frontend
                    clientWs.send(
                      JSON.stringify({
                        type: 'tool_action',
                        action,
                        tool: toolName,
                        args: toolArgs,
                        callId,
                      })
                    );

                    // Acknowledge NON_BLOCKING function call back to Gemini 3.8 Live
                    functionResponses.push({
                      id: callId,
                      name: call.name || toolName,
                      response: {
                        output: {
                          status: 'acknowledged',
                          tool: toolName,
                          timestamp: new Date().toISOString(),
                        },
                      },
                    });
                  }

                  if (functionResponses.length > 0 && geminiSession) {
                    try {
                      geminiSession.sendToolResponse({
                        functionResponses,
                      });
                    } catch (respErr) {
                      console.error('[LiveVoiceTutor] Failed to sendToolResponse to Gemini:', respErr);
                    }
                  }
                }
              } catch (msgErr) {
                console.error('[LiveVoiceTutor] Error processing LiveServerMessage:', msgErr);
              }
            },

            onerror: (err: unknown) => {
              console.error('[LiveVoiceTutor] Gemini Live error:', err);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: 'error',
                    message:
                      err instanceof Error
                        ? err.message
                        : 'Gemini 3.8 Live session encountered an unexpected error.',
                  })
                );
              }
            },

            onclose: (closeEvent: unknown) => {
              console.log('[LiveVoiceTutor] Gemini Live session closed:', closeEvent);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: 'status',
                    status: 'closed',
                  })
                );
              }
            },
          },
        });

        geminiSession = session;
        isConnecting = false;

        // Flush any buffered inputs
        while (pendingInputs.length > 0) {
          const fn = pendingInputs.shift();
          if (fn) fn();
        }
      } catch (err: unknown) {
        isConnecting = false;
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to establish Gemini 3.8 Live session.';
        console.error('[LiveVoiceTutor] Connection error:', errorMessage);

        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'error',
              message: errorMessage,
            })
          );
        }
      }
    };

    // Auto-connect if repoId is present in query parameters
    if (repoId) {
      initGeminiLiveSession(repoId, byokApiKey).catch((err) => {
        console.warn('[LiveVoiceTutor] Initial auto-connect error:', err);
      });
    }

    /**
     * Handle incoming client messages from Studio frontend.
     */
    clientWs.on('message', async (dataRaw) => {
      if (isClosed) return;

      try {
        const text = dataRaw.toString('utf8');
        const data = JSON.parse(text);

        switch (data.type) {
          case 'init': {
            if (data.repoId && typeof data.repoId === 'string') {
              repoId = data.repoId;
            }
            if (data.byokApiKey && typeof data.byokApiKey === 'string') {
              byokApiKey = data.byokApiKey;
            }
            await initGeminiLiveSession(repoId, byokApiKey);
            break;
          }

          case 'audio':
          case 'audio_chunk': {
            const pcmBase64 = data.pcmBase64 || data.data;
            if (typeof pcmBase64 === 'string' && pcmBase64.length > 0) {
              dispatchToSession((session) => {
                session.sendRealtimeInput({
                  audio: {
                    data: pcmBase64,
                    mimeType: data.mimeType || 'audio/pcm;rate=16000',
                  },
                });
              });
            }
            break;
          }

          case 'audio_end':
          case 'audioStreamEnd': {
            dispatchToSession((session) => {
              session.sendRealtimeInput({
                audioStreamEnd: true,
              });
            });
            break;
          }

          case 'vision_frame':
          case 'video': {
            const rawBase64 = data.imageBase64 || data.data;
            if (typeof rawBase64 === 'string' && rawBase64.length > 0) {
              const cleanBase64 = rawBase64.replace(/^data:image\/[a-z]+;base64,/, '');
              dispatchToSession((session) => {
                session.sendRealtimeInput({
                  video: {
                    data: cleanBase64,
                    mimeType: data.mimeType || 'image/jpeg',
                  },
                });
              });
            }
            break;
          }

          case 'text_input':
          case 'text': {
            const prompt = (data.text || '').trim();
            if (prompt) {
              dispatchToSession((session) => {
                session.sendRealtimeInput({
                  text: prompt,
                });
              });
            }
            break;
          }

          case 'tool_response': {
            // Optional client acknowledgment receipt
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('[LiveVoiceTutor] Failed to parse client message:', err);
      }
    });

    clientWs.on('error', (err) => {
      console.error('[LiveVoiceTutor] Client WebSocket error:', err);
    });

    clientWs.on('close', () => {
      isClosed = true;
      pendingInputs.length = 0;

      if (geminiSession) {
        try {
          geminiSession.close();
        } catch (closeErr) {
          console.warn('[LiveVoiceTutor] Error closing Gemini Live session:', closeErr);
        }
        geminiSession = null;
      }
    });
  });
}
