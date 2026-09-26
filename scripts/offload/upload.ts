/**
 * Syncs dist-r2/ to the R2 bucket with Wrangler: uploads new or changed pages, deletes pages
 * that are no longer built, then writes the manifest. Only changed pages cost R2 writes.
 * Usage: `tsx scripts/offload/upload.ts [--bucket=name] [--local] [--dry-run] [--dir=dist-r2]`.
 * Remote mode needs CLOUDFLARE_API_TOKEN (with R2 edit permission) and CLOUDFLARE_ACCOUNT_ID.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { OFFLOAD_BUCKET, OFFLOAD_MANIFEST_KEY, OFFLOAD_PREFIX } from "../../src/domain/offload";
import { createLogger } from "../../src/lib/log";
import { chunk, emptyManifest, parseManifest, planUpload, type Manifest } from "./core";

const log = createLogger("offload.upload");
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const bucket = arg("bucket") ?? process.env.OFFLOAD_BUCKET ?? OFFLOAD_BUCKET;
const dir = arg("dir") ?? "dist-r2";
const target = process.argv.includes("--local") ? "--local" : "--remote";
const dryRun = process.argv.includes("--dry-run");
/** Entries per `wrangler r2 bulk put` call; a failed batch is retried without redoing the others. */
const BATCH = 2000;

function wrangler(args: string[]): string {
  return execFileSync("pnpm", ["exec", "wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
}

function* walk(d: string): Generator<string> {
  for (const entry of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function localManifest(): { manifest: Manifest; files: Map<string, string> } {
  const manifest = emptyManifest();
  const files = new Map<string, string>();
  if (!existsSync(dir)) return { manifest, files };
  for (const file of walk(dir)) {
    const key = `${OFFLOAD_PREFIX}${relative(dir, file).replaceAll("\\", "/")}`;
    manifest.files[key] = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 32);
    files.set(key, file);
  }
  return { manifest, files };
}

function remoteManifest(tmp: string): Manifest {
  const file = join(tmp, "remote-manifest.json");
  try {
    wrangler(["r2", "object", "get", `${bucket}/${OFFLOAD_MANIFEST_KEY}`, "--file", file, target]);
    return parseManifest(readFileSync(file, "utf8"));
  } catch (err) {
    log.warn("no remote manifest, uploading every page", { bucket, err: String(err).slice(0, 300) });
    return emptyManifest();
  }
}

function withRetry<T>(what: string, fn: () => T, attempts = 3): T {
  for (let i = 1; ; i++) {
    try {
      return fn();
    } catch (err) {
      if (i >= attempts) throw err;
      log.warn("retrying", { what, attempt: i, err: String(err).slice(0, 300) });
    }
  }
}

function main() {
  const tmp = mkdtempSync(join(tmpdir(), "osl-offload-"));
  try {
    const { manifest, files } = localManifest();
    if (files.size === 0) throw new Error(`${dir} is empty: run "pnpm build" first`);
    const remote = remoteManifest(tmp);
    const plan = planUpload(remote, manifest);
    log.info("upload plan", { bucket, target, local: files.size, put: plan.put.length, remove: plan.remove.length, unchanged: plan.unchanged, dryRun });
    if (dryRun) return;

    const batches = chunk(plan.put, BATCH);
    batches.forEach((keys, i) => {
      const list = join(tmp, `batch-${i}.json`);
      writeFileSync(list, JSON.stringify(keys.map((key) => ({ key, file: files.get(key)! }))));
      withRetry(`batch ${i + 1}/${batches.length}`, () =>
        wrangler(["r2", "bulk", "put", bucket, "--filename", list, "--content-type", "text/html; charset=utf-8", "--concurrency", "20", target]),
      );
      log.info("batch uploaded", { batch: i + 1, of: batches.length, size: keys.length });
    });
    for (const key of plan.remove) {
      withRetry(`delete ${key}`, () => wrangler(["r2", "object", "delete", `${bucket}/${key}`, target]));
      log.debug("deleted", { key });
    }
    const manifestFile = join(tmp, "manifest.json");
    writeFileSync(manifestFile, JSON.stringify(manifest));
    withRetry("manifest", () =>
      wrangler(["r2", "object", "put", `${bucket}/${OFFLOAD_MANIFEST_KEY}`, "--file", manifestFile, "--content-type", "application/json", target]),
    );
    log.info("upload done", { put: plan.put.length, removed: plan.remove.length });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  log.error("upload failed", { err: String(err).slice(0, 1000) });
  process.exit(1);
}
