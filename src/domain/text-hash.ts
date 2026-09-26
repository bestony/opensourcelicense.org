/**
 * Stable hash of a source-language text entry. Translations store the hash of
 * the English entry they were made from; a mismatch marks them stale.
 * FNV-1a 64-bit over canonical JSON: synchronous and identical in Node and browsers.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/** Fields that describe translation state, not content. */
const META = new Set(["reviewed", "sourceHash", "stale"]);

export function sourceHash(entry: Record<string, unknown>): string {
  const content = Object.fromEntries(Object.entries(entry).filter(([k]) => !META.has(k)));
  const s = canonical(content);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}
