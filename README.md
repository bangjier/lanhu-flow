# LanhuFlow MCP

把蓝湖中的设计稿、图层、设计变量、切图和产品文档，转换成 AI 编程工具可以调用的结构化上下文。

[English](docs/README_EN.md) · [问题反馈](https://github.com/bangjier/lanhu-flow/issues) · [MIT License](LICENSE)

> LanhuFlow MCP 是独立维护的第三方开源项目，不属于蓝湖官方，也未获得蓝湖官方背书。

## 从蓝湖链接到开发上下文

LanhuFlow MCP 在本地以 `stdio` 方式运行。你把有权限访问的蓝湖链接交给 AI，服务会完成下面这条处理路径：

```text
蓝湖 URL -> 识别项目与画板 -> 按需读取设计数据 -> 规范化输出 -> 返回 MCP 客户端
```

不同链接会进入不同的工作流：

| 输入 | 可以获得的内容 |
| --- | --- |
| 项目或 Stage 链接 | 画板列表、指定画板分析 |
| 带 `image_id` 的设计详情链接 | 自动定位对应画板 |
| PRD / Axure 原型链接 | 页面列表、页面内容与本地资源 |
| 邀请或分享链接 | 可继续调用的实际项目 URL |

设计分析不是一个不可拆分的大结果。调用方可以只请求当前任务需要的内容：HTML、预览图、Design Tokens、布局摘要、图层树或切图。某一项失败时，其他成功项仍会返回，并附带具体错误。

## 安装

环境要求：Node.js 20 或更高版本。以下方式都会通过 `npx` 自动下载并运行 `lanhu-flow-mcp`，无需克隆仓库。

### Codex

在 `~/.codex/config.toml` 中添加：

```toml
[mcp_servers.lanhu]
command = "npx"
args = ["-y", "lanhu-flow-mcp"]

[mcp_servers.lanhu.env]
LANHU_COOKIE = "替换成你的蓝湖Cookie"
```

添加后重启 Codex 或新建任务，使 MCP 配置生效。

### Claude Code

```bash
claude mcp add \
  --transport stdio \
  --env LANHU_COOKIE="your_lanhu_cookie_here" \
  lanhu-flow -- npx -y lanhu-flow-mcp

claude mcp list
```

不同 Claude Code 版本的命令选项可能略有差异；如果命令不识别，请先运行 `claude mcp add --help` 核对本机语法。

### Claude Desktop、Cursor 与 Windsurf

在客户端的 MCP 配置文件中添加：

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

保存后重启客户端。命令中的 Cookie 或 JSON 中的 `env` 会保存在对应客户端的本地配置中，请勿公开或提交这些配置。

### 从源码运行

```bash
git clone https://github.com/bangjier/lanhu-flow.git
cd lanhu-flow
npm ci
npm run build
cp config.example.env .env
```

编辑 `.env` 并填写 `LANHU_COOKIE`，然后在 MCP 客户端中使用绝对路径：

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

将 `/ABSOLUTE/PATH/lanhu-flow` 替换为本机仓库路径。

## 获取蓝湖 Cookie

1. 登录[蓝湖网页版](https://lanhuapp.com)。
2. 打开浏览器开发者工具，进入 Network 面板并刷新页面。
3. 选择一个发往 `lanhuapp.com` 的请求，在 Request Headers 中复制完整的 `Cookie` 值。
4. 将 Cookie 写入本地 `.env` 或 MCP 客户端的环境变量配置。

Cookie 代表你的蓝湖登录权限。不要将它粘贴到聊天记录、Issue、截图或日志中，也不要提交 `.env` 文件。服务只能读取当前账号本来就有权访问的内容。

更详细的浏览器操作见 [Cookie 获取教程](docs/GET-COOKIE-TUTORIAL.md)。

## 推荐使用流程

### 先列出，再选择

面对包含大量画板的项目，先让 AI 列出精简清单：

```text
列出这个蓝湖项目中的画板，只返回精简结果：<蓝湖链接>
```

再按名称、UUID 或列表索引选择目标：

```text
分析第 3 张画板，只读取 tokens、layout 和 layers，图层深度设为 5。
```

这样可以减少无关上下文和 base64 图片带来的输出体积。

### 直接分析详情链接

当链接本身带有 `image_id` 时，可以直接要求分析，不必再传画板名称：

```text
读取这个蓝湖设计详情，只给我实现页面所需的 HTML、Design Tokens 和图层结构：<蓝湖详情链接>
```

### 读取产品文档

PRD 或 Axure 原型建议同样先获取页面清单，再分析指定页面：

```text
列出这个蓝湖产品文档的页面，然后分析“登录”和“忘记密码”：<PRD 链接>
```

## MCP 接口

### `lanhu_design`

用于读取和分析设计项目。

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `url` | 蓝湖 URL | 必填，支持 Stage 和设计详情链接 |
| `mode` | `list` / `analyze` / `tokens` / `slices` | 默认 `analyze` |
| `design_names` | 名称、UUID、索引、数组或 `all` | 详情链接带 `image_id` 时可省略 |
| `include` | `html` / `image` / `tokens` / `layout` / `layers` / `slices` | 控制 `analyze` 返回内容 |
| `compact` | `true` / `false` | 控制 `list` 是否返回精简条目，默认 `true` |
| `layer_depth` | 非负整数或 `all` | 图层树最大深度，默认 `4` |

`analyze` 默认请求 `html`、`tokens`、`layers` 和 `image`。如果画板同名，工具会返回候选项而不是静默选择第一张；如果没有匹配，会返回有限数量的近似建议。

每个设计结果都会分别报告 `status`、`dimensions`、`outputs` 和 `errors`。`dimensions.analysis` 表示开发布局坐标；原始图片像素保存在图片输出中，不会被误当成布局尺寸。

### `lanhu_page`

用于读取 PRD 或 Axure 原型。

| 参数 | 说明 |
| --- | --- |
| `url` | 含 `docId` 的蓝湖产品文档链接 |
| `mode` | `list` 或 `analyze`，默认 `analyze` |
| `page_names` | 页面名称、名称数组或 `all`；分析模式必填 |
| `analysis_mode` | `developer`、`tester` 或 `explorer` |

页面资源会下载到 `LANHU_DATA_DIR`，默认目录为当前工作目录下的 `data/ts`。

### `lanhu_resolve_invite_link`

接收 `invite_url`，解析邀请或分享页面最终跳转到的项目地址，并尽可能返回 `tid`、`pid` 和 `docId` 等参数。

## 内置 Resource 与 Prompt

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Resource | `project-designs` | 通过 `lanhu://project/{pid}/designs?tid={tid}` 读取画板清单 |
| Prompt | `frontend-dev` | 组织基于设计稿的前端实现请求 |
| Prompt | `design-review` | 组织设计一致性与实现可行性检查 |

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `LANHU_COOKIE` | 无 | 访问蓝湖数据所需的登录 Cookie |
| `DDS_COOKIE` | `LANHU_COOKIE` | 单独访问 DDS 数据时使用 |
| `LANHU_BASE_URL` | `https://lanhuapp.com` | 蓝湖服务基础地址 |
| `LANHU_DATA_DIR` | `data/ts` | PRD 资源等本地数据目录 |
| `LANHU_REQUEST_TIMEOUT_MS` | `20000` | 请求超时时间，单位毫秒 |
| `LOG_LEVEL` | `info` | `debug`、`info`、`warn` 或 `error` |
| `MCP_SERVER_NAME` | `lanhu-flow-mcp` | MCP 服务名称 |
| `MCP_SERVER_VERSION` | `1.0.0` | MCP 服务版本 |

## 本地开发

```bash
npm ci
npm run check
npm test
npm run build
```

需要连接蓝湖调试时：

```bash
node --env-file=.env dist/server.js
```

服务使用标准输入输出传输协议，直接在终端启动后保持等待属于正常行为。MCP 响应写入标准输出，诊断信息应写入标准错误，避免破坏协议数据。

## 使用边界

- 蓝湖网页接口发生变化时，解析能力可能需要同步更新。
- 输出用于为 AI 提供实现上下文，不保证自动生成的代码与设计稿完全一致。
- 批量分析和包含 `image` 的响应可能很大，优先使用 `include` 和 `layer_depth` 控制范围。
- PRD 分析会将页面资源写入本地数据目录，请按项目的数据安全要求管理这些文件。
- 请遵守蓝湖账号权限、团队规范及适用的服务条款。

## 许可

项目采用 [MIT License](LICENSE)。问题和改进建议请提交到 [GitHub Issues](https://github.com/bangjier/lanhu-flow/issues)。
