import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Presence } from '../../src/collaboration/types';
import { PresencePublisher } from '../../src/collaboration/presence';

describe('PresencePublisher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function publisher() {
    const sent: Presence[] = [];
    return { sent, presence: new PresencePublisher(p => sent.push(p), 100, () => Date.now()) };
  }

  it('sends the first update at once and the latest of a burst when the interval ends', () => {
    const { sent, presence } = publisher();
    presence.update({ cursor: { x: 1, y: 1 } });
    presence.update({ cursor: { x: 2, y: 2 } });
    presence.update({ cursor: { x: 3, y: 3 } });
    expect(sent.map(p => p.cursor)).toEqual([{ x: 1, y: 1 }]);
    vi.advanceTimersByTime(100);
    expect(sent.map(p => p.cursor)).toEqual([{ x: 1, y: 1 }, { x: 3, y: 3 }]);
  });

  it('sends an immediate update at once, replacing a pending one', () => {
    const { sent, presence } = publisher();
    presence.update({ cursor: { x: 1, y: 1 } });
    presence.update({ cursor: { x: 2, y: 2 } });
    presence.updateNow({ drag: { leadId: 'a', at: { x: 5, y: 5 } } });
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ cursor: { x: 2, y: 2 }, drag: { leadId: 'a', at: { x: 5, y: 5 } }, typing: null });
    vi.advanceTimersByTime(500);
    expect(sent).toHaveLength(2);
  });

  it('sends nothing more after dispose', () => {
    const { sent, presence } = publisher();
    presence.update({ cursor: { x: 1, y: 1 } });
    presence.update({ cursor: { x: 2, y: 2 } });
    presence.dispose();
    vi.advanceTimersByTime(500);
    expect(sent).toHaveLength(1);
  });
});
