/**
 * For JS/TS files in a given dir (or current dir), creates the DOT graph
 * If git presents, respect git (git ls-files)
 * deno --allow-run=git --alow-read imports-graph.ts
 */

import { walk } from "jsr:@std/fs@1.0.4";
import * as path from "jsr:@std/path@1.0.6";

type FileName = string;
type Label = string;
type DirName = string;
type Heights = Record<FileName, number>;
type DirToFiles = Record<DirName, FileName[]>;
type Edge = { sourceNode: FileName; targetNode: FileName; label: Label };

interface DirI {
	[name: string]: undefined | DirI;
}

class Dir {
	content: DirI = {};
	add(filePath: string) {
		const dirNames = filePath.split("/");
		const _ = dirNames.pop() || "";
		let innerDir = this.content;
		for (const dirName of dirNames) {
			innerDir[dirName] = innerDir[dirName] || {};
			innerDir = innerDir[dirName];
		}
		innerDir[filePath] = undefined;
	}
}

async function findTsJsFiles(dir: DirName): Promise<FileName[]> {
	const gitTrackedFiles = await getGitTrackedFiles(dir);
	const files: string[] = [];
	for await (const entry of walk(dir, { exts: [".ts", ".js"] })) {
		if (entry.isFile && gitTrackedFiles.includes(entry.path)) {
			files.push(entry.path);
		}
	}
	return files;
}

async function getGitTrackedFiles(dir: DirName): Promise<FileName[]> {
	try {
		const command = new Deno.Command("git", {
			args: ["ls-files", "-co", "--exclude-standard"],
			cwd: dir,
			stdout: "piped",
		});
		const { stdout } = await command.output();
		const files = new TextDecoder().decode(stdout).trim().split("\n");
		//process.close();
		return files.map((file) => path.join(dir, file));
	} catch (error) {
		console.error("Error running git command:", error);
		const files: string[] = [];
		for await (const file of walk(dir)) {
			files.push(file.path);
		}
		return files;
	}
}

function extractImports(content: string): Array<[FileName, Label]> {
	const importRegex =
		/import\s+(?:type\s+)?(?:(\w+)(?:\s+as\s+(\w+))?|{([\s\S]*?)}|\*\s+as\s+(\w+))?\s*(?:from\s*)?["']([^"']+)["']/g;
	const imports: Array<[string, string]> = [];
	let match;
	while ((match = importRegex.exec(content)) !== null) {
		const [
			,
			defaultImport,
			aliasedImport,
			namedImports,
			namespaceImport,
			importPath,
		] = match;
		let importItems = "";
		if (defaultImport) {
			importItems = aliasedImport
				? `${defaultImport} as ${aliasedImport}`
				: defaultImport;
		} else if (namedImports) {
			importItems = namedImports
				.split(",")
				.map((item) => item.trim())
				.join("\\n");
		} else if (namespaceImport) {
			importItems = `* as ${namespaceImport}`;
		}
		imports.push([importItems, importPath]);
	}
	return imports;
}

function normalizeImportPath(
	basePath: DirName,
	importPath: FileName,
): FileName {
	if (importPath.startsWith(".")) {
		return path.normalize(path.join(path.dirname(basePath), importPath));
	}
	return importPath;
}

function escapeDoubleQuotes(str: FileName): FileName {
	return str.replace(/"/g, '\\"');
}

function createSubgraphName(dirPath: DirName): string {
	return `cluster_${dirPath.replace(/[^\w]/g, "_")}`;
}

const writer = {
	end: () => "\n}",
	node: (fileName: string, filePath: string, height: number) =>
		`\n    "${
			escapeDoubleQuotes(filePath)
		}"[label="${fileName}", height=${height}, href="${filePath}"];`,
	startSubgraph: (dirPath: string) =>
		`\n  subgraph ${createSubgraphName(dirPath)} {\n    label = "${
			escapeDoubleQuotes(dirPath)
		}";\n    color = "blue"; fontcolor="blue"; fontsize=24;`,
	startGraph: () =>
		`strict digraph TypeScriptImports {\n  node [shape=box, fontsize=16];\n  edge [fontsize=12];\n  rankdir="LR"; nodesep="0.5"; ranksep="2"; labelloc="b";`,
	edge: (targetNode: string, sourceNode: string, label: string) =>
		`\n  "${targetNode}" -> "${sourceNode}" ${label};`,
};

/** for given directory (or the current directory), creates import dependency graph in DOT notation and dumps to stdio */
export async function toDot(rootDir: DirName = "."): Promise<string> {
	function createSubgraph(path: string, dir: DirI) {
		var subgraph: string = writer.startSubgraph(path);
		for (const [path, content] of Object.entries(dir)) {
			subgraph += content
				? createSubgraph(path, content)
				: writer.node(path.split("/").pop() || "", path, heights[path]);
		}
		subgraph += writer.end();
		return subgraph;
	}

	let graph: string = "";
	const files = await findTsJsFiles(rootDir);
	//const dirToFiles = groupFilesByDirectory(files);
	const edges = await createEdges(files);
	const heights = calculateHeights(edges, files);

	graph += writer.startGraph();

	const dir = new Dir();
	files.forEach((filePath) => dir.add(filePath));

	for (const [path, content] of Object.entries(dir.content)) {
		graph += content
			? createSubgraph(path, content)
			: writer.node(path.split("/").pop() || "", path, heights[path]);
	}

	// output each edge
	edges.forEach(({ targetNode, sourceNode, label }) =>
		graph += writer.edge(targetNode, sourceNode, label)
	);

	graph += writer.end();
	return graph;
}

function calculateHeights(edges: Edge[], files: FileName[]): Heights {
	const sourceCounts: Record<FileName, number> = {};
	const targetCounts: Record<FileName, number> = {};
	const heights: Heights = {};

	// make initial values zero
	files.forEach((file) => {
		sourceCounts[file] = 0;
		targetCounts[file] = 0;
	});

	for (const { sourceNode, targetNode } of edges) {
		sourceCounts[sourceNode]++;
		targetCounts[targetNode]++;
	}

	files.forEach((file) => {
		const height = Math.max(sourceCounts[file], targetCounts[file], 1) *
			0.5;
		heights[file] = height;
	});
	return heights;
}

async function createEdges(files: string[]): Promise<Edge[]> {
	const edges: Edge[] = [];
	// create edges for each file
	for (const file of files) {
		const content = await Deno.readTextFile(file);
		const imports = extractImports(content)
			// Normalize path
			.map(([importItem, importPath]) => {
				const normalizedImportPath = normalizeImportPath(
					file,
					importPath,
				);
				return [importItem, normalizedImportPath];
			})
			// filter non internal modules (like node_modules)
			.filter(([_, importPath]) => files.includes(importPath));

		// create edges for this file
		imports.map(([importItems, importPath]) => {
			const edge = createEdge(file, importItems, importPath);
			edges.push(edge);
		});
	}
	return edges;
}

function createEdge(file: string, importItems: string, importPath: string) {
	const sourceNode = escapeDoubleQuotes(file);
	const targetNode = escapeDoubleQuotes(importPath);

	const label = importItems
		? `[label="${escapeDoubleQuotes(importItems)}"]`
		: "";

	const edge: Edge = { sourceNode, targetNode, label };
	return edge;
}

if (import.meta.main) {
	const rootDir = Deno.args[0] || ".";
	const graph = await toDot(rootDir);
	console.log(graph);
}
