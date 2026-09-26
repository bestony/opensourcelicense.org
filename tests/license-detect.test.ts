import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectLicense } from "@/domain/license-detect";

const refs = Object.fromEntries(readdirSync("data/texts").map((f) => [f.replace(".txt", ""), readFileSync(`data/texts/${f}`, "utf8")]));

describe("detectLicense", () => {
  it("recognizes every reference text", () => {
    for (const [slug, text] of Object.entries(refs)) expect(detectLicense(text, refs)?.license).toBe(slug);
  });
  it("tolerates copyright lines and reflowed whitespace", () => {
    const mit = refs.mit.replace(/Copyright.*\n/, "Copyright (c) 2026 Jane Doe\n").replace(/ +/g, "   ");
    expect(detectLicense(mit, refs)?.license).toBe("mit");
    expect(detectLicense(readFileSync("LICENSE", "utf8"), refs)?.license).toBe("agpl-3.0");
  });
  it("returns undefined for unrelated text", () => {
    expect(detectLicense("All rights reserved. Do not copy.", refs)).toBeUndefined();
  });
});
