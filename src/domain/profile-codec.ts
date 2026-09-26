/**
 * Compact, versioned Profile <-> URL hash codec for shareable reports (/r#...).
 * Layout v1: [1, artifactIdx, opennessIdx, avoidBitmask, adoptionIdx, planIdx, jurisdictionIdx, ...deps]
 * where -1 means "unset". Serialized as JSON, then base64url.
 */
import {
  ADOPTION_GOALS,
  ARTIFACT_TYPES,
  AVOID_KEYS,
  COMMERCIAL_PLANS,
  JURISDICTIONS,
  OPENNESS_LEVELS,
  sanitizeProfile,
  type Profile,
} from "./profile";

const VERSION = 1;

const idx = (list: readonly string[], v: string | undefined) => (v === undefined ? -1 : list.indexOf(v));
const at = <T>(list: readonly T[], i: unknown): T | undefined => (typeof i === "number" && i >= 0 && i < list.length ? list[i] : undefined);

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeProfile(p: Profile): string {
  let mask = 0;
  for (const a of p.avoid) {
    const i = AVOID_KEYS.indexOf(a);
    if (i >= 0) mask |= 1 << i;
  }
  const arr = [
    VERSION,
    idx(ARTIFACT_TYPES, p.artifact_type),
    idx(OPENNESS_LEVELS, p.openness_level),
    mask,
    idx(ADOPTION_GOALS, p.adoption_goal),
    idx(COMMERCIAL_PLANS, p.commercial_plan),
    idx(JURISDICTIONS, p.jurisdiction),
    ...p.dependencies,
  ];
  return toBase64Url(JSON.stringify(arr));
}

export type DecodeResult = { ok: true; profile: Profile } | { ok: false; error: string };

export function decodeProfile(hash: string): DecodeResult {
  try {
    const arr = JSON.parse(fromBase64Url(hash.replace(/^#/, "")));
    if (!Array.isArray(arr) || arr[0] !== VERSION) return { ok: false, error: "unsupported-version" };
    const mask = typeof arr[3] === "number" ? arr[3] : 0;
    return {
      ok: true,
      profile: sanitizeProfile({
        artifact_type: at(ARTIFACT_TYPES, arr[1]),
        openness_level: at(OPENNESS_LEVELS, arr[2]),
        avoid: AVOID_KEYS.filter((_, i) => mask & (1 << i)),
        adoption_goal: at(ADOPTION_GOALS, arr[4]),
        commercial_plan: at(COMMERCIAL_PLANS, arr[5]),
        jurisdiction: at(JURISDICTIONS, arr[6]),
        dependencies: arr.slice(7),
      }),
    };
  } catch {
    return { ok: false, error: "malformed" };
  }
}
