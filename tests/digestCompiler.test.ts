import { describe, it, expect } from 'vitest';
import {
  buildTokenTreemap,
  computeLanguageDistribution,
} from '../backend/src/ingest/treemapBuilder.js';
import {
  renderAsciiTree,
  compileDigest,
  compileAgentMarkdownBrief,
  DEFAULT_DIGEST_OPTIONS,
} from '../backend/src/ingest/digestCompiler.js';
import type {
  VisualAtlasBlueprint,
  RepoFileRecord,
  SubsystemCluster,
  StratumLayer,
  ExecutionFlow,
  CodemapTourStop,
  MermaidDiagramSpec,
  XRayMatrixReport,
} from '../shared/types.js';

// =============================================================================
// Test Fixture Factories
// =============================================================================

function createMockFile(overrides: Partial<RepoFileRecord> = {}): RepoFileRecord {
  const path = overrides.path ?? 'src/index.ts';
  const name = overrides.name ?? path.split('/').pop() ?? 'index.ts';
  const dotIndex = name.lastIndexOf('.');
  const extension = overrides.extension ?? (dotIndex >= 0 ? name.slice(dotIndex) : '');
  const dirParts = path.split('/');
  dirParts.pop();
  const directory = overrides.directory ?? dirParts.join('/');

  return {
    path,
    name,
    directory,
    extension,
    language: overrides.language ?? 'TypeScript',
    sizeBytes: overrides.sizeBytes ?? 1024,
    lineCount: overrides.lineCount ?? 40,
    estimatedTokens: overrides.estimatedTokens ?? 250,
    imports: overrides.imports ?? [],
    resolvedImports: overrides.resolvedImports ?? [],
    exports: overrides.exports ?? [],
    symbols: overrides.symbols ?? [],
    layer: overrides.layer ?? 'domain',
    centrality: overrides.centrality ?? 0.5,
    fanIn: overrides.fanIn ?? 2,
    fanOut: overrides.fanOut ?? 2,
    isEntrypoint: overrides.isEntrypoint ?? false,
    isTest: overrides.isTest ?? false,
    isConfig: overrides.isConfig ?? false,
    content: overrides.content ?? `// Content for ${path}`,
    ...overrides,
  };
}

function createMockBlueprint(overrides: Partial<VisualAtlasBlueprint> = {}): VisualAtlasBlueprint {
  return {
    repoId: 'facebook__react__main',
    metadata: {
      id: 'facebook__react__main',
      owner: 'facebook',
      name: 'react',
      fullName: 'facebook/react',
      description: 'The library for web and native user interfaces.',
      defaultBranch: 'main',
      branch: 'main',
      stars: 220000,
      forks: 45000,
      openIssues: 1200,
      primaryLanguage: 'JavaScript',
      languages: { JavaScript: 800000, TypeScript: 200000 },
      topics: ['declarative', 'frontend', 'javascript', 'react', 'ui'],
      htmlUrl: 'https://github.com/facebook/react',
      updatedAt: '2026-11-20T00:00:00Z',
      isPrivate: false,
    },
    headline: 'Declarative component-driven frontend rendering engine',
    oneLiner: 'Component architecture with fiber reconciler and concurrent scheduler',
    architecturePattern: 'Modular Monolith',
    techStackBadges: ['TypeScript', 'React', 'Rollup', 'Jest'],
    files: [],
    edges: [],
    subsystems: [],
    nodes: [],
    strata: [],
    flows: [],
    codemapTour: [],
    diagrams: [],
    treemap: {
      id: 'root',
      name: 'root',
      path: '',
      kind: 'dir',
      tokens: 0,
      bytes: 0,
      fileCount: 0,
      children: [],
    },
    posters: [],
    audioTours: [],
    videoReels: [],
    stats: {
      totalFiles: 0,
      analyzedFiles: 0,
      totalLines: 0,
      totalTokens: 0,
      totalBytes: 0,
      circularDeps: 0,
      avgFanOut: 1.25,
      ingestLatencyMs: 150,
    },
    aiEnriched: true,
    modelsUsed: ['gemini-4-carbon'],
    generatedAt: '2026-11-22T00:00:00.000Z',
    ...overrides,
  };
}

// =============================================================================
// 1. Hierarchical Token Treemap Builder
// =============================================================================

describe('Treemap Builder: buildTokenTreemap', () => {
  it('returns an empty root directory node when given an empty files array', () => {
    const root = buildTokenTreemap('my-org/my-repo', []);
    expect(root).toBeDefined();
    expect(root.kind).toBe('dir');
    expect(root.id).toBe('my-org/my-repo');
    expect(root.name).toBe('my-org/my-repo');
    expect(root.path).toBe('');
    expect(root.tokens).toBe(0);
    expect(root.bytes).toBe(0);
    expect(root.fileCount).toBe(0);
    expect(root.children).toEqual([]);
  });

  it('aggregates tokens, bytes, and fileCount for files placed in root', () => {
    const files = [
      createMockFile({ path: 'README.md', sizeBytes: 500, estimatedTokens: 120, language: 'Markdown' }),
      createMockFile({ path: 'package.json', sizeBytes: 800, estimatedTokens: 200, language: 'JSON' }),
    ];

    const root = buildTokenTreemap('acme/core', files);
    expect(root.tokens).toBe(320);
    expect(root.bytes).toBe(1300);
    expect(root.fileCount).toBe(2);
    expect(root.children).toHaveLength(2);

    // Root children sorted descending by tokens
    expect(root.children?.[0].path).toBe('package.json');
    expect(root.children?.[0].tokens).toBe(200);
    expect(root.children?.[1].path).toBe('README.md');
    expect(root.children?.[1].tokens).toBe(120);
  });

  it('constructs multi-level nested directories and aggregates tokens bottom-up', () => {
    const files = [
      createMockFile({
        path: 'src/client/components/Button.tsx',
        sizeBytes: 1200,
        estimatedTokens: 300,
        language: 'TypeScript',
        layer: 'client',
      }),
      createMockFile({
        path: 'src/client/components/Card.tsx',
        sizeBytes: 800,
        estimatedTokens: 200,
        language: 'TypeScript',
        layer: 'client',
      }),
      createMockFile({
        path: 'src/client/App.tsx',
        sizeBytes: 2000,
        estimatedTokens: 500,
        language: 'TypeScript',
        layer: 'client',
      }),
      createMockFile({
        path: 'src/server/router.ts',
        sizeBytes: 4000,
        estimatedTokens: 1000,
        language: 'TypeScript',
        layer: 'edge',
      }),
      createMockFile({
        path: 'README.md',
        sizeBytes: 400,
        estimatedTokens: 100,
        language: 'Markdown',
        layer: 'tooling',
      }),
    ];

    const root = buildTokenTreemap('acme/app', files);

    // Total tokens: 300 + 200 + 500 + 1000 + 100 = 2100
    expect(root.tokens).toBe(2100);
    expect(root.bytes).toBe(8400);
    expect(root.fileCount).toBe(5);

    // Root children should contain "src" dir and "README.md" file
    expect(root.children).toHaveLength(2);
    const srcDir = root.children?.find((c) => c.name === 'src');
    const readmeFile = root.children?.find((c) => c.name === 'README.md');

    expect(srcDir).toBeDefined();
    expect(srcDir?.kind).toBe('dir');
    expect(srcDir?.tokens).toBe(2000);
    expect(srcDir?.fileCount).toBe(4);

    expect(readmeFile).toBeDefined();
    expect(readmeFile?.kind).toBe('file');
    expect(readmeFile?.tokens).toBe(100);

    // Under "src", children should be "server" (1000 tokens) and "client" (1000 tokens)
    expect(srcDir?.children).toHaveLength(2);
    const clientDir = srcDir?.children?.find((c) => c.name === 'client');
    const serverDir = srcDir?.children?.find((c) => c.name === 'server');

    expect(clientDir).toBeDefined();
    expect(clientDir?.tokens).toBe(1000);
    expect(clientDir?.fileCount).toBe(3);

    expect(serverDir).toBeDefined();
    expect(serverDir?.tokens).toBe(1000);
    expect(serverDir?.fileCount).toBe(1);

    // Under "client", we have "App.tsx" (500 tokens) and "components" dir (500 tokens)
    expect(clientDir?.children).toHaveLength(2);
    const componentsDir = clientDir?.children?.find((c) => c.name === 'components');
    expect(componentsDir).toBeDefined();
    expect(componentsDir?.tokens).toBe(500);
    expect(componentsDir?.fileCount).toBe(2);
  });

  it('determines the dominant language and architectural layer for directories', () => {
    const files = [
      createMockFile({
        path: 'src/ui/A.tsx',
        language: 'TypeScript',
        estimatedTokens: 600,
        layer: 'client',
      }),
      createMockFile({
        path: 'src/ui/B.py',
        language: 'Python',
        estimatedTokens: 200,
        layer: 'domain',
      }),
      createMockFile({
        path: 'src/ui/C.css',
        language: 'CSS',
        estimatedTokens: 100,
        layer: 'client',
      }),
    ];

    const root = buildTokenTreemap('acme/ui', files);
    const srcDir = root.children?.find((c) => c.name === 'src');
    const uiDir = srcDir?.children?.find((c) => c.name === 'ui');

    expect(uiDir).toBeDefined();
    expect(uiDir?.language).toBe('TypeScript'); // 600 vs 200 vs 100
    expect(uiDir?.layer).toBe('client'); // 700 client vs 200 domain
  });

  it('sorts children descending by tokens with byte and name tie-breakers', () => {
    const files = [
      createMockFile({ path: 'src/Beta.ts', estimatedTokens: 500, sizeBytes: 1000 }),
      createMockFile({ path: 'src/Alpha.ts', estimatedTokens: 500, sizeBytes: 1000 }),
      createMockFile({ path: 'src/Heavy.ts', estimatedTokens: 500, sizeBytes: 2000 }),
      createMockFile({ path: 'src/Top.ts', estimatedTokens: 900, sizeBytes: 500 }),
    ];

    const root = buildTokenTreemap('test', files);
    const srcDir = root.children?.find((c) => c.name === 'src');
    const childNames = srcDir?.children?.map((c) => c.name);

    // Top.ts (900), Heavy.ts (500, 2000B), Alpha.ts (500, 1000B), Beta.ts (500, 1000B)
    expect(childNames).toEqual(['Top.ts', 'Heavy.ts', 'Alpha.ts', 'Beta.ts']);
  });

  it('calculates weighted average riskScore when files carry riskScore', () => {
    const files = [
      createMockFile({
        path: 'src/critical.ts',
        estimatedTokens: 1000,
        ...({ riskScore: 0.8 } as Record<string, unknown>),
      }),
      createMockFile({
        path: 'src/safe.ts',
        estimatedTokens: 1000,
        ...({ riskScore: 0.2 } as Record<string, unknown>),
      }),
    ];

    const root = buildTokenTreemap('risk-repo', files);
    const srcDir = root.children?.find((c) => c.name === 'src');

    // (0.8*1000 + 0.2*1000) / 2000 = 0.5
    expect(srcDir?.riskScore).toBe(0.5);
    expect(root.riskScore).toBe(0.5);
  });
});

describe('Treemap Builder: computeLanguageDistribution', () => {
  it('returns empty array when given no files', () => {
    expect(computeLanguageDistribution([])).toEqual([]);
  });

  it('calculates language percentages sorted descending by token share', () => {
    const files = [
      createMockFile({ path: 'a.ts', language: 'TypeScript', estimatedTokens: 600 }),
      createMockFile({ path: 'b.ts', language: 'TypeScript', estimatedTokens: 400 }),
      createMockFile({ path: 'c.py', language: 'Python', estimatedTokens: 800 }),
      createMockFile({ path: 'd.rs', language: 'Rust', estimatedTokens: 200 }),
    ];

    const dist = computeLanguageDistribution(files);

    // Total tokens: 2000
    // TypeScript: 1000 tokens (50%), 2 files
    // Python: 800 tokens (40%), 1 file
    // Rust: 200 tokens (10%), 1 file
    expect(dist).toHaveLength(3);
    expect(dist[0]).toEqual({
      language: 'TypeScript',
      files: 2,
      tokens: 1000,
      percentage: 50.0,
    });
    expect(dist[1]).toEqual({
      language: 'Python',
      files: 1,
      tokens: 800,
      percentage: 40.0,
    });
    expect(dist[2]).toEqual({
      language: 'Rust',
      files: 1,
      tokens: 200,
      percentage: 10.0,
    });
  });

  it('falls back to file count percentage when all tokens are zero', () => {
    const files = [
      createMockFile({ path: 'a.go', language: 'Go', estimatedTokens: 0 }),
      createMockFile({ path: 'b.go', language: 'Go', estimatedTokens: 0 }),
      createMockFile({ path: 'c.c', language: 'C', estimatedTokens: 0 }),
    ];

    const dist = computeLanguageDistribution(files);
    expect(dist[0].language).toBe('Go');
    expect(dist[0].percentage).toBe(66.67);
    expect(dist[1].language).toBe('C');
    expect(dist[1].percentage).toBe(33.33);
  });
});

// =============================================================================
// 2. ASCII Tree Renderer
// =============================================================================

describe('Digest Compiler: renderAsciiTree', () => {
  it('returns dot for empty path array', () => {
    expect(renderAsciiTree([])).toBe('.');
  });

  it('renders a single root-level file', () => {
    const tree = renderAsciiTree(['package.json']);
    expect(tree).toBe('.\n└── package.json');
  });

  it('renders nested directories with correct box-drawing characters and sorting', () => {
    const paths = [
      'src/index.ts',
      'src/components/Button.tsx',
      'src/components/Modal.tsx',
      'src/utils/math.ts',
      'package.json',
      'README.md',
    ];

    const tree = renderAsciiTree(paths);
    const lines = tree.split('\n');

    expect(lines[0]).toBe('.');
    // Directories come first before files under root: "src" is dir, then files package.json, README.md
    expect(lines.some((l) => l.includes('src'))).toBe(true);
    expect(lines.some((l) => l.includes('components'))).toBe(true);
    expect(lines.some((l) => l.includes('Button.tsx'))).toBe(true);
    expect(lines.some((l) => l.includes('Modal.tsx'))).toBe(true);
    expect(lines.some((l) => l.includes('math.ts'))).toBe(true);

    // Box drawing characters present
    expect(tree).toMatch(/[├└]── /);
  });

  it('normalizes leading ./ and backslashes in paths', () => {
    const tree = renderAsciiTree(['./src\\services/auth.ts']);
    expect(tree).toContain('src');
    expect(tree).toContain('services');
    expect(tree).toContain('auth.ts');
    expect(tree).not.toContain('\\');
  });
});

// =============================================================================
// 3. Digest Compiler: Glob Filtering & File Exclusion
// =============================================================================

describe('Digest Compiler: Filtering Options', () => {
  it('excludes standard build assets, node_modules, lockfiles, and images by default', () => {
    const blueprint = createMockBlueprint({
      files: [
        createMockFile({ path: 'src/main.ts', estimatedTokens: 300 }),
        createMockFile({ path: 'node_modules/lodash/index.js', estimatedTokens: 1000 }),
        createMockFile({ path: 'dist/bundle.min.js', estimatedTokens: 2000 }),
        createMockFile({ path: 'package-lock.json', estimatedTokens: 5000 }),
        createMockFile({ path: 'assets/logo.png', estimatedTokens: 100 }),
      ],
    });

    const digest = compileDigest(blueprint);

    expect(digest.includedFiles).toBe(1);
    expect(digest.excludedFiles).toBe(4);
    expect(digest.digestText).toContain('FILE: src/main.ts');
    expect(digest.digestText).not.toContain('node_modules');
    expect(digest.digestText).not.toContain('dist/bundle.min.js');
    expect(digest.digestText).not.toContain('package-lock.json');
    expect(digest.digestText).not.toContain('assets/logo.png');
  });

  it('filters out test files when includeTests is false (default)', () => {
    const blueprint = createMockBlueprint({
      files: [
        createMockFile({ path: 'src/engine.ts', estimatedTokens: 400, isTest: false }),
        createMockFile({ path: 'src/engine.test.ts', estimatedTokens: 300, isTest: true }),
        createMockFile({ path: 'tests/integration/api.spec.ts', estimatedTokens: 500 }),
        createMockFile({ path: 'src/__tests__/helpers.ts', estimatedTokens: 200 }),
      ],
    });

    const digestWithoutTests = compileDigest(blueprint, { includeTests: false });
    expect(digestWithoutTests.includedFiles).toBe(1);
    expect(digestWithoutTests.digestText).toContain('src/engine.ts');
    expect(digestWithoutTests.digestText).not.toContain('engine.test.ts');
    expect(digestWithoutTests.digestText).not.toContain('api.spec.ts');

    const digestWithTests = compileDigest(blueprint, { includeTests: true });
    expect(digestWithTests.includedFiles).toBe(4);
    expect(digestWithTests.digestText).toContain('engine.test.ts');
  });

  it('filters out documentation files when includeDocs is false', () => {
    const blueprint = createMockBlueprint({
      files: [
        createMockFile({ path: 'src/index.ts', estimatedTokens: 200 }),
        createMockFile({ path: 'README.md', extension: '.md', estimatedTokens: 150 }),
        createMockFile({ path: 'docs/architecture.md', extension: '.md', estimatedTokens: 500 }),
      ],
    });

    const digest = compileDigest(blueprint, { includeDocs: false });
    expect(digest.includedFiles).toBe(1);
    expect(digest.digestText).toContain('src/index.ts');
    expect(digest.digestText).not.toContain('README.md');
    expect(digest.digestText).not.toContain('docs/architecture.md');
  });

  it('enforces maxFileSizeBytes threshold', () => {
    const blueprint = createMockBlueprint({
      files: [
        createMockFile({ path: 'src/small.ts', sizeBytes: 10_000, estimatedTokens: 500 }),
        createMockFile({ path: 'src/huge.ts', sizeBytes: 200_000, estimatedTokens: 10_000 }),
      ],
    });

    // Default maxFileSizeBytes is 128KB (131,072 bytes)
    const digest = compileDigest(blueprint);
    expect(digest.includedFiles).toBe(1);
    expect(digest.digestText).toContain('src/small.ts');
    expect(digest.digestText).not.toContain('src/huge.ts');
  });

  it('respects custom includePatterns and excludePatterns', () => {
    const blueprint = createMockBlueprint({
      files: [
        createMockFile({ path: 'src/client/App.tsx', estimatedTokens: 300 }),
        createMockFile({ path: 'src/server/api.ts', estimatedTokens: 400 }),
        createMockFile({ path: 'src/server/secret.ts', estimatedTokens: 100 }),
        createMockFile({ path: 'scripts/deploy.sh', estimatedTokens: 150 }),
      ],
    });

    const digest = compileDigest(blueprint, {
      includePatterns: ['src/server/**'],
      excludePatterns: ['**/secret.ts'],
    });

    expect(digest.includedFiles).toBe(1);
    expect(digest.digestText).toContain('src/server/api.ts');
    expect(digest.digestText).not.toContain('src/server/secret.ts');
    expect(digest.digestText).not.toContain('src/client/App.tsx');
    expect(digest.digestText).not.toContain('scripts/deploy.sh');
  });

  it('restricts files to selectedSubsystems when specified', () => {
    const blueprint = createMockBlueprint({
      files: [
        createMockFile({ path: 'src/auth/login.ts', estimatedTokens: 200 }),
        createMockFile({ path: 'src/billing/stripe.ts', estimatedTokens: 300 }),
        createMockFile({ path: 'src/core/kernel.ts', estimatedTokens: 400 }),
      ],
      subsystems: [
        {
          id: 'sub_auth',
          name: 'Authentication Subsystem',
          tagline: 'Auth & sessions',
          layer: 'edge',
          color: '#2563EB',
          nodeIds: ['node_auth'],
          filePaths: ['src/auth/login.ts'],
          entrypointPaths: ['src/auth/login.ts'],
          totalTokens: 200,
          summaryBullets: ['Handles login'],
          invariants: ['Never log plain tokens'],
        },
        {
          id: 'sub_billing',
          name: 'Billing Subsystem',
          tagline: 'Payments',
          layer: 'domain',
          color: '#10B981',
          nodeIds: ['node_billing'],
          filePaths: ['src/billing/stripe.ts'],
          entrypointPaths: [],
          totalTokens: 300,
          summaryBullets: ['Stripe client'],
          invariants: [],
        },
      ],
    });

    const digest = compileDigest(blueprint, {
      selectedSubsystems: ['sub_auth'],
    });

    expect(digest.includedFiles).toBe(1);
    expect(digest.digestText).toContain('src/auth/login.ts');
    expect(digest.digestText).not.toContain('src/billing/stripe.ts');
    expect(digest.digestText).not.toContain('src/core/kernel.ts');
  });
});

// =============================================================================
// 4. Digest Compiler: Token Budget Prioritization
// =============================================================================

describe('Digest Compiler: Token Budget Prioritization', () => {
  it('prioritizes isEntrypoint, centrality, and fanIn when budget is constrained', () => {
    const files = [
      // Low importance regular file
      createMockFile({
        path: 'src/utils/low.ts',
        isEntrypoint: false,
        centrality: 0.1,
        fanIn: 1,
        estimatedTokens: 300,
      }),
      // High centrality internal module
      createMockFile({
        path: 'src/core/engine.ts',
        isEntrypoint: false,
        centrality: 0.95,
        fanIn: 15,
        estimatedTokens: 300,
      }),
      // Architectural entrypoint (highest priority)
      createMockFile({
        path: 'src/index.ts',
        isEntrypoint: true,
        centrality: 0.8,
        fanIn: 20,
        estimatedTokens: 300,
      }),
      // Moderate centrality module
      createMockFile({
        path: 'src/models/user.ts',
        isEntrypoint: false,
        centrality: 0.6,
        fanIn: 8,
        estimatedTokens: 300,
      }),
    ];

    const blueprint = createMockBlueprint({ files });

    // With a budget of 650 tokens, exactly 2 files of 300 tokens each should fit.
    // Order of priority:
    // 1. src/index.ts (isEntrypoint: true) -> 300 tokens
    // 2. src/core/engine.ts (centrality: 0.95) -> 300 tokens (sum: 600)
    // 3. src/models/user.ts would push to 900 > 650 -> truncated!
    const digest = compileDigest(blueprint, { maxTotalTokens: 650 });

    expect(digest.truncated).toBe(true);
    expect(digest.includedFiles).toBe(2);
    expect(digest.excludedFiles).toBe(2);
    expect(digest.totalTokens).toBe(600);
    expect(digest.budgetTarget).toBe(650);
    expect(digest.budgetUtilization).toBeCloseTo(600 / 650, 2);

    expect(digest.digestText).toContain('FILE: src/index.ts');
    expect(digest.digestText).toContain('FILE: src/core/engine.ts');
    expect(digest.digestText).not.toContain('FILE: src/models/user.ts');
    expect(digest.digestText).not.toContain('FILE: src/utils/low.ts');
    expect(digest.summaryHeader).toContain('Truncated: YES (budget reached)');
  });

  it('formats canonical Gitingest delimiter blocks for each included file', () => {
    const blueprint = createMockBlueprint({
      files: [
        createMockFile({
          path: 'src/sample.ts',
          estimatedTokens: 150,
          content: 'export const GREETING = "Hello GitUnderstand";',
        }),
      ],
    });

    const digest = compileDigest(blueprint);
    expect(digest.digestText).toContain('================================================');
    expect(digest.digestText).toContain('FILE: src/sample.ts (150 tokens)');
    expect(digest.digestText).toContain('export const GREETING = "Hello GitUnderstand";');
  });

  it('supports toggling the directory structure ASCII tree header', () => {
    const blueprint = createMockBlueprint({
      files: [createMockFile({ path: 'src/a.ts', estimatedTokens: 100 })],
    });

    const withTree = compileDigest(blueprint, { includeTreeHeader: true });
    expect(withTree.digestText).toContain('DIRECTORY STRUCTURE');
    expect(withTree.digestText).toContain('└── a.ts');

    const withoutTree = compileDigest(blueprint, { includeTreeHeader: false });
    expect(withoutTree.digestText).not.toContain('DIRECTORY STRUCTURE');
  });
});

// =============================================================================
// 5. Agent Architecture Markdown Brief Compiler (.md Brief)
// =============================================================================

describe('Digest Compiler: compileAgentMarkdownBrief', () => {
  it('generates a comprehensive Markdown brief with interactive visual links, metrics, and invariants', () => {
    const mockSubsystem: SubsystemCluster = {
      id: 'sub_reconciler',
      name: 'Fiber Reconciler',
      tagline: 'Incremental tree diffing and priority scheduling',
      layer: 'domain',
      color: '#3B82F6',
      nodeIds: ['node_fiber'],
      filePaths: ['packages/react-reconciler/src/ReactFiber.js'],
      entrypointPaths: ['packages/react-reconciler/src/ReactFiberReconciler.js'],
      totalTokens: 25000,
      healthScore: 94,
      summaryBullets: ['Manages work-in-progress fiber tree', 'Batches state updates with lane priorities'],
      invariants: ['Never perform synchronous DOM mutation inside render phase'],
    };

    const mockStrata: StratumLayer[] = [
      {
        layer: 'client',
        title: 'Component View Layer',
        description: 'JSX primitives and React hooks',
        elevation: 3,
        accentColor: '#38BDF8',
        nodeIds: ['client_node'],
        fileCount: 45,
        tokenCount: 40000,
      },
      {
        layer: 'domain',
        title: 'Core Reconciliation Engine',
        description: 'Fiber algorithm and state transitions',
        elevation: 2,
        accentColor: '#818CF8',
        nodeIds: ['domain_node'],
        fileCount: 80,
        tokenCount: 120000,
      },
    ];

    const mockFlow: ExecutionFlow = {
      id: 'flow_mount',
      title: 'Initial Component Mount',
      category: 'runtime',
      trigger: 'root.render(<App />)',
      subtitle: 'From user trigger to committed DOM nodes',
      steps: [
        {
          stepNumber: 1,
          title: 'Schedule Root Update',
          action: 'Enqueues update into fiber root lane queue',
          filePath: 'packages/react-reconciler/src/ReactFiberWorkLoop.js',
          lineStart: 120,
          nodeId: 'node_workloop',
        },
      ],
    };

    const mockTour: CodemapTourStop = {
      id: 'tour_1',
      order: 1,
      title: 'Fiber Node Definition',
      visualHook: 'Core data structure for every component instance',
      explanation: 'Look at the child, sibling, and return pointers.',
      focusNodeId: 'node_fiber',
      highlightNodeIds: [],
      filePath: 'packages/react-reconciler/src/ReactFiber.js',
      lineStart: 45,
      lineEnd: 110,
      recommendedLens: 'strata3d',
    };

    const mockDiagram: MermaidDiagramSpec = {
      id: 'dia_core',
      kind: 'architecture',
      title: 'Reconciler to Renderer Pipeline',
      subtitle: 'Data flow between reconciler package and DOM host',
      code: 'flowchart LR\n  Reconciler --> HostConfig --> DOM',
      nodeFileMap: {},
      modelUsed: 'gemini-4-carbon',
      generatedAt: '2026-11-22T00:00:00Z',
    };

    const mockXRay: XRayMatrixReport = {
      model: 'gemini-4-carbon',
      totalProbes: 18,
      dualKeySharded: true,
      latencyMs: 420,
      overallScore: 89.5,
      meanEntropy: 0.142,
      recommendedModelTier: 'gemini-4-argon',
      routingRationale: 'High modularity and robust architectural invariants',
      pillarAverages: {
        modularity: 92,
        security: 88,
        resilience: 85,
        testability: 90,
        api_clarity: 95,
        concurrency: 84,
        scalability: 89,
        hygiene: 91,
        onboarding: 87,
      },
      modules: [
        {
          nodeId: 'node_reconciler',
          label: 'Fiber WorkLoop',
          primaryFile: 'packages/react-reconciler/src/ReactFiberWorkLoop.js',
          layer: 'domain',
          overallHealth: 92,
          blastRadius: 0.75,
          cells: {} as any,
          topFinding: 'Minor circular dependency risk in concurrent scheduling loop',
        },
      ],
      generatedAt: '2026-11-22T00:00:00Z',
    };

    const blueprint = createMockBlueprint({
      subsystems: [mockSubsystem],
      strata: mockStrata,
      flows: [mockFlow],
      codemapTour: [mockTour],
      diagrams: [mockDiagram],
      xray: mockXRay,
      files: [
        createMockFile({
          path: 'packages/react/index.js',
          isEntrypoint: true,
          centrality: 0.98,
          fanIn: 120,
          fanOut: 15,
          estimatedTokens: 1200,
          layer: 'client',
          symbols: [
            { name: 'createElement', kind: 'function', line: 10, exported: true },
            { name: 'useState', kind: 'function', line: 50, exported: true },
          ],
        }),
      ],
    });

    const brief = compileAgentMarkdownBrief(blueprint);

    // 1. Identity & URLs
    expect(brief).toContain('# GitUnderstand Architecture Brief: facebook/react');
    expect(brief).toContain('[https://git-understand.com/facebook/react](https://git-understand.com/facebook/react)');
    expect(brief).toContain('https://github.com/facebook/react');
    expect(brief).toContain('`main`');

    // 2. Summary & Badges
    expect(brief).toContain('Declarative component-driven frontend rendering engine');
    expect(brief).toContain('`TypeScript`');
    expect(brief).toContain('Modular Monolith');

    // 3. Topology & Health Table
    expect(brief).toContain('## Repository Topology & Health');
    expect(brief).toContain('**Primary Language**');
    expect(brief).toContain('**Total Files**');

    // 4. Mermaid System Architecture Diagram
    expect(brief).toContain('## Visual System Architecture');
    expect(brief).toContain('### Reconciler to Renderer Pipeline');
    expect(brief).toContain('```mermaid\nflowchart LR\n  Reconciler --> HostConfig --> DOM\n```');

    // 5. Architectural Strata Table
    expect(brief).toContain('## Architectural Strata');
    expect(brief).toContain('`client`');
    expect(brief).toContain('**Component View Layer**');
    expect(brief).toContain('`domain`');
    expect(brief).toContain('**Core Reconciliation Engine**');

    // 6. Subsystem Clusters & Invariants
    expect(brief).toContain('## Subsystem Clusters & Invariants');
    expect(brief).toContain('### Fiber Reconciler (`domain` • Health: `94/100`)');
    expect(brief).toContain('🛡️ Never perform synchronous DOM mutation inside render phase');
    expect(brief).toContain('**Entrypoint(s):** `packages/react-reconciler/src/ReactFiberReconciler.js`');

    // 7. Critical Execution Flows
    expect(brief).toContain('## Critical Execution Flows');
    expect(brief).toContain('Flow: Initial Component Mount (`runtime`)');
    expect(brief).toContain('`root.render(<App />)`');
    expect(brief).toContain('`packages/react-reconciler/src/ReactFiberWorkLoop.js:120`');

    // 8. Key Architectural Files Table
    expect(brief).toContain('## Architectural Entrypoints & Key Files');
    expect(brief).toContain('`packages/react/index.js` ⭐');
    expect(brief).toContain('`createElement`');

    // 9. Decision-1 X-Ray Health Report
    expect(brief).toContain('## Decision-1 X-Ray Architectural Health');
    expect(brief).toContain('**89.5/100**');
    expect(brief).toContain('`gemini-4-argon`');
    expect(brief).toContain('Fiber WorkLoop');

    // 10. Codemap Tour
    expect(brief).toContain('## Codemap Guided Tour');
    expect(brief).toContain('Stop 1: Fiber Node Definition');
    expect(brief).toContain('`packages/react-reconciler/src/ReactFiber.js:45-110`');

    // 11. Agent Guidelines
    expect(brief).toContain('## Agent Modification Guidelines');
    expect(brief).toContain('Preserve Layer Invariants');
    expect(brief).toContain('Inspect Entrypoints First');
  });

  it('synthesizes fallback Mermaid flowchart when blueprint has no diagrams', () => {
    const blueprint = createMockBlueprint({
      diagrams: [],
      subsystems: [
        {
          id: 'sub_a',
          name: 'Core Engine',
          tagline: 'Kernel',
          layer: 'domain',
          color: '#123456',
          nodeIds: [],
          filePaths: [],
          entrypointPaths: [],
          totalTokens: 100,
          summaryBullets: [],
          invariants: [],
        },
        {
          id: 'sub_b',
          name: 'UI Shell',
          tagline: 'Frontend',
          layer: 'client',
          color: '#654321',
          nodeIds: [],
          filePaths: [],
          entrypointPaths: [],
          totalTokens: 100,
          summaryBullets: [],
          invariants: [],
        },
      ],
    });

    const brief = compileAgentMarkdownBrief(blueprint);
    expect(brief).toContain('```mermaid\nflowchart TD');
    expect(brief).toContain('sub_a["Core Engine (domain)"]');
    expect(brief).toContain('sub_b["UI Shell (client)"]');
    expect(brief).toContain('sub_a --> sub_b');
  });
});
