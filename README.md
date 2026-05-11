# Husk

A tiny library in typescript for full stack development based on web standards.

## Router

Router (`const router = new Router()`) matches URLPatterns to your provided handler function.

### Features
- **Auto-JSON**: Returning an object or array automatically sets `Content-Type: application/json`.
- **Response Objects**: You can return a native `Response` object for full control.
- **Smart Tracking**: Automatically rebuilds UI directories only when a matched route is requested.
- **Middleware**: Add pre-processing steps using `router.use()`.
- **Noise Filtering**: Automatically ignores browser noise like `.well-known` and `favicon.ico`.

---

## UI Transpilation (Dev Mode)

Husk features a "Smart Lazy" build system. It doesn't watch files in the background; instead, it performs an **Incremental Rebuild** exactly when the browser requests a file.

### 1. Basic Scenario (Root UI)
This is the most common setup where your UI is served from the root of the server.

```typescript
const router = new Router();

// 1. Auto-discover config from deno.json and enable smart tracking
const uiDir = await router.initUI();

// 2. Serve from the tracked directory
router.push("/:path*", `${uiDir}/:path`);

Deno.serve(router.serverInfo(), req => router.serve(req));
```

### 2. Prefixed UI Scenario
If your UI lives under a specific path (like `/app/`), the smart tracking still works because it tracks the **destination folder**, not the URL.

```typescript
const uiDir = await router.initUI();
// Rebuilds only trigger when a request matches this /app/ path
router.push("/app/:path*", `${uiDir}/:path`);
```

### 3. Incremental Intelligence
Husk's transpiler is incremental by default. Even when a build is triggered:
- **Assets**: Only changed CSS/HTML files are copied.
- **Bundles**: Only changed TypeScript files trigger a re-transpilation.
- **Vendor Libs**: Remote imports (esm.sh) are handled by Deno's native cache and never slow down your build.

---

## Middleware & Customization

### Default Middlewares
Husk applies `ignoreNoise` by default. You can customize this in the constructor:

```typescript
// Disable all default noise filtering
const router = new Router({ ignoreNoise: false });

// Or remove it later by reference
import { ignoreNoise } from "@invisement/husk";
router.remove(ignoreNoise);
```

### Writing Middleware
Middlewares can be simple functions or objects with a `middleware` method.

```typescript
router.use(async (req) => {
    console.log(`${req.method} ${req.url}`);
    // Return a Response to short-circuit, or nothing to continue
});
```

---

## Configuration (`deno.json`)

Husk reads your UI configuration directly from your project's `deno.json`:

```json
{
  "husk": {
    "ui": {
      "source": "ui",
      "entrypoints": ["index.html", "index.ts"],
      "output": "ui-dist"
    }
  }
}
```
