import React, { forwardRef } from 'react';
import type { PlacedBlock } from '../types';
import { BlockRenderer } from './BlockRenderer';
import { useTheme } from '../ThemeContext';

interface Props {
  blocks: Map<string, PlacedBlock>;
  draggingIds: Set<string>;
  onBlockPointerDown: (e: React.PointerEvent, id: string) => void;
  onBlockClick: (id: string) => void;
  onSocketClick: (blockId: string, slotIndex: number) => void;
  editingSocket?: { blockId: string; slotIndex: number } | null;
  onSocketCommit?: (blockId: string, slotIndex: number, value: string) => void;
  onSocketCancelEdit?: () => void;
  onOutputDrag: (e: React.PointerEvent, defId: string) => void;
}

const Canvas = forwardRef<SVGSVGElement, Props>(
  ({ blocks, draggingIds, onBlockPointerDown, onBlockClick, onSocketClick,
     editingSocket, onSocketCommit, onSocketCancelEdit, onOutputDrag }, ref) => {
    const theme = useTheme();
    // Only roots: each draws the blocks chained under it, embedded in its sockets and held in its mouths.
    const rootBlocks = [...blocks.values()].filter(b => !b.embeddedInBlockId && !b.parentBlockId);

    return (
      <svg
        ref={ref}
        style={{ flex: 1, background: theme.canvasBg, display: 'block' }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) e.preventDefault();
        }}
      >
        <defs>
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="14" r="0.7" fill={theme.gridDot} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {rootBlocks.map((block) => (
          <BlockRenderer
            key={block.instanceId}
            block={block}
            allBlocks={blocks}
            onPointerDown={onBlockPointerDown}
            onBlockClick={onBlockClick}
            onSocketClick={onSocketClick}
            draggingIds={draggingIds}
            editingSocket={editingSocket}
            onSocketCommit={onSocketCommit}
            onSocketCancelEdit={onSocketCancelEdit}
            onOutputDrag={onOutputDrag}
          />
        ))}
      </svg>
    );
  }
);

Canvas.displayName = 'Canvas';
export default Canvas;
