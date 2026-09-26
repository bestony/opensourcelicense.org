import { useMemo, type ReactNode } from "react";
import { buildCatalog, type Catalog, type RawData } from "@/domain/catalog";
import { DEFAULT_LOCALE, type Locale } from "@/domain/locales";
import type { Verdict } from "@/domain/schema";
import { VERDICT_CLASS, VERDICT_SYMBOL } from "@/domain/verdict";
import { cellNote, createTranslator, licenseText, localizedPath, scenarioText, type Translator } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface IslandProps {
  raw: RawData;
  locale: Locale;
}

export interface IslandContext {
  cat: Catalog;
  t: Translator;
  locale: Locale;
  href: (p: string) => string;
  licenseName: (slug: string) => string;
  licenseSummary: (slug: string) => string | undefined;
  scenarioTitle: (id: string) => string;
  note: (scenarioId: string, slug: string) => string | undefined;
}

export function useIsland({ raw, locale }: IslandProps): IslandContext {
  return useMemo(() => {
    const cat = buildCatalog(raw);
    return {
      cat,
      locale,
      t: createTranslator(raw.ui, locale),
      href: (p: string) => localizedPath(locale, p),
      licenseName: (slug: string) => cat.licenses.get(slug)?.shortName ?? slug,
      licenseSummary: (slug: string) => licenseText(raw, locale, slug)?.value.summary,
      scenarioTitle: (id: string) => scenarioText(raw, locale, id)?.value.title ?? id,
      note: (sid: string, slug: string) => cellNote(raw, locale, sid, slug),
    };
  }, [raw, locale]);
}

export function Verdict({ verdict, label }: { verdict: Verdict; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", VERDICT_CLASS[verdict])} title={label}>
      <span aria-hidden="true" className="text-lg leading-none">
        {VERDICT_SYMBOL[verdict]}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Choice({
  selected,
  onClick,
  children,
  role = "radio",
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  role?: "radio" | "checkbox";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "block w-full border px-3 py-2 text-start transition-colors",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary",
      )}
    >
      <span aria-hidden="true" className="me-2">
        {role === "radio" ? (selected ? "(•)" : "( )") : selected ? "[x]" : "[ ]"}
      </span>
      {children}
    </button>
  );
}

export function TermButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cn("border border-border px-3 py-1 hover:border-primary disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const isDefault = (l: Locale) => l === DEFAULT_LOCALE;
