/** It is UI Build tool using esbuild. it:
 * It transpiles and bundles ts and js files
 * It copies any other file without any change
 * deno run -A bundle.ts fromDir=toDir file1 file2 file3
 * deno run -A bundle.ts ./src=./dist index.html index.js index.css service/my-file.ts
 */

import {
	build,
	BuildOptions,
	stop,
} from "https://deno.land/x/esbuild@v0.20.1/mod.js";
import { join } from "jsr:@std/path";
import { ensureFile } from "jsr:@std/fs@1.0.4";

type CopyFile = { from: string; to: string };
type Entry = {
	type: "build" | "copy";
	filePath: string;
	fromDir: string;
	toDir: string;
};

/**
 * Defines interface for bundler including how to processArgs, shelve, and bundle
 */
interface Bundler_ {
	processArgs(args: string[]): Entry[];

	fileIt(filePath: string, fromDir: string, toDir: string): CopyFile;
	contextIt(filePath: string, fromDir: string, toDir: string): BuildOptions;

	shelving(
		entries: Entry[],
	): { contexts: BuildOptions[]; copyFiles: CopyFile[] };

	bundle(shelve: { contexts: BuildOptions[]; copyFiles: CopyFile[] }): void;
	//watch(contexts: BuildOptions[]): unknown[];
	//stop(): void;
	//dispose(): void;
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
	): BuildOptions {
		return {
			entryPoints: [join(fromDir, filePath)],
			outfile: join(toDir, filePath.replace(".ts", ".js")),
			bundle: true,
			platform: "browser",
			format: "esm",
			target: "esnext",
			minify: true,
			sourcemap: true,
			treeShaking: true,
		};
	}
	shelving(
		entries: Entry[],
	): { contexts: BuildOptions[]; copyFiles: CopyFile[] } {
		const contexts: BuildOptions[] = [];
		const copyFiles: CopyFile[] = [];
		entries.forEach(({ type, filePath, fromDir, toDir }) => {
			if (type == "build") {
				this.contextIt(filePath, fromDir, toDir);
			} else {
				this.fileIt(filePath, fromDir, toDir);
			}
		});
		return { contexts, copyFiles };
	}

	async bundle(
		shelve: { contexts: BuildOptions[]; copyFiles: CopyFile[] },
	): Promise<void> {
		for (const context of shelve.contexts) {
			context.outfile && await ensureFile(context.outfile);
			build(context);
		}
		for (const { from, to } of shelve.copyFiles) {
			ensureFile(to);
			Deno.copyFile(from, to);
		}
	}
}

if (import.meta.main) {
	const uiBuild = new Bundler();
	const entries = uiBuild.processArgs(Deno.args);
	const shelve = uiBuild.shelving(entries);
	await uiBuild.bundle(shelve);
	await stop();
}
