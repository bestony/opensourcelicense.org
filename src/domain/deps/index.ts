/**
 * Dependency manifest parsers. Pure and browser-safe; each returns the
 * dependencies it can see, with a license when the manifest carries one.
 */
export type DepSystem = "npm" | "go" | "pypi" | "cargo" | "rubygems" | "unknown";
export type ManifestFormat = "package-lock.json" | "package.json" | "go.mod" | "requirements.txt" | "Cargo.toml" | "Gemfile.lock" | "license-list";

export interface Dep {
  system: DepSystem;
  name: string;
  /** exact version when known */
  version?: string;
  /** SPDX expression when known locally */
  license?: string;
}

export interface ParseResult {
  format: ManifestFormat;
  deps: Dep[];
}

const MAX_DEPS = 2000;

function exactVersion(v: string | undefined): string | undefined {
  const m = v?.trim().match(/^[=v]?(\d+\.\d+\.\d+(?:[-+][\w.]+)?)$/);
  return m?.[1];
}

function parsePackageLock(obj: Record<string, unknown>): Dep[] {
  const out: Dep[] = [];
  const packages = (obj.packages ?? {}) as Record<string, { version?: string; license?: string; dev?: boolean }>;
  for (const [path, p] of Object.entries(packages)) {
    if (!path) continue; // root project
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    out.push({ system: "npm", name, version: p.version, license: typeof p.license === "string" ? p.license : undefined });
  }
  return out;
}

function parsePackageJson(obj: Record<string, unknown>): Dep[] {
  const deps = { ...(obj.dependencies as object), ...(obj.devDependencies as object), ...(obj.optionalDependencies as object) } as Record<string, string>;
  return Object.entries(deps).map(([name, range]) => ({ system: "npm" as const, name, version: exactVersion(range) }));
}

function parseGoMod(text: string): Dep[] {
  const out: Dep[] = [];
  let inBlock = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (/^require\s*\($/.test(line)) inBlock = true;
    else if (inBlock && line === ")") inBlock = false;
    else {
      const m = (inBlock ? line : line.replace(/^require\s+/, "")).match(/^([\w.\-/~]+)\s+(v[\w.\-+]+)$/);
      if (m && (inBlock || /^require\s/.test(line))) out.push({ system: "go", name: m[1], version: m[2] });
    }
  }
  return out;
}

function parseRequirements(text: string): Dep[] {
  const out: Dep[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line || line.startsWith("-")) continue;
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(?:==\s*([\w.+!-]+))?/);
    if (m) out.push({ system: "pypi", name: m[1].toLowerCase(), version: m[2] });
  }
  return out;
}

function parseCargoToml(text: string): Dep[] {
  const out: Dep[] = [];
  let section = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1];
      continue;
    }
    if (!/(^|\.)(dev-|build-)?dependencies$/.test(section)) continue;
    const m = line.match(/^([\w-]+)\s*=\s*(?:"([^"]+)"|\{.*?version\s*=\s*"([^"]+)".*\}|\{.*\})/);
    if (m) out.push({ system: "cargo", name: m[1], version: exactVersion(m[2] ?? m[3]) });
  }
  return out;
}

function parseGemfileLock(text: string): Dep[] {
  const out: Dep[] = [];
  let inSpecs = false;
  for (const line of text.split("\n")) {
    if (/^\s{2}specs:\s*$/.test(line)) inSpecs = true;
    else if (/^\S/.test(line)) inSpecs = false;
    else if (inSpecs) {
      const m = line.match(/^ {4}([\w.-]+) \(([\w.-]+)\)$/);
      if (m) out.push({ system: "rubygems", name: m[1], version: m[2] });
    }
  }
  return out;
}

/** "name@version LICENSE" or "name LICENSE" per line; the license may be an SPDX expression. */
function parseLicenseList(text: string): Dep[] {
  const out: Dep[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(@?[^\s@]+(?:\/[^\s@]+)?)(?:@(\S+))?\s+(.+)$/);
    if (m) out.push({ system: "unknown", name: m[1], version: m[2], license: m[3].trim() });
  }
  return out;
}

export function detectFormat(text: string): ManifestFormat | undefined {
  const t = text.trim();
  if (t.startsWith("{")) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      if (obj.lockfileVersion && obj.packages) return "package-lock.json";
      if (obj.dependencies || obj.devDependencies || obj.name) return "package.json";
    } catch {
      return undefined;
    }
  }
  if (/^module\s+\S+/m.test(t) && /^go\s+\d/m.test(t)) return "go.mod";
  if (/^\s{2}specs:\s*$/m.test(t) && /^GEM$/m.test(t)) return "Gemfile.lock";
  if (/^\[(package|dependencies|dev-dependencies)\]/m.test(t)) return "Cargo.toml";
  if (/^\S+@?\S*\s+[A-Za-z0-9.+-]+(\s+(OR|AND)\s+\S+)*$/m.test(t) && !/==/.test(t)) return "license-list";
  if (/^[A-Za-z0-9][\w.-]*(\[[^\]]*\])?\s*(==|>=|~=|<|$)/m.test(t)) return "requirements.txt";
  return undefined;
}

export function parseManifest(text: string, format = detectFormat(text)): ParseResult | undefined {
  if (!format) return undefined;
  let deps: Dep[];
  switch (format) {
    case "package-lock.json":
      deps = parsePackageLock(JSON.parse(text));
      break;
    case "package.json":
      deps = parsePackageJson(JSON.parse(text));
      break;
    case "go.mod":
      deps = parseGoMod(text);
      break;
    case "requirements.txt":
      deps = parseRequirements(text);
      break;
    case "Cargo.toml":
      deps = parseCargoToml(text);
      break;
    case "Gemfile.lock":
      deps = parseGemfileLock(text);
      break;
    case "license-list":
      deps = parseLicenseList(text);
      break;
  }
  const seen = new Set<string>();
  const unique = deps.filter((d) => {
    const k = `${d.system}:${d.name}@${d.version ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { format, deps: unique.slice(0, MAX_DEPS) };
}
