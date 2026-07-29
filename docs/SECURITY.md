# Security Policy / 安全政策

## Supported Versions / 支持版本

| Version | Supported / 支持状态 |
| --- | --- |
| 1.x | Supported / 支持 |
| < 1.0 | Not supported / 不支持 |

## Reporting a Vulnerability / 报告漏洞

Please do not disclose security vulnerabilities in a public issue. Use the repository's [private vulnerability reporting](https://github.com/bangjier/lanhu-flow/security/advisories/new) when available. If that channel is unavailable, contact the repository owner through their [GitHub profile](https://github.com/bangjier) before sharing sensitive details.

请勿在公开 Issue 中披露安全漏洞。优先使用仓库的[私密漏洞报告](https://github.com/bangjier/lanhu-flow/security/advisories/new)；如果该入口不可用，请先通过维护者的 [GitHub 主页](https://github.com/bangjier)联系，再发送敏感细节。

Include the affected version, reproduction steps, impact, and a minimal proof of concept when possible.

请尽量提供受影响版本、复现步骤、影响范围和最小化验证示例。

## Security Considerations / 安全注意事项

LanhuFlow MCP runs over stdio and does not open a network port by default. It connects to Lanhu web services using credentials supplied through environment variables.

LanhuFlow MCP 默认通过 stdio 运行，不监听网络端口。它使用环境变量中的凭据连接蓝湖网页服务。

- Never commit `.env`, `LANHU_COOKIE`, or `DDS_COOKIE` values.
- Treat MCP output as potentially sensitive because it can contain design and product data.
- Run the server only for trusted local MCP clients.
- Rotate cookies after accidental exposure and revoke affected sessions in Lanhu.
- Review dependency updates and run `npm audit` as part of release preparation.
- Avoid logging request headers, cookies, or full authenticated URLs.

- 不要提交 `.env`、`LANHU_COOKIE` 或 `DDS_COOKIE`。
- MCP 输出可能包含设计稿和产品数据，应按敏感数据处理。
- 仅允许可信的本地 MCP 客户端运行本服务。
- Cookie 意外泄露后应立即更换，并在蓝湖中撤销相关会话。
- 发布前审查依赖更新并运行 `npm audit`。
- 不要记录请求头、Cookie 或完整的认证 URL。

## Security Updates / 安全更新

Security fixes are announced through GitHub Security Advisories and release notes marked with `Security`.

安全修复将通过 GitHub Security Advisories 和标记为 `Security` 的发布说明公布。

**Last updated / 最后更新：2026-07-29**
