/** Built-in primitive types. Any other string is a custom value type (e.g. 'Card', 'Player', 'Deck'). */
export type ParamType = string;
export type BlockType = 'command' | 'query' | 'start';

export interface BlockParam {
  name: string;
  type: ParamType;
}

/**
 * A guarantee that a particular query block (`id`) will return valid data
 * when used inside a handler chained to this event block.  The block is not
 * an output of the event — it is a context promise.
 *
 * Dragging the pill attached to the event block places the referenced query
 * on the canvas.  If that query is used outside any providing event, the
 * renderer marks it as out-of-scope (like a missing-collection block).
 */
export interface BlockProvide {
  name: string;  // label shown on the pill (e.g. "drawing player")
  id: string;    // definition ID of the $scope query block
}

export interface BlockDefinition {
  id: string;
  name: string;
  blockType: BlockType;
  returnType?: ParamType;
  params: BlockParam[];
  /** Context queries this event guarantees are valid. Only meaningful on start blocks. */
  provides?: BlockProvide[];
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
