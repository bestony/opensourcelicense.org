/**
 * Serves the pages offloaded to R2 (see src/domain/offload.ts): looks the page up in the pack
 * index of its locale, reads its byte range from the pack and decompresses it. The edge cache
 * sits in front, so repeated requests do not read R2. Returns undefined when the request is
 * not for an offloaded page or the page is not found; the caller then falls back to the assets.
 */
import { indexKey, offloadedLocale, packKey, pageKey, type PackIndex } from "../src/domain/offload";
import type { Logger } from "../src/lib/log";
import type { Env } from "./env";

/** How long the edge cache keeps a page. The cache key includes the pack version. */
export const EDGE_TTL_SECONDS = 86_400;
/** Same browser caching as Workers static assets: always revalidate with the ETag. */
const BROWSER_CACHE_CONTROL = "public, max-age=0, must-revalidate";
/** Cached pack indexes per isolate, keyed by "<version>/<locale>". Indexes are immutable. */
const INDEX_CACHE_LIMIT = 64;
const indexCache = new Map<string, Promise<PackIndex | undefined>>();

export interface PageCache {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, res: Response): Promise<void>;
}

function defaultCache(): PageCache | undefined {
  return typeof caches === "undefined" ? undefined : (caches as unknown as { default: PageCache }).default;
}

/** For tests. */
export function clearIndexCache(): void {
  indexCache.clear();
}

function loadIndex(bucket: R2Bucket, version: string, locale: string, log: Logger): Promise<PackIndex | undefined> {
  const id = `${version}/${locale}`;
  let hit = indexCache.get(id);
  if (!hit) {
    hit = bucket.get(indexKey(version, locale)).then(async (obj) => {
      if (!obj) {
        log.warn("pack index missing in R2", { version, locale });
        indexCache.delete(id); // retry on the next request
        return undefined;
      }
      return (await obj.json()) as PackIndex;
    });
    hit.catch(() => indexCache.delete(id));
    if (indexCache.size >= INDEX_CACHE_LIMIT) indexCache.delete(indexCache.keys().next().value!);
    indexCache.set(id, hit);
  }
  return hit;
}

function withConditional(req: Request, res: Response): Response {
  const etag = res.headers.get("etag");
  const headers = new Headers(res.headers);
  headers.set("cache-control", BROWSER_CACHE_CONTROL);
  if (etag && req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(req.method === "HEAD" ? null : res.body, { status: res.status, headers });
}

export async function servePage(
  req: Request,
  env: Env,
  ctx: Pick<ExecutionContext, "waitUntil">,
  log: Logger,
  cache: PageCache | undefined = defaultCache(),
): Promise<Response | undefined> {
  if (!env.PAGES || (req.method !== "GET" && req.method !== "HEAD")) return undefined;
  const url = new URL(req.url);
  const locale = offloadedLocale(url.pathname);
  if (!locale) return undefined;
  const version = env.PAGES_VERSION;
  if (!version) {
    log.warn("PAGES_VERSION is not set; offloaded pages are disabled", { path: url.pathname });
    return undefined;
  }
  if (url.pathname.endsWith("/")) {
    // Match html_handling "drop-trailing-slash" of the static assets.
    return Response.redirect(`${url.origin}${pageKey(url.pathname)}${url.search}`, 301);
  }
  const cacheKey = new Request(`${url.origin}${url.pathname}?pages=${version}`, { method: "GET" });
  const hit = await cache?.match(cacheKey);
  if (hit) {
    log.debug("page cache hit", { path: url.pathname });
    return withConditional(req, hit);
  }
  const index = await loadIndex(env.PAGES, version, locale, log);
  const entry = index?.pages[url.pathname];
  if (!entry) {
    log.info("offloaded page not found", { path: url.pathname, version, indexLoaded: !!index });
    return undefined;
  }
  const [offset, length, etag] = entry;
  const obj = await env.PAGES.get(packKey(version, locale), { range: { offset, length } });
  if (!obj || !("body" in obj)) {
    log.error("pack range missing in R2", { path: url.pathname, version, locale, offset, length });
    return undefined;
  }
  const html = await new Response(obj.body.pipeThrough(new DecompressionStream("gzip"))).text();
  const res = new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", etag, "cache-control": `public, max-age=${EDGE_TTL_SECONDS}` },
  });
  if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()).catch((err) => log.warn("page cache put failed", { path: url.pathname, err })));
  log.debug("page served from R2", { path: url.pathname, bytes: html.length, gzipBytes: length });
  return withConditional(req, res);
}
