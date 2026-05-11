import { transpile } from "jsr:@deno/emit@0.46.0";
import { debounce } from "jsr:@std/async@1.0.8/debounce";
import { basename, join, toFileUrl } from "jsr:@std/path@1.0.8";
import { ensureFile } from "jsr:@std/fs@1.0.5";
import { parseArgs } from "jsr:@std/cli@1.0.14/parse-args";

export async function getTranspiler(
  sourceDir: string,
  files: string[] = ["index.html", "index.css", "index.ts"],
  importMap: string = "./deno.json",
): Promise<Transpiler> {
  const outdir = await Deno.makeTempDir();
  const transpiler = new Transpiler(sourceDir, files, outdir, importMap);
  await transpiler.build();
  return transpiler;
}

export async function watchUI(
  sourceDir: string,
  files: string[] = ["index.html", "index.css", "index.ts"],
  importMap: string = "./deno.json",
): Promise<string> {
  const transpiler = await getTranspiler(sourceDir, files, importMap);
  transpiler.watch();
  return transpiler.outDir;
}

export class Transpiler {
  sourceDir: string;
  outDir: string;
  importMap: string = "./deno.json";

  traspiles: { source: string; target: string }[] = [];
  copies: string[] = [];
  lastBuildTime: number = 0;

  private isTraspile = (file: string) =>
    ["ts", "js", "mjs"].includes(file.split(".").pop() || "");

  constructor(
    sourceDir: string,
    files: string[],
    outDir: string,
    importMap: string,
  ) {
    this.sourceDir = sourceDir;
    this.outDir = outDir;
    this.importMap = importMap;

    for (const file of files) {
      if (this.isTraspile(file)) {
        this.traspiles.push({
          source: join(Deno.cwd(), this.sourceDir, file),
          target: join(this.outDir, basename(file).replace(".ts", ".js")),
        });
      } else this.copies.push(file);
    }
  }

  async needsRebuild(): Promise<boolean> {
    const files = [...this.traspiles.map((t) => t.source), ...this.copies.map(f => join(Deno.cwd(), this.sourceDir, f))];
    for (const file of files) {
      try {
        const { mtime } = await Deno.stat(file);
        if (mtime && mtime.getTime() > this.lastBuildTime) return true;
      } catch {
        return true;
      }
    }
    return false;
  }

  async middleware(_req: Request): Promise<void> {
    if (await this.needsRebuild()) {
      console.log("Change detected, rebuilding UI...");
      await this.build();
    }
  }

  async bundleIt(_minify: boolean): Promise<void> {
    for (const { source, target } of this.traspiles) {
      const url = toFileUrl(source);
      const result = await transpile(url, {
        importMap: toFileUrl(join(Deno.cwd(), this.importMap)),
      });
      const code = result.get(url.href);
      if (code) {
        await ensureFile(target);
        await Deno.writeTextFile(target, code);
      }
    }
  }

  async build(minify = false): Promise<string> {
    const promises = this.copies.map(async (file) => {
      const outFile = join(this.outDir, basename(file));
      await ensureFile(outFile);
      await Deno.copyFile(
        join(Deno.cwd(), this.sourceDir, file),
        outFile,
      );
    });

    await this.bundleIt(minify);

    await Promise.all(promises);
    this.lastBuildTime = Date.now();
    return this.outDir;
  }

  async watch(): Promise<void> {
    const watcher = Deno.watchFs(join(Deno.cwd(), this.sourceDir));
    const check = debounce(async (_: Deno.FsEvent) => {
      // Re-run full build to ensure HTML/CSS and other assets are re-copied
      await this.build(false);
    }, 200);

    for await (const event of watcher) {
      check(event);
    }
  }
}

if (import.meta.main) {
  const flags = parseArgs(Deno.args, { string: ["config"] });
  const config = flags.config
    ? `file://${Deno.cwd()}/${flags.config}`
    : "../config.ts";
  const { uiSourceDir, uiEntrypoints, uiOutDir } = await import(config);
  const transpiler = new Transpiler(
    uiSourceDir,
    uiEntrypoints,
    uiOutDir,
    "./deno.json",
  );
  await transpiler.build(true);
}
