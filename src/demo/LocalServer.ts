/**
 * An in-memory stand-in for a collaboration backend, for the dev app's multiplayer demo and the tests. It does what
 * a real backend does (and is the reference for one): checks and applies each submitted command against its state
 * (`applyCommand`), numbers the applied commands, broadcasts them to every client (or rejects them to the submitter),
 * and relays presence with a name and colour per client.
 */

import type { CanvasState } from '../commands/types';
import { CommandRejected } from '../commands/types';
import { applyCommand } from '../commands/apply';
import type {
  CommandChannel, CommandEnvelope, CommandEvent, PeerPresence, Presence, PresenceChannel,
} from '../collaboration/types';

interface Client {
  id: string;
  name: string;
  color: string;
  commandListeners: Set<(event: CommandEvent) => void>;
  presenceListeners: Set<(peers: PeerPresence[]) => void>;
  presence: Presence;
}

export class LocalServer {
  private state: CanvasState;
  private version = 0;
  private readonly clients = new Map<string, Client>();
  /** How long the server takes to answer a command (to make pending actions visible). */
  private delayMs: number;

  constructor(state: CanvasState, delayMs = 0) {
    this.state = state;
    this.delayMs = delayMs;
  }

  get delay(): number {
    return this.delayMs;
  }

  setDelay(ms: number) {
    this.delayMs = ms;
  }

  /** The server's current state and version. */
  get current(): { state: CanvasState; version: number } {
    return { state: this.state, version: this.version };
  }

  /** A client's channels. Connecting again with the same id gives channels to the same client (its listeners stay). */
  connect(clientId: string, name: string, color: string): { commands: CommandChannel; presence: PresenceChannel } {
    const client: Client = this.clients.get(clientId) ?? {
      id: clientId, name, color,
      commandListeners: new Set(), presenceListeners: new Set(),
      presence: { cursor: null, drag: null, typing: null },
    };
    client.name = name;
    client.color = color;
    this.clients.set(clientId, client);

    const commands: CommandChannel = {
      submit: envelope => this.later(() => this.receive(envelope)),
      subscribe: listener => {
        client.commandListeners.add(listener);
        this.later(() => listener(this.snapshot()));
        return () => client.commandListeners.delete(listener);
      },
      resync: () => this.later(() => client.commandListeners.forEach(l => l(this.snapshot()))),
    };
    const presence: PresenceChannel = {
      publish: p => {
        client.presence = p;
        this.broadcastPresence();
      },
      subscribe: listener => {
        client.presenceListeners.add(listener);
        listener(this.peersOf(clientId));
        return () => client.presenceListeners.delete(listener);
      },
    };
    return { commands, presence };
  }

  /**
   * A client went away (closed, or timed out on a real transport): its listeners are dropped and it leaves the
   * others' peer lists.
   */
  disconnect(clientId: string) {
    if (!this.clients.delete(clientId)) return;
    this.broadcastPresence();
  }

  private later(run: () => void) {
    if (this.delayMs > 0) setTimeout(run, this.delayMs);
    else queueMicrotask(run);
  }

  private snapshot(): CommandEvent {
    return { type: 'snapshot', state: { blocks: [...this.state.blocks.entries()], dependencies: this.state.dependencies }, version: this.version };
  }

  private receive(envelope: CommandEnvelope) {
    try {
      this.state = applyCommand(this.state, envelope.command);
    } catch (err) {
      if (!(err instanceof CommandRejected)) throw err;
      const event: CommandEvent = { type: 'rejected', id: envelope.id, code: err.code, message: err.message };
      this.clients.get(envelope.clientId)?.commandListeners.forEach(l => l(event));
      return;
    }
    this.version += 1;
    const event: CommandEvent = { type: 'applied', envelope, version: this.version };
    this.clients.forEach(c => c.commandListeners.forEach(l => l(event)));
  }

  private peersOf(clientId: string): PeerPresence[] {
    return [...this.clients.values()]
      .filter(c => c.id !== clientId)
      .map(c => ({ ...c.presence, clientId: c.id, name: c.name, color: c.color }));
  }

  private broadcastPresence() {
    this.clients.forEach(c => c.presenceListeners.forEach(l => l(this.peersOf(c.id))));
  }
}
