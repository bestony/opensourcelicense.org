import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { indexKey, isOffloadedPath, offloadedLocale, packKey, pageKey, pathnameOfBuiltFile } from "@/domain/offload";
import { createLogger } from "@/lib/log";
import { PackBuilder, packVersion, parseGenerations, rotateGenerations } from "../scripts/offload/core";
import { clearIndexCache, servePage, type PageCache } from "../worker/pages";

describe("offload routes", () => {
  it("offloads detail pages of non-default locales only", () => {
    expect(offloadedLocale("/de/projects/redis")).toBe("de");
    expect(offloadedLocale("/zgh/scenarios/A1/apache-2.0")).toBe("zgh");
    expect(offloadedLocale("/pt-br/projects/redis/")).toBe("pt-br");
    for (const p of ["/projects/redis", "/scenarios/A1/mit", "/de/projects/trends", "/de/projects", "/de/scenarios/A1", "/de/licenses/mit", "/xx/projects/redis", "/en/projects/redis"])
      expect(isOffloadedPath(p), p).toBe(false);
  });
  it("maps built files to paths and paths to keys", () => {
    expect(pathnameOfBuiltFile("de/projects/redis/index.html")).toBe("/de/projects/redis");
    expect(pathnameOfBuiltFile("index.html")).toBeUndefined();
    expect(pathnameOfBuiltFile("_astro/a.css")).toBeUndefined();
    expect(pageKey("/de/projects/redis/")).toBe("/de/projects/redis");
    expect(packKey("v1", "de")).toBe("packs/v1/de.pack");
    expect(indexKey("v1", "de")).toBe("packs/v1/de.json");
  });
});

describe("packs", () => {
  it("stores each page as a gzip range with an ETag", () => {
    const b = new PackBuilder();
    b.add("/de/projects/a", Buffer.from("<html>a</html>"));
    b.add("/de/projects/b", Buffer.from("<html>bb</html>"));
    const { pack, index } = b.finish();
    for (const [path, html] of [["/de/projects/a", "<html>a</html>"], ["/de/projects/b", "<html>bb</html>"]]) {
      const [offset, length, etag] = index.pages[path];
      expect(gunzipSync(pack.subarray(offset, offset + length)).toString()).toBe(html);
      expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    }
  });
  it("versions packs by content, independent of order", () => {
    const part = (locale: string, body: string) => ({ locale, pack: Buffer.from(body), index: "{}" });
    const v = packVersion([part("de", "x"), part("fr", "y")]);
    expect(packVersion([part("fr", "y"), part("de", "x")])).toBe(v);
    expect(packVersion([part("de", "x"), part("fr", "z")])).not.toBe(v);
  });
  it("keeps the last three generations and deletes older ones", () => {
    const g = (version: string) => ({ version, keys: [`packs/${version}/de.pack`] });
    const { next, remove } = rotateGenerations([g("c"), g("b"), g("a")], g("d"));
    expect(next.map((x) => x.version)).toEqual(["d", "c", "b"]);
    expect(remove).toEqual(["packs/a/de.pack"]);
    expect(rotateGenerations([g("d"), g("c")], g("d")).remove).toEqual([]);
    expect(parseGenerations("bad")).toEqual([]);
    expect(parseGenerations('[{"version":"a","keys":["k"]},{"x":1}]')).toEqual([{ version: "a", keys: ["k"] }]);
  });
});

describe("servePage", () => {
  const log = createLogger("test", () => {});
  const ctx = () => ({ waitUntil: vi.fn() });
  const build = (pages: Record<string, string>) => {
    const b = new PackBuilder();
    for (const [p, html] of Object.entries(pages)) b.add(p, Buffer.from(html));
    return b.finish();
  };
  const bucket = (version: string, pages: Record<string, string>) => {
    const { pack, index } = build(pages);
    const objects: Record<string, Buffer> = { [packKey(version, "de")]: pack, [indexKey(version, "de")]: Buffer.from(JSON.stringify(index)) };
    return {
      get: vi.fn(async (key: string, opts?: { range?: { offset: number; length: number } }) => {
        const data = objects[key];
        if (!data) return null;
        const bytes = opts?.range ? data.subarray(opts.range.offset, opts.range.offset + opts.range.length) : data;
        return { body: new Response(new Uint8Array(bytes)).body, json: async () => JSON.parse(bytes.toString()) };
      }),
    };
  };
  const memoryCache = (): PageCache => {
    const store = new Map<string, Response>();
    return { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => void store.set(k.url, r) };
  };
  const env = (pages: Record<string, string>, version = "v1") => ({ ASSETS: {} as never, PAGES: bucket(version, pages) as never, PAGES_VERSION: version });
  const req = (path: string, init?: RequestInit) => new Request(`https://x.org${path}`, init);

  it("serves a page from its pack range and caches it", async () => {
    clearIndexCache();
    const e = env({ "/de/projects/redis": "<html>redis</html>", "/de/projects/linux": "<html>linux</html>" });
    const cache = memoryCache();
    const c = ctx();
    const res = await servePage(req("/de/projects/linux"), e, c, log, cache);
    expect(res?.status).toBe(200);
    expect(res?.headers.get("content-type")).toContain("text/html");
    expect(res?.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(await res?.text()).toBe("<html>linux</html>");
    await Promise.all(c.waitUntil.mock.calls.map(([p]) => p));
    const get = (e.PAGES as unknown as { get: ReturnType<typeof vi.fn> }).get;
    const reads = get.mock.calls.length;
    expect(await (await servePage(req("/de/projects/linux"), e, ctx(), log, cache))?.text()).toBe("<html>linux</html>");
    expect(get.mock.calls.length).toBe(reads); // edge cache hit
    expect(await (await servePage(req("/de/projects/redis"), e, ctx(), log, undefined))?.text()).toBe("<html>redis</html>");
    expect(get.mock.calls.length).toBe(reads + 1); // index cached in the isolate, one range read
  });
  it("answers conditional requests with 304", async () => {
    clearIndexCache();
    const e = env({ "/de/projects/redis": "x" });
    const first = await servePage(req("/de/projects/redis"), e, ctx(), log, undefined);
    const etag = first!.headers.get("etag")!;
    const res = await servePage(req("/de/projects/redis", { headers: { "if-none-match": etag } }), e, ctx(), log, undefined);
    expect(res?.status).toBe(304);
  });
  it("redirects a trailing slash with 301", async () => {
    const res = await servePage(req("/de/projects/redis/?q=1"), env({}), ctx(), log, undefined);
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe("https://x.org/de/projects/redis?q=1");
  });
  it("falls through for other pages, unknown pages, other methods, no binding and no version", async () => {
    clearIndexCache();
    const e = env({ "/de/projects/redis": "x" });
    expect(await servePage(req("/projects/redis"), e, ctx(), log, undefined)).toBeUndefined();
    expect(await servePage(req("/de/projects/nope"), e, ctx(), log, undefined)).toBeUndefined();
    expect(await servePage(req("/fr/projects/redis"), e, ctx(), log, undefined)).toBeUndefined();
    expect(await servePage(req("/de/projects/redis", { method: "POST" }), e, ctx(), log, undefined)).toBeUndefined();
    expect(await servePage(req("/de/projects/redis"), { ASSETS: {} as never }, ctx(), log, undefined)).toBeUndefined();
    expect(await servePage(req("/de/projects/redis"), { ...e, PAGES_VERSION: undefined }, ctx(), log, undefined)).toBeUndefined();
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
