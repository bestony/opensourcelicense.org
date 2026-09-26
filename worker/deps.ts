/**
 * GET /api/deps?system=npm&name=react&version=19.0.0
 * Looks up a package's declared licenses on deps.dev (which has no CORS for
 * browsers) and caches the answer at the edge for a day.
 */
import { DEPS_DEV_SYSTEMS, lookupDepsDev } from "../src/lib/deps-dev";
import type { Logger } from "../src/lib/log";

const NAME = /^[@\w.\-/~:]{1,214}$/;
const VERSION = /^[\w.\-+]{1,64}$/;
const TTL_SECONDS = 24 * 60 * 60;

export interface DepsAnswer {
  system: string;
  name: string;
  version?: string;
  licenses: string[];
  source: "deps.dev";
}

interface CacheLike {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
}

export interface DepsDeps {
  fetcher?: typeof fetch;
  cache?: CacheLike;
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": `public, max-age=${TTL_SECONDS}`, ...extra } });

export async function handleDeps(req: Request, log: Logger, deps: DepsDeps = {}): Promise<Response> {
  if (req.method !== "GET") return json({ error: "GET only" }, 405);
  const url = new URL(req.url);
  const system = url.searchParams.get("system") ?? "";
  const name = url.searchParams.get("name") ?? "";
  const version = url.searchParams.get("version") ?? undefined;
  if (!DEPS_DEV_SYSTEMS[system]) return json({ error: "unsupported system" }, 400);
  if (!NAME.test(name) || (version && !VERSION.test(version))) return json({ error: "invalid name or version" }, 400);

  const cache = deps.cache ?? (globalThis as unknown as { caches?: { default: CacheLike } }).caches?.default;
  const cacheKey = new Request(`https://deps-cache.internal/${system}/${encodeURIComponent(name)}/${version ?? "_default"}`);
  const hit = await cache?.match(cacheKey);
  if (hit) {
    log.debug("deps cache hit", { system, name, version });
    return hit;
  }

  const r = await lookupDepsDev(deps.fetcher ?? fetch, system, name, version);
  log.info("deps.dev lookup", { system, name, version: r.version, ok: r.ok, status: r.ok ? 200 : r.status });
  if (!r.ok) return json({ system, name, version: r.version, licenses: [], source: "deps.dev" } satisfies DepsAnswer, r.status === 404 ? 404 : 502);
  const answer: DepsAnswer = { system, name, version: r.version, licenses: r.licenses, source: "deps.dev" };
  const out = json(answer);
  await cache?.put(cacheKey, out.clone());
  return out;
}
