import type { Presence } from './types';

export const DEFAULT_PRESENCE_INTERVAL_MS = 66;

const NOBODY: Presence = { cursor: null, drag: null, typing: null };

/**
 * Keeps this client's presence and publishes it at most once per interval: an update within the interval is sent when
 * it ends (only the latest), while `updateNow` (a drag or typing starting or ending) is sent at once.
 */
export class PresencePublisher {
  private presence: Presence = NOBODY;
  private lastSent = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly send: (presence: Presence) => void;
  private readonly intervalMs: number;
  private readonly now: () => number;

  constructor(send: (presence: Presence) => void, intervalMs = DEFAULT_PRESENCE_INTERVAL_MS, now: () => number = Date.now) {
    this.send = send;
    this.intervalMs = intervalMs;
    this.now = now;
  }

  get current(): Presence {
    return this.presence;
  }

  /** A change sent within the interval (e.g. the cursor moving). */
  update(change: Partial<Presence>) {
    this.presence = { ...this.presence, ...change };
    if (this.timer) return;
    const wait = this.lastSent + this.intervalMs - this.now();
    if (wait <= 0) this.flush();
    else this.timer = setTimeout(() => this.flush(), wait);
  }

  /** A change sent at once (a drag or typing starting or ending). */
  updateNow(change: Partial<Presence>) {
    this.presence = { ...this.presence, ...change };
    this.flush();
  }

  /** Stops a pending send. */
  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private flush() {
    this.dispose();
    this.lastSent = this.now();
    this.send(this.presence);
  }
}
