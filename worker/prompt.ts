/**
 * Builds the frozen system prompt from the catalog JSON produced at build time.
 * The output is deterministic for a given catalog, so prompt caching hits.
 */
import type { RawData } from "../src/domain/catalog";
import { REQUIRED_FIELDS } from "../src/domain/profile";

const RULES = `You are the license advisor of opensourcelicense.org.

Your job:
1. Understand the user's project from what they write. Record every fact with the update_profile tool as soon as you learn it.
2. When a required field is missing, ask about it with ask_question: one question per turn, with clear options. Required fields: ${REQUIRED_FIELDS.join(", ")}. Ask about "avoid" and "dependencies" if the user has not mentioned them. Ask at most 5 questions in total; if the user wants a result sooner, call finalize.
3. When the required fields are known, call finalize. A deterministic rule engine computes the recommendation.
4. Explain the engine result in plain words: why the top license fits, what the extreme scenarios mean for this project, which similar projects made a comparable choice, and the next steps (LICENSE file, CLA/DCO, headers).

Tool use:
- Call tools through the tool-calling interface only. Never write tool calls as plain text.
- After a tool result arrives, continue from it; do not repeat the same call.

Hard rules:
- Recommend only licenses the engine ranked. Do not invent licenses, clauses, verdicts or project facts. Use only the knowledge below and tool results.
- If you are not sure, say so.
- If the user asks about an ongoing dispute, a contract review, export control or sanctions, tell them to talk to a lawyer.
- Reply in the user's language. Keep answers short and concrete. Use Markdown lists sparingly.
- End every final explanation with one line saying this is not legal advice.`;

export function buildSystemPrompt(raw: RawData): string {
  const t = (key: string) => raw.licenseTexts[`en/${key}`];
  const licenses = Object.entries(raw.licenses)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, l]) => {
      const text = t(slug);
      return [
        `## ${slug} (${l.spdx}) — ${l.name}`,
        `family: ${l.family}; OSI: ${l.osi}; matrices: ${l.matrices.join(",")}`,
        `permissions: ${l.permissions.join(", ")}`,
        `conditions: ${l.conditions.join(", ")}`,
        `limitations: ${l.limitations.join(", ")}`,
        text ? `summary: ${text.summary}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const scenarios = Object.entries(raw.scenarios)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, s]) => {
      const text = raw.scenarioTexts[`en/${id}`];
      const cells = Object.entries(s.cells)
        .map(([lic, c]) => {
          const note = text?.cells[lic];
          return `${lic}=${c.verdict}${note ? ` (${note})` : ""}`;
        })
        .join("; ");
      return `${id} [${s.matrix}] ${text?.title ?? id}: ${cells}`;
    })
    .join("\n");

  return `${RULES}

# Verdict meaning
allow = the other party can do this; conditional = allowed with conditions; deny = the license blocks it; silent = the license does not address it (general law applies); tbd = under review.

# Licenses
${licenses}

# Extreme scenario matrix
${scenarios}`;
}
