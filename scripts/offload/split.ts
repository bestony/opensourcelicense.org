/**
 * Moves the offloaded pages (src/domain/offload.ts) from dist/ to dist-r2/ after `astro build`,
 * before Pagefind indexes dist/. Usage: `tsx scripts/offload/split.ts [--dist=dist] [--out=dist-r2]`.
 * With `--check`, moves nothing and only checks dist/ against the Workers static asset limits
 * (run it last, after Pagefind has added its files).
 */
import { mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { isOffloadedPath, pathnameOfBuiltFile } from "../../src/domain/offload";
import { createLogger } from "../../src/lib/log";

const log = createLogger("offload.split");
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const dist = arg("dist") ?? "dist";
/** Cloudflare Workers static asset limits (free plan): files per deployment and bytes per file. */
const MAX_ASSETS = 20_000;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const out = arg("out") ?? "dist-r2";

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function removeEmptyParents(dir: string, stop: string): void {
  for (let d = dir; d !== stop && d.startsWith(stop); d = dirname(d)) {
    try {
      rmdirSync(d); // fails when not empty
    } catch {
      return;
    }
  }
}

function checkLimits(): void {
  const files = [...walk(dist)].map((f) => ({ file: f, size: statSync(f).size }));
  const oversized = files.filter((f) => f.size > MAX_ASSET_BYTES);
  if (files.length > MAX_ASSETS || oversized.length) {
    log.error("static assets exceed the Workers limits", { files: files.length, maxFiles: MAX_ASSETS, oversized });
    process.exit(1);
  }
  log.info("static assets within the Workers limits", { files: files.length, maxFiles: MAX_ASSETS });
}

function split(): void {
  rmSync(out, { recursive: true, force: true });
  let moved = 0;
  let kept = 0;
  for (const file of [...walk(dist)]) {
    const rel = relative(dist, file);
    const pathname = pathnameOfBuiltFile(rel);
    if (!pathname || !isOffloadedPath(pathname)) {
      kept++;
      continue;
    }
    const target = join(out, rel);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(file, target);
    removeEmptyParents(dirname(file), dist);
    moved++;
    log.debug("moved", { path: pathname });
  }
  log.info("offload split done", { dist, out, moved, kept });
}

if (process.argv.includes("--check")) checkLimits();
else split();
