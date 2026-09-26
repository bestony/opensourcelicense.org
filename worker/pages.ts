/**
 * Serves the pages offloaded to R2 (see src/domain/offload.ts), with the edge cache in front
 * so that repeated requests do not read R2. Returns undefined when the request is not for an
 * offloaded page or the page is not in the bucket; the caller then falls back to the assets.
 */
import { isOffloadedPath, offloadKey } from "../src/domain/offload";
import type { Logger } from "../src/lib/log";
import type { Env } from "./env";

/** How long the edge cache keeps a page read from R2. Uploads change pages at most once per deploy. */
export const EDGE_TTL_SECONDS = 3600;
/** Same browser caching as Workers static assets: always revalidate with the ETag. */
const BROWSER_CACHE_CONTROL = "public, max-age=0, must-revalidate";

export interface PageCache {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, res: Response): Promise<void>;
}

function defaultCache(): PageCache | undefined {
  return typeof caches === "undefined" ? undefined : (caches as unknown as { default: PageCache }).default;
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
  if (!isOffloadedPath(url.pathname)) return undefined;
  if (url.pathname.endsWith("/")) {
    // Match html_handling "drop-trailing-slash" of the static assets.
    return Response.redirect(`${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`, 307);
  }
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
  const hit = await cache?.match(cacheKey);
  if (hit) {
    log.debug("page cache hit", { path: url.pathname });
    return withConditional(req, hit);
  }
  const key = offloadKey(url.pathname);
  const obj = await env.PAGES.get(key);
  if (!obj) {
    log.warn("offloaded page missing in R2", { path: url.pathname, key });
    return undefined;
  }
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    etag: obj.httpEtag,
    "cache-control": `public, max-age=${EDGE_TTL_SECONDS}`,
  });
  const res = new Response(obj.body, { status: 200, headers });
  if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()).catch((err) => log.warn("page cache put failed", { path: url.pathname, err })));
  log.debug("page served from R2", { path: url.pathname, size: obj.size });
  return withConditional(req, res);
}
