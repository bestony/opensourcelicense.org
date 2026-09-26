import { describe, expect, it } from "vitest";
import { matchLocale } from "@/domain/locales";
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
    expect(stripLocale("/fil/licenses/mit")).toEqual({ locale: "fil", path: "/licenses/mit" });
    expect(stripLocale("/zgh")).toEqual({ locale: "zgh", path: "/" });
    expect(stripLocale("/licenses")).toEqual({ locale: "en", path: "/licenses" });
    expect(stripLocale("/xx/licenses")).toEqual({ locale: "en", path: "/xx/licenses" });
    expect(stripLocale("/xyz/licenses")).toEqual({ locale: "en", path: "/xyz/licenses" });
  });
});

describe("matchLocale", () => {
  it("maps browser languages to supported locales", () => {
    expect(matchLocale(["pt-PT"])).toBe("pt-pt");
    expect(matchLocale(["pt"])).toBe("pt-br");
    expect(matchLocale(["no"])).toBe("nb");
    expect(matchLocale(["nn-NO"])).toBe("nb");
    expect(matchLocale(["tl"])).toBe("fil");
    expect(matchLocale(["iw"])).toBe("he");
    expect(matchLocale(["zh-SG"])).toBe("zh-cn");
    expect(matchLocale(["de-AT"])).toBe("de");
    expect(matchLocale(["es-MX"])).toBe("es");
    expect(matchLocale(["fr-CA"])).toBe("fr");
    expect(matchLocale(["ar-EG"])).toBe("ar");
    expect(matchLocale(["xx"])).toBeUndefined();
  });
});
