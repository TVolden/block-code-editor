import type { PackageAction, PackageRef } from '../types';

/**
 * Runs a Packages tab action: the host's `onClick`, or a change to the dependencies the action gives from the current
 * ones (through `change`, as a change made in the tab).
 */
export function runPackageAction(action: PackageAction, current: PackageRef[], change: (to: PackageRef[]) => void): void {
  if ('dependencies' in action) change(action.dependencies(current));
  else action.onClick();
}

/** A package's identity regardless of version: `publisher/name`. */
export function packageKey(p: { publisher: string; name: string }): string {
  return `${p.publisher}/${p.name}`;
}

/** The registry id under which a dependency (one version of a package) is loaded. */
export function dependencyPackageId(ref: PackageRef): string {
  return `${DEPENDENCY_PREFIX}${packageKey(ref)}@${ref.version}`;
}

/** Registry ids of loaded dependencies start with this; other packages (the core, inline blocks) don't. */
export const DEPENDENCY_PREFIX = 'dep:';

/** Compare dotted versions numerically (prerelease suffixes compare as strings). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/), pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '0', y = pb[i] ?? '0';
    const nx = Number(x), ny = Number(y);
    const c = !isNaN(nx) && !isNaN(ny) ? nx - ny : x.localeCompare(y);
    if (c !== 0) return c;
  }
  return 0;
}
