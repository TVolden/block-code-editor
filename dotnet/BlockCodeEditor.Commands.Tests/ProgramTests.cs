using System.Collections.Immutable;
using System.Text.Json;

namespace BlockCodeEditor.Commands.Tests
{
    /// <summary>
    /// The program tree: the shared cases (test/program/*.json, which the editor's toProgram runs too), and FromProgram
    /// giving back the same program and the same canvas every time.
    /// </summary>
    [TestClass]
    public sealed class ProgramTests
    {
        private sealed record FixtureState(PlacedBlock[] Blocks, PackageRef[] Dependencies);

        private sealed record Fixture(string Name, BlockDefinition[] Definitions, FixtureState Canvas, Program Program);

        private static string Folder => Path.Combine(AppContext.BaseDirectory, "Fixtures", "program");

        private static IEnumerable<Fixture> All() =>
            Directory.GetFiles(Folder, "*.json").Order()
                .SelectMany(file => JsonSerializer.Deserialize<Fixture[]>(File.ReadAllText(file), CanvasJson.Options)!);

        public static IEnumerable<object[]> Names() => All().Select(f => new object[] { f.Name });

        private static Fixture Load(string name) => All().Single(f => f.Name == name);

        private static Dictionary<string, BlockDefinition> Definitions(Fixture fixture) => fixture.Definitions.ToDictionary(d => d.Id);

        private static string Json(object value) => JsonSerializer.Serialize(value, CanvasJson.Options);

        [TestMethod]
        [DynamicData(nameof(Names))]
        public void ACanvasGivesItsProgram(string name)
        {
            var fixture = Load(name);
            var program = Programs.ToProgram(CanvasState.Of(fixture.Canvas.Blocks, fixture.Canvas.Dependencies), Definitions(fixture));
            Assert.AreEqual(Json(fixture.Program), Json(program));
        }

        [TestMethod]
        [DynamicData(nameof(Names))]
        public void AProgramGivesACanvasWithTheSameProgram(string name)
        {
            var fixture = Load(name);
            var canvas = Programs.FromProgram(fixture.Program, [], Definitions(fixture));
            Assert.AreEqual(Json(fixture.Program), Json(Programs.ToProgram(canvas, Definitions(fixture))));
        }

        [TestMethod]
        [DynamicData(nameof(Names))]
        public void TheSameProgramGivesTheSameCanvas(string name)
        {
            var fixture = Load(name);
            var first = Programs.FromProgram(fixture.Program, [], Definitions(fixture));
            var second = Programs.FromProgram(fixture.Program, [], Definitions(fixture));
            Assert.AreEqual(CommandFixtureTests.Comparable(first), CommandFixtureTests.Comparable(second));
            CollectionAssert.Contains(first.Blocks.Keys.ToList(), "h0");
        }

        [TestMethod]
        [DynamicData(nameof(Names))]
        public void ACanvasFromAProgramFollowsTheContract(string name)
        {
            var fixture = Load(name);
            var canvas = Programs.FromProgram(fixture.Program, [], Definitions(fixture));

            // One fragment per root, linked blocks at (0, 0): removing each root's fragment, exactly as it is, empties it.
            var state = canvas;
            foreach (var root in canvas.Blocks.Values.Where(b => b.IsRoot).ToList())
            {
                var fragment = CanvasCommands.FragmentOf(state.Blocks, root.InstanceId).Select(id => state.Blocks[id]);
                state = CanvasCommands.Apply(state, new RemoveBlocks([.. fragment]));
            }
            Assert.IsEmpty(state.Blocks);
            Assert.IsTrue(canvas.Blocks.Values.Where(b => !b.IsRoot).All(b => b.X == 0 && b.Y == 0));
        }

        [TestMethod]
        public void NestedMouthsGoBothWays()
        {
            var definitions = new Dictionary<string, BlockDefinition>
            {
                ["Expose"] = new("Expose", "Expose", BlockType.Command, [new("Label", "string"), new("Command", "command")]),
                ["Draw"] = new("Draw", "Draw", BlockType.Command, [new("Count", "number")]),
            };
            ProgramNode Draw(int n) => new("Draw", "Draw", BlockType.Command, [new("Count", "number", new TextValue(n.ToString()))]);
            ProgramNode Expose(string label, params ProgramNode[] body) =>
                new("Expose", "Expose", BlockType.Command, [new("Label", "string", new TextValue(label)), new("Command", "command", new BodyValue([.. body]))]);
            var program = new Program([new ProgramRoot(new Position(1, 2), [Expose("Outer", Expose("Inner", Draw(1), Draw(2))), Draw(3)])]);

            var canvas = Programs.FromProgram(program, [new PackageRef("p", "x", "1.0.0")], definitions);
            Assert.AreEqual(Json(program), Json(Programs.ToProgram(canvas, definitions)));
            Assert.AreEqual("p/x@1.0.0", canvas.Dependencies.Single().Key);
            Assert.AreEqual("h0/p1", canvas.Blocks["h0"].ParamSlots[1].CommandBlockId);
            Assert.AreEqual("h0/s", canvas.Blocks["h0"].NextBlockId);
        }
    }
}
