// MCP tool implementations — reads from llm.json, no live AST at query time.
// Ported from PHP: src/dev/docs/mcp/mcp_tools.php

import { LlmLoader } from "./llm_loader.js";
import { ClassRecord, MethodRecord, ToolResult } from "./types.js";

export class Tools {
  constructor(private loader: LlmLoader) {}

  /** Returns definitions for all generic tools. */
  genericDefinitions(): Array<Record<string, unknown>> {
    return [
      {
        name: "skim_overview",
        description: "Get framework overview: quickstart, architecture, capabilities, not_yet_available features, key_classes, and recommended zero-knowledge workflow. Call this first.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "skim_class",
        description: "Get class overview with summary, lifecycle, owner, file path, relationship metadata (entry_points, owns, see_also), and non_goals.",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string", description: "Class name (snake_case)" } },
          required: ["name"],
        },
      },
      {
        name: "skim_classes",
        description: "Flat index of all classes with name, layer, role, and badges. Use to discover what exists before diving into specifics.",
        inputSchema: {
          type: "object",
          properties: { layer: { type: "string", description: "Optional layer filter (e.g. cache, session, db)" } },
          required: [],
        },
      },
      {
        name: "skim_method",
        description: "Get full method record: signature, contract, param_details, return_detail, throws_details, side_effects, examples, see_also, and aliases. Supports fuzzy/alias resolution.",
        inputSchema: {
          type: "object",
          properties: {
            class: { type: "string", description: "Class name (snake_case)" },
            method: { type: "string", description: "Method name (exact or alias)" },
          },
          required: ["class", "method"],
        },
      },
      {
        name: "skim_search",
        description: "Token-aware relevance search across class names, method names, and contract text. Ranks exact token matches higher than substring hits. Use when you do not know the exact class name. Query can be a concept: caching, validation, file upload, send email. If nothing is found, the feature likely does not exist yet — check not_yet_available in skim_overview before assuming it exists.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string", description: "Search query" } },
          required: ["query"],
        },
      },
      {
        name: "skim_lifecycle",
        description: "Get boot order and request lifecycle as a structured list.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "skim_examples",
        description: "Get code examples for a class or a specific class::method. Returns structured Example blocks extracted from PHPDoc.",
        inputSchema: {
          type: "object",
          properties: {
            class: { type: "string", description: "Class name (snake_case)" },
            method: { type: "string", description: "Optional method name. If omitted, returns class-level examples and all method examples." },
          },
          required: ["class"],
        },
      },
      {
        name: "skim_drivers",
        description: "Map of class names to their available drivers. Use before writing config to know which drivers are supported.",
        inputSchema: {
          type: "object",
          properties: { class: { type: "string", description: "Optional class name (snake_case). If omitted, returns all driver maps." } },
          required: [],
        },
      },
      {
        name: "skim_warnings",
        description: "Aggregated warnings per class. Use to avoid silent production failures (e.g. missing manifest.json, wrong driver config).",
        inputSchema: {
          type: "object",
          properties: { class: { type: "string", description: "Optional class name (snake_case)." } },
          required: [],
        },
      },
      {
        name: "skim_config_map",
        description: "Map of class names to config keys they read. Use to trace which config values affect a class.",
        inputSchema: {
          type: "object",
          properties: { class: { type: "string", description: "Optional class name (snake_case)." } },
          required: [],
        },
      },
    ];
  }

  /** Dispatches a tool call by name and returns the result or error object. */
  call(tool: string, args: Record<string, unknown>): ToolResult {
    switch (tool) {
      case "skim_overview": return this.toolOverview();
      case "skim_class": return this.toolClass(args);
      case "skim_classes": return this.toolClasses(args);
      case "skim_method": return this.toolMethod(args);
      case "skim_search": return this.toolSearch(args);
      case "skim_lifecycle": return this.toolLifecycle();
      case "skim_examples": return this.toolExamples(args);
      case "skim_drivers": return this.toolDrivers(args);
      case "skim_warnings": return this.toolWarnings(args);
      case "skim_config_map": return this.toolConfigMap(args);
      default: return this.toolDynamicMethod(tool, args);
    }
  }

  private toolOverview(): ToolResult {
    const ov = this.loader.overviewData;
    if (!ov || Object.keys(ov).length === 0) {
      return { error: "overview.json not found or empty" };
    }
    return ov as unknown as ToolResult;
  }

  private toolClass(args: Record<string, unknown>): ToolResult {
    const cls = this.loader.findClass(String(args.name ?? ""));
    if (!cls) return { error: `Class not found: ${args.name}` };
    return {
      class_name: cls.title ?? cls.class_name ?? "",
      namespace: cls.namespace ?? "",
      file: cls.source_path ?? cls.file ?? "",
      summary: cls.description ?? cls.summary ?? "",
      lifecycle: cls.lifecycle ?? "",
      owner: cls.symbol ?? "",
      entry_points: cls.entry_points ?? [],
      owns: cls.owns ?? [],
      see_also: cls.see_also ?? [],
      non_goals: {
        class: cls.non_goals ?? [],
        methods: (cls.methods ?? [])
          .filter((m: MethodRecord) => (m.non_goals ?? []).length > 0)
          .map((m: MethodRecord) => ({ name: m.name, non_goals: m.non_goals })),
      },
    };
  }

  private toolClasses(args: Record<string, unknown>): ToolResult {
    const layer = String(args.layer ?? "").toLowerCase();
    return {
      classes: this.loader.classes
        .filter((cls: ClassRecord) => !layer || (cls.layer ?? "").toLowerCase() === layer)
        .map((cls: ClassRecord) => ({
          name: cls.title ?? cls.class_name ?? "",
          layer: cls.layer ?? "",
          role: cls.role ?? "",
          badges: cls.badges ?? [],
        })),
    };
  }

  private toolMethod(args: Record<string, unknown>): ToolResult {
    const cls = this.loader.findClass(String(args.class ?? ""));
    if (!cls) return { error: `Class not found: ${args.class}` };
    return this.resolveMethod(cls, String(args.method ?? ""));
  }

  private toolSearch(args: Record<string, unknown>): ToolResult {
    const query = String(args.query ?? "").toLowerCase();
    const qTokens = this.tokenize(query);
    const results: Array<Record<string, unknown>> = [];

    for (const cls of this.loader.classes) {
      const className = String(cls.title ?? cls.class_name ?? "");
      const description = String(cls.description ?? cls.summary ?? "");
      const classScore = this.scoreMatch(className + " " + description, query, qTokens);
      if (classScore > 0) {
        results.push({ type: "class", class: className, summary: description, score: classScore });
      }

      for (const m of cls.methods ?? []) {
        const haystack = (m.name ?? "") + " " + (m.contract ?? "") + " " + (m.contracts ?? []).join(" ");
        const methodScore = this.scoreMatch(haystack, query, qTokens);
        if (methodScore > 0) {
          results.push({ type: "method", class: className, method: m.name, score: methodScore });
        }
      }
    }

    results.sort((a: Record<string, unknown>, b: Record<string, unknown>) => (b.score as number) - (a.score as number));
    return { results: results.slice(0, 20) };
  }

  private toolLifecycle(): ToolResult {
    const lifecycle: Array<Record<string, string>> = [];
    for (const cls of this.loader.classes) {
      if (cls.lifecycle) {
        lifecycle.push({ class: cls.title ?? cls.class_name ?? "", lifecycle: cls.lifecycle });
      }
    }
    return { lifecycle };
  }

  private toolExamples(args: Record<string, unknown>): ToolResult {
    const cls = this.loader.findClass(String(args.class ?? ""));
    if (!cls) return { error: `Class not found: ${args.class}` };
    const method = String(args.method ?? "");
    if (method) {
      const resolved = this.resolveMethod(cls, method);
      if (resolved.error) return resolved;
      return { examples: resolved.examples ?? [] };
    }
    return {
      class: cls.title ?? "",
      examples: cls.examples ?? [],
      methods: (cls.methods ?? [])
        .filter((m: MethodRecord) => (m.examples ?? []).length > 0)
        .map((m: MethodRecord) => ({ name: m.name, examples: m.examples })),
    };
  }

  private toolDrivers(args: Record<string, unknown>): ToolResult {
    const filter = String(args.class ?? "").toLowerCase();
    const result: Record<string, string[]> = {};
    for (const cls of this.loader.classes) {
      const drivers = cls.drivers ?? {};
      if (Object.keys(drivers).length === 0) continue;
      const name = cls.title ?? cls.class_name ?? "";
      if (filter && name.toLowerCase() !== filter) continue;
      result[name] = drivers;
    }
    return result;
  }

  private toolWarnings(args: Record<string, unknown>): ToolResult {
    const filter = String(args.class ?? "").toLowerCase();
    const result: Array<Record<string, unknown>> = [];
    for (const cls of this.loader.classes) {
      const warnings = cls.warnings ?? [];
      if (warnings.length === 0) continue;
      const name = cls.title ?? cls.class_name ?? "";
      if (filter && name.toLowerCase() !== filter) continue;
      result.push({ class: name, warnings });
    }
    return { classes: result };
  }

  private toolConfigMap(args: Record<string, unknown>): ToolResult {
    const filter = String(args.class ?? "").toLowerCase();
    const result: Record<string, string[]> = {};
    for (const cls of this.loader.classes) {
      const configReads = cls.config_reads ?? [];
      if (configReads.length === 0) continue;
      const name = cls.title ?? cls.class_name ?? "";
      if (filter && name.toLowerCase() !== filter) continue;
      result[name] = configReads;
    }
    return result;
  }

  private toolDynamicMethod(tool: string, args: Record<string, unknown>): ToolResult {
    for (const cls of this.loader.classes) {
      for (const m of cls.methods ?? []) {
        if (this.toolName(cls, m) === tool) {
          return {
            ...m,
            class: cls.symbol ?? cls.title ?? "",
            method: m.name ?? "",
            arguments: args,
          } as unknown as ToolResult;
        }
      }
    }
    return { error: `Unknown tool: ${tool}` };
  }

  // ─── Helpers ─────────────────────────────────────────

  private resolveMethod(cls: ClassRecord, method: string): ToolResult {
    const found = this.findExact(cls, method);
    if (found) return found;

    const aliasMatches = this.findByAlias(cls, method);
    if (aliasMatches.length === 1) return aliasMatches[0];

    const substringMatches = this.findBySubstring(cls, method);
    if (substringMatches.length === 1) return substringMatches[0];

    const candidates = [...new Set([...aliasMatches, ...substringMatches])];
    if (candidates.length > 0) {
      return {
        status: "ambiguous",
        message: `Multiple methods match '${method}'. Refine your query.`,
        candidates: candidates.map((m: MethodRecord) => ({
          name: m.name,
          signature: m.signature ?? "",
          contract: m.contract ?? "",
        })),
      };
    }

    const className = cls.title ?? cls.class_name ?? "class";
    return { error: `Method not found: ${className}::${method}` };
  }

  private findExact(cls: ClassRecord, method: string): MethodRecord | null {
    const needle = method.toLowerCase();
    for (const m of cls.methods ?? []) {
      if ((m.name ?? "").toLowerCase() === needle) return m;
    }
    return null;
  }

  private findByAlias(cls: ClassRecord, method: string): MethodRecord[] {
    const needle = method.toLowerCase();
    const matches: MethodRecord[] = [];
    for (const m of cls.methods ?? []) {
      for (const alias of m.aliases ?? []) {
        if (alias.toLowerCase() === needle) {
          matches.push(m);
          break;
        }
      }
    }
    return matches;
  }

  private findBySubstring(cls: ClassRecord, method: string): MethodRecord[] {
    const needle = method.toLowerCase();
    const matches: MethodRecord[] = [];
    for (const m of cls.methods ?? []) {
      const name = (m.name ?? "").toLowerCase();
      if (name.includes(needle) || needle.includes(name)) {
        matches.push(m);
      }
    }
    return matches;
  }

  private tokenize(input: string): string[] {
    const normalized = input.replace(/(?<=[a-z])(?=[A-Z])/g, "_").toLowerCase();
    return normalized.split(/[_\s\-]+/).filter((t) => t.length > 1);
  }

  private scoreMatch(haystack: string, query: string, qTokens: string[]): number {
    const hTokens = this.tokenize(haystack);
    let score = 0;

    for (const qt of qTokens) {
      for (const ht of hTokens) {
        if (ht === qt) score += 15;
        else if (ht.startsWith(qt)) score += 10;
        else if (ht.includes(qt)) score += 5;
      }
    }

    if (haystack.toLowerCase().includes(query)) score += 3;
    return score;
  }

  private toolName(cls: ClassRecord, method: MethodRecord): string {
    return `${(cls.title ?? cls.class_name ?? "class").toLowerCase()}_${method.name ?? "method"}`;
  }
}
