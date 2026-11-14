# The .NET library: `BlockCodeEditor.Commands`

For hosts written in .NET that work with the editor's canvases themselves, for example a collaboration server that checks and stores every command (`docs/collaboration.md`). The library gives such a host:

- **the command contract** (`docs/commands.md`): the canvas, its 8 commands with their checks and inverses, the rejection codes, and the JSON format. It is the same as the editor's `src/commands/`, and both run the shared cases in `test/commands/`;
- **the program tree**: the canvas as chains of blocks and their arguments, the same as the editor's `toProgram` (`src/export/program.ts`), plus the way back.

It has no package dependencies beyond .NET itself. It is published to nuget.org as [`BlockCodeEditor.Commands`](https://www.nuget.org/packages/BlockCodeEditor.Commands), with its XML documentation and its symbols (a `.snupkg`, for line numbers in a host's stack traces).

## Referencing it

```xml
<ItemGroup>
  <PackageReference Include="BlockCodeEditor.Commands" Version="0.2.0" />
</ItemGroup>
```

With Central Package Management, the version goes in `Directory.Packages.props` (`<PackageVersion Include="BlockCodeEditor.Commands" Version="0.2.0" />`) and the `PackageReference` has none. Keep the reference in one thin adapter project, so the host's own code doesn't depend on the editor's types.

### Trying an unreleased change

To build a host against a local clone of this repository instead of the package, the host can swap the package for a project reference behind an opt-in property. The property is off by default, so normal builds use the package:

```xml
<ItemGroup Condition="'$(UseLocalBlockCodeEditor)' != 'true'">
  <PackageReference Include="BlockCodeEditor.Commands" />
</ItemGroup>
<ItemGroup Condition="'$(UseLocalBlockCodeEditor)' == 'true'">
  <ProjectReference Include="..\..\..\block-code-editor\dotnet\BlockCodeEditor.Commands\BlockCodeEditor.Commands.csproj" />
</ItemGroup>
```

The path is relative to the host's project file. Build with `dotnet build -p:UseLocalBlockCodeEditor=true`.

## Building

```
dotnet build dotnet/BlockCodeEditor.slnx
dotnet test  dotnet/BlockCodeEditor.slnx
dotnet pack  -c Release -p:Version=0.2.0 dotnet/BlockCodeEditor.Commands/BlockCodeEditor.Commands.csproj
```

Local builds are version `0.0.0-dev`.

## Releasing

The library is released together with the npm package and has the same version. That version lives in `package.json` only. Creating a GitHub release tagged `v<version>` runs `.github/workflows/publish.yml`:
1. It checks the tag against `package.json`.
2. It runs both packages' tests, then packs this library with that version.
3. It publishes the npm package and pushes this one to nuget.org (secret `NUGET_API_KEY`).

## The API (namespace `BlockCodeEditor.Commands`)

| | |
|---|---|
| `CanvasState`, `PlacedBlock`, `ParamSlot`, `PackageRef`, `Position`, `Place` | the canvas, as `docs/commands.md` describes it |
| `Command` and its records (`InsertBlocks`, …, `Batch`) | the commands |
| `CanvasCommands.Apply(state, command)` | the state after the command, or `CommandRejectedException` (`Code`, `CodeName` such as `PLACE_OCCUPIED`, and the message) |
| `CanvasCommands.Invert(command)` | the command that undoes it |
| `CanvasCommands.Version` | the contract's version (1) |
| `CanvasJson.ReadCommand(json)` / `Write(command)` | a command from or as JSON. A malformed one is rejected as `INVALID_COMMAND`. |
| `CanvasJson.ReadState(json)` / `WriteState(state)` | a canvas to store: `{ blocks, dependencies }` |
| `CanvasJson.Options` | the contract's JSON options, for anything else of it |
| `BlockDefinition`, `BlockParam`, `BlockType` | what the conversions need of a block, as the editor's `BlockDefinition` JSON has it (`id`, `name`, `blockType`, `params`, `returnType`) |
| `Programs.ToProgram(state, definitions)` | the canvas as a `Program`, like `toProgram`. Chains are top to bottom, then left to right, then by id. Arguments are `text`, `query`, `body` (a mouth's chain) or `empty`. A block whose definition is missing is `missing`. |
| `Programs.FromProgram(program, dependencies, definitions)` | the canvas a program describes, with deterministic ids (`h0`, `h0/s`, `h0/p2`, …), so every host derives the same canvas from the same program |
| `RejectionCode.HostRejected` | for a host's own refusals (`HOST_REJECTED`) |

## Tests

`dotnet/BlockCodeEditor.Commands.Tests` runs:

- the shared command cases (`test/commands/*.json`), undo/redo of every accepted case, and JSON round trips of commands and states;
- the shared program cases (`test/program/*.json`), which the editor's `toProgram` runs too (`test/program/program.test.ts`);
- `FromProgram` → `ToProgram` round trips, nested mouths, and determinism.

A change to the contract changes the shared cases, the TypeScript and this library together.
