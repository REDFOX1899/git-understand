// =============================================================================
// GitUnderstand (git-understand.com) — Tests: Mermaid Sanitizer & Linker
// Vitest suite verifying Mermaid fence stripping, XSS removal, label quoting,
// clickable GitHub URL binding, and deterministic diagram synthesis fallbacks.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  sanitizeMermaidCode,
  bindClickableNodeLinks,
  generateMermaidSuite,
  modifyMermaidDiagram,
} from '../backend/src/gemini/diagramSynthesizer.js';
import type { VisualAtlasBlueprint, MermaidDiagramSpec } from '../shared/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockBlueprint(): VisualAtlasBlueprint {
  return {
    repoId: 'test-owner__test-repo__main',
    metadata: {
      id: 'test-owner__test-repo__main',
      owner: 'test-owner',
      name: 'test-repo',
      fullName: 'test-owner/test-repo',
      description: 'A visual intelligence codebase studio powered by Gemini 4',
      defaultBranch: 'main',
      branch: 'main',
      stars: 120,
      forks: 15,
      openIssues: 3,
      primaryLanguage: 'TypeScript',
      languages: { TypeScript: 85000, Python: 15000 },
      topics: ['ai', 'codebase', 'visualization', 'gemini'],
      htmlUrl: 'https://github.com/test-owner/test-repo',
      updatedAt: '2026-11-22T00:00:00Z',
      isPrivate: false,
    },
    headline: 'Visual Intelligence Studio',
    oneLiner: 'Multimodal codebase atlas and architecture synthesis',
    architecturePattern: 'Hybrid Edge Next.js + Cloud Run Engine',
    techStackBadges: ['TypeScript', 'Next.js', 'React', 'Gemini 4'],
    files: [
      {
        path: 'src/client/App.tsx',
        name: 'App.tsx',
        directory: 'src/client',
        extension: '.tsx',
        language: 'TypeScript',
        sizeBytes: 2400,
        lineCount: 80,
        estimatedTokens: 600,
        imports: [],
        resolvedImports: [],
        exports: ['App'],
        symbols: [{ name: 'App', kind: 'component', line: 10, exported: true }],
        layer: 'client',
        centrality: 0.9,
        fanIn: 0,
        fanOut: 5,
        isEntrypoint: true,
        isTest: false,
        isConfig: false,
      },
      {
        path: 'src/server/router.ts',
        name: 'router.ts',
        directory: 'src/server',
        extension: '.ts',
        language: 'TypeScript',
        sizeBytes: 1800,
        lineCount: 60,
        estimatedTokens: 450,
        imports: [],
        resolvedImports: [],
        exports: ['appRouter'],
        symbols: [{ name: 'appRouter', kind: 'function', line: 5, exported: true }],
        layer: 'edge',
        centrality: 0.8,
        fanIn: 2,
        fanOut: 4,
        isEntrypoint: false,
        isTest: false,
        isConfig: false,
      },
      {
        path: 'src/domain/Synthesizer.ts',
        name: 'Synthesizer.ts',
        directory: 'src/domain',
        extension: '.ts',
        language: 'TypeScript',
        sizeBytes: 3200,
        lineCount: 110,
        estimatedTokens: 800,
        imports: [],
        resolvedImports: [],
        exports: ['Synthesizer'],
        symbols: [
          { name: 'Synthesizer', kind: 'class', line: 12, exported: true },
          { name: 'synthesize', kind: 'method', line: 20, exported: true },
        ],
        layer: 'domain',
        centrality: 0.85,
        fanIn: 3,
        fanOut: 2,
        isEntrypoint: false,
        isTest: false,
        isConfig: false,
      },
      {
        path: 'src/data/db.ts',
        name: 'db.ts',
        directory: 'src/data',
        extension: '.ts',
        language: 'TypeScript',
        sizeBytes: 1500,
        lineCount: 45,
        estimatedTokens: 350,
        imports: [],
        resolvedImports: [],
        exports: ['queryDb'],
        symbols: [{ name: 'queryDb', kind: 'function', line: 8, exported: true }],
        layer: 'data',
        centrality: 0.7,
        fanIn: 4,
        fanOut: 1,
        isEntrypoint: false,
        isTest: false,
        isConfig: false,
      },
    ],
    dependencyEdges: [],
    subsystems: [
      {
        id: 'sub-ui',
        name: 'Client Interface',
        tagline: 'Interactive visual canvas studio',
        layer: 'client',
        color: '#38BDF8',
        nodeIds: ['node-app'],
        filePaths: ['src/client/App.tsx'],
        entrypointPaths: ['src/client/App.tsx'],
        totalTokens: 600,
        summaryBullets: ['React 19 Canvas interface', 'Obsidian Cobalt design system'],
        invariants: ['Zero unstyled flash'],
      },
      {
        id: 'sub-domain',
        name: 'Diagram Engine',
        tagline: 'Mermaid code synthesis and sanitization',
        layer: 'domain',
        color: '#818CF8',
        nodeIds: ['node-synth'],
        filePaths: ['src/domain/Synthesizer.ts'],
        entrypointPaths: ['src/domain/Synthesizer.ts'],
        totalTokens: 800,
        summaryBullets: ['LLM diagram generation', 'Deterministic AST fallbacks'],
        invariants: ['XSS safe output'],
      },
    ],
    nodes: [
      {
        id: 'node-app',
        label: 'StudioCanvas',
        subtitle: 'Obsidian Cobalt visualization UI',
        subsystemId: 'sub-ui',
        layer: 'client',
        kind: 'ui',
        filePaths: ['src/client/App.tsx'],
        primaryFile: 'src/client/App.tsx',
        estimatedTokens: 600,
        centrality: 0.9,
        fanIn: 0,
        fanOut: 2,
        keySymbols: ['App'],
        visualBrief: 'Interactive 2D/3D visual canvas for codebase navigation',
        inputs: ['User Gestures', 'WebSocket Events'],
        outputs: ['Render Loop'],
      },
      {
        id: 'node-synth',
        label: 'DiagramSynthesizer',
        subtitle: 'Mermaid diagram generator',
        subsystemId: 'sub-domain',
        layer: 'domain',
        kind: 'service',
        filePaths: ['src/domain/Synthesizer.ts'],
        primaryFile: 'src/domain/Synthesizer.ts',
        estimatedTokens: 800,
        centrality: 0.85,
        fanIn: 1,
        fanOut: 1,
        keySymbols: ['Synthesizer', 'synthesize'],
        visualBrief: 'Synthesizes and validates Mermaid specs',
        inputs: ['Atlas Blueprint'],
        outputs: ['MermaidDiagramSpec'],
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-app',
        target: 'node-synth',
        label: 'requests diagram',
        kind: 'control',
        weight: 1.0,
        isHotPath: true,
      },
    ],
    strata: [],
    flows: [
      {
        id: 'flow-render',
        title: 'Diagram Synthesis Pipeline',
        subtitle: 'End-to-end flow from user request to visual diagram',
        trigger: 'User selects Mermaid lens',
        category: 'request',
        steps: [
          {
            stepNumber: 1,
            title: 'Request Synthesis',
            action: 'Dispatches blueprint request',
            fromNodeId: 'node-app',
            toNodeId: 'node-synth',
            edgeLabel: 'POST /api/diagrams',
            filePath: 'src/client/App.tsx',
            lineStart: 25,
            lineEnd: 30,
          },
        ],
      },
    ],
    codemapTour: [],
    diagrams: [],
    treemap: {
      id: 'root',
      name: 'root',
      path: '',
      kind: 'dir',
      tokens: 2200,
      bytes: 8900,
      fileCount: 4,
    },
    posters: [],
    audioTours: [],
    videoReels: [],
    stats: {
      totalFiles: 4,
      analyzedFiles: 4,
      totalLines: 295,
      totalTokens: 2200,
      totalBytes: 8900,
      circularDeps: 0,
      avgFanOut: 1.5,
      ingestLatencyMs: 120,
    },
    aiEnriched: true,
    modelsUsed: ['gemini-4-neon'],
    generatedAt: '2026-11-22T02:00:00Z',
  };
}

// =============================================================================
// 1. Mermaid Fence Stripping Tests
// =============================================================================

describe('sanitizeMermaidCode — Markdown Fence Stripping', () => {
  it('strips ```mermaid code block fences cleanly', () => {
    const raw = '```mermaid\nflowchart TD\n  A["Client"] --> B["Server"]\n```';
    const result = sanitizeMermaidCode(raw);

    expect(result.code).toBe('flowchart TD\n  A["Client"] --> B["Server"]');
    expect(result.repaired).toBe(true);
  });

  it('strips generic ``` code block fences without language tag', () => {
    const raw = '```\nflowchart LR\n  Alpha --> Beta\n```';
    const result = sanitizeMermaidCode(raw);

    expect(result.code).toBe('flowchart LR\n  Alpha --> Beta');
    expect(result.repaired).toBe(true);
  });

  it('strips standalone leading or trailing backticks', () => {
    const rawLeading = '```mermaid\nsequenceDiagram\n  autonumber\n  Alice->>Bob: Hello';
    const resultLeading = sanitizeMermaidCode(rawLeading);

    expect(resultLeading.code.startsWith('sequenceDiagram')).toBe(true);
    expect(resultLeading.repaired).toBe(true);

    const rawTrailing = 'flowchart TD\n  A --> B\n```';
    const resultTrailing = sanitizeMermaidCode(rawTrailing);

    expect(resultTrailing.code).toBe('flowchart TD\n  A --> B');
    expect(resultTrailing.repaired).toBe(true);
  });

  it('preserves clean Mermaid code that has no fences or repairable issues', () => {
    const clean = 'flowchart TD\n  A["Client"] --> B["Server"]';
    const result = sanitizeMermaidCode(clean);

    expect(result.code).toBe(clean);
    expect(result.repaired).toBe(false);
  });

  it('handles empty string or non-string inputs with safe fallback diagram', () => {
    const emptyResult = sanitizeMermaidCode('');
    expect(emptyResult.code).toContain('flowchart TD');
    expect(emptyResult.code).toContain('Empty["Empty Diagram"]');
    expect(emptyResult.repaired).toBe(true);

    const whitespaceResult = sanitizeMermaidCode('   \n\t  ');
    expect(whitespaceResult.code).toContain('flowchart TD');
    expect(whitespaceResult.repaired).toBe(true);

    // @ts-expect-error Testing runtime resilience against null
    const nullResult = sanitizeMermaidCode(null);
    expect(nullResult.code).toContain('flowchart TD');
    expect(nullResult.repaired).toBe(true);
  });
});

// =============================================================================
// 2. XSS Injection Removal Tests
// =============================================================================

describe('sanitizeMermaidCode — XSS Injection Removal', () => {
  it('strips <script> tags and embedded executable scripts', () => {
    const raw = [
      'flowchart TD',
      '  A["Safe Node"] --> B["Target"]',
      '  <script>alert("xss")</script>',
    ].join('\n');

    const result = sanitizeMermaidCode(raw);

    expect(result.code).not.toContain('<script>');
    expect(result.code).not.toContain('alert("xss")');
    expect(result.code).toContain('A["Safe Node"] --> B["Target"]');
    expect(result.repaired).toBe(true);
  });

  it('strips uppercase and malformed SCRIPT tags', () => {
    const raw = [
      'flowchart TD',
      '  NodeA["Start"] --> NodeB["Finish"]',
      '  <SCRIPT SRC="https://evil.example.com/exploit.js"></SCRIPT>',
    ].join('\n');

    const result = sanitizeMermaidCode(raw);

    expect(result.code).not.toContain('<SCRIPT');
    expect(result.code).not.toContain('exploit.js');
    expect(result.repaired).toBe(true);
  });

  it('replaces javascript: pseudo-protocol with blocked:', () => {
    const raw = [
      'flowchart TD',
      '  click NodeA href "javascript:alert(document.cookie)" "Steal"',
    ].join('\n');

    const result = sanitizeMermaidCode(raw);

    expect(result.code).not.toContain('javascript:');
    expect(result.code).toContain('blocked:alert(document.cookie)');
    expect(result.repaired).toBe(true);
  });

  it('strips inline event handlers such as onerror, onload, and onclick', () => {
    const raw = [
      'flowchart TD',
      '  A["<img src=x onerror=alert(1)>"] --> B["Normal"]',
      '  click B href "https://safe.com" onload="doEvil()"',
    ].join('\n');

    const result = sanitizeMermaidCode(raw);

    expect(result.code).not.toContain('onerror=');
    expect(result.code).not.toContain('onload=');
    expect(result.repaired).toBe(true);
  });

  it('strips iframe, object, embed, and applet injection vectors', () => {
    const raw = [
      'flowchart TD',
      '  A["Iframe Attack"]',
      '  <iframe src="https://evil.com"></iframe>',
      '  <object data="data:text/html;base64,..."></object>',
      '  <embed src="flash.swf">',
      '  <applet code="Evil.class"></applet>',
    ].join('\n');

    const result = sanitizeMermaidCode(raw);

    expect(result.code).not.toContain('<iframe');
    expect(result.code).not.toContain('<object');
    expect(result.code).not.toContain('<embed');
    expect(result.code).not.toContain('<applet');
    expect(result.repaired).toBe(true);
  });
});

// =============================================================================
// 3. Node Label Quoting & Syntax Repair Tests
// =============================================================================

describe('sanitizeMermaidCode — Node Label Quoting & Header Repair', () => {
  it('quotes unquoted parentheses in rectangular node labels', () => {
    const raw = 'flowchart TD\n  Client[Browser UI (React 19)] --> API[Gateway (REST)]';
    const result = sanitizeMermaidCode(raw);

    expect(result.code).toContain('Client["Browser UI (React 19)"]');
    expect(result.code).toContain('API["Gateway (REST)"]');
    expect(result.repaired).toBe(true);
  });

  it('quotes unquoted brackets and colons in round node labels', () => {
    const raw = 'flowchart TD\n  Worker(Worker [Async: Celery]) --> Store(Cache [LRU])';
    const result = sanitizeMermaidCode(raw);

    expect(result.code).toContain('Worker("Worker [Async: Celery]")');
    expect(result.code).toContain('Store("Cache [LRU]")');
    expect(result.repaired).toBe(true);
  });

  it('quotes unquoted curly braces in cylinder / database node labels', () => {
    const raw = 'flowchart TD\n  DB[(Postgres {Primary Cluster})] --> Replica[(Read {Replica})]';
    const result = sanitizeMermaidCode(raw);

    expect(result.code).toContain('DB[("Postgres {Primary Cluster}")]');
    expect(result.code).toContain('Replica[("Read {Replica}")]');
    expect(result.repaired).toBe(true);
  });

  it('quotes stadium and hexagon nodes with special characters', () => {
    const raw = 'flowchart TD\n  Start([Ingress (Port 443)]) --> Dec{{Validate [Schema]}}';
    const result = sanitizeMermaidCode(raw);

    expect(result.code).toContain('Start(["Ingress (Port 443)"])');
    expect(result.code).toContain('Dec{{"Validate [Schema]"}}');
    expect(result.repaired).toBe(true);
  });

  it('quotes subroutine and flag node shapes with special characters', () => {
    const raw = 'flowchart TD\n  Sub[[Subroutine: Auth]] --> Flag>Process (Async)]';
    const result = sanitizeMermaidCode(raw);

    expect(result.code).toContain('Sub[["Subroutine: Auth"]]');
    expect(result.code).toContain('Flag>"Process (Async)"]');
    expect(result.repaired).toBe(true);
  });

  it('quotes edge labels between pipes containing parentheses or punctuation', () => {
    const raw = 'flowchart TD\n  A -->|HTTP (POST /api/v1)| B';
    const result = sanitizeMermaidCode(raw);

    expect(result.code).toContain('A -->|"HTTP (POST /api/v1)"| B');
    expect(result.repaired).toBe(true);
  });

  it('quotes subgraph titles containing unquoted parentheses or brackets', () => {
    const raw = [
      'flowchart TD',
      '  subgraph SG_1[Client Layer (React & Vite)]',
      '    Web["App"]',
      '  end',
    ].join('\n');

    const result = sanitizeMermaidCode(raw);

    expect(result.code).toContain('subgraph SG_1["Client Layer (React & Vite)"]');
    expect(result.repaired).toBe(true);
  });

  it('does not re-quote already quoted labels', () => {
    const raw = 'flowchart TD\n  NodeA["Safe (Label)"] --> NodeB["Another [Good]"]';
    const result = sanitizeMermaidCode(raw);

    expect(result.code).toBe(raw);
    expect(result.repaired).toBe(false);
  });

  it('auto-injects flowchart TD header when missing', () => {
    const raw = '  App["Client"] --> API["Gateway"]';
    const result = sanitizeMermaidCode(raw);

    expect(result.code.startsWith('flowchart TD')).toBe(true);
    expect(result.code).toContain('App["Client"] --> API["Gateway"]');
    expect(result.repaired).toBe(true);
  });

  it('auto-injects sequenceDiagram header when sequence syntax is detected', () => {
    const raw = '  Alice->>Bob: Authentication Request\n  Bob-->>Alice: Token Granted';
    const result = sanitizeMermaidCode(raw);

    expect(result.code.startsWith('sequenceDiagram')).toBe(true);
    expect(result.code).toContain('Alice->>Bob: Authentication Request');
    expect(result.repaired).toBe(true);
  });

  it('auto-injects classDiagram header when class diagram syntax is detected', () => {
    const raw = '  class Animal {\n    +name: string\n    +makeSound()\n  }\n  Dog <|-- Animal';
    const result = sanitizeMermaidCode(raw);

    expect(result.code.startsWith('classDiagram')).toBe(true);
    expect(result.code).toContain('class Animal');
    expect(result.repaired).toBe(true);
  });

  it('preserves top-level comments while repairing headers', () => {
    const raw = '%% Obsidian Cobalt Architecture\n  A --> B';
    const result = sanitizeMermaidCode(raw);

    const lines = result.code.split('\n');
    expect(lines[0]).toBe('%% Obsidian Cobalt Architecture');
    expect(lines[1]).toBe('flowchart TD');
    expect(result.repaired).toBe(true);
  });
});

// =============================================================================
// 4. Clickable Node Links Binding Tests
// =============================================================================

describe('bindClickableNodeLinks — Interactive GitHub Source Links', () => {
  const repoHtmlUrl = 'https://github.com/gitunderstand/studio';
  const branch = 'main';

  it('binds click directives to flowchart nodes with correct GitHub blob URLs', () => {
    const code = [
      'flowchart TD',
      '  WebUI["Web Canvas UI"] --> ApiGateway["Express API"]',
      '  ApiGateway --> Engine["Gemini Synthesizer"]',
    ].join('\n');

    const nodeFileMap = {
      WebUI: 'studio/src/components/Canvas.tsx',
      ApiGateway: 'backend/src/server.ts',
      Engine: 'backend/src/gemini/diagramSynthesizer.ts',
    };

    const bound = bindClickableNodeLinks(code, nodeFileMap, repoHtmlUrl, branch);

    expect(bound).toContain('%% Interactive Source Links');
    expect(bound).toContain(
      'click WebUI href "https://github.com/gitunderstand/studio/blob/main/studio/src/components/Canvas.tsx" "View studio/src/components/Canvas.tsx" _blank'
    );
    expect(bound).toContain(
      'click ApiGateway href "https://github.com/gitunderstand/studio/blob/main/backend/src/server.ts" "View backend/src/server.ts" _blank'
    );
    expect(bound).toContain(
      'click Engine href "https://github.com/gitunderstand/studio/blob/main/backend/src/gemini/diagramSynthesizer.ts" "View backend/src/gemini/diagramSynthesizer.ts" _blank'
    );
  });

  it('binds link directives to sequence diagram participants', () => {
    const code = [
      'sequenceDiagram',
      '  autonumber',
      '  participant Client as Browser UI',
      '  participant Router as API Router',
      '  Client->>Router: GET /api/atlas',
      '  Router-->>Client: 200 OK',
    ].join('\n');

    const nodeFileMap = {
      Client: 'studio/src/App.tsx',
      Router: 'backend/src/server/router.ts',
    };

    const bound = bindClickableNodeLinks(code, nodeFileMap, repoHtmlUrl, branch);

    expect(bound).toContain(
      'link Client: View source @ https://github.com/gitunderstand/studio/blob/main/studio/src/App.tsx'
    );
    expect(bound).toContain(
      'link Router: View source @ https://github.com/gitunderstand/studio/blob/main/backend/src/server/router.ts'
    );
  });

  it('binds link directives to class diagram entities', () => {
    const code = [
      'classDiagram',
      '  class AtlasBuilder {',
      '    +build()',
      '  }',
      '  class Synthesizer {',
      '    +synthesize()',
      '  }',
      '  AtlasBuilder --> Synthesizer : invokes',
    ].join('\n');

    const nodeFileMap = {
      AtlasBuilder: 'backend/src/atlas/builder.ts',
      Synthesizer: 'backend/src/gemini/diagramSynthesizer.ts',
    };

    const bound = bindClickableNodeLinks(code, nodeFileMap, repoHtmlUrl, branch);

    expect(bound).toContain(
      'link AtlasBuilder href "https://github.com/gitunderstand/studio/blob/main/backend/src/atlas/builder.ts" "View backend/src/atlas/builder.ts"'
    );
    expect(bound).toContain(
      'link Synthesizer href "https://github.com/gitunderstand/studio/blob/main/backend/src/gemini/diagramSynthesizer.ts" "View backend/src/gemini/diagramSynthesizer.ts"'
    );
  });

  it('skips nodes from nodeFileMap that do not exist in the diagram code', () => {
    const code = [
      'flowchart TD',
      '  NodeA["Component A"] --> NodeB["Component B"]',
    ].join('\n');

    const nodeFileMap = {
      NodeA: 'src/A.ts',
      NodeB: 'src/B.ts',
      NodeGhost: 'src/Ghost.ts', // Not in diagram code
    };

    const bound = bindClickableNodeLinks(code, nodeFileMap, repoHtmlUrl, branch);

    expect(bound).toContain('click NodeA href');
    expect(bound).toContain('click NodeB href');
    expect(bound).not.toContain('NodeGhost');
  });

  it('prevents duplicate click or link directives if already bound', () => {
    const code = [
      'flowchart TD',
      '  NodeA["Component A"] --> NodeB["Component B"]',
      '  click NodeA href "https://github.com/gitunderstand/studio/blob/main/src/A.ts" "View src/A.ts" _blank',
    ].join('\n');

    const nodeFileMap = {
      NodeA: 'src/A.ts',
      NodeB: 'src/B.ts',
    };

    const bound = bindClickableNodeLinks(code, nodeFileMap, repoHtmlUrl, branch);

    // NodeA should only appear once in click directives
    const clickNodeACount = (bound.match(/click\s+NodeA\b/g) || []).length;
    expect(clickNodeACount).toBe(1);

    // NodeB should be added
    expect(bound).toContain('click NodeB href');
  });

  it('handles trailing slashes on repoUrl and leading slashes on file paths', () => {
    const code = 'flowchart TD\n  App["Main App"]';
    const nodeFileMap = {
      App: '/src/index.ts',
    };

    const bound = bindClickableNodeLinks(
      code,
      nodeFileMap,
      'https://github.com/gitunderstand/studio///',
      'main'
    );

    expect(bound).toContain(
      'click App href "https://github.com/gitunderstand/studio/blob/main/src/index.ts" "View src/index.ts" _blank'
    );
  });

  it('encodes special path segments and characters safely in GitHub URL', () => {
    const code = 'flowchart TD\n  Node["Special Path"]';
    const nodeFileMap = {
      Node: 'src/features/@canvas/Visual Node.tsx',
    };

    const bound = bindClickableNodeLinks(code, nodeFileMap, repoHtmlUrl, 'release/v3.0.0');

    expect(bound).toContain('release%2Fv3.0.0');
    expect(bound).toContain('Visual%20Node.tsx');
  });

  it('returns original code untouched when nodeFileMap is empty', () => {
    const code = 'flowchart TD\n  A --> B';
    const bound = bindClickableNodeLinks(code, {}, repoHtmlUrl, branch);

    expect(bound).toBe(code);
  });
});

// =============================================================================
// 5. Deterministic Diagram Synthesis & Modification Tests
// =============================================================================

describe('Deterministic Fallback Synthesis & Diagram Modification', () => {
  it('generates a complete 3-diagram suite (architecture, sequence, class) without Gemini credentials', async () => {
    const blueprint = createMockBlueprint();

    // Call generateMermaidSuite without API key (forces deterministic fallback)
    const suite = await generateMermaidSuite(blueprint);

    expect(suite).toHaveLength(3);

    const archDiag = suite.find((d) => d.kind === 'architecture');
    const seqDiag = suite.find((d) => d.kind === 'sequence');
    const classDiag = suite.find((d) => d.kind === 'class');

    expect(archDiag).toBeDefined();
    expect(seqDiag).toBeDefined();
    expect(classDiag).toBeDefined();

    // Architecture diagram assertions
    expect(archDiag!.code).toContain('flowchart TD');
    expect(archDiag!.code).toContain('classDef client');
    expect(archDiag!.code).toContain('classDef domain');
    expect(Object.keys(archDiag!.nodeFileMap).length).toBeGreaterThan(0);
    expect(archDiag!.modelUsed).toBe('deterministic-atlas-v1');

    // Sequence diagram assertions
    expect(seqDiag!.code).toContain('sequenceDiagram');
    expect(seqDiag!.code).toContain('autonumber');
    expect(seqDiag!.modelUsed).toBe('deterministic-flow-v1');

    // Class diagram assertions
    expect(classDiag!.code).toContain('classDiagram');
    expect(classDiag!.modelUsed).toBe('deterministic-class-v1');
  });

  it('supports generating a subset of requested diagram kinds', async () => {
    const blueprint = createMockBlueprint();

    const suite = await generateMermaidSuite(blueprint, {
      kinds: ['architecture'],
    });

    expect(suite).toHaveLength(1);
    expect(suite[0].kind).toBe('architecture');
  });

  it('modifies flowchart orientation deterministically when requested (TD -> LR and LR -> TD)', async () => {
    const blueprint = createMockBlueprint();

    const initialDiag: MermaidDiagramSpec = {
      id: 'diag-test-1',
      kind: 'architecture',
      title: 'Initial Architecture',
      subtitle: 'Component topology',
      code: 'flowchart TD\n  NodeA["App"] --> NodeB["Server"]',
      nodeFileMap: { NodeA: 'src/app.ts', NodeB: 'src/server.ts' },
      modelUsed: 'test-model',
      generatedAt: new Date().toISOString(),
    };

    // Refine to Left-to-Right
    const modifiedLR = await modifyMermaidDiagram(
      blueprint,
      initialDiag,
      'Change diagram layout from top down to left to right'
    );

    expect(modifiedLR.code).toContain('flowchart LR');
    expect(modifiedLR.code).not.toContain('flowchart TD');
    expect(modifiedLR.subtitle).toContain('Refined: Change diagram layout from top down to left to r');

    // Refine back to Top-Down
    const modifiedTD = await modifyMermaidDiagram(
      blueprint,
      modifiedLR,
      'Switch back to top down orientation'
    );

    expect(modifiedTD.code).toContain('flowchart TD');
    expect(modifiedTD.code).not.toContain('flowchart LR');
  });

  it('injects autonumber deterministically into sequence diagrams when requested', async () => {
    const blueprint = createMockBlueprint();

    const initialSeq: MermaidDiagramSpec = {
      id: 'diag-test-seq',
      kind: 'sequence',
      title: 'Request Sequence',
      subtitle: 'Execution flow',
      code: 'sequenceDiagram\n  Client->>Server: Request\n  Server-->>Client: Response',
      nodeFileMap: { Client: 'src/client.ts', Server: 'src/server.ts' },
      modelUsed: 'test-model',
      generatedAt: new Date().toISOString(),
    };

    const updated = await modifyMermaidDiagram(
      blueprint,
      initialSeq,
      'Add autonumber to steps'
    );

    expect(updated.code).toContain('sequenceDiagram\n  autonumber');
    expect(updated.code).toContain('Client->>Server: Request');
  });
});
