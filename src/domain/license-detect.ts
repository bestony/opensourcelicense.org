/**
 * Identifies a LICENSE file by comparing its words with the official texts.
 * Uses the Sørensen–Dice coefficient over word bigrams; robust to copyright
 * lines, whitespace and small edits.
 */
function bigrams(text: string): Map<string, number> {
  const words = text
    .toLowerCase()
    .replace(/^\s*copyright\b.*$/gim, " ")
    .replace(/[^a-z0-9一-鿿]+/g, " ")
    .split(" ")
    .filter(Boolean);
  const out = new Map<string, number>();
  for (let i = 0; i + 1 < words.length; i++) {
    const g = `${words[i]} ${words[i + 1]}`;
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

function dice(a: Map<string, number>, b: Map<string, number>): number {
  let inter = 0;
  let total = 0;
  for (const v of a.values()) total += v;
  for (const v of b.values()) total += v;
  for (const [g, n] of a) inter += Math.min(n, b.get(g) ?? 0);
  return total ? (2 * inter) / total : 0;
}

export interface Detection {
  license: string;
  score: number;
}

export type ReferenceTexts = Record<string, string>;

/** Best match among reference texts, or undefined below `threshold`. */
export function detectLicense(text: string, refs: ReferenceTexts, threshold = 0.85): Detection | undefined {
  const target = bigrams(text);
  let best: Detection | undefined;
  for (const [license, ref] of Object.entries(refs)) {
    const score = dice(target, bigrams(ref));
    if (!best || score > best.score) best = { license, score };
  }
  return best && best.score >= threshold ? { license: best.license, score: Math.round(best.score * 1000) / 1000 } : undefined;
}
