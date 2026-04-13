import React from 'react';
import type { PlacedBlock } from '../types';
import { tryGetDefinition } from '../blockRegistry';
import { commandBlockPath, hatBlockPath, queryBlockPath, socketPath } from '../utils/blockShapes';
import { getBlockWidth, getBlockHeight, getSocketPositions, PRIMITIVE_TYPES } from '../utils/blockLayout';
import { useTheme } from '../ThemeContext';

interface Props {
  block: PlacedBlock;
  allBlocks: Map<string, PlacedBlock>;
  onPointerDown?: (e: React.PointerEvent, id: string) => void;
  onBlockClick?: (id: string) => void;
  onSocketClick?: (blockId: string, slotIndex: number) => void;
  editingSocket?: { blockId: string; slotIndex: number } | null;
  onSocketCommit?: (blockId: string, slotIndex: number, value: string) => void;
  onSocketCancelEdit?: () => void;
  isGhost?: boolean;
  isDragging?: boolean;
  embedded?: boolean;
}

function buildBlockPath(block: PlacedBlock, allBlocks: Map<string, PlacedBlock>): string {
  // def is guaranteed to exist here — callers check before invoking.
  const def = tryGetDefinition(block.definitionId)!;
  const w   = getBlockWidth(def, block.paramSlots, allBlocks);
  const h   = getBlockHeight(def);
  if (def.blockType === 'start')   return hatBlockPath(w, h);
  if (def.blockType === 'command') return commandBlockPath(w, h);
  return queryBlockPath(def.returnType!, w, h);
}

export function BlockRenderer({
  block, allBlocks, onPointerDown, onBlockClick, onSocketClick,
  editingSocket, onSocketCommit, onSocketCancelEdit,
  isGhost, isDragging, embedded,
}: Props) {
  const theme = useTheme();
  const def   = tryGetDefinition(block.definitionId);

  // ── Missing-definition placeholder ────────────────────────────────────────
  // Shown when a block references a collection (or other definition) that has
  // since been renamed or deleted.  Draggable so the user can remove it by
  // dropping it onto the palette.
  if (!def) {
    const handlePointerDown = onPointerDown
      ? (e: React.PointerEvent) => { e.stopPropagation(); onPointerDown(e, block.instanceId); }
      : undefined;
    const handleClick = onBlockClick
      ? (e: React.MouseEvent)   => { e.stopPropagation(); onBlockClick(block.instanceId); }
      : undefined;
    // Strip the internal __coll__ prefix so the label reads like "wiyg6b7 (missing)"
    const shortId = block.definitionId.replace(/^__coll__/, '').slice(0, 16);
    return (
      <g
        transform={(isGhost || embedded) ? undefined : `translate(${block.x},${block.y})`}
        opacity={isDragging ? 0.35 : 0.85}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        style={{ cursor: 'grab' }}
      >
        <rect x={0} y={0} width={160} height={24} rx={3}
          fill="rgba(160,40,40,0.18)" stroke="#c05050" strokeWidth={1.5} strokeDasharray="5,3" />
        <text x={8} y={16} fill="#c05050" fontSize={10} fontFamily="sans-serif"
          fontStyle="italic" style={{ userSelect: 'none', pointerEvents: 'none' }}>
          ⚠ {shortId} (missing)
        </text>
      </g>
    );
  }

  const h       = getBlockHeight(def);
  const sockets = getSocketPositions(def, block.paramSlots, allBlocks);
  const opacity = isGhost ? 0.75 : isDragging ? 0.35 : 1;

  // All block types: neutral body + left color stripe
  const clipId = `clip-${isGhost ? 'g' : 'c'}-${block.instanceId}`;

  const path = buildBlockPath(block, allBlocks);

  const handlePointerDown = onPointerDown
    ? (e: React.PointerEvent) => { e.stopPropagation(); onPointerDown(e, block.instanceId); }
    : undefined;

  const handleClick = onBlockClick
    ? (e: React.MouseEvent) => { e.stopPropagation(); onBlockClick(block.instanceId); }
    : undefined;

  return (
    <g
      transform={(isGhost || embedded) ? undefined : `translate(${block.x},${block.y})`}
      opacity={opacity}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      style={{ cursor: isGhost ? 'grabbing' : 'grab' }}
    >
      {/* ClipPath for the left color stripe */}
      <defs>
        <clipPath id={clipId}>
          <path d={path} />
        </clipPath>
      </defs>

      {/* Block body */}
      <path d={path} fill={theme.blockBody} stroke={theme.blockBorder} strokeWidth={1.5} />

      {/* Left color stripe — 4px wide, clipped to block shape */}
      <rect x={0} y={0} width={4} height={h + 20}
        fill={def.color} clipPath={`url(#${clipId})`} />

      {/* Block label */}
      <text
        x={11} y={h / 2 + 4}
        fill={theme.blockText} fontSize={11} fontWeight="bold" fontFamily="sans-serif"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {def.name}
        {def.blockType === 'query' && def.returnType && (
          <tspan fill={theme.textMuted} fontSize={9} fontWeight="normal">
            {` [${def.returnType}]`}
          </tspan>
        )}
      </text>

      {/* Sockets */}
      {sockets.map((sock) => {
        const slot     = block.paramSlots[sock.index];
        const embId    = slot?.queryBlockId;
        const embBlock = embId ? allBlocks.get(embId) : null;

        if (embBlock) {
          return (
            <g key={sock.index} transform={`translate(${sock.x},${sock.y})`}>
              <BlockRenderer
                block={embBlock}
                allBlocks={allBlocks}
                onPointerDown={onPointerDown}
                onBlockClick={onBlockClick}
                onSocketClick={onSocketClick}
                editingSocket={editingSocket}
                onSocketCommit={onSocketCommit}
                onSocketCancelEdit={onSocketCancelEdit}
                embedded
              />
            </g>
          );
        }

        const tv        = slot?.textValue;
        const paramName = def.params[sock.index]?.name;
        const isCustom  = !PRIMITIVE_TYPES.has(sock.type);
        const isEditing = editingSocket?.blockId === block.instanceId
                       && editingSocket?.slotIndex === sock.index;

        return (
          <g
            key={sock.index}
            transform={`translate(${sock.x},${sock.y})`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onSocketClick?.(block.instanceId, sock.index); }}
            style={{ cursor: 'text' }}
          >
            <path d={socketPath(sock.type, sock.w, sock.h)}
              fill={isEditing ? theme.blockBorder : theme.socketBody}
              stroke={theme.blockBorder}
              strokeWidth={isEditing ? 1.5 : 1} />

            {isEditing ? (
              <foreignObject x={0} y={0} width={sock.w} height={sock.h}>
                <input
                  autoFocus
                  defaultValue={tv ?? ''}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter')  onSocketCommit?.(block.instanceId, sock.index, (e.target as HTMLInputElement).value);
                    if (e.key === 'Escape') onSocketCancelEdit?.();
                  }}
                  onBlur={(e) => onSocketCommit?.(block.instanceId, sock.index, e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    width: '100%', height: '100%',
                    background: 'transparent', border: 'none', outline: 'none',
                    color: theme.blockText, fontSize: 10, fontFamily: 'sans-serif',
                    textAlign: 'center', padding: '0 4px', boxSizing: 'border-box',
                    caretColor: theme.blockText,
                  }}
                />
              </foreignObject>
            ) : tv ? (
              <text x={sock.w / 2} y={sock.h / 2 + 4} textAnchor="middle"
                fill={theme.blockText} fontSize={10} fontFamily="sans-serif"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>{tv}</text>
            ) : isCustom ? (
              <text x={sock.w / 2} y={sock.h / 2 + 3} textAnchor="middle"
                fill={theme.textSecondary} fontSize={9} fontFamily="sans-serif"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>{sock.type}</text>
            ) : paramName ? (
              <text x={sock.w / 2} y={sock.h / 2 + 3} textAnchor="middle"
                fill={theme.textMuted} fontSize={9} fontFamily="sans-serif"
                fontStyle="italic"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>{paramName}</text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
