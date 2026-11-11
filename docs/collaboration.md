# Using the editor: standalone, command-sourced, multiplayer

The editor (`BlockEditor`) changes its canvas only through commands (`docs/commands.md`). What it does with them depends on what the host passes. There is no mode switch.

| Host passes | The editor |
|---|---|
| nothing extra | **Standalone:** every action applies at once, with undo/redo. |
| `collaboration.commands` | **Command-sourced:** every action is submitted, and the state changes only by the host's events. |
| `collaboration.presence` | **Multiplayer presence:** shares this user's cursor, drag and typing, and shows the other users'. Usually together with `commands`. |
| `scriptWriters` | **Script export:** an Export menu that turns the canvas into text (works with any of the above). |

## Standalone with script export

```tsx
import BlockEditor, { pythonWriter, type ScriptWriter } from '@tvolden/block-code-editor';

<BlockEditor blocksUrl="/blocks.json" scriptWriters={[pythonWriter]} onExport={(script, writer) => save(script)} />
```

A writer gets the canvas as a plain `Program` (`toProgram`):
- **`roots`**: one per chain, top to bottom. Each root's `body` is the sequence of its blocks.
- **Each node:** `{ definitionId, name, blockType, args }`.
- **Each arg:** `{ name, type, value }`. `value` is one of:
  - `text`;
  - a `query` node;
  - a mouth's `body` (a sequence of nodes);
  - `empty`.

A writer implements `{ id, label, fileExtension, write(program) }`. Without `onExport`, the script downloads as `behavior.<extension>`. `pythonWriter` is a sample.

## Command-sourced

```ts
const collaboration: Collaboration = {
  clientId,                       // this client's id
  commands: {
    submit(envelope) { /* send { id, clientId, baseVersion, command } to the server */ },
    subscribe(listener) { /* deliver snapshot / applied / rejected events; return an unsubscribe function */ },
    resync() { /* optional: send a new snapshot */ },
  },
};
<BlockEditor blocksUrl="/blocks.json" collaboration={collaboration} />
```

Keep the `collaboration` object stable: a new channel object resubscribes.

The host's events:
- **`snapshot { state, version }`:** the state to start from. Send it first, and again after a resync. Pending actions are dropped, with a notice when there were any.
- **`applied { envelope, version }`:** every applied command, anyone's, in log order. One of this client's own confirms its pending action.
- **`rejected { id, code, message }`:** one of this client's commands was rejected. The editor drops the action and shows why.

How the editor behaves:
- **Preview:** while actions are pending, the editor shows them applied on top of the confirmed state, drawn provisionally (dashed outline, faded, italic text). They stop at the first action that no longer applies.
- **Undo and redo:** they cover this user's own confirmed actions and are submitted as new actions. They are disabled while an action is pending.
- **Typed values:** a `SetText` carries the text from when editing started, so a concurrent change is rejected, not overwritten.
- **Out of sync:** an applied command that doesn't fit the editor's state means it missed something. The editor calls `resync()`.

The server applies each command with the checks of `docs/commands.md`. It numbers the applied ones, broadcasts them to every client, and sends rejections to the submitter only. `LocalServer` is an in-memory reference implementation, used by the dev app's "Multiplayer demo" and the tests.

**Dependencies** come with the snapshot and change by `SetDependencies` commands. Pass `packageBlocksUrl` (and `availablePackages`) to maintain them in the Packages tab.

## Presence

```ts
presence: {
  publish(presence) { /* send { cursor, drag, typing } */ },
  subscribe(listener) { /* deliver the other clients' PeerPresence list ({ ...presence, clientId, name, color }) */ },
},
presenceIntervalMs: 66,           // optional: at most one update per interval (drag/typing start and end go at once)
```

All positions are canvas (SVG) coordinates. `drag` is `{ leadId, at }` (canvas blocks) or `{ definitionId, at }` (a new block from the palette), where `at` is the ghost's top-left. `typing` is `{ blockId, slot, text }`.

The editor draws other users as:
- a named pointer in their colour;
- a dashed ghost of what they drag, with an outline on the originals;
- their live text in the socket they type into.

Nothing is locked: commands decide conflicts.
