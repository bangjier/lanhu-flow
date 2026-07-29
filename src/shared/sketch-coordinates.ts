import type { UnknownRecord } from "./types.js";

export interface SketchCanvasDimensions {
  width?: number;
  height?: number;
}

export interface SketchCanvasResolution {
  dimensions?: SketchCanvasDimensions;
  warning?: string;
}

export interface SketchScaleResolution {
  scale: number;
  coordinateSpace: "analysis" | "unknown";
  warning?: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteDimension(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function inferSketchScale(value: unknown, fallback = 2): number {
  const device = String(value ?? "");
  if (device.includes("@3x")) return 3;
  if (device.includes("@2x")) return 2;
  if (device.includes("@1x")) return 1;
  return fallback;
}

function uniformDimensionRatio(
  numerator: SketchCanvasDimensions | undefined,
  denominator: SketchCanvasDimensions | undefined,
): number | undefined {
  const numeratorWidth = finiteDimension(numerator?.width);
  const numeratorHeight = finiteDimension(numerator?.height);
  const denominatorWidth = finiteDimension(denominator?.width);
  const denominatorHeight = finiteDimension(denominator?.height);
  if (!numeratorWidth || !numeratorHeight || !denominatorWidth || !denominatorHeight) {
    return undefined;
  }
  const ratioX = numeratorWidth / denominatorWidth;
  const ratioY = numeratorHeight / denominatorHeight;
  const tolerance = Math.max(ratioX, ratioY) * 0.01;
  return Math.abs(ratioX - ratioY) <= tolerance ? (ratioX + ratioY) / 2 : undefined;
}

function approximatelyEqualScale(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.abs(right) * 0.01;
}

export function inferSketchCoordinateScale(
  sketch: UnknownRecord,
  expectedAnalysisDimensions?: SketchCanvasDimensions,
  fallback = 2,
): SketchScaleResolution {
  const device = String(sketch.device ?? "");
  const rawCanvasResolution = resolveSketchCanvasDimensions(sketch, 1);
  const rawCanvas = rawCanvasResolution.dimensions;
  if (/@[123]x/.test(device)) {
    const explicitScale = inferSketchScale(device, fallback);
    const canvasRatio = uniformDimensionRatio(rawCanvas, expectedAnalysisDimensions);
    if (canvasRatio !== undefined && !approximatelyEqualScale(canvasRatio, explicitScale)) {
      return {
        scale: explicitScale,
        coordinateSpace: "unknown",
        warning: `Explicit Sketch scale @${explicitScale}x conflicts with canvas ratio ${Math.round(canvasRatio * 100) / 100} relative to reference dimensions.`,
      };
    }
    return {
      scale: explicitScale,
      coordinateSpace: "analysis",
    };
  }

  const inferredRatio = uniformDimensionRatio(rawCanvas, expectedAnalysisDimensions);
  if (inferredRatio !== undefined) {
    const inferredScale = [1, 2, 3].find((candidate) =>
      approximatelyEqualScale(inferredRatio, candidate)
    );
    if (inferredScale !== undefined) {
      return { scale: inferredScale, coordinateSpace: "analysis" };
    }
    return {
      scale: fallback,
      coordinateSpace: "unknown",
      warning: `Sketch scale could not be inferred from canvas ratio ${Math.round(inferredRatio * 100) / 100}.`,
    };
  }

  if (rawCanvasResolution.warning) {
    return {
      scale: fallback,
      coordinateSpace: "unknown",
      warning: rawCanvasResolution.warning,
    };
  }

  if (expectedAnalysisDimensions) {
    return {
      scale: fallback,
      coordinateSpace: "unknown",
      warning: "Sketch scale could not be inferred from the available canvas dimensions.",
    };
  }
  return {
    scale: fallback,
    coordinateSpace: "unknown",
    warning: "Sketch scale could not be inferred without reference dimensions or an explicit device scale.",
  };
}

export function scaleSketchValue(value: unknown, scale: number): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed / (scale || 1)) * 10) / 10;
}

interface MeasuredLayerBounds {
  dimensions?: SketchCanvasDimensions;
  anchoredAtOrigin: boolean;
}

function measureLayers(layers: readonly unknown[], scale: number): MeasuredLayerBounds {
  let width = 0;
  let height = 0;
  let anchoredAtOrigin = false;

  const walk = (value: unknown, ancestorsAnchored = true): void => {
    if (!isRecord(value) || value.visible === false || value.isVisible === false) return;
    const frame = isRecord(value.frame) ? value.frame : value;
    const x = finiteNumber(frame.left ?? frame.x) ?? 0;
    const y = finiteNumber(frame.top ?? frame.y) ?? 0;
    const layerWidth = finiteDimension(frame.width) ?? 0;
    const layerHeight = finiteDimension(frame.height) ?? 0;
    const anchored = Math.abs(x) < 0.01 && Math.abs(y) < 0.01;
    if (ancestorsAnchored && anchored && layerWidth > 0 && layerHeight > 0) {
      anchoredAtOrigin = true;
    }
    width = Math.max(width, scaleSketchValue(x + layerWidth, scale));
    height = Math.max(height, scaleSketchValue(y + layerHeight, scale));

    const children = Array.isArray(value.layers) ? value.layers : [];
    for (const child of children) walk(child, ancestorsAnchored && anchored);
  };

  for (const layer of layers) walk(layer);
  return {
    anchoredAtOrigin,
    ...(width > 0 || height > 0
      ? { dimensions: { width: width || undefined, height: height || undefined } }
      : {}),
  };
}

function approximatelyEqual(left: number, right: number): boolean {
  const tolerance = Math.max(0.5, Math.max(Math.abs(left), Math.abs(right)) * 0.01);
  return Math.abs(left - right) <= tolerance;
}

function dimensionsMatch(
  explicit: SketchCanvasDimensions,
  measured: SketchCanvasDimensions,
  explicitScale: number,
): boolean {
  let compared = 0;
  for (const key of ["width", "height"] as const) {
    const explicitValue = explicit[key];
    const measuredValue = measured[key];
    if (explicitValue === undefined || measuredValue === undefined) continue;
    compared += 1;
    if (!approximatelyEqual(explicitValue / explicitScale, measuredValue)) return false;
  }
  return compared > 0;
}

function scaledDimensions(
  dimensions: SketchCanvasDimensions,
  scale: number,
): SketchCanvasDimensions {
  return {
    ...(dimensions.width !== undefined
      ? { width: scaleSketchValue(dimensions.width, scale) }
      : {}),
    ...(dimensions.height !== undefined
      ? { height: scaleSketchValue(dimensions.height, scale) }
      : {}),
  };
}

export function resolveSketchCanvasDimensions(
  sketch: UnknownRecord,
  designScale = 1,
  referenceDimensions?: SketchCanvasDimensions,
): SketchCanvasResolution {
  const scale = designScale || 1;
  const artboard = isRecord(sketch.artboard) ? sketch.artboard : undefined;
  const board = isRecord(sketch.board) ? sketch.board : undefined;
  const root = artboard ?? board;
  if (root) {
    const frame = isRecord(root.frame) ? root.frame : root;
    const dimensions = scaledDimensions({
      width: finiteDimension(frame.width),
      height: finiteDimension(frame.height),
    }, scale);
    const measured = measureLayers(Array.isArray(root.layers) ? root.layers : [], scale);
    return {
      dimensions: {
        width: dimensions.width ?? (measured.anchoredAtOrigin ? measured.dimensions?.width : undefined),
        height: dimensions.height ?? (measured.anchoredAtOrigin ? measured.dimensions?.height : undefined),
      },
    };
  }

  const info = Array.isArray(sketch.info) ? sketch.info : [];
  const measuredResult = measureLayers(info, scale);
  const measured = measuredResult.anchoredAtOrigin ? measuredResult.dimensions : undefined;
  const explicit: SketchCanvasDimensions = {
    width: finiteDimension(sketch.width ?? sketch.canvasWidth),
    height: finiteDimension(sketch.height ?? sketch.canvasHeight),
  };
  const hasExplicit = explicit.width !== undefined || explicit.height !== undefined;
  if (!hasExplicit) return { dimensions: measured };

  if (measured && dimensionsMatch(explicit, measured, 1)) {
    return { dimensions: explicit };
  }
  if (measured && dimensionsMatch(explicit, measured, scale)) {
    return { dimensions: scaledDimensions(explicit, scale) };
  }

  const coverage = measured
    ? (["width", "height"] as const).map((key) => {
      const explicitValue = explicit[key];
      const measuredValue = measured[key];
      return explicitValue && measuredValue ? measuredValue / explicitValue : 0;
    })
    : [];
  if (coverage.some((ratio) => ratio > 1.01)) {
    return {
      warning: "Legacy Sketch canvas dimensions conflict with normalized layer bounds; coordinate space is unknown.",
    };
  }

  if (referenceDimensions) {
    if (dimensionsMatch(explicit, referenceDimensions, 1)) {
      return { dimensions: explicit };
    }
    if (dimensionsMatch(explicit, referenceDimensions, scale)) {
      return { dimensions: scaledDimensions(explicit, scale) };
    }
  }

  if (scale !== 1 && coverage.length > 0 && coverage.every((ratio) => ratio >= 0.7)) {
    return {
      warning: "Legacy Sketch canvas dimensions conflict with normalized layer bounds; coordinate space is unknown.",
    };
  }

  return { dimensions: explicit };
}
