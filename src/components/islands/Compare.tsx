import { useEffect, useMemo, useState } from "react";
import { cellKey } from "@/domain/catalog";
import { FAMILY_CLASS } from "@/domain/verdict";
import { cn } from "@/lib/utils";
import { TermButton, useIsland, Verdict, type IslandProps } from "./shared";

const MAX = 3;
const PARAMS = ["a", "b", "c"] as const;

function readUrl(valid: Set<string>): string[] {
  const q = new URLSearchParams(window.location.search);
  return [...new Set(PARAMS.map((p) => q.get(p) ?? "").filter((s) => valid.has(s)))].slice(0, MAX);
}

export default function Compare(props: IslandProps & { initial?: string[] }) {
  const ctx = useIsland(props);
  const { cat, t, href, licenseName } = ctx;
  const valid = useMemo(() => new Set(cat.licenses.keys()), [cat]);
  const [selected, setSelected] = useState<string[]>(props.initial ?? []);

  useEffect(() => {
    const fromUrl = readUrl(valid);
    if (fromUrl.length) setSelected(fromUrl);
  }, [valid]);

  useEffect(() => {
    const u = new URL(window.location.href);
    PARAMS.forEach((p, i) => (selected[i] ? u.searchParams.set(p, selected[i]) : u.searchParams.delete(p)));
    window.history.replaceState(null, "", u);
  }, [selected]);

  const lics = selected.map((s) => cat.licenses.get(s)!).filter(Boolean);
  const terms = useMemo(() => {
    const collect = (k: "permissions" | "conditions" | "limitations") => [...new Set(lics.flatMap((l) => l[k]))];
    return [
      ["license.permissions", "permissions", collect("permissions")],
      ["license.conditions", "conditions", collect("conditions")],
      ["license.limitations", "limitations", collect("limitations")],
    ] as const;
  }, [lics]);
  const sharedMatrices = [...cat.matrices.values()].filter((m) => lics.length > 0 && lics.every((l) => l.matrices.includes(m.id)));

  const add = (slug: string) => slug && !selected.includes(slug) && setSelected([...selected, slug].slice(0, MAX));
  const remove = (slug: string) => setSelected(selected.filter((s) => s !== slug));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        {lics.map((l) => (
          <span key={l.slug} className={cn("inline-flex items-center gap-2 border px-2 py-1", FAMILY_CLASS[l.family].border)}>
            <a href={href(`/licenses/${l.slug}`)}>{l.shortName}</a>
            <button type="button" onClick={() => remove(l.slug)} aria-label={`${t("compare.remove")} ${l.shortName}`}>
              ×
            </button>
          </span>
        ))}
        {selected.length < MAX && (
          <label className="flex items-center gap-2">
            <span className="sr-only">{t("compare.pick")}</span>
            <select
              className="border border-border bg-background px-2 py-1"
              value=""
              onChange={(e) => add(e.target.value)}
              aria-label={t("compare.pick")}
            >
              <option value="">+ {t("compare.pick")}</option>
              {cat.licenseList
                .filter((l) => !selected.includes(l.slug))
                .map((l) => (
                  <option key={l.slug} value={l.slug}>
                    {l.shortName}
                  </option>
                ))}
            </select>
          </label>
        )}
        {selected.length > 0 && <TermButton onClick={() => setSelected([])}>{t("wizard.restart")}</TermButton>}
      </div>

      {lics.length < 2 ? (
        <p className="text-muted-foreground">{t("compare.empty")}</p>
      ) : (
        <>
          <section>
            <h2 className="term-heading mb-3 text-2xl">{t("compare.terms")}</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-2 text-start font-normal text-muted-foreground" />
                    {lics.map((l) => (
                      <th key={l.slug} className="p-2 text-center font-normal text-primary">
                        {l.shortName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <th className="p-2 text-start font-normal">{t("licenses.col.family")}</th>
                    {lics.map((l) => (
                      <td key={l.slug} className={cn("p-2 text-center", FAMILY_CLASS[l.family].text)}>
                        {t(`family.${l.family}`)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border">
                    <th className="p-2 text-start font-normal">OSI</th>
                    {lics.map((l) => (
                      <td key={l.slug} className="p-2 text-center">
                        {l.osi === "unknown" ? "?" : l.osi ? "✓" : "✗"}
                      </td>
                    ))}
                  </tr>
                  {terms.map(([title, key, items]) => [
                    <tr key={title} className="bg-muted">
                      <th colSpan={lics.length + 1} className="p-2 text-start font-normal">
                        {t(title)}
                      </th>
                    </tr>,
                    ...items.map((term) => (
                      <tr key={`${key}-${term}`} className="border-b border-border">
                        <th className="p-2 ps-4 text-start font-normal">{t(`term.${term}`)}</th>
                        {lics.map((l) => (
                          <td key={l.slug} className="p-2 text-center">
                            {(l[key] as string[]).includes(term) ? "●" : <span className="text-muted-foreground">·</span>}
                          </td>
                        ))}
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          </section>

          {sharedMatrices.map((m) => (
            <section key={m.id}>
              <h2 className="term-heading mb-3 text-2xl">
                {t("compare.scenarios")} · {t(`matrix.${m.id}`)}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-2 text-start font-normal text-muted-foreground">ID</th>
                      {lics.map((l) => (
                        <th key={l.slug} className="p-2 text-center font-normal text-primary">
                          {l.shortName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(cat.scenariosByMatrix.get(m.id) ?? []).map((s) => {
                      const cells = lics.map((l) => cat.cells.get(cellKey(s.id, l.slug))!);
                      const differs = new Set(cells.map((c) => c.verdict)).size > 1;
                      return (
                        <tr key={s.id} className={cn("border-b border-border", differs && "bg-muted/50")}>
                          <th className="p-2 text-start font-normal">
                            <a href={href(`/scenarios/${s.id}`)} className="no-underline hover:underline">
                              <span className="text-muted-foreground">{s.id}</span> {ctx.scenarioTitle(s.id)}
                            </a>
                          </th>
                          {cells.map((c) => (
                            <td key={c.license} className="p-2 text-center align-top">
                              <a href={href(`/scenarios/${s.id}/${c.license}`)} className="no-underline">
                                <Verdict verdict={c.verdict} label={`${licenseName(c.license)}: ${t(`verdict.${c.verdict}`)}`} />
                                {ctx.note(s.id, c.license) && (
                                  <span className="block text-xs text-muted-foreground">{ctx.note(s.id, c.license)}</span>
                                )}
                              </a>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
