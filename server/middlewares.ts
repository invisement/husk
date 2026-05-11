/**
 * Built-in middlewares for the Husk framework.
 */

/**
 * Filters out common browser "noise" requests like .well-known, favicon.ico, and .DS_Store.
 * Returns a 404 immediately for these paths.
 */
export const ignoreNoise = async (req: Request): Promise<Response | void> => {
	const noise = [".well-known", "favicon.ico", ".DS_Store"];
	const url = new URL(req.url);
	if (noise.some((n) => url.pathname.includes(n))) {
		return new Response(null, { status: 404 });
	}
};
