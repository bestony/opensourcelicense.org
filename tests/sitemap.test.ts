import { describe, expect, it } from "vitest";
import { buildSitemapChunks, getChunkName, isPageNoindex } from "@/lib/seo";

describe("sitemap filter (isPageNoindex)", () => {
  it("filters out interactive/noindex tool pages", () => {
    const excluded = [
      "https://opensourcelicense.org/r",
      "https://opensourcelicense.org/r/",
      "https://opensourcelicense.org/zh-cn/r",
      "https://opensourcelicense.org/search",
      "https://opensourcelicense.org/ja/search",
      "https://opensourcelicense.org/chat",
      "https://opensourcelicense.org/fr/chat",
      "https://opensourcelicense.org/check",
      "https://opensourcelicense.org/wizard",
      "https://opensourcelicense.org/de/wizard",
      "https://opensourcelicense.org/compare",
      "https://opensourcelicense.org/zh-cn/compare",
      "https://opensourcelicense.org/404",
      "https://opensourcelicense.org/404/",
    ];
    for (const url of excluded) {
      expect(isPageNoindex(url), `expected ${url} to be noindexed`).toBe(true);
    }
  });

  it("filters out low-demand locales (zu, xh, rm, zgh, ga)", () => {
    const lowDemand = [
      "https://opensourcelicense.org/zu",
      "https://opensourcelicense.org/zu/licenses",
      "https://opensourcelicense.org/xh/licenses/mit",
      "https://opensourcelicense.org/rm/scenarios/A1",
      "https://opensourcelicense.org/zgh/compare",
      "https://opensourcelicense.org/ga/licenses/apache-2.0",
    ];
    for (const url of lowDemand) {
      expect(isPageNoindex(url), `expected ${url} to be noindexed`).toBe(true);
    }
  });

  it("filters out non-English project pages", () => {
    const nonEnProjects = [
      "https://opensourcelicense.org/zh-cn/projects/react",
      "https://opensourcelicense.org/ja/projects/redis",
      "https://opensourcelicense.org/de/projects/vue",
      "https://opensourcelicense.org/ru/projects/react",
    ];
    for (const url of nonEnProjects) {
      expect(isPageNoindex(url), `expected ${url} to be noindexed`).toBe(true);
    }
  });

  it("filters out silent scenario cells without notes", () => {
    // A5:mit is silent with no notes
    expect(isPageNoindex("https://opensourcelicense.org/scenarios/A5/mit")).toBe(true);
    expect(isPageNoindex("https://opensourcelicense.org/zh-cn/scenarios/A5/mit")).toBe(true);
  });

  it("keeps indexed pages in sitemap", () => {
    const included = [
      "https://opensourcelicense.org/",
      "https://opensourcelicense.org/ru",
      "https://opensourcelicense.org/ro",
      "https://opensourcelicense.org/ru/licenses",
      "https://opensourcelicense.org/licenses/mit",
      "https://opensourcelicense.org/zh-cn/licenses/mit",
      "https://opensourcelicense.org/projects/react",
      "https://opensourcelicense.org/projects/redis",
      "https://opensourcelicense.org/compare/mit-vs-apache-2.0",
      "https://opensourcelicense.org/zh-cn/compare/mit-vs-apache-2.0",
      "https://opensourcelicense.org/scenarios/A1/mit",
      "https://opensourcelicense.org/zh-cn/scenarios/A1/mit",
      "https://opensourcelicense.org/projects/trends",
    ];
    for (const url of included) {
      expect(isPageNoindex(url), `expected ${url} to be included in sitemap`).toBe(false);
    }
  });
});

describe("sitemap chunks", () => {
  it("assigns URLs to corresponding language and page-type chunks", () => {
    expect(getChunkName("https://opensourcelicense.org/")).toBe("en-pages");
    expect(getChunkName("https://opensourcelicense.org/licenses/mit")).toBe("en-licenses");
    expect(getChunkName("https://opensourcelicense.org/projects/react")).toBe("en-projects");
    expect(getChunkName("https://opensourcelicense.org/scenarios/A1/mit")).toBe("en-scenarios");
    expect(getChunkName("https://opensourcelicense.org/compare/mit-vs-apache-2.0")).toBe("en-compare");

    expect(getChunkName("https://opensourcelicense.org/zh-cn")).toBe("zh-cn-pages");
    expect(getChunkName("https://opensourcelicense.org/zh-cn/licenses/mit")).toBe("zh-cn-licenses");
    expect(getChunkName("https://opensourcelicense.org/zh-cn/scenarios/A1/mit")).toBe("zh-cn-scenarios");
    expect(getChunkName("https://opensourcelicense.org/zh-cn/compare/mit-vs-apache-2.0")).toBe("zh-cn-compare");

    // Noindexed URLs return undefined
    expect(getChunkName("https://opensourcelicense.org/zh-cn/projects/react")).toBeUndefined();
    expect(getChunkName("https://opensourcelicense.org/zu/licenses/mit")).toBeUndefined();
    expect(getChunkName("https://opensourcelicense.org/search")).toBeUndefined();
  });

  it("builds chunk handler map containing all indexed languages", () => {
    const chunks = buildSitemapChunks();
    expect(chunks["en-licenses"]).toBeDefined();
    expect(chunks["en-projects"]).toBeDefined();
    expect(chunks["en-scenarios"]).toBeDefined();
    expect(chunks["en-compare"]).toBeDefined();
    expect(chunks["zh-cn-licenses"]).toBeDefined();
    expect(chunks["zh-cn-scenarios"]).toBeDefined();
    // Non-English project chunk should not exist
    expect(chunks["zh-cn-projects"]).toBeUndefined();
    // Excluded locales should not have chunks
    expect(chunks["zu-licenses"]).toBeUndefined();
  });
});
