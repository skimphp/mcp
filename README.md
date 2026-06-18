# skim-mcp

MCP (Model Context Protocol) server for the SKIM PHP micro-framework.

Exposes your project's `llm.json` (generated from `@ai.*` PHPDoc annotations) as MCP tools usable from Claude Code, Cursor, Windsurf, and any MCP-compatible client.

---

## Quick start

### 1. Generate llm.json

```bash
php skim docs:extract
```

### 2. Install the MCP binary

```bash
php skim mcp:install
```

This downloads the platform-native `skim-mcp` binary to `.skim/bin/skim-mcp`.

### 3. Serve

```bash
php skim mcp:serve
```

Or wire it directly into your IDE:

```json
{
  "mcpServers": {
    "skim": {
      "command": "/path/to/project/.skim/bin/skim-mcp",
      "args": ["--project-dir=/path/to/project"]
    }
  }
}
```

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   IDE / Agent   │────▶│  skim-mcp (Node) │────▶│  llm.json   │
│  Claude, Cursor │     │  stdio MCP transport    │  (extracted │
└─────────────────┘     └──────────────────┘     │  from @ai.* │
                                                  └─────────────┘
        ▲
        │   fallback when native binary unavailable
        │   (Docker, CI, different architecture)
        │
   ┌────┴──────────────┐
   │  node mcp/dist/   │
   │  index.js         │
   └───────────────────┘
```

- **TypeScript layer** (`src/*.ts`) — loads `llm.json`, indexes classes, implements all MCP tools.
- **PHP commands** (`mcp:install`, `mcp:serve`) — platform detection, binary download, stdio forwarding.
- **No PHP runtime required** for the MCP server itself — it is a standalone Node/Bun binary.

---

## Usage

### Available tools

| Tool | Description |
|------|-------------|
| `skim_overview` | Framework overview, capabilities, quickstart |
| `skim_class(name)` | Class summary, lifecycle, entry points |
| `skim_classes(layer?)` | Flat index of all classes |
| `skim_method(class, method)` | Full method record with contracts |
| `skim_search(query)` | Token-aware relevance search |
| `skim_lifecycle()` | Boot order and request lifecycle |
| `skim_examples(class, method?)` | Code examples from PHPDoc |
| `skim_drivers(class?)` | Supported driver maps |
| `skim_warnings(class?)` | Aggregated warnings per class |
| `skim_config_map(class?)` | Config keys each class reads |

### IDE configuration

**Cursor** — `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "skim": {
      "command": "/path/to/project/.skim/bin/skim-mcp",
      "args": ["--project-dir=/path/to/project"]
    }
  }
}
```

**Claude Code** — `~/.claude/mcp_settings.json`:
```json
{
  "mcpServers": {
    "skim": {
      "command": "php",
      "args": ["/path/to/project/bin/skim", "mcp:serve"]
    }
  }
}
```

**Windsurf** — Cascade MCP settings:
```json
{
  "mcpServers": {
    "skim": {
      "command": "/path/to/project/.skim/bin/skim-mcp",
      "args": ["--project-dir=/path/to/project"]
    }
  }
}
```

---

## Development

### File layout

```
mcp/
├── src/
│   ├── index.ts        # MCP transport, CLI entry, llm.json discovery
│   ├── types.ts        # llm.json type definitions
│   ├── llm_loader.ts   # JSON loader + class index builder
│   └── tools.ts        # All generic + dynamic MCP tool implementations
├── dist/
│   ├── skim-mcp-local  # Native binary (bun --compile)
│   └── index.js        # Node-compatible JS bundle
├── bin/
│   └── skim-mcp-runner # Legacy bash wrapper (dev only)
├── package.json
├── tsconfig.json
└── README.md
```

### Build

Native binary (host platform only):
```bash
cd mcp
bun run build              # dist/skim-mcp-local
```

Node.js bundle (cross-platform, runs in Docker/CI):
```bash
cd mcp
bun run build:node         # dist/index.js
```

### Local testing

```bash
# Native binary
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  ./dist/skim-mcp-local --project-dir=/path/to/project

# Node bundle
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  node dist/index.js --project-dir=/path/to/project
```

### Running tests

```bash
# Full suite (inside Docker)
docker compose run --rm app ./vendor/bin/pest

# MCP commands only
docker compose run --rm app ./vendor/bin/pest tests/cli/mcp_command_test.php
```

---

## Maintenance & release

### Cross-compilation

GitHub Actions builds for every `mcp-v*` tag:

| OS | Arch | Asset name |
|---|---|---|
| Linux | x64 | `skim-mcp-linux-x64` |
| Linux | arm64 | `skim-mcp-linux-arm64` |
| macOS | x64 | `skim-mcp-darwin-x64` |
| macOS | arm64 | `skim-mcp-darwin-arm64` |
| Windows | x64 | `skim-mcp-windows-x64.exe` |

### Release checklist

1. Bump version in `mcp/package.json`
2. Bump `VERSION` constant in `src/cli/commands/mcp_install_command.php`
3. Commit and push:
   ```bash
   git add mcp/ src/cli/commands/mcp_install_command.php
   git commit -m "release(mcp): v0.2.0"
   git tag mcp-v0.2.0
   git push origin mcp-v0.2.0
   ```
4. GitHub Actions automatically compiles and uploads binaries to the release page.

### Docker fallback

When the native binary is the wrong architecture (e.g. macOS binary inside Linux Docker), `mcp:serve` automatically falls back to the Node.js bundle:

```
1. Check .skim/bin/skim-mcp      → exists but wrong format → skip
2. Check `node` in PATH           → found
3. Check mcp/dist/index.js         → found
4. Run: node mcp/dist/index.js --project-dir=/app
```

This means **zero configuration** is needed for Docker environments — as long as `node` is available, the MCP server works.
