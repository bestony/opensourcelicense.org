/**
 * Curated list of popular license comparison pairs for SEO landing pages.
 */
export const POPULAR_PAIRS: readonly [string, string][] = [
  ["mit", "apache-2.0"],
  ["mit", "gpl-3.0"],
  ["mit", "gpl-2.0"],
  ["mit", "bsd-3-clause"],
  ["mit", "bsd-2-clause"],
  ["mit", "isc"],
  ["mit", "unlicense"],
  ["mit", "mit-0"],
  ["mit", "mpl-2.0"],
  ["mit", "cc0-1.0"],
  ["mit", "mulanpsl-2.0"],
  ["mit", "lgpl-3.0"],
  ["mit", "bsl-1.0"],
  ["apache-2.0", "gpl-3.0"],
  ["apache-2.0", "gpl-2.0"],
  ["apache-2.0", "bsd-3-clause"],
  ["apache-2.0", "mpl-2.0"],
  ["apache-2.0", "agpl-3.0"],
  ["apache-2.0", "mulanpsl-2.0"],
  ["apache-2.0", "bsl-1.0"],
  ["gpl-2.0", "gpl-3.0"],
  ["gpl-3.0", "agpl-3.0"],
  ["gpl-3.0", "lgpl-3.0"],
  ["gpl-3.0", "bsd-3-clause"],
  ["lgpl-2.1", "lgpl-3.0"],
  ["lgpl-3.0", "mpl-2.0"],
  ["bsd-2-clause", "bsd-3-clause"],
  ["cc0-1.0", "unlicense"],
  ["agpl-3.0", "sspl-1.0"],
  ["busl-1.1", "sspl-1.0"],
  ["agpl-3.0", "busl-1.1"],
  ["epl-2.0", "mpl-2.0"],
] as const;

export function pairKey(slugA: string, slugB: string): string {
  return `${slugA}-vs-${slugB}`;
}

export function parsePairKey(pair: string): [string, string] | undefined {
  const parts = pair.split("-vs-");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return [parts[0], parts[1]];
  }
  return undefined;
}

export function findCanonicalPair(slugA: string, slugB: string): string | undefined {
  for (const [a, b] of POPULAR_PAIRS) {
    if ((a === slugA && b === slugB) || (a === slugB && b === slugA)) {
      return pairKey(a, b);
    }
  }
  return undefined;
}
