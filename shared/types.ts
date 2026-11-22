// =============================================================================
// GitUnderstand (git-understand.com) — Canonical Shared Contracts
// Single source of truth across backend/, studio/, and tests/
// =============================================================================

export type VisualLensId =
  | 'atlas'
  | 'strata3d'
  | 'flows'
  | 'treemap'
  | 'xray'
  | 'mermaid'
  | 'media';

export type ArchitectureLayer =
  | 'client'
  | 'edge'
  | 'orchestration'
  | 'domain'
  | 'infrastructure'
  | 'data'
  | 'tooling';

export type XRayPillarId =
  | 'modularity'
  | 'security'
  | 'resilience'
  | 'testability'
  | 'api_clarity'
  | 'concurrency'
  | 'scalability'
  | 'hygiene'
  | 'onboarding';

export type AdaptiveModelTier =
  | 'gemini-4-argon'
  | 'gemini-4-neon'
  | 'gemini-4-carbon'
  | 'gemini-4-hydrogen';

export interface ParsedGitHubRef {
  owner: string;
  repo: string;
  branch?: string;
  subpath?: string;
  rawInput: string;
  canonicalSlug: string; // "owner/repo"
  htmlUrl: string;
  isMarkdownRequest?: boolean;
}

export interface RepoMetadata {
  id: string; // e.g. "owner__repo__branch"
  owner: string;
  name: string;
  fullName: string;
  description: string;
  defaultBranch: string;
  branch: string;
  stars: number;
  forks: number;
  openIssues: number;
  primaryLanguage: string;
  languages: Record<string, number>;
  topics: string[];
  license?: string;
  htmlUrl: string;
  homepage?: string;
  updatedAt: string;
  isPrivate: boolean;
  isShowcase?: boolean;
}

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'route' | 'component' | 'method' | 'module';
  line: number;
  endLine?: number;
  exported: boolean;
  signature?: string;
}

export interface RepoFileRecord {
  path: string;
  name: string;
  directory: string;
  extension: string;
  language: string;
  sizeBytes: number;
  lineCount: number;
  estimatedTokens: number;
  sha?: string;
  content?: string;
  imports: string[];
  resolvedImports: string[];
  exports: string[];
  symbols: CodeSymbol[];
  layer: ArchitectureLayer;
  centrality: number; // 0..1 normalized importance
  fanIn: number;
  fanOut: number;
  isEntrypoint: boolean;
  isTest: boolean;
  isConfig: boolean;
}

export interface DependencyEdge {
  id: string;
  source: string; // node/file id
  target: string; // node/file id
  kind: 'import' | 'call' | 'data_flow' | 'event' | 'http' | 'storage' | 'inherits';
  label?: string;
  weight: number;
  isCircular?: boolean;
}

export interface SubsystemCluster {
  id: string;
  name: string;
  tagline: string;
  layer: ArchitectureLayer;
  color: string; // Hex from Obsidian Cobalt / Semantic palette
  nodeIds: string[];
  filePaths: string[];
  entrypointPaths: string[];
  totalTokens: number;
  summaryBullets: string[];
  invariants: string[];
  healthScore?: number; // 0..100 from Decision-1 X-Ray
}

export interface AtlasNode {
  id: string;
  label: string;
  subtitle: string;
  subsystemId: string;
  layer: ArchitectureLayer;
  kind: 'service' | 'module' | 'ui' | 'api' | 'store' | 'agent' | 'pipeline' | 'external' | 'config';
  filePaths: string[];
  primaryFile: string;
  lineStart?: number;
  lineEnd?: number;
  estimatedTokens: number;
  centrality: number; // 0..1
  fanIn: number;
  fanOut: number;
  keySymbols: string[];
  visualBrief: string; // Crisp 1-2 sentence visual summary
  inputs: string[];
  outputs: string[];
  riskScore?: number; // 0..1 from Decision-1
  x?: number;
  y?: number;
}

export interface AtlasEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: 'data' | 'control' | 'http' | 'stream' | 'storage' | 'dependency';
  protocol?: string;
  weight: number;
  isHotPath?: boolean;
}

export interface StratumLayer {
  layer: ArchitectureLayer;
  title: string;
  description: string;
  elevation: number; // 0..6 for 3D stacking
  accentColor: string;
  nodeIds: string[];
  fileCount: number;
  tokenCount: number;
}

export interface ExecutionFlowStep {
  stepNumber: number;
  title: string;
  action: string;
  fromNodeId: string;
  toNodeId: string;
  edgeLabel: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  codeExcerpt?: string;
  dataPayload?: string;
}

export interface ExecutionFlow {
  id: string;
  title: string;
  subtitle: string;
  trigger: string;
  category: 'request' | 'ingestion' | 'ai_pipeline' | 'auth' | 'state' | 'build';
  steps: ExecutionFlowStep[];
}

export interface CodemapTourStop {
  id: string;
  order: number;
  title: string;
  visualHook: string;
  explanation: string;
  focusNodeId: string;
  highlightNodeIds: string[];
  filePath: string;
  lineStart: number;
  lineEnd: number;
  recommendedLens: VisualLensId;
}

export interface MermaidDiagramSpec {
  id: string;
  kind: 'architecture' | 'sequence' | 'class' | 'er' | 'custom';
  title: string;
  subtitle: string;
  code: string;
  nodeFileMap: Record<string, string>; // Mermaid node ID -> repo file path
  repaired?: boolean;
  modelUsed: string;
  generatedAt: string;
}

export interface TreemapNode {
  id: string;
  name: string;
  path: string;
  kind: 'dir' | 'file';
  tokens: number;
  bytes: number;
  fileCount: number;
  language?: string;
  layer?: ArchitectureLayer;
  riskScore?: number;
  children?: TreemapNode[];
}

export interface DigestFilterOptions {
  includePatterns: string[];
  excludePatterns: string[];
  maxFileSizeBytes: number;
  maxTotalTokens: number;
  includeTests: boolean;
  includeDocs: boolean;
  includeTreeHeader: boolean;
  selectedSubsystems?: string[];
}

export interface CompiledDigest {
  repoSlug: string;
  branch: string;
  summaryHeader: string;
  treeText: string;
  digestText: string;
  includedFiles: number;
  excludedFiles: number;
  totalTokens: number;
  totalBytes: number;
  budgetTarget: number;
  budgetUtilization: number; // 0..1+
  truncated: boolean;
}

export interface XRayCellScore {
  pillar: XRayPillarId;
  probabilityHealthy: number; // 0..1 calibrated P(healthy)
  confidence: number; // 0..1
  entropy: number; // 0..1 Shannon entropy
  flagSummary?: string;
}

export interface XRayModuleAudit {
  nodeId: string;
  label: string;
  primaryFile: string;
  layer: ArchitectureLayer;
  overallHealth: number; // 0..100
  blastRadius: number; // 0..1 based on fanIn & centrality
  cells: Record<XRayPillarId, XRayCellScore>;
  topFinding: string;
}

export interface XRayMatrixReport {
  model: string;
  totalProbes: number;
  dualKeySharded: boolean;
  latencyMs: number;
  overallScore: number; // 0..100
  meanEntropy: number;
  recommendedModelTier: AdaptiveModelTier;
  routingRationale: string;
  pillarAverages: Record<XRayPillarId, number>; // 0..100
  modules: XRayModuleAudit[];
  generatedAt: string;
}

export interface MediaPosterArtifact {
  id: string;
  title: string;
  style: 'cobalt_blueprint' | 'isometric_cutaway' | 'editorial_diagram';
  prompt: string;
  imageUrl: string;
  mimeType: string;
  model: string;
  generatedAt: string;
}

export interface AudioTourCue {
  turnIndex: number;
  speaker: 'Architect' | 'Explorer';
  text: string;
  focusNodeId?: string;
  filePath?: string;
  approxStartSec: number;
  approxDurationSec: number;
}

export interface AudioTourArtifact {
  id: string;
  title: string;
  audioUrl: string;
  mimeType: string;
  durationSec: number;
  model: string;
  cues: AudioTourCue[];
  generatedAt: string;
}

export interface VideoReelArtifact {
  id: string;
  title: string;
  status: 'completed' | 'fallback_storyboard' | 'failed';
  videoUrl?: string;
  posterUrl?: string;
  durationSec: number;
  resolution: string;
  model: string;
  storyboardFrames?: Array<{
    timecode: string;
    caption: string;
    focusNodeId?: string;
  }>;
  note?: string;
  generatedAt: string;
}

export interface CircleAnnotationPoint {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface CircleExplainRequest {
  repoId: string;
  canvasSnapshotBase64?: string;
  selectedNodeIds: string[];
  question?: string;
  strokeBounds?: { x: number; y: number; width: number; height: number };
}

export interface CircleExplainResponse {
  headline: string;
  visualSummary: string;
  dataFlowNarrative: string;
  keyContracts: string[];
  potentialRisks: string[];
  referencedFiles: Array<{ path: string; lineStart?: number; reason: string }>;
  model: string;
  latencyMs: number;
}

export interface VisualSearchMatch {
  nodeId: string;
  filePath: string;
  label: string;
  similarity: number; // 0..1
  reason: string;
}

export interface OracleCitation {
  nodeId?: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  label: string;
}

export interface OracleMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imagePreviewUrl?: string;
  citations: OracleCitation[];
  interactionId?: string;
  model?: string;
  timestamp: string;
}

export interface ForensicsReport {
  id: string;
  agent: string;
  status: 'completed' | 'running' | 'failed' | 'unavailable';
  summary: string;
  findings: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    title: string;
    evidence: string;
    filePath?: string;
    recommendation: string;
  }>;
  environmentId?: string;
  generatedAt: string;
}

export interface PipelineProgressEvent {
  repoId: string;
  stage:
    | 'queued'
    | 'fetching'
    | 'ast_graph'
    | 'treemap'
    | 'architect'
    | 'diagrams'
    | 'flows'
    | 'xray'
    | 'embeddings'
    | 'ready'
    | 'error';
  percent: number;
  message: string;
  model?: string;
  timestamp: string;
}

export interface VisualAtlasBlueprint {
  repoId: string;
  metadata: RepoMetadata;
  headline: string;
  oneLiner: string;
  architecturePattern: string; // e.g. "Hybrid Edge Next.js + Cloud Run AI Engine"
  techStackBadges: string[];
  files: RepoFileRecord[];
  dependencyEdges: DependencyEdge[];
  subsystems: SubsystemCluster[];
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  strata: StratumLayer[];
  flows: ExecutionFlow[];
  codemapTour: CodemapTourStop[];
  diagrams: MermaidDiagramSpec[];
  treemap: TreemapNode;
  xray?: XRayMatrixReport;
  posters: MediaPosterArtifact[];
  audioTours: AudioTourArtifact[];
  videoReels: VideoReelArtifact[];
  stats: {
    totalFiles: number;
    analyzedFiles: number;
    totalLines: number;
    totalTokens: number;
    totalBytes: number;
    circularDeps: number;
    avgFanOut: number;
    ingestLatencyMs: number;
    aiSynthesisLatencyMs?: number;
  };
  aiEnriched: boolean;
  modelsUsed: string[];
  generatedAt: string;
}

export interface LiveVoiceToolAction {
  tool: 'focus_node' | 'trace_execution_flow' | 'toggle_xray_overlay' | 'slice_digest_context' | 'switch_lens';
  args: Record<string, unknown>;
  callId?: string;
}

export interface BackendHealthStatus {
  ok: boolean;
  service: string;
  version: string;
  domain: string;
  gemini: {
    primaryConfigured: boolean;
    secondaryConfigured: boolean;
    totalCalls: number;
    models: {
      architect: string;
      visual: string;
      fast: string;
      oracle: string;
      decisions: string;
      live: string;
      image: string;
      tts: string;
      video: string;
      embedding: string;
      transcribe: string;
    };
  };
  githubTokenConfigured: boolean;
  cachedRepos: number;
}
