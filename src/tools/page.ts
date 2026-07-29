// src/tools/page.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

import { config } from "../config.js";
import { createLanhuFetch } from "../lanhu/client.js";
import {
  analyzeLocalPage,
  downloadResources,
  listPages,
  parseLanhuPageUrl,
} from "../lanhu/pages.js";
import { createToolResult } from "../shared/errors.js";
import type { JsonObject } from "../shared/types.js";

export function registerPageTool(server: McpServer): void {
  server.registerTool(
    "lanhu_page",
    {
      description:
        "Unified Lanhu PRD/prototype tool. Supports listing and analyzing pages.\n\n" +
        "Modes:\n" +
        "  - list: List all pages in a PRD/prototype document\n" +
        "  - analyze: Analyze specified pages (default)\n",
      inputSchema: {
        url: z.string().min(1).describe(
          "Lanhu project URL with docId (PRD/prototype). Example: https://lanhuapp.com/web/#/item/project/product?tid=xxx&pid=xxx&docId=xxx",
        ),
        mode: z.enum(["list", "analyze"]).default("analyze").describe(
          "Operation mode. Default: analyze.",
        ),
        page_names: z.union([z.string(), z.array(z.string())]).optional().describe(
          "Page name(s) to analyze. Use 'all' for all pages. Required for analyze mode.",
        ),
        analysis_mode: z.enum(["developer", "tester", "explorer"]).default("developer").describe(
          "Analysis perspective. Default: developer.",
        ),
      },
    },
    async ({ url, mode, page_names, analysis_mode }) => {
      try {
        const fetchImpl = createLanhuFetch({
          cookie: config.lanhuCookie,
          ddsCookie: config.ddsCookie,
        });

        // === LIST MODE ===
        if (mode === "list") {
          const result = await listPages(fetchImpl, url);
          return createToolResult(
            `Loaded ${result.total_pages} prototype page(s) from ${result.document_name}.`,
            result as unknown as JsonObject,
          );
        }

        // === ANALYZE MODE ===
        if (!page_names) {
          return createToolResult(
            "page_names is required for analyze mode.",
            { status: "error", hint: "Pass page_names='all' or specific page names." },
            true,
          );
        }

        const params = parseLanhuPageUrl(url);
        const resourceDir = path.join(config.dataDir, `axure_extract_${(params.doc_id ?? "unknown").slice(0, 8)}`);
        await mkdir(resourceDir, { recursive: true });

        const downloadResult = await downloadResources(fetchImpl, url, resourceDir);
        const pagesResult = await listPages(fetchImpl, url);
        const pageMap = new Map(
          pagesResult.pages.map((page) => [page.name, page.filename.replace(/\.html$/i, "")]),
        );

        const requested = Array.isArray(page_names) ? page_names : [page_names];
        const targetPages =
          requested.length === 1 && requested[0]?.toLowerCase() === "all"
            ? pagesResult.pages.map((page) => page.filename.replace(/\.html$/i, ""))
            : requested.map((name) => pageMap.get(name) ?? name);

        const results = await Promise.all(targetPages.map((page) => analyzeLocalPage(resourceDir, page)));
        const successful = results.filter((item) => item.success);

        const summaryText = [
          `Perspective: ${analysis_mode}`,
          `Document: ${pagesResult.document_name}`,
          `Requested pages: ${targetPages.length}`,
          `Successful pages: ${successful.length}`,
          `Version: ${downloadResult.version_id}`,
        ].join("\n");

        return createToolResult(
          summaryText,
          {
            status: "success",
            analysis_mode,
            document: pagesResult,
            download: downloadResult,
            results,
          } as unknown as JsonObject,
        );
      } catch (error) {
        return createToolResult(
          `Failed to analyze pages: ${error instanceof Error ? error.message : String(error)}`,
          { status: "error", url },
          true,
        );
      }
    },
  );
}
