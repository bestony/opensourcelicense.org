/**
 * Browser-side execution of advisor tool calls. Pure functions so the loop
 * can be unit-tested without a model.
 */
import { parseAskQuestion, TOOL_ASK_QUESTION, TOOL_FINALIZE, TOOL_UPDATE_PROFILE, type AskQuestionInput } from "@/domain/advisor";
import { cellKey, type Catalog } from "@/domain/catalog";
import { recommend, type Recommendation } from "@/domain/engine";
import { missingFields, sanitizeProfile, type Profile } from "@/domain/profile";

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface ToolRunOutcome {
  profile: Profile;
  results: ToolResultBlock[];
  /** a question waiting for the user; its tool_result is added after the answer */
  question?: { toolUseId: string; input: AskQuestionInput };
  recommendation?: Recommendation;
}

/** Merge a partial profile from the model: arrays are unioned, scalars overwrite. */
export function mergeProfile(current: Profile, patch: unknown): Profile {
  const p = sanitizeProfile(patch);
  const raw = (patch ?? {}) as Record<string, unknown>;
  return sanitizeProfile({
    ...current,
    ...Object.fromEntries(Object.entries(p).filter(([k, v]) => k in raw && v !== undefined && !Array.isArray(v))),
    avoid: [...current.avoid, ...p.avoid],
    dependencies: [...current.dependencies, ...p.dependencies],
  });
}

/** Compact, model-friendly view of an engine result. */
export function engineReport(cat: Catalog, profile: Profile, rec: Recommendation) {
  const avoidScenarios = [...new Set(profile.avoid.flatMap((a) => cat.rules.avoid[a] ?? []))];
  return {
    matrix: rec.matrix,
    top: rec.top.map((r) => ({
      license: r.license,
      name: cat.licenses.get(r.license)?.name,
      score: r.score,
      reasons: r.parts.map((p) => ({ reason: p.key, ...p.params, points: p.points })),
      scenarios: avoidScenarios
        .map((sid) => {
          const c = cat.cells.get(cellKey(sid, r.license));
          return c ? { scenario: sid, verdict: c.verdict } : undefined;
        })
        .filter(Boolean),
      similar_projects: (cat.projectsByLicense.get(r.license) ?? []).slice(0, 5).map((p) => p.name),
    })),
    excluded: rec.excluded,
    advisories: rec.advisories,
  };
}

export function runTools(blocks: ToolUseBlock[], profile: Profile, cat: Catalog): ToolRunOutcome {
  let current = profile;
  const results: ToolResultBlock[] = [];
  let question: ToolRunOutcome["question"];
  let recommendation: Recommendation | undefined;
  for (const b of blocks) {
    if (b.name === TOOL_UPDATE_PROFILE) {
      current = mergeProfile(current, b.input);
      results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify({ profile: current, missing: missingFields(current) }) });
    } else if (b.name === TOOL_FINALIZE) {
      recommendation = recommend(current, cat);
      results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(engineReport(cat, current, recommendation)) });
    } else if (b.name === TOOL_ASK_QUESTION) {
      const q = parseAskQuestion(b.input);
      if (!q || question) {
        results.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: q ? "Ask only one question per turn." : `INVALID_INPUT: ${JSON.stringify(b.input)}` });
      } else question = { toolUseId: b.id, input: q };
    } else {
      results.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: `Unknown tool ${b.name}` });
    }
  }
  return { profile: current, results, question, recommendation };
}
