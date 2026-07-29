import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerDesignTool } from "./design.js";
import { registerPageTool } from "./page.js";
import { registerResolveInviteTool } from "./resolve-invite.js";

export { registerDesignTool, registerPageTool, registerResolveInviteTool };

const toolRegistrations = [
  registerResolveInviteTool,
  registerDesignTool,
  registerPageTool,
] as const;

export function registerAllTools(server: McpServer): void {
  for (const registerTool of toolRegistrations) {
    registerTool(server);
  }
}
