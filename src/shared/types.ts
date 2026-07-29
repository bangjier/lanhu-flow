export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ToolTextContent {
  type: "text";
  text: string;
}

export interface ToolImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export type ToolContent = ToolTextContent | ToolImageContent;

export interface ToolExecutionResult {
  [key: string]: unknown;
  content: ToolContent[];
  structuredContent?: JsonObject;
  isError?: boolean;
}

export type MultiSelectInput = string | string[];

export type PageAnalysisMode = "text_only" | "full";

export type AnalysisPerspective = "developer" | "tester" | "explorer";

export type LanhuUrlKind = "design" | "prototype" | "invite" | "unknown";

export interface ParsedLanhuUrl {
  rawUrl: string;
  kind: LanhuUrlKind;
  teamId?: string;
  projectId?: string;
  docId?: string;
}

export interface AppConfig {
  serverName: string;
  serverVersion: string;
  lanhuBaseUrl: string;
  dataDir: string;
  requestTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
  lanhuCookie?: string;
  ddsCookie?: string;
}

export type UnknownRecord = Record<string, unknown>;

export type LanhuApiSuccessCode = 0 | "0" | "00000";

export type LanhuApiCode = LanhuApiSuccessCode | number | string;

export interface LanhuApiEnvelope<T> {
  code?: LanhuApiCode;
  msg?: string;
  data?: T;
  result?: T;
}

export interface LanhuUrlParams {
  rawUrl: string;
  route?: string;
  kind: LanhuUrlKind;
  teamId?: string;
  projectId: string;
  docId?: string;
  imageId?: string;
  versionId?: string;
  rawParams: Record<string, string>;
}

export interface LanhuVersionInfo extends UnknownRecord {
  id?: string;
  version_info?: string;
  json_url?: string;
  sketch_id?: string;
}

export interface LanhuDocumentInfo extends UnknownRecord {
  id?: string;
  name?: string;
  type?: string;
  url?: string;
  width?: number;
  height?: number;
  update_time?: string;
  versions?: LanhuVersionInfo[];
}

export interface LanhuProjectImageInfo extends UnknownRecord {
  id?: string;
  name?: string;
  width?: number;
  height?: number;
  url?: string;
  has_comment?: boolean;
  update_time?: string;
  latest_version?: string | LanhuVersionInfo;
  sketch_id?: string;
  group_id?: string;
  group_name?: string;
  image_type?: string;
}

export interface LanhuProjectImagesPayload extends UnknownRecord {
  name?: string;
  images?: LanhuProjectImageInfo[];
}

export interface LanhuProjectMultiInfoImage extends UnknownRecord {
  id?: string;
  latest_version?: string | LanhuVersionInfo;
}

export interface LanhuProjectMultiInfoPayload extends UnknownRecord {
  images?: LanhuProjectMultiInfoImage[];
}

export interface LanhuSchemaRevisionPayload extends UnknownRecord {
  data_resource_url?: string;
}

export interface LanhuDesignSummary {
  index: number;
  id: string;
  name: string;
  width?: number;
  height?: number;
  url?: string;
  hasComment: boolean;
  updateTime?: string;
  versionId?: string;
  sketchId?: string;
  groupIds: string[];
  groupNames: string[];
  group?: string;
  groupId?: string;
  artboardType?: string;
  source: "projectImages" | "detailDetach";
  raw: UnknownRecord;
}

export interface LanhuDesignListResult {
  status: "success";
  projectName?: string;
  totalDesigns: number;
  designs: LanhuDesignSummary[];
  source: "projectImages" | "detailDetach";
  params: LanhuUrlParams;
}

export interface LanhuDesignSchemaJsonResult {
  imageId: string;
  versionId: string;
  schemaUrl: string;
  schema: UnknownRecord;
}

export interface LanhuSketchJsonResult {
  imageId: string;
  versionId?: string;
  jsonUrl: string;
  documentInfo: LanhuDocumentInfo;
  sketch: UnknownRecord;
}

export interface LanhuSliceMetadata extends UnknownRecord {
  style?: UnknownRecord;
  fills?: unknown[];
  borders?: unknown[];
  opacity?: number;
  rotation?: number;
  text_style?: unknown;
  shadows?: unknown[];
  border_radius?: unknown;
}

export interface LanhuSliceInfo {
  id?: string;
  name: string;
  type?: string;
  downloadUrl: string;
  size: string;
  format: "png" | "svg";
  position?: {
    x: number;
    y: number;
  };
  parentName?: string;
  layerPath: string;
  metadata?: LanhuSliceMetadata;
}

export interface LanhuSlicesResult {
  designId: string;
  designName: string;
  version?: string;
  canvasSize: {
    width?: number;
    height?: number;
  };
  canvasSizeSource?: "sketch" | "slice_bounds" | "document";
  coordinateSpace?: "analysis" | "unknown";
  sourceScale?: number;
  warning?: string;
  totalSlices: number;
  slices: LanhuSliceInfo[];
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface LanhuClientOptions {
  baseUrl?: string;
  ddsBaseUrl?: string;
  cookie?: string;
  ddsCookie?: string;
  fetchImpl?: FetchLike;
}
