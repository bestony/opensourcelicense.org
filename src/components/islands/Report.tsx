import { useEffect, useMemo, useState } from "react";
import { recommend } from "@/domain/engine";
import type { Profile } from "@/domain/profile";
import { decodeProfile, encodeProfile } from "@/domain/profile-codec";
import { track } from "@/lib/analytics";
import { ProfileCard } from "./ProfileCard";
import { RecommendationView } from "./RecommendationView";
import { copyText, TermButton, useIsland, type IslandProps } from "./shared";

type State = { kind: "loading" } | { kind: "empty" } | { kind: "invalid" } | { kind: "ok"; profile: Profile };

export default function Report(props: IslandProps) {
  const ctx = useIsland(props);
  const { t, href, cat } = ctx;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return setState({ kind: "empty" });
      const r = decodeProfile(hash);
      setState(r.ok ? { kind: "ok", profile: r.profile } : { kind: "invalid" });
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const rec = useMemo(() => (state.kind === "ok" ? recommend(state.profile, cat) : null), [state, cat]);
  const topLicense = rec?.top[0]?.license;

  // One event per rendered recommendation (initial load and every hash change).
  useEffect(() => {
    if (rec) track("report_view", { license: topLicense ?? "none", candidates: rec.top.length });
  }, [rec, topLicense]);

  if (state.kind === "loading") return <p className="text-muted-foreground">{t("common.loading")}</p>;
  if (state.kind !== "ok" || !rec)
    return (
      <div className="space-y-3">
        <p>{state.kind === "invalid" ? t("report.invalid") : t("report.empty")}</p>
        <p className="flex gap-4">
          <a href={href("/wizard")}>{t("nav.wizard")} →</a>
          <a href={href("/chat")}>{t("nav.chat")} →</a>
        </p>
      </div>
    );

  const code = encodeProfile(state.profile);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <RecommendationView rec={rec} ctx={ctx} />
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section className="border border-border p-4">
          <h2 className="mb-3 text-xl">{t("report.profile")}</h2>
          <ProfileCard profile={state.profile} t={t} />
          <p className="mt-3 flex flex-wrap gap-3">
            <a href={`${href("/wizard")}#${code}`}>{t("report.edit")}</a>
            <a href={`${href("/chat")}#${code}`}>{t("wizard.to-chat")}</a>
          </p>
        </section>
        <section className="border border-border p-4">
          <h2 className="mb-2 text-xl">{t("report.share")}</h2>
          <TermButton
            onClick={async () => {
              if (await copyText(window.location.href)) {
                track("report_share_copy", { license: topLicense });
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
          >
            {copied ? t("common.copied") : t("report.share.copy")}
          </TermButton>
        </section>
      </aside>
    </div>
  );
}
