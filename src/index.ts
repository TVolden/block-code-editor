export { default } from './editor/BlockEditor';
export { default as BlockEditor } from './editor/BlockEditor';
export type {
  SerializedCanvas, BlockDefinition, ParamType, BlockType, PlacedBlock, ParamSlot,
  PackageRef, CatalogPackage, PackageAction,
} from './types';
export { packageKey, compareVersions } from './utils/packages';
// The command contract (docs/commands.md): every canvas change is one of these commands.
export {
  COMMANDS_VERSION, CommandRejected, applyCommand, invertCommand, fragmentOf, normalizeBlock, normalizeSlot,
  normalizeText, placeNewBlock, moveChain, deleteChain, setSocketText, changeDependencies, placeOf, samePlace,
  roundPosition,
} from './commands';
export type {
  CanvasState, Command, Place, Position, RejectionCode,
  InsertBlocks, RemoveBlocks, MoveBlock, Attach, Detach, SetText, SetDependencies, Batch,
} from './commands';
// Collaboration (docs/collaboration.md): the channels a host implements for command sourcing and presence.
export type {
  Collaboration, CommandChannel, CommandEnvelope, CommandEvent, PresenceChannel, Presence, PeerPresence,
  SerializedCanvasState,
} from './collaboration/types';
// Script export: the canvas as a program, and writers that turn it into text.
export { toProgram } from './export/program';
export type { Program, ProgramRoot, ProgramNode, ProgramArg, ProgramValue, ScriptWriter } from './export/program';
// Examples: a Python script writer, and an in-memory collaboration server (the reference for a real backend).
export { pythonWriter } from './demo/pythonWriter';
export { LocalServer } from './demo/LocalServer';
export { COMMAND_PARAM_TYPE } from './types';
export { ThemeContext, useTheme } from './ThemeContext';
export { darkTheme, THEMES } from './theme';
export type { Theme, ThemeId } from './theme';
export { default as ThemeSwitcher } from './components/ThemeSwitcher';
