import type { BlockDefinition, BlockParam, ParamType, ParamSlot, PlacedBlock } from '../types';
import { COMMAND_PARAM_TYPE } from '../types';
import { tryGetDefinition } from '../blockRegistry';

export const BLOCK_H = 36;
export const HAT_H   = 50;   // header area of hat blocks (label + param sockets)
export const QUERY_H = 24;
export const NOTCH_H = 4;

/** Height of the placeholder drawn for a block whose definition is missing. */
export const MISSING_H = 24;

/** How far a mouth's chain is indented from the C-block's left edge. */
export const MOUTH_INDENT = 16;
/** Height of an empty mouth. */
export const MOUTH_MIN_H = 24;
/** Height of the bar between two mouths, which carries the second mouth's parameter name. */
export const MOUTH_DIVIDER_H = 24;
/** Height of the bar under the last mouth. */
export const MOUTH_FOOTER_H = 16;

/** Height of each scope-output pill rendered in the event block's variable panel. */
export const OUTPUT_PILL_H = 20;
/**
 * Vertical space consumed by one output row: pill height + gap below it.
 * The bottom-padding of the last row is baked into getBlockHeight, not here.
 */
export const OUTPUT_ROW_H  = 26;
/** Left edge of the first pill, and the space between pills side by side. */
const PILL_X0 = 8;
const PILL_GAP = 6;

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

/**
 * Whether a parameter of the block is drawn as a C-shaped mouth holding a chain of commands. Only command blocks have
 * mouths; on a query or start block a command parameter stays a plain socket that nothing fits.
 */
export function isCommandParam(def: BlockDefinition, param: BlockParam): boolean {
  return def.blockType === 'command' && param.type === COMMAND_PARAM_TYPE;
}

/** Whether the block has at least one mouth (and is drawn as a C-block). */
export function hasMouths(def: BlockDefinition): boolean {
  return def.params.some(p => isCommandParam(def, p));
}

export interface SocketInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  type: ParamType;
  index: number;
}

export interface MouthInfo {
  /** Index of the command parameter. */
  index: number;
  name: string;
  /** Where the mouth's chain starts, relative to the block. */
  x: number;
  y: number;
  h: number;
  /** Top of the divider bar above the mouth (every mouth after the first has one), or null. */
  dividerY: number | null;
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

/** Approximate width of one character of the 9px hint text inside sockets. */
const HINT_CHAR_W = 5;

/**
 * The text cut with an ellipsis to fit inside a socket of the type and width: number (round caps) and boolean (pointed
 * ends) sockets lose their ends (`w - h`), others a little padding.
 */
export function fitLabel(text: string, socketType: ParamType, width: number): string {
  const tapered = socketType === 'number' || socketType === 'boolean';
  const inner = tapered ? width - QUERY_H : width - 10;
  const maxChars = Math.floor(inner / HINT_CHAR_W);
  if (text.length <= maxChars) return text;
  return maxChars <= 1 ? '…' : `${text.slice(0, maxChars - 1)}…`;
}

/** A socket's (or mouth's) tooltip: its parameter's name and type. */
export function socketTitle(name: string, type: ParamType): string {
  return `${name}: ${type}`;
}

/** Minimum pill width based on label text only (type is implicit in the query block itself). */
export function getPillWidth(name: string): number {
  return Math.max(72, name.length * 6 + 22);
}

/**
 * Where a start block's context-variable pills go: side by side, one column each, in a single row below the header
 * divider. Positions are relative to the block.
 */
export function getPillPositions(def: BlockDefinition): { id: string; name: string; x: number; y: number; w: number }[] {
  let x = PILL_X0;
  return (def.blockType === 'start' ? def.provides ?? [] : []).map(p => {
    const pill = { id: p.id, name: p.name, x, y: HAT_H + 6, w: getPillWidth(p.name) };
    x += pill.w + PILL_GAP;
    return pill;
  });
}

/** Width of a block, accounting for embedded query blocks in param slots. Mouths don't widen it. */
export function getBlockWidth(
  def: BlockDefinition,
  paramSlots?: ParamSlot[],
  allBlocks?: Map<string, PlacedBlock>,
): number {
  let w = LPAD + RPAD + labelText(def).length * CHAR_W;
  for (let i = 0; i < def.params.length; i++) {
    if (isCommandParam(def, def.params[i])) continue;
    w += SOCKET_GAP + resolveSlotWidth(def.params[i].type, paramSlots?.[i], allBlocks);
  }
  // Ensure start blocks are wide enough for their context-variable pills, side by side.
  const pills = getPillPositions(def);
  if (pills.length > 0) {
    const last = pills[pills.length - 1];
    w = Math.max(w, last.x + last.w + RPAD);
  }
  // Ensure C-blocks are wide enough for the names on their divider bars and empty mouths.
  def.params.forEach((p) => {
    if (isCommandParam(def, p)) w = Math.max(w, MOUTH_INDENT + LPAD + p.name.length * CHAR_W + RPAD);
  });
  const minW = def.blockType === 'start' ? 140 : 110;
  return Math.max(minW, w);
}

/** Height of the header row: the label and the sockets. */
export function getHeaderHeight(def: BlockDefinition): number {
  if (def.blockType === 'start')   return HAT_H;
  if (def.blockType === 'command') return BLOCK_H;
  return QUERY_H;
}

/**
 * Height of a block. A C-block grows with the chains in its mouths (and so with mouths nested in them); without slots
 * and blocks its mouths are empty.
 */
export function getBlockHeight(
  def: BlockDefinition,
  paramSlots?: ParamSlot[],
  allBlocks?: Map<string, PlacedBlock>,
): number {
  if (def.blockType === 'start') {
    // Panel layout: one row of pills side by side — 6px top-pad + pill 20px + 6px gap + 8px bottom-pad
    return HAT_H + (def.provides && def.provides.length > 0 ? 8 + OUTPUT_ROW_H : 0);
  }
  if (def.blockType === 'command') {
    const mouths = getMouthPositions(def, paramSlots, allBlocks);
    if (mouths.length === 0) return BLOCK_H;
    const last = mouths[mouths.length - 1];
    return last.y + last.h + MOUTH_FOOTER_H;
  }
  return QUERY_H;
}

/** Height of a placed block, including a placeholder for a missing definition. */
export function getPlacedBlockHeight(block: PlacedBlock, allBlocks: Map<string, PlacedBlock>): number {
  const def = tryGetDefinition(block.definitionId);
  return def ? getBlockHeight(def, block.paramSlots, allBlocks) : MISSING_H;
}

/** Height of the chain starting at `firstId`: its blocks stacked. */
export function getChainHeight(firstId: string, allBlocks: Map<string, PlacedBlock>): number {
  let h = 0;
  const seen = new Set<string>();
  let id: string | null = firstId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const block = allBlocks.get(id);
    if (!block) break;
    h += getPlacedBlockHeight(block, allBlocks);
    id = block.nextBlockId;
  }
  return h;
}

/** The mouths of a C-block in parameter order, relative to the block. Empty for other blocks. */
export function getMouthPositions(
  def: BlockDefinition,
  paramSlots?: ParamSlot[],
  allBlocks?: Map<string, PlacedBlock>,
): MouthInfo[] {
  const mouths: MouthInfo[] = [];
  let y = getHeaderHeight(def);
  def.params.forEach((param, index) => {
    if (!isCommandParam(def, param)) return;
    let dividerY: number | null = null;
    if (mouths.length > 0) {
      dividerY = y;
      y += MOUTH_DIVIDER_H;
    }
    const first = paramSlots?.[index]?.commandBlockId;
    const chainH = first && allBlocks ? getChainHeight(first, allBlocks) : 0;
    const h = Math.max(MOUTH_MIN_H, chainH);
    mouths.push({ index, name: param.name, x: MOUTH_INDENT, y, h, dividerY });
    y += h;
  });
  return mouths;
}

/** Socket positions relative to block (x, y). Mouths are not sockets. */
export function getSocketPositions(
  def: BlockDefinition,
  paramSlots?: ParamSlot[],
  allBlocks?: Map<string, PlacedBlock>,
): SocketInfo[] {
  // Sockets live in the header row (for start blocks: above the output panel; for C-blocks: above the mouths).
  const rowH = getHeaderHeight(def);
  const sockets: SocketInfo[] = [];
  let cx = LPAD + labelText(def).length * CHAR_W;
  for (let i = 0; i < def.params.length; i++) {
    const param = def.params[i];
    if (isCommandParam(def, param)) continue;
    const sw = resolveSlotWidth(param.type, paramSlots?.[i], allBlocks);
    const sh = getSocketSize(param.type).h;
    cx += SOCKET_GAP;
    sockets.push({ x: cx, y: (rowH - sh) / 2, w: sw, h: sh, type: param.type, index: i });
    cx += sw;
  }
  return sockets;
}

/**
 * The absolute position of every block on the canvas. Roots (not chained, not embedded) sit at their own x/y; a chained
 * block sits under its predecessor; a mouth's chain sits indented inside its host; an embedded query sits in its socket.
 * The stored x/y of non-root blocks are not used.
 */
export function computeLayout(allBlocks: Map<string, PlacedBlock>): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  function place(id: string, x: number, y: number) {
    const block = allBlocks.get(id);
    if (!block || positions.has(id)) return;
    positions.set(id, { x, y });
    const def = tryGetDefinition(block.definitionId);
    if (def) {
      for (const socket of getSocketPositions(def, block.paramSlots, allBlocks)) {
        const queryId = block.paramSlots[socket.index]?.queryBlockId;
        if (queryId) place(queryId, x + socket.x, y + socket.y);
      }
      for (const mouth of getMouthPositions(def, block.paramSlots, allBlocks)) {
        const firstId = block.paramSlots[mouth.index]?.commandBlockId;
        if (firstId) place(firstId, x + mouth.x, y + mouth.y);
      }
    }
    if (block.nextBlockId) place(block.nextBlockId, x, y + getPlacedBlockHeight(block, allBlocks));
  }

  allBlocks.forEach((block) => {
    if (!block.parentBlockId && !block.embeddedInBlockId) place(block.instanceId, block.x, block.y);
  });
  return positions;
}
