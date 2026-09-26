/**
 * Weekly license sync: `pnpm sync [--dry-run] [--only=slug,slug]`.
 * Reads GitHub and Hugging Face license metadata, updates data/projects/*.yaml
 * (never removes data), and writes a Markdown summary to sync-report.md for
 * the pull request body. Set GITHUB_TOKEN to raise the GitHub rate limit.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { buildCatalog } from "../../src/domain/catalog";
import type { ProjectData } from "../../src/domain/schema";
import { projectSchema } from "../../src/domain/schema";
import { loadRawData } from "../../src/lib/load-data";
import { createLogger } from "../../src/lib/log";
import { applyObservation, mapLimit, normalizeUpstream, type Observation, type SyncOutcome } from "./core";

const log = createLogger("sync");
const dryRun = process.argv.includes("--dry-run");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const today = new Date().toISOString().slice(0, 10);
const token = process.env.GITHUB_TOKEN;

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body?: T }> {
  const res = await fetch(url, { headers: { "User-Agent": "opensourcelicense.org-sync", ...headers } });
  log.debug("http", { url, status: res.status });
  if (!res.ok) return { status: res.status };
  return { status: res.status, body: (await res.json()) as T };
}

const ghHeaders = (): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function observeGithub(p: ProjectData, known: (id: string) => boolean): Promise<Observation | undefined> {
  if (!p.repo) return undefined;
  const lic = await getJson<{ license?: { spdx_id?: string }; html_url?: string; path?: string }>(
    `https://api.github.com/repos/${p.repo}/license`,
    ghHeaders(),
  );
  if (lic.status === 403 || lic.status === 429) throw new Error(`GitHub rate limit (${lic.status})`);
  let touched = false;
  let evidenceUrl = lic.body?.html_url ?? `https://github.com/${p.repo}`;
  if (p.syncedAt && lic.body?.path) {
    const commits = await getJson<{ html_url: string }[]>(
      `https://api.github.com/repos/${p.repo}/commits?path=${encodeURIComponent(lic.body.path)}&since=${p.syncedAt}T00:00:00Z&per_page=5`,
      ghHeaders(),
    );
    if (commits.body?.length) {
      touched = true;
      evidenceUrl = commits.body[0].html_url;
    }
  }
  return { license: normalizeUpstream(lic.body?.license?.spdx_id, known), evidenceUrl, licenseFileTouched: touched };
}

async function observeHf(p: ProjectData, known: (id: string) => boolean): Promise<Observation | undefined> {
  if (!p.hf) return undefined;
  const r = await getJson<{ cardData?: { license?: string | string[] }; tags?: string[] }>(`https://huggingface.co/api/models/${p.hf}`);
  const fromCard = r.body?.cardData?.license;
  const raw = (Array.isArray(fromCard) ? fromCard[0] : fromCard) ?? r.body?.tags?.find((t) => t.startsWith("license:"))?.slice(8);
  return { license: normalizeUpstream(raw, known), evidenceUrl: `https://huggingface.co/${p.hf}` };
}

async function main() {
  const cat = buildCatalog(loadRawData());
  const known = (id: string) => cat.licenseInfo(id).known;
  const targets = cat.projectList.filter((p) => (p.repo || p.hf) && (!only || only.includes(p.slug)));
  log.info("sync start", { projects: targets.length, dryRun, authenticated: !!token });

  const results = await mapLimit(targets, 4, async (p): Promise<{ slug: string; outcome?: SyncOutcome; error?: string }> => {
    const file = `data/projects/${p.slug}.yaml`;
    try {
      const data = projectSchema.parse(parse(readFileSync(file, "utf8")));
      const obs = p.hf ? await observeHf(data, known) : await observeGithub(data, known);
      if (!obs) return { slug: p.slug };
      const outcome = applyObservation(data, obs, today);
      if (!dryRun && outcome.status !== "no-signal") writeFileSync(file, stringify(outcome.project));
      log.info("project synced", { slug: p.slug, status: outcome.status, note: outcome.note });
      return { slug: p.slug, outcome };
    } catch (err) {
      log.warn("project sync failed", { slug: p.slug, err });
      return { slug: p.slug, error: (err as Error).message };
    }
  });

  const changed = results.filter((r) => r.outcome?.status === "changed" || r.outcome?.status === "needs-review");
  const failed = results.filter((r) => r.error);
  const lines = [
    `# License sync ${today}`,
    "",
    `Checked ${results.length} projects: ${changed.length} need review, ${failed.length} failed.`,
    "",
    ...changed.map((r) => `- [ ] **${r.slug}**: ${r.outcome!.status} — ${r.outcome!.note ?? ""}. Add the reason and the official announcement URL before merging.`),
    ...(failed.length ? ["", "## Failed", ...failed.map((r) => `- ${r.slug}: ${r.error}`)] : []),
  ];
  if (!dryRun) writeFileSync("sync-report.md", lines.join("\n") + "\n");
  log.info("sync done", { checked: results.length, review: changed.length, failed: failed.length });
}

main().catch((err) => {
  log.error("sync crashed", { err });
  process.exit(1);
});
