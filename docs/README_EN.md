<div align="center">

# 🎨 LanhuFlow MCP

**Connect Lanhu design assets to AI coding workflows**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 20+](https://img.shields.io/badge/node-20+-339933.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub Stars](https://img.shields.io/github/stars/bangjier/lanhu-flow?style=social)](https://github.com/bangjier/lanhu-flow/stargazers)

English | [简体中文](../README.md)

[Quick Start](#-quick-start) • [Features](#-key-features) • [Usage](#-usage-guide) • [Contributing](#-contributing)

</div>

---

## 🌟 Highlights

LanhuFlow MCP is an unofficial [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for the Lanhu design collaboration platform, built with TypeScript.

**Core capabilities**:
- **Design analysis**: Select HTML, image, token, layout, layer, and slice outputs per artboard
- **Structured design data**: Extract dimensions, layer trees, annotations, typography, colors, gradients, shadows, borders, and radii
- **PRD analysis**: Read Lanhu product documents and Axure prototypes as structured content
- **Reliable execution**: Analyze multiple designs concurrently with retry and operation-specific errors

🎯 **Works with**:
- ✅ Cursor + Lanhu
- ✅ Windsurf + Lanhu
- ✅ Claude Code + Lanhu
- ✅ Any MCP-compatible AI development tool

---

## ✨ Key Features

### 📋 Requirement Document Analysis
- **Page listing**: Discover pages in Lanhu PRD and prototype documents
- **Structured analysis**: Extract page content and resources for downstream AI development workflows

### 🎨 UI Design Support
- **Design Viewing**: Batch download and display UI designs
- **Schema → HTML+CSS**: Auto-convert design Schema to code, matching Lanhu export quality
- **Sketch Annotation Fallback**: When Schema is unavailable, auto-extract full annotations from Sketch JSON
- **Design Structure Tree**: Extract design hierarchy and normalized annotations from Sketch JSON
- **Slice Extraction**: Auto-identify and export design slices and icon assets
- **Structured Design Tokens**: Extract all colors, font families/sizes/weights, shadows, borders, border radii — sorted by usage frequency

### ⚡ Performance & Integration
- **Concurrent Processing**: Multiple designs analyzed in parallel (5 concurrent) with automatic retry
- **MCP Resources**: Design lists exposed as MCP Resource templates for discovery
- **MCP Prompts**: Built-in `frontend-dev` and `design-review` prompt templates

---

## 🚀 Quick Start

### Fastest Way: Let AI Install It

Copy this and send it to your AI assistant (Cursor / Claude Code / Windsurf):

> Install the LanhuFlow MCP server for me: https://github.com/bangjier/lanhu-flow

The AI will read the repo and configure everything automatically. You just need to provide your Lanhu Cookie.

---

### Manual Setup

### Prerequisites

- **Node.js 20+** (required)
- Lanhu account and Cookie (required)

> 💡 Get Cookie: Log in to [Lanhu web](https://lanhuapp.com), open browser DevTools (F12), copy Cookie from request headers. See [GET-COOKIE-TUTORIAL.md](GET-COOKIE-TUTORIAL.md) for details.

### Zero-Install (npx)

No cloning or building needed. Just configure your AI client:

**Cursor / Windsurf** (`.cursor/mcp.json` or `.windsurf/mcp.json`):
```json
{
  "mcpServers": {
    "lanhu": {
      "command": "npx",
      "args": ["-y", "lanhu-flow-mcp"],
      "env": { "LANHU_COOKIE": "your_cookie_here" }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "lanhu": {
      "command": "npx",
      "args": ["-y", "lanhu-flow-mcp"],
      "env": { "LANHU_COOKIE": "your_cookie_here" }
    }
  }
}
```

**Claude Code**:
```bash
claude mcp add lanhu -- npx -y lanhu-flow-mcp
```

### Local Development

```bash
git clone https://github.com/bangjier/lanhu-flow.git
cd lanhu-flow
npm install
npm run build
npm start
```

| Variable | Description | Required |
|----------|-------------|----------|
| `LANHU_COOKIE` | Lanhu web Cookie | Yes |
| `DDS_COOKIE` | DDS Cookie (defaults to LANHU_COOKIE) | No |

---

## 📖 Usage Guide

### Requirement Document Analysis

```
Please analyze this requirement document:
https://lanhuapp.com/web/#/item/project/product?tid=xxx&pid=xxx&docId=xxx
```

### UI Design Viewing

```
Please analyze this design:
https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx
```

### Slice Download

```
Download all slices from "Homepage Design"
```

---

## 🛠️ Available Tools

### `lanhu_design` — Design Analysis

Unified design tool with `mode` parameter:

| Mode | Description |
|------|-------------|
| `list` | List all design images in a project |
| `analyze` | Analyze selected HTML, image, token, layout, layer, and slice outputs (default) |
| `tokens` | Extract design tokens only (fonts, colors, shadows) |
| `slices` | Extract icon & image assets for download |

The `analyze` mode supports an `include` parameter to control output: `html`, `image`, `tokens`, `layout`, `layers`, `slices`. Default: `["html", "tokens", "layers", "image"]`. Outputs run independently, and each design reports `success`, `partial_success`, or `error` with operation-specific errors.

All four modes use the camelCase top-level fields `projectName`, `totalDesigns`, and `designs`. Design results from `analyze`, `tokens`, and `slices` contain `designId`, `name`, `status`, `success`, `dimensions`, `outputs`, and `errors`. `tokens` matches `analyze` with `include: ["tokens"]`, and `slices` matches `analyze` with `include: ["slices"]`; their values are available at `designs[].outputs.tokens.value` and `designs[].outputs.slices.value`. Convenience aliases such as `html_code`, `design_tokens`, and `layer_tree`, plus the former top-level slice result, have been removed.

`list` defaults to `compact: true`; each entry contains only `index`, `designId`, `name`, `width`, `height`, `versionId`, `group`, and `artboardType`. Pass `compact: false` for preview URL, update time, Sketch/group metadata, `dimensions`, `outputs`, `errors`, and other detailed fields. Neither list format exposes the original `raw` item.

When a stage or detail URL contains `image_id`, `analyze`, `tokens`, and `slices` automatically select that design if `design_names` is omitted. Explicit `design_names: "all"` still selects every design.

`design_names` accepts an artboard name, UUID, numeric index, or numeric-string index; both `3` and `"3"` select the third list entry. A missing match no longer returns the complete design list: the response contains `DESIGN_NOT_FOUND`, the total available count, at most 10 approximate suggestions, and a hint to use `mode: "list"`. Invalid UUIDs return no suggestions by default.

When an exact name matches multiple artboards, every non-`list` mode returns `status: "ambiguous"` with each matching `designId/id/index/name/version` instead of silently selecting the first item. Use a UUID or index to select one explicitly.

Layer data is available at `outputs.layers.value` with `tree`, `annotations`, `truncated`, and `maxDepth`. Use `layer_depth` to control tree depth (default: `4`) or pass `"all"` for the complete tree. `completeness: "complete"` maps to `status: "success"`, `partial` maps to `partial_success`, and `empty` maps to `error` when neither a usable tree nor annotations are available. `sourceMissingFields` reports fields absent from the source Sketch data, while `normalizedMissingFields` reports fields still absent after normalization. Raw source-artboard dimensions are preserved at `outputs.layers.sourceArtboardDimensions` and never overwrite the shared development coordinate space; dimensions prefer a trustworthy root layer anchored at `(0,0)`.

Every non-list design result includes `dimensions`, where `analysis` always means the layout coordinate space used for development. Resolution prefers normalized root-layer dimensions, the Schema page, the Sketch canvas/layer bounds normalized by device scale, slice canvas/bounds, and normalized image dimensions. When document slice dimensions use scaled list coordinates but slice bounds clearly cover a larger canvas, the maximum `position + size` range is used; for example, 187.5×856 resolves to 375×1712 with a 2x scale. Raw image pixels never become analysis dimensions directly: they are preserved at `outputs.image.pixelDimensions` with a `pixelRatio` relative to the development coordinates and `coordinateSpace: "image_pixels"`. Unresolved development coordinates use `analysis: null`, `scale: null`, and `coordinateSpace: "unknown"`.

Design tokens separately report colors, fonts, font sizes, line heights, letter spacing, gradients, shadows, borders, and radii across `artboard`, `board`, and legacy `info[]` Sketch JSON formats. Normal stage designs merge Sketch and DDS Schema styles; if either source is unavailable, the other source is returned with a concrete warning.

### `lanhu_page` — PRD / Prototype Analysis

| Mode | Description |
|------|-------------|
| `list` | List all pages in a PRD document |
| `analyze` | PRD / Axure → Structured analysis (default) |

### `lanhu_resolve_invite` — Resolve Invite Links

Parse Lanhu invite/share links into usable project URLs.

---

## 📁 Project Structure

```
lanhu-flow/
├── src/                          # TypeScript source
│   ├── server.ts                 # MCP server entry
│   ├── config.ts                 # Configuration
│   ├── lanhu/                    # Lanhu API client
│   ├── tools/                    # MCP tool registration
│   ├── transform/                # Data transformation
│   └── shared/                   # Shared modules
├── tests-ts/                     # Vitest tests
├── dist/                         # Build output (gitignored)
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── config.example.env            # Environment template
└── README.md
```

---

## 🧪 Development

```bash
npm run check    # Type check
npm test         # Run tests
npm run dev      # Dev mode
```

---

## 🔒 Security

- ⚠️ **Cookie Security**: Never commit `.env` files to public repos
- 🔐 **Access Control**: Deploy in private network recommended
- 📝 **Data Privacy**: Credentials and generated data remain in the local runtime

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📄 License

MIT License - see [LICENSE](../LICENSE) file

---

## 📞 Contact

- GitHub Issues: [Submit Issue](https://github.com/bangjier/lanhu-flow/issues)

---

## ⚠️ Disclaimer

This project is a **third-party open source project**, independently developed and maintained by community developers, and **is NOT an official Lanhu product**.

- No official affiliation with Lanhu (蓝湖)
- Interacts through public web interfaces only
- Requires a legitimate Lanhu account
- For learning and research purposes; users assume all risks
- Data processed locally; credentials stored in your environment only
- MIT Licensed, provided "as is" without warranty
