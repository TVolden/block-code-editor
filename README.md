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
