/**
 * deps.dev v3 license lookup, shared by the Worker (/api/deps) and the PR
 * license check script.
 */
export const DEPS_DEV_SYSTEMS: Record<string, string> = { npm: "NPM", go: "GO", pypi: "PYPI", cargo: "CARGO" };

export type LookupResult =
  | { ok: true; version: string; licenses: string[] }
  | { ok: false; status: number; version?: string };

export async function lookupDepsDev(fetcher: typeof fetch, system: string, name: string, version?: string): Promise<LookupResult> {
  const sys = DEPS_DEV_SYSTEMS[system];
  if (!sys) return { ok: false, status: 400 };
  const base = `https://api.deps.dev/v3/systems/${sys}/packages/${encodeURIComponent(name)}`;
  let resolved = version;
  if (!resolved) {
    const pkg = await fetcher(base);
    if (!pkg.ok) return { ok: false, status: pkg.status };
    const body = (await pkg.json()) as { versions?: { versionKey?: { version?: string }; isDefault?: boolean }[] };
    resolved = body.versions?.find((v) => v.isDefault)?.versionKey?.version;
    if (!resolved) return { ok: false, status: 404 };
  }
  const res = await fetcher(`${base}/versions/${encodeURIComponent(resolved)}`);
  if (!res.ok) return { ok: false, status: res.status, version: resolved };
  const body = (await res.json()) as { licenses?: string[] };
  return { ok: true, version: resolved, licenses: (body.licenses ?? []).filter((l) => l && l !== "non-standard") };
}
