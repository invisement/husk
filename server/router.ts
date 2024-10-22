/**
Tiny Router based on web standards in typescript.
const router = new Router()
router.push(pattern, handler, options) // push method
@router.assign(pattern, options) // decorator usage
defaultOptions = {method: 'GET', params: true, query: false, body: false}
*/

/** Options type for optional argument. The default values are {method: 'GET', params: true} */

import { serveFile } from "jsr:@std/http@^1/file-server";
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

export type Options = {
	method?: HttpMethod;
	payload?: boolean;
	query?: boolean;
};
const defaultOptions: Options = { method: "GET" };

/** Route type, pattern follows web standard URLPattern (like /employees/:id) */
export type Route = {
	pattern: URLPattern;
	handler: Function | string;
	options: Options;
};

type AddInitializer = (initializer: () => void) => void;

/** Offers two ways to add a Route:
 * - decorator for class methods `@router.assign(pattern, options)`
 * - push method `router.push(pattern, handler, options)
 * use serve method to serve: `const response = router.serve(routes)` or `const response = await router.serve(routes)` if your handler is async.
 * `response` is the response from your handler function
 */

const pathFinder = function (
	templateString: string,
	templateVars: Record<string, string | undefined>,
) {
	return new Function("return `" + templateString + "`;").call(templateVars);
};

export class Router {
	routes: Route[] = [];

	push(pattern: string, handler: Function | string, options: Options = {}) {
		//console.log("in push this is", this);
		options = { ...defaultOptions, ...options };
		this.routes.push({
			pattern: new URLPattern(pattern),
			handler,
			options,
		});
	}

	// if return null, means it was not in routes
	async serve(req: Request): Promise<Response | null> {
		//console.log("req routes", this.routes);
		for (const { pattern, handler, options } of this.routes) {
			if (req.method != options.method) continue;

			const match = pattern.exec(req.url);
			if (!match) continue;

			const params = match.pathname.groups;

			if (options.query) {
				const query = Object.fromEntries(new URL(req.url).searchParams);
				Object.assign(params, query);
			}
			if (options.payload) {
				const payload = req.json();
				Object.assign(params, payload);
			}

			if (typeof handler == "string") {
				return serveFile(req, pathFinder(handler, params));
			}

			const response = await handler(...Object.values(params));
			return new Response(response as BodyInit);
		}
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
