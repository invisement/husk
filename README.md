# Husk

A modern Deno framework designed for three distinct operational phases: **Dev**, **Build**, and **Serve**.

## Framework Architecture

The architecture is partitioned into three specialized engines, each optimized for a specific part of the development lifecycle.

### The Three Phases of Husk

```dot
digraph HuskArchitecture {
    rankdir=TB;
    node [shape=box, style="rounded,filled", fontname="Inter, Helvetica", fontsize=10, fillcolor="#f9f9f9", color="#cccccc"];
    edge [fontname="Inter, Helvetica", fontsize=9, color="#666666"];

    // Phase 1: Dev (The "Lazy" Engine)
    subgraph cluster_dev {
        label="1. DEV PHASE (--watch-ui)";
        fontname="Inter Bold";
        fillcolor="#e3f2fd";
        style=filled;
        
        DevTrigger [label="Browser Refresh", shape=ellipse, fillcolor="#ffffff"];
        DevTranspiler [label="Lazy Transpiler", fillcolor="#ffffff"];
        TempFolder [label=".husk/dev-cache", shape=folder, fillcolor="#ffffff"];
        
        DevTrigger -> DevTranspiler [label="Triggers"];
        DevTranspiler -> TempFolder [label="Writes JS/CSS"];
    }

    // Phase 2: Build (The "Artifact" Engine)
    subgraph cluster_build {
        label="2. BUILD PHASE (deno task build)";
        fontname="Inter Bold";
        fillcolor="#f1f8e9";
        style=filled;
        
        CLITrigger [label="CLI Command", shape=invhouse, fillcolor="#ffffff"];
        BuildOrchestrator [label="Build Orchestrator", fillcolor="#ffffff"];
        
        subgraph cluster_channels {
            label="Channels";
            style=dashed;
            Webapp [label="Webapp\n(ui-dist/)", shape=folder];
            Standalone [label="Standalone\n(dist/)", shape=folder];
        }
        
        CLITrigger -> BuildOrchestrator [label="Triggers"];
        BuildOrchestrator -> Webapp [label="Builds"];
        BuildOrchestrator -> Standalone [label="Builds"];
    }

    // Phase 3: Serve (The "Runtime" Engine)
    subgraph cluster_serve {
        label="3. SERVE PHASE (server.ts)";
        fontname="Inter Bold";
        fillcolor="#fff3e0";
        style=filled;
        
        Router [label="Router\n(Front Controller)", style=bold];
        StaticServer [label="Static Server"];
        APIHandler [label="API / Logic Handlers"];
        
        Router -> StaticServer [label="Routes Files"];
        Router -> APIHandler [label="Routes Logic"];
    }

    // Cross-Phase Interaction
    TempFolder -> StaticServer [label="Serves Dev", style=dotted];
    Webapp -> StaticServer [label="Serves Prod", style=dotted];
}
```

## Phase Breakdown

| Phase | Purpose | Output |
| :--- | :--- | :--- |
| **Dev** | Instant developer feedback with zero overhead. | Hidden `.husk/` cache. |
| **Build** | Generating production-ready artifacts for all channels. | `ui-dist/`, `dist/`. |
| **Serve** | High-performance routing and asset delivery. | Live HTTP Responses. |

## Features

-   **Phase Isolation**: Development artifacts never clutter your production folders.
-   **Multi-Channel Build**: One command builds your Webapp, Standalone HTML, and extensions.
-   **On-Demand Dev**: Transpilation only happens when the browser asks for it.
-   **Native Deno 2**: Built on JSR and native Deno standards.

## Usage

### Smart UI Discovery
```typescript
const uiDir = await router.initUI(); 
// In dev: returns .husk/dev-cache
// In prod: returns ui-dist
router.push("/:path*", \`${uiDir}/:path\`);
```

## Husk Utilities

### Logic-Graph (`husk/utils/logic-graph.ts`)
A minimalist static analysis tool that generates behavioral dependency graphs. It maps service-to-service method calls and PubSub event flows (`Publisher -> Topic -> Subscriber`) without the overhead of a full AST parser.

**Usage:**
```bash
deno run -A husk/utils/logic-graph.ts --in=src --out=reports/logic-graph.dot
```

### Imports-Graph (`husk/utils/imports-graph.ts`)
Generates a file-level dependency graph based on ESM imports.
