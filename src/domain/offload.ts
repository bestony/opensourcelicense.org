/**
 * Pages offloaded to R2. The per-item detail pages (projects and scenario × license cells)
 * of every locale except the default one are built with the rest of the site, moved out of
 * dist after the build, uploaded to R2 and served by the Worker. This keeps dist under the
 * Cloudflare Workers free-plan limit of 20,000 static assets while every locale keeps the
 * full set of pages. Shared by the build scripts and the Worker: keep it free of Node APIs.
 */
import { DEFAULT_LOCALE, isLocale } from "./locales";

/** Default R2 bucket name; must match r2_buckets in wrangler.jsonc. */
export const OFFLOAD_BUCKET = "opensourcelicense-pages";
/** Key prefix of offloaded pages in the bucket. */
export const OFFLOAD_PREFIX = "pages/";
/** Key of the manifest that maps each page key to its content hash. */
export const OFFLOAD_MANIFEST_KEY = `${OFFLOAD_PREFIX}_manifest.json`;

const DETAIL = /^\/([a-z]{2,3}(?:-[a-z]{2})?)(\/projects\/[^/]+|\/scenarios\/[^/]+\/[^/]+)\/?$/;

/** True when the page at `pathname` (with locale prefix) is served from R2. */
export function isOffloadedPath(pathname: string): boolean {
  const m = pathname.match(DETAIL);
  if (!m || !isLocale(m[1]) || m[1] === DEFAULT_LOCALE) return false;
  return m[2] !== "/projects/trends";
}

/** R2 key of an offloaded page: "/de/projects/redis" -> "pages/de/projects/redis/index.html". */
export function offloadKey(pathname: string): string {
  return `${OFFLOAD_PREFIX}${pathname.replace(/^\/+|\/+$/g, "")}/index.html`;
}

/** Page pathname of a file path relative to dist: "de/projects/redis/index.html" -> "/de/projects/redis". */
export function pathnameOfBuiltFile(relative: string): string | undefined {
  const m = relative.replaceAll("\\", "/").match(/^(.*)\/index\.html$/);
  return m ? `/${m[1]}` : undefined;
}
