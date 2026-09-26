/**
 * Pull request license check: `pnpm license-check --base=<sha> [--head=HEAD] [--fail-on-conflict]`.
 * - Detects the project license from LICENSE and reports if a PR changes it.
 * - Parses changed dependency manifests, looks up licenses of added
 *   dependencies on deps.dev, and checks them against the project license.
 * Writes a Markdown report to pr-license-report.md.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { buildCatalog } from "../src/domain/catalog";
import { buildCompatIndex } from "../src/domain/compat";
import { parseManifest, type Dep } from "../src/domain/deps";
import { evaluateDeps, summarizeVerdicts } from "../src/domain/deps/check";
import { detectLicense } from "../src/domain/license-detect";
import { lookupDepsDev } from "../src/lib/deps-dev";
import { loadRawData } from "../src/lib/load-data";
import { createLogger } from "../src/lib/log";
import { mapLimit } from "../src/lib/map-limit";

const log = createLogger("license-check");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const base = arg("base") ?? process.env.BASE_SHA;
const head = arg("head") ?? "HEAD";
const failOnConflict = process.argv.includes("--fail-on-conflict");
const MANIFESTS = new Set(["package-lock.json", "package.json", "go.mod", "requirements.txt", "Cargo.toml", "Gemfile.lock"]);
const LICENSE_FILE = /^(LICENSE|LICENCE|COPYING)(\.(md|txt))?$/i;

const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const show = (ref: string, path: string) => {
  try {
    return git("show", `${ref}:${path}`);
  } catch {
    return undefined;
  }
};

async function main() {
  if (!base) throw new Error("--base=<sha> or BASE_SHA is required");
  const cat = buildCatalog(loadRawData());
  const refs = Object.fromEntries(readdirSync("data/texts").map((f) => [basename(f, ".txt"), readFileSync(`data/texts/${f}`, "utf8")]));
  const changed = git("diff", "--name-only", `${base}...${head}`).split("\n").filter(Boolean);
  log.info("changed files", { count: changed.length });

  const lines: string[] = ["## License check", ""];
  let conflicts = 0;

  // Project license, before and after.
  const licenseFile = git("ls-tree", "--name-only", head).split("\n").find((f) => LICENSE_FILE.test(f));
  const after = licenseFile ? detectLicense(show(head, licenseFile) ?? "", refs) : undefined;
  const before = licenseFile ? detectLicense(show(base, licenseFile) ?? "", refs) : undefined;
  const nameOf = (s?: string) => (s ? cat.licenses.get(s)?.shortName ?? s : "unknown");
  if (licenseFile && changed.includes(licenseFile)) {
    lines.push(`⚠️ **\`${licenseFile}\` changed**: ${nameOf(before?.license)} → ${nameOf(after?.license)}.`);
    lines.push(`Changing a license needs the consent of all copyright holders unless a CLA covers it. See https://opensourcelicense.org/scenarios/C1/${after?.license ?? ""}`);
    lines.push("");
  }
  lines.push(`Project license: **${nameOf(after?.license)}**${after ? ` (match ${after.score})` : ""}.`, "");

  // Added dependencies in changed manifests.
  const manifests = changed.filter((f) => MANIFESTS.has(basename(f)));
  const project = after?.license;
  if (!manifests.length) lines.push("No dependency manifest changed.");
  else if (!project || !cat.licenses.has(project)) lines.push("Could not identify the project license, so dependencies were not checked.");
  else {
    const idx = buildCompatIndex(cat.compat);
    for (const file of manifests) {
      const now = parseManifest(show(head, file) ?? "");
      const then = parseManifest(show(base, file) ?? "");
      if (!now) {
        lines.push(`- \`${file}\`: format not recognized.`);
        continue;
      }
      const old = new Set((then?.deps ?? []).map((d) => `${d.system}:${d.name}`));
      const added = now.deps.filter((d) => !old.has(`${d.system}:${d.name}`)).slice(0, 200);
      const resolved: Dep[] = await mapLimit(added, 6, async (d) => {
        if (d.license) return d;
        const r = await lookupDepsDev(fetch, d.system, d.name, d.version).catch(() => undefined);
        return r?.ok && r.licenses.length ? { ...d, version: d.version ?? r.version, license: r.licenses.join(" AND ") } : d;
      });
      const verdicts = evaluateDeps(resolved, project, idx);
      const s = summarizeVerdicts(verdicts);
      conflicts += s.incompatible;
      lines.push(`### \`${file}\` — ${added.length} added dependencies`, "");
      lines.push(`${s.compatible} compatible · ${s.conditional} with conditions · ${s.incompatible} conflicts · ${s.unknown} unknown`, "");
      const notable = verdicts.filter((v) => v.status !== "compatible");
      if (notable.length) {
        lines.push("| Package | License | Status |", "| --- | --- | --- |");
        for (const v of notable) lines.push(`| \`${v.name}${v.version ? `@${v.version}` : ""}\` | ${v.license ?? "—"} | ${v.status}${v.note ? ` — ${v.note}` : ""} |`);
        lines.push("");
      }
    }
  }
  lines.push("", "<sub>Generated by opensourcelicense.org license check. Not legal advice.</sub>");
  writeFileSync("pr-license-report.md", lines.join("\n") + "\n");
  log.info("report written", { conflicts, manifests: manifests.length, project });
  if (failOnConflict && conflicts) process.exit(1);
}

main().catch((err) => {
  log.error("license check crashed", { err });
  process.exit(2);
});
