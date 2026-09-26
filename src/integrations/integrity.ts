/**
 * Astro integration: runs the data integrity check before every build and
 * fails the build on errors.
 */
import type { AstroIntegration } from "astro";
import { buildCatalog } from "../domain/catalog";
import { summarize, validateCatalog } from "../domain/integrity";
import { DEFAULT_LOCALE, LOCALES } from "../domain/locales";
import { loadRawData } from "../lib/load-data";

export default function integrity(options: { strictTbd?: boolean } = {}): AstroIntegration {
  return {
    name: "osl:integrity",
    hooks: {
      "astro:build:start": ({ logger }) => {
        const catalog = buildCatalog(loadRawData());
        const issues = validateCatalog(catalog, {
          locales: LOCALES,
          defaultLocale: DEFAULT_LOCALE,
          strictTbd: options.strictTbd,
        });
        for (const i of issues) {
          const line = `[${i.code}] ${i.path}: ${i.message}`;
          if (i.level === "error") logger.error(line);
          else logger.warn(line);
        }
        const s = summarize(issues);
        logger.info(
          `catalog: ${catalog.licenses.size} licenses, ${catalog.scenarios.size} scenarios, ${catalog.cells.size} cells, ${catalog.projects.size} projects; ${s.errors} error(s), ${s.warnings} warning(s)`,
        );
        if (s.errors) throw new Error(`Data integrity check failed with ${s.errors} error(s). Run "pnpm validate" for details.`);
      },
    },
  };
}
