using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace BlockCodeEditor.Commands
{
    /// <summary>The contract's JSON: camelCase, a command's <c>type</c> anywhere in its object.</summary>
    public static class CanvasJson
    {
        /// <summary>The options for the contract's JSON (commands, states and programs).</summary>
        public static JsonSerializerOptions Options { get; } = new(JsonSerializerDefaults.Web)
        {
            AllowOutOfOrderMetadataProperties = true,
        };

        /// <summary>A command from JSON; a malformed one (unknown type, missing fields) is rejected as <c>INVALID_COMMAND</c>.</summary>
        public static Command ReadCommand(JsonElement json)
        {
            try
            {
                return json.Deserialize<Command>(Options)
                    ?? throw new CommandRejectedException(RejectionCode.InvalidCommand, "The command is missing.");
            }
            catch (JsonException exception)
            {
                throw new CommandRejectedException(RejectionCode.InvalidCommand, $"The command is malformed: {exception.Message}");
            }
            catch (NotSupportedException exception)
            {
                throw new CommandRejectedException(RejectionCode.InvalidCommand, $"The command is malformed: {exception.Message}");
            }
        }

        /// <summary>A command as JSON.</summary>
        public static JsonElement Write(Command command) => JsonSerializer.SerializeToElement(command, Options);

        private sealed record StoredState(PlacedBlock[] Blocks, PackageRef[] Dependencies);

        /// <summary>A state as JSON, for storing: <c>{ blocks: [...], dependencies: [...] }</c>, blocks sorted by id.</summary>
        public static string WriteState(CanvasState state) => JsonSerializer.Serialize(
            new StoredState([.. state.Blocks.Values.OrderBy(b => b.InstanceId, StringComparer.Ordinal)], [.. state.Dependencies]), Options);

        /// <summary>A state from the JSON <see cref="WriteState"/> writes.</summary>
        public static CanvasState ReadState(string json)
        {
            var stored = JsonSerializer.Deserialize<StoredState>(json, Options) ?? throw new JsonException("The canvas state is missing.");
            return CanvasState.Of(stored.Blocks, stored.Dependencies);
        }

        /// <summary>The code as the contract writes it (e.g. <c>BLOCK_NOT_FOUND</c>).</summary>
        public static string CodeName(RejectionCode code) =>
            typeof(RejectionCode).GetField(code.ToString())!.GetCustomAttribute<JsonStringEnumMemberNameAttribute>()!.Name;
    }

    /// <summary>A place as <c>{ "next": id }</c>, <c>{ "mouth": id, "slot": n }</c> or <c>{ "socket": id, "slot": n }</c>.</summary>
    public sealed class PlaceConverter : JsonConverter<Place>
    {
        /// <inheritdoc />
        public override Place Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            using var document = JsonDocument.ParseValue(ref reader);
            var json = document.RootElement;
            if (json.ValueKind != JsonValueKind.Object)
                throw new JsonException("A place must be an object.");

            int Slot() => json.TryGetProperty("slot", out var slot) && slot.ValueKind == JsonValueKind.Number
                ? slot.GetInt32()
                : throw new JsonException("A mouth or socket place needs a slot.");

            if (json.TryGetProperty("next", out var next) && next.ValueKind == JsonValueKind.String)
                return Place.Next(next.GetString()!);
            if (json.TryGetProperty("mouth", out var mouth) && mouth.ValueKind == JsonValueKind.String)
                return Place.Mouth(mouth.GetString()!, Slot());
            if (json.TryGetProperty("socket", out var socket) && socket.ValueKind == JsonValueKind.String)
                return Place.Socket(socket.GetString()!, Slot());
            throw new JsonException("A place must have 'next', 'mouth' or 'socket'.");
        }

        /// <inheritdoc />
        public override void Write(Utf8JsonWriter writer, Place value, JsonSerializerOptions options)
        {
            writer.WriteStartObject();
            switch (value.Kind)
            {
                case PlaceKind.Next:
                    writer.WriteString("next", value.BlockId);
                    break;
                case PlaceKind.Mouth:
                    writer.WriteString("mouth", value.BlockId);
                    writer.WriteNumber("slot", value.Slot);
                    break;
                case PlaceKind.Socket:
                    writer.WriteString("socket", value.BlockId);
                    writer.WriteNumber("slot", value.Slot);
                    break;
            }
            writer.WriteEndObject();
        }
    }
}
