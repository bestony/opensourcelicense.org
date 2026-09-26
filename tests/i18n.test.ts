import { describe, expect, it } from "vitest";
import { localizedPath, stripLocale } from "@/lib/i18n";

describe("i18n paths", () => {
  it("builds localized paths without trailing slashes", () => {
    expect(localizedPath("en", "/")).toBe("/");
    expect(localizedPath("ja", "/")).toBe("/ja");
    expect(localizedPath("ja", "/licenses/mit/")).toBe("/ja/licenses/mit");
    expect(localizedPath("en", "licenses")).toBe("/licenses");
  });
  it("strips locale prefixes", () => {
    expect(stripLocale("/ja")).toEqual({ locale: "ja", path: "/" });
    expect(stripLocale("/pt-br/projects/redis")).toEqual({ locale: "pt-br", path: "/projects/redis" });
    expect(stripLocale("/licenses")).toEqual({ locale: "en", path: "/licenses" });
    expect(stripLocale("/xx/licenses")).toEqual({ locale: "en", path: "/xx/licenses" });
  });
});
