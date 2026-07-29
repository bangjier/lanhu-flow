import type { UnknownRecord } from "../shared/types.js";
import {
  resolveSketchCanvasDimensions,
} from "../shared/sketch-coordinates.js";
import type { CanvasDimensions } from "./layout-summary.js";
import { extractLayerAnnotationsFromSketch } from "./sketch-to-html.js";

function finiteDimension(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function extractSketchCanvasDimensions(
  sketch: UnknownRecord,
  designScale = 1,
): CanvasDimensions | undefined {
  return resolveSketchCanvasDimensions(sketch, designScale).dimensions;
}

export function extractSketchCanvasDimensionsResult(
  sketch: UnknownRecord,
  designScale = 1,
  referenceDimensions?: CanvasDimensions,
): { dimensions?: CanvasDimensions; warning?: string } {
  return resolveSketchCanvasDimensions(sketch, designScale, referenceDimensions);
}

export interface SketchLayoutSummaryResult {
  value: string;
  canvasSize?: CanvasDimensions;
  warning?: string;
}

export function extractSketchLayoutSummaryResult(
  sketch: UnknownRecord,
  designScale = 2,
  referenceDimensions?: CanvasDimensions,
): SketchLayoutSummaryResult {
  const scale = designScale || 2;
  const canvasResult = extractSketchCanvasDimensionsResult(sketch, scale, referenceDimensions);
  const referenceWidth = finiteDimension(referenceDimensions?.width);
  const referenceHeight = finiteDimension(referenceDimensions?.height);
  const trustedReference = referenceWidth && referenceHeight
    ? { width: referenceWidth, height: referenceHeight }
    : undefined;
  const recoveredFromReference = Boolean(canvasResult.warning && trustedReference);
  const canvas = canvasResult.dimensions ?? (recoveredFromReference ? trustedReference : undefined);
  const annotations = extractLayerAnnotationsFromSketch(sketch, scale);
  const measuredWidth = annotations.reduce((maximum, annotation) => {
    const left = Number.parseFloat(annotation.css.left ?? "0");
    const width = Number.parseFloat(annotation.css.width ?? "0");
    return Math.max(maximum, left + width);
  }, 0);
  const measuredHeight = annotations.reduce((maximum, annotation) => {
    const top = Number.parseFloat(annotation.css.top ?? "0");
    const height = Number.parseFloat(annotation.css.height ?? "0");
    return Math.max(maximum, top + height);
  }, 0);
  const width = finiteDimension(canvas?.width)
    ?? (canvasResult.warning ? 0 : measuredWidth);
  const height = finiteDimension(canvas?.height)
    ?? (canvasResult.warning ? 0 : measuredHeight);
  const lines = [`[canvas] w:${width} h:${height} source:sketch scale:@${scale}x`];

  for (const annotation of annotations) {
    const { left = "0px", top = "0px", width: layerWidth = "0px", height: layerHeight = "0px" } = annotation.css;
    const text = annotation.text
      ? ` "${annotation.text.length > 24 ? `${annotation.text.slice(0, 24)}...` : annotation.text}"`
      : "";
    lines.push(
      `[${annotation.type || "layer"}]${text} ${annotation.name || "?"} ` +
      `absolute(${left.replace("px", "")},${top.replace("px", "")}) ` +
      `w:${layerWidth.replace("px", "")} h:${layerHeight.replace("px", "")}`,
    );
  }

  return {
    value: lines.join("\n"),
    ...(canvasResult.warning && !recoveredFromReference ? { warning: canvasResult.warning } : {}),
    ...(width > 0 || height > 0
      ? { canvasSize: { width: width || undefined, height: height || undefined } }
      : {}),
  };
}

export function extractSketchLayoutSummary(
  sketch: UnknownRecord,
  designScale = 2,
): string {
  return extractSketchLayoutSummaryResult(sketch, designScale).value;
}
