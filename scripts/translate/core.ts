/**
 * Pure translation planning and validation. No network or fs.
 */
import { LOCALE_META, type Locale } from "../../src/domain/locales";
import { sourceHash } from "../../src/domain/text-hash";

export type Kind = "ui" | "licenses" | "scenarios";

export interface Job {
  locale: Locale;
  kind: Kind;
  /** file id: slug / scenario id / "ui" */
  id: string;
  /** translatable fields of the English source */
  source: Record<string, unknown>;
  hash: string;
  reason: "missing" | "stale";
}

interface Existing {
  reviewed?: boolean;
  sourceHash?: string;
}

/** Content fields per kind (metadata is never sent to the model). */
export function translatableFields(kind: Kind, entry: Record<string, unknown>): Record<string, unknown> {
  const pick = (keys: string[]) => Object.fromEntries(keys.filter((k) => entry[k] !== undefined).map((k) => [k, entry[k]]));
  if (kind === "ui") return pick(["strings"]);
  if (kind === "licenses") return pick(["name", "summary", "analogy", "pros", "cons"]);
  return pick(["title", "description", "cells"]);
}

export function planJob(
  locale: Locale,
  kind: Kind,
  id: string,
  source: Record<string, unknown>,
  existing: Existing | undefined,
  force = false,
): Job | undefined {
  const hash = sourceHash(source);
  if (!existing) return { locale, kind, id, source: translatableFields(kind, source), hash, reason: "missing" };
  if (existing.reviewed && !force) return undefined; // never overwrite human-reviewed text
  if (existing.sourceHash !== hash) return { locale, kind, id, source: translatableFields(kind, source), hash, reason: "stale" };
  return undefined;
}

const PLACEHOLDER = /\{[a-zA-Z_]+\}/g;
const placeholders = (s: string) => [...s.matchAll(PLACEHOLDER)].map((m) => m[0]).sort().join(",");

/** Returns problems; an empty list means the translation has the same shape as the source. */
export function validateTranslation(source: unknown, translated: unknown, path = ""): string[] {
  if (typeof source === "string") {
    if (typeof translated !== "string" || !translated.trim()) return [`${path}: expected non-empty string`];
    if (placeholders(source) !== placeholders(translated)) return [`${path}: placeholders differ`];
    return [];
  }
  if (Array.isArray(source)) {
    if (!Array.isArray(translated) || translated.length !== source.length) return [`${path}: expected array of ${source.length}`];
    return source.flatMap((s, i) => validateTranslation(s, translated[i], `${path}[${i}]`));
  }
  if (source && typeof source === "object") {
    if (!translated || typeof translated !== "object" || Array.isArray(translated)) return [`${path}: expected object`];
    const t = translated as Record<string, unknown>;
    return Object.entries(source).flatMap(([k, v]) => validateTranslation(v, t[k], path ? `${path}.${k}` : k));
  }
  return translated === source ? [] : [`${path}: non-text value changed`];
}

export function systemPrompt(locale: Locale): string {
  return `You translate the user interface and content of opensourcelicense.org, a site about open source licenses, from English into ${LOCALE_META[locale].english} (${LOCALE_META[locale].label}, ${LOCALE_META[locale].tag}).
Rules:
- Return ONLY a JSON object with exactly the same structure and keys as the input. Translate string values only.
- Keep placeholders such as {count} or {license} unchanged.
- Keep license names, SPDX identifiers (MIT, Apache-2.0, GPL-3.0, AGPL-3.0, BSL-1.1, ELv2 ...), product names and symbols (✓ ◐ ✗ —) unchanged.
- Use the neutral, concise tone of software documentation. Do not add explanations.
- Legal meaning must not change. If unsure, translate literally.`;
}

/** Splits large string maps (UI) into chunks the model can handle. */
export function chunkStrings(strings: Record<string, string>, size = 40): Record<string, string>[] {
  const entries = Object.entries(strings);
  const out: Record<string, string>[] = [];
  for (let i = 0; i < entries.length; i += size) out.push(Object.fromEntries(entries.slice(i, i + size)));
  return out;
}

/** Extracts the first JSON object from model output (tolerates code fences and prose). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("no JSON object in model output");
  }
}
