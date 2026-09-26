import { checkExpression, type CompatIndex, type CompatStatus } from "../compat";
import type { Dep } from "./index";

export interface DepVerdict extends Dep {
  status: CompatStatus;
  note?: string;
}

const RANK: Record<CompatStatus, number> = { incompatible: 0, conditional: 1, unknown: 2, compatible: 3 };

/** Evaluates each dependency against the project license; worst first. */
export function evaluateDeps(deps: Dep[], project: string, idx: CompatIndex): DepVerdict[] {
  return deps
    .map((d): DepVerdict => {
      if (!d.license) return { ...d, status: "unknown" };
      const r = checkExpression(idx, d.license, project);
      return { ...d, status: r.status, note: r.note };
    })
    .sort((a, b) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name));
}

export function summarizeVerdicts(v: DepVerdict[]): Record<CompatStatus, number> {
  const out: Record<CompatStatus, number> = { compatible: 0, conditional: 0, incompatible: 0, unknown: 0 };
  for (const x of v) out[x.status]++;
  return out;
}
