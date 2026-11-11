import type { PackageRef, ParamSlot, PlacedBlock } from '../types';
import type {
  Attach, Batch, CanvasState, Command, Detach, InsertBlocks, MoveBlock, Place, RemoveBlocks, SetDependencies, SetText,
} from './types';
import { CommandRejected } from './types';

/**
 * Applies a command to the state and returns the new state; throws `CommandRejected` (leaving the state unchanged)
 * when one of its checks fails. Pure: the given state is never modified. See docs/commands.md.
 */
export function applyCommand(state: CanvasState, command: Command): CanvasState {
  switch (command.type) {
    case 'InsertBlocks':    return insertBlocks(state, command);
    case 'RemoveBlocks':    return removeBlocks(state, command);
    case 'MoveBlock':       return moveBlock(state, command);
    case 'Attach':          return attach(state, command);
    case 'Detach':          return detach(state, command);
    case 'SetText':         return setText(state, command);
    case 'SetDependencies': return setDependencies(state, command);
    case 'Batch':           return batch(state, command);
    default:
      throw new CommandRejected('INVALID_COMMAND', `Unknown command type '${(command as { type?: unknown }).type}'.`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A slot in its canonical form: all three fields present. */
export function normalizeSlot(slot: ParamSlot | undefined): ParamSlot {
  return {
    textValue:      slot?.textValue ?? null,
    queryBlockId:   slot?.queryBlockId ?? null,
    commandBlockId: slot?.commandBlockId ?? null,
  };
}

/**
 * A block in its canonical form: all slot fields present, and a linked block at (0, 0) (only a root's position means
 * anything; the others are laid out by the block they hang off).
 */
export function normalizeBlock(block: PlacedBlock): PlacedBlock {
  const position = isRoot(block) ? { x: block.x, y: block.y } : { x: 0, y: 0 };
  return { ...block, ...position, paramSlots: block.paramSlots.map(normalizeSlot) };
}

/** Empty text is no text. */
export function normalizeText(text: string | null | undefined): string | null {
  return text === undefined || text === null || text === '' ? null : text;
}

function requireBlock(state: CanvasState, id: string): PlacedBlock {
  const block = state.blocks.get(id);
  if (!block) throw new CommandRejected('BLOCK_NOT_FOUND', `Block '${id}' doesn't exist.`);
  return block;
}

function isRoot(block: PlacedBlock): boolean {
  return !block.parentBlockId && !block.embeddedInBlockId;
}

/** The ids a block's slots and next link point to. */
function linksOf(block: PlacedBlock): string[] {
  const ids: string[] = [];
  if (block.nextBlockId) ids.push(block.nextBlockId);
  for (const slot of block.paramSlots) {
    if (slot.queryBlockId) ids.push(slot.queryBlockId);
    if (slot.commandBlockId) ids.push(slot.commandBlockId);
  }
  return ids;
}

/** The ids of a block and everything hanging off it: the blocks below it, its queries and its mouths' chains. */
export function fragmentOf(blocks: Map<string, PlacedBlock>, id: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    const block = blocks.get(current);
    if (!block) continue;
    seen.add(current);
    result.push(current);
    queue.push(...linksOf(block));
  }
  return result;
}

/**
 * Checks that the blocks form one self-contained fragment: a single root, every link pointing inside, the back links
 * (parent / embedded-in) matching the forward links, and every block reachable from the root. Returns the root.
 */
function requireFragment(blocks: PlacedBlock[]): PlacedBlock {
  const notAFragment = (why: string) => new CommandRejected('NOT_A_FRAGMENT', `The blocks aren't one fragment: ${why}.`);
  if (blocks.length === 0) throw new CommandRejected('INVALID_COMMAND', 'The command has no blocks.');
  const byId = new Map<string, PlacedBlock>();
  for (const block of blocks) {
    if (byId.has(block.instanceId)) throw notAFragment(`'${block.instanceId}' is given twice`);
    byId.set(block.instanceId, block);
  }
  const roots = blocks.filter(isRoot);
  if (roots.length !== 1) throw notAFragment(`it has ${roots.length} roots`);

  for (const block of blocks) {
    if (block.nextBlockId) {
      const next = byId.get(block.nextBlockId);
      if (!next || next.parentBlockId !== block.instanceId || next.embeddedInBlockId)
        throw notAFragment(`the block under '${block.instanceId}' doesn't match`);
    }
    block.paramSlots.forEach((slot, index) => {
      for (const childId of [slot.queryBlockId, slot.commandBlockId]) {
        if (!childId) continue;
        const child = byId.get(childId);
        if (!child || child.embeddedInBlockId !== block.instanceId || child.embeddedSlotIndex !== index || child.parentBlockId)
          throw notAFragment(`slot ${index} of '${block.instanceId}' doesn't match`);
      }
    });
    if (block.parentBlockId) {
      const parent = byId.get(block.parentBlockId);
      if (!parent || parent.nextBlockId !== block.instanceId)
        throw notAFragment(`the block above '${block.instanceId}' doesn't match`);
    }
    if (block.embeddedInBlockId) {
      const slot = byId.get(block.embeddedInBlockId)?.paramSlots[block.embeddedSlotIndex];
      if (!slot || (slot.queryBlockId !== block.instanceId && slot.commandBlockId !== block.instanceId))
        throw notAFragment(`the block holding '${block.instanceId}' doesn't match`);
    }
  }

  if (fragmentOf(byId, roots[0].instanceId).length !== blocks.length) throw notAFragment('not every block hangs off the root');
  return roots[0];
}

function sameBlock(a: PlacedBlock, b: PlacedBlock): boolean {
  return JSON.stringify(normalizeBlock(a)) === JSON.stringify(normalizeBlock(b));
}

function withSlot(block: PlacedBlock, index: number, change: Partial<ParamSlot>): PlacedBlock {
  const slots = block.paramSlots.map(normalizeSlot);
  slots[index] = { ...slots[index], ...change };
  return { ...block, paramSlots: slots };
}

function requireSlot(block: PlacedBlock, index: number): ParamSlot {
  if (!Number.isInteger(index) || index < 0 || index >= block.paramSlots.length)
    throw new CommandRejected('NO_SUCH_SLOT', `Block '${block.instanceId}' has no slot ${index}.`);
  return normalizeSlot(block.paramSlots[index]);
}

function requireAt(block: PlacedBlock, at: { x: number; y: number }) {
  if (block.x !== at.x || block.y !== at.y)
    throw new CommandRejected('POSITION_CHANGED', `Block '${block.instanceId}' isn't at (${at.x}, ${at.y}).`);
}

function requireRoot(block: PlacedBlock) {
  if (!isRoot(block)) throw new CommandRejected('NOT_A_ROOT', `Block '${block.instanceId}' is linked, not a root.`);
}

const dependencyKey = (d: PackageRef) => `${d.publisher}/${d.name}@${d.version}`;

function sameDependencies(a: PackageRef[], b: PackageRef[]): boolean {
  const keys = new Set(a.map(dependencyKey));
  return a.length === b.length && keys.size === new Set(b.map(dependencyKey)).size && b.every(d => keys.has(dependencyKey(d)));
}

// ── Commands ──────────────────────────────────────────────────────────────────

function insertBlocks(state: CanvasState, command: InsertBlocks): CanvasState {
  requireFragment(command.blocks);
  for (const block of command.blocks) {
    if (state.blocks.has(block.instanceId))
      throw new CommandRejected('ID_EXISTS', `Block '${block.instanceId}' already exists.`);
  }
  const blocks = new Map(state.blocks);
  for (const block of command.blocks) blocks.set(block.instanceId, normalizeBlock(block));
  return { ...state, blocks };
}

function removeBlocks(state: CanvasState, command: RemoveBlocks): CanvasState {
  requireFragment(command.blocks);
  const ids = new Set<string>();
  for (const given of command.blocks) {
    const block = requireBlock(state, given.instanceId);
    if (!sameBlock(block, given)) throw new CommandRejected('BLOCK_CHANGED', `Block '${given.instanceId}' has changed.`);
    ids.add(given.instanceId);
  }
  for (const block of state.blocks.values()) {
    if (ids.has(block.instanceId)) continue;
    if (linksOf(block).some(id => ids.has(id)))
      throw new CommandRejected('LINKED_FROM_OUTSIDE', `Block '${block.instanceId}' links into the blocks to remove.`);
  }
  const blocks = new Map(state.blocks);
  ids.forEach(id => blocks.delete(id));
  return { ...state, blocks };
}

function moveBlock(state: CanvasState, command: MoveBlock): CanvasState {
  const block = requireBlock(state, command.id);
  requireRoot(block);
  requireAt(block, command.from);
  const blocks = new Map(state.blocks);
  blocks.set(block.instanceId, { ...block, x: command.to.x, y: command.to.y });
  return { ...state, blocks };
}

function attach(state: CanvasState, command: Attach): CanvasState {
  const block = requireBlock(state, command.id);
  requireRoot(block);
  requireAt(block, command.from);
  const place = command.to;
  const targetId = 'next' in place ? place.next : 'mouth' in place ? place.mouth : place.socket;
  const target = requireBlock(state, targetId);
  if (fragmentOf(state.blocks, block.instanceId).includes(targetId))
    throw new CommandRejected('CYCLE', `Block '${targetId}' is inside the fragment of '${block.instanceId}'.`);

  const blocks = new Map(state.blocks);
  if ('next' in place) {
    if (target.nextBlockId) throw new CommandRejected('PLACE_OCCUPIED', `Block '${targetId}' already has a block under it.`);
    blocks.set(targetId, { ...target, nextBlockId: block.instanceId });
    blocks.set(block.instanceId, { ...block, x: 0, y: 0, parentBlockId: targetId });
    return { ...state, blocks };
  }

  const slot = requireSlot(target, place.slot);
  if ('mouth' in place) {
    if (slot.commandBlockId || slot.queryBlockId)
      throw new CommandRejected('PLACE_OCCUPIED', `Mouth ${place.slot} of '${targetId}' isn't empty.`);
    blocks.set(targetId, withSlot(target, place.slot, { commandBlockId: block.instanceId }));
  } else {
    if (slot.queryBlockId || slot.commandBlockId || slot.textValue !== null)
      throw new CommandRejected('PLACE_OCCUPIED', `Socket ${place.slot} of '${targetId}' isn't empty.`);
    blocks.set(targetId, withSlot(target, place.slot, { queryBlockId: block.instanceId }));
  }
  blocks.set(block.instanceId, { ...block, x: 0, y: 0, embeddedInBlockId: targetId, embeddedSlotIndex: place.slot });
  return { ...state, blocks };
}

/** Whether the block is linked at exactly the place. */
function isAt(state: CanvasState, block: PlacedBlock, place: Place): boolean {
  if ('next' in place) {
    return block.parentBlockId === place.next && state.blocks.get(place.next)?.nextBlockId === block.instanceId;
  }
  const hostId = 'mouth' in place ? place.mouth : place.socket;
  if (block.embeddedInBlockId !== hostId || block.embeddedSlotIndex !== place.slot) return false;
  const slot = normalizeSlot(state.blocks.get(hostId)?.paramSlots[place.slot]);
  return ('mouth' in place ? slot.commandBlockId : slot.queryBlockId) === block.instanceId;
}

function detach(state: CanvasState, command: Detach): CanvasState {
  const block = requireBlock(state, command.id);
  if (!isAt(state, block, command.from))
    throw new CommandRejected('NOT_AT_PLACE', `Block '${block.instanceId}' isn't linked at the given place.`);
  const blocks = new Map(state.blocks);
  const place = command.from;
  if ('next' in place) {
    const parent = blocks.get(place.next)!;
    blocks.set(place.next, { ...parent, nextBlockId: null });
  } else {
    const hostId = 'mouth' in place ? place.mouth : place.socket;
    const change = 'mouth' in place ? { commandBlockId: null } : { queryBlockId: null };
    blocks.set(hostId, withSlot(blocks.get(hostId)!, place.slot, change));
  }
  blocks.set(block.instanceId, {
    ...block, x: command.to.x, y: command.to.y,
    parentBlockId: null, embeddedInBlockId: null, embeddedSlotIndex: -1,
  });
  return { ...state, blocks };
}

function setText(state: CanvasState, command: SetText): CanvasState {
  const block = requireBlock(state, command.blockId);
  const slot = requireSlot(block, command.slot);
  if (slot.queryBlockId)
    throw new CommandRejected('SLOT_HAS_QUERY', `Slot ${command.slot} of '${block.instanceId}' holds a query.`);
  if (normalizeText(slot.textValue) !== normalizeText(command.from))
    throw new CommandRejected('TEXT_CHANGED', `Slot ${command.slot} of '${block.instanceId}' has changed.`);
  const blocks = new Map(state.blocks);
  blocks.set(block.instanceId, withSlot(block, command.slot, { textValue: normalizeText(command.to) }));
  return { ...state, blocks };
}

function setDependencies(state: CanvasState, command: SetDependencies): CanvasState {
  if (!sameDependencies(state.dependencies, command.from))
    throw new CommandRejected('DEPENDENCIES_CHANGED', 'The dependencies have changed.');
  return { ...state, dependencies: command.to.map(d => ({ publisher: d.publisher, name: d.name, version: d.version })) };
}

function batch(state: CanvasState, command: Batch): CanvasState {
  return command.commands.reduce(applyCommand, state);
}
