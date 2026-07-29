<div align="center">

# 🎨 LanhuFlow MCP

**连接蓝湖设计资产与 AI 编程工作流**

[![npm version](https://img.shields.io/npm/v/lanhu-flow-mcp)](https://www.npmjs.com/package/lanhu-flow-mcp)
[![npm downloads](https://img.shields.io/npm/dm/lanhu-flow-mcp)](https://www.npmjs.com/package/lanhu-flow-mcp)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[English](docs/README_EN.md)

</div>

---

## 这是什么

`lanhu-flow-mcp` 是面向蓝湖的非官方 [MCP](https://modelcontextprotocol.io/) 服务器。连接 **Cursor、Windsurf、Claude Desktop、Claude Code** 等 MCP 客户端后，AI 可以读取设计稿、提取 HTML/CSS 和 Design Tokens、解析 PRD、获取图层与切图资源。

> **一行命令，零配置** — `npx -y lanhu-flow-mcp`，粘贴蓝湖链接就能用。

### 核心能力

- **设计稿 → 代码**：生成像素级 HTML + CSS，含完整 Design Tokens（颜色、字体、阴影、渐变）
- **结构化 Design Tokens**：提取所有颜色、字体族/字号/字重、阴影、边框、圆角，按使用频率排序
- **PRD 驱动开发**：将 PRD 或 Axure 原型交给 AI，需求感知编码
- **自动切图**：直接从蓝湖提取切图、图标和图片，无需手动导出
- **并发 + 重试**：多设计稿并行分析，网络异常自动重试
- **MCP Resources & Prompts**：内置前端开发和设计走查 Prompt 模板

---

## 安装

### 最快方式：让 AI 帮你装

复制下面这段话，发给你的 AI 助手（Cursor / Claude Code / Windsurf）：

> 帮我安装 LanhuFlow MCP：https://github.com/bangjier/lanhu-flow

AI 会自动读取仓库说明并完成配置，你只需要提供蓝湖 Cookie。

---

### 手动配置

无需 clone 代码，`npx` 自动安装。

**Cursor / Windsurf** — 编辑 `.cursor/mcp.json`（或 `.windsurf/mcp.json`）：

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

**Claude Desktop** — 编辑 `claude_desktop_config.json`：

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

**Claude Code**：

```bash
claude mcp add lanhu -- npx -y lanhu-flow-mcp
```

然后设置环境变量 `LANHU_COOKIE`。

### 获取 Cookie

1. 登录 [蓝湖](https://lanhuapp.com)
2. F12 打开开发者工具 → Network 标签
3. 复制任意请求的 `Cookie` 请求头

配置完成后重启客户端，粘贴蓝湖链接即可使用。

---

## 工具

### `lanhu_design` — 设计稿

通过 `mode` 参数切换功能：

| Mode | 说明 |
|------|------|
| `list` | 列出项目所有设计图 |
| `analyze` | 按需分析 HTML、图片、Tokens、布局、图层和切图（默认） |
| `tokens` | 仅提取 Design Tokens（字体、颜色、阴影等） |
| `slices` | 提取切图资源 |

`analyze` 模式支持 `include` 参数按需选择输出：`html`、`image`、`tokens`、`layout`、`layers`、`slices`。默认 `["html", "tokens", "layers", "image"]`。每项输出独立执行；单个设计的 `status` 为 `success`、`partial_success` 或 `error`，具体失败会记录在 `errors` 中。

四种模式统一使用 camelCase 顶层字段 `projectName`、`totalDesigns` 和 `designs`。`analyze`、`tokens`、`slices` 的设计结果包含 `designId`、`name`、`status`、`success`、`dimensions`、`outputs` 和 `errors`。`tokens` 与 `analyze + include: ["tokens"]`、`slices` 与 `analyze + include: ["slices"]` 使用相同的结构化响应，数据分别位于 `designs[].outputs.tokens.value` 和 `designs[].outputs.slices.value`。旧的 `html_code`、`design_tokens`、`layer_tree` 等便利别名以及 slices 顶层结果已移除。

`list` 默认使用 `compact: true`，每个画板仅返回 `index`、`designId`、`name`、`width`、`height`、`versionId`、`group` 和 `artboardType`。传入 `compact: false` 可返回预览 URL、更新时间、Sketch/group 元数据、`dimensions`、`outputs` 和 `errors` 等详细字段；两种 list 结构都不会返回原始 `raw`。

当 stage 或 detail URL 自带 `image_id` 时，`analyze`、`tokens`、`slices` 可以省略 `design_names`，工具会自动选择该画板；显式传入 `design_names: "all"` 仍会选择全部画板。

`design_names` 支持画板名称、UUID、数字索引和数字字符串索引，例如 `3` 与 `"3"` 都会选择 list 中第 3 张画板。未匹配时不会返回完整画板列表：响应包含 `DESIGN_NOT_FOUND`、项目画板总数、最多 10 条近似 suggestions，并提示使用 `mode: "list"` 获取完整清单；无效 UUID 默认不返回 suggestions。

当名称精确匹配多个同名画板时，非 `list` 模式返回 `status: "ambiguous"` 和全部匹配项的 `designId/id/index/name/version`，不会静默选择第一张；可改用 UUID 或索引明确选择。

`layers` 数据位于 `outputs.layers.value`，其中包含 `tree`、`annotations`、`truncated` 和 `maxDepth`。可用 `layer_depth` 控制图层树深度，默认 `4`；传入 `"all"` 返回完整图层树。`completeness: "complete"` 对应 `status: "success"`，`partial` 对应 `partial_success`，没有可用树和标注的 `empty` 对应 `error`。`sourceMissingFields` 记录源 Sketch 缺失字段，`normalizedMissingFields` 记录规范化后仍缺失的字段。源 artboard 的原始尺寸保留在 `outputs.layers.sourceArtboardDimensions`，不会覆盖统一的开发坐标；dimensions 优先使用位于 `(0,0)` 的可信根图层尺寸。

每个非 list 设计结果都包含 `dimensions`，其中 `analysis` 始终表示开发实现使用的布局坐标。统一解析优先级为规范化 layers 根图层、Schema 页面、按 device scale 归一化的 Sketch 画布/图层边界、切图 canvas/坐标范围、规范化图片尺寸。切图 document 尺寸若处于 list 坐标，而切图边界明确覆盖更大的画布，会使用 `position + size` 最大范围；例如 187.5×856 会恢复为 375×1712 和 2x scale。图片的原始位图尺寸不会直接写入 analysis，而是保存在 `outputs.image.pixelDimensions`，同时返回相对开发坐标的 `pixelRatio` 和 `coordinateSpace: "image_pixels"`。无法可靠确定开发坐标时返回 `analysis: null`、`scale: null`、`coordinateSpace: "unknown"`。

Design Tokens 会分别汇总颜色、字体、字号、行高、字距、渐变、阴影、边框和圆角，并兼容 `artboard`、`board` 与 legacy `info[]` Sketch JSON。普通 stage 设计会合并 Sketch 与 DDS Schema 样式；任一来源不可用时仍会返回另一来源及具体 warning。

**Design Tokens 输出示例：**

```
=== Design Tokens ===

Colors (12 unique):
  rgba(140,140,140,1) x48
  rgba(255,255,255,1) x28
  rgba(51,51,51,1) x12
  ...

Fonts (7 unique):
  Source Han Sans CN / Regular / 14px x25
  PingFang SC / Bold / 10px x3
  ...

Shadows (3 unique):
  rgba(0,81,187,0.03) 0px 0px 0px 1px x3
  ...
```

### `lanhu_page` — PRD / 原型

| Mode | 说明 |
|------|------|
| `list` | 列出 PRD 所有页面 |
| `analyze` | PRD/原型 → 结构化分析（默认） |

### `lanhu_resolve_invite` — 解析邀请链接

将蓝湖分享链接解析为可用的项目 URL。

---

## MCP Resources & Prompts

| 类型 | 名称 | 说明 |
|------|------|------|
| Resource | `project-designs` | 项目设计稿列表（`lanhu://project/{pid}/designs?tid={tid}`） |
| Prompt | `frontend-dev` | 根据设计稿生成像素级前端代码 |
| Prompt | `design-review` | 审查设计一致性和可实现性 |

---

## 使用场景

- **前端开发**：粘贴蓝湖链接 → AI 生成与设计稿匹配的组件代码
- **设计走查**：对比实现与 Design Tokens（间距、颜色、字体）
- **需求实现**：将 PRD 交给 AI，需求驱动的功能开发
- **资源导出**：批量提取图标和图片

---

## 兼容性

| 客户端 | 支持 | 传输 |
|--------|------|------|
| Cursor | ✅ | stdio |
| Windsurf | ✅ | stdio |
| Claude Desktop | ✅ | stdio |
| Claude Code | ✅ | stdio |
| 其他 MCP 兼容 IDE | ✅ | stdio |

---

## 开发

```bash
git clone https://github.com/bangjier/lanhu-flow.git && cd lanhu-flow
npm install && cp config.example.env .env  # 填入 LANHU_COOKIE
npm run dev    # 开发模式
npm run build  # 构建
npm test       # 测试
```

---

## FAQ

**Q: 什么是 MCP？**
A: [Model Context Protocol](https://modelcontextprotocol.io/)，让 AI 助手安全连接外部工具的开放标准。

**Q: 支持哪些蓝湖套餐？**
A: 任何可网页访问的蓝湖账号，通过浏览器 Cookie 认证。

**Q: `analyze` 返回太大怎么办？**
A: 用 `include` 参数，如 `["tokens"]` 只返回 Design Tokens；分析图层时也可用 `layer_depth` 限制深度。默认输出包含 base64 预览图，可通过显式 `include` 排除 `image`。

**Q: 不用 Cursor 也能用？**
A: 能。支持所有 MCP 客户端。

---

## 免责声明

LanhuFlow MCP 是独立维护的第三方开源项目，并非蓝湖官方产品，也未获得蓝湖官方背书。使用者需要拥有合法的蓝湖账号，并自行承担通过网页接口访问数据的相关风险。项目只在本地处理凭据；请勿提交或公开分享 Cookie。

---

## License

[MIT](LICENSE) © [bangjier](https://github.com/bangjier)
