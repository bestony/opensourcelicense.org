import { describe, expect, it } from "vitest";
import { applyObservation, mapLimit, normalizeUpstream } from "../scripts/sync/core";
import type { ProjectData } from "@/domain/schema";

const known = (id: string) => ["mit", "apache-2.0", "agpl-3.0", "busl-1.1", "llama", "elv2"].includes(id);
const base: ProjectData = { name: "X", domain: "database", owner: "company", current: ["apache-2.0"], tags: [], timeline: [], needsReview: false };

describe("sync core", () => {
  it("normalizes upstream ids", () => {
    expect(normalizeUpstream("Apache-2.0", known)).toBe("apache-2.0");
    expect(normalizeUpstream("AGPL-3.0-only", known)).toBe("agpl-3.0");
    expect(normalizeUpstream("llama3.1", known)).toBe("llama");
    expect(normalizeUpstream("NOASSERTION", known)).toBeUndefined();
    expect(normalizeUpstream("WTFPL", known)).toBe("unknown:wtfpl");
  });

  it("keeps unchanged projects and stamps syncedAt", () => {
    const r = applyObservation(base, { license: "apache-2.0", evidenceUrl: "u" }, "2026-09-26");
    expect(r.status).toBe("unchanged");
    expect(r.project.syncedAt).toBe("2026-09-26");
    expect(r.project.needsReview).toBe(false);
  });

  it("drafts a timeline entry on change and flags review", () => {
    const r = applyObservation(base, { license: "busl-1.1", evidenceUrl: "https://example.com/c/1" }, "2026-09-26");
    expect(r.status).toBe("changed");
    expect(r.project.current).toEqual(["busl-1.1"]);
    expect(r.project.timeline.at(-1)).toMatchObject({ from: ["apache-2.0"], to: ["busl-1.1"], url: "https://example.com/c/1" });
    expect(r.project.needsReview).toBe(true);
    expect(base.timeline).toHaveLength(0);
  });

  it("flags review for unmapped licenses and LICENSE edits", () => {
    expect(applyObservation(base, { license: "unknown:wtfpl", evidenceUrl: "u" }, "d").status).toBe("needs-review");
    expect(applyObservation(base, { license: "apache-2.0", evidenceUrl: "u", licenseFileTouched: true }, "d").status).toBe("needs-review");
    expect(applyObservation({ ...base, current: ["agpl-3.0", "elv2"] }, { license: "elv2", evidenceUrl: "u" }, "d").status).toBe("unchanged");
  });

  it("limits concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(2);
  });
});
