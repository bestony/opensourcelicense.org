import { describe, expect, it } from "vitest";
import { buildProjectIndex, changesByYear, filterProjects, openToSourceAvailable, similarProjects } from "@/domain/projects";
import { realCatalog } from "./helpers";

const cat = realCatalog();
const idx = buildProjectIndex(cat);

describe("projects", () => {
  it("returns all projects without filters", () => {
    expect(filterProjects(idx, {}).size).toBe(cat.projects.size);
  });

  it("intersects filters", () => {
    const r = filterProjects(idx, { domain: "database", changed: true });
    expect([...r].sort()).toEqual(["cockroachdb", "elasticsearch", "minio", "mongodb", "redis"]);
    for (const s of filterProjects(idx, { family: "source-available", owner: "company" })) expect(cat.projects.get(s)!.owner).toBe("company");
  });

  it("finds open-to-source-available moves", () => {
    const slugs = openToSourceAvailable(cat).map((x) => x.project.slug);
    expect(slugs).toEqual(expect.arrayContaining(["redis", "elasticsearch", "terraform", "sentry", "cockroachdb"]));
    expect(slugs).not.toContain("grafana");
  });

  it("aggregates changes by year", () => {
    const years = changesByYear(cat);
    expect(years.find((y) => y.year === "2023")?.count).toBeGreaterThanOrEqual(5);
    expect(years.map((y) => y.year)).toEqual([...years.map((y) => y.year)].sort());
  });

  it("suggests similar projects in the same domain", () => {
    const sim = similarProjects(cat, cat.projects.get("redis")!);
    expect(sim.every((p) => p.domain === "database")).toBe(true);
    expect(sim[0].slug).toBe("elasticsearch");
  });
});
