/**
 * Pure planning for the R2 page offload. No network or fs.
 */
export interface Manifest {
  version: 1;
  /** R2 key -> content hash */
  files: Record<string, string>;
}

export const emptyManifest = (): Manifest => ({ version: 1, files: {} });

export function parseManifest(text: string | undefined): Manifest {
  if (!text) return emptyManifest();
  try {
    const m = JSON.parse(text) as Partial<Manifest>;
    return m.version === 1 && m.files && typeof m.files === "object" ? { version: 1, files: m.files } : emptyManifest();
  } catch {
    return emptyManifest();
  }
}

export interface UploadPlan {
  put: string[];
  remove: string[];
  unchanged: number;
}

/** Keys to upload (new or changed) and to delete (no longer built). */
export function planUpload(remote: Manifest, local: Manifest): UploadPlan {
  const put: string[] = [];
  let unchanged = 0;
  for (const [key, hash] of Object.entries(local.files)) {
    if (remote.files[key] === hash) unchanged++;
    else put.push(key);
  }
  const remove = Object.keys(remote.files).filter((key) => !(key in local.files));
  return { put: put.sort(), remove: remove.sort(), unchanged };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
