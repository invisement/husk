import { bundle } from "jsr:@deno/emit@0.46.0";
import { debounce } from "jsr:@std/async@1.0.8/debounce";
import { basename, join } from "jsr:@std/path@1.0.8";
import { ensureFile } from "jsr:@std/fs@1.0.5";

export async function watchUI(
	sourceDir: string,
	files: string[] = ["index.html", "index.css", "index.js"],
): Promise<string> {
	const outdir = await Deno.makeTempDir();
	const transpiler = new Transpiler(sourceDir, files, outdir);
	await transpiler.build();
	transpiler.watch();
	return outdir;
}

export class Transpiler {
	sourceDir: string;
	outDir: string;

	traspiles: string[] = [];
	copies: string[] = [];

	private isTraspile = (file: string) =>
		["ts", "js", "mjs"].includes(file.split(".").pop() || "");

	constructor(sourceDir: string, files: string[], outDir: string) {
		this.sourceDir = sourceDir;
		this.outDir = outDir;
		for (const file of files) {
			if (this.isTraspile(file)) this.traspiles.push(file);
			else this.copies.push(file);
		}
	}

	async bundleIt(minify: boolean): Promise<void> {
		for (const file of this.traspiles) {
			const { code } = await bundle(join(this.sourceDir, file), {
				minify,
				importMap: {
					imports: {
						"lit": "https://esm.sh/lit",
						"lit/": "https://esm.sh/lit/",
					},
				},
			});
			const outFile = join(this.outDir, file);
			await ensureFile(outFile);
			Deno.writeTextFile(
				outFile,
				code,
			);
		}
	}

	async build(minify = false): Promise<string> {
		const promises = this.copies.map(async (file) => {
			const outFile = join(this.outDir, basename(file));
			await ensureFile(outFile);
			Deno.copyFile(
				join(this.sourceDir, file),
				outFile,
			);
		});

		this.bundleIt(minify);

		await Promise.all(promises);
		return this.outDir;
	}

	private delay = (ms: number) =>
		new Promise((resolve) => setTimeout(resolve, ms));

	async watch(): Promise<void> {
		const watcher = Deno.watchFs(this.sourceDir);
		const check = debounce(async (event: Deno.FsEvent) => {
			if (event.kind == "modify") {
				console.log("rebuilding ui for dev");
				await this.bundleIt(false);
				//const result = await this.transpiler(event.paths[0]);
				//console.log(result);
			}
		}, 200);

		for await (const event of watcher) {
			check(event);
		}
	}
}

if (import.meta.main) {
	const { uiSourceDir, uiEntrypoints, uiOutDir } = await import(
		"../config.ts"
	);
	const transpiler = new Transpiler(uiSourceDir, uiEntrypoints, uiOutDir);
	await transpiler.build(true);
}
