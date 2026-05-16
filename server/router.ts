/**
Tiny Router based on web standards in typescript.
*/

import { serveFile } from "jsr:@std/http@1.0.9/file-server";
import { join } from "jsr:@std/path";
import { ignoreNoise } from "./middlewares.ts";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS" | "CONNECT" | "TRACE";

export type Options = {
	method?: HttpMethod;
	payload?: boolean;
	query?: boolean;
	origins?: string[];
	log?: boolean;
	headers?: Record<string, string>;
	ignoreNoise?: boolean;
};

export type Route = {
	pattern: URLPattern;
	handler: Function | string;
	options: Options;
};

type AddInitializer = (initializer: () => void) => void;

const pathFinder = (
	path: string,
	params: Record<string, string | undefined>,
) => {
	let resolved = path;
	for (const [key, value] of Object.entries(params)) {
		resolved = resolved.replace(`:${key}`, value || "");
	}
	return resolved;
};

export class Router {
	routes: Route[] = [];
	middlewares = new Map<unknown, (req: Request) => Promise<Response | void>>();
	allowedOrigins = "*";
	defaultOptions: Options = { method: "GET", origins: ["*"], log: true };

	constructor(defaultOptions: Options = {}) {
		Object.assign(this.defaultOptions, defaultOptions);
		if (this.defaultOptions.ignoreNoise !== false) {
			this.use(ignoreNoise);
		}
	}

	use(item: ((req: Request) => Promise<Response | void>) | { middleware: (req: Request) => Promise<Response | void> }): this {
		const fn = typeof item === "function" ? item : item.middleware.bind(item);
		this.middlewares.set(item, fn);
		return this;
	}

	serverInfo(): { port: number; hostname: string } {
		const isProd = Deno.env.get("DENO_ENV") === "production";
		return {
			port: Number(Deno.env.get("PORT")) || 8000,
			hostname: isProd ? "0.0.0.0" : "127.0.0.1",
		};
	}

	push(pattern: string, handler: Function | string, options: Options = {}): void {
		options = { ...this.defaultOptions, ...options };
		this.routes.push({
			pattern: new URLPattern({ pathname: pattern }),
			handler,
			options,
		});
	}

	async serve(req: Request): Promise<Response | null> {
		for (const mw of this.middlewares.values()) {
			const res = await mw(req);
			if (res instanceof Response) return res;
		}

		const url = new URL(req.url);
		const method = req.method;

		for (const { pattern, handler, options } of this.routes) {
			const routeMethod = options.method || "GET";
			const isHead = method === "HEAD" && routeMethod === "GET";
			const methodMatch = (method === routeMethod) || isHead;
			if (!methodMatch) continue;

			const match = pattern.exec(req.url);
			if (!match) continue;

			if (options.log) console.log(`[Router] ${method} ${url.pathname} -> ${pattern.pathname}`);

			const params = match.pathname.groups;
			if (options.query) {
				const queryData = Object.fromEntries(url.searchParams);
				Object.assign(params, queryData);
			}

			if (typeof handler == "string") {
				const targetPath = pathFinder(handler, params);
				const absolutePath = join(Deno.cwd(), targetPath);
				
				try {
					// serveFile expects GET for the actual content check, but we can wrap it
					const resp = await serveFile(isHead ? new Request(req.url, { method: "GET" }) : req, absolutePath);
					if (options.headers) {
						for (const [k, v] of Object.entries(options.headers)) {
							resp.headers.set(k, v);
						}
					}
					// If it was a HEAD request, return only headers
					return isHead ? new Response(null, { status: resp.status, headers: resp.headers }) : resp;
				} catch (e) {
					console.error(`  - Error serving ${absolutePath}:`, e.message);
					continue;
				}
			}

			const result = await handler(params, req);
			if (result instanceof Response) return result;
			return new Response(typeof result === "object" ? JSON.stringify(result) : String(result), {
				headers: { "Content-Type": "application/json", ...options.headers }
			});
		}
		return null;
	}
}
