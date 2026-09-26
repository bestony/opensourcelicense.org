// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import integrity from "./src/integrations/integrity.ts";
import { DEFAULT_LOCALE, LOCALES, LOCALE_META } from "./src/domain/locales.ts";

// https://astro.build/config
export default defineConfig({
  site: "https://opensourcelicense.org",
  output: "static",
  trailingSlash: "ignore",

  i18n: {
    defaultLocale: DEFAULT_LOCALE,
    locales: [...LOCALES],
    routing: { prefixDefaultLocale: false },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    integrity({ strictTbd: process.env.OSL_STRICT_TBD === "1" }),
    react(),
    sitemap({
      i18n: {
        defaultLocale: DEFAULT_LOCALE,
        locales: Object.fromEntries(LOCALES.map((l) => [l, LOCALE_META[l].tag])),
      },
    }),
  ],

  fonts: [
    {
      name: "VT323",
      cssVariable: "--font-vt323",
      provider: fontProviders.google(),
      weights: [400],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["Courier New", "monospace"],
    },
  ],
});
