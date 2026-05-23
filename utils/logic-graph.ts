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
        "Selection", "customElements", "navigator", "fetch", "localStorage", "addEventListener"
    ]);
    private dependencies: Dependency[] = [];
    private eventLinks: EventLink[] = [];
    private topicDefMap = new Map<string, string>(); // topic -> relPath
    private excludeRegex: RegExp | null = null;
    private manualIncludes: string[] = [];
    private discoveredMethods = new Map<string, string>(); 
    private compositions = new Map<string, Set<string>>(); // parentClass -> Set<composedClass>
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
            if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

            const topicMatch = line.match(/(\w+):\s*new\s+PubSub/);
            if (topicMatch) this.topicDefMap.set(topicMatch[1], relPath);

            const classMatch = line.match(/\bclass\s+(\w+)\b/);
            if (classMatch) currentClass = classMatch[1];

            const interfaceMatch = line.match(/export\s+interface\s+(\w+)/);
            if (interfaceMatch) { inInterface = true; continue; }

            if (inInterface) {
                if (line.includes("}")) { inInterface = false; continue; }
                const methodMatch = line.match(/^\s*(\w+)\s*\(.*?\)/);
                if (methodMatch) this.interestList.add(methodMatch[1]);
            }

            const funcMatch = line.match(/(?:export\s+)?(?:public\s+|static\s+|async\s+)*function\s+(\w+)\s*\(.*?\)/);
            const classMethodMatch = line.match(/^\s*(?:public\s+|static\s+|async\s+|private\s+)?(\w+)\s*\(.*?\)\s*(?::\s*[\w\u003c\u003e|]+)?\s*{/);
            
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
        let braceDepth = 0;
        let activeSubTopic: string | null = null;
        let busState: "publishers" | "subscribers" | null = null;

        for (const line of lines) {
            if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

            // 0. Context Changes
            const classMatch = line.match(/\bclass\s+(\w+)\b/);
            if (classMatch) {
                currentClass = classMatch[1];
                currentMethod = "top-level";
                braceDepth = 0;
                continue;
            }

            for (const ch of line) {
                if (ch === '{') braceDepth++;
                if (ch === '}') braceDepth--;
            }

            if (currentClass !== "Module" && braceDepth <= 1 && currentMethod === "top-level") {
                const compMatch = line.match(/=\s*new\s+(\w+)\s*\(/);
                if (compMatch) {
                    if (!this.compositions.has(currentClass)) this.compositions.set(currentClass, new Set());
                    this.compositions.get(currentClass)!.add(compMatch[1]);
                    continue;
                }
            }

            const methodMatch = line.match(/(?:public|private|static|async)?\s*(\w+)\s*\(.*?\)\s*(?::\s*[\w<>|]+)?\s*{/) || 
                               line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\b/);
            
            if (methodMatch && !/^(if|while|for|switch|catch)$/.test(methodMatch[1])) {
                currentMethod = methodMatch[1];
                continue;
            }

            const caller = `${relPath}:${currentClass}:${currentMethod}`;

            // 2. .pub() / .publish() and .sub() / .subscribe()
            const pubCall = line.match(/(\w+)\.(?:pub|publish)\(/);
            if (pubCall) {
                this.eventLinks.push({ publisher: caller, topic: pubCall[1] });
                continue;
            }
            
            // Subscribe with named reference
            const subCall = line.match(/(\w+)\.(?:sub|subscribe)\(\s*(\w+)\s*\)/) || line.match(/(\w+)\.(?:sub|subscribe)\(\s*.*?\.(\w+)\s*\)/);
            if (subCall) {
                const node = this.findDiscoveredNode(subCall[2]);
                if (node) this.eventLinks.push({ subscriber: node, topic: subCall[1] });
                continue;
            }

            // 2.5 .bus() declarative wiring
            const busMatch = line.match(/(\w+)\.bus\(/);
            if (busMatch) {
                activeSubTopic = busMatch[1];
                busState = "publishers";
                continue;
            }

            // Detect start of subscribe block
            const subStartMatch = line.match(/(\w+)\.(?:sub|subscribe)\(/);
            if (subStartMatch) {
                activeSubTopic = subStartMatch[1];
            }

            // If we are inside a subscribe or bus block, link any method calls to the topic
            if (activeSubTopic) {
                if (line.includes("],")) {
                    busState = "subscribers";
                }
                
                for (const interest of this.interestList) {
                    if (this.isCalled(line, interest)) {
                        const targetNode = this.findDiscoveredNode(interest);
                        if (targetNode) {
                            if (busState === "publishers") {
                                this.eventLinks.push({ publisher: targetNode, topic: activeSubTopic });
                            } else {
                                this.eventLinks.push({ subscriber: targetNode, topic: activeSubTopic });
                            }
                        } else if (this.isBrowserAPI(interest)) {
                            if (busState === "publishers") {
                                this.eventLinks.push({ publisher: `Browser:${interest}`, topic: activeSubTopic });
                            } else {
                                this.eventLinks.push({ subscriber: `Browser:${interest}`, topic: activeSubTopic });
                            }
                        }
                    }
                }
                if (line.trim() === ");" && busState === "subscribers") {
                    activeSubTopic = null;
                    busState = null;
                }
            }


            // 3. emit() and listen()
            const emitMatch = line.match(/emit\(['"](\w+)['"]\)/);
            if (emitMatch) {
                this.eventLinks.push({ publisher: caller, topic: emitMatch[1] });
                continue;
            }
            
            const listenMatch = line.match(/listen\(['"](\w+)['"]\s*,\s*(\w+)\)/) || line.match(/listen\(['"](\w+)['"]\s*,\s*.*?\.(\w+)\)/);
            if (listenMatch) {
                const node = this.findDiscoveredNode(listenMatch[2]);
                if (node) this.eventLinks.push({ subscriber: node, topic: listenMatch[1] });
                continue;
            }

            // 4. Direct Service Calls and Browser APIs
            for (const interest of this.interestList) {
                if (interest === currentMethod) continue;
                if (this.isCalled(line, interest)) {
                    this.dependencies.push({ caller, callee: interest });
                    break; // One edge per line
                }
            }
        }
    }

    private findDiscoveredNode(name: string): string | null {
        return this.discoveredMethods.get(name) || null;
    }

    private isCalled(line: string, name: string): boolean {
        const regex = new RegExp(`\\.${name}\\(|\\b${name}\\(|\\b${name}\\.`);
        if (!regex.test(line)) return false;

        // Skip if it's a definition line
        if (/\b(?:function|interface|class)\b/.test(line)) return false;
        
        // Only skip if the brace looks like it's starting a method/function signature
        // e.g. "myMethod() {" but NOT "myMethod(val, () => {"
        if (line.trim().endsWith("{") && !line.includes("=>") && !line.includes(",")) return false;

        return !line.trim().startsWith(`${name}(`);
    }

    private toDOT(): string {
        let dot = `digraph logic {\n`;
        dot += `  graph [fontname="system-ui"; fontcolor=darkblue; fontsize=14; style="dashed" rankdir="LR"; concentrate=true; overlap=false; splines=true; color=darkblue; ranksep=1.5;];\n`;
        dot += `  node [fontname="sans-serif"; shape=Mrecord, fontsize=12, color=blue, style=filled, fillcolor="#f9f9ff"];\n`;
        dot += `  edge [fontsize=12, color=blue, arrowhead=vee];\n\n`;

        const clusters: Record<string, { methods: string[], path: string }> = {};
        const browserAPIs = new Set<string>();
        const edges = new Set<string>();
        const usedTopics = new Set<string>();

        for (const dep of this.dependencies) {
            const [relPath, cls, method] = dep.caller.split(":");
            
            // Skip "Wiring" callers to keep the graph logical
            if (["setupFlow", "main"].includes(method)) continue;
            if (this.excludeRegex && (this.excludeRegex.test(method) || this.excludeRegex.test(dep.callee))) continue;

            const clusterKey = cls === "Module" ? `${relPath}:Module` : cls;
            if (!clusters[clusterKey]) clusters[clusterKey] = { methods: [], path: relPath };
            if (!clusters[clusterKey].methods.includes(method)) clusters[clusterKey].methods.push(method);

            const callerNode = `"${relPath}:${clusterKey}":"${method}"`;

            const discovered = this.discoveredMethods.get(dep.callee);
            if (discovered) {
                const [tPath, tCls, tMethod] = discovered.split(":");
                
                // Skip self-references (methods of a class calling each other)
                if (relPath === tPath && cls === tCls) continue;

                const tClusterKey = tCls === "Module" ? `${tPath}:Module` : tCls;
                if (!clusters[tClusterKey]) clusters[tClusterKey] = { methods: [], path: tPath };
                if (!clusters[tClusterKey].methods.includes(tMethod)) clusters[tClusterKey].methods.push(tMethod);
                
                const calleeNode = `"${tPath}:${tClusterKey}":"${tMethod}"`;
                edges.add(`${callerNode} -> ${calleeNode}`);
            } else if (this.isBrowserAPI(dep.callee)) {
                browserAPIs.add(dep.callee);
                edges.add(`${callerNode} -> "Browser":"${dep.callee}"`);
            }
        }

        for (const link of this.eventLinks) {
            if (this.excludeRegex && this.excludeRegex.test(link.topic)) continue;
            usedTopics.add(link.topic);
            const topicNode = `"Topic:${link.topic}"`;

            if (link.publisher) {
                if (link.publisher.startsWith("Browser:")) {
                    const api = link.publisher.split(":")[1];
                    browserAPIs.add(api);
                    edges.add(`"Browser":"${api}" -> ${topicNode}`);
                } else {
                    const [path, cls, method] = link.publisher.split(":");
                    if (!["setupFlow", "constructor", "main"].includes(method)) {
                        const key = cls === "Module" ? `${path}:Module` : cls;
                        if (!clusters[key]) clusters[key] = { methods: [], path };
                        if (!clusters[key].methods.includes(method)) clusters[key].methods.push(method);
                        edges.add(`"${path}:${key}":"${method}" -> ${topicNode}`);
                    }
                }
            }
            if (link.subscriber) {
                if (link.subscriber.startsWith("Browser:")) {
                    const api = link.subscriber.split(":")[1];
                    browserAPIs.add(api);
                    edges.add(`${topicNode} -> "Browser":"${api}"`);
                } else {
                    const [path, cls, method] = link.subscriber.split(":");
                    if (!["setupFlow", "constructor", "main"].includes(method)) {
                        const key = cls === "Module" ? `${path}:Module` : cls;
                        if (!clusters[key]) clusters[key] = { methods: [], path };
                        if (!clusters[key].methods.includes(method)) clusters[key].methods.push(method);
                        edges.add(`${topicNode} -> "${path}:${key}":"${method}"`);
                    }
                }
            }
        }

        // Subgraph Definitions
        for (const [key, data] of Object.entries(clusters)) {
            dot += `  subgraph "cluster_${key.replace(/[^\w]/g, "_")}" {\n`;
            
            let label = key;
            if (key.includes(":Module")) {
                label = `Module: ${basename(data.path)}`;
            }
            dot += `    label = "${label}";\n`;
            
            if (data.methods.length > 0) {
                const methodStr = data.methods.map(m => `<${m}> ${m}`).join(" | ");
                const nodeID = `${data.path}:${key}`;
                dot += `    "${nodeID}" [label="${methodStr}", URL="${data.path}", tooltip="${data.path}"];\n`;
            }
            dot += `  }\n`;
        }

        if (usedTopics.size > 0) {
            dot += `  subgraph cluster_events {\n`;
            dot += `    label = "Events / PubSub";\n`;
            usedTopics.forEach(t => {
                const defPath = this.topicDefMap.get(t) || "";
                const attr = defPath ? `, URL="${defPath}", tooltip="${defPath}"` : "";
                dot += `    "Topic:${t}" [label="${t}"${attr}];\n`;
            });
            dot += `  }\n`;
        }

        if (browserAPIs.size > 0) {
            dot += `  subgraph cluster_browser {\n`;
            dot += `    label = "Browser APIs";\n`;
            const browserMethods = Array.from(browserAPIs).map(m => `<${m}> ${m}`).join(" | ");
            dot += `    "Browser" [label="${browserMethods}"];\n`;
            dot += `  }\n`;
        }

        // Flow
        Array.from(edges).sort().forEach(e => dot += `  ${e};\n`);

        dot += `}\n`;
        return dot;
    }

    private isBrowserAPI(name: string): boolean {
        return ["window", "document", "globalThis", "MutationObserver", "Selection", "customElements", "navigator", "fetch", "localStorage", "addEventListener"].includes(name);
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
Generates a interactive DOT dependency graph by performing line-by-line static analysis.

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
