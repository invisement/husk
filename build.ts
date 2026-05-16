import * as esbuild from "npm:esbuild";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.11.1";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { join } from "jsr:@std/path";
import { ensureDir } from "jsr:@std/fs";

const args = parseArgs(Deno.args, {
  boolean: ["watch", "minify"],
  default: { watch: false, minify: false },
});

const configPath = join(Deno.cwd(), "deno.json");

const projects = [
  { 
    name: "ui", 
    src: "ui", 
    entry: "index.ts", 
    assets: ["index.html", "index.css", "user-guide.md"] 
  },
  { 
    name: "easymde", 
    src: "editor-easymde", 
    entry: "index.ts", 
    assets: ["index.html", "index.css"] 
  },
  { 
    name: "tiptap", 
    src: "editor-tiptap", 
    entry: "index.ts", 
    assets: ["index.html", "index.css"] 
  },
  { 
    name: "prose", 
    src: "editor-prose", 
    entry: "index.ts", 
    assets: ["index.html", "index.css", "editor-content.css", "initial-markdown-content-test.md"] 
  },
  { 
    name: "editable", 
    src: "editor-editable", 
    entry: "src/editor-orchestrator.ts", 
    assets: ["index.html", "index.css", "input/sample.md", "input/sample-translation.html"] 
  },
];

async function copyAssets(project: typeof projects[0]) {
  const distDir = join(project.src, "dist");
  await ensureDir(distDir);
  for (const asset of project.assets) {
    try {
      const srcPath = join(project.src, asset);
      const destPath = join(distDir, asset);
      await ensureDir(join(destPath, ".."));
      await Deno.copyFile(srcPath, destPath);
    } catch (e) {
      console.error(`Failed to copy ${asset}:`, e.message);
    }
  }
}

async function build() {
  for (const project of projects) {
    const distDir = join(project.src, "dist");
    await ensureDir(distDir);
    
    await copyAssets(project);

    const ctx = await esbuild.context({
      plugins: [...denoPlugins({ configPath })],
      entryPoints: [join(project.src, project.entry)],
      outfile: join(distDir, "index.js"),
      bundle: true,
      format: "esm",
      minify: args.minify,
      platform: "browser",
      sourcemap: true,
      logLevel: "error",
    });

    if (args.watch) {
      console.log(`[Husk] Watching ${project.name}...`);
      await ctx.watch();
      
      // Simple asset watcher
      (async () => {
        const watcher = Deno.watchFs(project.src);
        for await (const event of watcher) {
          if (event.kind === "modify" || event.kind === "create") {
            const isAsset = event.paths.some(p => 
              project.assets.some(a => p.endsWith(a))
            );
            if (isAsset) await copyAssets(project);
          }
        }
      })();
    } else {
      console.log(`[Husk] Building ${project.name}...`);
      await ctx.rebuild();
      await ctx.dispose();
    }
  }
}

try {
  await build();
} catch (e) {
  console.error("[Husk] Build failed:", e.message);
  Deno.exit(1);
}

if (!args.watch) {
  Deno.exit(0);
}
