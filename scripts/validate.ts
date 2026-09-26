/**
 * Standalone data integrity check: `pnpm validate [--strict]`.
 * --strict turns "tbd" cells into errors (release gate).
 */
import { buildCatalog } from "../src/domain/catalog";
import { summarize, validateCatalog } from "../src/domain/integrity";
import { DEFAULT_LOCALE, LOCALES } from "../src/domain/locales";
import { loadRawData } from "../src/lib/load-data";
import { createLogger } from "../src/lib/log";

const log = createLogger("validate");
const strictTbd = process.argv.includes("--strict");

try {
  const catalog = buildCatalog(loadRawData());
  log.info("catalog loaded", {
    licenses: catalog.licenses.size,
    scenarios: catalog.scenarios.size,
    cells: catalog.cells.size,
    projects: catalog.projects.size,
  });
  const issues = validateCatalog(catalog, { locales: LOCALES, defaultLocale: DEFAULT_LOCALE, strictTbd });
  for (const i of issues) (i.level === "error" ? log.error : log.warn)(i.message, { code: i.code, path: i.path });
  const s = summarize(issues);
  log.info("integrity summary", s);
  process.exit(s.errors ? 1 : 0);
} catch (err) {
  log.error("failed to load data", { err });
  process.exit(1);
}
