/**
 * The canvas as a plain program for script writers: no instance ids or links, just roots with their sequence of
 * blocks, and each block's arguments.
 */

import type { BlockDefinition, BlockType, ParamType, PlacedBlock } from '../types';
import type { CanvasState, Position } from '../commands/types';
import { isCommandParam } from '../utils/blockLayout';

export interface Program {
  /** The chains on the canvas, top to bottom, then left to right (then by id). */
  roots: ProgramRoot[];
}

export interface ProgramRoot {
  position: Position;
  /** The chain: its first block (a start block, or a loose command) and the blocks under it, in order. */
  body: ProgramNode[];
}

export interface ProgramNode {
  definitionId: string;
  /** The block's name (the definition id for a block whose definition is missing). */
  name: string;
  /** `'missing'` for a block whose definition isn't loaded. */
  blockType: BlockType | 'missing';
  args: ProgramArg[];
}

export interface ProgramArg {
  name: string;
  type: ParamType;
  value: ProgramValue;
}

export type ProgramValue =
  | { kind: 'text'; text: string }
  /** A query in the socket. */
  | { kind: 'query'; node: ProgramNode }
  /** A mouth's chain (empty for an empty mouth). */
  | { kind: 'body'; body: ProgramNode[] }
  | { kind: 'empty' };

/** Turns a script into text. */
export interface ScriptWriter {
  id: string;
  /** Shown in the Export menu. */
  label: string;
  /** Without the dot, e.g. `py`. */
  fileExtension: string;
  write(program: Program): string;
}

/** The canvas as a program; `definitionOf` looks up block definitions (e.g. the editor's registry). */
export function toProgram(state: CanvasState, definitionOf: (id: string) => BlockDefinition | undefined): Program {
  const visited = new Set<string>();

  function chain(firstId: string | null | undefined): ProgramNode[] {
    const nodes: ProgramNode[] = [];
    let id = firstId ?? null;
    while (id && !visited.has(id)) {
      const block = state.blocks.get(id);
      if (!block) break;
      nodes.push(node(block));
      id = block.nextBlockId;
    }
    return nodes;
  }

  function node(block: PlacedBlock): ProgramNode {
    visited.add(block.instanceId);
    const def = definitionOf(block.definitionId);
    const args = block.paramSlots.map((slot, i): ProgramArg => {
      const param = def?.params[i] ?? { name: `param${i}`, type: 'string' };
      const query = slot.queryBlockId ? state.blocks.get(slot.queryBlockId) : undefined;
      let value: ProgramValue;
      if (def && isCommandParam(def, param)) value = { kind: 'body', body: chain(slot.commandBlockId) };
      else if (query) value = { kind: 'query', node: node(query) };
      else if (slot.textValue !== null && slot.textValue !== undefined && slot.textValue !== '') value = { kind: 'text', text: slot.textValue };
      else value = { kind: 'empty' };
      return { name: param.name, type: param.type, value };
    });
    return {
      definitionId: block.definitionId,
      name: def?.name ?? block.definitionId,
      blockType: def?.blockType ?? 'missing',
      args,
    };
  }

  const roots = [...state.blocks.values()]
    .filter(b => !b.parentBlockId && !b.embeddedInBlockId)
    // Ties (same position) by id, compared as the .NET library does (ordinal, by UTF-16 code unit).
    .sort((a, b) => a.y - b.y || a.x - b.x || (a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0));
  return {
    roots: roots.map(root => ({ position: { x: root.x, y: root.y }, body: chain(root.instanceId) })),
  };
}
