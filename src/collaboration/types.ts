import type { PackageRef, PlacedBlock } from '../types';
import type { Command, Position, RejectionCode } from '../commands/types';

/** A canvas state that can be sent over a wire: the blocks (by id) and the dependencies. */
export interface SerializedCanvasState {
  blocks: [string, PlacedBlock][];
  dependencies: PackageRef[];
}

/** A command as a client submits it, and as it comes back once applied. */
export interface CommandEnvelope {
  /** Unique per submission (the editor makes a UUID). */
  id: string;
  /** The submitting client. */
  clientId: string;
  /** The last version the client had applied when it made the command (informational: commands check themselves). */
  baseVersion: number;
  command: Command;
}

/** What the host feeds the editor. */
export type CommandEvent =
  /** The state to start from: on connecting, and after a resync. */
  | { type: 'snapshot'; state: SerializedCanvasState; version: number }
  /** A command applied by the backend (anyone's), in log order; `version` is the state's version after it. */
  | { type: 'applied'; envelope: CommandEnvelope; version: number }
  /** One of this client's commands, rejected. */
  | { type: 'rejected'; id: string; code: RejectionCode; message: string };

/**
 * Command sourcing: the editor submits every user action as a command and changes its state only by the events the
 * host feeds back. The host implements this over its own transport.
 */
export interface CommandChannel {
  submit(envelope: CommandEnvelope): void;
  /** Starts delivering events; returns the function that stops it. */
  subscribe(listener: (event: CommandEvent) => void): () => void;
  /** Asks for a new snapshot: called when an applied command doesn't fit the editor's state (it missed something). */
  resync?(): void;
}

/** What a client shows the others while it edits. All positions are canvas (SVG) coordinates. */
export interface Presence {
  /** The pointer over the canvas, or null when it is elsewhere. */
  cursor: Position | null;
  /** A drag: of canvas blocks (by the lead block) or of a new block from the palette, with the ghost's top-left. */
  drag: { leadId: string; at: Position } | { definitionId: string; at: Position } | null;
  /** A parameter being typed into, with the text typed so far. */
  typing: { blockId: string; slot: number; text: string } | null;
}

/** Another client's presence, with how to show them. */
export interface PeerPresence extends Presence {
  clientId: string;
  name: string;
  /** A CSS colour. */
  color: string;
}

/** Multiplayer presence: published by the editor (throttled), the others' delivered by the host. */
export interface PresenceChannel {
  publish(presence: Presence): void;
  /** Starts delivering the other clients' presence (the full list each time); returns the function that stops it. */
  subscribe(listener: (peers: PeerPresence[]) => void): () => void;
}

/**
 * How the editor collaborates. Without it the editor is standalone; with `commands` it is command-sourced; with
 * `presence` it shows and shares cursors, drags and typing.
 */
export interface Collaboration {
  /** This client's id: its envelopes carry it, and its own presence is left out of the peers. */
  clientId: string;
  commands?: CommandChannel;
  presence?: PresenceChannel;
  /** The least time between two presence updates (default 66 ms, about 15 a second). */
  presenceIntervalMs?: number;
}
