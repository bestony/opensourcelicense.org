/**
 * Live smoke test for the AI advisor: `pnpm advisor:smoke [baseUrl] "<first message>"`.
 * Drives the same tool loop as the browser and answers every question with the
 * first option. Default base URL: http://localhost:8787 (wrangler dev).
 */
import { runTools, type ToolUseBlock } from "../src/components/islands/chat-tools";
import type { ChatEvent } from "../src/domain/advisor";
import { buildCatalog } from "../src/domain/catalog";
import { emptyProfile, sanitizeProfile } from "../src/domain/profile";
import { loadRawData } from "../src/lib/load-data";
import { createLogger } from "../src/lib/log";

const log = createLogger("advisor-smoke");
const [baseUrl = "http://localhost:8787", first = "I built a vector database and I worry cloud vendors will resell it."] = process.argv.slice(2);
const cat = buildCatalog(loadRawData());
let profile = emptyProfile();
const messages: { role: string; content: unknown }[] = [{ role: "user", content: first }];

for (let turn = 0; turn < 10; turn++) {
  const res = await fetch(`${baseUrl}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages, locale: "en" }) });
  const events = (await res.text())
    .split("\n\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as ChatEvent);
  const msg = events.find((e) => e.type === "message" || e.type === "error");
  if (!msg || msg.type !== "message") {
    log.error("turn failed", { turn, status: res.status, event: msg });
    process.exit(1);
  }
  messages.push({ role: "assistant", content: msg.content });
  const tools = (msg.content as ToolUseBlock[]).filter((b) => b.type === "tool_use");
  for (const b of msg.content as { type: string; text?: string; name?: string; input?: unknown }[])
    log.info(b.type === "text" ? "assistant text" : "tool call", b.type === "text" ? { turn, text: b.text } : { turn, name: b.name, input: b.input });
  if (!tools.length) break;
  const out = runTools(tools, profile, cat);
  profile = out.profile;
  const results: unknown[] = [...out.results];
  if (out.question) {
    const q = out.question.input;
    const o = q.options[0];
    if (o) profile = sanitizeProfile({ ...profile, [q.field]: Array.isArray(profile[q.field]) ? [...(profile[q.field] as string[]), o.value] : o.value });
    results.push({ type: "tool_result", tool_use_id: out.question.toolUseId, content: o ? JSON.stringify({ field: q.field, value: o.value, label: o.label }) : "No preference" });
    log.info("answered question", { field: q.field, value: o?.value });
  }
  if (out.recommendation) log.info("engine result", { top: out.recommendation.top.map((r) => r.license) });
  messages.push({ role: "user", content: results });
}
log.info("final profile", { profile });
