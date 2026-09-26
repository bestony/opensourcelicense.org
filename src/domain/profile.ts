/** Project profile: the single input of the rule engine and the AI advisor tool schema. */
export const ARTIFACT_TYPES = ["library", "application", "saas", "model", "dataset", "docs"] as const;
export const OPENNESS_LEVELS = ["open", "reciprocal", "source-available"] as const;
export const AVOID_KEYS = [
  "cloud-hosting",
  "closed-fork",
  "patent-litigation",
  "trademark-abuse",
  "harmful-use",
  "big-company",
] as const;
export const ADOPTION_GOALS = ["enterprise", "community", "monetize"] as const;
export const COMMERCIAL_PLANS = ["none", "dual-license", "open-core", "hosted"] as const;
export const JURISDICTIONS = ["cn", "eu", "us", "other"] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];
export type OpennessLevel = (typeof OPENNESS_LEVELS)[number];
export type AvoidKey = (typeof AVOID_KEYS)[number];
export type AdoptionGoal = (typeof ADOPTION_GOALS)[number];
export type CommercialPlan = (typeof COMMERCIAL_PLANS)[number];
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export interface Profile {
  artifact_type?: ArtifactType;
  openness_level?: OpennessLevel;
  avoid: AvoidKey[];
  adoption_goal?: AdoptionGoal;
  /** lowercase SPDX ids of known dependency licenses */
  dependencies: string[];
  commercial_plan?: CommercialPlan;
  jurisdiction?: Jurisdiction;
}

export const PROFILE_FIELDS = [
  "artifact_type",
  "openness_level",
  "avoid",
  "adoption_goal",
  "dependencies",
  "commercial_plan",
  "jurisdiction",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** Fields the advisor must fill before the engine runs. */
export const REQUIRED_FIELDS: readonly ProfileField[] = ["artifact_type", "openness_level", "adoption_goal"];

export function emptyProfile(): Profile {
  return { avoid: [], dependencies: [] };
}

export function missingFields(p: Profile): ProfileField[] {
  return REQUIRED_FIELDS.filter((f) => p[f] === undefined);
}

const inList = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Coerce untrusted input (URL, LLM tool call) into a valid Profile, dropping unknown values. */
export function sanitizeProfile(input: unknown): Profile {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    artifact_type: inList(ARTIFACT_TYPES, o.artifact_type) ? o.artifact_type : undefined,
    openness_level: inList(OPENNESS_LEVELS, o.openness_level) ? o.openness_level : undefined,
    avoid: [...new Set(arr(o.avoid).filter((v): v is AvoidKey => inList(AVOID_KEYS, v)))],
    adoption_goal: inList(ADOPTION_GOALS, o.adoption_goal) ? o.adoption_goal : undefined,
    dependencies: [
      ...new Set(
        arr(o.dependencies)
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim().toLowerCase())
          .filter((v) => /^[a-z0-9][a-z0-9.+-]{0,63}$/.test(v)),
      ),
    ].slice(0, 32),
    commercial_plan: inList(COMMERCIAL_PLANS, o.commercial_plan) ? o.commercial_plan : undefined,
    jurisdiction: inList(JURISDICTIONS, o.jurisdiction) ? o.jurisdiction : undefined,
  };
}
