/**
 * Astro-side data access. Loads data/ once per build (every request in dev,
 * so edits show up without a restart) and returns the indexed catalog.
 */
import { buildCatalog, type Catalog } from "@/domain/catalog";
import { loadRawData } from "@/lib/load-data";
import { createLogger } from "@/lib/log";

const log = createLogger("data");
let cached: Catalog | undefined;

export function getCatalog(): Catalog {
  if (cached && !import.meta.env.DEV) return cached;
  const started = Date.now();
  cached = buildCatalog(loadRawData());
  log.debug("catalog built", {
    ms: Date.now() - started,
    licenses: cached.licenses.size,
    scenarios: cached.scenarios.size,
    projects: cached.projects.size,
  });
  return cached;
}
