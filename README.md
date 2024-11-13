# Husk

A tiny library in typescript for full stack development based on web standards

## Router

Router (`const router = new Router()`) matches URLPatterns (like
`/employees/:id`) to your provided handler function. It also extracts path
params, query params, and body json payloads if you ask in options.

If offers two ways to add a new Route

- Decorator `@router.assign(pattern, options)`. For decorators to work you need
  to use them on class methods.
- Use push method `router.push(pattern, handler, options)`
- For static files use source pattern to target pattern matching for instance
  - `router.push("/static/:file", "./from/assets/:file.json")` matches incoming
    path (`/statis/:file`) and then returns the file in the path
    `./from/assets/:file.json`. which adds `.json` to file name, and replace
    `/static` with `./from/assets`
  - For multiple folders use * (repeat):
    `router.push('./static/:path*/:file', './ui/:path/assets/:file'`).

You can also add static serving routes like:
`router.push("/serve-file/:fileName", "/path-to/${fileName}.json")`

> `options` are optional and its default values are
> `{method: 'GET', params: true}`. If you want to do POST and extract query and
> payload parameters as well: `{method: 'POST', query: true, payload: true`}

For a usage example, look into
[router test example](./how-to-use/router-example.ts)

## Imports Dependency Graph

To create a dependency graph (in svg) for you internal modules:

```sh
deno run --allow-read=<dir> --allow-run=git jsr:@invisement/husk@^0/imports-graph <dir> 
# or to graph current dir and save it to clipboard (in linux change pbcopy to xclip)
deno run -A jsr:@invisement/husk@^0/imports-graph > graph.svg
```

- It creates the imports inter-dependency of your TS and JS (ESM) modules and
  dumps its DOT notation to `stdio`/terminal.
- `<dir>` is the root of the directory to find all TS files (recursively). If
  not provided, it uses the current directory.
- If you run it from a git repo, it respects your .gitignore.
- To exclude any file or folder from the dependency-graph, provide
  -regex-pattern argument
- To ignore directories (graph all ts/js files without their directory
  subgraphs), provide +no-dir argument.

```sh
deno run -A jsr:@invisement/husk@^0/imports-graph . -*config.ts -ui-dist/* +no-dir > graph.svg
```

- It ignores all git ignore files, excludes all config.ts files in any
  directory, ignore all files in directory ui-dist, and skips using directories
  as subgraphs.

## UI Transpiler

Provides utility to watch (and rebuild and rebundler) ui, and to build/bundle
ui.

To build:

```sh
deno run -A jsr:@invisement/husk/transpile-ui
```

To watch:

```ts
// server.ts
import { watchUI } from "jsr:@invisement/husk/transpile-ui";
import { uiEntrypoints, uiOutDir, uiSourceDir } from "./config.ts";

const isDev = Deno.args.includes("--watch-ui");
const uiDir = isDev ? await watchUI(uiSourceDir, uiEntrypoints) : uiOutDir;
console.log("UI OUt Directory is", uiDir);

// Serve ui and static files
router.push("/", `${uiDir}/index.html`);
router.push("/index.:ext", `${uiDir}/index.:ext`);
router.push("/ui/:path*", `${uiDir}/:path`);
```
