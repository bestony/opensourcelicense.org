/**
 * Pure helpers for the R2 page offload: pack building, versioning and generation cleanup.
 * No network or fs.
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { PackEntry, PackIndex } from "../../src/domain/offload";

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** Appends gzip-compressed pages to one pack and records their byte ranges. */
export class PackBuilder {
  private chunks: Buffer[] = [];
  private offset = 0;
  private pages: Record<string, PackEntry> = {};

  add(path: string, html: Buffer): void {
    const gz = gzipSync(html, { level: 9 });
    this.pages[path] = [this.offset, gz.length, `"${sha256(html).slice(0, 32)}"`];
    this.chunks.push(gz);
    this.offset += gz.length;
  }

  finish(): { pack: Buffer; index: PackIndex } {
    return { pack: Buffer.concat(this.chunks), index: { version: 1, pages: this.pages } };
  }
}

/** Content version of a set of packs; changes when any page or pack layout changes. */
export function packVersion(parts: readonly { locale: string; pack: Buffer; index: string }[]): string {
  const h = createHash("sha256");
  for (const p of [...parts].sort((a, b) => a.locale.localeCompare(b.locale))) h.update(`${p.locale}\n${sha256(p.pack)}\n${sha256(p.index)}\n`);
  return h.digest("hex").slice(0, 16);
}

export interface Generation {
  version: string;
  keys: string[];
}

export function parseGenerations(text: string | undefined): Generation[] {
  if (!text) return [];
  try {
    const list = JSON.parse(text) as unknown;
    return Array.isArray(list)
      ? list.filter((g): g is Generation => !!g && typeof g.version === "string" && Array.isArray(g.keys))
      : [];
  } catch {
    return [];
  }
}

/**
 * Puts `current` first and keeps `keep` generations in total (the live one plus older ones for
 * Workers still running the previous version and for rollbacks). Returns the keys to delete.
 */
export function rotateGenerations(list: readonly Generation[], current: Generation, keep = 3): { next: Generation[]; remove: string[] } {
  const others = list.filter((g) => g.version !== current.version);
  const next = [current, ...others].slice(0, keep);
  const live = new Set(next.flatMap((g) => g.keys));
  const remove = others.slice(keep - 1).flatMap((g) => g.keys).filter((k) => !live.has(k));
  return { next, remove };
}
