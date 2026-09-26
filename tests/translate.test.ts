import { describe, expect, it } from "vitest";
import { chunkStrings, extractJson, planJob, validateTranslation } from "../scripts/translate/core";
import { sourceHash } from "@/domain/text-hash";

const src = { reviewed: true, summary: "Keep {count} notices", pros: ["a", "b"], cons: [] };

describe("translate core", () => {
  it("plans missing and stale files, skips reviewed and fresh ones", () => {
    expect(planJob("ja", "licenses", "mit", src, undefined)?.reason).toBe("missing");
    expect(planJob("ja", "licenses", "mit", src, { sourceHash: "old" })?.reason).toBe("stale");
    expect(planJob("ja", "licenses", "mit", src, { sourceHash: sourceHash(src) })).toBeUndefined();
    expect(planJob("ja", "licenses", "mit", src, { reviewed: true, sourceHash: "old" })).toBeUndefined();
    expect(planJob("ja", "licenses", "mit", src, { reviewed: true, sourceHash: "old" }, true)?.reason).toBe("stale");
    expect(planJob("ja", "licenses", "mit", src, undefined)?.source).toEqual({ summary: "Keep {count} notices", pros: ["a", "b"], cons: [] });
  });

  it("validates shape and placeholders", () => {
    expect(validateTranslation({ a: "x {n}", b: ["1"] }, { a: "y {n}", b: ["2"] })).toEqual([]);
    expect(validateTranslation({ a: "x {n}" }, { a: "y" })).toEqual(["a: placeholders differ"]);
    expect(validateTranslation({ b: ["1", "2"] }, { b: ["1"] })).toEqual(["b: expected array of 2"]);
    expect(validateTranslation({ a: "x" }, { a: "" })).toEqual(["a: expected non-empty string"]);
  });

  it("chunks UI strings", () => {
    const strings = Object.fromEntries(Array.from({ length: 85 }, (_, i) => [`k${i}`, "v"]));
    expect(chunkStrings(strings, 40).map((c) => Object.keys(c).length)).toEqual([40, 40, 5]);
  });

  it("extracts JSON from fenced or chatty output", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":"b"} Thanks')).toEqual({ a: "b" });
    expect(() => extractJson("nope")).toThrow();
  });
});
