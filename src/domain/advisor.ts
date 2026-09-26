/**
 * AI advisor contract shared by the browser (Chat island) and the Worker.
 * The model only extracts, asks and explains; the rule engine decides.
 */
import {
  ADOPTION_GOALS,
  ARTIFACT_TYPES,
  AVOID_KEYS,
  COMMERCIAL_PLANS,
  JURISDICTIONS,
  OPENNESS_LEVELS,
  PROFILE_FIELDS,
  type ProfileField,
} from "./profile";

export const TOOL_UPDATE_PROFILE = "update_profile";
export const TOOL_ASK_QUESTION = "ask_question";
export const TOOL_FINALIZE = "finalize";

/** Action the chat widget is rendered with; the worker requires it on siteverify. */
export const TURNSTILE_ACTION = "chat";

/** JSON-schema tool definitions (Anthropic tool format, without SDK types). */
export const ADVISOR_TOOLS = [
  {
    name: TOOL_UPDATE_PROFILE,
    description:
      "Record facts about the user's project in the project profile. Call it whenever the user states or implies a value. Send only the fields you learned; omit unknown fields. The tool result returns the merged profile and the fields that are still missing.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        artifact_type: { type: "string", enum: [...ARTIFACT_TYPES] },
        openness_level: { type: "string", enum: [...OPENNESS_LEVELS] },
        avoid: { type: "array", items: { type: "string", enum: [...AVOID_KEYS] } },
        adoption_goal: { type: "string", enum: [...ADOPTION_GOALS] },
        dependencies: {
          type: "array",
          items: { type: "string" },
          description: "SPDX identifiers of dependency licenses the user mentioned, e.g. GPL-3.0-only",
        },
        commercial_plan: { type: "string", enum: [...COMMERCIAL_PLANS] },
        jurisdiction: { type: "string", enum: [...JURISDICTIONS] },
      },
    },
  },
  {
    name: TOOL_ASK_QUESTION,
    description:
      "Ask the user ONE follow-up question about a missing profile field, with answer options. The user's choice comes back as the tool result. Use at most one call per turn.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["field", "question"],
      properties: {
        field: { type: "string", enum: [...PROFILE_FIELDS] },
        question: { type: "string", description: "The question, in the user's language." },
        options: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["value", "label"],
            properties: {
              value: { type: "string", description: "A valid enum value for the field." },
              label: { type: "string", description: "Short label in the user's language." },
            },
          },
        },
      },
    },
  },
  {
    name: TOOL_FINALIZE,
    description:
      "Run the site's deterministic rule engine on the current profile. Call it when the required fields are known (or the user asks for a result). The tool result contains the ranked licenses, score reasons, excluded licenses, advisories, relevant scenario cells and similar projects. Explain that result; never recommend a license the engine did not rank.",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
  },
] as const;

export type AdvisorToolName = (typeof ADVISOR_TOOLS)[number]["name"];

export interface AskQuestionInput {
  field: ProfileField;
  question: string;
  options: { value: string; label: string }[];
}

/** Validates ask_question input (tool inputs stream eagerly and are not validated upstream). */
export function parseAskQuestion(input: unknown): AskQuestionInput | undefined {
  const o = (input ?? {}) as Record<string, unknown>;
  if (typeof o.question !== "string" || !o.question.trim()) return undefined;
  if (typeof o.field !== "string" || !(PROFILE_FIELDS as readonly string[]).includes(o.field)) return undefined;
  let rawOptions: unknown = o.options;
  // Small models sometimes send the array as a JSON string.
  if (typeof rawOptions === "string") {
    try {
      rawOptions = JSON.parse(rawOptions);
    } catch {
      rawOptions = [];
    }
  }
  const options = Array.isArray(rawOptions)
    ? rawOptions
        .filter((x): x is { value: string; label: string } => !!x && typeof x.value === "string" && typeof x.label === "string")
        .slice(0, 6)
    : [];
  return { field: o.field as ProfileField, question: o.question.slice(0, 500), options };
}

/** Server-sent events emitted by POST /api/chat. */
export type ChatEvent =
  | { type: "session"; token: string }
  | { type: "text"; text: string }
  | { type: "tool_start"; name: string }
  | { type: "message"; content: unknown[]; stop_reason: string | null; model: string }
  | { type: "error"; code: ChatErrorCode; message?: string }
  | { type: "done" };

export type ChatErrorCode = "bad_request" | "verification" | "rate_limited" | "upstream" | "refusal" | "not_configured";

export interface ChatRequest {
  /** Conversation in Anthropic message format; assistant turns are echoed back unchanged. */
  messages: unknown[];
  locale: string;
  turnstileToken?: string;
  sessionToken?: string;
}
