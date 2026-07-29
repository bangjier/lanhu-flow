import {
  LanhuClient,
  parseLanhuUrl,
  pickNestedString,
} from "./client.js";
import {
  type LanhuDesignListResult,
  type LanhuDesignSchemaJsonResult,
  type LanhuDesignSummary,
  type LanhuDocumentInfo,
  type LanhuProjectImageInfo,
  type LanhuProjectImagesPayload,
  type LanhuProjectMultiInfoImage,
  type LanhuProjectMultiInfoPayload,
  type LanhuSketchJsonResult,
  type LanhuSliceInfo,
  type LanhuSliceMetadata,
  type LanhuSlicesResult,
  type LanhuUrlParams,
  type LanhuVersionInfo,
  type UnknownRecord,
} from "../shared/types.js";
import {
  inferSketchCoordinateScale,
  resolveSketchCanvasDimensions,
  scaleSketchValue,
} from "../shared/sketch-coordinates.js";

const DETAIL_COVER_KEYS = [
  "XDCoverPNGORG",
  "XDCover",
  "url",
  "cb_src",
  "cover_url",
  "coverUrl",
  "imageUrl",
  "image_url",
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean {
  if (value === true || value === "true") {
    return true;
  }
  const numeric = asNumber(value);
  return numeric !== undefined && numeric > 0;
}

function pickString(record: UnknownRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function pickRecord(record: UnknownRecord, keys: readonly string[]): UnknownRecord | undefined {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) return value;
  }
  return undefined;
}

function getVersionId(record: UnknownRecord): string | undefined {
  const latestVersion = record.latest_version ?? record.latestVersion;
  if (isRecord(latestVersion)) {
    return pickString(latestVersion, ["id", "version_id", "versionId"]);
  }
  return asString(latestVersion) ?? pickString(record, [
    "latest_version_id",
    "latestVersionId",
    "version_id",
    "versionId",
  ]);
}

function getSketchId(record: UnknownRecord): string | undefined {
  const latestVersion = isRecord(record.latest_version)
    ? record.latest_version
    : isRecord(record.latestVersion)
      ? record.latestVersion
      : undefined;
  return pickString(record, ["sketch_id", "sketchId", "sketchID"])
    ?? (latestVersion ? pickString(latestVersion, ["sketch_id", "sketchId", "sketchID"]) : undefined);
}

function getGroupMetadata(record: UnknownRecord): {
  group?: string;
  groupId?: string;
  groupIds: string[];
  groupNames: string[];
} {
  const groupRecord = pickRecord(record, ["group", "folder", "catalog"]);
  const groupValues = Array.isArray(record.group) ? record.group : [];
  const groupIds = groupValues
    .map((value) => isRecord(value) ? pickString(value, ["id", "group_id", "groupId"]) : asString(value))
    .filter((value): value is string => Boolean(value));
  const groupNames = groupValues
    .filter(isRecord)
    .map((value) => pickString(value, ["name", "title", "group_name", "groupName"]))
    .filter((value): value is string => Boolean(value));
  const scalarGroup = asString(record.group) ?? asString(record.folder) ?? asString(record.catalog);
  const group = pickString(record, [
    "group_name",
    "groupName",
    "folder_name",
    "folderName",
    "catalog_name",
    "catalogName",
  ]) ?? scalarGroup ?? (groupRecord ? pickString(groupRecord, ["name", "title"]) : undefined);
  const groupId = pickString(record, [
    "group_id",
    "groupId",
    "folder_id",
    "folderId",
    "catalog_id",
    "catalogId",
  ]) ?? (groupRecord ? pickString(groupRecord, ["id", "group_id", "folder_id", "catalog_id"]) : undefined);
  if (groupId && !groupIds.includes(groupId)) groupIds.unshift(groupId);
  if (group && !groupNames.includes(group)) groupNames.unshift(group);
  return { group, groupId: groupId ?? groupIds[0], groupIds, groupNames };
}

function getArtboardType(record: UnknownRecord): string | undefined {
  return pickString(record, [
    "artboard_type",
    "artboardType",
    "image_type",
    "imageType",
    "source_type",
    "sourceType",
    "type",
  ]);
}

function isDetailDetachUrl(params: LanhuUrlParams): boolean {
  return params.route?.includes("detailDetach") ?? false;
}

function getLatestVersionInfo(documentInfo: LanhuDocumentInfo): LanhuVersionInfo | undefined {
  return Array.isArray(documentInfo.versions) ? documentInfo.versions[0] : undefined;
}

function getProjectName(value: UnknownRecord): string | undefined {
  return asString(value.project_name) ?? asString(value.projectName) ?? asString(value.name);
}

function pickDesignCoverUrl(documentInfo: LanhuDocumentInfo): string | undefined {
  return pickNestedString(documentInfo, DETAIL_COVER_KEYS, 2);
}

function mapProjectImageToDesignSummary(
  image: LanhuProjectImageInfo,
  index: number,
): LanhuDesignSummary {
  const designId = asString(image.id);
  if (!designId) {
    throw new Error(`Design item at index ${index} is missing id`);
  }
  const { group, groupId, groupIds, groupNames } = getGroupMetadata(image);

  return {
    index,
    id: designId,
    name: asString(image.name) ?? `design-${designId}`,
    width: asNumber(image.width),
    height: asNumber(image.height),
    url: pickDesignCoverUrl(image),
    hasComment: asBoolean(image.has_comment ?? image.hasComment ?? image.comment_count ?? image.commentCount),
    updateTime: pickString(image, ["update_time", "updateTime", "updated_at", "updatedAt"]),
    versionId: getVersionId(image),
    sketchId: getSketchId(image),
    groupIds,
    groupNames,
    group,
    groupId,
    artboardType: getArtboardType(image),
    source: "projectImages",
    raw: image,
  };
}

function mapDetachedDesign(documentInfo: LanhuDocumentInfo, params: LanhuUrlParams): LanhuDesignSummary {
  const designId = asString(documentInfo.id) ?? params.docId ?? params.imageId;
  if (!designId) {
    throw new Error("Single design extraction failed: missing image id");
  }
  const latestVersion = getLatestVersionInfo(documentInfo);
  const { group, groupId, groupIds, groupNames } = getGroupMetadata(documentInfo);

  return {
    index: 1,
    id: designId,
    name: asString(documentInfo.name) ?? `design-${designId}`,
    width: asNumber(documentInfo.width),
    height: asNumber(documentInfo.height),
    url: pickDesignCoverUrl(documentInfo),
    hasComment: asBoolean(
      documentInfo.has_comment
      ?? documentInfo.hasComment
      ?? documentInfo.comment_count
      ?? documentInfo.commentCount,
    ),
    updateTime: pickString(documentInfo, ["update_time", "updateTime", "updated_at", "updatedAt"]),
    versionId: asString(latestVersion?.id) ?? getVersionId(documentInfo),
    sketchId: getSketchId(documentInfo) ?? (latestVersion ? getSketchId(latestVersion) : undefined),
    groupIds,
    groupNames,
    group,
    groupId,
    artboardType: getArtboardType(documentInfo),
    source: "detailDetach",
    raw: documentInfo,
  };
}

function collectMetadata(node: UnknownRecord): LanhuSliceMetadata | undefined {
  const metadata: LanhuSliceMetadata = {};
  const style = isRecord(node.style) ? node.style : undefined;
  const styleSource = style ?? node;

  if (style) {
    metadata.style = style;
  }

  if (Array.isArray(styleSource.fills)) {
    metadata.fills = styleSource.fills;
  }

  if (Array.isArray(styleSource.borders)) {
    metadata.borders = styleSource.borders;
  } else if (Array.isArray(styleSource.strokes)) {
    metadata.borders = styleSource.strokes;
  }

  const opacity = asNumber(node.opacity);
  if (opacity !== undefined) {
    metadata.opacity = opacity;
  }

  const rotation = asNumber(node.rotation);
  if (rotation !== undefined) {
    metadata.rotation = rotation;
  }

  const text = isRecord(node.text) ? node.text : undefined;
  if (node.textStyle !== undefined) {
    metadata.text_style = node.textStyle;
  } else if (text?.style !== undefined) {
    metadata.text_style = text.style;
  }

  if (Array.isArray(styleSource.shadows)) {
    metadata.shadows = styleSource.shadows;
  }

  if (node.radius !== undefined) {
    metadata.border_radius = node.radius;
  } else if (node.cornerRadius !== undefined) {
    metadata.border_radius = node.cornerRadius;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function getSliceGeometry(node: UnknownRecord): {
  x: number;
  y: number;
  width?: number;
  height?: number;
} {
  const frames = [
    node.ddsOriginFrame,
    node.layerOriginFrame,
    node.frame,
    node.bounds,
  ].filter(isRecord);
  const fromFrames = (keys: readonly string[]): number | undefined => {
    for (const frame of frames) {
      for (const key of keys) {
        const value = asNumber(frame[key]);
        if (value !== undefined) return value;
      }
    }
    return undefined;
  };
  return {
    x: asNumber(node.left) ?? asNumber(node.x) ?? fromFrames(["left", "x"]) ?? 0,
    y: asNumber(node.top) ?? asNumber(node.y) ?? fromFrames(["top", "y"]) ?? 0,
    width: asNumber(node.width) ?? fromFrames(["width"]),
    height: asNumber(node.height) ?? fromFrames(["height"]),
  };
}

function formatSliceSize(width: number | undefined, height: number | undefined): string | undefined {
  return width !== undefined && width > 0 && height !== undefined && height > 0
    ? `${Math.round(width * 10) / 10}x${Math.round(height * 10) / 10}`
    : undefined;
}

function parseSliceSize(size: string): { width: number; height: number } | undefined {
  const match = size.trim().match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function extractSketchCanvasSize(
  sketch: UnknownRecord,
  scale: number,
): { width?: number; height?: number } | undefined {
  return resolveSketchCanvasDimensions(sketch, scale).dimensions;
}

function extractSliceBounds(slices: readonly LanhuSliceInfo[]): { width?: number; height?: number } | undefined {
  let width = 0;
  let height = 0;
  for (const slice of slices) {
    const size = parseSliceSize(slice.size);
    if (!size) continue;
    width = Math.max(width, (slice.position?.x ?? 0) + size.width);
    height = Math.max(height, (slice.position?.y ?? 0) + size.height);
  }
  return width > 0 || height > 0
    ? { width: width || undefined, height: height || undefined }
    : undefined;
}

function hasNonUniformScale(
  canvas: { width?: number; height?: number },
  reference: { width?: number; height?: number },
): boolean {
  if (!canvas.width || !canvas.height || !reference.width || !reference.height) return false;
  const ratioX = canvas.width / reference.width;
  const ratioY = canvas.height / reference.height;
  return Math.abs(ratioX - ratioY) > Math.max(ratioX, ratioY) * 0.001;
}

function resolveSliceCanvasSize(
  sketch: UnknownRecord,
  documentInfo: LanhuDocumentInfo,
  slices: readonly LanhuSliceInfo[],
  scale: number,
): {
  canvasSize: { width?: number; height?: number };
  canvasSizeSource: LanhuSlicesResult["canvasSizeSource"];
  warning?: string;
} {
  const sketchCanvas = extractSketchCanvasSize(sketch, scale);
  const documentCanvas = {
    width: asNumber(documentInfo.width),
    height: asNumber(documentInfo.height),
  };
  const sliceBounds = extractSliceBounds(slices);
  if (sketchCanvas?.width && sketchCanvas.height) {
    const boundsExceedSketch = Boolean(
      sliceBounds?.width
      && sliceBounds.height
      && (
        sliceBounds.width > sketchCanvas.width * 1.01
        || sliceBounds.height > sketchCanvas.height * 1.01
      ),
    );
    return {
      canvasSize: sketchCanvas,
      canvasSizeSource: "sketch",
      ...(boundsExceedSketch
        ? { warning: "Slice bounds exceed the trusted Sketch canvas; coordinate space is unknown." }
        : {}),
    };
  }
  const boundsExceedDocument = Boolean(
    sliceBounds?.width
    && sliceBounds.height
    && (
      !documentCanvas.width
      || !documentCanvas.height
      || (
        sliceBounds.width > documentCanvas.width * 1.01
        && sliceBounds.height > documentCanvas.height * 1.01
      )
    ),
  );
  if (boundsExceedDocument && sliceBounds) {
    return { canvasSize: sliceBounds, canvasSizeSource: "slice_bounds" };
  }
  if (documentCanvas.width || documentCanvas.height) {
    return { canvasSize: documentCanvas, canvasSizeSource: "document" };
  }
  return {
    canvasSize: sliceBounds ?? {},
    canvasSizeSource: sliceBounds ? "slice_bounds" : "document",
  };
}

function buildSliceInfo(
  node: UnknownRecord,
  currentName: string,
  currentPath: string,
  parentName: string,
  includeMetadata: boolean,
  scale: number,
): LanhuSliceInfo | undefined {
  const imageData = isRecord(node.image) ? node.image : undefined;
  if (imageData) {
    const downloadUrl = asString(imageData.imageUrl) ?? asString(imageData.svgUrl);
    if (downloadUrl) {
      const { x, y, width, height } = getSliceGeometry(node);
      const logicalWidth = width === undefined ? undefined : scaleSketchValue(width, scale);
      const logicalHeight = height === undefined ? undefined : scaleSketchValue(height, scale);

      return {
        id: asString(node.id),
        name: currentName,
        type: asString(node.type) ?? asString(node.layerType) ?? "bitmap",
        downloadUrl,
        size: formatSliceSize(logicalWidth, logicalHeight) ?? "unknown",
        format: asString(imageData.imageUrl) ? "png" : "svg",
        position: {
          x: scaleSketchValue(x, scale),
          y: scaleSketchValue(y, scale),
        },
        parentName: parentName || undefined,
        layerPath: currentPath,
        ...(includeMetadata ? { metadata: collectMetadata(node) } : {}),
      };
    }
  }

  const legacyImage = isRecord(node.ddsImage) ? node.ddsImage : undefined;
  const downloadUrl = legacyImage ? asString(legacyImage.imageUrl) : undefined;
  if (!legacyImage || !downloadUrl) {
    return undefined;
  }

  const { x, y, width, height } = getSliceGeometry(node);
  const embeddedSize = asString(legacyImage.size);
  const parsedEmbeddedSize = embeddedSize ? parseSliceSize(embeddedSize) : undefined;
  const knownEmbeddedSize = parsedEmbeddedSize
    ? formatSliceSize(
      scaleSketchValue(parsedEmbeddedSize.width, scale),
      scaleSketchValue(parsedEmbeddedSize.height, scale),
    )
    : undefined;
  const logicalWidth = width === undefined ? undefined : scaleSketchValue(width, scale);
  const logicalHeight = height === undefined ? undefined : scaleSketchValue(height, scale);
  return {
    id: asString(node.id),
    name: currentName,
    type: asString(node.type) ?? asString(node.ddsType),
    downloadUrl,
    size: formatSliceSize(logicalWidth, logicalHeight) ?? knownEmbeddedSize ?? "unknown",
    format: "png",
    position: {
      x: scaleSketchValue(x, scale),
      y: scaleSketchValue(y, scale),
    },
    parentName: parentName || undefined,
    layerPath: currentPath,
    ...(includeMetadata ? { metadata: collectMetadata(node) } : {}),
  };
}

function extractSlicesFromSketch(
  sketch: UnknownRecord,
  includeMetadata: boolean,
  scale: number,
): LanhuSliceInfo[] {
  const slices: LanhuSliceInfo[] = [];
  const visited = new Set<unknown>();

  const walk = (node: unknown, parentName = "", layerPath = ""): void => {
    if (!isRecord(node) || visited.has(node)) {
      return;
    }
    visited.add(node);

    const currentName = asString(node.name) ?? "";
    const currentPath = layerPath ? `${layerPath}/${currentName}` : currentName;
    const sliceInfo = buildSliceInfo(
      node,
      currentName,
      currentPath,
      parentName,
      includeMetadata,
      scale,
    );
    if (sliceInfo) {
      slices.push(sliceInfo);
    }

    const layers = Array.isArray(node.layers) ? node.layers : [];
    for (const layer of layers) {
      walk(layer, currentName, currentPath);
    }

    for (const value of Object.values(node)) {
      if (isRecord(value)) {
        walk(value, parentName, layerPath);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (isRecord(item)) {
            walk(item, parentName, layerPath);
          }
        }
      }
    }
  };

  const artboard = isRecord(sketch.artboard) ? sketch.artboard : undefined;
  const board = isRecord(sketch.board) ? sketch.board : undefined;
  const root = artboard ?? board;
  if (root && Array.isArray(root.layers)) {
    for (const layer of root.layers) {
      walk(layer);
    }
    return slices;
  }

  const legacyRoot = Array.isArray(sketch.info) ? sketch.info : [];
  for (const item of legacyRoot) {
    walk(item);
  }

  return slices;
}

function requireVersionId(images: LanhuProjectMultiInfoImage[], imageId: string): string {
  for (const image of images) {
    if (asString(image.id) !== imageId) {
      continue;
    }

    const versionId = getVersionId(image);
    if (!versionId) {
      throw new Error(`Design ${imageId} is missing latest_version`);
    }

    return versionId;
  }

  throw new Error(`Unable to find design image_id=${imageId} in multi_info response`);
}

export async function listDesigns(
  client: LanhuClient,
  input: string | LanhuUrlParams,
): Promise<LanhuDesignListResult> {
  const params = typeof input === "string" ? parseLanhuUrl(input) : input;

  if (params.docId && isDetailDetachUrl(params)) {
    const projectInfo = params.teamId
      ? await client.getProjectMultiInfo(params.projectId, params.teamId, {
        img_limit: 1,
        detach: 1,
      })
      : undefined;
    const documentInfo = params.teamId
      ? await client.getDesignDocument(params.docId, params.teamId, params.projectId)
      : await client.getDocumentInfo(params.projectId, params.docId);
    return {
      status: "success",
      projectName: projectInfo ? getProjectName(projectInfo) ?? getProjectName(documentInfo) : getProjectName(documentInfo),
      totalDesigns: 1,
      designs: [mapDetachedDesign(documentInfo, params)],
      source: "detailDetach",
      params,
    };
  }

  if (!params.teamId) {
    throw new Error("URL parsing failed: missing required param tid (team_id)");
  }

  const payload = await client.getLanhuPayload<LanhuProjectImagesPayload>("/api/project/images", {
    project_id: params.projectId,
    team_id: params.teamId,
    dds_status: 1,
    position: 1,
    show_cb_src: 1,
    comment: 1,
  });

  const images = Array.isArray(payload.images) ? payload.images : [];
  const designs = images.map((image, index) => mapProjectImageToDesignSummary(image, index + 1));
  const namesById = new Map(designs.map((design) => [design.id, design.name]));
  const designsWithGroups = designs.map((design): LanhuDesignSummary => {
    const resolvedNames = design.groupIds
      .map((groupId) => namesById.get(groupId))
      .filter((value): value is string => Boolean(value));
    const groupNames = [...new Set([...design.groupNames, ...resolvedNames])];
    return {
      ...design,
      groupNames,
      groupId: design.groupId ?? design.groupIds[0],
      group: design.group ?? groupNames[0],
    };
  });
  return {
    status: "success",
    projectName: asString(payload.name),
    totalDesigns: images.length,
    designs: designsWithGroups,
    source: "projectImages",
    params,
  };
}

export async function getDesignSchemaJson(
  client: LanhuClient,
  imageId: string,
  teamId: string,
  projectId: string,
): Promise<LanhuDesignSchemaJsonResult> {
  const multiInfo = await client.getProjectMultiInfo(projectId, teamId, {
    img_limit: 500,
    detach: 1,
  });
  const images = Array.isArray(multiInfo.images) ? multiInfo.images : [];
  const versionId = requireVersionId(images, imageId);
  const revision = await client.getDdsSchemaRevision(versionId);
  const schemaUrl = asString(revision.data_resource_url);

  if (!schemaUrl) {
    throw new Error("store_schema_revise did not return data_resource_url");
  }

  const schema = await client.getJson<UnknownRecord>(schemaUrl, { dds: true, timeoutMs: 60_000 });
  if (!isRecord(schema)) {
    throw new Error("Schema JSON payload is not an object");
  }

  return {
    imageId,
    versionId,
    schemaUrl,
    schema,
  };
}

export async function getSketchJson(
  client: LanhuClient,
  imageId: string,
  teamId: string | undefined,
  projectId: string,
): Promise<LanhuSketchJsonResult> {
  const documentInfo = teamId
    ? await client.getDesignDocument(imageId, teamId, projectId)
    : await client.getDocumentInfo(projectId, imageId);
  const latestVersion = getLatestVersionInfo(documentInfo);
  const jsonUrl = asString(latestVersion?.json_url);

  if (!jsonUrl) {
    throw new Error(`Design ${imageId} is missing versions[0].json_url`);
  }

  const sketch = await client.getJson<UnknownRecord>(jsonUrl, { timeoutMs: 60_000 });
  if (!isRecord(sketch)) {
    throw new Error("Sketch JSON payload is not an object");
  }

  return {
    imageId,
    versionId: asString(latestVersion?.id),
    jsonUrl,
    documentInfo,
    sketch,
  };
}

export async function getSlices(
  client: LanhuClient,
  imageId: string,
  teamId: string | undefined,
  projectId: string,
  includeMetadata = true,
): Promise<LanhuSlicesResult> {
  const sketchResult = await getSketchJson(client, imageId, teamId, projectId);
  const latestVersion = getLatestVersionInfo(sketchResult.documentInfo);
  const documentWidth = asNumber(sketchResult.documentInfo.width);
  const documentHeight = asNumber(sketchResult.documentInfo.height);
  const expectedAnalysisDimensions = documentWidth && documentHeight
    ? {
      width: documentWidth,
      height: documentHeight,
    }
    : undefined;
  let scaleResolution = inferSketchCoordinateScale(
    sketchResult.sketch,
    expectedAnalysisDimensions,
    1,
  );
  if (
    scaleResolution.coordinateSpace === "unknown"
    && /@[123]x/.test(String(sketchResult.sketch.device ?? ""))
    && expectedAnalysisDimensions
  ) {
    const doubledReference = {
      width: expectedAnalysisDimensions.width * 2,
      height: expectedAnalysisDimensions.height * 2,
    };
    const doubledResolution = inferSketchCoordinateScale(
      sketchResult.sketch,
      doubledReference,
      1,
    );
    if (doubledResolution.coordinateSpace === "analysis") {
      scaleResolution = doubledResolution;
    }
  }
  const scale = scaleResolution.scale;
  const slices = extractSlicesFromSketch(sketchResult.sketch, includeMetadata, scale);
  const { canvasSize, canvasSizeSource, warning: canvasWarning } = resolveSliceCanvasSize(
    sketchResult.sketch,
    sketchResult.documentInfo,
    slices,
    scale,
  );
  const sliceScaleWarning = canvasSizeSource === "slice_bounds"
    && hasNonUniformScale(canvasSize, {
      width: documentWidth,
      height: documentHeight,
    })
    ? "Slice bounds produce a non-uniform document-to-analysis scale; coordinate space is unknown."
    : undefined;
  const warnings = [...new Set([
    scaleResolution.warning,
    canvasWarning,
    sliceScaleWarning,
  ].filter((warning): warning is string => Boolean(warning)))];
  const uncertainCanvas = Boolean(canvasWarning || sliceScaleWarning);

  return {
    designId: imageId,
    designName: asString(sketchResult.documentInfo.name) ?? `design-${imageId}`,
    version: asString(latestVersion?.version_info),
    canvasSize,
    canvasSizeSource,
    coordinateSpace: canvasSizeSource === "document" || uncertainCanvas
      ? "unknown"
      : scaleResolution.coordinateSpace,
    sourceScale: scale,
    ...(warnings.length > 0 ? { warning: warnings.join("; ") } : {}),
    totalSlices: slices.length,
    slices,
  };
}
