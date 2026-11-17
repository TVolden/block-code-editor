import { describe, expect, it } from 'vitest';
import type { BlockDefinition, ParamSlot, PlacedBlock } from '../../src/types';
import {
  CHIP_H, QUERY_H, getBlockWidth, getSocketPositions, getSocketSize, isCollapsed, paramTitle,
} from '../../src/utils/blockLayout';

const draw = (optional?: boolean): BlockDefinition => ({
  id: 'Draw', name: 'Draw', blockType: 'command', category: 'c', color: '#000',
  params: [
    { name: 'From', type: 'Deck' },
    { name: 'Count', type: 'number', ...(optional === undefined ? {} : { optional }) },
    { name: 'To', type: 'Hand', ...(optional === undefined ? {} : { optional }) },
  ],
});

const slot = (s: Partial<ParamSlot> = {}): ParamSlot => ({ textValue: null, queryBlockId: null, ...s });

const query: PlacedBlock = {
  instanceId: 'q', definitionId: 'GetHand', x: 0, y: 0, nextBlockId: null, parentBlockId: null,
  embeddedInBlockId: 'b', embeddedSlotIndex: 2, paramSlots: [],
};

describe('optional parameters', () => {
  it('are collapsed while nothing is in their slot (empty text counts as nothing)', () => {
    const [, count] = draw(true).params;
    expect(isCollapsed(count, undefined)).toBe(true);
    expect(isCollapsed(count, slot())).toBe(true);
    expect(isCollapsed(count, slot({ textValue: '' }))).toBe(true);
    expect(isCollapsed(count, slot({ textValue: '2' }))).toBe(false);
    expect(isCollapsed(count, slot({ queryBlockId: 'q' }))).toBe(false);
  });

  it('are drawn as chips, narrower than a socket and centred in the header row', () => {
    const sockets = getSocketPositions(draw(true));
    expect(sockets.map(s => s.collapsed)).toEqual([false, true, true]);
    const [, count, to] = sockets;
    expect(count.h).toBe(CHIP_H);
    expect(to.w).toBeLessThan(getSocketSize('Hand').w);
    expect(count.y).toBeGreaterThan(sockets[0].y);
    expect(getBlockWidth(draw(true))).toBeLessThan(getBlockWidth(draw()));
  });

  it('are drawn as sockets once added: text typed, or a query dropped', () => {
    const slots = [slot(), slot({ textValue: '2' }), slot({ queryBlockId: 'q' })];
    const sockets = getSocketPositions(draw(true), slots, new Map([['q', query]]));
    expect(sockets.map(s => s.collapsed)).toEqual([false, false, false]);
    expect(sockets[1]).toMatchObject({ w: getSocketSize('number').w, h: QUERY_H });
    expect(sockets[2]).toMatchObject({ w: getSocketSize('Hand').w, h: QUERY_H });
  });

  it('say so in their tooltip', () => {
    const [from, count] = draw(true).params;
    expect(paramTitle(from)).toBe('From: Deck');
    expect(paramTitle(count)).toBe('Count: number (optional)');
  });
});

describe('definitions without the optional flag', () => {
  it('lay out exactly as before: every parameter a socket', () => {
    const sockets = getSocketPositions(draw());
    expect(sockets.map(s => s.collapsed)).toEqual([false, false, false]);
    expect(sockets.map(s => s.w)).toEqual([getSocketSize('Deck').w, getSocketSize('number').w, getSocketSize('Hand').w]);
    expect(getSocketPositions(draw(false))).toEqual(sockets);
    expect(getBlockWidth(draw(false))).toBe(getBlockWidth(draw()));
  });
});
