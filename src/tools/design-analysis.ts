import type {
  LanhuDesignSummary,
  LanhuSlicesResult,
  ToolContent,
  UnknownRecord,
} from "../shared/types.js";
import {
  inferSketchCoordinateScale,
} from "../shared/sketch-coordinates.js";
import { minifyHtml } from "../shared/html.js";
import { extractDesignTokens, extractLayerTreeResult } from "../transform/design-tokens.js";
import type { LayerDepth } from "../transform/design-tokens.js";
import {
  extractLayoutSummary,
  extractSchemaCanvasDimensions,
} from "../transform/layout-summary.js";
import type { CanvasDimensions } from "../transform/layout-summary.js";
import { convertSchemaToHtml, localizeImageUrls } from "../transform/schema-to-html.js";
import { extractFullAnnotationsFromSketch } from "../transform/sketch-annotations.js";
import {
  extractSketchCanvasDimensions,
  extractSketchCanvasDimensionsResult,
  extractSketchLayoutSummaryResult,
} from "../transform/sketch-layout-summary.js";
import {
  convertSketchToHtml,
  extractLayerAnnotationsFromSketch,
  inferDesignScale,
} from "../transform/sketch-to-html.js";
import type { LayerAnnotation } from "../transform/sketch-to-html.js";

export type IncludeOption = "html" | "image" | "tokens" | "layout" | "layers" | "slices";
export type AnalysisStatus = "success" | "partial_success" | "error";
export type OutputCompleteness = "complete" | "partial" | "empty";
type OutputSource = "schema" | "sketch" | "combined";
type DimensionAnalysisSource = "schema" | "sketch" | "normalized" | "layers_root" | "slices";

interface OutputMetadata {
  source?: OutputSource;
  warning?: string;
  completeness?: OutputCompleteness;
  missingFields?: string[];
  sourceMissingFields?: string[];
  normalizedMissingFields?: string[];
  pixelDimensions?: CanvasDimensions;
  pixelRatio?: number;
  coordinateSpace?: "image_pixels" | "unknown";
  sourceArtboardDimensions?: CanvasDimensions;
}

interface OutputSuccess<T> extends OutputMetadata {
  status: "success" | "partial_success";
  value: T;
}

interface OutputFailure extends OutputMetadata {
  status: "error";
  error: string;
}

export type OutputResult<T> = OutputSuccess<T> | OutputFailure;

export interface HtmlOutput {
  code: string;
  imageUrlMapping: Record<string, string>;
  annotations?: string;
}

export interface ImageOutput {
  bytes: number;
}

export interface LayersOutput {
  tree: string;
  annotations: LayerAnnotation[];
  truncated: boolean;
  maxDepth: LayerDepth;
}

export interface DesignOutputMap {
  html: HtmlOutput;
  image: ImageOutput;
  tokens: string;
  layout: string;
  layers: LayersOutput;
  slices: LanhuSlicesResult;
}

export type DesignOutputs = {
  [K in IncludeOption]?: OutputResult<DesignOutputMap[K]>;
};

interface DimensionValue {
  width: number | null;
  height: number | null;
}

export interface DesignDimensions {
  list: DimensionValue & { source: LanhuDesignSummary["source"] };
  analysis: (DimensionValue & { source: DimensionAnalysisSource }) | null;
  scale: {
    x: number;
    y: number;
    source: "inferred_from_dimensions";
  } | null;
  coordinateSpace: "analysis" | "unknown";
  warning?: string;
}

export interface DesignAnalysisResult {
  designId: string;
  designName: string;
  status: AnalysisStatus;
  outputs: DesignOutputs;
  dimensions: DesignDimensions;
  imageContent?: ToolContent;
}

export interface DesignAnalysisDependencies {
  loadSchema(): Promise<UnknownRecord>;
  loadSketch(): Promise<UnknownRecord>;
  loadImage?(): Promise<{
    content: ToolContent;
    bytes: number;
    dimensions?: CanvasDimensions;
  }>;
  loadSlices?(): Promise<LanhuSlicesResult>;
}

type LoadedDesignImage = Awaited<ReturnType<NonNullable<DesignAnalysisDependencies["loadImage"]>>>;

export interface DesignDimensionSources {
  schema?: CanvasDimensions;
  sketch?: CanvasDimensions;
  layers?: CanvasDimensions;
  slices?: LanhuSlicesResult;
  normalizedImage?: CanvasDimensions;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const value = String(error);
  return value && value !== "undefined" ? value : "non-error rejection";
}

function failure(operation: string, error: unknown): OutputFailure {
  return { status: "error", error: `${operation} failed: ${errorMessage(error)}` };
}

function emptyFailure(
  operation: string,
  message: string,
  metadata: OutputMetadata = {},
): OutputFailure {
  return {
    status: "error",
    ...metadata,
    completeness: "empty",
    error: `${operation} failed: ${message}`,
  };
}

function hasMeaningfulSchemaNode(value: unknown, visited = new Set<unknown>()): boolean {
  if (typeof value !== "object" || value === null || visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulSchemaNode(item, visited));
  }

  const node = value as UnknownRecord;
  const props = typeof node.props === "object" && node.props !== null && !Array.isArray(node.props)
    ? node.props as UnknownRecord
    : {};
  const data = typeof node.data === "object" && node.data !== null && !Array.isArray(node.data)
    ? node.data as UnknownRecord
    : {};
  const directStyle = typeof node.style === "object" && node.style !== null && !Array.isArray(node.style)
    ? node.style as UnknownRecord
    : {};
  const propsStyle = typeof props.style === "object" && props.style !== null && !Array.isArray(props.style)
    ? props.style as UnknownRecord
    : {};
  const hasStyle = Object.values({ ...directStyle, ...propsStyle })
    .some((item) => item !== undefined && item !== null && item !== "");
  const hasContent = [data.value, props.text, props.src]
    .some((item) => typeof item === "string" && item.trim().length > 0);
  if (hasStyle || hasContent) return true;

  const children = Array.isArray(node.children) ? node.children : [];
  return children.some((child) => hasMeaningfulSchemaNode(child, visited));
}

function hasMeaningfulLayout(value: string): boolean {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const emptyCanvas = /^\[canvas\]\s+w:0(?:\.0+)?\s+h:0(?:\.0+)?(?:\s|$)/;
  return lines.some((line) => !emptyCanvas.test(line));
}

function finitePositive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function roundedScale(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

const DEFAULT_LIST_TO_ANALYSIS_SCALE = 2;

function getExpectedAnalysisDimensions(
  design: LanhuDesignSummary,
): CanvasDimensions | undefined {
  const listWidth = finitePositive(design.width);
  const listHeight = finitePositive(design.height);
  return listWidth && listHeight
    ? {
      width: listWidth * DEFAULT_LIST_TO_ANALYSIS_SCALE,
      height: listHeight * DEFAULT_LIST_TO_ANALYSIS_SCALE,
    }
    : undefined;
}

function inferUniformDimensionRatio(
  numerator: CanvasDimensions | undefined,
  denominator: CanvasDimensions | undefined,
): number | undefined {
  const numeratorWidth = finitePositive(numerator?.width);
  const numeratorHeight = finitePositive(numerator?.height);
  const denominatorWidth = finitePositive(denominator?.width);
  const denominatorHeight = finitePositive(denominator?.height);
  if (!numeratorWidth || !numeratorHeight || !denominatorWidth || !denominatorHeight) {
    return undefined;
  }
  const ratioX = numeratorWidth / denominatorWidth;
  const ratioY = numeratorHeight / denominatorHeight;
  const tolerance = Math.max(ratioX, ratioY) * 0.01;
  return Math.abs(ratioX - ratioY) <= tolerance ? roundedScale((ratioX + ratioY) / 2) : undefined;
}

function dimensionsApproximatelyMatch(
  left: CanvasDimensions | undefined,
  right: CanvasDimensions | undefined,
): boolean {
  const ratio = inferUniformDimensionRatio(left, right);
  return ratio !== undefined && Math.abs(ratio - 1) <= 0.01;
}

function formatCanvasDimensions(dimensions: CanvasDimensions): string {
  const width = Math.round(Number(dimensions.width) * 100) / 100;
  const height = Math.round(Number(dimensions.height) * 100) / 100;
  return `${width}x${height}`;
}

function dimensionConflictWarning(
  label: string,
  dimensions: CanvasDimensions | undefined,
  trusted: CanvasDimensions | undefined,
): string | undefined {
  if (
    !hasCompleteDimensions(dimensions)
    || !hasCompleteDimensions(trusted)
    || dimensionsApproximatelyMatch(dimensions, trusted)
  ) {
    return undefined;
  }
  const suffix = label === "Schema" ? "; Schema coordinates were not used." : ".";
  return `${label} canvas ${formatCanvasDimensions(dimensions)} conflicts with trusted analysis canvas ${formatCanvasDimensions(trusted)}${suffix}`;
}

function normalizeImageDimensions(
  design: LanhuDesignSummary,
  pixelDimensions: CanvasDimensions | undefined,
): CanvasDimensions | undefined {
  const listWidth = finitePositive(design.width);
  const listHeight = finitePositive(design.height);
  if (!listWidth || !listHeight) return undefined;
  const normalized = {
    width: listWidth * DEFAULT_LIST_TO_ANALYSIS_SCALE,
    height: listHeight * DEFAULT_LIST_TO_ANALYSIS_SCALE,
  };
  const pixelRatio = inferUniformDimensionRatio(pixelDimensions, normalized);
  return pixelRatio !== undefined && pixelRatio >= 1 ? normalized : undefined;
}

function hasCompleteDimensions(
  dimensions: CanvasDimensions | undefined,
): dimensions is CanvasDimensions & { width: number; height: number } {
  return Boolean(finitePositive(dimensions?.width) && finitePositive(dimensions?.height));
}

function inferAnalysisSketchScale(
  sketch: UnknownRecord,
  design: LanhuDesignSummary,
): ReturnType<typeof inferSketchCoordinateScale> {
  return inferSketchCoordinateScale(sketch, getExpectedAnalysisDimensions(design), 2);
}

function readUint16BigEndian(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

function readUint32BigEndian(data: Uint8Array, offset: number): number {
  return (
    data[offset] * 0x1000000
    + (data[offset + 1] << 16)
    + (data[offset + 2] << 8)
    + data[offset + 3]
  );
}

function readUint16LittleEndian(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function isAvif(data: Uint8Array): boolean {
  if (data.length < 16 || String.fromCharCode(...data.subarray(4, 8)) !== "ftyp") {
    return false;
  }
  const boxSize = Math.min(data.length, readUint32BigEndian(data, 0));
  if (["avif", "avis"].includes(String.fromCharCode(...data.subarray(8, 12)))) {
    return true;
  }
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    if (["avif", "avis"].includes(String.fromCharCode(...data.subarray(offset, offset + 4)))) {
      return true;
    }
  }
  return false;
}

function extractAvifDimensions(data: Uint8Array): CanvasDimensions | undefined {
  if (!isAvif(data)) return undefined;
  for (let typeOffset = 4; typeOffset + 16 <= data.length; typeOffset += 1) {
    if (String.fromCharCode(...data.subarray(typeOffset, typeOffset + 4)) !== "ispe") continue;
    const boxOffset = typeOffset - 4;
    const boxSize = readUint32BigEndian(data, boxOffset);
    if (boxSize < 20 || boxOffset + boxSize > data.length) continue;
    const width = readUint32BigEndian(data, typeOffset + 8);
    const height = readUint32BigEndian(data, typeOffset + 12);
    if (width > 0 && height > 0) return { width, height };
  }
  return undefined;
}

export function extractImageDimensions(data: Uint8Array): CanvasDimensions | undefined {
  if (
    data.length >= 24
    && data[0] === 0x89
    && data[1] === 0x50
    && data[2] === 0x4e
    && data[3] === 0x47
  ) {
    return {
      width: readUint32BigEndian(data, 16),
      height: readUint32BigEndian(data, 20),
    };
  }

  const signature = String.fromCharCode(...data.subarray(0, 6));
  if (data.length >= 10 && ["GIF87a", "GIF89a"].includes(signature)) {
    return {
      width: data[6] | (data[7] << 8),
      height: data[8] | (data[9] << 8),
    };
  }

  if (data.length >= 25 && String.fromCharCode(...data.subarray(0, 4)) === "RIFF") {
    const format = String.fromCharCode(...data.subarray(8, 12));
    const chunk = String.fromCharCode(...data.subarray(12, 16));
    if (format === "WEBP" && chunk === "VP8X" && data.length >= 30) {
      return {
        width: 1 + data[24] + (data[25] << 8) + (data[26] << 16),
        height: 1 + data[27] + (data[28] << 8) + (data[29] << 16),
      };
    }
    if (
      format === "WEBP"
      && chunk === "VP8 "
      && data.length >= 30
      && data[23] === 0x9d
      && data[24] === 0x01
      && data[25] === 0x2a
    ) {
      return {
        width: readUint16LittleEndian(data, 26) & 0x3fff,
        height: readUint16LittleEndian(data, 28) & 0x3fff,
      };
    }
    if (format === "WEBP" && chunk === "VP8L" && data[20] === 0x2f) {
      const bits = data[21] | (data[22] << 8) | (data[23] << 16) | (data[24] << 24);
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >>> 14) & 0x3fff),
      };
    }
  }

  const avifDimensions = extractAvifDimensions(data);
  if (avifDimensions) return avifDimensions;

  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    const startOfFrameMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    while (offset + 8 < data.length) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (data[offset] === 0xff) offset += 1;
      const marker = data[offset];
      offset += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 1 >= data.length) break;
      const segmentLength = readUint16BigEndian(data, offset);
      if (segmentLength < 2 || offset + segmentLength > data.length) break;
      if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
        return {
          width: readUint16BigEndian(data, offset + 5),
          height: readUint16BigEndian(data, offset + 3),
        };
      }
      offset += segmentLength;
    }
  }

  return undefined;
}

function parseSliceSize(size: string): CanvasDimensions | undefined {
  const match = size.trim().match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function extractSliceBounds(result: LanhuSlicesResult): CanvasDimensions | undefined {
  let width = 0;
  let height = 0;
  for (const slice of result.slices) {
    const size = parseSliceSize(slice.size);
    if (!size?.width || !size.height) continue;
    width = Math.max(width, (slice.position?.x ?? 0) + size.width);
    height = Math.max(height, (slice.position?.y ?? 0) + size.height);
  }
  return width > 0 || height > 0
    ? { width: width || undefined, height: height || undefined }
    : undefined;
}

function getSliceDimensionWarning(
  design: LanhuDesignSummary,
  slices: LanhuSlicesResult,
): string | undefined {
  if (slices.canvasSizeSource !== "slice_bounds") return undefined;
  const listDimensions = {
    width: finitePositive(design.width),
    height: finitePositive(design.height),
  };
  const canvasDimensions = {
    width: finitePositive(slices.canvasSize.width),
    height: finitePositive(slices.canvasSize.height),
  };
  if (!hasCompleteDimensions(listDimensions) || !hasCompleteDimensions(canvasDimensions)) {
    return undefined;
  }
  const ratioX = Number(canvasDimensions.width) / Number(listDimensions.width);
  const ratioY = Number(canvasDimensions.height) / Number(listDimensions.height);
  return Math.abs(ratioX - ratioY) > Math.max(ratioX, ratioY) * 0.001
    ? "Slice bounds produce a non-uniform list-to-analysis scale; coordinate space is unknown."
    : undefined;
}

function resolveSliceDimensions(
  design: LanhuDesignSummary,
  slices: LanhuSlicesResult | undefined,
): CanvasDimensions | undefined {
  if (!slices) return undefined;
  const canvas = slices.canvasSize;
  const bounds = extractSliceBounds(slices);
  if (slices.canvasSizeSource === "sketch") {
    return slices.coordinateSpace === "unknown" ? undefined : canvas;
  }
  if (slices.canvasSizeSource === "slice_bounds") {
    return slices.coordinateSpace === "unknown" || getSliceDimensionWarning(design, slices)
      ? undefined
      : canvas;
  }

  const listWidth = finitePositive(design.width);
  const listHeight = finitePositive(design.height);
  if (
    bounds?.width
    && bounds.height
    && (
      !listWidth
      || !listHeight
      || (
        bounds.width > listWidth * 1.01
        && bounds.height > listHeight * 1.01
      )
    )
  ) {
    return bounds;
  }

  if (slices.canvasSizeSource === "document") return undefined;
  const canvasWidth = finitePositive(canvas.width);
  const canvasHeight = finitePositive(canvas.height);
  if (
    canvasWidth
    && canvasHeight
    && (
      !listWidth
      || !listHeight
      || Math.abs(canvasWidth - listWidth) > listWidth * 0.01
      || Math.abs(canvasHeight - listHeight) > listHeight * 0.01
    )
  ) {
    return canvas;
  }
  return undefined;
}

function buildDesignDimensions(
  design: LanhuDesignSummary,
  analysis?: CanvasDimensions & { source: DimensionAnalysisSource },
): DesignDimensions {
  const listWidth = finitePositive(design.width);
  const listHeight = finitePositive(design.height);
  const analysisWidth = finitePositive(analysis?.width);
  const analysisHeight = finitePositive(analysis?.height);
  const coordinateSpace = analysisWidth && analysisHeight ? "analysis" as const : "unknown" as const;
  const result: DesignDimensions = {
    list: {
      width: listWidth ?? null,
      height: listHeight ?? null,
      source: design.source,
    },
    analysis: analysis
      ? {
        width: analysisWidth ?? null,
        height: analysisHeight ?? null,
        source: analysis.source,
      }
      : null,
    scale: null,
    coordinateSpace,
  };

  if (!listWidth || !listHeight || !analysisWidth || !analysisHeight) return result;
  const scaleX = analysisWidth / listWidth;
  const scaleY = analysisHeight / listHeight;
  const tolerance = Math.max(scaleX, scaleY) * 0.01;
  if (Math.abs(scaleX - scaleY) > tolerance) {
    return {
      ...result,
      warning: "Width and height scale ratios differ; no uniform scale was inferred.",
    };
  }
  return {
    ...result,
    scale: {
      x: roundedScale(scaleX),
      y: roundedScale(scaleY),
      source: "inferred_from_dimensions",
    },
  };
}

export function resolveDesignDimensions(
  design: LanhuDesignSummary,
  sources: DesignDimensionSources = {},
): DesignDimensions {
  const slices = resolveSliceDimensions(design, sources.slices);
  const candidates: Array<{
    dimensions: CanvasDimensions | undefined;
    source: DimensionAnalysisSource;
    label: string;
  }> = [
    { dimensions: sources.layers, source: "layers_root", label: "Layers root" },
    { dimensions: sources.schema, source: "schema", label: "Schema" },
    { dimensions: sources.sketch, source: "sketch", label: "Sketch" },
    { dimensions: slices, source: "slices", label: "Slices" },
    { dimensions: sources.normalizedImage, source: "normalized", label: "Normalized image" },
  ];
  const completeCandidates = candidates.filter(({ dimensions }) =>
    finitePositive(dimensions?.width) && finitePositive(dimensions?.height)
  );
  const trustedReference = getExpectedAnalysisDimensions(design);
  const matchingCandidates = hasCompleteDimensions(trustedReference)
    ? completeCandidates.filter(({ dimensions }) =>
      dimensionsApproximatelyMatch(dimensions, trustedReference)
    )
    : completeCandidates;
  const complete = matchingCandidates[0];
  const partial = complete ?? (completeCandidates.length === 0
    ? candidates.find(({ dimensions }) =>
    finitePositive(dimensions?.width) || finitePositive(dimensions?.height)
    )
    : undefined);
  const result = buildDesignDimensions(
    design,
    partial?.dimensions
      ? { ...partial.dimensions, source: partial.source }
      : undefined,
  );
  const trustedDimensions = trustedReference ?? complete?.dimensions;
  const warnings = completeCandidates
    .map(({ label, dimensions }) => dimensionConflictWarning(label, dimensions, trustedDimensions))
    .filter((warning): warning is string => Boolean(warning));
  if (warnings.length === 0) return result;
  return {
    ...result,
    warning: [result.warning, ...warnings]
      .filter((warning): warning is string => Boolean(warning))
      .join("; "),
  };
}

export function deriveDesignDimensions(
  design: LanhuDesignSummary,
  analysis?: CanvasDimensions & { source: DimensionAnalysisSource },
): DesignDimensions {
  return buildDesignDimensions(design, analysis);
}

export async function extractAvailableDesignTokens(
  design: LanhuDesignSummary,
  dependencies: Pick<DesignAnalysisDependencies, "loadSchema" | "loadSketch">,
): Promise<OutputResult<string>> {
  const attempts = await Promise.allSettled([
    Promise.resolve().then(() => dependencies.loadSketch()),
    ...(design.source === "detailDetach"
      ? []
      : [Promise.resolve().then(() => dependencies.loadSchema())]),
  ]);
  const sketchResult = attempts[0];
  const schemaResult = attempts[1];
  const sketch = sketchResult?.status === "fulfilled" ? sketchResult.value : undefined;
  const schema = schemaResult?.status === "fulfilled" ? schemaResult.value : undefined;
  const warnings: string[] = [];

  if (sketchResult?.status === "rejected") {
    warnings.push(`Sketch tokens unavailable: ${errorMessage(sketchResult.reason)}`);
  }
  if (schemaResult?.status === "rejected") {
    warnings.push(`Schema tokens unavailable: ${errorMessage(schemaResult.reason)}`);
  }
  if (!sketch && !schema) {
    return failure("Design token extraction", warnings.join("; ") || "no token source available");
  }

  try {
    const scaleResolution = sketch ? inferAnalysisSketchScale(sketch, design) : undefined;
    const value = extractDesignTokens(sketch, schema, scaleResolution?.scale ?? 1);
    const source = sketch && schema ? "combined" : schema ? "schema" : "sketch";
    if (!value.trim()) {
      return emptyFailure("Design token extraction", "no design tokens found", {
        source,
        ...(warnings.length > 0 ? { warning: warnings.join("; ") } : {}),
      });
    }
    const uncertainSketchScale = scaleResolution?.coordinateSpace === "unknown";
    const resultWarnings = [
      ...warnings,
      uncertainSketchScale ? scaleResolution.warning : undefined,
    ].filter((warning): warning is string => Boolean(warning));
    return {
      status: uncertainSketchScale ? "partial_success" : "success",
      source,
      completeness: uncertainSketchScale ? "partial" : "complete",
      ...(resultWarnings.length > 0 ? { warning: resultWarnings.join("; ") } : {}),
      value,
    };
  } catch (error) {
    return failure("Design token extraction", error);
  }
}

export function deriveAnalysisStatus(
  requested: ReadonlySet<IncludeOption>,
  outputs: DesignOutputs,
): AnalysisStatus {
  const results = [...requested].map((option) => outputs[option]);
  const completeCount = results.filter((result) => result?.status === "success").length;
  const usableCount = results.filter((result) => result && result.status !== "error").length;
  if (completeCount === results.length && results.length > 0) return "success";
  if (usableCount > 0) return "partial_success";
  return "error";
}

export function createFailedDesignAnalysis(
  design: LanhuDesignSummary,
  requested: ReadonlySet<IncludeOption>,
  error: unknown,
): DesignAnalysisResult {
  const outputs = Object.fromEntries(
    [...requested].map((option) => [option, failure(option, error)]),
  ) as DesignOutputs;
  return {
    designId: design.id,
    designName: design.name,
    status: deriveAnalysisStatus(requested, outputs),
    outputs,
    dimensions: deriveDesignDimensions(design),
  };
}

export function deriveOverallAnalysisStatus(
  results: readonly DesignAnalysisResult[],
): AnalysisStatus {
  if (results.length > 0 && results.every((result) => result.status === "success")) {
    return "success";
  }
  if (results.length === 0 || results.every((result) => result.status === "error")) {
    return "error";
  }
  return "partial_success";
}

export function toStructuredDesignAnalysis(result: DesignAnalysisResult) {
  const errors = Object.entries(result.outputs)
    .filter((entry): entry is [string, OutputFailure] => entry[1]?.status === "error")
    .map(([operation, output]) => ({ operation, error: output.error }));

  return {
    designId: result.designId,
    name: result.designName,
    status: result.status,
    success: result.status === "success",
    dimensions: result.dimensions,
    outputs: result.outputs,
    errors,
  };
}

export async function analyzeDesign(
  design: LanhuDesignSummary,
  requested: ReadonlySet<IncludeOption>,
  layerDepth: LayerDepth,
  dependencies: DesignAnalysisDependencies,
): Promise<DesignAnalysisResult> {
  const outputs: DesignOutputs = {};
  let imageContent: ToolContent | undefined;
  let schemaPromise: Promise<UnknownRecord> | undefined;
  let sketchPromise: Promise<UnknownRecord> | undefined;
  let imagePromise: Promise<LoadedDesignImage> | undefined;
  let schemaDimensions: CanvasDimensions | undefined;
  let schemaDimensionWarning: string | undefined;
  let sketchDimensions: CanvasDimensions | undefined;
  let htmlSketchDimensions: CanvasDimensions | undefined;
  let layoutSketchDimensions: CanvasDimensions | undefined;
  let sketchDimensionWarning: string | undefined;
  let sketchScale: number | undefined;
  let sketchCoordinateSpace: string = "analysis";
  let imagePixelDimensions: CanvasDimensions | undefined;
  let normalizedImageDimensions: CanvasDimensions | undefined;
  let layerDimensions: CanvasDimensions | undefined;
  const loadSchema = (): Promise<UnknownRecord> => schemaPromise ??= dependencies.loadSchema()
    .then((schema) => {
      schemaDimensions = extractSchemaCanvasDimensions(schema);
      schemaDimensionWarning = dimensionConflictWarning(
        "Schema",
        schemaDimensions,
        getExpectedAnalysisDimensions(design),
      );
      return schema;
    });
  const loadSketch = (): Promise<UnknownRecord> => sketchPromise ??= dependencies.loadSketch()
    .then((sketch) => {
      const scaleResolution = inferAnalysisSketchScale(sketch, design);
      const scale = scaleResolution.scale;
      sketchScale = scale;
      const referenceDimensions = getExpectedAnalysisDimensions(design);
      const canvasResult = extractSketchCanvasDimensionsResult(
        sketch,
        scale,
        referenceDimensions,
      );
      const rootLayerDimensions = extractLayerTreeResult(sketch, 1, {
        name: design.name,
        width: referenceDimensions?.width,
        height: referenceDimensions?.height,
      }, scale).rootLayerDimensions;
      const trustedRootDimensions = dimensionsApproximatelyMatch(
        rootLayerDimensions,
        referenceDimensions,
      )
        ? rootLayerDimensions
        : undefined;
      const hasExplicitScale = /@[123]x/.test(String(sketch.device ?? ""));
      sketchCoordinateSpace = scaleResolution.coordinateSpace;
      sketchDimensionWarning = scaleResolution.warning ?? canvasResult.warning;
      if (trustedRootDimensions && (scaleResolution.coordinateSpace === "analysis" || hasExplicitScale)) {
        sketchCoordinateSpace = "analysis";
        sketchDimensions = trustedRootDimensions;
        sketchDimensionWarning = undefined;
      } else if (scaleResolution.coordinateSpace === "analysis" && !canvasResult.warning) {
        sketchDimensions = canvasResult.dimensions ?? rootLayerDimensions;
      } else {
        sketchDimensions = undefined;
        if (canvasResult.warning) sketchCoordinateSpace = "unknown";
      }
      return sketch;
    });
  const loadImage = (): Promise<LoadedDesignImage> => {
    if (!dependencies.loadImage) return Promise.reject(new Error("design has no preview URL"));
    return imagePromise ??= dependencies.loadImage().then((image) => {
      if (Number.isFinite(image.bytes) && image.bytes > 0) {
        imagePixelDimensions = image.dimensions;
        normalizedImageDimensions = normalizeImageDimensions(design, image.dimensions);
      }
      return image;
    });
  };

  const tasks: Promise<void>[] = [];

  if (requested.has("image")) {
    tasks.push((async () => {
      if (!dependencies.loadImage) {
        outputs.image = failure("Image download", "design has no preview URL");
        return;
      }
      try {
        const image = await loadImage();
        if (!Number.isFinite(image.bytes) || image.bytes <= 0) {
          outputs.image = emptyFailure("Image download", "downloaded image is empty", {
            coordinateSpace: "unknown",
          });
          return;
        }
        imageContent = image.content;
        const hasPixelDimensions = Boolean(
          finitePositive(image.dimensions?.width) && finitePositive(image.dimensions?.height),
        );
        outputs.image = {
          status: hasPixelDimensions ? "success" : "partial_success",
          completeness: hasPixelDimensions ? "complete" : "partial",
          ...(!hasPixelDimensions
            ? { warning: "Image downloaded, but pixel dimensions could not be determined." }
            : {}),
          ...(image.dimensions ? { pixelDimensions: image.dimensions } : {}),
          coordinateSpace: hasPixelDimensions ? "image_pixels" : "unknown",
          value: { bytes: image.bytes },
        };
      } catch (error) {
        outputs.image = failure("Image download", error);
      }
    })());
  }

  if (requested.has("html")) {
    tasks.push((async () => {
      let fallbackWarning: string | undefined;
      if (design.source !== "detailDetach") {
        try {
          const schema = await loadSchema();
          if (!hasMeaningfulSchemaNode(schema)) {
            throw new Error("Schema HTML returned no usable content");
          }
          if (schemaDimensionWarning) throw new Error(schemaDimensionWarning);
          const localized = localizeImageUrls(convertSchemaToHtml(schema));
          outputs.html = {
            status: "success",
            source: "schema",
            completeness: "complete",
            value: { code: localized.htmlCode, imageUrlMapping: localized.imageUrlMapping },
          };
          return;
        } catch (error) {
          fallbackWarning = `Schema HTML unavailable: ${errorMessage(error)}`;
        }
      }

      try {
        const sketch = await loadSketch();
        const scale = sketchScale ?? inferAnalysisSketchScale(sketch, design).scale;
        const designImageUrl = design.url ?? "";
        let fallbackDimensions = !schemaDimensionWarning && hasCompleteDimensions(schemaDimensions)
          ? schemaDimensions
          : sketchDimensions;
        let converted = convertSketchToHtml(sketch, scale, designImageUrl, fallbackDimensions);
        if (
          !hasCompleteDimensions(converted.canvasSize)
          && designImageUrl
          && dependencies.loadImage
        ) {
          try {
            await loadImage();
          } catch {
            // The HTML error below remains specific to missing trustworthy canvas data.
          }
          fallbackDimensions = hasCompleteDimensions(normalizedImageDimensions)
            ? normalizedImageDimensions
            : fallbackDimensions;
          converted = convertSketchToHtml(sketch, scale, designImageUrl, fallbackDimensions);
        }
        if (!hasCompleteDimensions(converted.canvasSize)) {
          outputs.html = emptyFailure("HTML Sketch fallback", "no trustworthy canvas dimensions", {
            source: "sketch",
            ...(fallbackWarning ? { warning: fallbackWarning } : {}),
          });
          return;
        }
        if (
          !converted.hasStructuredLayers
          && Object.keys(converted.imageUrlMapping).length === 0
        ) {
          outputs.html = emptyFailure("HTML Sketch fallback", "no usable HTML content", {
            source: "sketch",
            ...(fallbackWarning ? { warning: fallbackWarning } : {}),
          });
          return;
        }
        if (converted.hasStructuredLayers && sketchCoordinateSpace === "analysis") {
          htmlSketchDimensions = converted.canvasSize;
        }
        const previewOnly = !converted.hasStructuredLayers;
        const uncertainCoordinates = sketchCoordinateSpace === "unknown";
        const previewWarning = "Preview-only HTML fallback; no structured layer data";
        const warning = [
          fallbackWarning,
          previewOnly ? previewWarning : undefined,
          uncertainCoordinates ? sketchDimensionWarning : undefined,
        ]
          .filter((value): value is string => Boolean(value))
          .join("; ") || undefined;
        outputs.html = {
          status: previewOnly || uncertainCoordinates ? "partial_success" : "success",
          source: "sketch",
          completeness: previewOnly || uncertainCoordinates ? "partial" : "complete",
          warning,
          value: {
            code: minifyHtml(converted.html),
            imageUrlMapping: converted.imageUrlMapping,
            annotations: extractFullAnnotationsFromSketch(sketch, scale, converted.canvasSize),
          },
        };
      } catch (error) {
        const prefix = fallbackWarning ? `${fallbackWarning}; ` : "";
        outputs.html = failure("HTML Sketch fallback", `${prefix}${errorMessage(error)}`);
      }
    })());
  }

  if (requested.has("layout")) {
    tasks.push((async () => {
      let fallbackWarning: string | undefined;
      if (design.source !== "detailDetach") {
        try {
          const schema = await loadSchema();
          const value = extractLayoutSummary(schema);
          if (!hasMeaningfulLayout(value)) {
            throw new Error("Schema layout returned no usable content");
          }
          if (schemaDimensionWarning) throw new Error(schemaDimensionWarning);
          outputs.layout = {
            status: "success",
            source: "schema",
            completeness: "complete",
            value,
          };
          return;
        } catch (error) {
          fallbackWarning = `Schema layout unavailable: ${errorMessage(error)}`;
        }
      }

      try {
        const sketch = await loadSketch();
        const scale = sketchScale ?? inferAnalysisSketchScale(sketch, design).scale;
        const layout = extractSketchLayoutSummaryResult(sketch, scale, sketchDimensions);
        const value = layout.value;
        if (!hasMeaningfulLayout(value)) {
          outputs.layout = emptyFailure("Layout Sketch fallback", "no usable layout data", {
            source: "sketch",
            ...(fallbackWarning ? { warning: fallbackWarning } : {}),
          });
          return;
        }
        if (hasCompleteDimensions(layout.canvasSize) && sketchCoordinateSpace === "analysis") {
          layoutSketchDimensions = layout.canvasSize;
        }
        const uncertainCoordinates = sketchCoordinateSpace === "unknown" || Boolean(layout.warning);
        outputs.layout = {
          status: uncertainCoordinates ? "partial_success" : "success",
          source: "sketch",
          completeness: uncertainCoordinates ? "partial" : "complete",
          warning: [
            fallbackWarning,
            layout.warning,
            uncertainCoordinates ? sketchDimensionWarning : undefined,
          ]
            .filter((warning): warning is string => Boolean(warning))
            .join("; ") || undefined,
          value,
        };
      } catch (error) {
        const prefix = fallbackWarning ? `${fallbackWarning}; ` : "";
        outputs.layout = failure("Layout Sketch fallback", `${prefix}${errorMessage(error)}`);
      }
    })());
  }

  if (requested.has("tokens")) {
    tasks.push((async () => {
      outputs.tokens = await extractAvailableDesignTokens(design, {
        loadSchema: async () => {
          const loadedSchema = await loadSchema();
          if (schemaDimensionWarning) throw new Error(schemaDimensionWarning);
          return loadedSchema;
        },
        loadSketch,
      });
    })());
  }

  if (requested.has("layers")) {
    tasks.push((async () => {
      try {
        const sketch = await loadSketch();
        const scale = sketchScale ?? inferAnalysisSketchScale(sketch, design).scale;
        const layerTree = extractLayerTreeResult(sketch, layerDepth, {
          name: design.name,
          width: sketchDimensions?.width,
          height: sketchDimensions?.height,
        }, scale);
        layerDimensions = sketchCoordinateSpace === "analysis"
          ? layerTree.rootLayerDimensions
          : undefined;
        const annotations = extractLayerAnnotationsFromSketch(sketch, scale);
        const missingFields = new Set(layerTree.normalizedMissingFields);
        if (layerTree.extractedLayers === 0) missingFields.add("tree");
        if (annotations.length === 0) missingFields.add("annotations");
        const completeness: OutputCompleteness =
          layerTree.extractedLayers === 0 && annotations.length === 0
            ? "empty"
            : missingFields.size > 0 || sketchCoordinateSpace === "unknown"
              ? "partial"
              : "complete";
        const missingFieldList = [...missingFields];
        if (completeness === "empty") {
          outputs.layers = {
            status: "error",
            source: "sketch",
            completeness,
            missingFields: missingFieldList,
            sourceMissingFields: layerTree.sourceMissingFields,
            normalizedMissingFields: layerTree.normalizedMissingFields,
            ...(layerTree.sourceArtboardDimensions
              ? { sourceArtboardDimensions: layerTree.sourceArtboardDimensions }
              : {}),
            error: "Layer extraction returned no usable tree or annotations.",
          };
          return;
        }
        outputs.layers = {
          status: completeness === "complete" ? "success" : "partial_success",
          source: "sketch",
          completeness,
          missingFields: missingFieldList,
          sourceMissingFields: layerTree.sourceMissingFields,
          normalizedMissingFields: layerTree.normalizedMissingFields,
          ...(layerTree.sourceArtboardDimensions
            ? { sourceArtboardDimensions: layerTree.sourceArtboardDimensions }
            : {}),
          ...(completeness === "complete"
            ? {}
            : {
              warning: [
                missingFieldList.length > 0
                  ? `Layer extraction completed with missing fields: ${missingFieldList.join(", ")}`
                  : undefined,
                sketchCoordinateSpace === "unknown" ? sketchDimensionWarning : undefined,
              ].filter((warning): warning is string => Boolean(warning)).join("; "),
            }),
          value: {
            tree: layerTree.tree,
            annotations,
            truncated: layerTree.truncated,
            maxDepth: layerTree.maxDepth,
          },
        };
      } catch (error) {
        outputs.layers = failure("Layer extraction", error);
      }
    })());
  }

  if (requested.has("slices")) {
    tasks.push((async () => {
      if (!dependencies.loadSlices) {
        outputs.slices = failure("Slice extraction", "slice loader is unavailable");
        return;
      }
      try {
        const loadedValue = await dependencies.loadSlices();
        const dimensionWarning = getSliceDimensionWarning(design, loadedValue);
        const warning = [loadedValue.warning, dimensionWarning]
          .filter((item): item is string => Boolean(item))
          .join("; ") || undefined;
        const value = dimensionWarning
          ? { ...loadedValue, coordinateSpace: "unknown" as const, warning }
          : loadedValue;
        const empty = value.totalSlices <= 0 || value.slices.length === 0;
        const uncertainCoordinates = !empty && value.coordinateSpace === "unknown";
        outputs.slices = {
          status: uncertainCoordinates ? "partial_success" : "success",
          source: "sketch",
          completeness: empty ? "empty" : uncertainCoordinates ? "partial" : "complete",
          ...(uncertainCoordinates && warning ? { warning } : {}),
          value,
        };
      } catch (error) {
        outputs.slices = failure("Slice extraction", error);
      }
    })());
  }

  await Promise.all(tasks);
  const layersOnly = requested.size === 1 && requested.has("layers");
  let dimensions = resolveDesignDimensions(design, {
    schema: schemaDimensions,
    sketch: layersOnly
      ? undefined
      : sketchDimensions ?? htmlSketchDimensions ?? layoutSketchDimensions,
    layers: layerDimensions,
    slices: outputs.slices?.status === "success" ? outputs.slices.value : undefined,
    normalizedImage: normalizedImageDimensions,
  });
  if (!dimensions.analysis && sketchDimensionWarning) {
    dimensions = { ...dimensions, warning: sketchDimensionWarning };
  }
  if (outputs.image && outputs.image.status !== "error") {
    const analysisDimensions = dimensions.analysis
      ? {
        width: dimensions.analysis.width ?? undefined,
        height: dimensions.analysis.height ?? undefined,
      }
      : undefined;
    const pixelRatio = inferUniformDimensionRatio(imagePixelDimensions, analysisDimensions);
    if (pixelRatio !== undefined) outputs.image.pixelRatio = pixelRatio;
  }
  return {
    designId: design.id,
    designName: design.name,
    status: deriveAnalysisStatus(requested, outputs),
    outputs,
    dimensions,
    ...(imageContent ? { imageContent } : {}),
  };
}

export function renderDesignAnalysis(result: DesignAnalysisResult): string {
  const lines = [`--- ${result.designName} ---`, `Status: ${result.status}`];
  const { outputs } = result;

  if (outputs.html && outputs.html.status !== "error") {
    if (outputs.html.warning) lines.push(outputs.html.warning);
    lines.push("```html", outputs.html.value.code, "```");
    const mapping = outputs.html.value.imageUrlMapping;
    if (Object.keys(mapping).length > 0) {
      lines.push(`\nImage assets (${Object.keys(mapping).length}):`);
      for (const [localPath, remoteUrl] of Object.entries(mapping)) {
        lines.push(`  ${localPath} <- ${remoteUrl}`);
      }
    }
    if (outputs.html.value.annotations) {
      lines.push("\n--- Sketch Annotations ---", outputs.html.value.annotations);
    }
  }

  if (outputs.layout && outputs.layout.status !== "error") {
    if (outputs.layout.warning) lines.push(outputs.layout.warning);
    lines.push("\n--- Layout Summary ---", outputs.layout.value || "(no layout entries found)");
  }

  if (outputs.layers && outputs.layers.status !== "error") {
    if (outputs.layers.warning) lines.push(outputs.layers.warning);
    lines.push("\n--- Layer Structure ---", outputs.layers.value.tree || "(no layers found)");
    if (outputs.layers.value.truncated) {
      lines.push(`Layer tree truncated at depth ${outputs.layers.value.maxDepth}.`);
    }
  }

  if (outputs.tokens && outputs.tokens.status !== "error") {
    if (outputs.tokens.warning) lines.push(outputs.tokens.warning);
    lines.push("\n--- Design Tokens ---", outputs.tokens.value || "(no tokens found)");
  }

  if (outputs.image && outputs.image.status !== "error") {
    lines.push(`Image downloaded (${outputs.image.value.bytes} bytes).`);
  }

  if (outputs.slices && outputs.slices.status !== "error") {
    lines.push(`\n--- Slices ---`, `${outputs.slices.value.totalSlices} slice(s) found.`);
  }

  for (const output of Object.values(outputs)) {
    if (output?.status === "error") lines.push(output.error);
  }

  return lines.join("\n");
}
