/**
 * For JS/TS files in a given dir (or current dir), creates the DOT graph
 * If git presents, it ignores gitignore files (git ls-files)
 * example1: deno --allow-run=git --alow-read imports-graph.ts . -ignorefile1.ts
 * or import Graph from this, then graph = await new Graph().createGraph(dir)
 * to ignore some files, give them as arguments started with dash(-)
 * example2:  * example: deno run -A imports-graph.ts . -file1.ts -file2.ts +no-dir
 * example 2 ignores arrows for file1 and file2, and it also does not create subgraph cluster for directories.
 */

/** main interface of this module */
interface GraphI {
  createGraph(dir: DirName): Promise<string>; // creates DOT notation graph (graphviz) for given directory
}

import { walk } from "jsr:@std/fs@1.0.4";
import { basename, dirname, join } from "jsr:@std/path@1.0.6";
import { instance } from "npm:@viz-js/viz@3.10.0";
import { parseArgs } from "jsr:@std/cli@1.0.14";

type FileName = string;
type FilePath = string;
type Label = string;
type DirName = string;
type Heights = Record<FileName, number>;
type Edge = { sourceNode: FileName; targetNode: FileName; label: Label };
interface DirI {
  [name: string]: undefined | DirI;
}

/** Creates DOT notation graph. The main method is createGraph(dir) */
class Graph implements GraphI {
  edges: Edge[] = [];
  nodeHeights: Heights = {};
  writer = new Writer();
  reverse: boolean = false;

  async createGraph(
    rootDir: DirName = ".",
    ignoreFiles: FilePath[] = [],
    noDir = false,
    reverse = false,
  ) {
    const root = await new Dir(ignoreFiles).traverse(rootDir);
    const edges = await this.createEdges(root.files);
    const internalEdges = edges.filter(({ sourceNode }) =>
      root.files.includes(sourceNode) && !ignoreFiles.includes(sourceNode)
    );

    this.nodeHeights = this.calculateHeights(internalEdges, root.files);

    let graph: string = this.writer.startGraph();
    if (noDir) graph += this.writer.noDir();

    graph += this.createSubgraph(rootDir, root.tree, true);
    internalEdges.forEach(({ targetNode, sourceNode, label }) => {
      graph += this.writer.edge(sourceNode, targetNode, label, reverse);
    });
    graph += this.writer.end();
    return graph;
  }

  createSubgraph(path: string, dir: DirI, isRoot = false) {
    let subgraph: string = isRoot ? "" : this.writer.startSubgraph(path);
    for (const [path, content] of Object.entries(dir)) {
      // empty content means path is a file
      subgraph += content
        ? this.createSubgraph(path, content)
        : this.writer.node(
          path,
          this.nodeHeights[path],
        );
    }
    subgraph += isRoot ? "" : this.writer.end();
    return subgraph;
  }

  calculateHeights(edges: Edge[], files: FileName[]) {
    const sourceCounts: Record<FileName, number> = {};
    const targetCounts: Record<FileName, number> = {};
    const nodeHeights: Heights = {};

    // make initial values zero
    files.forEach((file) => {
      sourceCounts[file] = 0;
      targetCounts[file] = 0;
    });

    for (const { sourceNode, targetNode, label } of edges) {
      const n = label.split("\n").length;
      sourceCounts[sourceNode] += 1 + n / 2;
      targetCounts[targetNode] += 1 + n / 2;
    }

    files.forEach((file) => {
      const height = Math.max(sourceCounts[file], targetCounts[file]) *
          0.25 + .5;
      nodeHeights[file] = height;
    });
    return nodeHeights;
  }

  async createEdges(files: FilePath[]) {
    const edges: Edge[] = [];
    const promises = files.map(async (targetNode) => {
      const file = new File(targetNode);
      const imports = await file.imports();
      for (const [sourceNode, labels] of Object.entries(imports)) {
        const label = labels.join("\n");
        edges.push({ sourceNode, targetNode, label });
      }
    });
    await Promise.all(promises);
    return edges;
  }
}

class File {
  name: FilePath;
  _imports: Record<FilePath, Label[]> = {};

  constructor(name: FilePath) {
    this.name = name;
  }
  async imports() {
    const code = await Deno.readTextFile(this.name);
    this.extractImports(code);
    this.extractDynamicImports(code);
    return this._imports;
  }

  extractImports(code: string) {
    const importRegex = /^(import|export)\s+([^=]*?)"(.+?)"/gm;
    const match = code.matchAll(importRegex);
    for (let [, , items, sourceFile] of match) {
      if (sourceFile.startsWith(".")) {
        sourceFile = join(dirname(this.name), sourceFile);
      }
      // remove unwanted keywords
      items = items
        .replaceAll("{", "")
        .replaceAll("}", "")
        .replaceAll("from ", "")
        .replaceAll("type ", "");
      const labels: Label[] = items.split(",").map((item) => item.trim());
      this._imports[sourceFile] = this._imports[sourceFile] || [];
      this._imports[sourceFile].push(...labels);
    }
  }
  extractDynamicImports(code: string) {
    const importRegex = /(?:{(.+)}\s*=\s*await )?\s*import\s*\("(.+)"\)/g;
    const match = code.matchAll(importRegex);
    for (let [, items, sourceFile] of match) {
      if (sourceFile.startsWith(".")) {
        sourceFile = join(dirname(this.name), sourceFile);
      }
      const labels: Label[] = items.split(",").map((item) => item.trim());
      this._imports[sourceFile] = this._imports[sourceFile] || [];
      this._imports[sourceFile].push(...labels);
    }
  }
}

class Dir {
  tree: DirI = {};
  files: FilePath[] = [];
  ignorePatterns: RegExp[] = [];

  constructor(ignoreFiles: string[] = []) {
    this.ignorePatterns = ignoreFiles.map((file) =>
      new RegExp(`^${file.replaceAll("*", ".*")}$`)
    );
  }

  add(filePath: string) {
    const dirNames = filePath.split("/");
    const _ = dirNames.pop() || "";
    let innerDir = this.tree;
    for (const dirName of dirNames) {
      innerDir[dirName] = innerDir[dirName] || {};
      innerDir = innerDir[dirName];
    }
    innerDir[filePath] = undefined;
  }
  async traverse(dir: DirName) {
    this.files = await this.findTsJsFiles(dir);

    //filter ignore files
    this.files = this.files.filter((file) =>
      this.ignorePatterns.every((regex) => !regex.test(file))
    );

    this.files.forEach((filePath) => this.add(filePath));
    return this;
  }
  async findTsJsFiles(dir: DirName): Promise<FilePath[]> {
    const gitTrackedFiles = await this.getGitTrackedFiles(dir);
    const files: string[] = [];
    for await (const entry of walk(dir, { exts: [".ts", ".js", ".mjs"] })) {
      if (entry.isFile && gitTrackedFiles.includes(entry.path)) {
        files.push(entry.path);
      }
    }
    return files;
  }
  async getGitTrackedFiles(dir: DirName): Promise<FilePath[]> {
    try {
      const command = new Deno.Command("git", {
        args: ["ls-files", "-co", "--exclude-standard"],
        cwd: dir,
        stdout: "piped",
      });
      const { stdout } = await command.output();
      const files = new TextDecoder().decode(stdout).trim().split("\n");
      //process.close();
      return files.map((file) => join(dir, file));
    } catch (error) {
      console.error("Error running git command:", error);
      const files: string[] = [];
      for await (const file of walk(dir)) {
        files.push(file.path);
      }
      return files;
    }
  }
}

class Writer {
  level = 0;

  get indent() {
    return "\t".repeat(this.level);
  }

  startGraph() {
    this.level++;
    return `digraph imports {\n${this.indent}graph [ rankdir="LR"; labelloc="b"; concentrate=true; overlap=false; splines=true; color=blue]\n${this.indent}node [shape=box, fontsize=16, color=blue];\n${this.indent}edge [fontsize=12, color=blue];`;
  }

  noDir = () => `\n${this.indent}clusterrank="none";`;

  startSubgraph(dirPath: string) {
    const x = this.indent;
    this.level++;
    return `\n${x}subgraph ${
      this.createSubgraphName(dirPath)
    } {\n${this.indent}label = "${dirPath}"; fontsize=24; `;
  }

  node = (filePath: string, height: number) =>
    `\n${this.indent}"${filePath}"[label="${
      basename(filePath)
    }"; height=${height}; href="${filePath}"; tooltip="${filePath}"];`;

  edge = (
    targetNode: string,
    sourceNode: string,
    label: string,
    reverse = false,
  ) =>
    reverse
      ? `\n${this.indent}"${targetNode}" -> "${sourceNode}" [label="${label}"];`
      : `\n${this.indent}"${sourceNode}" -> "${targetNode}" [label="${label}"];`;

  end = () => {
    this.level--;
    return `\n${this.indent}}`;
  };

  createSubgraphName = (dirPath: DirName) =>
    `cluster_${dirPath.replace(/[^\w]/g, "_")}`;
}

/** return dot notation for the imports dependency graph for the given rootDirectory*/
export async function importsGraphDOT(
  rootDir: string,
  ignoreFiles: string[],
  noDir = false,
  reverse = false,
): Promise<string> {
  const graph = await new Graph().createGraph(
    rootDir,
    ignoreFiles,
    noDir,
    reverse,
  );
  return graph;
}

/** return the imports dependency graph in svg format as a string */
export async function importsGraphSVG(
  rootDir: string,
  ignoreFiles: string[],
  noDir = false,
  reverse = false,
): Promise<string> {
  const graph = await new Graph().createGraph(
    rootDir,
    ignoreFiles,
    noDir,
    reverse,
  );
  const svgString = (await instance()).renderString(graph, { format: "svg" });
  return svgString;
}

/** Parse arguments and create svg string of the imports dependency graph */
export async function importsGraphCLI(argList: string[]): Promise<string> {
  const args = parseArgs(argList);
  // ignored-files starts with -
  const ignoreFiles = args["-"].map((arg: string) => arg.replace(/^\.\//, ""));

  // +no-dir argument means remove directory subgraphs
  const noDir = args["+"].includes("no-dir");
  const reverse = args["+"].includes("reverse");

  // first mass argument is rootDir
  const rootDir = args["_"].at(0)?.toString() || ".";

  return await importsGraphSVG(rootDir, ignoreFiles, noDir, reverse);
}

if (import.meta.main) {
  const svgString = await importsGraphCLI(Deno.args);
  console.log(svgString);
}
