import { useEffect, useState } from "react";
import { emptyProfile, sanitizeProfile, type Profile } from "@/domain/profile";
import { decodeProfile, encodeProfile } from "@/domain/profile-codec";
import { track } from "@/lib/analytics";
import { Choice, TermButton, useIsland, type IslandProps } from "./shared";
import { STEPS } from "./wizard-steps";

export default function Wizard(props: IslandProps) {
  const { t, href } = useIsland(props);
  const [profile, setProfile] = useState<Profile>(emptyProfile());
  const [i, setI] = useState(0);
  const [depInput, setDepInput] = useState("");

  // Resume from "/wizard#<code>" (links from the report page).
  useEffect(() => {
    if (!window.location.hash) return;
    const r = decodeProfile(window.location.hash);
    if (r.ok) setProfile(r.profile);
  }, []);

  const step = STEPS[i];
  const value = profile[step.field];
  const answered = step.optional || (Array.isArray(value) ? value.length > 0 : value !== undefined);
  const last = i === STEPS.length - 1;
  const set = (patch: Partial<Profile>) => setProfile((p) => sanitizeProfile({ ...p, ...patch }));

  const addDeps = () => {
    const ids = depInput.split(/[\s,;]+/).filter(Boolean);
    if (ids.length) set({ dependencies: [...profile.dependencies, ...ids] });
    setDepInput("");
  };

  const next = () => {
    track("wizard_step", { step: i + 1, field: step.field });
    setI(i + 1);
  };

  const restart = () => {
    track("wizard_restart", { step: i + 1 });
    setProfile(emptyProfile());
    setI(0);
  };

  const finish = (path: "/r" | "/chat") => {
    track("wizard_step", { step: i + 1, field: step.field });
    track("wizard_complete", { target: path === "/r" ? "report" : "chat" });
    window.location.href = `${href(path)}#${encodeProfile(profile)}`;
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{t("wizard.step", { n: i + 1, total: STEPS.length })}</span>
        <span className="flex h-2 flex-1 bg-muted" aria-hidden="true">
          <span className="block h-2 bg-primary" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
        </span>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-2xl text-primary">&gt; {t(`q.${step.field}`)}</legend>
        {step.kind === "multi" && <p className="text-sm text-muted-foreground">{t("q.avoid.hint")}</p>}

        {step.kind === "single" && (
          <div role="radiogroup" className="space-y-2">
            {step.options.map((o) => (
              <Choice key={o} selected={value === o} onClick={() => set({ [step.field]: value === o ? undefined : o })}>
                {t(`opt.${step.field}.${o}`)}
              </Choice>
            ))}
          </div>
        )}

        {step.kind === "multi" && (
          <div className="space-y-2">
            {step.options.map((o) => {
              const on = profile.avoid.includes(o as Profile["avoid"][number]);
              return (
                <Choice
                  key={o}
                  role="checkbox"
                  selected={on}
                  onClick={() => set({ avoid: on ? profile.avoid.filter((a) => a !== o) : [...profile.avoid, o as Profile["avoid"][number]] })}
                >
                  {t(`opt.avoid.${o}`)}
                </Choice>
              );
            })}
          </div>
        )}

        {step.kind === "list" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("q.dependencies.hint")}</p>
            <div className="flex gap-2">
              <input
                value={depInput}
                onChange={(e) => setDepInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDeps())}
                className="flex-1 border border-border bg-background px-2 py-1"
                placeholder="GPL-3.0-only, MPL-2.0"
                aria-label={t("q.dependencies")}
              />
              <TermButton onClick={addDeps}>+</TermButton>
            </div>
            <ul className="flex flex-wrap gap-2">
              {profile.dependencies.map((d) => (
                <li key={d} className="inline-flex items-center gap-2 border border-border px-2">
                  {d}
                  <button type="button" aria-label={`${t("compare.remove")} ${d}`} onClick={() => set({ dependencies: profile.dependencies.filter((x) => x !== d) })}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <TermButton onClick={() => setI(i - 1)} disabled={i === 0}>
          ← {t("wizard.prev")}
        </TermButton>
        {!last && (
          <TermButton onClick={next} disabled={!answered} className="border-primary bg-primary text-primary-foreground">
            {step.optional && !answered ? t("wizard.skip") : t("wizard.next")} →
          </TermButton>
        )}
        {last && (
          <TermButton onClick={() => finish("/r")} className="border-primary bg-primary text-primary-foreground">
            {t("wizard.finish")} →
          </TermButton>
        )}
        <TermButton onClick={restart}>{t("wizard.restart")}</TermButton>
        {last && <TermButton onClick={() => finish("/chat")}>{t("wizard.to-chat")}</TermButton>}
      </div>
    </div>
  );
}
