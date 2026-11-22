// =============================================================================
// GitUnderstand (git-understand.com) — Backend Environment Configuration
// =============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Locate the project root directory by traversing upwards until finding canonical markers.
 */
function resolveProjectRoot(fromDir: string): string {
  let current = fromDir;
  while (true) {
    if (
      fs.existsSync(path.join(current, 'shared', 'types.ts')) ||
      (fs.existsSync(path.join(current, 'backend')) && fs.existsSync(path.join(current, 'env')))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // Fallback: 3 levels up from backend/src/config is workspace root
      return path.resolve(fromDir, '../../..');
    }
    current = parent;
  }
}

const PROJECT_ROOT = resolveProjectRoot(__dirname);

// 1. Primary env file: <root>/env/.env
const rootEnvPath = path.resolve(PROJECT_ROOT, 'env', '.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

// 2. Fallback env file: <root>/backend/.env
const backendEnvPath = path.resolve(PROJECT_ROOT, 'backend', '.env');
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
}

// 3. Process cwd fallback
dotenv.config();

function parseCorsOrigin(raw?: string): string[] {
  const defaultOrigins = [
    'http://localhost:3000',
    'https://git-understand.com',
    'https://www.git-understand.com',
  ];
  if (!raw || !raw.trim()) {
    return defaultOrigins;
  }
  const parsed = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : defaultOrigins;
}

const rawPort = process.env.PORT || process.env.BACKEND_PORT || '4000';
const parsedPort = Number(rawPort);
const resolvedPort = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4000;

export const PUBLIC_DOMAIN = 'git-understand.com';

export interface BackendEnv {
  GEMINI_API_KEY: string;
  GEMINI_API_KEY_SECONDARY: string;
  GITHUB_TOKEN: string;
  GEMINI_MODEL_ARCHITECT: string;
  GEMINI_MODEL_VISUAL: string;
  GEMINI_MODEL_FAST: string;
  GEMINI_MODEL_ORACLE: string;
  GEMINI_MODEL_LITE: string;
  GEMINI_MODEL_DECISIONS: string;
  GEMINI_MODEL_LIVE: string;
  GEMINI_MODEL_LIVE_THINKING: string;
  GEMINI_MODEL_IMAGE: string;
  GEMINI_MODEL_TTS: string;
  GEMINI_MODEL_VIDEO: string;
  GEMINI_MODEL_EMBEDDING: string;
  GEMINI_MODEL_TRANSCRIBE: string;
  GEMINI_MANAGED_AGENT: string;
  GEMINI_DEEP_RESEARCH: string;
  BACKEND_PORT: number;
  CORS_ORIGIN: string[];
  ARTIFACTS_DIR: string;
  CACHE_DIR: string;
  GCP_PROJECT_ID: string;
  GCP_REGION: string;
  CLOUD_RUN_SERVICE: string;
}

export const ENV: BackendEnv = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_API_KEY_SECONDARY: process.env.GEMINI_API_KEY_SECONDARY || '',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  GEMINI_MODEL_ARCHITECT: process.env.GEMINI_MODEL_ARCHITECT || 'gemini-4-carbon',
  GEMINI_MODEL_VISUAL: process.env.GEMINI_MODEL_VISUAL || 'gemini-4-neon',
  GEMINI_MODEL_FAST: process.env.GEMINI_MODEL_FAST || 'gemini-4-argon',
  GEMINI_MODEL_ORACLE: process.env.GEMINI_MODEL_ORACLE || 'gemini-4-hydrogen',
  GEMINI_MODEL_LITE: process.env.GEMINI_MODEL_LITE || 'gemini-3.5-flash-lite',
  GEMINI_MODEL_DECISIONS: process.env.GEMINI_MODEL_DECISIONS || 'gemini-decision-1',
  GEMINI_MODEL_LIVE: process.env.GEMINI_MODEL_LIVE || 'gemini-3.8-live',
  GEMINI_MODEL_LIVE_THINKING: process.env.GEMINI_MODEL_LIVE_THINKING || 'gemini-3.8-live-extended-thinking',
  GEMINI_MODEL_IMAGE: process.env.GEMINI_MODEL_IMAGE || 'gemini-nano-banana-2.1',
  GEMINI_MODEL_TTS: process.env.GEMINI_MODEL_TTS || 'gemini-3.8-flash-tts',
  GEMINI_MODEL_VIDEO: process.env.GEMINI_MODEL_VIDEO || 'gemini-omni-1.2-flash',
  GEMINI_MODEL_EMBEDDING: process.env.GEMINI_MODEL_EMBEDDING || 'gemini-embedding-2',
  GEMINI_MODEL_TRANSCRIBE: process.env.GEMINI_MODEL_TRANSCRIBE || 'gemini-3.5-transcribe',
  GEMINI_MANAGED_AGENT: process.env.GEMINI_MANAGED_AGENT || 'antigravity-preview-09-2026',
  GEMINI_DEEP_RESEARCH: process.env.GEMINI_DEEP_RESEARCH || 'deep-research-preview-04-2026',
  BACKEND_PORT: resolvedPort,
  CORS_ORIGIN: parseCorsOrigin(process.env.CORS_ORIGIN),
  ARTIFACTS_DIR: path.resolve(PROJECT_ROOT, 'backend', 'artifacts'),
  CACHE_DIR: path.resolve(PROJECT_ROOT, 'backend', '.cache'),
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || 'gitunderstand',
  GCP_REGION: process.env.GCP_REGION || 'us-central1',
  CLOUD_RUN_SERVICE: process.env.CLOUD_RUN_SERVICE || 'git-understand-engine',
};

/**
 * Ensures backend runtime directories (artifacts and cache) exist on disk.
 */
export async function ensureRuntimeDirs(): Promise<void> {
  await fsPromises.mkdir(ENV.ARTIFACTS_DIR, { recursive: true });
  await fsPromises.mkdir(ENV.CACHE_DIR, { recursive: true });
}
