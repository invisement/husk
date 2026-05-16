import { walk } from "jsr:@std/fs@1.0.4";
import { basename, dirname, join, relative } from "jsr:@std/path@1.0.6";
import { parseArgs } from "jsr:@std/cli@1.0.14/parse-args";
import { ensureDir } from "jsr:@std/fs@1.0.4";
import { instance } from "npm:@viz-js/viz@3.10.0";

interface Dependency {
    caller: string; // "File:Class:Method"
    callee: string; // "TargetName"
}

interface EventLink {
    publisher?: string;
    topic: string;
    subscriber?: string;
}

interface GraphConfig {
    exclude?: string;
    include?: string[];
}

/**
 * LogicGraph — Extracts behavioral dependencies and event flows from JS/TS code.
 */
class LogicGraph {
    private interestList = new Set<string>([
        "window", "document", "globalThis", "MutationObserver",
        "Selection", "customElements", "navigator", "fetch", "localStorage"
    ]);
    private dependencies: Dependency[] = [];
    private eventLinks: EventLink[] = [];
    private topics = new Set<string>();
    private excludeRegex: RegExp | null = null;
    private manualIncludes: string[] = [];
    private discoveredMethods = new Map<string, string>();
    private rootDir = ".";

    constructor(config: GraphConfig) {
        if (config.exclude) {
            this.excludeRegex = config.exclude === "*" ? /.*/ : new RegExp(config.exclude);
        }
        if (config.include) {
            this.manualIncludes = config.include;
        }
    }

    async generate(rootDir: string): Promise<string> {
        this.rootDir = rootDir;
        const files = await this.findFiles(rootDir);

        for (const file of files) {
            await this.discoverInterest(file);
        }
        this.manualIncludes.forEach(item => this.interestList.add(item));

        for (const file of files) {
            await this.analyzeFile(file);
        }

        return this.toDOT();
    }

    private async findFiles(dir: string): Promise<string[]> {
        const files: string[] = [];
        for await (const entry of walk(dir, { exts: [".ts", ".js"] })) {
            if (entry.isFile && !entry.path.includes("node_modules") && !entry.path.includes("dist")) {
                files.push(entry.path);
            }
        }
        return files;
    }

    private async discoverInterest(filePath: string) {
        const content = await Deno.readTextFile(filePath);
        const lines = content.split("\n");
        const relPath = relative(this.rootDir, filePath);

        let currentClass = "Module";
        let inInterface = false;

        for (const line of lines) {
            const topicMatch = line.match(/(\w+):\s*new\s+PubSub/);
            if (topicMatch) this.topics.add(topicMatch[1]);

            const classMatch = line.match(/class\s+(\w+)/);
            if (classMatch) currentClass = classMatch[1];

            const interfaceMatch = line.match(/export\s+interface\s+(\w+)/);
            if (interfaceMatch) { inInterface = true; continue; }

            if (inInterface) {
                if (line.includes("}")) { inInterface = false; continue; }
                const methodMatch = line.match(/^\s*(\w+)\s*\(.*?\)/);
                if (methodMatch) this.interestList.add(methodMatch[1]);
            }

            const funcMatch = line.match(/(?:export\s+)?(?:public\s+|static\s+|async\s+)*function\s+(\w+)\s*\(.*?\)/);
            const classMethodMatch = line.match(/^\s*(?:public\s+|static\s+|async\s+|private\s+)?(\w+)\s*\(.*?\)\s*{/);

            const name = (funcMatch?.[1] || classMethodMatch?.[1]);
            if (name && !/^(if|while|for|switch|catch)$/.test(name)) {
                this.interestList.add(name);
                const ctx = funcMatch ? "Module" : currentClass;
                this.discoveredMethods.set(name, `${relPath}:${ctx}:${name}`);
            }
        }
    }

    private async analyzeFile(filePath: string) {
        const content = await Deno.readTextFile(filePath);
        const lines = content.split("\n");
        const relPath = relative(this.rootDir, filePath);

        let currentClass = "Module";
        let currentMethod = "top-level";
        let activeBusTopic: string | null = null;
        let busState: "publishers" | "subscribers" | null = null;

        for (const line of lines) {
            const classMatch = line.match(/class\s+(\w+)/);
            if (classMatch) currentClass = classMatch[1];

            const methodMatch = line.match(/(?:public|private|static|async)?\s*(\w+)\s*\(.*?\)\s*{/) || 
                               line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\b/);
            
            if (methodMatch && !/^(if|while|for|switch|catch)$/.test(methodMatch[1])) {
                currentMethod = methodMatch[1];
            }

            const caller = `${relPath}:${currentClass}:${currentMethod}`;

            // 1. .bus() orchestration
            if (activeBusTopic) {
                const potentialCalls = line.match(/\.(\w+)\(/g);
                if (potentialCalls) {
                    for (const call of potentialCalls) {
                        const name = call.slice(1, -1);
                        if (name === "bus") continue;
                        const node = this.findDiscoveredNode(name);
                        if (node) {
                            if (busState === "publishers") {
                                this.eventLinks.push({ publisher: node, topic: activeBusTopic });
                            } else {
                                this.eventLinks.push({ subscriber: node, topic: activeBusTopic });
                            }
                        }
                    }
                }
                if (line.includes("],")) busState = "subscribers";
                if (line.trim() === ");" || (line.includes(");") && !line.includes("=>") && !line.includes("("))) {
                    activeBusTopic = null; busState = null;
                }
            }

            const busMatch = line.match(/(\w+)\.bus\(/);
            if (busMatch) {
                activeBusTopic = busMatch[1];
                this.topics.add(activeBusTopic);
                busState = "publishers";
            }

            // 2. .pub() and .sub()
            const pubCall = line.match(/(\w+)\.pub\(/);
            if (pubCall) this.eventLinks.push({ publisher: caller, topic: pubCall[1] });

            const subCall = line.match(/(\w+)\.sub\(\s*(\w+)\s*\)/) || line.match(/(\w+)\.sub\(\s*.*?\.(\w+)\s*\)/);
            if (subCall) {
                const topic = subCall[1];
                const handlerNode = this.findDiscoveredNode(subCall[2]);
                if (handlerNode) this.eventLinks.push({ subscriber: handlerNode, topic });
            }

            // 3. emit() and listen()
            const emitMatch = line.match(/emit\(['"](\w+)['"]\)/);
            if (emitMatch) this.eventLinks.push({ publisher: caller, topic: emitMatch[1] });

            const listenMatch = line.match(/listen\(['"](\w+)['"]\s*,\s*(\w+)\)/) || line.match(/listen\(['"](\w+)['"]\s*,\s*.*?\.(\w+)\)/);
            if (listenMatch) {
                const topic = listenMatch[1];
                const handlerNode = this.findDiscoveredNode(listenMatch[2]);
                if (handlerNode) this.eventLinks.push({ subscriber: handlerNode, topic });
            }

            for (const interest of this.interestList) {
                if (interest === currentMethod) continue;
                if (this.isCalled(line, interest)) {
                    this.dependencies.push({ caller, callee: interest });
                }
            }
        }
    }

    private findDiscoveredNode(name: string): string | null {
        return this.discoveredMethods.get(name) || null;
    }

    private isCalled(line: string, name: string): boolean {
        const regex = new RegExp(`\\.${name}\\(|\\b${name}\\(|\\b${name}\\.`);
        return regex.test(line) &&
            !line.includes("function") &&
            !line.includes("export interface") &&
            !line.includes("export class") &&
            !line.trim().startsWith(`${name}(`) &&
            !line.includes("{");
    }

    private toDOT(): string {
        let dot = `digraph logic {\n`;
        dot += `  graph [fontsize=24; rankdir="LR"; labelloc="b"; concentrate=true; overlap=false; splines=true; color=black; nodesep=0.5; ranksep=2;];\n`;
        dot += `  node [shape=box, fontsize=16, color=blue, fontname="Arial", style=filled, fillcolor="#f9f9ff"];\n`;
        dot += `  edge [fontsize=12, color=blue, arrowhead=vee];\n\n`;

        const clusters: Record<string, { methods: string[], path: string }> = {};
        const browserAPIs = new Set<string>();
        const edges = new Set<string>();

        for (const dep of this.dependencies) {
            const [relPath, cls, method] = dep.caller.split(":");
            if (this.excludeRegex && (this.excludeRegex.test(method) || this.excludeRegex.test(dep.callee))) continue;

            const clusterKey = cls === "Module" ? `${relPath}:Module` : cls;
            if (!clusters[clusterKey]) clusters[clusterKey] = { methods: [], path: relPath };
            if (!clusters[clusterKey].methods.includes(method)) clusters[clusterKey].methods.push(method);

            const discovered = this.discoveredMethods.get(dep.callee);
            if (discovered) {
                const [tPath, tCls, tMethod] = discovered.split(":");
                const tClusterKey = tCls === "Module" ? `${tPath}:Module` : tCls;
                if (!clusters[tClusterKey]) clusters[tClusterKey] = { methods: [], path: tPath };
                if (!clusters[tClusterKey].methods.includes(tMethod)) clusters[tClusterKey].methods.push(tMethod);
                edges.add(`"${dep.caller}" -> "${discovered}"`);
            } else if (this.isBrowserAPI(dep.callee)) {
                browserAPIs.add(dep.callee);
                edges.add(`"${dep.caller}" -> "Browser:${dep.callee}"`);
            }
        }

        for (const link of this.eventLinks) {
            if (this.excludeRegex && this.excludeRegex.test(link.topic)) continue;
            this.topics.add(link.topic);
            const topicNode = `"Topic:${link.topic}"`;

            if (link.publisher) {
                const [path, cls, method] = link.publisher.split(":");
                const key = cls === "Module" ? `${path}:Module` : cls;
                if (!clusters[key]) clusters[key] = { methods: [], path };
                if (!clusters[key].methods.includes(method)) clusters[key].methods.push(method);
                edges.add(`"${link.publisher}" -> ${topicNode}`);
            }
            if (link.subscriber) {
                const [path, cls, method] = link.subscriber.split(":");
                const key = cls === "Module" ? `${path}:Module` : cls;
                if (!clusters[key]) clusters[key] = { methods: [], path };
                if (!clusters[key].methods.includes(method)) clusters[key].methods.push(method);
                edges.add(`${topicNode} -> "${link.subscriber}"`);
            }
        }

        // Subgraph Definitions
        for (const [key, data] of Object.entries(clusters)) {
            let label = key;
            if (key.includes(":Module")) {
                label = `Module: ${basename(data.path)}`;
            }
            dot += `  subgraph "cluster_${key.replace(/[^\w]/g, "_")}" {\n`;
            dot += `    label = "${label}";\n`;
            data.methods.forEach(m => {
                dot += `    "${data.path}:${key.split(":")[1] || key}:${m}" [label="${m}"];\n`;
            });
            dot += `  }\n`;
        }

        if (this.topics.size > 0) {
            dot += `  subgraph cluster_events {\n`;
            dot += `    label = "Events / PubSub";\n`;
            this.topics.forEach(t => dot += `    "Topic:${t}" [label="${t}"];\n`);
            dot += `  }\n`;
        }

        if (browserAPIs.size > 0) {
            dot += `  subgraph cluster_browser {\n`;
            dot += `    label = "Browser APIs";\n`;
            browserAPIs.forEach(g => dot += `    "Browser:${g}" [label="${g}"];\n`);
            dot += `  }\n`;
        }

        // Flow
        Array.from(edges).sort().forEach(e => dot += `  ${e};\n`);

        dot += `}\n`;
        return dot;
    }

    private isBrowserAPI(name: string): boolean {
        return ["window", "document", "globalThis", "MutationObserver", "Selection", "customElements", "navigator", "fetch", "localStorage"].includes(name);
    }
}

async function loadConfig(dir: string): Promise<GraphConfig> {
    let current = dir;
    while (true) {
        try {
            const configPath = join(current, "deno.json");
            const configText = await Deno.readTextFile(configPath);
            const config = JSON.parse(configText);
            const lgConfig = config["logic-graph"];
            if (lgConfig) return lgConfig;
        } catch { /* skip */ }
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return {};
}

if (import.meta.main) {
    const args = parseArgs(Deno.args);

    if (args.help || args.h) {
        console.log(`
Husk Logic-Graph Utility
Generates a minimalist DOT dependency graph by performing line-by-line static analysis.

Usage:
  deno run -A husk/utils/logic-graph.ts [options]

Options:
  --in=<dir>       Target source directory (default: .)
  --out=<file>      Output file path (default: stdout)
  --format=<type>   Output format: dot (default) or svg
  --exclude=<regex> Regex to exclude specific methods or topics
  --include=<csv>   Additional method names to track as "interesting"
  --help, -h        Show this help message

Configuration:
  The utility also reads from 'deno.json' under the 'logic-graph' key.
        `);
        Deno.exit(0);
    }

    const inDir = args.in || args._[0]?.toString() || ".";
    const format = args.format || "dot";
    const outPath = args.out;

    const fileConfig = await loadConfig(inDir);
    const finalConfig: GraphConfig = {
        exclude: args.exclude || fileConfig.exclude,
        include: args.include ? args.include.split(",") : fileConfig.include
    };

    const lg = new LogicGraph(finalConfig);
    const dot = await lg.generate(inDir);

    let output = dot;
    if (format === "svg") {
        output = (await instance()).renderString(dot, { format: "svg" });
    }

    if (outPath) {
        await ensureDir(dirname(outPath));
        await Deno.writeTextFile(outPath, output);
        console.log(`[LogicGraph] Output written to: ${outPath}`);
    } else {
        console.log(output);
    }
}
