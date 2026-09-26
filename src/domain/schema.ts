/**
 * Zod schemas for every file under data/. Shared by Astro content collections
 * (src/content.config.ts) and the standalone validator (scripts/validate.ts).
 */
import { z } from "astro/zod";

export const slug = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, "must be a lowercase slug");

export const FAMILIES = [
  "permissive",
  "weak-copyleft",
  "strong-copyleft",
  "network-copyleft",
  "source-available",
  "model",
  "content",
] as const;
export const family = z.enum(FAMILIES);

export const MATRIX_IDS = ["code", "model"] as const;
export const matrixId = z.enum(MATRIX_IDS);

export const VERDICTS = ["allow", "conditional", "deny", "silent", "tbd"] as const;
export const verdict = z.enum(VERDICTS);

export const tristate = z.union([z.boolean(), z.literal("unknown")]);

export const licenseSchema = z.object({
  spdx: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  family,
  osi: tristate,
  fsf: tristate,
  permissions: z.array(z.string()).default([]),
  conditions: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  textUrl: z.url(),
  officialTexts: z.record(z.string(), z.url()).default({}),
  hasText: z.boolean().default(false),
  matrices: z.array(matrixId).min(1),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const matrixSchema = z.object({
  id: matrixId,
  columns: z.array(slug).min(1),
  groups: z.array(z.object({ id: z.string().regex(/^[A-Z]$/) })).min(1),
});

export const cellSchema = z.object({
  verdict,
  clause: z.object({ ref: z.string(), quote: z.string().optional() }).optional(),
  caseRef: slug.optional(),
});

export const scenarioSchema = z.object({
  matrix: matrixId,
  group: z.string().regex(/^[A-Z]$/),
  order: z.number().int(),
  cells: z.record(slug, cellSchema),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
});

export const timelineEventSchema = z.object({
  date: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/),
  from: z.array(z.string()).default([]),
  to: z.array(z.string()).min(1),
  reason: z.string().optional(),
  url: z.url(),
  forks: z.array(slug).default([]),
});

export const PROJECT_OWNERS = ["company", "foundation", "individual", "community"] as const;

export const projectSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  owner: z.enum(PROJECT_OWNERS),
  ownerName: z.string().optional(),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional(),
  hf: z.string().optional(),
  homepage: z.url().optional(),
  current: z.array(z.string()).min(1),
  tags: z.array(z.string()).default([]),
  timeline: z.array(timelineEventSchema).default([]),
  forkOf: slug.optional(),
  needsReview: z.boolean().default(false),
  syncedAt: z.string().optional(),
});

export const licenseTextSchema = z.object({
  reviewed: z.boolean().default(false),
  sourceHash: z.string().optional(),
  name: z.string().optional(),
  summary: z.string(),
  analogy: z.string().optional(),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
});

export const scenarioTextSchema = z.object({
  reviewed: z.boolean().default(false),
  sourceHash: z.string().optional(),
  title: z.string(),
  actor: z.string().optional(),
  description: z.string().optional(),
  cells: z.record(slug, z.string()).default({}),
});

export const uiSchema = z.object({
  reviewed: z.boolean().default(false),
  sourceHash: z.string().optional(),
  strings: z.record(z.string(), z.string()),
});

const weights = z.record(z.string(), z.number());

export const engineRulesSchema = z.object({
  verdictScore: z.record(verdict, z.number()),
  avoid: z.record(z.string(), z.array(z.string())),
  openness: z.record(z.string(), weights),
  adoption: z.record(z.string(), weights),
  commercial: z.record(z.string(), weights),
  jurisdiction: z.record(z.string(), weights),
  artifactMatrix: z.record(z.string(), matrixId),
  artifactCandidates: z.record(z.string(), z.array(slug)).default({}),
  radar: z.record(
    matrixId,
    z.array(
      z.object({
        id: z.string(),
        scenarios: z.array(z.string()).min(1),
        score: z.record(verdict, z.number()),
      }),
    ),
  ),
  topN: z.number().int().positive().default(3),
});

export const compatSchema = z.object({
  classes: z.record(z.string(), z.array(z.string())),
  rules: z.record(
    z.string(),
    z.object({
      allow: z.union([z.literal("*"), z.array(slug)]),
      conditional: z.array(slug).default([]),
      note: z.string().optional(),
    }),
  ),
});

export type LicenseData = z.infer<typeof licenseSchema>;
export type MatrixData = z.infer<typeof matrixSchema>;
export type CellData = z.infer<typeof cellSchema>;
export type ScenarioData = z.infer<typeof scenarioSchema>;
export type ProjectData = z.infer<typeof projectSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type LicenseText = z.infer<typeof licenseTextSchema>;
export type ScenarioText = z.infer<typeof scenarioTextSchema>;
export type UiData = z.infer<typeof uiSchema>;
export type EngineRules = z.infer<typeof engineRulesSchema>;
export type CompatData = z.infer<typeof compatSchema>;
export type Family = (typeof FAMILIES)[number];
export type Verdict = (typeof VERDICTS)[number];
export type MatrixId = (typeof MATRIX_IDS)[number];
