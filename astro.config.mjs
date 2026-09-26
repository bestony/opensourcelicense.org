// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
import integrity from "./src/integrations/integrity.ts";
import { DEFAULT_LOCALE, LOCALES } from "./src/domain/locales.ts";

// https://astro.build/config
export default defineConfig({
  site: "https://opensourcelicense.org",
  output: "static",
  trailingSlash: "never",

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
    icon(),
    // hreflang alternates live in each page's <head> (src/layouts/main.astro). Repeating
    // 42+ alternates per URL here made one sitemap file about 200 MB, over the 25 MiB
    // Workers asset limit and Google's 50 MB sitemap limit.
    sitemap({ entryLimit: 10000 }),
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
