import type { BlockDefinition } from './types';

// ── Public types ─────────────────────────────────────────────────────────────

export interface PackageInfo {
  id: string;
  name: string;
  description: string;
  url: string;
  builtIn: boolean;
}

export interface LoadedPackage {
  info: PackageInfo;
  blockIds: string[];     // IDs successfully registered from this package
  conflictIds: string[];  // IDs skipped because already registered by another package
}

// ── Internal state ────────────────────────────────────────────────────────────

const registry        = new Map<string, BlockDefinition>(); // id → def
const blockPackageMap = new Map<string, string>();           // blockId → packageId
const loadedPkgMap    = new Map<string, LoadedPackage>();   // packageId → metadata

// ── Package-aware loaders ─────────────────────────────────────────────────────

/** Fetch a package JSON and merge its blocks into the registry (first-registered wins). */
export async function loadPackage(info: PackageInfo): Promise<LoadedPackage> {
  const res = await fetch(info.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${info.url}`);
  const defs: BlockDefinition[] = await res.json();

  const blockIds: string[]    = [];
  const conflictIds: string[] = [];

  for (const def of defs) {
    if (registry.has(def.id)) {
      conflictIds.push(def.id);
    } else {
      registry.set(def.id, def);
      blockPackageMap.set(def.id, info.id);
      blockIds.push(def.id);
    }
  }

  const loaded: LoadedPackage = { info, blockIds, conflictIds };
  loadedPkgMap.set(info.id, loaded);
  return loaded;
}

/** Remove all blocks that belong to a package. No-op if not loaded. */
export function unloadPackage(packageId: string): void {
  const loaded = loadedPkgMap.get(packageId);
  if (!loaded) return;
  for (const id of loaded.blockIds) {
    registry.delete(id);
    blockPackageMap.delete(id);
  }
  loadedPkgMap.delete(packageId);
}

/** All currently-loaded packages in load order. */
export function getLoadedPackages(): LoadedPackage[] {
  return Array.from(loadedPkgMap.values());
}

/** Which package owns a block ID (undefined if unknown). */
export function getBlockPackageId(blockId: string): string | undefined {
  return blockPackageMap.get(blockId);
}

// ── Read API (signatures unchanged) ──────────────────────────────────────────

export function getDefinition(id: string): BlockDefinition {
  const def = registry.get(id);
  if (!def) throw new Error(`Block definition not found: "${id}"`);
  return def;
}

export function getAllDefinitions(): BlockDefinition[] {
  return [...registry.values()];
}

export function getCategories(): string[] {
  return [...new Set(getAllDefinitions().map(d => d.category))];
}

// ── Bootstrap helper (backward-compatible) ────────────────────────────────────

/** Load the initial/core block set. Clears all prior registry state first. */
export async function loadBlockRegistry(url: string): Promise<void> {
  registry.clear();
  blockPackageMap.clear();
  loadedPkgMap.clear();
  await loadPackage({ id: '__core__', name: 'Core', description: 'Built-in blocks', url, builtIn: true });
}
