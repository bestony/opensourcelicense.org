import { describe, expect, it } from "vitest";

const EXCLUDED_PAGE = /\/(search|r|chat|check|wizard|compare|404)\/?$/;
const sitemapFilter = (page: string) => !EXCLUDED_PAGE.test(new URL(page).pathname);

describe("sitemap filter", () => {
  it("filters out interactive/noindex tool pages", () => {
    const excluded = [
      "https://opensourcelicense.org/r",
      "https://opensourcelicense.org/r/",
      "https://opensourcelicense.org/zh-cn/r",
      "https://opensourcelicense.org/search",
      "https://opensourcelicense.org/ja/search",
      "https://opensourcelicense.org/chat",
      "https://opensourcelicense.org/fr/chat",
      "https://opensourcelicense.org/check",
      "https://opensourcelicense.org/wizard",
      "https://opensourcelicense.org/de/wizard",
      "https://opensourcelicense.org/compare",
      "https://opensourcelicense.org/zh-cn/compare",
      "https://opensourcelicense.org/404",
      "https://opensourcelicense.org/404/",
    ];
    for (const url of excluded) {
      expect(sitemapFilter(url), `expected ${url} to be filtered`).toBe(false);
    }
  });

  it("keeps locale prefixes and slugs starting with r or containing r", () => {
    const included = [
      "https://opensourcelicense.org/",
      "https://opensourcelicense.org/ru",
      "https://opensourcelicense.org/ro",
      "https://opensourcelicense.org/rm",
      "https://opensourcelicense.org/ru/licenses",
      "https://opensourcelicense.org/licenses/rsalv2",
      "https://opensourcelicense.org/ru/licenses/rsalv2",
      "https://opensourcelicense.org/projects/react",
      "https://opensourcelicense.org/ru/projects/react",
      "https://opensourcelicense.org/projects/redis",
      "https://opensourcelicense.org/compare/mit-vs-apache-2.0",
      "https://opensourcelicense.org/zh-cn/compare/mit-vs-apache-2.0",
      "https://opensourcelicense.org/scenarios/A1/mit",
      "https://opensourcelicense.org/ja/scenarios/A1/mit",
      "https://opensourcelicense.org/projects/trends",
    ];
    for (const url of included) {
      expect(sitemapFilter(url), `expected ${url} to be included`).toBe(true);
    }
  });
});
