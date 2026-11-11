import React from 'react';
import type { PlacedBlock } from '../types';
import { tryGetDefinition } from '../blockRegistry';
import { blockPath, queryBlockPath, socketPath } from '../utils/blockShapes';
import {
  getBlockWidth, getBlockHeight, getHeaderHeight, getSocketPositions, getMouthPositions, getPillWidth,
  socketTitle, HAT_H, OUTPUT_ROW_H, QUERY_H, MISSING_H,
} from '../utils/blockLayout';
import { useTheme } from '../ThemeContext';
import { MouthDecorations } from './MouthDecorations';
import { SocketHint } from './SocketHint';

interface Props {
  block: PlacedBlock;
  allBlocks: Map<string, PlacedBlock>;
  onPointerDown?: (e: React.PointerEvent, id: string) => void;
  onBlockClick?: (id: string) => void;
  onSocketClick?: (blockId: string, slotIndex: number) => void;
  editingSocket?: { blockId: string; slotIndex: number } | null;
  onSocketCommit?: (blockId: string, slotIndex: number, value: string) => void;
  onSocketCancelEdit?: () => void;
  /** Called when the user starts dragging an output pill from a start block. */
  onOutputDrag?: (e: React.PointerEvent, defId: string) => void;
  isGhost?: boolean;
  /** Blocks being dragged: drawn faded where they are (with everything hanging off them) until the drop. */
  draggingIds?: Set<string>;
  /** Blocks changed by actions not confirmed yet: drawn with a dashed outline and italic text. */
  provisionalIds?: Set<string>;
  /** The text of the socket being typed into, on every keystroke. */
  onSocketInput?: (blockId: string, slotIndex: number, text: string) => void;
  embedded?: boolean;
}

/**
 * Walks the embedding/chain hierarchy upward from `block` and checks whether
 * the root is a start block whose `provides` list includes `defId`.
 * Returns false if the block is floating or the root does not provide the scope.
 */
function isInProvidedScope(block: PlacedBlock, defId: string, allBlocks: Map<string, PlacedBlock>): boolean {
  let current: PlacedBlock = block;
  for (;;) {
    if (current.embeddedInBlockId) {
      const host = allBlocks.get(current.embeddedInBlockId);
      if (!host) return false;
      current = host;
    } else if (current.parentBlockId) {
      const parent = allBlocks.get(current.parentBlockId);
      if (!parent) return false;
      current = parent;
    } else {
      // Reached the chain root
      const rootDef = tryGetDefinition(current.definitionId);
      return rootDef?.provides?.some(p => p.id === defId) ?? false;
    }
  }
}

/**
 * Draws a block and everything that hangs off it: the queries in its sockets, the chains in its mouths, and the block
 * chained under it (recursively), so a growing C-block moves the blocks below it and never hides its contents.
 * Roots are placed at their own x/y; everything else (`embedded`) is placed by the block that draws it.
 */
export function BlockRenderer(props: Props) {
  const {
    block, allBlocks, onPointerDown, onBlockClick, onSocketClick,
    editingSocket, onSocketCommit, onSocketCancelEdit, onOutputDrag,
    isGhost, draggingIds, provisionalIds, onSocketInput, embedded,
  } = props;
  const theme = useTheme();
  const def   = tryGetDefinition(block.definitionId);
  const isDragging = draggingIds?.has(block.instanceId) ?? false;
  const isProvisional = provisionalIds?.has(block.instanceId) ?? false;

  /** Draws a block that hangs off this one, at (x, y) relative to it. */
  const renderChild = (childId: string | null | undefined, x: number, y: number, key: string) => {
    const child = childId ? allBlocks.get(childId) : undefined;
    if (!child) return null;
    return (
      <g key={key} transform={`translate(${x},${y})`}>
        <BlockRenderer
          block={child}
          allBlocks={allBlocks}
          onPointerDown={onPointerDown}
          onBlockClick={onBlockClick}
          onSocketClick={onSocketClick}
          editingSocket={editingSocket}
          onSocketCommit={onSocketCommit}
          onSocketCancelEdit={onSocketCancelEdit}
          onOutputDrag={onOutputDrag}
          isGhost={isGhost}
          draggingIds={draggingIds}
          provisionalIds={provisionalIds}
          onSocketInput={onSocketInput}
          embedded
        />
      </g>
    );
  };

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
      >
        <g onPointerDown={handlePointerDown} onClick={handleClick} style={{ cursor: 'grab' }}>
          <rect x={0} y={0} width={160} height={MISSING_H} rx={3}
            fill="rgba(160,40,40,0.18)" stroke="#c05050" strokeWidth={1.5} strokeDasharray="5,3" />
          <text x={8} y={16} fill="#c05050" fontSize={10} fontFamily="sans-serif"
            fontStyle="italic" style={{ userSelect: 'none', pointerEvents: 'none' }}>
            ⚠ {shortId} (missing)
          </text>
        </g>
        {renderChild(block.nextBlockId, 0, MISSING_H, 'next')}
      </g>
    );
  }

  const w       = getBlockWidth(def, block.paramSlots, allBlocks);
  const h       = getBlockHeight(def, block.paramSlots, allBlocks);
  const headerH = getHeaderHeight(def);
  const sockets = getSocketPositions(def, block.paramSlots, allBlocks);
  const mouths  = getMouthPositions(def, block.paramSlots, allBlocks);
  // Blocks drawn by another block inherit its opacity.
  const opacity = isDragging ? 0.35 : isProvisional ? 0.6 : isGhost && !embedded ? 0.75 : 1;

  // All block types: neutral body + left color stripe
  const clipId = `clip-${isGhost ? 'g' : 'c'}-${block.instanceId}`;

  const path = blockPath(def, block.paramSlots, allBlocks);

  const handlePointerDown = onPointerDown
    ? (e: React.PointerEvent) => { e.stopPropagation(); onPointerDown(e, block.instanceId); }
    : undefined;

  const handleClick = onBlockClick
    ? (e: React.MouseEvent) => { e.stopPropagation(); onBlockClick(block.instanceId); }
    : undefined;

  // ── Out-of-scope guard ───────────────────────────────────────────────────────
  // $scope query blocks are only valid when the chain root is an event that
  // explicitly provides them.  Outside that context they show a warning
  // placeholder — draggable so the user can reposition or remove them.
  if (def.category.startsWith('$') && !isGhost) {
    if (!isInProvidedScope(block, def.id, allBlocks)) {
      const qw   = getBlockWidth(def);
      const qh   = QUERY_H;
      const qPath = queryBlockPath(def.returnType ?? 'string', qw, qh);
      return (
        <g
          transform={(isGhost || embedded) ? undefined : `translate(${block.x},${block.y})`}
          opacity={isDragging ? 0.35 : 0.85}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          style={{ cursor: 'grab' }}
        >
          <path d={qPath}
            fill="rgba(180,100,0,0.15)" stroke="#c08820"
            strokeWidth={1.5} strokeDasharray="5,3" />
          <text
            x={qw / 2} y={qh / 2 + 3.5} textAnchor="middle"
            fill="#c08820" fontSize={9} fontFamily="sans-serif" fontStyle="italic"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            ⚠ {def.name}
          </text>
        </g>
      );
    }
  }

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
      <path d={path} fill={theme.blockBody} stroke={isProvisional ? theme.accent : theme.blockBorder} strokeWidth={1.5}
        strokeDasharray={isProvisional ? '4,3' : undefined} />

      {/* Left color stripe — 4px wide, clipped to block shape */}
      <rect x={0} y={0} width={4} height={h + 20}
        fill={def.color} clipPath={`url(#${clipId})`} />

      {/* Block label — centred in the header row */}
      <text
        x={11} y={headerH / 2 + 4}
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

      {/* Context-variable panel — queries this event guarantees will return valid data.
          Rendered inside the extended hat block body, below a divider line.
          Pills are draggable onto sockets like any query block from the palette. */}
      {def.blockType === 'start' && def.provides && def.provides.length > 0 && (
        <g>
          {/* Divider between header and context panel */}
          <line x1={8} y1={HAT_H} x2={w - 8} y2={HAT_H}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          {def.provides.map((prov, i) => {
            const provDef    = tryGetDefinition(prov.id);
            const pillColor  = provDef?.color ?? def.color;
            const pillW      = getPillWidth(prov.name);
            const pillH      = 20;
            const pillX      = 8;
            const pillY      = HAT_H + 6 + i * OUTPUT_ROW_H;
            const interactive = !isGhost && !embedded;
            return (
              <g
                key={prov.id}
                transform={`translate(${pillX}, ${pillY})`}
                onPointerDown={interactive
                  ? (e) => { e.stopPropagation(); onOutputDrag?.(e, prov.id); }
                  : undefined}
                style={{ cursor: interactive ? 'grab' : 'default' }}
              >
                <rect x={0} y={0} width={pillW} height={pillH} rx={10}
                  fill={pillColor} opacity={0.82}
                  stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                <text
                  x={pillW / 2} y={pillH / 2 + 3.5}
                  textAnchor="middle"
                  fill="white" fontSize={9.5} fontFamily="sans-serif" fontWeight="bold"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {prov.name}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Sockets */}
      {sockets.map((sock) => {
        const slot     = block.paramSlots[sock.index];
        const embId    = slot?.queryBlockId;
        const embBlock = embId ? allBlocks.get(embId) : null;

        const paramName = def.params[sock.index].name;
        const title     = socketTitle(paramName, sock.type);

        // An embedded query: hovering it shows the parameter it fills.
        if (embBlock) {
          return (
            <g key={sock.index}>
              <title>{title}</title>
              {renderChild(embId, sock.x, sock.y, 'query')}
            </g>
          );
        }

        const tv        = slot?.textValue;
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
            <title>{title}</title>
            <path d={socketPath(sock.type, sock.w, sock.h)}
              fill={isEditing ? theme.blockBorder : theme.socketBody}
              stroke={theme.blockBorder}
              strokeWidth={isEditing ? 1.5 : 1} />

            {isEditing ? (
              <foreignObject x={0} y={0} width={sock.w} height={sock.h}>
                <input
                  autoFocus
                  defaultValue={tv ?? ''}
                  onChange={(e) => onSocketInput?.(block.instanceId, sock.index, e.target.value)}
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
                fontStyle={isProvisional ? 'italic' : undefined}
                style={{ userSelect: 'none', pointerEvents: 'none' }}>{tv}</text>
            ) : (
              <SocketHint name={paramName} type={sock.type} w={sock.w} h={sock.h} />
            )}
          </g>
        );
      })}

      {/* Mouths: divider names, empty placeholders, and the chains they hold */}
      {mouths.length > 0 && (
        <MouthDecorations mouths={mouths} w={w} isEmpty={(index) => !block.paramSlots[index]?.commandBlockId} />
      )}
      {mouths.map(mouth =>
        renderChild(block.paramSlots[mouth.index]?.commandBlockId, mouth.x, mouth.y, `mouth-${mouth.index}`))}

      {/* The rest of the chain */}
      {renderChild(block.nextBlockId, 0, h, 'next')}
    </g>
  );
}
