/**
 * Machine translation drafts: `pnpm translate [--locale=ja,ko] [--kind=ui,licenses,scenarios] [--limit=N] [--dry-run] [--force]`.
 * Uses the Workers AI REST API. Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.
 * Writes data/i18n/<locale>/... with reviewed: false and the English sourceHash.
 * Human-reviewed files are never overwritten (unless --force).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse, stringify } from "yaml";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "../../src/domain/locales";
import { createLogger } from "../../src/lib/log";
import { loadRawData } from "../../src/lib/load-data";
import { mapLimit } from "../sync/core";
import { chunkStrings, extractJson, planJob, systemPrompt, validateTranslation, type Job, type Kind } from "./core";

const log = createLogger("translate");
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const locales = (arg("locale")?.split(",") ?? LOCALES.filter((l) => l !== DEFAULT_LOCALE)) as Locale[];
const kinds = (arg("kind")?.split(",") ?? ["ui", "licenses", "scenarios"]) as Kind[];
const limit = Number(arg("limit") ?? Infinity);
const model = process.env.TRANSLATE_MODEL ?? "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

const fileOf = (j: Pick<Job, "locale" | "kind" | "id">) =>
  j.kind === "ui" ? `data/i18n/${j.locale}/ui.yaml` : `data/i18n/${j.locale}/${j.kind}/${j.id}.yaml`;

function readExisting(file: string): { reviewed?: boolean; sourceHash?: string } | undefined {
  return existsSync(file) ? (parse(readFileSync(file, "utf8")) as { reviewed?: boolean; sourceHash?: string }) : undefined;
}

async function complete(locale: Locale, payload: unknown, attempt = 1): Promise<unknown> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt(locale) },
        { role: "user", content: JSON.stringify(payload) },
      ],
      max_tokens: 4096,
      temperature: 0.1,
    }),
  });
  if (res.status === 429 && attempt <= 3) {
    await new Promise((r) => setTimeout(r, 2000 * attempt));
    return complete(locale, payload, attempt + 1);
  }
  if (!res.ok) throw new Error(`Workers AI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { result?: { response?: unknown; choices?: { message?: { content?: string } }[] } };
  const out = body.result?.response ?? body.result?.choices?.[0]?.message?.content;
  // Some models already return parsed JSON in `response`.
  return typeof out === "string" ? extractJson(out) : out;
}

async function translate(job: Job): Promise<Record<string, unknown>> {
  if (job.kind !== "ui") {
    const out = await complete(job.locale, job.source);
    const problems = validateTranslation(job.source, out);
    if (problems.length) throw new Error(`invalid translation: ${problems.slice(0, 3).join("; ")}`);
    return out as Record<string, unknown>;
  }
  const strings: Record<string, string> = {};
  for (const chunk of chunkStrings(job.source.strings as Record<string, string>)) {
    let out = await complete(job.locale, chunk);
    let problems = validateTranslation(chunk, out);
    if (problems.length) {
      log.warn("retrying chunk", { locale: job.locale, problems: problems.slice(0, 3) });
      out = await complete(job.locale, chunk);
      problems = validateTranslation(chunk, out);
    }
    // Keep valid keys; invalid ones fall back to English at runtime.
    const bad = new Set(problems.map((p) => p.split(":")[0]));
    for (const [k, v] of Object.entries(out as Record<string, string>)) if (k in chunk && !bad.has(k)) strings[k] = v;
  }
  return { strings };
}

async function main() {
  const raw = loadRawData();
  const jobs: Job[] = [];
  for (const locale of locales) {
    if (locale === DEFAULT_LOCALE) continue;
    if (kinds.includes("ui") && raw.ui[DEFAULT_LOCALE]) {
      const j = planJob(locale, "ui", "ui", raw.ui[DEFAULT_LOCALE], readExisting(fileOf({ locale, kind: "ui", id: "ui" })), force);
      if (j) jobs.push(j);
    }
    for (const kind of ["licenses", "scenarios"] as const) {
      if (!kinds.includes(kind)) continue;
      const table = kind === "licenses" ? raw.licenseTexts : raw.scenarioTexts;
      for (const [key, entry] of Object.entries(table)) {
        if (!key.startsWith(`${DEFAULT_LOCALE}/`)) continue;
        const id = key.slice(DEFAULT_LOCALE.length + 1);
        const j = planJob(locale, kind, id, entry as Record<string, unknown>, readExisting(fileOf({ locale, kind, id })), force);
        if (j) jobs.push(j);
      }
    }
  }
  const selected = jobs.slice(0, limit);
  log.info("translation plan", { jobs: jobs.length, selected: selected.length, model, dryRun, locales, kinds });
  if (dryRun) {
    for (const j of selected) log.info("would translate", { locale: j.locale, kind: j.kind, id: j.id, reason: j.reason });
    return;
  }
  if (!accountId || !apiToken) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required");

  let ok = 0;
  let failed = 0;
  await mapLimit(selected, 4, async (job) => {
    try {
      const translated = await translate(job);
      const file = fileOf(job);
      mkdirSync(dirname(file), { recursive: true });
      const extra = job.kind === "scenarios" ? { actor: (raw.scenarioTexts[`${DEFAULT_LOCALE}/${job.id}`] as { actor?: string })?.actor } : {};
      writeFileSync(file, stringify({ reviewed: false, sourceHash: job.hash, ...extra, ...translated }));
      ok++;
      log.info("translated", { locale: job.locale, kind: job.kind, id: job.id, reason: job.reason });
    } catch (err) {
      failed++;
      log.warn("translation failed", { locale: job.locale, kind: job.kind, id: job.id, err });
    }
  });
  log.info("translation done", { ok, failed });
  if (failed && !ok) process.exit(1);
}

main().catch((err) => {
  log.error("translate crashed", { err });
  process.exit(1);
});
