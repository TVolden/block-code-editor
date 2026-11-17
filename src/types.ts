/** Built-in primitive types. Any other string is a custom value type (e.g. 'Card', 'Player', 'Deck'). */
export type ParamType = string;
export type BlockType = 'command' | 'query' | 'start';

/** The parameter type that holds a chain of commands; a command block draws it as a C-shaped mouth. */
export const COMMAND_PARAM_TYPE = 'command';

export interface BlockParam {
  name: string;
  type: ParamType;
  /**
   * Whether the parameter may be left out (the host then uses its default). Not added, it is drawn as a small
   * `[+] name` chip rather than an empty socket: dropping a query on it or typing into it adds it, and removing its value
   * leaves it out again. Without it the parameter is required.
   */
  optional?: boolean;
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
  /**
   * For a query: the other types its result can be used as, so it also fits sockets of those types (e.g. a 'Deck' that is
   * a 'CardCollection', or an 'int' that is a 'double').
   */
  usableAs?: ParamType[];
  params: BlockParam[];
  /** Context queries this event guarantees are valid. Only meaningful on start blocks. */
  provides?: BlockProvide[];
  category: string;
  color: string;
}

export interface ParamSlot {
  textValue: string | null;
  queryBlockId: string | null;
  /**
   * For a command parameter of a command block (a C-shaped mouth): the first block of the chain it holds, or null when
   * empty. That block has `embeddedInBlockId` = the host and `embeddedSlotIndex` = the parameter's index; the blocks after
   * it are linked by `nextBlockId` / `parentBlockId` as in any chain. Optional, so canvases saved before mouths load.
   */
  commandBlockId?: string | null;
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

/** One version of a block package that a canvas depends on. */
export interface PackageRef {
  publisher: string;
  name: string;
  version: string;
}

/** A package that may be added in the Packages tab, at the version adding it pins (normally the newest listed). */
export interface CatalogPackage extends PackageRef {
  description?: string;
  /** Shown as a swatch next to the package. */
  color?: string;
}

/**
 * An extra button in the Packages tab, e.g. "Import game packages". It either runs the host's `onClick`, or gives the
 * dependencies to change to (`dependencies`, from the current ones): a user action like a change made in the tab,
 * so it is undoable and, when command-sourced, submitted.
 */
export type PackageAction =
  | { label: string; title?: string; onClick: () => void }
  | { label: string; title?: string; dependencies: (current: PackageRef[]) => PackageRef[] };

/**
 * Serialized form of the block canvas — safe to JSON.stringify/parse and
 * store externally (e.g. on a server). Pass back as `initialState` to restore.
 */
export interface SerializedCanvas {
  blocks: [string, PlacedBlock][];
}
