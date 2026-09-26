import { useMemo, useState } from "react";
import { buildCompatIndex, type CompatStatus } from "@/domain/compat";
import { parseManifest, type Dep, type ParseResult } from "@/domain/deps";
import { evaluateDeps, summarizeVerdicts, type DepVerdict } from "@/domain/deps/check";
import { createLogger } from "@/lib/log";
import { cn } from "@/lib/utils";
import { mapLimit } from "@/lib/map-limit";
import { TermButton, useIsland, type IslandProps } from "./shared";

const log = createLogger("deps-check");
const LOOKUP_SYSTEMS = new Set(["npm", "go", "pypi", "cargo"]);
const MAX_LOOKUPS = 300;
const STATUS_CLASS: Record<CompatStatus, string> = {
  compatible: "text-verdict-allow",
  conditional: "text-verdict-conditional",
  incompatible: "text-verdict-deny",
  unknown: "text-muted-foreground",
};
const SAMPLE = "lodash@4.17.21 MIT\nreadline-sync@1.4.10 GPL-3.0-only\n@fontsource/inter@5.0.0 OFL-1.1";

async function lookup(d: Dep): Promise<Dep> {
  const q = new URLSearchParams({ system: d.system, name: d.name, ...(d.version ? { version: d.version } : {}) });
  try {
    const res = await fetch(`/api/deps?${q}`);
    if (!res.ok) return d;
    const body = (await res.json()) as { licenses?: string[]; version?: string };
    const licenses = body.licenses ?? [];
    return licenses.length ? { ...d, version: d.version ?? body.version, license: licenses.join(" AND ") } : d;
  } catch (err) {
    log.warn("lookup failed", { name: d.name, err });
    return d;
  }
}

export default function DepsCheck(props: IslandProps) {
  const { cat, t, href, licenseName } = useIsland(props);
  const idx = useMemo(() => buildCompatIndex(cat.compat), [cat]);
  const [project, setProject] = useState("mit");
  const [text, setText] = useState("");
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>();
  const [verdicts, setVerdicts] = useState<DepVerdict[]>([]);

  const run = async () => {
    const r = parseManifest(text);
    setParsed(r ?? null);
    if (!r) return setVerdicts([]);
    let deps = r.deps;
    setVerdicts(evaluateDeps(deps, project, idx));
    const todo = deps.filter((d) => !d.license && LOOKUP_SYSTEMS.has(d.system)).slice(0, MAX_LOOKUPS);
    if (online && todo.length) {
      setBusy(true);
      const found = new Map((await mapLimit(todo, 6, lookup)).map((d) => [`${d.system}:${d.name}`, d]));
      deps = deps.map((d) => found.get(`${d.system}:${d.name}`) ?? d);
      setBusy(false);
      setVerdicts(evaluateDeps(deps, project, idx));
    }
  };

  const summary = summarizeVerdicts(verdicts);
  const projectLicenses = cat.licenseList.filter((l) => l.matrices.includes("code"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm">
          {t("check.project-license")}
          <select className="border border-border bg-background px-1" value={project} onChange={(e) => setProject(e.target.value)}>
            {projectLicenses.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.shortName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
          {t("check.lookup")}
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm text-muted-foreground">{t("check.input")}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={SAMPLE}
          className="w-full border border-border bg-background p-2 font-mono text-sm"
        />
      </label>
      <div className="flex gap-3">
        <TermButton onClick={run} disabled={!text.trim() || busy} className="border-primary bg-primary text-primary-foreground">
          {busy ? t("common.loading") : t("check.run")}
        </TermButton>
        <TermButton onClick={() => setText(SAMPLE)}>{t("chat.examples")}</TermButton>
      </div>

      {parsed === null && <p className="text-verdict-deny">{t("check.no-deps")}</p>}
      {parsed && (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("check.format", { format: parsed.format })}</p>
          <p>
            {t("check.summary", { ok: summary.compatible, warn: summary.conditional, bad: summary.incompatible, unknown: summary.unknown })}
          </p>
          {summary.unknown > 0 && <p className="text-sm text-muted-foreground">{t("check.license-hint")}</p>}
          {verdicts.length === 0 ? (
            <p>{t("check.no-deps")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="p-2 text-start font-normal">{t("check.col.package")}</th>
                    <th className="p-2 text-start font-normal">{t("check.col.license")}</th>
                    <th className="p-2 text-start font-normal">{t("check.col.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {verdicts.map((v) => (
                    <tr key={`${v.system}:${v.name}@${v.version ?? ""}`} className="border-b border-border align-top">
                      <td className="p-2 font-mono">
                        {v.name}
                        {v.version && <span className="text-muted-foreground">@{v.version}</span>}
                      </td>
                      <td className="p-2 font-mono">{v.license ?? "—"}</td>
                      <td className={cn("p-2", STATUS_CLASS[v.status])}>
                        {t(`check.status.${v.status}`)}
                        {v.note && <span className="block text-xs text-muted-foreground">{v.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm">
            <a href={href(`/licenses/${project}`)}>{licenseName(project)} →</a>
          </p>
        </section>
      )}
    </div>
  );
}
