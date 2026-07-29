import type { UnknownRecord } from "../shared/types.js";
import {
  resolveSketchCanvasDimensions,
  scaleSketchValue,
} from "../shared/sketch-coordinates.js";
import { formatSketchColor } from "../shared/sketch-colors.js";

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeColorValue(value: string): string {
  const compact = value.trim().replace(/\s*,\s*/g, ",");
  const normalized = compact.replace(
    /\b(rgba?)\(([^()]*)\)/gi,
    (match, functionName: string, rawArguments: string) => {
      const expectedParts = functionName.toLowerCase() === "rgba" ? 4 : 3;
      const parts = rawArguments.split(",");
      if (parts.length !== expectedParts) return match;
      const normalizedParts = parts.map((part) => {
        const trimmed = part.trim();
        const numeric = Number(trimmed);
        if (!trimmed || !Number.isFinite(numeric)) return trimmed;
        return Object.is(numeric, -0) ? "0" : String(numeric);
      });
      return `${functionName.toLowerCase()}(${normalizedParts.join(",")})`;
    },
  );
  return /^#[0-9a-f]{3,8}$/i.test(normalized) ? normalized.toLowerCase() : normalized;
}

function normalizeEmbeddedColors(value: string): string {
  return value.replace(/\b(?:rgba?)\([^()]*\)/gi, (color) => normalizeColorValue(color));
}

function normalizeTokenColor(color: UnknownRecord): string {
  const explicit = asString(color.value);
  if (explicit) return normalizeColorValue(explicit);
  const formatted = formatSketchColor(color) ?? "";
  return normalizeColorValue(formatted.replace(/^rgb\(([^()]*)\)$/i, "rgba($1,1)"));
}

function getDimensions(obj: UnknownRecord): { x: number; y: number; w: number; h: number } {
  const frame = isRecord(obj.ddsOriginFrame)
    ? obj.ddsOriginFrame
    : isRecord(obj.layerOriginFrame)
      ? obj.layerOriginFrame
      : isRecord(obj.frame)
        ? obj.frame
        : {};
  return {
    x: asNumber(frame.x ?? obj.left),
    y: asNumber(frame.y ?? obj.top),
    w: asNumber(frame.width ?? obj.width),
    h: asNumber(frame.height ?? obj.height),
  };
}

function simplifyFill(fill: UnknownRecord): string | undefined {
  if (fill.isEnabled === false) {
    return undefined;
  }
  const fillType = asNumber(fill.fillType);
  if (fillType === 0) {
    const color = isRecord(fill.color) ? fill.color : {};
    const value = normalizeTokenColor(color);
    return value ? `solid(${value})` : undefined;
  }
  if (fillType === 1) {
    const gradient = isRecord(fill.gradient) ? fill.gradient : {};
    const stops = Array.isArray(gradient.colorStops) ? gradient.colorStops.filter(isRecord) : [];
    const from = isRecord(gradient.from) ? gradient.from : {};
    const to = isRecord(gradient.to) ? gradient.to : {};
    const dx = asNumber(to.x, 0.5) - asNumber(from.x, 0.5);
    const dy = asNumber(to.y, 0) - asNumber(from.y, 0);
    const angle = ((Math.round((Math.atan2(dx, dy) * 180) / Math.PI) % 360) + 360) % 360;
    const parts = stops.map((stop) => {
      const color = isRecord(stop.color) ? stop.color : {};
      const value = normalizeTokenColor(color);
      return value
        ? `${value} ${Math.round(asNumber(stop.position) * 100)}%`
        : undefined;
    }).filter((part): part is string => Boolean(part));
    if (parts.length === 0 || parts.length !== stops.length) return undefined;
    return `linear-gradient(${angle}deg, ${parts.join(", ")})`;
  }
  return undefined;
}

function simplifyBorder(border: UnknownRecord, designScale = 1): string | undefined {
  if (border.isEnabled === false) {
    return undefined;
  }
  const color = isRecord(border.color) ? border.color : {};
  const colorValue = normalizeTokenColor(color);
  if (!colorValue) return undefined;
  const positionMap: Record<string, string> = { 内边框: "inside", 外边框: "outside", 中心边框: "center" };
  const thickness = scaleSketchValue(asNumber(border.thickness, 1), designScale);
  return `${thickness}px ${positionMap[asString(border.position)] ?? (asString(border.position) || "center")} ${colorValue}`;
}

function simplifyShadow(shadow: UnknownRecord, designScale = 1): string | undefined {
  if (shadow.isEnabled === false) {
    return undefined;
  }
  const color = isRecord(shadow.color) ? shadow.color : {};
  const colorValue = normalizeTokenColor(color);
  if (!colorValue) return undefined;
  return `${colorValue} ${scaleSketchValue(shadow.offsetX, designScale)}px ${scaleSketchValue(shadow.offsetY, designScale)}px ${scaleSketchValue(shadow.blurRadius, designScale)}px ${scaleSketchValue(shadow.spread, designScale)}px`;
}

export type LayerDepth = number | "all";

export interface LayerTreeResult {
  tree: string;
  truncated: boolean;
  maxDepth: LayerDepth;
  totalLayers: number;
  extractedLayers: number;
  sourceMissingFields: string[];
  normalizedMissingFields: string[];
  sourceArtboardDimensions?: { width: number; height: number };
  rootLayerDimensions?: { width: number; height: number };
}

export interface LayerTreeFallback {
  name?: string;
  width?: number;
  height?: number;
}

export function extractLayerTreeResult(
  sketch: UnknownRecord,
  maxDepth: LayerDepth = 4,
  fallback: LayerTreeFallback = {},
  designScale = 1,
): LayerTreeResult {
  const scale = designScale || 1;
  const artboard = isRecord(sketch.artboard) ? sketch.artboard : undefined;
  const board = isRecord(sketch.board) ? sketch.board : undefined;
  const infoLayers = Array.isArray(sketch.info) ? sketch.info.filter(isRecord) : [];
  const root = artboard ?? board ?? (infoLayers.length > 0 ? sketch : undefined);
  if (!root) {
    const normalizedName = asString(fallback.name);
    const normalizedWidth = asNumber(fallback.width);
    const normalizedHeight = asNumber(fallback.height);
    const normalizedMissingFields: string[] = [];
    if (!normalizedName) normalizedMissingFields.push("artboard.name");
    if (normalizedWidth <= 0) normalizedMissingFields.push("artboard.width");
    if (normalizedHeight <= 0) normalizedMissingFields.push("artboard.height");
    return {
      tree: normalizedMissingFields.length === 3
        ? ""
        : [
          `Artboard: ${normalizedName || "?"} (${Math.round(normalizedWidth)}x${Math.round(normalizedHeight)})`,
          "Total layers: 0",
          "",
        ].join("\n"),
      truncated: false,
      maxDepth,
      totalLayers: 0,
      extractedLayers: 0,
      sourceMissingFields: ["artboard.name", "artboard.width", "artboard.height"],
      normalizedMissingFields,
    };
  }

  const lines: string[] = [];
  let truncated = false;
  let extractedLayers = 0;

  const formatStyleBrief = (style: UnknownRecord): string => {
    const parts: string[] = [];
    const fills = Array.isArray(style.fills) ? style.fills.filter(isRecord) : [];
    for (const fill of fills) {
      if (fill.isEnabled === false) continue;
      const color = isRecord(fill.color) ? fill.color : {};
      if (Object.keys(color).length > 0) {
        parts.push(`fill:${asString(color.value) || "rgba(?)"}`);
      }
      if (fill.gradient) {
        parts.push(`gradient:${asString(isRecord(fill.gradient) ? fill.gradient.type : undefined) || "linear"}`);
      }
    }
    const borders = Array.isArray(style.borders) ? style.borders.filter(isRecord) : [];
    if (borders.some((border) => border.isEnabled !== false)) {
      parts.push(`border:${borders.length}`);
    }
    const shadows = Array.isArray(style.shadows) ? style.shadows.filter(isRecord) : [];
    if (shadows.some((shadow) => shadow.isEnabled !== false)) {
      parts.push(`shadow:${shadows.length}`);
    }
    return parts.join(" ");
  };

  const walk = (layer: UnknownRecord, depth = 0): void => {
    if (layer.visible === false || layer.isVisible === false) {
      return;
    }
    if (maxDepth !== "all" && depth > maxDepth) {
      truncated = true;
      return;
    }
    const frame = isRecord(layer.frame) ? layer.frame : layer;
    const w = scaleSketchValue(frame.width, scale);
    const h = scaleSketchValue(frame.height, scale);
    const x = scaleSketchValue(frame.left ?? frame.x, scale);
    const y = scaleSketchValue(frame.top ?? frame.y, scale);
    const type = asString(layer.type) || "?";
    const name = asString(layer.name) || "?";
    const sublayers = Array.isArray(layer.layers) ? layer.layers.filter(isRecord) : [];
    const style = isRecord(layer.style) ? layer.style : layer;
    let line = `${"  ".repeat(depth)}${type}: ${name} (${Math.round(w)}x${Math.round(h)} @${Math.round(x)},${Math.round(y)})`;

    if (type === "textLayer" || type === "text") {
      const text = isRecord(layer.text) ? layer.text : {};
      const textInfo = isRecord(layer.textInfo)
        ? layer.textInfo
        : Array.isArray(layer.textInfo) && isRecord(layer.textInfo[0])
          ? layer.textInfo[0]
          : {};
      const rawValue = asString(text.value ?? textInfo.text ?? layer.text);
      const clipped = rawValue.length > 40 ? `${rawValue.slice(0, 40)}...` : rawValue;
      if (clipped) {
        line += ` "${clipped}"`;
      }
    }

    const styleBrief = formatStyleBrief(style);
    if (styleBrief) {
      line += ` [${styleBrief}]`;
    }
    if (sublayers.length > 0) {
      line += ` (${sublayers.length} children)`;
    }
    lines.push(line);
    extractedLayers += 1;

    for (const child of sublayers) {
      walk(child, depth + 1);
    }
  };

  const frame = isRecord(root.frame) ? root.frame : root;
  const rawRootName = asString(root.name) || asString(sketch.psdName);
  const rawRootWidth = asNumber(frame.width);
  const rawRootHeight = asNumber(frame.height);
  const sourceMissingFields: string[] = [];
  if (!rawRootName) sourceMissingFields.push("artboard.name");
  if (rawRootWidth <= 0) sourceMissingFields.push("artboard.width");
  if (rawRootHeight <= 0) sourceMissingFields.push("artboard.height");
  const nestedLayers = Array.isArray(root.layers) ? root.layers.filter(isRecord) : [];
  const layers = nestedLayers.length > 0 ? nestedLayers : infoLayers;
  const sourceArtboardDimensions = rawRootWidth > 0 && rawRootHeight > 0
    ? { width: rawRootWidth, height: rawRootHeight }
    : undefined;
  const anchoredLayerDimensions: Array<{ width: number; height: number }> = [];
  const collectAnchoredLayerDimensions = (
    layer: UnknownRecord,
    ancestorsAnchored = true,
  ): void => {
    if (layer.visible === false || layer.isVisible === false) return;
    const layerFrame = isRecord(layer.frame) ? layer.frame : layer;
    const x = scaleSketchValue(layerFrame.left ?? layerFrame.x, scale);
    const y = scaleSketchValue(layerFrame.top ?? layerFrame.y, scale);
    const width = scaleSketchValue(layerFrame.width, scale);
    const height = scaleSketchValue(layerFrame.height, scale);
    const anchored = Math.abs(x) < 0.01 && Math.abs(y) < 0.01;
    if (ancestorsAnchored && anchored && width > 0 && height > 0) {
      anchoredLayerDimensions.push({ width, height });
    }
    const children = Array.isArray(layer.layers) ? layer.layers.filter(isRecord) : [];
    for (const child of children) {
      collectAnchoredLayerDimensions(child, ancestorsAnchored && anchored);
    }
  };
  for (const layer of layers) collectAnchoredLayerDimensions(layer);
  const rootLayerDimensions = anchoredLayerDimensions
    .sort((left, right) => right.width * right.height - left.width * left.height)[0];
  const resolvedCanvas = resolveSketchCanvasDimensions(sketch, scale, {
    width: fallback.width,
    height: fallback.height,
  }).dimensions;
  const rootName = rawRootName || asString(fallback.name) || "?";
  const rootWidth = rootLayerDimensions?.width
    ?? resolvedCanvas?.width
    ?? asNumber(fallback.width);
  const rootHeight = rootLayerDimensions?.height
    ?? resolvedCanvas?.height
    ?? asNumber(fallback.height);
  const normalizedMissingFields: string[] = [];
  if (rootName === "?") normalizedMissingFields.push("artboard.name");
  if (rootWidth <= 0) normalizedMissingFields.push("artboard.width");
  if (rootHeight <= 0) normalizedMissingFields.push("artboard.height");
  lines.push(`Artboard: ${rootName} (${Math.round(rootWidth)}x${Math.round(rootHeight)})`);
  lines.push(`Total layers: ${layers.length}`);
  lines.push("");

  for (const layer of layers) {
    walk(layer);
  }
  return {
    tree: lines.join("\n"),
    truncated,
    maxDepth,
    totalLayers: layers.length,
    extractedLayers,
    sourceMissingFields,
    normalizedMissingFields,
    ...(sourceArtboardDimensions ? { sourceArtboardDimensions } : {}),
    ...(rootLayerDimensions
      ? { rootLayerDimensions: { width: rootLayerDimensions.width, height: rootLayerDimensions.height } }
      : {}),
  };
}

export function extractLayerTree(
  sketch: UnknownRecord,
  maxDepth: LayerDepth = 4,
  designScale = 1,
): string {
  return extractLayerTreeResult(sketch, maxDepth, {}, designScale).tree;
}

export function extractDesignTokens(
  sketch: UnknownRecord | undefined,
  schema?: UnknownRecord,
  designScale = 1,
): string {
  const sketchScale = designScale || 1;
  const colors = new Map<string, number>();
  const fonts = new Map<string, number>();
  const fontSizes = new Map<string, number>();
  const lineHeights = new Map<string, number>();
  const letterSpacings = new Map<string, number>();
  const gradients = new Map<string, number>();
  const shadows = new Map<string, number>();
  const radii = new Map<string, number>();
  const borders = new Map<string, number>();

  const addTo = (map: Map<string, number>, key: string): void => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  const collectColor = (colorObj: unknown): void => {
    if (typeof colorObj === "string" && colorObj.trim()) {
      const normalized = normalizeColorValue(colorObj);
      if (!["none", "inherit", "initial", "unset"].includes(normalized.toLowerCase())) {
        addTo(colors, normalized);
      }
      return;
    }
    if (!isRecord(colorObj)) return;
    const v = normalizeTokenColor(colorObj);
    if (v && !v.includes("undefined") && !v.includes("NaN")) addTo(colors, v);
  };

  const readMetric = (value: unknown): number | undefined => {
    const metric = isRecord(value) ? value.value : value;
    if (typeof metric === "number" && Number.isFinite(metric)) return metric;
    if (typeof metric === "string" && metric.trim()) {
      const parsed = Number(metric);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  };

  const formatMetric = (value: number, source: unknown): string => {
    const unit = isRecord(source) ? asString(source.unit) : "";
    if (!unit || unit === "pixels" || unit === "pixel" || unit === "px") return `${value}px`;
    if (unit === "percent" || unit === "%") return `${value}%`;
    return `${value}${unit}`;
  };

  const formatSketchMetric = (value: number, source: unknown): string => {
    const unit = isRecord(source) ? asString(source.unit) : "";
    const normalized = unit === "percent" || unit === "%"
      ? value
      : scaleSketchValue(value, sketchScale);
    return formatMetric(normalized, source);
  };

  const isNonPositiveMetric = (value: unknown): boolean => {
    const metric = readMetric(value);
    if (metric !== undefined) return metric <= 0;
    if (typeof value !== "string") return false;
    const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:[a-z%]+)$/i);
    return match ? Number(match[1]) <= 0 : false;
  };

  const collectMetric = (
    map: Map<string, number>,
    value: unknown,
  ): void => {
    const metric = readMetric(value);
    if (metric !== undefined) addTo(map, formatSketchMetric(metric, value));
  };

  const collectFont = (fontObj: unknown): boolean => {
    if (!isRecord(fontObj)) return false;
    const name = asString(
      fontObj.name
      ?? fontObj.fontPostScriptName
      ?? fontObj.fontName
      ?? fontObj.fontFamily
      ?? fontObj.postScriptName,
    );
    const type = asString(fontObj.type ?? fontObj.fontStyleName ?? fontObj.fontWeight ?? fontObj.weight);
    const sizeValue = fontObj.size ?? fontObj.fontSize;
    if (isNonPositiveMetric(sizeValue)) return false;
    const size = readMetric(sizeValue);
    const parts: string[] = [];
    if (name) parts.push(name);
    if (type) parts.push(type);
    if (size !== undefined) {
      const formattedSize = formatSketchMetric(size, sizeValue);
      parts.push(formattedSize);
      addTo(fontSizes, formattedSize);
    }
    if (parts.length > 0) addTo(fonts, parts.join(" / "));
    collectMetric(lineHeights, fontObj.lineHeight ?? fontObj.leading);
    collectMetric(letterSpacings, fontObj.letterSpacing ?? fontObj.characterSpacing ?? fontObj.tracking);
    return true;
  };

  const collectTypography = (value: unknown): void => {
    if (!isRecord(value)) return;
    const font = isRecord(value.font) ? value.font : value;
    if (!collectFont(font)) return;
    if (font !== value) {
      collectMetric(lineHeights, value.lineHeight ?? value.leading);
      collectMetric(letterSpacings, value.letterSpacing ?? value.characterSpacing ?? value.tracking);
    }
  };

  const formatCssMetric = (value: unknown): string | undefined => {
    const metric = readMetric(value);
    if (metric !== undefined) return formatMetric(metric, value);
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
  };

  const collectSchemaStyle = (style: UnknownRecord): void => {
    for (const key of [
      "color",
      "backgroundColor",
      "borderColor",
      "outlineColor",
      "textDecorationColor",
      "fill",
      "stroke",
    ] as const) {
      collectColor(style[key]);
    }

    for (const key of ["background", "backgroundImage"] as const) {
      const value = asString(style[key]).trim();
      if (!value) continue;
      if (value.includes("gradient(")) {
        addTo(gradients, normalizeEmbeddedColors(value.replace(/\s*,\s*/g, ", ")));
      } else if (/^(?:#|rgba?\(|hsla?\(|transparent$)/i.test(value)) {
        collectColor(value);
      }
    }

    if (!isNonPositiveMetric(style.fontSize)) {
      const fontFamily = asString(style.fontFamily).trim();
      const fontWeight = typeof style.fontWeight === "number"
        ? String(style.fontWeight)
        : asString(style.fontWeight).trim();
      const fontSize = formatCssMetric(style.fontSize);
      const fontParts = [fontFamily, fontWeight, fontSize].filter(Boolean);
      if (fontParts.length > 0) addTo(fonts, fontParts.join(" / "));
      if (fontSize) addTo(fontSizes, fontSize);

      const lineHeight = formatCssMetric(style.lineHeight);
      if (lineHeight) addTo(lineHeights, lineHeight);
      const letterSpacing = formatCssMetric(style.letterSpacing);
      if (letterSpacing) addTo(letterSpacings, letterSpacing);
    }

    for (const key of [
      "border",
      "borderTop",
      "borderRight",
      "borderBottom",
      "borderLeft",
    ] as const) {
      const value = asString(style[key]).trim();
      if (value && value !== "0" && value !== "none") {
        addTo(borders, normalizeEmbeddedColors(value));
      }
    }

    for (const key of ["boxShadow", "textShadow"] as const) {
      const value = asString(style[key]).trim();
      if (value && value !== "none") {
        addTo(shadows, normalizeEmbeddedColors(value.replace(/\s*,\s*/g, ", ")));
      }
    }

    for (const key of [
      "borderRadius",
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
    ] as const) {
      const value = formatCssMetric(style[key]);
      if (value && value !== "0" && value !== "0px") addTo(radii, value);
    }
  };

  const walkSchema = (node: UnknownRecord): void => {
    const directStyle = isRecord(node.style) ? node.style : {};
    const props = isRecord(node.props) ? node.props : {};
    const propsStyle = isRecord(props.style) ? props.style : {};
    collectSchemaStyle({ ...directStyle, ...propsStyle });

    const children = Array.isArray(node.children) ? node.children.filter(isRecord) : [];
    for (const child of children) walkSchema(child);
  };

  const walk = (layer: UnknownRecord): void => {
    if (layer.visible === false || layer.isVisible === false) return;

    const style = isRecord(layer.style) ? layer.style : layer;
    const fills = Array.isArray(style.fills) ? style.fills.filter(isRecord) : [];
    const borderList = Array.isArray(style.borders) ? style.borders.filter(isRecord) : [];
    const shadowList = Array.isArray(style.shadows) ? style.shadows.filter(isRecord) : [];

    // Collect fill colors and gradients
    for (const fill of fills) {
      if (fill.isEnabled === false) continue;
      const fillType = asNumber(fill.fillType);
      if (fillType === 1) {
        const simplified = simplifyFill(fill);
        if (simplified) addTo(gradients, simplified);
      } else {
        if (isRecord(fill.color)) collectColor(fill.color);
      }
    }

    // Collect border colors
    for (const border of borderList) {
      if (border.isEnabled === false) continue;
      if (isRecord(border.color)) collectColor(border.color);
      const simplified = simplifyBorder(border, sketchScale);
      if (simplified) addTo(borders, simplified);
    }

    // Collect shadow tokens
    for (const shadow of shadowList) {
      if (shadow.isEnabled === false) continue;
      if (isRecord(shadow.color)) collectColor(shadow.color);
      const simplified = simplifyShadow(shadow, sketchScale);
      if (simplified) addTo(shadows, simplified);
    }

    const legacyFill = isRecord(layer.fill) ? layer.fill : undefined;
    if (legacyFill && isRecord(legacyFill.color)) collectColor(legacyFill.color);

    const layerEffects = isRecord(layer.layerEffects) ? layer.layerEffects : undefined;
    if (layerEffects) {
      const borderEffect = isRecord(layerEffects.frameFX)
        ? layerEffects.frameFX
        : isRecord(layerEffects.solidFill)
          ? layerEffects.solidFill
          : undefined;
      if (borderEffect && borderEffect.enabled !== false) {
        if (isRecord(borderEffect.color)) collectColor(borderEffect.color);
        const normalizedBorder: UnknownRecord = {
          ...borderEffect,
          isEnabled: borderEffect.enabled,
          thickness: borderEffect.thickness ?? borderEffect.size,
          position: borderEffect.position ?? borderEffect.style,
        };
        const simplified = simplifyBorder(normalizedBorder, sketchScale);
        if (simplified) addTo(borders, simplified);
      }

      for (const key of ["dropShadow", "dropShadowMulti", "innerShadow", "innerShadowMulti"] as const) {
        const rawEffects = Array.isArray(layerEffects[key]) ? layerEffects[key] : [layerEffects[key]];
        for (const rawEffect of rawEffects) {
          if (!isRecord(rawEffect) || rawEffect.enabled === false) continue;
          if (isRecord(rawEffect.color)) collectColor(rawEffect.color);
          const angleValue = isRecord(rawEffect.localLightingAngle)
            ? asNumber(rawEffect.localLightingAngle.value, 90)
            : asNumber(rawEffect.localLightingAngle, 90);
          const distance = asNumber(rawEffect.distance);
          const angle = (angleValue * Math.PI) / 180;
          const normalizedShadow: UnknownRecord = {
            ...rawEffect,
            isEnabled: rawEffect.enabled,
            offsetX: rawEffect.offsetX ?? Math.round(distance * Math.cos(angle) * 100) / 100,
            offsetY: rawEffect.offsetY ?? Math.round(distance * Math.sin(angle) * 100) / 100,
            blurRadius: rawEffect.blurRadius ?? rawEffect.blur,
            spread: rawEffect.spread ?? rawEffect.chokeMatte,
          };
          const simplified = simplifyShadow(normalizedShadow, sketchScale);
          if (simplified) addTo(shadows, `${key.startsWith("inner") ? "inset " : ""}${simplified}`);
        }
      }
    }

    // Collect border radius
    if (Array.isArray(layer.radius) && layer.radius.length > 0) {
      const vals = (layer.radius as unknown[]).map((v) => scaleSketchValue(v, sketchScale));
      const unique = [...new Set(vals)];
      if (unique.length === 1) {
        if (unique[0] !== 0) addTo(radii, `${unique[0]}px`);
      } else {
        addTo(radii, vals.map((v) => `${v}px`).join(" "));
      }
    } else if (typeof layer.radius === "number" && layer.radius !== 0) {
      addTo(radii, `${scaleSketchValue(layer.radius, sketchScale)}px`);
    }

    // Collect font and text color from artboard textLayer format
    if (["textLayer", "text"].includes(asString(layer.type))) {
      const text = isRecord(layer.text) ? layer.text : {};
      const textStyle = isRecord(text.style) ? text.style : {};
      if (isRecord(textStyle.color)) collectColor(textStyle.color);
      collectTypography(textStyle);

      // Board formats use either one textInfo object or an array of text runs.
      const textInfoList = Array.isArray(layer.textInfo)
        ? layer.textInfo.filter(isRecord)
        : isRecord(layer.textInfo)
          ? [layer.textInfo]
          : [];
      for (const ti of textInfoList) {
        if (isRecord(ti.color)) collectColor(ti.color);
        collectTypography(ti);
      }
    }

    const children = Array.isArray(layer.layers) ? layer.layers.filter(isRecord) : [];
    for (const child of children) walk(child);
  };

  // Entry points: artboard.layers, board.layers, info[]
  const artboard = sketch && isRecord(sketch.artboard) ? sketch.artboard : undefined;
  const board = sketch && isRecord(sketch.board) ? sketch.board : undefined;
  if (artboard && Array.isArray(artboard.layers)) {
    for (const layer of artboard.layers.filter(isRecord)) walk(layer);
  }
  if (board && Array.isArray(board.layers)) {
    for (const layer of board.layers.filter(isRecord)) walk(layer);
  }
  if (sketch && Array.isArray(sketch.info)) {
    for (const item of sketch.info.filter(isRecord)) walk(item);
  }
  if (schema) walkSchema(schema);

  const sortedEntries = (map: Map<string, number>): [string, number][] =>
    [...map.entries()].sort((a, b) => b[1] - a[1]);

  const formatSection = (title: string, map: Map<string, number>): string => {
    if (map.size === 0) return "";
    const lines = [`${title} (${map.size} unique):`];
    for (const [key, count] of sortedEntries(map)) {
      lines.push(`  ${key} x${count}`);
    }
    return lines.join("\n");
  };

  const sections = [
    formatSection("Colors", colors),
    formatSection("Fonts", fonts),
    formatSection("Font Sizes", fontSizes),
    formatSection("Line Heights", lineHeights),
    formatSection("Letter Spacing", letterSpacings),
    formatSection("Gradients", gradients),
    formatSection("Shadows", shadows),
    formatSection("Borders", borders),
    formatSection("Border Radius", radii),
  ].filter(Boolean);

  if (sections.length === 0) return "";
  return `=== Design Tokens ===\n\n${sections.join("\n\n")}`;
}
