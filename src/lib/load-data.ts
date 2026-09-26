/**
 * Node-only loader that reads data/ from disk and validates it with the shared
 * Zod schemas. Used by scripts/validate.ts, the build integrity hook and tests.
 * Pages use content collections (src/lib/data.ts) with the same schemas.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";
import type { RawData } from "@/domain/catalog";
import {
  aliasSchema,
  compatSchema,
  engineRulesSchema,
  licenseSchema,
  licenseTextSchema,
  matrixSchema,
  projectSchema,
  scenarioSchema,
  scenarioTextSchema,
  uiSchema,
} from "@/domain/schema";
import { z } from "astro/zod";

export class DataError extends Error {
  constructor(
    public readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
  }
}

function readYaml<T>(file: string, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new DataError(file, detail);
  }
  return parsed.data;
}

function readDir<T>(dir: string, schema: z.ZodType<T>): Record<string, T> {
  const out: Record<string, T> = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".yaml") || f.startsWith("_")) continue;
    out[basename(f, ".yaml")] = readYaml(join(dir, f), schema);
  }
  return out;
}

export function loadRawData(root = "data"): RawData {
  const licenseTexts: RawData["licenseTexts"] = {};
  const scenarioTexts: RawData["scenarioTexts"] = {};
  const ui: RawData["ui"] = {};
  const i18nDir = join(root, "i18n");
  for (const locale of existsSync(i18nDir) ? readdirSync(i18nDir).sort() : []) {
    const base = join(i18nDir, locale);
    for (const [k, v] of Object.entries(readDir(join(base, "licenses"), licenseTextSchema))) licenseTexts[`${locale}/${k}`] = v;
    for (const [k, v] of Object.entries(readDir(join(base, "scenarios"), scenarioTextSchema))) scenarioTexts[`${locale}/${k}`] = v;
    const uiFile = join(base, "ui.yaml");
    if (existsSync(uiFile)) ui[locale] = readYaml(uiFile, uiSchema);
  }
  const matricesFile = join(root, "matrices.yaml");
  const matrices = readYaml(matricesFile, matrixSchema.array());
  return {
    licenses: readDir(join(root, "licenses"), licenseSchema),
    matrices,
    scenarios: readDir(join(root, "scenarios"), scenarioSchema),
    projects: readDir(join(root, "projects"), projectSchema),
    licenseTexts,
    scenarioTexts,
    ui,
    rules: readYaml(join(root, "rules/engine.yaml"), engineRulesSchema),
    compat: readYaml(join(root, "rules/compat.yaml"), compatSchema),
    aliases: readYaml(join(root, "license-aliases.yaml"), z.record(z.string(), aliasSchema)),
  };
}
