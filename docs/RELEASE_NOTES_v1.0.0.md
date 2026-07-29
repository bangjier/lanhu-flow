# LanhuFlow MCP v1.0.0

LanhuFlow MCP 的首个独立版本，为 AI 编程助手提供蓝湖设计稿、PRD、Design Tokens、图层和切图的结构化访问能力。

## 核心能力

- 使用 `lanhu_design` 列出和分析设计稿，按需返回 HTML、图片、Tokens、布局、图层和切图。
- 使用 `lanhu_page` 列出并分析蓝湖 PRD 与 Axure 原型页面。
- 使用 `lanhu_resolve_invite` 将蓝湖邀请链接解析为可用项目地址。
- 支持设计稿名称、UUID 和索引选择，明确报告未找到与同名歧义。
- Design Tokens 覆盖颜色、字体、字号、行高、字距、渐变、阴影、边框和圆角。
- 基于 TypeScript、Node.js 20+ 和 MCP stdio 传输运行。

## 安装

```bash
npx -y lanhu-flow-mcp
```

也可以从源码运行：

```bash
git clone https://github.com/bangjier/lanhu-flow.git
cd lanhu-flow
npm install
cp config.example.env .env
npm run build
npm start
```

运行前需要在环境变量或 `.env` 中配置 `LANHU_COOKIE`。

## 文档

- [中文说明](https://github.com/bangjier/lanhu-flow/blob/main/README.md)
- [English README](https://github.com/bangjier/lanhu-flow/blob/main/docs/README_EN.md)
- [部署指南](https://github.com/bangjier/lanhu-flow/blob/main/docs/DEPLOY.md)
- [安全政策](https://github.com/bangjier/lanhu-flow/blob/main/docs/SECURITY.md)

LanhuFlow MCP 是非官方第三方开源项目，与蓝湖官方没有隶属或背书关系。
