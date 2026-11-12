using System.Text.Json;

[assembly: Parallelize(Scope = ExecutionScope.MethodLevel)]

namespace BlockCodeEditor.Commands.Tests
{
    /// <summary>
    /// The command contract's shared cases (test/commands/*.json), which the editor's TypeScript tests run too: each
    /// case's command applied to its state gives the expected state or rejection code.
    /// </summary>
    [TestClass]
    public sealed class CommandFixtureTests
    {
        private sealed record FixtureState(PlacedBlock[] Blocks, PackageRef[] Dependencies);

        private sealed record Fixture(string Name, FixtureState Before, JsonElement Command, FixtureState? After, string? Rejected);

        private static string Folder => Path.Combine(AppContext.BaseDirectory, "Fixtures", "commands");

        public static IEnumerable<object[]> Fixtures()
        {
            foreach (var file in Directory.GetFiles(Folder, "*.json").Order())
            {
                foreach (var fixture in JsonSerializer.Deserialize<Fixture[]>(File.ReadAllText(file), CanvasJson.Options)!)
                    yield return [Path.GetFileName(file), fixture.Name];
            }
        }

        private static Fixture Load(string file, string name) =>
            JsonSerializer.Deserialize<Fixture[]>(File.ReadAllText(Path.Combine(Folder, file)), CanvasJson.Options)!.Single(f => f.Name == name);

        private static CanvasState State(FixtureState state) => CanvasState.Of(state.Blocks, state.Dependencies);

        /// <summary>A state as a comparable string: blocks normalized and sorted, dependencies sorted.</summary>
        internal static string Comparable(CanvasState state) => JsonSerializer.Serialize(new
        {
            blocks = state.Blocks.Values.Select(CanvasCommands.NormalizeBlock).OrderBy(b => b.InstanceId, StringComparer.Ordinal).ToArray(),
            dependencies = state.Dependencies.OrderBy(d => d.Key, StringComparer.Ordinal).ToArray(),
        }, CanvasJson.Options);

        private static string? RejectionOf(Action run)
        {
            try
            {
                run();
                return null;
            }
            catch (CommandRejectedException exception)
            {
                return exception.CodeName;
            }
        }

        [TestMethod]
        [DynamicData(nameof(Fixtures))]
        public void AppliesTheCase(string file, string name)
        {
            var fixture = Load(file, name);
            var before = State(fixture.Before);
            if (fixture.Rejected is not null)
            {
                Assert.AreEqual(fixture.Rejected, RejectionOf(() => CanvasCommands.Apply(before, CanvasJson.ReadCommand(fixture.Command))));
                return;
            }
            var after = CanvasCommands.Apply(before, CanvasJson.ReadCommand(fixture.Command));
            Assert.AreEqual(Comparable(State(fixture.After!)), Comparable(after));
        }

        [TestMethod]
        [DynamicData(nameof(Fixtures))]
        public void UndoAndRedoRestoreTheStates(string file, string name)
        {
            var fixture = Load(file, name);
            if (fixture.Rejected is not null)
                return;
            var before = State(fixture.Before);
            var command = CanvasJson.ReadCommand(fixture.Command);
            var after = CanvasCommands.Apply(before, command);
            var undone = CanvasCommands.Apply(after, CanvasCommands.Invert(command));
            Assert.AreEqual(Comparable(before), Comparable(undone));
            Assert.AreEqual(Comparable(after), Comparable(CanvasCommands.Apply(undone, command)));
        }

        [TestMethod]
        public void TheCasesAreThere() => Assert.IsGreaterThan(30, Fixtures().Count());

        [TestMethod]
        public void CommandsRoundTripAsJson()
        {
            foreach (var row in Fixtures())
            {
                var fixture = Load((string)row[0], (string)row[1]);
                if (fixture.Rejected == "INVALID_COMMAND")
                    continue;
                var command = CanvasJson.ReadCommand(fixture.Command);
                Assert.AreEqual(CanvasJson.Write(command).GetRawText(), CanvasJson.Write(CanvasJson.ReadCommand(CanvasJson.Write(command))).GetRawText());
            }
        }

        [TestMethod]
        public void StatesRoundTripAsJson()
        {
            foreach (var row in Fixtures())
            {
                var state = State(Load((string)row[0], (string)row[1]).Before);
                Assert.AreEqual(Comparable(state), Comparable(CanvasJson.ReadState(CanvasJson.WriteState(state))));
            }
        }

        [TestMethod]
        public void RejectionCodesAreWrittenAsTheContractsStrings()
        {
            Assert.AreEqual("\"BLOCK_NOT_FOUND\"", JsonSerializer.Serialize(RejectionCode.BlockNotFound, CanvasJson.Options));
            Assert.AreEqual("\"HOST_REJECTED\"", JsonSerializer.Serialize(RejectionCode.HostRejected, CanvasJson.Options));
            Assert.AreEqual("NOT_A_FRAGMENT", CanvasJson.CodeName(RejectionCode.NotAFragment));
        }
    }
}
