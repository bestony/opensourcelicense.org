import { describe, expect, it, vi } from "vitest";
import { createTracker, GA_MEASUREMENT_ID, MAX_PARAM_LENGTH, sanitizeParams, stripUrl, track } from "@/lib/analytics";
import { createLogger } from "@/lib/log";

const silent = createLogger("test", () => {});

describe("analytics", () => {
  it("has a GA4 measurement id", () => {
    expect(GA_MEASUREMENT_ID).toMatch(/^G-[A-Z0-9]+$/);
  });

  it("sends the event with the page locale", () => {
    const gtag = vi.fn();
    const t = createTracker({ sink: () => gtag, locale: () => "zh-CN", log: silent });
    t("license_copy", { license: "mit", kind: "badge" });
    expect(gtag).toHaveBeenCalledWith("event", "license_copy", { license: "mit", kind: "badge", page_locale: "zh-CN" });
  });

  it("is a no-op when gtag is not loaded", () => {
    const t = createTracker({ sink: () => undefined, locale: () => "en", log: silent });
    expect(() => t("chat_stop", {})).not.toThrow();
  });

  it("never throws when gtag throws", () => {
    const lines: string[] = [];
    const t = createTracker({
      sink: () => () => {
        throw new Error("boom");
      },
      locale: () => undefined,
      log: createLogger("test", (l) => lines.push(l)),
    });
    expect(() => t("compare_reset", { count: 2 })).not.toThrow();
    expect(lines.some((l) => l.includes("event failed"))).toBe(true);
  });

  it("default tracker is safe without a window", () => {
    expect(() => track("search", { search_term: "mit" })).not.toThrow();
  });

  it("sanitizes params", () => {
    expect(
      sanitizeParams({ a: undefined, b: null, c: "", d: 0, e: false, f: "x".repeat(300), g: Number.NaN, h: 1.5 }),
    ).toEqual({ d: 0, e: false, f: "x".repeat(MAX_PARAM_LENGTH), h: 1.5 });
  });

  it("strips query and fragment from urls", () => {
    expect(stripUrl("https://github.com/o/r/issues/new?title=secret#x")).toBe("https://github.com/o/r/issues/new");
    expect(stripUrl("not a url?q=1")).toBe("not a url");
  });
});
