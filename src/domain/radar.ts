/** Radar scores (0..1) per dimension, derived from the scenario matrix. */
import { cellKey, type Catalog } from "./catalog";
import type { MatrixId } from "./schema";

export interface RadarPoint {
  id: string;
  value: number;
}

export function computeRadar(cat: Catalog, license: string, matrix: MatrixId): RadarPoint[] {
  const dims = cat.rules.radar[matrix] ?? [];
  return dims.map((d) => {
    let sum = 0;
    let n = 0;
    for (const id of d.scenarios) {
      const cell = cat.cells.get(cellKey(id, license));
      if (!cell) continue;
      sum += d.score[cell.verdict] ?? 0;
      n++;
    }
    return { id: d.id, value: n ? Math.round((sum / n) * 100) / 100 : 0 };
  });
}
