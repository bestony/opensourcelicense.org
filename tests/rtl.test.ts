import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Physical-direction utilities break right-to-left layouts; use logical ones (ms-, pe-, start-, text-start). */
const PHYSICAL = /(?<![\w-])(?:-?m[lr]-|p[lr]-|-?left-|-?right-|text-left|text-right|border-[lr](?:-|\b)|rounded-[lr]-|float-(?:left|right))/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(astro|tsx)$/.test(f) ? [p] : [];
  });
}

describe("RTL readiness", () => {
  it("uses only logical direction utilities in components and pages", () => {
    const offenders: string[] = [];
    for (const f of files("src")) {
      if (f.includes(`${join("components", "ui")}`)) continue; // generated shadcn primitives
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const cls of line.match(/class(?:Name)?=(?:"[^"]*"|\{[^}]*\})/g) ?? [])
            if (PHYSICAL.test(cls)) offenders.push(`${f}:${i + 1}: ${cls.slice(0, 80)}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
