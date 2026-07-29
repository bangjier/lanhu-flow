import { describe, expect, it } from "vitest";
import { extractFullAnnotationsFromSketch } from "../src/transform/sketch-annotations.js";
import { convertSketchToHtml } from "../src/transform/sketch-to-html.js";

const artboardSketch = {
  device: "iPhone 12 @2x",
  artboard: {
    name: "首页",
    frame: { width: 375, height: 812, x: 0, y: 0 },
    layers: [
      {
        type: "textLayer",
        name: "当前地区总采样",
        visible: true,
        opacity: 1,
        frame: { x: 108, y: 53.5, width: 71.5, height: 10 },
        style: {
          fills: [
            { color: { r: 140, g: 140, b: 140, a: 1, value: "rgba(140,140,140,1)" }, isEnabled: true },
          ],
          borders: [],
          shadows: [],
        },
        text: {
          value: "当前地区总采样：14次",
          style: {
            color: { r: 140, g: 140, b: 140, a: 1, value: "rgba(140,140,140,1)" },
            content: "当前地区总采样：14次",
            font: {
              type: "Medium",
              postScriptName: "PingFang SC-Medium",
              name: "PingFang SC",
              size: 14,
              bold: false,
              italic: false,
              align: "left",
              letterSpacing: { value: 0, unit: "pixels" },
              lineHeight: { value: 20, unit: "pixels" },
            },
          },
          styles: [],
        },
      },
      {
        type: "textLayer",
        name: "首页",
        visible: true,
        opacity: 1,
        frame: { x: 23, y: 380, width: 10, height: 7 },
        style: {
          fills: [
            { color: { r: 38, g: 38, b: 38, a: 1, value: "rgba(38,38,38,1)" }, isEnabled: true },
          ],
          borders: [],
          shadows: [],
        },
        text: {
          value: "首页",
          style: {
            color: { r: 38, g: 38, b: 38, a: 1, value: "rgba(38,38,38,1)" },
            content: "首页",
            font: {
              type: "Bold",
              postScriptName: "PingFang SC-Bold",
              name: "PingFang SC",
              size: 10,
              bold: true,
              italic: false,
              align: "left",
              letterSpacing: { value: 0, unit: "pixels" },
              lineHeight: { value: 14, unit: "pixels" },
            },
          },
          styles: [],
        },
      },
    ],
  },
};

export { artboardSketch };

describe("artboard sketch annotations", () => {
  it("extracts font info from text.style.font path", () => {
    const annotations = extractFullAnnotationsFromSketch(artboardSketch, 2.0);
    expect(annotations).toContain("font-family: PingFang SC");
    expect(annotations).toContain("font-size: 7px");
    expect(annotations).toContain("当前地区总采样：14次");
  });

  it("extracts bold font correctly", () => {
    const annotations = extractFullAnnotationsFromSketch(artboardSketch, 2.0);
    expect(annotations).toContain("font-weight: bold");
    expect(annotations).toContain("首页");
  });

  it("includes font in design summary", () => {
    const annotations = extractFullAnnotationsFromSketch(artboardSketch, 2.0);
    expect(annotations).toContain("字体/字号:");
    expect(annotations).toContain("PingFang SC");
  });

  it("extracts text color from text.style.color", () => {
    const annotations = extractFullAnnotationsFromSketch(artboardSketch, 2.0);
    expect(annotations).toContain("rgba(140,140,140,1)");
  });
});

describe("artboard sketch-to-html", () => {
  it("produces HTML from artboard format sketch", () => {
    const result = convertSketchToHtml(artboardSketch, 2.0);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("当前地区总采样：14次");
    expect(result.html).toContain("首页");
  });

  it("extracts font CSS from artboard text layers", () => {
    const result = convertSketchToHtml(artboardSketch, 2.0);
    expect(result.html).toContain("font-size:7px");
    expect(result.html).toContain('font-family:"PingFang SC"');
  });

  it("sets correct board dimensions from artboard.frame", () => {
    const result = convertSketchToHtml(artboardSketch, 2.0);
    expect(result.html).toContain("width:187.5px");
    expect(result.html).toContain("height:406px");
  });

  it("generates layer annotations for artboard layers", () => {
    const result = convertSketchToHtml(artboardSketch, 2.0);
    expect(result.layerAnnotations.length).toBe(2);
    const textAnnot = result.layerAnnotations.find((a) => a.name === "当前地区总采样");
    expect(textAnnot).toBeDefined();
    expect(textAnnot!.text).toBe("当前地区总采样：14次");
    expect(textAnnot!.css["font-size"]).toBe("7px");
  });
});
