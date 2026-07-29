# AI 助手安装指南

本文用于指导 AI 助手为用户安装和配置 LanhuFlow MCP。

## 前置条件

- Node.js 20 或更高版本
- npm / npx
- 蓝湖账号及有效 Cookie
- 源码安装时需要 Git

Cookie 属于敏感凭据。让用户自行在本地环境变量或配置文件中填写，不要要求用户把 Cookie 发送到公开对话、Issue 或日志中。

## 推荐方式：npx

在 MCP 客户端中添加以下配置：

```json
{
  "mcpServers": {
    "lanhu": {
      "command": "npx",
      "args": ["-y", "lanhu-flow-mcp"],
      "env": {
        "LANHU_COOKIE": "your_cookie_here"
      }
    }
  }
}
```

Claude Code 可以直接运行：

```bash
claude mcp add lanhu -- npx -y lanhu-flow-mcp
```

## 源码安装

```bash
git clone https://github.com/bangjier/lanhu-flow.git
cd lanhu-flow
npm install
cp config.example.env .env
npm run build
npm start
```

在 `.env` 中设置：

```dotenv
LANHU_COOKIE="your_cookie_here"
```

也可以使用仓库脚本：

```bash
bash scripts/easy-install.sh
```

Windows：

```bat
scripts\easy-install.bat
```

## 获取 Cookie

1. 登录 [蓝湖网页版](https://lanhuapp.com)。
2. 打开浏览器开发者工具的 Network 面板。
3. 刷新页面并选择一个发往蓝湖的请求。
4. 从 Request Headers 中复制完整的 `Cookie` 请求头值。
5. 只把它写入本地 MCP 配置或 `.env`。

更详细的步骤见 [GET-COOKIE-TUTORIAL.md](GET-COOKIE-TUTORIAL.md)。

## 验证

源码安装后依次运行：

```bash
npm run check
npm test
npm run build
```

然后重启 MCP 客户端并调用 `lanhu_design` 的 `list` 模式。成功返回设计稿列表即表示连接正常。

## 常见问题

- `node` 命令不存在：安装 Node.js 20+ 并重新打开终端。
- 返回 401/403：重新登录蓝湖并更新 Cookie。
- npx 找不到包：确认包已发布，并检查 npm registry 配置。
- 输出过大：使用 `include` 只请求需要的内容，或降低 `layer_depth`。

问题反馈：[GitHub Issues](https://github.com/bangjier/lanhu-flow/issues)
