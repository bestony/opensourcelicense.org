import { describe, expect, it } from "vitest";
import { mergeProfile, runTools } from "@/components/islands/chat-tools";
import { emptyProfile } from "@/domain/profile";
import { realCatalog } from "./helpers";

const cat = realCatalog();

describe("chat tools", () => {
  it("merges profile patches and unions arrays", () => {
    let p = mergeProfile(emptyProfile(), { artifact_type: "saas", avoid: ["cloud-hosting"] });
    p = mergeProfile(p, { avoid: ["closed-fork", "bogus"], openness_level: "reciprocal" });
    expect(p).toMatchObject({ artifact_type: "saas", openness_level: "reciprocal", avoid: ["cloud-hosting", "closed-fork"] });
  });

  it("accepts arrays sent as JSON strings or comma lists", () => {
    expect(mergeProfile(emptyProfile(), { avoid: '["cloud-hosting"]' }).avoid).toEqual(["cloud-hosting"]);
    expect(mergeProfile(emptyProfile(), { dependencies: "GPL-3.0-only, MIT" }).dependencies).toEqual(["gpl-3.0-only", "mit"]);
  });

  it("does not clear fields the patch omits", () => {
    const p = mergeProfile(mergeProfile(emptyProfile(), { adoption_goal: "community" }), { jurisdiction: "cn" });
    expect(p.adoption_goal).toBe("community");
  });

  it("runs update, question and finalize in one turn", () => {
    const out = runTools(
      [
        { type: "tool_use", id: "a", name: "update_profile", input: { artifact_type: "library", openness_level: "open", adoption_goal: "enterprise" } },
        { type: "tool_use", id: "b", name: "ask_question", input: { field: "avoid", question: "What to avoid?", options: [{ value: "cloud-hosting", label: "Cloud" }] } },
        { type: "tool_use", id: "c", name: "ask_question", input: { field: "jurisdiction", question: "Where?" } },
        { type: "tool_use", id: "d", name: "finalize", input: {} },
        { type: "tool_use", id: "e", name: "rm_rf", input: {} },
      ],
      emptyProfile(),
      cat,
    );
    expect(out.profile.artifact_type).toBe("library");
    expect(out.question?.toolUseId).toBe("b");
    expect(out.results.map((r) => [r.tool_use_id, !!r.is_error])).toEqual([["a", false], ["c", true], ["d", false], ["e", true]]);
    const report = JSON.parse(out.results[2].content);
    expect(report.top[0].license).toBe(out.recommendation!.top[0].license);
  });

  it("accepts question options sent as a JSON string", () => {
    const out = runTools([{ type: "tool_use", id: "q", name: "ask_question", input: { field: "openness_level", question: "How open?", options: '[{"label":"Open","value":"open"}]' } }], emptyProfile(), cat);
    expect(out.question?.input.options).toEqual([{ label: "Open", value: "open" }]);
  });

  it("rejects invalid question input", () => {
    const out = runTools([{ type: "tool_use", id: "x", name: "ask_question", input: { field: "nope", question: "" } }], emptyProfile(), cat);
    expect(out.question).toBeUndefined();
    expect(out.results[0].is_error).toBe(true);
  });
});
