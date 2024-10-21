/**
Tiny Router based on web standards in typescript.
const router = new Router()
router.push(pattern, handler, options) // push method
@router.assign(pattern, options) // decorator usage
defaultOptions = {method: 'GET', params: true, query: false, body: false}
*/

/** Options type for optional argument. The default values are {method: 'GET', params: true} */
export type Options = {
	method?: string;
	payload?: boolean;
	params?: boolean;
	query?: boolean;
};
const defaultOptions: Options = { method: "GET", params: true };

/** Route type, pathname follows web standard URLPattern (like /employees/:id) */
export type Route = {
	pathname: string;
	handler: Function;
	options: Options;
};

type AddInitializer = (initializer: () => void) => void;

/** Offers two ways to add a Route:
 * - decorator for class methods `@router.assign(pattern, options)`
 * - push method `router.push(pattern, handler, options)
 * use serve method to serve: `const response = router.serve(routes)` or `const response = await router.serve(routes)` if your handler is async.
 * `response` is the response from your handler function
 */
export class Router {
	routes: Route[] = [];

	push(pathname: string, handler: Function, options: Options = {}) {
		//console.log("in push this is", this);
		options = { ...defaultOptions, ...options };
		this.routes.push({ pathname, handler, options });
	}

	// if return null, means it was not in routes
	serve(req: Request): unknown | null {
		//console.log("req routes", this.routes);
		for (const { pathname, handler, options } of this.routes) {
			if (req.method != options.method) continue;

			const matcher = new URLPattern({ pathname });
			const match = matcher.exec(req.url);
			if (!match) continue;

			const params: Record<string, string> = {};
			if (options.params) {
				const pathParams = match.pathname.groups;
				Object.assign(params, pathParams);
			}
			if (options.query) {
				const query = Object.fromEntries(new URL(req.url).searchParams);
				Object.assign(params, query);
			}
			if (options.payload) {
				const payload = req.json();
				Object.assign(params, payload);
			}

			return handler(...Object.values(params));
		}
		return null;
	}

	// decorator
	assign = (pathname: string, options: Options = {}) =>
	(
		handler: Function,
		context: { addInitializer: AddInitializer },
	): void => {
		// managing this is difficult: pass this as router, inside initializer this is caller class
		// deno-lint-ignore no-this-alias
		const router = this; // here this means Router class
		context.addInitializer(function (this: unknown) {
			router.push(pathname, handler.bind(this), options); // this here means caller class
		});
		//return handler;
	};
}
