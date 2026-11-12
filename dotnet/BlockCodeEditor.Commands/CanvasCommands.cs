using System.Collections.Immutable;

namespace BlockCodeEditor.Commands
{
    /// <summary>
    /// Applies the block editor's commands with the checks of its contract (docs/commands.md), the same as the editor's
    /// <c>applyCommand</c>. Pure: a state is never modified, a rejected command leaves it as it was.
    /// </summary>
    public static class CanvasCommands
    {
        /// <summary>The version of the command contract implemented here.</summary>
        public const int Version = 1;

        /// <summary>The state after the command; throws <see cref="CommandRejectedException"/> when a check fails.</summary>
        public static CanvasState Apply(CanvasState state, Command command) => command switch
        {
            InsertBlocks c => Insert(state, c),
            RemoveBlocks c => Remove(state, c),
            MoveBlock c => Move(state, c),
            Attach c => AttachBlock(state, c),
            Detach c => DetachBlock(state, c),
            SetText c => Text(state, c),
            SetDependencies c => Dependencies(state, c),
            Batch c => c.Commands.Aggregate(state, Apply),
            _ => throw new CommandRejectedException(RejectionCode.InvalidCommand, $"Unknown command '{command.GetType().Name}'."),
        };

        /// <summary>The command that undoes <paramref name="command"/>, computed from the command alone.</summary>
        public static Command Invert(Command command) => command switch
        {
            InsertBlocks c => new RemoveBlocks(c.Blocks),
            RemoveBlocks c => new InsertBlocks(c.Blocks),
            MoveBlock c => new MoveBlock(c.Id, c.To, c.From),
            Attach c => new Detach(c.Id, c.To, c.From),
            Detach c => new Attach(c.Id, c.From, c.To),
            SetText c => new SetText(c.BlockId, c.Slot, c.To, c.From),
            SetDependencies c => new SetDependencies(c.To, c.From),
            Batch c => new Batch([.. c.Commands.Select(Invert).Reverse()]),
            _ => throw new CommandRejectedException(RejectionCode.InvalidCommand, $"Unknown command '{command.GetType().Name}'."),
        };

        // ── Canonical forms ────────────────────────────────────────────────────

        /// <summary>Empty text is no text.</summary>
        public static string? NormalizeText(string? text) => string.IsNullOrEmpty(text) ? null : text;

        /// <summary>A slot with every field present.</summary>
        public static ParamSlot NormalizeSlot(ParamSlot? slot) =>
            new(slot?.TextValue, slot?.QueryBlockId, slot?.CommandBlockId);

        /// <summary>A block in its canonical form: a linked block at (0, 0).</summary>
        public static PlacedBlock NormalizeBlock(PlacedBlock block) =>
            block.IsRoot ? block with { ParamSlots = [.. block.ParamSlots.Select(NormalizeSlot)] }
                         : block with { X = 0, Y = 0, ParamSlots = [.. block.ParamSlots.Select(NormalizeSlot)] };

        /// <summary>Whether two blocks are the same, field by field, in their canonical forms.</summary>
        public static bool SameBlock(PlacedBlock a, PlacedBlock b)
        {
            a = NormalizeBlock(a);
            b = NormalizeBlock(b);
            return a.InstanceId == b.InstanceId
                && a.DefinitionId == b.DefinitionId
                && a.X == b.X && a.Y == b.Y
                && a.NextBlockId == b.NextBlockId
                && a.ParentBlockId == b.ParentBlockId
                && a.EmbeddedInBlockId == b.EmbeddedInBlockId
                && a.EmbeddedSlotIndex == b.EmbeddedSlotIndex
                && a.ParamSlots.SequenceEqual(b.ParamSlots);   // ParamSlot is a record of strings: compared by value
        }

        /// <summary>The ids of a block and everything hanging off it: the blocks under it, its queries and its mouths' chains.</summary>
        public static List<string> FragmentOf(IReadOnlyDictionary<string, PlacedBlock> blocks, string id)
        {
            var result = new List<string>();
            var seen = new HashSet<string>();
            var queue = new Queue<string>([id]);
            while (queue.Count > 0)
            {
                var current = queue.Dequeue();
                if (!seen.Add(current) || !blocks.TryGetValue(current, out var block))
                    continue;
                result.Add(current);
                foreach (var link in LinksOf(block))
                    queue.Enqueue(link);
            }
            return result;
        }

        private static IEnumerable<string> LinksOf(PlacedBlock block)
        {
            if (block.NextBlockId is not null) yield return block.NextBlockId;
            foreach (var slot in block.ParamSlots)
            {
                if (slot.QueryBlockId is not null) yield return slot.QueryBlockId;
                if (slot.CommandBlockId is not null) yield return slot.CommandBlockId;
            }
        }

        // ── Checks ─────────────────────────────────────────────────────────────

        private static CommandRejectedException Rejected(RejectionCode code, string message) => new(code, message);

        private static PlacedBlock RequireBlock(CanvasState state, string id) =>
            state.Blocks.TryGetValue(id, out var block) ? block : throw Rejected(RejectionCode.BlockNotFound, $"Block '{id}' doesn't exist.");

        private static void RequireRoot(PlacedBlock block)
        {
            if (!block.IsRoot) throw Rejected(RejectionCode.NotARoot, $"Block '{block.InstanceId}' is linked, not a root.");
        }

        private static void RequireAt(PlacedBlock block, Position at)
        {
            if (block.X != at.X || block.Y != at.Y)
                throw Rejected(RejectionCode.PositionChanged, $"Block '{block.InstanceId}' isn't at ({at.X}, {at.Y}).");
        }

        private static ParamSlot RequireSlot(PlacedBlock block, int index)
        {
            if (index < 0 || index >= block.ParamSlots.Length)
                throw Rejected(RejectionCode.NoSuchSlot, $"Block '{block.InstanceId}' has no slot {index}.");
            return NormalizeSlot(block.ParamSlots[index]);
        }

        /// <summary>
        /// The blocks must form one self-contained fragment: a single root, every link inside, back links matching the
        /// forward links, and every block hanging off the root.
        /// </summary>
        private static void RequireFragment(ImmutableArray<PlacedBlock> blocks)
        {
            CommandRejectedException NotAFragment(string why) => Rejected(RejectionCode.NotAFragment, $"The blocks aren't one fragment: {why}.");
            if (blocks.IsDefaultOrEmpty)
                throw Rejected(RejectionCode.InvalidCommand, "The command has no blocks.");

            var byId = new Dictionary<string, PlacedBlock>();
            foreach (var block in blocks)
            {
                if (!byId.TryAdd(block.InstanceId, block))
                    throw NotAFragment($"'{block.InstanceId}' is given twice");
            }
            var roots = blocks.Where(b => b.IsRoot).ToList();
            if (roots.Count != 1)
                throw NotAFragment($"it has {roots.Count} roots");

            foreach (var block in blocks)
            {
                if (block.NextBlockId is not null
                    && (!byId.TryGetValue(block.NextBlockId, out var next) || next.ParentBlockId != block.InstanceId || next.EmbeddedInBlockId is not null))
                    throw NotAFragment($"the block under '{block.InstanceId}' doesn't match");

                for (var index = 0; index < block.ParamSlots.Length; index++)
                {
                    foreach (var childId in new[] { block.ParamSlots[index].QueryBlockId, block.ParamSlots[index].CommandBlockId })
                    {
                        if (childId is null) continue;
                        if (!byId.TryGetValue(childId, out var child) || child.EmbeddedInBlockId != block.InstanceId
                            || child.EmbeddedSlotIndex != index || child.ParentBlockId is not null)
                            throw NotAFragment($"slot {index} of '{block.InstanceId}' doesn't match");
                    }
                }

                if (block.ParentBlockId is not null
                    && (!byId.TryGetValue(block.ParentBlockId, out var parent) || parent.NextBlockId != block.InstanceId))
                    throw NotAFragment($"the block above '{block.InstanceId}' doesn't match");

                if (block.EmbeddedInBlockId is not null)
                {
                    var holds = byId.TryGetValue(block.EmbeddedInBlockId, out var host)
                        && block.EmbeddedSlotIndex >= 0 && block.EmbeddedSlotIndex < host.ParamSlots.Length
                        && (host.ParamSlots[block.EmbeddedSlotIndex].QueryBlockId == block.InstanceId
                            || host.ParamSlots[block.EmbeddedSlotIndex].CommandBlockId == block.InstanceId);
                    if (!holds)
                        throw NotAFragment($"the block holding '{block.InstanceId}' doesn't match");
                }
            }

            if (FragmentOf(byId, roots[0].InstanceId).Count != blocks.Length)
                throw NotAFragment("not every block hangs off the root");
        }

        private static PlacedBlock WithSlot(PlacedBlock block, int index, Func<ParamSlot, ParamSlot> change)
        {
            var slots = block.ParamSlots.Select(NormalizeSlot).ToArray();
            slots[index] = change(slots[index]);
            return block with { ParamSlots = [.. slots] };
        }

        private static bool IsAt(CanvasState state, PlacedBlock block, Place place)
        {
            if (place.Kind == PlaceKind.Next)
                return block.ParentBlockId == place.BlockId
                    && state.Blocks.TryGetValue(place.BlockId, out var parent) && parent.NextBlockId == block.InstanceId;

            if (block.EmbeddedInBlockId != place.BlockId || block.EmbeddedSlotIndex != place.Slot)
                return false;
            if (!state.Blocks.TryGetValue(place.BlockId, out var host) || place.Slot < 0 || place.Slot >= host.ParamSlots.Length)
                return false;
            var slot = NormalizeSlot(host.ParamSlots[place.Slot]);
            return (place.Kind == PlaceKind.Mouth ? slot.CommandBlockId : slot.QueryBlockId) == block.InstanceId;
        }

        private static bool SameDependencies(ImmutableArray<PackageRef> a, ImmutableArray<PackageRef> b)
        {
            var keys = a.Select(d => d.Key).ToHashSet();
            return a.Length == b.Length && keys.Count == b.Select(d => d.Key).ToHashSet().Count && b.All(d => keys.Contains(d.Key));
        }

        // ── Commands ───────────────────────────────────────────────────────────

        private static CanvasState Insert(CanvasState state, InsertBlocks command)
        {
            RequireFragment(command.Blocks);
            foreach (var block in command.Blocks)
            {
                if (state.Blocks.ContainsKey(block.InstanceId))
                    throw Rejected(RejectionCode.IdExists, $"Block '{block.InstanceId}' already exists.");
            }
            return state with { Blocks = state.Blocks.SetItems(command.Blocks.Select(b => KeyValuePair.Create(b.InstanceId, NormalizeBlock(b)))) };
        }

        private static CanvasState Remove(CanvasState state, RemoveBlocks command)
        {
            RequireFragment(command.Blocks);
            var ids = new HashSet<string>();
            foreach (var given in command.Blocks)
            {
                var block = RequireBlock(state, given.InstanceId);
                if (!SameBlock(block, given))
                    throw Rejected(RejectionCode.BlockChanged, $"Block '{given.InstanceId}' has changed.");
                ids.Add(given.InstanceId);
            }
            foreach (var block in state.Blocks.Values)
            {
                if (!ids.Contains(block.InstanceId) && LinksOf(block).Any(ids.Contains))
                    throw Rejected(RejectionCode.LinkedFromOutside, $"Block '{block.InstanceId}' links into the blocks to remove.");
            }
            return state with { Blocks = state.Blocks.RemoveRange(ids) };
        }

        private static CanvasState Move(CanvasState state, MoveBlock command)
        {
            var block = RequireBlock(state, command.Id);
            RequireRoot(block);
            RequireAt(block, command.From);
            return state with { Blocks = state.Blocks.SetItem(block.InstanceId, block with { X = command.To.X, Y = command.To.Y }) };
        }

        private static CanvasState AttachBlock(CanvasState state, Attach command)
        {
            var block = RequireBlock(state, command.Id);
            RequireRoot(block);
            RequireAt(block, command.From);
            var place = command.To;
            var target = RequireBlock(state, place.BlockId);
            if (FragmentOf(state.Blocks, block.InstanceId).Contains(place.BlockId))
                throw Rejected(RejectionCode.Cycle, $"Block '{place.BlockId}' is inside the fragment of '{block.InstanceId}'.");

            var blocks = state.Blocks;
            if (place.Kind == PlaceKind.Next)
            {
                if (target.NextBlockId is not null)
                    throw Rejected(RejectionCode.PlaceOccupied, $"Block '{place.BlockId}' already has a block under it.");
                blocks = blocks
                    .SetItem(target.InstanceId, target with { NextBlockId = block.InstanceId })
                    .SetItem(block.InstanceId, block with { X = 0, Y = 0, ParentBlockId = target.InstanceId });
                return state with { Blocks = blocks };
            }

            var slot = RequireSlot(target, place.Slot);
            if (place.Kind == PlaceKind.Mouth)
            {
                if (slot.CommandBlockId is not null || slot.QueryBlockId is not null)
                    throw Rejected(RejectionCode.PlaceOccupied, $"Mouth {place.Slot} of '{place.BlockId}' isn't empty.");
                blocks = blocks.SetItem(target.InstanceId, WithSlot(target, place.Slot, s => s with { CommandBlockId = block.InstanceId }));
            }
            else
            {
                if (slot.QueryBlockId is not null || slot.CommandBlockId is not null || slot.TextValue is not null)
                    throw Rejected(RejectionCode.PlaceOccupied, $"Socket {place.Slot} of '{place.BlockId}' isn't empty.");
                blocks = blocks.SetItem(target.InstanceId, WithSlot(target, place.Slot, s => s with { QueryBlockId = block.InstanceId }));
            }
            blocks = blocks.SetItem(block.InstanceId, block with
            {
                X = 0, Y = 0, EmbeddedInBlockId = target.InstanceId, EmbeddedSlotIndex = place.Slot,
            });
            return state with { Blocks = blocks };
        }

        private static CanvasState DetachBlock(CanvasState state, Detach command)
        {
            var block = RequireBlock(state, command.Id);
            if (!IsAt(state, block, command.From))
                throw Rejected(RejectionCode.NotAtPlace, $"Block '{block.InstanceId}' isn't linked at the given place.");

            var place = command.From;
            var host = state.Blocks[place.BlockId];
            var blocks = state.Blocks.SetItem(host.InstanceId, place.Kind switch
            {
                PlaceKind.Next => host with { NextBlockId = null },
                PlaceKind.Mouth => WithSlot(host, place.Slot, s => s with { CommandBlockId = null }),
                _ => WithSlot(host, place.Slot, s => s with { QueryBlockId = null }),
            });
            blocks = blocks.SetItem(block.InstanceId, block with
            {
                X = command.To.X, Y = command.To.Y, ParentBlockId = null, EmbeddedInBlockId = null, EmbeddedSlotIndex = -1,
            });
            return state with { Blocks = blocks };
        }

        private static CanvasState Text(CanvasState state, SetText command)
        {
            var block = RequireBlock(state, command.BlockId);
            var slot = RequireSlot(block, command.Slot);
            if (slot.QueryBlockId is not null)
                throw Rejected(RejectionCode.SlotHasQuery, $"Slot {command.Slot} of '{block.InstanceId}' holds a query.");
            if (NormalizeText(slot.TextValue) != NormalizeText(command.From))
                throw Rejected(RejectionCode.TextChanged, $"Slot {command.Slot} of '{block.InstanceId}' has changed.");
            return state with
            {
                Blocks = state.Blocks.SetItem(block.InstanceId, WithSlot(block, command.Slot, s => s with { TextValue = NormalizeText(command.To) })),
            };
        }

        private static CanvasState Dependencies(CanvasState state, SetDependencies command)
        {
            if (!SameDependencies(state.Dependencies, command.From))
                throw Rejected(RejectionCode.DependenciesChanged, "The dependencies have changed.");
            return state with { Dependencies = command.To };
        }
    }
}
