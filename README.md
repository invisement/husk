# Husk
A tiny library in typescript for full stack development based on web standards

## Router
Router (`const router = new Router()`) matches URLPatterns (like `/employees/:id`) to your provided handler function. It also extracts path params, query params, and body json payloads if you ask in options.

If offers two ways to add a new Route
- Decorator `@router.assign(pattern, options)`. For decorators to work you need to use them on class methods.
- Use push method `router.push(pattern, handler, options)`
- For static files use source pattern to target pattern matching for instance
	- `router.push("/static/:file", "./from/assets/:file.json")` matches incoming path (`/statis/:file`) and then returns the file in the path `./from/assets/:file.json`. which adds `.json` to file name, and replace `/static` with `./from/assets`
	- For multiple folders use * (repeat): `router.push('./static/:path*/:file', './ui/:path/assets/:file'`).

You can also add static serving routes like: `router.push("/serve-file/:fileName", "/path-to/${fileName}.json")`

> `options` are optional and its default values are `{method: 'GET', params: true}`. If you want to do POST and extract query and payload parameters as well: `{method: 'POST', query: true, payload: true`}

For a usage example, look into [router test example](./how-to-use/router-example.ts)


## Utils
The utils are cli utilities that can be run from the command line without installation.

### Imports Dependency Graph
To create a dependency graph for you internal modules:
```sh
deno run --allow-read=<dir> --allow-run=git jsr:@invisement/husk@^0/imports-graph <dir> 
# or to graph current dir and save it to clipboard (in linux change pbcopy to xclip)
deno run -A jsr:@invisement/husk@^0/imports-graph | pbcopy
```
- It creates the imports inter-dependency of your TS and JS (ESM) modules and dumps its DOT notation to `stdio`/terminal.  
- `<dir>` is the root of the directory to find all TS files (recursively). If not provided, it uses the current directory.
- If you run it from a git repo, it respects your .gitignore.
- You can paste the result in one of the online Graphviz tools such as: [graph viewer](https://magjac.com/graphviz-visual-editor/)

You can install [graphviz](https://graphviz.org/doc/info/command.html) and generate the .svg graph of your internal dependencies.
```sh
deno run -A jsr:@invisement/husk@^0/imports-graph . | dot -Tsvg > ./documentation/my-imports-graph.svg
```

You can also directly import it into your TS files for more advanced use cases:
```ts
import { toDot } from "jsr:@invisement/husk";
```

### UI Builder
The goal is that you develop UI and for bundling you run one line (without install) to have ui ready for distribution/production.

The util file `util/bundle.ts` is a UI Build tool using esbuild.
- It transpiles and bundles ts and js files
- It copies any other file without any change

```sh
deno run -A jsr:@invisement/husk@^0/bundle.ts fromDir=toDir file1 file2 file3
## example:
deno run -A jsr:@invisement/husk@^0/bundle.ts ./src=./dist index.html index.js index.css service/my-file.ts
```
The above command bundles or copies mentioned files from src to dist (while keeping their file structures)

