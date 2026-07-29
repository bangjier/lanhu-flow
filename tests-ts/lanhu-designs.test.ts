import { describe, expect, it } from "vitest";

import { LanhuClient, parseLanhuUrl } from "../src/lanhu/client.js";
import { getSketchJson, getSlices, listDesigns } from "../src/lanhu/designs.js";

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("parseLanhuUrl", () => {
  it("parses detailDetach URLs with image_id", () => {
    const parsed = parseLanhuUrl(
      "https://lanhuapp.com/web/#/item/project/detailDetach?tid=team-1&pid=project-1&image_id=image-1",
    );

    expect(parsed.kind).toBe("design");
    expect(parsed.route).toBe("/item/project/detailDetach");
    expect(parsed.teamId).toBe("team-1");
    expect(parsed.projectId).toBe("project-1");
    expect(parsed.docId).toBe("image-1");
    expect(parsed.imageId).toBe("image-1");
  });

  it("allows detailDetach URLs without team id", () => {
    const parsed = parseLanhuUrl(
      "https://lanhuapp.com/web/#/item/project/detailDetach?pid=project-1&image_id=image-1",
    );

    expect(parsed.kind).toBe("design");
    expect(parsed.teamId).toBeUndefined();
    expect(parsed.projectId).toBe("project-1");
    expect(parsed.docId).toBe("image-1");
  });
});

describe("listDesigns", () => {
  it("uses HAR detail flow for detailDetach single-image links with team id", async () => {
    const seenRequests: string[] = [];
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        seenRequests.push(url.toString());

        if (url.pathname === "/api/project/multi_info") {
          expect(url.searchParams.get("project_id")).toBe("project-1");
          expect(url.searchParams.get("team_id")).toBe("team-1");
          expect(url.searchParams.get("img_limit")).toBe("1");
          expect(url.searchParams.get("detach")).toBe("1");

          return createJsonResponse({
            code: "00000",
            result: {
              name: "订单项目",
            },
          });
        }

        expect(url.pathname).toBe("/api/project/image");
        expect(url.searchParams.get("dds_status")).toBe("1");
        expect(url.searchParams.get("image_id")).toBe("image-1");
        expect(url.searchParams.get("team_id")).toBe("team-1");
        expect(url.searchParams.get("project_id")).toBe("project-1");
        expect(url.searchParams.get("all_versions")).toBe("0");

        return createJsonResponse({
          code: "00000",
          result: {
            id: "image-1",
            name: "详情页首图",
            width: 375,
            height: 812,
            url: "https://img.lanhuapp.com/XDCoverPNGORG/demo.png",
            update_time: "2026-03-31T10:00:00Z",
          },
        });
      },
    });

    const result = await listDesigns(
      client,
      "https://lanhuapp.com/web/#/item/project/detailDetach?tid=team-1&pid=project-1&image_id=image-1",
    );

    expect(seenRequests.map((requestUrl) => new URL(requestUrl).pathname)).toEqual([
      "/api/project/multi_info",
      "/api/project/image",
    ]);
    expect(result.source).toBe("detailDetach");
    expect(result.projectName).toBe("订单项目");
    expect(result.totalDesigns).toBe(1);
    expect(result.designs[0]).toMatchObject({
      id: "image-1",
      name: "详情页首图",
      width: 375,
      height: 812,
      url: "https://img.lanhuapp.com/XDCoverPNGORG/demo.png",
      source: "detailDetach",
    });
  });

  it("uses document detail flow for detailDetach links without team id", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));

        expect(url.pathname).toBe("/api/project/image");
        expect(url.searchParams.get("pid")).toBe("project-1");
        expect(url.searchParams.get("image_id")).toBe("image-1");
        expect(url.searchParams.has("team_id")).toBe(false);

        return createJsonResponse({
          code: "00000",
          result: {
            id: "image-1",
            name: "详情页首图",
            url: "https://img.lanhuapp.com/XDCoverPNGORG/demo.png",
          },
        });
      },
    });

    const result = await listDesigns(
      client,
      "https://lanhuapp.com/web/#/item/project/detailDetach?pid=project-1&image_id=image-1",
    );

    expect(result.source).toBe("detailDetach");
    expect(result.params.teamId).toBeUndefined();
    expect(result.designs[0].url).toBe("https://img.lanhuapp.com/XDCoverPNGORG/demo.png");
  });

  it("maps /api/project/images into ordered design summaries", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));

        expect(url.pathname).toBe("/api/project/images");
        expect(url.searchParams.get("project_id")).toBe("project-2");
        expect(url.searchParams.get("team_id")).toBe("team-2");
        expect(url.searchParams.get("dds_status")).toBe("1");
        expect(url.searchParams.get("position")).toBe("1");
        expect(url.searchParams.get("show_cb_src")).toBe("1");
        expect(url.searchParams.get("comment")).toBe("1");

        return createJsonResponse({
          code: "00000",
          data: {
            name: "订单设计稿",
            images: [
              {
                id: "image-a",
                name: "首页",
                width: 375,
                height: 812,
                cb_src: "https://img.lanhuapp.com/home.png",
                comment_count: 2,
                update_time: "2026-03-31T10:00:00Z",
                latest_version: "version-a",
                sketch_id: "sketch-a",
                group: ["image-b"],
                type: "set",
              },
              {
                id: "image-b",
                name: "详情页",
                width: 390,
                height: 844,
                url: "https://img.lanhuapp.com/detail.png",
                has_comment: false,
                update_time: "2026-03-31T10:05:00Z",
              },
            ],
          },
        });
      },
    });

    const result = await listDesigns(
      client,
      "https://lanhuapp.com/web/#/item/project/stage?tid=team-2&pid=project-2",
    );

    expect(result.source).toBe("projectImages");
    expect(result.projectName).toBe("订单设计稿");
    expect(result.totalDesigns).toBe(2);
    expect(result.designs.map((design) => ({ index: design.index, id: design.id, name: design.name }))).toEqual([
      { index: 1, id: "image-a", name: "首页" },
      { index: 2, id: "image-b", name: "详情页" },
    ]);
    expect(result.designs[0]).toMatchObject({
      url: "https://img.lanhuapp.com/home.png",
      hasComment: true,
      updateTime: "2026-03-31T10:00:00Z",
      versionId: "version-a",
      sketchId: "sketch-a",
      groupIds: ["image-b"],
      groupNames: ["详情页"],
      groupId: "image-b",
      group: "详情页",
      artboardType: "set",
    });
    expect(result.designs[0].raw).toMatchObject({
      latest_version: "version-a",
      sketch_id: "sketch-a",
      group: ["image-b"],
      type: "set",
    });
  });
});

describe("getSketchJson", () => {
  it("loads Sketch JSON from detailDetach document info without team id", async () => {
    const seenPaths: string[] = [];
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        seenPaths.push(url.pathname);

        if (url.pathname === "/api/project/image") {
          expect(url.searchParams.get("pid")).toBe("project-1");
          expect(url.searchParams.get("image_id")).toBe("image-1");
          expect(url.searchParams.has("team_id")).toBe(false);

          return createJsonResponse({
            code: "00000",
            result: {
              id: "image-1",
              name: "首页",
              versions: [{
                id: "version-1",
                json_url: "https://assets.lanhuapp.com/XDJSON/demo.json",
              }],
            },
          });
        }

        expect(url.toString()).toBe("https://assets.lanhuapp.com/XDJSON/demo.json");
        return createJsonResponse({
          device: "iPhone",
          artboard: { layers: [] },
        });
      },
    });

    const result = await getSketchJson(client, "image-1", undefined, "project-1");

    expect(seenPaths).toEqual(["/api/project/image", "/XDJSON/demo.json"]);
    expect(result.versionId).toBe("version-1");
    expect(result.sketch).toMatchObject({ device: "iPhone" });
  });
});

describe("getSlices", () => {
  it("extracts board-format slices with paths, coordinates, and Sketch style metadata", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "image-1",
              name: "资产画板",
              width: 750,
              height: 1334,
              versions: [{
                id: "version-1",
                version_info: "v3",
                json_url: "https://assets.lanhuapp.com/XDJSON/board.json",
              }],
            },
          });
        }

        expect(url.toString()).toBe("https://assets.lanhuapp.com/XDJSON/board.json");
        return createJsonResponse({
          board: {
            layers: [{
              id: "group-1",
              type: "groupLayer",
              name: "Assets",
              layers: [{
                id: "slice-1",
                type: "shapeLayer",
                name: "Logo",
                left: 24,
                top: 36,
                width: 96,
                height: 48,
                ddsImage: { imageUrl: "https://assets.lanhuapp.com/logo.png" },
                style: {
                  fills: [{ color: { value: "#ffffff" } }],
                  borders: [{ thickness: 1 }],
                  shadows: [{ blurRadius: 8 }],
                },
                radius: [8, 8, 8, 8],
              }],
            }],
          },
        });
      },
    });

    const result = await getSlices(client, "image-1", "team-1", "project-1", true);

    expect(result).toMatchObject({
      designId: "image-1",
      designName: "资产画板",
      version: "v3",
      canvasSize: { width: 750, height: 1334 },
      canvasSizeSource: "document",
      totalSlices: 1,
    });
    expect(result.slices[0]).toMatchObject({
      id: "slice-1",
      name: "Logo",
      type: "shapeLayer",
      downloadUrl: "https://assets.lanhuapp.com/logo.png",
      size: "96x48",
      format: "png",
      position: { x: 24, y: 36 },
      parentName: "Assets",
      layerPath: "Assets/Logo",
      metadata: {
        style: {
          fills: [{ color: { value: "#ffffff" } }],
          borders: [{ thickness: 1 }],
          shadows: [{ blurRadius: 8 }],
        },
        fills: [{ color: { value: "#ffffff" } }],
        borders: [{ thickness: 1 }],
        shadows: [{ blurRadius: 8 }],
        border_radius: [8, 8, 8, 8],
      },
    });
  });

  it("uses slice bounds when document dimensions are in the scaled list coordinate space", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "image-scaled",
              name: "Scaled assets",
              width: 187.5,
              height: 856,
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/scaled.json" }],
            },
          });
        }
        return createJsonResponse({
          width: 187.5,
          height: 856,
          info: [{
            id: "top-slice",
            type: "shape",
            name: "Top",
            left: 0,
            top: 0,
            width: 375,
            height: 98,
            ddsImage: { imageUrl: "https://assets.lanhuapp.com/top.png" },
          }, {
            id: "bottom-slice",
            type: "shape",
            name: "Bottom",
            left: 0,
            top: 1614,
            width: 375,
            height: 98,
            ddsImage: { imageUrl: "https://assets.lanhuapp.com/bottom.png" },
          }],
        });
      },
    });

    const result = await getSlices(client, "image-scaled", "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 375, height: 1712 },
      canvasSizeSource: "slice_bounds",
      totalSlices: 2,
    });
  });

  it("prefers a measured Sketch canvas over incomplete slice coverage", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "incomplete-coverage",
              name: "Incomplete coverage",
              width: 187.5,
              height: 840.5,
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/incomplete-coverage.json" }],
            },
          });
        }
        return createJsonResponse({
          device: "iPhone @1x",
          info: [{
            id: "canvas",
            name: "Canvas",
            left: 0,
            top: 0,
            width: 375,
            height: 1681,
          }, {
            id: "slice",
            name: "Slice",
            left: 0,
            top: 0,
            width: 375,
            height: 1667,
            image: { imageUrl: "https://assets.example.test/slice.png" },
          }],
        });
      },
    });

    const result = await getSlices(client, "incomplete-coverage", "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 375, height: 1681 },
      canvasSizeSource: "sketch",
      coordinateSpace: "analysis",
      sourceScale: 1,
      totalSlices: 1,
      slices: [{ size: "375x1667", position: { x: 0, y: 0 } }],
    });
  });

  it("uses uniform slice bounds when no trustworthy Sketch canvas exists", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "bounds-fallback",
              name: "Bounds fallback",
              width: 187.5,
              height: 406,
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/bounds-fallback.json" }],
            },
          });
        }
        return createJsonResponse({
          device: "iPhone @1x",
          info: [{
            id: "slice",
            name: "Slice",
            left: 10,
            top: 10,
            width: 365,
            height: 802,
            image: { imageUrl: "https://assets.example.test/slice.png" },
          }],
        });
      },
    });

    const result = await getSlices(client, "bounds-fallback", "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 375, height: 812 },
      canvasSizeSource: "slice_bounds",
      coordinateSpace: "analysis",
      sourceScale: 1,
    });
  });

  it("marks non-uniform fallback slice bounds as unknown", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "non-uniform-bounds",
              name: "Non-uniform bounds",
              width: 187.5,
              height: 840.5,
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/non-uniform-bounds.json" }],
            },
          });
        }
        return createJsonResponse({
          device: "iPhone @1x",
          info: [{
            id: "slice",
            name: "Slice",
            left: 10,
            top: 10,
            width: 365,
            height: 1657,
            image: { imageUrl: "https://assets.example.test/slice.png" },
          }],
        });
      },
    });

    const result = await getSlices(client, "non-uniform-bounds", "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 375, height: 1667 },
      canvasSizeSource: "slice_bounds",
      coordinateSpace: "unknown",
      warning: "Slice bounds produce a non-uniform document-to-analysis scale; coordinate space is unknown.",
    });
  });

  it("marks slices outside a trusted Sketch canvas as unknown", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "bounds-conflict",
              name: "Bounds conflict",
              width: 375,
              height: 812,
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/bounds-conflict.json" }],
            },
          });
        }
        return createJsonResponse({
          device: "iPhone @1x",
          artboard: {
            frame: { width: 375, height: 812 },
            layers: [{
              id: "slice",
              name: "Slice",
              frame: { x: 0, y: 0, width: 375, height: 900 },
              image: { imageUrl: "https://assets.example.test/slice.png" },
            }],
          },
        });
      },
    });

    const result = await getSlices(client, "bounds-conflict", "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 375, height: 812 },
      canvasSizeSource: "sketch",
      coordinateSpace: "unknown",
      warning: "Slice bounds exceed the trusted Sketch canvas; coordinate space is unknown.",
    });
  });

  it("keeps a trusted Sketch canvas when there are no slices", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "empty-board",
              name: "Empty board",
              width: 2962,
              height: 214,
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/empty-board.json" }],
            },
          });
        }
        return createJsonResponse({
          device: "Desktop @1x",
          board: {
            width: 2962,
            height: 214,
            layers: [{ id: "background", name: "Background", width: 2962, height: 214 }],
          },
        });
      },
    });

    const result = await getSlices(client, "empty-board", "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 2962, height: 214 },
      canvasSizeSource: "sketch",
      coordinateSpace: "analysis",
      totalSlices: 0,
      slices: [],
    });
  });

  it.each([2, 3])("normalizes @%ix sketch canvas and slice geometry", async (scale) => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: `image-${scale}x`,
              name: `Scaled ${scale}x`,
              width: 375,
              height: 812,
              versions: [{ json_url: `https://assets.lanhuapp.com/XDJSON/${scale}x.json` }],
            },
          });
        }
        return createJsonResponse({
          device: `iPhone @${scale}x`,
          artboard: {
            frame: { width: 375 * scale, height: 812 * scale },
            layers: [{
              id: "hero",
              type: "shapeLayer",
              name: "Hero",
              frame: {
                x: 16 * scale,
                y: 50 * scale,
                width: 120 * scale,
                height: 24 * scale,
              },
              image: { imageUrl: "https://assets.lanhuapp.com/hero.png" },
            }],
          },
        });
      },
    });

    const result = await getSlices(client, `image-${scale}x`, "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 375, height: 812 },
      canvasSizeSource: "sketch",
      coordinateSpace: "analysis",
      sourceScale: scale,
      slices: [{
        size: "120x24",
        position: { x: 16, y: 50 },
      }],
    });
  });

  it("marks explicit slice scale conflicts as unknown", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "explicit-conflict",
              name: "Explicit conflict",
              width: 375,
              height: 812,
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/explicit-conflict.json" }],
            },
          });
        }
        return createJsonResponse({
          device: "iPhone @2x",
          artboard: {
            frame: { width: 375, height: 812 },
            layers: [{
              id: "hero",
              name: "Hero",
              frame: { x: 16, y: 50, width: 120, height: 24 },
              image: { imageUrl: "https://assets.lanhuapp.com/hero.png" },
            }],
          },
        });
      },
    });

    const result = await getSlices(client, "explicit-conflict", "team-1", "project-1", true);

    expect(result).toMatchObject({
      coordinateSpace: "unknown",
      sourceScale: 2,
      warning: expect.stringContaining("Explicit Sketch scale @2x conflicts"),
    });
  });

  it("keeps explicit @1x slices compatible with half-size document dimensions", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "legacy-half-size-1x",
              name: "Legacy half-size @1x",
              width: 187.5,
              height: 406,
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/legacy-half-size-1x.json" }],
            },
          });
        }
        return createJsonResponse({
          device: "iPhone @1x",
          artboard: {
            frame: { width: 375, height: 812 },
            layers: [{
              id: "hero",
              name: "Hero",
              frame: { x: 16, y: 50, width: 120, height: 24 },
              image: { imageUrl: "https://assets.lanhuapp.com/hero.png" },
            }],
          },
        });
      },
    });

    const result = await getSlices(client, "legacy-half-size-1x", "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 375, height: 812 },
      coordinateSpace: "analysis",
      sourceScale: 1,
      slices: [{ size: "120x24", position: { x: 16, y: 50 } }],
    });
  });

  it("marks scale-1 legacy canvas conflicts as unknown", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "legacy-conflict",
              name: "Legacy conflict",
              width: 375,
              height: 812,
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/legacy-conflict.json" }],
            },
          });
        }
        return createJsonResponse({
          device: "iPhone",
          width: 375,
          height: 812,
          info: [{
            id: "full-canvas",
            name: "Full canvas",
            left: 0,
            top: 0,
            width: 750,
            height: 1624,
            ddsImage: { imageUrl: "https://assets.lanhuapp.com/full-canvas.png" },
          }],
        });
      },
    });

    const result = await getSlices(client, "legacy-conflict", "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 750, height: 1624 },
      canvasSizeSource: "slice_bounds",
      coordinateSpace: "unknown",
      sourceScale: 1,
      warning: "Legacy Sketch canvas dimensions conflict with normalized layer bounds; coordinate space is unknown.",
    });
  });

  it("infers @2x slice coordinates without an explicit device scale", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "unmarked-2x",
              name: "Unmarked 2x",
              width: 375,
              height: 812,
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/unmarked-2x.json" }],
            },
          });
        }
        return createJsonResponse({
          device: "iPhone",
          artboard: {
            frame: { width: 750, height: 1624 },
            layers: [{
              id: "hero",
              type: "shapeLayer",
              name: "Hero",
              frame: { x: 32, y: 100, width: 240, height: 48 },
              image: { imageUrl: "https://assets.lanhuapp.com/hero.png" },
            }],
          },
        });
      },
    });

    const result = await getSlices(client, "unmarked-2x", "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 375, height: 812 },
      canvasSizeSource: "sketch",
      coordinateSpace: "analysis",
      sourceScale: 2,
      slices: [{ size: "120x24", position: { x: 16, y: 50 } }],
    });
  });

  it.each([200, 375])("keeps an unmarked %ix document and Sketch canvas at @1x", async (size) => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: `same-${size}`,
              name: `Same ${size}`,
              width: size,
              height: size,
              versions: [{ json_url: `https://assets.lanhuapp.com/XDJSON/same-${size}.json` }],
            },
          });
        }
        return createJsonResponse({
          device: "iPhone",
          artboard: {
            frame: { width: size, height: size },
            layers: [{
              id: "icon",
              name: "Icon",
              frame: { x: 10, y: 20, width: 40, height: 30 },
              image: { imageUrl: "https://assets.lanhuapp.com/icon.png" },
            }],
          },
        });
      },
    });

    const result = await getSlices(client, `same-${size}`, "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: size, height: size },
      canvasSizeSource: "sketch",
      coordinateSpace: "analysis",
      sourceScale: 1,
      slices: [{ size: "40x30", position: { x: 10, y: 20 } }],
    });
  });

  it("marks slices unknown when neither dimensions nor a device scale are available", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "no-reference",
              name: "No reference",
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/no-reference.json" }],
            },
          });
        }
        return createJsonResponse({
          device: "iPhone",
          artboard: {
            frame: { width: 750, height: 1624 },
            layers: [{
              id: "title",
              name: "Title",
              frame: { x: 32, y: 100, width: 240, height: 48 },
              image: { imageUrl: "https://assets.lanhuapp.com/title.png" },
            }],
          },
        });
      },
    });

    const result = await getSlices(client, "no-reference", "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 750, height: 1624 },
      canvasSizeSource: "sketch",
      coordinateSpace: "unknown",
      sourceScale: 1,
      warning: "Sketch scale could not be inferred without reference dimensions or an explicit device scale.",
      slices: [{ size: "240x48", position: { x: 32, y: 100 } }],
    });
  });

  it("marks unresolvable unmarked slice coordinates as unknown", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "unmarked-unknown",
              name: "Unmarked unknown",
              width: 375,
              height: 812,
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/unmarked-unknown.json" }],
            },
          });
        }
        return createJsonResponse({
          device: "iPhone",
          artboard: {
            frame: { width: 500, height: 900 },
            layers: [{
              id: "card",
              name: "Card",
              frame: { x: 10, y: 20, width: 100, height: 50 },
              image: { imageUrl: "https://assets.lanhuapp.com/card.png" },
            }],
          },
        });
      },
    });

    const result = await getSlices(client, "unmarked-unknown", "team-1", "project-1", true);

    expect(result).toMatchObject({
      coordinateSpace: "unknown",
      warning: "Sketch scale could not be inferred from the available canvas dimensions.",
      sourceScale: 1,
    });
  });

  it.each([2, 3])("uses normalized @%ix multi-slice bounds", async (scale) => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: `bounds-${scale}x`,
              name: `Bounds ${scale}x`,
              width: 187.5,
              height: 406,
              versions: [{ json_url: `https://assets.lanhuapp.com/XDJSON/bounds-${scale}x.json` }],
            },
          });
        }
        return createJsonResponse({
          device: `iPhone @${scale}x`,
          artboard: {
            frame: { width: 375 * scale, height: 812 * scale },
            layers: [{
              id: "top",
              name: "Top",
              left: 0,
              top: 0,
              width: 375 * scale,
              height: 98 * scale,
              ddsImage: { imageUrl: "https://assets.lanhuapp.com/top.png" },
            }, {
              id: "bottom",
              name: "Bottom",
              left: 0,
              top: 714 * scale,
              width: 375 * scale,
              height: 98 * scale,
              ddsImage: { imageUrl: "https://assets.lanhuapp.com/bottom.png" },
            }],
          },
        });
      },
    });

    const result = await getSlices(client, `bounds-${scale}x`, "team-1", "project-1", true);

    expect(result).toMatchObject({
      canvasSize: { width: 375, height: 812 },
      canvasSizeSource: "sketch",
      coordinateSpace: "analysis",
      sourceScale: scale,
      slices: [{ size: "375x98", position: { x: 0, y: 0 } }, {
        size: "375x98",
        position: { x: 0, y: 714 },
      }],
    });
  });

  it("extracts legacy info-format slices and infers their size", async () => {
    const client = new LanhuClient({
      fetchImpl: async (input) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
        if (url.pathname === "/api/project/image") {
          return createJsonResponse({
            code: "00000",
            result: {
              id: "image-2",
              name: "Legacy assets",
              versions: [{ json_url: "https://assets.lanhuapp.com/XDJSON/info.json" }],
            },
          });
        }
        return createJsonResponse({
          info: [{
            id: "legacy-slice",
            type: "shape",
            name: "Mask",
            ddsOriginFrame: {},
            layerOriginFrame: { x: 10, y: 20, width: 100, height: 50 },
            ddsImage: {
              imageUrl: "https://assets.lanhuapp.com/mask.png",
              size: "unknown",
            },
            fills: [{ color: { value: "rgba(255,255,255,1)" } }],
            opacity: 80,
          }],
        });
      },
    });

    const result = await getSlices(client, "image-2", "team-1", "project-1", true);

    expect(result.slices).toEqual([
      expect.objectContaining({
        id: "legacy-slice",
        name: "Mask",
        type: "shape",
        size: "100x50",
        position: { x: 10, y: 20 },
        layerPath: "Mask",
        metadata: expect.objectContaining({
          fills: [{ color: { value: "rgba(255,255,255,1)" } }],
          opacity: 80,
        }),
      }),
    ]);
  });
});
