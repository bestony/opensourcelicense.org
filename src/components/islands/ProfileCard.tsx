import { PROFILE_FIELDS, type Profile, type ProfileField } from "@/domain/profile";
import type { Translator } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { STEPS } from "./wizard-steps";

/** Profile as a definition list. With onChange, values become editable selects. */
export function ProfileCard({
  profile,
  t,
  onChange,
  highlight = [],
}: {
  profile: Profile;
  t: Translator;
  onChange?: (patch: Partial<Profile>) => void;
  highlight?: ProfileField[];
}) {
  const render = (f: ProfileField) => {
    const v = profile[f];
    if (f === "dependencies") return v && (v as string[]).length ? (v as string[]).join(", ") : t("common.none");
    if (f === "avoid") return (v as string[]).length ? (v as string[]).map((a) => t(`opt.avoid.${a}`)).join(" · ") : t("common.none");
    return v ? t(`opt.${f}.${v}`) : "—";
  };
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
      {PROFILE_FIELDS.map((f) => {
        const step = STEPS.find((s) => s.field === f)!;
        return (
          <div key={f} className={cn("contents", highlight.includes(f) && "[&>dd]:text-primary")}>
            <dt className="text-muted-foreground">{t(`q.${f}`)}</dt>
            <dd>
              {onChange && step.kind === "single" ? (
                <select
                  className="w-full border border-border bg-background px-1"
                  value={(profile[f] as string | undefined) ?? ""}
                  aria-label={t(`q.${f}`)}
                  onChange={(e) => onChange({ [f]: e.target.value || undefined })}
                >
                  <option value="">—</option>
                  {step.options.map((o) => (
                    <option key={o} value={o}>
                      {t(`opt.${f}.${o}`)}
                    </option>
                  ))}
                </select>
              ) : onChange && step.kind === "multi" ? (
                <span className="flex flex-wrap gap-1">
                  {step.options.map((o) => {
                    const on = profile.avoid.includes(o as Profile["avoid"][number]);
                    return (
                      <button
                        type="button"
                        key={o}
                        aria-pressed={on}
                        className={cn("border px-1 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}
                        onClick={() =>
                          onChange({
                            avoid: on ? profile.avoid.filter((a) => a !== o) : [...profile.avoid, o as Profile["avoid"][number]],
                          })
                        }
                      >
                        {t(`opt.avoid.${o}`)}
                      </button>
                    );
                  })}
                </span>
              ) : (
                render(f)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
