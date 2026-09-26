/**
 * Indexed, read-only view of all data. Every lookup used by pages, the rule
 * engine and the worker is O(1) through Maps built once here.
 */
import type {
  AliasData,
  CellData,
  CompatData,
  EngineRules,
  LicenseData,
  LicenseText,
  MatrixData,
  MatrixId,
  ProjectData,
  ScenarioData,
  ScenarioText,
  UiData,
} from "./schema";

export interface RawData {
  licenses: Record<string, LicenseData>;
  matrices: MatrixData[];
  scenarios: Record<string, ScenarioData>;
  projects: Record<string, ProjectData>;
  /** key: `${locale}/${licenseSlug}` */
  licenseTexts: Record<string, LicenseText>;
  /** key: `${locale}/${scenarioId}` */
  scenarioTexts: Record<string, ScenarioText>;
  /** key: locale */
  ui: Record<string, UiData>;
  rules: EngineRules;
  compat: CompatData;
  /** licenses referenced by projects that are not in the matrices */
  aliases: Record<string, AliasData>;
}

export interface License extends LicenseData {
  slug: string;
}
export interface Scenario extends ScenarioData {
  id: string;
}
export interface Project extends ProjectData {
  slug: string;
}
export interface Cell extends CellData {
  scenarioId: string;
  license: string;
}

export interface Catalog {
  raw: RawData;
  licenses: Map<string, License>;
  /** sorted by family order then slug */
  licenseList: License[];
  matrices: Map<MatrixId, MatrixData>;
  scenarios: Map<string, Scenario>;
  /** sorted by group then order */
  scenarioList: Scenario[];
  scenariosByMatrix: Map<MatrixId, Scenario[]>;
  /** key: `${scenarioId}:${licenseSlug}` */
  cells: Map<string, Cell>;
  cellsByLicense: Map<string, Cell[]>;
  projects: Map<string, Project>;
  projectList: Project[];
  projectsByLicense: Map<string, Project[]>;
  /** key: cell key -> project slugs cited as real-world cases */
  casesByCell: Map<string, string[]>;
  rules: EngineRules;
  compat: CompatData;
  /** display info for any license id used by projects (catalog licenses + aliases) */
  licenseInfo: (id: string) => { name: string; family?: License["family"]; known: boolean };
}

export const cellKey = (scenarioId: string, license: string) => `${scenarioId}:${license}`;

const FAMILY_ORDER = [
  "permissive",
  "weak-copyleft",
  "strong-copyleft",
  "network-copyleft",
  "source-available",
  "model",
  "content",
];

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildCatalog(raw: RawData): Catalog {
  const licenses = new Map<string, License>();
  for (const [slug, l] of Object.entries(raw.licenses)) licenses.set(slug, { ...l, slug });
  const licenseList = [...licenses.values()].sort(
    (a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || a.slug.localeCompare(b.slug),
  );

  const matrices = new Map<MatrixId, MatrixData>();
  for (const m of raw.matrices) matrices.set(m.id, m);

  const scenarios = new Map<string, Scenario>();
  for (const [id, s] of Object.entries(raw.scenarios)) scenarios.set(id, { ...s, id });
  const scenarioList = [...scenarios.values()].sort((a, b) => a.group.localeCompare(b.group) || a.order - b.order);

  const scenariosByMatrix = new Map<MatrixId, Scenario[]>();
  const cells = new Map<string, Cell>();
  const cellsByLicense = new Map<string, Cell[]>();
  for (const s of scenarioList) {
    push(scenariosByMatrix, s.matrix, s);
    for (const [license, c] of Object.entries(s.cells)) {
      const cell: Cell = { ...c, scenarioId: s.id, license };
      cells.set(cellKey(s.id, license), cell);
      push(cellsByLicense, license, cell);
    }
  }

  const projects = new Map<string, Project>();
  for (const [slug, p] of Object.entries(raw.projects)) projects.set(slug, { ...p, slug });
  const projectList = [...projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  const projectsByLicense = new Map<string, Project[]>();
  for (const p of projectList) for (const l of new Set(p.current)) push(projectsByLicense, l, p);

  const casesByCell = new Map<string, string[]>();
  for (const c of cells.values()) if (c.caseRef) push(casesByCell, cellKey(c.scenarioId, c.license), c.caseRef);

  return {
    raw,
    licenses,
    licenseList,
    matrices,
    scenarios,
    scenarioList,
    scenariosByMatrix,
    cells,
    cellsByLicense,
    projects,
    projectList,
    projectsByLicense,
    casesByCell,
    rules: raw.rules,
    compat: raw.compat,
    licenseInfo: (id) => {
      const l = licenses.get(id);
      if (l) return { name: l.shortName, family: l.family, known: true };
      const a = raw.aliases[id];
      if (a) return { name: a.name, family: a.family, known: true };
      return { name: id, known: false };
    },
  };
}
