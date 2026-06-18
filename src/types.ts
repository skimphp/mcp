// Type definitions for llm.json — the single source of truth for MCP tool data.
// Ported from PHP: src/dev/docs/mcp/mcp_tools.php

export interface MethodParam {
  name: string;
  type?: string;
  desc?: string;
  required?: boolean;
}

export interface MethodRecord {
  name: string;
  contract?: string;
  contracts?: string[];
  group?: string;
  frequency?: string;
  signature?: string;
  param_details?: MethodParam[];
  return_detail?: Record<string, unknown>;
  throws_details?: Array<Record<string, unknown>>;
  side_effects?: string[];
  examples?: Array<Record<string, unknown>>;
  aliases?: string[];
  warnings?: string[];
  non_goals?: string[];
}

export interface ClassRecord {
  title?: string;
  class_name?: string;
  symbol?: string;
  namespace?: string;
  source_path?: string;
  file?: string;
  description?: string;
  summary?: string;
  lifecycle?: string;
  role?: string;
  layer?: string;
  badges?: string[];
  entry_points?: string[];
  owns?: string[];
  see_also?: string[];
  non_goals?: string[];
  config_reads?: string[];
  warnings?: string[];
  drivers?: Record<string, string[]>;
  methods?: MethodRecord[];
}

export interface LlmJson {
  generated_at?: string;
  classes?: ClassRecord[];
  capabilities?: Record<string, unknown>;
  extensions?: { installed?: string[] };
}

export interface OverviewJson {
  quickstart?: string;
  architecture?: string;
  capabilities?: Array<Record<string, unknown>>;
  not_yet_available?: string[];
  key_classes?: string[];
  recommended_workflow?: string;
}

export type ToolResult = Record<string, unknown>;
