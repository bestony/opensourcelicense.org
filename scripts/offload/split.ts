/**
 * Packs the offloaded pages (src/domain/offload.ts) after `astro build`, before Pagefind
 * indexes dist/: removes them from dist/ and writes dist-r2/<locale>.pack, dist-r2/<locale>.json
 * and dist-r2/VERSION. Usage: `tsx scripts/offload/split.ts [--dist=dist] [--out=dist-r2]`.
 * With `--check`, packs nothing and only checks dist/ against the Workers static asset limits
 * (run it last, after Pagefind has added its files).
 */
import { mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { offloadedLocale, pageKey, pathnameOfBuiltFile } from "../../src/domain/offload";
import { createLogger } from "../../src/lib/log";
import { PackBuilder, packVersion } from "./core";

const log = createLogger("offload.split");
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const dist = arg("dist") ?? "dist";
const out = arg("out") ?? "dist-r2";
/** Cloudflare Workers static asset limits (free plan): files per deployment and bytes per file. */
const MAX_ASSETS = 20_000;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

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
  mkdirSync(out, { recursive: true });
  const packs = new Map<string, PackBuilder>();
  let kept = 0;
  // Sorted, so that the same build always gives the same packs and version.
  for (const file of [...walk(dist)].sort()) {
    const pathname = pathnameOfBuiltFile(relative(dist, file));
    const locale = pathname && offloadedLocale(pathname);
    if (!pathname || !locale) {
      kept++;
      continue;
    }
    let pack = packs.get(locale);
    if (!pack) packs.set(locale, (pack = new PackBuilder()));
    pack.add(pageKey(pathname), readFileSync(file));
    unlinkSync(file);
    removeEmptyParents(dirname(file), dist);
  }
  const parts: { locale: string; pack: Buffer; index: string }[] = [];
  for (const [locale, builder] of [...packs].sort(([a], [b]) => a.localeCompare(b))) {
    const { pack, index } = builder.finish();
    const json = JSON.stringify(index);
    writeFileSync(join(out, `${locale}.pack`), pack);
    writeFileSync(join(out, `${locale}.json`), json);
    parts.push({ locale, pack, index: json });
    log.debug("pack written", { locale, pages: Object.keys(index.pages).length, bytes: pack.length });
  }
  const version = packVersion(parts);
  writeFileSync(join(out, "VERSION"), version);
  const pages = parts.reduce((n, p) => n + Object.keys(JSON.parse(p.index).pages).length, 0);
  const bytes = parts.reduce((n, p) => n + p.pack.length, 0);
  log.info("offload packs done", { dist, out, version, locales: parts.length, pages, packBytes: bytes, kept });
}

if (process.argv.includes("--check")) checkLimits();
else split();
