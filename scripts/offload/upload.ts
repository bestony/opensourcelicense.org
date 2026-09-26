/**
 * Uploads the page packs in dist-r2/ to R2 as generation `packs/<VERSION>/`, then deletes
 * generations older than the last three. A generation that is already complete is skipped.
 * Usage: `tsx scripts/offload/upload.ts [--bucket=name] [--local] [--dir=dist-r2]`.
 * Remote mode needs CLOUDFLARE_API_TOKEN (with R2 edit permission) and CLOUDFLARE_ACCOUNT_ID.
 * Deploy the Worker afterwards with `--var PAGES_VERSION:$(cat dist-r2/VERSION)`.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { completeKey, GENERATIONS_KEY, indexKey, OFFLOAD_BUCKET, packKey } from "../../src/domain/offload";
import { createLogger } from "../../src/lib/log";
import { mapLimit } from "../../src/lib/map-limit";
import { parseGenerations, rotateGenerations } from "./core";

const run = promisify(execFile);
const log = createLogger("offload.upload");
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const bucket = arg("bucket") ?? process.env.OFFLOAD_BUCKET ?? OFFLOAD_BUCKET;
const dir = arg("dir") ?? "dist-r2";
const target = process.argv.includes("--local") ? "--local" : "--remote";
/** Local R2 is a SQLite file that allows one writer at a time. */
const CONCURRENCY = target === "--local" ? 1 : 4;

async function wrangler(args: string[]): Promise<void> {
  await run("pnpm", ["exec", "wrangler", ...args, target], { maxBuffer: 16 * 1024 * 1024 });
}

async function withRetry<T>(what: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const detail = String((err as { stderr?: string }).stderr || err).slice(-1500);
      if (i >= attempts) throw new Error(`${what} failed: ${detail}`);
      log.warn("retrying", { what, attempt: i, err: detail });
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

async function getText(key: string, tmp: string): Promise<string | undefined> {
  const file = join(tmp, key.replaceAll("/", "_"));
  try {
    await wrangler(["r2", "object", "get", `${bucket}/${key}`, "--file", file]);
    return readFileSync(file, "utf8");
  } catch {
    return undefined; // missing object
  }
}

async function put(key: string, file: string, contentType: string): Promise<void> {
  await withRetry(`put ${key}`, () => wrangler(["r2", "object", "put", `${bucket}/${key}`, "--file", file, "--content-type", contentType]));
}

async function main() {
  const version = readFileSync(join(dir, "VERSION"), "utf8").trim();
  const tmp = mkdtempSync(join(tmpdir(), "osl-offload-"));
  try {
    if ((await getText(completeKey(version), tmp)) !== undefined) {
      log.info("generation already uploaded", { bucket, target, version });
      return;
    }
    const locales = readdirSync(dir).filter((f) => f.endsWith(".pack")).map((f) => f.slice(0, -".pack".length)).sort();
    if (!locales.length) throw new Error(`${dir} has no packs: run "pnpm build" first`);
    const files = locales.flatMap((l) => [
      { key: packKey(version, l), file: join(dir, `${l}.pack`), type: "application/octet-stream" },
      { key: indexKey(version, l), file: join(dir, `${l}.json`), type: "application/json" },
    ]);
    const bytes = files.reduce((n, f) => n + statSync(f.file).size, 0);
    log.info("uploading generation", { bucket, target, version, locales: locales.length, objects: files.length, bytes });
    let done = 0;
    await mapLimit(files, CONCURRENCY, async (f) => {
      await put(f.key, f.file, f.type);
      log.info("uploaded", { key: f.key, done: ++done, of: files.length });
    });
    const marker = join(tmp, "complete");
    writeFileSync(marker, new Date().toISOString());
    await put(completeKey(version), marker, "text/plain");

    const current = { version, keys: [...files.map((f) => f.key), completeKey(version)] };
    const { next, remove } = rotateGenerations(parseGenerations(await getText(GENERATIONS_KEY, tmp)), current);
    const list = join(tmp, "generations.json");
    writeFileSync(list, JSON.stringify(next));
    await put(GENERATIONS_KEY, list, "application/json");
    await mapLimit(remove, CONCURRENCY, (key) => withRetry(`delete ${key}`, () => wrangler(["r2", "object", "delete", `${bucket}/${key}`])));
    log.info("upload done", { version, uploaded: files.length, deleted: remove.length, generations: next.map((g) => g.version) });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  log.error("upload failed", { err: String(err).slice(0, 3000) });
  process.exit(1);
});
