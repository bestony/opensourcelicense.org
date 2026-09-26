import { buildCatalog, type Catalog, type RawData } from "@/domain/catalog";
import { loadRawData } from "@/lib/load-data";

let raw: RawData | undefined;
export function realRaw(): RawData {
  raw ??= loadRawData();
  return structuredClone(raw);
}
export function realCatalog(): Catalog {
  return buildCatalog(realRaw());
}
