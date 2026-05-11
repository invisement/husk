# Husk

A tiny library in typescript for full stack development based on web standards.

## Router

Router (`const router = new Router()`) matches URLPatterns (like `/employees/:id`) to your provided handler function.

### Handler Signature
Handlers receive the parsed parameters and the original request object:
```typescript
router.push("/api/:name", async (params, req) => {
    return { message: `Hello ${params.name}` };
});
```

### Features
- **Auto-JSON**: Returning an object or array automatically stringifies it and sets `Content-Type: application/json`.
- **Response Objects**: You can return a native `Response` object for full control.
- **Middleware**: Add pre-processing steps using `router.use()`.
- **Static Serving**: Map URL patterns to local file paths.
  - `router.push("/static/:file", "./assets/:file.json")`

## Middleware

Husk supports a simple middleware pattern. A middleware is a function (or an object with a `middleware()` method) that receives the `Request`. If it returns a `Response`, that response is sent immediately, skipping further processing.

```typescript
router.use(async (req) => {
    console.log(`${req.method} ${req.url}`);
});
```

## UI Transpilation (Dev Mode)

Husk provides a "Lazy" transpiler that only rebuilds your UI when a browser request is received and a file change is detected.

### Setup in `server.ts`

```typescript
import { Router } from "jsr:@invisement/husk";
import { uiEntrypoints, uiOutDir, uiSourceDir } from "./config.ts";

const router = new Router();

// initUI handles everything: 
// 1. Detects --watch-ui flag
// 2. Setup mtime-based rebuild middleware
// 3. Returns the correct UI directory
const uiDir = await router.initUI({
    source: uiSourceDir,
    entrypoints: uiEntrypoints,
    output: uiOutDir
});

router.push("/:path*", `${uiDir}/:path`);
```

## Imports Dependency Graph

To create a dependency graph (in svg) for your internal modules:

```sh
deno run -A jsr:@invisement/husk/imports-graph > graph.svg
```

- It creates the imports inter-dependency of your TS and JS (ESM) modules.
- If you run it from a git repo, it respects your `.gitignore`.
