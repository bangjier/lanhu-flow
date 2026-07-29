import { describe, expect, it, vi } from "vitest";

import type { LanhuDesignSummary, UnknownRecord } from "../src/shared/types.js";
import {
  analyzeDesign,
  deriveDesignDimensions,
  deriveAnalysisStatus,
  extractImageDimensions,
  renderDesignAnalysis,
  resolveDesignDimensions,
  toStructuredDesignAnalysis,
} from "../src/tools/design-analysis.js";
import type {
  DesignAnalysisDependencies,
  DesignOutputs,
  IncludeOption,
} from "../src/tools/design-analysis.js";
import {
  inferSketchCoordinateScale,
  resolveSketchCanvasDimensions,
} from "../src/shared/sketch-coordinates.js";
import {
  extractSketchCanvasDimensions,
  extractSketchCanvasDimensionsResult,
  extractSketchLayoutSummaryResult,
} from "../src/transform/sketch-layout-summary.js";

const stageDesign: LanhuDesignSummary = {
  index: 1,
  id: "design-1",
  name: "Homepage",
  hasComment: false,
  groupIds: [],
  groupNames: [],
  source: "projectImages",
  raw: {},
};

const detailDesign: LanhuDesignSummary = {
  ...stageDesign,
  source: "detailDetach",
};

const schema: UnknownRecord = {
  type: "div",
  props: {
    className: "page",
    style: { width: 375, height: 812 },
  },
  children: [],
};

const sketch: UnknownRecord = {
  device: "iPhone @2x",
  artboard: {
    name: "Homepage",
    frame: { width: 750, height: 1624 },
    layers: [{
      type: "textLayer",
      name: "Title",
      visible: true,
      frame: { x: 32, y: 100, width: 400, height: 48 },
      text: {
        value: "Hello",
        style: {
          color: { value: "#222222" },
          font: { name: "PingFang SC", type: "500", size: 32 },
        },
      },
    }],
  },
};

function setAscii(bytes: Uint8Array, offset: number, value: string): void {
  bytes.set(Array.from(value, (character) => character.charCodeAt(0)), offset);
}

function webpBytes(kind: "VP8 " | "VP8L" | "VP8X", width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  setAscii(bytes, 0, "RIFF");
  setAscii(bytes, 8, "WEBP");
  setAscii(bytes, 12, kind);
  const view = new DataView(bytes.buffer);
  if (kind === "VP8 ") {
    bytes.set([0x9d, 0x01, 0x2a], 23);
    view.setUint16(26, width, true);
    view.setUint16(28, height, true);
  } else if (kind === "VP8L") {
    bytes[20] = 0x2f;
    view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  } else {
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
  }
  return bytes;
}

function avifBytes(width: number, height: number): Uint8Array {
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

function requested(...options: IncludeOption[]): ReadonlySet<IncludeOption> {
  return new Set(options);
}

describe("analyzeDesign", () => {
  it.each([
    { ratio: 1, scale: 1 },
    { ratio: 2, scale: 2 },
    { ratio: 3, scale: 3 },
    { ratio: 0.995, scale: 1 },
    { ratio: 1.005, scale: 1 },
  ])("infers strict Sketch scale $scale from ratio $ratio", ({ ratio, scale }) => {
    expect(inferSketchCoordinateScale({
      artboard: { frame: { width: 100 * ratio, height: 200 * ratio } },
    }, { width: 100, height: 200 })).toEqual({
      scale,
      coordinateSpace: "analysis",
    });
  });

  it.each([0.5, 1.5, 2.5, 1.011])(
    "rejects unsupported Sketch scale ratio %s",
    (ratio) => {
      expect(inferSketchCoordinateScale({
        artboard: { frame: { width: 100 * ratio, height: 200 * ratio } },
      }, { width: 100, height: 200 }, 2)).toMatchObject({
        scale: 2,
        coordinateSpace: "unknown",
        warning: expect.stringContaining("Sketch scale could not be inferred from canvas ratio"),
      });
    },
  );

  it("rejects an unmarked Sketch scale when no reference dimensions exist", () => {
    expect(inferSketchCoordinateScale({
      device: "iPhone",
      artboard: { frame: { width: 750, height: 1624 } },
    }, undefined, 1)).toEqual({
      scale: 1,
      coordinateSpace: "unknown",
      warning: "Sketch scale could not be inferred without reference dimensions or an explicit device scale.",
    });
  });

  it.each([
    { device: "iPhone @1x", width: 750, height: 1624, expectedScale: 1 },
    { device: "iPhone @2x", width: 375, height: 812, expectedScale: 2 },
    { device: "iPhone @3x", width: 750, height: 1624, expectedScale: 3 },
  ])("rejects explicit $device when it conflicts with the reference canvas", ({
    device,
    width,
    height,
    expectedScale,
  }) => {
    expect(inferSketchCoordinateScale({
      device,
      artboard: { frame: { width, height } },
    }, { width: 375, height: 812 }, 1)).toMatchObject({
      scale: expectedScale,
      coordinateSpace: "unknown",
      warning: expect.stringContaining(`Explicit Sketch scale @${expectedScale}x conflicts`),
    });
  });

  it.each([1, 2])("accepts an explicit @%ix scale that matches the reference canvas", (scale) => {
    expect(inferSketchCoordinateScale({
      device: `iPhone @${scale}x`,
      artboard: { frame: { width: 375 * scale, height: 812 * scale } },
    }, { width: 375, height: 812 }, 1)).toEqual({
      scale,
      coordinateSpace: "analysis",
    });
  });

  it.each([1, 2])("keeps an explicit @%ix scale when reference dimensions are unavailable", (scale) => {
    expect(inferSketchCoordinateScale({
      device: `iPhone @${scale}x`,
      artboard: { frame: { width: 375 * scale, height: 812 * scale } },
    }, undefined, 1)).toEqual({
      scale,
      coordinateSpace: "analysis",
    });
  });

  it("rejects an oversized anchored legacy layer even when scale is 1", () => {
    expect(resolveSketchCanvasDimensions({
      device: "iPhone",
      width: 375,
      height: 812,
      info: [{ left: 0, top: 0, width: 750, height: 1624 }],
    }, 1, { width: 375, height: 812 })).toEqual({
      warning: "Legacy Sketch canvas dimensions conflict with normalized layer bounds; coordinate space is unknown.",
    });
  });

  it("accepts matching anchored legacy bounds when scale is 1", () => {
    expect(resolveSketchCanvasDimensions({
      device: "iPhone",
      width: 375,
      height: 812,
      info: [{ left: 0, top: 0, width: 375, height: 812 }],
    }, 1, { width: 375, height: 812 })).toEqual({
      dimensions: { width: 375, height: 812 },
    });
  });

  it.each([
    { width: 120, height: 80 },
    { width: 300, height: 650 },
    { width: 374, height: 800 },
    { width: 378, height: 800 },
  ])("does not treat anchored content $width x $height as a canvas conflict", ({ width, height }) => {
    expect(resolveSketchCanvasDimensions({
      device: "iPhone",
      width: 375,
      height: 812,
      info: [{ left: 0, top: 0, width, height }],
    }, 1, { width: 375, height: 812 })).toEqual({
      dimensions: { width: 375, height: 812 },
    });
  });

  it("rejects a legacy layer when one dimension exceeds the canvas tolerance", () => {
    expect(resolveSketchCanvasDimensions({
      device: "iPhone",
      width: 375,
      height: 812,
      info: [{ left: 0, top: 0, width: 379, height: 800 }],
    }, 1, { width: 375, height: 812 })).toEqual({
      warning: "Legacy Sketch canvas dimensions conflict with normalized layer bounds; coordinate space is unknown.",
    });
  });

  it("propagates an explicit @1x canvas conflict to Sketch-derived outputs", async () => {
    const result = await analyzeDesign(
      { ...detailDesign, width: 187.5, height: 406 },
      requested("html", "layout", "layers", "tokens"),
      "all",
      {
        loadSchema: async () => { throw new Error("Schema should not be loaded"); },
        loadSketch: async () => ({
          device: "iPhone @1x",
          artboard: {
            name: "Conflicting @1x",
            frame: { width: 750, height: 1624 },
            layers: [{
              type: "textLayer",
              name: "Title",
              frame: { x: 16, y: 50, width: 120, height: 24 },
              text: {
                value: "Hello",
                style: { font: { name: "Inter", size: 16 } },
              },
            }],
          },
        }),
      },
    );

    expect(result.status).toBe("partial_success");
    expect(result.dimensions).toMatchObject({
      analysis: null,
      scale: null,
      coordinateSpace: "unknown",
      warning: expect.stringContaining("Explicit Sketch scale @1x conflicts"),
    });
    for (const operation of ["html", "layout", "layers", "tokens"] as const) {
      expect(result.outputs[operation]).toMatchObject({
        status: "partial_success",
        completeness: "partial",
        warning: expect.stringContaining("Explicit Sketch scale @1x conflicts"),
      });
    }
  });

  it("exposes list and Schema dimensions with an inferred uniform scale", async () => {
    const result = await analyzeDesign({
      ...stageDesign,
      width: 187.5,
      height: 856,
    }, requested("layout"), 4, {
      loadSchema: async () => ({
        type: "lanhupage",
        props: {
          className: "page",
          style: { width: 375, height: 1712 },
        },
      }),
      loadSketch: async () => sketch,
    });

    expect(result.dimensions).toEqual({
      list: { width: 187.5, height: 856, source: "projectImages" },
      analysis: { width: 375, height: 1712, source: "schema" },
      scale: { x: 2, y: 2, source: "inferred_from_dimensions" },
      coordinateSpace: "analysis",
    });
    expect(toStructuredDesignAnalysis(result).dimensions).toEqual(result.dimensions);
  });

  it("does not infer a uniform scale when width and height ratios differ", () => {
    expect(deriveDesignDimensions({
      ...stageDesign,
      width: 187.5,
      height: 800,
    }, {
      width: 375,
      height: 1712,
      source: "schema",
    })).toEqual({
      list: { width: 187.5, height: 800, source: "projectImages" },
      analysis: { width: 375, height: 1712, source: "schema" },
      scale: null,
      coordinateSpace: "analysis",
      warning: "Width and height scale ratios differ; no uniform scale was inferred.",
    });
  });

  it("prefers layers_root when dimension sources conflict", () => {
    expect(resolveDesignDimensions({
      ...stageDesign,
      width: 100,
      height: 50,
    }, {
      schema: { width: 100, height: 50 },
      sketch: { width: 150, height: 75 },
      layers: { width: 200, height: 100 },
      normalizedImage: { width: 300, height: 150 },
      slices: {
        designId: stageDesign.id,
        designName: stageDesign.name,
        canvasSize: { width: 250, height: 125 },
        canvasSizeSource: "sketch",
        totalSlices: 1,
        slices: [],
      },
    })).toMatchObject({
      analysis: { width: 200, height: 100, source: "layers_root" },
      scale: { x: 2, y: 2 },
      coordinateSpace: "analysis",
    });
  });

  it.each(["html", "layout"] as const)(
    "falls back to the trusted 10x10 Sketch canvas for conflicting Schema %s",
    async (operation) => {
      const conflictDesign = {
        ...stageDesign,
        id: "1209a6c3-9272-4049-b368-5421f976c567",
        name: "20",
        width: 5,
        height: 5,
      };
      const conflictSchema: UnknownRecord = {
        type: "div",
        props: { className: "page", style: { width: 20, height: 20 } },
        children: [],
      };
      const conflictSketch: UnknownRecord = {
        device: "iPhone @2x",
        artboard: {
          name: conflictDesign.name,
          frame: { width: 20, height: 20 },
          layers: [{
            type: "shapeLayer",
            name: "Canvas",
            frame: { x: 0, y: 0, width: 20, height: 20 },
          }],
        },
      };

      const result = await analyzeDesign(conflictDesign, requested(operation), "all", {
        loadSchema: async () => conflictSchema,
        loadSketch: async () => conflictSketch,
      });

      expect(result.dimensions).toMatchObject({
        analysis: { width: 10, height: 10, source: "sketch" },
        scale: { x: 2, y: 2 },
        coordinateSpace: "analysis",
        warning: expect.stringContaining(
          "Schema canvas 20x20 conflicts with trusted analysis canvas 10x10",
        ),
      });
      expect(result.outputs[operation]).toMatchObject({
        status: "success",
        source: "sketch",
        completeness: "complete",
        warning: expect.stringContaining(
          "Schema canvas 20x20 conflicts with trusted analysis canvas 10x10",
        ),
      });
      if (operation === "html") {
        expect(result.outputs.html?.status !== "error" && result.outputs.html?.value.code)
          .toContain("width:10px;height:10px");
        expect(result.outputs.html?.status !== "error" && result.outputs.html?.value.code)
          .not.toContain("width:20px;height:20px");
      } else {
        expect(result.outputs.layout?.status !== "error" && result.outputs.layout?.value)
          .toContain("[canvas] w:10 h:10");
        expect(result.outputs.layout?.status !== "error" && result.outputs.layout?.value)
          .not.toContain("[div] .page w:20 h:20");
      }
    },
  );

  it("keeps all logical outputs on the trusted canvas when Schema dimensions conflict", async () => {
    const conflictDesign = {
      ...stageDesign,
      id: "1209a6c3-9272-4049-b368-5421f976c567",
      name: "20",
      width: 5,
      height: 5,
    };
    const conflictSchema: UnknownRecord = {
      type: "div",
      props: { className: "page", style: { width: 20, height: 20 } },
      children: [],
    };
    const conflictSketch: UnknownRecord = {
      device: "iPhone @2x",
      artboard: {
        name: conflictDesign.name,
        frame: { width: 20, height: 20 },
        layers: [{
          type: "shapeLayer",
          name: "Canvas",
          frame: { x: 0, y: 0, width: 20, height: 20 },
        }],
      },
    };
    const dependencies: DesignAnalysisDependencies = {
      loadSchema: async () => conflictSchema,
      loadSketch: async () => conflictSketch,
      loadImage: async () => ({
        bytes: 24,
        dimensions: { width: 20, height: 20 },
        content: { type: "image", data: "test", mimeType: "image/png" },
      }),
      loadSlices: async () => ({
        designId: conflictDesign.id,
        designName: conflictDesign.name,
        canvasSize: { width: 10, height: 10 },
        canvasSizeSource: "sketch",
        coordinateSpace: "analysis",
        sourceScale: 2,
        totalSlices: 1,
        slices: [{
          name: "Canvas",
          downloadUrl: "https://assets.example.test/canvas.png",
          size: "10x10",
          format: "png",
          position: { x: 0, y: 0 },
          layerPath: "Canvas",
        }],
      }),
    };

    const combined = await analyzeDesign(
      conflictDesign,
      requested("html", "image", "tokens", "layout", "layers", "slices"),
      "all",
      dependencies,
    );

    expect(combined.status).toBe("partial_success");
    expect(combined.dimensions).toMatchObject({
      analysis: { width: 10, height: 10, source: "layers_root" },
      scale: { x: 2, y: 2 },
      coordinateSpace: "analysis",
      warning: expect.stringContaining(
        "Schema canvas 20x20 conflicts with trusted analysis canvas 10x10",
      ),
    });
    expect(combined.outputs.html).toMatchObject({
      status: "success",
      source: "sketch",
      completeness: "complete",
    });
    expect(combined.outputs.html?.status !== "error" && combined.outputs.html?.value.code)
      .toContain("width:10px;height:10px");
    expect(combined.outputs.html?.status !== "error" && combined.outputs.html?.value.code)
      .not.toContain("width:20px;height:20px");
    expect(combined.outputs.layout).toMatchObject({
      status: "success",
      source: "sketch",
      completeness: "complete",
      value: expect.stringContaining("[canvas] w:10 h:10"),
    });
    expect(combined.outputs.layers).toMatchObject({
      status: "success",
      completeness: "complete",
      value: { tree: expect.stringContaining("Artboard: 20 (10x10)") },
    });
    expect(combined.outputs.slices).toMatchObject({
      status: "success",
      completeness: "complete",
      value: {
        canvasSize: { width: 10, height: 10 },
        slices: [{ size: "10x10", position: { x: 0, y: 0 } }],
      },
    });
    expect(combined.outputs.image).toMatchObject({
      status: "success",
      completeness: "complete",
      pixelDimensions: { width: 20, height: 20 },
      pixelRatio: 2,
      coordinateSpace: "image_pixels",
    });
    expect(combined.outputs.tokens).toMatchObject({
      status: "error",
      completeness: "empty",
      error: expect.stringContaining("no design tokens found"),
    });

    const tokensOnly = await analyzeDesign(
      conflictDesign,
      requested("tokens"),
      "all",
      dependencies,
    );
    expect(tokensOnly.outputs.tokens).toMatchObject({
      status: "error",
      completeness: "empty",
      error: expect.stringContaining("no design tokens found"),
    });
    expect(tokensOnly.dimensions).toMatchObject({
      analysis: { width: 10, height: 10, source: "sketch" },
      scale: { x: 2, y: 2 },
      coordinateSpace: "analysis",
    });
  });

  it("keeps matching 20x20 Schema and Sketch canvases complete", async () => {
    const matchingDesign = {
      ...stageDesign,
      id: "matching-20",
      name: "20",
      width: 10,
      height: 10,
    };
    const matchingSchema: UnknownRecord = {
      type: "div",
      props: { className: "page", style: { width: 20, height: 20 } },
      children: [],
    };
    const matchingSketch: UnknownRecord = {
      device: "iPhone @1x",
      artboard: {
        name: matchingDesign.name,
        frame: { width: 20, height: 20 },
        layers: [{
          type: "shapeLayer",
          name: "Canvas",
          frame: { x: 0, y: 0, width: 20, height: 20 },
        }],
      },
    };

    const result = await analyzeDesign(
      matchingDesign,
      requested("html", "layout", "layers"),
      "all",
      {
        loadSchema: async () => matchingSchema,
        loadSketch: async () => matchingSketch,
      },
    );

    expect(result.status).toBe("success");
    expect(result.dimensions).toMatchObject({
      analysis: { width: 20, height: 20, source: "layers_root" },
      scale: { x: 2, y: 2 },
      coordinateSpace: "analysis",
    });
    expect(result.dimensions.warning).toBeUndefined();
    expect(result.outputs.html).toMatchObject({
      status: "success",
      source: "schema",
      completeness: "complete",
    });
    expect(result.outputs.layout).toMatchObject({
      status: "success",
      source: "schema",
      completeness: "complete",
    });
    expect(result.outputs.layers).toMatchObject({
      status: "success",
      source: "sketch",
      completeness: "complete",
    });
  });

  it.each([1, 2, 3])("normalizes @%ix artboard dimensions", (scale) => {
    const scaledSketch: UnknownRecord = {
      device: `iPhone @${scale}x`,
      artboard: {
        frame: { width: 375 * scale, height: 812 * scale },
        layers: [],
      },
    };

    expect(extractSketchCanvasDimensions(scaledSketch, scale)).toEqual({
      width: 375,
      height: 812,
    });
    expect(extractSketchLayoutSummaryResult(scaledSketch, scale)).toMatchObject({
      canvasSize: { width: 375, height: 812 },
      value: expect.stringContaining("[canvas] w:375 h:812"),
    });
  });

  it("uses normalized layer bounds for legacy info without an explicit canvas", () => {
    const legacyBoundsSketch: UnknownRecord = {
      device: "iPhone @2x",
      info: [{
        type: "shape",
        name: "Canvas",
        visible: true,
        left: 0,
        top: 0,
        width: 750,
        height: 1624,
      }],
    };

    expect(extractSketchCanvasDimensions(legacyBoundsSketch, 2)).toEqual({
      width: 375,
      height: 812,
    });
  });

  it("does not treat a local origin inside an offset legacy parent as the canvas", () => {
    expect(extractSketchCanvasDimensions({
      device: "iPhone @2x",
      info: [{
        left: 20,
        top: 40,
        width: 200,
        height: 100,
        layers: [{ left: 0, top: 0, width: 750, height: 1624 }],
      }],
    }, 2)).toBeUndefined();
  });

  it.each([1, 2, 3])("normalizes raw legacy canvas dimensions at @%ix", (scale) => {
    const result = extractSketchCanvasDimensionsResult({
      device: `iPhone @${scale}x`,
      width: 375 * scale,
      height: 812 * scale,
      info: [{ left: 0, top: 0, width: 375 * scale, height: 812 * scale }],
    }, scale);

    expect(result).toEqual({ dimensions: { width: 375, height: 812 } });
  });

  it.each([1, 2, 3])("keeps logical legacy canvas dimensions at @%ix", (scale) => {
    const result = extractSketchCanvasDimensionsResult({
      device: `iPhone @${scale}x`,
      width: 375,
      height: 812,
      info: [{ left: 0, top: 0, width: 375 * scale, height: 812 * scale }],
    }, scale);

    expect(result).toEqual({ dimensions: { width: 375, height: 812 } });
  });

  it("keeps raw legacy explicit dimensions aligned when content does not cover the canvas", async () => {
    const scaledDesign = {
      ...detailDesign,
      width: 187.5,
      height: 406,
    };
    const legacySketch: UnknownRecord = {
      device: "iPhone @2x",
      psdName: scaledDesign.name,
      width: 750,
      height: 1624,
      info: [{
        type: "text",
        name: "Title",
        left: 32,
        top: 100,
        width: 240,
        height: 48,
        textInfo: {
          text: "Hello",
          color: { value: "#222222" },
          size: 32,
        },
      }],
    };

    const result = await analyzeDesign(
      scaledDesign,
      requested("html", "layout", "layers", "tokens"),
      "all",
      {
        loadSchema: async () => schema,
        loadSketch: async () => legacySketch,
      },
    );

    expect(result.dimensions).toMatchObject({
      analysis: { width: 375, height: 812, source: "sketch" },
      scale: { x: 2, y: 2 },
    });
    expect(result.outputs.html?.status !== "error" && result.outputs.html?.value.code)
      .toContain("width:375px;height:812px");
    expect(result.outputs.layout?.status !== "error" && result.outputs.layout?.value)
      .toContain("[canvas] w:375 h:812");
    expect(result.outputs.layers?.status !== "error" && result.outputs.layers?.value.tree)
      .toContain("Artboard: Homepage (375x812)");
    expect(result.outputs.layers?.status !== "error" && result.outputs.layers?.value.tree)
      .toContain("text: Title (120x24 @16,50)");
  });

  it("reports unknown coordinates when legacy explicit dimensions conflict with layer bounds", () => {
    expect(extractSketchCanvasDimensionsResult({
      device: "iPhone @2x",
      width: 500,
      height: 900,
      info: [{ left: 0, top: 0, width: 750, height: 1624 }],
    }, 2)).toEqual({
      warning: "Legacy Sketch canvas dimensions conflict with normalized layer bounds; coordinate space is unknown.",
    });
  });

  it("recovers a conflicting legacy canvas from a reference-matching root layer", async () => {
    const result = await analyzeDesign({
      ...detailDesign,
      width: 187.5,
      height: 406,
    }, requested("tokens"), 4, {
      loadSchema: async () => schema,
      loadSketch: async () => ({
        device: "iPhone @2x",
        width: 500,
        height: 900,
        info: [{
          type: "shape",
          name: "Canvas",
          left: 0,
          top: 0,
          width: 750,
          height: 1624,
          fill: { color: { value: "#ffffff" } },
        }],
      }),
    });

    expect(result.dimensions).toEqual({
      list: { width: 187.5, height: 406, source: "detailDetach" },
      analysis: { width: 375, height: 812, source: "sketch" },
      scale: { x: 2, y: 2, source: "inferred_from_dimensions" },
      coordinateSpace: "analysis",
    });
    expect(result.outputs.tokens).toMatchObject({
      status: "success",
      completeness: "complete",
    });
  });

  it("keeps recovered legacy canvas semantics identical for single and combined outputs", async () => {
    const recoveredDesign = {
      ...detailDesign,
      id: "legacy-recovered",
      name: "Legacy recovered",
      width: 187.5,
      height: 406,
    };
    const recoveredSketch: UnknownRecord = {
      device: "iPhone @2x",
      psdName: recoveredDesign.name,
      width: 500,
      height: 900,
      info: [{
        type: "text",
        name: "Canvas",
        left: 0,
        top: 0,
        width: 750,
        height: 1624,
        textInfo: {
          text: "Hello",
          size: 32,
          color: { value: "#222222" },
        },
      }],
    };
    const dependencies = (): DesignAnalysisDependencies => ({
      loadSchema: async () => { throw new Error("Schema should not be loaded"); },
      loadSketch: async () => recoveredSketch,
      loadImage: async () => ({
        bytes: 24,
        dimensions: { width: 750, height: 1624 },
        content: { type: "image", data: "test", mimeType: "image/png" },
      }),
      loadSlices: async () => ({
        designId: recoveredDesign.id,
        designName: recoveredDesign.name,
        canvasSize: { width: 375, height: 812 },
        canvasSizeSource: "sketch",
        coordinateSpace: "analysis",
        sourceScale: 2,
        totalSlices: 1,
        slices: [{
          name: "Canvas",
          downloadUrl: "https://assets.example.test/canvas.png",
          size: "375x812",
          format: "png",
          position: { x: 0, y: 0 },
          layerPath: "Canvas",
        }],
      }),
    });

    const combined = await analyzeDesign(
      recoveredDesign,
      requested("html", "image", "layout", "layers", "tokens", "slices"),
      "all",
      dependencies(),
    );

    expect(combined.status).toBe("success");
    expect(combined.dimensions).toMatchObject({
      analysis: { width: 375, height: 812, source: "layers_root" },
      coordinateSpace: "analysis",
    });
    for (const operation of ["html", "image", "layout", "layers", "tokens", "slices"] as const) {
      expect(combined.outputs[operation]).toMatchObject({
        status: "success",
        completeness: "complete",
      });
      expect(combined.outputs[operation]?.warning ?? "").not.toContain("coordinate space is unknown");
    }
    expect(combined.outputs.html?.status !== "error" && combined.outputs.html?.value.code)
      .toContain("width:375px;height:812px");
    expect(combined.outputs.layout?.status !== "error" && combined.outputs.layout?.value)
      .toContain("[canvas] w:375 h:812");

    for (const operation of ["html", "layout", "layers", "tokens"] as const) {
      const single = await analyzeDesign(
        recoveredDesign,
        requested(operation),
        "all",
        dependencies(),
      );
      expect(single.status).toBe("success");
      expect(single.dimensions).toMatchObject({
        analysis: { width: 375, height: 812 },
        coordinateSpace: "analysis",
      });
      expect(single.outputs[operation]).toMatchObject({
        status: combined.outputs[operation]?.status,
        completeness: combined.outputs[operation]?.completeness,
      });
      expect(single.outputs[operation]?.warning ?? "").not.toContain("coordinate space is unknown");
    }
  });

  it("keeps detailDetach HTML, layout, and tokens in the same @2x logical coordinate space", async () => {
    const scaledDetailDesign = {
      ...detailDesign,
      width: 187.5,
      height: 406,
    };
    const scaledSketch: UnknownRecord = {
      device: "iPhone @2x",
      artboard: {
        name: scaledDetailDesign.name,
        frame: { width: 750, height: 1624 },
        layers: [{
          type: "textLayer",
          name: "Title",
          frame: { x: 32, y: 100, width: 400, height: 48 },
          text: {
            value: "Hello",
            style: {
              color: { value: "rgba(34,34,34,1)" },
              font: { name: "Inter", type: "500", size: 32 },
            },
          },
        }],
      },
    };

    for (const operation of ["html", "layout", "tokens"] as const) {
      const result = await analyzeDesign(scaledDetailDesign, requested(operation), 4, {
        loadSchema: async () => { throw new Error("Schema should not be loaded"); },
        loadSketch: async () => scaledSketch,
      });

      expect(result.status).toBe("success");
      expect(result.dimensions).toMatchObject({
        analysis: { width: 375, height: 812, source: "sketch" },
        scale: { x: 2, y: 2 },
        coordinateSpace: "analysis",
      });
      if (operation === "html") {
        expect(result.outputs.html?.status === "success" && result.outputs.html.value.code)
          .toContain("width:375px;height:812px");
      }
      if (operation === "layout") {
        expect(result.outputs.layout?.status === "success" && result.outputs.layout.value)
          .toContain("[canvas] w:375 h:812");
      }
    }
  });

  it("keeps unmarked logical Sketch coordinates unchanged", async () => {
    const logicalDesign = { ...detailDesign, width: 187.5, height: 406 };
    const logicalSketch: UnknownRecord = {
      device: "iPhone",
      artboard: {
        name: logicalDesign.name,
        frame: { width: 375, height: 812 },
        layers: [{
          type: "groupLayer",
          name: "Root",
          frame: { x: 0, y: 0, width: 375, height: 812 },
          layers: [{
            type: "textLayer",
            name: "Title",
            frame: { x: 16, y: 50, width: 120, height: 24 },
            text: {
              value: "Hello",
              style: {
                color: { value: "#222222" },
                font: { name: "Inter", size: 16, lineHeight: 24 },
              },
            },
          }],
        }],
      },
    };

    const result = await analyzeDesign(
      logicalDesign,
      requested("html", "layout", "layers", "tokens"),
      "all",
      {
        loadSchema: async () => { throw new Error("Schema should not be loaded"); },
        loadSketch: async () => logicalSketch,
      },
    );

    expect(result.status).toBe("success");
    expect(result.dimensions).toMatchObject({
      analysis: { width: 375, height: 812, source: "layers_root" },
      scale: { x: 2, y: 2 },
      coordinateSpace: "analysis",
    });
    expect(result.outputs.html?.status !== "error" && result.outputs.html?.value.code)
      .toContain("font-size:16px");
    expect(result.outputs.layout?.status !== "error" && result.outputs.layout?.value)
      .toContain("[canvas] w:375 h:812");
    expect(result.outputs.layers?.status !== "error" && result.outputs.layers?.value.tree)
      .toContain("textLayer: Title (120x24 @16,50)");
    expect(result.outputs.tokens?.status !== "error" && result.outputs.tokens?.value)
      .toContain("Font Sizes (1 unique):\n  16px x1");
  });

  it("marks unresolvable unmarked Sketch coordinates as partial and unknown", async () => {
    const result = await analyzeDesign(
      { ...detailDesign, width: 187.5, height: 406 },
      requested("layers"),
      "all",
      {
        loadSchema: async () => { throw new Error("Schema should not be loaded"); },
        loadSketch: async () => ({
          device: "iPhone",
          artboard: {
            name: "Uncertain",
            frame: { width: 500, height: 900 },
            layers: [{
              type: "shapeLayer",
              name: "Card",
              frame: { x: 0, y: 0, width: 500, height: 900 },
            }],
          },
        }),
      },
    );

    expect(result.status).toBe("partial_success");
    expect(result.dimensions).toMatchObject({
      analysis: null,
      scale: null,
      coordinateSpace: "unknown",
      warning: "Sketch scale could not be inferred from the available canvas dimensions.",
    });
    expect(result.outputs.layers).toMatchObject({
      status: "partial_success",
      completeness: "partial",
      warning: "Sketch scale could not be inferred from the available canvas dimensions.",
    });
  });

  it("propagates a missing Sketch scale reference to every Sketch-derived output", async () => {
    const unreferencedSketch: UnknownRecord = {
      device: "iPhone",
      artboard: {
        frame: { width: 750, height: 1624 },
        layers: [{
          type: "textLayer",
          name: "Title",
          frame: { x: 32, y: 100, width: 240, height: 48 },
          text: {
            value: "Hello",
            style: { font: { name: "Inter", size: 32 } },
          },
        }],
      },
    };
    const warning = "Sketch scale could not be inferred without reference dimensions or an explicit device scale.";

    const result = await analyzeDesign(
      detailDesign,
      requested("html", "layout", "layers", "tokens", "slices"),
      "all",
      {
        loadSchema: async () => { throw new Error("Schema should not be loaded"); },
        loadSketch: async () => unreferencedSketch,
        loadSlices: async () => ({
          designId: detailDesign.id,
          designName: detailDesign.name,
          canvasSize: { width: 750, height: 1624 },
          canvasSizeSource: "sketch",
          coordinateSpace: "unknown",
          sourceScale: 1,
          warning,
          totalSlices: 1,
          slices: [{
            name: "Title",
            downloadUrl: "https://assets.example.test/title.png",
            size: "240x48",
            format: "png",
            position: { x: 32, y: 100 },
            layerPath: "Title",
          }],
        }),
      },
    );

    expect(result.status).toBe("partial_success");
    expect(result.dimensions).toMatchObject({
      analysis: null,
      scale: null,
      coordinateSpace: "unknown",
      warning,
    });
    for (const operation of ["html", "layout", "layers", "tokens", "slices"] as const) {
      expect(result.outputs[operation]).toMatchObject({
        status: "partial_success",
        completeness: "partial",
        warning: expect.stringContaining(warning),
      });
    }
  });

  it("propagates an explicit scale conflict without downgrading image output", async () => {
    const conflictWarning = "Explicit Sketch scale @2x conflicts with canvas ratio 1 relative to reference dimensions.";
    const conflictSketch: UnknownRecord = {
      device: "iPhone @2x",
      artboard: {
        name: detailDesign.name,
        frame: { width: 375, height: 812 },
        layers: [{
          type: "textLayer",
          name: "Title",
          frame: { x: 16, y: 50, width: 120, height: 24 },
          text: {
            value: "Hello",
            style: {
              color: { value: "#222222" },
              font: { name: "Inter", size: 16 },
            },
          },
        }],
      },
    };

    const result = await analyzeDesign(
      { ...detailDesign, width: 187.5, height: 406 },
      requested("html", "image", "layout", "layers", "tokens", "slices"),
      "all",
      {
        loadSchema: async () => { throw new Error("Schema should not be loaded"); },
        loadSketch: async () => conflictSketch,
        loadImage: async () => ({
          bytes: 24,
          dimensions: { width: 750, height: 1624 },
          content: { type: "image", data: "test", mimeType: "image/png" },
        }),
        loadSlices: async () => ({
          designId: detailDesign.id,
          designName: detailDesign.name,
          canvasSize: { width: 187.5, height: 406 },
          canvasSizeSource: "sketch",
          coordinateSpace: "unknown",
          sourceScale: 2,
          warning: conflictWarning,
          totalSlices: 1,
          slices: [{
            name: "Title",
            downloadUrl: "https://assets.example.test/title.png",
            size: "60x12",
            format: "png",
            position: { x: 8, y: 25 },
            layerPath: "Title",
          }],
        }),
      },
    );

    expect(result.status).toBe("partial_success");
    expect(result.outputs.image).toMatchObject({
      status: "success",
      completeness: "complete",
      pixelDimensions: { width: 750, height: 1624 },
    });
    for (const operation of ["html", "layout", "layers", "tokens", "slices"] as const) {
      expect(result.outputs[operation]).toMatchObject({
        status: "partial_success",
        completeness: "partial",
        warning: expect.stringContaining(conflictWarning),
      });
    }
  });

  it.each([2, 3])("normalizes @%ix Sketch-only token metrics", async (scale) => {
    const result = await analyzeDesign(
      { ...detailDesign, width: 187.5, height: 406 },
      requested("tokens"),
      4,
      {
        loadSchema: async () => { throw new Error("Schema should not be loaded"); },
        loadSketch: async () => ({
          device: `iPhone @${scale}x`,
          artboard: {
            frame: { width: 375 * scale, height: 812 * scale },
            layers: [{
              type: "textLayer",
              text: {
                style: {
                  font: {
                    name: "Inter",
                    size: 16 * scale,
                    lineHeight: 24 * scale,
                  },
                },
              },
            }],
          },
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.dimensions).toMatchObject({
      analysis: { width: 375, height: 812, source: "sketch" },
      scale: { x: 2, y: 2 },
    });
    expect(result.outputs.tokens).toMatchObject({
      status: "success",
      completeness: "complete",
      value: expect.stringContaining("Font Sizes (1 unique):\n  16px x1"),
    });
    expect(result.outputs.tokens?.status !== "error" && result.outputs.tokens?.value)
      .toContain("Line Heights (1 unique):\n  24px x1");
  });

  it.each(["projectImages", "detailDetach"] as const)(
    "normalizes @2x layers-only output for %s",
    async (source) => {
      const scaledDesign = {
        ...stageDesign,
        source,
        width: 187.5,
        height: 406,
      };
      const scaledSketch: UnknownRecord = {
        device: "iPhone @2x",
        artboard: {
          name: scaledDesign.name,
          frame: { width: 750, height: 1624 },
          layers: [{
            type: "groupLayer",
            name: "Root",
            frame: { x: 0, y: 0, width: 750, height: 1624 },
            layers: [{
              type: "textLayer",
              name: "Title",
              frame: { x: 32, y: 100, width: 240, height: 48 },
              text: { value: "Hello" },
            }],
          }],
        },
      };

      const result = await analyzeDesign(scaledDesign, requested("layers"), "all", {
        loadSchema: async () => schema,
        loadSketch: async () => scaledSketch,
      });

      expect(result.dimensions).toMatchObject({
        analysis: { width: 375, height: 812, source: "layers_root" },
        scale: { x: 2, y: 2 },
        coordinateSpace: "analysis",
      });
      expect(result.outputs.layers).toMatchObject({
        status: "success",
        sourceArtboardDimensions: { width: 750, height: 1624 },
        value: {
          tree: expect.stringContaining("groupLayer: Root (375x812 @0,0)"),
          annotations: expect.arrayContaining([expect.objectContaining({
            name: "Title",
            css: expect.objectContaining({
              left: "16px",
              top: "50px",
              width: "120px",
              height: "24px",
            }),
          })]),
        },
      });
    },
  );

  it("keeps all six @2x outputs in one logical coordinate space", async () => {
    const scaledDesign = {
      ...detailDesign,
      width: 187.5,
      height: 406,
    };
    const scaledSketch: UnknownRecord = {
      device: "iPhone @2x",
      artboard: {
        name: scaledDesign.name,
        frame: { width: 750, height: 1624 },
        layers: [{
          type: "groupLayer",
          name: "Root",
          frame: { x: 0, y: 0, width: 750, height: 1624 },
          layers: [{
            type: "textLayer",
            name: "Title",
            frame: { x: 32, y: 100, width: 240, height: 48 },
            text: {
              value: "Hello",
              style: { color: { value: "#222222" }, font: { name: "Inter", size: 32 } },
            },
          }],
        }],
      },
    };
    const slicesResult = {
      designId: scaledDesign.id,
      designName: scaledDesign.name,
      canvasSize: { width: 375, height: 812 },
      canvasSizeSource: "slice_bounds" as const,
      coordinateSpace: "analysis" as const,
      sourceScale: 2,
      totalSlices: 1,
      slices: [{
        name: "Title",
        downloadUrl: "https://assets.example.test/title.png",
        size: "120x24",
        format: "png" as const,
        position: { x: 16, y: 50 },
        layerPath: "Root/Title",
      }],
    };

    const result = await analyzeDesign(
      scaledDesign,
      requested("html", "image", "tokens", "layout", "layers", "slices"),
      "all",
      {
        loadSchema: async () => schema,
        loadSketch: async () => scaledSketch,
        loadImage: async () => ({
          bytes: 24,
          dimensions: { width: 750, height: 1624 },
          content: { type: "image", data: "test", mimeType: "image/png" },
        }),
        loadSlices: async () => slicesResult,
      },
    );

    expect(result.status).toBe("success");
    expect(result.dimensions).toMatchObject({
      analysis: { width: 375, height: 812, source: "layers_root" },
      scale: { x: 2, y: 2 },
    });
    expect(result.outputs.html?.status !== "error" && result.outputs.html?.value.code)
      .toContain("width:375px;height:812px");
    expect(result.outputs.layout?.status !== "error" && result.outputs.layout?.value)
      .toContain("[canvas] w:375 h:812");
    expect(result.outputs.layers?.status !== "error" && result.outputs.layers?.value.tree)
      .toContain("groupLayer: Root (375x812 @0,0)");
    expect(result.outputs.slices).toMatchObject({
      status: "success",
      value: {
        canvasSize: { width: 375, height: 812 },
        slices: [{ size: "120x24", position: { x: 16, y: 50 } }],
      },
    });
  });

  it.each([2, 3])("keeps @%ix slices-only output in logical coordinates", async (sourceScale) => {
    const scaledDesign = {
      ...detailDesign,
      width: 187.5,
      height: 406,
    };
    const result = await analyzeDesign(scaledDesign, requested("slices"), 4, {
      loadSchema: async () => schema,
      loadSketch: async () => sketch,
      loadSlices: async () => ({
        designId: scaledDesign.id,
        designName: scaledDesign.name,
        canvasSize: { width: 375, height: 812 },
        canvasSizeSource: "slice_bounds",
        coordinateSpace: "analysis",
        sourceScale,
        totalSlices: 2,
        slices: [{
          name: "Top",
          downloadUrl: "https://assets.example.test/top.png",
          size: "375x98",
          format: "png",
          position: { x: 0, y: 0 },
          layerPath: "Top",
        }, {
          name: "Bottom",
          downloadUrl: "https://assets.example.test/bottom.png",
          size: "375x98",
          format: "png",
          position: { x: 0, y: 714 },
          layerPath: "Bottom",
        }],
      }),
    });

    expect(result.dimensions).toMatchObject({
      analysis: { width: 375, height: 812, source: "slices" },
      scale: { x: 2, y: 2 },
    });
    expect(result.outputs.slices).toMatchObject({
      status: "success",
      value: {
        coordinateSpace: "analysis",
        sourceScale,
        canvasSize: { width: 375, height: 812 },
      },
    });
  });

  it("uses the complete Sketch canvas for slices with incomplete coverage", async () => {
    const design = { ...detailDesign, width: 187.5, height: 840.5 };
    const result = await analyzeDesign(design, requested("slices"), 4, {
      loadSchema: async () => schema,
      loadSketch: async () => sketch,
      loadSlices: async () => ({
        designId: design.id,
        designName: design.name,
        canvasSize: { width: 375, height: 1681 },
        canvasSizeSource: "sketch",
        coordinateSpace: "analysis",
        sourceScale: 1,
        totalSlices: 1,
        slices: [{
          name: "Slice",
          downloadUrl: "https://assets.example.test/slice.png",
          size: "375x1667",
          format: "png",
          position: { x: 0, y: 0 },
          layerPath: "Slice",
        }],
      }),
    });

    expect(result.status).toBe("success");
    expect(result.dimensions).toMatchObject({
      analysis: { width: 375, height: 1681, source: "slices" },
      scale: { x: 2, y: 2 },
      coordinateSpace: "analysis",
    });
    expect(result.outputs.slices).toMatchObject({
      status: "success",
      completeness: "complete",
    });
  });

  it("downgrades non-uniform slice bounds supplied as analysis coordinates", async () => {
    const design = { ...detailDesign, width: 187.5, height: 840.5 };
    const result = await analyzeDesign(design, requested("slices"), 4, {
      loadSchema: async () => schema,
      loadSketch: async () => sketch,
      loadSlices: async () => ({
        designId: design.id,
        designName: design.name,
        canvasSize: { width: 375, height: 1667 },
        canvasSizeSource: "slice_bounds",
        coordinateSpace: "analysis",
        sourceScale: 1,
        totalSlices: 1,
        slices: [{
          name: "Slice",
          downloadUrl: "https://assets.example.test/slice.png",
          size: "375x1667",
          format: "png",
          position: { x: 0, y: 0 },
          layerPath: "Slice",
        }],
      }),
    });

    expect(result.status).toBe("partial_success");
    expect(result.dimensions).toMatchObject({
      analysis: null,
      scale: null,
      coordinateSpace: "unknown",
    });
    expect(result.outputs.slices).toMatchObject({
      status: "partial_success",
      completeness: "partial",
      warning: "Slice bounds produce a non-uniform list-to-analysis scale; coordinate space is unknown.",
      value: { coordinateSpace: "unknown" },
    });
  });

  it("keeps stage Sketch HTML and layout fallbacks aligned after Schema failure", async () => {
    const fallbackDesign = { ...stageDesign, width: 187.5, height: 406 };
    const fallbackSketch: UnknownRecord = {
      device: "iPhone @2x",
      board: {
        width: 750,
        height: 1624,
        layers: [{
          type: "textLayer",
          name: "Title",
          visible: true,
          left: 32,
          top: 100,
          width: 400,
          height: 48,
          textInfo: { text: "Hello", size: 32, fontPostScriptName: "Inter" },
        }],
      },
    };

    for (const operation of ["html", "layout"] as const) {
      const result = await analyzeDesign(fallbackDesign, requested(operation), 4, {
        loadSchema: async () => { throw new Error("DDS 403"); },
        loadSketch: async () => fallbackSketch,
      });
      expect(result.dimensions).toMatchObject({
        analysis: { width: 375, height: 812, source: "sketch" },
        scale: { x: 2, y: 2 },
      });
      if (operation === "html") {
        expect(result.outputs.html?.status === "success" && result.outputs.html.value.code)
          .toContain("width:375px;height:812px");
      } else {
        expect(result.outputs.layout?.status === "success" && result.outputs.layout.value)
          .toContain("[canvas] w:375 h:812");
      }
    }
  });

  it("reports an unknown coordinate space when no analysis dimensions are available", () => {
    expect(deriveDesignDimensions({
      ...stageDesign,
      width: 187.5,
      height: 856,
    })).toEqual({
      list: { width: 187.5, height: 856, source: "projectImages" },
      analysis: null,
      scale: null,
      coordinateSpace: "unknown",
    });
  });

  it("reads PNG pixel dimensions without an image dependency", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    png.set([0, 0, 1, 119], 16);
    png.set([0, 0, 6, 176], 20);

    expect(extractImageDimensions(png)).toEqual({ width: 375, height: 1712 });
  });

  it.each(["VP8 ", "VP8L", "VP8X"] as const)("reads %s WebP pixel dimensions", (kind) => {
    expect(extractImageDimensions(webpBytes(kind, 750, 1624))).toEqual({
      width: 750,
      height: 1624,
    });
  });

  it("reads AVIF ispe pixel dimensions", () => {
    expect(extractImageDimensions(avifBytes(750, 1624))).toEqual({
      width: 750,
      height: 1624,
    });
  });

  it.each([{
    name: "VP8 WebP",
    bytes: webpBytes("VP8 ", 750, 1624),
    mimeType: "image/webp",
  }, {
    name: "VP8L WebP",
    bytes: webpBytes("VP8L", 750, 1624),
    mimeType: "image/webp",
  }, {
    name: "VP8X WebP",
    bytes: webpBytes("VP8X", 750, 1624),
    mimeType: "image/webp",
  }, {
    name: "AVIF",
    bytes: avifBytes(750, 1624),
    mimeType: "image/avif",
  }])("returns dimensions and pixel ratio for image-only $name", async ({ bytes, mimeType }) => {
    const result = await analyzeDesign({
      ...stageDesign,
      width: 187.5,
      height: 406,
    }, requested("image"), 4, {
      loadSchema: async () => schema,
      loadSketch: async () => sketch,
      loadImage: async () => ({
        bytes: bytes.length,
        dimensions: extractImageDimensions(bytes),
        content: { type: "image", data: "test", mimeType },
      }),
    });

    expect(result.status).toBe("success");
    expect(result.dimensions).toMatchObject({
      analysis: { width: 375, height: 812, source: "normalized" },
      scale: { x: 2, y: 2 },
    });
    expect(result.outputs.image).toMatchObject({
      status: "success",
      completeness: "complete",
      pixelDimensions: { width: 750, height: 1624 },
      pixelRatio: 2,
    });
  });

  it("marks a non-empty image with unknown pixel dimensions as partial", async () => {
    const result = await analyzeDesign(stageDesign, requested("image"), 4, {
      loadSchema: async () => schema,
      loadSketch: async () => sketch,
      loadImage: async () => ({
        bytes: 4,
        content: { type: "image", data: "test", mimeType: "image/png" },
      }),
    });

    expect(result.status).toBe("partial_success");
    expect(result.outputs.image).toMatchObject({
      status: "partial_success",
      completeness: "partial",
      coordinateSpace: "unknown",
      warning: "Image downloaded, but pixel dimensions could not be determined.",
    });
  });

  it("handles layout-only requests without generating HTML or loading Sketch", async () => {
    const loadSchema = vi.fn(async () => schema);
    const loadSketch = vi.fn(async () => sketch);

    const result = await analyzeDesign(stageDesign, requested("layout"), 4, {
      loadSchema,
      loadSketch,
    });

    expect(result.status).toBe("success");
    expect(result.outputs.layout).toMatchObject({ status: "success", source: "schema" });
    expect(result.outputs.layout?.status === "success" && result.outputs.layout.value)
      .toContain("[div] .page w:375 h:812");
    expect(result.outputs.html).toBeUndefined();
    expect(loadSchema).toHaveBeenCalledTimes(1);
    expect(loadSketch).not.toHaveBeenCalled();
  });

  it("returns layers and structured annotations without generating HTML", async () => {
    const result = await analyzeDesign(stageDesign, requested("layers"), "all", {
      loadSchema: async () => schema,
      loadSketch: async () => sketch,
    });

    expect(result.status).toBe("success");
    expect(result.outputs.html).toBeUndefined();
    expect(result.outputs.layers).toMatchObject({
      status: "success",
      completeness: "complete",
      missingFields: [],
    });
    if (result.outputs.layers?.status !== "success") throw new Error("layers were not extracted");
    expect(result.outputs.layers.value.tree).toContain("textLayer: Title");
    expect(result.outputs.layers.value.annotations).toEqual([
      expect.objectContaining({
        name: "Title",
        type: "textLayer",
        text: "Hello",
        css: expect.objectContaining({
          left: "16px",
          top: "50px",
          "font-size": "16px",
        }),
      }),
    ]);
    expect(result.outputs.layers.value.maxDepth).toBe("all");
  });

  it("reports empty layer data as an error with normalized missing fields", async () => {
    const result = await analyzeDesign(stageDesign, requested("layers"), 4, {
      loadSchema: async () => schema,
      loadSketch: async () => ({}),
    });

    expect(result.status).toBe("error");
    expect(result.outputs.layers).toMatchObject({
      status: "error",
      source: "sketch",
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
    });
    expect(toStructuredDesignAnalysis(result).outputs.layers).toMatchObject({
      status: "error",
      completeness: "empty",
    });
    expect(toStructuredDesignAnalysis(result).success).toBe(false);
  });

  it("fills missing source artboard metadata from normalized design data", async () => {
    const result = await analyzeDesign({
      ...stageDesign,
      width: 50,
      height: 25,
    }, requested("layers"), "all", {
      loadSchema: async () => schema,
      loadSketch: async () => ({
        device: "iPhone @1x",
        info: [{
          type: "shape",
          name: "Card",
          left: 0,
          top: 0,
          width: 100,
          height: 50,
        }],
      }),
    });

    expect(result.status).toBe("success");
    expect(result.outputs.layers).toMatchObject({
      status: "success",
      completeness: "complete",
      missingFields: [],
      sourceMissingFields: ["artboard.name", "artboard.width", "artboard.height"],
      normalizedMissingFields: [],
      value: {
        tree: expect.stringMatching(/Artboard: Homepage \(100x50\)[\s\S]*shape: Card/),
        annotations: [expect.objectContaining({ name: "Card" })],
      },
    });
    expect(result.dimensions).toMatchObject({
      analysis: { width: 100, height: 50, source: "layers_root" },
      scale: { x: 2, y: 2 },
      coordinateSpace: "analysis",
    });
  });

  it("marks usable layers with unresolved normalized fields as partial_success", async () => {
    const result = await analyzeDesign({
      ...stageDesign,
      width: 187.5,
      height: 856,
    }, requested("layers"), "all", {
      loadSchema: async () => schema,
      loadSketch: async () => ({
        info: [{
          type: "shape",
          name: "Card",
          left: 10,
          top: 10,
          width: 100,
          height: 50,
        }],
      }),
    });

    expect(result.status).toBe("partial_success");
    expect(result.outputs.layers).toMatchObject({
      status: "partial_success",
      completeness: "partial",
      missingFields: ["artboard.width", "artboard.height"],
      normalizedMissingFields: ["artboard.width", "artboard.height"],
      value: {
        tree: expect.stringContaining("shape: Card"),
        annotations: [expect.objectContaining({ name: "Card" })],
      },
    });
    expect(toStructuredDesignAnalysis(result).success).toBe(false);
    expect(renderDesignAnalysis(result)).toContain("shape: Card");
    expect(result.dimensions).toMatchObject({
      analysis: null,
      scale: null,
      coordinateSpace: "unknown",
    });
  });

  it("uses Sketch layout directly for detailDetach designs", async () => {
    const loadSchema = vi.fn(async () => schema);

    const result = await analyzeDesign(detailDesign, requested("layout"), 4, {
      loadSchema,
      loadSketch: async () => sketch,
    });

    expect(result.outputs.layout).toMatchObject({ status: "success", source: "sketch" });
    expect(result.outputs.layout?.status === "success" && result.outputs.layout.value)
      .toContain("[canvas] w:375 h:812 source:sketch scale:@2x");
    expect(loadSchema).not.toHaveBeenCalled();
  });

  it("falls back to Sketch layout when Schema loading fails", async () => {
    const result = await analyzeDesign(stageDesign, requested("layout"), 4, {
      loadSchema: async () => { throw new Error("DDS 403"); },
      loadSketch: async () => sketch,
    });

    expect(result.status).toBe("success");
    expect(result.outputs.layout).toMatchObject({
      status: "success",
      source: "sketch",
      warning: "Schema layout unavailable: DDS 403",
    });
  });

  it("uses Schema tokens when Sketch token extraction is unavailable", async () => {
    const result = await analyzeDesign(stageDesign, requested("tokens"), 4, {
      loadSchema: async () => ({
        type: "lanhutext",
        props: {
          style: {
            fontFamily: "ArialMT",
            fontSize: 15,
            lineHeight: 18,
            boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.12)",
          },
        },
      }),
      loadSketch: async () => { throw new Error("Sketch 404"); },
    });

    expect(result.status).toBe("success");
    expect(result.outputs.tokens).toMatchObject({
      status: "success",
      source: "schema",
      warning: "Sketch tokens unavailable: Sketch 404",
      value: expect.stringContaining("ArialMT / 15px"),
    });
  });

  it("loads shared Schema and Sketch inputs only once", async () => {
    const loadSchema = vi.fn(async () => schema);
    const loadSketch = vi.fn(async () => sketch);

    const result = await analyzeDesign(
      stageDesign,
      requested("html", "layout", "tokens", "layers"),
      4,
      { loadSchema, loadSketch },
    );

    expect(result.status).toBe("success");
    expect(loadSchema).toHaveBeenCalledTimes(1);
    expect(loadSketch).toHaveBeenCalledTimes(1);
  });

  it("returns independent statuses for every supported analyze output", async () => {
    const result = await analyzeDesign(
      stageDesign,
      requested("html", "image", "layout", "layers", "tokens", "slices"),
      "all",
      {
        loadSchema: async () => schema,
        loadSketch: async () => sketch,
        loadImage: async () => ({
          bytes: 4,
          dimensions: { width: 750, height: 1624 },
          content: { type: "image", data: "dGVzdA==", mimeType: "image/png" },
        }),
        loadSlices: async () => ({
          designId: "design-1",
          designName: "Homepage",
          canvasSize: { width: 750, height: 1624 },
          totalSlices: 0,
          slices: [],
        }),
      },
    );

    expect(result.status).toBe("success");
    expect(Object.fromEntries(
      Object.entries(result.outputs).map(([operation, output]) => [operation, output?.status]),
    )).toEqual({
      image: "success",
      html: "success",
      layout: "success",
      tokens: "success",
      layers: "success",
      slices: "success",
    });
    expect(Object.fromEntries(
      Object.entries(result.outputs).map(([operation, output]) => [operation, output?.completeness]),
    )).toEqual({
      image: "complete",
      html: "complete",
      layout: "complete",
      tokens: "complete",
      layers: "complete",
      slices: "empty",
    });
    expect(result.imageContent).toMatchObject({ type: "image", mimeType: "image/png" });
  });

  it("marks empty HTML, tokens, layout, and image outputs as errors", async () => {
    const dependencies = {
      loadSchema: async () => ({
        type: "lanhupage",
        props: { className: "page", style: {} },
        children: [],
      }),
      loadSketch: async () => ({}),
      loadImage: async () => ({
        bytes: 0,
        content: { type: "image" as const, data: "", mimeType: "image/png" },
      }),
    };

    for (const operation of ["html", "tokens", "layout", "image"] as const) {
      const result = await analyzeDesign(stageDesign, requested(operation), 4, dependencies);
      expect(result.status).toBe("error");
      expect(result.outputs[operation]).toMatchObject({
        status: "error",
        completeness: "empty",
      });
      if (operation === "image") expect(result.imageContent).toBeUndefined();
    }
  });

  it("marks preview-only HTML as partial and preserves trusted dimensions and URL queries", async () => {
    const previewUrl =
      'https://cdn.example.test/design.png?token=secret&version=2&process=");}</style><script>alert(1)</script>';
    const result = await analyzeDesign({
      ...stageDesign,
      width: 100,
      height: 50,
      url: previewUrl,
    }, requested("html"), 4, {
      loadSchema: async () => ({ type: "lanhupage", props: { style: {} }, children: [] }),
      loadSketch: async () => ({}),
      loadImage: async () => ({
        bytes: 8,
        dimensions: { width: 400, height: 200 },
        content: { type: "image", data: "cHJldmlldw==", mimeType: "image/png" },
      }),
    });

    expect(result.status).toBe("partial_success");
    expect(result.dimensions).toMatchObject({
      analysis: { width: 200, height: 100, source: "normalized" },
      scale: { x: 2, y: 2 },
      coordinateSpace: "analysis",
    });
    expect(result.outputs.html).toMatchObject({
      status: "partial_success",
      completeness: "partial",
      warning: expect.stringContaining("Preview-only HTML fallback; no structured layer data"),
    });
    if (!result.outputs.html || result.outputs.html.status === "error") {
      throw new Error("preview HTML was not generated");
    }
    const { code, imageUrlMapping, annotations } = result.outputs.html.value;
    expect(code).toContain("width:200px");
    expect(code).toContain("height:100px");
    expect(code).not.toContain("width:375px");
    expect(code).not.toContain("height:667px");
    expect(code).not.toContain(previewUrl);
    expect(code).not.toContain("<script>");
    expect(code).not.toContain("alert(1)");
    expect(Object.values(imageUrlMapping)).toEqual([new URL(previewUrl).toString()]);
    expect(annotations).toContain("画布尺寸: 200x100");
  });

  it("returns empty HTML when an empty Sketch has no preview URL or trustworthy dimensions", async () => {
    const result = await analyzeDesign(stageDesign, requested("html"), 4, {
      loadSchema: async () => ({}),
      loadSketch: async () => ({}),
    });

    expect(result.status).toBe("error");
    expect(result.dimensions.coordinateSpace).toBe("unknown");
    expect(result.outputs.html).toMatchObject({
      status: "error",
      completeness: "empty",
      error: expect.stringContaining("no trustworthy canvas dimensions"),
    });
  });

  it("rejects preview-only HTML when the preview has no verifiable dimensions", async () => {
    const result = await analyzeDesign({
      ...stageDesign,
      url: "https://cdn.example.test/design.png?token=secret",
    }, requested("html"), 4, {
      loadSchema: async () => ({}),
      loadSketch: async () => ({}),
      loadImage: async () => ({
        bytes: 8,
        content: { type: "image", data: "cHJldmlldw==", mimeType: "image/png" },
      }),
    });

    expect(result.status).toBe("error");
    expect(result.outputs.html).toMatchObject({
      status: "error",
      completeness: "empty",
      error: expect.stringContaining("no trustworthy canvas dimensions"),
    });
  });

  it("keeps zero slices and their trusted Sketch canvas as a legal empty result", async () => {
    const design = { ...stageDesign, width: 1481, height: 107 };
    const result = await analyzeDesign(design, requested("slices"), 4, {
      loadSchema: async () => schema,
      loadSketch: async () => sketch,
      loadSlices: async () => ({
        designId: design.id,
        designName: design.name,
        canvasSize: { width: 2962, height: 214 },
        canvasSizeSource: "sketch",
        coordinateSpace: "analysis",
        totalSlices: 0,
        slices: [],
      }),
    });

    expect(result.status).toBe("success");
    expect(result.outputs.slices).toMatchObject({
      status: "success",
      completeness: "empty",
      value: {
        canvasSize: { width: 2962, height: 214 },
        canvasSizeSource: "sketch",
        totalSlices: 0,
        slices: [],
      },
    });
    expect(result.dimensions).toMatchObject({
      analysis: { width: 2962, height: 214, source: "slices" },
      scale: { x: 2, y: 2 },
      coordinateSpace: "analysis",
    });
  });

  it.each([{
    name: "order list",
    listHeight: 856,
    analysisHeight: 1712,
    pixelHeight: 3424,
  }, {
    name: "repayment dialog",
    listHeight: 538,
    analysisHeight: 1076,
    pixelHeight: 2152,
  }])("normalizes all single outputs for $name", async ({ listHeight, analysisHeight, pixelHeight }) => {
    for (const operation of ["html", "image", "tokens", "layout", "layers", "slices"] as const) {
      const dimensionDesign = {
        ...stageDesign,
        width: 187.5,
        height: listHeight,
      };
      const dimensionSchema: UnknownRecord = {
        type: "div",
        props: { style: { width: 375, height: analysisHeight } },
        children: [],
      };
      const dimensionSketch: UnknownRecord = {
        device: "iPhone @1x",
        artboard: {
          name: dimensionDesign.name,
          frame: { width: 187.5, height: listHeight },
          layers: [{
            type: "groupLayer",
            name: "Wrapper",
            frame: { x: 0, y: 0, width: 187.5, height: listHeight },
            layers: [{
              type: "groupLayer",
              name: "Root",
              frame: { x: 0, y: 0, width: 375, height: analysisHeight },
              layers: [{
                type: "textLayer",
                name: "Title",
                frame: { x: 46, y: 655, width: 132, height: 40 },
                text: {
                  value: "Hello",
                  style: { font: { name: "Inter", size: 16 } },
                },
              }],
            }],
          }],
        },
      };

      const result = await analyzeDesign(dimensionDesign, requested(operation), 4, {
        loadSchema: async () => dimensionSchema,
        loadSketch: async () => dimensionSketch,
        loadImage: async () => ({
          bytes: 4,
          dimensions: { width: 750, height: pixelHeight },
          content: { type: "image", data: "dGVzdA==", mimeType: "image/png" },
        }),
        loadSlices: async () => ({
          designId: dimensionDesign.id,
          designName: dimensionDesign.name,
          canvasSize: { width: 375, height: analysisHeight },
          canvasSizeSource: "slice_bounds",
          totalSlices: 1,
          slices: [{
            name: "Canvas",
            downloadUrl: "https://assets.lanhuapp.com/canvas.png",
            size: `375x${analysisHeight}`,
            format: "png",
            position: { x: 0, y: 0 },
            layerPath: "Canvas",
          }],
        }),
      });

      expect(result.dimensions).toMatchObject({
        list: { width: 187.5, height: listHeight },
        analysis: { width: 375, height: analysisHeight },
        scale: { x: 2, y: 2, source: "inferred_from_dimensions" },
        coordinateSpace: "analysis",
      });

      if (operation === "image") {
        expect(result.dimensions.analysis?.source).toBe("normalized");
        expect(result.outputs.image).toMatchObject({
          status: "success",
          pixelDimensions: { width: 750, height: pixelHeight },
          pixelRatio: 2,
          coordinateSpace: "image_pixels",
          value: { bytes: 4 },
        });
      }

      if (operation === "layers") {
        expect(result.dimensions.analysis?.source).toBe("layers_root");
        expect(result.outputs.layers).toMatchObject({
          status: "success",
          completeness: "complete",
          normalizedMissingFields: [],
          sourceArtboardDimensions: { width: 187.5, height: listHeight },
          value: {
            tree: expect.stringContaining(
              `Artboard: ${dimensionDesign.name} (375x${analysisHeight})`,
            ),
            annotations: expect.arrayContaining([
              expect.objectContaining({
                name: "Title",
                css: expect.objectContaining({
                  left: "46px",
                  top: "655px",
                  width: "132px",
                  height: "40px",
                }),
              }),
            ]),
          },
        });
        if (result.outputs.layers?.status === "error") throw new Error("layers were not extracted");
        expect(result.outputs.layers?.value.tree).toContain(
          `groupLayer: Root (375x${analysisHeight} @0,0)`,
        );
      }
    }
  });

  it("extracts non-empty layer data from legacy info-format Sketch JSON", async () => {
    const legacySketch: UnknownRecord = {
      device: "iPhone @2x",
      psdName: "Legacy design",
      width: 750,
      height: 1334,
      info: [{
        type: "text",
        name: "Title",
        left: 20,
        top: 40,
        width: 200,
        height: 48,
        textInfo: {
          text: "Hello",
          color: { value: "rgba(16,32,48,1)" },
          size: 20,
          fontPostScriptName: "Inter-SemiBold",
          leading: 28,
          tracking: 0.5,
        },
      }],
    };

    const result = await analyzeDesign(stageDesign, requested("layers", "tokens"), "all", {
      loadSchema: async () => schema,
      loadSketch: async () => legacySketch,
    });

    expect(result.status).toBe("success");
    expect(result.outputs.layers?.status).toBe("success");
    if (result.outputs.layers?.status !== "success") throw new Error("layers were not extracted");
    expect(result.outputs.layers.value.tree).toContain("text: Title");
    expect(result.outputs.layers.value.annotations).toEqual([
      expect.objectContaining({
        name: "Title",
        type: "text",
        text: "Hello",
        css: expect.objectContaining({
          left: "10px",
          top: "20px",
          width: "100px",
          height: "24px",
          "font-size": "10px",
          "line-height": "14px",
          "letter-spacing": "0.5px",
        }),
      }),
    ]);
    expect(result.outputs.tokens?.status === "success" && result.outputs.tokens.value)
      .toContain("Inter-SemiBold / 10px");
  });

  it("returns concrete operation errors when every requested output fails", async () => {
    const result = await analyzeDesign(stageDesign, requested("layout", "layers"), 4, {
      loadSchema: async () => { throw new Error("DDS 403"); },
      loadSketch: async () => { throw new Error("Sketch 404"); },
    });

    expect(result.status).toBe("error");
    expect(result.outputs.layout).toMatchObject({
      status: "error",
      error: expect.stringContaining("DDS 403"),
    });
    expect(result.outputs.layers).toEqual({
      status: "error",
      error: "Layer extraction failed: Sketch 404",
    });
    expect(renderDesignAnalysis(result)).not.toContain("Unknown");
  });
});

describe("analysis status and rendering", () => {
  it("reports partial success and preserves operation-specific HTML errors", () => {
    const outputs: DesignOutputs = {
      html: { status: "error", error: "Schema HTML failed: DDS 403" },
      layers: {
        status: "success",
        source: "sketch",
        value: { tree: "textLayer: Title", annotations: [], truncated: false, maxDepth: 4 },
      },
    };
    const request = requested("html", "layers");

    expect(deriveAnalysisStatus(request, outputs)).toBe("partial_success");
    const text = renderDesignAnalysis({
      designId: "design-1",
      designName: "Homepage",
      status: "partial_success",
      outputs,
      dimensions: deriveDesignDimensions(stageDesign),
    });
    expect(text).toContain("Status: partial_success");
    expect(text).toContain("Schema HTML failed: DDS 403");
    expect(text).toContain("textLayer: Title");
    expect(text).not.toContain("Failed: Unknown");
  });

  it("treats partial output as partial_success", () => {
    const request = requested("layout");
    expect(deriveAnalysisStatus(request, {
      layout: {
        status: "partial_success",
        source: "schema",
        completeness: "partial",
        value: "[div] partial",
      },
    })).toBe("partial_success");
  });
});
