/**
 * i18n helpers: URL building, UI strings and localized data text with
 * English fallback. Pure functions over the catalog, safe in islands too.
 */
import type { RawData } from "@/domain/catalog";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/domain/locales";
import type { LicenseText, ScenarioText } from "@/domain/schema";

export { DEFAULT_LOCALE, LOCALES, type Locale };

/** "/licenses/mit" -> "/zh-cn/licenses/mit" (default locale has no prefix). */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}/` : `/${locale}${clean}`;
}

/** Strip a locale prefix from a pathname. */
export function stripLocale(pathname: string): { locale: Locale; path: string } {
  const m = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(\/.*|$)/);
  if (m && (LOCALES as readonly string[]).includes(m[1]) && m[1] !== DEFAULT_LOCALE)
    return { locale: m[1] as Locale, path: m[2] || "/" };
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/** Static paths param for `[...lang]` routes. */
export function langParam(locale: Locale): string | undefined {
  return locale === DEFAULT_LOCALE ? undefined : locale;
}

export function localeFromParam(param: string | undefined): Locale {
  return (param ?? DEFAULT_LOCALE) as Locale;
}

export interface Localized<T> {
  value: T;
  /** locale the value actually came from */
  from: Locale;
  fallback: boolean;
  reviewed: boolean;
  /** translation made from an older English source */
  stale: boolean;
}

function pick<T extends { reviewed: boolean; stale?: boolean }>(table: Record<string, T>, locale: Locale, key: string): Localized<T> | undefined {
  const own = table[`${locale}/${key}`];
  if (own) return { value: own, from: locale, fallback: false, reviewed: own.reviewed, stale: !!own.stale };
  const def = table[`${DEFAULT_LOCALE}/${key}`];
  if (def) return { value: def, from: DEFAULT_LOCALE, fallback: locale !== DEFAULT_LOCALE, reviewed: def.reviewed, stale: false };
  return undefined;
}

export function licenseText(raw: RawData, locale: Locale, slug: string): Localized<LicenseText> | undefined {
  return pick(raw.licenseTexts, locale, slug);
}

export function scenarioText(raw: RawData, locale: Locale, id: string): Localized<ScenarioText> | undefined {
  return pick(raw.scenarioTexts, locale, id);
}

/** Localized one-line note for a cell, falling back to English. */
export function cellNote(raw: RawData, locale: Locale, scenarioId: string, license: string): string | undefined {
  return raw.scenarioTexts[`${locale}/${scenarioId}`]?.cells[license] ?? raw.scenarioTexts[`${DEFAULT_LOCALE}/${scenarioId}`]?.cells[license];
}

export type Translator = (key: string, params?: Record<string, string | number>) => string;

/** Builds `t()` for a locale with fallback to English, then to the key itself. */
export function createTranslator(ui: RawData["ui"], locale: Locale): Translator {
  const own = ui[locale]?.strings ?? {};
  const def = ui[DEFAULT_LOCALE]?.strings ?? {};
  return (key, params) => {
    let s = own[key] ?? def[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** Only the UI strings a locale needs, merged with fallback (for islands). */
export function uiStrings(ui: RawData["ui"], locale: Locale): Record<string, string> {
  return { ...(ui[DEFAULT_LOCALE]?.strings ?? {}), ...(ui[locale]?.strings ?? {}) };
}
