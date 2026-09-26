import { describe, expect, it } from "vitest";
import { detectFormat, parseManifest } from "@/domain/deps";

describe("dependency parsers", () => {
  it("parses package-lock.json with licenses", () => {
    const lock = JSON.stringify({ lockfileVersion: 3, packages: { "": { name: "app" }, "node_modules/react": { version: "19.0.0", license: "MIT" }, "node_modules/a/node_modules/@x/y": { version: "1.0.0", license: "GPL-3.0-only" } } });
    expect(parseManifest(lock)).toEqual({
      format: "package-lock.json",
      deps: [
        { system: "npm", name: "react", version: "19.0.0", license: "MIT" },
        { system: "npm", name: "@x/y", version: "1.0.0", license: "GPL-3.0-only" },
      ],
    });
  });

  it("parses package.json ranges (exact versions only)", () => {
    const r = parseManifest(JSON.stringify({ name: "x", dependencies: { a: "^1.2.3", b: "1.0.0" }, devDependencies: { c: "=2.0.0" } }));
    expect(r?.deps).toEqual([
      { system: "npm", name: "a", version: undefined },
      { system: "npm", name: "b", version: "1.0.0" },
      { system: "npm", name: "c", version: "2.0.0" },
    ]);
  });

  it("parses go.mod blocks and single requires", () => {
    const r = parseManifest("module example.com/x\n\ngo 1.22\n\nrequire (\n\tgithub.com/a/b v1.2.3 // indirect\n\tgolang.org/x/text v0.14.0\n)\nrequire github.com/c/d v0.1.0\n");
    expect(r?.format).toBe("go.mod");
    expect(r?.deps.map((d) => `${d.name}@${d.version}`)).toEqual(["github.com/a/b@v1.2.3", "golang.org/x/text@v0.14.0", "github.com/c/d@v0.1.0"]);
  });

  it("parses requirements.txt", () => {
    const r = parseManifest("# comment\nDjango==5.0.1\nrequests>=2\nnumpy[extra]==1.26.0\n-r other.txt\n");
    expect(r?.format).toBe("requirements.txt");
    expect(r?.deps).toEqual([
      { system: "pypi", name: "django", version: "5.0.1" },
      { system: "pypi", name: "requests", version: undefined },
      { system: "pypi", name: "numpy", version: "1.26.0" },
    ]);
  });

  it("parses Cargo.toml dependency tables", () => {
    const r = parseManifest('[package]\nname = "x"\n\n[dependencies]\nserde = "1.0.197"\ntokio = { version = "1.36.0", features = ["full"] }\nlocal = { path = "../local" }\n\n[dev-dependencies]\ninsta = "1"\n');
    expect(r?.format).toBe("Cargo.toml");
    expect(r?.deps.map((d) => `${d.name}@${d.version ?? "?"}`)).toEqual(["serde@1.0.197", "tokio@1.36.0", "local@?", "insta@?"]);
  });

  it("parses Gemfile.lock specs", () => {
    const r = parseManifest("GEM\n  remote: https://rubygems.org/\n  specs:\n    rack (3.0.9)\n    rails (7.1.3)\n      actionpack (= 7.1.3)\n\nPLATFORMS\n  ruby\n");
    expect(r?.deps).toEqual([
      { system: "rubygems", name: "rack", version: "3.0.9" },
      { system: "rubygems", name: "rails", version: "7.1.3" },
    ]);
  });

  it("parses manual license lists with SPDX expressions", () => {
    const r = parseManifest("lodash@4.17.21 MIT\n@scope/pkg GPL-3.0-only OR MIT\n");
    expect(r?.format).toBe("license-list");
    expect(r?.deps).toEqual([
      { system: "unknown", name: "lodash", version: "4.17.21", license: "MIT" },
      { system: "unknown", name: "@scope/pkg", version: undefined, license: "GPL-3.0-only OR MIT" },
    ]);
  });

  it("rejects unknown input", () => {
    expect(detectFormat("")).toBeUndefined();
    expect(parseManifest("{not json")).toBeUndefined();
  });
});

import { buildCompatIndex } from "@/domain/compat";
import { evaluateDeps, summarizeVerdicts } from "@/domain/deps/check";
import { realCatalog } from "./helpers";

describe("dependency evaluation", () => {
  const idx = buildCompatIndex(realCatalog().compat);
  it("orders worst first and counts statuses", () => {
    const v = evaluateDeps(
      [
        { system: "npm", name: "a", license: "MIT" },
        { system: "npm", name: "b", license: "GPL-3.0-only" },
        { system: "npm", name: "c" },
        { system: "npm", name: "d", license: "AGPL-3.0-only" },
      ],
      "gpl-3.0",
      idx,
    );
    expect(v.map((x) => `${x.name}:${x.status}`)).toEqual(["d:conditional", "c:unknown", "a:compatible", "b:compatible"]);
    expect(summarizeVerdicts(evaluateDeps([{ system: "npm", name: "b", license: "GPL-3.0-only" }], "mit", idx))).toEqual({ compatible: 0, conditional: 0, incompatible: 1, unknown: 0 });
  });
});
