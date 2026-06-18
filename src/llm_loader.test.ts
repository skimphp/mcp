import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { LlmLoader } from "./llm_loader";

function makeFixture(data: unknown, overview?: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "skim-mcp-test-"));
  const path = join(dir, "llm.json");
  writeFileSync(path, JSON.stringify(data));
  if (overview) {
    writeFileSync(join(dir, "overview.json"), JSON.stringify(overview));
  }
  return { dir, path };
}

describe("LlmLoader", () => {
  let cleanup: string[] = [];

  afterEach(() => {
    for (const dir of cleanup) {
      rmSync(dir, { recursive: true, force: true });
    }
    cleanup = [];
  });

  test("loads llm.json and exposes classes", () => {
    const { dir, path } = makeFixture({
      generated_at: "2024-01-01T00:00:00Z",
      classes: [
        { title: "cache", class_name: "cache", symbol: "skim\\cache\\cache", layer: "cache", role: "Facade" },
      ],
    });
    cleanup.push(dir);

    const loader = new LlmLoader(path);
    expect(loader.classes.length).toBe(1);
    expect(loader.classes[0].title).toBe("cache");
  });

  test("builds index by lowercase title, class_name and symbol", () => {
    const { dir, path } = makeFixture({
      classes: [
        { title: "MyClass", class_name: "my_class", symbol: "app\\my_class" },
      ],
    });
    cleanup.push(dir);

    const loader = new LlmLoader(path);
    expect(loader.findClass("myclass")?.title).toBe("MyClass");
    expect(loader.findClass("my_class")?.title).toBe("MyClass");
    expect(loader.findClass("app\\my_class")?.title).toBe("MyClass");
  });

  test("returns undefined for unknown class", () => {
    const { dir, path } = makeFixture({ classes: [] });
    cleanup.push(dir);

    const loader = new LlmLoader(path);
    expect(loader.findClass("nope")).toBeUndefined();
  });

  test("loads optional overview.json", () => {
    const { dir, path } = makeFixture(
      { classes: [] },
      { quickstart: "Run php skim serve", architecture: "MVC" }
    );
    cleanup.push(dir);

    const loader = new LlmLoader(path);
    expect(loader.overviewData.quickstart).toBe("Run php skim serve");
    expect(loader.overviewData.architecture).toBe("MVC");
  });

  test("throws when llm.json is missing", () => {
    expect(() => new LlmLoader("/nonexistent/llm.json")).toThrow("not found or invalid");
  });

  test("throws when llm.json contains invalid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "skim-mcp-bad-"));
    const path = join(dir, "llm.json");
    writeFileSync(path, "not json");
    cleanup.push(dir);

    expect(() => new LlmLoader(path)).toThrow("not found or invalid");
  });
});
