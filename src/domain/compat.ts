/**
 * Dependency license compatibility. Answers: "may a project under license X
 * be distributed together with a dependency under license Y?"
 */
import type { CompatData } from "./schema";

export type CompatStatus = "compatible" | "conditional" | "incompatible" | "unknown";

export interface CompatIndex {
  classOf: Map<string, string>;
  data: CompatData;
}

export function buildCompatIndex(data: CompatData): CompatIndex {
  const classOf = new Map<string, string>();
  for (const [cls, ids] of Object.entries(data.classes)) for (const id of ids) classOf.set(id.toLowerCase(), cls);
  return { classOf, data };
}

export function normalizeSpdx(id: string): string {
  return id.trim().toLowerCase().replace(/\s+/g, "");
}

export interface CompatResult {
  dependency: string;
  inboundClass?: string;
  status: CompatStatus;
  note?: string;
}

/** Compatibility of one dependency license with a project license (slug). */
export function checkPair(index: CompatIndex, dependency: string, project: string): CompatResult {
  const dep = normalizeSpdx(dependency);
  if (dep === project) return { dependency: dep, status: "compatible", inboundClass: index.classOf.get(dep) };
  const cls = index.classOf.get(dep);
  if (!cls) return { dependency: dep, status: "unknown" };
  const rule = index.data.rules[cls];
  if (!rule) return { dependency: dep, inboundClass: cls, status: "unknown" };
  const note = rule.note;
  if (rule.deny.includes(project)) return { dependency: dep, inboundClass: cls, status: "incompatible", note };
  if (rule.conditional.includes(project)) return { dependency: dep, inboundClass: cls, status: "conditional", note };
  if (rule.allow === "*" || rule.allow.includes(project)) return { dependency: dep, inboundClass: cls, status: "compatible", note };
  if (rule.conditional.includes(project)) return { dependency: dep, inboundClass: cls, status: "conditional", note };
  return { dependency: dep, inboundClass: cls, status: "incompatible", note };
}

/**
 * Handles simple SPDX expressions: "A OR B" picks the best option,
 * "A AND B" takes the worst.
 */
export function checkExpression(index: CompatIndex, expression: string, project: string): CompatResult {
  const rank: Record<CompatStatus, number> = { compatible: 3, conditional: 2, unknown: 1, incompatible: 0 };
  const expr = expression.replace(/[()]/g, " ").trim();
  if (/\sOR\s/i.test(expr)) {
    const parts = expr.split(/\s+OR\s+/i).map((p) => checkExpression(index, p, project));
    return { ...parts.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a)), dependency: normalizeSpdx(expression) };
  }
  if (/\sAND\s/i.test(expr)) {
    const parts = expr.split(/\s+AND\s+/i).map((p) => checkExpression(index, p, project));
    return { ...parts.reduce((a, b) => (rank[b.status] < rank[a.status] ? b : a)), dependency: normalizeSpdx(expression) };
  }
  return checkPair(index, expr.replace(/\s+WITH\s+.*/i, ""), project);
}
