// =============================================================================
// GitUnderstand (git-understand.com) — Nano Banana 2.1 Poster Atelier
// High-resolution architectural poster generation using gemini-nano-banana-2.1
// (v1beta Interactions API) with procedural Obsidian Cobalt SVG fallbacks.
// =============================================================================

import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { ENV, ensureRuntimeDirs } from '../config/env.js';
import { withV1BetaClient, hasGeminiCredentials } from './clientPool.js';
import { extractInteractionImage } from './mediaUtils.js';
import type {
  VisualAtlasBlueprint,
  MediaPosterArtifact,
  AtlasNode,
  SubsystemCluster,
} from '../../../shared/types.js';

/**
 * Escapes unsafe characters for SVG and XML attributes/text content.
 */
function escapeXml(unsafe: string | undefined | null): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Truncates a string safely with an ellipsis.
 */
function truncateText(text: string | undefined | null, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

/**
 * Formats a human-readable title for the generated architecture poster artifact.
 */
function formatPosterTitle(
  blueprint: VisualAtlasBlueprint,
  style: MediaPosterArtifact['style']
): string {
  const repoName = blueprint.metadata.fullName || blueprint.metadata.name || blueprint.repoId;
  switch (style) {
    case 'cobalt_blueprint':
      return `${repoName} • Cobalt Technical Blueprint`;
    case 'isometric_cutaway':
      return `${repoName} • Isometric Strata Cutaway`;
    case 'editorial_diagram':
      return `${repoName} • Systems Architecture Editorial`;
    default:
      return `${repoName} • Architectural Poster`;
  }
}

/**
 * Builds a prompt for gemini-nano-banana-2.1 (v1beta Interactions API)
 * aligned with the AntiSlop Obsidian Cobalt aesthetic.
 */
function buildPosterPrompt(
  blueprint: VisualAtlasBlueprint,
  style: MediaPosterArtifact['style']
): string {
  const repoName = blueprint.metadata.fullName || blueprint.repoId;
  const pattern = blueprint.architecturePattern || 'Modular System Architecture';
  const headline = blueprint.headline || blueprint.oneLiner || 'Software Architecture Overview';
  const techStack = (blueprint.techStackBadges || []).slice(0, 8).join(', ');

  const subsystemList = (blueprint.subsystems || [])
    .slice(0, 6)
    .map((s) => `${s.name} (${s.layer})`)
    .join('; ');

  const topNodes = (blueprint.nodes || [])
    .slice(0, 8)
    .map((n) => `${n.label} [${n.kind}]`)
    .join(', ');

  const statsText = `${blueprint.stats.totalFiles} files, ${blueprint.stats.totalLines} lines, ${blueprint.subsystems.length} subsystems`;

  let styleDirective = '';
  switch (style) {
    case 'cobalt_blueprint':
      styleDirective =
        'Obsidian Cobalt engineering blueprint schematic. Dark obsidian midnight canvas (#060913, #0b1122), ' +
        'crisp glowing cobalt blue (#2563eb, #38bdf8, #60a5fa) technical CAD linework, cyan data bus traces, ' +
        'high-contrast white/silver typography, orthogonal coordinate grids, subsystem bays, component modules with ' +
        'corner bracket accents, invariant callouts, and ISO-7200 title block. Clean minimalist architectural precision, ' +
        'zero cheesy purple/pink neon gradient slop.';
      break;

    case 'isometric_cutaway':
      styleDirective =
        '3D isometric exploded architectural cutaway of a software system. Stacked structural glass and dark titanium ' +
        'strata slabs floating in dark obsidian space (#050811), glowing electric cobalt blue (#38bdf8, #2563eb) conduits ' +
        'and vertical riser pipes linking tiers. Client edge on top, orchestration in middle, data storage cylinder at base. ' +
        'Subtle ambient occlusion, technical CAD realism, strict obsidian cobalt palette, zero generic gradient blur.';
      break;

    case 'editorial_diagram':
      styleDirective =
        'Swiss editorial design technical software architecture poster. Dark slate canvas (#0a0f1d), structured multi-column ' +
        'grid layout, high-contrast monochrome typography with sharp electric cobalt (#2563eb, #38bdf8) and emerald (#10b981) ' +
        'data-flow accents. Labeled subsystem quadrants, dependency flow arrows, publication-grade infographics, ' +
        'minimalist vector aesthetic, clean anti-slop technical blueprint.';
      break;
  }

  return (
    `SYSTEM ARCHITECTURE POSTER: ${repoName}\n` +
    `PATTERN: ${pattern}\n` +
    `SUMMARY: ${headline}\n` +
    `TECH STACK: ${techStack || 'TypeScript, Node.js, Cloud Services'}\n` +
    `SUBSYSTEMS: ${subsystemList || 'Client, Orchestration, Domain, Infrastructure'}\n` +
    `KEY COMPONENTS: ${topNodes || 'Gateway, Router, Engine, Store'}\n` +
    `METRICS: ${statsText}\n` +
    `VISUAL DIRECTIVE: ${styleDirective}\n` +
    `Output high-resolution 16:9 architectural blueprint illustration.`
  );
}

/**
 * Common SVG Definitions (Gradients, Filters, Grid Patterns, CSS Variables).
 */
function renderSvgDefs(): string {
  return `
    <defs>
      <!-- Background Linear Gradients -->
      <linearGradient id="obsidianVoid" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#060913" />
        <stop offset="60%" stop-color="#090e1d" />
        <stop offset="100%" stop-color="#0c1429" />
      </linearGradient>

      <linearGradient id="cobaltGlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#2563eb" />
        <stop offset="100%" stop-color="#38bdf8" />
      </linearGradient>

      <linearGradient id="cardBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(15, 23, 42, 0.92)" />
        <stop offset="100%" stop-color="rgba(10, 16, 31, 0.88)" />
      </linearGradient>

      <linearGradient id="cardHeaderGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="rgba(37, 99, 235, 0.22)" />
        <stop offset="100%" stop-color="rgba(56, 189, 248, 0.05)" />
      </linearGradient>

      <linearGradient id="isometricSlabTop" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgba(30, 58, 138, 0.65)" />
        <stop offset="100%" stop-color="rgba(15, 23, 42, 0.85)" />
      </linearGradient>

      <!-- Minor & Major CAD Blueprint Grids -->
      <pattern id="minorGrid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56, 189, 248, 0.04)" stroke-width="0.5" />
      </pattern>

      <pattern id="majorGrid" width="100" height="100" patternUnits="userSpaceOnUse">
        <rect width="100" height="100" fill="url(#minorGrid)" />
        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(56, 189, 248, 0.12)" stroke-width="1" />
        <circle cx="100" cy="100" r="1.5" fill="rgba(56, 189, 248, 0.3)" />
      </pattern>

      <!-- Marker: Directed Arrowhead -->
      <marker id="arrowCobalt" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8" />
      </marker>

      <marker id="arrowEmerald" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#10b981" />
      </marker>

      <!-- Glow Filter -->
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>

      <!-- AntiSlop Obsidian Cobalt Theme Stylesheet -->
      <style>
        :root {
          --bg-void: #060913;
          --bg-card: rgba(15, 23, 42, 0.88);
          --bg-card-elevated: rgba(30, 41, 59, 0.95);
          --ink-primary: #f8fafc;
          --ink-secondary: #94a3b8;
          --ink-muted: #64748b;
          --border-card: rgba(56, 189, 248, 0.24);
          --cobalt-core: #2563eb;
          --cobalt-bright: #38bdf8;
          --cobalt-ice: #93c5fd;
          --cobalt-tint: rgba(56, 189, 248, 0.08);
          --emerald: #10b981;
          --amber: #f59e0b;
          --vermilion: #ef4444;
        }
        text {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          user-select: none;
        }
        .code-font {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
      </style>
    </defs>
  `;
}

/**
 * Renders the top engineering header bar with blueprint metadata and telemetry.
 */
function renderSvgHeader(
  blueprint: VisualAtlasBlueprint,
  styleLabel: string
): string {
  const repoName = escapeXml(blueprint.metadata.fullName || blueprint.repoId);
  const headline = escapeXml(truncateText(blueprint.headline || blueprint.oneLiner, 85));
  const pattern = escapeXml(truncateText(blueprint.architecturePattern, 48));
  const dateStr = new Date().toISOString().slice(0, 10);
  const filesCount = blueprint.stats.totalFiles;
  const linesCount = blueprint.stats.totalLines.toLocaleString();
  const tokensCount = blueprint.stats.totalTokens.toLocaleString();

  return `
    <!-- Top Engineering Header Bar -->
    <g id="header-bar">
      <!-- Title & Specification Badge -->
      <rect x="40" y="40" width="1520" height="74" rx="4" fill="url(#cardBgGrad)" stroke="rgba(56, 189, 248, 0.28)" stroke-width="1.2" />
      <path d="M 40 40 L 40 48 M 40 40 L 48 40" stroke="#38bdf8" stroke-width="2" />
      <path d="M 1560 40 L 1560 48 M 1560 40 L 1552 40" stroke="#38bdf8" stroke-width="2" />
      <path d="M 40 114 L 40 106 M 40 114 L 48 114" stroke="#38bdf8" stroke-width="2" />
      <path d="M 1560 114 L 1560 106 M 1560 114 L 1552 114" stroke="#38bdf8" stroke-width="2" />

      <!-- Classification Tag -->
      <rect x="56" y="52" width="190" height="20" rx="2" fill="rgba(37, 99, 235, 0.25)" stroke="#2563eb" stroke-width="0.8" />
      <text x="64" y="66" fill="#38bdf8" font-size="10" font-weight="700" letter-spacing="1">GITUNDERSTAND • ARCH-SPEC</text>

      <!-- Style Pill -->
      <rect x="254" y="52" width="160" height="20" rx="2" fill="rgba(56, 189, 248, 0.12)" stroke="rgba(56, 189, 248, 0.3)" stroke-width="0.8" />
      <text x="262" y="66" fill="#93c5fd" font-size="10" font-weight="600" letter-spacing="0.5">${escapeXml(styleLabel)}</text>

      <!-- Repo Full Name -->
      <text x="56" y="98" fill="#f8fafc" font-size="20" font-weight="700" letter-spacing="0.5">${repoName}</text>

      <!-- Headline / Pattern Summary -->
      <text x="540" y="72" fill="#94a3b8" font-size="12" font-weight="500">${headline}</text>
      <text x="540" y="96" fill="#38bdf8" font-size="11" font-weight="600">PATTERN: <tspan fill="#e2e8f0">${pattern}</tspan></text>

      <!-- Telemetry Box (Right) -->
      <g transform="translate(1220, 48)">
        <text x="0" y="16" fill="#64748b" font-size="10" font-weight="600">DATE: <tspan fill="#cbd5e1">${dateStr}</tspan></text>
        <text x="130" y="16" fill="#64748b" font-size="10" font-weight="600">FILES: <tspan fill="#38bdf8">${filesCount}</tspan></text>
        <text x="220" y="16" fill="#64748b" font-size="10" font-weight="600">LINES: <tspan fill="#38bdf8">${linesCount}</tspan></text>
        <text x="0" y="44" fill="#64748b" font-size="10" font-weight="600">TOKENS: <tspan fill="#cbd5e1">${tokensCount}</tspan></text>
        <rect x="130" y="32" width="180" height="18" rx="2" fill="rgba(16, 185, 129, 0.12)" stroke="#10b981" stroke-width="0.8" />
        <circle cx="140" cy="41" r="3" fill="#10b981" />
        <text x="150" y="44" fill="#10b981" font-size="9" font-weight="700" letter-spacing="0.8">VERIFIED BLUEPRINT</text>
      </g>
    </g>
  `;
}

/**
 * Renders the engineering blueprint title block (ISO 7200 inspired) in the bottom-right corner.
 */
function renderSvgTitleBlock(
  blueprint: VisualAtlasBlueprint,
  styleName: string
): string {
  const repoName = escapeXml(truncateText(blueprint.metadata.fullName || blueprint.repoId, 32));
  const branch = escapeXml(blueprint.metadata.branch || blueprint.metadata.defaultBranch || 'main');
  const dateStr = new Date().toISOString().slice(0, 10);
  const license = escapeXml(blueprint.metadata.license || 'Proprietary / Open Source');

  return `
    <!-- Engineering Blueprint Title Block (ISO-7200) -->
    <g id="iso-title-block" transform="translate(1040, 875)">
      <rect x="0" y="0" width="520" height="85" fill="rgba(10, 16, 31, 0.95)" stroke="#38bdf8" stroke-width="1.2" />
      <line x1="0" y1="28" x2="520" y2="28" stroke="rgba(56, 189, 248, 0.3)" stroke-width="1" />
      <line x1="0" y1="56" x2="520" y2="56" stroke="rgba(56, 189, 248, 0.3)" stroke-width="1" />
      <line x1="260" y1="0" x2="260" y2="56" stroke="rgba(56, 189, 248, 0.3)" stroke-width="1" />
      <line x1="390" y1="28" x2="390" y2="56" stroke="rgba(56, 189, 248, 0.3)" stroke-width="1" />
      <line x1="130" y1="56" x2="130" y2="85" stroke="rgba(56, 189, 248, 0.3)" stroke-width="1" />
      <line x1="260" y1="56" x2="260" y2="85" stroke="rgba(56, 189, 248, 0.3)" stroke-width="1" />
      <line x1="390" y1="56" x2="390" y2="85" stroke="rgba(56, 189, 248, 0.3)" stroke-width="1" />

      <!-- Row 1 -->
      <text x="12" y="18" fill="#64748b" font-size="9" font-weight="600">PROJECT TITLE</text>
      <text x="96" y="19" fill="#f8fafc" font-size="11" font-weight="700">${repoName}</text>
      <text x="272" y="18" fill="#64748b" font-size="9" font-weight="600">STUDIO</text>
      <text x="325" y="19" fill="#38bdf8" font-size="11" font-weight="700">NANO BANANA 2.1 ATELIER</text>

      <!-- Row 2 -->
      <text x="12" y="45" fill="#64748b" font-size="9" font-weight="600">BRANCH</text>
      <text x="70" y="46" fill="#cbd5e1" font-size="10" font-weight="600">${branch}</text>
      <text x="272" y="45" fill="#64748b" font-size="9" font-weight="600">SCALE</text>
      <text x="325" y="46" fill="#cbd5e1" font-size="10" font-weight="600">1:1 NANO-CAD</text>
      <text x="402" y="45" fill="#64748b" font-size="9" font-weight="600">SHEET</text>
      <text x="450" y="46" fill="#38bdf8" font-size="10" font-weight="700">01 / 01</text>

      <!-- Row 3 -->
      <text x="12" y="74" fill="#64748b" font-size="9" font-weight="600">STYLE</text>
      <text x="56" y="74" fill="#93c5fd" font-size="10" font-weight="600">${escapeXml(styleName)}</text>
      <text x="142" y="74" fill="#64748b" font-size="9" font-weight="600">DATE</text>
      <text x="182" y="74" fill="#cbd5e1" font-size="10" font-weight="600">${dateStr}</text>
      <text x="272" y="74" fill="#64748b" font-size="9" font-weight="600">AESTHETIC</text>
      <text x="336" y="74" fill="#38bdf8" font-size="9" font-weight="700">OBSIDIAN COBALT</text>
      <text x="402" y="74" fill="#64748b" font-size="9" font-weight="600">LIC</text>
      <text x="430" y="74" fill="#cbd5e1" font-size="9" font-weight="600">${truncateText(license, 10)}</text>
    </g>
  `;
}

/**
 * Renders bottom-left technology badges.
 */
function renderSvgTechBadges(blueprint: VisualAtlasBlueprint): string {
  const badges = (blueprint.techStackBadges || []).slice(0, 7);
  if (badges.length === 0) {
    badges.push('TypeScript', 'Next.js', 'Gemini 4', 'Cloud Run');
  }

  let xOffset = 40;
  const renderedBadges: string[] = [];

  for (const b of badges) {
    const text = escapeXml(b);
    const width = Math.max(70, text.length * 8 + 18);
    renderedBadges.push(`
      <g transform="translate(${xOffset}, 920)">
        <rect x="0" y="0" width="${width}" height="24" rx="3" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(56, 189, 248, 0.25)" stroke-width="0.9" />
        <text x="${width / 2}" y="16" fill="#cbd5e1" font-size="10" font-weight="600" text-anchor="middle">${text}</text>
      </g>
    `);
    xOffset += width + 10;
  }

  return `
    <!-- Technology Stack Badges -->
    <g id="tech-badges">
      <text x="40" y="908" fill="#64748b" font-size="9" font-weight="700" letter-spacing="1">VERIFIED TECH STACK</text>
      ${renderedBadges.join('')}
    </g>
  `;
}

/**
 * Renders the outer coordinate tick markings and blueprint ruler frame.
 */
function renderSvgRulerFrame(): string {
  const ticksTop: string[] = [];
  for (let x = 100; x < 1550; x += 100) {
    const coordLabel = String(Math.floor(x / 100)).padStart(2, '0');
    ticksTop.push(`
      <line x1="${x}" y1="24" x2="${x}" y2="30" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1" />
      <text x="${x}" y="20" fill="rgba(56, 189, 248, 0.5)" font-size="8" text-anchor="middle">${coordLabel}</text>
    `);
  }

  const ticksLeft: string[] = [];
  const yLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'];
  for (let y = 100, i = 0; y < 950; y += 100, i++) {
    const label = yLabels[i % yLabels.length];
    ticksLeft.push(`
      <line x1="24" y1="${y}" x2="30" y2="${y}" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1" />
      <text x="18" y="${y + 3}" fill="rgba(56, 189, 248, 0.5)" font-size="8" text-anchor="end">${label}</text>
    `);
  }

  return `
    <!-- Outer Precision Ruler & Corner Notches -->
    <rect x="24" y="24" width="1552" height="952" fill="none" stroke="rgba(56, 189, 248, 0.22)" stroke-width="1.2" />
    <rect x="28" y="28" width="1544" height="944" fill="none" stroke="rgba(56, 189, 248, 0.08)" stroke-width="0.8" stroke-dasharray="4,4" />

    <!-- Corner Brackets -->
    <path d="M 20 36 L 20 20 L 36 20" fill="none" stroke="#38bdf8" stroke-width="2.5" />
    <path d="M 1580 36 L 1580 20 L 1564 20" fill="none" stroke="#38bdf8" stroke-width="2.5" />
    <path d="M 20 964 L 20 980 L 36 980" fill="none" stroke="#38bdf8" stroke-width="2.5" />
    <path d="M 1580 964 L 1580 980 L 1564 980" fill="none" stroke="#38bdf8" stroke-width="2.5" />

    ${ticksTop.join('')}
    ${ticksLeft.join('')}
  `;
}

/**
 * Style 1: Procedural Cobalt Blueprint SVG.
 * Layout: 4 Engineering System Bays with orthogonal data buses, node cards, and hot path.
 */
function renderCobaltBlueprintSvg(blueprint: VisualAtlasBlueprint): string {
  const subsystems: SubsystemCluster[] = (blueprint.subsystems && blueprint.subsystems.length > 0)
    ? blueprint.subsystems.slice(0, 4)
    : [
        {
          id: 'sub-client',
          name: 'Client & Gateway Tier',
          tagline: 'Interactive UI surfaces & edge routing',
          layer: 'client',
          color: '#38bdf8',
          nodeIds: [],
          filePaths: [],
          entrypointPaths: [],
          totalTokens: 12000,
          summaryBullets: ['Web UI & State Management'],
          invariants: ['Strict HTTP/WS contract validation'],
        },
        {
          id: 'sub-orch',
          name: 'Orchestration Bus',
          tagline: 'Pipeline dispatch & event streams',
          layer: 'orchestration',
          color: '#2563eb',
          nodeIds: [],
          filePaths: [],
          entrypointPaths: [],
          totalTokens: 24000,
          summaryBullets: ['Asynchronous event routing'],
          invariants: ['Zero unhandled promise rejections'],
        },
        {
          id: 'sub-domain',
          name: 'Domain Logic & Core',
          tagline: 'Business models & AST extraction',
          layer: 'domain',
          color: '#60a5fa',
          nodeIds: [],
          filePaths: [],
          entrypointPaths: [],
          totalTokens: 38000,
          summaryBullets: ['Structural code graph inference'],
          invariants: ['Deterministic AST parsing'],
        },
        {
          id: 'sub-data',
          name: 'Data & Infrastructure',
          tagline: 'Storage, caches & model pool',
          layer: 'data',
          color: '#10b981',
          nodeIds: [],
          filePaths: [],
          entrypointPaths: [],
          totalTokens: 18000,
          summaryBullets: ['Artifact persistence & caching'],
          invariants: ['Dual-key failover fallback'],
        },
      ];

  const bayWidth = 360;
  const bayGap = 26;
  const startX = 40;
  const bayY = 135;
  const bayHeight = 560;

  const renderedBays: string[] = [];

  for (let i = 0; i < subsystems.length; i++) {
    const sub = subsystems[i];
    const bx = startX + i * (bayWidth + bayGap);
    const subColor = sub.color || (i === 3 ? '#10b981' : '#38bdf8');
    const matchingNodes: AtlasNode[] = (blueprint.nodes || [])
      .filter((n) => n.subsystemId === sub.id || n.layer === sub.layer)
      .slice(0, 4);

    // If no nodes found for subsystem, provide placeholders from global nodes
    if (matchingNodes.length === 0 && blueprint.nodes && blueprint.nodes.length > i) {
      matchingNodes.push(blueprint.nodes[i]);
    }

    const nodeCards: string[] = [];
    let nodeY = bayY + 75;

    for (let j = 0; j < Math.max(matchingNodes.length, 3); j++) {
      const node = matchingNodes[j];
      const nodeLabel = node ? escapeXml(truncateText(node.label, 26)) : `Component-0${j + 1}`;
      const nodeKind = node ? escapeXml(node.kind.toUpperCase()) : 'MODULE';
      const nodeSubtitle = node ? escapeXml(truncateText(node.subtitle || node.primaryFile, 32)) : 'Core logic service';
      const centralityScore = node ? Math.round(node.centrality * 100) : 75 - j * 12;

      nodeCards.push(`
        <!-- Node Card ${j + 1} in Bay ${i + 1} -->
        <g transform="translate(${bx + 16}, ${nodeY})">
          <rect x="0" y="0" width="${bayWidth - 32}" height="95" rx="3" fill="rgba(10, 16, 31, 0.88)" stroke="rgba(56, 189, 248, 0.22)" stroke-width="1" />
          <path d="M 0 0 L 0 6 M 0 0 L 6 0" stroke="${subColor}" stroke-width="1.8" />
          <path d="M ${bayWidth - 32} 0 L ${bayWidth - 32} 6 M ${bayWidth - 32} 0 L ${bayWidth - 38} 0" stroke="${subColor}" stroke-width="1.8" />
          <path d="M 0 95 L 0 89 M 0 95 L 6 95" stroke="${subColor}" stroke-width="1.8" />
          <path d="M ${bayWidth - 32} 95 L ${bayWidth - 32} 89 M ${bayWidth - 32} 95 L ${bayWidth - 38} 95" stroke="${subColor}" stroke-width="1.8" />

          <!-- Header Kind Badge & Centrality -->
          <rect x="12" y="10" width="55" height="16" rx="2" fill="rgba(37, 99, 235, 0.2)" stroke="rgba(56, 189, 248, 0.3)" stroke-width="0.8" />
          <text x="39" y="21" fill="#38bdf8" font-size="8" font-weight="700" text-anchor="middle">${nodeKind}</text>

          <text x="${bayWidth - 44}" y="22" fill="#64748b" font-size="9" font-weight="600">CTR: <tspan fill="#38bdf8">${centralityScore}%</tspan></text>

          <!-- Node Label -->
          <text x="12" y="46" fill="#f8fafc" font-size="13" font-weight="700">${nodeLabel}</text>

          <!-- Node Subtitle / File -->
          <text x="12" y="64" fill="#94a3b8" font-size="10" font-weight="500">${nodeSubtitle}</text>

          <!-- Bottom Metric Bar -->
          <rect x="12" y="78" width="${bayWidth - 56}" height="4" rx="2" fill="rgba(30, 41, 59, 0.8)" />
          <rect x="12" y="78" width="${Math.max(12, Math.round(((bayWidth - 56) * centralityScore) / 100))}" height="4" rx="2" fill="${subColor}" />
        </g>
      `);

      nodeY += 110;
    }

    const bayTitle = escapeXml(truncateText(sub.name, 26));
    const bayTagline = escapeXml(truncateText(sub.tagline, 36));
    const layerName = escapeXml(sub.layer.toUpperCase());

    renderedBays.push(`
      <!-- Bay ${i + 1}: ${bayTitle} -->
      <g id="bay-${i + 1}">
        <rect x="${bx}" y="${bayY}" width="${bayWidth}" height="${bayHeight}" rx="4" fill="url(#cardBgGrad)" stroke="rgba(56, 189, 248, 0.22)" stroke-width="1.2" />

        <!-- Bay Header Bar -->
        <path d="M ${bx} ${bayY} L ${bx + bayWidth} ${bayY} L ${bx + bayWidth} ${bayY + 54} L ${bx} ${bayY + 54} Z" fill="url(#cardHeaderGrad)" />
        <line x1="${bx}" y1="${bayY + 54}" x2="${bx + bayWidth}" y2="${bayY + 54}" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" />

        <!-- Bay Index & Layer Pill -->
        <circle cx="${bx + 26}" cy="${bayY + 27}" r="11" fill="rgba(37, 99, 235, 0.3)" stroke="${subColor}" stroke-width="1" />
        <text x="${bx + 26}" y="${bayY + 31}" fill="#f8fafc" font-size="10" font-weight="700" text-anchor="middle">0${i + 1}</text>

        <text x="${bx + 48}" y="${bayY + 24}" fill="#f8fafc" font-size="13" font-weight="700">${bayTitle}</text>
        <text x="${bx + 48}" y="${bayY + 42}" fill="#94a3b8" font-size="9" font-weight="500">${bayTagline}</text>

        <rect x="${bx + bayWidth - 85}" y="${bayY + 16}" width="70" height="18" rx="2" fill="rgba(15, 23, 42, 0.8)" stroke="rgba(56, 189, 248, 0.2)" stroke-width="0.8" />
        <text x="${bx + bayWidth - 50}" y="${bayY + 28}" fill="#93c5fd" font-size="8" font-weight="700" text-anchor="middle">${layerName}</text>

        <!-- Node Cards -->
        ${nodeCards.join('')}

        <!-- Bay Footer Status -->
        <line x1="${bx + 16}" y1="${bayY + bayHeight - 38}" x2="${bx + bayWidth - 16}" y2="${bayY + bayHeight - 38}" stroke="rgba(56, 189, 248, 0.15)" stroke-width="1" stroke-dasharray="3,3" />
        <circle cx="${bx + 24}" cy="${bayY + bayHeight - 20}" r="3.5" fill="${subColor}" />
        <text x="${bx + 36}" y="${bayY + bayHeight - 17}" fill="#94a3b8" font-size="9" font-weight="500">INVARIANT: <tspan fill="#e2e8f0">${escapeXml(truncateText(sub.invariants?.[0] || 'Clean contract boundary', 32))}</tspan></text>
      </g>
    `);
  }

  // Inter-bay horizontal bus traces
  const busLineY1 = bayY + 130;
  const busLineY2 = bayY + 240;
  const busLineY3 = bayY + 350;

  // Primary Execution Flow (Hot Path)
  const topFlow = (blueprint.flows && blueprint.flows.length > 0) ? blueprint.flows[0] : null;
  const flowTitle = escapeXml(topFlow ? topFlow.title : 'Primary End-to-End Execution Flow');
  const flowSteps = (topFlow && topFlow.steps && topFlow.steps.length > 0)
    ? topFlow.steps.slice(0, 4)
    : [
        { title: 'HTTP Dispatch', action: 'Route ingress', edgeLabel: 'GET /api/v1' },
        { title: 'AST Graph', action: 'Synthesize dependencies', edgeLabel: 'parseSource()' },
        { title: 'Model Inference', action: 'Dual-key speculative evaluation', edgeLabel: 'interactions.create()' },
        { title: 'Artifact Store', action: 'Commit Visual Atlas', edgeLabel: 'writeArtifact()' },
      ];

  const flowStepPills: string[] = [];
  const stepWidth = 220;
  let flowX = 56;
  for (let s = 0; s < flowSteps.length; s++) {
    const step = flowSteps[s];
    const sTitle = escapeXml(truncateText(step.title, 22));
    const sAction = escapeXml(truncateText(step.action, 26));

    flowStepPills.push(`
      <g transform="translate(${flowX}, 738)">
        <rect x="0" y="0" width="${stepWidth}" height="48" rx="3" fill="rgba(10, 16, 31, 0.92)" stroke="#38bdf8" stroke-width="1" />
        <circle cx="16" cy="24" r="8" fill="rgba(37, 99, 235, 0.3)" stroke="#38bdf8" stroke-width="1" />
        <text x="16" y="27" fill="#f8fafc" font-size="9" font-weight="700" text-anchor="middle">${s + 1}</text>
        <text x="32" y="19" fill="#f8fafc" font-size="10" font-weight="700">${sTitle}</text>
        <text x="32" y="35" fill="#94a3b8" font-size="9" font-weight="500">${sAction}</text>
      </g>
    `);

    if (s < flowSteps.length - 1) {
      flowStepPills.push(`
        <path d="M ${flowX + stepWidth} 762 L ${flowX + stepWidth + 16} 762" stroke="#38bdf8" stroke-width="1.5" marker-end="url(#arrowCobalt)" />
      `);
    }

    flowX += stepWidth + 24;
  }

  return `
    <!-- Inter-Bay High-Speed Bus Traces -->
    <g id="bus-traces" opacity="0.6">
      <path d="M 40 ${busLineY1} L 1560 ${busLineY1}" stroke="#38bdf8" stroke-width="1" stroke-dasharray="8,6" />
      <path d="M 40 ${busLineY2} L 1560 ${busLineY2}" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="12,4" />
      <path d="M 40 ${busLineY3} L 1560 ${busLineY3}" stroke="#38bdf8" stroke-width="1" stroke-dasharray="6,6" />

      <!-- Junction Dots -->
      <circle cx="410" cy="${busLineY1}" r="3" fill="#38bdf8" />
      <circle cx="796" cy="${busLineY1}" r="3" fill="#38bdf8" />
      <circle cx="1182" cy="${busLineY1}" r="3" fill="#38bdf8" />
      <circle cx="410" cy="${busLineY2}" r="3" fill="#2563eb" />
      <circle cx="796" cy="${busLineY2}" r="3" fill="#2563eb" />
      <circle cx="1182" cy="${busLineY2}" r="3" fill="#2563eb" />
    </g>

    <!-- Four Engineering Bays -->
    ${renderedBays.join('')}

    <!-- Execution Flow Highway Container -->
    <g id="hotpath-highway">
      <rect x="40" y="715" width="970" height="85" rx="4" fill="url(#cardBgGrad)" stroke="rgba(56, 189, 248, 0.28)" stroke-width="1.2" />
      <text x="56" y="731" fill="#38bdf8" font-size="9" font-weight="700" letter-spacing="1">HOT PATH EXECUTION STREAM: <tspan fill="#f8fafc">${flowTitle}</tspan></text>
      ${flowStepPills.join('')}
    </g>
  `;
}

/**
 * Style 2: Procedural Isometric Cutaway SVG.
 * Layout: 4 stacked 3D isometric strata slabs with vertical conduits and perspective cards.
 */
function renderIsometricCutawaySvg(blueprint: VisualAtlasBlueprint): string {
  const tiers = [
    {
      level: 4,
      title: 'EDGE & CLIENT INGRESS',
      layer: 'client',
      color: '#38bdf8',
      cy: 220,
      elevation: '+120m',
      desc: 'Next.js 15 App Router, React 19 Canvas, WebSocket Relay',
    },
    {
      level: 3,
      title: 'ORCHESTRATION & EVENT BUS',
      layer: 'orchestration',
      color: '#2563eb',
      cy: 370,
      elevation: '+80m',
      desc: 'EventBus, Speculative Multi-Key Pipeline, Entropy Router',
    },
    {
      level: 2,
      title: 'DOMAIN MODELS & AST COMPILER',
      layer: 'domain',
      color: '#60a5fa',
      cy: 520,
      elevation: '+40m',
      desc: 'Polyglot AST Extractors, Graph Builder, X-Ray Decision-1',
    },
    {
      level: 1,
      title: 'PERSISTENCE & MODEL ENGINE',
      layer: 'infrastructure',
      color: '#10b981',
      cy: 670,
      elevation: 'BASE',
      desc: 'Artifacts Cache, Gemini Client Pool, Cloud Run Service',
    },
  ];

  const slabW = 440;
  const slabH = 80;
  const slabD = 22;
  const cx = 560;

  const renderedSlabs: string[] = [];
  const calloutPanels: string[] = [];

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const y = tier.cy;
    const topPoly = `${cx},${y - slabH} ${cx + slabW},${y} ${cx},${y + slabH} ${cx - slabW},${y}`;
    const leftPoly = `${cx - slabW},${y} ${cx},${y + slabH} ${cx},${y + slabH + slabD} ${cx - slabW},${y + slabD}`;
    const rightPoly = `${cx},${y + slabH} ${cx + slabW},${y} ${cx + slabW},${y + slabD} ${cx},${y + slabH + slabD}`;

    renderedSlabs.push(`
      <!-- Isometric Strata Slab Tier ${tier.level} -->
      <g id="strata-slab-${tier.level}">
        <!-- Slab Left Face (shaded) -->
        <polygon points="${leftPoly}" fill="rgba(10, 16, 31, 0.95)" stroke="${tier.color}" stroke-width="0.8" />

        <!-- Slab Right Face (shaded darker) -->
        <polygon points="${rightPoly}" fill="rgba(6, 10, 20, 0.98)" stroke="${tier.color}" stroke-width="0.8" />

        <!-- Slab Top Face -->
        <polygon points="${topPoly}" fill="url(#isometricSlabTop)" stroke="${tier.color}" stroke-width="1.4" />

        <!-- Top Grid Wireframe -->
        <line x1="${cx - slabW / 2}" y1="${y - slabH / 2}" x2="${cx + slabW / 2}" y2="${y + slabH / 2}" stroke="rgba(56, 189, 248, 0.15)" stroke-width="1" />
        <line x1="${cx + slabW / 2}" y1="${y - slabH / 2}" x2="${cx - slabW / 2}" y2="${y + slabH / 2}" stroke="rgba(56, 189, 248, 0.15)" stroke-width="1" />

        <!-- Center Node Ring -->
        <circle cx="${cx}" cy="${y}" r="12" fill="rgba(37, 99, 235, 0.4)" stroke="${tier.color}" stroke-width="2" />
        <circle cx="${cx}" cy="${y}" r="4" fill="#f8fafc" />

        <!-- Left Node Ring -->
        <circle cx="${cx - 160}" cy="${y + 10}" r="8" fill="rgba(15, 23, 42, 0.8)" stroke="${tier.color}" stroke-width="1.2" />
        <!-- Right Node Ring -->
        <circle cx="${cx + 160}" cy="${y - 10}" r="8" fill="rgba(15, 23, 42, 0.8)" stroke="${tier.color}" stroke-width="1.2" />
      </g>
    `);

    // Side Callout Card on the right
    const cardY = y - 40;
    calloutPanels.push(`
      <!-- Right Side Callout Tier ${tier.level} -->
      <g transform="translate(1060, ${cardY})">
        <rect x="0" y="0" width="480" height="74" rx="4" fill="url(#cardBgGrad)" stroke="${tier.color}" stroke-width="1" />
        <path d="M 0 0 L 0 6 M 0 0 L 6 0" stroke="${tier.color}" stroke-width="2" />
        <path d="M 480 0 L 480 6 M 480 0 L 474 0" stroke="${tier.color}" stroke-width="2" />

        <!-- Level Indicator -->
        <rect x="12" y="10" width="70" height="18" rx="2" fill="rgba(37, 99, 235, 0.25)" stroke="${tier.color}" stroke-width="0.8" />
        <text x="47" y="22" fill="#f8fafc" font-size="9" font-weight="700" text-anchor="middle">LEVEL 0${tier.level}</text>

        <text x="92" y="23" fill="#64748b" font-size="9" font-weight="600">ELEVATION: <tspan fill="#38bdf8">${tier.elevation}</tspan></text>

        <text x="12" y="44" fill="#f8fafc" font-size="13" font-weight="700">${escapeXml(tier.title)}</text>
        <text x="12" y="60" fill="#94a3b8" font-size="10" font-weight="500">${escapeXml(tier.desc)}</text>

        <!-- Connecting Horizontal Line from Slab to Card -->
        <path d="M -60 37 L 0 37" stroke="${tier.color}" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#arrowCobalt)" />
      </g>
    `);
  }

  return `
    <!-- Vertical Isometric Fiber Conduits (Pillars passing through slabs) -->
    <g id="isometric-conduits">
      <!-- Center vertical riser -->
      <line x1="${cx}" y1="140" x2="${cx}" y2="760" stroke="#38bdf8" stroke-width="2" stroke-dasharray="6,4" />
      <!-- Left vertical riser -->
      <line x1="${cx - 160}" y1="160" x2="${cx - 160}" y2="760" stroke="rgba(56, 189, 248, 0.4)" stroke-width="1.2" stroke-dasharray="4,4" />
      <!-- Right vertical riser -->
      <line x1="${cx + 160}" y1="160" x2="${cx + 160}" y2="760" stroke="rgba(56, 189, 248, 0.4)" stroke-width="1.2" stroke-dasharray="4,4" />
    </g>

    <!-- Stacked 3D Strata Slabs (Bottom-to-Top rendering order for correct occlusion) -->
    ${renderedSlabs[3]}
    ${renderedSlabs[2]}
    ${renderedSlabs[1]}
    ${renderedSlabs[0]}

    <!-- Right Side HUD Callouts -->
    ${calloutPanels.join('')}

    <!-- Left Perspective Overview Card -->
    <g transform="translate(40, 715)">
      <rect x="0" y="0" width="460" height="85" rx="4" fill="url(#cardBgGrad)" stroke="rgba(56, 189, 248, 0.28)" stroke-width="1.2" />
      <text x="16" y="24" fill="#38bdf8" font-size="10" font-weight="700" letter-spacing="1">ISOMETRIC STRATA HUD</text>
      <text x="16" y="44" fill="#f8fafc" font-size="12" font-weight="600">Full 3D Layer Decomposition</text>
      <text x="16" y="64" fill="#94a3b8" font-size="10">4 structural planes, 3 fiber optic vertical risers, isolated execution boundaries.</text>
    </g>
  `;
}

/**
 * Style 3: Procedural Editorial Diagram SVG.
 * Layout: Swiss typographic grid with 3 vertical quadrants, high-contrast metrics, and elegant typography.
 */
function renderEditorialDiagramSvg(blueprint: VisualAtlasBlueprint): string {
  const colW = 485;
  const colH = 650;
  const colY = 135;

  const col1X = 40;
  const col2X = col1X + colW + 24;
  const col3X = col2X + colW + 24;

  const topNodes = blueprint.nodes || [];
  const col1Nodes = topNodes.filter((n) => n.layer === 'client' || n.layer === 'edge').slice(0, 4);
  const col2Nodes = topNodes.filter((n) => n.layer === 'orchestration' || n.layer === 'domain').slice(0, 4);
  const col3Nodes = topNodes.filter((n) => n.layer === 'infrastructure' || n.layer === 'data' || n.layer === 'tooling').slice(0, 4);

  function renderColumnNodeList(nodes: AtlasNode[], startY: number): string {
    const cards: string[] = [];
    let y = startY;
    for (let i = 0; i < Math.max(nodes.length, 3); i++) {
      const node = nodes[i];
      const label = node ? escapeXml(truncateText(node.label, 28)) : `Component-0${i + 1}`;
      const subtitle = node ? escapeXml(truncateText(node.visualBrief || node.subtitle, 40)) : 'Architectural boundary';
      const kind = node ? escapeXml(node.kind.toUpperCase()) : 'MODULE';
      const centrality = node ? Math.round(node.centrality * 100) : 80 - i * 15;

      cards.push(`
        <g transform="translate(16, ${y})">
          <rect x="0" y="0" width="${colW - 32}" height="85" rx="3" fill="rgba(10, 16, 31, 0.88)" stroke="rgba(56, 189, 248, 0.2)" stroke-width="1" />
          <line x1="0" y1="0" x2="0" y2="85" stroke="#38bdf8" stroke-width="3" />
          <text x="16" y="22" fill="#38bdf8" font-size="9" font-weight="700" letter-spacing="0.5">${kind}</text>
          <text x="${colW - 50}" y="22" fill="#64748b" font-size="9" font-weight="600">${centrality}%</text>
          <text x="16" y="44" fill="#f8fafc" font-size="13" font-weight="700">${label}</text>
          <text x="16" y="64" fill="#94a3b8" font-size="10" font-weight="500">${subtitle}</text>
        </g>
      `);
      y += 100;
    }
    return cards.join('');
  }

  return `
    <!-- Column 1: Surface & Ingress -->
    <g id="editorial-col-1" transform="translate(${col1X}, ${colY})">
      <rect x="0" y="0" width="${colW}" height="${colH}" rx="4" fill="url(#cardBgGrad)" stroke="rgba(56, 189, 248, 0.2)" stroke-width="1.2" />
      <path d="M 0 0 L ${colW} 0 L ${colW} 60 L 0 60 Z" fill="url(#cardHeaderGrad)" />
      <line x1="0" y1="60" x2="${colW}" y2="60" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" />
      <text x="20" y="28" fill="#38bdf8" font-size="10" font-weight="700" letter-spacing="1.5">SECTION 01</text>
      <text x="20" y="48" fill="#f8fafc" font-size="14" font-weight="700">INGRESS &amp; CLIENT SURFACES</text>
      ${renderColumnNodeList(col1Nodes, 80)}
    </g>

    <!-- Column 2: Domain Logic & Core -->
    <g id="editorial-col-2" transform="translate(${col2X}, ${colY})">
      <rect x="0" y="0" width="${colW}" height="${colH}" rx="4" fill="url(#cardBgGrad)" stroke="rgba(56, 189, 248, 0.2)" stroke-width="1.2" />
      <path d="M 0 0 L ${colW} 0 L ${colW} 60 L 0 60 Z" fill="url(#cardHeaderGrad)" />
      <line x1="0" y1="60" x2="${colW}" y2="60" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" />
      <text x="20" y="28" fill="#38bdf8" font-size="10" font-weight="700" letter-spacing="1.5">SECTION 02</text>
      <text x="20" y="48" fill="#f8fafc" font-size="14" font-weight="700">DOMAIN &amp; ORCHESTRATION</text>
      ${renderColumnNodeList(col2Nodes, 80)}
    </g>

    <!-- Column 3: Persistence & AI Engine -->
    <g id="editorial-col-3" transform="translate(${col3X}, ${colY})">
      <rect x="0" y="0" width="${colW}" height="${colH}" rx="4" fill="url(#cardBgGrad)" stroke="rgba(56, 189, 248, 0.2)" stroke-width="1.2" />
      <path d="M 0 0 L ${colW} 0 L ${colW} 60 L 0 60 Z" fill="url(#cardHeaderGrad)" />
      <line x1="0" y1="60" x2="${colW}" y2="60" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" />
      <text x="20" y="28" fill="#38bdf8" font-size="10" font-weight="700" letter-spacing="1.5">SECTION 03</text>
      <text x="20" y="48" fill="#f8fafc" font-size="14" font-weight="700">PERSISTENCE &amp; AI FABRIC</text>
      ${renderColumnNodeList(col3Nodes, 80)}
    </g>

    <!-- Inter-Column Elegant Connecting Flow Arrows -->
    <path d="M ${col1X + colW} ${colY + 120} L ${col2X} ${colY + 120}" stroke="#38bdf8" stroke-width="1.5" marker-end="url(#arrowCobalt)" />
    <path d="M ${col2X + colW} ${colY + 220} L ${col3X} ${colY + 220}" stroke="#38bdf8" stroke-width="1.5" marker-end="url(#arrowCobalt)" />
    <path d="M ${col3X} ${colY + 320} L ${col2X + colW} ${colY + 320}" stroke="#10b981" stroke-width="1.5" marker-end="url(#arrowEmerald)" stroke-dasharray="4,4" />

    <!-- Editorial Metrics Ribbon -->
    <g id="editorial-ribbon" transform="translate(40, 805)">
      <rect x="0" y="0" width="970" height="58" rx="4" fill="url(#cardBgGrad)" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" />
      <text x="20" y="34" fill="#38bdf8" font-size="12" font-weight="700">SYSTEM TELEMETRY</text>
      <line x1="170" y1="12" x2="170" y2="46" stroke="rgba(56, 189, 248, 0.2)" stroke-width="1" />

      <text x="190" y="26" fill="#64748b" font-size="9" font-weight="600">CIRCULAR DEPS</text>
      <text x="190" y="44" fill="#f8fafc" font-size="13" font-weight="700">${blueprint.stats.circularDeps}</text>

      <text x="320" y="26" fill="#64748b" font-size="9" font-weight="600">AVG FAN-OUT</text>
      <text x="320" y="44" fill="#38bdf8" font-size="13" font-weight="700">${(blueprint.stats.avgFanOut || 0).toFixed(1)}</text>

      <text x="440" y="26" fill="#64748b" font-size="9" font-weight="600">TOTAL NODES</text>
      <text x="440" y="44" fill="#f8fafc" font-size="13" font-weight="700">${blueprint.nodes?.length || 0}</text>

      <text x="560" y="26" fill="#64748b" font-size="9" font-weight="600">DIAGRAMS</text>
      <text x="560" y="44" fill="#f8fafc" font-size="13" font-weight="700">${blueprint.diagrams?.length || 0}</text>

      <text x="680" y="26" fill="#64748b" font-size="9" font-weight="600">EXEC FLOWS</text>
      <text x="680" y="44" fill="#10b981" font-size="13" font-weight="700">${blueprint.flows?.length || 0}</text>

      <text x="800" y="26" fill="#64748b" font-size="9" font-weight="600">AI SYNTHESIS</text>
      <text x="800" y="44" fill="#93c5fd" font-size="13" font-weight="700">${blueprint.stats.aiSynthesisLatencyMs || 0}ms</text>
    </g>
  `;
}

/**
 * Generates the complete, standalone procedural Obsidian Cobalt SVG poster.
 */
function renderProceduralPosterSvg(
  blueprint: VisualAtlasBlueprint,
  style: MediaPosterArtifact['style']
): string {
  let mainContent = '';
  let styleName = 'Cobalt Blueprint';

  switch (style) {
    case 'isometric_cutaway':
      styleName = 'Isometric Cutaway';
      mainContent = renderIsometricCutawaySvg(blueprint);
      break;
    case 'editorial_diagram':
      styleName = 'Editorial Diagram';
      mainContent = renderEditorialDiagramSvg(blueprint);
      break;
    case 'cobalt_blueprint':
    default:
      styleName = 'Cobalt Blueprint';
      mainContent = renderCobaltBlueprintSvg(blueprint);
      break;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
  ${renderSvgDefs()}

  <!-- Background Canvas -->
  <rect width="1600" height="1000" fill="url(#obsidianVoid)" />
  <rect width="1600" height="1000" fill="url(#majorGrid)" />

  <!-- Outer Blueprint Precision Frame & Coordinate Rulers -->
  ${renderSvgRulerFrame()}

  <!-- Engineering Header Bar -->
  ${renderSvgHeader(blueprint, styleName)}

  <!-- Style-Specific Architectural Blueprint Main Content -->
  ${mainContent}

  <!-- Bottom-Left Tech Badges -->
  ${renderSvgTechBadges(blueprint)}

  <!-- Bottom-Right ISO 7200 Engineering Blueprint Title Block -->
  ${renderSvgTitleBlock(blueprint, styleName)}
</svg>
`.trim();
}

/**
 * Generates the fallback procedural SVG poster, saves it to ENV.ARTIFACTS_DIR,
 * and returns the completed MediaPosterArtifact.
 */
async function generateProceduralPoster(
  blueprint: VisualAtlasBlueprint,
  style: MediaPosterArtifact['style'],
  prompt: string
): Promise<MediaPosterArtifact> {
  await ensureRuntimeDirs();
  await fsPromises.mkdir(ENV.ARTIFACTS_DIR, { recursive: true });

  const svgContent = renderProceduralPosterSvg(blueprint, style);

  const sanitizedSlug = (blueprint.metadata.fullName || blueprint.metadata.name || blueprint.repoId)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase();
  const fileName = `poster_${sanitizedSlug}_${style}_${Date.now()}.svg`;
  const filePath = path.join(ENV.ARTIFACTS_DIR, fileName);

  await fsPromises.writeFile(filePath, svgContent, 'utf8');

  return {
    id: `poster-${uuidv4()}`,
    title: formatPosterTitle(blueprint, style),
    style,
    prompt,
    imageUrl: `/artifacts/${fileName}`,
    mimeType: 'image/svg+xml',
    model: 'gemini-nano-banana-2.1/procedural-fallback',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates an architectural poster artifact for the provided blueprint.
 *
 * When Gemini API credentials (or user BYOK key) are configured, invokes
 * `gemini-nano-banana-2.1` via the v1beta Interactions API to synthesize
 * high-resolution visual imagery. If credentials are not configured or if
 * the API request encounters a transient failure, gracefully generates a
 * crisp procedural Obsidian Cobalt SVG blueprint poster fallback.
 *
 * All generated poster assets are stored in `ENV.ARTIFACTS_DIR` and served
 * at `/artifacts/...`.
 *
 * @param blueprint The comprehensive VisualAtlasBlueprint of the repository.
 * @param style Poster design style ('cobalt_blueprint' | 'isometric_cutaway' | 'editorial_diagram').
 * @param byokApiKey Optional user-supplied Bring Your Own Key.
 * @returns Complete MediaPosterArtifact with public image URL and metadata.
 */
export async function generateArchitecturePoster(
  blueprint: VisualAtlasBlueprint,
  style: MediaPosterArtifact['style'],
  byokApiKey?: string
): Promise<MediaPosterArtifact> {
  const resolvedStyle: MediaPosterArtifact['style'] =
    style === 'isometric_cutaway' || style === 'editorial_diagram' || style === 'cobalt_blueprint'
      ? style
      : 'cobalt_blueprint';

  const prompt = buildPosterPrompt(blueprint, resolvedStyle);

  // If Gemini API credentials are available, invoke gemini-nano-banana-2.1 on v1beta
  if (hasGeminiCredentials(byokApiKey)) {
    try {
      return await withV1BetaClient(async (client) => {
        const beta = client as unknown as {
          interactions: {
            create: (params: Record<string, unknown>) => Promise<unknown>;
          };
        };

        const response = await beta.interactions.create({
          model: 'gemini-nano-banana-2.1',
          input: prompt,
          response_modalities: ['IMAGE'],
        } as unknown as Record<string, unknown>);

        const extracted = extractInteractionImage(response);
        if (!extracted || !extracted.data) {
          throw new Error('gemini-nano-banana-2.1 interaction returned no image payload');
        }

        await ensureRuntimeDirs();
        await fsPromises.mkdir(ENV.ARTIFACTS_DIR, { recursive: true });

        const ext =
          extracted.mimeType === 'image/jpeg'
            ? 'jpg'
            : extracted.mimeType === 'image/webp'
            ? 'webp'
            : extracted.mimeType === 'image/svg+xml'
            ? 'svg'
            : 'png';

        const sanitizedSlug = (blueprint.metadata.fullName || blueprint.metadata.name || blueprint.repoId)
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .toLowerCase();
        const fileName = `poster_${sanitizedSlug}_${resolvedStyle}_${Date.now()}.${ext}`;
        const filePath = path.join(ENV.ARTIFACTS_DIR, fileName);

        await fsPromises.writeFile(filePath, Buffer.from(extracted.data, 'base64'));

        const artifact: MediaPosterArtifact = {
          id: `poster-${uuidv4()}`,
          title: formatPosterTitle(blueprint, resolvedStyle),
          style: resolvedStyle,
          prompt,
          imageUrl: `/artifacts/${fileName}`,
          mimeType: extracted.mimeType,
          model: 'gemini-nano-banana-2.1',
          generatedAt: new Date().toISOString(),
        };

        return artifact;
      }, byokApiKey);
    } catch (err: unknown) {
      console.warn(
        `[PosterAtelier] gemini-nano-banana-2.1 synthesis error; falling back to procedural SVG blueprint. Reason:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Fallback to crisp procedural Obsidian Cobalt SVG poster
  return await generateProceduralPoster(blueprint, resolvedStyle, prompt);
}
