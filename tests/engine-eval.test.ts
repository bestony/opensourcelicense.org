import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { recommend } from "@/domain/engine";
import { sanitizeProfile } from "@/domain/profile";
import { realCatalog } from "./helpers";

interface Case {
  id: string;
  profile: unknown;
  expect: string[];
}

const cases = parse(readFileSync("tests/eval/engine-cases.yaml", "utf8")) as Case[];
const cat = realCatalog();

describe("engine eval set", () => {
  it("has at least 50 cases", () => expect(cases.length).toBeGreaterThanOrEqual(50));

  it("agrees with expert expectations in >= 90% of cases", () => {
    const misses = cases
      .map((c) => ({ id: c.id, expect: c.expect, got: recommend(sanitizeProfile(c.profile), cat).top[0]?.license }))
      .filter((r) => !r.expect.includes(r.got ?? ""));
    const agreement = 1 - misses.length / cases.length;
    if (misses.length) console.info("engine eval misses", JSON.stringify(misses));
    expect(agreement).toBeGreaterThanOrEqual(0.9);
  });
});
