/**
 * Deterministic rule engine: Profile -> ranked licenses with a score breakdown.
 * Shared by the wizard, the report page and the AI advisor (via the client).
 */
import { cellKey, type Catalog, type License } from "./catalog";
import { buildCompatIndex, checkExpression, type CompatIndex } from "./compat";
import type { AvoidKey, Profile } from "./profile";
import type { MatrixId } from "./schema";

export interface ScorePart {
  /** i18n key of the reason, e.g. "engine.part.avoid" */
  key: string;
  params: Record<string, string | number>;
  points: number;
}

export interface Ranked {
  license: string;
  score: number;
  parts: ScorePart[];
}

export interface Excluded {
  license: string;
  reasonKey: string;
  params: Record<string, string>;
}

export type Advisory =
  | "needs-cla"
  | "consider-dco"
  | "busl-change-date"
  | "model-card"
  | "notice-file"
  | "consult-lawyer"
  | "network-source-link";

export interface Recommendation {
  matrix: MatrixId;
  top: Ranked[];
  /** all scored candidates, best first */
  ranked: Ranked[];
  excluded: Excluded[];
  advisories: Advisory[];
}

/** Score change when a dependency is only compatible under extra conditions. */
const CONDITIONAL_DEPENDENCY_PENALTY = -3;

const compatCache = new WeakMap<Catalog, CompatIndex>();
function compatIndex(cat: Catalog): CompatIndex {
  let idx = compatCache.get(cat);
  if (!idx) {
    idx = buildCompatIndex(cat.compat);
    compatCache.set(cat, idx);
  }
  return idx;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function recommend(profile: Profile, cat: Catalog): Recommendation {
  const rules = cat.rules;
  const matrix: MatrixId = profile.artifact_type ? rules.artifactMatrix[profile.artifact_type] ?? "code" : "code";
  const columns = cat.matrices.get(matrix)?.columns ?? [];
  const whitelist = profile.artifact_type ? rules.artifactCandidates[profile.artifact_type] : undefined;
  const excluded: Excluded[] = [];
  const candidates: License[] = [];
  /** dependencies that are only conditionally compatible, per candidate */
  const conditionalDeps = new Map<string, string[]>();

  for (const slug of columns) {
    const lic = cat.licenses.get(slug);
    if (!lic) continue;
    if (whitelist && !whitelist.includes(slug)) {
      excluded.push({ license: slug, reasonKey: "engine.excluded.artifact", params: { artifact: profile.artifact_type ?? "" } });
      continue;
    }
    const checks = profile.dependencies.map((d) => checkExpression(compatIndex(cat), d, slug));
    const blocking = checks.find((r) => r.status === "incompatible");
    if (blocking) {
      excluded.push({ license: slug, reasonKey: "engine.excluded.dependency", params: { dependency: blocking.dependency } });
      continue;
    }
    candidates.push(lic);
    conditionalDeps.set(slug, checks.filter((r) => r.status === "conditional").map((r) => r.dependency));
  }

  const ranked: Ranked[] = candidates.map((lic) => {
    const parts: ScorePart[] = [];
    for (const a of profile.avoid) {
      const ids = rules.avoid[a as AvoidKey] ?? [];
      let pts = 0;
      for (const id of ids) {
        const cell = cat.cells.get(cellKey(id, lic.slug));
        if (cell) pts += rules.verdictScore[cell.verdict] ?? 0;
      }
      if (pts) parts.push({ key: "engine.part.avoid", params: { avoid: a }, points: pts });
    }
    const add = (key: string, params: Record<string, string>, pts: number | undefined) => {
      if (pts) parts.push({ key, params, points: pts });
    };
    if (profile.openness_level)
      add("engine.part.openness", { openness: profile.openness_level }, rules.openness[profile.openness_level]?.[lic.family]);
    if (profile.adoption_goal) add("engine.part.adoption", { goal: profile.adoption_goal }, rules.adoption[profile.adoption_goal]?.[lic.slug]);
    if (profile.commercial_plan)
      add("engine.part.commercial", { plan: profile.commercial_plan }, rules.commercial[profile.commercial_plan]?.[lic.slug]);
    if (profile.jurisdiction)
      add("engine.part.jurisdiction", { jurisdiction: profile.jurisdiction }, rules.jurisdiction[profile.jurisdiction]?.[lic.slug]);
    for (const dep of conditionalDeps.get(lic.slug) ?? [])
      parts.push({ key: "engine.part.dependency", params: { dependency: dep }, points: CONDITIONAL_DEPENDENCY_PENALTY });
    const score = round(parts.reduce((s, p) => s + p.points, 0));
    return { license: lic.slug, score, parts };
  });

  ranked.sort((a, b) => b.score - a.score || a.license.localeCompare(b.license));
  const top = ranked.slice(0, rules.topN);

  return { matrix, top, ranked, excluded, advisories: advisories(profile, top, cat) };
}

function advisories(profile: Profile, top: Ranked[], cat: Catalog): Advisory[] {
  const out = new Set<Advisory>();
  const families = new Set(top.map((r) => cat.licenses.get(r.license)?.family));
  const slugs = new Set(top.map((r) => r.license));
  if (profile.commercial_plan === "dual-license" || profile.commercial_plan === "open-core" || families.has("source-available"))
    out.add("needs-cla");
  else out.add("consider-dco");
  if (slugs.has("busl-1.1")) out.add("busl-change-date");
  if (slugs.has("apache-2.0")) out.add("notice-file");
  if (slugs.has("agpl-3.0")) out.add("network-source-link");
  if (profile.artifact_type === "model" || profile.artifact_type === "dataset") out.add("model-card");
  if (profile.dependencies.length || families.has("source-available")) out.add("consult-lawyer");
  return [...out];
}
