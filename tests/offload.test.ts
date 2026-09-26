import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { isOffloadedPath, offloadKey, pathnameOfBuiltFile } from "@/domain/offload";
import { createLogger } from "@/lib/log";
import { chunk, parseManifest, planUpload } from "../scripts/offload/core";
import { servePage, type PageCache } from "../worker/pages";

describe("offload routes", () => {
  it("offloads detail pages of non-default locales only", () => {
    expect(isOffloadedPath("/de/projects/redis")).toBe(true);
    expect(isOffloadedPath("/zgh/scenarios/A1/apache-2.0")).toBe(true);
    expect(isOffloadedPath("/pt-br/projects/redis/")).toBe(true);
    expect(isOffloadedPath("/projects/redis")).toBe(false);
    expect(isOffloadedPath("/scenarios/A1/mit")).toBe(false);
    expect(isOffloadedPath("/de/projects/trends")).toBe(false);
    expect(isOffloadedPath("/de/projects")).toBe(false);
    expect(isOffloadedPath("/de/scenarios/A1")).toBe(false);
    expect(isOffloadedPath("/de/licenses/mit")).toBe(false);
    expect(isOffloadedPath("/xx/projects/redis")).toBe(false);
    expect(isOffloadedPath("/en/projects/redis")).toBe(false);
  });
  it("maps paths to keys and built files to paths", () => {
    expect(offloadKey("/de/projects/redis")).toBe("pages/de/projects/redis/index.html");
    expect(offloadKey("/de/projects/redis/")).toBe("pages/de/projects/redis/index.html");
    expect(pathnameOfBuiltFile("de/projects/redis/index.html")).toBe("/de/projects/redis");
    expect(pathnameOfBuiltFile("index.html")).toBeUndefined();
    expect(pathnameOfBuiltFile("_astro/a.css")).toBeUndefined();
  });
});

describe("upload planning", () => {
  it("uploads new and changed pages and deletes removed ones", () => {
    const remote = { version: 1 as const, files: { a: "1", b: "2", gone: "3" } };
    const local = { version: 1 as const, files: { a: "1", b: "changed", c: "4" } };
    expect(planUpload(remote, local)).toEqual({ put: ["b", "c"], remove: ["gone"], unchanged: 1 });
  });
  it("treats a missing or broken manifest as empty", () => {
    expect(parseManifest(undefined).files).toEqual({});
    expect(parseManifest("not json").files).toEqual({});
    expect(parseManifest('{"version":2,"files":{"a":"1"}}').files).toEqual({});
    expect(parseManifest('{"version":1,"files":{"a":"1"}}').files).toEqual({ a: "1" });
  });
  it("chunks lists", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("servePage", () => {
  const log = createLogger("test", () => {});
  const ctx = () => ({ waitUntil: vi.fn() });
  const bucket = (pages: Record<string, string>) => ({
    get: vi.fn(async (key: string) =>
      key in pages ? { body: pages[key], httpEtag: '"e1"', size: pages[key].length } : null,
    ),
  });
  const memoryCache = (): PageCache & { store: Map<string, Response> } => {
    const store = new Map<string, Response>();
    return {
      store,
      match: async (k) => store.get(k.url)?.clone(),
      put: async (k, r) => void store.set(k.url, r),
    };
  };
  const env = (pages: Record<string, string>) => ({ ASSETS: {} as never, PAGES: bucket(pages) as never });

  it("serves an offloaded page from R2 and caches it", async () => {
    const e = env({ "pages/de/projects/redis/index.html": "<html>de</html>" });
    const cache = memoryCache();
    const c = ctx();
    const res = await servePage(new Request("https://x.org/de/projects/redis"), e, c, log, cache);
    expect(res?.status).toBe(200);
    expect(res?.headers.get("content-type")).toContain("text/html");
    expect(res?.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(await res?.text()).toBe("<html>de</html>");
    await Promise.all(c.waitUntil.mock.calls.map(([p]) => p));
    const again = await servePage(new Request("https://x.org/de/projects/redis"), e, ctx(), log, cache);
    expect(await again?.text()).toBe("<html>de</html>");
    expect((e.PAGES as unknown as { get: ReturnType<typeof vi.fn> }).get).toHaveBeenCalledTimes(1);
  });
  it("answers conditional requests with 304", async () => {
    const e = env({ "pages/de/projects/redis/index.html": "x" });
    const res = await servePage(new Request("https://x.org/de/projects/redis", { headers: { "if-none-match": '"e1"' } }), e, ctx(), log, undefined);
    expect(res?.status).toBe(304);
  });
  it("redirects a trailing slash", async () => {
    const res = await servePage(new Request("https://x.org/de/projects/redis/?q=1"), env({}), ctx(), log, undefined);
    expect(res?.status).toBe(307);
    expect(res?.headers.get("location")).toBe("https://x.org/de/projects/redis?q=1");
  });
  it("falls through for other pages, missing objects, other methods and no binding", async () => {
    const e = env({});
    expect(await servePage(new Request("https://x.org/projects/redis"), e, ctx(), log, undefined)).toBeUndefined();
    expect(await servePage(new Request("https://x.org/de/projects/redis"), e, ctx(), log, undefined)).toBeUndefined();
    expect(await servePage(new Request("https://x.org/de/projects/redis", { method: "POST" }), e, ctx(), log, undefined)).toBeUndefined();
    expect(await servePage(new Request("https://x.org/de/projects/redis"), { ASSETS: {} as never }, ctx(), log, undefined)).toBeUndefined();
  });
});

describe("wrangler run_worker_first", () => {
  // Deep glob as documented for Workers assets: "*" matches any characters, "!" excludes.
  const toRegex = (glob: string) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`);
  const patterns = (() => {
    const text = readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, "");
    return (JSON.parse(text) as { assets: { run_worker_first: string[] } }).assets.run_worker_first;
  })();
  const runsWorkerFirst = (path: string) =>
    patterns.some((p) => !p.startsWith("!") && toRegex(p).test(path)) && !patterns.some((p) => p.startsWith("!") && toRegex(p.slice(1)).test(path));

  it("routes every offloaded page to the Worker and keeps static pages asset-first", () => {
    for (const path of ["/de/projects/redis", "/zgh/projects/linux", "/pt-br/scenarios/A1/mit", "/ar/scenarios/E6/apache-2.0"]) {
      expect(isOffloadedPath(path)).toBe(true);
      expect(runsWorkerFirst(path), path).toBe(true);
    }
    for (const path of ["/projects/redis", "/scenarios/A1/mit", "/de/projects/trends", "/de/scenarios/A1", "/de/licenses/mit", "/de"]) {
      expect(runsWorkerFirst(path), path).toBe(false);
    }
    expect(runsWorkerFirst("/api/chat")).toBe(true);
  });
});
