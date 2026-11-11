# Block editor commands

**Contract version 1** (`COMMANDS_VERSION`).

Every change to a block canvas is a **command**. The editor changes its state only by applying commands, and undo applies a command's inverse. A host can send commands elsewhere, for example to a server that checks and stores them. A server implementing this contract must behave exactly as described here. The fixtures in `test/commands/*.json` are the shared test cases: every implementation must pass them.

## State

```jsonc
{
  "blocks": [ /* PlacedBlock, by instanceId */ ],
  "dependencies": [ { "publisher": "cardcq", "name": "collections", "version": "1.0.0" } ]
}
```

A **block** (`PlacedBlock`):

| Field | Meaning |
|---|---|
| `instanceId` | The block's id: an opaque string, unique on the canvas. The editor makes random UUIDs. |
| `definitionId` | Which block it is (e.g. `DrawCard`). Commands never look at definitions. |
| `x`, `y` | Integer position, meaningful only for a **root**. A linked block is always at `(0, 0)`. |
| `nextBlockId` | The block under it, or `null`. |
| `parentBlockId` | The block it is under, or `null`. |
| `embeddedInBlockId`, `embeddedSlotIndex` | The block and slot index holding it (a query in a socket, or the first block of a mouth's chain), or `null` and `-1`. |
| `paramSlots` | One per parameter: `{ textValue, queryBlockId, commandBlockId }`. `textValue` is the typed value (`null` when none; an empty string counts as `null`). `queryBlockId` is the query in the socket. `commandBlockId` is the first block of the mouth's chain. A slot holds at most one of these. |

The links go both ways: `a.nextBlockId = b` exactly when `b.parentBlockId = a`. `a.paramSlots[i].queryBlockId` (or `.commandBlockId`) is `q` exactly when `q.embeddedInBlockId = a` and `q.embeddedSlotIndex = i`.

A **root** has `parentBlockId = null` and `embeddedInBlockId = null`. The **fragment** of a block is the block and everything hanging off it: the blocks under it, the queries in its slots, the chains in its mouths, and so on, following `nextBlockId`, `queryBlockId` and `commandBlockId`.

A **place** is where a block can be linked:

```jsonc
{ "next": "a" }                 // under block a
{ "mouth": "e", "slot": 1 }     // at the top of e's mouth (slot 1's commandBlockId)
{ "socket": "a", "slot": 0 }    // in a's socket (slot 0's queryBlockId)
```

Dependencies compare as a **set** of `publisher/name@version`: order doesn't matter.

## Commands

A command is JSON with a `type`. If any check fails, the command is **rejected** with the code given, and the state doesn't change.

### `InsertBlocks { blocks }`
Adds a fragment.
- `INVALID_COMMAND`: `blocks` is empty.
- `NOT_A_FRAGMENT`: an id is given twice; there isn't exactly one root; a link points outside `blocks`; a back link doesn't match its forward link; or a block doesn't hang off the root.
- `ID_EXISTS`: a block with one of the ids exists.

Linked blocks are stored at `(0, 0)`. **Inverse:** `RemoveBlocks` with the same blocks.

### `RemoveBlocks { blocks }`
Removes a fragment, given exactly as it is.
- `INVALID_COMMAND` / `NOT_A_FRAGMENT`: as for `InsertBlocks`.
- `BLOCK_NOT_FOUND`: a block doesn't exist.
- `BLOCK_CHANGED`: a block differs from the given one (slots compared with missing fields as `null`; linked blocks' positions as `(0, 0)`).
- `LINKED_FROM_OUTSIDE`: a block that isn't removed links into the fragment.

**Inverse:** `InsertBlocks` with the same blocks.

### `MoveBlock { id, from, to }`
Moves a root. `from` and `to` are `{ x, y }` integers.
- `BLOCK_NOT_FOUND`
- `NOT_A_ROOT`
- `POSITION_CHANGED`: it isn't at `from`.

**Inverse:** `MoveBlock { id, from: to, to: from }`.

### `Attach { id, to, from }`
Links the root `id`, which is at `from`, into the place `to`. Its position becomes `(0, 0)`.
- `BLOCK_NOT_FOUND`: the block or the place's block doesn't exist.
- `NOT_A_ROOT`
- `POSITION_CHANGED`: it isn't at `from`.
- `CYCLE`: the place's block is in the block's own fragment.
- `NO_SUCH_SLOT`: a mouth or socket slot index is out of range.
- `PLACE_OCCUPIED`:
  - `next`: the block already has a block under it;
  - `mouth`: the slot holds a chain or a query;
  - `socket`: the slot holds a query, a chain, or text.

**Inverse:** `Detach { id, from: to, to: from }`.

### `Detach { id, from, to }`
Unlinks `id`, with its fragment, from the place `from`. The block becomes a root at `to`, and the place becomes empty.
- `BLOCK_NOT_FOUND`
- `NOT_AT_PLACE`: the block isn't linked at exactly `from`, both ways. For example, a mouth's chain is not "in a socket".

**Inverse:** `Attach { id, to: from, from: to }`.

### `SetText { blockId, slot, from, to }`
Sets the typed value of a slot. `null` or `""` means no text, and is stored as `null`.
- `BLOCK_NOT_FOUND`
- `NO_SUCH_SLOT`
- `SLOT_HAS_QUERY`: the slot holds a query.
- `TEXT_CHANGED`: its text isn't `from`.

**Inverse:** `SetText { blockId, slot, from: to, to: from }`.

### `SetDependencies { from, to }`
Replaces the dependencies.
- `DEPENDENCIES_CHANGED`: they aren't `from` (as a set).

**Inverse:** `SetDependencies { from: to, to: from }`.

### `Batch { commands }`
Applies the commands in order, each against the state the previous ones left. If one is rejected, the whole batch is rejected with its code, and nothing changes. One user action is one command or one batch, and one undo step.

**Inverse:** `Batch` of the inverses, in reverse order.

An unknown `type` is rejected with `INVALID_COMMAND`.

## What the checks don't cover

Commands are structural: they never look at block definitions. Whether a query's type fits a socket, or a block may go in a mouth, is the editor's rule while dragging. A host checks it when it validates the behavior itself, for example before running it.

## User actions

The editor builds these commands (`src/commands/build.ts`; the builders are exported):

| Action | Commands |
|---|---|
| Drop a block from the palette | `InsertBlocks`, then (if it snapped) as for attaching below |
| Attach to a place | `Attach`. A socket with text first gets `SetText` to `null`. At the top of an occupied mouth: `Detach` the old head to `(0, 0)`, `Attach` the new chain, `Attach` the old head under the new chain's last block (from `(0, 0)`). |
| Move a block (with the blocks under it) | If linked: `Detach` to the drop position, then attach (as above) or nothing. If a root: attach, or `MoveBlock` (nothing if the position is unchanged). Nothing at all when dropped back in its own place. |
| Delete | `Detach` (if linked) to `(0, 0)`, then `RemoveBlocks` of its fragment |
| Type a parameter | `SetText` (when the value changes) |
| Remove a package | For each of its blocks: `Detach` the block under it, `Detach` the block itself, `RemoveBlocks` its fragment, then `Attach` the block that was under it in its place. Then `SetDependencies`. |
| Add or update a package | `SetDependencies` |

Positions in commands are rounded to integers.
