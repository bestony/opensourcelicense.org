/** Locale registry. Codes are lowercase and match URL prefixes. */
export const DEFAULT_LOCALE = "en";

export const LOCALES = [
  "en",
  "zh-cn",
  "zh-tw",
  "ja",
  "ko",
  "es",
  "pt-br",
  "pt-pt",
  "fr",
  "de",
  "ru",
  "hi",
  "id",
  "pl",
  "vi",
  "fil",
  "it",
  "nl",
  "tr",
  "ur",
  "bn",
  "uk",
  "th",
  "ms",
  "ta",
  "sv",
  "ar",
  "ro",
  "zu",
  "xh",
  "af",
  "cs",
  "rm",
  "sw",
  "zgh",
  "he",
  "da",
  "fi",
  "nb",
  "el",
  "kk",
  "ga",
] as const;
export type Locale = (typeof LOCALES)[number];

export interface LocaleMeta {
  /** BCP 47 tag for <html lang> and hreflang */
  tag: string;
  /** Name in its own language */
  label: string;
  /** Name in English, used in translation prompts */
  english: string;
  dir: "ltr" | "rtl";
  /** Extra hreflang values that should also point to this locale (regional or legacy codes). */
  hreflangAliases?: readonly string[];
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { tag: "en", label: "English", english: "English", dir: "ltr" },
  "zh-cn": { tag: "zh-CN", label: "简体中文", english: "Simplified Chinese", dir: "ltr", hreflangAliases: ["zh-SG"] },
  "zh-tw": { tag: "zh-TW", label: "繁體中文", english: "Traditional Chinese", dir: "ltr", hreflangAliases: ["zh-HK", "zh-MO"] },
  ja: { tag: "ja", label: "日本語", english: "Japanese", dir: "ltr" },
  ko: { tag: "ko", label: "한국어", english: "Korean", dir: "ltr" },
  es: { tag: "es", label: "Español", english: "Spanish", dir: "ltr" },
  "pt-br": { tag: "pt-BR", label: "Português (Brasil)", english: "Brazilian Portuguese", dir: "ltr", hreflangAliases: ["pt"] },
  "pt-pt": { tag: "pt-PT", label: "Português (Portugal)", english: "European Portuguese", dir: "ltr" },
  fr: { tag: "fr", label: "Français", english: "French", dir: "ltr" },
  de: { tag: "de", label: "Deutsch", english: "German", dir: "ltr" },
  ru: { tag: "ru", label: "Русский", english: "Russian", dir: "ltr" },
  hi: { tag: "hi", label: "हिन्दी", english: "Hindi", dir: "ltr" },
  id: { tag: "id", label: "Bahasa Indonesia", english: "Indonesian", dir: "ltr" },
  pl: { tag: "pl", label: "Polski", english: "Polish", dir: "ltr" },
  vi: { tag: "vi", label: "Tiếng Việt", english: "Vietnamese", dir: "ltr" },
  fil: { tag: "fil", label: "Filipino", english: "Filipino", dir: "ltr", hreflangAliases: ["tl"] },
  it: { tag: "it", label: "Italiano", english: "Italian", dir: "ltr" },
  nl: { tag: "nl", label: "Nederlands", english: "Dutch", dir: "ltr" },
  tr: { tag: "tr", label: "Türkçe", english: "Turkish", dir: "ltr" },
  ur: { tag: "ur", label: "اردو", english: "Urdu", dir: "rtl" },
  bn: { tag: "bn", label: "বাংলা", english: "Bengali", dir: "ltr" },
  uk: { tag: "uk", label: "Українська", english: "Ukrainian", dir: "ltr" },
  th: { tag: "th", label: "ไทย", english: "Thai", dir: "ltr" },
  ms: { tag: "ms", label: "Bahasa Melayu", english: "Malay", dir: "ltr" },
  ta: { tag: "ta", label: "தமிழ்", english: "Tamil", dir: "ltr" },
  sv: { tag: "sv", label: "Svenska", english: "Swedish", dir: "ltr" },
  ar: { tag: "ar", label: "العربية", english: "Arabic", dir: "rtl" },
  ro: { tag: "ro", label: "Română", english: "Romanian", dir: "ltr" },
  zu: { tag: "zu", label: "isiZulu", english: "Zulu", dir: "ltr" },
  xh: { tag: "xh", label: "isiXhosa", english: "Xhosa", dir: "ltr" },
  af: { tag: "af", label: "Afrikaans", english: "Afrikaans", dir: "ltr" },
  cs: { tag: "cs", label: "Čeština", english: "Czech", dir: "ltr" },
  rm: { tag: "rm", label: "Rumantsch", english: "Romansh", dir: "ltr" },
  sw: { tag: "sw", label: "Kiswahili", english: "Swahili", dir: "ltr" },
  zgh: { tag: "zgh", label: "ⵜⴰⵎⴰⵣⵉⵖⵜ", english: "Standard Moroccan Tamazight (Tifinagh script)", dir: "ltr" },
  he: { tag: "he", label: "עברית", english: "Hebrew", dir: "rtl" },
  da: { tag: "da", label: "Dansk", english: "Danish", dir: "ltr" },
  fi: { tag: "fi", label: "Suomi", english: "Finnish", dir: "ltr" },
  nb: { tag: "nb", label: "Norsk bokmål", english: "Norwegian Bokmål", dir: "ltr", hreflangAliases: ["no"] },
  el: { tag: "el", label: "Ελληνικά", english: "Greek", dir: "ltr" },
  kk: { tag: "kk", label: "Қазақ тілі", english: "Kazakh", dir: "ltr" },
  ga: { tag: "ga", label: "Gaeilge", english: "Irish", dir: "ltr" },
};

/** Browser language codes that map to a supported locale under another code. */
const LANGUAGE_ALIASES: Record<string, Locale> = {
  no: "nb",
  nn: "nb",
  tl: "fil",
  iw: "he",
  in: "id",
  ber: "zgh",
  tzm: "zgh",
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
    if (lang === "pt" || lang.startsWith("pt-")) return /^pt-(pt|ao|mz|cv|gw|st|tl|mo)/.test(lang) ? "pt-pt" : "pt-br";
    const base = lang.split("-")[0];
    if (isLocale(base)) return base;
    if (LANGUAGE_ALIASES[base]) return LANGUAGE_ALIASES[base];
  }
  return undefined;
}
