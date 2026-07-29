import type { UnknownRecord } from "../shared/types.js";
import { formatSketchColor, normalizeSketchOpacity } from "../shared/sketch-colors.js";
import type { CanvasDimensions } from "./layout-summary.js";

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pxStr(val: unknown, scale: number): string {
  if (val == null) return "0";
  return String(Math.round((Number(val) / scale) * 10) / 10);
}

function rgbStr(color: UnknownRecord): string {
  return formatSketchColor(color) ?? "rgb(0,0,0)";
}

function rgbaStr(color: UnknownRecord, opacityVal: unknown = 100): string {
  return formatSketchColor(color, opacityVal) ?? "rgb(0,0,0)";
}

function extractOpacity(layer: UnknownRecord): number {
  const bo = isRecord(layer.blendOptions) ? layer.blendOptions : {};
  if ("opacity" in bo) {
    const op = bo.opacity;
    return normalizeSketchOpacity(isRecord(op) ? op.value : op) * 100;
  }
  if (layer.opacity !== undefined) return normalizeSketchOpacity(layer.opacity) * 100;
  return 100;
}

function extractFillColor(layer: UnknownRecord): string | null {
  const fill = isRecord(layer.fill) ? layer.fill : {};
  const color = isRecord(fill.color) ? fill.color : null;
  if (!color) return null;
  return rgbaStr(color);
}

function extractShadowStr(shadow: UnknownRecord, scale: number): string | null {
  if (shadow.enabled === false) return null;
  const color = isRecord(shadow.color) ? shadow.color : {};
  const opacity = shadow.opacity;
  const opVal = isRecord(opacity) ? opacity.value ?? 100 : opacity ?? 100;
  const distance = Number(shadow.distance ?? 0);
  const blur = Number(shadow.blur ?? 0);
  const spread = Number(shadow.chokeMatte ?? 0);
  const angleRaw = shadow.localLightingAngle;
  const angle = isRecord(angleRaw) ? Number(angleRaw.value ?? 120) : Number(angleRaw ?? 120);
  const rad = (angle * Math.PI) / 180;
  const xOff = Math.round(distance * Math.cos(rad) * 10) / 10;
  const yOff = Math.round(distance * Math.sin(rad) * 10) / 10;
  const colorStr = rgbaStr(color, opVal);
  return `${colorStr} ${pxStr(xOff, scale)}px ${pxStr(yOff, scale)}px ${pxStr(blur, scale)}px ${pxStr(spread, scale)}px`;
}

function extractStrokeStr(frameFx: UnknownRecord, scale: number): string | null {
  if (frameFx.enabled === false) return null;
  const size = Number(frameFx.size ?? 0);
  const color = isRecord(frameFx.color) ? frameFx.color : {};
  const opacity = frameFx.opacity;
  const opVal = isRecord(opacity) ? opacity.value ?? 100 : opacity ?? 100;
  const style = String(frameFx.style ?? "outsetFrame");
  const posMap: Record<string, string> = {
    outsetFrame: "outside",
    insetFrame: "inside",
    centeredFrame: "center",
  };
  const pos = posMap[style] ?? "outside";
  const colorStr = rgbaStr(color, opVal);
  return `${pxStr(size, scale)}px ${pos} ${colorStr}`;
}

interface TextEntry {
  name: string;
  path: string;
  text: string;
  x: string;
  y: string;
  w: string;
  h: string;
  color: string | null;
  fontSize: string | null;
  font: string;
  bold: boolean;
  italic: boolean;
  justify: string;
  leading: string | null;
  tracking: unknown;
  opacity: number | null;
  stroke: string | null;
  shadow: string | null;
}

interface ShapeEntry {
  name: string;
  path: string;
  x: string;
  y: string;
  w: string;
  h: string;
  fill: string | null;
  opacity: number | null;
  stroke: string | null;
  shadows: string[];
  innerShadows: string[];
  effects: string[];
}

interface ImageEntry {
  name: string;
  path: string;
  x: string;
  y: string;
  w: string;
  h: string;
  opacity: number | null;
}

interface GroupEntry {
  name: string;
  depth: number;
  x: string;
  y: string;
  w: string;
  h: string;
}

export function extractFullAnnotationsFromSketch(
  sketchData: UnknownRecord,
  designScale = 2.0,
  canvasDimensions?: CanvasDimensions,
): string {
  const scale = designScale || 2.0;

  const textLayers: TextEntry[] = [];
  const shapeLayers: ShapeEntry[] = [];
  const imageLayers: ImageEntry[] = [];
  const groupStructure: GroupEntry[] = [];

  const walkLayer = (layer: UnknownRecord, depth = 0, parentPath = ""): void => {
    if (!layer || !isRecord(layer)) return;
    if (layer.visible === false) return;

    const name = String(layer.name ?? "?");
    const ltype = String(layer.type ?? "?");
    const w = Number(layer.width ?? 0) || 0;
    const h = Number(layer.height ?? 0) || 0;
    const left = Number(layer.left ?? 0) || 0;
    const top = Number(layer.top ?? 0) || 0;
    const currentPath = parentPath ? `${parentPath}/${name}` : name;

    if (w === 0 && h === 0) {
      const children = Array.isArray(layer.layers) ? layer.layers : [];
      for (const child of children) {
        if (isRecord(child)) walkLayer(child, depth, currentPath);
      }
      return;
    }

    const opacity = extractOpacity(layer);

    if (ltype === "textLayer" || ltype === "text") {
      const ti = isRecord(layer.textInfo) ? layer.textInfo : {};
      const text = String(ti.text ?? "");
      const color = isRecord(ti.color) ? ti.color : {};
      const size = Number(ti.size ?? 0);
      const font = String(ti.fontPostScriptName ?? "");
      const bold = Boolean(ti.bold);
      const italic = Boolean(ti.italic);
      const justify = String(ti.justification ?? "left");
      const leading = ti.leading;
      const tracking = ti.tracking;
      const le = isRecord(layer.layerEffects) ? layer.layerEffects : {};

      const entry: TextEntry = {
        name,
        path: currentPath,
        text,
        x: pxStr(left, scale),
        y: pxStr(top, scale),
        w: pxStr(w, scale),
        h: pxStr(h, scale),
        color: isRecord(ti.color) && Object.keys(color).length > 0 ? rgbaStr(color) : null,
        fontSize: size ? pxStr(size, scale) : null,
        font,
        bold,
        italic,
        justify,
        leading: leading != null ? pxStr(leading, scale) : null,
        tracking,
        opacity: opacity < 100 ? opacity : null,
        stroke: null,
        shadow: null,
      };
      if (isRecord(le.frameFX)) {
        entry.stroke = extractStrokeStr(le.frameFX as UnknownRecord, scale);
      }
      if (isRecord(le.dropShadow)) {
        entry.shadow = extractShadowStr(le.dropShadow as UnknownRecord, scale);
      }
      textLayers.push(entry);
    } else if (ltype === "shapeLayer" || ltype === "shape") {
      const fillColor = extractFillColor(layer);
      const le = isRecord(layer.layerEffects) ? layer.layerEffects : {};

      const entry: ShapeEntry = {
        name,
        path: currentPath,
        x: pxStr(left, scale),
        y: pxStr(top, scale),
        w: pxStr(w, scale),
        h: pxStr(h, scale),
        fill: fillColor,
        opacity: opacity < 100 ? opacity : null,
        stroke: null,
        shadows: [],
        innerShadows: [],
        effects: [],
      };

      if (isRecord(le.frameFX)) {
        entry.stroke = extractStrokeStr(le.frameFX as UnknownRecord, scale);
      }

      for (const shadowKey of ["dropShadow", "dropShadowMulti"]) {
        const sd = le[shadowKey];
        if (Array.isArray(sd)) {
          for (const s of sd) {
            if (isRecord(s)) {
              const ss = extractShadowStr(s, scale);
              if (ss) entry.shadows.push(ss);
            }
          }
        } else if (isRecord(sd)) {
          const ss = extractShadowStr(sd, scale);
          if (ss) entry.shadows.push(ss);
        }
      }

      for (const shadowKey of ["innerShadow", "innerShadowMulti"]) {
        const sd = le[shadowKey];
        if (Array.isArray(sd)) {
          for (const s of sd) {
            if (isRecord(s)) {
              const ss = extractShadowStr(s, scale);
              if (ss) entry.innerShadows.push(`inset ${ss}`);
            }
          }
        } else if (isRecord(sd)) {
          const ss = extractShadowStr(sd, scale);
          if (ss) entry.innerShadows.push(`inset ${ss}`);
        }
      }

      for (const fxName of ["bevelEmboss", "outerGlow", "innerGlow", "patternFill"]) {
        const fx = le[fxName];
        if (isRecord(fx) && (fx.enabled ?? true)) {
          entry.effects.push(fxName);
        }
      }

      shapeLayers.push(entry);
    } else if (ltype === "layer" || ltype === "bitmap" || ltype === "bitmapLayer") {
      if (w > 10 && h > 10) {
        imageLayers.push({
          name,
          path: currentPath,
          x: pxStr(left, scale),
          y: pxStr(top, scale),
          w: pxStr(w, scale),
          h: pxStr(h, scale),
          opacity: opacity < 100 ? opacity : null,
        });
      }
    } else if (ltype === "layerSection" || ltype === "layer-group" || ltype === "groupLayer") {
      groupStructure.push({
        name,
        depth,
        x: pxStr(left, scale),
        y: pxStr(top, scale),
        w: pxStr(w, scale),
        h: pxStr(h, scale),
      });
    }

    const children = Array.isArray(layer.layers) ? layer.layers : [];
    for (const child of children) {
      if (isRecord(child)) walkLayer(child, depth + 1, currentPath);
    }
  };

  const walkArtboardLayer = (layer: UnknownRecord, depth = 0, parentPath = ""): void => {
    if (!layer || !isRecord(layer)) return;
    if (layer.isVisible === false || layer.visible === false) return;

    const name = String(layer.name ?? "?");
    const ltype = String(layer.type ?? "?");
    const frame = isRecord(layer.frame)
      ? layer.frame
      : isRecord(layer.ddsOriginFrame)
        ? layer.ddsOriginFrame
        : {};
    const w = Number(frame.width ?? 0) || 0;
    const h = Number(frame.height ?? 0) || 0;
    const left = Number(frame.left ?? frame.x ?? 0) || 0;
    const top = Number(frame.top ?? frame.y ?? 0) || 0;
    const currentPath = parentPath ? `${parentPath}/${name}` : name;

    if (w === 0 && h === 0) {
      const children = Array.isArray(layer.layers) ? layer.layers : [];
      for (const child of children) {
        if (isRecord(child)) walkArtboardLayer(child, depth, currentPath);
      }
      return;
    }

    const opacity = layer.opacity === undefined
      ? 100
      : normalizeSketchOpacity(layer.opacity) * 100;

    if (ltype === "textLayer") {
      const textObj = isRecord(layer.text) ? layer.text : {};
      const text = String(textObj.value ?? "");
      const ts = isRecord(textObj.style) ? textObj.style : {};
      const fontObj = isRecord(ts.font) ? ts.font : {};
      const colorObj = isRecord(ts.color) ? ts.color : {};
      const size = Number(fontObj.size ?? 0);
      const font = String(fontObj.name ?? fontObj.postScriptName ?? "");
      const bold = Boolean(fontObj.bold || fontObj.type === "Bold");
      const italic = Boolean(fontObj.italic);
      const justify = String(fontObj.align ?? "left");
      const lineHeightObj = fontObj.lineHeight;
      const leading = isRecord(lineHeightObj) ? lineHeightObj.value : lineHeightObj;
      const letterSpacingObj = fontObj.letterSpacing;
      const tracking = isRecord(letterSpacingObj) ? letterSpacingObj.value : letterSpacingObj;

      const entry: TextEntry = {
        name,
        path: currentPath,
        text,
        x: pxStr(left, scale),
        y: pxStr(top, scale),
        w: pxStr(w, scale),
        h: pxStr(h, scale),
        color: Object.keys(colorObj).length > 0 ? formatSketchColor(colorObj) : null,
        fontSize: size ? pxStr(size, scale) : null,
        font,
        bold,
        italic,
        justify,
        leading: leading != null ? pxStr(leading, scale) : null,
        tracking,
        opacity: opacity < 100 ? opacity : null,
        stroke: null,
        shadow: null,
      };
      textLayers.push(entry);
    } else if (ltype === "shapeLayer") {
      const style = isRecord(layer.style) ? layer.style : {};
      const fills = Array.isArray(style.fills) ? style.fills.filter(isRecord) : [];
      const borders = Array.isArray(style.borders) ? style.borders.filter(isRecord) : [];
      const shadows = Array.isArray(style.shadows) ? style.shadows.filter(isRecord) : [];

      let fillColor: string | null = null;
      for (const fill of fills) {
        if (fill.isEnabled === false) continue;
        const c = isRecord(fill.color) ? fill.color : {};
        if (Object.keys(c).length > 0) { fillColor = formatSketchColor(c); break; }
      }

      let borderStr: string | null = null;
      for (const border of borders) {
        if (border.isEnabled === false) continue;
        const c = isRecord(border.color) ? border.color : {};
        const colorStr = Object.keys(c).length > 0 ? formatSketchColor(c, border.opacity) : null;
        if (colorStr) { borderStr = `${Number(border.thickness ?? 1)}px ${colorStr}`; break; }
      }

      const shadowStrs: string[] = [];
      for (const shadow of shadows) {
        if (shadow.isEnabled === false) continue;
        const c = isRecord(shadow.color) ? shadow.color : {};
        const colorStr = Object.keys(c).length > 0 ? formatSketchColor(c, shadow.opacity) : null;
        if (colorStr) {
          shadowStrs.push(`${colorStr} ${Number(shadow.offsetX ?? 0)}px ${Number(shadow.offsetY ?? 0)}px ${Number(shadow.blurRadius ?? 0)}px`);
        }
      }

      shapeLayers.push({
        name,
        path: currentPath,
        x: pxStr(left, scale),
        y: pxStr(top, scale),
        w: pxStr(w, scale),
        h: pxStr(h, scale),
        fill: fillColor,
        opacity: opacity < 100 ? opacity : null,
        stroke: borderStr,
        shadows: shadowStrs,
        innerShadows: [],
        effects: [],
      });
    } else if (ltype === "bitmapLayer" || ltype === "layer") {
      if (w > 10 && h > 10) {
        imageLayers.push({
          name,
          path: currentPath,
          x: pxStr(left, scale),
          y: pxStr(top, scale),
          w: pxStr(w, scale),
          h: pxStr(h, scale),
          opacity: opacity < 100 ? opacity : null,
        });
      }
    } else if (ltype === "groupLayer" || ltype === "symbolInstence") {
      groupStructure.push({
        name,
        depth,
        x: pxStr(left, scale),
        y: pxStr(top, scale),
        w: pxStr(w, scale),
        h: pxStr(h, scale),
      });
    }

    const children = Array.isArray(layer.layers) ? layer.layers : [];
    for (const child of children) {
      if (isRecord(child)) walkArtboardLayer(child, depth + 1, currentPath);
    }
  };

  const board = isRecord(sketchData.board) ? sketchData.board : {};
  const artboardMeta = isRecord(sketchData.artboard) ? sketchData.artboard : {};
  const artboardFrame = isRecord(artboardMeta.frame) ? artboardMeta.frame : {};
  const infoLayers = Array.isArray(sketchData.info) ? sketchData.info.filter(isRecord) : [];
  const device = String(sketchData.device ?? "");
  const psdName = String(sketchData.psdName ?? artboardMeta.name ?? "");
  const infoWidth = infoLayers.reduce(
    (maximum, layer) => Math.max(maximum, Number(layer.left ?? 0) + Number(layer.width ?? 0)),
    0,
  );
  const infoHeight = infoLayers.reduce(
    (maximum, layer) => Math.max(maximum, Number(layer.top ?? 0) + Number(layer.height ?? 0)),
    0,
  );
  const boardW = Number(board.width ?? 0) || Number(artboardFrame.width ?? 0) || infoWidth;
  const boardH = Number(board.height ?? 0) || Number(artboardFrame.height ?? 0) || infoHeight;
  const boardFill = isRecord(board.fill) ? board.fill : {};
  const boardColor =
    isRecord(boardFill.color) && Object.keys(boardFill.color).length > 0
      ? rgbStr(boardFill.color)
      : "#FFFFFF";

  const lines: string[] = [];
  const sep = "=".repeat(60);
  const dashSep = "-".repeat(60);
  lines.push(sep);
  lines.push("设计标注信息（从原始 Sketch/PSD 数据提取）");
  lines.push(sep);
  lines.push(`设计稿名称: ${psdName}`);
  lines.push(`设备: ${device}  |  缩放: @${Math.trunc(scale)}x`);
  const canvasWidth = Number(canvasDimensions?.width);
  const canvasHeight = Number(canvasDimensions?.height);
  const logicalBoardWidth = Number.isFinite(canvasWidth) && canvasWidth > 0
    ? String(canvasWidth)
    : pxStr(boardW, scale);
  const logicalBoardHeight = Number.isFinite(canvasHeight) && canvasHeight > 0
    ? String(canvasHeight)
    : pxStr(boardH, scale);
  lines.push(`画布尺寸: ${logicalBoardWidth}x${logicalBoardHeight} (逻辑像素)`);
  lines.push(`画布背景色: ${boardColor}`);
  lines.push("");
  lines.push(`以下所有尺寸/坐标均为逻辑像素（已除以 @${Math.trunc(scale)}x）`);
  lines.push(dashSep);

  const boardLayers = Array.isArray(board.layers) ? board.layers : [];
  if (boardLayers.length > 0) {
    for (const layer of boardLayers) {
      if (isRecord(layer)) walkLayer(layer);
    }
  } else {
    const artboard = isRecord(sketchData.artboard) ? sketchData.artboard : undefined;
    if (artboard && Array.isArray(artboard.layers) && artboard.layers.length > 0) {
      const abLayers = Array.isArray(artboard.layers) ? artboard.layers : [];
      for (const layer of abLayers) {
        if (isRecord(layer)) walkArtboardLayer(layer);
      }
    } else {
      for (const layer of infoLayers) walkLayer(layer);
    }
  }

  if (groupStructure.length > 0) {
    lines.push("");
    lines.push("📂 图层组结构 (布局参考):");
    for (const g of groupStructure) {
      const indent = "  ".repeat(g.depth);
      lines.push(`  ${indent}[组] "${g.name}" @(${g.x},${g.y}) ${g.w}x${g.h}`);
    }
  }

  if (textLayers.length > 0) {
    lines.push("");
    lines.push("📝 文本图层:");
    for (const t of textLayers) {
      lines.push(`  "${t.text}"`);
      lines.push(`    位置: (${t.x},${t.y}) ${t.w}x${t.h}`);
      const parts: string[] = [];
      if (t.fontSize) parts.push(`font-size: ${t.fontSize}px`);
      if (t.font) parts.push(`font-family: ${t.font}`);
      if (t.bold) parts.push("font-weight: bold");
      if (t.italic) parts.push("font-style: italic");
      if (t.color) parts.push(`color: ${t.color}`);
      if (t.justify && t.justify !== "left") parts.push(`text-align: ${t.justify}`);
      if (t.leading) parts.push(`line-height: ${t.leading}px`);
      if (t.tracking) parts.push(`letter-spacing: ${t.tracking}`);
      if (t.opacity != null) parts.push(`opacity: ${t.opacity}%`);
      if (parts.length > 0) lines.push(`    样式: ${parts.join("; ")}`);
      if (t.stroke) lines.push(`    描边: ${t.stroke}`);
      if (t.shadow) lines.push(`    阴影: ${t.shadow}`);
    }
  }

  if (shapeLayers.length > 0) {
    lines.push("");
    lines.push("🔷 形状图层:");
    for (const s of shapeLayers) {
      lines.push(`  "${s.name}" (${s.path})`);
      lines.push(`    位置: (${s.x},${s.y}) ${s.w}x${s.h}`);
      const parts: string[] = [];
      if (s.fill) parts.push(`fill: ${s.fill}`);
      if (s.opacity != null) parts.push(`opacity: ${s.opacity}%`);
      if (s.stroke) parts.push(`border: ${s.stroke}`);
      if (parts.length > 0) lines.push(`    样式: ${parts.join("; ")}`);
      const allShadows = [...s.shadows, ...s.innerShadows];
      if (allShadows.length > 0) lines.push(`    box-shadow: ${allShadows.join(", ")}`);
      if (s.effects.length > 0) lines.push(`    特效: ${s.effects.join(", ")}`);
    }
  }

  if (imageLayers.length > 0) {
    lines.push("");
    lines.push("🖼️ 图片/位图图层 (需切图资源):");
    for (const img of imageLayers) {
      lines.push(`  "${img.name}" (${img.path})`);
      lines.push(`    位置: (${img.x},${img.y}) ${img.w}x${img.h}`);
      if (img.opacity != null) lines.push(`    opacity: ${img.opacity}%`);
    }
  }

  const colorSet = new Set<string>();
  const fontSet = new Set<string>();
  for (const t of textLayers) {
    if (t.color) colorSet.add(t.color);
    if (t.font) fontSet.add(t.font);
    if (t.fontSize) fontSet.add(`${t.fontSize}px`);
  }
  for (const s of shapeLayers) {
    if (s.fill) colorSet.add(s.fill);
  }

  if (colorSet.size > 0 || fontSet.size > 0) {
    lines.push("");
    lines.push("🎨 设计汇总:");
    if (colorSet.size > 0) {
      lines.push(`  使用颜色: ${[...colorSet].sort().join(", ")}`);
    }
    if (fontSet.size > 0) {
      lines.push(`  字体/字号: ${[...fontSet].sort().join(", ")}`);
    }
  }

  lines.push("");
  lines.push(sep);

  return lines.join("\n");
}
