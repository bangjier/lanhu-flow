# 🚀 部署指南

## 📋 前置要求

- **Node.js 20+**
- 蓝湖账号及 Cookie

> 💡 获取 Cookie：登录 [蓝湖](https://lanhuapp.com) → 浏览器开发者工具（F12）→ Network → 复制请求头中的 Cookie。详见 [GET-COOKIE-TUTORIAL.md](GET-COOKIE-TUTORIAL.md)。

---

## 方式一：npx 零安装（推荐）

无需 clone 代码，直接在 AI 客户端配置中使用：

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

npx 会自动下载并运行最新版本的 `lanhu-flow-mcp`。

---

## 方式二：本地 Node 部署

适合需要自定义配置或开发调试的场景。

```bash
# 1. 克隆项目
git clone https://github.com/bangjier/lanhu-flow.git
cd lanhu-flow

# 2. 安装依赖并构建
npm install
npm run build

# 3. 配置环境变量
cp config.example.env .env
# 编辑 .env，设置 LANHU_COOKIE

# 4. 启动服务
npm start
# 或直接运行
node dist/server.js
```

### 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `LANHU_COOKIE` | 蓝湖网页 Cookie | 是 |
| `DDS_COOKIE` | DDS Cookie（默认使用 LANHU_COOKIE） | 否 |
| `LOG_LEVEL` | 日志级别（debug/info/warn/error） | 否 |

可选配置项详见 `config.example.env`。

---

## 🔌 连接 AI 客户端

服务使用 **stdio 传输协议**，按以下方式配置各客户端。

### Cursor / Windsurf

编辑 `.cursor/mcp.json`（或 `.windsurf/mcp.json`）：

**npx 方式：**
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

**本地部署方式：**
```json
{
  "mcpServers": {
    "lanhu": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/lanhu-flow/.env",
        "/absolute/path/to/lanhu-flow/dist/server.js"
      ],
      "cwd": "/absolute/path/to/lanhu-flow"
    }
  }
}
```

### Claude Desktop

编辑 `claude_desktop_config.json`：

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

### Claude Code

```bash
claude mcp add lanhu -- npx -y lanhu-flow-mcp
```

然后在环境变量或 `.env` 文件中设置 `LANHU_COOKIE`。

---

## 🔍 故障排查

### Cookie 失效

**症状：** 请求返回 401 或 403 错误

**解决方法：**
1. 重新登录蓝湖网页版
2. 获取新的 Cookie
3. 更新环境变量或 `.env` 文件
4. 重启服务

### 服务无法启动

**常见原因：**
- Node.js 版本低于 20（运行 `node -v` 检查）
- Cookie 格式错误（确保是完整的 Cookie 字符串）
- 依赖未安装（运行 `npm install`）

### 检查日志

```bash
# 开启 debug 日志
LOG_LEVEL=debug node dist/server.js
```

---

## 🔒 安全建议

1. **Cookie 安全**
   - 定期更换 Cookie（建议每月一次）
   - 确保 `.env` 文件不被提交到 Git
   - 设置严格的文件权限: `chmod 600 .env`

2. **网络安全**
   - 生产环境建议部署在私有网络中
   - 不要将 Cookie 硬编码在配置文件中

---

## 📚 相关文档

- [README.md](../README.md) - 项目概述和功能介绍
- [CONTRIBUTING.md](CONTRIBUTING.md) - 贡献指南
- [CHANGELOG.md](CHANGELOG.md) - 更新日志
- [config.example.env](../config.example.env) - 配置文件说明

## 🆘 获取帮助

如遇到问题：
1. 查看本文档的故障排查章节
2. 提交 Issue: https://github.com/bangjier/lanhu-flow/issues
