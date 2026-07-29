import type { UnknownRecord } from "./types.js";

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeSketchOpacity(value: unknown): number {
  const raw = isRecord(value) ? value.value : value;
  if (raw === undefined || raw === null || raw === "") return 1;
  if (typeof raw === "string" && raw.trim().endsWith("%")) {
    const parsed = Number(raw.trim().slice(0, -1));
    return Number.isFinite(parsed) ? clamp(parsed / 100, 0, 1) : 1;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1;
  return clamp(parsed > 1 ? parsed / 100 : parsed, 0, 1);
}

function roundedAlpha(value: number): string {
  return String(Math.round(clamp(value, 0, 1) * 10_000) / 10_000);
}

function parseColorValue(value: string): { r: number; g: number; b: number; a: number } | undefined {
  const functional = value.trim().match(
    /^rgba?\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*,\s*([^\s)]+))?\s*\)$/i,
  );
  if (functional) {
    return {
      r: Number(functional[1]),
      g: Number(functional[2]),
      b: Number(functional[3]),
      a: functional[4] === undefined ? 1 : normalizeSketchOpacity(functional[4]),
    };
  }

  const hex = value.trim().match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1];
  if (!hex) return undefined;
  const expanded = hex.length <= 4
    ? [...hex].map((character) => character.repeat(2)).join("")
    : hex;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
    a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

function formatChannels(r: number, g: number, b: number, alpha: number): string {
  const channels = [r, g, b].map((value) => Math.round(clamp(value, 0, 255)));
  return alpha < 1
    ? `rgba(${channels[0]},${channels[1]},${channels[2]},${roundedAlpha(alpha)})`
    : `rgb(${channels[0]},${channels[1]},${channels[2]})`;
}

export function formatSketchColor(color: unknown, ...opacities: unknown[]): string | null {
  if (!isRecord(color)) return null;
  const multiplier = opacities.reduce(
    (result: number, opacity) => result * normalizeSketchOpacity(opacity),
    1,
  );
  const value = typeof color.value === "string" ? color.value.trim() : "";
  if (value) {
    if (multiplier === 1) return value;
    const parsed = parseColorValue(value);
    return parsed
      ? formatChannels(parsed.r, parsed.g, parsed.b, parsed.a * multiplier)
      : value;
  }

  const hasChannels = ["r", "red", "g", "green", "b", "blue"]
    .some((key) => key in color);
  if (!hasChannels) return null;
  const r = Number(color.red ?? color.r ?? 0);
  const g = Number(color.green ?? color.g ?? 0);
  const b = Number(color.blue ?? color.b ?? 0);
  if (![r, g, b].every(Number.isFinite)) return null;
  const alpha = normalizeSketchOpacity(color.a ?? color.alpha) * multiplier;
  return formatChannels(r, g, b, alpha);
}
