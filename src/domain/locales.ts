/** Locale registry. Codes are lowercase and match URL prefixes. */
export const DEFAULT_LOCALE = "en";

export const LOCALES = ["en", "zh-cn", "zh-tw", "ja", "ko", "es", "pt-br", "fr", "de", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export interface LocaleMeta {
  /** BCP 47 tag for <html lang> and hreflang */
  tag: string;
  /** Name in its own language */
  label: string;
  dir: "ltr" | "rtl";
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { tag: "en", label: "English", dir: "ltr" },
  "zh-cn": { tag: "zh-CN", label: "简体中文", dir: "ltr" },
  "zh-tw": { tag: "zh-TW", label: "繁體中文", dir: "ltr" },
  ja: { tag: "ja", label: "日本語", dir: "ltr" },
  ko: { tag: "ko", label: "한국어", dir: "ltr" },
  es: { tag: "es", label: "Español", dir: "ltr" },
  "pt-br": { tag: "pt-BR", label: "Português (Brasil)", dir: "ltr" },
  fr: { tag: "fr", label: "Français", dir: "ltr" },
  de: { tag: "de", label: "Deutsch", dir: "ltr" },
  ru: { tag: "ru", label: "Русский", dir: "ltr" },
};

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** Best supported locale for a browser language list, or undefined. */
export function matchLocale(languages: readonly string[]): Locale | undefined {
  for (const raw of languages) {
    const lang = raw.toLowerCase();
    if (isLocale(lang)) return lang;
    if (lang.startsWith("zh")) return /tw|hk|mo|hant/.test(lang) ? "zh-tw" : "zh-cn";
    if (lang.startsWith("pt")) return "pt-br";
    const base = lang.split("-")[0];
    if (isLocale(base)) return base;
  }
  return undefined;
}
