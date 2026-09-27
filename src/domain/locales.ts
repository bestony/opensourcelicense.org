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
  /** Open Graph locale format: language_TERRITORY (e.g. en_US, zh_CN) */
  ogLocale: string;
  /** Name in its own language */
  label: string;
  /** Name in English, used in translation prompts */
  english: string;
  dir: "ltr" | "rtl";
  /** Extra hreflang values that should also point to this locale (regional or legacy codes). */
  hreflangAliases?: readonly string[];
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { tag: "en", ogLocale: "en_US", label: "English", english: "English", dir: "ltr" },
  "zh-cn": { tag: "zh-CN", ogLocale: "zh_CN", label: "简体中文", english: "Simplified Chinese", dir: "ltr", hreflangAliases: ["zh-SG"] },
  "zh-tw": { tag: "zh-TW", ogLocale: "zh_TW", label: "繁體中文", english: "Traditional Chinese", dir: "ltr", hreflangAliases: ["zh-HK", "zh-MO"] },
  ja: { tag: "ja", ogLocale: "ja_JP", label: "日本語", english: "Japanese", dir: "ltr" },
  ko: { tag: "ko", ogLocale: "ko_KR", label: "한국어", english: "Korean", dir: "ltr" },
  es: { tag: "es", ogLocale: "es_ES", label: "Español", english: "Spanish", dir: "ltr" },
  "pt-br": { tag: "pt-BR", ogLocale: "pt_BR", label: "Português (Brasil)", english: "Brazilian Portuguese", dir: "ltr", hreflangAliases: ["pt"] },
  "pt-pt": { tag: "pt-PT", ogLocale: "pt_PT", label: "Português (Portugal)", english: "European Portuguese", dir: "ltr" },
  fr: { tag: "fr", ogLocale: "fr_FR", label: "Français", english: "French", dir: "ltr" },
  de: { tag: "de", ogLocale: "de_DE", label: "Deutsch", english: "German", dir: "ltr" },
  ru: { tag: "ru", ogLocale: "ru_RU", label: "Русский", english: "Russian", dir: "ltr" },
  hi: { tag: "hi", ogLocale: "hi_IN", label: "हिन्दी", english: "Hindi", dir: "ltr" },
  id: { tag: "id", ogLocale: "id_ID", label: "Bahasa Indonesia", english: "Indonesian", dir: "ltr" },
  pl: { tag: "pl", ogLocale: "pl_PL", label: "Polski", english: "Polish", dir: "ltr" },
  vi: { tag: "vi", ogLocale: "vi_VN", label: "Tiếng Việt", english: "Vietnamese", dir: "ltr" },
  fil: { tag: "fil", ogLocale: "fil_PH", label: "Filipino", english: "Filipino", dir: "ltr", hreflangAliases: ["tl"] },
  it: { tag: "it", ogLocale: "it_IT", label: "Italiano", english: "Italian", dir: "ltr" },
  nl: { tag: "nl", ogLocale: "nl_NL", label: "Nederlands", english: "Dutch", dir: "ltr" },
  tr: { tag: "tr", ogLocale: "tr_TR", label: "Türkçe", english: "Turkish", dir: "ltr" },
  ur: { tag: "ur", ogLocale: "ur_PK", label: "اردو", english: "Urdu", dir: "rtl" },
  bn: { tag: "bn", ogLocale: "bn_BD", label: "বাংলা", english: "Bengali", dir: "ltr" },
  uk: { tag: "uk", ogLocale: "uk_UA", label: "Українська", english: "Ukrainian", dir: "ltr" },
  th: { tag: "th", ogLocale: "th_TH", label: "ไทย", english: "Thai", dir: "ltr" },
  ms: { tag: "ms", ogLocale: "ms_MY", label: "Bahasa Melayu", english: "Malay", dir: "ltr" },
  ta: { tag: "ta", ogLocale: "ta_IN", label: "தமிழ்", english: "Tamil", dir: "ltr" },
  sv: { tag: "sv", ogLocale: "sv_SE", label: "Svenska", english: "Swedish", dir: "ltr" },
  ar: { tag: "ar", ogLocale: "ar_AR", label: "العربية", english: "Arabic", dir: "rtl" },
  ro: { tag: "ro", ogLocale: "ro_RO", label: "Română", english: "Romanian", dir: "ltr" },
  zu: { tag: "zu", ogLocale: "zu_ZA", label: "isiZulu", english: "Zulu", dir: "ltr" },
  xh: { tag: "xh", ogLocale: "xh_ZA", label: "isiXhosa", english: "Xhosa", dir: "ltr" },
  af: { tag: "af", ogLocale: "af_ZA", label: "Afrikaans", english: "Afrikaans", dir: "ltr" },
  cs: { tag: "cs", ogLocale: "cs_CZ", label: "Čeština", english: "Czech", dir: "ltr" },
  rm: { tag: "rm", ogLocale: "rm_CH", label: "Rumantsch", english: "Romansh", dir: "ltr" },
  sw: { tag: "sw", ogLocale: "sw_KE", label: "Kiswahili", english: "Swahili", dir: "ltr" },
  zgh: { tag: "zgh", ogLocale: "zgh_MA", label: "ⵜⴰⵎⴰⵣⵉⵖⵜ", english: "Standard Moroccan Tamazight (Tifinagh script)", dir: "ltr" },
  he: { tag: "he", ogLocale: "he_IL", label: "עברית", english: "Hebrew", dir: "rtl" },
  da: { tag: "da", ogLocale: "da_DK", label: "Dansk", english: "Danish", dir: "ltr" },
  fi: { tag: "fi", ogLocale: "fi_FI", label: "Suomi", english: "Finnish", dir: "ltr" },
  nb: { tag: "nb", ogLocale: "nb_NO", label: "Norsk bokmål", english: "Norwegian Bokmål", dir: "ltr", hreflangAliases: ["no"] },
  el: { tag: "el", ogLocale: "el_GR", label: "Ελληνικά", english: "Greek", dir: "ltr" },
  kk: { tag: "kk", ogLocale: "kk_KZ", label: "Қазақ тілі", english: "Kazakh", dir: "ltr" },
  ga: { tag: "ga", ogLocale: "ga_IE", label: "Gaeilge", english: "Irish", dir: "ltr" },
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
