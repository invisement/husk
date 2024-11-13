export const router = new Router({ log: true });

import { watchUI } from "./utils/transpile-ui.ts";
import { uiEntrypoints, uiOutDir, uiSourceDir } from "./config.ts";
import { Router } from "./mod.ts";

const isDev = Deno.args.includes("--watch-ui");
const uiDir = isDev ? await watchUI(uiSourceDir, uiEntrypoints) : uiOutDir;
console.log("UI OUt Directory is", uiDir);

// Serve ui and static files
router.push("/", `${uiDir}/index.html`);
router.push("/index.:ext", `${uiDir}/index.:ext`);
router.push("/ui/:path*", `${uiDir}/:path`);

// serve doc files
router.push("/docs/", "./docs/index.html");
router.push("/docs/:file*", "./docs/:file");

Deno.serve(async (req: Request) => {
	const resp = await router.serve(req);
	if (resp === null) {
		return new Response("404: Resource Not Found!", { status: 404 });
	}
	return resp;
});
