/**
 * GitUnderstand — Dependency Graph & Strata Builder
 *
 * Deterministically builds the complete RepoDependencyGraph plus instant visual
 * AtlasNode[], AtlasEdge[], SubsystemCluster[], StratumLayer[], ExecutionFlow[],
 * CodemapTourStop[], and clickable MermaidDiagramSpec[] in well under 1.5s so the
 * Studio canvas renders immediately before Gemini synthesis finishes.
 */

import type {
  ArchitectureLayer,
  AtlasEdge,
  AtlasNode,
  CodemapTourStop,
  DependencyEdge,
  ExecutionFlow,
  ExecutionFlowStep,
  MermaidDiagramSpec,
  RepoFileRecord,
  RepoMetadata,
  StratumLayer,
  SubsystemCluster,
  VisualLensId,
} from '../../../shared/types.js';

export interface DeterministicAtlasResult {
  files: RepoFileRecord[];
  dependencyEdges: DependencyEdge[];
  subsystems: SubsystemCluster[];
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  strata: StratumLayer[];
  flows: ExecutionFlow[];
  codemapTour: CodemapTourStop[];
  diagrams: MermaidDiagramSpec[];
  circularDeps: number;
  avgFanOut: number;
  architecturePattern: string;
  techStackBadges: string[];
}

// =============================================================================
// Curated Obsidian Cobalt + Semantic Layer Palette (Zero Muddy Rainbow Slop)
// =============================================================================

const LAYER_ORDER: readonly ArchitectureLayer[] = [
  'client',
  'edge',
  'orchestration',
  'domain',
  'infrastructure',
  'data',
  'tooling',
];

const LAYER_RANK: Record<ArchitectureLayer, number> = {
  client: 0,
  edge: 1,
  orchestration: 2,
  domain: 3,
  infrastructure: 4,
  data: 5,
  tooling: 6,
};

const STRATUM_METADATA: Record<
  ArchitectureLayer,
  { title: string; description: string; elevation: number; accentColor: string }
> = {
  client: {
    title: 'Client & Visual Surface',
    description: 'Interactive views, UI components, hooks, themes, and client state.',
    elevation: 6,
    accentColor: '#38BDF8', // Cyan Layer
  },
  edge: {
    title: 'Edge & API Gateway',
    description: 'HTTP routes, request handlers, WebSockets, middleware, and entrypoints.',
    elevation: 5,
    accentColor: '#4285F4', // Cobalt Bright
  },
  orchestration: {
    title: 'Orchestration & Pipelines',
    description: 'Workflow engines, ingestion pipelines, AI synthesis, agents, and workers.',
    elevation: 4,
    accentColor: '#1A73E8', // Cobalt Core
  },
  domain: {
    title: 'Core Domain & Logic',
    description: 'Business rules, parsers, analyzers, algorithms, and canonical contracts.',
    elevation: 3,
    accentColor: '#818CF8', // Indigo Layer
  },
  infrastructure: {
    title: 'Infrastructure & Adapters',
    description: 'Configuration, auth, observability, cloud deployment, and SDK clients.',
    elevation: 2,
    accentColor: '#2DD4BF', // Teal Layer
  },
  data: {
    title: 'Data & Persistence',
    description: 'Schemas, repositories, caches, vector indices, and storage backends.',
    elevation: 1,
    accentColor: '#34D399', // Emerald
  },
  tooling: {
    title: 'Tooling, Tests & Docs',
    description: 'Test suites, build configuration, CI workflows, scripts, and documentation.',
    elevation: 0,
    accentColor: '#FBBF24', // Amber
  },
};

const SUBSYSTEM_PALETTE: readonly string[] = [
  '#1A73E8', // Cobalt Core
  '#38BDF8', // Cyan Layer
  '#34D399', // Emerald
  '#818CF8', // Indigo Layer
  '#2DD4BF', // Teal Layer
  '#4285F4', // Cobalt Bright
  '#FBBF24', // Amber
  '#60A5FA', // Cobalt Steel
  '#0B57D0', // Cobalt Deep
  '#8AB4F8', // Cobalt Ice
];

const LAYER_PALETTE_VARIANTS: Record<ArchitectureLayer, readonly string[]> = {
  client: ['#38BDF8', '#60A5FA', '#8AB4F8'],
  edge: ['#4285F4', '#1A73E8', '#60A5FA'],
  orchestration: ['#1A73E8', '#0B57D0', '#4285F4'],
  domain: ['#818CF8', '#60A5FA', '#1A73E8'],
  infrastructure: ['#2DD4BF', '#38BDF8', '#34D399'],
  data: ['#34D399', '#2DD4BF', '#38BDF8'],
  tooling: ['#FBBF24', '#8AB4F8', '#2DD4BF'],
};

// =============================================================================
// Path & Formatting Utilities
// =============================================================================

function normalizePath(rawPath: string): string {
  if (!rawPath) return '';
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function posixNormalize(rawPath: string): string {
  const parts = rawPath.replace(/\\/g, '/').split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (resolved.length > 0 && resolved[resolved.length - 1] !== '..') {
        resolved.pop();
      } else {
        resolved.push('..');
      }
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

function posixDirname(filePath: string): string {
  const norm = normalizePath(filePath);
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? '' : norm.slice(0, idx);
}

function posixBasename(filePath: string): string {
  const norm = normalizePath(filePath);
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? norm : norm.slice(idx + 1);
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot <= 0 ? filename : filename.slice(0, dot);
}

function toSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'item';
}

function toTitleCase(raw: string): string {
  const ACRONYMS: Record<string, string> = {
    api: 'API',
    ui: 'UI',
    ux: 'UX',
    ai: 'AI',
    db: 'DB',
    sql: 'SQL',
    sdk: 'SDK',
    cli: 'CLI',
    ast: 'AST',
    ws: 'WS',
    http: 'HTTP',
    rpc: 'RPC',
    trpc: 'tRPC',
    grpc: 'gRPC',
    llm: 'LLM',
    rag: 'RAG',
    tts: 'TTS',
    ssr: 'SSR',
    ci: 'CI',
    cd: 'CD',
    mcp: 'MCP',
    io: 'IO',
    id: 'ID',
    url: 'URL',
    env: 'Env',
    auth: 'Auth',
    config: 'Config',
    util: 'Util',
    utils: 'Utils',
    lib: 'Lib',
    src: 'Src',
    repo: 'Repo',
    repos: 'Repos',
    xray: 'X-Ray',
    graphql: 'GraphQL',
    nextjs: 'Next.js',
    github: 'GitHub',
    '3d': '3D',
    '2d': '2D',
  };

  const tokens = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d+[A-Za-z]?)\b/g, '$1 $2')
    .replace(/[-_./]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return 'Module';

  return tokens
    .map((token) => {
      const lower = token.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function formatTokensCompact(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

// =============================================================================
// 1. Architecture Layer Classifier
// =============================================================================

const TOOLING_DIR_RE =
  /(^|\/)(__tests__|tests?|spec|specs|e2e|cypress|playwright|fixtures|__mocks__|mocks|benchmarks?|stories|storybook|\.github|\.gitlab|\.circleci|\.vscode|\.husky|scripts|tools|tooling|hack|ci|docs|documentation|examples|demos)(\/|$)/;

const TEST_FILE_RE =
  /(\.(test|spec|e2e|stories|bench)\.[^/]+$|(^|\/)(test_[^/]+\.py|[^/]+_test\.(go|py|rs|ts|js)))$/;

const TOOLING_ROOT_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'tsconfig.json',
  'jsconfig.json',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'poetry.lock',
  'requirements.txt',
  'requirements-dev.txt',
  'cargo.toml',
  'cargo.lock',
  'go.mod',
  'go.sum',
  'makefile',
  'cmakelists.txt',
  'gemfile',
  'gemfile.lock',
  'pom.xml',
  'justfile',
  'turbo.json',
  'nx.json',
  'pnpm-workspace.yaml',
  '.gitignore',
  '.dockerignore',
  '.gcloudignore',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.prettierrc',
  '.prettierrc.json',
  '.editorconfig',
  'license',
  'readme.md',
  'changelog.md',
  'contributing.md',
]);

const TOOLING_CONFIG_RE =
  /(^|\/)(tsconfig\.[^/]+\.json|(vite|next|webpack|rollup|tailwind|postcss|vitest|jest|babel|eslint|prettier|playwright|cypress|drizzle|astro|svelte|nuxt)\.config\.[^/]+|build\.gradle(\.kts)?|\.env(\.[^/]+)?)$/;

const INFRA_DEPLOY_RE =
  /(^|\/)(dockerfile[^/]*|docker-compose[^/]*|cloudbuild[^/]*|vercel\.json|firebase\.json|apphosting\.yaml|fly\.toml|render\.yaml|railway\.json|procfile|k8s|kubernetes|terraform|helm|infra|infrastructure|deploy|deployment)(\/|$)/;

const DATA_EXT_RE = /\.(sql|prisma|graphql|gql|proto|avro|parquet)$/;

const EDGE_DIR_RE =
  /(^|\/)(app\/api|pages\/api|api|routes?|controllers?|handlers?|endpoints?|gateway|edge|proxy|middleware|webhooks?|ws|websocket|sockets?|rpc|trpc|graphql|rest|http|ingress|cli|commands?)(\/|$)/;

const EDGE_FILE_RE =
  /(^|\/)(route\.(ts|tsx|js|jsx|mjs)|middleware\.(ts|js|mjs)|server\.(ts|js|py|go|rs)|main\.(go|rs)|wsgi\.py|asgi\.py|manage\.py|.*(controller|handler|router|routes|endpoint|webhook|gateway)\.[^/]+)$/;

const UI_DIR_RE =
  /(^|\/)(components?|pages?|views?|screens?|layouts?|widgets?|ui|frontend|studio|web|styles?|themes?|hooks|contexts?|atoms|public|assets)(\/|$)/;

const UI_EXT_RE = /\.(tsx|jsx|vue|svelte|css|scss|sass|less|html|astro)$/;

const DATA_DIR_RE =
  /(^|\/)(db|database|data|models?|entities|schemas?|migrations?|seeds?|prisma|drizzle|sql|queries|repositories|dao|storage|store|cache|redis|postgres|mongo|sqlite|firestore|bigquery|vector|embeddings?|catalog|datasets?)(\/|$)/;

const DATA_FILE_RE =
  /(^|\/)(schema|models?|database|db|store|cache|repository|migrations?|seeds?|vectorstore|embeddings?)\.[^/]+$|_(repo|repository|model|schema|store|cache|dao)\.[^/]+$/;

const ORCHESTRATION_DIR_RE =
  /(^|\/)(orchestrat\w*|pipelines?|workflows?|agents?|jobs?|workers?|queues?|schedulers?|ingest|ingestion|synthesis|coordinat\w*|dispatch\w*|events?|bus|stream|streaming|ai|llm|gemini|openai|anthropic|rag|prompts?|chains?|graphs?|runtime)(\/|$)/;

const ORCHESTRATION_FILE_RE =
  /(orchestrat|pipeline|workflow|agent|worker|scheduler|queue|ingest|synthesi|coordinator|dispatcher|runner|executor|streamer|graphbuilder|treemapbuilder|digestcompiler|xray|oracle|livevoice|forensics)/;

const DOMAIN_DIR_RE =
  /(^|\/)(domain|core|services?|business|logic|modules?|features?|engine|compiler|parser|ast|analyzer|analysis|graph|solver|planner|rules?|policies|validators?|transformers?|processors?|usecases?|use-cases|use_cases|interactors|shared)(\/|$)/;

const INFRA_DIR_RE =
  /(^|\/)(config|configs|configuration|env|auth|security|crypto|logging|logger|telemetry|metrics|tracing|otel|observability|monitoring|adapters?|providers?|connectors?|sdk|transport|net|network|cloud|gcp|aws|azure|docker|utils?|helpers?|common|platform|system)(\/|$)/;

const INFRA_FILE_RE =
  /(^|\/)(env|config|settings|logger|telemetry|metrics|auth|security|crypto|client|provider|adapter|transport|http|fetcher)\.[^/]+$|(client|adapter|provider|fetcher|logger|config|auth)\.[^/]+$/;

const NON_CODE_DOC_OR_CONFIG_EXT_RE =
  /\.(md|mdx|rst|txt|json|yaml|yml|toml|ini|cfg|conf|xml|lock|sh|bash|zsh|ps1|bat|svg|png|jpg|jpeg|webp|ico|woff2?)$/;

export function classifyArchitectureLayer(
  filePath: string,
  content: string,
  language: string
): ArchitectureLayer {
  const norm = normalizePath(filePath);
  const lower = norm.toLowerCase();
  const base = posixBasename(lower);
  const langLower = (language || '').toLowerCase();
  const sample = content ? content.slice(0, 6000) : '';

  // 1. Deployment / cloud infra files win over generic tooling configs
  if (INFRA_DEPLOY_RE.test(lower)) {
    return 'infrastructure';
  }

  // 2. Explicit schema/query extensions belong in data
  if (DATA_EXT_RE.test(lower)) {
    return 'data';
  }

  // 3. Tests, docs, CI, build/lint configs -> tooling
  if (
    TOOLING_DIR_RE.test(lower) ||
    TEST_FILE_RE.test(lower) ||
    TOOLING_ROOT_FILES.has(base) ||
    TOOLING_CONFIG_RE.test(lower) ||
    /\.(md|mdx|rst|txt)$/.test(lower)
  ) {
    return 'tooling';
  }

  // 4. Explicit API routes / edge boundaries (must precede studio/app UI checks so app/api/**/route.ts is edge)
  if (EDGE_DIR_RE.test(lower) || EDGE_FILE_RE.test(lower)) {
    // Watch out for frontend api-client helpers (studio/src/lib/api.ts) and AI model routers (gemini/modelRouter.ts)
    const isFrontendDir = /(^|\/)(studio|frontend|web|client)\//.test(lower);
    const isNextApiRoute = /(^|\/)(app|pages)\/api\//.test(lower) || /(^|\/)route\.(ts|tsx|js|jsx|mjs)$/.test(lower);
    const isAiModelRouter =
      ORCHESTRATION_DIR_RE.test(lower) &&
      !EDGE_DIR_RE.test(lower) &&
      !/\b(express\(\)|Router\(\)|FastAPI\(|APIRouter\(|@router\.(get|post)|NextResponse)\b/.test(sample);
    if (!isAiModelRouter && (!isFrontendDir || isNextApiRoute || /(^|\/)middleware\.(ts|js)$/.test(lower))) {
      return 'edge';
    }
  }

  // 5. Explicit frontend / client UI layer
  const isBackendPath = /(^|\/)(backend|server|api|worker|services)\//.test(lower);
  if (
    UI_EXT_RE.test(lower) ||
    (!isBackendPath && (UI_DIR_RE.test(lower) || /(^|\/)(client|app)\//.test(lower)))
  ) {
    if (
      UI_EXT_RE.test(lower) ||
      UI_DIR_RE.test(lower) ||
      /(^|\/)(studio|frontend|web|client)\//.test(lower)
    ) {
      return 'client';
    }
  }

  // 6. Explicit data & persistence layer
  if (DATA_DIR_RE.test(lower) || DATA_FILE_RE.test(lower)) {
    // Distinguish frontend UI state stores (e.g. studio/src/store/...) from backend data stores
    if (/(^|\/)(studio|frontend|web)\//.test(lower) && /\b(zustand|redux|createSlice|useStore|atom\()\b/.test(sample)) {
      return 'client';
    }
    return 'data';
  }

  // 7. Explicit orchestration, ingestion, pipelines, agents, and AI synthesis
  if (ORCHESTRATION_DIR_RE.test(lower) || ORCHESTRATION_FILE_RE.test(base)) {
    return 'orchestration';
  }

  // 8. Explicit infrastructure (config, env, auth, logging, SDK/HTTP clients)
  if (INFRA_DIR_RE.test(lower) || INFRA_FILE_RE.test(lower)) {
    // shared/types.ts or shared/contracts.ts is domain rather than infra
    if (/(^|\/)shared\/(types|contracts|models|schemas?)\.[^/]+$/.test(lower)) {
      return 'domain';
    }
    return 'infrastructure';
  }

  // 9. Explicit domain / core engine
  if (DOMAIN_DIR_RE.test(lower)) {
    return 'domain';
  }

  // 10. Content-driven secondary classification when directory names are generic
  if (sample.length > 0) {
    if (
      /['"]use client['"]/.test(sample) ||
      /\b(useState|useEffect|useReducer|createRoot|defineComponent|StatelessWidget|StatefulWidget|@Composable|SwiftUI)\b/.test(
        sample
      )
    ) {
      return 'client';
    }

    if (
      /\b(express\(\)|Router\(\)|FastAPI\(|APIRouter\(|@app\.route|@router\.(get|post|put|delete)|WebSocketServer|NextResponse|http\.HandleFunc|gin\.Default|axum::Router|export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH))\b/.test(
        sample
      )
    ) {
      return 'edge';
    }

    if (
      /\b(@google\/genai|interactions\.create|decisions\.create|generateContent|live\.connect|StateGraph|LangGraph|BullMQ|celery|temporal|inngest)\b/.test(
        sample
      )
    ) {
      return 'orchestration';
    }

    if (
      /\b(CREATE\s+TABLE|PrismaClient|pgTable\(|sqliteTable\(|mongoose\.Schema|sqlalchemy|BaseModel|Firestore|BigQuery|createPool\()\b/i.test(
        sample
      )
    ) {
      return 'data';
    }

    if (
      /\b(process\.env|dotenv|os\.environ|opentelemetry|jsonwebtoken|bcrypt|oauth2?)\b/i.test(sample)
    ) {
      return 'infrastructure';
    }
  }

  // 11. Language / extension fallback
  if (
    NON_CODE_DOC_OR_CONFIG_EXT_RE.test(lower) ||
    langLower === 'markdown' ||
    langLower === 'json' ||
    langLower === 'yaml' ||
    langLower === 'toml' ||
    langLower === 'shell'
  ) {
    return 'tooling';
  }

  if (langLower === 'css' || langLower === 'scss' || langLower === 'html' || langLower === 'vue' || langLower === 'svelte') {
    return 'client';
  }

  if (langLower === 'sql' || langLower === 'prisma' || langLower === 'graphql') {
    return 'data';
  }

  return 'domain';
}

// =============================================================================
// 2. Multi-Language Import Resolution
// =============================================================================

const CODE_PROBE_EXTENSIONS: readonly string[] = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.vue',
  '.svelte',
  '.json',
  '.css',
  '.scss',
];

const INDEX_PROBE_FILES: readonly string[] = [
  'index.ts',
  'index.tsx',
  'index.mts',
  'index.js',
  'index.jsx',
  'index.mjs',
  '__init__.py',
  'mod.rs',
  'index.vue',
  'index.svelte',
];

const ESM_EXTENSION_SWAPS: Record<string, readonly string[]> = {
  '.js': ['.ts', '.tsx', '.d.ts'],
  '.jsx': ['.tsx', '.ts'],
  '.mjs': ['.mts', '.ts'],
  '.cjs': ['.cts', '.ts'],
};

// WeakMap cache for O(1) Go package directory lookups without leaking memory
const goDirIndexCache = new WeakMap<Set<string>, Map<string, string>>();

function getGoDirIndex(filePathSet: Set<string>): Map<string, string> {
  const existing = goDirIndexCache.get(filePathSet);
  if (existing) return existing;

  const index = new Map<string, string>();
  for (const fp of filePathSet) {
    if (!fp.endsWith('.go') || fp.endsWith('_test.go')) continue;
    const norm = normalizePath(fp);
    const dir = posixDirname(norm);
    const base = posixBasename(norm);
    const prev = index.get(dir);
    if (
      !prev ||
      base === 'main.go' ||
      base === `${posixBasename(dir)}.go` ||
      (prev && base.localeCompare(posixBasename(prev)) < 0)
    ) {
      index.set(dir, norm);
    }
  }
  goDirIndexCache.set(filePathSet, index);
  return index;
}

function probeCandidate(candidate: string, filePathSet: Set<string>): string | null {
  const norm = posixNormalize(candidate).replace(/^\/+/, '');
  if (!norm || norm.startsWith('..')) return null;

  // 1. Exact match
  if (filePathSet.has(norm)) return norm;

  // 2. TypeScript NodeNext ESM extension rewrite (.js -> .ts/.tsx, .mjs -> .mts, etc.)
  for (const [jsExt, tsExts] of Object.entries(ESM_EXTENSION_SWAPS)) {
    if (norm.endsWith(jsExt)) {
      const stem = norm.slice(0, -jsExt.length);
      for (const tsExt of tsExts) {
        const swapped = `${stem}${tsExt}`;
        if (filePathSet.has(swapped)) return swapped;
      }
      // Also check directory barrel when someone writes './dir.js' or similar rare cases
      for (const idxFile of INDEX_PROBE_FILES) {
        const idxPath = `${stem}/${idxFile}`;
        if (filePathSet.has(idxPath)) return idxPath;
      }
    }
  }

  // 3. Extensionless module -> probe extensions
  for (const ext of CODE_PROBE_EXTENSIONS) {
    const withExt = `${norm}${ext}`;
    if (filePathSet.has(withExt)) return withExt;
  }

  // 4. Directory import -> probe index / __init__.py / mod.rs
  for (const idxFile of INDEX_PROBE_FILES) {
    const idxPath = `${norm}/${idxFile}`;
    if (filePathSet.has(idxPath)) return idxPath;
  }

  return null;
}

function deriveWorkspaceRoots(importerPath: string): string[] {
  const norm = normalizePath(importerPath);
  const roots: string[] = [];
  const seen = new Set<string>();

  const add = (r: string) => {
    const clean = normalizePath(r);
    if (!seen.has(clean)) {
      seen.add(clean);
      roots.push(clean);
    }
  };

  // Match <pkg>/src/... -> prioritize <pkg>/src and <pkg>
  const srcIdx = norm.indexOf('/src/');
  if (srcIdx !== -1) {
    add(norm.slice(0, srcIdx + 4)); // e.g. studio/src
    add(norm.slice(0, srcIdx)); // e.g. studio
  } else if (norm.startsWith('src/')) {
    add('src');
  }

  const segments = norm.split('/');
  if (segments.length >= 2) {
    add(`${segments[0]}/src`);
    add(segments[0]);
  }
  if (segments.length >= 3 && ['packages', 'apps', 'libs', 'services'].includes(segments[0])) {
    add(`${segments[0]}/${segments[1]}/src`);
    add(`${segments[0]}/${segments[1]}`);
  }

  add('src');
  add('');
  return roots;
}

export function resolveImportToFile(
  importerPath: string,
  rawImport: string,
  filePathSet: Set<string>
): string | null {
  if (!rawImport || filePathSet.size === 0) return null;

  const cleaned = rawImport
    .trim()
    .replace(/^['"`]|['"`]$/g, '')
    .split(/[?#]/)[0]
    .trim();

  if (!cleaned) return null;

  // Ignore URLs, data URIs, and Node built-in specifiers
  if (
    cleaned.startsWith('http://') ||
    cleaned.startsWith('https://') ||
    cleaned.startsWith('data:') ||
    cleaned.startsWith('node:')
  ) {
    return null;
  }

  const normImporter = normalizePath(importerPath);
  const importerDir = posixDirname(normImporter);
  const isPythonImporter = normImporter.endsWith('.py');
  const isRustImporter = normImporter.endsWith('.rs');
  const isGoImporter = normImporter.endsWith('.go');

  // -------------------------------------------------------------------------
  // Case A: Standard relative path imports (./foo, ../bar)
  // -------------------------------------------------------------------------
  if (cleaned.startsWith('./') || cleaned.startsWith('../') || cleaned === '.' || cleaned === '..') {
    const base = importerDir ? `${importerDir}/${cleaned}` : cleaned;
    return probeCandidate(base, filePathSet);
  }

  // -------------------------------------------------------------------------
  // Case B: Python relative dotted imports (.utils, ..models.user, ...core)
  // -------------------------------------------------------------------------
  if (cleaned.startsWith('.')) {
    let dotCount = 0;
    while (dotCount < cleaned.length && cleaned[dotCount] === '.') {
      dotCount++;
    }
    const remainder = cleaned.slice(dotCount).replace(/\./g, '/');
    const dirParts = importerDir ? importerDir.split('/') : [];
    const ascend = Math.max(0, dotCount - 1);
    if (ascend > dirParts.length) return null;
    const targetDir = dirParts.slice(0, dirParts.length - ascend).join('/');
    const base = remainder ? (targetDir ? `${targetDir}/${remainder}` : remainder) : targetDir;

    const direct = probeCandidate(base, filePathSet);
    if (direct && direct !== normImporter) return direct;

    // Handle `from .module import symbol` encoded as `.module.symbol`
    if (remainder.includes('/')) {
      const parentBase = posixDirname(base);
      if (parentBase) {
        const parentHit = probeCandidate(parentBase, filePathSet);
        if (parentHit && parentHit !== normImporter) return parentHit;
      }
    }
    return null;
  }

  const workspaceRoots = deriveWorkspaceRoots(normImporter);

  // -------------------------------------------------------------------------
  // Case C: Alias imports (@/..., ~/..., #/..., /..., @workspace/...)
  // -------------------------------------------------------------------------
  if (cleaned.startsWith('@/') || cleaned.startsWith('~/') || cleaned.startsWith('#/')) {
    const sub = cleaned.slice(2);
    for (const root of workspaceRoots) {
      const candidate = root ? `${root}/${sub}` : sub;
      const hit = probeCandidate(candidate, filePathSet);
      if (hit) return hit;
    }
    return null;
  }

  if (cleaned.startsWith('@')) {
    const slashIdx = cleaned.indexOf('/');
    if (slashIdx > 1) {
      const scopeName = cleaned.slice(1, slashIdx); // e.g. 'shared' from '@shared/types'
      const rest = cleaned.slice(slashIdx + 1);

      const scopedCandidates = [
        `${scopeName}/${rest}`,
        `${scopeName}/src/${rest}`,
        `packages/${scopeName}/src/${rest}`,
        `packages/${scopeName}/${rest}`,
        `libs/${scopeName}/src/${rest}`,
        `apps/${scopeName}/src/${rest}`,
        ...workspaceRoots.map((root) => (root ? `${root}/${scopeName}/${rest}` : `${scopeName}/${rest}`)),
      ];

      for (const candidate of scopedCandidates) {
        const hit = probeCandidate(candidate, filePathSet);
        if (hit) return hit;
      }
    }
    return null;
  }

  if (cleaned.startsWith('/') || cleaned.startsWith('#')) {
    const sub = cleaned.replace(/^[/#]+/, '');
    for (const root of workspaceRoots) {
      const candidate = root ? `${root}/${sub}` : sub;
      const hit = probeCandidate(candidate, filePathSet);
      if (hit) return hit;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Case D: Rust crate:: / super:: / self:: imports
  // -------------------------------------------------------------------------
  if (isRustImporter || cleaned.includes('::')) {
    const rustPath = cleaned.replace(/::/g, '/');
    const rustCandidates: string[] = [];
    if (rustPath.startsWith('crate/')) {
      const sub = rustPath.slice('crate/'.length);
      for (const root of workspaceRoots) {
        rustCandidates.push(root ? `${root}/${sub}` : sub);
      }
    } else if (rustPath.startsWith('self/')) {
      const sub = rustPath.slice('self/'.length);
      rustCandidates.push(importerDir ? `${importerDir}/${sub}` : sub);
    } else if (rustPath.startsWith('super/')) {
      const sub = rustPath.slice('super/'.length);
      const isModFile = /(?:^|\/)(?:mod|lib|main)\.rs$/i.test(normImporter);
      if (!isModFile && importerDir) {
        rustCandidates.push(`${importerDir}/${sub}`);
      }
      const parentDir = posixDirname(importerDir);
      rustCandidates.push(parentDir ? `${parentDir}/${sub}` : sub);
    }

    for (const candidate of rustCandidates) {
      const hit = probeCandidate(candidate, filePathSet);
      if (hit && hit !== normImporter) return hit;
      const parentCand = posixDirname(candidate);
      if (parentCand) {
        const parentHit = probeCandidate(parentCand, filePathSet);
        if (parentHit && parentHit !== normImporter) return parentHit;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Case E: Python absolute dotted imports (e.g. app.services.auth)
  // -------------------------------------------------------------------------
  if (isPythonImporter || (!cleaned.includes('/') && cleaned.includes('.'))) {
    const slashPath = cleaned.replace(/\./g, '/');
    const pyRoots = [
      '',
      ...workspaceRoots.filter(Boolean),
      ...(importerDir ? [importerDir] : []),
    ];

    const tried = new Set<string>();
    for (const root of pyRoots) {
      const candidate = root ? `${root}/${slashPath}` : slashPath;
      if (tried.has(candidate)) continue;
      tried.add(candidate);

      const hit = probeCandidate(candidate, filePathSet);
      if (hit && hit !== normImporter) return hit;

      // Try stripping final symbol segment (from pkg.mod import Class -> pkg.mod.Class)
      if (slashPath.includes('/')) {
        const parentCandidate = posixDirname(candidate);
        if (parentCandidate && !tried.has(parentCandidate)) {
          tried.add(parentCandidate);
          const parentHit = probeCandidate(parentCandidate, filePathSet);
          if (parentHit && parentHit !== normImporter) return parentHit;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Case F: Direct repo-relative / TS baseUrl / Go internal module imports
  // -------------------------------------------------------------------------
  if (cleaned.includes('/')) {
    // 1. Direct root-relative or workspace-root relative (e.g. 'src/utils/date', 'shared/types')
    const directHit = probeCandidate(cleaned, filePathSet);
    if (directHit) return directHit;

    for (const root of workspaceRoots) {
      if (!root) continue;
      const hit = probeCandidate(`${root}/${cleaned}`, filePathSet);
      if (hit) return hit;
    }

    // 2. Go module import path stripping (e.g. github.com/owner/repo/internal/auth -> internal/auth)
    if (isGoImporter) {
      const goIndex = getGoDirIndex(filePathSet);
      const parts = cleaned.split('/');
      const subpathsToCheck: string[] = [cleaned];
      if (parts.length > 3 && parts[0].includes('.')) {
        subpathsToCheck.push(parts.slice(3).join('/'));
      } else if (parts.length > 2 && parts[0].includes('.')) {
        subpathsToCheck.push(parts.slice(2).join('/'));
      }
      for (const sub of subpathsToCheck) {
        const goHit = goIndex.get(normalizePath(sub));
        if (goHit && goHit !== normImporter) return goHit;
      }
    }
  } else if (isPythonImporter) {
    // Single-segment local Python module (e.g. `import config` next to importer or root)
    const localCandidates = [
      importerDir ? `${importerDir}/${cleaned}` : cleaned,
      ...workspaceRoots.map((root) => (root ? `${root}/${cleaned}` : cleaned)),
    ];
    for (const candidate of localCandidates) {
      const hit = probeCandidate(candidate, filePathSet);
      if (hit && hit !== normImporter) return hit;
    }
  }

  return null;
}

// =============================================================================
// 3. Graph Algorithms (PageRank Centrality & Iterative Tarjan SCC Cycle Check)
// =============================================================================

function computePageRankCentrality(
  paths: string[],
  outAdj: Map<string, Set<string>>,
  inAdj: Map<string, Set<string>>,
  fileByPath: Map<string, RepoFileRecord>
): Map<string, number> {
  const n = paths.length;
  const result = new Map<string, number>();
  if (n === 0) return result;
  if (n === 1) {
    result.set(paths[0], 1);
    return result;
  }

  let totalEdges = 0;
  for (const neighbors of outAdj.values()) {
    totalEdges += neighbors.size;
  }

  // Fallback when repository has zero resolved internal edges
  if (totalEdges === 0) {
    let maxScore = 0;
    const raw = new Map<string, number>();
    for (const p of paths) {
      const f = fileByPath.get(p);
      if (!f) continue;
      const exportedCount = f.symbols.filter((s) => s.exported).length || f.exports.length;
      const score =
        (f.isEntrypoint ? 35 : 0) +
        Math.min(exportedCount, 12) * 3 +
        Math.log10(f.estimatedTokens + 10) * 8 +
        (f.isTest ? -15 : 0) +
        (f.isConfig ? -8 : 0);
      const clamped = Math.max(1, score);
      raw.set(p, clamped);
      if (clamped > maxScore) maxScore = clamped;
    }
    for (const [p, val] of raw.entries()) {
      result.set(p, Number((maxScore > 0 ? val / maxScore : 0.5).toFixed(4)));
    }
    return result;
  }

  // Iterative PageRank (25 iterations, damping = 0.85) with proper dangling-node redistribution
  const damping = 0.85;
  let ranks = new Map<string, number>();
  const initialRank = 1 / n;
  for (const p of paths) {
    ranks.set(p, initialRank);
  }

  for (let iter = 0; iter < 25; iter++) {
    const nextRanks = new Map<string, number>();
    let danglingSum = 0;

    for (const p of paths) {
      const outs = outAdj.get(p);
      if (!outs || outs.size === 0) {
        danglingSum += ranks.get(p) ?? 0;
      }
      nextRanks.set(p, (1 - damping) / n);
    }

    const danglingShare = (damping * danglingSum) / n;
    for (const p of paths) {
      nextRanks.set(p, (nextRanks.get(p) ?? 0) + danglingShare);
    }

    for (const p of paths) {
      const outs = outAdj.get(p);
      if (!outs || outs.size === 0) continue;
      const share = (damping * (ranks.get(p) ?? 0)) / outs.size;
      for (const target of outs) {
        nextRanks.set(target, (nextRanks.get(target) ?? 0) + share);
      }
    }

    ranks = nextRanks;
  }

  // Normalize PageRank, fanIn, and fanOut cleanly into 0..1 blended structural importance
  let minPr = Infinity;
  let maxPr = -Infinity;
  let maxFanIn = 1;
  let maxFanOut = 1;

  for (const p of paths) {
    const pr = ranks.get(p) ?? 0;
    if (pr < minPr) minPr = pr;
    if (pr > maxPr) maxPr = pr;
    const fi = inAdj.get(p)?.size ?? 0;
    const fo = outAdj.get(p)?.size ?? 0;
    if (fi > maxFanIn) maxFanIn = fi;
    if (fo > maxFanOut) maxFanOut = fo;
  }

  const prSpan = maxPr - minPr;
  const blended = new Map<string, number>();
  let maxBlended = 0;

  for (const p of paths) {
    const pr = ranks.get(p) ?? 0;
    const normPr = prSpan > 1e-12 ? (pr - minPr) / prSpan : 0.5;
    const normFanIn = (inAdj.get(p)?.size ?? 0) / maxFanIn;
    const normFanOut = (outAdj.get(p)?.size ?? 0) / maxFanOut;
    const f = fileByPath.get(p);
    const entryBonus = f?.isEntrypoint ? 1 : 0;

    const score = 0.68 * normPr + 0.14 * normFanIn + 0.1 * normFanOut + 0.08 * entryBonus;
    blended.set(p, score);
    if (score > maxBlended) maxBlended = score;
  }

  for (const p of paths) {
    const val = maxBlended > 0 ? (blended.get(p) ?? 0) / maxBlended : 0;
    result.set(p, Number(Math.max(0, Math.min(1, val)).toFixed(4)));
  }

  return result;
}

interface CycleAnalysisResult {
  circularEdgeKeys: Set<string>;
  circularSccCount: number;
}

/**
 * Iterative Tarjan's Strongly Connected Components DFS (stack-safe for large graphs).
 * Every directed edge (u -> v) whose endpoints share a non-trivial SCC (size >= 2)
 * participates in at least one directed cycle.
 */
function detectCyclesTarjan(
  paths: string[],
  outAdj: Map<string, Set<string>>
): CycleAnalysisResult {
  let currentIndex = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const tarjanStack: string[] = [];
  const sccIdByNode = new Map<string, number>();
  const sccSizes: number[] = [];

  interface Frame {
    node: string;
    neighbors: string[];
    neighborIdx: number;
  }

  for (const startNode of paths) {
    if (indices.has(startNode)) continue;

    const callStack: Frame[] = [
      {
        node: startNode,
        neighbors: Array.from(outAdj.get(startNode) ?? []),
        neighborIdx: 0,
      },
    ];

    indices.set(startNode, currentIndex);
    lowlinks.set(startNode, currentIndex);
    currentIndex++;
    tarjanStack.push(startNode);
    onStack.add(startNode);

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1];
      const u = frame.node;

      if (frame.neighborIdx < frame.neighbors.length) {
        const v = frame.neighbors[frame.neighborIdx];
        frame.neighborIdx++;

        if (!indices.has(v)) {
          indices.set(v, currentIndex);
          lowlinks.set(v, currentIndex);
          currentIndex++;
          tarjanStack.push(v);
          onStack.add(v);
          callStack.push({
            node: v,
            neighbors: Array.from(outAdj.get(v) ?? []),
            neighborIdx: 0,
          });
        } else if (onStack.has(v)) {
          const uLow = lowlinks.get(u) ?? 0;
          const vIdx = indices.get(v) ?? 0;
          if (vIdx < uLow) {
            lowlinks.set(u, vIdx);
          }
        }
      } else {
        callStack.pop();

        // Propagate lowlink back to parent frame
        if (callStack.length > 0) {
          const parent = callStack[callStack.length - 1].node;
          const parentLow = lowlinks.get(parent) ?? 0;
          const uLow = lowlinks.get(u) ?? 0;
          if (uLow < parentLow) {
            lowlinks.set(parent, uLow);
          }
        }

        // If u is the root of an SCC, pop the component
        if ((lowlinks.get(u) ?? -1) === (indices.get(u) ?? -2)) {
          const sccId = sccSizes.length;
          let size = 0;
          while (tarjanStack.length > 0) {
            const w = tarjanStack.pop()!;
            onStack.delete(w);
            sccIdByNode.set(w, sccId);
            size++;
            if (w === u) break;
          }
          sccSizes.push(size);
        }
      }
    }
  }

  let circularSccCount = 0;
  for (const size of sccSizes) {
    if (size >= 2) circularSccCount++;
  }

  const circularEdgeKeys = new Set<string>();
  for (const [u, neighbors] of outAdj.entries()) {
    const sccU = sccIdByNode.get(u);
    if (sccU === undefined || (sccSizes[sccU] ?? 0) < 2) continue;
    for (const v of neighbors) {
      if (sccIdByNode.get(v) === sccU) {
        circularEdgeKeys.add(`${u}::${v}`);
      }
    }
  }

  return { circularEdgeKeys, circularSccCount };
}

// =============================================================================
// 4. Tech Stack & Architecture Pattern Inference
// =============================================================================

function detectTechStackBadges(metadata: RepoMetadata, files: RepoFileRecord[]): string[] {
  const badges: string[] = [];
  const seen = new Set<string>();

  const addBadge = (label: string) => {
    const clean = label.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      badges.push(clean);
    }
  };

  if (metadata.primaryLanguage) {
    addBadge(metadata.primaryLanguage);
  }

  const allPathsLower = files.map((f) => normalizePath(f.path).toLowerCase());
  const allImportsLower = new Set<string>();
  const manifestTexts: string[] = [];

  for (const f of files) {
    for (const imp of f.imports) {
      allImportsLower.add(imp.toLowerCase());
    }
    const base = posixBasename(f.path).toLowerCase();
    if (
      f.content &&
      (base === 'package.json' ||
        base === 'pyproject.toml' ||
        base === 'requirements.txt' ||
        base === 'cargo.toml' ||
        base === 'go.mod' ||
        base === 'pubspec.yaml' ||
        base === 'dockerfile')
    ) {
      manifestTexts.push(f.content.toLowerCase());
    }
  }

  const combinedManifest = manifestTexts.join('\n');
  const hasPath = (re: RegExp) => allPathsLower.some((p) => re.test(p));
  const hasImport = (prefix: string) => {
    for (const imp of allImportsLower) {
      if (imp === prefix || imp.startsWith(`${prefix}/`) || imp.startsWith(`${prefix}.`)) {
        return true;
      }
    }
    return false;
  };
  const hasManifest = (token: string) => combinedManifest.includes(token);

  // Frontend frameworks
  if (hasPath(/next\.config\./) || hasImport('next') || hasManifest('"next"')) addBadge('Next.js');
  if (hasImport('react') || hasManifest('"react"') || hasPath(/\.tsx$/)) addBadge('React');
  if (hasPath(/\.vue$/) || hasImport('vue') || hasManifest('"vue"')) addBadge('Vue');
  if (hasPath(/\.svelte$/) || hasImport('svelte') || hasManifest('"svelte"')) addBadge('Svelte');
  if (hasPath(/tailwind\.config\.|postcss\.config\./) || hasManifest('tailwindcss')) addBadge('Tailwind CSS');
  if (hasPath(/pubspec\.yaml/) && hasManifest('flutter')) addBadge('Flutter');

  // Backend frameworks
  if (hasImport('express') || hasManifest('"express"')) addBadge('Express');
  if (hasImport('fastify') || hasManifest('"fastify"')) addBadge('Fastify');
  if (hasImport('hono') || hasManifest('"hono"')) addBadge('Hono');
  if (hasImport('fastapi') || hasManifest('fastapi')) addBadge('FastAPI');
  if (hasImport('django') || hasManifest('django')) addBadge('Django');
  if (hasImport('flask') || hasManifest('flask')) addBadge('Flask');
  if (hasImport('ws') || hasManifest('"ws"') || hasManifest('socket.io')) addBadge('WebSockets');
  if (hasPath(/\.graphql$|\.gql$/) || hasManifest('graphql')) addBadge('GraphQL');

  // AI / ML
  if (hasImport('@google/genai') || hasManifest('@google/genai') || hasManifest('google-genai')) {
    addBadge('Gemini API');
  }
  if (hasImport('openai') || hasManifest('"openai"')) addBadge('OpenAI');
  if (hasImport('@anthropic-ai/sdk') || hasManifest('anthropic')) addBadge('Anthropic');
  if (hasImport('torch') || hasManifest('torch')) addBadge('PyTorch');
  if (hasImport('langchain') || hasManifest('langchain')) addBadge('LangChain');

  // Data / Storage
  if (hasPath(/\.prisma$/) || hasManifest('prisma')) addBadge('Prisma');
  if (hasManifest('drizzle-orm')) addBadge('Drizzle');
  if (hasManifest('postgres') || hasManifest('psycopg') || hasManifest('"pg"')) addBadge('PostgreSQL');
  if (hasManifest('redis') || hasManifest('ioredis')) addBadge('Redis');
  if (hasManifest('firebase') || hasManifest('firestore')) addBadge('Firebase');
  if (hasPath(/\.sql$/)) addBadge('SQL');

  // Infra / Tooling
  if (hasPath(/dockerfile|docker-compose/)) addBadge('Docker');
  if (hasPath(/(^|\/)(k8s|kubernetes|helm)\//)) addBadge('Kubernetes');
  if (hasPath(/\.tf$/)) addBadge('Terraform');
  if (hasPath(/vitest\.config\./) || hasManifest('"vitest"')) addBadge('Vitest');
  if (hasPath(/vite\.config\./) || hasManifest('"vite"')) addBadge('Vite');

  // Secondary languages from metadata
  const sortedLangs = Object.entries(metadata.languages || {}).sort((a, b) => b[1] - a[1]);
  for (const [lang] of sortedLangs) {
    if (badges.length >= 10) break;
    addBadge(lang);
  }

  return badges.slice(0, 10);
}

function inferArchitecturePattern(
  files: RepoFileRecord[],
  badges: string[],
  subsystems: SubsystemCluster[]
): string {
  if (files.length === 0) return 'Empty Repository';

  const codeFiles = files.filter((f) => f.layer !== 'tooling');
  const effective = codeFiles.length > 0 ? codeFiles : files;
  const total = effective.length;

  const countByLayer: Record<ArchitectureLayer, number> = {
    client: 0,
    edge: 0,
    orchestration: 0,
    domain: 0,
    infrastructure: 0,
    data: 0,
    tooling: 0,
  };

  for (const f of effective) {
    countByLayer[f.layer]++;
  }

  const badgeSet = new Set(badges.map((b) => b.toLowerCase()));
  const hasAI =
    badgeSet.has('gemini api') ||
    badgeSet.has('openai') ||
    badgeSet.has('anthropic') ||
    badgeSet.has('langchain') ||
    badgeSet.has('pytorch');

  const topDirs = new Set(
    files
      .map((f) => normalizePath(f.path).split('/')[0])
      .filter((d) => Boolean(d) && !d.includes('.'))
  );
  const isMonorepo =
    topDirs.has('packages') ||
    topDirs.has('apps') ||
    ((topDirs.has('studio') || topDirs.has('frontend') || topDirs.has('web') || topDirs.has('client')) &&
      (topDirs.has('backend') || topDirs.has('server') || topDirs.has('api')));

  const clientRatio = countByLayer.client / total;
  const edgeRatio = countByLayer.edge / total;
  const orchRatio = countByLayer.orchestration / total;
  const domainRatio = countByLayer.domain / total;

  if (countByLayer.client > 0 && (countByLayer.edge > 0 || countByLayer.orchestration > 0)) {
    if (hasAI && countByLayer.orchestration > 0) {
      if (badgeSet.has('next.js') && isMonorepo) {
        return 'Hybrid Next.js Studio + AI Orchestration Backend';
      }
      return isMonorepo
        ? 'Monorepo Full-Stack AI Orchestration Engine'
        : 'Full-Stack AI Application & Pipeline';
    }
    if (isMonorepo) {
      return 'Monorepo Full-Stack Client + Service Backend';
    }
    if (badgeSet.has('next.js')) {
      return 'Full-Stack Next.js App Router Architecture';
    }
    return 'Layered Full-Stack Web Application';
  }

  if (clientRatio >= 0.55) {
    if (badgeSet.has('next.js')) return 'Component-Driven Next.js Frontend';
    if (badgeSet.has('react')) return 'Component-Driven React Frontend';
    if (badgeSet.has('flutter')) return 'Layered Flutter Client Application';
    return 'Component-Driven Frontend Architecture';
  }

  if (orchRatio >= 0.28 || (hasAI && countByLayer.orchestration >= 2)) {
    return hasAI
      ? 'Multi-Stage AI Pipeline & Agent Engine'
      : 'Event-Driven Orchestration & Pipeline Architecture';
  }

  if (edgeRatio >= 0.2 && countByLayer.client === 0) {
    return countByLayer.data > 0
      ? 'Layered API Service & Persistence Backend'
      : 'HTTP Gateway & Service Backend';
  }

  if (domainRatio >= 0.48 && subsystems.length >= 3) {
    return 'Modular Core Library & Domain Engine';
  }

  if (isMonorepo) {
    return 'Modular Multi-Package Monorepo';
  }

  return 'Layered Modular Software Architecture';
}

// =============================================================================
// 5. Subsystem Clustering (Target: 4–10 Cohesive Subsystems)
// =============================================================================

interface RawBucket {
  key: string;
  label: string;
  workspacePrefix: string;
  layer: ArchitectureLayer;
  files: RepoFileRecord[];
}

const WRAPPER_DIRS = new Set(['src', 'lib', 'source', 'app', 'pkg', 'internal']);
const WORKSPACE_ROOT_DIRS = new Set([
  'backend',
  'server',
  'api',
  'studio',
  'frontend',
  'web',
  'client',
  'worker',
  'shared',
  'common',
  'core',
  'cli',
  'sdk',
]);
const MULTI_PKG_CONTAINERS = new Set(['packages', 'apps', 'libs', 'services', 'modules', 'crates']);

function extractDomainBucket(file: RepoFileRecord): { key: string; label: string; workspacePrefix: string } {
  const norm = normalizePath(file.path);
  const parts = norm.split('/').filter(Boolean);

  // Root-level file -> group by architectural layer
  if (parts.length <= 1) {
    return {
      key: `root::${file.layer}`,
      label: rootLayerLabel(file.layer),
      workspacePrefix: 'root',
    };
  }

  const first = parts[0];
  const firstLower = first.toLowerCase();

  // Case 1: packages/<pkg>/... or apps/<app>/...
  if (MULTI_PKG_CONTAINERS.has(firstLower) && parts.length >= 3) {
    const pkg = parts[1];
    const remaining = parts.slice(2);
    // If inside <pkg>/src/<domain>/file, keep package + domain when deeper
    if (remaining.length >= 3 && WRAPPER_DIRS.has(remaining[0].toLowerCase())) {
      const domain = remaining[1];
      return {
        key: `${pkg}/${domain}`.toLowerCase(),
        label: `${toTitleCase(pkg)} ${toTitleCase(domain)}`,
        workspacePrefix: pkg.toLowerCase(),
      };
    }
    return {
      key: `${firstLower}/${pkg}`.toLowerCase(),
      label: toTitleCase(pkg),
      workspacePrefix: pkg.toLowerCase(),
    };
  }

  // Case 2: Monorepo workspace like backend/src/ingest/graphBuilder.ts or studio/src/components/Atlas.tsx
  if (WORKSPACE_ROOT_DIRS.has(firstLower)) {
    const rest = parts.slice(1);
    if (rest.length >= 3 && WRAPPER_DIRS.has(rest[0].toLowerCase())) {
      // Check for studio/src/app/api/... -> split api route group cleanly from UI app
      if (rest[1].toLowerCase() === 'app' && rest.length >= 4 && rest[2].toLowerCase() === 'api') {
        return {
          key: `${firstLower}/api`,
          label: `${toTitleCase(first)} API Routes`,
          workspacePrefix: firstLower,
        };
      }
      const domain = rest[1];
      return {
        key: `${firstLower}/${domain}`.toLowerCase(),
        label: formatWorkspaceDomainLabel(first, domain),
        workspacePrefix: firstLower,
      };
    }
    if (rest.length >= 2 && !WRAPPER_DIRS.has(rest[0].toLowerCase())) {
      const domain = rest[0];
      return {
        key: `${firstLower}/${domain}`.toLowerCase(),
        label: formatWorkspaceDomainLabel(first, domain),
        workspacePrefix: firstLower,
      };
    }
    return {
      key: `${firstLower}::${file.layer}`,
      label: `${toTitleCase(first)} Core`,
      workspacePrefix: firstLower,
    };
  }

  // Case 3: Standard src/<domain>/... or app/api/...
  if (WRAPPER_DIRS.has(firstLower)) {
    if (parts.length >= 3) {
      if (firstLower === 'app' && parts[1].toLowerCase() === 'api') {
        return {
          key: 'app/api',
          label: 'API Routes',
          workspacePrefix: 'app',
        };
      }
      const domain = parts[1];
      return {
        key: `src/${domain}`.toLowerCase(),
        label: toTitleCase(domain),
        workspacePrefix: 'src',
      };
    }
    return {
      key: `src::${file.layer}`,
      label: rootLayerLabel(file.layer),
      workspacePrefix: 'src',
    };
  }

  // Case 4: Top-level domain folder (e.g. shared/types.ts, tests/..., docs/..., infra/...)
  return {
    key: firstLower,
    label: toTitleCase(first),
    workspacePrefix: firstLower,
  };
}

function formatWorkspaceDomainLabel(workspace: string, domain: string): string {
  const wTitle = toTitleCase(workspace);
  const dTitle = toTitleCase(domain);
  if (wTitle.toLowerCase() === dTitle.toLowerCase()) return wTitle;
  return `${wTitle} ${dTitle}`;
}

function rootLayerLabel(layer: ArchitectureLayer): string {
  switch (layer) {
    case 'client':
      return 'Client Surface';
    case 'edge':
      return 'API & Entrypoints';
    case 'orchestration':
      return 'Core Pipelines';
    case 'domain':
      return 'Core Domain';
    case 'infrastructure':
      return 'Runtime Infrastructure';
    case 'data':
      return 'Data Layer';
    case 'tooling':
      return 'Project Tooling & Config';
  }
}

function computeDominantLayer(files: RepoFileRecord[]): ArchitectureLayer {
  const weightByLayer = new Map<ArchitectureLayer, number>();
  for (const f of files) {
    // Non-test code carries stronger architectural weight than small config files
    const weight = (f.isTest ? 0.35 : 1) * (1 + Math.log10(f.estimatedTokens + 10));
    weightByLayer.set(f.layer, (weightByLayer.get(f.layer) ?? 0) + weight);
  }
  let bestLayer: ArchitectureLayer = files[0]?.layer ?? 'domain';
  let bestWeight = -1;
  for (const layer of LAYER_ORDER) {
    const w = weightByLayer.get(layer) ?? 0;
    if (w > bestWeight) {
      bestWeight = w;
      bestLayer = layer;
    }
  }
  return bestLayer;
}

function bucketSignificance(bucket: RawBucket): number {
  let centralitySum = 0;
  let tokenSum = 0;
  let nonToolingCount = 0;
  for (const f of bucket.files) {
    centralitySum += f.centrality;
    tokenSum += f.estimatedTokens;
    if (f.layer !== 'tooling') nonToolingCount++;
  }
  const layerWeight = bucket.layer === 'tooling' ? 0.45 : 1.0;
  return (
    layerWeight *
    (centralitySum * 25 + nonToolingCount * 4 + bucket.files.length * 1.5 + Math.log10(tokenSum + 10) * 5)
  );
}

function buildSubsystemClusters(
  files: RepoFileRecord[],
  outAdj: Map<string, Set<string>>,
  circularEdgeKeys: Set<string>
): { subsystems: SubsystemCluster[]; fileToSubsystemId: Map<string, string> } {
  if (files.length === 0) {
    return { subsystems: [], fileToSubsystemId: new Map() };
  }

  // Step 1: Initial semantic grouping by top-level architectural domain directory
  const bucketMap = new Map<string, RawBucket>();
  for (const file of files) {
    const { key, label, workspacePrefix } = extractDomainBucket(file);
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        key,
        label,
        workspacePrefix,
        layer: file.layer,
        files: [],
      };
      bucketMap.set(key, bucket);
    }
    bucket.files.push(file);
  }

  let buckets = Array.from(bucketMap.values());
  for (const b of buckets) {
    b.layer = computeDominantLayer(b.files);
  }

  // Step 2: Consolidate down to <= 10 cohesive subsystems while preserving layer diversity
  const MAX_SUBSYSTEMS = 10;
  if (buckets.length > MAX_SUBSYSTEMS) {
    // First reserve the strongest bucket from each populated architectural layer (prioritizing non-tooling)
    const sortedAll = [...buckets].sort((a, b) => bucketSignificance(b) - bucketSignificance(a));
    const retained: RawBucket[] = [];
    const retainedKeys = new Set<string>();

    const layerPriority: ArchitectureLayer[] = [
      'client',
      'edge',
      'orchestration',
      'domain',
      'data',
      'infrastructure',
      'tooling',
    ];

    for (const layer of layerPriority) {
      if (retained.length >= MAX_SUBSYSTEMS) break;
      const bestForLayer = sortedAll.find((b) => b.layer === layer && !retainedKeys.has(b.key));
      if (bestForLayer) {
        retained.push(bestForLayer);
        retainedKeys.add(bestForLayer.key);
      }
    }

    for (const b of sortedAll) {
      if (retained.length >= MAX_SUBSYSTEMS) break;
      if (!retainedKeys.has(b.key)) {
        retained.push(b);
        retainedKeys.add(b.key);
      }
    }

    const overflow = sortedAll.filter((b) => !retainedKeys.has(b.key));

    // Pre-index file -> retained bucket index for affinity scoring
    const fileToRetained = new Map<string, number>();
    retained.forEach((b, idx) => {
      for (const f of b.files) fileToRetained.set(f.path, idx);
    });

    for (const extra of overflow) {
      let bestIdx = -1;
      let bestScore = -1;

      for (let i = 0; i < retained.length; i++) {
        const cand = retained[i];
        let score = 0;
        if (cand.layer === extra.layer) score += 14;
        if (cand.workspacePrefix === extra.workspacePrefix) score += 10;

        // Dependency affinity between extra and cand
        let edgeAffinity = 0;
        for (const f of extra.files) {
          for (const target of outAdj.get(f.path) ?? []) {
            if (fileToRetained.get(target) === i) edgeAffinity++;
          }
        }
        score += Math.min(edgeAffinity, 10) * 3;

        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      const targetBucket = retained[bestIdx >= 0 ? bestIdx : retained.length - 1];
      targetBucket.files.push(...extra.files);
      for (const f of extra.files) {
        fileToRetained.set(f.path, bestIdx >= 0 ? bestIdx : retained.length - 1);
      }
      targetBucket.layer = computeDominantLayer(targetBucket.files);
    }

    buckets = retained;
  }

  // Step 3: Expand up to >= 4 cohesive subsystems when repo has >= 4 files but flat directory layout
  const MIN_SUBSYSTEMS = Math.min(4, files.length);
  let splitGuard = 0;
  while (buckets.length < MIN_SUBSYSTEMS && splitGuard < 12) {
    splitGuard++;

    // Try splitting the largest bucket that spans multiple ArchitectureLayers
    let splitPerformed = false;
    buckets.sort((a, b) => b.files.length - a.files.length);

    for (let i = 0; i < buckets.length; i++) {
      const candidate = buckets[i];
      if (candidate.files.length < 2) continue;

      const byLayer = new Map<ArchitectureLayer, RepoFileRecord[]>();
      for (const f of candidate.files) {
        const list = byLayer.get(f.layer) ?? [];
        list.push(f);
        byLayer.set(f.layer, list);
      }

      if (byLayer.size >= 2) {
        buckets.splice(i, 1);
        for (const [layer, layerFiles] of byLayer.entries()) {
          buckets.push({
            key: `${candidate.key}::${layer}`,
            label:
              candidate.workspacePrefix === 'root' || candidate.workspacePrefix === 'src'
                ? rootLayerLabel(layer)
                : `${toTitleCase(candidate.workspacePrefix)} ${rootLayerLabel(layer)}`,
            workspacePrefix: candidate.workspacePrefix,
            layer,
            files: layerFiles,
          });
        }
        splitPerformed = true;
        break;
      }
    }

    if (splitPerformed) continue;

    // Otherwise split the largest bucket by its deepest distinct subdirectory or file role
    const largestIdx = buckets.findIndex((b) => b.files.length >= 2);
    if (largestIdx === -1) break;

    const largest = buckets[largestIdx];
    const bySubdir = new Map<string, RepoFileRecord[]>();
    for (const f of largest.files) {
      const dir = posixDirname(f.path);
      const list = bySubdir.get(dir) ?? [];
      list.push(f);
      bySubdir.set(dir, list);
    }

    if (bySubdir.size >= 2) {
      buckets.splice(largestIdx, 1);
      for (const [dir, dirFiles] of bySubdir.entries()) {
        const dirLeaf = dir ? posixBasename(dir) : 'root';
        buckets.push({
          key: `${largest.key}::${dirLeaf}`,
          label: `${toTitleCase(dirLeaf)} Module`,
          workspacePrefix: largest.workspacePrefix,
          layer: computeDominantLayer(dirFiles),
          files: dirFiles,
        });
      }
    } else {
      // Split single flat directory cleanly by centrality / entrypoint vs supporting files
      const sorted = [...largest.files].sort((a, b) => b.centrality - a.centrality || a.path.localeCompare(b.path));
      const mid = Math.max(1, Math.ceil(sorted.length / 2));
      const primaryHalf = sorted.slice(0, mid);
      const secondaryHalf = sorted.slice(mid);
      if (secondaryHalf.length === 0) break;

      buckets.splice(largestIdx, 1);
      buckets.push({
        key: `${largest.key}::core`,
        label: `${largest.label} Core`,
        workspacePrefix: largest.workspacePrefix,
        layer: computeDominantLayer(primaryHalf),
        files: primaryHalf,
      });
      buckets.push({
        key: `${largest.key}::support`,
        label: `${largest.label} Support`,
        workspacePrefix: largest.workspacePrefix,
        layer: computeDominantLayer(secondaryHalf),
        files: secondaryHalf,
      });
    }
  }

  // If splitting accidentally pushed us slightly over 10, trim by merging smallest two matching buckets
  while (buckets.length > MAX_SUBSYSTEMS) {
    buckets.sort((a, b) => bucketSignificance(b) - bucketSignificance(a));
    const tail = buckets.pop()!;
    const match = buckets.find((b) => b.layer === tail.layer) ?? buckets[buckets.length - 1];
    match.files.push(...tail.files);
    match.layer = computeDominantLayer(match.files);
  }

  // Sort subsystems top-to-bottom by layer rank, then descending by total tokens
  buckets.sort((a, b) => {
    const rankDiff = LAYER_RANK[a.layer] - LAYER_RANK[b.layer];
    if (rankDiff !== 0) return rankDiff;
    const tokA = a.files.reduce((s, f) => s + f.estimatedTokens, 0);
    const tokB = b.files.reduce((s, f) => s + f.estimatedTokens, 0);
    return tokB - tokA;
  });

  // Deduplicate subsystem names & IDs, assign crisp Obsidian Cobalt palette colors
  const usedIds = new Set<string>();
  const usedNames = new Map<string, number>();
  const layerColorCursor = new Map<ArchitectureLayer, number>();
  const fileToSubsystemId = new Map<string, string>();
  const subsystems: SubsystemCluster[] = [];

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const baseName = bucket.label.trim() || rootLayerLabel(bucket.layer);
    const nameCount = usedNames.get(baseName.toLowerCase()) ?? 0;
    usedNames.set(baseName.toLowerCase(), nameCount + 1);
    const finalName = nameCount === 0 ? baseName : `${baseName} (${toTitleCase(bucket.layer)})`;

    let id = `sub-${toSlug(finalName)}`;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `sub-${toSlug(finalName)}-${suffix++}`;
    }
    usedIds.add(id);

    const variants = LAYER_PALETTE_VARIANTS[bucket.layer];
    const cursor = layerColorCursor.get(bucket.layer) ?? 0;
    layerColorCursor.set(bucket.layer, cursor + 1);
    const color = variants[cursor % variants.length] ?? SUBSYSTEM_PALETTE[i % SUBSYSTEM_PALETTE.length];

    const sortedFiles = [...bucket.files].sort(
      (a, b) => b.centrality - a.centrality || b.estimatedTokens - a.estimatedTokens || a.path.localeCompare(b.path)
    );
    const filePaths = sortedFiles.map((f) => f.path);
    const fileSet = new Set(filePaths);

    for (const fp of filePaths) {
      fileToSubsystemId.set(fp, id);
    }

    const totalTokens = sortedFiles.reduce((sum, f) => sum + f.estimatedTokens, 0);
    const explicitEntrypoints = sortedFiles.filter((f) => f.isEntrypoint).map((f) => f.path);
    const entrypointPaths =
      explicitEntrypoints.length > 0
        ? explicitEntrypoints.slice(0, 4)
        : sortedFiles.slice(0, Math.min(2, sortedFiles.length)).map((f) => f.path);

    // Compute internal/external coupling & circularity for real invariants
    let internalCircular = 0;
    let inboundExternal = 0;
    let outboundExternal = 0;
    for (const f of sortedFiles) {
      for (const target of outAdj.get(f.path) ?? []) {
        if (fileSet.has(target)) {
          if (circularEdgeKeys.has(`${f.path}::${target}`)) internalCircular++;
        } else {
          outboundExternal++;
        }
      }
      inboundExternal += Math.max(0, f.fanIn);
    }

    const topFileNames = sortedFiles
      .slice(0, 3)
      .map((f) => stripExtension(f.name))
      .join(', ');

    const topExports = sortedFiles
      .flatMap((f) =>
        f.symbols.filter((s) => s.exported).map((s) => s.name)
      )
      .filter((name, idx, arr) => arr.indexOf(name) === idx)
      .slice(0, 4);

    const tagline = `${STRATUM_METADATA[bucket.layer].title} subsystem anchored by ${topFileNames} (${sortedFiles.length} ${
      sortedFiles.length === 1 ? 'file' : 'files'
    }, ${formatTokensCompact(totalTokens)} tokens).`;

    const summaryBullets: string[] = [
      `Spans ${sortedFiles.length} ${sortedFiles.length === 1 ? 'module' : 'modules'} totaling ${formatTokensCompact(
        totalTokens
      )} estimated tokens in the ${bucket.layer} stratum.`,
    ];
    if (topExports.length > 0) {
      summaryBullets.push(`Primary exported contracts: ${topExports.join(', ')}.`);
    }
    summaryBullets.push(
      `Coupling profile: ${outboundExternal} outbound cross-subsystem ${
        outboundExternal === 1 ? 'link' : 'links'
      }, peak fan-in ${Math.max(...sortedFiles.map((f) => f.fanIn), 0)}.`
    );

    const invariants: string[] = [];
    if (internalCircular === 0) {
      invariants.push('Acyclic internal dependency graph (0 intra-subsystem circular imports).');
    } else {
      invariants.push(`Contains ${internalCircular} circular internal dependency edge(s) requiring care.`);
    }
    if (outboundExternal === 0 && inboundExternal > 0) {
      invariants.push('Pure foundation leaf: consumed upstream without outward cross-subsystem imports.');
    } else if (explicitEntrypoints.length > 0) {
      invariants.push(
        `Exposes ${explicitEntrypoints.length} explicit entrypoint(s) anchoring external execution flow.`
      );
    } else {
      invariants.push(`Maintains ${bucket.layer}-layer separation anchored at ${entrypointPaths[0] ?? filePaths[0]}.`);
    }

    subsystems.push({
      id,
      name: finalName,
      tagline,
      layer: bucket.layer,
      color,
      nodeIds: [], // Populated once AtlasNodes are promoted
      filePaths,
      entrypointPaths,
      totalTokens,
      summaryBullets,
      invariants,
    });
  }

  return { subsystems, fileToSubsystemId };
}

// =============================================================================
// 6. Visual Atlas Promotion (<= 24 High-Signal AtlasNodes & Directed AtlasEdges)
// =============================================================================

function fileVisualSignalScore(file: RepoFileRecord): number {
  const exportedSymbols = file.symbols.filter((s) => s.exported).length || file.exports.length;
  const layerBonus: Record<ArchitectureLayer, number> = {
    orchestration: 10,
    edge: 10,
    domain: 7,
    client: 6,
    data: 6,
    infrastructure: 4,
    tooling: -14,
  };
  const isTinyBarrel =
    /^index\.(ts|tsx|js|jsx|mjs)$/.test(file.name.toLowerCase()) && file.lineCount < 20 && !file.isEntrypoint;

  return (
    file.centrality * 48 +
    Math.min(file.fanIn, 15) * 2.6 +
    Math.min(file.fanOut, 15) * 1.9 +
    (file.isEntrypoint ? 18 : 0) +
    Math.min(exportedSymbols, 10) * 1.3 +
    Math.min(Math.log10(file.estimatedTokens + 10), 4) * 3.2 +
    layerBonus[file.layer] +
    (file.isTest ? -36 : 0) +
    (file.isConfig ? -18 : 0) +
    (isTinyBarrel ? -8 : 0)
  );
}

function inferAtlasNodeKind(file: RepoFileRecord): AtlasNode['kind'] {
  const lowerPath = normalizePath(file.path).toLowerCase();
  const base = posixBasename(lowerPath);
  const sample = (file.content ?? '').slice(0, 3000).toLowerCase();

  if (file.layer === 'client') return 'ui';
  if (file.layer === 'edge') return 'api';
  if (file.layer === 'data') return 'store';
  if (file.isConfig || file.layer === 'tooling') return 'config';

  if (
    /(agent|oracle|livevoice|forensics|assistant|copilot)/.test(lowerPath) ||
    (file.layer === 'orchestration' && /\b(interactions\.create|live\.connect|agent)\b/.test(sample))
  ) {
    return 'agent';
  }

  if (file.layer === 'orchestration' || /(pipeline|ingest|workflow|builder|compiler|synthesi|worker|queue)/.test(base)) {
    return 'pipeline';
  }

  if (
    file.layer === 'infrastructure' ||
    /(service|client|adapter|provider|fetcher|gateway)/.test(base)
  ) {
    return 'service';
  }

  return 'module';
}

function buildHumanNodeLabel(file: RepoFileRecord, allPromoted: RepoFileRecord[]): string {
  const stem = stripExtension(file.name);
  const stemLower = stem.toLowerCase();
  const dirParts = normalizePath(posixDirname(file.path)).split('/').filter(Boolean);
  const parentDir = dirParts[dirParts.length - 1] ?? '';

  // Generic Next.js / module filenames need parent directory context
  const genericNames = new Set([
    'index',
    'page',
    'layout',
    'route',
    'loading',
    'error',
    'main',
    'app',
    'mod',
    '__init__',
    'types',
    'schema',
    'config',
    'client',
    'server',
    'store',
    'utils',
    'helpers',
    'constants',
  ]);

  const wrapperContextAllowed = new Set(['page', 'layout', 'loading', 'error', 'route', 'server', 'main', 'index']);
  if (
    genericNames.has(stemLower) &&
    parentDir &&
    (!WRAPPER_DIRS.has(parentDir.toLowerCase()) ||
      (wrapperContextAllowed.has(stemLower) && parentDir.toLowerCase() !== 'src'))
  ) {
    const combined = `${toTitleCase(parentDir)} ${toTitleCase(stem === '__init__' ? 'Package' : stem)}`;
    return combined;
  }

  const baseLabel = toTitleCase(stem === '__init__' ? parentDir || 'Package' : stem);

  // Disambiguate duplicate labels across promoted files
  const collisions = allPromoted.filter(
    (other) => other.path !== file.path && stripExtension(other.name).toLowerCase() === stemLower
  );
  if (collisions.length > 0 && parentDir) {
    return `${toTitleCase(parentDir)} ${baseLabel}`;
  }

  return baseLabel;
}

function extractKeySymbols(files: RepoFileRecord[]): string[] {
  const symbols: string[] = [];
  const seen = new Set<string>();

  const priorityOrder: Record<string, number> = {
    route: 0,
    component: 1,
    class: 2,
    function: 3,
    interface: 4,
    type: 5,
    method: 6,
    const: 7,
    module: 8,
  };

  const candidates = files.flatMap((f) =>
    f.symbols.map((s) => ({
      name: s.name,
      exported: s.exported,
      rank: priorityOrder[s.kind] ?? 9,
    }))
  );

  candidates.sort((a, b) => {
    if (a.exported !== b.exported) return a.exported ? -1 : 1;
    return a.rank - b.rank;
  });

  for (const sym of candidates) {
    if (symbols.length >= 6) break;
    if (!seen.has(sym.name) && sym.name.length > 1) {
      seen.add(sym.name);
      symbols.push(sym.name);
    }
  }

  // Fallback to raw export names if AST symbols were sparse
  if (symbols.length < 4) {
    for (const f of files) {
      for (const exp of f.exports) {
        if (symbols.length >= 6) break;
        const clean = exp.trim();
        if (clean && !seen.has(clean) && clean !== 'default') {
          seen.add(clean);
          symbols.push(clean);
        }
      }
    }
  }

  return symbols;
}

function inferEdgeKind(
  sourceFile: RepoFileRecord | undefined,
  targetFile: RepoFileRecord | undefined
): DependencyEdge['kind'] {
  if (!sourceFile || !targetFile) return 'import';
  const targetLower = normalizePath(targetFile.path).toLowerCase();
  const sourceLower = normalizePath(sourceFile.path).toLowerCase();

  if (
    targetFile.layer === 'data' ||
    /(^|\/|_)(store|cache|db|database|prisma|sql|repository|repositories|storage|dao)(\.|\/|_|$)/.test(targetLower)
  ) {
    return 'storage';
  }
  if (
    (sourceFile.layer === 'client' && targetFile.layer === 'edge') ||
    targetFile.layer === 'edge' ||
    /(^|\/|_)(api|http|fetch|route|routes|endpoint|controller)(\.|\/|_|$)/.test(targetLower)
  ) {
    return 'http';
  }
  if (
    /(event|stream|ws|socket|queue|pubsub|live)/.test(targetLower) ||
    /(event|stream|ws|socket)/.test(sourceLower)
  ) {
    return 'event';
  }
  if (sourceFile.layer === 'orchestration' && (targetFile.layer === 'domain' || targetFile.layer === 'infrastructure')) {
    return 'data_flow';
  }
  return 'import';
}

function isContractOrConfigTarget(node: AtlasNode): boolean {
  const lower = `${node.primaryFile} ${node.label}`.toLowerCase();
  return (
    node.kind === 'config' ||
    /(^|\/)(types|contracts|interfaces|constants|schema|env|config)\.[^/]+$/.test(node.primaryFile.toLowerCase()) ||
    /\btypes\b/.test(lower)
  );
}

function mapToAtlasEdgeKind(
  sourceNode: AtlasNode,
  targetNode: AtlasNode,
  depKinds: Set<DependencyEdge['kind']>
): { kind: AtlasEdge['kind']; protocol?: string; verb: string } {
  if (/(^|\/)(types|contracts|interfaces)\.[^/]+$/.test(targetNode.primaryFile.toLowerCase())) {
    return { kind: 'data', protocol: 'Typed Contract', verb: 'uses types' };
  }
  if (depKinds.has('http') || (sourceNode.layer === 'client' && targetNode.layer === 'edge')) {
    return { kind: 'http', protocol: 'HTTP/JSON', verb: 'requests' };
  }
  if (depKinds.has('storage') || targetNode.layer === 'data') {
    return { kind: 'storage', protocol: 'Store/IO', verb: 'reads/writes' };
  }
  if (depKinds.has('event') || sourceNode.kind === 'agent' || targetNode.kind === 'agent') {
    return { kind: 'stream', protocol: 'Stream/Event', verb: 'streams to' };
  }
  if (sourceNode.layer === 'edge' || sourceNode.layer === 'orchestration') {
    return { kind: 'control', protocol: 'Call', verb: 'orchestrates' };
  }
  if (depKinds.has('data_flow')) {
    return { kind: 'data', protocol: 'Typed Contract', verb: 'uses contracts' };
  }
  return { kind: 'dependency', protocol: 'Module', verb: 'imports' };
}

function computeLayeredLayout(nodes: AtlasNode[], edges: AtlasEdge[]): void {
  if (nodes.length === 0) return;

  // Group nodes by architectural layer top-to-bottom
  const rows = new Map<ArchitectureLayer, AtlasNode[]>();
  for (const layer of LAYER_ORDER) {
    rows.set(layer, []);
  }
  for (const node of nodes) {
    rows.get(node.layer)!.push(node);
  }

  // Initial horizontal ordering within each row: subsystem grouping, then centrality descending
  const activeLayers = LAYER_ORDER.filter((layer) => (rows.get(layer)?.length ?? 0) > 0);
  const xIndexById = new Map<string, number>();

  for (const layer of activeLayers) {
    const row = rows.get(layer)!;
    row.sort((a, b) => {
      const subCmp = a.subsystemId.localeCompare(b.subsystemId);
      if (subCmp !== 0) return subCmp;
      return b.centrality - a.centrality || a.label.localeCompare(b.label);
    });
    row.forEach((n, idx) => xIndexById.set(n.id, idx));
  }

  // Build neighbor lookup for 1-pass barycenter crossing reduction
  const neighborsById = new Map<string, string[]>();
  for (const n of nodes) neighborsById.set(n.id, []);
  for (const e of edges) {
    neighborsById.get(e.source)?.push(e.target);
    neighborsById.get(e.target)?.push(e.source);
  }

  for (let rowIdx = 1; rowIdx < activeLayers.length; rowIdx++) {
    const row = rows.get(activeLayers[rowIdx])!;
    if (row.length <= 1) continue;
    const barycenter = new Map<string, number>();
    for (const node of row) {
      const nbrs = neighborsById.get(node.id) ?? [];
      const connectedPositions = nbrs
        .map((id) => xIndexById.get(id))
        .filter((v): v is number => v !== undefined);
      if (connectedPositions.length > 0) {
        const avg = connectedPositions.reduce((s, v) => s + v, 0) / connectedPositions.length;
        barycenter.set(node.id, avg);
      } else {
        barycenter.set(node.id, xIndexById.get(node.id) ?? 0);
      }
    }
    row.sort((a, b) => (barycenter.get(a.id) ?? 0) - (barycenter.get(b.id) ?? 0));
    row.forEach((n, idx) => xIndexById.set(n.id, idx));
  }

  // Assign crisp pixel coordinates centered around X = 640
  const ROW_GAP = 210;
  const COL_GAP = 290;
  const TOP_MARGIN = 90;
  const CENTER_X = 640;

  activeLayers.forEach((layer, rowIndex) => {
    const row = rows.get(layer)!;
    const totalWidth = (row.length - 1) * COL_GAP;
    const startX = Math.max(120, Math.round(CENTER_X - totalWidth / 2));
    const y = TOP_MARGIN + rowIndex * ROW_GAP;

    row.forEach((node, colIndex) => {
      node.x = startX + colIndex * COL_GAP;
      node.y = y;
    });
  });
}

function buildAtlasNodesAndEdges(
  files: RepoFileRecord[],
  dependencyEdges: DependencyEdge[],
  subsystems: SubsystemCluster[],
  fileToSubsystemId: Map<string, string>,
  fileByPath: Map<string, RepoFileRecord>
): { nodes: AtlasNode[]; edges: AtlasEdge[]; fileToAtlasNodeId: Map<string, string> } {
  if (files.length === 0) {
    return { nodes: [], edges: [], fileToAtlasNodeId: new Map() };
  }

  const MAX_ATLAS_NODES = 24;
  const targetCount = Math.min(MAX_ATLAS_NODES, files.length);

  // Score all files for promotion
  const scoreByPath = new Map<string, number>();
  for (const f of files) {
    scoreByPath.set(f.path, fileVisualSignalScore(f));
  }

  const promotedSet = new Set<string>();
  const promotedPerSubsystem = new Map<string, number>();
  const promotedFiles: RepoFileRecord[] = [];

  const promote = (f: RepoFileRecord) => {
    if (promotedSet.has(f.path)) return;
    promotedSet.add(f.path);
    promotedFiles.push(f);
    const subId = fileToSubsystemId.get(f.path) ?? '';
    promotedPerSubsystem.set(subId, (promotedPerSubsystem.get(subId) ?? 0) + 1);
  };

  // Pass 1: Guarantee every SubsystemCluster has at least 1 anchor AtlasNode
  for (const sub of subsystems) {
    if (promotedFiles.length >= targetCount) break;
    const candidates = sub.filePaths
      .map((p) => fileByPath.get(p))
      .filter((f): f is RepoFileRecord => f !== undefined)
      .sort((a, b) => (scoreByPath.get(b.path) ?? 0) - (scoreByPath.get(a.path) ?? 0));
    if (candidates.length > 0) {
      promote(candidates[0]);
    }
  }

  // Pass 1b: Guarantee every populated non-tooling ArchitectureLayer has at least 1 promoted node
  const coveredLayers = new Set<ArchitectureLayer>(promotedFiles.map((f) => f.layer));
  for (const layer of LAYER_ORDER) {
    if (layer === 'tooling' || coveredLayers.has(layer) || promotedFiles.length >= targetCount) continue;
    const bestInLayer = files
      .filter((f) => f.layer === layer && !promotedSet.has(f.path))
      .sort((a, b) => (scoreByPath.get(b.path) ?? 0) - (scoreByPath.get(a.path) ?? 0))[0];
    if (bestInLayer) {
      promote(bestInLayer);
      coveredLayers.add(layer);
    }
  }

  // Pass 2: Fill up to 24 highest-signal modules with soft per-subsystem cap for balanced coverage
  const softCapPerSubsystem = Math.max(3, Math.ceil(targetCount / Math.max(subsystems.length, 1)) + 2);
  const remainingRanked = files
    .filter((f) => !promotedSet.has(f.path))
    .sort((a, b) => (scoreByPath.get(b.path) ?? 0) - (scoreByPath.get(a.path) ?? 0) || a.path.localeCompare(b.path));

  for (const f of remainingRanked) {
    if (promotedFiles.length >= targetCount) break;
    const subId = fileToSubsystemId.get(f.path) ?? '';
    if ((promotedPerSubsystem.get(subId) ?? 0) >= softCapPerSubsystem) continue;
    promote(f);
  }

  // Pass 3: If soft cap left slots open, fill remaining slots with best available files
  for (const f of remainingRanked) {
    if (promotedFiles.length >= targetCount) break;
    promote(f);
  }

  // Create deterministic unique node IDs and map every repo file to its representative AtlasNode
  const usedNodeIds = new Set<string>();
  const primaryPathToNodeId = new Map<string, string>();
  const nodeFilesMap = new Map<string, RepoFileRecord[]>();
  const primaryFileByNodeId = new Map<string, RepoFileRecord>();
  const labelByNodeId = new Map<string, string>();

  for (const pf of promotedFiles) {
    const label = buildHumanNodeLabel(pf, promotedFiles);
    let nodeId = `node-${toSlug(label)}`;
    let suffix = 2;
    while (usedNodeIds.has(nodeId)) {
      nodeId = `node-${toSlug(label)}-${suffix++}`;
    }
    usedNodeIds.add(nodeId);
    primaryPathToNodeId.set(pf.path, nodeId);
    primaryFileByNodeId.set(nodeId, pf);
    labelByNodeId.set(nodeId, label);
    nodeFilesMap.set(nodeId, [pf]);
  }

  // Absorb unpromoted sibling files into the closest promoted node within the same subsystem
  const fileToAtlasNodeId = new Map<string, string>();
  for (const [p, nodeId] of primaryPathToNodeId.entries()) {
    fileToAtlasNodeId.set(p, nodeId);
  }

  const promotedBySubsystem = new Map<string, RepoFileRecord[]>();
  for (const pf of promotedFiles) {
    const subId = fileToSubsystemId.get(pf.path) ?? '';
    const list = promotedBySubsystem.get(subId) ?? [];
    list.push(pf);
    promotedBySubsystem.set(subId, list);
  }

  for (const f of files) {
    if (fileToAtlasNodeId.has(f.path)) continue;
    const subId = fileToSubsystemId.get(f.path) ?? '';
    const subPromoted = promotedBySubsystem.get(subId) ?? promotedFiles;
    const fileDir = posixDirname(f.path);

    // Prefer a promoted node in the exact same directory or sharing the longest directory prefix
    let bestAnchor = subPromoted[0];
    let bestPrefixLen = -1;
    for (const anchor of subPromoted) {
      const anchorDir = posixDirname(anchor.path);
      if (anchorDir === fileDir) {
        bestAnchor = anchor;
        break;
      }
      const prefixLen = commonPathPrefixLength(fileDir, anchorDir);
      if (prefixLen > bestPrefixLen) {
        bestPrefixLen = prefixLen;
        bestAnchor = anchor;
      }
    }

    const targetNodeId = primaryPathToNodeId.get(bestAnchor.path)!;
    fileToAtlasNodeId.set(f.path, targetNodeId);
    nodeFilesMap.get(targetNodeId)!.push(f);
  }

  // Construct AtlasNodes (first pass before edge-derived inputs/outputs)
  const nodes: AtlasNode[] = [];
  const nodeById = new Map<string, AtlasNode>();
  const subsystemById = new Map(subsystems.map((s) => [s.id, s]));

  for (const pf of promotedFiles) {
    const nodeId = primaryPathToNodeId.get(pf.path)!;
    const groupFiles = nodeFilesMap.get(nodeId) ?? [pf];
    const subsystemId = fileToSubsystemId.get(pf.path) ?? subsystems[0]?.id ?? 'sub-core';
    const label = labelByNodeId.get(nodeId) ?? toTitleCase(stripExtension(pf.name));
    const kind = inferAtlasNodeKind(pf);
    const keySymbols = extractKeySymbols(groupFiles);
    const estimatedTokens = groupFiles.reduce((sum, f) => sum + f.estimatedTokens, 0);
    const maxCentrality = Math.max(...groupFiles.map((f) => f.centrality));
    const totalFanIn = Math.max(pf.fanIn, ...groupFiles.map((f) => f.fanIn));
    const totalFanOut = Math.max(pf.fanOut, ...groupFiles.map((f) => f.fanOut));
    const dirDisplay = posixDirname(pf.path) || 'root';
    const subtitle =
      groupFiles.length > 1
        ? `${dirDisplay} · ${groupFiles.length} modules`
        : `${dirDisplay}/${pf.name}`;

    const firstExportedSym = pf.symbols.find((s) => s.exported);
    const lineStart = firstExportedSym?.line ?? 1;
    const lineEnd = Math.max(lineStart, Math.min(pf.lineCount || lineStart, firstExportedSym?.endLine ?? pf.lineCount ?? 40));

    const node: AtlasNode = {
      id: nodeId,
      label,
      subtitle,
      subsystemId,
      layer: pf.layer,
      kind,
      filePaths: groupFiles.map((f) => f.path),
      primaryFile: pf.path,
      lineStart,
      lineEnd,
      estimatedTokens,
      centrality: Number(maxCentrality.toFixed(4)),
      fanIn: totalFanIn,
      fanOut: totalFanOut,
      keySymbols,
      visualBrief: '', // Enriched right after edges are aggregated
      inputs: [],
      outputs: [],
    };

    nodes.push(node);
    nodeById.set(nodeId, node);

    const sub = subsystemById.get(subsystemId);
    if (sub && !sub.nodeIds.includes(nodeId)) {
      sub.nodeIds.push(nodeId);
    }
  }

  // Project file-level DependencyEdges up to directed AtlasEdges
  interface EdgeAgg {
    source: string;
    target: string;
    weight: number;
    kinds: Set<DependencyEdge['kind']>;
    hasCircular: boolean;
  }

  const edgeAggMap = new Map<string, EdgeAgg>();
  for (const dep of dependencyEdges) {
    const srcNodeId = fileToAtlasNodeId.get(dep.source);
    const dstNodeId = fileToAtlasNodeId.get(dep.target);
    if (!srcNodeId || !dstNodeId || srcNodeId === dstNodeId) continue;

    const key = `${srcNodeId}-->${dstNodeId}`;
    let agg = edgeAggMap.get(key);
    if (!agg) {
      agg = {
        source: srcNodeId,
        target: dstNodeId,
        weight: 0,
        kinds: new Set<DependencyEdge['kind']>(),
        hasCircular: false,
      };
      edgeAggMap.set(key, agg);
    }
    agg.weight += dep.weight;
    agg.kinds.add(dep.kind);
    if (dep.isCircular) agg.hasCircular = true;
  }

  let edges: AtlasEdge[] = [];
  let edgeSeq = 1;
  for (const agg of edgeAggMap.values()) {
    const srcNode = nodeById.get(agg.source);
    const dstNode = nodeById.get(agg.target);
    if (!srcNode || !dstNode) continue;

    const { kind, protocol, verb } = mapToAtlasEdgeKind(srcNode, dstNode, agg.kinds);
    const label = agg.hasCircular ? `${verb} (cycle)` : verb;

    edges.push({
      id: `edge-${edgeSeq++}`,
      source: agg.source,
      target: agg.target,
      label,
      kind,
      protocol,
      weight: agg.weight,
      isHotPath: false,
    });
  }

  // Keep canvas readable if edge density exceeds 64 edges, without orphaning any connected node
  const MAX_ATLAS_EDGES = 64;
  if (edges.length > MAX_ATLAS_EDGES) {
    const edgeScore = (e: AtlasEdge): number => {
      const s = nodeById.get(e.source);
      const t = nodeById.get(e.target);
      return ((s?.centrality ?? 0) + (t?.centrality ?? 0)) * 10 + Math.min(e.weight, 8) * 2;
    };
    const sortedEdges = [...edges].sort((a, b) => edgeScore(b) - edgeScore(a));
    const kept = new Set<string>();
    const hasOut = new Set<string>();
    const hasIn = new Set<string>();

    // First preserve strongest outgoing & incoming edge for every node
    for (const e of sortedEdges) {
      if (!hasOut.has(e.source) || !hasIn.has(e.target)) {
        kept.add(e.id);
        hasOut.add(e.source);
        hasIn.add(e.target);
      }
    }
    for (const e of sortedEdges) {
      if (kept.size >= MAX_ATLAS_EDGES) break;
      kept.add(e.id);
    }
    edges = sortedEdges.filter((e) => kept.has(e.id));
  }

  // Mark isHotPath on top high-centrality / behavioral directed edges
  if (edges.length > 0) {
    const scoredEdges = edges
      .map((edge) => {
        const s = nodeById.get(edge.source);
        const t = nodeById.get(edge.target);
        const centralityTerm = ((s?.centrality ?? 0) + (t?.centrality ?? 0)) * 0.45;
        const weightTerm = Math.min(edge.weight, 6) * 0.1;
        const semanticBonus =
          edge.kind === 'http' || edge.kind === 'control' || edge.kind === 'stream' || edge.kind === 'storage'
            ? 0.24
            : 0.04;
        const behavioralBonus = t && !isContractOrConfigTarget(t) ? 0.28 : -0.18;
        return { edge, score: centralityTerm + weightTerm + semanticBonus + behavioralBonus };
      })
      .sort((a, b) => b.score - a.score);

    const hotCount = Math.max(1, Math.min(10, Math.ceil(edges.length * 0.28)));
    for (let i = 0; i < hotCount && i < scoredEdges.length; i++) {
      scoredEdges[i].edge.isHotPath = true;
    }
  }

  // Enrich each AtlasNode's visualBrief, inputs, and outputs from real connected neighbors & symbols
  const inboundByNode = new Map<string, AtlasEdge[]>();
  const outboundByNode = new Map<string, AtlasEdge[]>();
  for (const n of nodes) {
    inboundByNode.set(n.id, []);
    outboundByNode.set(n.id, []);
  }
  for (const e of edges) {
    inboundByNode.get(e.target)?.push(e);
    outboundByNode.get(e.source)?.push(e);
  }

  for (const node of nodes) {
    const pf = primaryFileByNodeId.get(node.id)!;
    const inEdges = (inboundByNode.get(node.id) ?? []).sort((a, b) => b.weight - a.weight);
    const outEdges = (outboundByNode.get(node.id) ?? []).sort((a, b) => b.weight - a.weight);

    const inputs: string[] = [];
    for (const ie of inEdges.slice(0, 3)) {
      const caller = nodeById.get(ie.source);
      if (caller) inputs.push(`Invoked by ${caller.label} (${ie.label})`);
    }
    if (inputs.length === 0) {
      if (node.layer === 'client') inputs.push('User interactions & browser state');
      else if (node.layer === 'edge') inputs.push('External HTTP / WebSocket / CLI requests');
      else if (node.layer === 'orchestration') inputs.push('Triggered pipeline payloads & job context');
      else if (node.layer === 'data') inputs.push('Queries & structured persistence records');
      else if (node.layer === 'infrastructure') inputs.push('Environment configuration & runtime context');
      else inputs.push('Module arguments & domain inputs');
    }

    const outputs: string[] = [];
    if (node.keySymbols.length > 0) {
      outputs.push(`Exports ${node.keySymbols.slice(0, 3).join(', ')}`);
    }
    for (const oe of outEdges.slice(0, 2)) {
      const callee = nodeById.get(oe.target);
      if (callee) outputs.push(`${toTitleCase(oe.label)} -> ${callee.label}`);
    }
    if (outputs.length === 0) {
      if (node.layer === 'client') outputs.push('Rendered interactive UI surface');
      else if (node.layer === 'edge') outputs.push('Validated JSON / stream responses');
      else if (node.layer === 'data') outputs.push('Persisted entities & cache entries');
      else outputs.push(`${toTitleCase(node.layer)} module contracts`);
    }

    node.inputs = inputs.slice(0, 4);
    node.outputs = outputs.slice(0, 4);

    const roleVerb = nodeKindBriefLead(node.kind);
    const symbolPhrase =
      node.keySymbols.length > 0
        ? `Exposes ${node.keySymbols.slice(0, 3).join(', ')}`
        : `Encapsulates ${pf.lineCount || 1} lines of ${pf.language || 'source'} logic`;
    const scopePhrase =
      node.filePaths.length > 1
        ? `across ${node.filePaths.length} grouped modules (${formatTokensCompact(node.estimatedTokens)} tokens)`
        : `in ${pf.path} (${formatTokensCompact(node.estimatedTokens)} tokens)`;
    const couplingPhrase =
      inEdges.length > 0 || outEdges.length > 0
        ? `Connects ${inEdges.length} upstream caller${inEdges.length === 1 ? '' : 's'} to ${outEdges.length} downstream target${outEdges.length === 1 ? '' : 's'}.`
        : `${pf.isEntrypoint ? 'Acts as a standalone entrypoint' : 'Operates as a self-contained module'} in the ${node.layer} stratum.`;

    node.visualBrief = `${roleVerb} ${scopePhrase}. ${symbolPhrase}; ${couplingPhrase.charAt(0).toLowerCase()}${couplingPhrase.slice(1)}`;
  }

  // Compute deterministic layered coordinates for instant 2D canvas rendering
  computeLayeredLayout(nodes, edges);

  return { nodes, edges, fileToAtlasNodeId };
}

function commonPathPrefixLength(dirA: string, dirB: string): number {
  const a = dirA.split('/').filter(Boolean);
  const b = dirB.split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return i;
}

function nodeKindBriefLead(kind: AtlasNode['kind']): string {
  switch (kind) {
    case 'ui':
      return 'Renders interactive interface components';
    case 'api':
      return 'Handles external requests and boundary routing';
    case 'store':
      return 'Manages persistent state, schemas, or cache storage';
    case 'agent':
      return 'Coordinates AI reasoning and agentic tool execution';
    case 'pipeline':
      return 'Orchestrates multi-stage data transformation and synthesis';
    case 'service':
      return 'Provides shared infrastructure and external service integration';
    case 'config':
      return 'Defines runtime configuration, build tooling, or test harnesses';
    case 'external':
      return 'Bridges external third-party systems';
    case 'module':
    default:
      return 'Implements core domain logic and typed contracts';
  }
}

// =============================================================================
// 7. Strata Layers (All Populated ArchitectureLayers Sorted Top-to-Bottom)
// =============================================================================

function buildStrata(files: RepoFileRecord[], nodes: AtlasNode[]): StratumLayer[] {
  const strata: StratumLayer[] = [];

  for (const layer of LAYER_ORDER) {
    const layerFiles = files.filter((f) => f.layer === layer);
    if (layerFiles.length === 0) continue;

    const meta = STRATUM_METADATA[layer];
    const layerNodes = nodes.filter((n) => n.layer === layer).map((n) => n.id);
    const tokenCount = layerFiles.reduce((sum, f) => sum + f.estimatedTokens, 0);

    strata.push({
      layer,
      title: meta.title,
      description: meta.description,
      elevation: meta.elevation,
      accentColor: meta.accentColor,
      nodeIds: layerNodes,
      fileCount: layerFiles.length,
      tokenCount,
    });
  }

  return strata;
}

// =============================================================================
// 8. Deterministic Execution Flows Traced Along Real Hot Paths (2–3 Flows)
// =============================================================================

function extractCodeExcerpt(file: RepoFileRecord | undefined, lineStart: number): string | undefined {
  if (!file?.content) return undefined;
  const lines = file.content.split(/\r?\n/);
  const startIdx = Math.max(0, Math.min(lines.length - 1, lineStart - 1));
  const slice = lines.slice(startIdx, startIdx + 5).join('\n').trim();
  if (!slice) return undefined;
  return slice.length > 260 ? `${slice.slice(0, 257)}...` : slice;
}

function inferFlowCategory(pathNodes: AtlasNode[]): ExecutionFlow['category'] {
  const combinedText = pathNodes
    .map((n) => `${n.label} ${n.primaryFile} ${n.layer} ${n.kind}`.toLowerCase())
    .join(' ');

  if (/\b(gemini|openai|anthropic|llm|ai|agent|oracle|synthesi\w*|xray|x-ray|prompt|architect)\b/.test(combinedText)) {
    return 'ai_pipeline';
  }
  if (/\b(ingest\w*|parser|ast|graph\w*|treemap\w*|digest\w*|fetcher|crawler|loader)\b/.test(combinedText)) {
    return 'ingestion';
  }
  if (/\b(auth\w*|oauth|session|token|jwt|security|login|permission)\b/.test(combinedText)) {
    return 'auth';
  }
  if (pathNodes.some((n) => n.layer === 'edge' || n.kind === 'api')) {
    return 'request';
  }
  if (pathNodes.some((n) => n.layer === 'client' || n.layer === 'data')) {
    return 'state';
  }
  return 'build';
}

function buildFlowTitleAndTrigger(
  category: ExecutionFlow['category'],
  startNode: AtlasNode,
  endNode: AtlasNode
): { title: string; subtitle: string; trigger: string } {
  switch (category) {
    case 'ai_pipeline':
      return {
        title: `AI Synthesis: ${startNode.label} → ${endNode.label}`,
        subtitle: `Traces intelligence orchestration across ${startNode.layer} and ${endNode.layer} strata.`,
        trigger: `Triggered via ${startNode.label} (${startNode.primaryFile})`,
      };
    case 'ingestion':
      return {
        title: `Ingestion Pipeline: ${startNode.label} → ${endNode.label}`,
        subtitle: `Follows repository parsing, graph extraction, and structural compilation.`,
        trigger: `Initiated at ${startNode.label} (${startNode.primaryFile})`,
      };
    case 'auth':
      return {
        title: `Auth & Trust Boundary: ${startNode.label} → ${endNode.label}`,
        subtitle: `Verifies credential validation and session propagation across boundaries.`,
        trigger: `Incoming credential check at ${startNode.label}`,
      };
    case 'request':
      return {
        title: `Primary Request Path: ${startNode.label} → ${endNode.label}`,
        subtitle: `End-to-end execution from entry boundary through core services to ${endNode.label}.`,
        trigger: `Inbound request handled by ${startNode.label}`,
      };
    case 'state':
      return {
        title: `State & Surface Flow: ${startNode.label} → ${endNode.label}`,
        subtitle: `Propagates interactive state updates and backing data contracts.`,
        trigger: `User action or state update in ${startNode.label}`,
      };
    case 'build':
    default:
      return {
        title: `Core Execution Chain: ${startNode.label} → ${endNode.label}`,
        subtitle: `Deterministic hot-path traversal from ${startNode.label} to ${endNode.label}.`,
        trigger: `Invoked at ${startNode.label} (${startNode.primaryFile})`,
      };
  }
}

function buildExecutionFlows(
  nodes: AtlasNode[],
  edges: AtlasEdge[],
  fileByPath: Map<string, RepoFileRecord>
): ExecutionFlow[] {
  if (nodes.length === 0) return [];

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const outEdgesByNode = new Map<string, AtlasEdge[]>();
  for (const n of nodes) outEdgesByNode.set(n.id, []);
  for (const e of edges) {
    outEdgesByNode.get(e.source)?.push(e);
  }

  // Sort outgoing edges by hot-path & structural significance
  for (const list of outEdgesByNode.values()) {
    list.sort((a, b) => {
      const hotDiff = (b.isHotPath ? 1 : 0) - (a.isHotPath ? 1 : 0);
      if (hotDiff !== 0) return hotDiff;
      const tA = nodeById.get(a.target);
      const tB = nodeById.get(b.target);
      const scoreA = a.weight * 2 + (tA?.centrality ?? 0) * 10;
      const scoreB = b.weight * 2 + (tB?.centrality ?? 0) * 10;
      return scoreB - scoreA;
    });
  }

  const usedEdgesCount = new Map<string, number>();
  const flows: ExecutionFlow[] = [];
  const usedStartIds = new Set<string>();

  // Helper: depth-aware bounded DFS path search (<= 24 nodes, max depth 5) favoring
  // rich multi-hop behavioral paths over premature jumps into leaf type/config sinks.
  const traceFromSeed = (seed: AtlasNode, maxHops: number): AtlasEdge[] => {
    let bestPath: AtlasEdge[] = [];
    let bestPathScore = -Infinity;
    let explored = 0;
    const MAX_EXPLORE = 240;

    const scorePath = (path: AtlasEdge[]): number => {
      if (path.length === 0) return -Infinity;
      let score = 0;
      const distinctLayers = new Set<ArchitectureLayer>([seed.layer]);

      for (let i = 0; i < path.length; i++) {
        const edge = path[i];
        const from = nodeById.get(edge.source)!;
        const to = nodeById.get(edge.target)!;
        const isLast = i === path.length - 1;
        const used = usedEdgesCount.get(edge.id) ?? 0;
        const isLeafContract = isContractOrConfigTarget(to);

        distinctLayers.add(to.layer);

        // Reward multi-hop behavioral traversal; penalize dead-ending immediately into types/config
        score += 10;
        if (edge.isHotPath) score += 5;
        if (LAYER_RANK[to.layer] >= LAYER_RANK[from.layer]) score += 2.5;
        score += to.centrality * 6 + Math.min(edge.weight, 4) * 1.2;
        score -= used * 7;

        if (isLeafContract) {
          score -= isLast && path.length >= 2 ? 2 : 12;
        }
        if (to.layer === 'data' || to.kind === 'store') {
          score += 4;
        }
      }

      // Bonus for spanning multiple architectural strata and having 3-5 rich hops
      score += distinctLayers.size * 3.5;
      if (path.length >= 2 && path.length <= 5) score += 8;
      return score;
    };

    const dfs = (currentId: string, visited: Set<string>, currentPath: AtlasEdge[]) => {
      if (explored >= MAX_EXPLORE) return;
      explored++;

      if (currentPath.length > 0) {
        const sc = scorePath(currentPath);
        if (sc > bestPathScore) {
          bestPathScore = sc;
          bestPath = [...currentPath];
        }
      }

      if (currentPath.length >= maxHops) return;

      const outgoing = (outEdgesByNode.get(currentId) ?? []).filter((e) => !visited.has(e.target));
      if (outgoing.length === 0) return;

      // Sort outgoing edges so behavioral non-leaf targets are explored first
      const rankedOut = [...outgoing].sort((a, b) => {
        const tA = nodeById.get(a.target)!;
        const tB = nodeById.get(b.target)!;
        const leafPenA = isContractOrConfigTarget(tA) ? -12 : 0;
        const leafPenB = isContractOrConfigTarget(tB) ? -12 : 0;
        const outDegA = outEdgesByNode.get(tA.id)?.length ?? 0;
        const outDegB = outEdgesByNode.get(tB.id)?.length ?? 0;
        const sA =
          (a.isHotPath ? 6 : 0) +
          Math.min(outDegA, 4) * 2.5 +
          tA.centrality * 5 +
          leafPenA -
          (usedEdgesCount.get(a.id) ?? 0) * 6;
        const sB =
          (b.isHotPath ? 6 : 0) +
          Math.min(outDegB, 4) * 2.5 +
          tB.centrality * 5 +
          leafPenB -
          (usedEdgesCount.get(b.id) ?? 0) * 6;
        return sB - sA;
      });

      // Explore top 3 branching choices per hop
      for (const edge of rankedOut.slice(0, 3)) {
        visited.add(edge.target);
        currentPath.push(edge);
        dfs(edge.target, visited, currentPath);
        currentPath.pop();
        visited.delete(edge.target);
      }
    };

    dfs(seed.id, new Set<string>([seed.id]), []);
    return bestPath;
  };

  // Precompute max reachable behavioral depth per node so seeds launch multi-hop flows
  const behavioralOutCount = (nodeId: string): number =>
    (outEdgesByNode.get(nodeId) ?? []).filter((e) => {
      const target = nodeById.get(e.target);
      return target !== undefined && !isContractOrConfigTarget(target);
    }).length;

  // Pick up to 3 diverse seed nodes with real outgoing edges (preferring rich multi-hop roots)
  const seedCandidates = [...nodes]
    .filter((n) => (outEdgesByNode.get(n.id)?.length ?? 0) > 0)
    .sort((a, b) => {
      const layerScore = (n: AtlasNode) => {
        if (n.layer === 'edge') return 14;
        if (n.layer === 'client') return 12;
        if (n.layer === 'orchestration') return 11;
        if (n.layer === 'domain') return 7;
        return 3;
      };
      const bOutA = behavioralOutCount(a.id);
      const bOutB = behavioralOutCount(b.id);
      const sA = layerScore(a) + Math.min(bOutA, 4) * 5 + a.centrality * 10 + (a.fanIn === 0 ? 5 : 0);
      const sB = layerScore(b) + Math.min(bOutB, 4) * 5 + b.centrality * 10 + (b.fanIn === 0 ? 5 : 0);
      return sB - sA;
    });

  // Prefer seeds from distinct layers/subsystems for diverse flows
  const selectedSeeds: AtlasNode[] = [];
  const pickedLayers = new Set<ArchitectureLayer>();

  for (const cand of seedCandidates) {
    if (selectedSeeds.length >= 3) break;
    if (!pickedLayers.has(cand.layer)) {
      selectedSeeds.push(cand);
      pickedLayers.add(cand.layer);
      usedStartIds.add(cand.id);
    }
  }
  for (const cand of seedCandidates) {
    if (selectedSeeds.length >= 3) break;
    if (!usedStartIds.has(cand.id)) {
      selectedSeeds.push(cand);
      usedStartIds.add(cand.id);
    }
  }

  for (const seed of selectedSeeds) {
    const pathEdges = traceFromSeed(seed, 5);
    if (pathEdges.length === 0) continue;

    // Ensure flow 1 marks its path edges as hot paths on the Atlas canvas
    if (flows.length === 0) {
      for (const e of pathEdges) {
        e.isHotPath = true;
      }
    }

    for (const e of pathEdges) {
      usedEdgesCount.set(e.id, (usedEdgesCount.get(e.id) ?? 0) + 1);
    }

    const pathNodes: AtlasNode[] = [seed, ...pathEdges.map((e) => nodeById.get(e.target)!)];
    const endNode = pathNodes[pathNodes.length - 1];
    const category = inferFlowCategory(pathNodes);
    const { title, subtitle, trigger } = buildFlowTitleAndTrigger(category, seed, endNode);

    const steps: ExecutionFlowStep[] = pathEdges.map((edge, idx) => {
      const fromNode = nodeById.get(edge.source)!;
      const toNode = nodeById.get(edge.target)!;
      const targetFile = fileByPath.get(toNode.primaryFile);
      const lineStart = toNode.lineStart ?? 1;
      const lineEnd = Math.max(lineStart, Math.min(toNode.lineEnd ?? lineStart + 25, lineStart + 35));
      const symbolNote =
        toNode.keySymbols.length > 0 ? ` via ${toNode.keySymbols.slice(0, 2).join(', ')}` : '';

      return {
        stepNumber: idx + 1,
        title: `${fromNode.label} → ${toNode.label}`,
        action: `${fromNode.label} ${edge.label} ${toNode.label}${symbolNote}.`,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        edgeLabel: edge.label,
        filePath: toNode.primaryFile,
        lineStart,
        lineEnd,
        codeExcerpt: extractCodeExcerpt(targetFile, lineStart),
        dataPayload:
          toNode.keySymbols[0]
            ? `${edge.protocol ?? 'Module'} · ${toNode.keySymbols[0]}`
            : edge.protocol ?? 'Typed Payload',
      };
    });

    flows.push({
      id: `flow-${flows.length + 1}-${toSlug(category)}`,
      title,
      subtitle,
      trigger,
      category,
      steps,
    });
  }

  // Fallback for sparse/disconnected graphs: guarantee at least 2 deterministic flows when >= 2 nodes exist
  if (flows.length < 2 && nodes.length >= 2) {
    const layered = [...nodes].sort(
      (a, b) => LAYER_RANK[a.layer] - LAYER_RANK[b.layer] || b.centrality - a.centrality
    );

    const buildSyntheticChain = (chainNodes: AtlasNode[], flowIdx: number): ExecutionFlow => {
      const start = chainNodes[0];
      const end = chainNodes[chainNodes.length - 1];
      const category = inferFlowCategory(chainNodes);
      const { title, subtitle, trigger } = buildFlowTitleAndTrigger(category, start, end);

      const steps: ExecutionFlowStep[] = [];
      for (let i = 0; i < chainNodes.length - 1; i++) {
        const fromNode = chainNodes[i];
        const toNode = chainNodes[i + 1];
        const targetFile = fileByPath.get(toNode.primaryFile);
        const lineStart = toNode.lineStart ?? 1;
        const lineEnd = Math.max(lineStart, Math.min(toNode.lineEnd ?? lineStart + 20, lineStart + 30));

        steps.push({
          stepNumber: i + 1,
          title: `${fromNode.label} → ${toNode.label}`,
          action: `Architectural handoff from ${fromNode.layer} (${fromNode.label}) to ${toNode.layer} (${toNode.label}).`,
          fromNodeId: fromNode.id,
          toNodeId: toNode.id,
          edgeLabel: `${fromNode.layer} → ${toNode.layer}`,
          filePath: toNode.primaryFile,
          lineStart,
          lineEnd,
          codeExcerpt: extractCodeExcerpt(targetFile, lineStart),
          dataPayload: toNode.keySymbols[0] ?? `${toTitleCase(toNode.layer)} Contract`,
        });
      }

      return {
        id: `flow-${flowIdx}-${toSlug(category)}`,
        title,
        subtitle,
        trigger,
        category,
        steps,
      };
    };

    if (flows.length === 0) {
      const chain1 = layered.slice(0, Math.min(4, layered.length));
      flows.push(buildSyntheticChain(chain1, 1));
    }

    if (flows.length < 2 && layered.length >= 2) {
      const byCentrality = [...nodes].sort((a, b) => b.centrality - a.centrality);
      const chain2 =
        layered.length >= 4
          ? [byCentrality[0], ...layered.slice(-2).filter((n) => n.id !== byCentrality[0].id)]
          : [...layered].reverse().slice(0, Math.min(3, layered.length));

      if (chain2.length >= 2) {
        flows.push(buildSyntheticChain(chain2, flows.length + 1));
      }
    }
  } else if (flows.length === 0 && nodes.length === 1) {
    const only = nodes[0];
    const f = fileByPath.get(only.primaryFile);
    const lineStart = only.lineStart ?? 1;
    const lineEnd = Math.max(lineStart, only.lineEnd ?? lineStart);
    flows.push({
      id: 'flow-1-bootstrap',
      title: `Bootstrap: ${only.label}`,
      subtitle: 'Single-module repository entrypoint and core logic.',
      trigger: `Executed via ${only.primaryFile}`,
      category: 'build',
      steps: [
        {
          stepNumber: 1,
          title: `Initialize ${only.label}`,
          action: only.visualBrief,
          fromNodeId: only.id,
          toNodeId: only.id,
          edgeLabel: 'executes',
          filePath: only.primaryFile,
          lineStart,
          lineEnd,
          codeExcerpt: extractCodeExcerpt(f, lineStart),
          dataPayload: only.keySymbols[0] ?? 'Entrypoint',
        },
      ],
    });
  }

  return flows.slice(0, 3);
}

// =============================================================================
// 9. 5-Stop Codemap Tour Builder
// =============================================================================

function buildCodemapTour(
  nodes: AtlasNode[],
  edges: AtlasEdge[],
  subsystems: SubsystemCluster[],
  flows: ExecutionFlow[]
): CodemapTourStop[] {
  if (nodes.length === 0) return [];

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const subsystemById = new Map(subsystems.map((s) => [s.id, s]));
  const neighborsById = new Map<string, string[]>();

  for (const n of nodes) neighborsById.set(n.id, []);
  for (const e of edges) {
    neighborsById.get(e.source)?.push(e.target);
    neighborsById.get(e.target)?.push(e.source);
  }

  const pickedIds = new Set<string>();
  const pickBest = (predicate: (n: AtlasNode) => boolean, scorer: (n: AtlasNode) => number): AtlasNode | undefined => {
    const unused = nodes.filter((n) => !pickedIds.has(n.id));
    const matching = unused.filter(predicate);
    const pool = matching.length > 0 ? matching : unused;
    if (pool.length === 0) return undefined;
    pool.sort((a, b) => scorer(b) - scorer(a));
    return pool[0];
  };

  interface TourBlueprint {
    node: AtlasNode;
    title: string;
    visualHook: string;
    explanation: string;
    highlightNodeIds: string[];
    recommendedLens: VisualLensId;
  }

  const blueprints: TourBlueprint[] = [];
  const primaryFlowNodeIds = Array.from(
    new Set(
      (flows[0]?.steps ?? []).flatMap((s) => [s.fromNodeId, s.toNodeId]).filter((id) => nodeById.has(id))
    )
  );

  // Stop 1: Entry & Surface Boundary (atlas lens)
  const stop1 = pickBest(
    (n) => n.layer === 'client' || n.layer === 'edge',
    (n) => (n.layer === 'edge' ? 12 : 10) + n.centrality * 20 + n.fanOut * 2
  );
  if (stop1) {
    pickedIds.add(stop1.id);
    const nbrs = (neighborsById.get(stop1.id) ?? []).slice(0, 3);
    const sub = subsystemById.get(stop1.subsystemId);
    blueprints.push({
      node: stop1,
      title: `Entry Boundary: ${stop1.label}`,
      visualHook: `Start at the outer ${stop1.layer} boundary where requests and interactions enter ${sub?.name ?? 'the system'}.`,
      explanation: `${stop1.visualBrief} Follow its ${stop1.fanOut} outbound link(s) to see how control fans into downstream subsystems.`,
      highlightNodeIds: Array.from(new Set([stop1.id, ...nbrs])),
      recommendedLens: 'atlas',
    });
  }

  // Stop 2: Orchestration & 3D Strata (strata3d lens)
  const stop2 = pickBest(
    (n) => n.layer === 'orchestration' || n.kind === 'pipeline' || n.kind === 'agent',
    (n) => n.centrality * 25 + n.fanOut * 2 + n.fanIn * 1.5
  );
  if (stop2) {
    pickedIds.add(stop2.id);
    const sameLayer = nodes
      .filter((n) => n.layer === stop2.layer)
      .slice(0, 4)
      .map((n) => n.id);
    blueprints.push({
      node: stop2,
      title: `Strata Core: ${stop2.label}`,
      visualHook: `Inspect the ${STRATUM_METADATA[stop2.layer].title} stratum stacked in 3D elevation.`,
      explanation: `${stop2.visualBrief} Viewing this module in 3D Strata reveals how upper boundaries delegate work downward without leaking implementation details.`,
      highlightNodeIds: Array.from(new Set([stop2.id, ...sameLayer])),
      recommendedLens: 'strata3d',
    });
  }

  // Stop 3: Hot Execution Flow & Domain Engine (flows lens)
  const stop3 = pickBest(
    (n) => n.layer === 'domain' || primaryFlowNodeIds.includes(n.id),
    (n) => (primaryFlowNodeIds.includes(n.id) ? 15 : 0) + n.centrality * 25
  );
  if (stop3) {
    pickedIds.add(stop3.id);
    blueprints.push({
      node: stop3,
      title: `Hot Path Engine: ${stop3.label}`,
      visualHook: `Trace live execution across ${flows[0]?.title ?? stop3.label}.`,
      explanation: `${stop3.visualBrief} This module sits directly on the repository's highest-signal execution chain with centrality ${Math.round(stop3.centrality * 100)}%.`,
      highlightNodeIds: Array.from(new Set([stop3.id, ...primaryFlowNodeIds.slice(0, 4)])),
      recommendedLens: 'flows',
    });
  }

  // Stop 4: Data, Contracts & Token Mass (treemap lens)
  const stop4 = pickBest(
    (n) => n.layer === 'data' || n.layer === 'infrastructure',
    (n) => Math.log10(n.estimatedTokens + 10) * 8 + n.centrality * 15
  );
  if (stop4) {
    pickedIds.add(stop4.id);
    const subNodes = subsystemById.get(stop4.subsystemId)?.nodeIds.slice(0, 4) ?? [stop4.id];
    blueprints.push({
      node: stop4,
      title: `State & Scale: ${stop4.label}`,
      visualHook: `Zoom into token concentration (${formatTokensCompact(stop4.estimatedTokens)} tokens) and backing contracts.`,
      explanation: `${stop4.visualBrief} Use the Token Treemap to compare its footprint against adjacent ${stop4.layer} modules.`,
      highlightNodeIds: Array.from(new Set([stop4.id, ...subNodes])),
      recommendedLens: 'treemap',
    });
  }

  // Stop 5: Blast Radius & Coupling Hub (xray lens)
  const stop5 = pickBest(
    (n) => n.fanIn > 0,
    (n) => n.fanIn * 6 + n.centrality * 20
  );
  if (stop5) {
    pickedIds.add(stop5.id);
    const callers = edges
      .filter((e) => e.target === stop5.id)
      .slice(0, 4)
      .map((e) => e.source);
    blueprints.push({
      node: stop5,
      title: `Blast Radius Hub: ${stop5.label}`,
      visualHook: `Audit high-fan-in coupling (${stop5.fanIn} inbound dependents) for architectural resilience.`,
      explanation: `${stop5.visualBrief} Because ${stop5.fanIn} module(s) depend on ${stop5.primaryFile}, interface changes here ripple across connected clusters.`,
      highlightNodeIds: Array.from(new Set([stop5.id, ...callers])),
      recommendedLens: 'xray',
    });
  }

  return blueprints.slice(0, 5).map((bp, idx) => {
    const lineStart = bp.node.lineStart ?? 1;
    const lineEnd = Math.max(lineStart, bp.node.lineEnd ?? lineStart);
    return {
      id: `tour-stop-${idx + 1}`,
      order: idx + 1,
      title: bp.title,
      visualHook: bp.visualHook,
      explanation: bp.explanation,
      focusNodeId: bp.node.id,
      highlightNodeIds: bp.highlightNodeIds.filter((id) => nodeById.has(id)),
      filePath: bp.node.primaryFile,
      lineStart,
      lineEnd,
      recommendedLens: bp.recommendedLens,
    };
  });
}

// =============================================================================
// 10. Clean Valid Clickable Architecture Mermaid Flowchart
// =============================================================================

function sanitizeMermaidLabel(raw: string, maxLen = 38): string {
  const cleaned = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/["'`[\]{}()<>|#;\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Module';
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

function buildArchitectureMermaid(
  metadata: RepoMetadata,
  subsystems: SubsystemCluster[],
  nodes: AtlasNode[],
  edges: AtlasEdge[],
  filePathSet: Set<string>
): MermaidDiagramSpec[] {
  if (nodes.length === 0) return [];

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const mermaidIdByNodeId = new Map<string, string>();
  const nodeFileMap: Record<string, string> = {};

  nodes.forEach((node, idx) => {
    // Strictly alphanumeric Mermaid ID starting with letter 'N' (never collides with reserved keywords)
    const token = node.label
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 18);
    const mId = `N${idx + 1}_${token || 'Mod'}`;
    mermaidIdByNodeId.set(node.id, mId);

    // Strictly verify nodeFileMap entry exists in filePathSet
    if (filePathSet.has(node.primaryFile)) {
      nodeFileMap[mId] = node.primaryFile;
    } else {
      const verifiedFallback = node.filePaths.find((fp) => filePathSet.has(fp));
      if (verifiedFallback) {
        nodeFileMap[mId] = verifiedFallback;
      }
    }
  });

  const lines: string[] = ['flowchart TD'];

  // Emit Obsidian Cobalt semantic classDefs
  lines.push('  classDef client fill:#0E1B2A,stroke:#38BDF8,stroke-width:1.5px,color:#F1F3F4');
  lines.push('  classDef edge fill:#0D192B,stroke:#4285F4,stroke-width:1.5px,color:#F1F3F4');
  lines.push('  classDef orchestration fill:#0B1A33,stroke:#1A73E8,stroke-width:2px,color:#F1F3F4');
  lines.push('  classDef domain fill:#151830,stroke:#818CF8,stroke-width:1.5px,color:#F1F3F4');
  lines.push('  classDef infrastructure fill:#0B1F22,stroke:#2DD4BF,stroke-width:1.5px,color:#F1F3F4');
  lines.push('  classDef data fill:#0B211A,stroke:#34D399,stroke-width:1.5px,color:#F1F3F4');
  lines.push('  classDef tooling fill:#211C0E,stroke:#FBBF24,stroke-width:1.5px,color:#F1F3F4');
  lines.push('');

  // Emit subgraphs per populated SubsystemCluster
  const emittedNodeIds = new Set<string>();
  let sgIndex = 1;

  for (const sub of subsystems) {
    const subNodes = sub.nodeIds
      .map((id) => nodeById.get(id))
      .filter((n): n is AtlasNode => n !== undefined);
    if (subNodes.length === 0) continue;

    const sgId = `SG_${sgIndex++}`;
    const sgLabel = sanitizeMermaidLabel(sub.name, 42);
    lines.push(`  subgraph ${sgId}["${sgLabel}"]`);
    for (const node of subNodes) {
      const mId = mermaidIdByNodeId.get(node.id)!;
      const nodeLabel = sanitizeMermaidLabel(node.label, 36);
      lines.push(`    ${mId}["${nodeLabel}"]`);
      emittedNodeIds.add(node.id);
    }
    lines.push('  end');
    lines.push('');
  }

  // Safety net: emit any node that was somehow not in a subsystem
  for (const node of nodes) {
    if (emittedNodeIds.has(node.id)) continue;
    const mId = mermaidIdByNodeId.get(node.id)!;
    lines.push(`  ${mId}["${sanitizeMermaidLabel(node.label, 36)}"]`);
  }

  // Emit directed edges (cap at 42 cleanest edges so Mermaid layout stays crisp)
  const sortedEdges = [...edges].sort((a, b) => {
    const hotDiff = (b.isHotPath ? 1 : 0) - (a.isHotPath ? 1 : 0);
    if (hotDiff !== 0) return hotDiff;
    return b.weight - a.weight;
  });

  const mermaidEdges = sortedEdges.slice(0, 42);
  for (const edge of mermaidEdges) {
    const srcMId = mermaidIdByNodeId.get(edge.source);
    const dstMId = mermaidIdByNodeId.get(edge.target);
    if (!srcMId || !dstMId || srcMId === dstMId) continue;

    const arrow = edge.isHotPath ? '==>' : '-->';
    const edgeLabel = sanitizeMermaidLabel(edge.label, 22);
    if (edgeLabel) {
      lines.push(`  ${srcMId} ${arrow}|"${edgeLabel}"| ${dstMId}`);
    } else {
      lines.push(`  ${srcMId} ${arrow} ${dstMId}`);
    }
  }

  lines.push('');

  // Assign layer classes
  const nodesByLayer = new Map<ArchitectureLayer, string[]>();
  for (const node of nodes) {
    const mId = mermaidIdByNodeId.get(node.id)!;
    const list = nodesByLayer.get(node.layer) ?? [];
    list.push(mId);
    nodesByLayer.set(node.layer, list);
  }
  for (const [layer, mIds] of nodesByLayer.entries()) {
    if (mIds.length > 0) {
      lines.push(`  class ${mIds.join(',')} ${layer}`);
    }
  }

  const repoTitle = metadata.name || metadata.fullName || 'Repository';
  return [
    {
      id: 'diag-architecture-deterministic',
      kind: 'architecture',
      title: `${repoTitle} Architecture Flowchart`,
      subtitle: `${subsystems.length} subsystems · ${nodes.length} visual modules · ${mermaidEdges.length} links`,
      code: lines.join('\n'),
      nodeFileMap,
      repaired: false,
      modelUsed: 'deterministic-graph-v1',
      generatedAt: new Date().toISOString(),
    },
  ];
}

// =============================================================================
// 11. Main Entrypoint: buildDeterministicAtlas
// =============================================================================

export function buildDeterministicAtlas(
  metadata: RepoMetadata,
  files: RepoFileRecord[]
): DeterministicAtlasResult {
  if (!files || files.length === 0) {
    return {
      files: [],
      dependencyEdges: [],
      subsystems: [],
      nodes: [],
      edges: [],
      strata: [],
      flows: [],
      codemapTour: [],
      diagrams: [],
      circularDeps: 0,
      avgFanOut: 0,
      architecturePattern: 'Empty Repository',
      techStackBadges: detectTechStackBadges(metadata, []),
    };
  }

  // Step 1: Clone files with normalized paths & fresh deterministic ArchitectureLayer classification
  const enrichedFiles: RepoFileRecord[] = files.map((file) => {
    const normPath = normalizePath(file.path);
    const layer = classifyArchitectureLayer(normPath, file.content ?? '', file.language);
    return {
      ...file,
      path: normPath,
      name: file.name || posixBasename(normPath),
      directory: file.directory ?? posixDirname(normPath),
      imports: [...(file.imports ?? [])],
      resolvedImports: [...(file.resolvedImports ?? [])],
      exports: [...(file.exports ?? [])],
      symbols: [...(file.symbols ?? [])],
      layer,
      centrality: 0,
      fanIn: 0,
      fanOut: 0,
    };
  });

  const filePathSet = new Set<string>(enrichedFiles.map((f) => f.path));
  const fileByPath = new Map<string, RepoFileRecord>(enrichedFiles.map((f) => [f.path, f]));

  // Step 2: Resolve all relative, alias, and dotted imports into directed adjacency graphs
  const outAdj = new Map<string, Set<string>>();
  const inAdj = new Map<string, Set<string>>();
  const edgeWeightMap = new Map<string, number>();

  for (const f of enrichedFiles) {
    outAdj.set(f.path, new Set<string>());
    inAdj.set(f.path, new Set<string>());
  }

  for (const file of enrichedFiles) {
    const resolvedSet = new Set<string>();

    // Preserve any valid pre-resolved imports
    for (const pre of file.resolvedImports) {
      const normPre = normalizePath(pre);
      if (normPre !== file.path && filePathSet.has(normPre)) {
        resolvedSet.add(normPre);
        const key = `${file.path}::${normPre}`;
        edgeWeightMap.set(key, (edgeWeightMap.get(key) ?? 0) + 1);
      }
    }

    // Resolve raw imports via multi-language resolver
    for (const rawImp of file.imports) {
      const resolved = resolveImportToFile(file.path, rawImp, filePathSet);
      if (resolved && resolved !== file.path) {
        resolvedSet.add(resolved);
        const key = `${file.path}::${resolved}`;
        edgeWeightMap.set(key, (edgeWeightMap.get(key) ?? 0) + 1);
      }
    }

    const sortedResolved = Array.from(resolvedSet).sort();
    file.resolvedImports = sortedResolved;

    const outs = outAdj.get(file.path)!;
    for (const target of sortedResolved) {
      outs.add(target);
      inAdj.get(target)!.add(file.path);
    }
  }

  // Step 3: Compute fanIn, fanOut, avgFanOut, iterative PageRank centrality, and Tarjan DFS cycles
  let totalFanOut = 0;
  for (const file of enrichedFiles) {
    file.fanIn = inAdj.get(file.path)?.size ?? 0;
    file.fanOut = outAdj.get(file.path)?.size ?? 0;
    totalFanOut += file.fanOut;
  }
  const avgFanOut = Number((totalFanOut / enrichedFiles.length).toFixed(2));

  const allPaths = enrichedFiles.map((f) => f.path);
  const centralityMap = computePageRankCentrality(allPaths, outAdj, inAdj, fileByPath);
  for (const file of enrichedFiles) {
    file.centrality = centralityMap.get(file.path) ?? 0;
  }

  const { circularEdgeKeys, circularSccCount } = detectCyclesTarjan(allPaths, outAdj);

  // Build file-level DependencyEdge[]
  const dependencyEdges: DependencyEdge[] = [];
  let depSeq = 1;
  for (const file of enrichedFiles) {
    for (const target of file.resolvedImports) {
      const targetFile = fileByPath.get(target);
      const edgeKey = `${file.path}::${target}`;
      const isCircular = circularEdgeKeys.has(edgeKey);
      const kind = inferEdgeKind(file, targetFile);
      dependencyEdges.push({
        id: `dep-${depSeq++}`,
        source: file.path,
        target,
        kind,
        weight: Math.max(1, edgeWeightMap.get(edgeKey) ?? 1),
        isCircular,
      });
    }
  }

  // Step 4: Group files into 4–10 cohesive SubsystemClusters
  const { subsystems, fileToSubsystemId } = buildSubsystemClusters(
    enrichedFiles,
    outAdj,
    circularEdgeKeys
  );

  // Step 5: Promote up to 24 highest-signal AtlasNodes & build directed AtlasEdges
  const { nodes, edges } = buildAtlasNodesAndEdges(
    enrichedFiles,
    dependencyEdges,
    subsystems,
    fileToSubsystemId,
    fileByPath
  );

  // Step 6: Build top-to-bottom StratumLayer[]
  const strata = buildStrata(enrichedFiles, nodes);

  // Step 7: Trace 2–3 deterministic ExecutionFlows along real hot paths
  const flows = buildExecutionFlows(nodes, edges, fileByPath);

  // Step 8: Build 5-stop CodemapTour
  const codemapTour = buildCodemapTour(nodes, edges, subsystems, flows);

  // Step 9: Build clean valid clickable Mermaid architecture diagram with verified nodeFileMap
  const diagrams = buildArchitectureMermaid(metadata, subsystems, nodes, edges, filePathSet);

  // Step 10: Detect tech stack badges and infer overall architecture pattern
  const techStackBadges = detectTechStackBadges(metadata, enrichedFiles);
  const architecturePattern = inferArchitecturePattern(enrichedFiles, techStackBadges, subsystems);

  return {
    files: enrichedFiles,
    dependencyEdges,
    subsystems,
    nodes,
    edges,
    strata,
    flows,
    codemapTour,
    diagrams,
    circularDeps: circularSccCount,
    avgFanOut,
    architecturePattern,
    techStackBadges,
  };
}
