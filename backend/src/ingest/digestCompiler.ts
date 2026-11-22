// =============================================================================
// GitUnderstand — Gitingest Digest Compiler
// Gitingest-compatible + surgical token-budgeted digest & agent brief compiler
// =============================================================================

import type {
  VisualAtlasBlueprint,
  DigestFilterOptions,
  CompiledDigest,
  RepoFileRecord,
  SubsystemCluster,
} from '../../../shared/types.js';

/**
 * Standard default filtering options for GitUnderstand digests.
 * Filters out build outputs, large lockfiles, binary assets, and media.
 */
export const DEFAULT_DIGEST_OPTIONS: DigestFilterOptions = {
  includePatterns: [],
  excludePatterns: [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    '.next/**',
    'coverage/**',
    '**/*.min.js',
    '**/*.min.css',
    '**/*.map',
    '**/*.lock',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    '**/*.png',
    '**/*.jpg',
    '**/*.jpeg',
    '**/*.gif',
    '**/*.svg',
    '**/*.ico',
    '**/*.woff',
    '**/*.woff2',
    '**/*.ttf',
    '**/*.eot',
    '**/*.mp4',
    '**/*.mp3',
    '**/*.wav',
    '**/*.zip',
    '**/*.tar.gz',
    '**/*.pdf',
    '**/*.wasm',
  ],
  maxFileSizeBytes: 128 * 1024, // 128 KB
  maxTotalTokens: 200_000,
  includeTests: false,
  includeDocs: true,
  includeTreeHeader: true,
  selectedSubsystems: undefined,
};

/**
 * Converts a glob pattern (e.g. `node_modules/**`, `*.min.js`) into a RegExp.
 */
function globToRegExp(pattern: string): RegExp {
  let regexStr = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        regexStr += '(?:.*/)?';
        i += 3;
      } else {
        regexStr += '.*';
        i += 2;
      }
    } else if (c === '*') {
      regexStr += '[^/]*';
      i++;
    } else if (c === '?') {
      regexStr += '[^/]';
      i++;
    } else if ('[].+^$(){}|=!\\'.includes(c)) {
      regexStr += '\\' + c;
      i++;
    } else {
      regexStr += c;
      i++;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr, 'i');
}

/**
 * Evaluates whether a file path matches a glob pattern.
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  const normPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const normPattern = pattern.replace(/\\/g, '/').trim();
  if (!normPattern) return false;

  if (normPath === normPattern) return true;

  // If pattern has no slash (e.g. "*.lock", "package-lock.json"), match basename as well
  if (!normPattern.includes('/')) {
    const filename = normPath.split('/').pop() || normPath;
    if (globToRegExp(normPattern).test(filename)) {
      return true;
    }
  }

  return globToRegExp(normPattern).test(normPath);
}

/**
 * Detects whether a file is a test or spec file.
 */
function isTestFile(file: RepoFileRecord): boolean {
  if (file.isTest) return true;
  const p = file.path.toLowerCase().replace(/\\/g, '/');
  return (
    p.includes('/test/') ||
    p.includes('/tests/') ||
    p.includes('/__tests__/') ||
    p.includes('/spec/') ||
    p.includes('/specs/') ||
    /\.(test|spec)\.[a-z0-9]+$/i.test(p) ||
    /_test\.[a-z0-9]+$/i.test(p)
  );
}

/**
 * Detects whether a file is a documentation or markdown asset.
 */
function isDocFile(file: RepoFileRecord): boolean {
  const p = file.path.toLowerCase().replace(/\\/g, '/');
  const ext = file.extension ? file.extension.toLowerCase().replace(/^\./, '') : '';
  const docExtensions = ['md', 'mdx', 'markdown', 'rst', 'adoc', 'txt'];
  if (docExtensions.includes(ext)) {
    return true;
  }
  return (
    p.startsWith('docs/') ||
    p.includes('/docs/') ||
    p.startsWith('documentation/') ||
    p.includes('/documentation/')
  );
}

/**
 * Renders a crisp Unicode box-drawing directory tree (`├──`, `└──`, `│`).
 *
 * @param paths List of relative file paths (e.g. `['src/index.ts', 'src/utils/math.ts']`)
 * @returns Formatted box-drawing directory tree string starting with `.`
 */
export function renderAsciiTree(paths: string[]): string {
  if (!paths || paths.length === 0) {
    return '.';
  }

  interface TreeNode {
    name: string;
    isDir: boolean;
    children: Map<string, TreeNode>;
  }

  const root: TreeNode = {
    name: '.',
    isDir: true,
    children: new Map(),
  };

  for (const rawPath of paths) {
    const cleanPath = rawPath.replace(/\\/g, '/').replace(/^[./]+/, '').trim();
    if (!cleanPath) continue;

    const segments = cleanPath.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isDir = i < segments.length - 1;
      let next = current.children.get(seg);
      if (!next) {
        next = {
          name: seg,
          isDir,
          children: new Map(),
        };
        current.children.set(seg, next);
      } else if (isDir) {
        next.isDir = true;
      }
      current = next;
    }
  }

  const lines: string[] = ['.'];

  function walk(node: TreeNode, prefix: string): void {
    const children = Array.from(node.children.values()).sort((a, b) => {
      // Directories first, then alphabetical case-insensitive
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    });

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const isLast = i === children.length - 1;
      const marker = isLast ? '└── ' : '├── ';
      lines.push(`${prefix}${marker}${child.name}`);
      const extension = isLast ? '    ' : '│   ';
      walk(child, prefix + extension);
    }
  }

  walk(root, '');
  return lines.join('\n');
}

/**
 * Formats a single file record into the canonical Gitingest delimiter block.
 */
function formatFileBlock(file: RepoFileRecord): string {
  const fileTokens =
    file.estimatedTokens > 0
      ? file.estimatedTokens
      : Math.max(1, Math.ceil((file.content?.length || file.sizeBytes || 0) / 4));

  const separator = '================================================';
  const header = `${separator}\nFILE: ${file.path} (${fileTokens} tokens)\n${separator}`;
  const content =
    file.content !== undefined
      ? file.content
      : `// [Content not hydrated for ${file.path} (${file.sizeBytes} bytes)]`;

  return `${header}\n${content}`;
}

/**
 * Compiles a Gitingest-compatible, surgical token-budgeted digest from a VisualAtlasBlueprint.
 *
 * Filters files by include/exclude patterns, size, tests, docs, and selected subsystems.
 * When token budget is tight, prioritizes architectural entrypoints and high centrality files
 * so the most valuable architectural files always fit first.
 */
export function compileDigest(
  blueprint: VisualAtlasBlueprint,
  options?: Partial<DigestFilterOptions>
): CompiledDigest {
  const opts: DigestFilterOptions = {
    includePatterns: options?.includePatterns ?? DEFAULT_DIGEST_OPTIONS.includePatterns,
    excludePatterns: options?.excludePatterns ?? DEFAULT_DIGEST_OPTIONS.excludePatterns,
    maxFileSizeBytes: options?.maxFileSizeBytes ?? DEFAULT_DIGEST_OPTIONS.maxFileSizeBytes,
    maxTotalTokens: options?.maxTotalTokens ?? DEFAULT_DIGEST_OPTIONS.maxTotalTokens,
    includeTests: options?.includeTests ?? DEFAULT_DIGEST_OPTIONS.includeTests,
    includeDocs: options?.includeDocs ?? DEFAULT_DIGEST_OPTIONS.includeDocs,
    includeTreeHeader: options?.includeTreeHeader ?? DEFAULT_DIGEST_OPTIONS.includeTreeHeader,
    selectedSubsystems: options?.selectedSubsystems ?? DEFAULT_DIGEST_OPTIONS.selectedSubsystems,
  };

  const rawFiles = blueprint.files || [];

  // 1. Build lookup for subsystem filtering if specified
  let allowedSubsystemFiles: Set<string> | null = null;
  if (opts.selectedSubsystems && opts.selectedSubsystems.length > 0) {
    allowedSubsystemFiles = new Set<string>();
    const selectedNormalized = new Set(
      opts.selectedSubsystems.map((s) => s.toLowerCase().trim())
    );

    if (blueprint.subsystems) {
      for (const sub of blueprint.subsystems) {
        if (
          selectedNormalized.has(sub.id.toLowerCase()) ||
          selectedNormalized.has(sub.name.toLowerCase())
        ) {
          for (const fp of sub.filePaths || []) {
            allowedSubsystemFiles.add(fp);
          }
          for (const ep of sub.entrypointPaths || []) {
            allowedSubsystemFiles.add(ep);
          }
        }
      }
    }

    if (blueprint.nodes) {
      for (const node of blueprint.nodes) {
        if (selectedNormalized.has(node.subsystemId.toLowerCase())) {
          for (const fp of node.filePaths || []) {
            allowedSubsystemFiles.add(fp);
          }
          if (node.primaryFile) {
            allowedSubsystemFiles.add(node.primaryFile);
          }
        }
      }
    }
  }

  // 2. Filter files
  const filteredFiles = rawFiles.filter((file) => {
    // Filter by max size
    if (opts.maxFileSizeBytes > 0 && file.sizeBytes > opts.maxFileSizeBytes) {
      return false;
    }

    // Filter tests
    if (!opts.includeTests && isTestFile(file)) {
      return false;
    }

    // Filter docs
    if (!opts.includeDocs && isDocFile(file)) {
      return false;
    }

    // Filter by subsystem membership
    if (allowedSubsystemFiles !== null && !allowedSubsystemFiles.has(file.path)) {
      return false;
    }

    // Filter by includePatterns (if provided, file must match at least one)
    if (opts.includePatterns.length > 0) {
      const matched = opts.includePatterns.some((pattern) => matchesPattern(file.path, pattern));
      if (!matched) return false;
    }

    // Filter by excludePatterns (if matched, file is excluded)
    if (opts.excludePatterns.length > 0) {
      const excluded = opts.excludePatterns.some((pattern) => matchesPattern(file.path, pattern));
      if (excluded) return false;
    }

    return true;
  });

  // 3. Sort files by architectural importance (isEntrypoint desc, centrality desc, fanIn desc, path asc)
  // so the most valuable architectural files always fit first when token budget is tight!
  const sortedCandidates = [...filteredFiles].sort((a, b) => {
    if (a.isEntrypoint !== b.isEntrypoint) {
      return a.isEntrypoint ? -1 : 1;
    }
    if (b.centrality !== a.centrality) {
      return b.centrality - a.centrality;
    }
    if (b.fanIn !== a.fanIn) {
      return b.fanIn - a.fanIn;
    }
    return a.path.localeCompare(b.path);
  });

  // 4. Greedily accumulate files within maxTotalTokens
  const includedFiles: RepoFileRecord[] = [];
  let accumulatedTokens = 0;
  let accumulatedBytes = 0;
  let isTruncated = false;

  for (const file of sortedCandidates) {
    const fileTokens =
      file.estimatedTokens > 0
        ? file.estimatedTokens
        : Math.max(1, Math.ceil((file.content?.length || file.sizeBytes || 0) / 4));

    if (accumulatedTokens + fileTokens <= opts.maxTotalTokens) {
      includedFiles.push(file);
      accumulatedTokens += fileTokens;
      accumulatedBytes += file.sizeBytes || file.content?.length || 0;
    } else {
      isTruncated = true;
    }
  }

  // 5. Construct summary header, tree, and digest body
  const repoSlug = blueprint.metadata?.fullName || blueprint.repoId || 'unknown/repo';
  const branch = blueprint.metadata?.branch || blueprint.metadata?.defaultBranch || 'main';
  const includedCount = includedFiles.length;
  const excludedCount = rawFiles.length - includedCount;
  const budgetUtilization =
    opts.maxTotalTokens > 0
      ? accumulatedTokens / opts.maxTotalTokens
      : 0;

  const summaryHeader = [
    '================================================================================',
    'GITUNDERSTAND REPOSITORY DIGEST',
    `Repository: ${repoSlug}`,
    `Branch: ${branch}`,
    `Architecture Pattern: ${blueprint.architecturePattern || 'General Application'}`,
    `Files in Blueprint: ${rawFiles.length} | Included: ${includedCount} | Excluded: ${excludedCount}`,
    `Total Tokens: ${accumulatedTokens.toLocaleString()} / ${opts.maxTotalTokens.toLocaleString()} (${(budgetUtilization * 100).toFixed(1)}% budget)`,
    `Truncated: ${isTruncated ? 'YES (budget reached)' : 'NO'}`,
    '================================================================================',
  ].join('\n');

  const treeText = renderAsciiTree(includedFiles.map((f) => f.path));

  const sections: string[] = [summaryHeader];

  if (opts.includeTreeHeader) {
    sections.push(
      [
        '================================================',
        'DIRECTORY STRUCTURE',
        '================================================',
        treeText,
      ].join('\n')
    );
  }

  if (includedFiles.length > 0) {
    const fileBlocks = includedFiles.map(formatFileBlock).join('\n\n');
    sections.push(fileBlocks);
  } else {
    sections.push('// No files matched the filter criteria or budget constraints.');
  }

  const digestText = sections.join('\n\n') + '\n';

  return {
    repoSlug,
    branch,
    summaryHeader,
    treeText,
    digestText,
    includedFiles: includedCount,
    excludedFiles: excludedCount,
    totalTokens: accumulatedTokens,
    totalBytes: accumulatedBytes,
    budgetTarget: opts.maxTotalTokens,
    budgetUtilization,
    truncated: isTruncated,
  };
}

/**
 * Helper to synthesize a crisp Mermaid flowchart if no diagrams exist in blueprint.
 */
function synthesizeFallbackMermaid(
  subsystems: SubsystemCluster[] = []
): string {
  if (subsystems.length === 0) {
    return 'graph TD\n  App["Application Core"]';
  }

  const lines: string[] = ['flowchart TD'];
  for (const sub of subsystems) {
    const safeId = sub.id.replace(/[^a-zA-Z0-9_]/g, '_');
    const safeName = sub.name.replace(/["\\]/g, '');
    lines.push(`  ${safeId}["${safeName} (${sub.layer})"]`);
  }

  for (let i = 0; i < subsystems.length - 1; i++) {
    const curr = subsystems[i].id.replace(/[^a-zA-Z0-9_]/g, '_');
    const next = subsystems[i + 1].id.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`  ${curr} --> ${next}`);
  }

  return lines.join('\n');
}

/**
 * Compiles an agent-ready visual architecture + Mermaid + subsystem + key-file summary Markdown brief.
 * Serves as the canonical content for `git-understand.com/:owner/:repo.md`.
 *
 * @param blueprint The comprehensive VisualAtlasBlueprint
 * @returns Agent-ready visual architecture Markdown brief
 */
export function compileAgentMarkdownBrief(blueprint: VisualAtlasBlueprint): string {
  const meta = blueprint.metadata;
  const repoSlug = meta?.fullName || blueprint.repoId || 'unknown/repo';
  const branch = meta?.branch || meta?.defaultBranch || 'main';
  const url = `https://git-understand.com/${repoSlug}`;

  const mdParts: string[] = [];

  // 1. Header & Identity
  mdParts.push(`# GitUnderstand Architecture Brief: ${repoSlug}`);
  mdParts.push(`> **Interactive Visual Canvas:** [${url}](${url})  `);
  mdParts.push(`> **Repository Source:** [${meta?.htmlUrl || `https://github.com/${repoSlug}`}](${meta?.htmlUrl || `https://github.com/${repoSlug}`})  `);
  mdParts.push(`> **Branch:** \`${branch}\` | **Generated:** \`${blueprint.generatedAt || new Date().toISOString()}\``);
  mdParts.push('');

  // 2. High-Level Summary
  if (blueprint.headline || meta?.description) {
    mdParts.push(`### Executive Summary`);
    mdParts.push(`${blueprint.headline || meta?.description}`);
    if (blueprint.oneLiner) {
      mdParts.push(`*${blueprint.oneLiner}*`);
    }
    mdParts.push('');
  }

  mdParts.push(`- **Architecture Pattern:** ${blueprint.architecturePattern || 'Modular Monolith'}`);
  if (blueprint.techStackBadges && blueprint.techStackBadges.length > 0) {
    mdParts.push(`- **Tech Stack:** ${blueprint.techStackBadges.map((b) => `\`${b}\``).join(' ')}`);
  }
  mdParts.push('');

  // 3. Key Metrics Table
  const stats = blueprint.stats;
  mdParts.push(`## Repository Topology & Health`);
  mdParts.push('| Metric | Value |');
  mdParts.push('| :--- | :--- |');
  mdParts.push(`| **Primary Language** | ${meta?.primaryLanguage || 'TypeScript / Multi'} |`);
  mdParts.push(`| **Total Files** | ${stats?.totalFiles ?? blueprint.files?.length ?? 0} |`);
  mdParts.push(`| **Analyzed Files** | ${stats?.analyzedFiles ?? blueprint.files?.length ?? 0} |`);
  mdParts.push(`| **Total Lines** | ${(stats?.totalLines ?? 0).toLocaleString()} |`);
  mdParts.push(`| **Total Estimated Tokens** | ${(stats?.totalTokens ?? 0).toLocaleString()} |`);
  mdParts.push(`| **Circular Dependencies** | ${stats?.circularDeps ?? 0} |`);
  mdParts.push(`| **Average Fan-Out** | ${stats?.avgFanOut ? stats.avgFanOut.toFixed(2) : '1.00'} |`);
  if (meta?.stars !== undefined) {
    mdParts.push(`| **GitHub Stars / Forks** | ⭐ ${meta.stars.toLocaleString()} / ⑂ ${meta.forks?.toLocaleString() ?? 0} |`);
  }
  mdParts.push('');

  // 4. System Architecture Diagrams (Mermaid)
  mdParts.push(`## Visual System Architecture`);
  if (blueprint.diagrams && blueprint.diagrams.length > 0) {
    for (const diagram of blueprint.diagrams) {
      mdParts.push(`### ${diagram.title}`);
      if (diagram.subtitle) {
        mdParts.push(`*${diagram.subtitle}*`);
      }
      mdParts.push('');
      mdParts.push('```mermaid');
      mdParts.push(diagram.code.trim());
      mdParts.push('```');
      mdParts.push('');
    }
  } else {
    mdParts.push('### Subsystem Interaction Graph');
    mdParts.push('');
    mdParts.push('```mermaid');
    mdParts.push(synthesizeFallbackMermaid(blueprint.subsystems));
    mdParts.push('```');
    mdParts.push('');
  }

  // 5. Architectural Strata (3D Layers)
  if (blueprint.strata && blueprint.strata.length > 0) {
    mdParts.push(`## Architectural Strata`);
    mdParts.push('The codebase is partitioned into distinct vertical strata:');
    mdParts.push('');
    mdParts.push('| Elevation | Layer | Title | Files | Tokens | Description |');
    mdParts.push('| :---: | :--- | :--- | :---: | :---: | :--- |');

    const sortedStrata = [...blueprint.strata].sort((a, b) => b.elevation - a.elevation);
    for (const st of sortedStrata) {
      mdParts.push(
        `| ${st.elevation} | \`${st.layer}\` | **${st.title}** | ${st.fileCount} | ${st.tokenCount.toLocaleString()} | ${st.description} |`
      );
    }
    mdParts.push('');
  }

  // 6. Subsystem Clusters & Invariants
  if (blueprint.subsystems && blueprint.subsystems.length > 0) {
    mdParts.push(`## Subsystem Clusters & Invariants`);
    mdParts.push('Surgical invariants that must be preserved during agent modifications:');
    mdParts.push('');

    for (const sub of blueprint.subsystems) {
      const healthText = sub.healthScore !== undefined ? ` • Health: \`${sub.healthScore}/100\`` : '';
      mdParts.push(`### ${sub.name} (\`${sub.layer}\`${healthText})`);
      if (sub.tagline) {
        mdParts.push(`> *${sub.tagline}*`);
      }
      mdParts.push('');
      mdParts.push(`- **Estimated Tokens:** ${sub.totalTokens.toLocaleString()}`);

      if (sub.entrypointPaths && sub.entrypointPaths.length > 0) {
        mdParts.push(`- **Entrypoint(s):** ${sub.entrypointPaths.map((p) => `\`${p}\``).join(', ')}`);
      }

      if (sub.filePaths && sub.filePaths.length > 0) {
        const fileSample = sub.filePaths.slice(0, 8);
        const moreCount = sub.filePaths.length - fileSample.length;
        const fileListStr = fileSample.map((p) => `\`${p}\``).join(', ');
        mdParts.push(`- **Core Files:** ${fileListStr}${moreCount > 0 ? ` *(+${moreCount} more)*` : ''}`);
      }

      if (sub.invariants && sub.invariants.length > 0) {
        mdParts.push(`- **Architectural Invariants (DO NOT VIOLATE):**`);
        for (const inv of sub.invariants) {
          mdParts.push(`  - 🛡️ ${inv}`);
        }
      }

      if (sub.summaryBullets && sub.summaryBullets.length > 0) {
        mdParts.push(`- **Key Capabilities:**`);
        for (const bullet of sub.summaryBullets) {
          mdParts.push(`  - ${bullet}`);
        }
      }
      mdParts.push('');
    }
  }

  // 7. Critical Execution Flows
  if (blueprint.flows && blueprint.flows.length > 0) {
    mdParts.push(`## Critical Execution Flows`);
    mdParts.push('End-to-end request, ingestion, and inference lifecycles:');
    mdParts.push('');

    for (const flow of blueprint.flows) {
      mdParts.push(`### Flow: ${flow.title} (\`${flow.category}\`)`);
      mdParts.push(`- **Trigger:** \`${flow.trigger}\``);
      if (flow.subtitle) {
        mdParts.push(`- **Context:** ${flow.subtitle}`);
      }
      mdParts.push('');

      if (flow.steps && flow.steps.length > 0) {
        mdParts.push('| Step | Title | Action | Module & Location |');
        mdParts.push('| :---: | :--- | :--- | :--- |');
        for (const step of flow.steps) {
          const loc = step.filePath ? `\`${step.filePath}:${step.lineStart}\`` : '`dynamic`';
          mdParts.push(
            `| ${step.stepNumber} | **${step.title}** | ${step.action} | ${loc} |`
          );
        }
        mdParts.push('');
      }
    }
  }

  // 8. Key Architectural Files & Entrypoints
  const allFiles = blueprint.files || [];
  const keyFiles = [...allFiles]
    .filter((f) => f.isEntrypoint || f.centrality > 0.5)
    .sort((a, b) => {
      if (a.isEntrypoint !== b.isEntrypoint) return a.isEntrypoint ? -1 : 1;
      return b.centrality - a.centrality;
    })
    .slice(0, 20);

  if (keyFiles.length > 0) {
    mdParts.push(`## Architectural Entrypoints & Key Files`);
    mdParts.push('| Path | Layer | Centrality | Fan-In | Fan-Out | Tokens | Symbols |');
    mdParts.push('| :--- | :---: | :---: | :---: | :---: | :---: | :--- |');

    for (const f of keyFiles) {
      const entryBadge = f.isEntrypoint ? ' ⭐' : '';
      const symbolPreview =
        f.symbols && f.symbols.length > 0
          ? f.symbols
              .slice(0, 3)
              .map((s) => `\`${s.name}\``)
              .join(', ')
          : '-';
      mdParts.push(
        `| \`${f.path}\`${entryBadge} | \`${f.layer}\` | ${(f.centrality * 100).toFixed(0)}% | ${f.fanIn} | ${f.fanOut} | ${f.estimatedTokens} | ${symbolPreview} |`
      );
    }
    mdParts.push('');
  }

  // 9. Decision-1 X-Ray Health Report (if present)
  if (blueprint.xray) {
    const xray = blueprint.xray;
    mdParts.push(`## Decision-1 X-Ray Architectural Health`);
    mdParts.push(`- **Overall Codebase Health:** **${xray.overallScore.toFixed(1)}/100**`);
    mdParts.push(`- **Calibrated Entropy:** \`${xray.meanEntropy.toFixed(3)}\``);
    mdParts.push(`- **Recommended Model Tier:** \`${xray.recommendedModelTier}\``);
    mdParts.push(`- **Routing Rationale:** ${xray.routingRationale}`);
    mdParts.push('');

    if (xray.modules && xray.modules.length > 0) {
      mdParts.push('| Module | Health | Blast Radius | Top Finding |');
      mdParts.push('| :--- | :---: | :---: | :--- |');
      for (const m of xray.modules.slice(0, 10)) {
        mdParts.push(
          `| **${m.label}** (\`${m.primaryFile}\`) | ${m.overallHealth.toFixed(0)}% | ${(m.blastRadius * 100).toFixed(0)}% | ${m.topFinding} |`
        );
      }
      mdParts.push('');
    }
  }

  // 10. Codemap Tour Stops (if present)
  if (blueprint.codemapTour && blueprint.codemapTour.length > 0) {
    mdParts.push(`## Codemap Guided Tour`);
    mdParts.push('Recommended sequence for onboarding developers and coding agents:');
    mdParts.push('');

    const sortedTour = [...blueprint.codemapTour].sort((a, b) => a.order - b.order);
    for (const stop of sortedTour) {
      mdParts.push(`### Stop ${stop.order}: ${stop.title}`);
      mdParts.push(`- **Visual Hook:** ${stop.visualHook}`);
      mdParts.push(`- **File Target:** \`${stop.filePath}:${stop.lineStart}-${stop.lineEnd}\``);
      mdParts.push(`- **Recommended Lens:** \`${stop.recommendedLens}\``);
      mdParts.push(`> ${stop.explanation}`);
      mdParts.push('');
    }
  }

  // 11. Agent Operating Instructions
  mdParts.push(`## Agent Modification Guidelines`);
  mdParts.push(`When working with this repository:`);
  mdParts.push(`1. **Preserve Layer Invariants:** Never import lower-stratum infrastructure directly into high-stratum client modules.`);
  mdParts.push(`2. **Inspect Entrypoints First:** Key entrypoints are flagged with ⭐ above.`);
  mdParts.push(`3. **Token Budgets:** Fetch surgical context using \`compileDigest(blueprint, { selectedSubsystems: ['...'] })\` rather than reading raw repository dumps.`);
  mdParts.push(`4. **Verification:** Inspect the interactive visual canvas at [${url}](${url}) for 3D strata validation and Decision-1 heatmaps.`);
  mdParts.push('');

  return mdParts.join('\n');
}
