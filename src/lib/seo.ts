/**
 * SEO helpers for sitemap generation, chunking, and noindex filtering.
 */
import { buildCatalog, cellKey, type Catalog, type RawData } from "@/domain/catalog";
import { parsePairKey } from "@/domain/compare";
import { DEFAULT_LOCALE, LOCALES, NOINDEX_LOCALES, type Locale } from "@/domain/locales";
import { cellNote, licenseText, scenarioText, stripLocale } from "@/lib/i18n";
import { loadRawData } from "@/lib/load-data";

export { NOINDEX_LOCALES };

const EXCLUDED_PAGE = /\/(search|r|chat|check|wizard|compare|404)\/?$/;

export type SitemapPageType = "licenses" | "projects" | "scenarios" | "compare" | "pages";

let cachedRaw: RawData | undefined;
let cachedCatalog: Catalog | undefined;

function getContext(): { raw: RawData; cat: Catalog } {
  if (!cachedRaw || !cachedCatalog) {
    cachedRaw = loadRawData();
    cachedCatalog = buildCatalog(cachedRaw);
  }
  return { raw: cachedRaw, cat: cachedCatalog };
}

/** Check if a pair of licenses both use fallbacks in a non-default locale */
function isCompareFallback(raw: RawData, locale: Locale, pairSlug: string): boolean {
  if (locale === DEFAULT_LOCALE) return false;
  const parts = parsePairKey(pairSlug);
  if (!parts) return true;
  const [a, b] = parts;
  const textA = licenseText(raw, locale, a);
  const textB = licenseText(raw, locale, b);
  return (textA?.fallback ?? true) && (textB?.fallback ?? true);
}

/**
 * Returns true if a given URL or pathname should be excluded from search indexes and sitemaps.
 */
export function isPageNoindex(urlOrPath: string): boolean {
  let pathname = urlOrPath;
  if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
    pathname = new URL(pathname).pathname;
  }
  // Interactive tool and error pages
  if (EXCLUDED_PAGE.test(pathname)) return true;

  const { locale, path } = stripLocale(pathname);

  // Locales with low/no search demand
  if (NOINDEX_LOCALES.has(locale)) return true;

  // Non-English project detail pages (untranslated timeline reasons)
  if (path.startsWith("/projects/") && path !== "/projects/trends") {
    if (locale !== DEFAULT_LOCALE) return true;
  }

  const { raw, cat } = getContext();

  // Scenario cell pages: /scenarios/:id/:slug
  const scenCellMatch = path.match(/^\/scenarios\/([A-Z0-9]+)\/([a-z0-9.-]+)$/);
  if (scenCellMatch) {
    const [, id, slug] = scenCellMatch;
    const sText = scenarioText(raw, locale, id);
    if (sText?.fallback) return true;
    const cell = cat.cells.get(cellKey(id, slug));
    const note = cellNote(raw, locale, id, slug);
    // Silent verdict with no specific notes
    if (cell && cell.verdict === "silent" && !note) return true;
  }

  // License pages fallback
  const licMatch = path.match(/^\/licenses\/([a-z0-9.-]+)$/);
  if (licMatch) {
    const text = licenseText(raw, locale, licMatch[1]);
    if (text?.fallback) return true;
  }

  // Compare pages fallback
  const compareMatch = path.match(/^\/compare\/([a-z0-9.-]+)$/);
  if (compareMatch) {
    if (isCompareFallback(raw, locale, compareMatch[1])) return true;
  }

  return false;
}

export function getPageType(pathname: string): SitemapPageType {
  const { path } = stripLocale(pathname);
  if (path === "/" || path === "") return "pages";
  if (path.startsWith("/licenses")) return "licenses";
  if (path.startsWith("/projects")) return "projects";
  if (path.startsWith("/scenarios")) return "scenarios";
  if (path.startsWith("/compare")) return "compare";
  return "pages";
}

const chunkCache = new Map<string, string | null>();

/**
 * Returns chunk name like "en-licenses", "zh-cn-scenarios", or undefined if noindex.
 */
export function getChunkName(urlOrPath: string): string | undefined {
  const cached = chunkCache.get(urlOrPath);
  if (cached !== undefined) return cached === null ? undefined : cached;

  if (isPageNoindex(urlOrPath)) {
    chunkCache.set(urlOrPath, null);
    return undefined;
  }

  let pathname = urlOrPath;
  if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
    pathname = new URL(pathname).pathname;
  }

  const { locale } = stripLocale(pathname);
  if (NOINDEX_LOCALES.has(locale)) {
    chunkCache.set(urlOrPath, null);
    return undefined;
  }

  const type = getPageType(pathname);
  if (type === "projects" && locale !== DEFAULT_LOCALE) {
    chunkCache.set(urlOrPath, null);
    return undefined;
  }

  const chunkName = `${locale}-${type}`;
  chunkCache.set(urlOrPath, chunkName);
  return chunkName;
}

/**
 * Builds the chunks configuration for @astrojs/sitemap.
 */
export function buildSitemapChunks(): Record<string, (item: { url: string }) => { url: string } | undefined> {
  const chunks: Record<string, (item: { url: string }) => { url: string } | undefined> = {};
  const indexedLocales = LOCALES.filter((l) => !NOINDEX_LOCALES.has(l));

  for (const loc of indexedLocales) {
    for (const type of ["licenses", "scenarios", "compare", "pages"] as const) {
      const chunkName = `${loc}-${type}`;
      chunks[chunkName] = (item) => (getChunkName(item.url) === chunkName ? item : undefined);
    }
    if (loc === DEFAULT_LOCALE) {
      chunks["en-projects"] = (item) => (getChunkName(item.url) === "en-projects" ? item : undefined);
    }
  }

  return chunks;
}
