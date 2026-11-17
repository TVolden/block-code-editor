# Block code editor

A visual block programming editor for React: blocks snap into chains and mouths on a canvas, and the canvas exports as a program tree or as script code. Every change to the canvas is a command (`docs/commands.md`), so a host can keep it standalone, store the commands, or share one canvas between several users.

It is published as two packages, released together with the same version:

| Package | What |
|---|---|
| [`@tvolden/block-code-editor`](https://www.npmjs.com/package/@tvolden/block-code-editor) (npm) | The editor component (`BlockEditor`) and its commands, program tree and script writers. React 19 is a peer dependency. |
| [`BlockCodeEditor.Commands`](https://www.nuget.org/packages/BlockCodeEditor.Commands) (NuGet) | The command contract and program tree in .NET, for hosts that check and apply commands themselves, such as a collaboration server. |

## Using it

```
npm install @tvolden/block-code-editor
dotnet add package BlockCodeEditor.Commands
```

- `docs/collaboration.md`: using the editor standalone, command-sourced or multiplayer.
- `docs/commands.md`: the command contract.
- `docs/dotnet.md`: the .NET library.

### Block definitions

The editor's blocks come from definitions (`BlockDefinition`, loaded from `blocksUrl` / `blocksUrls` as JSON, see `public/blocks.json`). A block's `params` are its parameters in order, each `{ "name", "type" }`:

- A parameter is filled by typing a value into its socket, or by dropping a query whose `returnType` (or `usableAs`) is its `type`. `number`, `string` and `boolean` sockets have their own shapes. On a command block, `command` is a mouth that holds a chain of commands.
- `"optional": true` marks a parameter that may be left out. It isn't drawn as an empty socket but as a small `+ name` chip. Like an empty socket, the chip takes a dropped query or a click to type a value, which adds the parameter; its `×` (or clearing its text, or dragging its query out) leaves it out again. A parameter left out has no value in the canvas, the program tree (`empty`) or the commands: the host uses its default. Older definitions without the flag work as before, with every parameter required. Optional command parameters (mouths) are drawn as mouths; an empty mouth is already "not given".

## Developing

```
npm ci
npm run dev        # the editor's dev app
npm test
npm run build      # the npm package → dist/

dotnet build dotnet/BlockCodeEditor.slnx
dotnet test  dotnet/BlockCodeEditor.slnx
```

## Releasing

The version lives in `package.json` only. To release, bump it and create a GitHub release tagged `v<version>`. The release workflow (`.github/workflows/publish.yml`) tests both packages, then publishes the npm package and the NuGet package with that version.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

MIT
