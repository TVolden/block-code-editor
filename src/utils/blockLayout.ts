import type { BlockDefinition, ParamType, ParamSlot, PlacedBlock } from '../types';
import { tryGetDefinition } from '../blockRegistry';

export const BLOCK_H = 36;
export const HAT_H   = 50;   // header area of hat blocks (label + param sockets)
export const QUERY_H = 24;
export const NOTCH_H = 4;

/** Height of each scope-output pill rendered in the event block's variable panel. */
export const OUTPUT_PILL_H = 20;
/**
 * Vertical space consumed by one output row: pill height + gap below it.
 * The bottom-padding of the last row is baked into getBlockHeight, not here.
 */
export const OUTPUT_ROW_H  = 26;

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

/** Minimum pill width based on label text only (type is implicit in the query block itself). */
export function getPillWidth(name: string): number {
  return Math.max(72, name.length * 6 + 22);
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
  // Ensure start blocks are wide enough for their widest context-variable pill.
  if (def.blockType === 'start' && def.provides) {
    for (const p of def.provides) {
      w = Math.max(w, LPAD + getPillWidth(p.name) + RPAD);
    }
  }
  const minW = def.blockType === 'start' ? 140 : 110;
  return Math.max(minW, w);
}

export function getBlockHeight(def: BlockDefinition): number {
  if (def.blockType === 'start') {
    const n = def.provides?.length ?? 0;
    // Panel layout: 6px top-pad + n × (pill 20px + 6px gap) − last gap + 8px bottom-pad
    // Simplifies to: n > 0 → 8 + n × OUTPUT_ROW_H extra pixels below HAT_H
    return HAT_H + (n > 0 ? 8 + n * OUTPUT_ROW_H : 0);
  }
  if (def.blockType === 'command') return BLOCK_H;
  return QUERY_H;
}

/** Socket positions relative to block (x, y) */
export function getSocketPositions(
  def: BlockDefinition,
  paramSlots?: ParamSlot[],
  allBlocks?: Map<string, PlacedBlock>,
): SocketInfo[] {
  // For start blocks with an output panel, sockets live in the header area only.
  // Use HAT_H as the vertical reference so sockets don't drift into the output panel.
  const rowH = def.blockType === 'start' ? HAT_H : getBlockHeight(def);
  const sockets: SocketInfo[] = [];
  let cx = LPAD + labelText(def).length * CHAR_W;
  for (let i = 0; i < def.params.length; i++) {
    const param = def.params[i];
    const sw = resolveSlotWidth(param.type, paramSlots?.[i], allBlocks);
    const sh = getSocketSize(param.type).h;
    cx += SOCKET_GAP;
    sockets.push({ x: cx, y: (rowH - sh) / 2, w: sw, h: sh, type: param.type, index: i });
    cx += sw;
  }
  return sockets;
}
