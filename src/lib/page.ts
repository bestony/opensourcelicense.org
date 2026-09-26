/** Helpers shared by every page under src/pages/[...lang]/. */
import type { Catalog } from "@/domain/catalog";
import { LOCALE_META } from "@/domain/locales";
import { getCatalog } from "@/lib/data";
import { createTranslator, langParam, LOCALES, localizedPath, type Locale, type Translator } from "@/lib/i18n";

export const REPO_URL = "https://github.com/bestony/opensourcelicense.org";

export interface PageContext {
  locale: Locale;
  cat: Catalog;
  t: Translator;
  href: (path: string) => string;
  dir: "ltr" | "rtl";
  tag: string;
  fmtDate: (iso: string) => string;
}

export function localeStaticPaths() {
  return LOCALES.map((locale) => ({ params: { lang: langParam(locale) }, props: { locale } }));
}

/** Cartesian product of locales with other route params. */
export function localizedStaticPaths<P extends Record<string, string>, X extends object>(
  items: { params: P; props?: X }[],
) {
  return LOCALES.flatMap((locale) =>
    items.map((it) => ({ params: { ...it.params, lang: langParam(locale) }, props: { ...(it.props ?? ({} as X)), locale } })),
  );
}

export function pageContext(locale: Locale): PageContext {
  const cat = getCatalog();
  const meta = LOCALE_META[locale];
  const dtf = new Intl.DateTimeFormat(meta.tag, { year: "numeric", month: "short", day: "numeric" });
  return {
    locale,
    cat,
    t: createTranslator(cat.raw.ui, locale),
    href: (p) => localizedPath(locale, p),
    dir: meta.dir,
    tag: meta.tag,
    fmtDate: (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : dtf.format(d);
    },
  };
}

export function issueUrl(title: string, body: string): string {
  const q = new URLSearchParams({ title, body, labels: "data-error" });
  return `${REPO_URL}/issues/new?${q.toString()}`;
}
