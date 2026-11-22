# GitUnderstand — Visual-First Codebase Intelligence Studio

<div align="center">

[![Production URL](https://img.shields.io/badge/Production-git--understand.com-0052FF?style=for-the-badge&logo=google-chrome&logoColor=white)](https://git-understand.com)
[![API & Engine](https://img.shields.io/badge/API_Engine-api.git--understand.com-38BDF8?style=for-the-badge&logo=fastapi&logoColor=white)](https://api.git-understand.com/health)
[![TypeScript ESM](https://img.shields.io/badge/TypeScript-5.8_ESM-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.2_React_19-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Gemini 4](https://img.shields.io/badge/Google_Gemini-4_Adaptive_Tier-4285F4?style=for-the-badge&logo=google-gemini&logoColor=white)](https://ai.google.dev/)
[![Gemini 3.8 Live](https://img.shields.io/badge/Gemini_Live-3.8_Voice_WebSocket-10B981?style=for-the-badge&logo=google-gemini&logoColor=white)](https://ai.google.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4_Obsidian_Cobalt-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Google Cloud Run](https://img.shields.io/badge/Engine-Google_Cloud_Run-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)](https://cloud.google.com/run)
[![Vercel Edge](https://img.shields.io/badge/Frontend-Vercel_Edge-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)
[![IONOS DNS](https://img.shields.io/badge/DNS-1%261_IONOS_Anycast-003D8F?style=for-the-badge&logo=ionos&logoColor=white)](https://www.ionos.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-F59E0B?style=for-the-badge)](LICENSE)

<br/>

**Transform any GitHub repository into an interactive, spatial architectural canvas, 3D strata stack, animated execution flows, calibrated Decision-1 X-Ray health matrix, and live conversational voice tour powered by Google Gemini 4.**

[Explore Live Studio](https://git-understand.com) · [API Documentation](https://api.git-understand.com/health) · [Architecture Blueprint](docs/ARCHITECTURE.md) · [Deployment Guide](deploy/DEPLOYMENT.md)

</div>

---

## The Core Philosophy: *"No one reads code anymore — MORE VISUALS."*

Modern software systems have outgrown flat text files. When onboarding onto a complex microservices repository, debugging an unfamiliar monorepo, or auditing architectural blast radiuses, reading thousands of lines of raw source code line-by-line is the slowest possible way to build an accurate mental model.

**GitUnderstand rejects the "wall of text" paradigm.**

Instead, GitUnderstand treats codebases as high-dimensional topological systems. It uses deterministic AST parsing paired with Google Gemini 4 models to synthesize interactive spatial maps, isometric 3D strata elevations, packet-traced execution flows, calibrated risk heatmaps, architectural blueprint posters, dual-host audio podcast walkthroughs, and real-time bidirectional voice tutoring.

> Raw source code is deliberately preserved, but tucked into the secondary **"Peek Source"** tab where it belongs: as supporting evidence, never the primary interface.

---

## The 7 Visual Lenses of GitUnderstand

The GitUnderstand Studio organizes code comprehension across seven purpose-built visual lenses:

| Lens | Viewport Component | Visual Paradigm | Core Capability & Deliverables |
| :--- | :--- | :--- | :--- |
| **1. Atlas** | `AtlasGraphCanvas.tsx` | **2D Spatial Canvas** | Interactive node-link system map powered by force-directed cluster physics. Visualizes subsystem boundaries, entrypoints, cross-module communication channels, and hot paths. |
| **2. Strata 3D** | `Strata3DView.tsx` | **Isometric 3D Layers** | Interactive WebGL 3D architectural stack elevating `Client` $\to$ `Edge` $\to$ `Orchestration` $\to$ `Domain` $\to$ `Infrastructure` $\to$ `Data` $\to$ `Tooling` with glowing inter-plane dependency lasers. |
| **3. Flows** | `FlowAnimatorView.tsx` | **Kinetic Flow Tracer** | Choreographed step-by-step execution path tracer. Animates synthetic packet pulses through nodes with precise source file line numbers, payload contracts, and state transformations. |
| **4. Treemap** | `TokenTreemapView.tsx` | **Token Space Partitioning** | Squarified hierarchical treemap visualizing exact LLM token distribution across directories and files, color-coded by architectural layer with size and risk overlays. |
| **5. X-Ray** | `XRayMatrixView.tsx` | **Decision-1 Calibrated Heatmap** | 9-pillar architectural risk audit evaluating Modularity, Security, Resilience, Testability, API Clarity, Concurrency, Scalability, Hygiene, and Onboarding with calibrated $P(\text{healthy})$ and Shannon entropy. |
| **6. Mermaid** | `MermaidStudioView.tsx` | **Self-Healing Diagrams** | High-definition interactive SVG diagrams (Subsystem Flowchart, Sequence Lifecycle, Class Interfaces, Entity-Relationship Matrix) with self-repairing AST validation and node-to-file links. |
| **7. Media Lab** | `MediaLabView.tsx` | **Multimodal Atelier** | High-resolution blueprint posters (`gemini-nano-banana-2.1`), dual-host audio podcast walkthroughs (`gemini-3.8-flash-tts`), and kinetic video reels (`gemini-omni-1.2-flash`). |

### Groundbreaking Multimodal Capabilities

- **Circle-to-Explain Lasso**: Draw a freehand circle or rectangle around any group of modules on the 2D Atlas canvas. GitUnderstand captures the spatial coordinates, extracts the enclosed AST nodes, and triggers Gemini Multimodal to generate an instant executive summary, contract obligations, and cross-boundary risk evaluation.
- **Live Conversational Voice Tutor**: Connect your headset for a zero-latency conversational tour powered by the **Gemini 3.8 Live API** over WebSockets (`wss://api.git-understand.com/live`). The AI tutor speaks with natural human prosody while driving the UI camera (`focus_node`, `trace_execution_flow`, `toggle_xray_overlay`).

---

## Gemini 4 Entropy-Adaptive Model Routing

GitUnderstand employs an **Entropy-Adaptive Compute Router** (`backend/src/gemini/entropyRouter.ts`) to match the structural uncertainty of each repository to the appropriate Google Gemini model tier.

### Shannon Entropy Formulation

For any calibrated binary probability probe $p \in [0, 1]$ generated during architectural inspection:

$$\mathcal{H}(p) = -p \log_2(p) - (1 - p) \log_2(1 - p)$$

- **Deterministic Invariants** ($\mathcal{H} \to 0$): Low uncertainty; fast, cost-efficient compute tier selected.
- **High Architectural Ambiguity** ($\mathcal{H} \to 1$): Maximum epistemic uncertainty; advanced reasoning tier selected.

### Model Routing Tier Hierarchy

| Model Tier | Canonical Engine Model | Structural Criteria & Trigger Conditions | Primary Specialized Role |
| :--- | :--- | :--- | :--- |
| **Carbon** | `gemini-4-carbon` | $\ge 2$ circular dependencies, $\ge 150\text{k}$ tokens, $\ge 100$ files, or Shannon entropy $\mathcal{H} \ge 0.65$ | Deep topological untangling, circular dependency resolution, and complex system synthesis. |
| **Neon** | `gemini-4-neon` | $\ge 25$ files, $\ge 35\text{k}$ tokens, or Shannon entropy $\mathcal{H} \ge 0.40$ | Multi-subsystem visual choreography, execution flow tracing, and Mermaid diagram generation. |
| **Argon** | `gemini-4-argon` | Clean decoupled codebases, $\ge 8$ files, $\ge 8\text{k}$ tokens, or $\mathcal{H} \ge 0.18$ | Rapid, high-fidelity architectural blueprinting and structural clustering. |
| **Hydrogen** | `gemini-4-hydrogen` | Compact single-module repos, zero circular deps, near-zero entropy $\mathcal{H} < 0.18$ | Ultra-low latency Code Oracle and focused query responses. |

### Specialized Gemini Agent Roster

In addition to the primary Gemini 4 synthesis tiers, GitUnderstand orchestrates dedicated models for specialized tasks:

| Specialized Capability | Dedicated Gemini Model | Operational Function |
| :--- | :--- | :--- |
| **Architectural X-Ray** | `gemini-decision-1` | 9-pillar calibrated risk audit with binary probability probes and calibrated confidence intervals. |
| **Live Voice Tutor** | `gemini-3.8-live` | Real-time bidirectional audio streaming over WebSockets with canvas tool driving (`focus_node`, `switch_lens`). |
| **Blueprint Posters** | `gemini-nano-banana-2.1` | High-resolution isometric cutaway diagrams and Obsidian Cobalt blueprint artwork. |
| **Dual-Host Podcast** | `gemini-3.8-flash-tts` | Conversational audio tours with dual speakers ("Architect" and "Explorer") synced to node cues. |
| **Kinetic Video Reels** | `gemini-omni-1.2-flash` | Turn-by-turn video rendering of architectural transformations and visual storyboard frames. |
| **Multimodal Search** | `gemini-embedding-2` | 768-dimensional dense vector embeddings for semantic and visual canvas lasso matching. |

---

## Model Context Protocol (MCP) Integration

GitUnderstand features a native **Model Context Protocol (MCP)** server operating over streamable HTTP JSON-RPC 2.0 at `https://api.git-understand.com/mcp`. Autonomous AI agents (Claude Desktop, Cursor, Antigravity, Windsurf) can connect directly to GitUnderstand to query repository architecture, retrieve Mermaid diagrams, compile surgical code digests, and execute Decision-1 X-Ray audits.

### The 5 MCP Tools

1. `understand_repo`: Ingests any GitHub URL and returns an executive architectural blueprint, 3D strata layers, subsystem clusters, and interactive canvas link.
2. `get_architecture_diagram`: Generates self-healing Mermaid diagrams (flowcharts, sequence flows, class interfaces, ER matrices) with source file mappings.
3. `get_repo_digest`: Compiles a surgical Gitingest-compatible token-budgeted code digest or architectural brief with subsystem slicing.
4. `run_xray_audit`: Executes the Decision-1 9-pillar architectural health audit with Shannon entropy scoring and blast radius projections.
5. `search_codebase`: Performs semantic and multimodal vector search across visual nodes and files using Gemini Embedding-2.

### Agent Configuration Snippets

#### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "git-understand": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://api.git-understand.com/mcp"
      ],
      "env": {
        "GEMINI_API_KEY": "YOUR_GEMINI_API_KEY"
      }
    }
  }
}
```

#### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "git-understand": {
      "url": "https://api.git-understand.com/mcp",
      "headers": {
        "Content-Type": "application/json"
      }
    }
  }
}
```

#### Direct JSON-RPC 2.0 curl Request

```bash
curl -X POST https://api.git-understand.com/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "understand_repo",
      "arguments": {
        "repoUrl": "https://github.com/facebook/react"
      }
    }
  }'
```

---

## Quick Start & Local Development

### Prerequisites

- **Node.js**: `v22.x` or later (ESM-native runtime)
- **npm**: `v10.x` or later
- **Google Gemini API Key**: [Get an API key from Google AI Studio](https://aistudio.google.com/) *(optional for basic deterministic AST analysis, required for Gemini 4 synthesis and Live Voice)*
- **GitHub Personal Access Token**: *(optional, increases GitHub API rate limits from 60 to 5,000 req/hr)*

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/shantanugoel/GitUnderstand.git
cd GitUnderstand

# Install all monorepo dependencies across root, backend, and studio
npm run install:all
```

### 2. Configure Environment

Copy the example environment file and configure your credentials:

```bash
cp env/.env.example env/.env
```

Edit `env/.env`:

```ini
# Google Gemini API Keys (Dual-key sharding supported for high-throughput audits)
GEMINI_API_KEY=AIzaSy...
GEMINI_API_KEY_SECONDARY=AIzaSy...

# Optional GitHub Token for unrestricted repository ingestion
GITHUB_TOKEN=ghp_...

# Backend Runtime Ports & Origins
BACKEND_PORT=4000
CORS_ORIGIN=http://localhost:3000,https://git-understand.com
```

### 3. Launch Development Servers

Run backend and studio concurrently in separate terminals:

```bash
# Terminal 1: Cloud Run Engine Backend (Port 4000)
npm run dev:backend

# Terminal 2: Next.js 15 Studio Frontend (Port 3000)
npm run dev:studio
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Execute Test Suite

```bash
# Run Vitest test suite across backend ingest, AST graph, and entropy routing
npm test
```

---

## Production Deployment Topology

GitUnderstand runs in a multi-cloud production topology designed for low edge latency, unlimited compute elasticity, and persistent WebSocket audio streams:

```
                  ┌───────────────────────────────┐
                  │   IONOS Cloud DNS Anycast     │
                  │     (git-understand.com)      │
                  └──────┬─────────────────┬──────┘
                         │                 │
         Apex @ A Record │                 │ api CNAME Record
          (76.76.21.21)  │                 │ (ghs.googlehosted.com)
                         ▼                 ▼
          ┌───────────────────────┐ ┌───────────────────────────┐
          │  Vercel Edge Network  │ │  Google Cloud Run Engine  │
          │  Next.js 15 Studio    │ │  (git-understand-engine)  │
          │  https://git-...com   │ │  https://api.git-...com   │
          └───────────────────────┘ └───────────────────────────┘
```

### 1. IONOS DNS Configuration (`git-understand.com`)

Log in to the [IONOS Control Center](https://my.ionos.com) $\to$ **Domains & SSL** $\to$ **git-understand.com** $\to$ **DNS**:

| Host / Subdomain | Record Type | Value / Destination | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `@` (Apex) | **A** | `76.76.21.21` | 3600 (1 hr) | Routes root domain to Vercel Anycast IP |
| `www` | **CNAME** | `cname.vercel-dns.com.` | 3600 (1 hr) | Canonical `www` redirect to Vercel |
| `api` | **CNAME** | `ghs.googlehosted.com.` | 3600 (1 hr) | Google Cloud Run custom domain mapping |
| `@` | **TXT** | `google-site-verification=...` | 3600 (1 hr) | Google Cloud Domain Ownership Verification |
| `@` | **MX** | *(Retain IONOS Defaults)* | Default | **PRESERVE** existing email mailboxes |
| `@` | **TXT** | `v=spf1 include:_spf-eu.ionos.com ~all` | Default | **PRESERVE** SPF email authenticity |
| `*._domainkey` | **CNAME / TXT** | *(Retain IONOS Defaults)* | Default | **PRESERVE** DKIM cryptographic signing |
| `_dmarc` | **TXT** | `v=DMARC1; p=none; ...` | Default | **PRESERVE** DMARC email security |

> [!CAUTION]
> **CRITICAL: Preserving IONOS Mail Records**  
> Never delete or replace existing **MX**, **SPF**, **DKIM**, or **DMARC** records when modifying the root `@` record. Only modify the `@ A` record to point to `76.76.21.21` and add the specific Google TXT verification string.

### 2. Vercel Studio Deployment

- **Root Directory**: `studio`
- **Framework Preset**: `Next.js`
- **Environment Variables**:
  - `NEXT_PUBLIC_BACKEND_URL`: `https://api.git-understand.com`
  - `NEXT_PUBLIC_SITE_URL`: `https://git-understand.com`
- **Custom Domains**: Add `git-understand.com` and `www.git-understand.com`.

### 3. Google Cloud Run Engine Deployment

- **Service Name**: `git-understand-engine`
- **Region**: `us-central1`
- **Scaling**: Minimum 1 instance (to maintain warm WebSocket sessions and eliminate cold starts), maximum 10 instances.
- **Port**: `4000` (mapped via container `PORT` variable)
- **Deployment Script**: Run `./deploy/deploy-cloudrun.sh` to build and deploy via Google Cloud Build.

For step-by-step instructions and troubleshooting, see [deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md).

---

## Design System: Obsidian Cobalt + Archival Paper

GitUnderstand adheres strictly to an editorial **Obsidian Cobalt** visual palette, rejecting generic saturated rainbow neon:

```css
:root {
  --bg-void:           #07090e; /* Deep obsidian background */
  --bg-card:           #0d1117; /* Card slate container */
  --bg-card-elevated:  #161b22; /* Elevated modal / dropdown */
  --ink-primary:       #f0f6fc; /* Archival paper white */
  --ink-secondary:     #8b949e; /* Muted annotation grey */
  --ink-muted:         #484f58; /* Subtle boundary border ink */
  --border-card:       #21262d; /* Refined geometric dividers */
  --cobalt-core:       #1d4ed8; /* Electric cobalt primary accent */
  --cobalt-bright:     #3b82f6; /* Interactive hover glow */
  --cobalt-ice:        #93c5fd; /* Delicate structural link */
  --cobalt-tint:       rgba(29, 78, 216, 0.12); /* Subtle glow highlight */
  --emerald:           #10b981; /* Healthy / P(healthy) >= 0.8 */
  --amber:             #f59e0b; /* Caution / High entropy */
  --vermilion:         #ef4444; /* Critical risk / Circular dep */
}
```

---

## Monorepo Directory Structure

```
GitUnderstand/
├── backend/                        # Node.js ESM Engine Microservice
│   ├── src/
│   │   ├── config/                 # Environment validation (env.ts)
│   │   ├── gemini/                 # Gemini 4 model suite & adaptive routing
│   │   │   ├── entropyRouter.ts    # Shannon entropy compute router
│   │   │   ├── atlasArchitect.ts   # Subsystem & strata synthesizer
│   │   │   ├── flowChoreographer.ts# Execution flow tracer
│   │   │   ├── xrayDecisions.ts    # Decision-1 9-pillar risk matrix
│   │   │   ├── liveVoiceTutor.ts   # Gemini 3.8 Live WebSocket server
│   │   │   ├── posterAtelier.ts    # Nano Banana 2.1 blueprint generator
│   │   │   ├── audioTourTts.ts     # Dual-host podcast synthesizer
│   │   │   └── videoReelOmni.ts    # Omni 1.2 kinetic video reels
│   │   ├── ingest/                 # GitHub fetching & AST code graphs
│   │   ├── mcp/                    # Model Context Protocol (MCP) server
│   │   ├── orchestrator/           # 10-stage SSE pipeline manager
│   │   └── routes/                 # Express REST & SSE endpoints
│   └── vitest.config.ts            # Backend test suite configuration
├── studio/                         # Next.js 15 + React 19 Frontend Studio
│   ├── src/
│   │   ├── app/                    # Next.js App Router (layout, globals.css)
│   │   ├── components/             # Reusable UI & modal components
│   │   │   ├── lenses/             # 7 Visual Lenses Viewports
│   │   │   │   ├── AtlasGraphCanvas.tsx
│   │   │   │   ├── Strata3DView.tsx
│   │   │   │   ├── FlowAnimatorView.tsx
│   │   │   │   ├── TokenTreemapView.tsx
│   │   │   │   ├── XRayMatrixView.tsx
│   │   │   │   ├── MermaidStudioView.tsx
│   │   │   │   └── MediaLabView.tsx
│   │   │   ├── inspector/          # Peek Source & Node Inspector
│   │   │   └── voice/              # Real-time Voice Waveform & Session
│   │   └── lib/                    # Canvas math, API client, SSE hooks
│   └── vercel.json                 # Vercel Edge configuration
├── shared/
│   └── types.ts                    # Canonical single-source-of-truth types
├── deploy/
│   ├── DEPLOYMENT.md               # IONOS, Vercel & Cloud Run ops manual
│   ├── Dockerfile                  # Production multi-stage Docker build
│   ├── cloudbuild.yaml             # Google Cloud Build CI/CD manifest
│   └── deploy-cloudrun.sh          # Automated deployment script
├── docs/
│   └── ARCHITECTURE.md             # Complete system architecture document
└── package.json                    # Workspace orchestration
```

---

## Contributing & License

We welcome architectural enhancements, new visual lens concepts, and parser extensions for additional programming languages.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/spatial-lens`)
3. Ensure types and tests pass (`npm run typecheck && npm test`)
4. Commit your changes (`git commit -m 'feat: add spatial lens'`)
5. Push to the branch (`git push origin feature/spatial-lens`)
6. Open a Pull Request

Released under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Built with precision for developers, architects, and autonomous coding agents.</sub><br/>
  <sup>© 2026 GitUnderstand (git-understand.com). All rights reserved.</sup>
</div>
