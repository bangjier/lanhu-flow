import { describe, expect, it } from "vitest";

import { extractFullAnnotationsFromSketch } from "../src/transform/sketch-annotations.js";
import {
  convertSketchToHtml,
  convertSketchToHtmlMinified,
  inferDesignScale,
} from "../src/transform/sketch-to-html.js";

const minimalSketch = {
  device: "iPhone 12 @2x",
  psdName: "test_design.psd",
  board: {
    width: 750,
    height: 1334,
    fill: { color: { red: 255, green: 255, blue: 255 } },
    layers: [
      {
        type: "textLayer",
        name: "title",
        visible: true,
        left: 30,
        top: 100,
        width: 200,
        height: 40,
        textInfo: {
          text: "Hello World",
          color: { red: 51, green: 51, blue: 51 },
          size: 32,
          fontPostScriptName: "PingFangSC-Medium",
          fontStyleName: "Medium 500",
          bold: false,
          italic: false,
          justification: "left",
        },
        blendOptions: {},
        layerEffects: {},
      },
      {
        type: "shapeLayer",
        name: "bg_rect",
        visible: true,
        left: 0,
        top: 0,
        width: 750,
        height: 200,
        fill: { color: { red: 245, green: 245, blue: 245 } },
        blendOptions: {},
        layerEffects: {},
        path: {
          pathComponents: [{ origin: { radii: [20, 20, 0, 0] } }],
        },
      },
      {
        type: "layerSection",
        name: "icon_group",
        visible: true,
        left: 600,
        top: 50,
        width: 48,
        height: 48,
        images: {
          png_xxxhd: "https://cdn.lanhuapp.com/slices/icon.png",
        },
        blendOptions: {},
        layerEffects: {},
      },
      {
        type: "layer",
        name: "bg_image",
        visible: true,
        left: 0,
        top: 200,
        width: 750,
        height: 400,
        blendOptions: { opacity: { value: 80 } },
        layerEffects: {},
      },
      {
        type: "shapeLayer",
        name: "invisible_shape",
        visible: false,
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        fill: {},
        blendOptions: {},
        layerEffects: {},
      },
    ],
  },
};

describe("convertSketchToHtml", () => {
  it("produces valid HTML with correct board dimensions at @2x", () => {
    const result = convertSketchToHtml(minimalSketch, 2.0, "https://cdn.example.com/design.png");

    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("width:375px");
    expect(result.html).toContain("height:667px");
    const designEntry = Object.entries(result.imageUrlMapping)
      .find(([, remoteUrl]) => remoteUrl === "https://cdn.example.com/design.png");
    expect(designEntry?.[0]).toMatch(/^\.\/assets\/designs\/.*\.png$/);
    expect(result.html).toContain(`background:url("${designEntry?.[0]}")`);
    expect(result.html).not.toContain("background:url(https://");
  });

  it("renders text layers with correct CSS properties", () => {
    const result = convertSketchToHtml(minimalSketch, 2.0);

    expect(result.html).toContain("Hello World");
    expect(result.html).toContain("font-size:16px");
    expect(result.html).toContain('font-family:"PingFangSC-Medium"');
    expect(result.html).toContain("font-weight:500");
    expect(result.html).toContain("z-index:10");
  });

  it("extracts slice images into imageUrlMapping", () => {
    const result = convertSketchToHtml(minimalSketch, 2.0);

    expect(Object.keys(result.imageUrlMapping)).toHaveLength(1);
    const sliceEntry = Object.entries(result.imageUrlMapping)[0];
    expect(sliceEntry[0]).toContain("./assets/slices/");
    expect(sliceEntry[1]).toBe("https://cdn.lanhuapp.com/slices/icon.png");
  });

  it("generates layer annotations matching Python structure", () => {
    const result = convertSketchToHtml(minimalSketch, 2.0);

    expect(result.layerAnnotations.length).toBe(4);

    // Python uses reversed() iteration so layers appear bottom-to-top
    const textAnnot = result.layerAnnotations.find((a) => a.name === "title")!;
    expect(textAnnot.type).toBe("textLayer");
    expect(textAnnot.text).toBe("Hello World");
    expect(textAnnot.css.color).toBe("rgb(51,51,51)");
    expect(textAnnot.css["font-size"]).toBe("16px");

    const shapeAnnot = result.layerAnnotations.find((a) => a.name === "bg_rect")!;
    expect(shapeAnnot.css["border-radius"]).toBe("10px 10px 0px 0px");
    expect(shapeAnnot.css["background-color"]).toBe("rgb(245,245,245)");

    const sliceAnnot = result.layerAnnotations.find((a) => a.name === "icon_group")!;
    expect(sliceAnnot.slice_url).toBe("https://cdn.lanhuapp.com/slices/icon.png");
  });

  it("skips invisible layers", () => {
    const result = convertSketchToHtml(minimalSketch, 2.0);
    const names = result.layerAnnotations.map((a) => a.name);
    expect(names).not.toContain("invisible_shape");
  });

  it("applies opacity from blendOptions", () => {
    const result = convertSketchToHtml(minimalSketch, 2.0);
    const imgLayer = result.layerAnnotations.find((a) => a.name === "bg_image");
    expect(imgLayer?.css.opacity).toBe("0.8");
  });

  it("renders slice layers as <img> tags", () => {
    const result = convertSketchToHtml(minimalSketch, 2.0);
    expect(result.html).toMatch(/<img class="el\d+"/);
    expect(result.html).toContain('referrerpolicy="no-referrer"');
    expect(result.html).not.toContain('src="https://');
  });

  it("escapes all special characters in HTML attribute values", () => {
    const result = convertSketchToHtml({
      board: {
        width: 100,
        height: 100,
        layers: [{
          type: "layerSection",
          name: `A&B<C>D"E'F`,
          visible: true,
          left: 0,
          top: 0,
          width: 10,
          height: 10,
          images: { png_xxxhd: "https://cdn.example.com/icon.png" },
        }],
      },
    }, 1);

    expect(result.html).toContain('title="A&amp;B&lt;C&gt;D&quot;E&#39;F"');
  });

  it("rejects injected and non-HTTP resource URLs", () => {
    const result = convertSketchToHtml({
      board: {
        width: 100,
        height: 100,
        layers: [{
          type: "layerSection",
          name: "Injected",
          visible: true,
          left: 0,
          top: 0,
          width: 10,
          height: 10,
          images: { png_xxxhd: 'x" onerror="alert(1)' },
        }],
      },
    }, 1, "javascript:alert(1)");

    expect(result.html).not.toContain("onerror");
    expect(result.html).not.toContain("javascript:");
    expect(result.html).not.toContain("<img");
    expect(result.imageUrlMapping).toEqual({});
  });

  it("keeps hostile HTTPS design URLs out of generated CSS", () => {
    const hostileUrl = 'https://cdn.example.com/design.png?x=");}</style><script>alert(1)</script>';
    const result = convertSketchToHtml({ board: { width: 100, height: 100, layers: [] } }, 1, hostileUrl);

    expect(result.html).not.toContain("alert(1)");
    expect(result.html).not.toContain("</style><script>");
    expect(result.html).not.toContain(hostileUrl);
    expect(Object.values(result.imageUrlMapping)).toEqual([new URL(hostileUrl).toString()]);
    const localPath = Object.keys(result.imageUrlMapping)[0];
    expect(result.html).toContain(`background:url("${localPath}")`);
  });

  it("keeps distinct same-name resources and reuses identical remote URLs", () => {
    const svgUrl = "https://cdn.example.com/assets/icon.svg?version=1";
    const pngUrl = "https://cdn.example.com/assets/icon.png?version=2";
    const result = convertSketchToHtml({
      board: {
        width: 100,
        height: 100,
        layers: [{
          id: "svg-layer",
          type: "layerSection",
          name: "Same name",
          visible: true,
          left: 0,
          top: 0,
          width: 10,
          height: 10,
          images: { svg: svgUrl },
        }, {
          id: "png-layer",
          type: "layerSection",
          name: "Same name",
          visible: true,
          left: 10,
          top: 0,
          width: 10,
          height: 10,
          images: { png_xxxhd: pngUrl },
        }, {
          id: "duplicate-svg-layer",
          type: "layerSection",
          name: "Same name",
          visible: true,
          left: 20,
          top: 0,
          width: 10,
          height: 10,
          images: { svg: svgUrl },
        }],
      },
    }, 1);

    expect(Object.values(result.imageUrlMapping)).toHaveLength(2);
    expect(new Set(Object.values(result.imageUrlMapping))).toEqual(new Set([svgUrl, pngUrl]));
    const svgPath = Object.entries(result.imageUrlMapping)
      .find(([, remoteUrl]) => remoteUrl === svgUrl)?.[0];
    const pngPath = Object.entries(result.imageUrlMapping)
      .find(([, remoteUrl]) => remoteUrl === pngUrl)?.[0];
    expect(svgPath).toMatch(/\.svg$/);
    expect(pngPath).toMatch(/\.png$/);

    const htmlSources = [...result.html.matchAll(/<img[^>]+src="([^"]+)"/g)]
      .map((match) => match[1]);
    expect(htmlSources).toHaveLength(3);
    expect(new Set(htmlSources)).toEqual(new Set(Object.keys(result.imageUrlMapping)));
    expect(htmlSources.filter((source) => source === svgPath)).toHaveLength(2);
    expect(result.html).not.toContain(svgUrl);
    expect(result.html).not.toContain(pngUrl);
  });

  it("applies @3x scale correctly", () => {
    const result = convertSketchToHtml(minimalSketch, 3.0);
    expect(result.html).toContain("width:250px");
    expect(result.html).toContain("height:444.7px");
  });
});

describe("convertSketchToHtmlMinified", () => {
  it("returns minified HTML", () => {
    const result = convertSketchToHtmlMinified(minimalSketch, 2.0);
    expect(result.html).not.toContain("\n");
  });
});

describe("inferDesignScale", () => {
  it("returns 3.0 for @3x device strings", () => {
    expect(inferDesignScale("iPhone 14 Pro Max @3x")).toBe(3.0);
  });

  it("returns 1.0 for @1x device strings", () => {
    expect(inferDesignScale("Web @1x")).toBe(1.0);
  });

  it("defaults to 2.0 for unrecognized strings", () => {
    expect(inferDesignScale("iPhone 12")).toBe(2.0);
    expect(inferDesignScale("")).toBe(2.0);
  });
});

describe("extractFullAnnotationsFromSketch", () => {
  it("produces structured annotation text", () => {
    const annotations = extractFullAnnotationsFromSketch(minimalSketch, 2.0);

    expect(annotations).toContain("设计标注信息");
    expect(annotations).toContain("test_design.psd");
    expect(annotations).toContain("@2x");
    expect(annotations).toContain("375x667");
  });

  it("includes text layer details", () => {
    const annotations = extractFullAnnotationsFromSketch(minimalSketch, 2.0);

    expect(annotations).toContain("📝 文本图层:");
    expect(annotations).toContain('"Hello World"');
    expect(annotations).toContain("font-size: 16px");
    expect(annotations).toContain("font-family: PingFangSC-Medium");
  });

  it("includes shape layer details", () => {
    const annotations = extractFullAnnotationsFromSketch(minimalSketch, 2.0);

    expect(annotations).toContain("🔷 形状图层:");
    expect(annotations).toContain('"bg_rect"');
    expect(annotations).toContain("fill: rgb(245,245,245)");
  });

  it("includes image layer details", () => {
    const annotations = extractFullAnnotationsFromSketch(minimalSketch, 2.0);

    expect(annotations).toContain("🖼️ 图片/位图图层");
    expect(annotations).toContain('"bg_image"');
    expect(annotations).toContain("opacity: 80%");
  });

  it("includes design summary section", () => {
    const annotations = extractFullAnnotationsFromSketch(minimalSketch, 2.0);

    expect(annotations).toContain("🎨 设计汇总:");
    expect(annotations).toContain("使用颜色:");
    expect(annotations).toContain("字体/字号:");
  });

  it("skips invisible layers", () => {
    const annotations = extractFullAnnotationsFromSketch(minimalSketch, 2.0);
    expect(annotations).not.toContain("invisible_shape");
  });
});

describe("sketch with shadows and borders", () => {
  const sketchWithEffects = {
    device: "iPhone @2x",
    board: {
      width: 750,
      height: 1334,
      layers: [
        {
          type: "shapeLayer",
          name: "card",
          visible: true,
          left: 30,
          top: 200,
          width: 690,
          height: 300,
          fill: { color: { red: 255, green: 255, blue: 255 } },
          blendOptions: {},
          layerEffects: {
            dropShadow: {
              enabled: true,
              color: { red: 0, green: 0, blue: 0 },
              opacity: { value: 20 },
              distance: 4,
              blur: 12,
              chokeMatte: 0,
              localLightingAngle: { value: 90 },
            },
            frameFX: {
              enabled: true,
              size: 2,
              color: { red: 200, green: 200, blue: 200 },
            },
          },
          path: {
            pathComponents: [{ origin: { radii: [16, 16, 16, 16] } }],
          },
        },
      ],
    },
  };

  it("extracts shadow CSS", () => {
    const result = convertSketchToHtml(sketchWithEffects, 2.0);
    const annot = result.layerAnnotations[0];
    expect(annot.css["box-shadow"]).toContain("rgba(0,0,0,0.2)");
  });

  it("extracts border CSS", () => {
    const result = convertSketchToHtml(sketchWithEffects, 2.0);
    const annot = result.layerAnnotations[0];
    expect(annot.css.border).toContain("solid");
    expect(annot.css.border).toContain("rgb(200,200,200)");
  });

  it("extracts uniform border-radius", () => {
    const result = convertSketchToHtml(sketchWithEffects, 2.0);
    const annot = result.layerAnnotations[0];
    expect(annot.css["border-radius"]).toBe("8px");
  });

  it("preserves alpha for value-less text, fill, border, and shadow colors", () => {
    const alphaSketch = {
      artboard: {
        frame: { width: 100, height: 100 },
        layers: [{
          type: "textLayer",
          name: "alpha-text",
          frame: { x: 0, y: 0, width: 80, height: 20 },
          text: {
            value: "Alpha",
            style: {
              color: { r: 10, g: 20, b: 30, a: 0.25 },
              font: { name: "Inter", size: 12 },
            },
          },
        }, {
          type: "shapeLayer",
          name: "alpha-shape",
          frame: { x: 0, y: 20, width: 80, height: 40 },
          style: {
            fills: [{ color: { r: 10, g: 20, b: 30, alpha: "25%" } }],
            borders: [{
              thickness: 1,
              opacity: 50,
              color: { r: 40, g: 50, b: 60, a: 0.5 },
            }],
            shadows: [{
              opacity: { value: 50 },
              color: { r: 70, g: 80, b: 90, a: 0.25 },
              offsetX: 1,
              offsetY: 2,
              blurRadius: 3,
            }],
          },
        }],
      },
    };

    const result = convertSketchToHtml(alphaSketch, 1);
    const text = result.layerAnnotations.find((annotation) => annotation.name === "alpha-text");
    const shape = result.layerAnnotations.find((annotation) => annotation.name === "alpha-shape");
    expect(text?.css.color).toBe("rgba(10,20,30,0.25)");
    expect(shape?.css["background-color"]).toBe("rgba(10,20,30,0.25)");
    expect(shape?.css.border).toContain("rgba(40,50,60,0.25)");
    expect(shape?.css["box-shadow"]).toContain("rgba(70,80,90,0.125)");

    const annotations = extractFullAnnotationsFromSketch(alphaSketch, 1, { width: 100, height: 100 });
    expect(annotations).toContain("color: rgba(10,20,30,0.25)");
    expect(annotations).toContain("fill: rgba(10,20,30,0.25)");
    expect(annotations).toContain("border: 1px rgba(40,50,60,0.25)");
    expect(annotations).toContain("rgba(70,80,90,0.125)");
  });

  it("applies layer opacity once while preserving color and effect alpha", () => {
    const result = convertSketchToHtml({
      artboard: {
        frame: { width: 120, height: 120 },
        layers: [{
          type: "textLayer",
          name: "half-text",
          opacity: 50,
          frame: { x: 0, y: 0, width: 100, height: 20 },
          text: {
            value: "Half",
            style: {
              color: { r: 10, g: 20, b: 30, a: 0.5 },
              font: { name: "Inter", size: 12 },
            },
          },
        }, {
          type: "shapeLayer",
          name: "half-shape",
          opacity: 50,
          frame: { x: 0, y: 20, width: 100, height: 30 },
          style: {
            fills: [{ color: { r: 40, g: 50, b: 60, a: 0.5 } }],
            borders: [{
              thickness: 1,
              opacity: 50,
              color: { r: 70, g: 80, b: 90, a: 0.5 },
            }],
            shadows: [{
              opacity: 50,
              color: { r: 100, g: 110, b: 120, a: 0.25 },
              offsetX: 1,
              offsetY: 2,
              blurRadius: 3,
            }],
          },
        }, {
          type: "shapeLayer",
          name: "opaque-color-half-layer",
          opacity: 50,
          frame: { x: 0, y: 50, width: 100, height: 30 },
          style: { fills: [{ color: { r: 130, g: 140, b: 150, a: 1 } }] },
        }, {
          type: "shapeLayer",
          name: "half-color-opaque-layer",
          opacity: 100,
          frame: { x: 0, y: 80, width: 100, height: 30 },
          style: { fills: [{ color: { r: 160, g: 170, b: 180, a: 0.5 } }] },
        }],
      },
    }, 1);

    const byName = new Map(result.layerAnnotations.map((annotation) => [annotation.name, annotation]));
    expect(byName.get("half-text")?.css).toMatchObject({
      opacity: "0.5",
      color: "rgba(10,20,30,0.5)",
    });
    expect(byName.get("half-shape")?.css).toMatchObject({
      opacity: "0.5",
      "background-color": "rgba(40,50,60,0.5)",
      border: expect.stringContaining("rgba(70,80,90,0.25)"),
      "box-shadow": expect.stringContaining("rgba(100,110,120,0.125)"),
    });
    expect(byName.get("opaque-color-half-layer")?.css).toMatchObject({
      opacity: "0.5",
      "background-color": "rgb(130,140,150)",
    });
    expect(byName.get("half-color-opaque-layer")?.css).toMatchObject({
      "background-color": "rgba(160,170,180,0.5)",
    });
    expect(byName.get("half-color-opaque-layer")?.css).not.toHaveProperty("opacity");

    const annotations = extractFullAnnotationsFromSketch(
      {
        artboard: {
          frame: { width: 100, height: 50 },
          layers: [{
            type: "shapeLayer",
            name: "annotated-shape",
            opacity: 50,
            frame: { x: 0, y: 0, width: 100, height: 50 },
            style: { fills: [{ color: { r: 10, g: 20, b: 30, a: 0.5 } }] },
          }],
        },
      },
      1,
      { width: 100, height: 50 },
    );
    expect(annotations).toContain("fill: rgba(10,20,30,0.5); opacity: 50%");
    expect(annotations).not.toContain("rgba(10,20,30,0.25)");
  });
});

describe("edge cases", () => {
  it("handles empty board", () => {
    const result = convertSketchToHtml({ board: { layers: [] } }, 2.0);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.layerAnnotations).toHaveLength(0);
    expect(Object.keys(result.imageUrlMapping)).toHaveLength(0);
  });

  it("handles missing board", () => {
    const result = convertSketchToHtml({}, 2.0);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.layerAnnotations).toHaveLength(0);
    expect(result.canvasSize).toEqual({ width: 0, height: 0 });
    expect(result.html).not.toContain("width:375px");
    expect(result.html).not.toContain("height:667px");
  });

  it("uses trusted fallback dimensions for preview-only HTML", () => {
    const previewUrl = "https://cdn.example.com/design.png?token=secret&version=2&resize=200x100";
    const result = convertSketchToHtml({}, 2.0, previewUrl, { width: 100, height: 50 });

    expect(result.canvasSize).toEqual({ width: 100, height: 50 });
    expect(result.hasStructuredLayers).toBe(false);
    expect(result.html).toContain("width:100px");
    expect(result.html).toContain("height:50px");
    expect(result.html).not.toContain(previewUrl);
    expect(Object.values(result.imageUrlMapping)).toEqual([new URL(previewUrl).toString()]);
  });

  it("handles zero-sized layers by flattening children", () => {
    const sketch = {
      board: {
        width: 750,
        height: 1334,
        layers: [
          {
            type: "layerSection",
            name: "wrapper",
            visible: true,
            width: 0,
            height: 0,
            layers: [
              {
                type: "textLayer",
                name: "nested_text",
                visible: true,
                left: 10,
                top: 10,
                width: 100,
                height: 30,
                textInfo: { text: "Nested", size: 28 },
                blendOptions: {},
                layerEffects: {},
              },
            ],
          },
        ],
      },
    };

    const result = convertSketchToHtml(sketch, 2.0);
    expect(result.layerAnnotations).toHaveLength(1);
    expect(result.layerAnnotations[0].name).toBe("nested_text");
    expect(result.layerAnnotations[0].text).toBe("Nested");
  });

  it("annotations handle missing board gracefully", () => {
    const annotations = extractFullAnnotationsFromSketch({}, 2.0);
    expect(annotations).toContain("设计标注信息");
    expect(annotations).toContain("0x0");
  });
});
