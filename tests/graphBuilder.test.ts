import { describe, it, expect } from 'vitest';
import {
  classifyArchitectureLayer,
  resolveImportToFile,
  buildDeterministicAtlas,
  type DeterministicAtlasResult,
} from '../backend/src/ingest/graphBuilder.js';
import type {
  ArchitectureLayer,
  RepoFileRecord,
  RepoMetadata,
} from '../shared/types.js';

// =============================================================================
// Test Fixture Helpers
// =============================================================================

function createMockMetadata(overrides: Partial<RepoMetadata> = {}): RepoMetadata {
  return {
    id: 'deepmind__gitunderstand__main',
    owner: 'deepmind',
    name: 'gitunderstand',
    fullName: 'deepmind/gitunderstand',
    description: 'Deterministic repository dependency graph and visual atlas generator',
    defaultBranch: 'main',
    branch: 'main',
    stars: 1042,
    forks: 88,
    openIssues: 5,
    primaryLanguage: 'TypeScript',
    languages: { TypeScript: 120000, Python: 30000 },
    topics: ['code-intelligence', 'ast', 'visualization', 'gemini-api'],
    htmlUrl: 'https://github.com/deepmind/gitunderstand',
    updatedAt: '2026-11-22T02:00:00Z',
    isPrivate: false,
    ...overrides,
  };
}

function createMockFile(overrides: Partial<RepoFileRecord> & { path: string }): RepoFileRecord {
  const normPath = overrides.path.replace(/\\/g, '/');
  const name = normPath.split('/').pop() || 'file.ts';
  const dotIndex = name.lastIndexOf('.');
  const ext = dotIndex >= 0 ? name.slice(dotIndex) : '';
  const dir = normPath.includes('/') ? normPath.slice(0, normPath.lastIndexOf('/')) : '';

  return {
    path: normPath,
    name,
    directory: dir,
    extension: ext,
    language:
      overrides.language ||
      (ext === '.ts' || ext === '.tsx'
        ? 'TypeScript'
        : ext === '.py'
        ? 'Python'
        : ext === '.go'
        ? 'Go'
        : ext === '.rs'
        ? 'Rust'
        : 'JavaScript'),
    sizeBytes: overrides.sizeBytes ?? 1024,
    lineCount: overrides.lineCount ?? 60,
    estimatedTokens: overrides.estimatedTokens ?? 250,
    imports: overrides.imports ?? [],
    resolvedImports: overrides.resolvedImports ?? [],
    exports: overrides.exports ?? [],
    symbols: overrides.symbols ?? [],
    layer: overrides.layer ?? 'domain',
    centrality: overrides.centrality ?? 0,
    fanIn: overrides.fanIn ?? 0,
    fanOut: overrides.fanOut ?? 0,
    isEntrypoint: overrides.isEntrypoint ?? false,
    isTest: overrides.isTest ?? false,
    isConfig: overrides.isConfig ?? false,
    content: overrides.content ?? '',
    ...overrides,
  };
}

// =============================================================================
// 1. Architecture Layer Classification Tests
// =============================================================================

describe('Architecture Layer Classifier (classifyArchitectureLayer)', () => {
  it('classifies UI and client files correctly', () => {
    expect(classifyArchitectureLayer('studio/src/components/Atlas.tsx', '', 'TypeScript')).toBe('client');
    expect(classifyArchitectureLayer('studio/src/pages/index.tsx', '', 'TypeScript')).toBe('client');
    expect(classifyArchitectureLayer('src/views/DashboardView.vue', '', 'Vue')).toBe('client');
    expect(classifyArchitectureLayer('frontend/components/Nav.jsx', '', 'JavaScript')).toBe('client');
    expect(classifyArchitectureLayer('studio/src/styles/theme.css', '', 'CSS')).toBe('client');
    expect(
      classifyArchitectureLayer(
        'src/components/StatefulWidget.ts',
        "'use client';\nexport function Widget() { const [s, setS] = useState(0); }",
        'TypeScript'
      )
    ).toBe('client');
  });

  it('classifies edge, gateway, and route entrypoints correctly', () => {
    expect(classifyArchitectureLayer('studio/src/app/api/repo/route.ts', '', 'TypeScript')).toBe('edge');
    expect(classifyArchitectureLayer('backend/src/routes/ingest.ts', '', 'TypeScript')).toBe('edge');
    expect(classifyArchitectureLayer('backend/src/controllers/authController.ts', '', 'TypeScript')).toBe('edge');
    expect(classifyArchitectureLayer('server.ts', 'const app = express(); app.listen(3000);', 'TypeScript')).toBe(
      'edge'
    );
    expect(
      classifyArchitectureLayer('api/main.py', 'from fastapi import FastAPI\napp = FastAPI()', 'Python')
    ).toBe('edge');
  });

  it('classifies orchestration, pipelines, and AI engines correctly', () => {
    expect(classifyArchitectureLayer('backend/src/ingest/graphBuilder.ts', '', 'TypeScript')).toBe('orchestration');
    expect(classifyArchitectureLayer('backend/src/pipelines/synthesis.ts', '', 'TypeScript')).toBe('orchestration');
    expect(classifyArchitectureLayer('backend/src/workers/jobQueue.ts', '', 'TypeScript')).toBe('orchestration');
    expect(
      classifyArchitectureLayer(
        'backend/src/ai/agent.ts',
        "import { GoogleGenAI } from '@google/genai';\nconst ai = new GoogleGenAI();",
        'TypeScript'
      )
    ).toBe('orchestration');
  });

  it('classifies core domain and contracts correctly', () => {
    expect(classifyArchitectureLayer('shared/types.ts', 'export interface RepoMetadata {}', 'TypeScript')).toBe('domain');
    expect(classifyArchitectureLayer('backend/src/domain/rules.ts', '', 'TypeScript')).toBe('domain');
    expect(classifyArchitectureLayer('backend/src/parsers/astParser.ts', '', 'TypeScript')).toBe('domain');
    expect(classifyArchitectureLayer('backend/src/engine/calculator.ts', '', 'TypeScript')).toBe('domain');
  });

  it('classifies infrastructure, env, and adapters correctly', () => {
    expect(classifyArchitectureLayer('backend/src/config/env.ts', '', 'TypeScript')).toBe('infrastructure');
    expect(classifyArchitectureLayer('backend/src/telemetry/otel.ts', '', 'TypeScript')).toBe('infrastructure');
    expect(classifyArchitectureLayer('Dockerfile', 'FROM node:20-alpine', 'Dockerfile')).toBe('infrastructure');
    expect(classifyArchitectureLayer('docker-compose.yml', 'version: "3.8"', 'YAML')).toBe('infrastructure');
    expect(classifyArchitectureLayer('infra/terraform/main.tf', '', 'Terraform')).toBe('infrastructure');
  });

  it('classifies data, database schemas, and stores correctly', () => {
    expect(classifyArchitectureLayer('backend/src/db/schema.prisma', '', 'Prisma')).toBe('data');
    expect(classifyArchitectureLayer('backend/src/repositories/userRepo.ts', '', 'TypeScript')).toBe('data');
    expect(classifyArchitectureLayer('backend/src/models/entities.ts', '', 'TypeScript')).toBe('data');
    expect(classifyArchitectureLayer('db/migrations/0001_init.sql', 'CREATE TABLE users (id INT);', 'SQL')).toBe(
      'data'
    );
  });

  it('classifies tooling, tests, and configuration correctly', () => {
    expect(classifyArchitectureLayer('tests/graphBuilder.test.ts', '', 'TypeScript')).toBe('tooling');
    expect(classifyArchitectureLayer('backend/src/__tests__/utils.spec.ts', '', 'TypeScript')).toBe('tooling');
    expect(classifyArchitectureLayer('package.json', '{}', 'JSON')).toBe('tooling');
    expect(classifyArchitectureLayer('tsconfig.json', '{}', 'JSON')).toBe('tooling');
    expect(classifyArchitectureLayer('vitest.config.ts', 'export default {}', 'TypeScript')).toBe('tooling');
    expect(classifyArchitectureLayer('README.md', '# GitUnderstand', 'Markdown')).toBe('tooling');
  });
});

// =============================================================================
// 2. Multi-Language Import Resolution Tests (resolveImportToFile)
// =============================================================================

describe('Import Resolution (resolveImportToFile)', () => {
  const filePathSet = new Set([
    'backend/src/index.ts',
    'backend/src/ingest/graphBuilder.ts',
    'backend/src/ingest/astParser.ts',
    'backend/src/utils/logger.ts',
    'backend/src/utils/math.ts',
    'backend/src/services/auth/index.ts',
    'backend/src/services/auth/session.ts',
    'shared/types.ts',
    'shared/contracts/api.ts',
    'studio/src/components/Atlas.tsx',
    'studio/src/components/Card/index.tsx',
    'studio/src/lib/api.ts',
    'python_app/main.py',
    'python_app/services/worker.py',
    'python_app/utils/__init__.py',
    'python_app/utils/formatting.py',
    'rust_app/src/main.rs',
    'rust_app/src/parser/ast.rs',
    'rust_app/src/parser/mod.rs',
    'go_app/main.go',
    'go_app/internal/auth/auth.go',
  ]);

  it('resolves direct relative TypeScript imports with exact and omitted extensions', () => {
    const importer = 'backend/src/ingest/graphBuilder.ts';

    // Same directory with extension
    expect(resolveImportToFile(importer, './astParser.ts', filePathSet)).toBe('backend/src/ingest/astParser.ts');

    // Same directory extensionless
    expect(resolveImportToFile(importer, './astParser', filePathSet)).toBe('backend/src/ingest/astParser.ts');

    // Parent directory traversal
    expect(resolveImportToFile(importer, '../utils/logger', filePathSet)).toBe('backend/src/utils/logger.ts');
  });

  it('resolves NodeNext ESM .js extension swaps to .ts and .tsx', () => {
    const importer = 'backend/src/index.ts';

    // In TypeScript NodeNext, importing './utils/logger.js' targets 'logger.ts'
    expect(resolveImportToFile(importer, './utils/logger.js', filePathSet)).toBe('backend/src/utils/logger.ts');
    expect(resolveImportToFile(importer, './ingest/graphBuilder.js', filePathSet)).toBe(
      'backend/src/ingest/graphBuilder.ts'
    );
  });

  it('resolves directory barrel imports (index.ts / index.tsx)', () => {
    const importer = 'backend/src/index.ts';
    expect(resolveImportToFile(importer, './services/auth', filePathSet)).toBe('backend/src/services/auth/index.ts');

    const studioImporter = 'studio/src/lib/api.ts';
    expect(resolveImportToFile(studioImporter, '../components/Card', filePathSet)).toBe(
      'studio/src/components/Card/index.tsx'
    );
  });

  it('resolves @/ and @shared/ path alias imports', () => {
    // Studio alias @/ pointing to studio/src/
    const studioImporter = 'studio/src/lib/api.ts';
    expect(resolveImportToFile(studioImporter, '@/components/Atlas', filePathSet)).toBe(
      'studio/src/components/Atlas.tsx'
    );

    // Scoped package alias @shared/types
    const backendImporter = 'backend/src/ingest/graphBuilder.ts';
    expect(resolveImportToFile(backendImporter, '@shared/types', filePathSet)).toBe('shared/types.ts');
    expect(resolveImportToFile(backendImporter, '@shared/contracts/api', filePathSet)).toBe(
      'shared/contracts/api.ts'
    );
  });

  it('resolves Python relative and absolute dotted imports', () => {
    const pyImporter = 'python_app/services/worker.py';

    // Relative dotted import .formatting (sibling or parent package)
    expect(resolveImportToFile(pyImporter, '..utils.formatting', filePathSet)).toBe(
      'python_app/utils/formatting.py'
    );

    // Absolute module import
    expect(resolveImportToFile(pyImporter, 'python_app.utils.formatting', filePathSet)).toBe(
      'python_app/utils/formatting.py'
    );

    // Package __init__.py resolution
    expect(resolveImportToFile(pyImporter, '..utils', filePathSet)).toBe('python_app/utils/__init__.py');
  });

  it('resolves Rust crate:: and super:: module paths', () => {
    const rsImporter = 'rust_app/src/main.rs';
    expect(resolveImportToFile(rsImporter, 'crate::parser::ast', filePathSet)).toBe('rust_app/src/parser/ast.rs');

    const subImporter = 'rust_app/src/parser/ast.rs';
    expect(resolveImportToFile(subImporter, 'super::mod', filePathSet)).toBe('rust_app/src/parser/mod.rs');
  });

  it('resolves Go internal package imports', () => {
    const goImporter = 'go_app/main.go';
    expect(
      resolveImportToFile(goImporter, 'github.com/deepmind/gitunderstand/go_app/internal/auth', filePathSet)
    ).toBe('go_app/internal/auth/auth.go');
  });

  it('gracefully returns null for external packages, built-ins, and malformed specifiers', () => {
    const importer = 'backend/src/index.ts';
    expect(resolveImportToFile(importer, 'react', filePathSet)).toBeNull();
    expect(resolveImportToFile(importer, '@google/genai', filePathSet)).toBeNull();
    expect(resolveImportToFile(importer, 'node:path', filePathSet)).toBeNull();
    expect(resolveImportToFile(importer, 'https://cdn.esm.sh/lodash', filePathSet)).toBeNull();
    expect(resolveImportToFile(importer, '', filePathSet)).toBeNull();
  });
});

// =============================================================================
// 3. Centrality and PageRank Computation Tests
// =============================================================================

describe('Centrality & Structural Importance', () => {
  it('computes higher centrality for core dependency hubs with high fan-in', () => {
    const metadata = createMockMetadata();

    // A hub (shared/types.ts) imported by 4 upstream files
    const files: RepoFileRecord[] = [
      createMockFile({
        path: 'shared/types.ts',
        layer: 'domain',
        exports: ['RepoMetadata', 'AtlasNode', 'DependencyEdge'],
        symbols: [
          { name: 'RepoMetadata', kind: 'interface', line: 1, exported: true },
          { name: 'AtlasNode', kind: 'interface', line: 20, exported: true },
        ],
        imports: [],
      }),
      createMockFile({
        path: 'backend/src/ingest/graphBuilder.ts',
        layer: 'orchestration',
        imports: ['shared/types.ts'],
        isEntrypoint: true,
      }),
      createMockFile({
        path: 'backend/src/ingest/astParser.ts',
        layer: 'domain',
        imports: ['shared/types.ts'],
      }),
      createMockFile({
        path: 'studio/src/components/Atlas.tsx',
        layer: 'client',
        imports: ['shared/types.ts'],
      }),
      createMockFile({
        path: 'studio/src/lib/api.ts',
        layer: 'client',
        imports: ['shared/types.ts'],
      }),
    ];

    const result = buildDeterministicAtlas(metadata, files);

    const typesFile = result.files.find((f) => f.path === 'shared/types.ts');
    const leafFile = result.files.find((f) => f.path === 'studio/src/components/Atlas.tsx');

    expect(typesFile).toBeDefined();
    expect(leafFile).toBeDefined();

    // Hub must receive maximum in-degree and top PageRank score
    expect(typesFile!.fanIn).toBe(4);
    expect(typesFile!.fanOut).toBe(0);
    expect(typesFile!.centrality).toBeGreaterThan(leafFile!.centrality);
    expect(typesFile!.centrality).toBeGreaterThanOrEqual(0.7);

    // All centrality scores must stay clamped within [0, 1]
    for (const f of result.files) {
      expect(f.centrality).toBeGreaterThanOrEqual(0);
      expect(f.centrality).toBeLessThanOrEqual(1);
    }
  });

  it('handles disconnected repositories with robust fallback centrality scores', () => {
    const metadata = createMockMetadata();
    const files: RepoFileRecord[] = [
      createMockFile({
        path: 'src/main.ts',
        isEntrypoint: true,
        exports: ['run'],
        symbols: [{ name: 'run', kind: 'function', line: 5, exported: true }],
      }),
      createMockFile({
        path: 'src/secondary.ts',
        exports: ['helper'],
      }),
    ];

    const result = buildDeterministicAtlas(metadata, files);
    expect(result.files.length).toBe(2);

    const mainFile = result.files.find((f) => f.path === 'src/main.ts');
    const secFile = result.files.find((f) => f.path === 'src/secondary.ts');

    expect(mainFile!.centrality).toBeGreaterThan(0);
    expect(secFile!.centrality).toBeGreaterThan(0);
    // Entrypoint bonus should give main.ts a higher or equal score
    expect(mainFile!.centrality).toBeGreaterThanOrEqual(secFile!.centrality);
  });
});

// =============================================================================
// 4. Cycle Detection Tests (Tarjan SCC)
// =============================================================================

describe('Cycle Detection (Tarjan SCC)', () => {
  it('detects 2-node circular dependencies and marks circular edges', () => {
    const metadata = createMockMetadata();

    // A -> B and B -> A cycle
    const files: RepoFileRecord[] = [
      createMockFile({
        path: 'backend/src/serviceA.ts',
        imports: ['./serviceB.js'],
      }),
      createMockFile({
        path: 'backend/src/serviceB.ts',
        imports: ['./serviceA.js'],
      }),
      createMockFile({
        path: 'backend/src/independent.ts',
        imports: ['./serviceA.js'],
      }),
    ];

    const result = buildDeterministicAtlas(metadata, files);

    // 1 circular SCC detected between serviceA and serviceB
    expect(result.circularDeps).toBe(1);

    const edgeAB = result.dependencyEdges.find(
      (e) => e.source === 'backend/src/serviceA.ts' && e.target === 'backend/src/serviceB.ts'
    );
    const edgeBA = result.dependencyEdges.find(
      (e) => e.source === 'backend/src/serviceB.ts' && e.target === 'backend/src/serviceA.ts'
    );
    const edgeIndA = result.dependencyEdges.find(
      (e) => e.source === 'backend/src/independent.ts' && e.target === 'backend/src/serviceA.ts'
    );

    expect(edgeAB).toBeDefined();
    expect(edgeBA).toBeDefined();
    expect(edgeIndA).toBeDefined();

    expect(edgeAB!.isCircular).toBe(true);
    expect(edgeBA!.isCircular).toBe(true);
    // independent.ts -> serviceA.ts is not part of the cycle
    expect(edgeIndA!.isCircular).toBe(false);
  });

  it('detects 3-node multi-hop cycles (A -> B -> C -> A)', () => {
    const metadata = createMockMetadata();

    const files: RepoFileRecord[] = [
      createMockFile({ path: 'src/nodeA.ts', imports: ['./nodeB.js'] }),
      createMockFile({ path: 'src/nodeB.ts', imports: ['./nodeC.js'] }),
      createMockFile({ path: 'src/nodeC.ts', imports: ['./nodeA.js'] }),
      createMockFile({ path: 'src/leaf.ts', imports: ['./nodeC.js'] }),
    ];

    const result = buildDeterministicAtlas(metadata, files);

    expect(result.circularDeps).toBe(1);

    const edgeCA = result.dependencyEdges.find((e) => e.source === 'src/nodeC.ts' && e.target === 'src/nodeA.ts');
    const edgeLeafC = result.dependencyEdges.find((e) => e.source === 'src/leaf.ts' && e.target === 'src/nodeC.ts');

    expect(edgeCA!.isCircular).toBe(true);
    expect(edgeLeafC!.isCircular).toBe(false);
  });

  it('returns circularDeps = 0 for strict Directed Acyclic Graphs (DAG)', () => {
    const metadata = createMockMetadata();

    // Standard acyclic hierarchy: edge -> orchestration -> domain -> data
    const files: RepoFileRecord[] = [
      createMockFile({ path: 'backend/src/routes/api.ts', imports: ['../ingest/pipeline.js'] }),
      createMockFile({ path: 'backend/src/ingest/pipeline.ts', imports: ['../domain/rules.js'] }),
      createMockFile({ path: 'backend/src/domain/rules.ts', imports: ['../db/schema.js'] }),
      createMockFile({ path: 'backend/src/db/schema.ts', imports: [] }),
    ];

    const result = buildDeterministicAtlas(metadata, files);

    expect(result.circularDeps).toBe(0);
    expect(result.dependencyEdges.every((e) => !e.isCircular)).toBe(true);
  });
});

// =============================================================================
// 5. Subsystem Clustering Tests (Target: 4–10 Cohesive Subsystems)
// =============================================================================

describe('Subsystem Clustering (buildSubsystemClusters)', () => {
  it('creates cohesive subsystems between 4 and 10 clusters for standard full-stack repos', () => {
    const metadata = createMockMetadata();

    const files: RepoFileRecord[] = [
      // Client subsystem files
      createMockFile({ path: 'studio/src/components/Atlas.tsx', layer: 'client', estimatedTokens: 1200 }),
      createMockFile({ path: 'studio/src/components/Strata.tsx', layer: 'client', estimatedTokens: 900 }),
      createMockFile({ path: 'studio/src/pages/index.tsx', layer: 'client', estimatedTokens: 600 }),

      // Edge subsystem files
      createMockFile({ path: 'backend/src/routes/ingest.ts', layer: 'edge', estimatedTokens: 800 }),
      createMockFile({ path: 'backend/src/routes/repos.ts', layer: 'edge', estimatedTokens: 750 }),

      // Orchestration subsystem files
      createMockFile({ path: 'backend/src/ingest/graphBuilder.ts', layer: 'orchestration', estimatedTokens: 3500 }),
      createMockFile({ path: 'backend/src/ingest/pipeline.ts', layer: 'orchestration', estimatedTokens: 2100 }),

      // Domain subsystem files
      createMockFile({ path: 'backend/src/domain/analyzer.ts', layer: 'domain', estimatedTokens: 1500 }),
      createMockFile({ path: 'shared/types.ts', layer: 'domain', estimatedTokens: 2800 }),

      // Infrastructure subsystem files
      createMockFile({ path: 'backend/src/config/env.ts', layer: 'infrastructure', estimatedTokens: 400 }),
      createMockFile({ path: 'backend/src/telemetry/logger.ts', layer: 'infrastructure', estimatedTokens: 500 }),

      // Data subsystem files
      createMockFile({ path: 'backend/src/db/schema.ts', layer: 'data', estimatedTokens: 1100 }),
      createMockFile({ path: 'backend/src/db/client.ts', layer: 'data', estimatedTokens: 700 }),

      // Tooling files
      createMockFile({ path: 'tests/graphBuilder.test.ts', layer: 'tooling', isTest: true }),
      createMockFile({ path: 'package.json', layer: 'tooling', isConfig: true }),
    ];

    const result = buildDeterministicAtlas(metadata, files);

    expect(result.subsystems.length).toBeGreaterThanOrEqual(4);
    expect(result.subsystems.length).toBeLessThanOrEqual(10);

    // Validate structural fields on every SubsystemCluster
    for (const sub of result.subsystems) {
      expect(sub.id).toMatch(/^sub-[a-z0-9-]+$/);
      expect(sub.name.length).toBeGreaterThan(0);
      expect(sub.tagline.length).toBeGreaterThan(0);
      expect(sub.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(sub.filePaths.length).toBeGreaterThan(0);
      expect(sub.totalTokens).toBeGreaterThan(0);
      expect(sub.summaryBullets.length).toBeGreaterThan(0);
      expect(sub.invariants.length).toBeGreaterThan(0);
    }
  });

  it('splits flat directory repositories into at least 4 subsystems when file count permits', () => {
    const metadata = createMockMetadata();

    // Flat repo with 6 files in root
    const files: RepoFileRecord[] = [
      createMockFile({ path: 'client.tsx', layer: 'client', estimatedTokens: 800 }),
      createMockFile({ path: 'server.ts', layer: 'edge', estimatedTokens: 900 }),
      createMockFile({ path: 'pipeline.ts', layer: 'orchestration', estimatedTokens: 1500 }),
      createMockFile({ path: 'engine.ts', layer: 'domain', estimatedTokens: 1200 }),
      createMockFile({ path: 'db.ts', layer: 'data', estimatedTokens: 700 }),
      createMockFile({ path: 'config.ts', layer: 'infrastructure', estimatedTokens: 400 }),
    ];

    const result = buildDeterministicAtlas(metadata, files);
    expect(result.subsystems.length).toBeGreaterThanOrEqual(4);
    expect(result.subsystems.length).toBeLessThanOrEqual(6);
  });
});

// =============================================================================
// 6. Strata Layers Tests (buildStrata)
// =============================================================================

describe('Stratum Layers (buildStrata)', () => {
  it('builds populated strata sorted top-to-bottom with descending elevation', () => {
    const metadata = createMockMetadata();

    const files: RepoFileRecord[] = [
      createMockFile({ path: 'studio/src/Atlas.tsx', layer: 'client' }),
      createMockFile({ path: 'backend/src/routes.ts', layer: 'edge' }),
      createMockFile({ path: 'backend/src/pipeline.ts', layer: 'orchestration' }),
      createMockFile({ path: 'backend/src/logic.ts', layer: 'domain' }),
      createMockFile({ path: 'backend/src/config.ts', layer: 'infrastructure' }),
      createMockFile({ path: 'backend/src/db.ts', layer: 'data' }),
      createMockFile({ path: 'tests/test.ts', layer: 'tooling' }),
    ];

    const result = buildDeterministicAtlas(metadata, files);

    expect(result.strata.length).toBe(7);

    // Verify correct layer ordering
    const expectedOrder: ArchitectureLayer[] = [
      'client',
      'edge',
      'orchestration',
      'domain',
      'infrastructure',
      'data',
      'tooling',
    ];

    result.strata.forEach((stratum, index) => {
      expect(stratum.layer).toBe(expectedOrder[index]);
      expect(stratum.title.length).toBeGreaterThan(0);
      expect(stratum.description.length).toBeGreaterThan(0);
      expect(stratum.accentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(stratum.fileCount).toBeGreaterThan(0);
      expect(stratum.tokenCount).toBeGreaterThan(0);
    });

    // Elevation must strictly descend from client (6) to tooling (0)
    for (let i = 0; i < result.strata.length - 1; i++) {
      expect(result.strata[i].elevation).toBeGreaterThan(result.strata[i + 1].elevation);
    }
  });

  it('omits unpopulated architectural layers from strata', () => {
    const metadata = createMockMetadata();

    // Repo containing only domain and data
    const files: RepoFileRecord[] = [
      createMockFile({ path: 'src/domain/math.ts', layer: 'domain' }),
      createMockFile({ path: 'src/data/db.ts', layer: 'data' }),
    ];

    const result = buildDeterministicAtlas(metadata, files);
    expect(result.strata.length).toBe(2);
    expect(result.strata.map((s) => s.layer)).toEqual(['domain', 'data']);
  });
});

// =============================================================================
// 7. Visual Atlas Nodes & Edges Tests
// =============================================================================

describe('Visual Atlas Promotion & Directed Edges', () => {
  it('caps promoted AtlasNodes to <= 24 and assigns visual layout coordinates', () => {
    const metadata = createMockMetadata();

    // Create 30 files across layers
    const files: RepoFileRecord[] = [];
    for (let i = 1; i <= 30; i++) {
      const layer: ArchitectureLayer =
        i <= 5 ? 'client' : i <= 10 ? 'edge' : i <= 15 ? 'orchestration' : i <= 20 ? 'domain' : 'data';
      files.push(
        createMockFile({
          path: `src/module_${i}.ts`,
          layer,
          estimatedTokens: 300 + i * 50,
          imports: i > 1 ? [`./module_${i - 1}.js`] : [],
        })
      );
    }

    const result = buildDeterministicAtlas(metadata, files);

    expect(result.nodes.length).toBeLessThanOrEqual(24);
    expect(result.nodes.length).toBeGreaterThan(0);

    for (const node of result.nodes) {
      expect(node.id).toMatch(/^node-[a-z0-9-]+$/);
      expect(node.label.length).toBeGreaterThan(0);
      expect(node.primaryFile.length).toBeGreaterThan(0);
      expect(node.visualBrief.length).toBeGreaterThan(0);
      expect(node.inputs.length).toBeGreaterThan(0);
      expect(node.outputs.length).toBeGreaterThan(0);

      // Coordinates x and y must be computed
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(node.x).toBeGreaterThan(0);
      expect(node.y).toBeGreaterThan(0);
    }

    // Atlas edges should have valid source and target mapping to node IDs
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    for (const edge of result.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
      expect(edge.weight).toBeGreaterThanOrEqual(1);
    }
  });

  it('marks isHotPath on high-signal behavioral execution edges', () => {
    const metadata = createMockMetadata();

    const files: RepoFileRecord[] = [
      createMockFile({
        path: 'src/routes.ts',
        layer: 'edge',
        imports: ['./pipeline.js'],
        isEntrypoint: true,
      }),
      createMockFile({
        path: 'src/pipeline.ts',
        layer: 'orchestration',
        imports: ['./engine.js'],
      }),
      createMockFile({
        path: 'src/engine.ts',
        layer: 'domain',
        imports: ['./store.js'],
      }),
      createMockFile({
        path: 'src/store.ts',
        layer: 'data',
        imports: [],
      }),
    ];

    const result = buildDeterministicAtlas(metadata, files);

    expect(result.edges.length).toBeGreaterThan(0);
    const hotEdges = result.edges.filter((e) => e.isHotPath);
    expect(hotEdges.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 8. Deterministic Execution Flows & Codemap Tour Tests
// =============================================================================

describe('Execution Flows & Codemap Tour', () => {
  it('generates 2 to 3 deterministic execution flows with connected steps', () => {
    const metadata = createMockMetadata();

    const files: RepoFileRecord[] = [
      createMockFile({
        path: 'studio/src/components/Atlas.tsx',
        layer: 'client',
        imports: ['../lib/api.js'],
      }),
      createMockFile({
        path: 'studio/src/lib/api.ts',
        layer: 'client',
        imports: ['backend/src/routes/ingest.js'],
      }),
      createMockFile({
        path: 'backend/src/routes/ingest.ts',
        layer: 'edge',
        imports: ['../ingest/graphBuilder.js'],
      }),
      createMockFile({
        path: 'backend/src/ingest/graphBuilder.ts',
        layer: 'orchestration',
        imports: ['shared/types.js'],
      }),
      createMockFile({
        path: 'shared/types.ts',
        layer: 'domain',
        exports: ['RepoFileRecord'],
        symbols: [{ name: 'RepoFileRecord', kind: 'interface', line: 1, exported: true }],
      }),
    ];

    const result = buildDeterministicAtlas(metadata, files);

    expect(result.flows.length).toBeGreaterThanOrEqual(2);
    expect(result.flows.length).toBeLessThanOrEqual(3);

    for (const flow of result.flows) {
      expect(flow.id).toMatch(/^flow-/);
      expect(flow.title.length).toBeGreaterThan(0);
      expect(flow.trigger.length).toBeGreaterThan(0);
      expect(flow.steps.length).toBeGreaterThan(0);

      // Verify each step is well-formed
      flow.steps.forEach((step, idx) => {
        expect(step.stepNumber).toBe(idx + 1);
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.action.length).toBeGreaterThan(0);
        expect(step.fromNodeId.length).toBeGreaterThan(0);
        expect(step.toNodeId.length).toBeGreaterThan(0);
        expect(step.filePath.length).toBeGreaterThan(0);
      });
    }
  });

  it('builds a 5-stop interactive Codemap Tour with lens recommendations', () => {
    const metadata = createMockMetadata();

    const files: RepoFileRecord[] = [
      createMockFile({ path: 'studio/src/Atlas.tsx', layer: 'client', imports: ['./api.js'] }),
      createMockFile({ path: 'studio/src/api.ts', layer: 'edge', imports: ['backend/src/pipeline.js'] }),
      createMockFile({ path: 'backend/src/pipeline.ts', layer: 'orchestration', imports: ['backend/src/engine.js'] }),
      createMockFile({ path: 'backend/src/engine.ts', layer: 'domain', imports: ['backend/src/db.js'] }),
      createMockFile({ path: 'backend/src/db.ts', layer: 'data' }),
    ];

    const result = buildDeterministicAtlas(metadata, files);

    expect(result.codemapTour.length).toBeGreaterThanOrEqual(3);
    expect(result.codemapTour.length).toBeLessThanOrEqual(5);

    const validLenses = new Set(['atlas', 'strata3d', 'flows', 'treemap', 'xray', 'mermaid', 'media']);

    result.codemapTour.forEach((stop, idx) => {
      expect(stop.order).toBe(idx + 1);
      expect(stop.title.length).toBeGreaterThan(0);
      expect(stop.visualHook.length).toBeGreaterThan(0);
      expect(stop.explanation.length).toBeGreaterThan(0);
      expect(stop.focusNodeId.length).toBeGreaterThan(0);
      expect(validLenses.has(stop.recommendedLens)).toBe(true);
    });
  });
});

// =============================================================================
// 9. Interactive Mermaid Diagram Generation Tests
// =============================================================================

describe('Architecture Mermaid Diagram (buildArchitectureMermaid)', () => {
  it('generates a valid, clickable Mermaid flowchart with Obsidian Cobalt styles', () => {
    const metadata = createMockMetadata({ name: 'GitUnderstand' });

    const files: RepoFileRecord[] = [
      createMockFile({
        path: 'studio/src/components/Atlas.tsx',
        layer: 'client',
        imports: ['backend/src/routes.js'],
      }),
      createMockFile({
        path: 'backend/src/routes.ts',
        layer: 'edge',
        imports: ['backend/src/pipeline.js'],
      }),
      createMockFile({
        path: 'backend/src/pipeline.ts',
        layer: 'orchestration',
        imports: ['backend/src/model.js'],
      }),
      createMockFile({
        path: 'backend/src/model.ts',
        layer: 'domain',
      }),
    ];

    const result = buildDeterministicAtlas(metadata, files);

    expect(result.diagrams.length).toBe(1);
    const diag = result.diagrams[0];

    expect(diag.id).toBe('diag-architecture-deterministic');
    expect(diag.kind).toBe('architecture');
    expect(diag.title).toContain('GitUnderstand');

    // Mermaid syntax validations
    expect(diag.code).toMatch(/^flowchart TD/);
    expect(diag.code).toContain('classDef client');
    expect(diag.code).toContain('classDef edge');
    expect(diag.code).toContain('classDef orchestration');
    expect(diag.code).toContain('classDef domain');
    expect(diag.code).toContain('subgraph SG_');

    // Node file map verification: all mapped files must strictly exist in the repo
    const repoPathSet = new Set(files.map((f) => f.path));
    expect(Object.keys(diag.nodeFileMap).length).toBeGreaterThan(0);

    for (const [mId, filePath] of Object.entries(diag.nodeFileMap)) {
      expect(mId).toMatch(/^N\d+_/);
      expect(repoPathSet.has(filePath)).toBe(true);
    }
  });
});

// =============================================================================
// 10. Tech Stack Inference and Edge Cases Tests
// =============================================================================

describe('Tech Stack & Architecture Pattern Inference', () => {
  it('detects Next.js, React, Tailwind, and Gemini API badges and infers architecture pattern', () => {
    const metadata = createMockMetadata({
      primaryLanguage: 'TypeScript',
      languages: { TypeScript: 95000, CSS: 5000 },
    });

    const files: RepoFileRecord[] = [
      createMockFile({
        path: 'package.json',
        layer: 'tooling',
        content: JSON.stringify({
          dependencies: {
            next: '15.0.0',
            react: '19.0.0',
            tailwindcss: '4.0.0',
            '@google/genai': '0.1.1',
          },
        }),
      }),
      createMockFile({
        path: 'studio/src/app/page.tsx',
        layer: 'client',
        content: "'use client'; export default function Page() {}",
      }),
      createMockFile({
        path: 'backend/src/ingest/pipeline.ts',
        layer: 'orchestration',
        imports: ['@google/genai'],
      }),
    ];

    const result = buildDeterministicAtlas(metadata, files);

    expect(result.techStackBadges).toContain('TypeScript');
    expect(result.techStackBadges).toContain('Next.js');
    expect(result.techStackBadges).toContain('React');
    expect(result.techStackBadges).toContain('Tailwind CSS');
    expect(result.techStackBadges).toContain('Gemini API');

    expect(result.architecturePattern).toContain('Next.js');
  });

  it('handles empty repositories gracefully without throwing', () => {
    const metadata = createMockMetadata();
    const result = buildDeterministicAtlas(metadata, []);

    expect(result.files).toEqual([]);
    expect(result.dependencyEdges).toEqual([]);
    expect(result.subsystems).toEqual([]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.strata).toEqual([]);
    expect(result.flows).toEqual([]);
    expect(result.codemapTour).toEqual([]);
    expect(result.diagrams).toEqual([]);
    expect(result.circularDeps).toBe(0);
    expect(result.avgFanOut).toBe(0);
    expect(result.architecturePattern).toBe('Empty Repository');
  });

  it('handles single-file repositories gracefully', () => {
    const metadata = createMockMetadata();
    const singleFile = createMockFile({
      path: 'index.ts',
      isEntrypoint: true,
      content: 'console.log("Hello world");',
    });

    const result = buildDeterministicAtlas(metadata, [singleFile]);

    expect(result.files.length).toBe(1);
    expect(result.nodes.length).toBe(1);
    expect(result.subsystems.length).toBe(1);
    expect(result.strata.length).toBe(1);
    expect(result.flows.length).toBe(1);
    expect(result.circularDeps).toBe(0);
  });
});
