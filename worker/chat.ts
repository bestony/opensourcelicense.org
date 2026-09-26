/**
 * POST /api/chat — one model turn on Workers AI, returned to the browser as SSE.
 * The browser runs the tool loop (profile updates, questions, rule engine) and
 * sends the whole conversation on each request.
 */
import type { RawData } from "../src/domain/catalog";
import type { ChatErrorCode, ChatEvent, ChatRequest } from "../src/domain/advisor";
import type { Logger } from "../src/lib/log";
import type { Env } from "./env";
import { buildSystemPrompt } from "./prompt";
import { checkRateLimit } from "./ratelimit";
import { issueSession, verifySession } from "./session";
import { verifyTurnstile } from "./turnstile";
import { MAX_BODY_BYTES, validateMessages } from "./validate";
import { normalizeReply, toChatMessages, WORKERS_AI_TOOLS, type Turn } from "./workers-ai";

export const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const MAX_OUTPUT_TOKENS = 4096;

let promptCache: { etag: string; prompt: string } | undefined;

async function loadSystemPrompt(env: Env, origin: string, log: Logger): Promise<string> {
  const res = await env.ASSETS.fetch(new Request(`${origin}/data/catalog.json`));
  if (!res.ok) throw new Error(`catalog.json: HTTP ${res.status}`);
  const etag = res.headers.get("etag") ?? "";
  if (promptCache && etag && promptCache.etag === etag) return promptCache.prompt;
  const prompt = buildSystemPrompt((await res.json()) as RawData);
  promptCache = { etag, prompt };
  log.info("system prompt built", { chars: prompt.length, etag });
  return prompt;
}

function jsonError(status: number, code: ChatErrorCode, message?: string): Response {
  return Response.json({ type: "error", code, message } satisfies ChatEvent, { status });
}

export interface ChatDeps {
  fetcher?: typeof fetch;
}

export async function handleChat(req: Request, env: Env, ctx: ExecutionContext, log: Logger, deps: ChatDeps = {}): Promise<Response> {
  if (req.method !== "POST") return jsonError(405, "bad_request", "POST only");
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return jsonError(413, "bad_request", "request too large");

  let body: ChatRequest;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return jsonError(413, "bad_request", "request too large");
    body = JSON.parse(text) as ChatRequest;
  } catch {
    return jsonError(400, "bad_request", "invalid JSON");
  }
  const valid = validateMessages(body.messages);
  if (!valid.ok) {
    log.warn("rejected conversation", { reason: valid.reason });
    return jsonError(400, "bad_request", valid.reason);
  }
  if (!env.AI) {
    log.error("Workers AI binding (AI) is not configured");
    return jsonError(503, "not_configured");
  }

  const ip = req.headers.get("cf-connecting-ip");
  const events: ChatEvent[] = [];

  // Bot check: Turnstile once, then a signed session token.
  if (env.TURNSTILE_SECRET && env.SESSION_SECRET) {
    if (!(await verifySession(env.SESSION_SECRET, body.sessionToken))) {
      if (!body.turnstileToken) return jsonError(403, "verification", "turnstile token required");
      const r = await verifyTurnstile(env.TURNSTILE_SECRET, body.turnstileToken, ip, deps.fetcher);
      log.info("turnstile checked", { success: r.success, errorCodes: r.errorCodes });
      if (!r.success) return jsonError(403, "verification");
      events.push({ type: "session", token: await issueSession(env.SESSION_SECRET) });
    }
  } else {
    log.warn("turnstile disabled: TURNSTILE_SECRET or SESSION_SECRET missing");
  }

  // Cost protection.
  if (env.RATE_LIMIT && env.SESSION_SECRET && ip) {
    const parsed = Number.parseInt(env.DAILY_LIMIT ?? "", 10);
    const limit = Number.isFinite(parsed) && parsed >= 0 ? parsed : 60;
    const d = await checkRateLimit(env.RATE_LIMIT, env.SESSION_SECRET, ip, limit);
    log.info("rate limit", { allowed: d.allowed, count: d.count, limit: d.limit });
    if (!d.allowed) return jsonError(429, "rate_limited");
  }

  let system: string;
  try {
    system = await loadSystemPrompt(env, new URL(req.url).origin, log);
  } catch (err) {
    log.error("failed to build system prompt", { err });
    return jsonError(500, "upstream");
  }

  const model = env.ADVISOR_MODEL || DEFAULT_MODEL;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (e: ChatEvent) => writer.write(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
  const started = Date.now();

  const run = async () => {
    try {
      for (const e of events) await send(e);
      const inputs: Record<string, unknown> = {
        messages: toChatMessages(system, valid.messages as Turn[]),
        tools: WORKERS_AI_TOOLS,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
      };
      if (env.ADVISOR_REASONING_EFFORT) inputs.reasoning_effort = env.ADVISOR_REASONING_EFFORT;
      const raw = await (env.AI as unknown as { run: (m: string, i: unknown) => Promise<unknown> }).run(model, inputs);
      const reply = normalizeReply(raw);
      log.info("model turn done", {
        model,
        stop_reason: reply.stopReason,
        ms: Date.now() - started,
        tool_calls: reply.content.filter((b) => b.type === "tool_use").map((b) => (b as { name: string }).name),
        prompt_tokens: reply.usage?.prompt_tokens,
        completion_tokens: reply.usage?.completion_tokens,
      });
      if (!reply.content.length) {
        await send({ type: "error", code: "upstream", message: "empty reply" });
      } else {
        for (const b of reply.content) {
          if (b.type === "text") await send({ type: "text", text: b.text });
          else if (b.type === "tool_use") await send({ type: "tool_start", name: b.name });
        }
        await send({ type: "message", content: reply.content, stop_reason: reply.stopReason, model });
      }
      await send({ type: "done" });
    } catch (err) {
      log.error("Workers AI call failed", { err, model });
      await send({ type: "error", code: "upstream" });
    } finally {
      await writer.close();
    }
  };
  ctx.waitUntil(run());

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
