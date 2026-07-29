import type { UnknownRecord } from "../shared/types.js";
import { minifyHtml } from "../shared/html.js";
import {
  inferSketchScale,
  resolveSketchCanvasDimensions,
} from "../shared/sketch-coordinates.js";
import { formatSketchColor, normalizeSketchOpacity } from "../shared/sketch-colors.js";

export interface LayerAnnotation {
  name: string;
  type: string;
  css: Record<string, string>;
  text?: string;
  slice_url?: string;
}

export interface SketchToHtmlResult {
  html: string;
  imageUrlMapping: Record<string, string>;
  layerAnnotations: LayerAnnotation[];
  canvasSize: { width: number; height: number };
  hasStructuredLayers: boolean;
}

interface LogicalCanvasDimensions {
  width?: number;
  height?: number;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function px(value: unknown, scale: number): number {
  if (value == null) return 0;
  return Math.round((Number(value) / scale) * 10) / 10;
}

function colorCss(c: unknown, opacity: unknown = 100): string | null {
  return formatSketchColor(c, opacity);
}

function getOpacity(layer: UnknownRecord): number {
  const bo = isRecord(layer.blendOptions) ? layer.blendOptions : {};
  if ("opacity" in bo) {
    const op = bo.opacity;
    return normalizeSketchOpacity(isRecord(op) ? op.value : op) * 100;
  }
  if (layer.opacity !== undefined) {
    return normalizeSketchOpacity(layer.opacity) * 100;
  }
  return 100;
}

function extractBorderRadius(layer: UnknownRecord, scale: number): string | null {
  const directRadius = Array.isArray(layer.radius)
    ? layer.radius
    : Array.isArray(layer.cornerRadius)
      ? layer.cornerRadius
      : typeof layer.radius === "number"
        ? [layer.radius]
        : typeof layer.cornerRadius === "number"
          ? [layer.cornerRadius]
          : [];
  if (directRadius.length > 0) {
    const values = directRadius.map((value) => px(value, scale));
    if (values.some((value) => value > 0)) {
      return new Set(values).size === 1
        ? `${values[0]}px`
        : values.map((value) => `${value}px`).join(" ");
    }
  }

  const path = isRecord(layer.path) ? layer.path : {};
  const comps = Array.isArray(path.pathComponents) ? path.pathComponents : [];
  if (comps.length === 0) return null;
  const origin = isRecord(comps[0]) && isRecord(comps[0].origin) ? comps[0].origin : {};
  const radii = Array.isArray(origin.radii) ? origin.radii : null;
  if (!radii) return null;
  const r = radii.map((v: unknown) => px(v, scale));
  if (new Set(r).size === 1 && r[0] > 0) return `${r[0]}px`;
  if (r.some((v: number) => v > 0)) return `${r[0]}px ${r[1]}px ${r[2]}px ${r[3]}px`;
  return null;
}

function extractShadow(effects: UnknownRecord, scale: number): string | null {
  const shadows: string[] = [];
  for (const key of ["dropShadow", "innerShadow"] as const) {
    const fx = isRecord(effects[key]) ? effects[key] : null;
    if (!fx || !(fx as UnknownRecord).enabled) continue;
    const fxRec = fx as UnknownRecord;
    const c = isRecord(fxRec.color) ? fxRec.color : {};
    const opObj = fxRec.opacity;
    const opVal = isRecord(opObj) ? opObj.value ?? 100 : opObj ?? 100;
    const color = formatSketchColor(c, opVal);
    if (!color) continue;

    const angleObj = fxRec.localLightingAngle;
    const angleDeg = isRecord(angleObj) ? Number(angleObj.value ?? 90) : 90;
    const angleRad = (angleDeg * Math.PI) / 180;
    const dist = px(fxRec.distance ?? 0, scale);
    const blur = px(fxRec.blur ?? 0, scale);
    const spread = px(fxRec.chokeMatte ?? 0, scale);
    const ox = Math.round(-dist * Math.cos(angleRad) * 10) / 10;
    const oy = Math.round(dist * Math.sin(angleRad) * 10) / 10;

    const inset = key === "innerShadow" ? "inset " : "";
    const spreadStr = spread ? ` ${spread}px` : "";
    shadows.push(`${inset}${ox}px ${oy}px ${blur}px${spreadStr} ${color}`);
  }
  return shadows.length > 0 ? shadows.join(",") : null;
}

function extractBorder(effects: UnknownRecord, scale: number): string | null {
  const stroke = isRecord(effects.frameFX)
    ? effects.frameFX
    : isRecord(effects.solidFill)
      ? effects.solidFill
      : null;
  if (!stroke || !(stroke as UnknownRecord).enabled) return null;
  const s = stroke as UnknownRecord;
  const size = px(s.size ?? 1, scale);
  const c = isRecord(s.color) ? s.color : {};
  const color = colorCss(c, s.opacity ?? 100);
  return color ? `${size}px solid ${color}` : null;
}

function parseFontWeight(styleName: unknown): number | null {
  if (typeof styleName !== "string" || !styleName) return null;
  const m = styleName.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function safeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeContent(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "\n");
}

function safeCssString(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n\f]/g, " ");
}

function allowedRemoteUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function stableResourceHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safeResourceSegment(value: unknown, fallback: string): string {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function resourceExtension(remoteUrl: string, fallback: string): string {
  const pathname = new URL(remoteUrl).pathname;
  const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
  if (match && ["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico"].includes(match[1].toLowerCase())) {
    return `.${match[1].toLowerCase()}`;
  }
  return fallback;
}

interface LayerResource {
  remoteUrl: string;
  fallbackExtension: string;
}

function getLayerResource(layer: UnknownRecord): LayerResource | undefined {
  const images = isRecord(layer.images) ? layer.images : {};
  const image = isRecord(layer.image) ? layer.image : {};
  const ddsImage = isRecord(layer.ddsImage) ? layer.ddsImage : {};
  const candidates: Array<[unknown, string]> = [
    [images.png_xxxhd, ".png"],
    [images.svg, ".svg"],
    [image.imageUrl, ".png"],
    [image.svgUrl, ".svg"],
    [ddsImage.imageUrl, ".png"],
  ];
  for (const [value, fallbackExtension] of candidates) {
    const remoteUrl = allowedRemoteUrl(value);
    if (remoteUrl) return { remoteUrl, fallbackExtension };
  }
  return undefined;
}

interface FlatLayer extends UnknownRecord {
  __visible: true;
}

function flattenLayers(rawLayers: unknown[], scale: number): FlatLayer[] {
  const result: FlatLayer[] = [];

  const flatten = (layer: unknown): void => {
    if (!isRecord(layer)) return;
    if (layer.visible === false) return;

    const w = Number(layer.width ?? 0) || 0;
    const h = Number(layer.height ?? 0) || 0;
    if (w === 0 && h === 0) {
      const children = Array.isArray(layer.layers) ? layer.layers : [];
      for (let i = children.length - 1; i >= 0; i--) flatten(children[i]);
      return;
    }

    const ltype = String(layer.type ?? "");
    if (ltype === "layerSection") {
      const images = isRecord(layer.images) ? layer.images : {};
      if (images.png_xxxhd || images.svg) {
        result.push(layer as FlatLayer);
      } else {
        const children = Array.isArray(layer.layers) ? layer.layers : [];
        for (let i = children.length - 1; i >= 0; i--) flatten(children[i]);
      }
      return;
    }

    result.push(layer as FlatLayer);
  };

  for (let i = rawLayers.length - 1; i >= 0; i--) {
    flatten(rawLayers[i]);
  }
  return result;
}

function flattenArtboardLayers(rawLayers: unknown[], scale: number): FlatLayer[] {
  const result: FlatLayer[] = [];

  const flatten = (layer: unknown): void => {
    if (!isRecord(layer)) return;
    if (layer.visible === false || layer.isVisible === false) return;

    const frame = isRecord(layer.frame) ? layer.frame : {};
    const w = Number(frame.width ?? 0) || 0;
    const h = Number(frame.height ?? 0) || 0;
    if (w === 0 && h === 0) {
      const children = Array.isArray(layer.layers) ? layer.layers : [];
      for (let i = children.length - 1; i >= 0; i--) flatten(children[i]);
      return;
    }

    // Artboard layers use frame.left/top or frame.x/y for coordinates
    const frameX = frame.left ?? frame.x ?? 0;
    const frameY = frame.top ?? frame.y ?? 0;

    const ltype = String(layer.type ?? "");
    if (ltype === "groupLayer" || ltype === "symbolInstence") {
      const imageData = isRecord(layer.image) ? layer.image : {};
      if (imageData.imageUrl || imageData.svgUrl) {
        result.push({
          ...layer,
          left: frameX,
          top: frameY,
          width: frame.width ?? 0,
          height: frame.height ?? 0,
          __visible: true,
        } as FlatLayer);
      } else {
        const children = Array.isArray(layer.layers) ? layer.layers : [];
        for (let i = children.length - 1; i >= 0; i--) flatten(children[i]);
      }
      return;
    }

    const textObj = isRecord(layer.text) ? layer.text : {};
    const textStyle = isRecord(textObj.style) ? textObj.style : {};
    const fontObj = isRecord(textStyle.font) ? textStyle.font : {};

    const mapped: UnknownRecord = {
      ...layer,
      left: frameX,
      top: frameY,
      width: frame.width ?? 0,
      height: frame.height ?? 0,
      __visible: true,
    };

    if (ltype === "textLayer" && Object.keys(fontObj).length > 0) {
      const colorObj = isRecord(textStyle.color) ? textStyle.color : {};
      mapped.textInfo = {
        text: String(textObj.value ?? ""),
        color: Object.keys(colorObj).length > 0 ? colorObj : undefined,
        size: fontObj.size ?? 0,
        fontPostScriptName: fontObj.name ?? fontObj.postScriptName,
        fontName: fontObj.name,
        fontStyleName: fontObj.type ?? "",
        bold: fontObj.bold ?? false,
        italic: fontObj.italic ?? false,
        justification: fontObj.align ?? "left",
        leading: isRecord(fontObj.lineHeight) ? fontObj.lineHeight.value : fontObj.lineHeight,
      };
    }

    result.push(mapped as FlatLayer);
  };

  for (let i = rawLayers.length - 1; i >= 0; i--) {
    flatten(rawLayers[i]);
  }
  return result;
}

function getSketchLayers(
  sketchData: UnknownRecord,
  scale: number,
  fallbackDimensions?: LogicalCanvasDimensions,
): {
  boardW: number;
  boardH: number;
  layers: FlatLayer[];
} {
  const fallbackWidth = Number(fallbackDimensions?.width);
  const fallbackHeight = Number(fallbackDimensions?.height);
  const trustedFallbackWidth = Number.isFinite(fallbackWidth) && fallbackWidth > 0 ? fallbackWidth : 0;
  const trustedFallbackHeight = Number.isFinite(fallbackHeight) && fallbackHeight > 0 ? fallbackHeight : 0;
  const resolveCanvas = (
    width: unknown,
    height: unknown,
    layers: FlatLayer[],
    dimensionsAreLogical = false,
    allowMeasuredFallback = true,
  ): { boardW: number; boardH: number; layers: FlatLayer[] } => {
    const measuredWidth = layers.reduce(
      (maximum, layer) => Math.max(maximum, px(Number(layer.left ?? 0) + Number(layer.width ?? 0), scale)),
      0,
    );
    const measuredHeight = layers.reduce(
      (maximum, layer) => Math.max(maximum, px(Number(layer.top ?? 0) + Number(layer.height ?? 0), scale)),
      0,
    );
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    const scaledWidth = dimensionsAreLogical
      ? (Number.isFinite(numericWidth) && numericWidth > 0 ? numericWidth : 0)
      : px(width, scale);
    const scaledHeight = dimensionsAreLogical
      ? (Number.isFinite(numericHeight) && numericHeight > 0 ? numericHeight : 0)
      : px(height, scale);
    return {
      boardW: scaledWidth > 0
        ? scaledWidth
        : (allowMeasuredFallback ? measuredWidth : 0) || trustedFallbackWidth,
      boardH: scaledHeight > 0
        ? scaledHeight
        : (allowMeasuredFallback ? measuredHeight : 0) || trustedFallbackHeight,
      layers,
    };
  };

  const info = Array.isArray(sketchData.info) ? sketchData.info.filter(isRecord) : [];
  if (isRecord(sketchData.board) && (Array.isArray(sketchData.board.layers) && sketchData.board.layers.length > 0 || info.length === 0)) {
    const board = sketchData.board;
    return resolveCanvas(
      board.width,
      board.height,
      flattenLayers(Array.isArray(board.layers) ? board.layers : [], scale),
    );
  }

  if (isRecord(sketchData.artboard) && (Array.isArray(sketchData.artboard.layers) && sketchData.artboard.layers.length > 0 || info.length === 0)) {
    const artboard = sketchData.artboard;
    const frame = isRecord(artboard.frame) ? artboard.frame : {};
    return resolveCanvas(
      frame.width,
      frame.height,
      flattenArtboardLayers(Array.isArray(artboard.layers) ? artboard.layers : [], scale),
    );
  }

  if (info.length > 0) {
    const layers = flattenLayers(info, scale);
    const canvasResult = resolveSketchCanvasDimensions(sketchData, scale, fallbackDimensions);
    return resolveCanvas(
      canvasResult.dimensions?.width,
      canvasResult.dimensions?.height,
      layers,
      true,
      !canvasResult.warning,
    );
  }

  return {
    boardW: trustedFallbackWidth,
    boardH: trustedFallbackHeight,
    layers: [],
  };
}

function createLayerAnnotation(layer: FlatLayer, scale: number): LayerAnnotation {
  const ltype = String(layer.type ?? "");
  const opacity = getOpacity(layer);
  const effects = isRecord(layer.layerEffects) ? layer.layerEffects : {};
  const annotation: LayerAnnotation = {
    name: String(layer.name ?? ""),
    type: ltype,
    css: {
      position: "absolute",
      left: `${px(layer.left ?? 0, scale)}px`,
      top: `${px(layer.top ?? 0, scale)}px`,
      width: `${px(layer.width ?? 0, scale)}px`,
      height: `${px(layer.height ?? 0, scale)}px`,
    },
  };

  if (opacity < 100) {
    annotation.css.opacity = String(Math.round((opacity / 100) * 100) / 100);
  }

  const borderRadius = extractBorderRadius(layer, scale);
  if (borderRadius) annotation.css["border-radius"] = borderRadius;
  const shadow = extractShadow(effects, scale);
  if (shadow) annotation.css["box-shadow"] = shadow;
  const border = extractBorder(effects, scale);
  if (border) annotation.css.border = border;

  const images = isRecord(layer.images) ? layer.images : {};
  const image = isRecord(layer.image) ? layer.image : {};
  const ddsImage = isRecord(layer.ddsImage) ? layer.ddsImage : {};
  const sliceUrl = String(
    images.png_xxxhd
    ?? images.svg
    ?? image.imageUrl
    ?? image.svgUrl
    ?? ddsImage.imageUrl
    ?? "",
  );
  if (sliceUrl) annotation.slice_url = sliceUrl;

  if (["textLayer", "text"].includes(ltype) && isRecord(layer.textInfo)) {
    const textInfo = layer.textInfo;
    annotation.text = String(textInfo.text ?? "");
    const textColor = colorCss(textInfo.color);
    if (textColor) annotation.css.color = textColor;
    const fontSize = px(textInfo.size ?? 0, scale);
    if (fontSize) annotation.css["font-size"] = `${fontSize}px`;
    const fontName = String(textInfo.fontPostScriptName ?? textInfo.fontName ?? "");
    if (fontName) annotation.css["font-family"] = fontName;
    const fontStyleName = String(textInfo.fontStyleName ?? "");
    const fontWeight = parseFontWeight(fontStyleName);
    if (fontWeight) {
      annotation.css["font-weight"] = String(fontWeight);
    } else if (fontStyleName) {
      annotation.css["font-weight"] = fontStyleName;
    }
    const justification = String(textInfo.justification ?? "left");
    if (justification !== "left") annotation.css["text-align"] = justification;
    const leading = Number(textInfo.leading ?? 0);
    if (Number.isFinite(leading) && leading > 0) annotation.css["line-height"] = `${px(leading, scale)}px`;
    const tracking = Number(textInfo.tracking ?? 0);
    if (Number.isFinite(tracking) && tracking !== 0) annotation.css["letter-spacing"] = `${tracking}px`;
  } else {
    const fill = isRecord(layer.fill) ? layer.fill : {};
    const style = isRecord(layer.style) ? layer.style : layer;
    const fills = Array.isArray(style.fills) ? style.fills.filter(isRecord) : [];
    const firstFill = fills.find((candidate) => candidate.isEnabled !== false && isRecord(candidate.color));
    const fillColor = colorCss(
      firstFill && isRecord(firstFill.color)
        ? firstFill.color
        : isRecord(fill.color)
          ? fill.color
          : null,
    );
    if (fillColor) annotation.css["background-color"] = fillColor;

    const borders = Array.isArray(style.borders) ? style.borders.filter(isRecord) : [];
    const firstBorder = borders.find((candidate) => candidate.isEnabled !== false && isRecord(candidate.color));
    if (firstBorder && isRecord(firstBorder.color)) {
      const borderColor = colorCss(firstBorder.color, firstBorder.opacity ?? 100);
      if (borderColor) annotation.css.border = `${px(firstBorder.thickness ?? 1, scale)}px solid ${borderColor}`;
    }

    const shadows = Array.isArray(style.shadows) ? style.shadows.filter(isRecord) : [];
    const shadowValues = shadows
      .filter((candidate) => candidate.isEnabled !== false && isRecord(candidate.color))
      .map((candidate) => {
        const shadowColor = colorCss(candidate.color, candidate.opacity ?? 100);
        return shadowColor
          ? `${px(candidate.offsetX ?? 0, scale)}px ${px(candidate.offsetY ?? 0, scale)}px ${px(candidate.blurRadius ?? 0, scale)}px ${px(candidate.spread ?? 0, scale)}px ${shadowColor}`
          : "";
      })
      .filter(Boolean);
    if (shadowValues.length > 0) annotation.css["box-shadow"] = shadowValues.join(",");
  }

  return annotation;
}

export function extractLayerAnnotationsFromSketch(
  sketchData: UnknownRecord,
  designScale = 2.0,
): LayerAnnotation[] {
  const scale = designScale || 2.0;
  return getSketchLayers(sketchData, scale).layers.map((layer) => createLayerAnnotation(layer, scale));
}

export function convertSketchToHtml(
  sketchData: UnknownRecord,
  designScale = 2.0,
  designImgUrl = "",
  fallbackDimensions?: LogicalCanvasDimensions,
): SketchToHtmlResult {
  const scale = designScale || 2.0;

  const { boardW, boardH, layers } = getSketchLayers(sketchData, scale, fallbackDimensions);

  const cssRules: string[] = [];
  const htmlParts: string[] = [];
  const imageUrlMapping: Record<string, string> = {};
  const remoteToLocalPath = new Map<string, string>();
  const layerAnnotations: LayerAnnotation[] = [];

  const registerResource = (
    remoteValue: unknown,
    category: "slices" | "designs",
    name: unknown,
    identifier: unknown,
    index: number,
    fallbackExtension: string,
  ): string | undefined => {
    const remoteUrl = allowedRemoteUrl(remoteValue);
    if (!remoteUrl) return undefined;
    const existing = remoteToLocalPath.get(remoteUrl);
    if (existing) return existing;

    const base = safeResourceSegment(name, category === "designs" ? "design" : "layer");
    const id = safeResourceSegment(identifier, String(index + 1));
    const hash = stableResourceHash(remoteUrl);
    const extension = resourceExtension(remoteUrl, fallbackExtension);
    const prefix = `./assets/${category}/${base}_${id}_${hash}`;
    let localPath = `${prefix}${extension}`;
    let collisionIndex = 2;
    while (imageUrlMapping[localPath] && imageUrlMapping[localPath] !== remoteUrl) {
      localPath = `${prefix}_${collisionIndex}${extension}`;
      collisionIndex += 1;
    }
    imageUrlMapping[localPath] = remoteUrl;
    remoteToLocalPath.set(remoteUrl, localPath);
    return localPath;
  };

  for (let idx = 0; idx < layers.length; idx++) {
    const L = layers[idx];
    const cls = `el${idx + 1}`;
    const ltype = String(L.type ?? "");
    const name = String(L.name ?? "");
    const left = px(L.left ?? 0, scale);
    const top = px(L.top ?? 0, scale);
    const w = px(L.width ?? 0, scale);
    const h = px(L.height ?? 0, scale);

    const opacity = getOpacity(L);
    const annot = createLayerAnnotation(L, scale);

    const props: string[] = [
      "position:absolute",
      `left:${left}px`,
      `top:${top}px`,
      `width:${w}px`,
      `height:${h}px`,
    ];

    if (opacity < 100) {
      const opCss = Math.round((opacity / 100) * 100) / 100;
      props.push(`opacity:${opCss}`);
    }

    const br = extractBorderRadius(L, scale);
    if (br) {
      props.push(`border-radius:${br}`);
      props.push("overflow:hidden");
    }

    let textContent = "";
    let isSlice = false;
    let sliceLocalPath = "";

    const layerResource = getLayerResource(L);
    if (layerResource) {
      sliceLocalPath = registerResource(
        layerResource.remoteUrl,
        "slices",
        name,
        L.id ?? L.objectID ?? L.uuid,
        idx,
        layerResource.fallbackExtension,
      ) ?? "";
    }
    if (sliceLocalPath) {
      isSlice = true;
    }

    if (["textLayer", "text"].includes(ltype) && isRecord(L.textInfo)) {
      const ti = L.textInfo as UnknownRecord;
      textContent = String(ti.text ?? "");
      props.push("z-index:10");
      const textColor = colorCss(ti.color);
      if (textColor) {
        props.push(`color:${textColor}`);
      }
      const fontSize = px(ti.size ?? 0, scale);
      if (fontSize) {
        props.push(`font-size:${fontSize}px`);
      }
      const fontName = String(ti.fontPostScriptName ?? ti.fontName ?? "");
      if (fontName) {
        props.push(
          `font-family:"${safeCssString(fontName)}","PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif`,
        );
      }
      const fontStyleName = String(ti.fontStyleName ?? "");
      const fw = parseFontWeight(fontStyleName);
      if (fw) {
        props.push(`font-weight:${fw}`);
      }
      if (ti.bold && !fw) {
        props.push("font-weight:bold");
      }
      if (ti.italic) {
        props.push("font-style:italic");
      }
      const just = String(ti.justification ?? "left");
      if (just !== "left") {
        props.push(`text-align:${just}`);
      }
      const leading = Number(ti.leading ?? 0);
      if (Number.isFinite(leading) && leading > 0) {
        props.push(`line-height:${px(leading, scale)}px`);
      }
      const tracking = Number(ti.tracking ?? 0);
      if (Number.isFinite(tracking) && tracking !== 0) {
        props.push(`letter-spacing:${tracking}px`);
      }
      const lines = textContent.split("\r").filter(Boolean);
      const lineCount = Math.max(lines.length, 1);
      if (leading <= 0) {
        if (lineCount > 1 && h > 0 && fontSize > 0) {
          const lh = Math.round((h / lineCount) * 10) / 10;
          props.push(`line-height:${lh}px`);
        } else {
          props.push("line-height:1");
        }
      }
      props.push("white-space:pre-wrap");
      props.push("overflow:hidden");
      props.push("word-break:break-all");
    } else if (isSlice) {
      props.push("z-index:5");
    }

    for (const property of ["background-color", "border", "box-shadow"] as const) {
      const value = annot.css[property];
      if (value) props.push(`${property}:${value}`);
    }

    cssRules.push(`.${cls}{${props.join(";")}}`);

    const safeName = safeAttr(name);
    const cssData = Object.entries(annot.css)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    const safeCss = safeAttr(cssData);

    if (textContent) {
      htmlParts.push(
        `<div class="${cls}" title="${safeName}" data-css="${safeCss}">${safeContent(textContent)}</div>`,
      );
    } else if (isSlice) {
      htmlParts.push(
        `<img class="${cls}" title="${safeName}" data-css="${safeCss}" src="${safeAttr(sliceLocalPath)}" referrerpolicy="no-referrer" />`,
      );
    } else {
      htmlParts.push(`<div class="${cls}" title="${safeName}" data-css="${safeCss}"></div>`);
    }

    layerAnnotations.push(annot);
  }

  const designLocalPath = registerResource(
    designImgUrl,
    "designs",
    "design",
    "preview",
    0,
    ".png",
  );
  const bgStyle = designLocalPath
    ? `;background:url("${safeCssString(designLocalPath)}") no-repeat;background-size:${boardW}px ${boardH}px`
    : "";

  const html =
    `<!DOCTYPE html><html><head><meta charset="UTF-8">` +
    `<meta name="referrer" content="no-referrer">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1.0">` +
    `<title>Design</title><style>` +
    `*{margin:0;padding:0;box-sizing:border-box}img{display:block}` +
    `.design{position:relative;width:${boardW}px;height:${boardH}px;overflow:hidden;margin:0 auto${bgStyle}}\n` +
    cssRules.join("\n") +
    `</style></head><body><div class="design">\n` +
    htmlParts.join("\n") +
    `\n</div></body></html>`;

  return {
    html,
    imageUrlMapping,
    layerAnnotations,
    canvasSize: { width: boardW, height: boardH },
    hasStructuredLayers: layers.length > 0,
  };
}

export function convertSketchToHtmlMinified(
  sketchData: UnknownRecord,
  designScale = 2.0,
  designImgUrl = "",
  fallbackDimensions?: LogicalCanvasDimensions,
): SketchToHtmlResult {
  const result = convertSketchToHtml(sketchData, designScale, designImgUrl, fallbackDimensions);
  return { ...result, html: minifyHtml(result.html) };
}

export function inferDesignScale(deviceString: string): number {
  return inferSketchScale(deviceString, 2);
}
