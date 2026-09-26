import { useEffect, useMemo, useState } from "react";
import { PROJECT_OWNERS, type Family } from "@/domain/schema";
import { buildProjectIndex, familiesOf, filterProjects, hasChanged, type ProjectFilters } from "@/domain/projects";
import { FAMILY_CLASS } from "@/domain/verdict";
import { cn } from "@/lib/utils";
import { useIsland, type IslandProps } from "./shared";

const KEYS = ["domain", "family", "owner", "changed"] as const;

export default function ProjectMap(props: IslandProps) {
  const ctx = useIsland(props);
  const { cat, t, href } = ctx;
  const idx = useMemo(() => buildProjectIndex(cat), [cat]);
  const [f, setF] = useState<ProjectFilters>({});

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setF({
      domain: q.get("domain") || undefined,
      family: (q.get("family") as Family) || undefined,
      owner: q.get("owner") || undefined,
      changed: q.get("changed") === "1" || undefined,
    });
  }, []);

  useEffect(() => {
    const u = new URL(window.location.href);
    for (const k of KEYS) {
      const v = f[k];
      if (v === undefined || v === false) u.searchParams.delete(k);
      else u.searchParams.set(k, v === true ? "1" : String(v));
    }
    window.history.replaceState(null, "", u);
  }, [f]);

  const result = useMemo(() => filterProjects(idx, f), [idx, f]);
  const list = cat.projectList.filter((p) => result.has(p.slug));
  const domains = [...idx.byDomain.keys()].sort();
  const families = [...idx.byFamily.keys()];
  const sel = "border border-border bg-background px-1";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm">
          {t("projects.filter.domain")}
          <select className={sel} value={f.domain ?? ""} onChange={(e) => setF({ ...f, domain: e.target.value || undefined })}>
            <option value="">{t("common.all")}</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {t(`domain.${d}`)} ({idx.byDomain.get(d)!.size})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          {t("projects.filter.family")}
          <select className={sel} value={f.family ?? ""} onChange={(e) => setF({ ...f, family: (e.target.value as Family) || undefined })}>
            <option value="">{t("common.all")}</option>
            {families.map((d) => (
              <option key={d} value={d}>
                {t(`family.${d}`)} ({idx.byFamily.get(d)!.size})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          {t("projects.filter.owner")}
          <select className={sel} value={f.owner ?? ""} onChange={(e) => setF({ ...f, owner: e.target.value || undefined })}>
            <option value="">{t("common.all")}</option>
            {PROJECT_OWNERS.filter((o) => idx.byOwner.has(o)).map((o) => (
              <option key={o} value={o}>
                {t(`owner.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!f.changed} onChange={(e) => setF({ ...f, changed: e.target.checked || undefined })} />
          {t("projects.filter.changed")} ({idx.changed.size})
        </label>
        <span className="ms-auto text-muted-foreground">{t("projects.count", { count: list.length })}</span>
      </div>

      {list.length === 0 ? (
        <p className="text-muted-foreground">{t("projects.empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => {
            const fam = familiesOf(cat, p)[0];
            return (
              <li key={p.slug}>
                <a
                  href={href(`/projects/${p.slug}`)}
                  className={cn("block h-full border p-3 no-underline hover:bg-muted", fam ? FAMILY_CLASS[fam].border : "border-border")}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-lg text-primary">{p.name}</span>
                    {hasChanged(p) && <span className="text-sm text-verdict-conditional">↻</span>}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {t(`domain.${p.domain}`)} · {p.ownerName ?? t(`owner.${p.owner}`)}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {p.current.map((id) => {
                      const info = cat.licenseInfo(id);
                      return (
                        <span key={id} className={cn("border px-1 text-sm", info.family ? FAMILY_CLASS[info.family].text : "", info.family ? FAMILY_CLASS[info.family].border : "border-border")}>
                          {info.name}
                        </span>
                      );
                    })}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
