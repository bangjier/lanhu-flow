import { describe, expect, it } from "vitest";
import { mapConcurrent, withRetry } from "../src/shared/concurrency.js";

describe("mapConcurrent", () => {
  it("processes all items and returns settled results", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapConcurrent(items, async (n) => n * 2, 3);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const values = results.map((r) => (r as PromiseFulfilledResult<number>).value);
    expect(values).toEqual([2, 4, 6, 8, 10]);
  });

  it("respects concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6];
    await mapConcurrent(
      items,
      async (n) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return n;
      },
      2,
    );
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("captures rejections without aborting other items", async () => {
    const items = [1, 2, 3];
    const results = await mapConcurrent(
      items,
      async (n) => {
        if (n === 2) throw new Error("fail");
        return n;
      },
      3,
    );
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(results[2].status).toBe("fulfilled");
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const result = await withRetry(async () => 42);
    expect(result).toBe(42);
  });

  it("retries on failure and succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts === 1) throw new Error("transient");
        return "ok";
      },
      { retries: 1, delayMs: 10 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("throws after exhausting retries", async () => {
    await expect(
      withRetry(
        async () => { throw new Error("permanent"); },
        { retries: 1, delayMs: 10 },
      ),
    ).rejects.toThrow("permanent");
  });
});
