/** It is UI Build tool using esbuild. it:
 * It transpiles and bundles ts and js files
 * It copies any other file without any change
 * deno run -A bundle.ts fromDir=toDir file1 file2 file3
 * deno run -A bundle.ts ./src=./dist index.html index.js index.css service/my-file.ts
 */

import {
	build,
	type BuildContext,
	type BuildOptions,
	context,
	stop,
} from "npm:esbuild@0.24.0";
import { join } from "jsr:@std/path@1.0.6";
import { emptyDir, ensureFile } from "jsr:@std/fs@1.0.4";
import { parseArgs } from "jsr:@std/cli/parse-args";

const bundleExts = ["ts", "js", "css", "tsx", "jsx"];

type CopyFile = { from: string; to: string };
type Entry = {
	type: "build" | "copy";
	filePath: string;
	fromDir: string;
	toDir: string;
};

type Context = {
	entryPoints: string[];
	outfile: string;
};

type Shelve = {
	contexts: Context[];
	copyFiles: CopyFile[];
};

const watchOptions: BuildOptions = {
	platform: "browser",
	format: "esm",
	target: "esnext",
	minify: false,
	sourcemap: false,
	treeShaking: false,
	loader: {
		".json": "copy",
		".jpg": "copy",
		".png": "copy",
		".svg": "dataurl",
		".data": "binary",
	},
};

const buildOptions: BuildOptions = {
	bundle: true,
	platform: "browser",
	format: "esm",
	target: "esnext",
	minify: true,
	sourcemap: false,
	treeShaking: true,
	loader: {
		".json": "copy",
		".jpg": "copy",
		".png": "copy",
		"svg": "dataurl",
		".data": "binary",
	},
};

/**
 * Defines interface for bundler including how to processArgs, shelve, and bundle
 */
interface Bundler_ {
	processArgs(args: string[]): Entry[];

	fileIt(filePath: string, fromDir: string, toDir: string): CopyFile;
	contextIt(filePath: string, fromDir: string, toDir: string): Context;

	shelving(
		entries: Entry[],
	): { contexts: Context[]; copyFiles: CopyFile[] };

	bundle(
		shelve: { contexts: Context[]; copyFiles: CopyFile[] },
	): Promise<void>;
	watch(shelve: Shelve): Promise<BuildContext<BuildOptions>[]>;
	stop(
		watchPoints: BuildContext<BuildOptions>[],
		tempDir: string,
	): Promise<void>;
	build(args: string[], force: boolean): Promise<void>;
}

/**
 * This is a class that transpiles and bundles ui dev for browser to
 * 1) processArgs 2) shelving 3) bundle js and ts files
 * and copy any other files
 */
export class Bundler implements Bundler_ {
	processArgs(args: string[]): Entry[] {
		const entries: Entry[] = [];

		let fromDir: string = "src";
		let toDir: string = "dist";
		for (const arg of args) {
			if (arg.includes("=")) {
				[fromDir, toDir] = arg.split("=");
				continue;
			}
			const type = (arg.endsWith(".js") || arg.endsWith("ts"))
				? "build"
				: "copy";

			entries.push({ type, filePath: arg, fromDir, toDir });
		}
		return entries;
	}

	fileIt(filePath: string, fromDir: string, toDir: string): CopyFile {
		return { from: join(fromDir, filePath), to: join(toDir, filePath) };
	}
	contextIt(
		filePath: string,
		fromDir: string,
		toDir: string,
	): Context {
		return {
			entryPoints: [join(fromDir, filePath)],
			outfile: join(toDir, filePath.replace(".ts", ".js")),
		};
	}
	shelving(
		entries: Entry[],
	): Shelve {
		const contexts: Context[] = [];
		const copyFiles: CopyFile[] = [];
		entries.forEach(({ type, filePath, fromDir, toDir }) => {
			if (type == "build") {
				contexts.push(this.contextIt(filePath, fromDir, toDir));
			} else {
				copyFiles.push(this.fileIt(filePath, fromDir, toDir));
			}
		});
		return { contexts, copyFiles };
	}

	async bundle(
		shelve: Shelve,
	): Promise<void> {
		console.log(shelve);
		for (const context of shelve.contexts) {
			await ensureFile(context.outfile);
			await build({ ...context, ...buildOptions });
		}
		for (const { from, to } of shelve.copyFiles) {
			await ensureFile(to);
			await Deno.copyFile(from, to);
		}
	}

	async transpile(shelve: Shelve) {
		const tempDir = await Deno.makeTempDir();
		const watchPoints: BuildContext<BuildOptions>[] = [];
		for (let { entryPoints, outfile } of shelve.contexts) {
			outfile = join(tempDir, outfile);
			await ensureFile(outfile);
			const options: BuildOptions = {
				entryPoints,
				outfile,
				...watchOptions,
			};
			const watchPoint = await context(options);
			watchPoints.push(watchPoint);
		}
		for (let { from, to } of shelve.copyFiles) {
			to = join(tempDir, to);
			await ensureFile(to);
			await Deno.copyFile(from, to);
		}
		return watchPoints;
	}

	async watch(shelve: Shelve) {
		const watchPoints = await this.transpile(shelve);
		for (const watchPoint of watchPoints) {
			await watchPoint.watch();
		}
		console.log("watching...");
		return watchPoints;
	}
	async stop(watchPoints: BuildContext<BuildOptions>[], tempDir: string) {
		for (const watchPoint of watchPoints) {
			await watchPoint.dispose();
		}
		await stop();
		await Deno.remove(tempDir, { recursive: true });
	}

	async build(args: string[], force: boolean = true) {
		const entries = this.processArgs(Deno.args);
		const toDirs = new Set(entries.map((entry) => entry.toDir));
		for (const toDir of toDirs) {
			const ok = force || confirm(
				`Can I delete ${toDir} directory to clean up old files?`,
			);
			ok && emptyDir(toDir);
			!ok && alert(`The directory ${toDir} may have extra/old files`);
			ok && alert("Next time, give -f switch to bypass this question.");
		}
		const shelve = this.shelving(entries);
		await this.bundle(shelve);
		await stop();
	}
}

if (import.meta.main) {
	const { f, force, d, _ } = parseArgs(Deno.args);
	new Bundler().build(_ as string[], f || force || d);
}
