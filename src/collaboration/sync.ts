/**
 * Command sourcing, client side: the confirmed state (the snapshot plus the applied commands, in order), this client's
 * pending actions, and its own history for undo/redo. Pure: every function returns a new SyncState.
 */

import type { CanvasState, Command } from '../commands/types';
import { applyCommand } from '../commands/apply';
import { invertCommand } from '../commands/invert';
import type { CommandEnvelope } from './types';

/** What a pending action does to the history once it is confirmed. */
export type ActionKind = 'do' | 'undo' | 'redo';

export interface PendingAction {
  id: string;
  /** The command submitted. */
  command: Command;
  kind: ActionKind;
  /** The history entry it concerns: the action itself ('do'), or the original action undone / redone. */
  original: Command;
}

export interface SyncState {
  confirmed: CanvasState;
  /** The version of the confirmed state. */
  version: number;
  /** This client's submitted actions, oldest first. */
  pending: PendingAction[];
  /** This client's confirmed actions that can be undone (last is next), and those that can be redone. */
  undo: Command[];
  redo: Command[];
}

export function initialSync(state: CanvasState, version = 0): SyncState {
  return { confirmed: state, version, pending: [], undo: [], redo: [] };
}

/** A user action submitted (and pending). */
export function submitAction(sync: SyncState, id: string, command: Command): SyncState {
  return { ...sync, pending: [...sync.pending, { id, command, kind: 'do', original: command }] };
}

/** Undo submitted: the inverse of the last confirmed own action. Null when there is nothing to undo. */
export function submitUndo(sync: SyncState, id: string): { sync: SyncState; command: Command } | null {
  const original = sync.undo[sync.undo.length - 1];
  if (!original || !canUndoRedo(sync)) return null;
  const command = invertCommand(original);
  return { sync: { ...sync, pending: [...sync.pending, { id, command, kind: 'undo', original }] }, command };
}

/** Redo submitted: the last undone action again. Null when there is nothing to redo. */
export function submitRedo(sync: SyncState, id: string): { sync: SyncState; command: Command } | null {
  const original = sync.redo[sync.redo.length - 1];
  if (!original || !canUndoRedo(sync)) return null;
  return { sync: { ...sync, pending: [...sync.pending, { id, command: original, kind: 'redo', original }] }, command: original };
}

/** Undo and redo wait until no own action is pending (an in-flight action could depend on what they'd change). */
export function canUndoRedo(sync: SyncState): boolean {
  return sync.pending.length === 0;
}

/** A snapshot replaces the confirmed state; pending actions and the history are dropped. Returns how many were dropped. */
export function onSnapshot(state: CanvasState, version: number, sync: SyncState): { sync: SyncState; dropped: number } {
  return { sync: initialSync(state, version), dropped: sync.pending.length };
}

/**
 * A command applied by the backend. Confirms the pending action with its id (when it is this client's). `outOfSync`
 * when the command doesn't apply to the confirmed state (the client missed something): the host should resync.
 */
export function onApplied(sync: SyncState, envelope: CommandEnvelope, version: number): { sync: SyncState; outOfSync: boolean } {
  let confirmed: CanvasState;
  try {
    confirmed = applyCommand(sync.confirmed, envelope.command);
  } catch {
    return { sync, outOfSync: true };
  }
  const action = sync.pending.find(p => p.id === envelope.id);
  const next: SyncState = { ...sync, confirmed, version, pending: sync.pending.filter(p => p.id !== envelope.id) };
  if (!action) return { sync: next, outOfSync: false };
  switch (action.kind) {
    case 'do':   return { sync: { ...next, undo: [...next.undo, action.original], redo: [] }, outOfSync: false };
    case 'undo': return { sync: { ...next, undo: next.undo.slice(0, -1), redo: [...next.redo, action.original] }, outOfSync: false };
    case 'redo': return { sync: { ...next, undo: [...next.undo, action.original], redo: next.redo.slice(0, -1) }, outOfSync: false };
  }
}

/**
 * One of this client's commands, rejected: the pending action goes. A rejected undo or redo also drops its history
 * step (it can no longer be applied). Returns the action (null when it wasn't pending).
 */
export function onRejected(sync: SyncState, id: string): { sync: SyncState; action: PendingAction | null } {
  const action = sync.pending.find(p => p.id === id) ?? null;
  if (!action) return { sync, action: null };
  const next = { ...sync, pending: sync.pending.filter(p => p.id !== id) };
  if (action.kind === 'undo') return { sync: { ...next, undo: next.undo.slice(0, -1) }, action };
  if (action.kind === 'redo') return { sync: { ...next, redo: next.redo.slice(0, -1) }, action };
  return { sync: next, action };
}

/**
 * What the user sees: the confirmed state with the pending actions applied on top, in order, up to the first that no
 * longer applies (the ones after it may depend on it). `provisionalIds`: the blocks the shown pending actions add or
 * change.
 */
export function preview(sync: SyncState): { state: CanvasState; provisionalIds: Set<string> } {
  let state = sync.confirmed;
  for (const action of sync.pending) {
    try {
      state = applyCommand(state, action.command);
    } catch {
      break;
    }
  }
  const provisionalIds = new Set<string>();
  if (state !== sync.confirmed) {
    state.blocks.forEach((block, id) => {
      if (sync.confirmed.blocks.get(id) !== block) provisionalIds.add(id);
    });
  }
  return { state, provisionalIds };
}
