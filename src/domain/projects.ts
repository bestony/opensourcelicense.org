/**
 * Project map queries. Filters use inverted indexes (value -> Set of slugs)
 * and intersect from the smallest set, so a query costs O(min set size).
 */
import type { Catalog, Project } from "./catalog";
import type { Family } from "./schema";

export interface ProjectFilters {
  domain?: string;
  family?: Family;
  owner?: string;
  changed?: boolean;
}

export interface ProjectIndex {
  all: Set<string>;
  byDomain: Map<string, Set<string>>;
  byFamily: Map<Family, Set<string>>;
  byOwner: Map<string, Set<string>>;
  changed: Set<string>;
}

function add<K>(map: Map<K, Set<string>>, key: K, slug: string) {
  let s = map.get(key);
  if (!s) map.set(key, (s = new Set()));
  s.add(slug);
}

export function familiesOf(cat: Catalog, p: Project): Family[] {
  return [...new Set(p.current.map((id) => cat.licenseInfo(id).family).filter((f): f is Family => !!f))];
}

export function hasChanged(p: Project): boolean {
  return p.timeline.some((e) => e.from.length > 0);
}

export function buildProjectIndex(cat: Catalog): ProjectIndex {
  const idx: ProjectIndex = { all: new Set(), byDomain: new Map(), byFamily: new Map(), byOwner: new Map(), changed: new Set() };
  for (const p of cat.projectList) {
    idx.all.add(p.slug);
    add(idx.byDomain, p.domain, p.slug);
    add(idx.byOwner, p.owner, p.slug);
    for (const f of familiesOf(cat, p)) add(idx.byFamily, f, p.slug);
    if (hasChanged(p)) idx.changed.add(p.slug);
  }
  return idx;
}

export function filterProjects(idx: ProjectIndex, f: ProjectFilters): Set<string> {
  const sets: Set<string>[] = [];
  if (f.domain) sets.push(idx.byDomain.get(f.domain) ?? new Set());
  if (f.family) sets.push(idx.byFamily.get(f.family) ?? new Set());
  if (f.owner) sets.push(idx.byOwner.get(f.owner) ?? new Set());
  if (f.changed) sets.push(idx.changed);
  if (!sets.length) return idx.all;
  sets.sort((a, b) => a.size - b.size);
  const [first, ...rest] = sets;
  const out = new Set<string>();
  for (const s of first) if (rest.every((r) => r.has(s))) out.add(s);
  return out;
}

/** Projects in the same domain, ranked by shared license ids. */
export function similarProjects(cat: Catalog, p: Project, limit = 5): Project[] {
  const mine = new Set(p.current);
  return cat.projectList
    .filter((o) => o.slug !== p.slug && o.domain === p.domain)
    .map((o) => ({ o, shared: o.current.filter((c) => mine.has(c)).length }))
    .sort((a, b) => b.shared - a.shared || a.o.name.localeCompare(b.o.name))
    .slice(0, limit)
    .map((x) => x.o);
}

export interface FamilyShare {
  domain: string;
  total: number;
  counts: Partial<Record<Family, number>>;
}

/** Primary family (first current license) per domain. */
export function familyShareByDomain(cat: Catalog): FamilyShare[] {
  const map = new Map<string, FamilyShare>();
  for (const p of cat.projectList) {
    const fam = cat.licenseInfo(p.current[0]).family;
    if (!fam) continue;
    let row = map.get(p.domain);
    if (!row) map.set(p.domain, (row = { domain: p.domain, total: 0, counts: {} }));
    row.total++;
    row.counts[fam] = (row.counts[fam] ?? 0) + 1;
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.domain.localeCompare(b.domain));
}

export function changesByYear(cat: Catalog): { year: string; count: number }[] {
  const map = new Map<string, number>();
  for (const p of cat.projectList) for (const e of p.timeline) if (e.from.length) map.set(e.date.slice(0, 4), (map.get(e.date.slice(0, 4)) ?? 0) + 1);
  return [...map.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year.localeCompare(b.year));
}

const OPEN: ReadonlySet<Family | undefined> = new Set<Family | undefined>(["permissive", "weak-copyleft", "strong-copyleft", "network-copyleft"]);

/** Timeline events that moved a project from only-open licenses to a source-available one. */
export function openToSourceAvailable(cat: Catalog) {
  const out: { project: Project; date: string; from: string[]; to: string[] }[] = [];
  for (const p of cat.projectList)
    for (const e of p.timeline) {
      const fromOpen = e.from.length > 0 && e.from.every((id) => OPEN.has(cat.licenseInfo(id).family));
      const toSa = e.to.some((id) => cat.licenseInfo(id).family === "source-available");
      if (fromOpen && toSa) out.push({ project: p, date: e.date, from: e.from, to: e.to });
    }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
