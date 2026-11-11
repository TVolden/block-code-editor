import type { Command } from './types';
import { CommandRejected } from './types';

/**
 * The command that undoes `command`: applied right after it, it restores the state from before. Computed from the
 * command alone (it never looks at the state). See docs/commands.md.
 */
export function invertCommand(command: Command): Command {
  switch (command.type) {
    case 'InsertBlocks':    return { type: 'RemoveBlocks', blocks: command.blocks };
    case 'RemoveBlocks':    return { type: 'InsertBlocks', blocks: command.blocks };
    case 'MoveBlock':       return { type: 'MoveBlock', id: command.id, from: command.to, to: command.from };
    case 'Attach':          return { type: 'Detach', id: command.id, from: command.to, to: command.from };
    case 'Detach':          return { type: 'Attach', id: command.id, to: command.from, from: command.to };
    case 'SetText':         return { type: 'SetText', blockId: command.blockId, slot: command.slot, from: command.to, to: command.from };
    case 'SetDependencies': return { type: 'SetDependencies', from: command.to, to: command.from };
    case 'Batch':           return { type: 'Batch', commands: command.commands.map(invertCommand).reverse() };
    default:
      throw new CommandRejected('INVALID_COMMAND', `Unknown command type '${(command as { type?: unknown }).type}'.`);
  }
}
