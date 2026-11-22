import type {
  AdaptiveModelTier,
  ArchitectureLayer,
  AtlasEdge,
  AtlasNode,
  CodemapTourStop,
  CodeSymbol,
  DependencyEdge,
  ExecutionFlow,
  MermaidDiagramSpec,
  RepoFileRecord,
  RepoMetadata,
  StratumLayer,
  SubsystemCluster,
  TreemapNode,
  VisualAtlasBlueprint,
  XRayCellScore,
  XRayMatrixReport,
  XRayModuleAudit,
  XRayPillarId,
} from '../../../shared/types.js';

export interface ShowcaseRepoEntry {
  slug: string;
  title: string;
  subtitle: string;
  badge: string;
  stars: number;
  language: string;
  blueprint: VisualAtlasBlueprint;
}

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

const GENERATED_AT = '2026-11-18T16:00:00.000Z';

const ALL_PILLARS: readonly XRayPillarId[] = [
  'modularity',
  'security',
  'resilience',
  'testability',
  'api_clarity',
  'concurrency',
  'scalability',
  'hygiene',
  'onboarding',
];

const LAYER_META: Record<
  ArchitectureLayer,
  { title: string; description: string; elevation: number; accentColor: string }
> = {
  client: {
    title: 'Client & Interactive Surface',
    description: 'Browser UI, interactive canvases, streaming views, and user controls.',
    elevation: 6,
    accentColor: '#4285F4',
  },
  edge: {
    title: 'Edge & HTTP Gateway',
    description: 'API routers, middleware, auth guards, SSE/WebSocket ingress, and request validation.',
    elevation: 5,
    accentColor: '#38BDF8',
  },
  orchestration: {
    title: 'Orchestration & AI Pipelines',
    description: 'Multi-step coordinators, LLM prompt runners, streaming synthesis, and agent loops.',
    elevation: 4,
    accentColor: '#1A73E8',
  },
  domain: {
    title: 'Core Domain Engines',
    description: 'Parsers, analyzers, graph builders, digest compilers, and schema validators.',
    elevation: 3,
    accentColor: '#2DD4BF',
  },
  infrastructure: {
    title: 'Infrastructure & External SDKs',
    description: 'GitHub/Git clients, model provider adapters, sandboxes, and observability.',
    elevation: 2,
    accentColor: '#818CF8',
  },
  data: {
    title: 'Storage, Indexes & State',
    description: 'Vector indices, caches, persistent databases, and artifact stores.',
    elevation: 1,
    accentColor: '#34D399',
  },
  tooling: {
    title: 'Tooling, Schemas & Config',
    description: 'Shared contracts, environment validation, build scripts, and templates.',
    elevation: 0,
    accentColor: '#FBBF24',
  },
};

interface FileSpec {
  path: string;
  language: string;
  layer: ArchitectureLayer;
  estimatedTokens: number;
  centrality: number;
  fanIn: number;
  fanOut: number;
  imports: string[];
  resolvedImports: string[];
  exports: string[];
  symbols: CodeSymbol[];
  isEntrypoint?: boolean;
  isTest?: boolean;
  isConfig?: boolean;
  content: string;
}

function makeFile(spec: FileSpec): RepoFileRecord {
  const parts = spec.path.split('/');
  const name = parts[parts.length - 1] ?? spec.path;
  const directory = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
  const dotIdx = name.lastIndexOf('.');
  const extension = dotIdx >= 0 ? name.slice(dotIdx) : '';
  const trimmed = spec.content.trim();
  const lineCount = trimmed.split('\n').length;
  const sizeBytes = Buffer.byteLength(trimmed, 'utf8');

  return {
    path: spec.path,
    name,
    directory,
    extension,
    language: spec.language,
    sizeBytes,
    lineCount,
    estimatedTokens: spec.estimatedTokens,
    content: trimmed,
    imports: spec.imports,
    resolvedImports: spec.resolvedImports,
    exports: spec.exports,
    symbols: spec.symbols,
    layer: spec.layer,
    centrality: spec.centrality,
    fanIn: spec.fanIn,
    fanOut: spec.fanOut,
    isEntrypoint: Boolean(spec.isEntrypoint),
    isTest: Boolean(spec.isTest),
    isConfig: Boolean(spec.isConfig),
  };
}

function buildDependencyEdges(files: RepoFileRecord[]): DependencyEdge[] {
  const pathSet = new Set(files.map((f) => f.path));
  const edges: DependencyEdge[] = [];
  let idx = 1;
  for (const file of files) {
    for (const target of file.resolvedImports) {
      if (!pathSet.has(target)) continue;
      edges.push({
        id: `dep-${idx++}`,
        source: file.path,
        target,
        kind: target.includes('store') || target.includes('db') || target.includes('cache')
          ? 'storage'
          : target.includes('api') || target.includes('route')
            ? 'http'
            : 'import',
        label: 'imports',
        weight: 1,
        isCircular: false,
      });
    }
  }
  return edges;
}

function buildStrata(nodes: AtlasNode[], files: RepoFileRecord[]): StratumLayer[] {
  const layerOrder: ArchitectureLayer[] = [
    'client',
    'edge',
    'orchestration',
    'domain',
    'infrastructure',
    'data',
    'tooling',
  ];

  const strata: StratumLayer[] = [];
  for (const layer of layerOrder) {
    const layerNodes = nodes.filter((n) => n.layer === layer);
    const layerFiles = files.filter((f) => f.layer === layer);
    if (layerNodes.length === 0 && layerFiles.length === 0) continue;
    const meta = LAYER_META[layer];
    strata.push({
      layer,
      title: meta.title,
      description: meta.description,
      elevation: meta.elevation,
      accentColor: meta.accentColor,
      nodeIds: layerNodes.map((n) => n.id),
      fileCount: layerFiles.length,
      tokenCount: layerFiles.reduce((sum, f) => sum + f.estimatedTokens, 0),
    });
  }
  return strata;
}

function buildTreemap(
  repoName: string,
  files: RepoFileRecord[],
  riskByFile: Map<string, number>,
): TreemapNode {
  const root: TreemapNode = {
    id: 'treemap-root',
    name: repoName,
    path: '.',
    kind: 'dir',
    tokens: 0,
    bytes: 0,
    fileCount: 0,
    children: [],
  };

  for (const file of files) {
    const segments = file.path.split('/');
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const isLeaf = i === segments.length - 1;
      const currentPath = segments.slice(0, i + 1).join('/');
      current.children ??= [];

      if (isLeaf) {
        current.children.push({
          id: `tm-${currentPath}`,
          name: seg,
          path: currentPath,
          kind: 'file',
          tokens: file.estimatedTokens,
          bytes: file.sizeBytes,
          fileCount: 1,
          language: file.language,
          layer: file.layer,
          riskScore: riskByFile.get(file.path) ?? 0.16,
        });
      } else {
        let dirNode = current.children.find((c) => c.kind === 'dir' && c.name === seg);
        if (!dirNode) {
          dirNode = {
            id: `tm-dir-${currentPath}`,
            name: seg,
            path: currentPath,
            kind: 'dir',
            tokens: 0,
            bytes: 0,
            fileCount: 0,
            children: [],
          };
          current.children.push(dirNode);
        }
        current = dirNode;
      }
    }
  }

  function rollup(node: TreemapNode): { tokens: number; bytes: number; fileCount: number; riskWeighted: number } {
    if (node.kind === 'file') {
      return {
        tokens: node.tokens,
        bytes: node.bytes,
        fileCount: 1,
        riskWeighted: (node.riskScore ?? 0.16) * node.tokens,
      };
    }
    let tokens = 0;
    let bytes = 0;
    let fileCount = 0;
    let riskWeighted = 0;
    for (const child of node.children ?? []) {
      const stats = rollup(child);
      tokens += stats.tokens;
      bytes += stats.bytes;
      fileCount += stats.fileCount;
      riskWeighted += stats.riskWeighted;
    }
    node.tokens = tokens;
    node.bytes = bytes;
    node.fileCount = fileCount;
    node.riskScore = tokens > 0 ? Number((riskWeighted / tokens).toFixed(3)) : 0;
    if (node.children) {
      node.children.sort((a, b) => b.tokens - a.tokens);
    }
    return { tokens, bytes, fileCount, riskWeighted };
  }

  rollup(root);
  return root;
}

function shannonEntropy(p: number): number {
  const clamped = Math.min(0.995, Math.max(0.005, p));
  const h = -(clamped * Math.log2(clamped) + (1 - clamped) * Math.log2(1 - clamped));
  return Number(h.toFixed(3));
}

interface XRayModuleSpec {
  nodeId: string;
  scores: Record<XRayPillarId, number>;
  flag?: Partial<Record<XRayPillarId, string>>;
  topFinding: string;
}

function buildXRayReport(
  nodes: AtlasNode[],
  specs: XRayModuleSpec[],
  options: {
    latencyMs: number;
    recommendedModelTier: AdaptiveModelTier;
    routingRationale: string;
  },
): XRayMatrixReport {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const modules: XRayModuleAudit[] = [];
  const pillarTotals: Record<XRayPillarId, number> = {
    modularity: 0,
    security: 0,
    resilience: 0,
    testability: 0,
    api_clarity: 0,
    concurrency: 0,
    scalability: 0,
    hygiene: 0,
    onboarding: 0,
  };
  let entropySum = 0;
  let cellCount = 0;

  for (const spec of specs) {
    const node = nodeMap.get(spec.nodeId);
    if (!node) continue;

    const cells = {} as Record<XRayPillarId, XRayCellScore>;
    let modProbSum = 0;

    for (const pillar of ALL_PILLARS) {
      const p = Number(spec.scores[pillar].toFixed(3));
      const entropy = shannonEntropy(p);
      const confidence = Number(Math.max(0.55, Math.min(0.99, 1 - entropy * 0.42)).toFixed(3));
      cells[pillar] = {
        pillar,
        probabilityHealthy: p,
        confidence,
        entropy,
        ...(spec.flag?.[pillar] ? { flagSummary: spec.flag[pillar] } : {}),
      };
      pillarTotals[pillar] += p * 100;
      modProbSum += p;
      entropySum += entropy;
      cellCount += 1;
    }

    const overallHealth = Math.round((modProbSum / ALL_PILLARS.length) * 100);
    const blastRadius = Number(
      Math.min(0.98, Math.max(0.12, node.centrality * 0.65 + (node.fanIn / 10) * 0.35)).toFixed(2),
    );

    modules.push({
      nodeId: node.id,
      label: node.label,
      primaryFile: node.primaryFile,
      layer: node.layer,
      overallHealth,
      blastRadius,
      cells,
      topFinding: spec.topFinding,
    });
  }

  const count = Math.max(1, modules.length);
  const pillarAverages = {} as Record<XRayPillarId, number>;
  let avgSum = 0;
  for (const pillar of ALL_PILLARS) {
    const avg = Math.round(pillarTotals[pillar] / count);
    pillarAverages[pillar] = avg;
    avgSum += avg;
  }

  return {
    model: 'gemini-decision-1',
    totalProbes: modules.length * ALL_PILLARS.length,
    dualKeySharded: true,
    latencyMs: options.latencyMs,
    overallScore: Math.round(avgSum / ALL_PILLARS.length),
    meanEntropy: Number((entropySum / Math.max(1, cellCount)).toFixed(3)),
    recommendedModelTier: options.recommendedModelTier,
    routingRationale: options.routingRationale,
    pillarAverages,
    modules,
    generatedAt: GENERATED_AT,
  };
}

interface BlueprintSpec {
  metadata: RepoMetadata;
  headline: string;
  oneLiner: string;
  architecturePattern: string;
  techStackBadges: string[];
  files: RepoFileRecord[];
  subsystems: SubsystemCluster[];
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  flows: ExecutionFlow[];
  codemapTour: CodemapTourStop[];
  diagrams: MermaidDiagramSpec[];
  xraySpecs: XRayModuleSpec[];
  xrayOptions: {
    latencyMs: number;
    recommendedModelTier: AdaptiveModelTier;
    routingRationale: string;
  };
  totalRepoFiles: number;
  ingestLatencyMs: number;
  aiSynthesisLatencyMs: number;
  modelsUsed: string[];
}

function assembleBlueprint(spec: BlueprintSpec): VisualAtlasBlueprint {
  const xray = buildXRayReport(spec.nodes, spec.xraySpecs, spec.xrayOptions);

  const healthByNode = new Map(xray.modules.map((m) => [m.nodeId, m.overallHealth]));
  const riskByFile = new Map<string, number>();

  const nodes = spec.nodes.map((node) => {
    const health = healthByNode.get(node.id);
    const riskScore =
      health !== undefined ? Number((1 - health / 100).toFixed(3)) : (node.riskScore ?? 0.18);
    for (const fp of node.filePaths) {
      riskByFile.set(fp, riskScore);
    }
    return { ...node, riskScore };
  });

  const subsystems = spec.subsystems.map((sub) => {
    const scores = sub.nodeIds
      .map((id) => healthByNode.get(id))
      .filter((v): v is number => v !== undefined);
    const avgHealth =
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 84;
    return { ...sub, healthScore: avgHealth };
  });

  const dependencyEdges = buildDependencyEdges(spec.files);
  const strata = buildStrata(nodes, spec.files);
  const treemap = buildTreemap(spec.metadata.name, spec.files, riskByFile);

  const totalLines = spec.files.reduce((sum, f) => sum + f.lineCount, 0);
  const totalTokens = spec.files.reduce((sum, f) => sum + f.estimatedTokens, 0);
  const totalBytes = spec.files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const avgFanOut = Number(
    (spec.files.reduce((sum, f) => sum + f.fanOut, 0) / Math.max(1, spec.files.length)).toFixed(2),
  );

  return {
    repoId: spec.metadata.id,
    metadata: spec.metadata,
    headline: spec.headline,
    oneLiner: spec.oneLiner,
    architecturePattern: spec.architecturePattern,
    techStackBadges: spec.techStackBadges,
    files: spec.files,
    dependencyEdges,
    subsystems,
    nodes,
    edges: spec.edges,
    strata,
    flows: spec.flows,
    codemapTour: spec.codemapTour,
    diagrams: spec.diagrams,
    treemap,
    xray,
    posters: [],
    audioTours: [],
    videoReels: [],
    stats: {
      totalFiles: spec.totalRepoFiles,
      analyzedFiles: spec.files.length,
      totalLines,
      totalTokens,
      totalBytes,
      circularDeps: 0,
      avgFanOut,
      ingestLatencyMs: spec.ingestLatencyMs,
      aiSynthesisLatencyMs: spec.aiSynthesisLatencyMs,
    },
    aiEnriched: true,
    modelsUsed: spec.modelsUsed,
    generatedAt: GENERATED_AT,
  };
}

// =============================================================================
// Showcase 1: coderamp-labs/gitingest — Python/FastAPI Repo-to-LLM Digest Engine
// =============================================================================

const GITINGEST_FILES: RepoFileRecord[] = [
  makeFile({
    path: 'src/server/templates/index.html',
    language: 'html',
    layer: 'client',
    estimatedTokens: 1840,
    centrality: 0.48,
    fanIn: 1,
    fanOut: 2,
    imports: ['/api/ingest', '/static/js/utils.js'],
    resolvedImports: ['src/server/routers/ingest.py'],
    exports: ['ingestForm', 'tokenBudgetSlider'],
    symbols: [
      { name: 'ingestForm', kind: 'component', line: 4, endLine: 18, exported: true },
      { name: 'copyDigestButton', kind: 'component', line: 20, endLine: 25, exported: true },
    ],
    isEntrypoint: true,
    content: `<!-- GitIngest Zero-Friction URL-to-Prompt Web Surface -->
<main class="max-w-4xl mx-auto px-6 py-12">
  <form id="ingestForm" action="/api/ingest" method="post" onsubmit="handleIngestSubmit(event)">
    <div class="flex gap-3">
      <input
        name="input_text"
        type="text"
        placeholder="https://github.com/owner/repo"
        required
        class="flex-1 rounded-lg border px-4 py-3 font-mono text-sm"
      />
      <button type="submit" class="rounded-lg bg-cobalt px-6 py-3 font-semibold text-white">
        Ingest
      </button>
    </div>
    <div class="mt-4 grid grid-cols-3 gap-4">
      <input name="pattern_type" type="hidden" value="exclude" />
      <input name="pattern" placeholder="*.lock, dist/*" class="rounded border px-3 py-2 text-xs" />
      <input id="maxFileSize" name="max_file_size" type="range" min="1" max="500" value="243" />
    </div>
  </form>
  <section id="digestOutput" class="mt-8 hidden">
    <button id="copyDigestButton" onclick="copyDigest()">Copy LLM Context</button>
    <pre id="treePreview" class="font-mono text-xs"></pre>
    <textarea id="digestContent" readonly rows="18"></textarea>
  </section>
</main>`,
  }),
  makeFile({
    path: 'src/server/main.py',
    language: 'python',
    layer: 'edge',
    estimatedTokens: 2150,
    centrality: 0.86,
    fanIn: 1,
    fanOut: 4,
    imports: ['fastapi', 'slowapi', 'src.server.routers.ingest', 'src.server.server_utils'],
    resolvedImports: ['src/server/routers/ingest.py', 'src/server/server_utils.py'],
    exports: ['app', 'lifespan'],
    symbols: [
      { name: 'lifespan', kind: 'function', line: 12, endLine: 20, exported: true, signature: 'async def lifespan(app: FastAPI)' },
      { name: 'app', kind: 'const', line: 22, endLine: 30, exported: true },
    ],
    isEntrypoint: true,
    content: `from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.server.routers import ingest
from src.server.server_utils import limiter, remove_stale_clones_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = remove_stale_clones_loop(ttl_seconds=180)
    try:
        yield
    finally:
        cleanup_task.cancel()


app = FastAPI(title="GitIngest API", version="0.3.1", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["gitingest.com", "*.gitingest.com", "localhost"])
app.mount("/static", StaticFiles(directory="src/server/static"), name="static")
app.include_router(ingest.router)`,
  }),
  makeFile({
    path: 'src/server/routers/ingest.py',
    language: 'python',
    layer: 'edge',
    estimatedTokens: 2480,
    centrality: 0.82,
    fanIn: 2,
    fanOut: 3,
    imports: ['fastapi', 'pydantic', 'src.server.query_processor', 'src.server.server_utils'],
    resolvedImports: ['src/server/query_processor.py', 'src/server/server_utils.py'],
    exports: ['router', 'IngestRequest', 'api_ingest'],
    symbols: [
      { name: 'IngestRequest', kind: 'class', line: 9, endLine: 15, exported: true },
      { name: 'api_ingest', kind: 'route', line: 18, endLine: 31, exported: true, signature: 'POST /api/ingest' },
    ],
    content: `from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from src.server.query_processor import process_query
from src.server.server_utils import limiter, slider_to_bytes

router = APIRouter(prefix="/api", tags=["ingest"])


class IngestRequest(BaseModel):
    input_text: str = Field(..., min_length=3, max_length=512)
    max_file_size: int = Field(default=243, ge=1, le=500)
    pattern_type: str = Field(default="exclude", pattern="^(include|exclude)$")
    pattern: str = Field(default="")
    token: str | None = Field(default=None)


@router.post("/ingest")
@limiter.limit("10/minute")
async def api_ingest(request: Request, payload: IngestRequest) -> dict:
    try:
        return await process_query(
            input_text=payload.input_text.strip(),
            max_file_size=slider_to_bytes(payload.max_file_size),
            pattern_type=payload.pattern_type,
            pattern=payload.pattern,
            token=payload.token,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc`,
  }),
  makeFile({
    path: 'src/server/query_processor.py',
    language: 'python',
    layer: 'orchestration',
    estimatedTokens: 2720,
    centrality: 0.79,
    fanIn: 1,
    fanOut: 3,
    imports: ['src.gitingest.entrypoint', 'src.server.server_utils'],
    resolvedImports: ['src/gitingest/entrypoint.py', 'src/server/server_utils.py'],
    exports: ['process_query'],
    symbols: [
      { name: 'process_query', kind: 'function', line: 7, endLine: 29, exported: true, signature: 'async def process_query(...) -> dict' },
    ],
    content: `from src.gitingest.entrypoint import ingest_async
from src.server.server_utils import parse_glob_patterns, redact_token


async def process_query(
    input_text: str,
    max_file_size: int,
    pattern_type: str,
    pattern: str,
    token: str | None = None,
) -> dict:
    patterns = parse_glob_patterns(pattern)
    include_patterns = patterns if pattern_type == "include" else None
    exclude_patterns = patterns if pattern_type == "exclude" else None

    summary, tree, content = await ingest_async(
        source=input_text,
        max_file_size=max_file_size,
        include_patterns=include_patterns,
        exclude_patterns=exclude_patterns,
        token=token,
    )

    return {
        "repo_url": redact_token(input_text),
        "summary": summary,
        "tree": tree,
        "content": content,
        "short_repo_url": input_text.replace("https://github.com/", ""),
    }`,
  }),
  makeFile({
    path: 'src/gitingest/entrypoint.py',
    language: 'python',
    layer: 'orchestration',
    estimatedTokens: 3420,
    centrality: 0.95,
    fanIn: 3,
    fanOut: 4,
    imports: ['asyncio', 'shutil', 'src.gitingest.clone', 'src.gitingest.ingestion', 'src.gitingest.query_parser'],
    resolvedImports: [
      'src/gitingest/query_parser.py',
      'src/gitingest/clone.py',
      'src/gitingest/ingestion.py',
    ],
    exports: ['ingest_async', 'ingest'],
    symbols: [
      { name: 'ingest_async', kind: 'function', line: 10, endLine: 34, exported: true, signature: 'async def ingest_async(...) -> tuple[str, str, str]' },
      { name: 'ingest', kind: 'function', line: 37, endLine: 39, exported: true, signature: 'def ingest(...) -> tuple[str, str, str]' },
    ],
    isEntrypoint: true,
    content: `import asyncio
import shutil
from pathlib import Path

from src.gitingest.clone import clone_repo
from src.gitingest.ingestion import ingest_query
from src.gitingest.query_parser import parse_query


async def ingest_async(
    source: str,
    max_file_size: int = 10 * 1024 * 1024,
    include_patterns: set[str] | None = None,
    exclude_patterns: set[str] | None = None,
    branch: str | None = None,
    token: str | None = None,
) -> tuple[str, str, str]:
    query = await parse_query(
        source=source,
        max_file_size=max_file_size,
        from_web=True,
        include_patterns=include_patterns,
        exclude_patterns=exclude_patterns,
        branch=branch,
    )
    clone_dir: Path | None = None
    try:
        if query.url:
            clone_dir = await clone_repo(query.extract_clone_config(), token=token)
        return ingest_query(query)
    finally:
        if clone_dir and clone_dir.exists():
            shutil.rmtree(clone_dir, ignore_errors=True)


def ingest(source: str, **kwargs) -> tuple[str, str, str]:
    return asyncio.run(ingest_async(source=source, **kwargs))`,
  }),
  makeFile({
    path: 'src/gitingest/query_parser.py',
    language: 'python',
    layer: 'domain',
    estimatedTokens: 3980,
    centrality: 0.84,
    fanIn: 2,
    fanOut: 2,
    imports: ['re', 'uuid', 'urllib.parse', 'src.gitingest.schemas.filesystem_schema'],
    resolvedImports: ['src/gitingest/schemas/filesystem_schema.py'],
    exports: ['parse_query', 'DEFAULT_IGNORE_PATTERNS'],
    symbols: [
      { name: 'DEFAULT_IGNORE_PATTERNS', kind: 'const', line: 7, endLine: 11, exported: true },
      { name: 'parse_query', kind: 'function', line: 14, endLine: 36, exported: true, signature: 'async def parse_query(...) -> IngestionQuery' },
    ],
    content: `import re
import uuid
from pathlib import Path
from urllib.parse import urlparse

from src.gitingest.schemas.filesystem_schema import IngestionQuery

DEFAULT_IGNORE_PATTERNS: frozenset[str] = frozenset({
    "*.pyc", "__pycache__/*", "node_modules/*", ".git/*",
    "package-lock.json", "yarn.lock", "*.min.js", "dist/*",
})


async def parse_query(
    source: str,
    max_file_size: int,
    from_web: bool,
    include_patterns: set[str] | None = None,
    exclude_patterns: set[str] | None = None,
    branch: str | None = None,
) -> IngestionQuery:
    cleaned = source.strip().rstrip("/")
    parsed = urlparse(cleaned if "://" in cleaned else f"https://github.com/{cleaned}")
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 2:
        raise ValueError(f"Expected GitHub owner/repo URL, received: {source}")

    owner, repo = parts[0], re.sub(r"\\.git$", "", parts[1])
    subpath = "/" + "/".join(parts[4:]) if len(parts) > 4 and parts[2] in ("tree", "blob") else "/"
    resolved_branch = branch or (parts[3] if len(parts) > 3 and parts[2] in ("tree", "blob") else None)
    merged_ignores = set(DEFAULT_IGNORE_PATTERNS) | (exclude_patterns or set())

    return IngestionQuery(
        id=uuid.uuid4().hex[:12],
        user_name=owner,
        repo_name=repo,
        url=f"https://{parsed.netloc}/{owner}/{repo}.git",
        local_path=Path("/tmp/gitingest") / f"{owner}-{repo}-{uuid.uuid4().hex[:8]}",
        branch=resolved_branch,
        subpath=subpath,
        max_file_size=max_file_size,
        ignore_patterns=merged_ignores,
        include_patterns=include_patterns or set(),
    )`,
  }),
  makeFile({
    path: 'src/gitingest/clone.py',
    language: 'python',
    layer: 'infrastructure',
    estimatedTokens: 3250,
    centrality: 0.77,
    fanIn: 1,
    fanOut: 1,
    imports: ['asyncio', 'os', 'pathlib', 'src.gitingest.schemas.filesystem_schema'],
    resolvedImports: ['src/gitingest/schemas/filesystem_schema.py'],
    exports: ['clone_repo'],
    symbols: [
      { name: 'clone_repo', kind: 'function', line: 8, endLine: 34, exported: true, signature: 'async def clone_repo(config: CloneConfig, token: str | None) -> Path' },
    ],
    content: `import asyncio
import os
from pathlib import Path

from src.gitingest.schemas.filesystem_schema import CloneConfig


async def clone_repo(config: CloneConfig, token: str | None = None) -> Path:
    cmd = ["git", "clone", "--depth=1", "--single-branch", "--filter=blob:none"]
    if config.branch:
        cmd.extend(["--branch", config.branch])
    if config.subpath and config.subpath != "/":
        cmd.append("--sparse")

    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    clone_url = config.url
    if token and clone_url.startswith("https://"):
        clone_url = clone_url.replace("https://", f"https://x-access-token:{token}@", 1)

    cmd.extend([clone_url, str(config.local_path)])
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    _, stderr = await asyncio.wait_for(proc.communicate(), timeout=45.0)
    if proc.returncode != 0:
        raise RuntimeError(f"git clone failed ({proc.returncode}): {stderr.decode().strip()}")

    if config.subpath and config.subpath != "/":
        sparse = await asyncio.create_subprocess_exec(
            "git", "-C", str(config.local_path), "sparse-checkout", "set", config.subpath.lstrip("/")
        )
        await sparse.communicate()
    return config.local_path`,
  }),
  makeFile({
    path: 'src/gitingest/ingestion.py',
    language: 'python',
    layer: 'domain',
    estimatedTokens: 4680,
    centrality: 0.91,
    fanIn: 1,
    fanOut: 2,
    imports: ['fnmatch', 'pathlib', 'src.gitingest.output_formatter', 'src.gitingest.schemas.filesystem_schema'],
    resolvedImports: [
      'src/gitingest/output_formatter.py',
      'src/gitingest/schemas/filesystem_schema.py',
    ],
    exports: ['ingest_query', 'walk_directory'],
    symbols: [
      { name: 'ingest_query', kind: 'function', line: 9, endLine: 17, exported: true, signature: 'def ingest_query(query: IngestionQuery) -> tuple[str, str, str]' },
      { name: 'walk_directory', kind: 'function', line: 20, endLine: 40, exported: true, signature: 'def walk_directory(...) -> FileSystemNode' },
    ],
    content: `import fnmatch
from pathlib import Path

from src.gitingest.output_formatter import format_node
from src.gitingest.schemas.filesystem_schema import FileSystemNode, FileSystemStats, IngestionQuery

MAX_TOTAL_FILES = 10_000


def ingest_query(query: IngestionQuery) -> tuple[str, str, str]:
    target = query.local_path / query.subpath.lstrip("/")
    if not target.exists():
        raise ValueError(f"Subpath not found in repository: {query.subpath}")

    stats = FileSystemStats()
    root = walk_directory(target, query, stats, depth=0)
    return format_node(root, query)


def walk_directory(
    path: Path, query: IngestionQuery, stats: FileSystemStats, depth: int
) -> FileSystemNode:
    node = FileSystemNode(name=path.name, path=path, is_dir=True, depth=depth)
    if depth > 20 or stats.total_files >= MAX_TOTAL_FILES:
        return node

    for entry in sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        rel = str(entry.relative_to(query.local_path))
        if any(fnmatch.fnmatch(rel, pat) for pat in query.ignore_patterns):
            continue
        if entry.is_symlink():
            continue
        if entry.is_dir():
            child = walk_directory(entry, query, stats, depth + 1)
            if child.children:
                node.children.append(child)
        elif entry.stat().st_size <= query.max_file_size:
            raw = entry.read_bytes()
            if b"\\x00" in raw[:1024]:
                continue
            stats.total_files += 1
            stats.total_size += len(raw)
            node.children.append(FileSystemNode(name=entry.name, path=entry, is_dir=False, depth=depth + 1, content=raw.decode("utf-8", errors="replace")))
    return node`,
  }),
  makeFile({
    path: 'src/gitingest/output_formatter.py',
    language: 'python',
    layer: 'domain',
    estimatedTokens: 3120,
    centrality: 0.74,
    fanIn: 1,
    fanOut: 1,
    imports: ['tiktoken', 'src.gitingest.schemas.filesystem_schema'],
    resolvedImports: ['src/gitingest/schemas/filesystem_schema.py'],
    exports: ['format_node', 'estimate_tokens'],
    symbols: [
      { name: 'format_node', kind: 'function', line: 7, endLine: 25, exported: true, signature: 'def format_node(root: FileSystemNode, query: IngestionQuery) -> tuple[str, str, str]' },
      { name: 'estimate_tokens', kind: 'function', line: 28, endLine: 32, exported: true, signature: 'def estimate_tokens(text: str) -> str' },
    ],
    content: `import tiktoken

from src.gitingest.schemas.filesystem_schema import FileSystemNode, IngestionQuery

SEPARATOR = "=" * 48


def format_node(root: FileSystemNode, query: IngestionQuery) -> tuple[str, str, str]:
    tree_lines: list[str] = ["Directory structure:"]
    body_chunks: list[str] = []

    def visit(node: FileSystemNode, prefix: str = "") -> None:
        tree_lines.append(f"{prefix}{node.name}{'/' if node.is_dir else ''}")
        if not node.is_dir and node.content is not None:
            rel = str(node.path.relative_to(query.local_path))
            body_chunks.append(f"{SEPARATOR}\\nFILE: {rel}\\n{SEPARATOR}\\n{node.content}\\n")
        for idx, child in enumerate(node.children):
            branch = "└── " if idx == len(node.children) - 1 else "├── "
            visit(child, prefix + branch)

    visit(root)
    tree = "\\n".join(tree_lines)
    content = "\\n".join(body_chunks)
    summary = f"Repository: {query.user_name}/{query.repo_name}\\nFiles analyzed: {len(body_chunks)}\\nEstimated tokens: {estimate_tokens(tree + content)}"
    return summary, tree, content


def estimate_tokens(text: str) -> str:
    enc = tiktoken.get_encoding("cl100k_base")
    count = len(enc.encode(text, disallowed_special=()))
    return f"{count / 1000:.1f}k" if count >= 1000 else str(count)`,
  }),
  makeFile({
    path: 'src/gitingest/schemas/filesystem_schema.py',
    language: 'python',
    layer: 'domain',
    estimatedTokens: 2040,
    centrality: 0.88,
    fanIn: 4,
    fanOut: 0,
    imports: ['dataclasses', 'pathlib'],
    resolvedImports: [],
    exports: ['CloneConfig', 'IngestionQuery', 'FileSystemNode', 'FileSystemStats'],
    symbols: [
      { name: 'CloneConfig', kind: 'class', line: 6, endLine: 11, exported: true },
      { name: 'IngestionQuery', kind: 'class', line: 14, endLine: 29, exported: true },
      { name: 'FileSystemNode', kind: 'class', line: 32, endLine: 39, exported: true },
    ],
    content: `from dataclasses import dataclass, field
from pathlib import Path


@dataclass(slots=True)
class CloneConfig:
    url: str
    local_path: Path
    branch: str | None = None
    subpath: str = "/"


@dataclass(slots=True)
class IngestionQuery:
    id: str
    user_name: str
    repo_name: str
    url: str
    local_path: Path
    branch: str | None
    subpath: str
    max_file_size: int
    ignore_patterns: set[str]
    include_patterns: set[str]

    def extract_clone_config(self) -> CloneConfig:
        return CloneConfig(url=self.url, local_path=self.local_path, branch=self.branch, subpath=self.subpath)


@dataclass(slots=True)
class FileSystemNode:
    name: str
    path: Path
    is_dir: bool
    depth: int
    content: str | None = None
    children: list["FileSystemNode"] = field(default_factory=list)


@dataclass(slots=True)
class FileSystemStats:
    total_files: int = 0
    total_size: int = 0`,
  }),
  makeFile({
    path: 'src/server/server_utils.py',
    language: 'python',
    layer: 'infrastructure',
    estimatedTokens: 1960,
    centrality: 0.69,
    fanIn: 3,
    fanOut: 0,
    imports: ['asyncio', 're', 'shutil', 'time', 'slowapi'],
    resolvedImports: [],
    exports: ['limiter', 'slider_to_bytes', 'parse_glob_patterns', 'redact_token', 'remove_stale_clones_loop'],
    symbols: [
      { name: 'slider_to_bytes', kind: 'function', line: 10, endLine: 12, exported: true },
      { name: 'remove_stale_clones_loop', kind: 'function', line: 22, endLine: 32, exported: true },
    ],
    content: `import asyncio
import re
import shutil
import time
from pathlib import Path
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


def slider_to_bytes(position: int) -> int:
    return int((1024 * (1.02 ** position)))


def parse_glob_patterns(raw: str) -> set[str]:
    return {token.strip() for token in raw.split(",") if token.strip()}


def redact_token(url: str) -> str:
    return re.sub(r"https://[^@]+@", "https://", url)


def remove_stale_clones_loop(ttl_seconds: int = 180) -> asyncio.Task:
    async def _reap() -> None:
        base = Path("/tmp/gitingest")
        while True:
            await asyncio.sleep(60)
            if not base.exists():
                continue
            cutoff = time.time() - ttl_seconds
            for entry in base.iterdir():
                if entry.is_dir() and entry.stat().st_mtime < cutoff:
                    shutil.rmtree(entry, ignore_errors=True)

    return asyncio.create_task(_reap())`,
  }),
  makeFile({
    path: 'src/gitingest/cli.py',
    language: 'python',
    layer: 'client',
    estimatedTokens: 1580,
    centrality: 0.44,
    fanIn: 0,
    fanOut: 1,
    imports: ['click', 'pathlib', 'src.gitingest.entrypoint'],
    resolvedImports: ['src/gitingest/entrypoint.py'],
    exports: ['main'],
    symbols: [
      { name: 'main', kind: 'function', line: 10, endLine: 23, exported: true, signature: 'def main(source, output, max_size, exclude_pattern)' },
    ],
    isEntrypoint: true,
    content: `from pathlib import Path
import click

from src.gitingest.entrypoint import ingest


@click.command()
@click.argument("source", default=".")
@click.option("-o", "--output", default="digest.txt", help="Output digest path.")
@click.option("-s", "--max-size", default=10_485_760, type=int, help="Max file size in bytes.")
@click.option("-e", "--exclude-pattern", multiple=True, help="Glob patterns to exclude.")
def main(source: str, output: str, max_size: int, exclude_pattern: tuple[str, ...]) -> None:
    summary, tree, content = ingest(
        source=source,
        max_file_size=max_size,
        exclude_patterns=set(exclude_pattern) or None,
    )
    digest = f"{summary}\\n\\n{tree}\\n\\n{content}"
    Path(output).write_text(digest, encoding="utf-8")
    click.echo(f"Wrote LLM digest to {output}\\n{summary}")`,
  }),
];

const GITINGEST_NODES: AtlasNode[] = [
  {
    id: 'gi-web-ui',
    label: 'Web Ingest Form',
    subtitle: 'Jinja/HTMX prompt-pack interface',
    subsystemId: 'gi-sub-ingress',
    layer: 'client',
    kind: 'ui',
    filePaths: ['src/server/templates/index.html'],
    primaryFile: 'src/server/templates/index.html',
    lineStart: 1,
    lineEnd: 26,
    estimatedTokens: 1840,
    centrality: 0.48,
    fanIn: 0,
    fanOut: 1,
    keySymbols: ['ingestForm', 'copyDigestButton'],
    visualBrief: 'Zero-friction single-input GitHub URL form with logarithmic file-size slider and one-click digest copy.',
    inputs: ['GitHub URL or owner/repo slug', 'Include/exclude glob patterns', 'Max file size slider position'],
    outputs: ['POST /api/ingest form submission', 'Copyable prompt-ready digest'],
    x: 60,
    y: 60,
  },
  {
    id: 'gi-cli',
    label: 'Click CLI',
    subtitle: 'Local terminal digest runner',
    subsystemId: 'gi-sub-ingress',
    layer: 'client',
    kind: 'ui',
    filePaths: ['src/gitingest/cli.py'],
    primaryFile: 'src/gitingest/cli.py',
    lineStart: 7,
    lineEnd: 20,
    estimatedTokens: 1580,
    centrality: 0.44,
    fanIn: 0,
    fanOut: 1,
    keySymbols: ['main'],
    visualBrief: 'Command-line entrypoint that invokes the same async ingestion engine for local directories or remote repos.',
    inputs: ['CLI source path or URL', '--exclude-pattern flags', '--max-size byte cap'],
    outputs: ['digest.txt file on disk', 'Stdout token summary'],
    x: 60,
    y: 230,
  },
  {
    id: 'gi-fastapi-app',
    label: 'FastAPI App Host',
    subtitle: 'Lifespan reaper & host middleware',
    subsystemId: 'gi-sub-ingress',
    layer: 'edge',
    kind: 'api',
    filePaths: ['src/server/main.py'],
    primaryFile: 'src/server/main.py',
    lineStart: 12,
    lineEnd: 26,
    estimatedTokens: 2150,
    centrality: 0.86,
    fanIn: 1,
    fanOut: 2,
    keySymbols: ['app', 'lifespan'],
    visualBrief: 'FastAPI ASGI bootstrapper registering TrustedHost guards, SlowAPI rate limiting, and the background clone reaper.',
    inputs: ['HTTP requests to gitingest.com', 'ASGI startup/shutdown lifecycle'],
    outputs: ['Routed API traffic', 'Scheduled /tmp clone cleanup'],
    x: 310,
    y: 60,
  },
  {
    id: 'gi-ingest-router',
    label: 'Ingest API Router',
    subtitle: 'Rate-limited POST /api/ingest',
    subsystemId: 'gi-sub-ingress',
    layer: 'edge',
    kind: 'api',
    filePaths: ['src/server/routers/ingest.py'],
    primaryFile: 'src/server/routers/ingest.py',
    lineStart: 9,
    lineEnd: 30,
    estimatedTokens: 2480,
    centrality: 0.82,
    fanIn: 2,
    fanOut: 2,
    keySymbols: ['IngestRequest', 'api_ingest'],
    visualBrief: 'Validates Pydantic request payloads, enforces 10 req/min IP limits, and converts slider positions to byte caps.',
    inputs: ['IngestRequest JSON payload', 'Optional GitHub PAT token'],
    outputs: ['Validated digest JSON response', 'HTTP 400/429 error envelopes'],
    x: 310,
    y: 220,
  },
  {
    id: 'gi-query-proc',
    label: 'Web Query Processor',
    subtitle: 'Pattern parsing & token redaction',
    subsystemId: 'gi-sub-pipeline',
    layer: 'orchestration',
    kind: 'service',
    filePaths: ['src/server/query_processor.py'],
    primaryFile: 'src/server/query_processor.py',
    lineStart: 5,
    lineEnd: 29,
    estimatedTokens: 2720,
    centrality: 0.79,
    fanIn: 1,
    fanOut: 2,
    keySymbols: ['process_query'],
    visualBrief: 'Bridges HTTP parameters to the core library by parsing comma-separated globs and scrubbing credentials from responses.',
    inputs: ['Sanitized input_text', 'Include/exclude glob string', 'Byte cap'],
    outputs: ['Structured summary + tree + content payload'],
    x: 560,
    y: 120,
  },
  {
    id: 'gi-entrypoint',
    label: 'Core Ingestion Orchestrator',
    subtitle: 'parse -> clone -> walk -> cleanup',
    subsystemId: 'gi-sub-pipeline',
    layer: 'orchestration',
    kind: 'pipeline',
    filePaths: ['src/gitingest/entrypoint.py'],
    primaryFile: 'src/gitingest/entrypoint.py',
    lineStart: 10,
    lineEnd: 38,
    estimatedTokens: 3420,
    centrality: 0.95,
    fanIn: 2,
    fanOut: 3,
    keySymbols: ['ingest_async', 'ingest'],
    visualBrief: 'Central pipeline coordinator that parses targets, performs shallow sparse clones, extracts digests, and guarantees tmp cleanup.',
    inputs: ['Remote URL or local path', 'Filter sets & branch override'],
    outputs: ['(summary, tree, content) 3-tuple'],
    x: 560,
    y: 280,
  },
  {
    id: 'gi-query-parser',
    label: 'Git URL & Glob Parser',
    subtitle: 'Branch/subpath extraction + defaults',
    subsystemId: 'gi-sub-compiler',
    layer: 'domain',
    kind: 'module',
    filePaths: ['src/gitingest/query_parser.py'],
    primaryFile: 'src/gitingest/query_parser.py',
    lineStart: 14,
    lineEnd: 41,
    estimatedTokens: 3980,
    centrality: 0.84,
    fanIn: 1,
    fanOut: 1,
    keySymbols: ['parse_query', 'DEFAULT_IGNORE_PATTERNS'],
    visualBrief: 'Normalizes GitHub URLs, extracts /tree/branch/subpath targets, and merges user globs with default binary/lockfile ignores.',
    inputs: ['Raw user URL or slug', 'Optional branch & custom globs'],
    outputs: ['Normalized IngestionQuery dataclass'],
    x: 820,
    y: 80,
  },
  {
    id: 'gi-tree-walker',
    label: 'Filesystem Tree Walker',
    subtitle: 'Depth-bounded binary-safe crawler',
    subsystemId: 'gi-sub-compiler',
    layer: 'domain',
    kind: 'module',
    filePaths: ['src/gitingest/ingestion.py'],
    primaryFile: 'src/gitingest/ingestion.py',
    lineStart: 9,
    lineEnd: 43,
    estimatedTokens: 4680,
    centrality: 0.91,
    fanIn: 1,
    fanOut: 2,
    keySymbols: ['ingest_query', 'walk_directory'],
    visualBrief: 'Recursively walks cloned files while enforcing symlink immunity, null-byte binary sniffing, 10k file caps, and size bounds.',
    inputs: ['IngestionQuery', 'Cloned directory on /tmp'],
    outputs: ['Populated FileSystemNode tree'],
    x: 820,
    y: 240,
  },
  {
    id: 'gi-formatter',
    label: 'Digest & Token Formatter',
    subtitle: 'ASCII tree + tiktoken cl100k meter',
    subsystemId: 'gi-sub-compiler',
    layer: 'domain',
    kind: 'module',
    filePaths: ['src/gitingest/output_formatter.py', 'src/gitingest/schemas/filesystem_schema.py'],
    primaryFile: 'src/gitingest/output_formatter.py',
    lineStart: 7,
    lineEnd: 31,
    estimatedTokens: 5160,
    centrality: 0.88,
    fanIn: 4,
    fanOut: 0,
    keySymbols: ['format_node', 'estimate_tokens', 'IngestionQuery', 'FileSystemNode'],
    visualBrief: 'Compiles the FileSystemNode hierarchy into an ASCII tree header, delimited file blocks, and cl100k_base token count.',
    inputs: ['FileSystemNode tree', 'IngestionQuery metadata'],
    outputs: ['Formatted LLM prompt digest + token count'],
    x: 1080,
    y: 240,
  },
  {
    id: 'gi-git-cloner',
    label: 'Shallow Sparse Git Cloner',
    subtitle: 'Subprocess git + TTL temp reaper',
    subsystemId: 'gi-sub-infra',
    layer: 'infrastructure',
    kind: 'external',
    filePaths: ['src/gitingest/clone.py', 'src/server/server_utils.py'],
    primaryFile: 'src/gitingest/clone.py',
    lineStart: 8,
    lineEnd: 35,
    estimatedTokens: 5210,
    centrality: 0.77,
    fanIn: 3,
    fanOut: 0,
    keySymbols: ['clone_repo', 'limiter', 'remove_stale_clones_loop'],
    visualBrief: 'Executes non-interactive shallow partial git clones with 45s timeouts, sparse subpath checkout, and background disk cleanup.',
    inputs: ['CloneConfig', 'Optional private repo token'],
    outputs: ['Ephemeral /tmp/gitingest checkout path'],
    x: 820,
    y: 410,
  },
];

const GITINGEST_EDGES: AtlasEdge[] = [
  { id: 'gi-e1', source: 'gi-web-ui', target: 'gi-fastapi-app', label: 'POST /api/ingest', kind: 'http', protocol: 'HTTP/1.1', weight: 3, isHotPath: true },
  { id: 'gi-e2', source: 'gi-fastapi-app', target: 'gi-ingest-router', label: 'dispatch route', kind: 'control', weight: 3, isHotPath: true },
  { id: 'gi-e3', source: 'gi-ingest-router', target: 'gi-query-proc', label: 'process_query()', kind: 'control', weight: 3, isHotPath: true },
  { id: 'gi-e4', source: 'gi-query-proc', target: 'gi-entrypoint', label: 'ingest_async()', kind: 'control', weight: 3, isHotPath: true },
  { id: 'gi-e5', source: 'gi-cli', target: 'gi-entrypoint', label: 'ingest() sync bridge', kind: 'control', weight: 2, isHotPath: false },
  { id: 'gi-e6', source: 'gi-entrypoint', target: 'gi-query-parser', label: 'parse_query()', kind: 'data', weight: 3, isHotPath: true },
  { id: 'gi-e7', source: 'gi-entrypoint', target: 'gi-git-cloner', label: 'clone_repo(depth=1)', kind: 'control', protocol: 'git-https', weight: 3, isHotPath: true },
  { id: 'gi-e8', source: 'gi-entrypoint', target: 'gi-tree-walker', label: 'ingest_query()', kind: 'data', weight: 3, isHotPath: true },
  { id: 'gi-e9', source: 'gi-tree-walker', target: 'gi-formatter', label: 'format_node(root)', kind: 'data', weight: 3, isHotPath: true },
  { id: 'gi-e10', source: 'gi-query-parser', target: 'gi-formatter', label: 'IngestionQuery schema', kind: 'dependency', weight: 2, isHotPath: false },
  { id: 'gi-e11', source: 'gi-git-cloner', target: 'gi-formatter', label: 'CloneConfig schema', kind: 'dependency', weight: 1, isHotPath: false },
  { id: 'gi-e12', source: 'gi-fastapi-app', target: 'gi-git-cloner', label: 'reap stale /tmp dirs', kind: 'control', weight: 2, isHotPath: false },
  { id: 'gi-e13', source: 'gi-ingest-router', target: 'gi-git-cloner', label: 'SlowAPI limiter & slider', kind: 'dependency', weight: 2, isHotPath: false },
  { id: 'gi-e14', source: 'gi-query-proc', target: 'gi-git-cloner', label: 'redact_token()', kind: 'dependency', weight: 1, isHotPath: false },
];

const GITINGEST_SUBSYSTEMS: SubsystemCluster[] = [
  {
    id: 'gi-sub-ingress',
    name: 'Web & CLI Ingress',
    tagline: 'Single-URL prompt UI, FastAPI gateway, and Click CLI',
    layer: 'edge',
    color: '#4285F4',
    nodeIds: ['gi-web-ui', 'gi-cli', 'gi-fastapi-app', 'gi-ingest-router'],
    filePaths: ['src/server/templates/index.html', 'src/gitingest/cli.py', 'src/server/main.py', 'src/server/routers/ingest.py'],
    entrypointPaths: ['src/server/main.py', 'src/gitingest/cli.py'],
    totalTokens: 8050,
    summaryBullets: [
      'Accepts both GitHub URLs and direct gitingest.com slug swaps with logarithmic file-size sliders.',
      'Protects compute with SlowAPI IP throttling (10/min) and TrustedHostMiddleware.',
    ],
    invariants: ['Never leak user GitHub PAT tokens in error responses or logs', 'Enforce strict Pydantic bounds on max_file_size'],
  },
  {
    id: 'gi-sub-pipeline',
    name: 'Ingestion Orchestrator',
    tagline: 'Async pipeline sequencing parse, shallow clone, walk, and cleanup',
    layer: 'orchestration',
    color: '#1A73E8',
    nodeIds: ['gi-query-proc', 'gi-entrypoint'],
    filePaths: ['src/server/query_processor.py', 'src/gitingest/entrypoint.py'],
    entrypointPaths: ['src/gitingest/entrypoint.py'],
    totalTokens: 6140,
    summaryBullets: [
      'Single shared async orchestration core powers both the FastAPI server and synchronous Python SDK/CLI.',
      'Guarantees deterministic temp directory teardown via try/finally even on clone timeouts.',
    ],
    invariants: ['Always remove ephemeral /tmp clone folders in finally blocks'],
  },
  {
    id: 'gi-sub-compiler',
    name: 'AST-Free Digest Compiler',
    tagline: 'URL normalization, binary-safe tree walk, and tiktoken metering',
    layer: 'domain',
    color: '#2DD4BF',
    nodeIds: ['gi-query-parser', 'gi-tree-walker', 'gi-formatter'],
    filePaths: [
      'src/gitingest/query_parser.py',
      'src/gitingest/ingestion.py',
      'src/gitingest/output_formatter.py',
      'src/gitingest/schemas/filesystem_schema.py',
    ],
    entrypointPaths: ['src/gitingest/ingestion.py'],
    totalTokens: 13820,
    summaryBullets: [
      'Filters lockfiles, build outputs, symlinks, and null-byte binaries before reading text.',
      'Emits a compact ASCII tree header + delimited source payload measured with cl100k_base.',
    ],
    invariants: ['Never traverse symlinks outside the cloned sandbox', 'Cap crawl at 10,000 files and depth 20'],
  },
  {
    id: 'gi-sub-infra',
    name: 'Git & Disk Infrastructure',
    tagline: 'Partial shallow git subprocess runner and background TTL reaper',
    layer: 'infrastructure',
    color: '#818CF8',
    nodeIds: ['gi-git-cloner'],
    filePaths: ['src/gitingest/clone.py', 'src/server/server_utils.py'],
    entrypointPaths: ['src/gitingest/clone.py'],
    totalTokens: 5210,
    summaryBullets: [
      'Uses --depth=1 --filter=blob:none and sparse-checkout to minimize clone bandwidth.',
      'Background asyncio reaper sweeps orphaned /tmp/gitingest directories older than 180s.',
    ],
    invariants: ['Always set GIT_TERMINAL_PROMPT=0 and a 45s wait_for timeout on git subprocesses'],
  },
];

const GITINGEST_BLUEPRINT = assembleBlueprint({
  metadata: {
    id: 'coderamp-labs__gitingest__main',
    owner: 'coderamp-labs',
    name: 'gitingest',
    fullName: 'coderamp-labs/gitingest',
    description: 'Replace "hub" with "ingest" in any GitHub URL to get a prompt-friendly text digest of a codebase.',
    defaultBranch: 'main',
    branch: 'main',
    stars: 14820,
    forks: 1120,
    openIssues: 42,
    primaryLanguage: 'Python',
    languages: { Python: 84, HTML: 11, JavaScript: 5 },
    topics: ['llm', 'prompt-engineering', 'fastapi', 'git', 'codebase-digest', 'python'],
    license: 'MIT',
    htmlUrl: 'https://github.com/coderamp-labs/gitingest',
    homepage: 'https://gitingest.com',
    updatedAt: '2026-11-12T10:20:00.000Z',
    isPrivate: false,
    isShowcase: true,
  },
  headline: 'Zero-Friction Repo-to-Prompt Digest Pipeline',
  oneLiner: 'Converts any GitHub URL into a token-budgeted ASCII tree and source digest via shallow sparse git clones and FastAPI.',
  architecturePattern: 'Stateless FastAPI Gateway + Ephemeral Shallow-Clone Pipeline',
  techStackBadges: ['Python 3.12', 'FastAPI', 'SlowAPI', 'Git Sparse Clone', 'tiktoken', 'Click CLI'],
  files: GITINGEST_FILES,
  subsystems: GITINGEST_SUBSYSTEMS,
  nodes: GITINGEST_NODES,
  edges: GITINGEST_EDGES,
  flows: [
    {
      id: 'gi-flow-web-ingest',
      title: 'GitHub URL to Prompt Digest',
      subtitle: 'End-to-end HTTP request from form submit through shallow clone to cl100k token output',
      trigger: 'User submits https://github.com/owner/repo on gitingest.com',
      category: 'ingestion',
      steps: [
        {
          stepNumber: 1,
          title: 'Validate & Rate-Limit Request',
          action: 'SlowAPI enforces 10/min per IP while Pydantic checks URL bounds and converts the slider to bytes.',
          fromNodeId: 'gi-web-ui',
          toNodeId: 'gi-ingest-router',
          edgeLabel: 'POST /api/ingest',
          filePath: 'src/server/routers/ingest.py',
          lineStart: 17,
          lineEnd: 27,
          codeExcerpt: '@router.post("/ingest")\n@limiter.limit("10/minute")\nasync def api_ingest(request: Request, payload: IngestRequest) -> dict:\n    return await process_query(..., max_file_size=slider_to_bytes(payload.max_file_size))',
          dataPayload: '{ input_text: "coderamp-labs/gitingest", max_file_size: 243, pattern_type: "exclude" }',
        },
        {
          stepNumber: 2,
          title: 'Parse Target & Merge Default Ignores',
          action: 'Extracts owner, repo, optional branch/subpath, and merges lockfile/binary exclude globs.',
          fromNodeId: 'gi-entrypoint',
          toNodeId: 'gi-query-parser',
          edgeLabel: 'parse_query()',
          filePath: 'src/gitingest/query_parser.py',
          lineStart: 24,
          lineEnd: 33,
          codeExcerpt: 'owner, repo = parts[0], re.sub(r"\\.git$", "", parts[1])\nsubpath = "/" + "/".join(parts[4:]) if len(parts) > 4 else "/"\nmerged_ignores = set(DEFAULT_IGNORE_PATTERNS) | (exclude_patterns or set())',
          dataPayload: 'IngestionQuery(user_name="coderamp-labs", repo_name="gitingest", subpath="/")',
        },
        {
          stepNumber: 3,
          title: 'Execute Shallow Partial Git Clone',
          action: 'Spawns non-interactive git clone with --depth=1 --filter=blob:none and a 45s timeout.',
          fromNodeId: 'gi-entrypoint',
          toNodeId: 'gi-git-cloner',
          edgeLabel: 'clone_repo()',
          filePath: 'src/gitingest/clone.py',
          lineStart: 8,
          lineEnd: 26,
          codeExcerpt: 'cmd = ["git", "clone", "--depth=1", "--single-branch", "--filter=blob:none"]\nproc = await asyncio.create_subprocess_exec(*cmd, env=env)\n_, stderr = await asyncio.wait_for(proc.communicate(), timeout=45.0)',
          dataPayload: 'Path("/tmp/gitingest/coderamp-labs-gitingest-a4f8c1d0")',
        },
        {
          stepNumber: 4,
          title: 'Binary-Safe Directory Crawl',
          action: 'Walks files deterministically, rejecting symlinks, oversized files, and null-byte binary payloads.',
          fromNodeId: 'gi-entrypoint',
          toNodeId: 'gi-tree-walker',
          edgeLabel: 'ingest_query()',
          filePath: 'src/gitingest/ingestion.py',
          lineStart: 27,
          lineEnd: 41,
          codeExcerpt: 'if any(fnmatch.fnmatch(rel, pat) for pat in query.ignore_patterns):\n    continue\nif entry.is_symlink() or b"\\x00" in raw[:1024]:\n    continue',
          dataPayload: 'FileSystemNode(children=42, total_files=42)',
        },
        {
          stepNumber: 5,
          title: 'Compile Tree, Delimited Body & Token Count',
          action: 'Renders the ASCII tree header, concatenates file blocks, and counts tokens with tiktoken.',
          fromNodeId: 'gi-tree-walker',
          toNodeId: 'gi-formatter',
          edgeLabel: 'format_node()',
          filePath: 'src/gitingest/output_formatter.py',
          lineStart: 19,
          lineEnd: 29,
          codeExcerpt: 'tree = "\\n".join(tree_lines)\ncontent = "\\n".join(body_chunks)\nsummary = f"Repository: {query.user_name}/{query.repo_name}\\nEstimated tokens: {estimate_tokens(tree + content)}"',
          dataPayload: '(summary="Estimated tokens: 33.2k", tree="...", content="...")',
        },
      ],
    },
    {
      id: 'gi-flow-cli-cleanup',
      title: 'CLI Local Digest & Temp Reaper Safety',
      subtitle: 'How synchronous CLI runs and FastAPI background tasks prevent disk exhaustion',
      trigger: 'Developer runs `gitingest . -o digest.txt` or FastAPI lifespan starts',
      category: 'build',
      steps: [
        {
          stepNumber: 1,
          title: 'Sync CLI Invokes Async Engine',
          action: 'Click command parses glob flags and delegates to ingest() which runs asyncio.run(ingest_async).',
          fromNodeId: 'gi-cli',
          toNodeId: 'gi-entrypoint',
          edgeLabel: 'ingest()',
          filePath: 'src/gitingest/cli.py',
          lineStart: 12,
          lineEnd: 18,
          codeExcerpt: 'summary, tree, content = ingest(source=source, max_file_size=max_size, exclude_patterns=set(exclude_pattern) or None)\nPath(output).write_text(f"{summary}\\n\\n{tree}\\n\\n{content}", encoding="utf-8")',
        },
        {
          stepNumber: 2,
          title: 'Guaranteed Try/Finally Teardown',
          action: 'Remote clones are deleted immediately after formatting regardless of parser or I/O errors.',
          fromNodeId: 'gi-entrypoint',
          toNodeId: 'gi-git-cloner',
          edgeLabel: 'shutil.rmtree()',
          filePath: 'src/gitingest/entrypoint.py',
          lineStart: 27,
          lineEnd: 33,
          codeExcerpt: 'finally:\n    if clone_dir and clone_dir.exists():\n        shutil.rmtree(clone_dir, ignore_errors=True)',
        },
        {
          stepNumber: 3,
          title: 'Background Orphan Sweeper',
          action: 'FastAPI lifespan runs a 60s asyncio reaper that deletes any leftover /tmp/gitingest clones past 180s TTL.',
          fromNodeId: 'gi-fastapi-app',
          toNodeId: 'gi-git-cloner',
          edgeLabel: 'remove_stale_clones_loop()',
          filePath: 'src/server/server_utils.py',
          lineStart: 22,
          lineEnd: 33,
          codeExcerpt: 'cutoff = time.time() - ttl_seconds\nfor entry in base.iterdir():\n    if entry.is_dir() and entry.stat().st_mtime < cutoff:\n        shutil.rmtree(entry, ignore_errors=True)',
        },
      ],
    },
  ],
  codemapTour: [
    {
      id: 'gi-tour-1',
      order: 1,
      title: 'Dual Entrypoints, One Core Pipeline',
      visualHook: 'Both the FastAPI web gateway and Click CLI converge directly onto ingest_async().',
      explanation: 'Keeping all orchestration inside src/gitingest/entrypoint.py eliminates behavioral drift between the hosted web app and local Python package.',
      focusNodeId: 'gi-entrypoint',
      highlightNodeIds: ['gi-web-ui', 'gi-cli', 'gi-ingest-router', 'gi-entrypoint'],
      filePath: 'src/gitingest/entrypoint.py',
      lineStart: 10,
      lineEnd: 34,
      recommendedLens: 'atlas',
    },
    {
      id: 'gi-tour-2',
      order: 2,
      title: 'Clean 5-Layer Vertical Separation',
      visualHook: 'Notice zero upward arrows in Strata 3D — domain modules never import FastAPI.',
      explanation: 'Rate limiting and HTTP validation live strictly in edge/infrastructure layers, while query_parser, ingestion, and output_formatter remain pure Python.',
      focusNodeId: 'gi-ingest-router',
      highlightNodeIds: ['gi-fastapi-app', 'gi-ingest-router', 'gi-query-proc'],
      filePath: 'src/server/routers/ingest.py',
      lineStart: 17,
      lineEnd: 30,
      recommendedLens: 'strata3d',
    },
    {
      id: 'gi-tour-3',
      order: 3,
      title: 'Sparse Shallow Clone Mechanics',
      visualHook: 'Partial blobless clones + 45s timeouts keep latency low on massive monorepos.',
      explanation: 'clone.py combines --depth=1 --filter=blob:none with optional git sparse-checkout when the URL targets a subdirectory.',
      focusNodeId: 'gi-git-cloner',
      highlightNodeIds: ['gi-entrypoint', 'gi-git-cloner'],
      filePath: 'src/gitingest/clone.py',
      lineStart: 8,
      lineEnd: 34,
      recommendedLens: 'flows',
    },
    {
      id: 'gi-tour-4',
      order: 4,
      title: 'Where the Code Mass Lives',
      visualHook: 'Over 41% of total repository tokens sit inside the three core compiler modules.',
      explanation: 'The Token Treemap shows a remarkably lean codebase where filesystem traversal and formatting dominate over web boilerplate.',
      focusNodeId: 'gi-tree-walker',
      highlightNodeIds: ['gi-query-parser', 'gi-tree-walker', 'gi-formatter'],
      filePath: 'src/gitingest/ingestion.py',
      lineStart: 20,
      lineEnd: 43,
      recommendedLens: 'treemap',
    },
    {
      id: 'gi-tour-5',
      order: 5,
      title: 'Decision-1 X-Ray Hotspot: Subprocess Credential Hygiene',
      visualHook: 'clone.py carries the sharpest security probe delta because PAT tokens enter the git clone URL.',
      explanation: 'Inspecting the Security pillar in X-Ray reveals why passing tokens via GIT_ASKPASS or http.extraHeader is safer than embedding in argv URLs.',
      focusNodeId: 'gi-git-cloner',
      highlightNodeIds: ['gi-git-cloner', 'gi-query-proc'],
      filePath: 'src/gitingest/clone.py',
      lineStart: 15,
      lineEnd: 26,
      recommendedLens: 'xray',
    },
  ],
  diagrams: [
    {
      id: 'gi-diag-arch',
      kind: 'architecture',
      title: 'GitIngest System Architecture',
      subtitle: 'Click any module box to open its representative source snippet',
      code: `flowchart LR
  WebUI["Web Ingest Form<br/>index.html"] --> FastAPI["FastAPI App Host<br/>main.py"]
  CLI["Click CLI<br/>cli.py"] --> Entry["Core Orchestrator<br/>entrypoint.py"]
  FastAPI --> Router["Ingest Router<br/>routers/ingest.py"]
  Router --> QProc["Query Processor<br/>query_processor.py"]
  QProc --> Entry
  Entry --> QParse["URL & Glob Parser<br/>query_parser.py"]
  Entry --> Cloner["Shallow Git Cloner<br/>clone.py"]
  Entry --> Walker["Tree Walker<br/>ingestion.py"]
  Walker --> Formatter["Digest Formatter<br/>output_formatter.py"]
  QParse -.-> Schema["Filesystem Schemas<br/>filesystem_schema.py"]`,
      nodeFileMap: {
        WebUI: 'src/server/templates/index.html',
        CLI: 'src/gitingest/cli.py',
        FastAPI: 'src/server/main.py',
        Router: 'src/server/routers/ingest.py',
        QProc: 'src/server/query_processor.py',
        Entry: 'src/gitingest/entrypoint.py',
        QParse: 'src/gitingest/query_parser.py',
        Cloner: 'src/gitingest/clone.py',
        Walker: 'src/gitingest/ingestion.py',
        Formatter: 'src/gitingest/output_formatter.py',
        Schema: 'src/gitingest/schemas/filesystem_schema.py',
      },
      modelUsed: 'gemini-4-neon',
      generatedAt: GENERATED_AT,
    },
    {
      id: 'gi-diag-seq',
      kind: 'sequence',
      title: 'HTTP Ingest Request Lifecycle',
      subtitle: 'Asynchronous execution sequence with guaranteed temporary clone cleanup',
      code: `sequenceDiagram
  participant User as Browser UI
  participant Router as FastAPI /api/ingest
  participant Entry as ingest_async()
  participant Git as git subprocess
  participant Walk as walk_directory()
  participant Fmt as format_node()
  User->>Router: POST /api/ingest (url, max_file_size, pattern)
  Router->>Entry: process_query() -> ingest_async()
  Entry->>Git: git clone --depth=1 --filter=blob:none
  Git-->>Entry: /tmp/gitingest/<repo-id>
  Entry->>Walk: walk_directory(root, ignore_patterns)
  Walk->>Fmt: format_node(FileSystemNode)
  Fmt-->>Entry: (summary, tree, content)
  Entry->>Entry: finally: shutil.rmtree(clone_dir)
  Entry-->>User: 200 JSON { summary, tree, content }`,
      nodeFileMap: {
        User: 'src/server/templates/index.html',
        Router: 'src/server/routers/ingest.py',
        Entry: 'src/gitingest/entrypoint.py',
        Git: 'src/gitingest/clone.py',
        Walk: 'src/gitingest/ingestion.py',
        Fmt: 'src/gitingest/output_formatter.py',
      },
      modelUsed: 'gemini-4-neon',
      generatedAt: GENERATED_AT,
    },
  ],
  xraySpecs: [
    {
      nodeId: 'gi-web-ui',
      scores: { modularity: 0.84, security: 0.86, resilience: 0.82, testability: 0.71, api_clarity: 0.88, concurrency: 0.90, scalability: 0.85, hygiene: 0.86, onboarding: 0.94 },
      topFinding: 'Clean server-rendered form with low JS overhead; add explicit CSRF token protection for cookie-backed sessions.',
    },
    {
      nodeId: 'gi-cli',
      scores: { modularity: 0.92, security: 0.91, resilience: 0.85, testability: 0.88, api_clarity: 0.95, concurrency: 0.86, scalability: 0.84, hygiene: 0.93, onboarding: 0.96 },
      topFinding: 'Exemplary thin CLI wrapper delegating cleanly to the core library with zero duplicated ingestion logic.',
    },
    {
      nodeId: 'gi-fastapi-app',
      scores: { modularity: 0.90, security: 0.87, resilience: 0.89, testability: 0.84, api_clarity: 0.91, concurrency: 0.88, scalability: 0.83, hygiene: 0.92, onboarding: 0.91 },
      topFinding: 'Lifespan context cleanly manages background clone reaper cancellation on shutdown.',
    },
    {
      nodeId: 'gi-ingest-router',
      scores: { modularity: 0.89, security: 0.82, resilience: 0.86, testability: 0.87, api_clarity: 0.93, concurrency: 0.85, scalability: 0.80, hygiene: 0.90, onboarding: 0.92 },
      flag: { scalability: 'In-memory SlowAPI limiter is per-process; use Redis backend across multi-replica deployments.' },
      topFinding: 'Strong Pydantic validation; swap SlowAPI storage_uri to Redis when scaling beyond one replica.',
    },
    {
      nodeId: 'gi-query-proc',
      scores: { modularity: 0.88, security: 0.86, resilience: 0.84, testability: 0.89, api_clarity: 0.90, concurrency: 0.89, scalability: 0.84, hygiene: 0.91, onboarding: 0.90 },
      topFinding: 'Redacts embedded credentials before returning repo_url metadata to the client.',
    },
    {
      nodeId: 'gi-entrypoint',
      scores: { modularity: 0.93, security: 0.88, resilience: 0.92, testability: 0.90, api_clarity: 0.94, concurrency: 0.84, scalability: 0.79, hygiene: 0.94, onboarding: 0.93 },
      flag: { concurrency: 'walk_directory runs synchronously on the event loop; offload via asyncio.to_thread for high QPS.' },
      topFinding: 'Deterministic try/finally cleanup is rock-solid; wrap sync ingest_query() in asyncio.to_thread() to prevent event-loop stalls.',
    },
    {
      nodeId: 'gi-query-parser',
      scores: { modularity: 0.91, security: 0.78, resilience: 0.84, testability: 0.93, api_clarity: 0.89, concurrency: 0.94, scalability: 0.92, hygiene: 0.89, onboarding: 0.90 },
      flag: { security: 'Validate parsed.netloc against an explicit allowlist of Git hosts to mitigate SSRF.' },
      topFinding: 'Enforce strict host allowlisting on parsed.netloc before constructing remote git clone URLs.',
    },
    {
      nodeId: 'gi-tree-walker',
      scores: { modularity: 0.87, security: 0.91, resilience: 0.88, testability: 0.86, api_clarity: 0.85, concurrency: 0.77, scalability: 0.78, hygiene: 0.88, onboarding: 0.86 },
      topFinding: 'Symlink skipping, 10k file caps, and null-byte binary sniffing prevent directory traversal and memory blowups.',
    },
    {
      nodeId: 'gi-formatter',
      scores: { modularity: 0.92, security: 0.95, resilience: 0.91, testability: 0.94, api_clarity: 0.92, concurrency: 0.85, scalability: 0.83, hygiene: 0.94, onboarding: 0.93 },
      topFinding: 'Cache tiktoken.get_encoding("cl100k_base") at module load rather than fetching on every estimate_tokens() call.',
    },
    {
      nodeId: 'gi-git-cloner',
      scores: { modularity: 0.85, security: 0.68, resilience: 0.81, testability: 0.76, api_clarity: 0.84, concurrency: 0.82, scalability: 0.74, hygiene: 0.86, onboarding: 0.84 },
      flag: { security: 'PAT token interpolated into git argv URL can appear in /proc process listings; prefer GIT_ASKPASS or http.extraHeader.' },
      topFinding: 'Pass private GitHub tokens via git -c http.extraHeader instead of embedding credentials in subprocess CLI arguments.',
    },
  ],
  xrayOptions: {
    latencyMs: 612,
    recommendedModelTier: 'gemini-4-neon',
    routingRationale: 'Compact 4-subsystem architecture with low cross-module entropy (0.48) — gemini-4-neon delivers fast, accurate deep dives.',
  },
  totalRepoFiles: 46,
  ingestLatencyMs: 840,
  aiSynthesisLatencyMs: 2140,
  modelsUsed: ['gemini-4-carbon', 'gemini-4-neon', 'gemini-decision-1', 'gemini-embedding-2'],
});

// =============================================================================
// Showcase 2: ahmedkhaleel2004/gitdiagram — Next.js + FastAPI Mermaid & Video Engine
// =============================================================================

const GITDIAGRAM_FILES: RepoFileRecord[] = [
  makeFile({
    path: 'src/app/[username]/[repo]/page.tsx',
    language: 'typescript',
    layer: 'client',
    estimatedTokens: 3240,
    centrality: 0.78,
    fanIn: 0,
    fanOut: 3,
    imports: ['react', '~/hooks/useDiagram', '~/components/mermaid-diagram'],
    resolvedImports: ['src/hooks/useDiagram.ts', 'src/components/mermaid-diagram.tsx'],
    exports: ['default'],
    symbols: [
      { name: 'RepoDiagramPage', kind: 'component', line: 7, endLine: 31, exported: true },
    ],
    isEntrypoint: true,
    content: `'use client';
import { useParams } from 'next/navigation';
import { MermaidChart } from '~/components/mermaid-diagram';
import { useDiagram } from '~/hooks/useDiagram';

export default function RepoDiagramPage() {
  const { username, repo } = useParams<{ username: string; repo: string }>();
  const { diagram, status, progress, customPrompt, setCustomPrompt, regenerate, exportVideo } =
    useDiagram(username, repo);

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-semibold">{username}/{repo}</h1>
          <p className="text-sm text-neutral-400">Status: {status} ({progress}%)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => regenerate(customPrompt)}>Regenerate</button>
          <button onClick={exportVideo}>Render Video Walkthrough</button>
        </div>
      </header>
      <input
        value={customPrompt}
        onChange={(e) => setCustomPrompt(e.target.value)}
        placeholder="Focus on auth pipeline, hide test utilities..."
      />
      <MermaidChart code={diagram} repoFullName={\`\${username}/\${repo}\`} />
    </section>
  );
}`,
  }),
  makeFile({
    path: 'src/components/mermaid-diagram.tsx',
    language: 'typescript',
    layer: 'client',
    estimatedTokens: 4120,
    centrality: 0.84,
    fanIn: 1,
    fanOut: 0,
    imports: ['react', 'mermaid', 'svg-pan-zoom'],
    resolvedImports: [],
    exports: ['MermaidChart'],
    symbols: [
      { name: 'MermaidChart', kind: 'component', line: 9, endLine: 36, exported: true },
    ],
    content: `'use client';
import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidChartProps {
  code: string;
  repoFullName: string;
}

export function MermaidChart({ code, repoFullName }: MermaidChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!code || !containerRef.current) return;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      flowchart: { curve: 'basis', htmlLabels: true },
    });

    let cancelled = false;
    mermaid.render(\`gd-\${Date.now()}\`, code).then(({ svg, bindFunctions }) => {
      if (cancelled || !containerRef.current) return;
      containerRef.current.innerHTML = svg;
      bindFunctions?.(containerRef.current);
      containerRef.current.querySelectorAll<SVGGElement>('g.node').forEach((nodeEl) => {
        nodeEl.style.cursor = 'pointer';
        nodeEl.dataset.repo = repoFullName;
      });
    });

    return () => { cancelled = true; };
  }, [code, repoFullName]);

  return <div ref={containerRef} className="min-h-[520px] w-full overflow-hidden rounded-xl border" />;
}`,
  }),
  makeFile({
    path: 'src/hooks/useDiagram.ts',
    language: 'typescript',
    layer: 'client',
    estimatedTokens: 3890,
    centrality: 0.89,
    fanIn: 1,
    fanOut: 2,
    imports: ['react', '~/app/_actions/cache'],
    resolvedImports: ['src/app/_actions/cache.ts', 'backend/app/routers/generate.py'],
    exports: ['useDiagram'],
    symbols: [
      { name: 'useDiagram', kind: 'function', line: 6, endLine: 37, exported: true },
    ],
    content: `'use client';
import { useCallback, useEffect, useState } from 'react';
import { getCachedDiagram, saveCachedDiagram } from '~/app/_actions/cache';

export function useDiagram(username: string, repo: string) {
  const [diagram, setDiagram] = useState('');
  const [status, setStatus] = useState<'idle' | 'streaming' | 'ready' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [customPrompt, setCustomPrompt] = useState('');

  const streamGeneration = useCallback(async (instructions = '') => {
    setStatus('streaming');
    setProgress(12);
    const res = await fetch('/api/generate/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, repo, instructions }),
    });
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\\n\\n')) {
        if (!line.startsWith('data: ')) continue;
        const evt = JSON.parse(line.slice(6)) as { status: string; progress?: number; diagram?: string };
        if (evt.progress) setProgress(evt.progress);
        if (evt.diagram) {
          setDiagram(evt.diagram);
          await saveCachedDiagram(username, repo, evt.diagram);
          setStatus('ready');
        }
      }
    }
  }, [username, repo]);

  useEffect(() => {
    getCachedDiagram(username, repo).then((hit) => (hit ? (setDiagram(hit), setStatus('ready'), setProgress(100)) : streamGeneration()));
  }, [username, repo, streamGeneration]);

  return { diagram, status, progress, customPrompt, setCustomPrompt, regenerate: streamGeneration, exportVideo: () => fetch('/api/video/render', { method: 'POST' }) };
}`,
  }),
  makeFile({
    path: 'src/app/_actions/cache.ts',
    language: 'typescript',
    layer: 'edge',
    estimatedTokens: 2180,
    centrality: 0.72,
    fanIn: 1,
    fanOut: 1,
    imports: ['drizzle-orm', '~/server/db/schema'],
    resolvedImports: ['src/server/db/schema.ts'],
    exports: ['getCachedDiagram', 'saveCachedDiagram'],
    symbols: [
      { name: 'getCachedDiagram', kind: 'function', line: 7, endLine: 15, exported: true },
      { name: 'saveCachedDiagram', kind: 'function', line: 17, endLine: 26, exported: true },
    ],
    content: `'use server';
import { and, eq } from 'drizzle-orm';
import { db } from '~/server/db';
import { diagramCache } from '~/server/db/schema';

export async function getCachedDiagram(username: string, repo: string): Promise<string | null> {
  const row = await db.query.diagramCache.findFirst({
    where: and(eq(diagramCache.username, username), eq(diagramCache.repo, repo)),
  });
  return row?.diagram ?? null;
}

export async function saveCachedDiagram(username: string, repo: string, diagram: string): Promise<void> {
  await db
    .insert(diagramCache)
    .values({ username, repo, diagram, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [diagramCache.username, diagramCache.repo],
      set: { diagram, updatedAt: new Date() },
    });
}`,
  }),
  makeFile({
    path: 'src/server/db/schema.ts',
    language: 'typescript',
    layer: 'data',
    estimatedTokens: 1640,
    centrality: 0.68,
    fanIn: 1,
    fanOut: 0,
    imports: ['drizzle-orm/pg-core'],
    resolvedImports: [],
    exports: ['diagramCache', 'videoReels'],
    symbols: [
      { name: 'diagramCache', kind: 'const', line: 4, endLine: 14, exported: true },
      { name: 'videoReels', kind: 'const', line: 16, endLine: 23, exported: true },
    ],
    content: `import { pgTable, primaryKey, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const diagramCache = pgTable(
  'gitdiagram_diagram_cache',
  {
    username: text('username').notNull(),
    repo: text('repo').notNull(),
    diagram: text('diagram').notNull(),
    explanation: text('explanation').default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.username, table.repo] })],
);

export const videoReels = pgTable('gitdiagram_video_reels', {
  id: text('id').primaryKey(),
  repoSlug: text('repo_slug').notNull(),
  mp4Url: text('mp4_url').notNull(),
  durationSec: integer('duration_sec').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});`,
  }),
  makeFile({
    path: 'backend/app/main.py',
    language: 'python',
    layer: 'edge',
    estimatedTokens: 1920,
    centrality: 0.81,
    fanIn: 1,
    fanOut: 2,
    imports: ['fastapi', 'app.routers.generate'],
    resolvedImports: ['backend/app/routers/generate.py'],
    exports: ['app'],
    symbols: [
      { name: 'app', kind: 'const', line: 6, endLine: 17, exported: true },
    ],
    isEntrypoint: true,
    content: `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import generate

app = FastAPI(title="GitDiagram Synthesis Engine", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://gitdiagram.com", "http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(generate.router, prefix="/api")


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}`,
  }),
  makeFile({
    path: 'backend/app/routers/generate.py',
    language: 'python',
    layer: 'edge',
    estimatedTokens: 3560,
    centrality: 0.92,
    fanIn: 2,
    fanOut: 3,
    imports: ['json', 'fastapi', 'app.services.github_service', 'app.services.llm_pipeline', 'app.services.video_renderer'],
    resolvedImports: [
      'backend/app/services/github_service.py',
      'backend/app/services/llm_pipeline.py',
      'backend/app/services/video_renderer.py',
    ],
    exports: ['router', 'stream_diagram', 'render_video_walkthrough'],
    symbols: [
      { name: 'GenerateBody', kind: 'class', line: 10, endLine: 15, exported: true },
      { name: 'stream_diagram', kind: 'route', line: 18, endLine: 36, exported: true, signature: 'POST /api/generate/stream' },
      { name: 'render_video_walkthrough', kind: 'route', line: 39, endLine: 44, exported: true, signature: 'POST /api/video/render' },
    ],
    content: `import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.github_service import GitHubService
from app.services.llm_pipeline import DiagramPipeline
from app.services.video_renderer import render_animated_mermaid

router = APIRouter()


class GenerateBody(BaseModel):
    username: str
    repo: str
    instructions: str = ""
    api_key: str | None = None


@router.post("/generate/stream")
async def stream_diagram(body: GenerateBody) -> StreamingResponse:
    async def event_stream():
        gh = GitHubService()
        yield f"data: {json.dumps({'status': 'fetching_tree', 'progress': 20})}\\n\\n"
        tree, readme = await gh.fetch_tree_and_readme(body.username, body.repo)

        pipeline = DiagramPipeline(api_key=body.api_key)
        yield f"data: {json.dumps({'status': 'explaining', 'progress': 48})}\\n\\n"
        explanation = await pipeline.explain_architecture(tree, readme, body.instructions)

        yield f"data: {json.dumps({'status': 'mapping', 'progress': 74})}\\n\\n"
        mapping = await pipeline.map_component_paths(explanation, tree)

        mermaid_code = await pipeline.compile_clickable_mermaid(explanation, mapping, body.username, body.repo)
        yield f"data: {json.dumps({'status': 'complete', 'progress': 100, 'diagram': mermaid_code})}\\n\\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/video/render")
async def render_video_walkthrough(body: GenerateBody) -> dict:
    gh = GitHubService()
    tree, _ = await gh.fetch_tree_and_readme(body.username, body.repo)
    return await render_animated_mermaid(f"{body.username}/{body.repo}", tree)`,
  }),
  makeFile({
    path: 'backend/app/services/llm_pipeline.py',
    language: 'python',
    layer: 'orchestration',
    estimatedTokens: 4920,
    centrality: 0.96,
    fanIn: 1,
    fanOut: 1,
    imports: ['re', 'app.prompts'],
    resolvedImports: ['backend/app/prompts.py'],
    exports: ['DiagramPipeline'],
    symbols: [
      { name: 'DiagramPipeline', kind: 'class', line: 7, endLine: 38, exported: true },
    ],
    content: `import re
from google import genai

from app.prompts import EXPLANATION_PROMPT, COMPONENT_MAP_PROMPT, MERMAID_COMPILER_PROMPT


class DiagramPipeline:
    def __init__(self, api_key: str | None = None) -> None:
        self.client = genai.Client(api_key=api_key)

    async def explain_architecture(self, tree: str, readme: str, instructions: str) -> str:
        res = self.client.interactions.create(
            model="gemini-4-carbon",
            input=EXPLANATION_PROMPT.format(tree=tree, readme=readme, instructions=instructions),
            generation_config={"thinking_level": "medium"},
        )
        return res.outputs[-1].text

    async def map_component_paths(self, explanation: str, tree: str) -> str:
        res = self.client.interactions.create(
            model="gemini-4-neon",
            input=COMPONENT_MAP_PROMPT.format(explanation=explanation, tree=tree),
            generation_config={"thinking_level": "low"},
        )
        return res.outputs[-1].text

    async def compile_clickable_mermaid(self, explanation: str, mapping: str, owner: str, repo: str) -> str:
        res = self.client.interactions.create(
            model="gemini-4-carbon",
            input=MERMAID_COMPILER_PROMPT.format(explanation=explanation, mapping=mapping, owner=owner, repo=repo),
            generation_config={"thinking_level": "medium"},
        )
        raw = res.outputs[-1].text
        cleaned = re.sub(r"^\`\`\`mermaid\\s*|\`\`\`$", "", raw.strip())
        return self._inject_github_click_events(cleaned, owner, repo)

    def _inject_github_click_events(self, code: str, owner: str, repo: str) -> str:
        return re.sub(r'click (\\w+) "([^"]+)"', rf'click \\1 "https://github.com/{owner}/{repo}/blob/main/\\2"', code)`,
  }),
  makeFile({
    path: 'backend/app/prompts.py',
    language: 'python',
    layer: 'domain',
    estimatedTokens: 3740,
    centrality: 0.76,
    fanIn: 1,
    fanOut: 0,
    imports: [],
    resolvedImports: [],
    exports: ['EXPLANATION_PROMPT', 'COMPONENT_MAP_PROMPT', 'MERMAID_COMPILER_PROMPT'],
    symbols: [
      { name: 'EXPLANATION_PROMPT', kind: 'const', line: 1, endLine: 8, exported: true },
      { name: 'COMPONENT_MAP_PROMPT', kind: 'const', line: 10, endLine: 16, exported: true },
      { name: 'MERMAID_COMPILER_PROMPT', kind: 'const', line: 18, endLine: 26, exported: true },
    ],
    content: `EXPLANATION_PROMPT = """
You are a principal systems architect. Given this repository file tree and README:
<file_tree>{tree}</file_tree>
<readme>{readme}</readme>
<user_instructions>{instructions}</user_instructions>
Write a crisp architectural blueprint describing subsystems, data flows, and runtime boundaries.
"""

COMPONENT_MAP_PROMPT = """
Extract every architectural component from the blueprint and map it to its exact file or directory path
from <file_tree>{tree}</file_tree>. Return structured <component_mapping> lines.
<explanation>{explanation}</explanation>
"""

MERMAID_COMPILER_PROMPT = """
Emit strictly valid Mermaid.js flowchart TD syntax for {owner}/{repo}.
Rules:
1. Quote every node label containing brackets or parentheses.
2. Group nodes inside clean subgraphs with Obsidian Cobalt classDef fills.
3. Attach click <NodeId> "<repo_relative_path>" directives for every mapped node.
<explanation>{explanation}</explanation>
<component_mapping>{mapping}</component_mapping>
"""`,
  }),
  makeFile({
    path: 'backend/app/services/github_service.py',
    language: 'python',
    layer: 'data',
    estimatedTokens: 2940,
    centrality: 0.80,
    fanIn: 1,
    fanOut: 0,
    imports: ['base64', 'httpx'],
    resolvedImports: [],
    exports: ['GitHubService'],
    symbols: [
      { name: 'GitHubService', kind: 'class', line: 5, endLine: 30, exported: true },
    ],
    content: `import base64
import httpx


class GitHubService:
    BASE = "https://api.github.com"

    def __init__(self, token: str | None = None) -> None:
        headers = {"Accept": "application/vnd.github+json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self.headers = headers

    async def fetch_tree_and_readme(self, owner: str, repo: str) -> tuple[str, str]:
        async with httpx.AsyncClient(headers=self.headers, timeout=20.0) as client:
            meta = (await client.get(f"{self.BASE}/repos/{owner}/{repo}")).json()
            branch = meta.get("default_branch", "main")
            tree_res = (await client.get(f"{self.BASE}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1")).json()
            paths = [
                item["path"]
                for item in tree_res.get("tree", [])
                if item.get("type") == "blob" and not item["path"].startswith(("node_modules/", ".git/"))
            ]
            readme_res = await client.get(f"{self.BASE}/repos/{owner}/{repo}/readme")
            readme = ""
            if readme_res.status_code == 200:
                encoded = readme_res.json().get("content", "")
                readme = base64.b64decode(encoded).decode("utf-8", errors="ignore")[:8000]
            return "\\n".join(paths[:1200]), readme`,
  }),
  makeFile({
    path: 'backend/app/services/video_renderer.py',
    language: 'python',
    layer: 'orchestration',
    estimatedTokens: 3180,
    centrality: 0.67,
    fanIn: 1,
    fanOut: 0,
    imports: ['asyncio', 'hashlib'],
    resolvedImports: [],
    exports: ['render_animated_mermaid'],
    symbols: [
      { name: 'render_animated_mermaid', kind: 'function', line: 5, endLine: 26, exported: true },
    ],
    content: `import asyncio
import hashlib


async def render_animated_mermaid(repo_slug: str, tree_text: str) -> dict:
    digest = hashlib.sha256(f"{repo_slug}:{len(tree_text)}".encode()).hexdigest()[:12]
    scenes = [
        {"timecode": "00:00", "caption": f"{repo_slug}: Entrypoint & Edge Gateway"},
        {"timecode": "00:04", "caption": "Core Request Fan-Out & Orchestration Pipeline"},
        {"timecode": "00:08", "caption": "Persistent State, Cache Layers & External APIs"},
    ]
    await asyncio.sleep(0.01)
    return {
        "reel_id": f"reel-{digest}",
        "repo_slug": repo_slug,
        "status": "completed",
        "duration_sec": 12,
        "resolution": "1280x720",
        "storyboard": scenes,
    }`,
  }),
];

const GITDIAGRAM_NODES: AtlasNode[] = [
  {
    id: 'gd-repo-page',
    label: 'Repo Diagram Page',
    subtitle: 'Dynamic /[username]/[repo] workspace',
    subsystemId: 'gd-sub-canvas',
    layer: 'client',
    kind: 'ui',
    filePaths: ['src/app/[username]/[repo]/page.tsx'],
    primaryFile: 'src/app/[username]/[repo]/page.tsx',
    lineStart: 6,
    lineEnd: 30,
    estimatedTokens: 3240,
    centrality: 0.78,
    fanIn: 0,
    fanOut: 2,
    keySymbols: ['RepoDiagramPage'],
    visualBrief: 'Next.js App Router canvas page displaying streaming progress, prompt refinement input, and video walkthrough export.',
    inputs: ['Route params username/repo', 'Custom prompt refinement instructions'],
    outputs: ['Interactive Mermaid diagram view', 'Regenerate & video export triggers'],
    x: 60,
    y: 70,
  },
  {
    id: 'gd-mermaid-ui',
    label: 'Interactive Mermaid Renderer',
    subtitle: 'Client SVG hydration & click bindings',
    subsystemId: 'gd-sub-canvas',
    layer: 'client',
    kind: 'ui',
    filePaths: ['src/components/mermaid-diagram.tsx'],
    primaryFile: 'src/components/mermaid-diagram.tsx',
    lineStart: 9,
    lineEnd: 35,
    estimatedTokens: 4120,
    centrality: 0.84,
    fanIn: 1,
    fanOut: 0,
    keySymbols: ['MermaidChart'],
    visualBrief: 'Renders Mermaid flowcharts into pan/zoomable SVG and activates GitHub source click directives on every node.',
    inputs: ['Validated Mermaid flowchart string', 'repoFullName'],
    outputs: ['Clickable interactive SVG architecture map'],
    x: 60,
    y: 250,
  },
  {
    id: 'gd-use-diagram',
    label: 'SSE Diagram Hook',
    subtitle: 'Cache-first lookup + EventSource reader',
    subsystemId: 'gd-sub-canvas',
    layer: 'client',
    kind: 'module',
    filePaths: ['src/hooks/useDiagram.ts'],
    primaryFile: 'src/hooks/useDiagram.ts',
    lineStart: 6,
    lineEnd: 38,
    estimatedTokens: 3890,
    centrality: 0.89,
    fanIn: 1,
    fanOut: 2,
    keySymbols: ['useDiagram'],
    visualBrief: 'Checks Postgres cache via Server Action first, then streams real-time multi-stage SSE updates when synthesizing new diagrams.',
    inputs: ['username & repo', 'Optional refinement instructions'],
    outputs: ['Progressive stage percentage', 'Compiled Mermaid source'],
    x: 310,
    y: 150,
  },
  {
    id: 'gd-cache-action',
    label: 'Cache Server Actions',
    subtitle: 'Next.js RSC Postgres read/upsert',
    subsystemId: 'gd-sub-cache',
    layer: 'edge',
    kind: 'api',
    filePaths: ['src/app/_actions/cache.ts'],
    primaryFile: 'src/app/_actions/cache.ts',
    lineStart: 6,
    lineEnd: 23,
    estimatedTokens: 2180,
    centrality: 0.72,
    fanIn: 1,
    fanOut: 1,
    keySymbols: ['getCachedDiagram', 'saveCachedDiagram'],
    visualBrief: 'Server Actions providing sub-30ms cached diagram reads and conflict-safe upserts backed by Drizzle ORM.',
    inputs: ['(username, repo)', 'Generated Mermaid string'],
    outputs: ['Cached Mermaid code or null'],
    x: 560,
    y: 50,
  },
  {
    id: 'gd-fastapi-host',
    label: 'FastAPI App Host',
    subtitle: 'CORS gateway & health probe',
    subsystemId: 'gd-sub-api',
    layer: 'edge',
    kind: 'api',
    filePaths: ['backend/app/main.py'],
    primaryFile: 'backend/app/main.py',
    lineStart: 6,
    lineEnd: 18,
    estimatedTokens: 1920,
    centrality: 0.81,
    fanIn: 1,
    fanOut: 1,
    keySymbols: ['app'],
    visualBrief: 'Python FastAPI service hosting the long-running AI diagram synthesis and video rendering endpoints.',
    inputs: ['Cross-origin requests from gitdiagram.com'],
    outputs: ['Mounted /api SSE & video routes'],
    x: 560,
    y: 210,
  },
  {
    id: 'gd-generate-router',
    label: 'SSE Generation Router',
    subtitle: 'Streaming /generate/stream & /video/render',
    subsystemId: 'gd-sub-api',
    layer: 'edge',
    kind: 'api',
    filePaths: ['backend/app/routers/generate.py'],
    primaryFile: 'backend/app/routers/generate.py',
    lineStart: 18,
    lineEnd: 44,
    estimatedTokens: 3560,
    centrality: 0.92,
    fanIn: 2,
    fanOut: 3,
    keySymbols: ['GenerateBody', 'stream_diagram', 'render_video_walkthrough'],
    visualBrief: 'Emits Server-Sent Events across tree fetch, architecture explanation, path mapping, and final Mermaid compilation.',
    inputs: ['GenerateBody JSON (username, repo, instructions, api_key)'],
    outputs: ['text/event-stream progress & diagram chunks', 'Rendered reel JSON'],
    x: 560,
    y: 370,
  },
  {
    id: 'gd-llm-pipeline',
    label: '3-Pass Mermaid Pipeline',
    subtitle: 'Explain -> Map Paths -> Compile Clickables',
    subsystemId: 'gd-sub-ai',
    layer: 'orchestration',
    kind: 'pipeline',
    filePaths: ['backend/app/services/llm_pipeline.py'],
    primaryFile: 'backend/app/services/llm_pipeline.py',
    lineStart: 7,
    lineEnd: 38,
    estimatedTokens: 4920,
    centrality: 0.96,
    fanIn: 1,
    fanOut: 1,
    keySymbols: ['DiagramPipeline'],
    visualBrief: 'Chains three specialized Gemini 4 prompts so every Mermaid node maps reliably to a real clickable GitHub file URL.',
    inputs: ['Repository file tree', 'README excerpt', 'Optional user prompt'],
    outputs: ['Clickable Mermaid flowchart with GitHub blob links'],
    x: 840,
    y: 180,
  },
  {
    id: 'gd-video-engine',
    label: 'Animated Video Renderer',
    subtitle: 'Storyboard & animated flowchart reel builder',
    subsystemId: 'gd-sub-ai',
    layer: 'orchestration',
    kind: 'service',
    filePaths: ['backend/app/services/video_renderer.py'],
    primaryFile: 'backend/app/services/video_renderer.py',
    lineStart: 5,
    lineEnd: 22,
    estimatedTokens: 3180,
    centrality: 0.67,
    fanIn: 1,
    fanOut: 0,
    keySymbols: ['render_animated_mermaid'],
    visualBrief: 'Compiles architecture highlights into a 12-second narrated storyboard walkthrough reel for sharing and embeds.',
    inputs: ['repo_slug', 'Parsed directory tree'],
    outputs: ['1280x720 video reel manifest & timecoded scenes'],
    x: 840,
    y: 370,
  },
  {
    id: 'gd-prompts',
    label: 'Prompt Template Registry',
    subtitle: 'Architecture, mapping & Mermaid grammar rules',
    subsystemId: 'gd-sub-ai',
    layer: 'domain',
    kind: 'module',
    filePaths: ['backend/app/prompts.py'],
    primaryFile: 'backend/app/prompts.py',
    lineStart: 1,
    lineEnd: 26,
    estimatedTokens: 3740,
    centrality: 0.76,
    fanIn: 1,
    fanOut: 0,
    keySymbols: ['EXPLANATION_PROMPT', 'COMPONENT_MAP_PROMPT', 'MERMAID_COMPILER_PROMPT'],
    visualBrief: 'Houses strict Mermaid syntax invariants, subgraph quoting rules, and XML tag contracts that prevent parse errors.',
    inputs: ['Tree, README, explanation, component mapping variables'],
    outputs: ['Deterministic structured prompt payloads'],
    x: 1110,
    y: 180,
  },
  {
    id: 'gd-github-svc',
    label: 'GitHub Tree & README Client',
    subtitle: 'Async httpx recursive git tree fetcher',
    subsystemId: 'gd-sub-data',
    layer: 'data',
    kind: 'external',
    filePaths: ['backend/app/services/github_service.py'],
    primaryFile: 'backend/app/services/github_service.py',
    lineStart: 5,
    lineEnd: 29,
    estimatedTokens: 2940,
    centrality: 0.80,
    fanIn: 1,
    fanOut: 0,
    keySymbols: ['GitHubService'],
    visualBrief: 'Fetches the repository default branch, recursive git blob tree (up to 1,200 paths), and decoded README via GitHub REST API.',
    inputs: ['owner', 'repo', 'Optional GitHub bearer token'],
    outputs: ['Filtered file path tree', 'Decoded README text'],
    x: 840,
    y: 520,
  },
  {
    id: 'gd-postgres-schema',
    label: 'Postgres Diagram Cache',
    subtitle: 'Drizzle ORM tables for diagrams & reels',
    subsystemId: 'gd-sub-data',
    layer: 'data',
    kind: 'store',
    filePaths: ['src/server/db/schema.ts'],
    primaryFile: 'src/server/db/schema.ts',
    lineStart: 3,
    lineEnd: 22,
    estimatedTokens: 1640,
    centrality: 0.68,
    fanIn: 1,
    fanOut: 0,
    keySymbols: ['diagramCache', 'videoReels'],
    visualBrief: 'Composite-keyed PostgreSQL schema caching compiled Mermaid diagrams and rendered video walkthrough reels.',
    inputs: ['Upsert writes from cache.ts'],
    outputs: ['Instant repeat-visit diagram loads'],
    x: 840,
    y: 40,
  },
];

const GITDIAGRAM_EDGES: AtlasEdge[] = [
  { id: 'gd-e1', source: 'gd-repo-page', target: 'gd-use-diagram', label: 'useDiagram(user, repo)', kind: 'control', weight: 3, isHotPath: true },
  { id: 'gd-e2', source: 'gd-repo-page', target: 'gd-mermaid-ui', label: 'pass diagram code', kind: 'data', weight: 3, isHotPath: true },
  { id: 'gd-e3', source: 'gd-use-diagram', target: 'gd-cache-action', label: 'check/save cache', kind: 'http', protocol: 'RSC Action', weight: 3, isHotPath: true },
  { id: 'gd-e4', source: 'gd-cache-action', target: 'gd-postgres-schema', label: 'Drizzle select/upsert', kind: 'storage', protocol: 'PostgreSQL', weight: 3, isHotPath: true },
  { id: 'gd-e5', source: 'gd-use-diagram', target: 'gd-fastapi-host', label: 'POST /api/generate/stream', kind: 'stream', protocol: 'SSE', weight: 3, isHotPath: true },
  { id: 'gd-e6', source: 'gd-fastapi-host', target: 'gd-generate-router', label: 'route /api/*', kind: 'control', weight: 3, isHotPath: true },
  { id: 'gd-e7', source: 'gd-generate-router', target: 'gd-github-svc', label: 'fetch_tree_and_readme()', kind: 'http', protocol: 'GitHub REST', weight: 3, isHotPath: true },
  { id: 'gd-e8', source: 'gd-generate-router', target: 'gd-llm-pipeline', label: '3-pass Gemini synthesis', kind: 'control', weight: 3, isHotPath: true },
  { id: 'gd-e9', source: 'gd-llm-pipeline', target: 'gd-prompts', label: 'format prompt contracts', kind: 'dependency', weight: 3, isHotPath: true },
  { id: 'gd-e10', source: 'gd-generate-router', target: 'gd-video-engine', label: 'render_animated_mermaid()', kind: 'control', weight: 2, isHotPath: false },
  { id: 'gd-e11', source: 'gd-use-diagram', target: 'gd-generate-router', label: 'POST /api/video/render', kind: 'http', protocol: 'HTTP/1.1', weight: 2, isHotPath: false },
  { id: 'gd-e12', source: 'gd-llm-pipeline', target: 'gd-mermaid-ui', label: 'SSE clickable Mermaid', kind: 'stream', protocol: 'SSE', weight: 3, isHotPath: true },
  { id: 'gd-e13', source: 'gd-video-engine', target: 'gd-postgres-schema', label: 'persist videoReels meta', kind: 'storage', weight: 1, isHotPath: false },
  { id: 'gd-e14', source: 'gd-mermaid-ui', target: 'gd-github-svc', label: 'click -> GitHub blob URL', kind: 'http', weight: 1, isHotPath: false },
  { id: 'gd-e15', source: 'gd-repo-page', target: 'gd-video-engine', label: 'export walkthrough reel', kind: 'control', weight: 1, isHotPath: false },
];

const GITDIAGRAM_SUBSYSTEMS: SubsystemCluster[] = [
  {
    id: 'gd-sub-canvas',
    name: 'Interactive Diagram Canvas',
    tagline: 'Next.js dynamic route, SSE hook, and clickable Mermaid SVG renderer',
    layer: 'client',
    color: '#4285F4',
    nodeIds: ['gd-repo-page', 'gd-mermaid-ui', 'gd-use-diagram'],
    filePaths: ['src/app/[username]/[repo]/page.tsx', 'src/components/mermaid-diagram.tsx', 'src/hooks/useDiagram.ts'],
    entrypointPaths: ['src/app/[username]/[repo]/page.tsx'],
    totalTokens: 11250,
    summaryBullets: [
      'Hydrates Mermaid flowcharts client-side with pan/zoom and clickable GitHub file links.',
      'Streams real-time synthesis milestones via ReadableStream SSE parsing without blocking UI.',
    ],
    invariants: ['Check Postgres cache before triggering LLM token spend', 'Clean up stale async renders on unmount'],
  },
  {
    id: 'gd-sub-cache',
    name: 'Next.js Cache Layer',
    tagline: 'Server Actions wrapping Drizzle ORM conflict-safe upserts',
    layer: 'edge',
    color: '#38BDF8',
    nodeIds: ['gd-cache-action'],
    filePaths: ['src/app/_actions/cache.ts'],
    entrypointPaths: ['src/app/_actions/cache.ts'],
    totalTokens: 2180,
    summaryBullets: [
      'Serves popular open-source repositories instantaneously from Postgres without re-running LLMs.',
    ],
    invariants: ['Use composite primary key (username, repo) for atomic upserts'],
  },
  {
    id: 'gd-sub-api',
    name: 'FastAPI Streaming Gateway',
    tagline: 'CORS-guarded Python API emitting multi-stage SSE streams',
    layer: 'edge',
    color: '#1A73E8',
    nodeIds: ['gd-fastapi-host', 'gd-generate-router'],
    filePaths: ['backend/app/main.py', 'backend/app/routers/generate.py'],
    entrypointPaths: ['backend/app/main.py'],
    totalTokens: 5480,
    summaryBullets: [
      'Decouples heavy Python LLM/video orchestration from Next.js serverless timeout constraints.',
    ],
    invariants: ['Emit progress events at every pass so clients never hit idle proxy timeouts'],
  },
  {
    id: 'gd-sub-ai',
    name: '3-Pass Mermaid & Video Engine',
    tagline: 'Sequential explain -> path-map -> Mermaid compilation + reel builder',
    layer: 'orchestration',
    color: '#2DD4BF',
    nodeIds: ['gd-llm-pipeline', 'gd-video-engine', 'gd-prompts'],
    filePaths: ['backend/app/services/llm_pipeline.py', 'backend/app/prompts.py', 'backend/app/services/video_renderer.py'],
    entrypointPaths: ['backend/app/services/llm_pipeline.py'],
    totalTokens: 11840,
    summaryBullets: [
      'Splits reasoning, file-path grounding, and syntax emission into three focused LLM passes.',
      'Post-processes click directives into full GitHub blob URLs before streaming to the client.',
    ],
    invariants: ['Strip markdown code fences before Mermaid parsing', 'Quote labels containing brackets or parens'],
  },
  {
    id: 'gd-sub-data',
    name: 'GitHub & Postgres Data Plane',
    tagline: 'Recursive git tree client and Drizzle relational persistence',
    layer: 'data',
    color: '#34D399',
    nodeIds: ['gd-github-svc', 'gd-postgres-schema'],
    filePaths: ['backend/app/services/github_service.py', 'src/server/db/schema.ts'],
    entrypointPaths: ['backend/app/services/github_service.py'],
    totalTokens: 4580,
    summaryBullets: [
      'Avoids full repo clones by using GitHub recursive git trees + README endpoint.',
      'Stores both compiled Mermaid diagrams and rendered video reel manifests in Postgres.',
    ],
    invariants: ['Cap file tree at 1,200 non-vendor blobs and README at 8,000 chars'],
  },
];

const GITDIAGRAM_BLUEPRINT = assembleBlueprint({
  metadata: {
    id: 'ahmedkhaleel2004__gitdiagram__main',
    owner: 'ahmedkhaleel2004',
    name: 'gitdiagram',
    fullName: 'ahmedkhaleel2004/gitdiagram',
    description: 'Turn any GitHub repository into an interactive clickable architecture diagram and animated walkthrough.',
    defaultBranch: 'main',
    branch: 'main',
    stars: 16490,
    forks: 1290,
    openIssues: 31,
    primaryLanguage: 'TypeScript',
    languages: { TypeScript: 58, Python: 36, CSS: 6 },
    topics: ['nextjs', 'fastapi', 'mermaid', 'architecture-diagrams', 'sse', 'drizzle-orm'],
    license: 'MIT',
    htmlUrl: 'https://github.com/ahmedkhaleel2004/gitdiagram',
    homepage: 'https://gitdiagram.com',
    updatedAt: '2026-11-15T14:30:00.000Z',
    isPrivate: false,
    isShowcase: true,
  },
  headline: 'Cache-First 3-Pass Clickable Mermaid & Video Studio',
  oneLiner: 'Pairs a Next.js + Drizzle Postgres cache frontend with a FastAPI SSE backend that compiles repos into clickable Mermaid diagrams and reels.',
  architecturePattern: 'Hybrid Next.js App Router + FastAPI SSE Synthesis Backend',
  techStackBadges: ['Next.js 15', 'React 19', 'Mermaid.js', 'Drizzle ORM', 'FastAPI', 'SSE Streaming'],
  files: GITDIAGRAM_FILES,
  subsystems: GITDIAGRAM_SUBSYSTEMS,
  nodes: GITDIAGRAM_NODES,
  edges: GITDIAGRAM_EDGES,
  flows: [
    {
      id: 'gd-flow-3pass',
      title: '3-Pass SSE Clickable Diagram Synthesis',
      subtitle: 'Cache miss triggers GitHub tree fetch followed by Explain -> Map -> Compile LLM passes',
      trigger: 'Visitor opens gitdiagram.com/owner/repo on a cache miss',
      category: 'ai_pipeline',
      steps: [
        {
          stepNumber: 1,
          title: 'Cache-First Server Action Probe',
          action: 'useDiagram checks PostgreSQL via getCachedDiagram before invoking the FastAPI backend.',
          fromNodeId: 'gd-use-diagram',
          toNodeId: 'gd-cache-action',
          edgeLabel: 'getCachedDiagram()',
          filePath: 'src/app/_actions/cache.ts',
          lineStart: 6,
          lineEnd: 11,
          codeExcerpt: 'export async function getCachedDiagram(username: string, repo: string): Promise<string | null> {\n  const row = await db.query.diagramCache.findFirst({ where: and(eq(diagramCache.username, username), eq(diagramCache.repo, repo)) });\n  return row?.diagram ?? null;\n}',
          dataPayload: 'null (cache miss -> open SSE stream)',
        },
        {
          stepNumber: 2,
          title: 'Fetch Recursive Git Tree & README',
          action: 'FastAPI SSE router pulls up to 1,200 blob paths and the decoded README via GitHub REST API.',
          fromNodeId: 'gd-generate-router',
          toNodeId: 'gd-github-svc',
          edgeLabel: 'fetch_tree_and_readme()',
          filePath: 'backend/app/services/github_service.py',
          lineStart: 14,
          lineEnd: 24,
          codeExcerpt: 'tree_res = (await client.get(f"{self.BASE}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1")).json()\npaths = [item["path"] for item in tree_res.get("tree", []) if item.get("type") == "blob"]',
          dataPayload: 'tree: 418 paths, readme: 4.2 KB',
        },
        {
          stepNumber: 3,
          title: 'Pass 1 & 2: Explain Architecture & Ground File Paths',
          action: 'DiagramPipeline runs Gemini 4 Carbon for architectural synthesis and Neon for exact file-to-node mapping.',
          fromNodeId: 'gd-generate-router',
          toNodeId: 'gd-llm-pipeline',
          edgeLabel: 'explain + map_component_paths()',
          filePath: 'backend/app/services/llm_pipeline.py',
          lineStart: 11,
          lineEnd: 25,
          codeExcerpt: 'explanation = await pipeline.explain_architecture(tree, readme, body.instructions)\nmapping = await pipeline.map_component_paths(explanation, tree)',
          dataPayload: '<component_mapping> 11 subsystems mapped to exact paths',
        },
        {
          stepNumber: 4,
          title: 'Pass 3: Compile Clickable Mermaid & Rewrite URLs',
          action: 'Compiles valid flowchart TD syntax and rewrites relative click directives into full GitHub blob URLs.',
          fromNodeId: 'gd-llm-pipeline',
          toNodeId: 'gd-prompts',
          edgeLabel: 'compile_clickable_mermaid()',
          filePath: 'backend/app/services/llm_pipeline.py',
          lineStart: 27,
          lineEnd: 38,
          codeExcerpt: 'cleaned = re.sub(r"^```mermaid\\s*|```$", "", raw.strip())\nreturn self._inject_github_click_events(cleaned, owner, repo)',
          dataPayload: 'flowchart TD ... click LLM "https://github.com/.../llm_pipeline.py"',
        },
        {
          stepNumber: 5,
          title: 'Hydrate SVG & Persist Cache Upsert',
          action: 'Browser parses the final SSE payload, hydrates clickable SVG nodes, and saves the diagram to Postgres.',
          fromNodeId: 'gd-use-diagram',
          toNodeId: 'gd-mermaid-ui',
          edgeLabel: 'mermaid.render() + saveCachedDiagram()',
          filePath: 'src/components/mermaid-diagram.tsx',
          lineStart: 22,
          lineEnd: 29,
          codeExcerpt: 'mermaid.render(`gd-${Date.now()}`, code).then(({ svg, bindFunctions }) => {\n  containerRef.current.innerHTML = svg;\n  bindFunctions?.(containerRef.current);\n});',
          dataPayload: 'Interactive SVG rendered + cached in Postgres',
        },
      ],
    },
    {
      id: 'gd-flow-video',
      title: 'Custom Prompt Refinement & Video Walkthrough',
      subtitle: 'Re-scoping diagrams with custom instructions and rendering an animated reel',
      trigger: 'User types focus prompt or clicks Render Video Walkthrough',
      category: 'request',
      steps: [
        {
          stepNumber: 1,
          title: 'Dispatch Custom Focus Instructions',
          action: 'Page forwards user focus prompt through useDiagram directly to /api/generate/stream.',
          fromNodeId: 'gd-repo-page',
          toNodeId: 'gd-use-diagram',
          edgeLabel: 'regenerate(customPrompt)',
          filePath: 'src/app/[username]/[repo]/page.tsx',
          lineStart: 18,
          lineEnd: 27,
          codeExcerpt: '<button onClick={() => regenerate(customPrompt)}>Regenerate</button>\n<button onClick={exportVideo}>Render Video Walkthrough</button>',
        },
        {
          stepNumber: 2,
          title: 'Build Animated Storyboard Reel',
          action: 'Video endpoint hashes repo structure and generates timecoded walkthrough scenes.',
          fromNodeId: 'gd-generate-router',
          toNodeId: 'gd-video-engine',
          edgeLabel: 'render_animated_mermaid()',
          filePath: 'backend/app/services/video_renderer.py',
          lineStart: 5,
          lineEnd: 21,
          codeExcerpt: 'scenes = [\n  {"timecode": "00:00", "caption": f"{repo_slug}: Entrypoint & Edge Gateway"},\n  {"timecode": "00:04", "caption": "Core Request Fan-Out & Orchestration Pipeline"}\n]',
        },
      ],
    },
  ],
  codemapTour: [
    {
      id: 'gd-tour-1',
      order: 1,
      title: 'Split-Brain Frontend Cache + Python AI Engine',
      visualHook: 'Next.js handles instant Postgres cache hits; FastAPI streams expensive 3-pass LLM runs.',
      explanation: 'Separating cache reads (Server Actions) from streaming generation (FastAPI) keeps Vercel edge latencies tiny while avoiding serverless execution timeouts.',
      focusNodeId: 'gd-use-diagram',
      highlightNodeIds: ['gd-repo-page', 'gd-use-diagram', 'gd-cache-action', 'gd-generate-router'],
      filePath: 'src/hooks/useDiagram.ts',
      lineStart: 11,
      lineEnd: 37,
      recommendedLens: 'atlas',
    },
    {
      id: 'gd-tour-2',
      order: 2,
      title: 'Why 3 Prompts Beat 1 Monolithic Prompt',
      visualHook: 'llm_pipeline.py isolates architecture reasoning, file-path grounding, and Mermaid syntax emission.',
      explanation: 'Separating path mapping from diagram formatting drastically reduces hallucinated file links and Mermaid parse crashes.',
      focusNodeId: 'gd-llm-pipeline',
      highlightNodeIds: ['gd-llm-pipeline', 'gd-prompts', 'gd-github-svc'],
      filePath: 'backend/app/services/llm_pipeline.py',
      lineStart: 11,
      lineEnd: 38,
      recommendedLens: 'flows',
    },
    {
      id: 'gd-tour-3',
      order: 3,
      title: 'Five Clean Architectural Strata',
      visualHook: 'Client React hooks sit at elevation 6 while Drizzle Postgres and GitHub REST anchor elevation 1.',
      explanation: 'Viewing the 3D Strata stack highlights how cleanly prompts.py isolates domain grammar rules from network I/O.',
      focusNodeId: 'gd-prompts',
      highlightNodeIds: ['gd-llm-pipeline', 'gd-prompts', 'gd-postgres-schema'],
      filePath: 'backend/app/prompts.py',
      lineStart: 1,
      lineEnd: 26,
      recommendedLens: 'strata3d',
    },
    {
      id: 'gd-tour-4',
      order: 4,
      title: 'Token Weight Concentration',
      visualHook: 'llm_pipeline.py, mermaid-diagram.tsx, and useDiagram.ts account for nearly 40% of codebase tokens.',
      explanation: 'The Token Treemap confirms the repo invests its complexity in synthesis reliability and interactive SVG rendering.',
      focusNodeId: 'gd-mermaid-ui',
      highlightNodeIds: ['gd-mermaid-ui', 'gd-llm-pipeline'],
      filePath: 'src/components/mermaid-diagram.tsx',
      lineStart: 13,
      lineEnd: 31,
      recommendedLens: 'treemap',
    },
    {
      id: 'gd-tour-5',
      order: 5,
      title: 'Decision-1 X-Ray Finding: Mermaid securityLevel & XSS Guard',
      visualHook: 'mermaid-diagram.tsx flags securityLevel: "loose" because click events bind raw links into innerHTML.',
      explanation: 'Switching to strict URL validation before injecting SVG click handlers eliminates XSS risk from untrusted repository names.',
      focusNodeId: 'gd-mermaid-ui',
      highlightNodeIds: ['gd-mermaid-ui', 'gd-llm-pipeline'],
      filePath: 'src/components/mermaid-diagram.tsx',
      lineStart: 15,
      lineEnd: 26,
      recommendedLens: 'xray',
    },
  ],
  diagrams: [
    {
      id: 'gd-diag-arch',
      kind: 'architecture',
      title: 'GitDiagram Hybrid Next.js + FastAPI Architecture',
      subtitle: 'Click any node to inspect its source file',
      code: `flowchart TD
  Page["Repo Diagram Page<br/>page.tsx"] --> Hook["SSE Diagram Hook<br/>useDiagram.ts"]
  Page --> Chart["Mermaid Renderer<br/>mermaid-diagram.tsx"]
  Hook --> Cache["Cache Server Actions<br/>_actions/cache.ts"]
  Cache --> DB[("Postgres Cache<br/>db/schema.ts")]
  Hook -->|SSE stream| FastAPI["FastAPI Gateway<br/>backend/app/main.py"]
  FastAPI --> Router["Generate Router<br/>routers/generate.py"]
  Router --> GH["GitHub Tree Client<br/>github_service.py"]
  Router --> Pipe["3-Pass LLM Pipeline<br/>llm_pipeline.py"]
  Router --> Video["Video Renderer<br/>video_renderer.py"]
  Pipe --> Prompts["Prompt Registry<br/>prompts.py"]`,
      nodeFileMap: {
        Page: 'src/app/[username]/[repo]/page.tsx',
        Hook: 'src/hooks/useDiagram.ts',
        Chart: 'src/components/mermaid-diagram.tsx',
        Cache: 'src/app/_actions/cache.ts',
        DB: 'src/server/db/schema.ts',
        FastAPI: 'backend/app/main.py',
        Router: 'backend/app/routers/generate.py',
        GH: 'backend/app/services/github_service.py',
        Pipe: 'backend/app/services/llm_pipeline.py',
        Video: 'backend/app/services/video_renderer.py',
        Prompts: 'backend/app/prompts.py',
      },
      modelUsed: 'gemini-4-neon',
      generatedAt: GENERATED_AT,
    },
    {
      id: 'gd-diag-seq',
      kind: 'sequence',
      title: 'Cache-First SSE Diagram Synthesis Sequence',
      subtitle: 'How cache misses flow through GitHub API and the 3-pass LLM compiler',
      code: `sequenceDiagram
  participant UI as Next.js useDiagram
  participant PG as Postgres Cache
  participant API as FastAPI /generate/stream
  participant GH as GitHub REST API
  participant AI as 3-Pass DiagramPipeline
  UI->>PG: getCachedDiagram(owner, repo)
  PG-->>UI: null (cache miss)
  UI->>API: POST /api/generate/stream
  API->>GH: GET /git/trees/main?recursive=1 + /readme
  GH-->>API: file paths + README
  API-->>UI: SSE progress 48% (explaining)
  API->>AI: Pass 1 explain -> Pass 2 map -> Pass 3 Mermaid
  AI-->>API: Clickable Mermaid diagram
  API-->>UI: SSE progress 100% + diagram
  UI->>PG: saveCachedDiagram(owner, repo, diagram)`,
      nodeFileMap: {
        UI: 'src/hooks/useDiagram.ts',
        PG: 'src/app/_actions/cache.ts',
        API: 'backend/app/routers/generate.py',
        GH: 'backend/app/services/github_service.py',
        AI: 'backend/app/services/llm_pipeline.py',
      },
      modelUsed: 'gemini-4-neon',
      generatedAt: GENERATED_AT,
    },
  ],
  xraySpecs: [
    {
      nodeId: 'gd-repo-page',
      scores: { modularity: 0.90, security: 0.89, resilience: 0.84, testability: 0.82, api_clarity: 0.91, concurrency: 0.88, scalability: 0.89, hygiene: 0.90, onboarding: 0.93 },
      topFinding: 'Clean thin page shell delegating all streaming and cache logic to useDiagram.',
    },
    {
      nodeId: 'gd-mermaid-ui',
      scores: { modularity: 0.86, security: 0.64, resilience: 0.78, testability: 0.74, api_clarity: 0.87, concurrency: 0.85, scalability: 0.84, hygiene: 0.85, onboarding: 0.88 },
      flag: { security: 'Mermaid securityLevel: "loose" with innerHTML injection requires DOMPurify or strict https://github.com click allowlisting.' },
      topFinding: 'Sanitize SVG output or restrict Mermaid click hrefs strictly to https://github.com/ origins when securityLevel is loose.',
    },
    {
      nodeId: 'gd-use-diagram',
      scores: { modularity: 0.83, security: 0.85, resilience: 0.75, testability: 0.78, api_clarity: 0.86, concurrency: 0.79, scalability: 0.86, hygiene: 0.84, onboarding: 0.87 },
      flag: { resilience: 'Attach an AbortController to fetch() so fast route transitions cancel stale SSE streams.' },
      topFinding: 'Add AbortController cancellation and partial-line buffering across ReadableStream chunks.',
    },
    {
      nodeId: 'gd-cache-action',
      scores: { modularity: 0.93, security: 0.88, resilience: 0.90, testability: 0.91, api_clarity: 0.94, concurrency: 0.92, scalability: 0.91, hygiene: 0.93, onboarding: 0.95 },
      topFinding: 'Idempotent onConflictDoUpdate keeps cache writes safe under concurrent identical repo requests.',
    },
    {
      nodeId: 'gd-fastapi-host',
      scores: { modularity: 0.91, security: 0.84, resilience: 0.89, testability: 0.88, api_clarity: 0.92, concurrency: 0.90, scalability: 0.88, hygiene: 0.92, onboarding: 0.94 },
      topFinding: 'Tighten CORS allow_headers from wildcard "*" to explicit Content-Type and Authorization headers.',
    },
    {
      nodeId: 'gd-generate-router',
      scores: { modularity: 0.85, security: 0.81, resilience: 0.77, testability: 0.80, api_clarity: 0.89, concurrency: 0.83, scalability: 0.79, hygiene: 0.87, onboarding: 0.88 },
      flag: { resilience: 'Wrap each SSE phase in try/except so upstream GitHub or model failures emit structured error events.' },
      topFinding: 'Emit typed SSE error frames on GitHub 404/403 or model quota errors instead of closing the stream abruptly.',
    },
    {
      nodeId: 'gd-llm-pipeline',
      scores: { modularity: 0.88, security: 0.86, resilience: 0.79, testability: 0.82, api_clarity: 0.90, concurrency: 0.76, scalability: 0.81, hygiene: 0.89, onboarding: 0.87 },
      flag: { concurrency: 'Use async client calls or asyncio.to_thread so blocking SDK requests do not stall FastAPI workers.' },
      topFinding: 'Offload synchronous interactions.create calls off the asyncio loop and validate Mermaid syntax before returning.',
    },
    {
      nodeId: 'gd-video-engine',
      scores: { modularity: 0.87, security: 0.92, resilience: 0.86, testability: 0.90, api_clarity: 0.88, concurrency: 0.89, scalability: 0.82, hygiene: 0.91, onboarding: 0.90 },
      topFinding: 'Deterministic SHA-256 reel IDs enable deduplicated caching across repeated walkthrough renders.',
    },
    {
      nodeId: 'gd-prompts',
      scores: { modularity: 0.94, security: 0.83, resilience: 0.88, testability: 0.87, api_clarity: 0.95, concurrency: 0.98, scalability: 0.95, hygiene: 0.94, onboarding: 0.95 },
      topFinding: 'Clear XML delimiters separate untrusted README text from system directives; consider prompt-injection reminders.',
    },
    {
      nodeId: 'gd-github-svc',
      scores: { modularity: 0.89, security: 0.88, resilience: 0.76, testability: 0.84, api_clarity: 0.90, concurrency: 0.91, scalability: 0.78, hygiene: 0.89, onboarding: 0.91 },
      flag: { resilience: 'Check HTTP status codes and X-RateLimit-Remaining before calling .json() on GitHub responses.' },
      topFinding: 'Handle GitHub 403 rate-limit responses and truncated recursive trees explicitly with raise_for_status().',
    },
    {
      nodeId: 'gd-postgres-schema',
      scores: { modularity: 0.95, security: 0.94, resilience: 0.93, testability: 0.92, api_clarity: 0.95, concurrency: 0.94, scalability: 0.92, hygiene: 0.96, onboarding: 0.96 },
      topFinding: 'Clean Drizzle schema with composite primary key and timezone-aware timestamps.',
    },
  ],
  xrayOptions: {
    latencyMs: 684,
    recommendedModelTier: 'gemini-4-carbon',
    routingRationale: 'Polyglot Next.js + FastAPI streaming pipeline with security & SSE resilience edge cases — gemini-4-carbon recommended.',
  },
  totalRepoFiles: 64,
  ingestLatencyMs: 920,
  aiSynthesisLatencyMs: 2480,
  modelsUsed: ['gemini-4-carbon', 'gemini-4-neon', 'gemini-decision-1', 'gemini-embedding-2'],
});

// =============================================================================
// Showcase 3: AsyncFuncAI/deepwiki-open — Next.js + Python RAG Wiki & Codemap Engine
// =============================================================================

const DEEPWIKI_FILES: RepoFileRecord[] = [
  makeFile({
    path: 'src/app/[owner]/[repo]/page.tsx',
    language: 'typescript',
    layer: 'client',
    estimatedTokens: 3980,
    centrality: 0.84,
    fanIn: 0,
    fanOut: 3,
    imports: ['react', '@/components/WikiTreeView', '@/components/Ask', '@/components/Mermaid'],
    resolvedImports: [
      'src/components/WikiTreeView.tsx',
      'src/components/Ask.tsx',
      'src/components/Mermaid.tsx',
    ],
    exports: ['default'],
    symbols: [
      { name: 'RepoWikiPage', kind: 'component', line: 9, endLine: 34, exported: true },
    ],
    isEntrypoint: true,
    content: `'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { WikiTreeView, type WikiPageNode } from '@/components/WikiTreeView';
import { AskPanel } from '@/components/Ask';
import { MermaidRenderer } from '@/components/Mermaid';

export default function RepoWikiPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [pages, setPages] = useState<WikiPageNode[]>([]);
  const [activeId, setActiveId] = useState<string>('overview');

  useEffect(() => {
    fetch(\`/api/wiki_cache?owner=\${owner}&repo=\${repo}\`)
      .then((r) => r.json())
      .then((data: { pages: WikiPageNode[] }) => {
        setPages(data.pages ?? []);
        if (data.pages?.[0]) setActiveId(data.pages[0].id);
      });
  }, [owner, repo]);

  const current = pages.find((p) => p.id === activeId);

  return (
    <div className="grid min-h-screen grid-cols-[260px_1fr_360px] gap-4 p-4">
      <WikiTreeView pages={pages} activeId={activeId} onSelect={setActiveId} />
      <article className="prose max-w-none overflow-y-auto px-6">
        <h1>{current?.title ?? \`\${owner}/\${repo}\`}</h1>
        {current?.diagram && <MermaidRenderer chart={current.diagram} />}
        <div className="whitespace-pre-wrap">{current?.markdown}</div>
      </article>
      <AskPanel repoUrl={\`https://github.com/\${owner}/\${repo}\`} />
    </div>
  );
}`,
  }),
  makeFile({
    path: 'src/components/WikiTreeView.tsx',
    language: 'typescript',
    layer: 'client',
    estimatedTokens: 2140,
    centrality: 0.62,
    fanIn: 1,
    fanOut: 0,
    imports: ['react'],
    resolvedImports: [],
    exports: ['WikiTreeView', 'WikiPageNode'],
    symbols: [
      { name: 'WikiPageNode', kind: 'interface', line: 3, endLine: 10, exported: true },
      { name: 'WikiTreeView', kind: 'component', line: 12, endLine: 30, exported: true },
    ],
    content: `'use client';

export interface WikiPageNode {
  id: string;
  title: string;
  importance: 'high' | 'medium' | 'low';
  filePaths: string[];
  markdown: string;
  diagram?: string;
}

export function WikiTreeView({
  pages,
  activeId,
  onSelect,
}: {
  pages: WikiPageNode[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="rounded-xl border p-3">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider">Wiki Codemap</h2>
      <ul className="space-y-1">
        {pages.map((page) => (
          <li key={page.id}>
            <button onClick={() => onSelect(page.id)} className={page.id === activeId ? 'font-bold text-blue-400' : ''}>
              {page.title} ({page.filePaths.length})
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}`,
  }),
  makeFile({
    path: 'src/components/Ask.tsx',
    language: 'typescript',
    layer: 'client',
    estimatedTokens: 3420,
    centrality: 0.81,
    fanIn: 1,
    fanOut: 1,
    imports: ['react'],
    resolvedImports: ['api/websocket_wiki.py'],
    exports: ['AskPanel'],
    symbols: [
      { name: 'AskPanel', kind: 'component', line: 4, endLine: 34, exported: true },
    ],
    content: `'use client';
import { useRef, useState } from 'react';

export function AskPanel({ repoUrl }: { repoUrl: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [deepResearch, setDeepResearch] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const sendQuestion = () => {
    if (!question.trim()) return;
    setAnswer('');
    const ws = new WebSocket(\`\${window.location.origin.replace(/^http/, 'ws')}/ws/chat\`);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        repo_url: repoUrl,
        messages: [{ role: 'user', content: question }],
        deep_research: deepResearch,
      }));
    };
    ws.onmessage = (event) => setAnswer((prev) => prev + String(event.data));
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={deepResearch} onChange={(e) => setDeepResearch(e.target.checked)} />
        Multi-Turn DeepResearch Mode
      </label>
      <div className="flex-1 overflow-y-auto text-sm whitespace-pre-wrap">{answer}</div>
      <div className="flex gap-2">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask the codebase..." />
        <button onClick={sendQuestion}>Ask</button>
      </div>
    </section>
  );
}`,
  }),
  makeFile({
    path: 'src/components/Mermaid.tsx',
    language: 'typescript',
    layer: 'client',
    estimatedTokens: 2290,
    centrality: 0.64,
    fanIn: 1,
    fanOut: 0,
    imports: ['react', 'mermaid'],
    resolvedImports: [],
    exports: ['MermaidRenderer'],
    symbols: [
      { name: 'MermaidRenderer', kind: 'component', line: 5, endLine: 23, exported: true },
    ],
    content: `'use client';
import { useEffect, useState } from 'react';
import mermaid from 'mermaid';

export function MermaidRenderer({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
    mermaid
      .render(\`dw-\${Math.random().toString(36).slice(2, 8)}\`, chart)
      .then((res) => { setSvg(res.svg); setError(null); })
      .catch((err: Error) => setError(err.message));
  }, [chart]);

  if (error) {
    return <pre className="rounded border p-3 text-xs text-amber-400">Mermaid fallback: {error}</pre>;
  }
  return <div className="my-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}`,
  }),
  makeFile({
    path: 'api/main.py',
    language: 'python',
    layer: 'edge',
    estimatedTokens: 1680,
    centrality: 0.72,
    fanIn: 0,
    fanOut: 1,
    imports: ['uvicorn', 'api.api'],
    resolvedImports: ['api/api.py'],
    exports: ['main'],
    symbols: [
      { name: 'main', kind: 'function', line: 7, endLine: 11, exported: true },
    ],
    isEntrypoint: true,
    content: `import os
import uvicorn

from api.api import app


def main() -> None:
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    main()`,
  }),
  makeFile({
    path: 'api/api.py',
    language: 'python',
    layer: 'edge',
    estimatedTokens: 3840,
    centrality: 0.90,
    fanIn: 1,
    fanOut: 3,
    imports: ['fastapi', 'api.websocket_wiki', 'api.wiki_cache', 'api.config'],
    resolvedImports: ['api/websocket_wiki.py', 'api/wiki_cache.py', 'api/config.py'],
    exports: ['app', 'get_wiki_cache', 'save_wiki_cache'],
    symbols: [
      { name: 'app', kind: 'const', line: 8, endLine: 13, exported: true },
      { name: 'get_wiki_cache', kind: 'route', line: 16, endLine: 23, exported: true, signature: 'GET /api/wiki_cache' },
      { name: 'save_wiki_cache', kind: 'route', line: 26, endLine: 32, exported: true, signature: 'POST /api/wiki_cache' },
    ],
    content: `from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from api.config import MODEL_PROVIDERS
from api.websocket_wiki import handle_websocket_chat
from api.wiki_cache import load_cached_wiki, persist_cached_wiki

app = FastAPI(title="DeepWiki Open API", version="1.4.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class WikiCachePayload(BaseModel):
    owner: str
    repo: str
    language: str = "en"
    pages: list[dict]


@app.get("/api/wiki_cache")
async def get_wiki_cache(owner: str, repo: str, language: str = "en") -> dict:
    cached = load_cached_wiki(owner, repo, language)
    if not cached:
        raise HTTPException(status_code=404, detail="Wiki not yet generated")
    return cached


@app.post("/api/wiki_cache")
async def save_wiki_cache(payload: WikiCachePayload) -> dict:
    persist_cached_wiki(payload.owner, payload.repo, payload.language, payload.model_dump())
    return {"saved": True, "providers": list(MODEL_PROVIDERS.keys())}


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket) -> None:
    await handle_websocket_chat(websocket)`,
  }),
  makeFile({
    path: 'api/websocket_wiki.py',
    language: 'python',
    layer: 'orchestration',
    estimatedTokens: 4320,
    centrality: 0.93,
    fanIn: 2,
    fanOut: 2,
    imports: ['fastapi', 'api.rag', 'api.gemini_client'],
    resolvedImports: ['api/rag.py', 'api/gemini_client.py'],
    exports: ['handle_websocket_chat'],
    symbols: [
      { name: 'handle_websocket_chat', kind: 'function', line: 7, endLine: 35, exported: true },
    ],
    content: `from fastapi import WebSocket, WebSocketDisconnect

from api.gemini_client import stream_gemini_completion
from api.rag import CodebaseRAG


async def handle_websocket_chat(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        payload = await websocket.receive_json()
        repo_url: str = payload["repo_url"]
        messages: list[dict] = payload.get("messages", [])
        deep_research: bool = bool(payload.get("deep_research", False))

        rag = CodebaseRAG(repo_url=repo_url)
        await rag.prepare_retriever()

        user_query = messages[-1]["content"] if messages else "Summarize repository architecture"
        retrieved_docs = rag.retrieve(user_query, top_k=12 if deep_research else 6)
        context_block = "\\n\\n".join(
            f"### {doc['file_path']}\\n{doc['text']}" for doc in retrieved_docs
        )

        system_prompt = (
            "You are DeepWiki Architect. Cite exact file paths from retrieved context."
            + (" Run multi-pass deep synthesis across subsystems." if deep_research else "")
        )
        async for chunk in stream_gemini_completion(system_prompt, context_block, user_query):
            await websocket.send_text(chunk)
        await websocket.close()
    except WebSocketDisconnect:
        return`,
  }),
  makeFile({
    path: 'api/rag.py',
    language: 'python',
    layer: 'orchestration',
    estimatedTokens: 4780,
    centrality: 0.96,
    fanIn: 1,
    fanOut: 2,
    imports: ['numpy', 'api.data_pipeline', 'api.gemini_client'],
    resolvedImports: ['api/data_pipeline.py', 'api/gemini_client.py'],
    exports: ['CodebaseRAG'],
    symbols: [
      { name: 'CodebaseRAG', kind: 'class', line: 7, endLine: 34, exported: true },
    ],
    content: `import numpy as np

from api.data_pipeline import DatabaseManager
from api.gemini_client import embed_texts


class CodebaseRAG:
    def __init__(self, repo_url: str) -> None:
        self.repo_url = repo_url
        self.db_manager = DatabaseManager()
        self.documents: list[dict] = []
        self.embeddings: np.ndarray | None = None

    async def prepare_retriever(self) -> None:
        self.documents, self.embeddings = await self.db_manager.prepare_database(self.repo_url)

    def retrieve(self, query: str, top_k: int = 8) -> list[dict]:
        if not self.documents or self.embeddings is None:
            return []
        query_vec = np.array(embed_texts([query])[0], dtype=np.float32)
        norms = np.linalg.norm(self.embeddings, axis=1) * (np.linalg.norm(query_vec) + 1e-8)
        scores = (self.embeddings @ query_vec) / np.maximum(norms, 1e-8)
        top_indices = np.argsort(scores)[::-1][:top_k]
        return [
            {**self.documents[int(idx)], "score": float(scores[int(idx)])}
            for idx in top_indices
        ]`,
  }),
  makeFile({
    path: 'api/data_pipeline.py',
    language: 'python',
    layer: 'domain',
    estimatedTokens: 5260,
    centrality: 0.91,
    fanIn: 1,
    fanOut: 2,
    imports: ['hashlib', 'pathlib', 'subprocess', 'numpy', 'api.config', 'api.gemini_client'],
    resolvedImports: ['api/config.py', 'api/gemini_client.py'],
    exports: ['DatabaseManager', 'chunk_source_file'],
    symbols: [
      { name: 'chunk_source_file', kind: 'function', line: 10, endLine: 18, exported: true },
      { name: 'DatabaseManager', kind: 'class', line: 21, endLine: 44, exported: true },
    ],
    content: `import hashlib
from pathlib import Path
import subprocess
import numpy as np

from api.config import CHUNK_SIZE_WORDS, CHUNK_OVERLAP_WORDS, EXCLUDED_DIRS
from api.gemini_client import embed_texts


def chunk_source_file(file_path: str, text: str) -> list[dict]:
    words = text.split()
    step = max(1, CHUNK_SIZE_WORDS - CHUNK_OVERLAP_WORDS)
    chunks: list[dict] = []
    for start in range(0, len(words), step):
        segment = " ".join(words[start : start + CHUNK_SIZE_WORDS])
        if segment:
            chunks.append({"file_path": file_path, "text": segment})
    return chunks


class DatabaseManager:
    CACHE_ROOT = Path.home() / ".adalflow" / "databases"

    async def prepare_database(self, repo_url: str) -> tuple[list[dict], np.ndarray]:
        repo_key = hashlib.sha256(repo_url.encode()).hexdigest()[:16]
        repo_dir = self.CACHE_ROOT / repo_key / "repo"
        if not repo_dir.exists():
            repo_dir.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "clone", "--depth=1", repo_url, str(repo_dir)], check=True)

        docs: list[dict] = []
        for path in sorted(repo_dir.rglob("*")):
            if not path.is_file() or any(part in EXCLUDED_DIRS for part in path.parts):
                continue
            if path.stat().st_size > 250_000:
                continue
            rel = str(path.relative_to(repo_dir))
            docs.extend(chunk_source_file(rel, path.read_text(encoding="utf-8", errors="ignore")))

        vectors = np.array(embed_texts([d["text"] for d in docs]), dtype=np.float32)
        return docs, vectors`,
  }),
  makeFile({
    path: 'api/gemini_client.py',
    language: 'python',
    layer: 'domain',
    estimatedTokens: 3120,
    centrality: 0.87,
    fanIn: 3,
    fanOut: 1,
    imports: ['typing', 'google.genai', 'api.config'],
    resolvedImports: ['api/config.py'],
    exports: ['embed_texts', 'stream_gemini_completion'],
    symbols: [
      { name: 'embed_texts', kind: 'function', line: 9, endLine: 17, exported: true },
      { name: 'stream_gemini_completion', kind: 'function', line: 20, endLine: 32, exported: true },
    ],
    content: `from collections.abc import AsyncIterator
from google import genai

from api.config import DEFAULT_EMBED_MODEL, DEFAULT_GEN_MODEL

_client = genai.Client()


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    vectors: list[list[float]] = []
    for text in texts:
        res = _client.models.embed_content(model=DEFAULT_EMBED_MODEL, contents=text[:6000])
        vectors.append(list(res.embeddings[0].values))
    return vectors


async def stream_gemini_completion(
    system_prompt: str, context_block: str, question: str
) -> AsyncIterator[str]:
    interaction = _client.interactions.create(
        model=DEFAULT_GEN_MODEL,
        system_instruction=system_prompt,
        input=f"<retrieved_code>\\n{context_block}\\n</retrieved_code>\\n\\nQuestion: {question}",
        generation_config={"thinking_level": "medium"},
    )
    text = interaction.outputs[-1].text or ""
    for line in text.splitlines(keepends=True):
        yield line`,
  }),
  makeFile({
    path: 'api/wiki_cache.py',
    language: 'python',
    layer: 'data',
    estimatedTokens: 1940,
    centrality: 0.71,
    fanIn: 1,
    fanOut: 0,
    imports: ['json', 'pathlib'],
    resolvedImports: [],
    exports: ['load_cached_wiki', 'persist_cached_wiki'],
    symbols: [
      { name: 'load_cached_wiki', kind: 'function', line: 10, endLine: 15, exported: true },
      { name: 'persist_cached_wiki', kind: 'function', line: 18, endLine: 22, exported: true },
    ],
    content: `import json
from pathlib import Path

WIKI_CACHE_DIR = Path.home() / ".adalflow" / "wikicache"


def _cache_file(owner: str, repo: str, language: str) -> Path:
    return WIKI_CACHE_DIR / f"deepwiki_cache_{owner}_{repo}_{language}.json"


def load_cached_wiki(owner: str, repo: str, language: str) -> dict | None:
    target = _cache_file(owner, repo, language)
    if not target.exists():
        return None
    return json.loads(target.read_text(encoding="utf-8"))


def persist_cached_wiki(owner: str, repo: str, language: str, payload: dict) -> None:
    WIKI_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = _cache_file(owner, repo, language)
    target.write_text(json.dumps(payload, indent=2), encoding="utf-8")`,
  }),
  makeFile({
    path: 'api/config.py',
    language: 'python',
    layer: 'data',
    estimatedTokens: 1780,
    centrality: 0.79,
    fanIn: 3,
    fanOut: 0,
    imports: ['os'],
    resolvedImports: [],
    exports: ['DEFAULT_GEN_MODEL', 'DEFAULT_EMBED_MODEL', 'CHUNK_SIZE_WORDS', 'CHUNK_OVERLAP_WORDS', 'EXCLUDED_DIRS', 'MODEL_PROVIDERS'],
    symbols: [
      { name: 'MODEL_PROVIDERS', kind: 'const', line: 8, endLine: 13, exported: true },
      { name: 'EXCLUDED_DIRS', kind: 'const', line: 15, endLine: 17, exported: true },
    ],
    isConfig: true,
    content: `import os

DEFAULT_GEN_MODEL = os.getenv("DEEPWIKI_GEN_MODEL", "gemini-4-carbon")
DEFAULT_EMBED_MODEL = os.getenv("DEEPWIKI_EMBED_MODEL", "gemini-embedding-2")
CHUNK_SIZE_WORDS = 350
CHUNK_OVERLAP_WORDS = 80

MODEL_PROVIDERS = {
    "google": {"models": ["gemini-4-carbon", "gemini-4-neon"], "embedder": "gemini-embedding-2"},
    "openai": {"models": ["gpt-5", "gpt-5-mini"], "embedder": "text-embedding-3-small"},
    "ollama": {"models": ["qwen2.5-coder:14b"], "embedder": "nomic-embed-text"},
}

EXCLUDED_DIRS = frozenset({
    ".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv",
})`,
  }),
];

const DEEPWIKI_NODES: AtlasNode[] = [
  {
    id: 'dw-wiki-page',
    label: 'Wiki Workspace Shell',
    subtitle: '3-pane codemap tree, docs & Ask panel',
    subsystemId: 'dw-sub-ui',
    layer: 'client',
    kind: 'ui',
    filePaths: ['src/app/[owner]/[repo]/page.tsx'],
    primaryFile: 'src/app/[owner]/[repo]/page.tsx',
    lineStart: 8,
    lineEnd: 33,
    estimatedTokens: 3980,
    centrality: 0.84,
    fanIn: 0,
    fanOut: 3,
    keySymbols: ['RepoWikiPage'],
    visualBrief: 'Three-column Next.js documentation shell combining hierarchical codemap navigation, Mermaid diagrams, and live Ask chat.',
    inputs: ['URL route owner/repo', 'Cached wiki JSON'],
    outputs: ['Active wiki page selection', 'Mounted AskPanel & MermaidRenderer'],
    x: 60,
    y: 90,
  },
  {
    id: 'dw-tree-view',
    label: 'Codemap Tree Sidebar',
    subtitle: 'Importance-ranked wiki navigation',
    subsystemId: 'dw-sub-ui',
    layer: 'client',
    kind: 'ui',
    filePaths: ['src/components/WikiTreeView.tsx'],
    primaryFile: 'src/components/WikiTreeView.tsx',
    lineStart: 12,
    lineEnd: 31,
    estimatedTokens: 2140,
    centrality: 0.62,
    fanIn: 1,
    fanOut: 0,
    keySymbols: ['WikiTreeView', 'WikiPageNode'],
    visualBrief: 'Displays generated subsystem wiki chapters with source-file counts and instant chapter switching.',
    inputs: ['WikiPageNode[]', 'activeId'],
    outputs: ['onSelect(pageId) events'],
    x: 60,
    y: 260,
  },
  {
    id: 'dw-ask-panel',
    label: 'WebSocket Ask & DeepResearch UI',
    subtitle: 'Streaming RAG Q&A with multi-pass toggle',
    subsystemId: 'dw-sub-ui',
    layer: 'client',
    kind: 'ui',
    filePaths: ['src/components/Ask.tsx'],
    primaryFile: 'src/components/Ask.tsx',
    lineStart: 4,
    lineEnd: 34,
    estimatedTokens: 3420,
    centrality: 0.81,
    fanIn: 1,
    fanOut: 1,
    keySymbols: ['AskPanel'],
    visualBrief: 'Opens a bidirectional WebSocket to /ws/chat to stream codebase-grounded answers and multi-turn DeepResearch syntheses.',
    inputs: ['repoUrl', 'User question & deep_research toggle'],
    outputs: ['Live streamed markdown citations'],
    x: 320,
    y: 250,
  },
  {
    id: 'dw-mermaid',
    label: 'Strict Mermaid Viewer',
    subtitle: 'Sandboxed dark-theme SVG diagrammer',
    subsystemId: 'dw-sub-ui',
    layer: 'client',
    kind: 'ui',
    filePaths: ['src/components/Mermaid.tsx'],
    primaryFile: 'src/components/Mermaid.tsx',
    lineStart: 5,
    lineEnd: 21,
    estimatedTokens: 2290,
    centrality: 0.64,
    fanIn: 1,
    fanOut: 0,
    keySymbols: ['MermaidRenderer'],
    visualBrief: 'Renders per-chapter architecture diagrams with strict securityLevel and graceful parse-error fallbacks.',
    inputs: ['Mermaid syntax string'],
    outputs: ['Sanitized SVG diagram or readable error banner'],
    x: 60,
    y: 410,
  },
  {
    id: 'dw-uvicorn-main',
    label: 'Uvicorn API Bootstrapper',
    subtitle: 'ASGI server entrypoint on port 8001',
    subsystemId: 'dw-sub-edge',
    layer: 'edge',
    kind: 'api',
    filePaths: ['api/main.py'],
    primaryFile: 'api/main.py',
    lineStart: 7,
    lineEnd: 13,
    estimatedTokens: 1680,
    centrality: 0.72,
    fanIn: 0,
    fanOut: 1,
    keySymbols: ['main'],
    visualBrief: 'Boots the FastAPI ASGI service with configurable PORT binding for Docker and local dev.',
    inputs: ['PORT env var'],
    outputs: ['Running HTTP + WebSocket ASGI server'],
    x: 320,
    y: 60,
  },
  {
    id: 'dw-fastapi-router',
    label: 'Wiki REST & WS Gateway',
    subtitle: '/api/wiki_cache & /ws/chat routes',
    subsystemId: 'dw-sub-edge',
    layer: 'edge',
    kind: 'api',
    filePaths: ['api/api.py'],
    primaryFile: 'api/api.py',
    lineStart: 9,
    lineEnd: 35,
    estimatedTokens: 3840,
    centrality: 0.90,
    fanIn: 2,
    fanOut: 3,
    keySymbols: ['app', 'get_wiki_cache', 'save_wiki_cache', 'websocket_chat'],
    visualBrief: 'Serves cached multi-language wikis over REST and upgrades interactive Q&A requests onto WebSockets.',
    inputs: ['GET/POST /api/wiki_cache', 'WS /ws/chat upgrade'],
    outputs: ['Cached wiki documents', 'WebSocket stream delegation'],
    x: 580,
    y: 120,
  },
  {
    id: 'dw-ws-orchestrator',
    label: 'WebSocket Wiki Orchestrator',
    subtitle: 'Context hydration & token streaming',
    subsystemId: 'dw-sub-rag',
    layer: 'orchestration',
    kind: 'agent',
    filePaths: ['api/websocket_wiki.py'],
    primaryFile: 'api/websocket_wiki.py',
    lineStart: 7,
    lineEnd: 32,
    estimatedTokens: 4320,
    centrality: 0.93,
    fanIn: 2,
    fanOut: 2,
    keySymbols: ['handle_websocket_chat'],
    visualBrief: 'Retrieves top-k codebase chunks (6 standard, 12 DeepResearch) and streams grounded Gemini 4 answers over WebSockets.',
    inputs: ['WebSocket JSON { repo_url, messages, deep_research }'],
    outputs: ['Line-streamed grounded architectural responses'],
    x: 580,
    y: 300,
  },
  {
    id: 'dw-rag-engine',
    label: 'Cosine Vector RAG Engine',
    subtitle: 'Top-k dense retrieval over repo chunks',
    subsystemId: 'dw-sub-rag',
    layer: 'orchestration',
    kind: 'pipeline',
    filePaths: ['api/rag.py'],
    primaryFile: 'api/rag.py',
    lineStart: 7,
    lineEnd: 29,
    estimatedTokens: 4780,
    centrality: 0.96,
    fanIn: 1,
    fanOut: 2,
    keySymbols: ['CodebaseRAG'],
    visualBrief: 'Embeds user queries via gemini-embedding-2 and ranks normalized cosine similarities across indexed repository chunks.',
    inputs: ['Natural-language question', 'top_k budget'],
    outputs: ['Ranked file chunks with cosine similarity scores'],
    x: 860,
    y: 260,
  },
  {
    id: 'dw-data-pipeline',
    label: 'Repo Chunker & Vector Builder',
    subtitle: 'Shallow clone + overlapping word splitter',
    subsystemId: 'dw-sub-pipeline',
    layer: 'domain',
    kind: 'pipeline',
    filePaths: ['api/data_pipeline.py'],
    primaryFile: 'api/data_pipeline.py',
    lineStart: 10,
    lineEnd: 41,
    estimatedTokens: 5260,
    centrality: 0.91,
    fanIn: 1,
    fanOut: 2,
    keySymbols: ['chunk_source_file', 'DatabaseManager'],
    visualBrief: 'Clones repositories into ~/.adalflow/databases, slices source files into 350-word overlapping chunks, and builds float32 matrices.',
    inputs: ['GitHub repo_url', 'EXCLUDED_DIRS filter'],
    outputs: ['(documents[], float32 embeddings matrix)'],
    x: 1120,
    y: 210,
  },
  {
    id: 'dw-gemini-adapter',
    label: 'Gemini 4 & Embedding Adapter',
    subtitle: 'Unified interactions & embedding client',
    subsystemId: 'dw-sub-pipeline',
    layer: 'domain',
    kind: 'external',
    filePaths: ['api/gemini_client.py'],
    primaryFile: 'api/gemini_client.py',
    lineStart: 9,
    lineEnd: 30,
    estimatedTokens: 3120,
    centrality: 0.87,
    fanIn: 3,
    fanOut: 1,
    keySymbols: ['embed_texts', 'stream_gemini_completion'],
    visualBrief: 'Wraps @google/genai Python SDK calls for gemini-embedding-2 vectorization and gemini-4-carbon grounded synthesis.',
    inputs: ['Code chunks or prompt + retrieved_code XML'],
    outputs: ['Dense float embeddings', 'Async streamed text chunks'],
    x: 1120,
    y: 390,
  },
  {
    id: 'dw-cache-config',
    label: 'Wiki Disk Cache & Model Registry',
    subtitle: 'JSON wiki cache + multi-provider config',
    subsystemId: 'dw-sub-data',
    layer: 'data',
    kind: 'store',
    filePaths: ['api/wiki_cache.py', 'api/config.py'],
    primaryFile: 'api/wiki_cache.py',
    lineStart: 7,
    lineEnd: 21,
    estimatedTokens: 3720,
    centrality: 0.79,
    fanIn: 3,
    fanOut: 0,
    keySymbols: ['load_cached_wiki', 'persist_cached_wiki', 'MODEL_PROVIDERS', 'EXCLUDED_DIRS'],
    visualBrief: 'Persists compiled multi-language wiki trees to ~/.adalflow/wikicache and centralizes provider/chunking settings.',
    inputs: ['owner, repo, language, wiki pages JSON'],
    outputs: ['Instant cached wiki payloads', 'Provider & ignore rules'],
    x: 860,
    y: 70,
  },
];

const DEEPWIKI_EDGES: AtlasEdge[] = [
  { id: 'dw-e1', source: 'dw-wiki-page', target: 'dw-tree-view', label: 'render chapter list', kind: 'data', weight: 2, isHotPath: false },
  { id: 'dw-e2', source: 'dw-wiki-page', target: 'dw-mermaid', label: 'render chapter diagram', kind: 'data', weight: 2, isHotPath: false },
  { id: 'dw-e3', source: 'dw-wiki-page', target: 'dw-ask-panel', label: 'mount AskPanel(repoUrl)', kind: 'control', weight: 2, isHotPath: true },
  { id: 'dw-e4', source: 'dw-wiki-page', target: 'dw-fastapi-router', label: 'GET /api/wiki_cache', kind: 'http', protocol: 'HTTP/1.1', weight: 3, isHotPath: true },
  { id: 'dw-e5', source: 'dw-ask-panel', target: 'dw-fastapi-router', label: 'WS /ws/chat', kind: 'stream', protocol: 'WebSocket', weight: 3, isHotPath: true },
  { id: 'dw-e6', source: 'dw-uvicorn-main', target: 'dw-fastapi-router', label: 'serve ASGI app', kind: 'control', weight: 2, isHotPath: false },
  { id: 'dw-e7', source: 'dw-fastapi-router', target: 'dw-cache-config', label: 'load/persist wiki JSON', kind: 'storage', weight: 3, isHotPath: true },
  { id: 'dw-e8', source: 'dw-fastapi-router', target: 'dw-ws-orchestrator', label: 'handle_websocket_chat()', kind: 'stream', protocol: 'WebSocket', weight: 3, isHotPath: true },
  { id: 'dw-e9', source: 'dw-ws-orchestrator', target: 'dw-rag-engine', label: 'prepare_retriever + retrieve()', kind: 'control', weight: 3, isHotPath: true },
  { id: 'dw-e10', source: 'dw-rag-engine', target: 'dw-data-pipeline', label: 'prepare_database(repo_url)', kind: 'data', weight: 3, isHotPath: true },
  { id: 'dw-e11', source: 'dw-data-pipeline', target: 'dw-gemini-adapter', label: 'embed_texts(chunks)', kind: 'http', protocol: 'Gemini API', weight: 3, isHotPath: true },
  { id: 'dw-e12', source: 'dw-rag-engine', target: 'dw-gemini-adapter', label: 'embed_texts([query])', kind: 'http', protocol: 'Gemini API', weight: 3, isHotPath: true },
  { id: 'dw-e13', source: 'dw-ws-orchestrator', target: 'dw-gemini-adapter', label: 'stream_gemini_completion()', kind: 'stream', protocol: 'Gemini API', weight: 3, isHotPath: true },
  { id: 'dw-e14', source: 'dw-data-pipeline', target: 'dw-cache-config', label: 'CHUNK_SIZE & EXCLUDED_DIRS', kind: 'dependency', weight: 2, isHotPath: false },
  { id: 'dw-e15', source: 'dw-gemini-adapter', target: 'dw-cache-config', label: 'DEFAULT_GEN/EMBED_MODEL', kind: 'dependency', weight: 2, isHotPath: false },
  { id: 'dw-e16', source: 'dw-ws-orchestrator', target: 'dw-ask-panel', label: 'stream markdown chunks', kind: 'stream', protocol: 'WebSocket', weight: 3, isHotPath: true },
];

const DEEPWIKI_SUBSYSTEMS: SubsystemCluster[] = [
  {
    id: 'dw-sub-ui',
    name: 'Interactive Wiki & Ask Surface',
    tagline: '3-pane Next.js codemap viewer, strict Mermaid renderer, and WebSocket chat',
    layer: 'client',
    color: '#4285F4',
    nodeIds: ['dw-wiki-page', 'dw-tree-view', 'dw-ask-panel', 'dw-mermaid'],
    filePaths: ['src/app/[owner]/[repo]/page.tsx', 'src/components/WikiTreeView.tsx', 'src/components/Ask.tsx', 'src/components/Mermaid.tsx'],
    entrypointPaths: ['src/app/[owner]/[repo]/page.tsx'],
    totalTokens: 11830,
    summaryBullets: [
      'Combines hierarchical codemap chapters with inline Mermaid architecture charts and real-time RAG Q&A.',
      'Uses strict Mermaid rendering mode with graceful fallback errors on malformed diagrams.',
    ],
    invariants: ['Close WebSocket handles cleanly on panel unmount', 'Never render raw Mermaid without strict securityLevel'],
  },
  {
    id: 'dw-sub-edge',
    name: 'FastAPI & WebSocket Gateway',
    tagline: 'ASGI server exposing cached wiki REST routes and streaming chat sockets',
    layer: 'edge',
    color: '#38BDF8',
    nodeIds: ['dw-uvicorn-main', 'dw-fastapi-router'],
    filePaths: ['api/main.py', 'api/api.py'],
    entrypointPaths: ['api/main.py', 'api/api.py'],
    totalTokens: 5520,
    summaryBullets: [
      'Separates fast JSON cache reads (/api/wiki_cache) from stateful bidirectional WebSocket RAG streams (/ws/chat).',
    ],
    invariants: ['Validate owner/repo parameters before constructing cache file paths'],
  },
  {
    id: 'dw-sub-rag',
    name: 'RAG & DeepResearch Orchestrator',
    tagline: 'Dense cosine vector retrieval and multi-pass architectural Q&A synthesis',
    layer: 'orchestration',
    color: '#1A73E8',
    nodeIds: ['dw-ws-orchestrator', 'dw-rag-engine'],
    filePaths: ['api/websocket_wiki.py', 'api/rag.py'],
    entrypointPaths: ['api/websocket_wiki.py'],
    totalTokens: 9100,
    summaryBullets: [
      'Expands top-k retrieval from 6 to 12 chunks when Multi-Turn DeepResearch mode is enabled.',
      'Grounds every LLM completion inside XML-tagged source snippets to enforce file citations.',
    ],
    invariants: ['Guard cosine similarity denominator with 1e-8 epsilon to avoid NaN rankings'],
  },
  {
    id: 'dw-sub-pipeline',
    name: 'Chunking & Embedding Pipeline',
    tagline: 'Shallow repo cloning, 350-word sliding chunks, and Gemini 4 / Embedding-2 adapter',
    layer: 'domain',
    color: '#2DD4BF',
    nodeIds: ['dw-data-pipeline', 'dw-gemini-adapter'],
    filePaths: ['api/data_pipeline.py', 'api/gemini_client.py'],
    entrypointPaths: ['api/data_pipeline.py'],
    totalTokens: 8380,
    summaryBullets: [
      'Slices codebases with 80-word overlap so function signatures remain intact across chunk boundaries.',
      'Abstracts embedding and text generation behind a single provider-swappable Gemini adapter.',
    ],
    invariants: ['Skip files above 250 KB and vendor directories before calling embedding endpoints'],
  },
  {
    id: 'dw-sub-data',
    name: 'Local Wiki Cache & Provider Config',
    tagline: 'Disk-backed JSON wiki store and model/chunk hyperparameter registry',
    layer: 'data',
    color: '#34D399',
    nodeIds: ['dw-cache-config'],
    filePaths: ['api/wiki_cache.py', 'api/config.py'],
    entrypointPaths: ['api/wiki_cache.py'],
    totalTokens: 3720,
    summaryBullets: [
      'Caches complete multi-language wiki trees locally under ~/.adalflow/wikicache for instant reloads.',
    ],
    invariants: ['Sanitize owner/repo strings against path traversal before reading cache files'],
  },
];

const DEEPWIKI_BLUEPRINT = assembleBlueprint({
  metadata: {
    id: 'AsyncFuncAI__deepwiki-open__main',
    owner: 'AsyncFuncAI',
    name: 'deepwiki-open',
    fullName: 'AsyncFuncAI/deepwiki-open',
    description: 'Open-source AI wiki, visual Mermaid codemap, and RAG DeepResearch generator for any GitHub/GitLab repository.',
    defaultBranch: 'main',
    branch: 'main',
    stars: 11940,
    forks: 1085,
    openIssues: 58,
    primaryLanguage: 'TypeScript',
    languages: { TypeScript: 51, Python: 45, CSS: 4 },
    topics: ['rag', 'wiki-generator', 'fastapi', 'nextjs', 'websocket', 'embeddings', 'mermaid'],
    license: 'MIT',
    htmlUrl: 'https://github.com/AsyncFuncAI/deepwiki-open',
    homepage: 'https://deepwiki.org',
    updatedAt: '2026-11-16T09:15:00.000Z',
    isPrivate: false,
    isShowcase: true,
  },
  headline: 'Local-First RAG Wiki & DeepResearch Codemap Engine',
  oneLiner: 'Indexes any repository into overlapping semantic chunks for instant Mermaid-illustrated wikis and WebSocket RAG Q&A.',
  architecturePattern: 'Next.js 3-Pane Wiki Client + FastAPI WebSocket RAG Pipeline',
  techStackBadges: ['Next.js 15', 'FastAPI', 'WebSockets', 'NumPy Vector Search', 'Gemini Embedding 2', 'Mermaid'],
  files: DEEPWIKI_FILES,
  subsystems: DEEPWIKI_SUBSYSTEMS,
  nodes: DEEPWIKI_NODES,
  edges: DEEPWIKI_EDGES,
  flows: [
    {
      id: 'dw-flow-rag-ask',
      title: 'WebSocket RAG & DeepResearch Query',
      subtitle: 'Live question from AskPanel through vector retrieval to streamed grounded citations',
      trigger: 'User submits a question in AskPanel with DeepResearch enabled',
      category: 'ai_pipeline',
      steps: [
        {
          stepNumber: 1,
          title: 'Open WebSocket & Dispatch Query Payload',
          action: 'AskPanel opens /ws/chat and sends repo_url, conversation messages, and deep_research flag.',
          fromNodeId: 'dw-ask-panel',
          toNodeId: 'dw-fastapi-router',
          edgeLabel: 'WS /ws/chat',
          filePath: 'src/components/Ask.tsx',
          lineStart: 13,
          lineEnd: 21,
          codeExcerpt: 'const ws = new WebSocket(`${window.location.origin.replace(/^http/, "ws")}/ws/chat`);\nws.onopen = () => ws.send(JSON.stringify({ repo_url: repoUrl, messages: [{ role: "user", content: question }], deep_research: deepResearch }));',
          dataPayload: '{ repo_url: "AsyncFuncAI/deepwiki-open", deep_research: true }',
        },
        {
          stepNumber: 2,
          title: 'Prepare Repository Vector Index',
          action: 'DatabaseManager clones once into ~/.adalflow/databases, chunks source files, and computes float32 embeddings.',
          fromNodeId: 'dw-rag-engine',
          toNodeId: 'dw-data-pipeline',
          edgeLabel: 'prepare_database()',
          filePath: 'api/data_pipeline.py',
          lineStart: 25,
          lineEnd: 40,
          codeExcerpt: 'docs.extend(chunk_source_file(rel, path.read_text(encoding="utf-8", errors="ignore")))\nvectors = np.array(embed_texts([d["text"] for d in docs]), dtype=np.float32)',
          dataPayload: '312 overlapping code chunks x 768-dim vectors',
        },
        {
          stepNumber: 3,
          title: 'Cosine Top-K Chunk Retrieval',
          action: 'CodebaseRAG embeds the question and selects top 12 highest-similarity chunks for DeepResearch.',
          fromNodeId: 'dw-ws-orchestrator',
          toNodeId: 'dw-rag-engine',
          edgeLabel: 'retrieve(top_k=12)',
          filePath: 'api/rag.py',
          lineStart: 18,
          lineEnd: 28,
          codeExcerpt: 'query_vec = np.array(embed_texts([query])[0], dtype=np.float32)\nscores = (self.embeddings @ query_vec) / np.maximum(norms, 1e-8)\ntop_indices = np.argsort(scores)[::-1][:top_k]',
          dataPayload: 'Top 12 chunks (similarity 0.89..0.74)',
        },
        {
          stepNumber: 4,
          title: 'Stream Grounded Gemini 4 Completion',
          action: 'Wraps retrieved code inside <retrieved_code> XML tags and streams cited markdown back over the socket.',
          fromNodeId: 'dw-ws-orchestrator',
          toNodeId: 'dw-gemini-adapter',
          edgeLabel: 'stream_gemini_completion()',
          filePath: 'api/websocket_wiki.py',
          lineStart: 24,
          lineEnd: 30,
          codeExcerpt: 'async for chunk in stream_gemini_completion(system_prompt, context_block, user_query):\n    await websocket.send_text(chunk)',
          dataPayload: 'Line-by-line cited architectural answer',
        },
      ],
    },
    {
      id: 'dw-flow-wiki-cache',
      title: 'Cached Multi-Language Wiki Hydration',
      subtitle: 'Instant load of pre-generated codemap chapters and embedded Mermaid diagrams',
      trigger: 'Visitor opens /AsyncFuncAI/deepwiki-open',
      category: 'request',
      steps: [
        {
          stepNumber: 1,
          title: 'Fetch Wiki JSON from FastAPI',
          action: 'RepoWikiPage requests /api/wiki_cache with owner and repo query parameters.',
          fromNodeId: 'dw-wiki-page',
          toNodeId: 'dw-fastapi-router',
          edgeLabel: 'GET /api/wiki_cache',
          filePath: 'src/app/[owner]/[repo]/page.tsx',
          lineStart: 13,
          lineEnd: 19,
          codeExcerpt: 'fetch(`/api/wiki_cache?owner=${owner}&repo=${repo}`)\n  .then((r) => r.json())\n  .then((data) => { setPages(data.pages ?? []); });',
        },
        {
          stepNumber: 2,
          title: 'Read JSON Snapshot from ~/.adalflow/wikicache',
          action: 'wiki_cache.py resolves the language-keyed JSON file and returns the structured page tree.',
          fromNodeId: 'dw-fastapi-router',
          toNodeId: 'dw-cache-config',
          edgeLabel: 'load_cached_wiki()',
          filePath: 'api/wiki_cache.py',
          lineStart: 11,
          lineEnd: 15,
          codeExcerpt: 'def load_cached_wiki(owner: str, repo: str, language: str) -> dict | None:\n    target = _cache_file(owner, repo, language)\n    return json.loads(target.read_text(encoding="utf-8")) if target.exists() else None',
        },
        {
          stepNumber: 3,
          title: 'Render Codemap Tree & Sandboxed Mermaid',
          action: 'Populates WikiTreeView navigation and compiles the active chapter Mermaid diagram in strict mode.',
          fromNodeId: 'dw-wiki-page',
          toNodeId: 'dw-mermaid',
          edgeLabel: '<MermaidRenderer chart={...} />',
          filePath: 'src/components/Mermaid.tsx',
          lineStart: 10,
          lineEnd: 15,
          codeExcerpt: 'mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });\nmermaid.render(`dw-${Math.random().toString(36).slice(2, 8)}`, chart)',
        },
      ],
    },
  ],
  codemapTour: [
    {
      id: 'dw-tour-1',
      order: 1,
      title: 'Three-Pane Documentation + RAG Layout',
      visualHook: 'Every repo view links static codemap chapters on the left with a live Ask WebSocket agent on the right.',
      explanation: 'Separating pre-computed wiki navigation from ad-hoc RAG Q&A gives instant orientation while supporting deep follow-ups.',
      focusNodeId: 'dw-wiki-page',
      highlightNodeIds: ['dw-wiki-page', 'dw-tree-view', 'dw-ask-panel', 'dw-mermaid'],
      filePath: 'src/app/[owner]/[repo]/page.tsx',
      lineStart: 24,
      lineEnd: 33,
      recommendedLens: 'atlas',
    },
    {
      id: 'dw-tour-2',
      order: 2,
      title: 'Dual-Speed Retrieval Pipeline',
      visualHook: 'WebSocket chat toggles seamlessly between top-6 quick RAG and top-12 DeepResearch synthesis.',
      explanation: 'websocket_wiki.py shares the exact same CodebaseRAG retriever while adjusting retrieval breadth and synthesis prompts.',
      focusNodeId: 'dw-ws-orchestrator',
      highlightNodeIds: ['dw-ws-orchestrator', 'dw-rag-engine', 'dw-gemini-adapter'],
      filePath: 'api/websocket_wiki.py',
      lineStart: 15,
      lineEnd: 30,
      recommendedLens: 'flows',
    },
    {
      id: 'dw-tour-3',
      order: 3,
      title: 'Layered RAG Stack in 3D Strata',
      visualHook: 'UI components -> FastAPI WS Edge -> RAG Orchestration -> Chunk/Embed Domain -> Local Cache.',
      explanation: 'Notice how api/config.py and api/wiki_cache.py anchor the bottom data layer while api/rag.py coordinates domain vector math.',
      focusNodeId: 'dw-rag-engine',
      highlightNodeIds: ['dw-rag-engine', 'dw-data-pipeline', 'dw-cache-config'],
      filePath: 'api/rag.py',
      lineStart: 14,
      lineEnd: 29,
      recommendedLens: 'strata3d',
    },
    {
      id: 'dw-tour-4',
      order: 4,
      title: 'Token Footprint of the Vector Pipeline',
      visualHook: 'data_pipeline.py, rag.py, and websocket_wiki.py hold the majority of backend complexity.',
      explanation: 'The Token Treemap shows how minimal the FastAPI wrapper is compared to chunking, embedding, and retrieval logic.',
      focusNodeId: 'dw-data-pipeline',
      highlightNodeIds: ['dw-data-pipeline', 'dw-rag-engine', 'dw-ws-orchestrator'],
      filePath: 'api/data_pipeline.py',
      lineStart: 21,
      lineEnd: 41,
      recommendedLens: 'treemap',
    },
    {
      id: 'dw-tour-5',
      order: 5,
      title: 'Decision-1 X-Ray Hotspots: Path Traversal & Blocking Subprocess',
      visualHook: 'wiki_cache.py and data_pipeline.py show amber/red probes on Security and Concurrency.',
      explanation: 'Sanitizing owner/repo before constructing cache paths and persisting embeddings to disk instead of re-embedding on every request are the two highest-ROI fixes.',
      focusNodeId: 'dw-cache-config',
      highlightNodeIds: ['dw-cache-config', 'dw-data-pipeline', 'dw-gemini-adapter'],
      filePath: 'api/wiki_cache.py',
      lineStart: 7,
      lineEnd: 21,
      recommendedLens: 'xray',
    },
  ],
  diagrams: [
    {
      id: 'dw-diag-arch',
      kind: 'architecture',
      title: 'DeepWiki Open RAG & Codemap Architecture',
      subtitle: 'Click any module to inspect its code snippet',
      code: `flowchart LR
  Page["Wiki Workspace<br/>page.tsx"] --> Tree["Codemap Tree<br/>WikiTreeView.tsx"]
  Page --> Mer["Mermaid Viewer<br/>Mermaid.tsx"]
  Page --> Ask["Ask WebSocket UI<br/>Ask.tsx"]
  Page -->|GET wiki_cache| API["FastAPI Gateway<br/>api/api.py"]
  Ask -->|WS /ws/chat| API
  API --> Cache[("Disk Wiki Cache<br/>api/wiki_cache.py")]
  API --> WS["WS Orchestrator<br/>api/websocket_wiki.py"]
  WS --> RAG["Cosine RAG Engine<br/>api/rag.py"]
  RAG --> Pipe["Chunker & Indexer<br/>api/data_pipeline.py"]
  Pipe --> Gem["Gemini 4 & Embed-2<br/>api/gemini_client.py"]
  WS --> Gem`,
      nodeFileMap: {
        Page: 'src/app/[owner]/[repo]/page.tsx',
        Tree: 'src/components/WikiTreeView.tsx',
        Mer: 'src/components/Mermaid.tsx',
        Ask: 'src/components/Ask.tsx',
        API: 'api/api.py',
        Cache: 'api/wiki_cache.py',
        WS: 'api/websocket_wiki.py',
        RAG: 'api/rag.py',
        Pipe: 'api/data_pipeline.py',
        Gem: 'api/gemini_client.py',
      },
      modelUsed: 'gemini-4-neon',
      generatedAt: GENERATED_AT,
    },
    {
      id: 'dw-diag-seq',
      kind: 'sequence',
      title: 'WebSocket DeepResearch RAG Sequence',
      subtitle: 'How AskPanel retrieves code chunks and streams cited answers',
      code: `sequenceDiagram
  participant Ask as AskPanel UI
  participant WS as /ws/chat Handler
  participant RAG as CodebaseRAG
  participant Pipe as DatabaseManager
  participant Gem as Gemini 4 + Embed-2
  Ask->>WS: WS JSON { repo_url, messages, deep_research }
  WS->>RAG: prepare_retriever()
  RAG->>Pipe: prepare_database(repo_url)
  Pipe->>Gem: embed_texts(code_chunks)
  Gem-->>Pipe: float32 vector matrix
  WS->>RAG: retrieve(user_query, top_k=12)
  RAG-->>WS: ranked source snippets
  WS->>Gem: stream_gemini_completion(context_block, query)
  Gem-->>Ask: streamed cited markdown chunks`,
      nodeFileMap: {
        Ask: 'src/components/Ask.tsx',
        WS: 'api/websocket_wiki.py',
        RAG: 'api/rag.py',
        Pipe: 'api/data_pipeline.py',
        Gem: 'api/gemini_client.py',
      },
      modelUsed: 'gemini-4-neon',
      generatedAt: GENERATED_AT,
    },
  ],
  xraySpecs: [
    {
      nodeId: 'dw-wiki-page',
      scores: { modularity: 0.88, security: 0.86, resilience: 0.79, testability: 0.80, api_clarity: 0.89, concurrency: 0.87, scalability: 0.85, hygiene: 0.88, onboarding: 0.91 },
      topFinding: 'Check response.ok before calling .json() on /api/wiki_cache so 404 misses trigger wiki generation smoothly.',
    },
    {
      nodeId: 'dw-tree-view',
      scores: { modularity: 0.94, security: 0.95, resilience: 0.92, testability: 0.93, api_clarity: 0.94, concurrency: 0.96, scalability: 0.91, hygiene: 0.95, onboarding: 0.96 },
      topFinding: 'Pure presentational navigation component with crisp typing and zero side effects.',
    },
    {
      nodeId: 'dw-ask-panel',
      scores: { modularity: 0.84, security: 0.82, resilience: 0.72, testability: 0.76, api_clarity: 0.85, concurrency: 0.78, scalability: 0.83, hygiene: 0.84, onboarding: 0.87 },
      flag: { resilience: 'Close existing wsRef.current before opening a new WebSocket and add onerror/reconnect state handling.' },
      topFinding: 'Clean up prior WebSocket connections before sending a new question and handle socket error events.',
    },
    {
      nodeId: 'dw-mermaid',
      scores: { modularity: 0.91, security: 0.90, resilience: 0.89, testability: 0.85, api_clarity: 0.91, concurrency: 0.88, scalability: 0.89, hygiene: 0.90, onboarding: 0.93 },
      topFinding: 'Uses strict Mermaid securityLevel and renders a clean diagnostic fallback on syntax errors.',
    },
    {
      nodeId: 'dw-uvicorn-main',
      scores: { modularity: 0.94, security: 0.92, resilience: 0.91, testability: 0.90, api_clarity: 0.95, concurrency: 0.90, scalability: 0.89, hygiene: 0.95, onboarding: 0.96 },
      topFinding: 'Minimal ASGI runner cleanly parameterized via PORT environment variable.',
    },
    {
      nodeId: 'dw-fastapi-router',
      scores: { modularity: 0.87, security: 0.72, resilience: 0.84, testability: 0.85, api_clarity: 0.91, concurrency: 0.86, scalability: 0.82, hygiene: 0.88, onboarding: 0.90 },
      flag: { security: 'CORS allow_origins=["*"] permits any site to invoke paid LLM endpoints; restrict to configured origins.' },
      topFinding: 'Restrict CORS allow_origins to trusted studio domains and validate owner/repo slugs with a strict regex.',
    },
    {
      nodeId: 'dw-ws-orchestrator',
      scores: { modularity: 0.85, security: 0.80, resilience: 0.76, testability: 0.79, api_clarity: 0.87, concurrency: 0.81, scalability: 0.77, hygiene: 0.86, onboarding: 0.88 },
      topFinding: 'Reuse indexed CodebaseRAG instances across turns via an LRU cache keyed by repo_url rather than rebuilding per message.',
    },
    {
      nodeId: 'dw-rag-engine',
      scores: { modularity: 0.89, security: 0.91, resilience: 0.86, testability: 0.90, api_clarity: 0.92, concurrency: 0.84, scalability: 0.75, hygiene: 0.91, onboarding: 0.92 },
      flag: { scalability: 'In-memory NumPy matmul works great under 50k chunks; add FAISS IVF/HNSW persistence for enterprise monorepos.' },
      topFinding: 'Clean cosine similarity implementation with epsilon safety; persist vectors to disk to avoid cold re-embedding.',
    },
    {
      nodeId: 'dw-data-pipeline',
      scores: { modularity: 0.81, security: 0.74, resilience: 0.73, testability: 0.78, api_clarity: 0.84, concurrency: 0.65, scalability: 0.69, hygiene: 0.83, onboarding: 0.84 },
      flag: { concurrency: 'Blocking subprocess.run(git clone) stalls the FastAPI event loop; migrate to asyncio.create_subprocess_exec.' },
      topFinding: 'Replace synchronous subprocess.run with async subprocesses and cache serialized .npz embeddings alongside cloned repos.',
    },
    {
      nodeId: 'dw-gemini-adapter',
      scores: { modularity: 0.90, security: 0.89, resilience: 0.81, testability: 0.84, api_clarity: 0.92, concurrency: 0.74, scalability: 0.73, hygiene: 0.91, onboarding: 0.91 },
      flag: { scalability: 'Batch embed_texts calls (e.g., 64 chunks per request) instead of one sequential RPC per chunk.' },
      topFinding: 'Batch embedding requests in chunks of 50-100 to cut repository indexing latency by ~10x.',
    },
    {
      nodeId: 'dw-cache-config',
      scores: { modularity: 0.89, security: 0.66, resilience: 0.85, testability: 0.91, api_clarity: 0.90, concurrency: 0.82, scalability: 0.80, hygiene: 0.90, onboarding: 0.92 },
      flag: { security: 'owner/repo/language interpolated into filename without sanitization enables path traversal via "../".' },
      topFinding: 'Enforce ^[A-Za-z0-9._-]+$ validation on owner, repo, and language before resolving ~/.adalflow/wikicache paths.',
    },
  ],
  xrayOptions: {
    latencyMs: 742,
    recommendedModelTier: 'gemini-4-carbon',
    routingRationale: 'Stateful RAG vector indexing with async concurrency & path-safety findings — gemini-4-carbon optimal for deep diagnostics.',
  },
  totalRepoFiles: 78,
  ingestLatencyMs: 1050,
  aiSynthesisLatencyMs: 2890,
  modelsUsed: ['gemini-4-carbon', 'gemini-4-neon', 'gemini-decision-1', 'gemini-embedding-2'],
});

// =============================================================================
// Showcase 4: REDFOX1899/antislop — Next.js 15 + Express 5 + Gemini 4 Design Studio
// =============================================================================

const ANTISLOP_FILES: RepoFileRecord[] = [
  makeFile({
    path: 'studio/src/app/page.tsx',
    language: 'typescript',
    layer: 'client',
    estimatedTokens: 3620,
    centrality: 0.85,
    fanIn: 0,
    fanOut: 3,
    imports: ['react', '@/components/DesignCanvas', '@/components/CritiqueHeatmap', '@/components/LiveDirectorBar'],
    resolvedImports: [
      'studio/src/components/DesignCanvas.tsx',
      'studio/src/components/CritiqueHeatmap.tsx',
      'studio/src/components/LiveDirectorBar.tsx',
    ],
    exports: ['default'],
    symbols: [
      { name: 'AntiSlopStudioPage', kind: 'component', line: 8, endLine: 36, exported: true },
    ],
    isEntrypoint: true,
    content: `'use client';
import { useState } from 'react';
import { DesignCanvas } from '@/components/DesignCanvas';
import { CritiqueHeatmap } from '@/components/CritiqueHeatmap';
import { LiveDirectorBar } from '@/components/LiveDirectorBar';
import type { DesignArtifact } from '@shared/contracts';

export default function AntiSlopStudioPage() {
  const [prompt, setPrompt] = useState('Editorial fintech workspace in Obsidian Cobalt + Archival Paper');
  const [artifact, setArtifact] = useState<DesignArtifact | null>(null);
  const [busy, setBusy] = useState(false);

  const synthesize = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/studio/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      setArtifact((await res.json()) as DesignArtifact);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen grid-cols-[1fr_360px] bg-[var(--bg-void)] text-[var(--ink-primary)]">
      <section className="flex flex-col gap-4 p-6">
        <div className="flex gap-3">
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} className="flex-1 rounded-lg border px-4 py-2" />
          <button onClick={synthesize} disabled={busy}>{busy ? 'Synthesizing...' : 'Generate'}</button>
        </div>
        <DesignCanvas artifact={artifact} />
        <LiveDirectorBar onApplyPatch={(patch) => setArtifact((prev) => (prev ? { ...prev, ...patch } : prev))} />
      </section>
      <CritiqueHeatmap critique={artifact?.critique ?? null} />
    </main>
  );
}`,
  }),
  makeFile({
    path: 'studio/src/components/DesignCanvas.tsx',
    language: 'typescript',
    layer: 'client',
    estimatedTokens: 3280,
    centrality: 0.78,
    fanIn: 1,
    fanOut: 1,
    imports: ['react', '@shared/contracts'],
    resolvedImports: ['shared/contracts.ts'],
    exports: ['DesignCanvas'],
    symbols: [
      { name: 'DesignCanvas', kind: 'component', line: 5, endLine: 29, exported: true },
    ],
    content: `'use client';
import type { DesignArtifact } from '@shared/contracts';

export function DesignCanvas({ artifact }: { artifact: DesignArtifact | null }) {
  if (!artifact) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)]">
        <p className="text-sm text-[var(--ink-secondary)]">Describe a product surface to synthesize token-disciplined UI visuals.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5 lg:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-[var(--border-card)]">
        <img src={artifact.heroImageUrl} alt={artifact.title} className="h-full w-full object-cover" />
      </div>
      <div className="flex flex-col justify-between gap-4">
        <div>
          <span className="font-mono text-xs text-[var(--cobalt-ice)]">{artifact.paletteName}</span>
          <h2 className="mt-1 text-2xl font-semibold">{artifact.title}</h2>
          <p className="mt-2 text-sm text-[var(--ink-secondary)]">{artifact.layoutRationale}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {artifact.tokens.map((tok) => (
            <span key={tok.name} className="rounded-md border px-2.5 py-1 font-mono text-xs" style={{ borderColor: tok.hex }}>
              {tok.name}: {tok.hex}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}`,
  }),
  makeFile({
    path: 'studio/src/components/CritiqueHeatmap.tsx',
    language: 'typescript',
    layer: 'client',
    estimatedTokens: 2860,
    centrality: 0.73,
    fanIn: 1,
    fanOut: 1,
    imports: ['react', '@shared/contracts'],
    resolvedImports: ['shared/contracts.ts'],
    exports: ['CritiqueHeatmap'],
    symbols: [
      { name: 'CritiqueHeatmap', kind: 'component', line: 5, endLine: 30, exported: true },
    ],
    content: `'use client';
import type { AntiSlopCritique } from '@shared/contracts';

export function CritiqueHeatmap({ critique }: { critique: AntiSlopCritique | null }) {
  return (
    <aside className="border-l border-[var(--border-card)] bg-[var(--bg-card)] p-5">
      <header className="flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--ink-secondary)]">Decision-1 AntiSlop Audit</h3>
        {critique && <span className="font-mono text-lg font-bold text-[var(--cobalt-bright)]">{critique.score}/100</span>}
      </header>
      <ul className="mt-5 space-y-3">
        {(critique?.pillars ?? []).map((cell) => (
          <li key={cell.pillar} className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>{cell.pillar}</span>
              <span style={{ color: cell.pPass >= 0.8 ? 'var(--emerald)' : cell.pPass >= 0.65 ? 'var(--amber)' : 'var(--vermilion)' }}>
                {Math.round(cell.pPass * 100)}%
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{cell.verdict}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}`,
  }),
  makeFile({
    path: 'studio/src/components/LiveDirectorBar.tsx',
    language: 'typescript',
    layer: 'client',
    estimatedTokens: 3440,
    centrality: 0.79,
    fanIn: 1,
    fanOut: 2,
    imports: ['react', '@shared/contracts'],
    resolvedImports: ['shared/contracts.ts', 'backend/src/live/voiceDirectorRelay.ts'],
    exports: ['LiveDirectorBar'],
    symbols: [
      { name: 'LiveDirectorBar', kind: 'component', line: 6, endLine: 33, exported: true },
    ],
    content: `'use client';
import { useRef, useState } from 'react';
import type { DesignArtifact } from '@shared/contracts';

export function LiveDirectorBar({ onApplyPatch }: { onApplyPatch: (patch: Partial<DesignArtifact>) => void }) {
  const [live, setLive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const toggleVoice = () => {
    if (live) {
      wsRef.current?.close();
      setLive(false);
      return;
    }
    const ws = new WebSocket(\`\${window.location.origin.replace(/^http/, 'ws')}/ws/live-director\`);
    wsRef.current = ws;
    ws.onopen = () => setLive(true);
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as { type: string; patch?: Partial<DesignArtifact> };
      if (msg.type === 'tool_patch' && msg.patch) onApplyPatch(msg.patch);
    };
    ws.onclose = () => setLive(false);
  };

  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-4 py-3">
      <span className="text-xs text-[var(--ink-secondary)]">Gemini 3.8 Live Voice Art Director (16kHz PCM + Non-Blocking Tools)</span>
      <button onClick={toggleVoice} className="rounded-lg bg-[var(--cobalt-core)] px-4 py-1.5 text-xs font-semibold text-white">
        {live ? 'End Live Session' : 'Start Voice Critique'}
      </button>
    </div>
  );
}`,
  }),
  makeFile({
    path: 'backend/src/server.ts',
    language: 'typescript',
    layer: 'edge',
    estimatedTokens: 2340,
    centrality: 0.88,
    fanIn: 0,
    fanOut: 2,
    imports: ['http', 'express', 'cors', 'ws', './routes/studio.js', './live/voiceDirectorRelay.js'],
    resolvedImports: ['backend/src/routes/studio.ts', 'backend/src/live/voiceDirectorRelay.ts'],
    exports: ['app', 'server'],
    symbols: [
      { name: 'app', kind: 'const', line: 8, endLine: 15, exported: true },
      { name: 'server', kind: 'const', line: 17, endLine: 26, exported: true },
    ],
    isEntrypoint: true,
    content: `import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { WebSocketServer } from 'ws';
import { studioRouter } from './routes/studio.js';
import { attachVoiceDirectorRelay } from './live/voiceDirectorRelay.js';

export const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000' }));
app.use(express.json({ limit: '4mb' }));
app.use('/api/studio', studioRouter);
app.get('/health', (_req, res) => res.json({ ok: true, service: 'antislop-backend' }));

export const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/live-director' });
attachVoiceDirectorRelay(wss);

const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(\`AntiSlop Studio backend listening on :\${port}\`);
});`,
  }),
  makeFile({
    path: 'backend/src/routes/studio.ts',
    language: 'typescript',
    layer: 'edge',
    estimatedTokens: 2980,
    centrality: 0.91,
    fanIn: 1,
    fanOut: 3,
    imports: ['express', '../gemini/designSynthesizer.js', '../gemini/mediaGenerator.js', '../gemini/aestheticJudge.js'],
    resolvedImports: [
      'backend/src/gemini/designSynthesizer.ts',
      'backend/src/gemini/mediaGenerator.ts',
      'backend/src/gemini/aestheticJudge.ts',
    ],
    exports: ['studioRouter'],
    symbols: [
      { name: 'studioRouter', kind: 'const', line: 6, endLine: 28, exported: true },
    ],
    content: `import { Router } from 'express';
import { synthesizeDesignBlueprint } from '../gemini/designSynthesizer.js';
import { renderHeroMockup } from '../gemini/mediaGenerator.js';
import { runAntiSlopAudit } from '../gemini/aestheticJudge.js';

export const studioRouter = Router();

studioRouter.post('/synthesize', async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt ?? '').trim();
    if (prompt.length < 6) {
      res.status(400).json({ error: 'Design prompt must be at least 6 characters.' });
      return;
    }

    const blueprint = await synthesizeDesignBlueprint(prompt);
    const [heroImageUrl, critique] = await Promise.all([
      renderHeroMockup(blueprint.imagePrompt),
      runAntiSlopAudit(blueprint),
    ]);

    res.json({ ...blueprint, heroImageUrl, critique });
  } catch (err) {
    next(err);
  }
});`,
  }),
  makeFile({
    path: 'backend/src/gemini/designSynthesizer.ts',
    language: 'typescript',
    layer: 'orchestration',
    estimatedTokens: 3890,
    centrality: 0.94,
    fanIn: 1,
    fanOut: 2,
    imports: ['./clientPool.js', '../../../shared/contracts.js'],
    resolvedImports: ['backend/src/gemini/clientPool.ts', 'shared/contracts.ts'],
    exports: ['synthesizeDesignBlueprint'],
    symbols: [
      { name: 'synthesizeDesignBlueprint', kind: 'function', line: 5, endLine: 30, exported: true },
    ],
    content: `import { getV1Client } from './clientPool.js';
import type { DesignBlueprintDraft } from '../../../shared/contracts.js';

export async function synthesizeDesignBlueprint(prompt: string): Promise<DesignBlueprintDraft> {
  const client = getV1Client();
  const interaction = await client.interactions.create({
    model: 'gemini-4-carbon',
    system_instruction:
      'Return strict JSON with title, paletteName, layoutRationale, tokens (name+hex), and imagePrompt. Reject generic purple/pink gradients.',
    input: \`Design brief: \${prompt}\`,
    generation_config: { thinking_level: 'medium' },
  } as unknown as Record<string, unknown>);

  const outputs = (interaction as unknown as { outputs?: Array<{ text?: string }> }).outputs ?? [];
  const rawText = outputs[outputs.length - 1]?.text ?? '{}';
  const parsed = JSON.parse(rawText.replace(/^\`\`\`json\\s*|\`\`\`$/g, '')) as DesignBlueprintDraft;

  return {
    title: parsed.title || 'Obsidian Cobalt Surface',
    paletteName: parsed.paletteName || 'Obsidian Cobalt + Archival Paper',
    layoutRationale: parsed.layoutRationale || 'High-contrast editorial hierarchy with restrained cobalt accents.',
    tokens: parsed.tokens ?? [{ name: '--cobalt-core', hex: '#1A73E8' }],
    imagePrompt: parsed.imagePrompt || prompt,
  };
}`,
  }),
  makeFile({
    path: 'backend/src/gemini/aestheticJudge.ts',
    language: 'typescript',
    layer: 'domain',
    estimatedTokens: 4210,
    centrality: 0.95,
    fanIn: 1,
    fanOut: 2,
    imports: ['./clientPool.js', '../../../shared/contracts.js'],
    resolvedImports: ['backend/src/gemini/clientPool.ts', 'shared/contracts.ts'],
    exports: ['runAntiSlopAudit'],
    symbols: [
      { name: 'runAntiSlopAudit', kind: 'function', line: 12, endLine: 38, exported: true },
    ],
    content: `import { getV1BetaClient } from './clientPool.js';
import type { AntiSlopCritique, DesignBlueprintDraft } from '../../../shared/contracts.js';

const ANTI_SLOP_PILLARS = [
  'Contrast & Legibility',
  'Anti-Cliché Palette Discipline',
  'Spatial Density & Grid Rhythm',
  'Typography Hierarchy',
  'Light/Dark Token Parity',
] as const;

export async function runAntiSlopAudit(draft: DesignBlueprintDraft): Promise<AntiSlopCritique> {
  const beta = getV1BetaClient();
  const probes = await Promise.all(
    ANTI_SLOP_PILLARS.map(async (pillar, idx) => {
      const decision = await (beta as unknown as { decisions: { create: (arg: Record<string, unknown>) => Promise<{ probability?: number }> } }).decisions.create({
        model: 'gemini-decision-1',
        shardHint: idx % 2,
        question: \`Does this design pass the \${pillar} anti-slop quality bar without generic AI clichés?\`,
        context: JSON.stringify(draft),
      });
      const pPass = Number((decision.probability ?? 0.86).toFixed(3));
      return {
        pillar,
        pPass,
        verdict: pPass >= 0.8 ? 'Passes editorial bar' : 'Refine spacing or token contrast',
      };
    }),
  );

  const avg = probes.reduce((acc, p) => acc + p.pPass, 0) / probes.length;
  return { model: 'gemini-decision-1', score: Math.round(avg * 100), pillars: probes };
}`,
  }),
  makeFile({
    path: 'backend/src/gemini/mediaGenerator.ts',
    language: 'typescript',
    layer: 'orchestration',
    estimatedTokens: 3140,
    centrality: 0.82,
    fanIn: 1,
    fanOut: 1,
    imports: ['./clientPool.js'],
    resolvedImports: ['backend/src/gemini/clientPool.ts'],
    exports: ['renderHeroMockup', 'synthesizeVoiceBrief'],
    symbols: [
      { name: 'renderHeroMockup', kind: 'function', line: 4, endLine: 18, exported: true },
      { name: 'synthesizeVoiceBrief', kind: 'function', line: 20, endLine: 32, exported: true },
    ],
    content: `import { getV1BetaClient, getV1Client } from './clientPool.js';

export async function renderHeroMockup(imagePrompt: string): Promise<string> {
  const beta = getV1BetaClient();
  const res = await beta.interactions.create({
    model: 'gemini-nano-banana-2.1',
    input: \`Crisp UI product mockup, zero neon purple slop, obsidian cobalt architectural lighting: \${imagePrompt}\`,
    response_modalities: ['IMAGE'],
  } as unknown as Record<string, unknown>);

  const outputs = (res as unknown as { outputs?: Array<{ data?: string; mime_type?: string }> }).outputs ?? [];
  const img = outputs.find((o) => o.data);
  if (!img?.data) return '/assets/fallback-cobalt-blueprint.png';
  return \`data:\${img.mime_type ?? 'image/png'};base64,\${img.data}\`;
}

export async function synthesizeVoiceBrief(narrationScript: string): Promise<string> {
  const client = getV1Client();
  const res = await client.interactions.create({
    model: 'gemini-3.8-flash-tts',
    input: narrationScript,
    response_modalities: ['AUDIO'],
  } as unknown as Record<string, unknown>);
  const outputs = (res as unknown as { outputs?: Array<{ data?: string }> }).outputs ?? [];
  return outputs[0]?.data ?? '';
}`,
  }),
  makeFile({
    path: 'backend/src/live/voiceDirectorRelay.ts',
    language: 'typescript',
    layer: 'orchestration',
    estimatedTokens: 4380,
    centrality: 0.90,
    fanIn: 2,
    fanOut: 1,
    imports: ['ws', '../gemini/clientPool.js'],
    resolvedImports: ['backend/src/gemini/clientPool.ts'],
    exports: ['attachVoiceDirectorRelay'],
    symbols: [
      { name: 'attachVoiceDirectorRelay', kind: 'function', line: 4, endLine: 38, exported: true },
    ],
    content: `import type { WebSocketServer } from 'ws';
import { getV1Client } from '../gemini/clientPool.js';

export function attachVoiceDirectorRelay(wss: WebSocketServer): void {
  wss.on('connection', async (socket) => {
    const ai = getV1Client();
    const session = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: ['AUDIO'],
        tools: [{
          functionDeclarations: [{
            name: 'patch_design_tokens',
            behavior: 'NON_BLOCKING',
            description: 'Live-update CSS variables or layout rationale while speaking.',
          }],
        }],
      },
    } as unknown as Parameters<typeof ai.live.connect>[0]);

    socket.on('message', (raw) => {
      const frame = JSON.parse(raw.toString()) as { pcmBase64?: string; text?: string };
      if (frame.pcmBase64) {
        session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: frame.pcmBase64 } } as never);
      } else if (frame.text) {
        session.sendRealtimeInput({ text: frame.text } as never);
      }
    });

    socket.on('close', () => session.close());
  });
}`,
  }),
  makeFile({
    path: 'backend/src/gemini/clientPool.ts',
    language: 'typescript',
    layer: 'infrastructure',
    estimatedTokens: 2560,
    centrality: 0.97,
    fanIn: 4,
    fanOut: 0,
    imports: ['@google/genai'],
    resolvedImports: [],
    exports: ['getV1Client', 'getV1BetaClient'],
    symbols: [
      { name: 'getV1Client', kind: 'function', line: 12, endLine: 17, exported: true },
      { name: 'getV1BetaClient', kind: 'function', line: 19, endLine: 24, exported: true },
    ],
    content: `import { GoogleGenAI } from '@google/genai';

const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(
  (k): k is string => Boolean(k && k.trim().length > 0),
);
let cursor = 0;

function pickKey(): string {
  if (keys.length === 0) throw new Error('Missing GEMINI_API_KEY');
  const key = keys[cursor % keys.length]!;
  cursor += 1;
  return key;
}

export function getV1Client(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: pickKey(), apiVersion: 'v1' });
}

export function getV1BetaClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: pickKey(), apiVersion: 'v1beta' });
}`,
  }),
  makeFile({
    path: 'shared/contracts.ts',
    language: 'typescript',
    layer: 'domain',
    estimatedTokens: 1740,
    centrality: 0.89,
    fanIn: 5,
    fanOut: 0,
    imports: [],
    resolvedImports: [],
    exports: ['DesignToken', 'DesignBlueprintDraft', 'AntiSlopCritique', 'DesignArtifact'],
    symbols: [
      { name: 'DesignToken', kind: 'interface', line: 1, endLine: 4, exported: true },
      { name: 'DesignBlueprintDraft', kind: 'interface', line: 6, endLine: 12, exported: true },
      { name: 'AntiSlopCritique', kind: 'interface', line: 14, endLine: 18, exported: true },
      { name: 'DesignArtifact', kind: 'interface', line: 20, endLine: 23, exported: true },
    ],
    isConfig: true,
    content: `export interface DesignToken {
  name: string;
  hex: string;
}

export interface DesignBlueprintDraft {
  title: string;
  paletteName: string;
  layoutRationale: string;
  tokens: DesignToken[];
  imagePrompt: string;
}

export interface AntiSlopCritique {
  model: 'gemini-decision-1';
  score: number;
  pillars: Array<{ pillar: string; pPass: number; verdict: string }>;
}

export interface DesignArtifact extends DesignBlueprintDraft {
  heroImageUrl: string;
  critique: AntiSlopCritique;
}`,
  }),
];

const ANTISLOP_NODES: AtlasNode[] = [
  {
    id: 'as-studio-page',
    label: 'AntiSlop Studio Shell',
    subtitle: 'Obsidian Cobalt Next.js 15 workspace',
    subsystemId: 'as-sub-ui',
    layer: 'client',
    kind: 'ui',
    filePaths: ['studio/src/app/page.tsx'],
    primaryFile: 'studio/src/app/page.tsx',
    lineStart: 8,
    lineEnd: 37,
    estimatedTokens: 3620,
    centrality: 0.85,
    fanIn: 0,
    fanOut: 3,
    keySymbols: ['AntiSlopStudioPage'],
    visualBrief: 'Main Next.js 15 design workbench coordinating prompt submission, live voice director patches, and heatmap audit inspection.',
    inputs: ['User aesthetic prompt', 'Live voice patch diffs'],
    outputs: ['POST /api/studio/synthesize requests', 'Unified visual artifact state'],
    x: 60,
    y: 80,
  },
  {
    id: 'as-design-canvas',
    label: 'Visual Artifact Canvas',
    subtitle: 'Hero mockup & CSS token specimen view',
    subsystemId: 'as-sub-ui',
    layer: 'client',
    kind: 'ui',
    filePaths: ['studio/src/components/DesignCanvas.tsx'],
    primaryFile: 'studio/src/components/DesignCanvas.tsx',
    lineStart: 4,
    lineEnd: 31,
    estimatedTokens: 3280,
    centrality: 0.78,
    fanIn: 1,
    fanOut: 1,
    keySymbols: ['DesignCanvas'],
    visualBrief: 'Displays generated Nano Banana 2.1 product mockups alongside interactive hex token chips and layout rationale.',
    inputs: ['DesignArtifact | null'],
    outputs: ['Rendered visual stage & token swatches'],
    x: 60,
    y: 260,
  },
  {
    id: 'as-critique-heatmap',
    label: 'Decision-1 Critique Heatmap',
    subtitle: '5-pillar calibrated anti-slop rubric rail',
    subsystemId: 'as-sub-ui',
    layer: 'client',
    kind: 'ui',
    filePaths: ['studio/src/components/CritiqueHeatmap.tsx'],
    primaryFile: 'studio/src/components/CritiqueHeatmap.tsx',
    lineStart: 4,
    lineEnd: 25,
    estimatedTokens: 2860,
    centrality: 0.73,
    fanIn: 1,
    fanOut: 1,
    keySymbols: ['CritiqueHeatmap'],
    visualBrief: 'Surfaces calibrated Decision-1 probabilities across contrast, typography, spacing, and cliché avoidance using emerald/amber/vermilion bands.',
    inputs: ['AntiSlopCritique | null'],
    outputs: ['Interactive quality scorecard sidebar'],
    x: 60,
    y: 430,
  },
  {
    id: 'as-voice-bar',
    label: 'Live Voice Director Bar',
    subtitle: 'Browser WebSocket bridge for Gemini 3.8 Live',
    subsystemId: 'as-sub-ui',
    layer: 'client',
    kind: 'ui',
    filePaths: ['studio/src/components/LiveDirectorBar.tsx'],
    primaryFile: 'studio/src/components/LiveDirectorBar.tsx',
    lineStart: 5,
    lineEnd: 32,
    estimatedTokens: 3440,
    centrality: 0.79,
    fanIn: 1,
    fanOut: 2,
    keySymbols: ['LiveDirectorBar'],
    visualBrief: 'Connects to /ws/live-director so designers can speak art direction changes and see non-blocking token patches apply immediately.',
    inputs: ['User microphone stream', 'Incoming tool_patch WebSocket messages'],
    outputs: ['Live UI DesignArtifact patches'],
    x: 330,
    y: 280,
  },
  {
    id: 'as-express-server',
    label: 'Express 5 & WS Server',
    subtitle: 'Unified HTTP + WebSocket runtime host',
    subsystemId: 'as-sub-edge',
    layer: 'edge',
    kind: 'api',
    filePaths: ['backend/src/server.ts'],
    primaryFile: 'backend/src/server.ts',
    lineStart: 8,
    lineEnd: 21,
    estimatedTokens: 2340,
    centrality: 0.88,
    fanIn: 1,
    fanOut: 2,
    keySymbols: ['app', 'server'],
    visualBrief: 'Express 5 HTTP server with origin-locked CORS and a shared Node HTTP upgrade path for /ws/live-director.',
    inputs: ['REST API requests', 'WebSocket upgrades'],
    outputs: ['Mounted /api/studio & /ws/live-director handlers'],
    x: 330,
    y: 80,
  },
  {
    id: 'as-studio-router',
    label: 'Studio Synthesis Router',
    subtitle: 'Parallel mockup + Decision-1 critique fan-out',
    subsystemId: 'as-sub-edge',
    layer: 'edge',
    kind: 'api',
    filePaths: ['backend/src/routes/studio.ts'],
    primaryFile: 'backend/src/routes/studio.ts',
    lineStart: 8,
    lineEnd: 25,
    estimatedTokens: 2980,
    centrality: 0.91,
    fanIn: 1,
    fanOut: 3,
    keySymbols: ['studioRouter'],
    visualBrief: 'Validates prompts, drafts tokens via Gemini 4 Carbon, then fans out Nano Banana image generation and Decision-1 auditing in parallel.',
    inputs: ['POST /api/studio/synthesize { prompt }'],
    outputs: ['Hydrated DesignArtifact JSON'],
    x: 600,
    y: 80,
  },
  {
    id: 'as-design-synth',
    label: 'Gemini 4 Design Synthesizer',
    subtitle: 'Interactions API structured token architect',
    subsystemId: 'as-sub-ai',
    layer: 'orchestration',
    kind: 'agent',
    filePaths: ['backend/src/gemini/designSynthesizer.ts'],
    primaryFile: 'backend/src/gemini/designSynthesizer.ts',
    lineStart: 4,
    lineEnd: 25,
    estimatedTokens: 3890,
    centrality: 0.94,
    fanIn: 1,
    fanOut: 2,
    keySymbols: ['synthesizeDesignBlueprint'],
    visualBrief: 'Calls gemini-4-carbon via client.interactions.create with medium thinking_level to draft anti-cliché palettes and image prompts.',
    inputs: ['User design brief prompt'],
    outputs: ['DesignBlueprintDraft JSON'],
    x: 880,
    y: 50,
  },
  {
    id: 'as-media-gen',
    label: 'Nano Banana & TTS Media Engine',
    subtitle: 'gemini-nano-banana-2.1 + 3.8-flash-tts',
    subsystemId: 'as-sub-ai',
    layer: 'orchestration',
    kind: 'pipeline',
    filePaths: ['backend/src/gemini/mediaGenerator.ts'],
    primaryFile: 'backend/src/gemini/mediaGenerator.ts',
    lineStart: 3,
    lineEnd: 26,
    estimatedTokens: 3140,
    centrality: 0.82,
    fanIn: 1,
    fanOut: 1,
    keySymbols: ['renderHeroMockup', 'synthesizeVoiceBrief'],
    visualBrief: 'Generates crisp architectural UI hero visuals with gemini-nano-banana-2.1 on v1beta and audio narrations via gemini-3.8-flash-tts.',
    inputs: ['Refined imagePrompt', 'Narration script'],
    outputs: ['Base64 data URL mockup', 'Synthesized TTS audio'],
    x: 880,
    y: 210,
  },
  {
    id: 'as-live-relay',
    label: 'Gemini 3.8 Live Voice Relay',
    subtitle: '16kHz PCM relay with NON_BLOCKING tools',
    subsystemId: 'as-sub-ai',
    layer: 'orchestration',
    kind: 'agent',
    filePaths: ['backend/src/live/voiceDirectorRelay.ts'],
    primaryFile: 'backend/src/live/voiceDirectorRelay.ts',
    lineStart: 4,
    lineEnd: 32,
    estimatedTokens: 4380,
    centrality: 0.90,
    fanIn: 2,
    fanOut: 1,
    keySymbols: ['attachVoiceDirectorRelay'],
    visualBrief: 'Streams live PCM audio frames to ai.live.connect(gemini-3.8-live) with NON_BLOCKING patch_design_tokens tool calls.',
    inputs: ['Browser WebSocket PCM/text frames'],
    outputs: ['Real-time audio critique + non-blocking UI token patches'],
    x: 600,
    y: 280,
  },
  {
    id: 'as-aesthetic-judge',
    label: 'Decision-1 AntiSlop Judge',
    subtitle: '5-pillar sharded calibrated probability scorer',
    subsystemId: 'as-sub-judge',
    layer: 'domain',
    kind: 'service',
    filePaths: ['backend/src/gemini/aestheticJudge.ts', 'shared/contracts.ts'],
    primaryFile: 'backend/src/gemini/aestheticJudge.ts',
    lineStart: 12,
    lineEnd: 34,
    estimatedTokens: 5950,
    centrality: 0.95,
    fanIn: 5,
    fanOut: 1,
    keySymbols: ['runAntiSlopAudit', 'DesignArtifact', 'AntiSlopCritique'],
    visualBrief: 'Runs parallel calibrated binary probes on gemini-decision-1 (v1beta) against 5 editorial craft pillars to compute an AntiSlop score.',
    inputs: ['DesignBlueprintDraft', 'Shared contract types'],
    outputs: ['AntiSlopCritique scorecard (0..100 + per-pillar pPass)'],
    x: 880,
    y: 380,
  },
  {
    id: 'as-client-pool',
    label: 'Dual-Key Gemini SDK Pool',
    subtitle: 'Round-robin v1 / v1beta key sharding',
    subsystemId: 'as-sub-infra',
    layer: 'infrastructure',
    kind: 'external',
    filePaths: ['backend/src/gemini/clientPool.ts'],
    primaryFile: 'backend/src/gemini/clientPool.ts',
    lineStart: 3,
    lineEnd: 21,
    estimatedTokens: 2560,
    centrality: 0.97,
    fanIn: 4,
    fanOut: 0,
    keySymbols: ['getV1Client', 'getV1BetaClient'],
    visualBrief: 'Load-balances Gemini API traffic across primary and secondary keys while routing Gemini 4 (v1) and Decision-1/Nano Banana (v1beta) cleanly.',
    inputs: ['GEMINI_API_KEY & GEMINI_API_KEY_2 env vars'],
    outputs: ['Version-pinned GoogleGenAI client instances'],
    x: 1160,
    y: 210,
  },
];

const ANTISLOP_EDGES: AtlasEdge[] = [
  { id: 'as-e1', source: 'as-studio-page', target: 'as-design-canvas', label: 'render hero + tokens', kind: 'data', weight: 3, isHotPath: true },
  { id: 'as-e2', source: 'as-studio-page', target: 'as-critique-heatmap', label: 'render 5-pillar score', kind: 'data', weight: 3, isHotPath: true },
  { id: 'as-e3', source: 'as-studio-page', target: 'as-voice-bar', label: 'onApplyPatch callback', kind: 'control', weight: 2, isHotPath: false },
  { id: 'as-e4', source: 'as-studio-page', target: 'as-express-server', label: 'POST /api/studio/synthesize', kind: 'http', protocol: 'HTTP/1.1', weight: 3, isHotPath: true },
  { id: 'as-e5', source: 'as-voice-bar', target: 'as-express-server', label: 'WS /ws/live-director', kind: 'stream', protocol: 'WebSocket', weight: 3, isHotPath: true },
  { id: 'as-e6', source: 'as-express-server', target: 'as-studio-router', label: 'mount /api/studio', kind: 'control', weight: 3, isHotPath: true },
  { id: 'as-e7', source: 'as-express-server', target: 'as-live-relay', label: 'attach WebSocketServer', kind: 'stream', protocol: 'WebSocket', weight: 3, isHotPath: true },
  { id: 'as-e8', source: 'as-studio-router', target: 'as-design-synth', label: 'synthesizeDesignBlueprint()', kind: 'control', weight: 3, isHotPath: true },
  { id: 'as-e9', source: 'as-studio-router', target: 'as-media-gen', label: 'renderHeroMockup()', kind: 'control', weight: 3, isHotPath: true },
  { id: 'as-e10', source: 'as-studio-router', target: 'as-aesthetic-judge', label: 'runAntiSlopAudit()', kind: 'control', weight: 3, isHotPath: true },
  { id: 'as-e11', source: 'as-design-synth', target: 'as-client-pool', label: 'getV1Client() [carbon]', kind: 'http', protocol: 'Gemini v1', weight: 3, isHotPath: true },
  { id: 'as-e12', source: 'as-media-gen', target: 'as-client-pool', label: 'getV1BetaClient() [nano-banana]', kind: 'http', protocol: 'Gemini v1beta', weight: 3, isHotPath: true },
  { id: 'as-e13', source: 'as-aesthetic-judge', target: 'as-client-pool', label: 'getV1BetaClient() [decision-1]', kind: 'http', protocol: 'Gemini v1beta', weight: 3, isHotPath: true },
  { id: 'as-e14', source: 'as-live-relay', target: 'as-client-pool', label: 'getV1Client() [3.8-live]', kind: 'stream', protocol: 'Gemini Live', weight: 3, isHotPath: true },
  { id: 'as-e15', source: 'as-design-canvas', target: 'as-aesthetic-judge', label: 'shared DesignArtifact type', kind: 'dependency', weight: 1, isHotPath: false },
  { id: 'as-e16', source: 'as-critique-heatmap', target: 'as-aesthetic-judge', label: 'shared AntiSlopCritique type', kind: 'dependency', weight: 1, isHotPath: false },
];

const ANTISLOP_SUBSYSTEMS: SubsystemCluster[] = [
  {
    id: 'as-sub-ui',
    name: 'Obsidian Cobalt Studio UI',
    tagline: 'Next.js 15 visual stage, Decision-1 scorecard, and Live Voice Director bar',
    layer: 'client',
    color: '#4285F4',
    nodeIds: ['as-studio-page', 'as-design-canvas', 'as-critique-heatmap', 'as-voice-bar'],
    filePaths: [
      'studio/src/app/page.tsx',
      'studio/src/components/DesignCanvas.tsx',
      'studio/src/components/CritiqueHeatmap.tsx',
      'studio/src/components/LiveDirectorBar.tsx',
    ],
    entrypointPaths: ['studio/src/app/page.tsx'],
    totalTokens: 13200,
    summaryBullets: [
      'Uses CSS variables exclusively so Obsidian Dark and Archival Paper Light stay perfectly legible.',
      'Visual mockup and calibrated AntiSlop heatmap take center stage while voice patches update tokens live.',
    ],
    invariants: ['Zero hardcoded purple/pink neon gradients', 'Always style surfaces via CSS custom properties'],
  },
  {
    id: 'as-sub-edge',
    name: 'Express 5 & WebSocket Gateway',
    tagline: 'Origin-locked REST router and /ws/live-director upgrade server',
    layer: 'edge',
    color: '#38BDF8',
    nodeIds: ['as-express-server', 'as-studio-router'],
    filePaths: ['backend/src/server.ts', 'backend/src/routes/studio.ts'],
    entrypointPaths: ['backend/src/server.ts'],
    totalTokens: 5320,
    summaryBullets: [
      'Fans out Nano Banana image generation and Decision-1 auditing concurrently via Promise.all after drafting tokens.',
    ],
    invariants: ['Validate minimum prompt length before calling paid Gemini endpoints'],
  },
  {
    id: 'as-sub-ai',
    name: 'Gemini 4 Multimodal Orchestrators',
    tagline: 'Carbon design architect, Nano Banana 2.1 visuals, TTS, and 3.8 Live voice relay',
    layer: 'orchestration',
    color: '#1A73E8',
    nodeIds: ['as-design-synth', 'as-media-gen', 'as-live-relay'],
    filePaths: [
      'backend/src/gemini/designSynthesizer.ts',
      'backend/src/gemini/mediaGenerator.ts',
      'backend/src/live/voiceDirectorRelay.ts',
    ],
    entrypointPaths: ['backend/src/gemini/designSynthesizer.ts'],
    totalTokens: 11410,
    summaryBullets: [
      'Strictly uses client.interactions.create with thinking_level on Gemini 4 and NON_BLOCKING tools on Gemini 3.8 Live.',
      'Provides clean static fallback assets when image generation quota is exhausted.',
    ],
    invariants: ['Never pass temperature/top_p/top_k to Gemini 4 models', 'Use audio/pcm;rate=16000 for Live API input'],
  },
  {
    id: 'as-sub-judge',
    name: 'Decision-1 AntiSlop Engine & Contracts',
    tagline: '5-pillar calibrated aesthetic rubric and shared TypeScript contracts',
    layer: 'domain',
    color: '#2DD4BF',
    nodeIds: ['as-aesthetic-judge'],
    filePaths: ['backend/src/gemini/aestheticJudge.ts', 'shared/contracts.ts'],
    entrypointPaths: ['backend/src/gemini/aestheticJudge.ts'],
    totalTokens: 5950,
    summaryBullets: [
      'Evaluates every synthesized design across 5 parallel Decision-1 binary probes instead of subjective free-text critique.',
    ],
    invariants: ['Keep shared/contracts.ts as the sole type contract across studio/ and backend/'],
  },
  {
    id: 'as-sub-infra',
    name: 'Dual-Key Gemini SDK Pool',
    tagline: 'Round-robin API key sharding across v1 and v1beta endpoints',
    layer: 'infrastructure',
    color: '#818CF8',
    nodeIds: ['as-client-pool'],
    filePaths: ['backend/src/gemini/clientPool.ts'],
    entrypointPaths: ['backend/src/gemini/clientPool.ts'],
    totalTokens: 2560,
    summaryBullets: [
      'Shards concurrent Decision-1 and Gemini 4 calls across primary and secondary API keys to double effective throughput.',
    ],
    invariants: ['Isolate v1beta clients strictly for gemini-decision-1 and gemini-nano-banana-2.1'],
  },
];

const ANTISLOP_BLUEPRINT = assembleBlueprint({
  metadata: {
    id: 'REDFOX1899__antislop__main',
    owner: 'REDFOX1899',
    name: 'antislop',
    fullName: 'REDFOX1899/antislop',
    description: 'Obsidian Cobalt + Archival Paper multimodal design studio powered by Gemini 4, Nano Banana 2.1, Decision-1 AntiSlop auditing, and Gemini 3.8 Live voice direction.',
    defaultBranch: 'main',
    branch: 'main',
    stars: 4280,
    forks: 312,
    openIssues: 14,
    primaryLanguage: 'TypeScript',
    languages: { TypeScript: 92, CSS: 8 },
    topics: ['gemini-4', 'nextjs-15', 'express-5', 'decision-1', 'multimodal', 'design-systems'],
    license: 'MIT',
    htmlUrl: 'https://github.com/REDFOX1899/antislop',
    homepage: 'https://antislop.studio',
    updatedAt: '2026-11-18T11:45:00.000Z',
    isPrivate: false,
    isShowcase: true,
  },
  headline: 'Multimodal Gemini 4 + Decision-1 AntiSlop Design Studio',
  oneLiner: 'Synthesizes editorial UI systems with Gemini 4 Carbon & Nano Banana 2.1, scores every pixel against 5 calibrated Decision-1 pillars, and accepts live voice art direction.',
  architecturePattern: 'Next.js 15 Studio + Express 5 Multimodal Gemini 4 Orchestrator',
  techStackBadges: ['Next.js 15', 'Express 5', 'Gemini 4 Carbon', 'Decision-1', 'Nano Banana 2.1', 'Gemini 3.8 Live'],
  files: ANTISLOP_FILES,
  subsystems: ANTISLOP_SUBSYSTEMS,
  nodes: ANTISLOP_NODES,
  edges: ANTISLOP_EDGES,
  flows: [
    {
      id: 'as-flow-synthesize',
      title: 'Multimodal Design Synthesis + Parallel AntiSlop Audit',
      subtitle: 'Prompt -> Gemini 4 Carbon token blueprint -> parallel Nano Banana 2.1 render & Decision-1 5-pillar critique',
      trigger: 'Designer clicks Generate in AntiSlop Studio',
      category: 'ai_pipeline',
      steps: [
        {
          stepNumber: 1,
          title: 'Submit Prompt to Express 5 Studio Router',
          action: 'AntiSlopStudioPage posts the design brief to /api/studio/synthesize where prompt bounds are validated.',
          fromNodeId: 'as-studio-page',
          toNodeId: 'as-studio-router',
          edgeLabel: 'POST /api/studio/synthesize',
          filePath: 'backend/src/routes/studio.ts',
          lineStart: 8,
          lineEnd: 16,
          codeExcerpt: 'studioRouter.post("/synthesize", async (req, res, next) => {\n  const prompt = String(req.body?.prompt ?? "").trim();\n  const blueprint = await synthesizeDesignBlueprint(prompt);',
          dataPayload: '{ prompt: "Editorial fintech workspace in Obsidian Cobalt + Archival Paper" }',
        },
        {
          stepNumber: 2,
          title: 'Draft Anti-Cliché Token Blueprint on Gemini 4 Carbon',
          action: 'Calls client.interactions.create on v1 with thinking_level: medium to produce structured tokens and imagePrompt.',
          fromNodeId: 'as-studio-router',
          toNodeId: 'as-design-synth',
          edgeLabel: 'synthesizeDesignBlueprint()',
          filePath: 'backend/src/gemini/designSynthesizer.ts',
          lineStart: 5,
          lineEnd: 17,
          codeExcerpt: 'const interaction = await client.interactions.create({\n  model: "gemini-4-carbon",\n  input: `Design brief: ${prompt}`,\n  generation_config: { thinking_level: "medium" },\n});',
          dataPayload: '{ title: "Obsidian Cobalt Ledger", tokens: [6 CSS vars], imagePrompt: "..." }',
        },
        {
          stepNumber: 3,
          title: 'Parallel Hero Visual Render via Nano Banana 2.1',
          action: 'Concurrently invokes gemini-nano-banana-2.1 on v1beta to synthesize a crisp hero UI mockup.',
          fromNodeId: 'as-studio-router',
          toNodeId: 'as-media-gen',
          edgeLabel: 'renderHeroMockup()',
          filePath: 'backend/src/gemini/mediaGenerator.ts',
          lineStart: 3,
          lineEnd: 14,
          codeExcerpt: 'const res = await beta.interactions.create({\n  model: "gemini-nano-banana-2.1",\n  input: `Crisp UI product mockup, zero neon purple slop: ${imagePrompt}`,\n  response_modalities: ["IMAGE"],\n});',
          dataPayload: 'data:image/png;base64,...',
        },
        {
          stepNumber: 4,
          title: 'Sharded 5-Pillar Decision-1 AntiSlop Audit',
          action: 'Fans out 5 calibrated binary probes across dual API keys using gemini-decision-1 on v1beta.',
          fromNodeId: 'as-studio-router',
          toNodeId: 'as-aesthetic-judge',
          edgeLabel: 'runAntiSlopAudit()',
          filePath: 'backend/src/gemini/aestheticJudge.ts',
          lineStart: 12,
          lineEnd: 27,
          codeExcerpt: 'const decision = await beta.decisions.create({\n  model: "gemini-decision-1",\n  shardHint: idx % 2,\n  question: `Does this design pass the ${pillar} anti-slop quality bar?`,\n});',
          dataPayload: '{ score: 93, pillars: [5 calibrated pPass scores] }',
        },
        {
          stepNumber: 5,
          title: 'Hydrate Visual Canvas & Critique Heatmap',
          action: 'Returns the combined DesignArtifact so DesignCanvas and CritiqueHeatmap render synchronously.',
          fromNodeId: 'as-studio-router',
          toNodeId: 'as-design-canvas',
          edgeLabel: '200 JSON DesignArtifact',
          filePath: 'studio/src/components/CritiqueHeatmap.tsx',
          lineStart: 10,
          lineEnd: 21,
          codeExcerpt: '<span style={{ color: cell.pPass >= 0.8 ? "var(--emerald)" : cell.pPass >= 0.65 ? "var(--amber)" : "var(--vermilion)" }}>\n  {Math.round(cell.pPass * 100)}%\n</span>',
          dataPayload: 'Rendered hero canvas + 93/100 AntiSlop rail',
        },
      ],
    },
    {
      id: 'as-flow-live-voice',
      title: 'Gemini 3.8 Live Bidirectional Voice Art Direction',
      subtitle: '16kHz PCM audio streaming with NON_BLOCKING live token patch tool calls',
      trigger: 'Designer clicks Start Voice Critique in LiveDirectorBar',
      category: 'state',
      steps: [
        {
          stepNumber: 1,
          title: 'Upgrade /ws/live-director WebSocket',
          action: 'LiveDirectorBar opens a persistent WebSocket to Express 5 and listens for tool_patch diffs.',
          fromNodeId: 'as-voice-bar',
          toNodeId: 'as-express-server',
          edgeLabel: 'WS /ws/live-director',
          filePath: 'studio/src/components/LiveDirectorBar.tsx',
          lineStart: 14,
          lineEnd: 21,
          codeExcerpt: 'const ws = new WebSocket(`${window.location.origin.replace(/^http/, "ws")}/ws/live-director`);\nws.onmessage = (event) => {\n  if (msg.type === "tool_patch" && msg.patch) onApplyPatch(msg.patch);\n};',
        },
        {
          stepNumber: 2,
          title: 'Connect Gemini 3.8 Live with NON_BLOCKING Tooling',
          action: 'voiceDirectorRelay initializes ai.live.connect(gemini-3.8-live) and forwards 16kHz PCM frames.',
          fromNodeId: 'as-live-relay',
          toNodeId: 'as-client-pool',
          edgeLabel: 'ai.live.connect(gemini-3.8-live)',
          filePath: 'backend/src/live/voiceDirectorRelay.ts',
          lineStart: 7,
          lineEnd: 26,
          codeExcerpt: 'const session = await ai.live.connect({ model: "gemini-3.8-live", config: { responseModalities: ["AUDIO"], tools: [{ functionDeclarations: [{ name: "patch_design_tokens", behavior: "NON_BLOCKING" }] }] } });\nsession.sendRealtimeInput({ media: { mimeType: "audio/pcm;rate=16000", data: frame.pcmBase64 } });',
        },
      ],
    },
  ],
  codemapTour: [
    {
      id: 'as-tour-1',
      order: 1,
      title: 'Parallel Multimodal Fan-Out in studio.ts',
      visualHook: 'After Gemini 4 Carbon drafts tokens, Nano Banana 2.1 and Decision-1 execute in parallel via Promise.all.',
      explanation: 'Running visual generation concurrently with the 5-pillar calibrated audit shaves ~1.8s off wall-clock latency.',
      focusNodeId: 'as-studio-router',
      highlightNodeIds: ['as-studio-router', 'as-design-synth', 'as-media-gen', 'as-aesthetic-judge'],
      filePath: 'backend/src/routes/studio.ts',
      lineStart: 15,
      lineEnd: 22,
      recommendedLens: 'atlas',
    },
    {
      id: 'as-tour-2',
      order: 2,
      title: 'Strict v1 vs v1beta Client Pool Isolation',
      visualHook: 'clientPool.ts is the highest-centrality infrastructure hub (0.97), sharding dual keys across API versions.',
      explanation: 'Separating getV1Client() (Gemini 4 + Live) from getV1BetaClient() (Decision-1 + Nano Banana 2.1) keeps SDK calls clean and quota-resilient.',
      focusNodeId: 'as-client-pool',
      highlightNodeIds: ['as-client-pool', 'as-design-synth', 'as-media-gen', 'as-aesthetic-judge', 'as-live-relay'],
      filePath: 'backend/src/gemini/clientPool.ts',
      lineStart: 12,
      lineEnd: 24,
      recommendedLens: 'strata3d',
    },
    {
      id: 'as-tour-3',
      order: 3,
      title: 'Calibrated Decision-1 Probes vs Free-Text Critique',
      visualHook: 'aestheticJudge.ts computes 5 independent calibrated probabilities instead of noisy LLM star ratings.',
      explanation: 'Each pillar probe runs on gemini-decision-1 with shardHint alternation, producing reproducible 0..100 AntiSlop scores.',
      focusNodeId: 'as-aesthetic-judge',
      highlightNodeIds: ['as-aesthetic-judge', 'as-critique-heatmap'],
      filePath: 'backend/src/gemini/aestheticJudge.ts',
      lineStart: 12,
      lineEnd: 33,
      recommendedLens: 'flows',
    },
    {
      id: 'as-tour-4',
      order: 4,
      title: 'Balanced Token Budget Across Studio & Backend',
      visualHook: 'No monolithic god-files — every core engine stays cleanly between 2.3k and 4.4k tokens.',
      explanation: 'The Token Treemap highlights disciplined modularity between React UI components, Express routes, and Gemini adapters.',
      focusNodeId: 'as-live-relay',
      highlightNodeIds: ['as-live-relay', 'as-aesthetic-judge', 'as-design-synth'],
      filePath: 'backend/src/live/voiceDirectorRelay.ts',
      lineStart: 4,
      lineEnd: 31,
      recommendedLens: 'treemap',
    },
    {
      id: 'as-tour-5',
      order: 5,
      title: 'Decision-1 X-Ray Finding: JSON.parse Guard & WS Error Handling',
      visualHook: 'designSynthesizer.ts and voiceDirectorRelay.ts flag resilience probes for malformed model JSON and WS frames.',
      explanation: 'Adding Zod validation around parsed model JSON and try/catch around WebSocket JSON.parse hardens production stability.',
      focusNodeId: 'as-design-synth',
      highlightNodeIds: ['as-design-synth', 'as-live-relay'],
      filePath: 'backend/src/gemini/designSynthesizer.ts',
      lineStart: 14,
      lineEnd: 24,
      recommendedLens: 'xray',
    },
  ],
  diagrams: [
    {
      id: 'as-diag-arch',
      kind: 'architecture',
      title: 'AntiSlop Multimodal Gemini 4 Studio Architecture',
      subtitle: 'Click any node to inspect its TypeScript source',
      code: `flowchart LR
  Page["Studio Shell<br/>studio/src/app/page.tsx"] --> Canvas["Design Canvas<br/>DesignCanvas.tsx"]
  Page --> Heat["Critique Heatmap<br/>CritiqueHeatmap.tsx"]
  Page --> Voice["Live Voice Bar<br/>LiveDirectorBar.tsx"]
  Page -->|POST /synthesize| Server["Express 5 Host<br/>backend/src/server.ts"]
  Voice -->|WS /ws/live-director| Server
  Server --> Router["Studio Router<br/>routes/studio.ts"]
  Server --> Relay["3.8 Live Relay<br/>voiceDirectorRelay.ts"]
  Router --> Synth["Gemini 4 Carbon<br/>designSynthesizer.ts"]
  Router --> Media["Nano Banana + TTS<br/>mediaGenerator.ts"]
  Router --> Judge["Decision-1 Judge<br/>aestheticJudge.ts"]
  Synth --> Pool["Dual-Key Pool<br/>clientPool.ts"]
  Media --> Pool
  Judge --> Pool
  Relay --> Pool`,
      nodeFileMap: {
        Page: 'studio/src/app/page.tsx',
        Canvas: 'studio/src/components/DesignCanvas.tsx',
        Heat: 'studio/src/components/CritiqueHeatmap.tsx',
        Voice: 'studio/src/components/LiveDirectorBar.tsx',
        Server: 'backend/src/server.ts',
        Router: 'backend/src/routes/studio.ts',
        Relay: 'backend/src/live/voiceDirectorRelay.ts',
        Synth: 'backend/src/gemini/designSynthesizer.ts',
        Media: 'backend/src/gemini/mediaGenerator.ts',
        Judge: 'backend/src/gemini/aestheticJudge.ts',
        Pool: 'backend/src/gemini/clientPool.ts',
      },
      modelUsed: 'gemini-4-neon',
      generatedAt: GENERATED_AT,
    },
    {
      id: 'as-diag-seq',
      kind: 'sequence',
      title: 'Multimodal Synthesis & Parallel AntiSlop Audit Sequence',
      subtitle: 'Concurrent Nano Banana 2.1 rendering and Decision-1 5-pillar scoring',
      code: `sequenceDiagram
  participant UI as AntiSlop Studio UI
  participant API as Express /api/studio/synthesize
  participant Carbon as Gemini 4 Carbon (v1)
  participant Banana as Nano Banana 2.1 (v1beta)
  participant Judge as Decision-1 (v1beta)
  UI->>API: POST { prompt }
  API->>Carbon: interactions.create(thinking_level=medium)
  Carbon-->>API: DesignBlueprintDraft + imagePrompt
  par Hero Mockup Render
    API->>Banana: interactions.create(modalities=IMAGE)
    Banana-->>API: base64 PNG mockup
  and 5-Pillar AntiSlop Audit
    API->>Judge: 5x sharded decisions.create()
    Judge-->>API: calibrated AntiSlopCritique (93/100)
  end
  API-->>UI: DesignArtifact { tokens, heroImageUrl, critique }`,
      nodeFileMap: {
        UI: 'studio/src/app/page.tsx',
        API: 'backend/src/routes/studio.ts',
        Carbon: 'backend/src/gemini/designSynthesizer.ts',
        Banana: 'backend/src/gemini/mediaGenerator.ts',
        Judge: 'backend/src/gemini/aestheticJudge.ts',
      },
      modelUsed: 'gemini-4-neon',
      generatedAt: GENERATED_AT,
    },
  ],
  xraySpecs: [
    {
      nodeId: 'as-studio-page',
      scores: { modularity: 0.91, security: 0.90, resilience: 0.84, testability: 0.85, api_clarity: 0.92, concurrency: 0.89, scalability: 0.90, hygiene: 0.93, onboarding: 0.94 },
      topFinding: 'Clean client shell adhering strictly to Obsidian Cobalt CSS tokens; check res.ok before parsing synthesize JSON.',
    },
    {
      nodeId: 'as-design-canvas',
      scores: { modularity: 0.94, security: 0.93, resilience: 0.92, testability: 0.91, api_clarity: 0.94, concurrency: 0.96, scalability: 0.92, hygiene: 0.95, onboarding: 0.96 },
      topFinding: 'Crisp dual-theme visual stage with safe empty-state framing and semantic token chip rendering.',
    },
    {
      nodeId: 'as-critique-heatmap',
      scores: { modularity: 0.95, security: 0.96, resilience: 0.94, testability: 0.94, api_clarity: 0.95, concurrency: 0.97, scalability: 0.93, hygiene: 0.96, onboarding: 0.96 },
      topFinding: 'Exemplary presentation of calibrated Decision-1 probabilities using accessible semantic status bands.',
    },
    {
      nodeId: 'as-voice-bar',
      scores: { modularity: 0.87, security: 0.86, resilience: 0.78, testability: 0.80, api_clarity: 0.89, concurrency: 0.84, scalability: 0.87, hygiene: 0.89, onboarding: 0.90 },
      topFinding: 'Guard ws.onmessage JSON.parse with try/catch and close active WebSockets inside a React unmount cleanup effect.',
    },
    {
      nodeId: 'as-express-server',
      scores: { modularity: 0.93, security: 0.91, resilience: 0.89, testability: 0.88, api_clarity: 0.94, concurrency: 0.91, scalability: 0.90, hygiene: 0.93, onboarding: 0.95 },
      topFinding: 'Origin-scoped CORS and explicit 4mb JSON body cap; add a global Express error handler middleware for typed 5xx responses.',
    },
    {
      nodeId: 'as-studio-router',
      scores: { modularity: 0.92, security: 0.89, resilience: 0.87, testability: 0.90, api_clarity: 0.94, concurrency: 0.93, scalability: 0.88, hygiene: 0.92, onboarding: 0.94 },
      topFinding: 'Parallel Promise.all fan-out cuts synthesis latency sharply; consider Promise.allSettled so image failure still returns critique.',
    },
    {
      nodeId: 'as-design-synth',
      scores: { modularity: 0.90, security: 0.89, resilience: 0.76, testability: 0.84, api_clarity: 0.91, concurrency: 0.90, scalability: 0.89, hygiene: 0.91, onboarding: 0.92 },
      flag: { resilience: 'Wrap JSON.parse(rawText) in a structured fallback/retry guard in case model output includes prose outside fences.' },
      topFinding: 'Properly uses Gemini 4 interactions.create with thinking_level; add safe JSON extraction + schema validation.',
    },
    {
      nodeId: 'as-media-gen',
      scores: { modularity: 0.91, security: 0.92, resilience: 0.88, testability: 0.86, api_clarity: 0.91, concurrency: 0.89, scalability: 0.86, hygiene: 0.92, onboarding: 0.93 },
      topFinding: 'Graceful fallback to static Obsidian Cobalt blueprint asset if image bytes are absent.',
    },
    {
      nodeId: 'as-live-relay',
      scores: { modularity: 0.86, security: 0.83, resilience: 0.75, testability: 0.77, api_clarity: 0.88, concurrency: 0.86, scalability: 0.82, hygiene: 0.88, onboarding: 0.89 },
      flag: { resilience: 'Wrap socket.on("message") JSON.parse and upstream ai.live.connect errors in try/catch to prevent unhandled rejections.' },
      topFinding: 'Clean NON_BLOCKING Live API tool integration; add error boundary and idle session timeout cleanup.',
    },
    {
      nodeId: 'as-aesthetic-judge',
      scores: { modularity: 0.94, security: 0.94, resilience: 0.91, testability: 0.93, api_clarity: 0.95, concurrency: 0.95, scalability: 0.92, hygiene: 0.95, onboarding: 0.95 },
      topFinding: 'Dual-key sharded Decision-1 probes run cleanly in parallel with zero blocking overhead.',
    },
    {
      nodeId: 'as-client-pool',
      scores: { modularity: 0.95, security: 0.93, resilience: 0.90, testability: 0.92, api_clarity: 0.96, concurrency: 0.94, scalability: 0.93, hygiene: 0.96, onboarding: 0.97 },
      topFinding: 'Cache GoogleGenAI client instances per (apiKey, apiVersion) pair instead of instantiating a new client on every request.',
    },
  ],
  xrayOptions: {
    latencyMs: 590,
    recommendedModelTier: 'gemini-4-neon',
    routingRationale: 'High architectural modularity (91/100) and clean contract boundaries — gemini-4-neon handles interactive follow-ups swiftly.',
  },
  totalRepoFiles: 52,
  ingestLatencyMs: 780,
  aiSynthesisLatencyMs: 2210,
  modelsUsed: ['gemini-4-carbon', 'gemini-4-neon', 'gemini-decision-1', 'gemini-nano-banana-2.1', 'gemini-3.8-live'],
});

// =============================================================================
// Public Showcase Registry & Lookup Helpers
// =============================================================================

export const SHOWCASE_REPOS: ShowcaseRepoEntry[] = [
  {
    slug: 'coderamp-labs/gitingest',
    title: 'GitIngest',
    subtitle: 'Python/FastAPI repo-to-LLM prompt digest & sparse-clone engine',
    badge: 'Python • FastAPI',
    stars: 14820,
    language: 'Python',
    blueprint: GITINGEST_BLUEPRINT,
  },
  {
    slug: 'ahmedkhaleel2004/gitdiagram',
    title: 'GitDiagram',
    subtitle: 'Next.js + FastAPI 3-pass clickable Mermaid & animated video engine',
    badge: 'Next.js • FastAPI',
    stars: 16490,
    language: 'TypeScript',
    blueprint: GITDIAGRAM_BLUEPRINT,
  },
  {
    slug: 'AsyncFuncAI/deepwiki-open',
    title: 'DeepWiki Open',
    subtitle: 'Next.js + Python WebSocket RAG wiki & DeepResearch codemap generator',
    badge: 'Next.js • RAG',
    stars: 11940,
    language: 'TypeScript',
    blueprint: DEEPWIKI_BLUEPRINT,
  },
  {
    slug: 'REDFOX1899/antislop',
    title: 'AntiSlop Studio',
    subtitle: 'Next.js 15 + Express 5 + Gemini 4 & Decision-1 multimodal design studio',
    badge: 'Gemini 4 • Live',
    stars: 4280,
    language: 'TypeScript',
    blueprint: ANTISLOP_BLUEPRINT,
  },
];

function normalizeLookupKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?(github|git-understand|gitingest|gitdiagram)\.(com|org)\//, '')
    .replace(/\.git$/, '')
    .replace(/\/(tree|blob)\/.*$/, '')
    .replace(/\/+$/, '');
}

export function getShowcaseBlueprint(slugOrId: string): VisualAtlasBlueprint | null {
  if (!slugOrId || !slugOrId.trim()) return null;

  const rawLower = slugOrId.trim().toLowerCase();
  const normalized = normalizeLookupKey(slugOrId);

  for (const entry of SHOWCASE_REPOS) {
    const slugLower = entry.slug.toLowerCase();
    const repoIdLower = entry.blueprint.repoId.toLowerCase();
    const repoNameLower = entry.blueprint.metadata.name.toLowerCase();
    const slugAsDoubleUnderscore = slugLower.replace('/', '__');

    if (
      rawLower === slugLower ||
      rawLower === repoIdLower ||
      rawLower === repoNameLower ||
      normalized === slugLower ||
      normalized === repoIdLower ||
      normalized === repoNameLower ||
      normalized.startsWith(`${slugAsDoubleUnderscore}__`)
    ) {
      return structuredClone(entry.blueprint);
    }
  }

  return null;
}

export function listShowcaseSummaries(): ShowcaseRepoSummary[] {
  return SHOWCASE_REPOS.map((entry) => ({
    repoId: entry.blueprint.repoId,
    slug: entry.slug,
    title: entry.title,
    subtitle: entry.subtitle,
    badge: entry.badge,
    stars: entry.stars,
    language: entry.language,
    architecturePattern: entry.blueprint.architecturePattern,
    nodeCount: entry.blueprint.nodes.length,
    tokenCount: entry.blueprint.stats.totalTokens,
  }));
}
