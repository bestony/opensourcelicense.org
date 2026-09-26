import { describe, expect, it } from "vitest";
import { sourceHash } from "@/domain/text-hash";

describe("sourceHash", () => {
  it("ignores key order and translation metadata", () => {
    expect(sourceHash({ a: 1, b: [1, { c: 2 }], reviewed: true })).toBe(sourceHash({ b: [1, { c: 2 }], a: 1, sourceHash: "x" }));
  });
  it("changes when content changes", () => {
    expect(sourceHash({ summary: "a" })).not.toBe(sourceHash({ summary: "b" }));
    expect(sourceHash({ summary: "a" })).toMatch(/^[0-9a-f]{16}$/);
  });
});
