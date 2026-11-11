import type { ReactNode } from 'react';
import type { PlacedBlock } from '../types';
import type { PeerPresence } from '../collaboration/types';
import { tryGetDefinition } from '../blockRegistry';
import {
  getBlockHeight, getBlockWidth, getChainHeight, getPlacedBlockHeight, getSocketPositions, MISSING_H,
} from '../utils/blockLayout';
import { socketPath } from '../utils/blockShapes';
import { useTheme } from '../ThemeContext';
import { BlockRenderer } from './BlockRenderer';

/** How big a placed block (with the blocks under it, for a command) is drawn. */
function footprint(block: PlacedBlock, blocks: Map<string, PlacedBlock>): { w: number; h: number } {
  const def = tryGetDefinition(block.definitionId);
  if (!def) return { w: 160, h: MISSING_H };
  const h = def.blockType === 'query' ? getPlacedBlockHeight(block, blocks) : getChainHeight(block.instanceId, blocks);
  return { w: getBlockWidth(def, block.paramSlots, blocks), h };
}

/**
 * The other users, drawn over the canvas (never hit by the pointer): their cursors with names, the blocks they drag
 * (a ghost where they are, an outline on the originals) and the parameter they are typing into, with their text.
 */
export default function PeersOverlay({ peers, blocks, layout }: {
  peers: PeerPresence[];
  blocks: Map<string, PlacedBlock>;
  layout: Map<string, { x: number; y: number }>;
}) {
  const theme = useTheme();
  return (
    <g style={{ pointerEvents: 'none' }}>
      {peers.map(peer => {
        const { color } = peer;
        const parts: ReactNode[] = [];

        // Typing: their text over the socket.
        if (peer.typing) {
          const block = blocks.get(peer.typing.blockId);
          const pos = layout.get(peer.typing.blockId);
          const def = block && tryGetDefinition(block.definitionId);
          const socket = def && block && getSocketPositions(def, block.paramSlots, blocks).find(s => s.index === peer.typing!.slot);
          if (pos && socket) {
            parts.push(
              <g key="typing" transform={`translate(${pos.x + socket.x},${pos.y + socket.y})`}>
                <path d={socketPath(socket.type, socket.w, socket.h)} fill={theme.socketBody} stroke={color} strokeWidth={2} />
                <text x={socket.w / 2} y={socket.h / 2 + 4} textAnchor="middle" fill={color} fontSize={10} fontFamily="sans-serif">
                  {peer.typing.text}|
                </text>
              </g>,
            );
          }
        }

        // Dragging canvas blocks: an outline on the originals and a ghost where they hold it.
        if (peer.drag && 'leadId' in peer.drag) {
          const lead = blocks.get(peer.drag.leadId);
          const pos = layout.get(peer.drag.leadId);
          if (lead && pos) {
            const { w, h } = footprint(lead, blocks);
            parts.push(
              <rect key="origin" x={pos.x - 3} y={pos.y - 3} width={w + 6} height={h + 6} rx={5}
                fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="5,3" />,
              <g key="ghost" transform={`translate(${peer.drag.at.x},${peer.drag.at.y})`} opacity={0.5}>
                <BlockRenderer block={lead} allBlocks={blocks} isGhost />
                <rect x={-3} y={-3} width={w + 6} height={h + 6} rx={5} fill="none" stroke={color} strokeWidth={1.5} />
              </g>,
            );
          }
        }

        // Dragging a new block from the palette: its outline and name.
        if (peer.drag && 'definitionId' in peer.drag) {
          const def = tryGetDefinition(peer.drag.definitionId);
          const w = def ? getBlockWidth(def) : 120;
          const h = def ? getBlockHeight(def) : MISSING_H;
          parts.push(
            <g key="new" transform={`translate(${peer.drag.at.x},${peer.drag.at.y})`}>
              <rect width={w} height={h} rx={4} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5} strokeDasharray="5,3" />
              <text x={8} y={h / 2 + 4} fill={color} fontSize={11} fontWeight="bold" fontFamily="sans-serif">
                {def?.name ?? peer.drag.definitionId}
              </text>
            </g>,
          );
        }

        // The cursor, with the name.
        if (peer.cursor) {
          const labelW = peer.name.length * 6.5 + 10;
          parts.push(
            <g key="cursor" transform={`translate(${peer.cursor.x},${peer.cursor.y})`}>
              <path d="M 0 0 L 0 14 L 4 10.5 L 7 17 L 9.5 16 L 6.5 9.5 L 11 9.5 Z" fill={color} stroke="white" strokeWidth={1} />
              <rect x={12} y={14} width={labelW} height={16} rx={3} fill={color} />
              <text x={17} y={26} fill="white" fontSize={10} fontFamily="sans-serif">{peer.name}</text>
            </g>,
          );
        }

        return <g key={peer.clientId}>{parts}</g>;
      })}
    </g>
  );
}
