import type { PackageRef, PlacedBlock } from '../../src/types';
import type { CanvasState } from '../../src/commands/types';
import { CommandRejected } from '../../src/commands/types';
import { normalizeBlock } from '../../src/commands/apply';

/** A state as the fixtures write it. */
export interface FixtureState { blocks: PlacedBlock[]; dependencies: PackageRef[] }

export function toState(fixture: FixtureState): CanvasState {
  return { blocks: new Map(fixture.blocks.map(b => [b.instanceId, b])), dependencies: fixture.dependencies };
}

/** A comparable form: blocks normalized and sorted by id; dependencies sorted (the contract treats them as a set). */
export function comparable(state: CanvasState) {
  const key = (d: PackageRef) => `${d.publisher}/${d.name}@${d.version}`;
  return {
    blocks: [...state.blocks.values()].map(normalizeBlock).sort((a, b) => a.instanceId.localeCompare(b.instanceId)),
    dependencies: [...state.dependencies].sort((a, b) => key(a).localeCompare(key(b))),
  };
}

/** The rejection code of a command run, or null when it was applied. */
export function rejectionCode(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (err) {
    if (err instanceof CommandRejected) return err.code;
    throw err;
  }
}

/** A block with defaults: a root at (0, 0) with `slots` empty slots. */
export function block(id: string, fields: Partial<PlacedBlock> & { slots?: number } = {}): PlacedBlock {
  const { slots = 0, ...rest } = fields;
  return {
    instanceId: id, definitionId: 'Def', x: 0, y: 0,
    nextBlockId: null, parentBlockId: null, embeddedInBlockId: null, embeddedSlotIndex: -1,
    paramSlots: Array.from({ length: slots }, () => ({ textValue: null, queryBlockId: null, commandBlockId: null })),
    ...rest,
  };
}
