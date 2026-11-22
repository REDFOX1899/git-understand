// =============================================================================
// GitUnderstand (git-understand.com) — Express 5 Production API & WS Server
// Mounts all 5 modular REST/SSE route suites, HTTP MCP Server (/mcp),
// generated multimodal artifacts (/artifacts), and Gemini 3.8 Live WS (/ws/live-tutor)
// =============================================================================

import http, { type Server as HttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';

import { ENV, PUBLIC_DOMAIN, ensureRuntimeDirs } from './config/env.js';
import { analyzeRoutes } from './routes/analyzeRoutes.js';
import { visualRoutes } from './routes/visualRoutes.js';
import { digestRoutes } from './routes/digestRoutes.js';
import { oracleRoutes } from './routes/oracleRoutes.js';
import { mediaRoutes } from './routes/mediaRoutes.js';
import { createMcpRouter } from './mcp/mcpServer.js';
import { attachLiveVoiceUpgrade } from './gemini/liveVoiceTutor.js';

/**
 * Builds the configured Express 5 application (exported for Vitest integration tests).
 */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  const allowedOrigins = new Set(ENV.CORS_ORIGIN);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.has('*') ||
          allowedOrigins.has(origin) ||
          origin.endsWith('.git-understand.com') ||
          /^https:\/\/git-understand(-[a-z0-9-]+)?\.vercel\.app$/.test(origin) ||
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:')
        ) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-gemini-api-key',
        'x-github-token',
        'x-deep-thinking',
        'Mcp-Session-Id',
      ],
    })
  );

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Large JSON limit for canvas PNG snapshots, whiteboard uploads, and voice memos
  // strict: false lets JSON-RPC /mcp validate non-object JSON payloads cleanly with -32600
  app.use(express.json({ limit: '25mb', strict: false }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Generated multimodal artifacts (Nano Banana posters, 3.8 TTS WAVs, Omni MP4s)
  app.use(
    '/artifacts',
    express.static(ENV.ARTIFACTS_DIR, {
      maxAge: '1h',
      fallthrough: true,
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );

  // Core API route suites
  app.use('/api', analyzeRoutes);
  app.use('/api', visualRoutes);
  app.use('/api', digestRoutes);
  app.use('/api', oracleRoutes);
  app.use('/api', mediaRoutes);

  // Container healthcheck alias (Cloud Run / Docker)
  app.get('/health', (req: Request, res: Response, next: NextFunction) => {
    req.url = '/health';
    analyzeRoutes(req, res, next);
  });

  // Built-in Streamable HTTP MCP Server for Claude Code, Cursor, Gemini CLI & VS Code
  app.use('/mcp', createMcpRouter());

  // Root capability landing JSON
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      name: 'git-understand-engine',
      service: 'git-understand-engine',
      version: '3.0.0',
      domain: PUBLIC_DOMAIN,
      status: 'online',
      endpoints: {
        health: '/api/health',
        showcase: '/api/showcase',
        apiShowcase: '/api/showcase',
        analyze: 'POST /api/analyze',
        digest: 'POST /api/digest',
        apiDigestCompile: '/api/digest/compile',
        rawMarkdown: 'GET /api/raw/:owner/:repo',
        xray: 'POST /api/xray',
        circleExplain: 'POST /api/circle-explain',
        oracleStream: 'POST /api/oracle/stream',
        visualSearch: 'POST /api/search/visual',
        mediaLab: '/api/media/{poster,audio-tour,video-reel}',
        mcp: '/mcp',
        liveVoiceWs: 'wss://api.git-understand.com/ws/live-tutor',
      },
    });
  });

  // 404 fallback
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      status: 404,
      error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Structured Express 5 error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (process.env.NODE_ENV !== 'test') {
      console.error('[git-understand-engine]', err);
    }
    res.status(status).json({ error: message });
  });

  return app;
}

/**
 * Starts HTTP + WebSocket server (Gemini 3.8 Live Voice Tutor upgrade attached).
 */
export async function startServer(port = ENV.BACKEND_PORT): Promise<HttpServer> {
  await ensureRuntimeDirs();
  const app = createApp();
  const server = http.createServer(app);
  attachLiveVoiceUpgrade(server);

  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(
        `[git-understand-engine] Listening on http://0.0.0.0:${port} (domain=${PUBLIC_DOMAIN})`
      );
      resolve();
    });
  });

  return server;
}

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('[git-understand-engine] Fatal startup failure:', err);
    process.exit(1);
  });
}

export default createApp;
