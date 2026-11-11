import { describe, expect, it } from 'vitest';
import type { PackageRef, PlacedBlock } from '../../src/types';
import type { CanvasState, Command } from '../../src/commands/types';
import { applyCommand } from '../../src/commands/apply';
import { invertCommand } from '../../src/commands/invert';
import { changeDependencies, deleteChain, moveChain, placeNewBlock, setSocketText } from '../../src/commands/build';
import { block, comparable } from './helpers';

function state(blocks: PlacedBlock[], dependencies: PackageRef[] = []): CanvasState {
  return { blocks: new Map(blocks.map(b => [b.instanceId, b])), dependencies };
}

/** Applies the action's command, checks that undo restores the state, and returns the state after. */
function perform(before: CanvasState, command: Command | null): CanvasState {
  expect(command).not.toBeNull();
  const after = applyCommand(before, command!);
  expect(comparable(applyCommand(after, invertCommand(command!)))).toEqual(comparable(before));
  return after;
}

const get = (s: CanvasState, id: string) => s.blocks.get(id)!;

// s (start) → a → b, with q in a's socket 0; e has a mouth (slot 1) holding h → h2; r is a loose root.
function sample(): CanvasState {
  return state([
    block('s', { x: 10, y: 20, nextBlockId: 'a' }),
    block('a', { parentBlockId: 's', nextBlockId: 'b', slots: 1, paramSlots: [{ textValue: null, queryBlockId: 'q', commandBlockId: null }] }),
    block('b', { parentBlockId: 'a', slots: 1 }),
    block('q', { embeddedInBlockId: 'a', embeddedSlotIndex: 0 }),
    block('e', { x: 300, y: 50, paramSlots: [
      { textValue: 'Draw', queryBlockId: null, commandBlockId: null },
      { textValue: null, queryBlockId: null, commandBlockId: 'h' },
    ] }),
    block('h', { embeddedInBlockId: 'e', embeddedSlotIndex: 1, nextBlockId: 'h2' }),
    block('h2', { parentBlockId: 'h' }),
    block('r', { x: 500, y: 500 }),
  ]);
}

describe('placeNewBlock', () => {
  it('inserts a root at the rounded drop position', () => {
    const after = perform(sample(), placeNewBlock(sample(), block('n'), { x: 12.4, y: 99.6 }, null));
    expect(get(after, 'n')).toMatchObject({ x: 12, y: 100, parentBlockId: null });
  });

  it('puts the new block at the top of an occupied mouth; the old chain follows it', () => {
    const before = sample();
    const after = perform(before, placeNewBlock(before, block('n'), { x: 320, y: 90 }, { mouth: 'e', slot: 1 }));
    expect(get(after, 'e').paramSlots[1].commandBlockId).toBe('n');
    expect(get(after, 'n')).toMatchObject({ embeddedInBlockId: 'e', embeddedSlotIndex: 1, nextBlockId: 'h' });
    expect(get(after, 'h')).toMatchObject({ parentBlockId: 'n', embeddedInBlockId: null, nextBlockId: 'h2' });
  });

  it('clears a socket\'s typed text before putting a query in it', () => {
    const before = state([block('x', { x: 5, y: 5, paramSlots: [{ textValue: '3', queryBlockId: null, commandBlockId: null }] })]);
    const after = perform(before, placeNewBlock(before, block('n'), { x: 50, y: 5 }, { socket: 'x', slot: 0 }));
    expect(get(after, 'x').paramSlots[0]).toEqual({ textValue: null, queryBlockId: 'n', commandBlockId: null });
  });
});

describe('moveChain', () => {
  it('changes nothing when a block is dropped back where it is', () => {
    expect(moveChain(sample(), 'b', { x: 77, y: 77 }, { next: 'a' })).toBeNull();
    expect(moveChain(sample(), 'h', { x: 77, y: 77 }, { mouth: 'e', slot: 1 })).toBeNull();
  });

  it('detaches a block with the blocks under it into a root', () => {
    const after = perform(sample(), moveChain(sample(), 'a', { x: 200.2, y: 200.7 }, null));
    expect(get(after, 's').nextBlockId).toBeNull();
    expect(get(after, 'a')).toMatchObject({ x: 200, y: 201, parentBlockId: null, nextBlockId: 'b' });
  });

  it('moves a root, and changes nothing when it stays put', () => {
    const after = perform(sample(), moveChain(sample(), 'r', { x: 510, y: 490 }, null));
    expect(get(after, 'r')).toMatchObject({ x: 510, y: 490 });
    expect(moveChain(sample(), 'r', { x: 500.3, y: 499.8 }, null)).toBeNull();
  });

  it('moves a chain out of one place into another', () => {
    const after = perform(sample(), moveChain(sample(), 'h', { x: 0, y: 0 }, { next: 'b' }));
    expect(get(after, 'e').paramSlots[1].commandBlockId).toBeNull();
    expect(get(after, 'b').nextBlockId).toBe('h');
    expect(get(after, 'h')).toMatchObject({ parentBlockId: 'b', embeddedInBlockId: null, nextBlockId: 'h2' });
  });
});

describe('deleteChain', () => {
  it('removes a block with everything hanging off it, and nothing else', () => {
    const after = perform(sample(), deleteChain(sample(), 'a'));
    expect([...after.blocks.keys()].sort()).toEqual(['e', 'h', 'h2', 'r', 's']);
    expect(get(after, 's').nextBlockId).toBeNull();
  });

  it('removes a C-block with its mouth\'s chain', () => {
    const after = perform(sample(), deleteChain(sample(), 'e'));
    expect([...after.blocks.keys()].sort()).toEqual(['a', 'b', 'q', 'r', 's']);
  });
});

describe('setSocketText', () => {
  it('sets text, and changes nothing when the value is the same (empty is no text)', () => {
    const after = perform(sample(), setSocketText('b', 0, null, '4'));
    expect(get(after, 'b').paramSlots[0].textValue).toBe('4');
    expect(setSocketText('b', 0, null, '')).toBeNull();
  });

  it('is rejected when the text changed since editing started', () => {
    const changed = applyCommand(sample(), { type: 'SetText', blockId: 'b', slot: 0, from: null, to: '2' });
    expect(() => applyCommand(changed, setSocketText('b', 0, null, '4')!)).toThrow(/changed/);
  });
});

describe('changeDependencies', () => {
  const deps: PackageRef[] = [{ publisher: 'p', name: 'x', version: '1.0.0' }];

  it('stitches the chain around a removed block and removes what it holds', () => {
    const before = { ...sample(), dependencies: deps };
    const after = perform(before, changeDependencies(before, [], ['a']));
    expect(after.blocks.has('a')).toBe(false);
    expect(after.blocks.has('q')).toBe(false);
    expect(get(after, 's').nextBlockId).toBe('b');
    expect(get(after, 'b').parentBlockId).toBe('s');
    expect(after.dependencies).toEqual([]);
  });

  it('moves the successor of a removed mouth head into the mouth', () => {
    const after = perform(sample(), changeDependencies(sample(), [], ['h']));
    expect(get(after, 'e').paramSlots[1].commandBlockId).toBe('h2');
    expect(get(after, 'h2')).toMatchObject({ embeddedInBlockId: 'e', embeddedSlotIndex: 1, parentBlockId: null });
  });

  it('makes the successor of a removed root a root where it was', () => {
    const after = perform(sample(), changeDependencies(sample(), [], ['s']));
    expect(get(after, 'a')).toMatchObject({ x: 10, y: 20, parentBlockId: null, nextBlockId: 'b' });
  });

  it('handles removed blocks next to each other', () => {
    const after = perform(sample(), changeDependencies(sample(), [], ['a', 'b']));
    expect(get(after, 's').nextBlockId).toBeNull();
    expect([...after.blocks.keys()].sort()).toEqual(['e', 'h', 'h2', 'r', 's']);
  });
});
