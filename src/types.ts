/** Built-in primitive types. Any other string is a custom value type (e.g. 'Card', 'Player', 'Deck'). */
export type ParamType = string;
export type BlockType = 'command' | 'query' | 'start';

export interface BlockParam {
  name: string;
  type: ParamType;
}

export interface BlockDefinition {
  id: string;
  name: string;
  blockType: BlockType;
  returnType?: ParamType;
  params: BlockParam[];
  category: string;
  color: string;
}

export interface ParamSlot {
  textValue: string | null;
  queryBlockId: string | null;
}

export interface PlacedBlock {
  instanceId: string;
  definitionId: string;
  x: number;
  y: number;
  nextBlockId: string | null;
  parentBlockId: string | null;
  embeddedInBlockId: string | null;
  embeddedSlotIndex: number;
  paramSlots: ParamSlot[];
}

/**
 * Serialized form of the block canvas — safe to JSON.stringify/parse and
 * store externally (e.g. on a server). Pass back as `initialState` to restore.
 */
export interface SerializedCanvas {
  blocks: [string, PlacedBlock][];
}
