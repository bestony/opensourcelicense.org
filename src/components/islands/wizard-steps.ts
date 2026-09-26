import {
  ADOPTION_GOALS,
  ARTIFACT_TYPES,
  AVOID_KEYS,
  COMMERCIAL_PLANS,
  JURISDICTIONS,
  OPENNESS_LEVELS,
  type ProfileField,
} from "@/domain/profile";

export interface Step {
  field: ProfileField;
  kind: "single" | "multi" | "list";
  options: readonly string[];
  optional?: boolean;
}

export const STEPS: Step[] = [
  { field: "artifact_type", kind: "single", options: ARTIFACT_TYPES },
  { field: "openness_level", kind: "single", options: OPENNESS_LEVELS },
  { field: "avoid", kind: "multi", options: AVOID_KEYS, optional: true },
  { field: "adoption_goal", kind: "single", options: ADOPTION_GOALS },
  { field: "dependencies", kind: "list", options: [], optional: true },
  { field: "commercial_plan", kind: "single", options: COMMERCIAL_PLANS, optional: true },
  { field: "jurisdiction", kind: "single", options: JURISDICTIONS, optional: true },
];
