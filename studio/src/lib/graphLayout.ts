// =============================================================================
// GitUnderstand (git-understand.com) — Spatial Graph & Treemap Layout Math
// Pure deterministic layout engine (zero DOM dependencies).
// =============================================================================

import type {
  AtlasNode,
  AtlasEdge,
  SubsystemCluster,
  TreemapNode,
  ArchitectureLayer,
} from '@shared/types';

// -----------------------------------------------------------------------------
// Public Contracts
// -----------------------------------------------------------------------------

export interface PositionedNode {
  node: AtlasNode;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface ClusterHull {
  subsystem: SubsystemCluster;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreemapRect {
  node: TreemapNode;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

// -----------------------------------------------------------------------------
// Design System Color Tokens (Obsidian Cobalt / Archival Paper Semantic)
// -----------------------------------------------------------------------------

const LAYER_PALETTE: Record<ArchitectureLayer, string> = {
  client: '#38bdf8', // cobalt-ice / cyan
  edge: '#818cf8', // indigo
  orchestration: '#6366f1', // cobalt-bright
  domain: '#2563eb', // cobalt-core
  infrastructure: '#0ea5e9', // sky
  data: '#10b981', // emerald
  tooling: '#f59e0b', // amber
};

const LAYER_RANK: Record<ArchitectureLayer, number> = {
  client: 0,
  edge: 1,
  orchestration: 2,
  domain: 3,
  infrastructure: 4,
  data: 5,
  tooling: 6,
};

// -----------------------------------------------------------------------------
// 1. Spatial Atlas Graph Layout
// -----------------------------------------------------------------------------

interface NodeLayoutState {
  node: AtlasNode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  color: string;
  clusterId: string;
  layer: ArchitectureLayer;
}

/**
 * Deterministic Atlas layout computation.
 * Arranges nodes hierarchically by architectural layer and subsystem cluster,
 * followed by constraint relaxation with edge attraction, collision-avoidance,
 * and cluster cohesion forces.
 */
export function computeAtlasLayout(
  nodes: AtlasNode[],
  edges: AtlasEdge[],
  subsystems: SubsystemCluster[]
): {
  positionedNodes: PositionedNode[];
  hulls: ClusterHull[];
  bounds: { width: number; height: number };
} {
  if (!nodes || nodes.length === 0) {
    return {
      positionedNodes: [],
      hulls: [],
      bounds: { width: 1200, height: 800 },
    };
  }

  // Lookup maps for subsystems and layers
  const subsystemMap = new Map<string, SubsystemCluster>();
  for (const sub of subsystems) {
    subsystemMap.set(sub.id, sub);
  }

  // Group nodes by subsystem cluster (or fallback cluster if unassigned)
  const clusterToNodes = new Map<string, AtlasNode[]>();
  for (const node of nodes) {
    const clusterId = node.subsystemId || `layer_${node.layer || 'domain'}`;
    const list = clusterToNodes.get(clusterId) || [];
    list.push(node);
    clusterToNodes.set(clusterId, list);
  }

  // Determine clusters to render
  const clustersInOrder: Array<{
    id: string;
    subsystem?: SubsystemCluster;
    layer: ArchitectureLayer;
    nodes: AtlasNode[];
  }> = [];

  for (const sub of subsystems) {
    const cNodes = clusterToNodes.get(sub.id) || [];
    clustersInOrder.push({
      id: sub.id,
      subsystem: sub,
      layer: sub.layer || 'domain',
      nodes: cNodes,
    });
  }

  // Include any clusters generated from orphan nodes
  for (const [clusterId, cNodes] of clusterToNodes.entries()) {
    if (!subsystemMap.has(clusterId)) {
      const sampleLayer = cNodes[0]?.layer || 'domain';
      clustersInOrder.push({
        id: clusterId,
        layer: sampleLayer,
        nodes: cNodes,
      });
    }
  }

  // Sort clusters by architectural layer order
  clustersInOrder.sort((a, b) => {
    const rA = LAYER_RANK[a.layer] ?? 3;
    const rB = LAYER_RANK[b.layer] ?? 3;
    if (rA !== rB) return rA - rB;
    return a.id.localeCompare(b.id);
  });

  // Calculate initial cluster bounding anchors
  const nodeStates: NodeLayoutState[] = [];
  const nodeStateMap = new Map<string, NodeLayoutState>();

  // Layout cluster grids layer by layer
  let currentLayerY = 120;
  const layerGroups = new Map<number, typeof clustersInOrder>();

  for (const c of clustersInOrder) {
    const rank = LAYER_RANK[c.layer] ?? 3;
    const group = layerGroups.get(rank) || [];
    group.push(c);
    layerGroups.set(rank, group);
  }

  const sortedRanks = Array.from(layerGroups.keys()).sort((a, b) => a - b);

  for (const rank of sortedRanks) {
    const clustersInLayer = layerGroups.get(rank) || [];
    let currentX = 120;
    let maxClusterHeight = 240;

    for (const cluster of clustersInLayer) {
      const cNodes = cluster.nodes;
      const subColor = cluster.subsystem?.color || LAYER_PALETTE[cluster.layer] || '#2563eb';

      // Determine grid columns inside cluster
      const colCount = cNodes.length <= 2 ? Math.max(1, cNodes.length) : cNodes.length <= 6 ? 2 : 3;
      const nodeW = 210;
      const nodeH = 92;
      const gapX = 48;
      const gapY = 40;

      let clusterMaxX = currentX;
      let clusterMaxY = currentLayerY;

      for (let i = 0; i < cNodes.length; i++) {
        const node = cNodes[i];
        const col = i % colCount;
        const row = Math.floor(i / colCount);

        const initX = currentX + col * (nodeW + gapX) + 40;
        const initY = currentLayerY + row * (nodeH + gapY) + 50;

        // Dynamic width according to label length and centrality
        const dynamicW = Math.round(
          Math.max(180, Math.min(260, 160 + node.label.length * 5.2 + (node.centrality || 0) * 20))
        );
        const dynamicH = Math.round(84 + (node.subtitle ? 18 : 0) + (node.centrality > 0.6 ? 8 : 0));

        const state: NodeLayoutState = {
          node,
          x: node.x !== undefined && Number.isFinite(node.x) && node.x > 0 ? node.x : initX,
          y: node.y !== undefined && Number.isFinite(node.y) && node.y > 0 ? node.y : initY,
          vx: 0,
          vy: 0,
          width: dynamicW,
          height: dynamicH,
          color: node.subsystemId && subsystemMap.has(node.subsystemId)
            ? (subsystemMap.get(node.subsystemId)!.color || subColor)
            : subColor,
          clusterId: cluster.id,
          layer: node.layer || cluster.layer,
        };

        nodeStates.push(state);
        nodeStateMap.set(node.id, state);

        clusterMaxX = Math.max(clusterMaxX, state.x + state.width + 40);
        clusterMaxY = Math.max(clusterMaxY, state.y + state.height + 40);
      }

      const clusterW = Math.max(280, clusterMaxX - currentX);
      const clusterH = Math.max(200, clusterMaxY - currentLayerY);
      maxClusterHeight = Math.max(maxClusterHeight, clusterH);

      currentX += clusterW + 80; // space between clusters in same layer
    }

    currentLayerY += maxClusterHeight + 110; // vertical step between layers
  }

  // ---------------------------------------------------------------------------
  // Deterministic Relaxation Simulation
  // ---------------------------------------------------------------------------
  const ITERATIONS = 45;
  const kRepel = 24000;
  const kSpring = 0.04;
  const targetEdgeLength = 220;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const alpha = 0.22 * (1 - iter / ITERATIONS);

    // 1. Repulsion between all node pairs
    for (let i = 0; i < nodeStates.length; i++) {
      const a = nodeStates[i];
      for (let j = i + 1; j < nodeStates.length; j++) {
        const b = nodeStates[j];

        const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
        const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 1;

        const minDistance = (a.width + b.width) / 2 + 30;

        // Collision push or Coulomb repulsion
        let force = 0;
        if (dist < minDistance) {
          force = (minDistance - dist) * 1.5;
        } else {
          const repelFactor = a.clusterId === b.clusterId ? 0.7 : 1.3;
          force = (kRepel / (distSq + 100)) * repelFactor;
        }

        const fx = (dx / dist) * force * alpha;
        const fy = (dy / dist) * force * alpha;

        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // 2. Edge attraction (Hooke's law)
    for (const edge of edges) {
      const src = nodeStateMap.get(edge.source);
      const tgt = nodeStateMap.get(edge.target);
      if (!src || !tgt) continue;

      const dx = (tgt.x + tgt.width / 2) - (src.x + src.width / 2);
      const dy = (tgt.y + tgt.height / 2) - (src.y + src.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      const delta = dist - targetEdgeLength;
      const weightFactor = edge.isHotPath ? 1.4 : edge.weight ? Math.min(2, Math.max(0.8, edge.weight)) : 1.0;
      const springForce = delta * kSpring * weightFactor * alpha;

      const fx = (dx / dist) * springForce;
      const fy = (dy / dist) * springForce;

      src.vx += fx;
      src.vy += fy;
      tgt.vx -= fx;
      tgt.vy -= fy;
    }

    // 3. Cluster cohesion & gentle layer gravity
    const clusterCentroids = new Map<string, { cx: number; cy: number; count: number }>();
    for (const s of nodeStates) {
      const c = clusterCentroids.get(s.clusterId) || { cx: 0, cy: 0, count: 0 };
      c.cx += s.x + s.width / 2;
      c.cy += s.y + s.height / 2;
      c.count += 1;
      clusterCentroids.set(s.clusterId, c);
    }

    for (const s of nodeStates) {
      const c = clusterCentroids.get(s.clusterId);
      if (c && c.count > 1) {
        const avgX = c.cx / c.count;
        const avgY = c.cy / c.count;
        s.vx += (avgX - (s.x + s.width / 2)) * 0.02 * alpha;
        s.vy += (avgY - (s.y + s.height / 2)) * 0.02 * alpha;
      }

      // Layer target Y anchor keeps architectural hierarchy clean
      const idealLayerY = 120 + (LAYER_RANK[s.layer] ?? 3) * 260;
      s.vy += (idealLayerY - s.y) * 0.03 * alpha;
    }

    // 4. Update coordinates with damping
    for (const s of nodeStates) {
      s.x += s.vx;
      s.y += s.vy;
      s.vx *= 0.65;
      s.vy *= 0.65;
    }
  }

  // ---------------------------------------------------------------------------
  // Normalization and Bounding Box
  // ---------------------------------------------------------------------------
  let minX = Infinity;
  let minY = Infinity;

  for (const s of nodeStates) {
    if (s.x < minX) minX = s.x;
    if (s.y < minY) minY = s.y;
  }

  const paddingX = 80;
  const paddingY = 80;
  const shiftX = Number.isFinite(minX) ? paddingX - minX : paddingX;
  const shiftY = Number.isFinite(minY) ? paddingY - minY : paddingY;

  let maxX = 0;
  let maxY = 0;

  const positionedNodes: PositionedNode[] = nodeStates.map((s) => {
    const finalX = Math.round(s.x + shiftX);
    const finalY = Math.round(s.y + shiftY);
    maxX = Math.max(maxX, finalX + s.width);
    maxY = Math.max(maxY, finalY + s.height);

    return {
      node: {
        ...s.node,
        x: finalX,
        y: finalY,
      },
      x: finalX,
      y: finalY,
      width: s.width,
      height: s.height,
      color: s.color,
    };
  });

  // ---------------------------------------------------------------------------
  // Subsystem Cluster Hulls
  // ---------------------------------------------------------------------------
  const hulls: ClusterHull[] = [];
  const hullPadding = 32;

  for (const sub of subsystems) {
    const memberNodes = positionedNodes.filter((pn) => pn.node.subsystemId === sub.id);

    if (memberNodes.length > 0) {
      let hMinX = Infinity;
      let hMinY = Infinity;
      let hMaxX = -Infinity;
      let hMaxY = -Infinity;

      for (const mn of memberNodes) {
        if (mn.x < hMinX) hMinX = mn.x;
        if (mn.y < hMinY) hMinY = mn.y;
        if (mn.x + mn.width > hMaxX) hMaxX = mn.x + mn.width;
        if (mn.y + mn.height > hMaxY) hMaxY = mn.y + mn.height;
      }

      const hX = Math.round(hMinX - hullPadding);
      const hY = Math.round(hMinY - hullPadding);
      const hW = Math.round(hMaxX - hMinX + hullPadding * 2);
      const hH = Math.round(hMaxY - hMinY + hullPadding * 2);

      maxX = Math.max(maxX, hX + hW);
      maxY = Math.max(maxY, hY + hH);

      hulls.push({
        subsystem: sub,
        x: hX,
        y: hY,
        width: hW,
        height: hH,
      });
    }
  }

  return {
    positionedNodes,
    hulls,
    bounds: {
      width: Math.max(1280, Math.round(maxX + paddingX)),
      height: Math.max(860, Math.round(maxY + paddingY)),
    },
  };
}

// -----------------------------------------------------------------------------
// 2. Curved Cubic Bezier Edge Paths & Midpoint Math
// -----------------------------------------------------------------------------

/**
 * Constructs an SVG curved cubic bezier path between two positioned rectangle nodes.
 * Automatically selects optimal edge exit/entry ports (horizontal vs vertical)
 * and calculates the exact mathematical midpoint (t=0.5) for label and badge placement.
 */
export function buildCurvedEdgePath(
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number }
): { path: string; midX: number; midY: number } {
  // Self-loop handling
  if (
    Math.abs(from.x - to.x) < 0.1 &&
    Math.abs(from.y - to.y) < 0.1 &&
    Math.abs(from.width - to.width) < 0.1 &&
    Math.abs(from.height - to.height) < 0.1
  ) {
    const startX = from.x + from.width * 0.75;
    const startY = from.y;
    const endX = from.x + from.width;
    const endY = from.y + from.height * 0.35;

    const cp1X = startX + 45;
    const cp1Y = startY - 45;
    const cp2X = endX + 45;
    const cp2Y = endY - 25;

    const midX = 0.125 * startX + 0.375 * cp1X + 0.375 * cp2X + 0.125 * endX;
    const midY = 0.125 * startY + 0.375 * cp1Y + 0.375 * cp2Y + 0.125 * endY;

    return {
      path: `M ${roundVal(startX)} ${roundVal(startY)} C ${roundVal(cp1X)} ${roundVal(cp1Y)}, ${roundVal(cp2X)} ${roundVal(cp2Y)}, ${roundVal(endX)} ${roundVal(endY)}`,
      midX: roundVal(midX),
      midY: roundVal(midY),
    };
  }

  const fCenterX = from.x + from.width / 2;
  const fCenterY = from.y + from.height / 2;
  const tCenterX = to.x + to.width / 2;
  const tCenterY = to.y + to.height / 2;

  const dx = tCenterX - fCenterX;
  const dy = tCenterY - fCenterY;

  let startX = fCenterX;
  let startY = fCenterY;
  let endX = tCenterX;
  let endY = tCenterY;

  let cp1X = fCenterX;
  let cp1Y = fCenterY;
  let cp2X = tCenterX;
  let cp2Y = tCenterY;

  if (Math.abs(dy) >= Math.abs(dx)) {
    // Predominantly vertical flow
    if (dy >= 0) {
      // Flowing downward
      startX = fCenterX;
      startY = from.y + from.height;
      endX = tCenterX;
      endY = to.y;

      const curveOffset = Math.max(36, Math.abs(endY - startY) * 0.48);
      cp1X = startX;
      cp1Y = startY + curveOffset;
      cp2X = endX;
      cp2Y = endY - curveOffset;
    } else {
      // Flowing upward
      startX = fCenterX;
      startY = from.y;
      endX = tCenterX;
      endY = to.y + to.height;

      const curveOffset = Math.max(36, Math.abs(startY - endY) * 0.48);
      cp1X = startX;
      cp1Y = startY - curveOffset;
      cp2X = endX;
      cp2Y = endY + curveOffset;
    }
  } else {
    // Predominantly horizontal flow
    if (dx >= 0) {
      // Flowing rightward
      startX = from.x + from.width;
      startY = fCenterY;
      endX = to.x;
      endY = tCenterY;

      const curveOffset = Math.max(36, Math.abs(endX - startX) * 0.48);
      cp1X = startX + curveOffset;
      cp1Y = startY;
      cp2X = endX - curveOffset;
      cp2Y = endY;
    } else {
      // Flowing leftward
      startX = from.x;
      startY = fCenterY;
      endX = to.x + to.width;
      endY = tCenterY;

      const curveOffset = Math.max(36, Math.abs(startX - endX) * 0.48);
      cp1X = startX - curveOffset;
      cp1Y = startY;
      cp2X = endX + curveOffset;
      cp2Y = endY;
    }
  }

  // Exact cubic bezier position at t = 0.5:
  // B(0.5) = (1-0.5)^3 * P0 + 3*(1-0.5)^2 * 0.5 * P1 + 3*(1-0.5) * 0.5^2 * P2 + 0.5^3 * P3
  // B(0.5) = 0.125 * P0 + 0.375 * P1 + 0.375 * P2 + 0.125 * P3
  const midX = 0.125 * startX + 0.375 * cp1X + 0.375 * cp2X + 0.125 * endX;
  const midY = 0.125 * startY + 0.375 * cp1Y + 0.375 * cp2Y + 0.125 * endY;

  const path = `M ${roundVal(startX)} ${roundVal(startY)} C ${roundVal(cp1X)} ${roundVal(cp1Y)}, ${roundVal(cp2X)} ${roundVal(cp2Y)}, ${roundVal(endX)} ${roundVal(endY)}`;

  return {
    path,
    midX: roundVal(midX),
    midY: roundVal(midY),
  };
}

function roundVal(n: number): number {
  return Math.round(n * 10) / 10;
}

// -----------------------------------------------------------------------------
// 3. Squarified Treemap Layout (Bruls, Huizing, van Wijk)
// -----------------------------------------------------------------------------

interface AvailableArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Computes a squarified treemap layout optimizing for aspect ratios close to 1.
 * Supports hierarchical nesting down to `maxDepth` with directory container insets.
 */
export function computeSquarifiedTreemap(
  root: TreemapNode,
  width: number,
  height: number,
  maxDepth: number = 4
): TreemapRect[] {
  if (!root || width <= 0 || height <= 0) {
    return [];
  }

  const results: TreemapRect[] = [];

  // Root rect
  const rootRect: TreemapRect = {
    node: root,
    x: 0,
    y: 0,
    width: Math.round(width),
    height: Math.round(height),
    depth: 0,
  };
  results.push(rootRect);

  // Recursively layout children
  if (root.children && root.children.length > 0 && maxDepth > 0) {
    layoutChildren(root, rootRect.x, rootRect.y, rootRect.width, rootRect.height, 1, maxDepth, results);
  }

  return results;
}

function layoutChildren(
  parent: TreemapNode,
  x: number,
  y: number,
  w: number,
  h: number,
  depth: number,
  maxDepth: number,
  results: TreemapRect[]
): void {
  const children = parent.children;
  if (!children || children.length === 0 || w < 8 || h < 8) {
    return;
  }

  // Padding inside directories to preserve readable container headers
  const isDir = parent.kind === 'dir';
  const padTop = isDir && h > 42 ? 22 : 2;
  const padSide = 2;

  const innerX = x + padSide;
  const innerY = y + padTop;
  const innerW = Math.max(1, w - padSide * 2);
  const innerH = Math.max(1, h - padTop - padSide);

  // Weight by tokens (falling back to bytes, fileCount, or 1)
  interface ItemWeight {
    node: TreemapNode;
    weight: number;
    area: number;
  }

  const items: ItemWeight[] = children.map((c) => ({
    node: c,
    weight: Math.max(1, c.tokens || c.bytes || c.fileCount || 1),
    area: 0,
  }));

  // Sort descending by weight for squarification
  items.sort((a, b) => b.weight - a.weight);

  const totalWeight = items.reduce((acc, curr) => acc + curr.weight, 0);
  const totalArea = innerW * innerH;

  for (const item of items) {
    item.area = (item.weight / totalWeight) * totalArea;
  }

  // Squarify algorithm execution
  const currentArea: AvailableArea = {
    x: innerX,
    y: innerY,
    w: innerW,
    h: innerH,
  };

  let row: ItemWeight[] = [];

  for (const item of items) {
    if (row.length === 0) {
      row.push(item);
    } else {
      const shortest = Math.min(currentArea.w, currentArea.h);
      if (worstAspectRatio([...row, item], shortest) <= worstAspectRatio(row, shortest)) {
        row.push(item);
      } else {
        commitRow(row, currentArea, depth, maxDepth, results);
        row = [item];
      }
    }
  }

  if (row.length > 0) {
    commitRow(row, currentArea, depth, maxDepth, results);
  }
}

/**
 * Calculates worst aspect ratio for a row placed along a given side length.
 * ratio = max(w/h, h/w)
 */
function worstAspectRatio(row: Array<{ area: number }>, sideLength: number): number {
  if (row.length === 0 || sideLength <= 0) return Infinity;

  const s = row.reduce((acc, curr) => acc + curr.area, 0);
  if (s <= 0) return Infinity;

  const sideSq = sideLength * sideLength;
  const sSq = s * s;

  let maxArea = -Infinity;
  let minArea = Infinity;

  for (const r of row) {
    if (r.area > maxArea) maxArea = r.area;
    if (r.area < minArea) minArea = r.area;
  }

  return Math.max((sideSq * maxArea) / sSq, sSq / (sideSq * minArea));
}

/**
 * Commits a completed row into the available area and slices remaining area.
 */
function commitRow(
  row: Array<{ node: TreemapNode; area: number }>,
  area: AvailableArea,
  depth: number,
  maxDepth: number,
  results: TreemapRect[]
): void {
  const rowAreaSum = row.reduce((acc, curr) => acc + curr.area, 0);
  if (rowAreaSum <= 0 || area.w <= 0 || area.h <= 0) return;

  if (area.w <= area.h) {
    // Shortest side is width: layout horizontally across full width
    const stripHeight = rowAreaSum / area.w;
    let curX = area.x;

    for (const item of row) {
      const itemWidth = (item.area / rowAreaSum) * area.w;

      const rX = roundVal(curX);
      const rY = roundVal(area.y);
      const rW = roundVal(itemWidth);
      const rH = roundVal(stripHeight);

      const treemapRect: TreemapRect = {
        node: item.node,
        x: rX,
        y: rY,
        width: Math.max(1, rW),
        height: Math.max(1, rH),
        depth,
      };

      results.push(treemapRect);

      // Recurse into children if deeper levels permitted
      if (item.node.children && item.node.children.length > 0 && depth < maxDepth) {
        layoutChildren(item.node, treemapRect.x, treemapRect.y, treemapRect.width, treemapRect.height, depth + 1, maxDepth, results);
      }

      curX += itemWidth;
    }

    area.y += stripHeight;
    area.h = Math.max(0, area.h - stripHeight);
  } else {
    // Shortest side is height: layout vertically down full height
    const stripWidth = rowAreaSum / area.h;
    let curY = area.y;

    for (const item of row) {
      const itemHeight = (item.area / rowAreaSum) * area.h;

      const rX = roundVal(area.x);
      const rY = roundVal(curY);
      const rW = roundVal(stripWidth);
      const rH = roundVal(itemHeight);

      const treemapRect: TreemapRect = {
        node: item.node,
        x: rX,
        y: rY,
        width: Math.max(1, rW),
        height: Math.max(1, rH),
        depth,
      };

      results.push(treemapRect);

      // Recurse into children if deeper levels permitted
      if (item.node.children && item.node.children.length > 0 && depth < maxDepth) {
        layoutChildren(item.node, treemapRect.x, treemapRect.y, treemapRect.width, treemapRect.height, depth + 1, maxDepth, results);
      }

      curY += itemHeight;
    }

    area.x += stripWidth;
    area.w = Math.max(0, area.w - stripWidth);
  }
}
