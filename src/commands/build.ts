/**
 * Builders: the commands a user action becomes. Each builds against a scratch copy of the state, applying every
 * command as it is added, so later commands see what earlier ones did (and a builder can never produce a command that
 * would be rejected against the state it was given).
 */

import type { PackageRef, PlacedBlock } from '../types';
import { applyCommand, fragmentOf, normalizeBlock, normalizeText } from './apply';
import type { CanvasState, Command, Place, Position } from './types';

/** Where a linked block sits while it is moved inside one batch (never visible). */
const PARKED: Position = { x: 0, y: 0 };

class CommandBuilder {
  private state: CanvasState;
  private readonly commands: Command[] = [];

  constructor(state: CanvasState) {
    this.state = state;
  }

  get current(): CanvasState {
    return this.state;
  }

  add(command: Command) {
    this.state = applyCommand(this.state, command);
    this.commands.push(command);
  }

  /** The user action: nothing, one command, or a batch. */
  build(): Command | null {
    if (this.commands.length === 0) return null;
    if (this.commands.length === 1) return this.commands[0];
    return { type: 'Batch', commands: this.commands };
  }
}

/** Commands use integer positions. */
export function roundPosition(p: Position): Position {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** Where a block is linked, or null for a root. */
export function placeOf(state: CanvasState, block: PlacedBlock): Place | null {
  if (block.parentBlockId) return { next: block.parentBlockId };
  if (!block.embeddedInBlockId) return null;
  const slot = state.blocks.get(block.embeddedInBlockId)?.paramSlots[block.embeddedSlotIndex];
  return slot?.commandBlockId === block.instanceId
    ? { mouth: block.embeddedInBlockId, slot: block.embeddedSlotIndex }
    : { socket: block.embeddedInBlockId, slot: block.embeddedSlotIndex };
}

export function samePlace(a: Place, b: Place): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The blocks of a fragment, as they are now (for `RemoveBlocks`). */
function snapshot(state: CanvasState, rootId: string): PlacedBlock[] {
  return fragmentOf(state.blocks, rootId).map(id => normalizeBlock(state.blocks.get(id)!));
}

function lastInChain(state: CanvasState, id: string): string {
  let current = id;
  for (;;) {
    const next = state.blocks.get(current)?.nextBlockId;
    if (!next) return current;
    current = next;
  }
}

/**
 * Links the root `id` into the place. A socket's typed text is cleared first; an occupied mouth gets the chain at its
 * top, and the mouth's old chain follows the chain's last block.
 */
function attachInto(b: CommandBuilder, id: string, place: Place) {
  const block = b.current.blocks.get(id)!;
  const from = { x: block.x, y: block.y };
  if ('socket' in place) {
    const text = normalizeText(b.current.blocks.get(place.socket)?.paramSlots[place.slot]?.textValue);
    if (text !== null) b.add({ type: 'SetText', blockId: place.socket, slot: place.slot, from: text, to: null });
    b.add({ type: 'Attach', id, to: place, from });
    return;
  }
  if ('mouth' in place) {
    const oldHead = b.current.blocks.get(place.mouth)?.paramSlots[place.slot]?.commandBlockId ?? null;
    if (oldHead) {
      b.add({ type: 'Detach', id: oldHead, from: place, to: PARKED });
      b.add({ type: 'Attach', id, to: place, from });
      b.add({ type: 'Attach', id: oldHead, to: { next: lastInChain(b.current, id) }, from: PARKED });
      return;
    }
  }
  b.add({ type: 'Attach', id, to: place, from });
}

/** A new block from the palette, at `at` (a root) or linked into `place`. */
export function placeNewBlock(state: CanvasState, block: PlacedBlock, at: Position, place: Place | null): Command | null {
  const b = new CommandBuilder(state);
  const position = roundPosition(at);
  b.add({ type: 'InsertBlocks', blocks: [normalizeBlock({ ...block, ...position })] });
  if (place) attachInto(b, block.instanceId, place);
  return b.build();
}

/**
 * A block (with what hangs off it) dragged and dropped: linked into `place`, or a root at `drop`. Nothing when it is
 * dropped back where it is.
 */
export function moveChain(state: CanvasState, leadId: string, drop: Position, place: Place | null): Command | null {
  const lead = state.blocks.get(leadId);
  if (!lead) return null;
  const b = new CommandBuilder(state);
  const position = roundPosition(drop);
  const current = placeOf(state, lead);
  if (place && current && samePlace(place, current)) return null;
  if (current) {
    b.add({ type: 'Detach', id: leadId, from: current, to: position });
  } else if (!place && (lead.x !== position.x || lead.y !== position.y)) {
    b.add({ type: 'MoveBlock', id: leadId, from: { x: lead.x, y: lead.y }, to: position });
  }
  if (place) attachInto(b, leadId, place);
  return b.build();
}

/** A block (with what hangs off it) deleted. */
export function deleteChain(state: CanvasState, leadId: string): Command | null {
  const lead = state.blocks.get(leadId);
  if (!lead) return null;
  const b = new CommandBuilder(state);
  const current = placeOf(state, lead);
  if (current) b.add({ type: 'Detach', id: leadId, from: current, to: PARKED });
  b.add({ type: 'RemoveBlocks', blocks: snapshot(b.current, leadId) });
  return b.build();
}

/**
 * A parameter's typed value changed from `from` (the text when editing started, so a change someone else made
 * meanwhile is rejected rather than overwritten) to `to`; nothing when they are the same.
 */
export function setSocketText(blockId: string, slot: number, from: string | null, to: string | null): Command | null {
  const before = normalizeText(from);
  const after = normalizeText(to);
  if (before === after) return null;
  return { type: 'SetText', blockId, slot, from: before, to: after };
}

/**
 * The dependencies changed to `to`, removing the blocks `removedIds` (those of removed packages) first. A removed
 * block takes what it holds (its queries and mouths) with it; the block under it moves up into its place.
 */
export function changeDependencies(state: CanvasState, to: PackageRef[], removedIds: string[]): Command | null {
  const b = new CommandBuilder(state);
  for (const id of removedIds) {
    const block = b.current.blocks.get(id);
    if (!block) continue;   // already removed with a block that held it
    const place = placeOf(b.current, block);
    const successor = block.nextBlockId;
    if (successor) {
      // A successor of a removed root takes its position; otherwise it is parked until it is re-attached.
      const at = place ? PARKED : { x: block.x, y: block.y };
      b.add({ type: 'Detach', id: successor, from: { next: id }, to: at });
    }
    if (place) b.add({ type: 'Detach', id, from: place, to: PARKED });
    b.add({ type: 'RemoveBlocks', blocks: snapshot(b.current, id) });
    if (successor && place) b.add({ type: 'Attach', id: successor, to: place, from: PARKED });
  }
  b.add({ type: 'SetDependencies', from: b.current.dependencies, to });
  return b.build();
}
