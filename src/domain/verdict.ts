import type { Family, Verdict } from "./schema";

/** Language-independent verdict symbols. */
export const VERDICT_SYMBOL: Record<Verdict, string> = {
  allow: "✓",
  conditional: "◐",
  deny: "✗",
  silent: "—",
  tbd: "?",
};

export const VERDICT_CLASS: Record<Verdict, string> = {
  allow: "text-verdict-allow",
  conditional: "text-verdict-conditional",
  deny: "text-verdict-deny",
  silent: "text-verdict-silent",
  tbd: "text-verdict-tbd",
};

export const FAMILY_CLASS: Record<Family, { text: string; bg: string; border: string }> = {
  permissive: { text: "text-family-permissive", bg: "bg-family-permissive", border: "border-family-permissive" },
  "weak-copyleft": { text: "text-family-weak-copyleft", bg: "bg-family-weak-copyleft", border: "border-family-weak-copyleft" },
  "strong-copyleft": { text: "text-family-strong-copyleft", bg: "bg-family-strong-copyleft", border: "border-family-strong-copyleft" },
  "network-copyleft": { text: "text-family-network-copyleft", bg: "bg-family-network-copyleft", border: "border-family-network-copyleft" },
  "source-available": { text: "text-family-source-available", bg: "bg-family-source-available", border: "border-family-source-available" },
  model: { text: "text-family-model", bg: "bg-family-model", border: "border-family-model" },
  content: { text: "text-family-content", bg: "bg-family-content", border: "border-family-content" },
};
