/**
 * Moves the offloaded pages (src/domain/offload.ts) from dist/ to dist-r2/ after `astro build`,
 * before Pagefind indexes dist/. Usage: `tsx scripts/offload/split.ts [--dist=dist] [--out=dist-r2]`.
 */
import { mkdirSync, readdirSync, renameSync, rmdirSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { isOffloadedPath, pathnameOfBuiltFile } from "../../src/domain/offload";
import { createLogger } from "../../src/lib/log";

const log = createLogger("offload.split");
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const dist = arg("dist") ?? "dist";
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
