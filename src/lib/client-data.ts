/**
 * Pruned RawData for islands: only the texts of one locale plus the English
 * fallback, so islands can rebuild the catalog with buildCatalog().
 */
import type { Catalog, RawData } from "@/domain/catalog";
import { DEFAULT_LOCALE, type Locale } from "@/domain/locales";

function filterByLocale<T>(table: Record<string, T>, locale: Locale): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(table)) {
    const l = k.slice(0, k.indexOf("/"));
    if (l === locale || l === DEFAULT_LOCALE) out[k] = v;
  }
  return out;
}

export function clientRaw(cat: Catalog, locale: Locale): RawData {
  const raw = cat.raw;
  const ui: RawData["ui"] = { [DEFAULT_LOCALE]: raw.ui[DEFAULT_LOCALE] };
  if (raw.ui[locale]) ui[locale] = raw.ui[locale];
  const projects: RawData["projects"] = {};
  for (const [slug, p] of Object.entries(raw.projects))
    projects[slug] = { ...p, timeline: p.timeline.map((e) => ({ ...e, reason: undefined })) };
  return {
    ...raw,
    projects,
    licenseTexts: filterByLocale(raw.licenseTexts, locale),
    scenarioTexts: filterByLocale(raw.scenarioTexts, locale),
    ui,
  };
}
