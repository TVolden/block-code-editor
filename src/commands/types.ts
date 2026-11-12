import type { PackageRef, PlacedBlock } from '../types';

/** The version of the command contract (docs/commands.md). Bumped on any incompatible change. */
export const COMMANDS_VERSION = 1;

/** What commands change: the canvas's blocks (by id) and the packages it depends on. */
export interface CanvasState {
  blocks: Map<string, PlacedBlock>;
  dependencies: PackageRef[];
}

/** A canvas position. Commands use integer coordinates. */
export interface Position {
  x: number;
  y: number;
}

/**
 * Where a block can be linked: under a block (its `next`), at the top of a block's mouth (a command parameter of a
 * command block), or in a block's socket (a query in a parameter).
 */
export type Place =
  | { next: string }
  | { mouth: string; slot: number }
  | { socket: string; slot: number };

/** Adds a detached fragment: one root block and everything hanging off it, linked among themselves. */
export interface InsertBlocks { type: 'InsertBlocks'; blocks: PlacedBlock[] }
/** Removes a detached fragment, given exactly as it is. */
export interface RemoveBlocks { type: 'RemoveBlocks'; blocks: PlacedBlock[] }
/** Moves a root block. */
export interface MoveBlock { type: 'MoveBlock'; id: string; from: Position; to: Position }
/** Links a root block (at `from`) into an empty place. */
export interface Attach { type: 'Attach'; id: string; to: Place; from: Position }
/** Unlinks a block (with what hangs off it) from its place, making it a root at `to`. */
export interface Detach { type: 'Detach'; id: string; from: Place; to: Position }
/** Sets or clears (null) a parameter's typed value. */
export interface SetText { type: 'SetText'; blockId: string; slot: number; from: string | null; to: string | null }
/** Changes the packages the canvas depends on. */
export interface SetDependencies { type: 'SetDependencies'; from: PackageRef[]; to: PackageRef[] }
/** Applies its commands in order, all or nothing. */
export interface Batch { type: 'Batch'; commands: Command[] }

export type Command =
  | InsertBlocks | RemoveBlocks | MoveBlock | Attach | Detach | SetText | SetDependencies | Batch;

/** Why a command was rejected; machine-readable, shared with the backend's implementation. */
export type RejectionCode =
  | 'BLOCK_NOT_FOUND'       // a block the command names doesn't exist
  | 'ID_EXISTS'             // a block to insert already exists
  | 'NOT_A_FRAGMENT'        // the blocks don't form one self-contained fragment with a single root
  | 'BLOCK_CHANGED'         // a block to remove isn't exactly as given
  | 'LINKED_FROM_OUTSIDE'   // a block outside the fragment to remove points into it
  | 'NOT_A_ROOT'            // the block is linked somewhere, but must be a root
  | 'POSITION_CHANGED'      // the root isn't at the position the command expects
  | 'NO_SUCH_SLOT'          // the block has no parameter slot with that index
  | 'PLACE_OCCUPIED'        // the place to attach to isn't empty
  | 'CYCLE'                 // the place is inside the block's own fragment
  | 'NOT_AT_PLACE'          // the block isn't linked at the place the command expects
  | 'SLOT_HAS_QUERY'        // the parameter holds a query, so it has no text
  | 'TEXT_CHANGED'          // the parameter's text isn't what the command expects
  | 'DEPENDENCIES_CHANGED'  // the dependencies aren't what the command expects
  | 'INVALID_COMMAND'       // the command is malformed (unknown type, empty fragment, ...)
  | 'HOST_REJECTED';        // the host refused it for its own reasons (e.g. a package that doesn't exist); the message says why

/** Thrown by `applyCommand` when a command's checks fail. The state is unchanged. */
export class CommandRejected extends Error {
  readonly code: RejectionCode;

  constructor(code: RejectionCode, message: string) {
    super(message);
    this.name = 'CommandRejected';
    this.code = code;
  }
}
