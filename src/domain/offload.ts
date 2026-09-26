/**
 * Pages offloaded to R2. The per-item detail pages (projects and scenario × license cells)
 * of every locale except the default one are built with the rest of the site, then packed
 * after the build: one pack per locale holds every page gzip-compressed back to back, and an
 * index maps each page path to its byte range. The Worker reads one range per page. This keeps
 * dist under the Cloudflare Workers free-plan limit of 20,000 static assets, and one deploy
 * writes about 80 R2 objects instead of 50,000.
 *
 * Packs are immutable and stored per content version (`packs/<version>/`). The deploy passes
 * the version to the Worker as PAGES_VERSION, so pages switch together with the Worker.
 * Shared by the build scripts and the Worker: keep it free of Node APIs.
 */
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

/** Default R2 bucket name; must match r2_buckets in wrangler.jsonc. */
export const OFFLOAD_BUCKET = "opensourcelicense-pages";
/** Key prefix of all pack generations in the bucket. */
export const PACK_PREFIX = "packs/";
/** Key of the list of uploaded generations (newest first), used to delete old ones. */
export const GENERATIONS_KEY = `${PACK_PREFIX}generations.json`;

/** Page path -> [byte offset, byte length (gzip), ETag of the uncompressed page]. */
export type PackEntry = [offset: number, length: number, etag: string];

export interface PackIndex {
  version: 1;
  pages: Record<string, PackEntry>;
}

const DETAIL = /^\/([a-z]{2,3}(?:-[a-z]{2})?)(\/projects\/[^/]+|\/scenarios\/[^/]+\/[^/]+)\/?$/;

/** Locale of an offloaded page, or undefined when the page at `pathname` is a static asset. */
export function offloadedLocale(pathname: string): Locale | undefined {
  const m = pathname.match(DETAIL);
  if (!m || !isLocale(m[1]) || m[1] === DEFAULT_LOCALE || m[2] === "/projects/trends") return undefined;
  return m[1];
}

/** True when the page at `pathname` (with locale prefix) is served from R2. */
export function isOffloadedPath(pathname: string): boolean {
  return offloadedLocale(pathname) !== undefined;
}

/** Canonical index key of a page: no trailing slash. */
export function pageKey(pathname: string): string {
  return pathname.replace(/\/+$/, "");
}

export function packKey(version: string, locale: string): string {
  return `${PACK_PREFIX}${version}/${locale}.pack`;
}

export function indexKey(version: string, locale: string): string {
  return `${PACK_PREFIX}${version}/${locale}.json`;
}

/** Marker written last: a generation is complete only when this object exists. */
export function completeKey(version: string): string {
  return `${PACK_PREFIX}${version}/_complete`;
}

/** Page pathname of a file path relative to dist: "de/projects/redis/index.html" -> "/de/projects/redis". */
export function pathnameOfBuiltFile(relative: string): string | undefined {
  const m = relative.replaceAll("\\", "/").match(/^(.*)\/index\.html$/);
  return m ? `/${m[1]}` : undefined;
}
