import { describe, expect, it } from "vitest";

import { parseLanhuUrl } from "../src/lanhu/client.js";
import { pickTargetDesigns, resolveTargetDesigns } from "../src/tools/design.js";
import type { LanhuDesignSummary } from "../src/shared/types.js";

function makeDesign(overrides: Partial<LanhuDesignSummary> & { id: string; name: string; index: number }): LanhuDesignSummary {
  return {
    width: 375,
    height: 812,
    url: `https://img.lanhuapp.com/${overrides.id}.png`,
    hasComment: false,
    groupIds: [],
    groupNames: [],
    source: "projectImages",
    raw: {},
    ...overrides,
  };
}

const designs: LanhuDesignSummary[] = [
  makeDesign({ index: 1, id: "3e6d932e-8523-43d5-a08c-c9b3085ef23b", name: "首页" }),
  makeDesign({ index: 2, id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "详情页" }),
  makeDesign({ index: 3, id: "deadbeef-0000-1111-2222-333344445555", name: "设置页" }),
];

const defaultParsed = parseLanhuUrl("https://lanhuapp.com/web/#/item/project/stage?tid=t1&pid=p1");

describe("pickTargetDesigns", () => {
  it("selects design by UUID (id)", () => {
    const result = pickTargetDesigns(designs, defaultParsed, "3e6d932e-8523-43d5-a08c-c9b3085ef23b");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("首页");
  });

  it("selects multiple designs by UUID array", () => {
    const result = pickTargetDesigns(designs, defaultParsed, [
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "deadbeef-0000-1111-2222-333344445555",
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("详情页");
    expect(result[1].name).toBe("设置页");
  });

  it("selects by index (existing behavior preserved)", () => {
    const result = pickTargetDesigns(designs, defaultParsed, "2");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("详情页");
  });

  it("selects by name (existing behavior preserved)", () => {
    const result = pickTargetDesigns(designs, defaultParsed, "设置页");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("deadbeef-0000-1111-2222-333344445555");
  });

  it("returns every duplicate-name match instead of silently choosing one", () => {
    const duplicateDesigns = [
      makeDesign({ index: 1, id: "duplicate-1", name: "重复画板" }),
      makeDesign({ index: 2, id: "duplicate-2", name: "重复画板" }),
    ];

    expect(pickTargetDesigns(duplicateDesigns, defaultParsed, "重复画板").map((design) => design.id))
      .toEqual(["duplicate-1", "duplicate-2"]);
    expect(resolveTargetDesigns(duplicateDesigns, defaultParsed, "重复画板")).toEqual({
      status: "ambiguous",
      selector: "重复画板",
      matches: duplicateDesigns,
    });
  });

  it("selects all when 'all' is passed", () => {
    const result = pickTargetDesigns(designs, defaultParsed, "all");
    expect(result).toHaveLength(3);
  });

  it("deduplicates when same design matched multiple times", () => {
    const result = pickTargetDesigns(designs, defaultParsed, [
      "3e6d932e-8523-43d5-a08c-c9b3085ef23b",
      "首页",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("首页");
  });

  it("prefers id over name when both could match", () => {
    const specialDesigns = [
      makeDesign({ index: 1, id: "special-id", name: "other-name" }),
      makeDesign({ index: 2, id: "other-id", name: "special-id" }),
    ];
    const result = pickTargetDesigns(specialDesigns, defaultParsed, "special-id");
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(1);
  });

  it("returns empty for unmatched UUID", () => {
    const result = pickTargetDesigns(designs, defaultParsed, "00000000-0000-0000-0000-000000000000");
    expect(result).toHaveLength(0);
  });

  it("trims whitespace from UUID input", () => {
    const result = pickTargetDesigns(designs, defaultParsed, "  3e6d932e-8523-43d5-a08c-c9b3085ef23b  ");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("首页");
  });

  it("does not let image_id override an explicit unmatched selector", () => {
    const parsedWithDocId = parseLanhuUrl(
      "https://lanhuapp.com/web/#/item/project/detailDetach?tid=t1&pid=p1&image_id=deadbeef-0000-1111-2222-333344445555",
    );
    const result = pickTargetDesigns(designs, parsedWithDocId, "nonexistent");
    expect(result).toEqual([]);
    expect(resolveTargetDesigns(designs, parsedWithDocId, "nonexistent")).toEqual({
      status: "selected",
      designs: [],
      unmatchedSelectors: ["nonexistent"],
    });
  });

  it("matches UUID case-insensitively", () => {
    const result = pickTargetDesigns(designs, defaultParsed, "3E6D932E-8523-43D5-A08C-C9B3085EF23B");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("首页");
  });

  it("matches mixed-case UUID in array", () => {
    const result = pickTargetDesigns(designs, defaultParsed, [
      "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
      "DEADBEEF-0000-1111-2222-333344445555",
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("详情页");
    expect(result[1].name).toBe("设置页");
  });

  it("handles mixed name and id in same array", () => {
    const result = pickTargetDesigns(designs, defaultParsed, [
      "首页",
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("首页");
    expect(result[1].name).toBe("详情页");
  });

  it("case-insensitive 'ALL' variants select everything", () => {
    expect(pickTargetDesigns(designs, defaultParsed, "ALL")).toHaveLength(3);
    expect(pickTargetDesigns(designs, defaultParsed, "All")).toHaveLength(3);
    expect(pickTargetDesigns(designs, defaultParsed, " all ")).toHaveLength(3);
  });

  it("reports unmatched selectors while preserving valid batch matches", () => {
    const parsedWithDocId = parseLanhuUrl(
      "https://lanhuapp.com/web/#/item/project/detailDetach?tid=t1&pid=p1&image_id=DEADBEEF-0000-1111-2222-333344445555",
    );
    expect(resolveTargetDesigns(designs, parsedWithDocId, [2, "missing-design"])).toEqual({
      status: "selected",
      designs: [designs[1]],
      unmatchedSelectors: ["missing-design"],
    });
  });

  it("automatically selects image_id from a stage URL when design_names is omitted", () => {
    const parsedWithImageId = parseLanhuUrl(
      "https://lanhuapp.com/web/#/item/project/stage?tid=t1&pid=p1&image_id=A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
    );

    const result = pickTargetDesigns(designs, parsedWithImageId);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("详情页");
  });

  it("returns no implicit target for stage URLs without image_id", () => {
    expect(pickTargetDesigns(designs, defaultParsed)).toEqual([]);
  });
});
