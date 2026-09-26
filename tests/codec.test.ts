import { describe, expect, it } from "vitest";
import { decodeProfile, encodeProfile } from "@/domain/profile-codec";
import { emptyProfile, sanitizeProfile, type Profile } from "@/domain/profile";

describe("profile codec", () => {
  it("round-trips a full profile", () => {
    const p: Profile = {
      artifact_type: "saas",
      openness_level: "reciprocal",
      avoid: ["cloud-hosting", "patent-litigation"],
      adoption_goal: "monetize",
      dependencies: ["gpl-3.0-only", "mit"],
      commercial_plan: "dual-license",
      jurisdiction: "cn",
    };
    const code = encodeProfile(p);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeProfile(`#${code}`)).toEqual({ ok: true, profile: p });
  });

  it("round-trips an empty profile", () => {
    expect(decodeProfile(encodeProfile(emptyProfile()))).toEqual({ ok: true, profile: sanitizeProfile({}) });
  });

  it("rejects malformed and unknown versions", () => {
    expect(decodeProfile("!!!").ok).toBe(false);
    expect(decodeProfile(btoa("[9,0]")).ok).toBe(false);
  });

  it("sanitizes hostile values", () => {
    const code = btoa(JSON.stringify([1, 99, -5, 0xffff, "x", null, 2, "<script>", "mit"])).replace(/=+$/, "");
    const r = decodeProfile(code);
    expect(r.ok && r.profile).toMatchObject({ artifact_type: undefined, dependencies: ["mit"], jurisdiction: "us" });
  });
});
