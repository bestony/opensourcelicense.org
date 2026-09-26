import { describe, expect, it } from "vitest";
import { buildCatalog } from "@/domain/catalog";
import { type IntegrityOptions, validateCatalog } from "@/domain/integrity";
import { DEFAULT_LOCALE, LOCALES } from "@/domain/locales";
import { realRaw } from "./helpers";

const opts: IntegrityOptions = { locales: LOCALES, defaultLocale: DEFAULT_LOCALE };
const errors = (raw = realRaw(), o: IntegrityOptions = opts) => validateCatalog(buildCatalog(raw), o).filter((i) => i.level === "error");

describe("integrity", () => {
  it("real data has no errors", () => {
    expect(errors()).toEqual([]);
  });

  it("detects a missing cell", () => {
    const raw = realRaw();
    delete raw.scenarios.A1.cells["agpl-3.0"];
    expect(errors(raw).map((e) => e.code)).toContain("scenario.missing-cell");
  });

  it("detects an extra cell and an unknown license column", () => {
    const raw = realRaw();
    raw.scenarios.E1.cells["gpl-3.0"] = { verdict: "allow" };
    raw.matrices[0].columns.push("wtfpl");
    const codes = errors(raw).map((e) => e.code);
    expect(codes).toContain("scenario.extra-cell");
    expect(codes).toContain("matrix.unknown-license");
  });

  it("detects dangling project references", () => {
    const raw = realRaw();
    raw.scenarios.A1.cells.mit.caseRef = "no-such-project";
    expect(errors(raw).map((e) => e.code)).toContain("scenario.unknown-case");
  });

  it("strict mode turns tbd into an error", () => {
    const raw = realRaw();
    raw.scenarios.A1.cells.mit.verdict = "tbd";
    expect(errors(raw, { ...opts, strictTbd: true }).map((e) => e.code)).toContain("scenario.tbd");
  });

  it("missing default-locale text is an error", () => {
    const raw = realRaw();
    delete raw.licenseTexts["en/mit"];
    expect(errors(raw).map((e) => e.code)).toContain("i18n.missing");
  });
});
