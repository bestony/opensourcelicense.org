/**
 * Build-time completeness checks. Any issue with level "error" fails the build.
 */
import { cellKey, type Catalog } from "./catalog";

export type IssueLevel = "error" | "warn";
export interface Issue {
  level: IssueLevel;
  code: string;
  path: string;
  message: string;
}

export interface IntegrityOptions {
  locales: readonly string[];
  defaultLocale: string;
  /** Treat `tbd` verdicts as errors (release gate). */
  strictTbd?: boolean;
}

export function validateCatalog(cat: Catalog, opts: IntegrityOptions): Issue[] {
  const issues: Issue[] = [];
  const add = (level: IssueLevel, code: string, path: string, message: string) =>
    issues.push({ level, code, path, message });

  // Matrices <-> licenses, both directions.
  for (const m of cat.matrices.values()) {
    for (const col of m.columns) {
      const lic = cat.licenses.get(col);
      if (!lic) add("error", "matrix.unknown-license", `data/matrices.yaml#${m.id}`, `unknown license "${col}"`);
      else if (!lic.matrices.includes(m.id))
        add("error", "matrix.membership", `data/licenses/${col}.yaml`, `listed in matrix "${m.id}" but "matrices" lacks it`);
    }
  }
  for (const lic of cat.licenseList) {
    for (const mid of lic.matrices) {
      const m = cat.matrices.get(mid);
      if (!m) add("error", "license.unknown-matrix", `data/licenses/${lic.slug}.yaml`, `unknown matrix "${mid}"`);
      else if (!m.columns.includes(lic.slug))
        add("error", "license.not-in-matrix", `data/licenses/${lic.slug}.yaml`, `declares matrix "${mid}" but is not a column`);
    }
  }

  // Every scenario covers exactly its matrix columns.
  const tbd: string[] = [];
  for (const s of cat.scenarioList) {
    const path = `data/scenarios/${s.id}.yaml`;
    const m = cat.matrices.get(s.matrix);
    if (!m) {
      add("error", "scenario.unknown-matrix", path, `unknown matrix "${s.matrix}"`);
      continue;
    }
    if (!m.groups.some((g) => g.id === s.group))
      add("error", "scenario.unknown-group", path, `group "${s.group}" is not in matrix "${m.id}"`);
    if (s.id[0] !== s.group) add("error", "scenario.group-mismatch", path, `id prefix does not match group "${s.group}"`);
    const cols = new Set(m.columns);
    for (const col of cols)
      if (!cat.cells.has(cellKey(s.id, col))) add("error", "scenario.missing-cell", path, `missing cell for "${col}"`);
    for (const key of Object.keys(s.cells)) {
      if (!cols.has(key)) add("error", "scenario.extra-cell", path, `cell "${key}" is not a column of "${m.id}"`);
      const c = s.cells[key];
      if (c.verdict === "tbd") tbd.push(`${s.id}:${key}`);
      if (c.caseRef && !cat.projects.has(c.caseRef))
        add("error", "scenario.unknown-case", path, `caseRef "${c.caseRef}" is not a project`);
    }
  }
  if (tbd.length)
    add(opts.strictTbd ? "error" : "warn", "scenario.tbd", "data/scenarios", `${tbd.length} cell(s) still "tbd": ${tbd.join(", ")}`);

  // Rules reference real scenarios and licenses.
  const r = cat.rules;
  for (const [key, ids] of Object.entries(r.avoid))
    for (const id of ids)
      if (!cat.scenarios.has(id)) add("error", "rules.unknown-scenario", "data/rules/engine.yaml", `avoid.${key}: "${id}"`);
  for (const [mid, dims] of Object.entries(r.radar))
    for (const d of dims)
      for (const id of d.scenarios) {
        const s = cat.scenarios.get(id);
        if (!s) add("error", "rules.unknown-scenario", "data/rules/engine.yaml", `radar.${mid}.${d.id}: "${id}"`);
        else if (s.matrix !== mid)
          add("error", "rules.radar-matrix", "data/rules/engine.yaml", `radar.${mid}.${d.id}: "${id}" belongs to "${s.matrix}"`);
      }
  for (const [art, list] of Object.entries(r.artifactCandidates))
    for (const l of list)
      if (!cat.licenses.has(l)) add("error", "rules.unknown-license", "data/rules/engine.yaml", `artifactCandidates.${art}: "${l}"`);
  for (const section of ["adoption", "commercial", "jurisdiction"] as const)
    for (const [k, w] of Object.entries(r[section]))
      for (const l of Object.keys(w))
        if (!cat.licenses.has(l)) add("error", "rules.unknown-license", "data/rules/engine.yaml", `${section}.${k}: "${l}"`);

  // Projects: references.
  for (const p of cat.projectList) {
    const path = `data/projects/${p.slug}.yaml`;
    if (p.forkOf && !cat.projects.has(p.forkOf)) add("error", "project.unknown-fork-of", path, `forkOf "${p.forkOf}"`);
    for (const ev of p.timeline)
      for (const f of ev.forks)
        if (!cat.projects.has(f)) add("error", "project.unknown-fork", path, `fork "${f}" is not a project`);
    if (p.needsReview) add("warn", "project.needs-review", path, "needs human review");
  }

  // i18n coverage.
  const texts = cat.raw;
  for (const locale of opts.locales) {
    const isDefault = locale === opts.defaultLocale;
    const level: IssueLevel = isDefault ? "error" : "warn";
    const missing: string[] = [];
    if (!texts.ui[locale]) missing.push("ui");
    for (const l of cat.licenseList) if (!texts.licenseTexts[`${locale}/${l.slug}`]) missing.push(`licenses/${l.slug}`);
    for (const s of cat.scenarioList) if (!texts.scenarioTexts[`${locale}/${s.id}`]) missing.push(`scenarios/${s.id}`);
    if (missing.length)
      add(level, "i18n.missing", `data/i18n/${locale}`, `${missing.length} missing: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? " …" : ""}`);
  }
  const defUi = texts.ui[opts.defaultLocale]?.strings ?? {};
  for (const locale of opts.locales) {
    if (locale === opts.defaultLocale) continue;
    const ui = texts.ui[locale]?.strings;
    if (!ui) continue;
    const miss = Object.keys(defUi).filter((k) => !(k in ui));
    if (miss.length) add("warn", "i18n.ui-missing-keys", `data/i18n/${locale}/ui.yaml`, `${miss.length} key(s) fall back to ${opts.defaultLocale}`);
  }

  return issues;
}

export function summarize(issues: Issue[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const i of issues) i.level === "error" ? errors++ : warnings++;
  return { errors, warnings };
}
