import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { config } from "../config.js";
import { LanhuClient, createLanhuFetch, parseLanhuUrl } from "../lanhu/client.js";
import { getDesignSchemaJson, getSketchJson, getSlices, listDesigns } from "../lanhu/designs.js";
import { mapConcurrent, withRetry } from "../shared/concurrency.js";
import { createToolResult } from "../shared/errors.js";
import type { JsonObject, LanhuDesignSummary, ToolContent } from "../shared/types.js";
import type { LayerDepth } from "../transform/design-tokens.js";
import {
  analyzeDesign,
  createFailedDesignAnalysis,
  deriveDesignDimensions,
  deriveOverallAnalysisStatus,
  extractImageDimensions,
  renderDesignAnalysis,
  toStructuredDesignAnalysis,
} from "./design-analysis.js";
import type {
  DesignAnalysisResult,
  IncludeOption,
} from "./design-analysis.js";

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
]);

function normalizeImageMimeType(value: string | null): string | undefined {
  const mimeType = value?.split(";", 1)[0].trim().toLowerCase();
  return mimeType && SUPPORTED_IMAGE_MIME_TYPES.has(mimeType) ? mimeType : undefined;
}

function imageMimeTypeFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (/\.jpe?g$/.test(pathname)) return "image/jpeg";
    if (pathname.endsWith(".gif")) return "image/gif";
    if (pathname.endsWith(".webp")) return "image/webp";
    if (pathname.endsWith(".svg")) return "image/svg+xml";
    if (pathname.endsWith(".avif")) return "image/avif";
    if (pathname.endsWith(".png")) return "image/png";
  } catch {
    return undefined;
  }
  return undefined;
}

function imageMimeTypeFromBytes(data: Uint8Array): string | undefined {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  const signature = String.fromCharCode(...data.subarray(0, 6));
  if (["GIF87a", "GIF89a"].includes(signature)) return "image/gif";
  if (
    data.length >= 12
    && String.fromCharCode(...data.subarray(0, 4)) === "RIFF"
    && String.fromCharCode(...data.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    data.length >= 16
    && String.fromCharCode(...data.subarray(4, 8)) === "ftyp"
  ) {
    const boxSize = Math.min(
      data.length,
      (data[0] * 0x1000000) + (data[1] << 16) + (data[2] << 8) + data[3],
    );
    const brands = [String.fromCharCode(...data.subarray(8, 12))];
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
      brands.push(String.fromCharCode(...data.subarray(offset, offset + 4)));
    }
    if (brands.some((brand) => brand === "avif" || brand === "avis")) {
      return "image/avif";
    }
  }
  const textPrefix = new TextDecoder().decode(data.subarray(0, 256)).trimStart().toLowerCase();
  if (textPrefix.startsWith("<svg") || (textPrefix.startsWith("<?xml") && textPrefix.includes("<svg"))) {
    return "image/svg+xml";
  }
  return undefined;
}

function inferMimeType(url: string, responseContentType: string | null, data: Uint8Array): string {
  return normalizeImageMimeType(responseContentType)
    ?? imageMimeTypeFromBytes(data)
    ?? imageMimeTypeFromUrl(url)
    ?? "image/png";
}

type DesignSelector = string | number;
type DesignSelection = DesignSelector | DesignSelector[];

function normalizeDesignNames(designNames: DesignSelection): string[] {
  const values = Array.isArray(designNames) ? designNames : [designNames];
  return values.map((value) => String(value).trim());
}

type TargetDesignResolution =
  | { status: "selected"; designs: LanhuDesignSummary[]; unmatchedSelectors: string[] }
  | { status: "ambiguous"; selector: string; matches: LanhuDesignSummary[] };

export function resolveTargetDesigns(
  designs: LanhuDesignSummary[],
  parsedUrl: ReturnType<typeof parseLanhuUrl>,
  designNames?: DesignSelection,
): TargetDesignResolution {
  if (designNames === undefined) {
    if (!parsedUrl.docId) return { status: "selected", designs: [], unmatchedSelectors: [] };
    const docIdLower = parsedUrl.docId.toLowerCase();
    const selected = designs.find((design) => design.id.toLowerCase() === docIdLower);
    return {
      status: "selected",
      designs: selected ? [selected] : [],
      unmatchedSelectors: selected ? [] : [parsedUrl.docId],
    };
  }

  if (typeof designNames === "string" && designNames.trim().toLowerCase() === "all") {
    return { status: "selected", designs, unmatchedSelectors: [] };
  }

  const requested = normalizeDesignNames(designNames);
  const selected: LanhuDesignSummary[] = [];
  const unmatchedSelectors: string[] = [];
  const seen = new Set<string>();

  for (const name of requested) {
    const lower = name.toLowerCase();
    const byIndex = /^\d+$/.test(name)
      ? designs.find((design) => design.index === Number(name))
      : undefined;
    const byId = designs.find((design) => design.id.toLowerCase() === lower);
    const nameMatches = !byIndex && !byId
      ? designs.filter((design) => design.name === name)
      : [];

    if (nameMatches.length > 1) {
      return { status: "ambiguous", selector: name, matches: nameMatches };
    }

    const target = byIndex ?? byId ?? nameMatches[0];
    if (target && !seen.has(target.id)) {
      seen.add(target.id);
      selected.push(target);
    } else if (!target) {
      unmatchedSelectors.push(name);
    }
  }

  return { status: "selected", designs: selected, unmatchedSelectors };
}

export function pickTargetDesigns(
  designs: LanhuDesignSummary[],
  parsedUrl: ReturnType<typeof parseLanhuUrl>,
  designNames?: DesignSelection,
) {
  const resolution = resolveTargetDesigns(designs, parsedUrl, designNames);
  return resolution.status === "ambiguous" ? resolution.matches : resolution.designs;
}

function toStructuredListDesign(design: LanhuDesignSummary) {
  return {
    index: design.index,
    id: design.id,
    designId: design.id,
    name: design.name,
    width: design.width,
    height: design.height,
    url: design.url,
    hasComment: design.hasComment,
    updateTime: design.updateTime,
    versionId: design.versionId,
    sketchId: design.sketchId,
    group: design.group,
    groupId: design.groupId,
    groupIds: design.groupIds,
    groupNames: design.groupNames,
    artboardType: design.artboardType,
    source: design.source,
    status: "success" as const,
    success: true,
    dimensions: deriveDesignDimensions(design),
    outputs: {},
    errors: [],
  };
}

function toCompactListDesign(design: LanhuDesignSummary) {
  return {
    index: design.index,
    designId: design.id,
    name: design.name,
    width: design.width ?? null,
    height: design.height ?? null,
    versionId: design.versionId ?? null,
    group: design.group ?? null,
    artboardType: design.artboardType ?? null,
  };
}

function toAmbiguousDesign(design: LanhuDesignSummary, selector: string) {
  return {
    designId: design.id,
    id: design.id,
    index: design.index,
    name: design.name,
    version: design.versionId ?? null,
    status: "ambiguous" as const,
    success: false,
    dimensions: deriveDesignDimensions(design),
    outputs: {},
    errors: [{
      operation: "selection",
      error: `Multiple designs match name: ${selector}`,
    }],
  };
}

function toDesignSuggestion(design: LanhuDesignSummary) {
  return {
    designId: design.id,
    index: design.index,
    name: design.name,
    version: design.versionId ?? null,
  };
}

function getDesignSuggestions(
  designs: LanhuDesignSummary[],
  designNames: DesignSelection | undefined,
  limit = 10,
) {
  if (designNames === undefined) return [];
  const selectors = normalizeDesignNames(designNames)
    .map((selector) => selector.trim())
    .filter(Boolean);
  if (selectors.length === 0) return [];
  const selector = selectors[0];
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selector)) {
    return [];
  }
  if (/^\d+$/.test(selector)) {
    const requestedIndex = Number(selector);
    return [...designs]
      .sort((left, right) =>
        Math.abs(left.index - requestedIndex) - Math.abs(right.index - requestedIndex)
        || left.index - right.index
      )
      .slice(0, limit)
      .map(toDesignSuggestion);
  }

  const query = selector.toLowerCase();
  return designs
    .map((design) => {
      const name = design.name.toLowerCase();
      const score = name.startsWith(query)
        ? 0
        : name.includes(query)
          ? 1
          : query.includes(name)
            ? 2
            : Number.POSITIVE_INFINITY;
      return { design, score };
    })
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => left.score - right.score || left.design.index - right.design.index)
    .slice(0, limit)
    .map(({ design }) => toDesignSuggestion(design));
}

const DEFAULT_INCLUDE = ["html", "tokens", "layers", "image"] as const;
const DESIGN_SELECTOR_SCHEMA = z.string().trim().min(1);

export function registerDesignTool(server: McpServer): void {
  server.registerTool(
    "lanhu_design",
    {
      description:
        "Unified Lanhu design tool. Supports listing, analyzing, extracting tokens, and getting slices.\n\n" +
        "Modes:\n" +
        "  - list: List all designs in the project\n" +
        "  - analyze: Analyze selected HTML, image, token, layout, layer, and slice outputs\n" +
        "  - slices: Extract slice/asset info for download\n" +
        "  - tokens: Extract design tokens only (fonts, colors, shadows, etc.)\n\n" +
        "When the URL contains image_id, that design is selected automatically if design_names is omitted.",
      inputSchema: {
        url: z.string().min(1).describe(
          "Lanhu project URL. Supports stage and detailDetach formats.",
        ),
        mode: z.enum(["list", "analyze", "slices", "tokens"]).default("analyze").describe(
          "Operation mode. Default: analyze.",
        ),
        design_names: z.union([
          DESIGN_SELECTOR_SCHEMA,
          z.number().int().positive(),
          z.array(z.union([DESIGN_SELECTOR_SCHEMA, z.number().int().positive()])).min(1),
        ]).optional().describe(
          "Design name(s), index, or 'all'. Required for analyze/slices/tokens unless the URL contains image_id. " +
          "Number or numeric string = index from list; other strings match by exact name or id.",
        ),
        include: z.array(z.enum(["html", "image", "tokens", "layout", "layers", "slices"])).min(1).optional().describe(
          "Content to include in analyze mode. Default: ['html', 'tokens', 'layers', 'image']. " +
          "Options: html, image (base64), tokens, layout, layers, slices.",
        ),
        compact: z.boolean().default(true).describe(
          "Use compact list entries in list mode. Default: true. Set false for detailed list metadata.",
        ),
        layer_depth: z.union([z.number().int().min(0), z.literal("all")]).default(4).describe(
          "Maximum layer nesting depth for layers output. Use 'all' for the complete tree. Default: 4.",
        ),
      },
    },
    async ({ url, mode, design_names, include, compact, layer_depth }) => {
      try {
        const client = new LanhuClient({
          cookie: config.lanhuCookie,
          ddsCookie: config.ddsCookie,
        });
        const parsed = parseLanhuUrl(url);
        const designsResult = await listDesigns(client, url);

        // === LIST MODE ===
        if (mode === "list") {
          const useCompactList = compact !== false;
          return createToolResult(
            `Loaded ${designsResult.totalDesigns} design(s)${designsResult.projectName ? ` from ${designsResult.projectName}` : ""}.`,
            {
              ...designsResult,
              compact: useCompactList,
              designs: useCompactList
                ? designsResult.designs.map(toCompactListDesign)
                : designsResult.designs.map(toStructuredListDesign),
            } as unknown as JsonObject,
          );
        }

        // A stage/detail URL with image_id already identifies the target design.
        if (design_names === undefined && !parsed.docId) {
          return createToolResult(
            "design_names is required for analyze/slices/tokens mode.",
            {
              status: "error",
              projectName: designsResult.projectName ?? null,
              totalDesigns: 0,
              designs: [],
              hint: "Pass design_names='all' or a specific name/index, or use a URL containing image_id.",
            },
            true,
          );
        }

        const targetResolution = resolveTargetDesigns(designsResult.designs, parsed, design_names);
        if (targetResolution.status === "ambiguous") {
          return createToolResult(
            `Multiple designs match "${targetResolution.selector}". Use designId or index to select one.`,
            {
              status: "ambiguous",
              projectName: designsResult.projectName ?? null,
              totalDesigns: targetResolution.matches.length,
              designs: targetResolution.matches.map((design) =>
                toAmbiguousDesign(design, targetResolution.selector)
              ),
            } as unknown as JsonObject,
            true,
          );
        }
        const targetDesigns = targetResolution.designs;
        const unmatchedSelectors = targetResolution.unmatchedSelectors;
        if (targetDesigns.length === 0) {
          return createToolResult(
            "No matching design found.",
            {
              status: "error",
              projectName: designsResult.projectName ?? null,
              totalDesigns: 0,
              designs: [],
              error: {
                code: "DESIGN_NOT_FOUND",
                message: "No matching design found",
              },
              unmatchedSelectors,
              totalAvailable: designsResult.totalDesigns,
              suggestions: getDesignSuggestions(designsResult.designs, design_names),
              hint: "Use mode=list to retrieve all designs",
            } as unknown as JsonObject,
            true,
          );
        }
        const teamId = designsResult.params.teamId;
        const includeSet = new Set<IncludeOption>(
          mode === "tokens"
            ? ["tokens"]
            : mode === "slices"
              ? ["slices"]
              : (include as IncludeOption[] | undefined) ?? [...DEFAULT_INCLUDE],
        );
        const cdnFetch = createLanhuFetch({
          cookie: config.lanhuCookie,
          ddsCookie: config.ddsCookie,
        });

        const analyzeOne = (design: LanhuDesignSummary): Promise<DesignAnalysisResult> =>
          analyzeDesign(design, includeSet, layer_depth as LayerDepth, {
            loadSchema: async () => {
              if (!teamId) throw new Error("team_id is required for DDS Schema extraction");
              return (await getDesignSchemaJson(
                client,
                design.id,
                teamId,
                designsResult.params.projectId,
              )).schema;
            },
            loadSketch: async () => {
              if (!teamId && design.source !== "detailDetach") {
                throw new Error("team_id is required for Sketch extraction");
              }
              return (await withRetry(
                () => getSketchJson(client, design.id, teamId, designsResult.params.projectId),
              )).sketch;
            },
            ...(design.url ? {
              loadImage: async () => {
                const response = await withRetry(() => cdnFetch(design.url!));
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const bytes = Buffer.from(await response.arrayBuffer());
                return {
                  bytes: bytes.length,
                  dimensions: extractImageDimensions(bytes),
                  content: {
                    type: "image" as const,
                    data: bytes.toString("base64"),
                    mimeType: inferMimeType(
                      design.url!,
                      response.headers.get("content-type"),
                      bytes,
                    ),
                  },
                };
              },
            } : {}),
            loadSlices: () => getSlices(
              client,
              design.id,
              teamId,
              designsResult.params.projectId,
              true,
            ),
          });

        const settledResults = await mapConcurrent(targetDesigns, analyzeOne, 5);
        const analysisResults = settledResults.map((result, index): DesignAnalysisResult => {
          if (result.status === "fulfilled") return result.value;
          return createFailedDesignAnalysis(targetDesigns[index], includeSet, result.reason);
        });

        const summarySections = [
          "Design Analysis Results",
          `Project: ${designsResult.projectName ?? "Unknown"}`,
          ...(unmatchedSelectors.length > 0
            ? [`Unmatched selectors: ${unmatchedSelectors.join(", ")}`]
            : []),
          "",
          ...analysisResults.map(renderDesignAnalysis),
        ];
        const content: ToolContent[] = [
          { type: "text", text: summarySections.join("\n").trim() },
          ...analysisResults.flatMap((result) => result.imageContent ? [result.imageContent] : []),
        ];

        const structuredDesigns = analysisResults.map(toStructuredDesignAnalysis);
        const analysisStatus = deriveOverallAnalysisStatus(analysisResults);
        const overallStatus = unmatchedSelectors.length > 0 && analysisStatus === "success"
          ? "partial_success"
          : analysisStatus;

        return {
          content,
          structuredContent: {
            status: overallStatus,
            projectName: designsResult.projectName ?? null,
            totalDesigns: targetDesigns.length,
            designs: structuredDesigns,
            ...(unmatchedSelectors.length > 0 ? { unmatchedSelectors } : {}),
          } as unknown as JsonObject,
          ...(overallStatus === "error" ? { isError: true } : {}),
        };
      } catch (error) {
        return createToolResult(
          `Failed: ${error instanceof Error ? error.message : String(error)}`,
          { status: "error", url },
          true,
        );
      }
    },
  );
}
