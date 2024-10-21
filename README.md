# Husk
A tiny library in typescript for full stack development based on web standards

## Router
Router (`const router = new Router()`) matches URLPatterns (like `/employees/:id`) to your provided handler function. It also extracts path params, query params, and body json payloads if you ask in options.

If offers two ways to add a new Route
- Decorator `@router.assign(pattern, options)`. For decorators to work you need to use them on class methods.
- Use push method `router.push(pattern, handler, options)`

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


