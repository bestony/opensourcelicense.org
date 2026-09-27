/**
 * Curated list of popular license comparison pairs for SEO landing pages.
 * Includes core permissive vs copyleft combinations, real-world relicensing history
 * (e.g. AGPL vs ELv2, BSL vs SSPL, BSL vs FSL), and model/data licenses.
 */
export const POPULAR_PAIRS: readonly [string, string][] = [
  // Permissive vs Permissive / Copyleft
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
  ["mit", "agpl-3.0"],
  ["mit", "elv2"],
  ["mit", "epl-2.0"],
  ["mit", "postgresql"],
  ["mit", "zlib"],
  ["mit", "upl-1.0"],
  ["mit", "llama"],
  ["mit", "cc-by-4.0"],

  // Apache-2.0 comparisons
  ["apache-2.0", "gpl-3.0"],
  ["apache-2.0", "gpl-2.0"],
  ["apache-2.0", "bsd-3-clause"],
  ["apache-2.0", "mpl-2.0"],
  ["apache-2.0", "agpl-3.0"],
  ["apache-2.0", "mulanpsl-2.0"],
  ["apache-2.0", "bsl-1.0"],
  ["apache-2.0", "busl-1.1"],
  ["apache-2.0", "sspl-1.0"],
  ["apache-2.0", "elv2"],
  ["apache-2.0", "confluent-community"],
  ["apache-2.0", "apache-2.0-with-llvm-exception"],
  ["apache-2.0", "fsl-1.1"],
  ["apache-2.0", "epl-2.0"],
  ["apache-2.0", "isc"],
  ["apache-2.0", "upl-1.0"],
  ["apache-2.0", "llama"],
  ["apache-2.0", "openrail-m"],
  ["apache-2.0", "mistral-research"],
  ["apache-2.0", "falcon-llm-2.0"],
  ["apache-2.0", "nvidia-open-model"],
  ["apache-2.0", "deepseek-model"],
  ["apache-2.0", "gemma"],
  ["apache-2.0", "cc-by-4.0"],

  // GPL family comparisons
  ["gpl-2.0", "gpl-3.0"],
  ["gpl-2.0", "agpl-3.0"],
  ["gpl-2.0", "lgpl-2.1"],
  ["gpl-2.0", "bsd-3-clause"],
  ["gpl-2.0", "gpl-2.0-with-classpath-exception"],

  ["gpl-3.0", "agpl-3.0"],
  ["gpl-3.0", "lgpl-3.0"],
  ["gpl-3.0", "bsd-3-clause"],
  ["gpl-3.0", "mulanpsl-2.0"],
  ["gpl-3.0", "epl-2.0"],

  // Weak copyleft & BSD family
  ["lgpl-2.1", "lgpl-3.0"],
  ["lgpl-3.0", "mpl-2.0"],
  ["bsd-2-clause", "bsd-3-clause"],
  ["bsd-3-clause", "isc"],
  ["bsd-3-clause", "busl-1.1"],
  ["bsd-3-clause", "rsalv2"],
  ["bsd-3-clause", "sspl-1.0"],

  // Relicensing & cloud/source-available comparisons
  ["agpl-3.0", "sspl-1.0"],
  ["agpl-3.0", "busl-1.1"],
  ["agpl-3.0", "elv2"],
  ["agpl-3.0", "rsalv2"],
  ["agpl-3.0", "mpl-2.0"],
  ["agpl-3.0", "lgpl-3.0"],

  ["busl-1.1", "sspl-1.0"],
  ["busl-1.1", "elv2"],
  ["busl-1.1", "fsl-1.1"],
  ["busl-1.1", "confluent-community"],

  ["mpl-2.0", "busl-1.1"],
  ["epl-2.0", "mpl-2.0"],
  ["epl-1.0", "epl-2.0"],
  ["cddl-1.0", "epl-2.0"],
  ["cddl-1.0", "gpl-2.0"],

  ["rsalv2", "sspl-1.0"],
  ["artistic-2.0", "perl-5"],

  // Public domain & Creative Commons
  ["cc0-1.0", "unlicense"],
  ["cc-by-4.0", "cc-by-nc-4.0"],
  ["cc-by-4.0", "cc0-1.0"],
  ["cc-by-4.0", "cc-by-sa-4.0"],
  ["cc-by-nc-4.0", "cc-by-nc-sa-4.0"],
  ["cc-by-4.0", "odc-by-1.0"],
  ["cc-by-sa-4.0", "odbl-1.0"],

  // AI model licenses
  ["llama", "openrail-m"],
  ["gemma", "llama"],
  ["deepseek-model", "llama"],
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
