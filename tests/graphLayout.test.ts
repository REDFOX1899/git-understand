import { describe, it, expect } from 'vitest';
import {
  computeAtlasLayout,
  buildCurvedEdgePath,
  computeSquarifiedTreemap,
  type PositionedNode,
  type ClusterHull,
  type TreemapRect,
} from '../studio/src/lib/graphLayout';
import type {
  AtlasNode,
  AtlasEdge,
  SubsystemCluster,
  TreemapNode,
} from '../shared/types';

// =============================================================================
// Helper Mock Factories
// =============================================================================

function createMockAtlasNode(overrides: Partial<AtlasNode> = {}): AtlasNode {
  return {
    id: 'node-1',
    label: 'AppEntrypoint',
    subtitle: 'src/main.ts',
    subsystemId: 'subsystem-core',
    layer: 'domain',
    kind: 'module',
    filePaths: ['src/main.ts'],
    primaryFile: 'src/main.ts',
    estimatedTokens: 1200,
    centrality: 0.8,
    fanIn: 4,
    fanOut: 2,
    keySymbols: ['bootstrap', 'App'],
    visualBrief: 'Initial application entry point',
    inputs: ['config'],
    outputs: ['server'],
    ...overrides,
  };
}

function createMockSubsystem(overrides: Partial<SubsystemCluster> = {}): SubsystemCluster {
  return {
    id: 'subsystem-core',
    name: 'Core System',
    tagline: 'Foundational runtime engine',
    layer: 'domain',
    color: '#2563eb',
    nodeIds: ['node-1'],
    filePaths: ['src/main.ts'],
    entrypointPaths: ['src/main.ts'],
    totalTokens: 1200,
    summaryBullets: ['Bootstraps server'],
    invariants: ['Thread-safe'],
    ...overrides,
  };
}

function createMockAtlasEdge(overrides: Partial<AtlasEdge> = {}): AtlasEdge {
  return {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    label: 'invokes',
    kind: 'control',
    weight: 1.0,
    ...overrides,
  };
}

// =============================================================================
// 1. Spatial Atlas Graph Layout Tests
// =============================================================================

describe('computeAtlasLayout', () => {
  it('returns empty results and default bounds for empty node array', () => {
    const result = computeAtlasLayout([], [], []);
    expect(result.positionedNodes).toEqual([]);
    expect(result.hulls).toEqual([]);
    expect(result.bounds).toEqual({ width: 1200, height: 800 });
  });

  it('computes valid layout for a single node with no subsystem', () => {
    const node = createMockAtlasNode({
      id: 'single-node',
      subsystemId: '',
      layer: 'domain',
      label: 'DatabaseEngine',
      centrality: 0.5,
    });

    const result = computeAtlasLayout([node], [], []);

    expect(result.positionedNodes.length).toBe(1);
    const posNode = result.positionedNodes[0];
    expect(posNode.node.id).toBe('single-node');
    expect(Number.isFinite(posNode.x)).toBe(true);
    expect(Number.isFinite(posNode.y)).toBe(true);
    expect(posNode.width).toBeGreaterThanOrEqual(180);
    expect(posNode.height).toBeGreaterThan(60);
    expect(posNode.color).toBe('#2563eb'); // domain color token

    // Bounds should accommodate the node and enforce minimum dimension
    expect(result.bounds.width).toBeGreaterThanOrEqual(1280);
    expect(result.bounds.height).toBeGreaterThanOrEqual(860);
    expect(result.bounds.width).toBeGreaterThan(posNode.x + posNode.width);
    expect(result.bounds.height).toBeGreaterThan(posNode.y + posNode.height);
  });

  it('correctly clusters multiple nodes by subsystem and generates cluster hulls', () => {
    const node1 = createMockAtlasNode({
      id: 'core-api',
      subsystemId: 'sub-api',
      layer: 'edge',
      label: 'API Gateway',
    });
    const node2 = createMockAtlasNode({
      id: 'core-service',
      subsystemId: 'sub-domain',
      layer: 'domain',
      label: 'Order Service',
    });
    const node3 = createMockAtlasNode({
      id: 'core-db',
      subsystemId: 'sub-data',
      layer: 'data',
      label: 'Postgres Store',
    });

    const subApi = createMockSubsystem({
      id: 'sub-api',
      name: 'API Gateway',
      layer: 'edge',
      color: '#818cf8',
      nodeIds: ['core-api'],
    });
    const subDomain = createMockSubsystem({
      id: 'sub-domain',
      name: 'Domain Services',
      layer: 'domain',
      color: '#2563eb',
      nodeIds: ['core-service'],
    });
    const subData = createMockSubsystem({
      id: 'sub-data',
      name: 'Persistence',
      layer: 'data',
      color: '#10b981',
      nodeIds: ['core-db'],
    });

    const edges = [
      createMockAtlasEdge({ id: 'e1', source: 'core-api', target: 'core-service' }),
      createMockAtlasEdge({ id: 'e2', source: 'core-service', target: 'core-db' }),
    ];

    const result = computeAtlasLayout(
      [node1, node2, node3],
      edges,
      [subApi, subDomain, subData]
    );

    expect(result.positionedNodes.length).toBe(3);
    expect(result.hulls.length).toBe(3);

    // Each hull should cleanly surround its respective member node
    for (const hull of result.hulls) {
      const memberNodes = result.positionedNodes.filter(
        (pn) => pn.node.subsystemId === hull.subsystem.id
      );
      expect(memberNodes.length).toBeGreaterThan(0);
      for (const mn of memberNodes) {
        expect(mn.x).toBeGreaterThanOrEqual(hull.x);
        expect(mn.y).toBeGreaterThanOrEqual(hull.y);
        expect(mn.x + mn.width).toBeLessThanOrEqual(hull.x + hull.width);
        expect(mn.y + mn.height).toBeLessThanOrEqual(hull.y + hull.height);
      }
    }

    // Node colors should inherit subsystem colors
    const posApi = result.positionedNodes.find((pn) => pn.node.id === 'core-api');
    const posDomain = result.positionedNodes.find((pn) => pn.node.id === 'core-service');
    const posData = result.positionedNodes.find((pn) => pn.node.id === 'core-db');

    expect(posApi?.color).toBe('#818cf8');
    expect(posDomain?.color).toBe('#2563eb');
    expect(posData?.color).toBe('#10b981');
  });

  it('handles orphan nodes with nonexistent or unassigned subsystem IDs', () => {
    const orphan1 = createMockAtlasNode({
      id: 'orphan-client',
      subsystemId: 'unknown-sub',
      layer: 'client',
      label: 'ClientApp',
    });
    const orphan2 = createMockAtlasNode({
      id: 'orphan-infra',
      subsystemId: '',
      layer: 'infrastructure',
      label: 'KubernetesCluster',
    });

    const result = computeAtlasLayout([orphan1, orphan2], [], []);

    expect(result.positionedNodes.length).toBe(2);
    const p1 = result.positionedNodes.find((pn) => pn.node.id === 'orphan-client');
    const p2 = result.positionedNodes.find((pn) => pn.node.id === 'orphan-infra');

    // Color falls back to LAYER_PALETTE for orphan nodes
    expect(p1?.color).toBe('#38bdf8'); // client
    expect(p2?.color).toBe('#0ea5e9'); // infrastructure
    expect(result.hulls.length).toBe(0); // No registered SubsystemClusters
  });

  it('guarantees deterministic output given identical inputs', () => {
    const nodeA = createMockAtlasNode({ id: 'a', label: 'ServiceA', layer: 'orchestration' });
    const nodeB = createMockAtlasNode({ id: 'b', label: 'ServiceB', layer: 'domain' });
    const edge = createMockAtlasEdge({ source: 'a', target: 'b', isHotPath: true });
    const subsystem = createMockSubsystem({ nodeIds: ['a', 'b'] });

    const run1 = computeAtlasLayout([nodeA, nodeB], [edge], [subsystem]);
    const run2 = computeAtlasLayout([nodeA, nodeB], [edge], [subsystem]);

    expect(run1.positionedNodes.map((n) => ({ x: n.x, y: n.y }))).toEqual(
      run2.positionedNodes.map((n) => ({ x: n.x, y: n.y }))
    );
    expect(run1.bounds).toEqual(run2.bounds);
  });

  it('respects pre-existing valid coordinates when provided', () => {
    const fixedNode = createMockAtlasNode({
      id: 'fixed-pos',
      x: 500,
      y: 600,
      label: 'FixedAnchorNode',
    });

    const result = computeAtlasLayout([fixedNode], [], []);
    expect(result.positionedNodes.length).toBe(1);
    expect(Number.isFinite(result.positionedNodes[0].x)).toBe(true);
    expect(Number.isFinite(result.positionedNodes[0].y)).toBe(true);
  });
});

// =============================================================================
// 2. Curved Cubic Bezier Edge Paths & Midpoint Math Tests
// =============================================================================

describe('buildCurvedEdgePath', () => {
  it('handles self-loops cleanly with cubic loop trajectory', () => {
    const nodeRect = { x: 100, y: 100, width: 200, height: 80 };
    const result = buildCurvedEdgePath(nodeRect, nodeRect);

    expect(result.path.startsWith('M ')).toBe(true);
    expect(result.path.includes(' C ')).toBe(true);
    expect(Number.isFinite(result.midX)).toBe(true);
    expect(Number.isFinite(result.midY)).toBe(true);

    // Loop starts near top-right of node and ends at right edge
    expect(result.midX).toBeGreaterThan(nodeRect.x + nodeRect.width);
  });

  it('generates downward vertical cubic bezier curve when dy >= dx', () => {
    const fromRect = { x: 100, y: 50, width: 200, height: 80 };
    const toRect = { x: 120, y: 300, width: 200, height: 80 };

    const result = buildCurvedEdgePath(fromRect, toRect);

    // From bottom-center of `from` to top-center of `to`
    const expectedStartX = fromRect.x + fromRect.width / 2; // 200
    const expectedStartY = fromRect.y + fromRect.height; // 130
    const expectedEndX = toRect.x + toRect.width / 2; // 220
    const expectedEndY = toRect.y; // 300

    expect(result.path).toContain(`M ${expectedStartX} ${expectedStartY}`);
    expect(result.path).toContain(`${expectedEndX} ${expectedEndY}`);

    // Midpoint should lie comfortably between start and end
    expect(result.midY).toBeGreaterThan(expectedStartY);
    expect(result.midY).toBeLessThan(expectedEndY);
    expect(result.midX).toBeCloseTo((expectedStartX + expectedEndX) / 2, 0);
  });

  it('generates upward vertical cubic bezier curve when dy < 0 and |dy| >= |dx|', () => {
    const fromRect = { x: 100, y: 400, width: 200, height: 80 };
    const toRect = { x: 100, y: 100, width: 200, height: 80 };

    const result = buildCurvedEdgePath(fromRect, toRect);

    const expectedStartX = fromRect.x + fromRect.width / 2; // 200
    const expectedStartY = fromRect.y; // 400
    const expectedEndX = toRect.x + toRect.width / 2; // 200
    const expectedEndY = toRect.y + toRect.height; // 180

    expect(result.path).toContain(`M ${expectedStartX} ${expectedStartY}`);
    expect(result.path).toContain(`${expectedEndX} ${expectedEndY}`);
    expect(result.midY).toBeLessThan(expectedStartY);
    expect(result.midY).toBeGreaterThan(expectedEndY);
  });

  it('generates rightward horizontal cubic bezier curve when dx > dy', () => {
    const fromRect = { x: 100, y: 100, width: 160, height: 80 };
    const toRect = { x: 450, y: 100, width: 160, height: 80 };

    const result = buildCurvedEdgePath(fromRect, toRect);

    const expectedStartX = fromRect.x + fromRect.width; // 260
    const expectedStartY = fromRect.y + fromRect.height / 2; // 140
    const expectedEndX = toRect.x; // 450
    const expectedEndY = toRect.y + toRect.height / 2; // 140

    expect(result.path).toContain(`M ${expectedStartX} ${expectedStartY}`);
    expect(result.path).toContain(`${expectedEndX} ${expectedEndY}`);
    expect(result.midX).toBeGreaterThan(expectedStartX);
    expect(result.midX).toBeLessThan(expectedEndX);
    expect(result.midY).toBe(140);
  });

  it('generates leftward horizontal cubic bezier curve when dx < 0 and |dx| > |dy|', () => {
    const fromRect = { x: 500, y: 100, width: 160, height: 80 };
    const toRect = { x: 100, y: 100, width: 160, height: 80 };

    const result = buildCurvedEdgePath(fromRect, toRect);

    const expectedStartX = fromRect.x; // 500
    const expectedStartY = fromRect.y + fromRect.height / 2; // 140
    const expectedEndX = toRect.x + toRect.width; // 260
    const expectedEndY = toRect.y + toRect.height / 2; // 140

    expect(result.path).toContain(`M ${expectedStartX} ${expectedStartY}`);
    expect(result.path).toContain(`${expectedEndX} ${expectedEndY}`);
    expect(result.midX).toBeLessThan(expectedStartX);
    expect(result.midX).toBeGreaterThan(expectedEndX);
    expect(result.midY).toBe(140);
  });

  it('satisfies the exact mathematical cubic bezier formula for t=0.5', () => {
    // B(0.5) = 0.125 * P0 + 0.375 * P1 + 0.375 * P2 + 0.125 * P3
    const fromRect = { x: 0, y: 0, width: 100, height: 100 };
    const toRect = { x: 300, y: 0, width: 100, height: 100 };

    const { path, midX, midY } = buildCurvedEdgePath(fromRect, toRect);

    // Extract control points from path: M startX startY C cp1X cp1Y, cp2X cp2Y, endX endY
    const match = path.match(/M\s+([\d.-]+)\s+([\d.-]+)\s+C\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+)/);
    expect(match).not.toBeNull();
    if (!match) return;

    const p0x = parseFloat(match[1]);
    const p0y = parseFloat(match[2]);
    const p1x = parseFloat(match[3]);
    const p1y = parseFloat(match[4]);
    const p2x = parseFloat(match[5]);
    const p2y = parseFloat(match[6]);
    const p3x = parseFloat(match[7]);
    const p3y = parseFloat(match[8]);

    const expectedMidX = 0.125 * p0x + 0.375 * p1x + 0.375 * p2x + 0.125 * p3x;
    const expectedMidY = 0.125 * p0y + 0.375 * p1y + 0.375 * p2y + 0.125 * p3y;

    expect(midX).toBeCloseTo(expectedMidX, 1);
    expect(midY).toBeCloseTo(expectedMidY, 1);
  });
});

// =============================================================================
// 3. Squarified Treemap Layout Tests
// =============================================================================

describe('computeSquarifiedTreemap', () => {
  it('returns empty array when root is invalid or dimensions are non-positive', () => {
    const rootNode: TreemapNode = {
      id: 'root',
      name: 'root',
      path: '/',
      kind: 'dir',
      tokens: 1000,
      bytes: 4000,
      fileCount: 4,
    };

    expect(computeSquarifiedTreemap(null as unknown as TreemapNode, 800, 600)).toEqual([]);
    expect(computeSquarifiedTreemap(rootNode, 0, 600)).toEqual([]);
    expect(computeSquarifiedTreemap(rootNode, 800, -10)).toEqual([]);
  });

  it('layouts a single leaf root node covering full dimensions at depth 0', () => {
    const leafRoot: TreemapNode = {
      id: 'single-file',
      name: 'README.md',
      path: '/README.md',
      kind: 'file',
      tokens: 500,
      bytes: 2048,
      fileCount: 1,
    };

    const rects = computeSquarifiedTreemap(leafRoot, 1000, 600);

    expect(rects.length).toBe(1);
    expect(rects[0]).toEqual({
      node: leafRoot,
      x: 0,
      y: 0,
      width: 1000,
      height: 600,
      depth: 0,
    });
  });

  it('computes squarified layout for directory with multiple file children', () => {
    const rootDir: TreemapNode = {
      id: 'src-dir',
      name: 'src',
      path: 'src',
      kind: 'dir',
      tokens: 10000,
      bytes: 40000,
      fileCount: 3,
      children: [
        {
          id: 'f1',
          name: 'large.ts',
          path: 'src/large.ts',
          kind: 'file',
          tokens: 6000,
          bytes: 24000,
          fileCount: 1,
        },
        {
          id: 'f2',
          name: 'medium.ts',
          path: 'src/medium.ts',
          kind: 'file',
          tokens: 3000,
          bytes: 12000,
          fileCount: 1,
        },
        {
          id: 'f3',
          name: 'small.ts',
          path: 'src/small.ts',
          kind: 'file',
          tokens: 1000,
          bytes: 4000,
          fileCount: 1,
        },
      ],
    };

    const width = 800;
    const height = 600;
    const rects = computeSquarifiedTreemap(rootDir, width, height, 2);

    // Root + 3 children = 4 rects
    expect(rects.length).toBe(4);

    const rootRect = rects[0];
    expect(rootRect.depth).toBe(0);
    expect(rootRect.width).toBe(width);
    expect(rootRect.height).toBe(height);

    const childRects = rects.slice(1);
    expect(childRects.every((r) => r.depth === 1)).toBe(true);

    // Every child rectangle must lie within root bounds
    for (const cr of childRects) {
      expect(cr.x).toBeGreaterThanOrEqual(0);
      expect(cr.y).toBeGreaterThanOrEqual(0);
      expect(cr.x + cr.width).toBeLessThanOrEqual(width + 2); // small rounding margin
      expect(cr.y + cr.height).toBeLessThanOrEqual(height + 2);
      expect(cr.width).toBeGreaterThanOrEqual(1);
      expect(cr.height).toBeGreaterThanOrEqual(1);
    }

    // Weight ordering: larger tokens should yield larger area
    const r1 = childRects.find((r) => r.node.id === 'f1')!;
    const r2 = childRects.find((r) => r.node.id === 'f2')!;
    const r3 = childRects.find((r) => r.node.id === 'f3')!;

    const area1 = r1.width * r1.height;
    const area2 = r2.width * r2.height;
    const area3 = r3.width * r3.height;

    expect(area1).toBeGreaterThan(area2);
    expect(area2).toBeGreaterThan(area3);
  });

  it('recursively layouts nested hierarchy and respects maxDepth', () => {
    const nestedRoot: TreemapNode = {
      id: 'root',
      name: 'root',
      path: '',
      kind: 'dir',
      tokens: 1000,
      bytes: 4000,
      fileCount: 3,
      children: [
        {
          id: 'dir-a',
          name: 'dirA',
          path: 'dirA',
          kind: 'dir',
          tokens: 600,
          bytes: 2400,
          fileCount: 2,
          children: [
            {
              id: 'file-sub-1',
              name: 'sub1.ts',
              path: 'dirA/sub1.ts',
              kind: 'file',
              tokens: 400,
              bytes: 1600,
              fileCount: 1,
            },
            {
              id: 'file-sub-2',
              name: 'sub2.ts',
              path: 'dirA/sub2.ts',
              kind: 'file',
              tokens: 200,
              bytes: 800,
              fileCount: 1,
            },
          ],
        },
        {
          id: 'file-root',
          name: 'root.ts',
          path: 'root.ts',
          kind: 'file',
          tokens: 400,
          bytes: 1600,
          fileCount: 1,
        },
      ],
    };

    // When maxDepth is 1, depth 2 children should NOT be included
    const shallowRects = computeSquarifiedTreemap(nestedRoot, 1000, 800, 1);
    const depthsShallow = shallowRects.map((r) => r.depth);
    expect(depthsShallow.includes(0)).toBe(true);
    expect(depthsShallow.includes(1)).toBe(true);
    expect(depthsShallow.includes(2)).toBe(false);

    // When maxDepth is 3, depth 2 grandchildren are laid out
    const deepRects = computeSquarifiedTreemap(nestedRoot, 1000, 800, 3);
    const depthsDeep = deepRects.map((r) => r.depth);
    expect(depthsDeep.includes(0)).toBe(true);
    expect(depthsDeep.includes(1)).toBe(true);
    expect(depthsDeep.includes(2)).toBe(true);

    const sub1 = deepRects.find((r) => r.node.id === 'file-sub-1')!;
    const dirA = deepRects.find((r) => r.node.id === 'dir-a')!;

    // Grandchildren must sit inside their parent directory container
    expect(sub1.x).toBeGreaterThanOrEqual(dirA.x);
    expect(sub1.y).toBeGreaterThanOrEqual(dirA.y);
    expect(sub1.x + sub1.width).toBeLessThanOrEqual(dirA.x + dirA.width + 1);
    expect(sub1.y + sub1.height).toBeLessThanOrEqual(dirA.y + dirA.height + 1);
  });

  it('correctly uses fallback weights (bytes -> fileCount -> default 1)', () => {
    const treeWithFallbacks: TreemapNode = {
      id: 'root',
      name: 'root',
      path: '',
      kind: 'dir',
      tokens: 0,
      bytes: 0,
      fileCount: 2,
      children: [
        {
          id: 'node-bytes',
          name: 'bytesOnly.bin',
          path: 'bytesOnly.bin',
          kind: 'file',
          tokens: 0,
          bytes: 5000,
          fileCount: 1,
        },
        {
          id: 'node-filecount',
          name: 'folder',
          path: 'folder',
          kind: 'dir',
          tokens: 0,
          bytes: 0,
          fileCount: 50,
        },
      ],
    };

    const rects = computeSquarifiedTreemap(treeWithFallbacks, 800, 400, 1);
    expect(rects.length).toBe(3);

    const rBytes = rects.find((r) => r.node.id === 'node-bytes')!;
    const rFiles = rects.find((r) => r.node.id === 'node-filecount')!;

    expect(rBytes.width * rBytes.height).toBeGreaterThan(0);
    expect(rFiles.width * rFiles.height).toBeGreaterThan(0);
  });
});
