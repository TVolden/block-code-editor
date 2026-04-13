import type { BlockDefinition, ParamType, ParamSlot, PlacedBlock } from '../types';
import { tryGetDefinition } from '../blockRegistry';

export const BLOCK_H = 36;
export const HAT_H = 50;
export const QUERY_H = 24;
export const NOTCH_H = 4;

const LPAD = 12;
const RPAD = 12;
const SOCKET_GAP = 8;
const CHAR_W = 6;

/** Types whose shape already communicates the type; no text label needed. */
export const PRIMITIVE_TYPES = new Set(['number', 'string', 'boolean']);

/** Text used to calculate block label width (all query blocks show their return type). */
function labelText(def: BlockDefinition): string {
  if (def.blockType === 'query' && def.returnType) {
    return `${def.name} [${def.returnType}]`;
  }
  return def.name;
}

const BUILTIN_SOCKET_SIZE: Record<string, { w: number; h: number }> = {
  number:  { w: 44, h: QUERY_H },
  string:  { w: 60, h: QUERY_H },
  boolean: { w: 52, h: QUERY_H },
};
const CUSTOM_SOCKET_SIZE = { w: 75, h: QUERY_H };

function getSocketSize(type: ParamType): { w: number; h: number } {
  return BUILTIN_SOCKET_SIZE[type] ?? CUSTOM_SOCKET_SIZE;
}

export interface SocketInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  type: ParamType;
  index: number;
}

/** Width occupied by a single slot — uses embedded block width when present. */
function resolveSlotWidth(
  paramType: ParamType,
  slot: ParamSlot | undefined,
  allBlocks: Map<string, PlacedBlock> | undefined,
): number {
  if (slot?.queryBlockId && allBlocks) {
    const emb = allBlocks.get(slot.queryBlockId);
    if (emb) {
      // Use tryGetDefinition so a stale canvas reference (e.g. a renamed/deleted
      // collection block) returns the default socket size instead of crashing.
      const embDef = tryGetDefinition(emb.definitionId);
      if (embDef) return getBlockWidth(embDef, emb.paramSlots, allBlocks);
    }
  }
  return getSocketSize(paramType).w;
}

/** Width of a block, accounting for embedded query blocks in param slots */
export function getBlockWidth(
  def: BlockDefinition,
  paramSlots?: ParamSlot[],
  allBlocks?: Map<string, PlacedBlock>,
): number {
  let w = LPAD + RPAD + labelText(def).length * CHAR_W;
  for (let i = 0; i < def.params.length; i++) {
    w += SOCKET_GAP + resolveSlotWidth(def.params[i].type, paramSlots?.[i], allBlocks);
  }
  const minW = def.blockType === 'start' ? 140 : 110;
  return Math.max(minW, w);
}

export function getBlockHeight(def: BlockDefinition): number {
  if (def.blockType === 'start') return HAT_H;
  if (def.blockType === 'command') return BLOCK_H;
  return QUERY_H;
}

/** Socket positions relative to block (x, y) */
export function getSocketPositions(
  def: BlockDefinition,
  paramSlots?: ParamSlot[],
  allBlocks?: Map<string, PlacedBlock>,
): SocketInfo[] {
  const bh = getBlockHeight(def);
  const sockets: SocketInfo[] = [];
  let cx = LPAD + labelText(def).length * CHAR_W;
  for (let i = 0; i < def.params.length; i++) {
    const param = def.params[i];
    const sw = resolveSlotWidth(param.type, paramSlots?.[i], allBlocks);
    const sh = getSocketSize(param.type).h;
    cx += SOCKET_GAP;
    sockets.push({ x: cx, y: (bh - sh) / 2, w: sw, h: sh, type: param.type, index: i });
    cx += sw;
  }
  return sockets;
}
