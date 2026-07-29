import { describe, expect, it } from "vitest";
import {
  extractDesignTokens,
  extractLayerTree,
  extractLayerTreeResult,
} from "../src/transform/design-tokens.js";

const artboardSketch = {
  artboard: {
    name: "首页",
    frame: { width: 375, height: 812 },
    layers: [
      {
        type: "textLayer",
        name: "标题",
        visible: true,
        frame: { x: 16, y: 50, width: 200, height: 24 },
        style: {
          fills: [
            { color: { r: 38, g: 38, b: 38, a: 1, value: "rgba(38,38,38,1)" }, isEnabled: true },
          ],
          borders: [],
          shadows: [],
        },
        text: {
          value: "首页标题",
          style: {
            color: { r: 38, g: 38, b: 38, a: 1, value: "rgba(38,38,38,1)" },
            font: {
              postScriptName: "PingFang SC-Medium",
              name: "PingFang SC",
              type: "Medium",
              size: 18,
              bold: false,
              italic: false,
              lineHeight: { value: 24, unit: "pixels" },
              letterSpacing: { value: 0, unit: "pixels" },
            },
          },
        },
      },
      {
        type: "textLayer",
        name: "副标题",
        visible: true,
        frame: { x: 16, y: 80, width: 200, height: 18 },
        style: {
          fills: [
            { color: { r: 140, g: 140, b: 140, a: 1, value: "rgba(140,140,140,1)" }, isEnabled: true },
          ],
          borders: [],
          shadows: [],
        },
        text: {
          value: "副标题文字",
          style: {
            color: { r: 140, g: 140, b: 140, a: 1, value: "rgba(140,140,140,1)" },
            font: {
              postScriptName: "PingFang SC-Regular",
              name: "PingFang SC",
              type: "Regular",
              size: 14,
              bold: false,
              italic: false,
              lineHeight: { value: 18, unit: "pixels" },
              letterSpacing: { value: 0, unit: "pixels" },
            },
          },
        },
      },
      {
        type: "shapeLayer",
        name: "卡片背景",
        visible: true,
        frame: { x: 16, y: 120, width: 343, height: 200 },
        style: {
          fills: [{ color: { r: 255, g: 255, b: 255, a: 1, value: "rgba(255,255,255,1)" }, isEnabled: true }],
          borders: [{ color: { r: 230, g: 230, b: 230, a: 1, value: "rgba(230,230,230,1)" }, isEnabled: true, thickness: 1 }],
          shadows: [{ color: { r: 0, g: 0, b: 0, a: 0.08, value: "rgba(0,0,0,0.08)" }, isEnabled: true, offsetX: 0, offsetY: 2, blurRadius: 8, spread: 0 }],
        },
        radius: [8, 8, 8, 8],
        layers: [],
      },
    ],
  },
};

describe("extractDesignTokens (refactored)", () => {
  it("extracts font tokens from artboard text layers", () => {
    const tokens = extractDesignTokens(artboardSketch);
    expect(tokens).toContain("Fonts");
    expect(tokens).toContain("PingFang SC");
    expect(tokens).toContain("18px");
    expect(tokens).toContain("14px");
  });

  it("extracts font size, line height, and letter spacing tokens", () => {
    const tokens = extractDesignTokens(artboardSketch);
    expect(tokens).toContain("Font Sizes (2 unique):");
    expect(tokens).toContain("Line Heights (2 unique):");
    expect(tokens).toContain("24px x1");
    expect(tokens).toContain("18px x1");
    expect(tokens).toContain("Letter Spacing (1 unique):");
    expect(tokens).toContain("0px x2");
  });

  it("extracts typography, colors, borders, shadows, and radii from DDS Schema styles", () => {
    const tokens = extractDesignTokens(undefined, {
      type: "lanhupage",
      props: {
        style: {
          color: "rgba(51, 51, 51, 1)",
          fontFamily: "ArialMT",
          fontSize: 15,
          lineHeight: 18,
          letterSpacing: -0.3333333432674408,
        },
      },
      children: [{
        type: "lanhublock",
        props: {
          style: {
            backgroundColor: "rgba(255, 255, 255, 1)",
            border: "1px solid rgba(16, 128, 61, 1)",
            borderRadius: 16,
            boxShadow: "0px 1px 4px 0px rgba(0, 62, 0, 0.12)",
          },
        },
      }],
    });

    expect(tokens).toContain("rgba(51,51,51,1)");
    expect(tokens).toContain("ArialMT / 15px");
    expect(tokens).toContain("Font Sizes (1 unique):\n  15px x1");
    expect(tokens).toContain("Line Heights (1 unique):\n  18px x1");
    expect(tokens).toContain("Letter Spacing (1 unique):\n  -0.3333333432674408px x1");
    expect(tokens).toContain("1px solid rgba(16,128,61,1)");
    expect(tokens).toContain("0px 1px 4px 0px rgba(0,62,0,0.12)");
    expect(tokens).toContain("Border Radius (1 unique):\n  16px x1");
  });

  it("extracts all token categories from legacy info-format layers", () => {
    const tokens = extractDesignTokens({
      info: [
        {
          type: "text",
          name: "Title",
          textInfo: {
            text: "Repayment",
            color: { value: "rgba(16,32,48,1)" },
            fontPostScriptName: "Inter-SemiBold",
            fontStyleName: "600",
            size: 20,
            leading: 28,
            tracking: 0.5,
          },
        },
        {
          type: "shape",
          name: "Card",
          fills: [{
            fillType: 1,
            isEnabled: true,
            gradient: {
              from: { x: 0, y: 0 },
              to: { x: 1, y: 0 },
              colorStops: [
                { position: 0, color: { value: "rgba(0,128,96,1)" } },
                { position: 1, color: { value: "rgba(0,64,48,1)" } },
              ],
            },
          }],
          borders: [{
            isEnabled: true,
            thickness: 1,
            position: "内边框",
            color: { value: "rgba(230,230,230,1)" },
          }],
          shadows: [{
            isEnabled: true,
            color: { value: "rgba(0,0,0,0.2)" },
            offsetX: 0,
            offsetY: 4,
            blurRadius: 12,
            spread: 0,
          }],
          radius: [12, 12, 12, 12],
        },
      ],
    });

    expect(tokens).toContain("Colors");
    expect(tokens).toContain("rgba(16,32,48,1)");
    expect(tokens).toContain("Inter-SemiBold / 600 / 20px");
    expect(tokens).toContain("Font Sizes (1 unique):\n  20px x1");
    expect(tokens).toContain("Line Heights (1 unique):\n  28px x1");
    expect(tokens).toContain("Letter Spacing (1 unique):\n  0.5px x1");
    expect(tokens).toContain("Gradients");
    expect(tokens).toContain("Borders");
    expect(tokens).toContain("Shadows");
    expect(tokens).toContain("Border Radius");
  });

  it("extracts color tokens from fills", () => {
    const tokens = extractDesignTokens(artboardSketch);
    expect(tokens).toContain("Colors");
    expect(tokens).toContain("rgba(38,38,38,1)");
    expect(tokens).toContain("rgba(140,140,140,1)");
    expect(tokens).toContain("rgba(255,255,255,1)");
  });

  it("normalizes equivalent RGBA numeric values before counting colors", () => {
    const tokens = extractDesignTokens({
      info: [{
        type: "shape",
        fills: [{
          fillType: 0,
          color: { value: "rgba(16, 32, 48, 1.000000)" },
        }],
      }],
    }, {
      type: "lanhutext",
      props: { style: { color: "RGBA(16,32,48,1)" } },
    });

    expect(tokens).toContain("Colors (1 unique):\n  rgba(16,32,48,1) x2");
    expect(tokens).not.toContain("1.000000");
  });

  it("excludes Sketch and Schema typography with non-positive font sizes", () => {
    const tokens = extractDesignTokens({
      info: [{
        type: "text",
        textInfo: {
          fontPostScriptName: "Hidden-Sketch-Container",
          size: 0,
          leading: 12,
        },
      }, {
        type: "text",
        textInfo: {
          fontPostScriptName: "Visible-Sketch-Text",
          size: 16,
          leading: 20,
        },
      }],
    }, {
      type: "lanhupage",
      props: {
        style: {
          fontFamily: "Hidden-Schema-Container",
          fontSize: "0px",
          lineHeight: "10px",
        },
      },
      children: [{
        type: "lanhutext",
        props: {
          style: {
            fontFamily: "Visible-Schema-Text",
            fontSize: "14px",
            lineHeight: "18px",
          },
        },
      }],
    });

    expect(tokens).toContain("Visible-Sketch-Text / 16px");
    expect(tokens).toContain("Visible-Schema-Text / 14px");
    expect(tokens).toContain("Font Sizes (2 unique):");
    expect(tokens).not.toContain("Hidden-Sketch-Container");
    expect(tokens).not.toContain("Hidden-Schema-Container");
    expect(tokens).not.toContain("  0px");
    expect(tokens).not.toContain("  10px");
    expect(tokens).not.toContain("  12px");
  });

  it("extracts shadow tokens", () => {
    const tokens = extractDesignTokens(artboardSketch);
    expect(tokens).toContain("Shadows");
    expect(tokens).toContain("rgba(0,0,0,0.08)");
  });

  it("extracts border radius tokens", () => {
    const tokens = extractDesignTokens(artboardSketch);
    expect(tokens).toContain("Border Radius");
    expect(tokens).toContain("8px");
  });

  it("extracts border tokens", () => {
    const tokens = extractDesignTokens(artboardSketch);
    expect(tokens).toContain("Borders");
    expect(tokens).toContain("rgba(230,230,230,1)");
  });

  it.each([2, 3])("normalizes @%ix Sketch pixel tokens", (scale) => {
    const tokens = extractDesignTokens({
      artboard: {
        layers: [{
          type: "textLayer",
          text: {
            style: {
              font: {
                name: "Inter",
                size: 16 * scale,
                lineHeight: { value: 24 * scale, unit: "pixels" },
                letterSpacing: { value: 1 * scale, unit: "pixels" },
              },
            },
          },
        }, {
          type: "shapeLayer",
          style: {
            borders: [{
              thickness: 2 * scale,
              color: { value: "rgba(1,2,3,1)" },
            }],
            shadows: [{
              color: { value: "rgba(4,5,6,0.5)" },
              offsetX: 2 * scale,
              offsetY: 3 * scale,
              blurRadius: 4 * scale,
              spread: 1 * scale,
            }],
          },
          radius: [8 * scale, 8 * scale, 8 * scale, 8 * scale],
        }],
      },
    }, undefined, scale);

    expect(tokens).toContain("Inter / 16px");
    expect(tokens).toContain("Font Sizes (1 unique):\n  16px x1");
    expect(tokens).toContain("Line Heights (1 unique):\n  24px x1");
    expect(tokens).toContain("Letter Spacing (1 unique):\n  1px x1");
    expect(tokens).toContain("2px center rgba(1,2,3,1)");
    expect(tokens).toContain("rgba(4,5,6,0.5) 2px 3px 4px 1px");
    expect(tokens).toContain("Border Radius (1 unique):\n  8px x1");
  });

  it("merges normalized Sketch tokens with logical Schema tokens", () => {
    const tokens = extractDesignTokens({
      artboard: {
        layers: [{
          type: "textLayer",
          text: {
            style: {
              font: {
                name: "Inter",
                size: 32,
                lineHeight: 48,
              },
            },
          },
        }],
      },
    }, {
      type: "lanhutext",
      props: {
        style: {
          fontFamily: "Inter",
          fontSize: 16,
          lineHeight: 24,
        },
      },
    }, 2);

    expect(tokens).toContain("Font Sizes (1 unique):\n  16px x2");
    expect(tokens).toContain("Line Heights (1 unique):\n  24px x2");
    expect(tokens).not.toContain("32px");
    expect(tokens).not.toContain("48px");
  });

  it("returns empty string for empty sketch", () => {
    const tokens = extractDesignTokens({});
    expect(tokens).toBe("");
  });

  it("skips tokens whose required color fields are missing", () => {
    const tokens = extractDesignTokens({
      info: [{
        type: "shape",
        fills: [{
          fillType: 1,
          isEnabled: true,
          gradient: {
            from: { x: 0, y: 0 },
            to: { x: 1, y: 0 },
            colorStops: [{ position: 0, color: {} }],
          },
        }],
        borders: [{ isEnabled: true, thickness: 1, color: {} }],
        shadows: [{ isEnabled: true, offsetX: 0, offsetY: 1, blurRadius: 4, color: {} }],
      }],
    });

    expect(tokens).toBe("");
    expect(tokens).not.toContain("unknown");
  });
});

describe("extractLayerTree", () => {
  it("still works with artboard format", () => {
    const tree = extractLayerTree(artboardSketch);
    expect(tree).toContain("Artboard: 首页");
    expect(tree).toContain("textLayer: 标题");
    expect(tree).toContain("textLayer: 副标题");
    expect(tree).toContain("shapeLayer: 卡片背景");
  });

  it("reports truncation and supports the complete tree", () => {
    const nestedLayer = (depth: number): Record<string, unknown> => ({
      type: "groupLayer",
      name: `depth-${depth}`,
      visible: true,
      frame: { x: depth, y: depth, width: 100, height: 100 },
      layers: depth < 6 ? [nestedLayer(depth + 1)] : [],
    });
    const sketch = {
      artboard: {
        name: "Deep tree",
        frame: { width: 375, height: 812 },
        layers: [nestedLayer(0)],
      },
    };

    const limited = extractLayerTreeResult(sketch);
    expect(limited.tree).toContain("depth-4");
    expect(limited.tree).not.toContain("depth-5");
    expect(limited.truncated).toBe(true);
    expect(limited.maxDepth).toBe(4);

    const complete = extractLayerTreeResult(sketch, "all");
    expect(complete.tree).toContain("depth-6");
    expect(complete.truncated).toBe(false);
    expect(complete.maxDepth).toBe("all");
  });

  it("supports board-format Sketch data", () => {
    const result = extractLayerTreeResult({
      psdName: "Legacy board",
      board: {
        width: 750,
        height: 1334,
        layers: [{
          type: "textLayer",
          name: "Title",
          visible: true,
          left: 20,
          top: 40,
          width: 200,
          height: 48,
          textInfo: { text: "Hello" },
        }],
      },
    });

    expect(result.tree).toContain("Artboard: Legacy board (750x1334)");
    expect(result.tree).toContain('textLayer: Title (200x48 @20,40) "Hello"');
  });

  it.each([1, 2, 3])("normalizes layer tree coordinates at @%ix", (scale) => {
    const result = extractLayerTreeResult({
      device: `iPhone @${scale}x`,
      artboard: {
        name: "Scaled board",
        frame: { width: 375 * scale, height: 812 * scale },
        layers: [{
          type: "groupLayer",
          name: "Root",
          frame: { x: 0, y: 0, width: 375 * scale, height: 812 * scale },
          layers: [{
            type: "textLayer",
            name: "Title",
            frame: { x: 16 * scale, y: 50 * scale, width: 120 * scale, height: 24 * scale },
          }],
        }],
      },
    }, "all", {}, scale);

    expect(result.sourceArtboardDimensions).toEqual({
      width: 375 * scale,
      height: 812 * scale,
    });
    expect(result.rootLayerDimensions).toEqual({ width: 375, height: 812 });
    expect(result.tree).toContain("Artboard: Scaled board (375x812)");
    expect(result.tree).toContain("groupLayer: Root (375x812 @0,0)");
    expect(result.tree).toContain("textLayer: Title (120x24 @16,50)");
  });

  it("supports legacy info-format Sketch data", () => {
    const result = extractLayerTreeResult({
      psdName: "Legacy info",
      width: 750,
      height: 1334,
      info: [{
        type: "text",
        name: "Title",
        left: 20,
        top: 40,
        width: 200,
        height: 48,
        textInfo: { text: "Hello" },
      }],
    }, "all");

    expect(result.tree).toContain("Artboard: Legacy info (750x1334)");
    expect(result.tree).toContain("Total layers: 1");
    expect(result.tree).toContain('text: Title (200x48 @20,40) "Hello"');
  });

  it("uses the largest nested layer anchored at the origin as the normalized artboard", () => {
    const result = extractLayerTreeResult({
      artboard: {
        name: "Order list",
        frame: { width: 187.5, height: 856 },
        layers: [{
          type: "groupLayer",
          name: "Wrapper",
          frame: { x: 0, y: 0, width: 187.5, height: 856 },
          layers: [{
            type: "groupLayer",
            name: "Order list root",
            frame: { x: 0, y: 0, width: 375, height: 1712 },
          }],
        }],
      },
    }, "all");

    expect(result.sourceArtboardDimensions).toEqual({ width: 187.5, height: 856 });
    expect(result.rootLayerDimensions).toEqual({ width: 375, height: 1712 });
    expect(result.tree).toContain("Artboard: Order list (375x1712)");
    expect(result.normalizedMissingFields).toEqual([]);
  });

  it("does not treat a local origin inside an offset parent as the artboard root", () => {
    const result = extractLayerTreeResult({
      artboard: {
        name: "Offset content",
        frame: { width: 375, height: 812 },
        layers: [{
          type: "groupLayer",
          name: "Offset wrapper",
          frame: { x: 16, y: 20, width: 343, height: 200 },
          layers: [{
            type: "shapeLayer",
            name: "Local background",
            frame: { x: 0, y: 0, width: 1000, height: 1000 },
          }],
        }],
      },
    });

    expect(result.rootLayerDimensions).toBeUndefined();
    expect(result.tree).toContain("Artboard: Offset content (375x812)");
  });
});
