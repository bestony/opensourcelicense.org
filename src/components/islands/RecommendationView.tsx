import { useEffect, useState } from "react";
import type { Recommendation, ScorePart } from "@/domain/engine";
import { FAMILY_CLASS } from "@/domain/verdict";
import { track, type AnalyticsEvents } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { copyText, TermButton, type IslandContext } from "./shared";

const PARAM_PREFIX: Record<string, string> = {
  avoid: "opt.avoid.",
  openness: "opt.openness_level.",
  goal: "opt.adoption_goal.",
  plan: "opt.commercial_plan.",
  jurisdiction: "opt.jurisdiction.",
};

export function partLabel(ctx: IslandContext, p: ScorePart): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p.params)) params[k] = PARAM_PREFIX[k] ? ctx.t(`${PARAM_PREFIX[k]}${v}`) : v;
  return ctx.t(p.key, params);
}

type CopyKind = AnalyticsEvents["license_copy"]["kind"];

function CopyButton({ text, ctx, license, kind }: { text: string; ctx: IslandContext; license: string; kind: CopyKind }) {
  const [done, setDone] = useState(false);
  return (
    <TermButton
      onClick={async () => {
        if (await copyText(text)) {
          track("license_copy", { license, kind });
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      {done ? ctx.t("common.copied") : ctx.t("common.copy")}
    </TermButton>
  );
}

function Deliverables({ slug, ctx }: { slug: string; ctx: IslandContext }) {
  const lic = ctx.cat.licenses.get(slug)!;
  const [text, setText] = useState<string | null>(null);
  const year = new Date().getFullYear();
  const header = `// SPDX-FileCopyrightText: ${year} <your name>\n// SPDX-License-Identifier: ${lic.spdx}`;
  const badgeLabel = encodeURIComponent(lic.shortName.replace(/-/g, "--").replace(/ /g, "_"));
  const badge = `[![License: ${lic.shortName}](https://img.shields.io/badge/License-${badgeLabel}-blue.svg)](${lic.textUrl})`;

  useEffect(() => {
    if (!lic.hasText) return;
    let alive = true;
    fetch(`/texts/${slug}.txt`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((s) => alive && setText(s))
      .catch(() => alive && setText(null));
    return () => {
      alive = false;
    };
  }, [slug, lic.hasText]);

  const download = () => {
    if (!text) return;
    track("license_download", { license: slug });
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "LICENSE";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-2 border border-border p-3">
        <h4>{ctx.t("report.license-file")}</h4>
        {lic.hasText ? (
          <div className="flex gap-2">
            <CopyButton text={text ?? ""} ctx={ctx} license={slug} kind="text" />
            <TermButton onClick={download} disabled={!text}>
              {ctx.t("common.download")}
            </TermButton>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {ctx.t("report.no-text")}{" "}
            <a href={lic.textUrl} rel="noopener">
              ↗
            </a>
          </p>
        )}
      </div>
      <div className="space-y-2 border border-border p-3">
        <h4>{ctx.t("report.header")}</h4>
        <pre className="overflow-x-auto text-xs">{header}</pre>
        <CopyButton text={header} ctx={ctx} license={slug} kind="spdx_header" />
      </div>
      <div className="space-y-2 border border-border p-3">
        <h4>{ctx.t("report.badge")}</h4>
        <pre className="overflow-x-auto text-xs">{badge}</pre>
        <CopyButton text={badge} ctx={ctx} license={slug} kind="badge" />
      </div>
    </div>
  );
}

export function RecommendationView({ rec, ctx }: { rec: Recommendation; ctx: IslandContext }) {
  const { t, href, cat } = ctx;
  const similar = [...new Set(rec.top.flatMap((r) => (cat.projectsByLicense.get(r.license) ?? []).slice(0, 4)))].slice(0, 8);
  return (
    <div className="space-y-8">
      <section>
        <h2 className="term-heading mb-3 text-2xl">{t("report.top")}</h2>
        <ol className="space-y-6">
          {rec.top.map((r, i) => {
            const lic = cat.licenses.get(r.license)!;
            return (
              <li key={r.license} className={cn("border p-4", i === 0 ? "border-primary" : "border-border")}>
                <div className="mb-2 flex flex-wrap items-baseline gap-3">
                  <span className="text-muted-foreground">#{i + 1}</span>
                  <a href={href(`/licenses/${lic.slug}`)} className="text-2xl text-primary">
                    {lic.name}
                  </a>
                  <span className={cn("text-sm", FAMILY_CLASS[lic.family].text)}>{t(`family.${lic.family}`)}</span>
                  <span className="ms-auto text-muted-foreground">{t("report.score", { score: r.score })}</span>
                </div>
                <p className="mb-3">{ctx.licenseSummary(lic.slug)}</p>
                <details open={i === 0} className="mb-3">
                  <summary className="cursor-pointer text-muted-foreground">{t("report.why")}</summary>
                  <ul className="mt-2 space-y-1">
                    {r.parts.map((p, k) => (
                      <li key={k} className="flex gap-3">
                        <span className={cn("w-12 text-end tabular-nums", p.points >= 0 ? "text-verdict-allow" : "text-verdict-deny")}>
                          {p.points > 0 ? "+" : ""}
                          {p.points}
                        </span>
                        <span>{partLabel(ctx, p)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                {i === 0 && <Deliverables slug={lic.slug} ctx={ctx} />}
              </li>
            );
          })}
        </ol>
      </section>

      {rec.ranked.length > rec.top.length && (
        <section>
          <details>
            <summary className="cursor-pointer text-muted-foreground">{t("common.more")}</summary>
            <ul className="mt-2 space-y-1">
              {rec.ranked.slice(rec.top.length).map((r) => (
                <li key={r.license} className="flex gap-3">
                  <span className="w-12 text-end tabular-nums text-muted-foreground">{r.score}</span>
                  <a href={href(`/licenses/${r.license}`)}>{ctx.licenseName(r.license)}</a>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {rec.excluded.length > 0 && (
        <section>
          <h2 className="term-heading mb-3 text-2xl">{t("report.excluded")}</h2>
          <ul className="space-y-1">
            {rec.excluded.map((e) => (
              <li key={e.license}>
                <span className="text-verdict-deny">✗</span> {ctx.licenseName(e.license)} —{" "}
                <span className="text-muted-foreground">{t(e.reasonKey, e.params)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="term-heading mb-3 text-2xl">{t("report.advisories")}</h2>
        <ul className="space-y-2">
          {rec.advisories.map((a) => (
            <li key={a}>→ {t(`advisory.${a}`)}</li>
          ))}
        </ul>
      </section>

      {similar.length > 0 && (
        <section>
          <h2 className="term-heading mb-3 text-2xl">{t("report.similar")}</h2>
          <ul className="flex flex-wrap gap-2">
            {similar.map((p) => (
              <li key={p.slug}>
                <a href={href(`/projects/${p.slug}`)} className="inline-block border border-border px-2 no-underline hover:border-primary">
                  {p.name} <span className="text-sm text-muted-foreground">{p.current.map(ctx.licenseName).join(" / ")}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm text-muted-foreground">⚠ {t("footer.disclaimer")}</p>
    </div>
  );
}
