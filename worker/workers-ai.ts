/**
 * Adapter between the site's conversation format (text / tool_use /
 * tool_result blocks, stored by the browser) and Workers AI chat models.
 * Requests use the OpenAI Chat Completions shape; responses are accepted in
 * both the Chat Completions shape and the legacy `{response, tool_calls}` shape.
 */
import { ADVISOR_TOOLS } from "../src/domain/advisor";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface Turn {
  role: "user" | "assistant";
  content: string | Block[];
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export const WORKERS_AI_TOOLS = ADVISOR_TOOLS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

export function toChatMessages(system: string, turns: Turn[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: system }];
  for (const t of turns) {
    if (typeof t.content === "string") {
      out.push({ role: t.role, content: t.content } as ChatMessage);
      continue;
    }
    if (t.role === "assistant") {
      const text = t.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      const calls = t.content
        .filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use")
        .map((b) => ({ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      // Some Workers AI models (e.g. Llama 3.1) reject `content: null`.
      out.push({ role: "assistant", content: text, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      // Tool results must directly follow the assistant tool calls.
      for (const b of t.content) if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.is_error ? `ERROR: ${b.content}` : b.content });
      const text = t.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      if (text) out.push({ role: "user", content: text });
    }
  }
  return out;
}

interface RawCall {
  id?: string;
  name?: string;
  arguments?: unknown;
  function?: { name?: string; arguments?: unknown };
}

function parseArgs(a: unknown): unknown {
  if (typeof a !== "string") return a ?? {};
  try {
    return JSON.parse(a);
  } catch {
    return { __invalid_json: a };
  }
}

export interface NormalizedReply {
  content: Block[];
  stopReason: "tool_use" | "end_turn" | "max_tokens";
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

let seq = 0;
const newId = () => `call_${Date.now().toString(36)}_${(seq++).toString(36)}`;

const TOOL_NAMES: ReadonlySet<string> = new Set(ADVISOR_TOOLS.map((t) => t.name));

/**
 * Small models sometimes print tool calls as JSON text instead of returning
 * `tool_calls` (Llama 3.1 format: {"name": ..., "parameters": {...}}).
 * Recovers such calls when the whole text is one call or a list of calls.
 */
export function extractTextToolCalls(text: string): RawCall[] {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/^<\|python_tag\|>/, "")
    .trim();
  if (!/^[[{]/.test(trimmed)) return [];
  const candidates = trimmed.includes("\n{") && !trimmed.startsWith("[") ? trimmed.split(/;?\s*\n(?=\{)/) : [trimmed];
  const out: RawCall[] = [];
  for (const c of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(c.replace(/;$/, ""));
    } catch {
      return [];
    }
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      const o = (item ?? {}) as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : undefined;
      if (!name || !TOOL_NAMES.has(name)) return [];
      out.push({ name, arguments: o.parameters ?? o.arguments ?? {} });
    }
  }
  return out;
}

/** Normalizes any Workers AI text-generation output into content blocks. */
export function normalizeReply(raw: unknown): NormalizedReply {
  const r = (raw ?? {}) as Record<string, unknown>;
  const choice = Array.isArray(r.choices) ? (r.choices[0] as Record<string, unknown>) : undefined;
  const message = (choice?.message ?? {}) as Record<string, unknown>;
  let text = String((choice ? message.content : r.response) ?? "");
  let calls = ((choice ? message.tool_calls : r.tool_calls) ?? []) as RawCall[];
  if (!calls.length) {
    const recovered = extractTextToolCalls(text);
    if (recovered.length) {
      calls = recovered;
      text = "";
    }
  }
  const content: Block[] = [];
  if (text.trim()) content.push({ type: "text", text });
  for (const c of calls) {
    const name = c.function?.name ?? c.name;
    if (!name) continue;
    content.push({ type: "tool_use", id: c.id || newId(), name, input: parseArgs(c.function?.arguments ?? c.arguments) });
  }
  const finish = String(choice?.finish_reason ?? "");
  const stopReason = content.some((b) => b.type === "tool_use") ? "tool_use" : finish === "length" ? "max_tokens" : "end_turn";
  return { content, stopReason, usage: (r.usage ?? undefined) as NormalizedReply["usage"] };
}
