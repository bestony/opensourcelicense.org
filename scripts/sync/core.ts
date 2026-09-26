/**
 * Pure helpers for the weekly license sync bot. No network or fs here.
 */
import type { ProjectData } from "../../src/domain/schema";

/** Upstream license identifiers (GitHub SPDX ids, Hugging Face tags) -> our ids. */
const UPSTREAM_ALIASES: Record<string, string> = {
  "agpl-3.0": "agpl-3.0",
  "agpl-3.0-only": "agpl-3.0",
  "agpl-3.0-or-later": "agpl-3.0",
  "gpl-3.0": "gpl-3.0",
  "gpl-3.0-only": "gpl-3.0",
  "gpl-3.0-or-later": "gpl-3.0",
  "gpl-2.0": "gpl-2.0",
  "gpl-2.0-only": "gpl-2.0",
  "gpl-2.0-or-later": "gpl-2.0",
  "lgpl-3.0": "lgpl-3.0",
  "lgpl-3.0-only": "lgpl-3.0",
  "lgpl-2.1": "lgpl-2.1",
  "lgpl-2.1-only": "lgpl-2.1",
  "lgpl-2.1-or-later": "lgpl-2.1",
  "elastic-2.0": "elv2",
  "bsl-1.1": "busl-1.1",
  "busl-1.1": "busl-1.1",
  "openrail": "openrail-m",
  "openrail++": "openrail-m",
  "creativeml-openrail-m": "openrail-m",
  "bigscience-bloom-rail-1.0": "bloom-rail-1.0",
  "llama2": "llama",
  "llama3": "llama",
  "llama3.1": "llama",
  "llama3.2": "llama",
  "llama3.3": "llama",
  "llama4": "llama",
  "fsl-1.1-alv2": "fsl-1.1",
  "fsl-1.1-apache-2.0": "fsl-1.1",
};

/** Values that carry no information and must never trigger a change. */
const NO_SIGNAL = new Set(["", "noassertion", "other", "unknown", "none"]);

export function normalizeUpstream(id: string | null | undefined, known: (id: string) => boolean): string | undefined {
  if (!id) return undefined;
  const lower = id.trim().toLowerCase();
  if (NO_SIGNAL.has(lower)) return undefined;
  const mapped = UPSTREAM_ALIASES[lower] ?? lower;
  return known(mapped) ? mapped : `unknown:${lower}`;
}

export interface Observation {
  /** normalized id, or "unknown:<raw>" when we cannot map it */
  license?: string;
  /** link that proves the change (commit, model card) */
  evidenceUrl: string;
  /** true when the LICENSE file changed since the last sync */
  licenseFileTouched?: boolean;
}

export interface SyncOutcome {
  project: ProjectData;
  status: "unchanged" | "changed" | "needs-review" | "no-signal";
  note?: string;
}

/**
 * Merges an observation into a project. A detected change never overwrites
 * silently: it appends a draft timeline entry and sets needsReview.
 */
export function applyObservation(p: ProjectData, obs: Observation, today: string): SyncOutcome {
  const project: ProjectData = { ...p, syncedAt: today, timeline: [...p.timeline] };
  if (!obs.license) {
    if (obs.licenseFileTouched) return { project: { ...project, needsReview: true }, status: "needs-review", note: "LICENSE file changed" };
    return { project, status: "no-signal" };
  }
  if (obs.license.startsWith("unknown:")) {
    return { project: { ...project, needsReview: true }, status: "needs-review", note: `unmapped upstream license ${obs.license.slice(8)}` };
  }
  // Multi-licensed projects: accept when the upstream id is one of ours.
  if (p.current.includes(obs.license)) {
    if (obs.licenseFileTouched) return { project: { ...project, needsReview: true }, status: "needs-review", note: "LICENSE file changed" };
    return { project, status: "unchanged" };
  }
  project.timeline.push({ date: today, from: [...p.current], to: [obs.license], url: obs.evidenceUrl, forks: [] });
  project.current = [obs.license];
  project.needsReview = true;
  return { project, status: "changed", note: `${p.current.join("/")} -> ${obs.license}` };
}

/** Runs `fn` over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
