import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { LlmLoader } from "./llm_loader.js";
import { Tools } from "./tools.js";

let projectDir = "";

function parseArgs(args: string[]) {
  for (const arg of args) {
    if (arg.startsWith("--project-dir=")) {
      projectDir = arg.slice("--project-dir=".length);
    }
  }
}

parseArgs(process.argv.slice(2));

// Resolve llm.json path from project directory.
// Priority: --project-dir → env SKIM_ROOT → process.cwd()
function resolveLlmJsonPath(): string | null {
  const candidates: string[] = [];

  if (projectDir) {
    candidates.push(resolve(join(projectDir, "llm.json")));
    candidates.push(resolve(join(projectDir, ".skim", "llm.json")));
  }

  const envRoot = process.env.SKIM_ROOT;
  if (envRoot) {
    candidates.push(resolve(join(envRoot, "llm.json")));
    candidates.push(resolve(join(envRoot, ".skim", "llm.json")));
  }

  const cwd = process.cwd();
  candidates.push(resolve(join(cwd, "llm.json")));
  candidates.push(resolve(join(cwd, ".skim", "llm.json")));

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

const llmPath = resolveLlmJsonPath();

let loader: LlmLoader;
let tools: Tools;

try {
  if (!llmPath) {
    throw new Error(
      "llm.json not found. Run: php skim docs:extract  (searched --project-dir, SKIM_ROOT, and cwd)"
    );
  }
  loader = new LlmLoader(llmPath);
  tools = new Tools(loader);
} catch (err) {
  // Fatal on startup — write to stderr (never stdout to avoid JSON-RPC corruption)
  console.error("[skim-mcp]", err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const server = new Server(
  { name: "skim-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: tools.genericDefinitions() };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = tools.call(
    request.params.name,
    (request.params.arguments ?? {}) as Record<string, unknown>
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error in main():", err);
  process.exit(1);
});
