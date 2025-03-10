import { bundle } from "jsr:@deno/emit@0.46.0";
import { debounce } from "jsr:@std/async@1.0.8/debounce";
import { basename, join } from "jsr:@std/path@1.0.8";
import { ensureFile } from "jsr:@std/fs@1.0.5";
import { parseArgs } from "jsr:@std/cli@1.0.14/parse-args";

export async function watchUI(
  sourceDir: string,
  files: string[] = ["index.html", "index.css", "index.ts"],
  importMap: string = "./deno.json",
): Promise<string> {
  const outdir = await Deno.makeTempDir();
  const transpiler = new Transpiler(sourceDir, files, outdir, importMap);
  await transpiler.build();
  transpiler.watch();
  return outdir;
}

export class Transpiler {
  sourceDir: string;
  outDir: string;
  importMap: string = "./deno.json";

  traspiles: { source: string; target: string }[] = [];
  copies: string[] = [];

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
          source: join(this.sourceDir, file),
          target: join(this.outDir, file.replace(".ts", ".js")),
        });
      } else this.copies.push(file);
    }
  }

  async bundleIt(minify: boolean): Promise<void> {
    for (const { source, target } of this.traspiles) {
      const { code } = await bundle(source, {
        minify,
        importMap: this.importMap,
      });
      await ensureFile(target);
      Deno.writeTextFile(
        target,
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
    const check = debounce(async (_: Deno.FsEvent) => {
      //if (event.kind == "modify") {
      await this.bundleIt(false);
      //const result = await this.transpiler(event.paths[0]);
      //console.log(result);
      //}
    }, 200);

    for await (const event of watcher) {
      check(event);
    }
  }
}

if (import.meta.main) {
  const flags = parseArgs(Deno.args, { string: ["config"] });
  const config = flags.config
    ? `${Deno.cwd()}/${flags.config}`
    : "../config.ts";
  console.log("config is", config);
  const { uiSourceDir, uiEntrypoints, uiOutDir } = await import(config);
  const transpiler = new Transpiler(
    uiSourceDir,
    uiEntrypoints,
    uiOutDir,
    "./deno.json",
  );
  await transpiler.build(true);
}
