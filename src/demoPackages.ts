import type { CatalogPackage, PackageRef } from './types';

/** The dev app's package catalog: the block files in public/packages, offered in the Packages tab. */
export const DEMO_PACKAGES: CatalogPackage[] = [
  { publisher: 'demo', name: 'hand-limit', version: '1.0.0', color: '#3a6ea5',
    description: 'Enforce and inspect player hand size limits' },
  { publisher: 'demo', name: 'scoring', version: '1.0.0', color: '#7A1C5A',
    description: 'Score tracking, point awards, and leaderboard queries' },
  { publisher: 'demo', name: 'motion-ops', version: '1.0.0', color: '#4a8a4a',
    description: 'General-purpose motion, control flow, and math operators' },
];

/** Where a demo package's blocks are (every version is the same file). */
export const demoPackageBlocksUrl = (ref: PackageRef) => `/packages/${ref.name}.json`;
