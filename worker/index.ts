/**
 * Cloudflare Worker entry. Static pages come from the assets binding; only
 * /api/* runs code (see run_worker_first in wrangler.jsonc).
 */
import { createLogger, setLogLevel, type LogLevel } from "../src/lib/log";
import { handleChat } from "./chat";
import { handleDeps } from "./deps";
import type { Env } from "./env";

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
      else res = await env.ASSETS.fetch(req);
      log.debug("request", { requestId, method: req.method, status: res.status, ms: Date.now() - started });
      return res;
    } catch (err) {
      log.error("unhandled error", { requestId, err });
      return Response.json({ type: "error", code: "upstream" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
