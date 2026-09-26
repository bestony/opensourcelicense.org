/**
 * Product analytics (Google Analytics 4 via gtag.js).
 *
 * `AnalyticsEvents` is the single catalog of custom events. Add new events here
 * so names and parameters stay consistent across islands and page scripts.
 *
 * Rules:
 * - `track` never throws and is a no-op when gtag is not loaded (dev, SSR, ad blockers).
 * - Never send free text the user typed into chat or the dependency checker.
 */
import { createLogger, type Logger } from "./log";

export const GA_MEASUREMENT_ID: string = import.meta.env?.PUBLIC_GA_ID || "G-W76ND4BSLR";

/** GA4 limit for custom parameter values. */
export const MAX_PARAM_LENGTH = 100;

export type AnalyticsEvents = {
  wizard_step: { step: number; field: string };
  wizard_complete: { target: "report" | "chat" };
  wizard_restart: { step: number };
  report_view: { license: string; candidates: number };
  report_share_copy: { license?: string };
  license_copy: { license: string; kind: "text" | "spdx_header" | "badge" };
  license_download: { license: string };
  compare_add: { license: string; count: number };
  compare_remove: { license: string; count: number };
  compare_reset: { count: number };
  chat_send: { source: "input" | "example" | "option"; turn: number };
  chat_stop: {};
  chat_error: { code: string };
  chat_report_open: { placement: "thread" | "sidebar" };
  deps_check_run: {
    project: string;
    format: string;
    online: boolean;
    deps: number;
    compatible: number;
    conditional: number;
    incompatible: number;
    unknown: number;
  };
  deps_check_empty: { online: boolean };
  deps_check_sample: {};
  search: { search_term: string };
  license_filter: { family: string };
  scenario_highlight: { license: string };
  project_filter: { field: string; value: string };
  language_switch: { from: string; to: string; via: "header" | "suggest" };
  language_suggest_dismiss: { suggested: string };
  outbound_click: { link_url: string; link_domain: string };
};

export type EventName = keyof AnalyticsEvents;
export type ParamValue = string | number | boolean;
export type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/** Removes query string and fragment, which can carry personal data. */
export function stripUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return raw.split(/[?#]/)[0];
  }
}

/** Drops empty values and caps string length. */
export function sanitizeParams(params: Record<string, unknown>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "number") {
      if (Number.isFinite(v)) out[k] = v;
    } else if (typeof v === "boolean") out[k] = v;
    else out[k] = String(v).slice(0, MAX_PARAM_LENGTH);
  }
  return out;
}

export interface TrackerOptions {
  /** Resolves the gtag function at call time (it loads async). */
  sink: () => Gtag | undefined;
  /** Locale of the current page, attached to every event. */
  locale: () => string | undefined;
  log?: Logger;
}

export type Track = <K extends EventName>(name: K, params: AnalyticsEvents[K]) => void;

export function createTracker({ sink, locale, log = createLogger("analytics") }: TrackerOptions): Track {
  return (name, params) => {
    try {
      const payload = sanitizeParams({ ...params, page_locale: locale() });
      const gtag = sink();
      if (!gtag) {
        log.debug("event skipped: gtag not loaded", { event: name, params: payload });
        return;
      }
      gtag("event", name, payload);
      log.debug("event", { event: name, params: payload });
    } catch (err) {
      log.warn("event failed", { event: name, err });
    }
  };
}

const hasWindow = () => typeof window !== "undefined";

export const track: Track = createTracker({
  sink: () => (hasWindow() && typeof window.gtag === "function" ? window.gtag : undefined),
  locale: () => (typeof document !== "undefined" ? document.documentElement.lang || undefined : undefined),
});
