import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolExecutionResult, UnknownRecord } from "../src/shared/types.js";

const lanhuMocks = vi.hoisted(() => ({
  getDesignSchemaJson: vi.fn(),
  getSketchJson: vi.fn(),
  getSlices: vi.fn(),
  listDesigns: vi.fn(),
}));
const clientMocks = vi.hoisted(() => ({
  cdnFetch: vi.fn(),
}));

vi.mock("../src/lanhu/designs.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lanhu/designs.js")>(),
  ...lanhuMocks,
}));
vi.mock("../src/lanhu/client.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lanhu/client.js")>(),
  createLanhuFetch: vi.fn(() => clientMocks.cdnFetch),
}));

import { registerDesignTool } from "../src/tools/design.js";

const targetUrl =
  "https://lanhuapp.com/web/#/item/project/stage?" +
  "pid=85333881-493c-4dd2-a052-abf87207f68d&" +
  "image_id=df74aef3-ea34-4392-9252-8dbfc6a541c4&" +
  "tid=47dbf0ad-88e8-4518-bf28-63d33eab440c";

const targetDesign = {
  index: 93,
  id: "df74aef3-ea34-4392-9252-8dbfc6a541c4",
  name: "展期还款弹窗分期",
  width: 187.5,
  height: 538,
  url: "https://assets.lanhuapp.com/design.png",
  hasComment: false,
  updateTime: "2026-07-03T19:39:06.171847Z",
  versionId: "e871153a-6617-4839-956a-ff75b29a85ff",
  sketchId: "4cf38600-f36b-4e2c-b8dd-7d5ae9dce462",
  groupIds: [],
  groupNames: [],
  artboardType: "image",
  source: "projectImages" as const,
  raw: {},
};

const secondDesign = {
  ...targetDesign,
  index: 94,
  id: "85ef2ef4-f6e0-4e7c-8942-b853bb1bef6e",
  name: "Second design",
  versionId: "88267f9e-d3bc-4938-a2a9-6c9c1065b25e",
  sketchId: "10faef72-dc21-4658-ab53-76c69a6ca54e",
};

const defaultDesignListResult = {
  status: "success",
  projectName: "561-OrdaCredit(哈萨克语)",
  totalDesigns: 141,
  designs: [targetDesign],
  source: "projectImages",
  params: {
    rawUrl: targetUrl,
    route: "/item/project/stage",
    kind: "design",
    projectId: "85333881-493c-4dd2-a052-abf87207f68d",
    teamId: "47dbf0ad-88e8-4518-bf28-63d33eab440c",
    docId: targetDesign.id,
    imageId: targetDesign.id,
    rawParams: {},
  },
};

const defaultSlicesResult = {
  designId: targetDesign.id,
  designName: targetDesign.name,
  version: "v1",
  canvasSize: { width: 375, height: 1076 },
  canvasSizeSource: "slice_bounds" as const,
  totalSlices: 1,
  slices: [{
    id: "asset",
    name: "Card",
    type: "shape",
    downloadUrl: "https://assets.lanhuapp.com/card.png",
    size: "343x180",
    format: "png",
    position: { x: 16, y: 120 },
    layerPath: "Card",
    metadata: { border_radius: [12, 12, 12, 12] },
  }],
};

const legacySketch: UnknownRecord = {
  psdName: targetDesign.name,
  width: 375,
  height: 1076,
  info: [{
    id: "title",
    type: "text",
    name: "Title",
    left: 20,
    top: 40,
    width: 300,
    height: 48,
    textInfo: {
      text: "Repayment",
      color: { value: "rgba(16,32,48,1)" },
      fontPostScriptName: "Inter-SemiBold",
      fontStyleName: "600",
      size: 20,
      leading: 28,
      tracking: 0.5,
    },
  }, {
    id: "asset",
    type: "shape",
    name: "Card",
    left: 16,
    top: 120,
    width: 343,
    height: 180,
    fills: [{
      fillType: 0,
      isEnabled: true,
      color: { value: "rgba(255,255,255,1)" },
    }],
    radius: [12, 12, 12, 12],
    ddsImage: { imageUrl: "https://assets.lanhuapp.com/card.png" },
  }],
};

interface DesignToolInput {
  url: string;
  mode: "list" | "analyze" | "slices" | "tokens";
  design_names?: string | number | Array<string | number>;
  include?: Array<"html" | "image" | "tokens" | "layout" | "layers" | "slices">;
  compact?: boolean;
  layer_depth: number | "all";
}

type DesignToolHandler = (input: DesignToolInput) => Promise<ToolExecutionResult>;
let designNamesSchema: {
  safeParse(value: unknown): { success: boolean };
} | undefined;

function captureDesignTool(): DesignToolHandler {
  let handler: DesignToolHandler | undefined;
  const server = {
    registerTool: (
      name: string,
      definition: unknown,
      registeredHandler: DesignToolHandler,
    ): void => {
      if (name === "lanhu_design") {
        handler = registeredHandler;
        designNamesSchema = (definition as {
          inputSchema: { design_names: typeof designNamesSchema };
        }).inputSchema.design_names;
      }
    },
  };
  registerDesignTool(server as unknown as McpServer);
  if (!handler) throw new Error("lanhu_design was not registered");
  return handler;
}

const callDesignTool = captureDesignTool();

function pngBytes(width = 750, height = 2152): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function setAscii(bytes: Uint8Array, offset: number, value: string): void {
  bytes.set(Array.from(value, (character) => character.charCodeAt(0)), offset);
}

function jpegBytes(width = 750, height = 2152): Uint8Array {
  const bytes = new Uint8Array(21);
  const view = new DataView(bytes.buffer);
  bytes.set([0xff, 0xd8, 0xff, 0xc0], 0);
  view.setUint16(4, 17);
  bytes[6] = 8;
  view.setUint16(7, height);
  view.setUint16(9, width);
  return bytes;
}

function webpBytes(width = 750, height = 2152): Uint8Array {
  const bytes = new Uint8Array(30);
  setAscii(bytes, 0, "RIFF");
  setAscii(bytes, 8, "WEBP");
  setAscii(bytes, 12, "VP8X");
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes.set([
    encodedWidth & 0xff,
    (encodedWidth >>> 8) & 0xff,
    (encodedWidth >>> 16) & 0xff,
  ], 24);
  bytes.set([
    encodedHeight & 0xff,
    (encodedHeight >>> 8) & 0xff,
    (encodedHeight >>> 16) & 0xff,
  ], 27);
  return bytes;
}

function avifBytes(width = 750, height = 2152): Uint8Array {
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 24);
  setAscii(bytes, 4, "ftyp");
  setAscii(bytes, 8, "avif");
  setAscii(bytes, 16, "mif1");
  setAscii(bytes, 20, "avif");
  view.setUint32(24, 20);
  setAscii(bytes, 28, "ispe");
  view.setUint32(36, width);
  view.setUint32(40, height);
  return bytes;
}

beforeEach(() => {
  vi.clearAllMocks();
  lanhuMocks.listDesigns.mockResolvedValue(defaultDesignListResult);
  lanhuMocks.getDesignSchemaJson.mockRejectedValue(new Error("DDS 403"));
  lanhuMocks.getSketchJson.mockResolvedValue({
    imageId: targetDesign.id,
    versionId: targetDesign.versionId,
    jsonUrl: "https://assets.lanhuapp.com/sketch.json",
    documentInfo: { name: targetDesign.name },
    sketch: legacySketch,
  });
  lanhuMocks.getSlices.mockResolvedValue(defaultSlicesResult);
  clientMocks.cdnFetch.mockResolvedValue(new Response(pngBytes(), {
    headers: { "Content-Type": "image/png" },
  }));
});

describe("lanhu_design tool", () => {
  it("returns compact list metadata by default", async () => {
    const result = await callDesignTool({ url: targetUrl, mode: "list", layer_depth: 4 });

    expect(result.structuredContent).toMatchObject({
      projectName: "561-OrdaCredit(哈萨克语)",
      totalDesigns: 141,
      compact: true,
      designs: [expect.objectContaining({
        designId: targetDesign.id,
        index: 93,
        name: targetDesign.name,
        width: 187.5,
        height: 538,
        versionId: targetDesign.versionId,
        group: null,
        artboardType: "image",
      })],
    });
    const design = result.structuredContent?.designs?.[0];
    expect(design).not.toHaveProperty("raw");
    expect(design).not.toHaveProperty("url");
    expect(design).not.toHaveProperty("dimensions");
    expect(design).not.toHaveProperty("outputs");
  });

  it("returns detailed list metadata when compact is false", async () => {
    const compactResult = await callDesignTool({
      url: targetUrl,
      mode: "list",
      layer_depth: 4,
    });
    const result = await callDesignTool({
      url: targetUrl,
      mode: "list",
      compact: false,
      layer_depth: 4,
    });

    expect(result.structuredContent).toMatchObject({
      compact: false,
      designs: [expect.objectContaining({
        designId: targetDesign.id,
        id: targetDesign.id,
        url: targetDesign.url,
        dimensions: expect.any(Object),
        outputs: {},
        errors: [],
      })],
    });
    expect(result.structuredContent?.designs?.[0]).not.toHaveProperty("raw");
    expect(JSON.stringify(compactResult.structuredContent).length)
      .toBeLessThan(JSON.stringify(result.structuredContent).length);
  });

  it.each([{
    name: "JPEG pathname with query",
    url: "https://assets.example.test/preview.jpg?token=secret&version=2",
    contentType: "application/octet-stream",
    bytes: jpegBytes(),
    expectedMimeType: "image/jpeg",
  }, {
    name: "WebP response Content-Type with query",
    url: "https://assets.example.test/preview.webp?token=secret&version=2",
    contentType: "image/webp; charset=binary",
    bytes: webpBytes(),
    expectedMimeType: "image/webp",
  }, {
    name: "extensionless PNG magic",
    url: "https://assets.example.test/preview?token=secret&version=2",
    contentType: "text/plain",
    bytes: pngBytes(),
    expectedMimeType: "image/png",
  }, {
    name: "extensionless WebP magic",
    url: "https://assets.example.test/preview?token=secret&version=2",
    contentType: "application/octet-stream",
    bytes: webpBytes(),
    expectedMimeType: "image/webp",
  }, {
    name: "extensionless AVIF magic",
    url: "https://assets.example.test/preview?token=secret&version=2",
    contentType: "application/octet-stream",
    bytes: avifBytes(),
    expectedMimeType: "image/avif",
  }, {
    name: "misleading JPEG pathname with PNG bytes",
    url: "https://assets.example.test/preview.jpg?token=secret",
    contentType: "application/octet-stream",
    bytes: pngBytes(),
    expectedMimeType: "image/png",
  }])("preserves the full image URL and infers MIME for $name", async ({
    url,
    contentType,
    bytes,
    expectedMimeType,
  }) => {
    lanhuMocks.listDesigns.mockResolvedValue({
      ...defaultDesignListResult,
      designs: [{ ...targetDesign, url }],
    });
    clientMocks.cdnFetch.mockResolvedValue(new Response(bytes, {
      headers: { "Content-Type": contentType },
    }));

    const result = await callDesignTool({
      url: targetUrl,
      mode: "analyze",
      include: ["image"],
      layer_depth: 4,
    });

    expect(clientMocks.cdnFetch).toHaveBeenCalledWith(url);
    expect(result.structuredContent).toMatchObject({
      status: "success",
      designs: [{
        dimensions: {
          analysis: { width: 375, height: 1076 },
          scale: { x: 2, y: 2 },
        },
        outputs: { image: {
          status: "success",
          completeness: "complete",
          pixelDimensions: { width: 750, height: 2152 },
          pixelRatio: 2,
        } },
      }],
    });
    expect(result.content.find((item) => item.type === "image")).toMatchObject({
      type: "image",
      mimeType: expectedMimeType,
    });
  });

  it("auto-selects image_id and exposes independent layout and layer outputs", async () => {
    const result = await callDesignTool({
      url: targetUrl,
      mode: "analyze",
      include: ["layout", "layers"],
      layer_depth: "all",
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      status: "success",
      projectName: "561-OrdaCredit(哈萨克语)",
      totalDesigns: 1,
      designs: [expect.objectContaining({
        designId: targetDesign.id,
        name: targetDesign.name,
        status: "success",
        dimensions: {
          list: { width: 187.5, height: 538, source: "projectImages" },
          analysis: { width: 375, height: 1076, source: "sketch" },
          scale: { x: 2, y: 2, source: "inferred_from_dimensions" },
          coordinateSpace: "analysis",
        },
        outputs: {
          layout: expect.objectContaining({
            status: "success",
            source: "sketch",
            warning: "Schema layout unavailable: DDS 403",
          }),
          layers: expect.objectContaining({ status: "success", source: "sketch" }),
        },
        success: true,
        errors: [],
      })],
    });
    const design = result.structuredContent?.designs?.[0];
    expect(design).not.toHaveProperty("layout_summary");
    expect(design).not.toHaveProperty("layer_tree");
    expect(design).not.toHaveProperty("layer_annotations");
    expect(design).not.toHaveProperty("layer_tree_truncated");
    expect(design).not.toHaveProperty("layer_depth");
    expect(design).toMatchObject({
      outputs: {
        layout: { value: expect.stringContaining("[canvas] w:375 h:1076 source:sketch scale:@1x") },
        layers: {
          sourceArtboardDimensions: { width: 375, height: 1076 },
          value: {
            tree: expect.stringContaining("text: Title"),
            annotations: expect.arrayContaining([
              expect.objectContaining({
                name: "Title",
                text: "Repayment",
                css: expect.objectContaining({
                  left: "20px",
                  top: "40px",
                  "font-size": "20px",
                }),
              }),
              expect.objectContaining({ name: "Card" }),
            ]),
            truncated: false,
            maxDepth: "all",
          },
        },
      },
    });
    expect(lanhuMocks.getDesignSchemaJson).toHaveBeenCalledTimes(1);
    expect(lanhuMocks.getSketchJson).toHaveBeenCalledTimes(1);
  });

  it("reports successfully loaded empty layers as an error", async () => {
    lanhuMocks.getSketchJson.mockResolvedValue({
      imageId: targetDesign.id,
      versionId: targetDesign.versionId,
      jsonUrl: "https://assets.lanhuapp.com/empty-sketch.json",
      documentInfo: { name: targetDesign.name },
      sketch: {},
    });

    const result = await callDesignTool({
      url: targetUrl,
      mode: "analyze",
      include: ["layers"],
      layer_depth: 4,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: "error",
      designs: [{
        designId: targetDesign.id,
        name: targetDesign.name,
        status: "error",
        success: false,
        outputs: {
          layers: {
            status: "error",
            completeness: "empty",
            missingFields: [
              "artboard.width",
              "artboard.height",
              "tree",
              "annotations",
            ],
            sourceMissingFields: ["artboard.name", "artboard.width", "artboard.height"],
            normalizedMissingFields: ["artboard.width", "artboard.height"],
            error: "Layer extraction returned no usable tree or annotations.",
          },
        },
        errors: [{
          operation: "layers",
          error: "Layer extraction returned no usable tree or annotations.",
        }],
      }],
    });
  });

  it("extracts legacy design tokens without requiring design_names", async () => {
    lanhuMocks.getDesignSchemaJson.mockResolvedValue({
      schema: {
        type: "lanhutext",
        props: {
          style: {
            fontFamily: "ArialMT",
            fontSize: 15,
            lineHeight: 18,
            boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.12)",
          },
        },
      },
    });
    const result = await callDesignTool({ url: targetUrl, mode: "tokens", layer_depth: 4 });

    expect(result.structuredContent).toMatchObject({
      status: "success",
      projectName: "561-OrdaCredit(哈萨克语)",
      totalDesigns: 1,
      designs: [{
        designId: targetDesign.id,
        name: targetDesign.name,
        status: "success",
        success: true,
        outputs: {
          tokens: {
            status: "success",
            source: "combined",
            value: expect.stringMatching(/Inter-SemiBold \/ 600 \/ 20px[\s\S]*Shadows/),
          },
        },
        errors: [],
      }],
    });
    expect(result.structuredContent?.designs?.[0]).not.toHaveProperty("tokens");

    const analyzeResult = await callDesignTool({
      url: targetUrl,
      mode: "analyze",
      include: ["tokens"],
      layer_depth: 4,
    });
    expect(result.structuredContent).toEqual(analyzeResult.structuredContent);
  });

  it("returns slices through the same structured contract as analyze mode", async () => {
    const result = await callDesignTool({ url: targetUrl, mode: "slices", layer_depth: 4 });

    expect(result.structuredContent).not.toHaveProperty("designId");
    expect(result.structuredContent).not.toHaveProperty("totalSlices");
    expect(result.structuredContent).not.toHaveProperty("slices");
    expect(result.structuredContent).toMatchObject({
      status: "success",
      projectName: "561-OrdaCredit(哈萨克语)",
      totalDesigns: 1,
      designs: [{
        designId: targetDesign.id,
        name: targetDesign.name,
        status: "success",
        success: true,
        dimensions: {
          list: { width: 187.5, height: 538, source: "projectImages" },
          analysis: { width: 375, height: 1076, source: "slices" },
          scale: { x: 2, y: 2, source: "inferred_from_dimensions" },
          coordinateSpace: "analysis",
        },
        outputs: {
          slices: {
            status: "success",
            source: "sketch",
            value: {
              designId: targetDesign.id,
              totalSlices: 1,
              slices: [expect.objectContaining({
                name: "Card",
                downloadUrl: "https://assets.lanhuapp.com/card.png",
                position: { x: 16, y: 120 },
                layerPath: "Card",
                metadata: { border_radius: [12, 12, 12, 12] },
              })],
            },
          },
        },
        errors: [],
      }],
    });
    expect(lanhuMocks.getSlices).toHaveBeenCalledWith(
      expect.anything(),
      targetDesign.id,
      "47dbf0ad-88e8-4518-bf28-63d33eab440c",
      "85333881-493c-4dd2-a052-abf87207f68d",
      true,
    );

    const analyzeResult = await callDesignTool({
      url: targetUrl,
      mode: "analyze",
      include: ["slices"],
      layer_depth: 4,
    });
    expect(result.structuredContent).toEqual(analyzeResult.structuredContent);
  });

  it("returns slices for every selected design", async () => {
    lanhuMocks.listDesigns.mockResolvedValue({
      ...defaultDesignListResult,
      totalDesigns: 2,
      designs: [targetDesign, secondDesign],
    });
    lanhuMocks.getSlices.mockImplementation(async (_client: unknown, designId: string) => ({
      ...defaultSlicesResult,
      designId,
      designName: designId === targetDesign.id ? targetDesign.name : secondDesign.name,
    }));

    const result = await callDesignTool({
      url: targetUrl,
      mode: "slices",
      design_names: "all",
      layer_depth: 4,
    });

    expect(result.structuredContent).toMatchObject({
      status: "success",
      totalDesigns: 2,
      designs: [
        { name: targetDesign.name, outputs: { slices: { status: "success" } } },
        { name: secondDesign.name, outputs: { slices: { status: "success" } } },
      ],
    });
    expect(lanhuMocks.getSlices).toHaveBeenCalledTimes(2);
  });

  it("reports partial_success when slices fail for one selected design", async () => {
    lanhuMocks.listDesigns.mockResolvedValue({
      ...defaultDesignListResult,
      totalDesigns: 2,
      designs: [targetDesign, secondDesign],
    });
    lanhuMocks.getSlices.mockImplementation(async (_client: unknown, designId: string) => {
      if (designId === secondDesign.id) throw new Error("Slice API 500");
      return defaultSlicesResult;
    });

    const result = await callDesignTool({
      url: targetUrl,
      mode: "slices",
      design_names: "all",
      layer_depth: 4,
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      status: "partial_success",
      designs: [
        { name: targetDesign.name, status: "success", errors: [] },
        {
          name: secondDesign.name,
          status: "error",
          success: false,
          outputs: { slices: { status: "error", error: "Slice extraction failed: Slice API 500" } },
          errors: [{ operation: "slices", error: "Slice extraction failed: Slice API 500" }],
        },
      ],
    });
  });

  it("marks the tool result as an error when all slice extractions fail", async () => {
    lanhuMocks.getSlices.mockRejectedValue(new Error("Slice API unavailable"));

    const result = await callDesignTool({ url: targetUrl, mode: "slices", layer_depth: 4 });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: "error",
      totalDesigns: 1,
      designs: [{
        name: targetDesign.name,
        status: "error",
        outputs: {
          slices: { status: "error", error: "Slice extraction failed: Slice API unavailable" },
        },
      }],
    });
  });

  it("returns all duplicate-name matches as ambiguous in every non-list mode", async () => {
    const duplicateName = "二次确认银行卡与身份证号是否一致弹窗";
    const duplicateDesigns = [{
      ...targetDesign,
      index: 12,
      id: "d5845007-2044-43e9-90e8-c4aba17d53fc",
      name: duplicateName,
      versionId: "version-1",
    }, {
      ...targetDesign,
      index: 13,
      id: "c22eb048-834a-43b9-987f-af2eb043be4d",
      name: duplicateName,
      versionId: "version-2",
    }];
    lanhuMocks.listDesigns.mockResolvedValue({
      ...defaultDesignListResult,
      totalDesigns: duplicateDesigns.length,
      designs: duplicateDesigns,
    });

    for (const mode of ["analyze", "tokens", "slices"] as const) {
      const result = await callDesignTool({
        url: targetUrl,
        mode,
        design_names: duplicateName,
        include: ["layers"],
        layer_depth: 4,
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        status: "ambiguous",
        projectName: "561-OrdaCredit(哈萨克语)",
        totalDesigns: 2,
        designs: [
          {
            designId: duplicateDesigns[0].id,
            id: duplicateDesigns[0].id,
            index: 12,
            name: duplicateName,
            version: "version-1",
            status: "ambiguous",
            success: false,
          },
          {
            designId: duplicateDesigns[1].id,
            id: duplicateDesigns[1].id,
            index: 13,
            name: duplicateName,
            version: "version-2",
            status: "ambiguous",
            success: false,
          },
        ],
      });
    }
    expect(lanhuMocks.getSketchJson).not.toHaveBeenCalled();
    expect(lanhuMocks.getSlices).not.toHaveBeenCalled();

    const selected = await callDesignTool({
      url: targetUrl,
      mode: "analyze",
      design_names: duplicateDesigns[1].id,
      include: ["layers"],
      layer_depth: 4,
    });
    expect(selected.structuredContent).toMatchObject({
      status: "success",
      totalDesigns: 1,
      designs: [{ designId: duplicateDesigns[1].id, name: duplicateName }],
    });
  });

  it("accepts both numeric and numeric-string design indexes", async () => {
    expect(designNamesSchema?.safeParse(3).success).toBe(true);
    expect(designNamesSchema?.safeParse("3").success).toBe(true);
    expect(designNamesSchema?.safeParse([]).success).toBe(false);
    expect(designNamesSchema?.safeParse("").success).toBe(false);
    expect(designNamesSchema?.safeParse("   ").success).toBe(false);
    const indexedDesigns = [
      { ...targetDesign, index: 1 },
      { ...secondDesign, index: 2 },
      { ...secondDesign, index: 3, id: "third-design", name: "Third design" },
    ];
    lanhuMocks.listDesigns.mockResolvedValue({
      ...defaultDesignListResult,
      totalDesigns: indexedDesigns.length,
      designs: indexedDesigns,
    });

    for (const selector of [3, "3"] as const) {
      const result = await callDesignTool({
        url: targetUrl,
        mode: "analyze",
        design_names: selector,
        include: ["layers"],
        layer_depth: 4,
      });
      expect(result.structuredContent).toMatchObject({
        status: "success",
        totalDesigns: 1,
        designs: [{ designId: "third-design", name: "Third design" }],
      });
    }
  });

  it("does not let a detail URL image_id override an invalid explicit selector", async () => {
    const invalidId = "00000000-0000-0000-0000-000000000000";
    const result = await callDesignTool({
      url: targetUrl,
      mode: "analyze",
      design_names: invalidId,
      include: ["layers"],
      layer_depth: 4,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: "error",
      error: { code: "DESIGN_NOT_FOUND" },
      designs: [],
      unmatchedSelectors: [invalidId],
    });
    expect(lanhuMocks.getSketchJson).not.toHaveBeenCalled();
  });

  it("returns partial_success and unmatchedSelectors for a partially matched batch", async () => {
    const indexedDesigns = [
      { ...targetDesign, index: 1 },
      { ...secondDesign, index: 3 },
    ];
    lanhuMocks.listDesigns.mockResolvedValue({
      ...defaultDesignListResult,
      totalDesigns: indexedDesigns.length,
      designs: indexedDesigns,
    });
    const invalidId = "00000000-0000-0000-0000-000000000000";

    const result = await callDesignTool({
      url: targetUrl,
      mode: "analyze",
      design_names: [3, invalidId],
      include: ["layers"],
      layer_depth: 4,
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      status: "partial_success",
      totalDesigns: 1,
      unmatchedSelectors: [invalidId],
      designs: [{ designId: secondDesign.id, status: "success" }],
    });
    expect(lanhuMocks.getSketchJson).toHaveBeenCalledTimes(1);
  });

  it("trims all before selecting every design", async () => {
    lanhuMocks.listDesigns.mockResolvedValue({
      ...defaultDesignListResult,
      totalDesigns: 2,
      designs: [targetDesign, secondDesign],
    });

    const result = await callDesignTool({
      url: targetUrl,
      mode: "analyze",
      design_names: " all ",
      include: ["layers"],
      layer_depth: 4,
    });

    expect(result.structuredContent).toMatchObject({
      status: "success",
      totalDesigns: 2,
    });
  });

  it("does not return the full design list for an invalid UUID", async () => {
    const allDesigns = Array.from({ length: 141 }, (_, index) => ({
      ...targetDesign,
      index: index + 1,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `Design ${index + 1}`,
    }));
    lanhuMocks.listDesigns.mockResolvedValue({
      ...defaultDesignListResult,
      totalDesigns: allDesigns.length,
      designs: allDesigns,
    });

    const result = await callDesignTool({
      url: "https://lanhuapp.com/web/#/item/project/stage?tid=team&pid=project",
      mode: "analyze",
      design_names: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      include: ["layers"],
      layer_depth: 4,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: "error",
      error: { code: "DESIGN_NOT_FOUND", message: "No matching design found" },
      totalAvailable: 141,
      suggestions: [],
      hint: "Use mode=list to retrieve all designs",
      designs: [],
    });
    expect(result.structuredContent).not.toHaveProperty("availableDesigns");
  });
});
