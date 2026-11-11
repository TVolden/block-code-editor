import { describe, expect, it } from 'vitest';
import type { CanvasState, Command } from '../../src/commands/types';
import type { CommandEnvelope } from '../../src/collaboration/types';
import {
  canUndoRedo, initialSync, onApplied, onRejected, onSnapshot, preview, submitAction, submitRedo, submitUndo,
} from '../../src/collaboration/sync';
import { block } from '../commands/helpers';

const empty: CanvasState = { blocks: new Map(), dependencies: [] };
const insert = (id: string, x = 0): Command => ({ type: 'InsertBlocks', blocks: [block(id, { x, y: 0 })] });
const envelope = (id: string, command: Command, clientId = 'me'): CommandEnvelope => ({ id, clientId, baseVersion: 0, command });

describe('sync state', () => {
  it('keeps an action pending until it is applied, then makes it undoable', () => {
    let sync = submitAction(initialSync(empty), 'c1', insert('a'));
    expect(sync.confirmed.blocks.size).toBe(0);
    expect(preview(sync).state.blocks.has('a')).toBe(true);
    expect(preview(sync).provisionalIds).toEqual(new Set(['a']));

    sync = onApplied(sync, envelope('c1', insert('a')), 1).sync;
    expect(sync.pending).toEqual([]);
    expect(sync.confirmed.blocks.has('a')).toBe(true);
    expect(sync.version).toBe(1);
    expect(sync.undo).toHaveLength(1);
    expect(preview(sync).provisionalIds.size).toBe(0);
  });

  it('drops a rejected action', () => {
    let sync = submitAction(initialSync(empty), 'c1', insert('a'));
    const result = onRejected(sync, 'c1');
    sync = result.sync;
    expect(result.action?.id).toBe('c1');
    expect(sync.pending).toEqual([]);
    expect(preview(sync).state.blocks.size).toBe(0);
    expect(sync.undo).toEqual([]);
  });

  it('applies others\' commands first and keeps own pending actions on top', () => {
    let sync = submitAction(initialSync(empty), 'c1', insert('a'));
    sync = onApplied(sync, envelope('o1', insert('b'), 'other'), 1).sync;
    expect(sync.confirmed.blocks.has('b')).toBe(true);
    expect(sync.pending).toHaveLength(1);
    expect([...preview(sync).state.blocks.keys()].sort()).toEqual(['a', 'b']);
    expect(sync.undo).toEqual([]);   // others' actions are never in this client's history
  });

  it('stops the preview at the first pending action that no longer applies', () => {
    let sync = submitAction(initialSync(empty), 'c1', insert('a'));
    sync = submitAction(sync, 'c2', { type: 'MoveBlock', id: 'a', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } });
    // Someone else inserts 'a' first: c1 no longer applies, and c2 (which depends on it) is hidden too.
    sync = onApplied(sync, envelope('o1', insert('a', 100), 'other'), 1).sync;
    const shown = preview(sync).state;
    expect(shown.blocks.get('a')!.x).toBe(100);
    expect(sync.pending).toHaveLength(2);
  });

  it('reports an applied command that doesn\'t fit the confirmed state', () => {
    const result = onApplied(initialSync(empty), envelope('o1', { type: 'MoveBlock', id: 'x', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }, 'other'), 1);
    expect(result.outOfSync).toBe(true);
    expect(result.sync.version).toBe(0);
  });

  it('resets on a snapshot and drops pending actions and the history', () => {
    let sync = onApplied(submitAction(initialSync(empty), 'c1', insert('a')), envelope('c1', insert('a')), 1).sync;
    sync = submitAction(sync, 'c2', insert('b'));
    const result = onSnapshot({ blocks: new Map([['z', block('z')]]), dependencies: [] }, 7, sync);
    expect(result.dropped).toBe(1);
    expect(result.sync.version).toBe(7);
    expect(result.sync.pending).toEqual([]);
    expect(result.sync.undo).toEqual([]);
    expect([...preview(result.sync).state.blocks.keys()]).toEqual(['z']);
  });

  it('submits undo and redo as actions, and moves the history once they are confirmed', () => {
    let sync = onApplied(submitAction(initialSync(empty), 'c1', insert('a')), envelope('c1', insert('a')), 1).sync;

    const undo = submitUndo(sync, 'u1')!;
    expect(undo.command.type).toBe('RemoveBlocks');
    sync = undo.sync;
    expect(canUndoRedo(sync)).toBe(false);
    expect(submitUndo(sync, 'u2')).toBeNull();   // not while an action is pending
    sync = onApplied(sync, envelope('u1', undo.command), 2).sync;
    expect(sync.undo).toEqual([]);
    expect(sync.redo).toHaveLength(1);
    expect(sync.confirmed.blocks.size).toBe(0);

    const redo = submitRedo(sync, 'r1')!;
    sync = onApplied(redo.sync, envelope('r1', redo.command), 3).sync;
    expect(sync.undo).toHaveLength(1);
    expect(sync.redo).toEqual([]);
    expect(sync.confirmed.blocks.has('a')).toBe(true);
  });

  it('drops the history step of a rejected undo', () => {
    let sync = onApplied(submitAction(initialSync(empty), 'c1', insert('a')), envelope('c1', insert('a')), 1).sync;
    sync = submitUndo(sync, 'u1')!.sync;
    sync = onRejected(sync, 'u1').sync;
    expect(sync.undo).toEqual([]);
    expect(sync.redo).toEqual([]);
  });

  it('a new action clears the redo history once it is confirmed', () => {
    let sync = onApplied(submitAction(initialSync(empty), 'c1', insert('a')), envelope('c1', insert('a')), 1).sync;
    const undo = submitUndo(sync, 'u1')!;
    sync = onApplied(undo.sync, envelope('u1', undo.command), 2).sync;
    sync = onApplied(submitAction(sync, 'c2', insert('b')), envelope('c2', insert('b')), 3).sync;
    expect(sync.redo).toEqual([]);
    expect(sync.undo).toHaveLength(1);
  });
});
