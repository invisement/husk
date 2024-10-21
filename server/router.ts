/*
minimalist Router based on web standards in typescript.
Run this file from cli or look at the if (import.meta.main) section for how to use with an example.
- look at options and defaultOptions for options.
*/

export type Options = {
	method?: string;
	payload?: boolean;
	params?: boolean;
	query?: boolean;
};
const defaultOptions: Options = { method: "GET", params: true };

export type Route = {
	pathname: string;
	handler: Function;
	options: Options;
};

type AddInitializer = (initializer: () => void) => void;

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
