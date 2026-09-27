/**
 * Cloudflare Worker entry. Static pages come from the assets binding; only
 * /api/* runs code first (see run_worker_first in wrangler.jsonc). Requests that
 * miss the assets reach this Worker too: offloaded pages are served from R2.
 */
import { findCanonicalPair, parsePairKey } from "../src/domain/compare";
import { createLogger, setLogLevel, type LogLevel } from "../src/lib/log";
import { handleChat } from "./chat";
import { handleDeps } from "./deps";
import type { Env } from "./env";
import { servePage } from "./pages";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (env.LOG_LEVEL) setLogLevel(env.LOG_LEVEL as LogLevel);
    const url = new URL(req.url);
    const requestId = req.headers.get("cf-ray") ?? crypto.randomUUID();
    const log = createLogger("worker").child(url.pathname.replaceAll("/", ".").replace(/^\./, "") || "root");
    const started = Date.now();
    try {
      let res: Response;
      if (url.pathname === "/api/chat") res = await handleChat(req, env, ctx, createLogger(`worker.chat.${requestId}`));
      else if (url.pathname === "/api/deps") res = await handleDeps(req, createLogger(`worker.deps.${requestId}`));
      else if (url.pathname.startsWith("/api/")) res = Response.json({ type: "error", code: "bad_request", message: "not found" }, { status: 404 });
      else {
        // Redirect trailing slashes to canonical path (301)
        if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
          const clean = url.pathname.replace(/\/+$/, "");
          res = Response.redirect(`${url.origin}${clean}${url.search}`, 301);
        } else {
          // Normalize compare pairs (e.g. reverse pairs like apache-2.0-vs-mit -> mit-vs-apache-2.0 or uppercase)
          const compareMatch = url.pathname.match(/^(\/(?:[\w-]+\/)?compare\/)([^/]+)$/i);
          const scenarioMatch = url.pathname.match(/^(\/(?:[\w-]+\/)?scenarios)(?:\/([a-zA-Z]\d)(?:\/([^/]+))?)?$/);
          const lower = url.pathname.toLowerCase();

          if (compareMatch) {
            const prefix = compareMatch[1].toLowerCase();
            const rawPair = compareMatch[2];
            const parts = parsePairKey(rawPair.toLowerCase());
            const canonical = parts ? findCanonicalPair(parts[0], parts[1]) : undefined;
            const targetPair = canonical ?? rawPair.toLowerCase();
            const targetPath = `${prefix}${targetPair}`;
            if (url.pathname !== targetPath) {
              res = Response.redirect(`${url.origin}${targetPath}${url.search}`, 301);
            }
          } else if (scenarioMatch) {
            // Scenario IDs are uppercase (A1..E6), while license slugs are lowercase
            const prefix = scenarioMatch[1].toLowerCase();
            const scenarioId = scenarioMatch[2] ? scenarioMatch[2].toUpperCase() : undefined;
            const slug = scenarioMatch[3] ? scenarioMatch[3].toLowerCase() : undefined;
            const canonicalPath = scenarioId ? (slug ? `${prefix}/${scenarioId}/${slug}` : `${prefix}/${scenarioId}`) : prefix;
            if (url.pathname !== canonicalPath) {
              res = Response.redirect(`${url.origin}${canonicalPath}${url.search}`, 301);
            }
          } else if (url.pathname !== lower && /^\/(([\w-]+\/)?)(licenses|projects)(\/|$)/.test(lower)) {
            // Redirect uppercase license/project slugs to lowercase (301)
            res = Response.redirect(`${url.origin}${lower}${url.search}`, 301);
          }

          if (!res!) {
            res = (await servePage(req, env, ctx, createLogger(`worker.pages.${requestId}`))) ?? (await env.ASSETS.fetch(req));
            if (res.status === 404) {
              const notFoundRes = await env.ASSETS.fetch(new Request(new URL("/404", req.url)));
              if (notFoundRes.status === 200) {
                res = new Response(notFoundRes.body, { status: 404, headers: notFoundRes.headers });
              }
            }
            // Prevent data endpoints from competing with HTML pages in search results
            if (url.pathname === "/data/catalog.json" || url.pathname.startsWith("/texts/")) {
              res = new Response(res.body, res);
              res.headers.set("x-robots-tag", "noindex");
            }
          }
        }
      }
      log.debug("request", { requestId, method: req.method, status: res.status, ms: Date.now() - started });
      return res;
    } catch (err) {
      log.error("unhandled error", { requestId, err });
      return Response.json({ type: "error", code: "upstream" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
