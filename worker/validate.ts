/**
 * Validates the untrusted conversation sent by the browser before it reaches
 * the model. Only text, tool_use and tool_result blocks are allowed.
 */
export const MAX_MESSAGES = 60;
export const MAX_BODY_BYTES = 200_000;
export const MAX_TEXT_CHARS = 4_000;

const ASSISTANT_BLOCKS = new Set(["text", "tool_use"]);
const USER_BLOCKS = new Set(["text", "tool_result"]);

export type ValidationResult = { ok: true; messages: unknown[] } | { ok: false; reason: string };

export function validateMessages(input: unknown): ValidationResult {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, reason: "messages must be a non-empty array" };
  if (input.length > MAX_MESSAGES) return { ok: false, reason: `too many messages (max ${MAX_MESSAGES})` };
  let expected: "user" | "assistant" = "user";
  for (const [i, m] of input.entries()) {
    if (!m || typeof m !== "object") return { ok: false, reason: `message ${i} is not an object` };
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== expected) return { ok: false, reason: `message ${i} must have role ${expected}` };
    expected = role === "user" ? "assistant" : "user";
    if (typeof content === "string") {
      if (role === "user" && content.length > MAX_TEXT_CHARS) return { ok: false, reason: `message ${i} is too long` };
      continue;
    }
    if (!Array.isArray(content) || content.length === 0) return { ok: false, reason: `message ${i} has no content` };
    const allowed = role === "user" ? USER_BLOCKS : ASSISTANT_BLOCKS;
    for (const b of content) {
      const type = (b as { type?: unknown })?.type;
      if (typeof type !== "string" || !allowed.has(type)) return { ok: false, reason: `message ${i} has a disallowed block "${String(type)}"` };
      if (role === "user" && type === "text" && String((b as { text?: unknown }).text ?? "").length > MAX_TEXT_CHARS)
        return { ok: false, reason: `message ${i} is too long` };
    }
  }
  if (expected !== "assistant") return { ok: false, reason: "the last message must be from the user" };
  return { ok: true, messages: input };
}
