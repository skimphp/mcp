import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { LlmLoader } from "./llm_loader";
import { Tools } from "./tools";

function makeLoader(data: unknown, overview?: unknown): { loader: LlmLoader; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "skim-mcp-test-"));
  const path = join(dir, "llm.json");
  writeFileSync(path, JSON.stringify(data));
  if (overview) {
    writeFileSync(join(dir, "overview.json"), JSON.stringify(overview));
  }
  return { loader: new LlmLoader(path), dir };
}

describe("Tools", () => {
  let cleanup: string[] = [];

  afterEach(() => {
    for (const dir of cleanup) {
      rmSync(dir, { recursive: true, force: true });
    }
    cleanup = [];
  });

  // ─── skim_overview ────────────────────────────────────

  test("skim_overview returns overview data", () => {
    const { loader, dir } = makeLoader({ classes: [] }, { quickstart: "Start here" });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_overview", {});
    expect(result.error).toBeUndefined();
    expect(result.quickstart).toBe("Start here");
  });

  test("skim_overview returns error when overview is empty", () => {
    const { loader, dir } = makeLoader({ classes: [] });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_overview", {});
    expect(result.error).toBe("overview.json not found or empty");
  });

  // ─── skim_class ─────────────────────────────────────────

  test("skim_class returns class record", () => {
    const { loader, dir } = makeLoader({
      classes: [
        { title: "router", class_name: "router", symbol: "skim\\router", layer: "core", entry_points: ["dispatch"], owns: ["route_collection"], see_also: ["request"], non_goals: ["HTTP client"] },
      ],
    });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_class", { name: "router" });
    expect(result.error).toBeUndefined();
    expect(result.class_name).toBe("router");
    expect(result.entry_points).toEqual(["dispatch"]);
  });

  test("skim_class returns error for unknown class", () => {
    const { loader, dir } = makeLoader({ classes: [] });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_class", { name: "nope" });
    expect(result.error).toBe("Class not found: nope");
  });

  // ─── skim_classes ─────────────────────────────────────

  test("skim_classes returns all classes without filter", () => {
    const { loader, dir } = makeLoader({
      classes: [
        { title: "cache", layer: "cache", role: "Facade", badges: ["performance"] },
        { title: "router", layer: "core", role: "Dispatcher", badges: ["http"] },
      ],
    });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_classes", {});
    expect(result.classes).toHaveLength(2);
  });

  test("skim_classes filters by layer", () => {
    const { loader, dir } = makeLoader({
      classes: [
        { title: "cache", layer: "cache", role: "Facade", badges: [] },
        { title: "router", layer: "core", role: "Dispatcher", badges: [] },
      ],
    });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_classes", { layer: "core" });
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].name).toBe("router");
  });

  // ─── skim_method ────────────────────────────────────────

  test("skim_method resolves exact method", () => {
    const { loader, dir } = makeLoader({
      classes: [
        {
          title: "cache",
          methods: [
            { name: "get", contract: "Retrieve value", signature: "get(string $key): mixed", examples: [{ code: "cache::get('user')" }] },
            { name: "set", contract: "Store value", signature: "set(string $key, mixed $value): void" },
          ],
        },
      ],
    });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_method", { class: "cache", method: "get" });
    expect(result.error).toBeUndefined();
    expect(result.name).toBe("get");
    expect(result.contract).toBe("Retrieve value");
  });

  test("skim_method returns error for unknown method", () => {
    const { loader, dir } = makeLoader({
      classes: [{ title: "cache", methods: [{ name: "get", contract: "Retrieve" }] }],
    });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_method", { class: "cache", method: "nope" });
    expect(result.error).toBe("Method not found: cache::nope");
  });

  // ─── skim_search ──────────────────────────────────────

  test("skim_search ranks exact token matches higher", () => {
    const { loader, dir } = makeLoader({
      classes: [
        { title: "cache", description: "In-memory cache", methods: [] },
        { title: "cache_tag", description: "Tagged cache invalidation", methods: [] },
        { title: "session", description: "Session storage", methods: [] },
      ],
    });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_search", { query: "cache" });
    expect(result.results).toBeArray();
    expect(result.results.length).toBeGreaterThanOrEqual(2);
    expect(result.results[0].class).toBe("cache");
    expect((result.results[0] as { score: number }).score).toBeGreaterThanOrEqual((result.results[1] as { score: number }).score);
  });

  test("skim_search returns empty for nonsense query", () => {
    const { loader, dir } = makeLoader({ classes: [{ title: "router", methods: [] }] });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_search", { query: "xyzabc123nonsense" });
    expect(result.results).toEqual([]);
  });

  // ─── skim_lifecycle ───────────────────────────────────

  test("skim_lifecycle collects classes with lifecycle field", () => {
    const { loader, dir } = makeLoader({
      classes: [
        { title: "app", lifecycle: "singleton", methods: [] },
        { title: "router", methods: [] },
        { title: "request", lifecycle: "per-request", methods: [] },
      ],
    });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_lifecycle", {});
    expect(result.lifecycle).toBeArray();
    expect(result.lifecycle.length).toBe(2);
  });

  // ─── skim_examples ────────────────────────────────────

  test("skim_examples returns class-level and method examples", () => {
    const { loader, dir } = makeLoader({
      classes: [
        {
          title: "cache",
          examples: [{ code: "cache::get('key')" }],
          methods: [
            { name: "flush", examples: [{ code: "cache::flush()" }] },
            { name: "has", examples: [] },
          ],
        },
      ],
    });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_examples", { class: "cache" });
    expect(result.error).toBeUndefined();
    expect(result.examples).toHaveLength(1);
    expect(result.methods).toHaveLength(1);
  });

  test("skim_examples returns error for unknown class", () => {
    const { loader, dir } = makeLoader({ classes: [] });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_examples", { class: "nope" });
    expect(result.error).toBe("Class not found: nope");
  });

  // ─── skim_drivers ─────────────────────────────────────

  test("skim_drivers returns all driver maps without filter", () => {
    const { loader, dir } = makeLoader({
      classes: [
        { title: "cache", drivers: { store: ["file", "redis", "array"] } },
        { title: "db", drivers: { connection: ["mysql", "pgsql", "sqlite"] } },
      ],
    });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_drivers", {});
    expect(result["cache"]).toEqual({ store: ["file", "redis", "array"] });
    expect(result["db"]).toEqual({ connection: ["mysql", "pgsql", "sqlite"] });
  });

  // ─── skim_warnings ────────────────────────────────────

  test("skim_warnings returns warnings per class", () => {
    const { loader, dir } = makeLoader({
      classes: [
        { title: "cache", warnings: ["Flush affects all tags"] },
        { title: "router", warnings: [] },
      ],
    });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_warnings", {});
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].class).toBe("cache");
  });

  // ─── skim_config_map ──────────────────────────────────

  test("skim_config_map returns config keys by class", () => {
    const { loader, dir } = makeLoader({
      classes: [
        { title: "cache", config_reads: ["cache.store", "cache.prefix"] },
        { title: "session", config_reads: ["session.driver"] },
      ],
    });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("skim_config_map", {});
    expect(result["cache"]).toEqual(["cache.store", "cache.prefix"]);
    expect(result["session"]).toEqual(["session.driver"]);
  });

  // ─── tool definitions ─────────────────────────────────

  test("genericDefinitions returns all generic tools", () => {
    const { loader, dir } = makeLoader({ classes: [] });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const defs = tools.genericDefinitions();
    expect(defs).toBeArray();
    const names = defs.map((d) => (d as { name: string }).name);
    expect(names).toContain("skim_search");
    expect(names).toContain("skim_class");
    expect(names).toContain("skim_method");
    expect(names).toContain("skim_overview");
    expect(names).toContain("skim_classes");
    expect(names).toContain("skim_lifecycle");
    expect(names).toContain("skim_examples");
    expect(names).toContain("skim_drivers");
    expect(names).toContain("skim_warnings");
    expect(names).toContain("skim_config_map");
  });

  // ─── unknown tool ─────────────────────────────────────

  test("call returns error for unknown tool", () => {
    const { loader, dir } = makeLoader({ classes: [] });
    cleanup.push(dir);

    const tools = new Tools(loader);
    const result = tools.call("unknown_tool", {});
    expect(result.error).toBe("Unknown tool: unknown_tool");
  });
});
