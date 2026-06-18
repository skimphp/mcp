// Loads llm.json and builds an in-memory class index.
// Ported from PHP: mcp_tools::__construct

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { ClassRecord, LlmJson, OverviewJson } from "./types.js";

export class LlmLoader {
  private data: LlmJson;
  private index = new Map<string, ClassRecord>();
  private overview: OverviewJson = {};

  constructor(jsonPath: string) {
    try {
      const raw = readFileSync(jsonPath, "utf-8");
      this.data = JSON.parse(raw) as LlmJson;
    } catch {
      throw new Error(`llm.json not found or invalid: ${jsonPath}`);
    }

    // Load optional overview.json
    const overviewPath = join(dirname(jsonPath), "overview.json");
    try {
      const raw = readFileSync(overviewPath, "utf-8");
      this.overview = JSON.parse(raw) as OverviewJson;
    } catch {
      // overview.json is optional
    }

    // Build index keyed by lowercase title, class_name, and symbol
    for (const cls of this.data.classes ?? []) {
      for (const key of [cls.title, cls.class_name, cls.symbol]) {
        if (key && key !== "") {
          this.index.set(key.toLowerCase(), cls);
        }
      }
    }
  }

  get classes(): ClassRecord[] { return this.data.classes ?? []; }
  get overviewData(): OverviewJson { return this.overview; }

  findClass(name: string): ClassRecord | undefined {
    return this.index.get(name.toLowerCase());
  }
}
