using System.Collections.Immutable;
using System.Text.Json.Serialization;

namespace BlockCodeEditor.Commands
{
    /// <summary>A parameter of a placed block: its typed value, the query in its socket, or the first block of its mouth's chain.</summary>
    public sealed record ParamSlot(string? TextValue = null, string? QueryBlockId = null, string? CommandBlockId = null);

    /// <summary>
    /// A block on the canvas, as the editor places it. Only a root's position means anything; a linked block is always
    /// at (0, 0).
    /// </summary>
    public sealed record PlacedBlock(
        string InstanceId,
        string DefinitionId,
        int X,
        int Y,
        string? NextBlockId,
        string? ParentBlockId,
        string? EmbeddedInBlockId,
        int EmbeddedSlotIndex,
        ImmutableArray<ParamSlot> ParamSlots)
    {
        /// <summary>Neither under a block nor held by one.</summary>
        [JsonIgnore]
        public bool IsRoot => ParentBlockId is null && EmbeddedInBlockId is null;
    }

    /// <summary>One version of a package the canvas depends on.</summary>
    public sealed record PackageRef(string Publisher, string Name, string Version)
    {
        /// <summary><c>publisher/name@version</c>: dependencies compare as a set of these.</summary>
        [JsonIgnore]
        public string Key => $"{Publisher}/{Name}@{Version}";
    }

    /// <summary>A canvas position; commands use integer coordinates.</summary>
    public sealed record Position(int X, int Y);

    /// <summary>What commands change: the blocks (by id) and the packages the canvas depends on.</summary>
    public sealed record CanvasState(ImmutableDictionary<string, PlacedBlock> Blocks, ImmutableArray<PackageRef> Dependencies)
    {
        public static CanvasState Empty { get; } = new(ImmutableDictionary<string, PlacedBlock>.Empty, []);

        public static CanvasState Of(IEnumerable<PlacedBlock> blocks, IEnumerable<PackageRef> dependencies) =>
            new(blocks.ToImmutableDictionary(b => b.InstanceId), [.. dependencies]);
    }

    /// <summary>The kinds of place a block can be linked at.</summary>
    public enum PlaceKind
    {
        /// <summary>Under a block (its next).</summary>
        Next,
        /// <summary>At the top of a block's mouth (a slot's command chain).</summary>
        Mouth,
        /// <summary>In a block's socket (a slot's query).</summary>
        Socket,
    }

    /// <summary>
    /// Where a block can be linked. JSON: <c>{ "next": id }</c>, <c>{ "mouth": id, "slot": n }</c> or
    /// <c>{ "socket": id, "slot": n }</c>.
    /// </summary>
    [JsonConverter(typeof(PlaceConverter))]
    public sealed record Place(PlaceKind Kind, string BlockId, int Slot = 0)
    {
        public static Place Next(string blockId) => new(PlaceKind.Next, blockId);
        public static Place Mouth(string blockId, int slot) => new(PlaceKind.Mouth, blockId, slot);
        public static Place Socket(string blockId, int slot) => new(PlaceKind.Socket, blockId, slot);
    }

    /// <summary>A command of the contract (version <see cref="CanvasCommands.Version"/>); JSON with a <c>type</c>.</summary>
    [JsonPolymorphic(TypeDiscriminatorPropertyName = "type", UnknownDerivedTypeHandling = JsonUnknownDerivedTypeHandling.FailSerialization)]
    [JsonDerivedType(typeof(InsertBlocks), "InsertBlocks")]
    [JsonDerivedType(typeof(RemoveBlocks), "RemoveBlocks")]
    [JsonDerivedType(typeof(MoveBlock), "MoveBlock")]
    [JsonDerivedType(typeof(Attach), "Attach")]
    [JsonDerivedType(typeof(Detach), "Detach")]
    [JsonDerivedType(typeof(SetText), "SetText")]
    [JsonDerivedType(typeof(SetDependencies), "SetDependencies")]
    [JsonDerivedType(typeof(Batch), "Batch")]
    public abstract record Command;

    /// <summary>Adds a detached fragment: one root block and everything hanging off it.</summary>
    public sealed record InsertBlocks(ImmutableArray<PlacedBlock> Blocks) : Command;
    /// <summary>Removes a detached fragment, given exactly as it is.</summary>
    public sealed record RemoveBlocks(ImmutableArray<PlacedBlock> Blocks) : Command;
    /// <summary>Moves a root block.</summary>
    public sealed record MoveBlock(string Id, Position From, Position To) : Command;
    /// <summary>Links a root block (at <c>From</c>) into an empty place.</summary>
    public sealed record Attach(string Id, Place To, Position From) : Command;
    /// <summary>Unlinks a block (with what hangs off it) from its place, making it a root at <c>To</c>.</summary>
    public sealed record Detach(string Id, Place From, Position To) : Command;
    /// <summary>Sets or clears a parameter's typed value.</summary>
    public sealed record SetText(string BlockId, int Slot, string? From, string? To) : Command;
    /// <summary>Changes the packages the canvas depends on.</summary>
    public sealed record SetDependencies(ImmutableArray<PackageRef> From, ImmutableArray<PackageRef> To) : Command;
    /// <summary>Applies its commands in order, all or nothing.</summary>
    public sealed record Batch(ImmutableArray<Command> Commands) : Command;

    /// <summary>Why a command was rejected; written as the contract's strings (e.g. <c>BLOCK_NOT_FOUND</c>).</summary>
    [JsonConverter(typeof(JsonStringEnumConverter<RejectionCode>))]
    public enum RejectionCode
    {
        [JsonStringEnumMemberName("BLOCK_NOT_FOUND")] BlockNotFound,
        [JsonStringEnumMemberName("ID_EXISTS")] IdExists,
        [JsonStringEnumMemberName("NOT_A_FRAGMENT")] NotAFragment,
        [JsonStringEnumMemberName("BLOCK_CHANGED")] BlockChanged,
        [JsonStringEnumMemberName("LINKED_FROM_OUTSIDE")] LinkedFromOutside,
        [JsonStringEnumMemberName("NOT_A_ROOT")] NotARoot,
        [JsonStringEnumMemberName("POSITION_CHANGED")] PositionChanged,
        [JsonStringEnumMemberName("NO_SUCH_SLOT")] NoSuchSlot,
        [JsonStringEnumMemberName("PLACE_OCCUPIED")] PlaceOccupied,
        [JsonStringEnumMemberName("CYCLE")] Cycle,
        [JsonStringEnumMemberName("NOT_AT_PLACE")] NotAtPlace,
        [JsonStringEnumMemberName("SLOT_HAS_QUERY")] SlotHasQuery,
        [JsonStringEnumMemberName("TEXT_CHANGED")] TextChanged,
        [JsonStringEnumMemberName("DEPENDENCIES_CHANGED")] DependenciesChanged,
        [JsonStringEnumMemberName("INVALID_COMMAND")] InvalidCommand,
        /// <summary>The host refused the command for its own reasons (e.g. a package that doesn't exist); the message says why.</summary>
        [JsonStringEnumMemberName("HOST_REJECTED")] HostRejected,
    }

    /// <summary>A command whose checks failed; the state is unchanged.</summary>
    public sealed class CommandRejectedException(RejectionCode code, string message) : Exception(message)
    {
        public RejectionCode Code { get; } = code;

        /// <summary>The code as the contract writes it (e.g. <c>BLOCK_NOT_FOUND</c>).</summary>
        public string CodeName => CanvasJson.CodeName(Code);
    }
}
