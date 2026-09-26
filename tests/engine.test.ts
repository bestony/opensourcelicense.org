import { describe, expect, it } from "vitest";
import { recommend } from "@/domain/engine";
import { sanitizeProfile, type Profile } from "@/domain/profile";
import { realCatalog } from "./helpers";

const cat = realCatalog();
const run = (p: Partial<Profile>) => recommend(sanitizeProfile(p), cat);
const top = (p: Partial<Profile>) => run(p).top.map((r) => r.license);

describe("engine", () => {
  it("is deterministic", () => {
    const p = { artifact_type: "library", openness_level: "open", adoption_goal: "enterprise" } as const;
    expect(run(p)).toEqual(run(p));
  });

  it("recommends permissive licenses for enterprise adoption", () => {
    const t = top({ artifact_type: "library", openness_level: "open", adoption_goal: "enterprise", avoid: ["patent-litigation"] });
    expect(t[0]).toBe("apache-2.0");
    expect(t).toContain("mulanpsl-2.0");
  });

  it("recommends copyleft when avoiding closed forks", () => {
    const t = top({ artifact_type: "application", openness_level: "reciprocal", adoption_goal: "community", avoid: ["closed-fork"] });
    expect(t[0]).toBe("gpl-3.0");
    expect(t).toContain("agpl-3.0");
  });

  it("recommends source-available licenses against cloud vendors", () => {
    const r = run({
      artifact_type: "saas",
      openness_level: "source-available",
      adoption_goal: "monetize",
      commercial_plan: "hosted",
      avoid: ["cloud-hosting"],
    });
    expect(r.top.map((x) => x.license).slice(0, 2).sort()).toEqual(["busl-1.1", "elv2"]);
    expect(r.advisories).toContain("needs-cla");
  });

  it("excludes licenses incompatible with a GPL-3.0 dependency", () => {
    const r = run({ artifact_type: "library", openness_level: "open", adoption_goal: "enterprise", dependencies: ["GPL-3.0-only"] });
    expect(r.top.map((x) => x.license).every((l) => l === "gpl-3.0" || l === "agpl-3.0")).toBe(true);
    expect(r.excluded.find((e) => e.license === "mit")?.reasonKey).toBe("engine.excluded.dependency");
  });

  it("uses the model matrix for model weights", () => {
    const r = run({ artifact_type: "model", openness_level: "source-available", adoption_goal: "community", avoid: ["harmful-use"] });
    expect(r.matrix).toBe("model");
    expect(r.top[0].license).toBe("openrail-m");
    expect(r.advisories).toContain("model-card");
  });

  it("limits datasets to data licenses", () => {
    const r = run({ artifact_type: "dataset", openness_level: "open", adoption_goal: "enterprise" });
    expect(r.ranked.map((x) => x.license).sort()).toEqual(["apache-2.0", "cc-by-4.0", "cc-by-nc-4.0", "mit", "odbl-1.0", "odc-by-1.0"]);
    expect(r.excluded.map((e) => e.license).sort()).toEqual(["llama", "openrail-m"]);
  });

  it("prefers MulanPSL-2.0 in the cn jurisdiction", () => {
    const base = { artifact_type: "library", openness_level: "open", adoption_goal: "enterprise" } as const;
    const score = (p: Partial<Profile>) => run(p).ranked.find((r) => r.license === "mulanpsl-2.0")!.score;
    expect(score({ ...base, jurisdiction: "cn" })).toBeGreaterThan(score(base));
  });

  it("explains every score", () => {
    const r = run({ artifact_type: "library", openness_level: "open", adoption_goal: "enterprise", avoid: ["cloud-hosting"] });
    for (const x of r.ranked) expect(x.parts.reduce((s, p) => s + p.points, 0)).toBeCloseTo(x.score);
  });
});
