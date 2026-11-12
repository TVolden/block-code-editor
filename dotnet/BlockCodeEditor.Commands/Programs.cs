using System.Collections.Immutable;
using System.Text.Json.Serialization;

namespace BlockCodeEditor.Commands
{
    /// <summary>What a block is (the editor's <c>blockType</c>), or <c>missing</c> in a program for a block whose definition isn't known.</summary>
    [JsonConverter(typeof(JsonStringEnumConverter<BlockType>))]
    public enum BlockType
    {
        /// <summary>A start block (an event): the head of a chain.</summary>
        [JsonStringEnumMemberName("start")] Start,
        [JsonStringEnumMemberName("command")] Command,
        [JsonStringEnumMemberName("query")] Query,
        /// <summary>Only in a program: the block's definition isn't known.</summary>
        [JsonStringEnumMemberName("missing")] Missing,
    }

    /// <summary>A parameter of a block definition.</summary>
    public sealed record BlockParam(string Name, string Type);

    /// <summary>
    /// What the conversions need to know of a block, as the editor's <c>BlockDefinition</c> has it (JSON: <c>id</c>,
    /// <c>name</c>, <c>blockType</c>, <c>params</c>, <c>returnType</c>; other fields are ignored).
    /// </summary>
    public sealed record BlockDefinition(string Id, string Name, BlockType BlockType, ImmutableArray<BlockParam> Params, string? ReturnType = null)
    {
        /// <summary>The parameter type of a mouth: a command block's parameter holding a chain of commands.</summary>
        public const string CommandType = "command";

        /// <summary>Whether the parameter is a mouth (only command blocks have them).</summary>
        public bool IsMouth(BlockParam param) => BlockType == BlockType.Command && param.Type == CommandType;
    }

    // ── The program (the editor's src/export/program.ts) ───────────────────────

    /// <summary>The canvas as a plain program: no instance ids or links, just chains of blocks and their arguments.</summary>
    public sealed record Program(ImmutableArray<ProgramRoot> Roots);

    /// <summary>A chain on the canvas: its first block (a start block, or a loose one) and the blocks under it, in order.</summary>
    public sealed record ProgramRoot(Position Position, ImmutableArray<ProgramNode> Body);

    /// <summary>A block: which, and its arguments.</summary>
    public sealed record ProgramNode(string DefinitionId, string Name, BlockType BlockType, ImmutableArray<ProgramArg> Args);

    /// <summary>A block's argument: the parameter and what fills it.</summary>
    public sealed record ProgramArg(string Name, string Type, ProgramValue Value);

    /// <summary>What fills a parameter. JSON with a <c>kind</c>: <c>text</c>, <c>query</c>, <c>body</c> or <c>empty</c>.</summary>
    [JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
    [JsonDerivedType(typeof(TextValue), "text")]
    [JsonDerivedType(typeof(QueryValue), "query")]
    [JsonDerivedType(typeof(BodyValue), "body")]
    [JsonDerivedType(typeof(EmptyValue), "empty")]
    public abstract record ProgramValue;

    /// <summary>A typed value.</summary>
    public sealed record TextValue(string Text) : ProgramValue;
    /// <summary>A query in the socket.</summary>
    public sealed record QueryValue(ProgramNode Node) : ProgramValue;
    /// <summary>A mouth's chain (empty for an empty mouth).</summary>
    public sealed record BodyValue(ImmutableArray<ProgramNode> Body) : ProgramValue;
    /// <summary>Nothing.</summary>
    public sealed record EmptyValue : ProgramValue;

    /// <summary>Converts between a canvas and its program.</summary>
    public static class Programs
    {
        /// <summary>
        /// The canvas as a program, the same as the editor's <c>toProgram</c>: the chains top to bottom, then left to
        /// right. A mouth is a command block's <c>command</c> parameter; empty text is <c>empty</c>; a block whose
        /// definition isn't known keeps its slots as <c>param{i}</c> of type <c>string</c>.
        /// </summary>
        public static Program ToProgram(CanvasState state, IReadOnlyDictionary<string, BlockDefinition> definitions)
        {
            var visited = new HashSet<string>();

            ImmutableArray<ProgramNode> Chain(string? firstId)
            {
                var nodes = ImmutableArray.CreateBuilder<ProgramNode>();
                var id = firstId;
                while (id is not null && !visited.Contains(id) && state.Blocks.TryGetValue(id, out var block))
                {
                    nodes.Add(Node(block));
                    id = block.NextBlockId;
                }
                return nodes.ToImmutable();
            }

            ProgramNode Node(PlacedBlock block)
            {
                visited.Add(block.InstanceId);
                definitions.TryGetValue(block.DefinitionId, out var definition);
                var args = block.ParamSlots.Select((slot, i) =>
                {
                    var param = definition is not null && i < definition.Params.Length ? definition.Params[i] : new BlockParam($"param{i}", "string");
                    ProgramValue value;
                    if (definition is not null && definition.IsMouth(param))
                        value = new BodyValue(Chain(slot.CommandBlockId));
                    else if (slot.QueryBlockId is not null && state.Blocks.TryGetValue(slot.QueryBlockId, out var query))
                        value = new QueryValue(Node(query));
                    else if (!string.IsNullOrEmpty(slot.TextValue))
                        value = new TextValue(slot.TextValue);
                    else
                        value = new EmptyValue();
                    return new ProgramArg(param.Name, param.Type, value);
                }).ToImmutableArray();
                return new ProgramNode(block.DefinitionId, definition?.Name ?? block.DefinitionId, definition?.BlockType ?? BlockType.Missing, args);
            }

            var roots = state.Blocks.Values
                .Where(b => b.IsRoot)
                .OrderBy(b => b.Y).ThenBy(b => b.X).ThenBy(b => b.InstanceId, StringComparer.Ordinal)
                .Select(root => new ProgramRoot(new Position(root.X, root.Y), Chain(root.InstanceId)))
                .ToImmutableArray();
            return new Program(roots);
        }

        /// <summary>
        /// The canvas a program describes: roots at their positions, bodies chained, queries in their sockets, mouths'
        /// bodies in their mouths, text in its slots. Arguments go to the slot of the parameter with their name (by
        /// order when the definition or the name isn't known). Linked blocks are at (0, 0).
        /// </summary>
        /// <remarks>
        /// The block ids are derived from the blocks' places in the program (<c>h0</c> for the first root,
        /// <c>h0/s</c> for the block under it, <c>h0/p2</c> for what its third slot holds, and so on), so the same
        /// program always gives the same canvas: every host derives it alike. Ids the editor makes are UUIDs, so they
        /// never collide with these.
        /// </remarks>
        public static CanvasState FromProgram(Program program, IEnumerable<PackageRef> dependencies, IReadOnlyDictionary<string, BlockDefinition> definitions)
        {
            var blocks = new Dictionary<string, PlacedBlock>();

            int SlotIndex(BlockDefinition? definition, ProgramArg arg, int fallback)
            {
                var index = definition is null ? -1 : definition.Params.Select(p => p.Name).ToList().IndexOf(arg.Name);
                return index >= 0 ? index : fallback;
            }

            // Places the chain from `nodes[0]` (linked as `link` makes it) at `id`; returns the first block's id.
            string? PlaceChain(ImmutableArray<ProgramNode> nodes, string id, Func<string, PlacedBlock> link)
            {
                if (nodes.IsDefaultOrEmpty)
                    return null;
                PlaceNode(nodes, 0, id, link);
                return id;
            }

            void PlaceNode(ImmutableArray<ProgramNode> nodes, int index, string id, Func<string, PlacedBlock> link)
            {
                var node = nodes[index];
                blocks[id] = link(id);
                definitions.TryGetValue(node.DefinitionId, out var definition);
                var count = Math.Max(definition?.Params.Length ?? 0, node.Args.Length);
                var slots = Enumerable.Repeat(new ParamSlot(), count).ToArray();
                for (var i = 0; i < node.Args.Length; i++)
                {
                    var arg = node.Args[i];
                    var slot = SlotIndex(definition, arg, i);
                    if (slot >= count) continue;
                    var childId = $"{id}/p{slot}";
                    slots[slot] = arg.Value switch
                    {
                        TextValue text => new ParamSlot(TextValue: CanvasCommands.NormalizeText(text.Text)),
                        QueryValue query => new ParamSlot(QueryBlockId: PlaceChain([query.Node], childId, child => Embedded(child, query.Node, id, slot))),
                        BodyValue body => new ParamSlot(CommandBlockId: PlaceChain(body.Body, childId, child => Embedded(child, body.Body[0], id, slot))),
                        _ => new ParamSlot(),
                    };
                }

                string? next = null;
                if (index + 1 < nodes.Length)
                {
                    next = $"{id}/s";
                    PlaceNode(nodes, index + 1, next, child => new PlacedBlock(child, nodes[index + 1].DefinitionId, 0, 0, null, id, null, -1, []));
                }
                blocks[id] = blocks[id] with { ParamSlots = [.. slots], NextBlockId = next };
            }

            static PlacedBlock Embedded(string id, ProgramNode node, string hostId, int slot) =>
                new(id, node.DefinitionId, 0, 0, null, null, hostId, slot, []);

            for (var i = 0; i < program.Roots.Length; i++)
            {
                var root = program.Roots[i];
                PlaceChain(root.Body, $"h{i}", id => new PlacedBlock(id, root.Body[0].DefinitionId, root.Position.X, root.Position.Y, null, null, null, -1, []));
            }
            return new CanvasState(blocks.ToImmutableDictionary(), [.. dependencies]);
        }
    }
}
