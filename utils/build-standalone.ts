import { bundle } from "jsr:@deno/emit@0.46.0";
import { join, toFileUrl } from "jsr:@std/path@1.0.8";
import { ensureDir } from "jsr:@std/fs@1.0.5";

const VENDOR_LIBS = {
  "vendor-marked": "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
  "vendor-marked-gfm": "https://cdn.jsdelivr.net/npm/marked-gfm-heading-id/lib/index.umd.js",
  "vendor-mermaid": "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js",
};

export async function buildStandalone() {
  console.log("Building Standalone HTML...");

  const distDir = join(Deno.cwd(), "dist");
  await ensureDir(distDir);

  // 1. Download Vendor Libs
  const vendors: Record<string, string> = {};
  for (const [id, url] of Object.entries(VENDOR_LIBS)) {
    console.log(`Downloading ${id}...`);
    try {
      const resp = await fetch(url);
      vendors[id] = await resp.text();
    } catch (e) {
      console.warn(`Failed to download ${id} from ${url}. Offline functionality for this lib may be limited.`);
      vendors[id] = "";
    }
  }

  // 2. Bundle UI Logic
  console.log("Bundling UI logic...");
  const cwd = toFileUrl(Deno.cwd() + "/").href;
  const { code: js } = await bundle(new URL("./ui/index.ts", cwd), {
    importMap: new URL("./deno.json", cwd),
  });

  // 3. Read other assets
  const css = await Deno.readTextFile(join(Deno.cwd(), "ui/index.css"));
  const guide = await Deno.readTextFile(join(Deno.cwd(), "ui/user-guide.md"));

  // 4. Generate HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Presenter</title>
    <style id="app-css">${css}</style>
    <style id="custom-css"></style>
</head>
<body>
    <details id="details" open>
        <summary>esc</summary>
        <button id="presentBtn" title="Present (p)">▶ Present</button>
        <button id="editBtn" title="Toggle Edit Mode (e)">✏️ Edit</button>
        <button id="openFileBtnControl" title="Documents">📁 Open Folder</button>
        <details id="fileTree"></details>
        <details>
            <summary>Export</summary>
            <button id="printBtn" title="Print to PDF">🖨 PDF</button>
            <button id="mdBtn" title="Download markdown source">📝 .md</button>
            <button id="htmlBtn" title="Download as HTML document">🌐 .html</button>
            <button id="shareBtn" title="Download standalone HTML">💾 Standalone</button>
            <button id="exportBtn" title="Export: download app only">📦 App Only</button>
        </details>
        <details>
            <summary>Theme</summary>
            <label>H3 <input type="checkbox" id="h3PageBreak"></label>
            <label>Bg <input type="color" id="bgColor" value="#f5f5f5"></label>
            <label>Text <input type="color" id="textColor" value="#333333"></label>
            <label>Header <input type="color" id="headerColor" value="#005cc5"></label>
            <label>Code Bg <input type="color" id="codeBgColor" value="#ffffff"></label>
            <label>Code Text <input type="color" id="codeTextColor" value="#24292e"></label>
            <label>Font <input type="number" id="fontSize" min="10" max="48" value="22" step="1"></label>
            <label>Width <input type="number" id="maxWidth" min="30" max="100" value="60" step="5"></label>
            <button id="factoryResetBtn" title="Revert to factory settings">⚙ Factory Settings</button>
            <button id="userSettingBtn" title="Apply user setting">⚙ User Settings</button>
            <button id="saveUserBtn" title="Save current as user setting">💾 Save User Settings</button>
        </details>
        <details id="shortcuts">
            <summary>Shortcuts</summary>
            <div><kbd>p</kbd> Present</div>
            <div><kbd>e</kbd> Edit</div>
            <div><kbd>r</kbd> Refresh</div>
            <div><kbd>o</kbd> Open Folder</div>
            <div><kbd>Esc</kbd> Toggle Menu</div>
            <div><kbd>← → ↑ ↓</kbd> Navigate Slides</div>
        </details>
        <details>
            <summary>More</summary>
            <button id="refreshBtn" title="Refresh (r)">↻ Refresh</button>
            <button id="helpBtn" title="Help">? Help</button>
            <input type="file" id="cssFile" accept=".css">
            <input type="file" id="jsFile" accept=".js">
        </details>
    </details>
    <div id="app-container">
        <textarea id="editor-textarea" style="display:none;"></textarea>
        <div id="content"></div>
    </div>
    <script id="vendor-marked">${vendors["vendor-marked"]}</script>
    <script id="vendor-marked-gfm">${vendors["vendor-marked-gfm"]}</script>
    <script id="vendor-mermaid">${vendors["vendor-mermaid"]}</script>
    <script type="application/json" id="assets">{}</script>
    <script type="text/markdown" id="default-doc"></script>
    <script type="text/markdown" id="help-doc">${guide}</script>
    <script id="app-js">${js}</script>
</body>
</html>`;

  const outPath = join(distDir, "markdown-presenter.html");
  await Deno.writeTextFile(outPath, html);
  
  const stats = await Deno.stat(outPath);
  console.log(`Built: ${outPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

if (import.meta.main) {
  await buildStandalone();
}
