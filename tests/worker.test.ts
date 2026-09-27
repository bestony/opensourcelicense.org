import { describe, expect, it, vi } from "vitest";
import { buildPrompt } from "./worker-helpers";
import { validateMessages } from "../worker/validate";
import { issueSession, verifySession, SESSION_TTL_MS } from "../worker/session";
import { checkRateLimit } from "../worker/ratelimit";
import { parseHostnames, verifyTurnstile } from "../worker/turnstile";
import { handleChat } from "../worker/chat";
import { handleDeps } from "../worker/deps";
import { normalizeReply, toChatMessages } from "../worker/workers-ai";
import { createLogger } from "@/lib/log";
import { realRaw } from "./helpers";

const log = createLogger("test", () => {});

function memoryKv() {
  const store = new Map<string, string>();
  return { store, get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) };
}

describe("worker/validate", () => {
  it("accepts an alternating conversation ending with the user", () => {
    const r = validateMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "ok" }, { type: "tool_use", id: "t", name: "finalize", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "{}" }] },
    ]);
    expect(r.ok).toBe(true);
  });
  it.each([
    [[], "non-empty"],
    [[{ role: "assistant", content: "x" }], "role user"],
    [[{ role: "user", content: [{ type: "image", source: {} }] }], "disallowed"],
    [[{ role: "user", content: "a" }, { role: "assistant", content: [{ type: "thinking", thinking: "" }] }, { role: "user", content: "b" }], "disallowed"],
    [[{ role: "user", content: "x".repeat(5000) }], "too long"],
    [[{ role: "user", content: "a" }, { role: "assistant", content: "b" }], "last message"],
  ])("rejects %j", (msgs, reason) => {
    const r = validateMessages(msgs);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain(reason);
  });
});

describe("worker/session", () => {
  it("issues and verifies tokens, rejects tampering and expiry", async () => {
    const tok = await issueSession("s", 1000);
    expect(await verifySession("s", tok, 2000)).toBe(true);
    expect(await verifySession("other", tok, 2000)).toBe(false);
    expect(await verifySession("s", tok.replace(/.$/, "0"), 2000)).toBe(tok.endsWith("0"));
    expect(await verifySession("s", tok, 1000 + SESSION_TTL_MS + 1)).toBe(false);
    expect(await verifySession("s", "garbage", 0)).toBe(false);
  });
});

describe("worker/ratelimit", () => {
  it("counts per day and blocks over the limit without storing raw IPs", async () => {
    const kv = memoryKv();
    const now = new Date("2026-09-26T10:00:00Z");
    expect((await checkRateLimit(kv, "s", "1.2.3.4", 2, now)).allowed).toBe(true);
    expect((await checkRateLimit(kv, "s", "1.2.3.4", 2, now)).allowed).toBe(true);
    expect((await checkRateLimit(kv, "s", "1.2.3.4", 2, now)).allowed).toBe(false);
    expect((await checkRateLimit(kv, "s", "5.6.7.8", 2, now)).allowed).toBe(true);
    expect([...kv.store.keys()].some((k) => k.includes("1.2.3.4"))).toBe(false);
    expect((await checkRateLimit(kv, "s", "1.2.3.4", 2, new Date("2026-09-27T00:00:01Z"))).allowed).toBe(true);
  });
});

describe("worker/prompt", () => {
  it("is deterministic and contains the knowledge base", () => {
    const a = buildPrompt();
    expect(a).toBe(buildPrompt());
    expect(a).toContain("## agpl-3.0 (AGPL-3.0-only)");
    expect(a).toMatch(/A1 \[code\] .*agpl-3\.0=conditional/);
    expect(a).toContain("not legal advice");
    expect(a).toContain("Never write tool calls as plain text");
  });
});

describe("worker/workers-ai adapter", () => {
  it("maps the conversation to Chat Completions messages", () => {
    const msgs = toChatMessages("SYS", [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "ok" }, { type: "tool_use", id: "c1", name: "update_profile", input: { artifact_type: "saas" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "{}" }, { type: "text", text: "more" }] },
    ]);
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "ok", tool_calls: [{ id: "c1", type: "function", function: { name: "update_profile", arguments: '{"artifact_type":"saas"}' } }] },
      { role: "tool", tool_call_id: "c1", content: "{}" },
      { role: "user", content: "more" },
    ]);
  });

  it("normalizes Chat Completions replies", () => {
    const r = normalizeReply({
      choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "x", function: { name: "finalize", arguments: "{}" } }] } }],
      usage: { prompt_tokens: 3 },
    });
    expect(r).toMatchObject({ stopReason: "tool_use", content: [{ type: "tool_use", id: "x", name: "finalize", input: {} }] });
  });

  it("normalizes legacy replies and bad JSON arguments", () => {
    const r = normalizeReply({ response: "Hello", tool_calls: [{ name: "ask_question", arguments: "{oops" }] });
    expect(r.content[0]).toEqual({ type: "text", text: "Hello" });
    expect(r.content[1]).toMatchObject({ type: "tool_use", name: "ask_question", input: { __invalid_json: "{oops" } });
    expect((r.content[1] as { id: string }).id).toMatch(/^call_/);
    expect(normalizeReply({ response: "done" }).stopReason).toBe("end_turn");
    expect(normalizeReply({ choices: [{ finish_reason: "length", message: { content: "cut" } }] }).stopReason).toBe("max_tokens");
  });
});

describe("worker/workers-ai text tool calls", () => {
  it("recovers Llama-style JSON tool calls printed as text", () => {
    const r = normalizeReply({ response: '{"name": "update_profile", "parameters": {"artifact_type": "saas"}}' });
    expect(r.stopReason).toBe("tool_use");
    expect(r.content).toEqual([{ type: "tool_use", id: expect.any(String), name: "update_profile", input: { artifact_type: "saas" } }]);
  });
  it("recovers fenced and multi-line calls", () => {
    const r = normalizeReply({ response: '```json\n[{"name":"update_profile","parameters":{}},{"name":"finalize","parameters":{}}]\n```' });
    expect(r.content.map((b) => (b as { name?: string }).name)).toEqual(["update_profile", "finalize"]);
    const r2 = normalizeReply({ response: '{"name":"update_profile","parameters":{}}\n{"name":"finalize","parameters":{}}' });
    expect(r2.content).toHaveLength(2);
  });
  it("leaves normal prose and unknown tools alone", () => {
    expect(normalizeReply({ response: "Use {braces} carefully" }).stopReason).toBe("end_turn");
    expect(normalizeReply({ response: '{"name":"rm_rf","parameters":{}}' }).content[0].type).toBe("text");
  });
});

describe("worker/turnstile", () => {
  const expected = { action: "chat", hostnames: ["a.com"] };
  const verify = (payload: Record<string, unknown>) =>
    verifyTurnstile("s", "tok", "1.2.3.4", { ...expected, fetcher: (async () => Response.json(payload)) as never });

  it("parses the comma-separated allowlist", () => {
    expect(parseHostnames(undefined)).toEqual([]);
    expect(parseHostnames(" a.com , B.com ,, ")).toEqual(["a.com", "b.com"]);
  });

  it("fails closed on bad tokens, a missing allowlist and upstream errors", async () => {
    expect(await verifyTurnstile("s", undefined, null, expected)).toEqual({ success: false, errorCodes: ["invalid-token"] });
    expect(await verifyTurnstile("s", "x".repeat(2049), null, expected)).toEqual({ success: false, errorCodes: ["invalid-token"] });
    expect(await verifyTurnstile("s", "tok", null, { action: "chat", hostnames: [] })).toEqual({ success: false, errorCodes: ["hostnames-not-configured"] });
    const offline = vi.fn(async () => {
      throw new Error("no network");
    });
    expect(await verifyTurnstile("s", "tok", null, { ...expected, fetcher: offline as never })).toEqual({ success: false, errorCodes: ["network-error"] });
    const broken = vi.fn(async () => new Response("", { status: 500 }));
    expect(await verifyTurnstile("s", "tok", null, { ...expected, fetcher: broken as never })).toEqual({ success: false, errorCodes: ["http-500"] });
  });

  it("requires success, the expected action and an allowed hostname", async () => {
    expect(await verify({ success: true, action: "chat", hostname: "a.com" })).toEqual({ success: true, errorCodes: [] });
    expect(await verify({ success: true, action: "chat", hostname: "A.com" })).toEqual({ success: true, errorCodes: [] });
    expect(await verify({ success: true, action: "chat", hostname: "b.com" })).toEqual({ success: false, errorCodes: ["hostname-mismatch"] });
    expect(await verify({ success: true, action: "signup", hostname: "a.com" })).toEqual({ success: false, errorCodes: ["action-mismatch"] });
    expect(await verify({ "error-codes": ["timeout-or-duplicate"] })).toEqual({ success: false, errorCodes: ["timeout-or-duplicate"] });
  });
});

describe("worker/chat", () => {
  const assets = { fetch: async () => new Response(JSON.stringify(realRaw()), { headers: { etag: "x" } }) } as never;
  const ctx = () => {
    const tasks: Promise<unknown>[] = [];
    return { tasks, waitUntil: (p: Promise<unknown>) => void tasks.push(p), passThroughOnException() {} };
  };
  const req = (body: unknown) =>
    new Request("https://opensourcelicense.org/api/chat", { method: "POST", body: JSON.stringify(body), headers: { "cf-connecting-ip": "1.1.1.1" } });
  const msgs = [{ role: "user", content: "I build a vector database" }];
  const ai = (reply: unknown) => ({ run: vi.fn(async () => reply) });
  const events = async (res: Response, c: ReturnType<typeof ctx>) => {
    const text = await res.text();
    await Promise.all(c.tasks);
    return text.trim().split("\n\n").map((l) => JSON.parse(l.slice(6)));
  };

  it("rejects bad input and missing configuration", async () => {
    expect((await handleChat(req({ messages: [] }), { ASSETS: assets, AI: ai({}) as never }, ctx() as never, log)).status).toBe(400);
    expect((await handleChat(req({ messages: msgs }), { ASSETS: assets }, ctx() as never, log)).status).toBe(503);
  });

  it("requires Turnstile when configured", async () => {
    const env = { ASSETS: assets, AI: ai({}) as never, TURNSTILE_SECRET: "t", SESSION_SECRET: "s", TURNSTILE_HOSTNAMES: "opensourcelicense.org" };
    expect((await handleChat(req({ messages: msgs }), env, ctx() as never, log)).status).toBe(403);
    const failing = vi.fn(async () => Response.json({ success: false, "error-codes": ["invalid-input-response"] }));
    expect((await handleChat(req({ messages: msgs, turnstileToken: "bad" }), env, ctx() as never, log, { fetcher: failing as typeof fetch })).status).toBe(403);
    const ok = vi.fn(async () => Response.json({ success: true, action: "chat", hostname: "opensourcelicense.org" }));
    const c = ctx();
    const res = await handleChat(req({ messages: msgs, turnstileToken: "good" }), { ...env, AI: ai({ response: "hi" }) as never }, c as never, log, { fetcher: ok as typeof fetch });
    expect((await events(res, c))[0].type).toBe("session");
  });

  it("rejects tokens from another action, another hostname or without an allowlist", async () => {
    const env = { ASSETS: assets, AI: ai({}) as never, TURNSTILE_SECRET: "t", SESSION_SECRET: "s", TURNSTILE_HOSTNAMES: "opensourcelicense.org" };
    const body = { messages: msgs, turnstileToken: "tok" };
    const otherAction = vi.fn(async () => Response.json({ success: true, action: "signup", hostname: "opensourcelicense.org" }));
    expect((await handleChat(req(body), env, ctx() as never, log, { fetcher: otherAction as typeof fetch })).status).toBe(403);
    const otherHost = vi.fn(async () => Response.json({ success: true, action: "chat", hostname: "evil.example" }));
    expect((await handleChat(req(body), env, ctx() as never, log, { fetcher: otherHost as typeof fetch })).status).toBe(403);
    expect((await handleChat(req(body), { ...env, TURNSTILE_HOSTNAMES: undefined }, ctx() as never, log, { fetcher: otherAction as typeof fetch })).status).toBe(403);
  });

  it("enforces the daily limit", async () => {
    const env = { ASSETS: assets, AI: ai({}) as never, SESSION_SECRET: "s", RATE_LIMIT: memoryKv() as never, DAILY_LIMIT: "0" };
    expect((await handleChat(req({ messages: msgs }), env, ctx() as never, log)).status).toBe(429);
  });

  it("returns text, tool calls and the assistant message", async () => {
    const model = ai({ choices: [{ finish_reason: "tool_calls", message: { content: "Noted.", tool_calls: [{ id: "t1", function: { name: "update_profile", arguments: '{"artifact_type":"saas"}' } }] } }] });
    const c = ctx();
    const res = await handleChat(req({ messages: msgs }), { ASSETS: assets, AI: model as never, ADVISOR_MODEL: "@cf/test/model" }, c as never, log);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const ev = await events(res, c);
    expect(ev.map((e) => e.type)).toEqual(["text", "tool_start", "message", "done"]);
    expect(ev[2]).toMatchObject({ stop_reason: "tool_use", model: "@cf/test/model" });
    const [modelId, inputs] = model.run.mock.calls[0] as unknown as [string, { messages: { role: string }[]; tools: unknown[] }];
    expect(modelId).toBe("@cf/test/model");
    expect(inputs.messages[0].role).toBe("system");
    expect(inputs.tools).toHaveLength(3);
  });

  it("reports upstream failures", async () => {
    const c = ctx();
    const res = await handleChat(req({ messages: msgs }), { ASSETS: assets, AI: { run: async () => { throw new Error("boom"); } } as never }, c as never, log);
    expect((await events(res, c)).map((e) => e.code ?? e.type)).toEqual(["upstream"]);
  });
});

describe("worker/deps", () => {
  const memCache = () => {
    const m = new Map<string, Response>();
    return { m, match: async (r: Request) => m.get(r.url)?.clone(), put: async (r: Request, res: Response) => void m.set(r.url, res) };
  };
  const get = (q: string) => new Request(`https://opensourcelicense.org/api/deps?${q}`);

  it("validates input", async () => {
    expect((await handleDeps(get("system=maven&name=x"), log)).status).toBe(400);
    expect((await handleDeps(get("system=npm&name=%3Cscript%3E"), log)).status).toBe(400);
  });

  it("resolves the default version, returns licenses and caches", async () => {
    const fetcher = vi.fn(async (u: string) =>
      u.endsWith("/versions/19.0.0")
        ? Response.json({ licenses: ["MIT"] })
        : Response.json({ versions: [{ versionKey: { version: "18.0.0" } }, { versionKey: { version: "19.0.0" }, isDefault: true }] }),
    );
    const cache = memCache();
    const r1 = await handleDeps(get("system=npm&name=react"), log, { fetcher: fetcher as never, cache });
    expect(await r1.json()).toEqual({ system: "npm", name: "react", version: "19.0.0", licenses: ["MIT"], source: "deps.dev" });
    await handleDeps(get("system=npm&name=react"), log, { fetcher: fetcher as never, cache });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.deps.dev/v3/systems/NPM/packages/react");
  });

  it("encodes scoped names and reports misses", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 404 }));
    const r = await handleDeps(get("system=npm&name=%40scope%2Fpkg&version=1.0.0"), log, { fetcher: fetcher as never, cache: memCache() });
    expect(r.status).toBe(404);
    expect((fetcher.mock.calls[0] as unknown[])[0]).toBe("https://api.deps.dev/v3/systems/NPM/packages/%40scope%2Fpkg/versions/1.0.0");
  });
});

import worker from "../worker/index";

describe("worker fetch routing", () => {
  const assets = {
    fetch: vi.fn(async (r: Request) => {
      const url = new URL(r.url);
      if (url.pathname === "/404") return new Response("Custom 404", { status: 200 });
      if (url.pathname === "/data/catalog.json") return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      if (url.pathname.startsWith("/texts/")) return new Response("text", { status: 200, headers: { "content-type": "text/plain" } });
      if (url.pathname === "/scenarios/A1/mit" || url.pathname === "/zh-cn/scenarios/A1/mit" || url.pathname === "/compare/mit-vs-apache-2.0") {
        return new Response("OK", { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }),
  } as never;
  const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as never;
  const env = { ASSETS: assets } as never;

  it("redirects trailing slashes to canonical path with 301", async () => {
    const res = await worker.fetch(new Request("https://opensourcelicense.org/licenses/mit/"), env, ctx);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://opensourcelicense.org/licenses/mit");
  });

  it("redirects uppercase license and project slugs to lowercase with 301", async () => {
    const res = await worker.fetch(new Request("https://opensourcelicense.org/licenses/MIT"), env, ctx);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://opensourcelicense.org/licenses/mit");

    const res2 = await worker.fetch(new Request("https://opensourcelicense.org/zh-cn/projects/React"), env, ctx);
    expect(res2.status).toBe(301);
    expect(res2.headers.get("location")).toBe("https://opensourcelicense.org/zh-cn/projects/react");
  });

  it("normalizes scenario URLs preserving uppercase scenario ID and lowercase license slug", async () => {
    // Valid canonical URLs must NOT be redirected
    const valid1 = await worker.fetch(new Request("https://opensourcelicense.org/scenarios/A1/mit"), env, ctx);
    expect(valid1.status).toBe(200);

    const valid2 = await worker.fetch(new Request("https://opensourcelicense.org/zh-cn/scenarios/A1/mit"), env, ctx);
    expect(valid2.status).toBe(200);

    // Lowercase scenario ID redirected to uppercase
    const fixId = await worker.fetch(new Request("https://opensourcelicense.org/scenarios/a1"), env, ctx);
    expect(fixId.status).toBe(301);
    expect(fixId.headers.get("location")).toBe("https://opensourcelicense.org/scenarios/A1");

    // Lowercase scenario ID with license redirected
    const fixBoth = await worker.fetch(new Request("https://opensourcelicense.org/scenarios/a1/MIT"), env, ctx);
    expect(fixBoth.status).toBe(301);
    expect(fixBoth.headers.get("location")).toBe("https://opensourcelicense.org/scenarios/A1/mit");

    // Uppercase license in scenario redirected to lowercase
    const fixSlug = await worker.fetch(new Request("https://opensourcelicense.org/zh-cn/scenarios/A1/MIT"), env, ctx);
    expect(fixSlug.status).toBe(301);
    expect(fixSlug.headers.get("location")).toBe("https://opensourcelicense.org/zh-cn/scenarios/A1/mit");
  });

  it("normalizes compare reverse pairs and uppercase slugs to canonical pair with 301", async () => {
    // Reverse pair -> canonical pair
    const reverse = await worker.fetch(new Request("https://opensourcelicense.org/compare/apache-2.0-vs-mit"), env, ctx);
    expect(reverse.status).toBe(301);
    expect(reverse.headers.get("location")).toBe("https://opensourcelicense.org/compare/mit-vs-apache-2.0");

    // Localized reverse pair
    const locReverse = await worker.fetch(new Request("https://opensourcelicense.org/zh-cn/compare/apache-2.0-vs-mit"), env, ctx);
    expect(locReverse.status).toBe(301);
    expect(locReverse.headers.get("location")).toBe("https://opensourcelicense.org/zh-cn/compare/mit-vs-apache-2.0");

    // Uppercase compare pair
    const upper = await worker.fetch(new Request("https://opensourcelicense.org/compare/MIT-vs-APACHE-2.0"), env, ctx);
    expect(upper.status).toBe(301);
    expect(upper.headers.get("location")).toBe("https://opensourcelicense.org/compare/mit-vs-apache-2.0");

    // Canonical pair is not redirected
    const canonical = await worker.fetch(new Request("https://opensourcelicense.org/compare/mit-vs-apache-2.0"), env, ctx);
    expect(canonical.status).toBe(200);
  });

  it("attaches x-robots-tag: noindex on raw data endpoints", async () => {
    const jsonRes = await worker.fetch(new Request("https://opensourcelicense.org/data/catalog.json"), env, ctx);
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.headers.get("x-robots-tag")).toBe("noindex");

    const txtRes = await worker.fetch(new Request("https://opensourcelicense.org/texts/mit.txt"), env, ctx);
    expect(txtRes.status).toBe(200);
    expect(txtRes.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("serves custom 404 page with status 404 when asset not found", async () => {
    const res = await worker.fetch(new Request("https://opensourcelicense.org/nonexistent-page"), env, ctx);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Custom 404");
  });
});

