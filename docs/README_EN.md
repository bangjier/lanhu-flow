# LanhuFlow MCP

Turn Lanhu designs, layers, design tokens, slices, and product documents into structured context that AI coding tools can use.

[简体中文](../README.md) · [Report an issue](https://github.com/bangjier/lanhu-flow/issues) · [MIT License](../LICENSE)

> LanhuFlow MCP is an independently maintained, third-party open source project. It is not an official Lanhu product and is not endorsed by Lanhu.

## From a Lanhu link to development context

LanhuFlow MCP runs locally over `stdio`. Give your AI client a Lanhu URL that your account can access, and the server moves it through this pipeline:

```text
Lanhu URL -> identify project and artboard -> fetch requested data -> normalize output -> return to the MCP client
```

The workflow depends on the link you provide:

| Input | Available context |
| --- | --- |
| Project or Stage URL | Artboard list and selected-artboard analysis |
| Design detail URL with `image_id` | Automatic artboard selection |
| PRD or Axure prototype URL | Page list, page content, and local resources |
| Invite or share URL | Resolved project URL for subsequent tool calls |

Design analysis is composed of independent outputs. A client can request only the HTML, preview image, design tokens, layout summary, layer tree, or slices needed for the current task. If one output fails, successful outputs are still returned with a specific error for the failed operation.

## Installation

Requirement: Node.js 20 or later. Each option below uses `npx` to download and run `lanhu-flow-mcp`; no repository checkout is required.

### Codex

Add the following to `~/.codex/config.toml`:

```toml
[mcp_servers.lanhu]
command = "npx"
args = ["-y", "lanhu-flow-mcp"]

[mcp_servers.lanhu.env]
LANHU_COOKIE = "replace_with_your_lanhu_cookie"
```

Restart Codex or start a new task after adding the server.

### Claude Code

```bash
claude mcp add \
  --transport stdio \
  --env LANHU_COOKIE="your_lanhu_cookie_here" \
  lanhu-flow -- npx -y lanhu-flow-mcp

claude mcp list
```

Claude Code CLI options can vary between versions. Run `claude mcp add --help` first if your installed version does not recognize the command.

### Claude Desktop, Cursor, and Windsurf

Add the server to the client's MCP configuration file:

```json
{
  "mcpServers": {
    "lanhu-flow": {
      "command": "npx",
      "args": ["-y", "lanhu-flow-mcp"],
      "env": {
        "LANHU_COOKIE": "your_lanhu_cookie_here"
      }
    }
  }
}
```

Restart the client after saving. The Cookie passed on the command line or through the JSON `env` entry is stored in that client's local configuration; never publish or commit it.

### Run from source

```bash
git clone https://github.com/bangjier/lanhu-flow.git
cd lanhu-flow
npm ci
npm run build
cp config.example.env .env
```

Set `LANHU_COOKIE` in `.env`, then configure the MCP client with absolute paths:

```json
{
  "mcpServers": {
    "lanhu-flow": {
      "command": "node",
      "args": [
        "--env-file=/ABSOLUTE/PATH/lanhu-flow/.env",
        "/ABSOLUTE/PATH/lanhu-flow/dist/server.js"
      ]
    }
  }
}
```

Replace `/ABSOLUTE/PATH/lanhu-flow` with the repository path on your machine.

## Get your Lanhu Cookie

1. Sign in to [Lanhu on the web](https://lanhuapp.com).
2. Open browser developer tools, select the Network panel, and reload the page.
3. Select a request sent to `lanhuapp.com` and copy the complete `Cookie` value from Request Headers.
4. Store the Cookie in your local `.env` file or in the MCP client's environment configuration.

The Cookie carries your Lanhu session permissions. Never paste it into a chat, issue, screenshot, or log, and never commit the `.env` file. The server can only read content that the signed-in account is already allowed to access.

See the [Cookie guide](GET-COOKIE-TUTORIAL.md) for detailed browser instructions.

## Recommended workflows

### List first, then select

For a project with many artboards, begin with a compact list:

```text
List the artboards in this Lanhu project and return only the compact result: <Lanhu URL>
```

Then select a target by name, UUID, or list index:

```text
Analyze artboard 3. Return only tokens, layout, and layers, with a layer depth of 5.
```

This keeps unrelated context and base64 image data out of the response.

### Analyze a detail URL directly

When the URL already contains `image_id`, the server can select that artboard without a separate name:

```text
Read this Lanhu design detail and return the HTML, design tokens, and layer structure needed to implement it: <Lanhu detail URL>
```

### Read a product document

For a PRD or Axure prototype, list its pages before analyzing selected ones:

```text
List the pages in this Lanhu product document, then analyze "Sign in" and "Forgot password": <PRD URL>
```

## MCP interface

### `lanhu_design`

Reads and analyzes Lanhu design projects.

| Parameter | Values | Description |
| --- | --- | --- |
| `url` | Lanhu URL | Required; supports Stage and design detail URLs |
| `mode` | `list` / `analyze` / `tokens` / `slices` | Defaults to `analyze` |
| `design_names` | Name, UUID, index, array, or `all` | Optional when a detail URL includes `image_id` |
| `include` | `html` / `image` / `tokens` / `layout` / `layers` / `slices` | Selects outputs for `analyze` |
| `compact` | `true` / `false` | Controls compact `list` entries; defaults to `true` |
| `layer_depth` | Non-negative integer or `all` | Maximum layer-tree depth; defaults to `4` |

By default, `analyze` requests `html`, `tokens`, `layers`, and `image`. If several artboards have the same name, the tool returns the candidates instead of silently choosing the first. If no artboard matches, it returns a limited set of approximate suggestions.

Each design result reports `status`, `dimensions`, `outputs`, and `errors` separately. `dimensions.analysis` is the coordinate space intended for implementation. Raw bitmap dimensions remain in the image output and are not treated as layout dimensions.

### `lanhu_page`

Reads PRDs and Axure prototypes.

| Parameter | Description |
| --- | --- |
| `url` | Lanhu product-document URL containing `docId` |
| `mode` | `list` or `analyze`; defaults to `analyze` |
| `page_names` | Page name, array of names, or `all`; required for analysis |
| `analysis_mode` | `developer`, `tester`, or `explorer` |

Page resources are downloaded to `LANHU_DATA_DIR`, which defaults to `data/ts` under the current working directory.

### `lanhu_resolve_invite_link`

Accepts `invite_url`, resolves the final project URL behind an invite or share page, and returns parsed parameters such as `tid`, `pid`, and `docId` when available.

## Built-in Resource and Prompts

| Type | Name | Purpose |
| --- | --- | --- |
| Resource | `project-designs` | Reads an artboard list through `lanhu://project/{pid}/designs?tid={tid}` |
| Prompt | `frontend-dev` | Structures a frontend implementation request around a design |
| Prompt | `design-review` | Structures a design consistency and feasibility review |

## Configuration

| Environment variable | Default | Description |
| --- | --- | --- |
| `LANHU_COOKIE` | None | Lanhu session Cookie used to access design data |
| `DDS_COOKIE` | `LANHU_COOKIE` | Optional separate Cookie for DDS data |
| `LANHU_BASE_URL` | `https://lanhuapp.com` | Base URL for Lanhu requests |
| `LANHU_DATA_DIR` | `data/ts` | Local directory for PRD resources and other data |
| `LANHU_REQUEST_TIMEOUT_MS` | `20000` | Request timeout in milliseconds |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |
| `MCP_SERVER_NAME` | `lanhu-flow-mcp` | MCP server name |
| `MCP_SERVER_VERSION` | `1.0.0` | MCP server version |

## Local development

```bash
npm ci
npm run check
npm test
npm run build
```

To connect to Lanhu while developing:

```bash
node --env-file=.env dist/server.js
```

The server uses standard input and output for MCP transport. It is normal for a direct terminal launch to remain open and wait for messages. MCP responses belong on stdout; diagnostics belong on stderr so they do not corrupt protocol messages.

## Operational boundaries

- Changes to Lanhu's web interfaces may require corresponding parser updates.
- The output gives AI tools implementation context; it does not guarantee that generated code will exactly match a design.
- Batch analysis and responses containing `image` can be large. Prefer `include` and `layer_depth` to limit the result.
- PRD analysis writes page resources to the local data directory. Manage those files according to your project's data-security requirements.
- Follow your Lanhu account permissions, team policies, and applicable terms of service.

## License

LanhuFlow MCP is available under the [MIT License](../LICENSE). Report problems or suggest improvements through [GitHub Issues](https://github.com/bangjier/lanhu-flow/issues).
