/**
Tiny Router based on web standards in typescript.
const router = new Router()
router.push(pattern, handler, options) // push method
@router.assign(pattern, options) // decorator usage
defaultOptions = {method: 'GET', params: true, query: false, body: false, origins: ["*"]}
*/

/** Options type for optional argument. The default values are {method: 'GET', params: true} */

import { serveFile } from "jsr:@std/http@1.0.9/file-server";
type HttpMethod =
	| "GET"
	| "POST"
	| "PUT"
	| "DELETE"
	| "PATCH"
	| "HEAD"
	| "OPTIONS"
	| "CONNECT"
	| "TRACE";

/** Optional params that you can provide for both decorator and push method of the router  */
export type Options = {
	method?: HttpMethod;
	payload?: boolean;
	query?: boolean;
	origins?: string[];
	log?: boolean;
	headers?: Record<string, string>;
};

/** Route type, pattern follows web standard URLPattern (like /employees/:id) */
export type Route = {
	pattern: URLPattern;
	handler: Function | string;
	options: Options;
};

export type UIConfig = {
	source: string;
	entrypoints: string[];
	output: string;
	importMap?: string;
};

type AddInitializer = (initializer: () => void) => void;

const pathFinder = (
	path: string,
	params: Record<string, string | undefined>,
) => {
	for (const [key, value] of Object.entries(params)) {
		path = path.replace(`:${key}`, value || "");
	}
	return path;
};
/** Offers two ways to add a Route:
 * - decorator for class methods `@router.assign(pattern, options)`
 * - push method `router.push(pattern, handler, options)
 * you can add staticServe: `router.push('/assets/:path* /:file', 'ui/static/:path/assets/:file.css')`
 * use serve method to serve: `const response = router.serve(routes)` or `const response = await router.serve(routes)` if your handler is async.
 * `response` is the response from your handler function
 */
export class Router {
	routes: Route[] = [];
	middlewares = new Map<unknown, (req: Request) => Promise<Response | void>>();
	allowedOrigins = "*";
	defaultOptions: Options = { method: "GET", origins: ["*"], log: true };

	constructor(defaultOptions: Options) {
		Object.assign(this.defaultOptions, defaultOptions);
	}

	use(
		item:
			| ((req: Request) => Promise<Response | void>)
			| { middleware: (req: Request) => Promise<Response | void> },
	): this {
		const fn = typeof item === "function"
			? item
			: item.middleware.bind(item);
		this.middlewares.set(item, fn);
		return this;
	}

	remove(item: unknown): this {
		this.middlewares.delete(item);
		return this;
	}

	async initUI(config: UIConfig): Promise<string> {
		if (Deno.args.includes("--watch-ui")) {
			const { getTranspiler } = await import("../utils/transpile-ui.ts");
			const transpiler = await getTranspiler(
				config.source,
				config.entrypoints,
				config.importMap,
			);
			this.use(transpiler);
			return transpiler.outDir;
		}
		return config.output;
	}

	push(
		pattern: string,
		handler: Function | string,
		options: Options = {},
	): void {
		options = { ...this.defaultOptions, ...options };
		for (const origin of (options.origins || ["*"])) {
			this.routes.push({
				pattern: new URLPattern({
					pathname: pattern,
					hostname: origin,
				}),
				handler,
				options,
			});
		}
	}

	// if return null, means it was not in routes
	async serve(
		req: Request,
	): Promise<Response | null> {
		// Run middlewares
		for (const mw of this.middlewares.values()) {
			const res = await mw(req);
			if (res instanceof Response) return res;
		}

		for (const { pattern, handler, options } of this.routes) {
			const { method, headers, log, query, payload } = options;

			if (req.method != method) continue;

			const match = pattern.exec(req.url);
			if (!match) continue;
			log && console.log(
				`Route ${
					new Date().toISOString()
				}: ${req.method} ${req.url} matched ${pattern.pathname} by ${
					req.headers.get("origin")
				}`,
			);

			const params = match.pathname.groups;

			if (query) {
				const query = Object.fromEntries(new URL(req.url).searchParams);
				Object.assign(params, query);
			}

			if (payload) {
				const body = await req.json();
				Object.assign(params, body);
			}

			if (typeof handler == "string") {
				return serveFile(req, pathFinder(handler, params));
			}

			const result = await handler(params, req);
			log && console.log(
				`Success ${new Date().toISOString()}: ${
					handler.name || "anonymous"
				}`,
			);

			if (result instanceof Response) {
				return result;
			}

			if (typeof result === "object" && result !== null) {
				return new Response(JSON.stringify(result), {
					headers: { "Content-Type": "application/json", ...headers },
				});
			}

			return new Response(result, { headers });
		}
		this.defaultOptions.log && console.log(
			`No Route ${new Date().toISOString()}: ${req.method} ${req.url}`,
		);
		return null;
	}

	// decorator
	assign = (pattern: string, options: Options = {}) =>
	(
		handler: Function,
		context: { addInitializer: AddInitializer },
	): void => {
		// managing this is difficult: pass this as router, inside initializer this is caller class
		// deno-lint-ignore no-this-alias
		const router = this; // here this means Router class
		context.addInitializer(function (this: unknown) {
			router.push(pattern, handler.bind(this), options); // this here means caller class
		});
		//return handler;
	};
}
