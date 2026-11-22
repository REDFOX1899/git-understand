// =============================================================================
// GitUnderstand (git-understand.com) — Visual Lenses & X-Ray Routes
// Thin production controllers delegating to real Gemini 4 & Decision-1 engines
// =============================================================================

import { Router, type Request, type Response } from 'express';
import type {
  CircleExplainRequest,
  VisualAtlasBlueprint,
} from '../../../shared/types.js';
import { atlasCache, getShowcaseBlueprint } from '../ingest/index.js';
import { explainCircledSubgraph } from '../gemini/circleExplainer.js';
import { runCodebaseXRay } from '../gemini/xrayDecisions.js';
import {
  generateMermaidSuite,
  modifyMermaidDiagram,
} from '../gemini/diagramSynthesizer.js';
import { choreographFlowsAndTour } from '../gemini/flowChoreographer.js';

export const visualRoutes: Router = Router();

function extractByokKey(req: Request): string | undefined {
  const header = req.headers['x-gemini-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  if (Array.isArray(header) && header[0]?.trim()) return header[0].trim();
  return undefined;
}

async function resolveCachedOrShowcase(repoId: string): Promise<VisualAtlasBlueprint | null> {
  const trimmed = repoId.trim();
  if (!trimmed) return null;
  const cached = await atlasCache.get(trimmed);
  if (cached) return cached;
  const showcase = getShowcaseBlueprint(trimmed);
  if (showcase) {
    await atlasCache.set(showcase);
    return showcase;
  }
  return null;
}

// -----------------------------------------------------------------------------
// 1. POST /circle-explain — Multimodal Circle-to-Explain (Gemini 4 Neon)
// -----------------------------------------------------------------------------
visualRoutes.post('/circle-explain', async (req: Request, res: Response) => {
  try {
    const body = req.body as CircleExplainRequest;
    if (!body || typeof body.repoId !== 'string' || !body.repoId.trim()) {
      res.status(400).json({ error: 'Missing required field: repoId' });
      return;
    }

    const blueprint = await resolveCachedOrShowcase(body.repoId);
    if (!blueprint) {
      res.status(404).json({ error: `Repository not found for repoId "${body.repoId}"` });
      return;
    }

    const byokApiKey = extractByokKey(req);
    const result = await explainCircledSubgraph(blueprint, body, byokApiKey);
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Circle-to-Explain failed: ${message}` });
  }
});

// -----------------------------------------------------------------------------
// 2. POST /xray — Calibrated 9-Pillar Codebase X-Ray (gemini-decision-1)
// -----------------------------------------------------------------------------
visualRoutes.post('/xray', async (req: Request, res: Response) => {
  try {
    const { repoId, maxModules } = (req.body || {}) as {
      repoId?: string;
      maxModules?: number;
    };

    if (!repoId || typeof repoId !== 'string' || !repoId.trim()) {
      res.status(400).json({ error: 'Missing required field: repoId' });
      return;
    }

    const blueprint = await resolveCachedOrShowcase(repoId);
    if (!blueprint) {
      res.status(404).json({ error: `Repository not found for repoId "${repoId}"` });
      return;
    }

    const byokApiKey = extractByokKey(req);
    const report = await runCodebaseXRay(blueprint, {
      byokApiKey,
      maxModules: typeof maxModules === 'number' ? maxModules : undefined,
    });

    blueprint.xray = report;
    await atlasCache.set(blueprint);

    res.status(200).json(report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Decision-1 X-Ray audit failed: ${message}` });
  }
});

// -----------------------------------------------------------------------------
// 3. POST /diagrams/modify & /diagram/modify — AI Mermaid Customizer (Gemini 4 Argon/Neon)
// -----------------------------------------------------------------------------
async function handleModifyDiagram(req: Request, res: Response): Promise<void> {
  try {
    const { repoId, diagramId, instruction } = (req.body || {}) as {
      repoId?: string;
      diagramId?: string;
      instruction?: string;
    };

    if (!repoId || !instruction || !instruction.trim()) {
      res.status(400).json({ error: 'Missing required fields: repoId and instruction' });
      return;
    }

    const blueprint = await resolveCachedOrShowcase(repoId);
    if (!blueprint) {
      res.status(404).json({ error: `Repository not found for repoId "${repoId}"` });
      return;
    }

    const current =
      blueprint.diagrams.find((d) => d.id === diagramId) || blueprint.diagrams[0];
    if (!current) {
      res.status(404).json({ error: 'No base diagram found to modify' });
      return;
    }

    const byokApiKey = extractByokKey(req);
    const updated = await modifyMermaidDiagram(blueprint, current, instruction.trim(), byokApiKey);

    const idx = blueprint.diagrams.findIndex((d) => d.id === updated.id);
    if (idx >= 0) {
      blueprint.diagrams[idx] = updated;
    } else {
      blueprint.diagrams.push(updated);
    }
    await atlasCache.set(blueprint);

    res.status(200).json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Diagram modification failed: ${message}` });
  }
}

visualRoutes.post('/diagrams/modify', handleModifyDiagram);
visualRoutes.post('/diagram/modify', handleModifyDiagram);

// -----------------------------------------------------------------------------
// 4. POST /diagrams/generate & /diagram/generate — Mermaid Suite Generator (Gemini 4 Neon)
// -----------------------------------------------------------------------------
async function handleGenerateDiagram(req: Request, res: Response): Promise<void> {
  try {
    const { repoId, kind } = (req.body || {}) as {
      repoId?: string;
      kind?: 'architecture' | 'sequence' | 'class';
    };

    if (!repoId || typeof repoId !== 'string') {
      res.status(400).json({ error: 'Missing required field: repoId' });
      return;
    }

    const blueprint = await resolveCachedOrShowcase(repoId);
    if (!blueprint) {
      res.status(404).json({ error: `Repository not found for repoId "${repoId}"` });
      return;
    }

    const byokApiKey = extractByokKey(req);
    const kinds: Array<'architecture' | 'sequence' | 'class'> = kind
      ? [kind]
      : ['architecture', 'sequence', 'class'];
    const generated = await generateMermaidSuite(blueprint, { byokApiKey, kinds });

    const merged = [...blueprint.diagrams];
    for (const diagram of generated) {
      const existingIdx = merged.findIndex((d) => d.kind === diagram.kind);
      if (existingIdx >= 0) {
        merged[existingIdx] = diagram;
      } else {
        merged.push(diagram);
      }
    }
    blueprint.diagrams = merged;
    await atlasCache.set(blueprint);

    res.status(200).json(merged);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Diagram generation failed: ${message}` });
  }
}

visualRoutes.post('/diagrams/generate', handleGenerateDiagram);
visualRoutes.post('/diagram/generate', handleGenerateDiagram);

// -----------------------------------------------------------------------------
// 5. POST /flows/regenerate — Animated Execution Flows & Codemap Tour (Gemini 4 Neon)
// -----------------------------------------------------------------------------
visualRoutes.post('/flows/regenerate', async (req: Request, res: Response) => {
  try {
    const { repoId } = (req.body || {}) as { repoId?: string };
    if (!repoId || typeof repoId !== 'string') {
      res.status(400).json({ error: 'Missing required field: repoId' });
      return;
    }

    const blueprint = await resolveCachedOrShowcase(repoId);
    if (!blueprint) {
      res.status(404).json({ error: `Repository not found for repoId "${repoId}"` });
      return;
    }

    const byokApiKey = extractByokKey(req);
    const result = await choreographFlowsAndTour(blueprint, byokApiKey);

    blueprint.flows = result.flows;
    blueprint.codemapTour = result.codemapTour;
    await atlasCache.set(blueprint);

    res.status(200).json({
      flows: result.flows,
      codemapTour: result.codemapTour,
      model: result.model,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Flow regeneration failed: ${message}` });
  }
});

export default visualRoutes;
