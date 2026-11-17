import React, { useState, useMemo } from 'react';
import type { BlockDefinition } from '../types';
import { getAllDefinitions, getCategories, tryGetDefinition } from '../blockRegistry';
import PackagesTab from './PackagesTab';
import type { PackagesTabProps } from './PackagesTab';
import { blockPath, socketPath } from '../utils/blockShapes';
import {
  getBlockWidth, getBlockHeight, getHeaderHeight, getSocketPositions, getMouthPositions, getPillPositions,
  socketTitle, HAT_H, OUTPUT_PILL_H,
} from '../utils/blockLayout';
import { useTheme } from '../ThemeContext';
import { MouthDecorations } from './MouthDecorations';
import { SocketHint } from './SocketHint';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onPointerDown: (e: React.PointerEvent, definitionId: string) => void;
  isDropTarget?: boolean;
  registryVersion: number;
  /** The Packages tab's contents; without it the palette has no Packages tab. */
  packages?: PackagesTabProps;
  /** Definition IDs of start (event) blocks already placed on the canvas. */
  placedStartIds: Set<string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── PaletteBlock ──────────────────────────────────────────────────────────────

function PaletteBlock({ def, onPointerDown, isPlaced }: {
  def: BlockDefinition;
  onPointerDown: Props['onPointerDown'];
  isPlaced?: boolean;
}) {
  const theme = useTheme();
  const w     = getBlockWidth(def);
  const h     = getBlockHeight(def);
  const sockets = getSocketPositions(def);
  const mouths  = getMouthPositions(def);

  const clipId     = `pal-${def.id}`;

  const path = blockPath(def);

  return (
    <div
      style={{ marginBottom: 6, userSelect: 'none', position: 'relative', opacity: isPlaced ? 0.4 : 1 }}
      onPointerDown={isPlaced ? undefined : (e) => onPointerDown(e, def.id)}
      title={isPlaced ? 'Already on canvas — only one instance allowed' : undefined}
    >
      <svg width={w + 2} height={h + 8} style={{ display: 'block', cursor: isPlaced ? 'not-allowed' : 'grab', overflow: 'visible' }}>
        <defs>
          <clipPath id={clipId}>
            <path d={path} />
          </clipPath>
        </defs>
        <g transform="translate(1, 1)">
          <path d={path} fill={theme.blockBody} stroke={theme.blockBorder} strokeWidth={1.5} />
          <rect x={0} y={0} width={4} height={h + 20}
            fill={def.color} clipPath={`url(#${clipId})`} />
          {mouths.length > 0 && <MouthDecorations mouths={mouths} w={w} isEmpty={() => true} />}
          <text x={11} y={getHeaderHeight(def) / 2 + 4} fill={theme.blockText} fontSize={11} fontWeight="bold" fontFamily="sans-serif"
            style={{ userSelect: 'none', pointerEvents: 'none' }}>
            {def.name}
            {def.blockType === 'query' && def.returnType && (
              <tspan fill={theme.textMuted} fontSize={9} fontWeight="normal">
                {` [${def.returnType}]`}
              </tspan>
            )}
          </text>
          {isPlaced && (
            <text
              x={w / 2} y={h / 2 + 4}
              textAnchor="middle"
              fill={theme.textMuted} fontSize={9} fontFamily="sans-serif"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              ✓ on canvas
            </text>
          )}
          {sockets.map((sock) => {
            const paramName = def.params[sock.index].name;
            return (
              <g key={sock.index} transform={`translate(${sock.x},${sock.y})`}>
                <title>{socketTitle(paramName, sock.type)}</title>
                <path d={socketPath(sock.type, sock.w, sock.h)}
                  fill={theme.socketBody} stroke={theme.blockBorder} strokeWidth={1} />
                <SocketHint name={paramName} type={sock.type} w={sock.w} h={sock.h} />
              </g>
            );
          })}
          {/* Context-variable panel — visual preview, non-interactive in palette */}
          {def.blockType === 'start' && def.provides && def.provides.length > 0 && (
            <g>
              <line x1={8} y1={HAT_H} x2={w - 8} y2={HAT_H}
                stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
              {getPillPositions(def).map((prov) => {
                const provDef   = tryGetDefinition(prov.id);
                const pillColor = provDef?.color ?? def.color;
                const pillW     = prov.w;
                const pillH     = OUTPUT_PILL_H;
                return (
                  <g key={prov.id} transform={`translate(${prov.x}, ${prov.y})`}>
                    <rect x={0} y={0} width={pillW} height={pillH} rx={10}
                      fill={pillColor} opacity={0.82}
                      stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                    <text
                      x={pillW / 2} y={pillH / 2 + 3.5} textAnchor="middle"
                      fill="white" fontSize={9.5} fontFamily="sans-serif" fontWeight="bold"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {prov.name}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}

// ── CategorySection ───────────────────────────────────────────────────────────

function CategorySection({ cat, defs, collapsed, onToggle, onPointerDown, placedStartIds }: {
  cat: string;
  defs: BlockDefinition[];
  collapsed: boolean;
  onToggle: (cat: string) => void;
  onPointerDown: Props['onPointerDown'];
  placedStartIds: Set<string>;
}) {
  const theme = useTheme();
  return (
    <div style={{ marginBottom: 2 }}>
      <button
        onClick={() => onToggle(cat)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', background: 'none', border: 'none',
          padding: '5px 0 4px',
          borderBottom: `1px solid ${theme.border}`,
          cursor: 'pointer', textAlign: 'left',
          marginBottom: collapsed ? 0 : 6,
        }}
      >
        <span style={{ color: theme.accent, fontSize: 8, lineHeight: 1, opacity: 0.6 }}>
          {collapsed ? '▶' : '▼'}
        </span>
        <span style={{ color: theme.accent, fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.85 }}>
          {cat}
        </span>
        {collapsed && (
          <span style={{ color: theme.textMuted, fontSize: 9, marginLeft: 'auto' }}>
            {defs.length}
          </span>
        )}
      </button>
      {!collapsed && (
        <div style={{ paddingBottom: 4 }}>
          {defs.map(def => (
            <PaletteBlock
              key={def.id} def={def} onPointerDown={onPointerDown}
              isPlaced={def.blockType === 'start' && placedStartIds.has(def.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── BlockPalette ──────────────────────────────────────────────────────────────

type Tab = 'blocks' | 'packages';

export default function BlockPalette({
  onPointerDown, isDropTarget,
  registryVersion, packages,
  placedStartIds,
}: Props) {
  const theme = useTheme();
  const [tab, setTab]                               = useState<Tab>('blocks');
  const [searchQuery, setSearchQuery]               = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Categories prefixed with "$" are scope-bound variable definitions only
  // reachable by dragging from an event block's output pill, not from the palette.
  const allDefs    = useMemo(() => getAllDefinitions().filter(d => !d.category.startsWith('$')), [registryVersion]);
  const categories = useMemo(() => getCategories().filter(c => !c.startsWith('$')),             [registryVersion]);

  const query = searchQuery.trim().toLowerCase();
  const filteredDefs = query ? allDefs.filter(d => d.name.toLowerCase().includes(query)) : null;

  function toggleCategory(cat: string) {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  const chosenCount = packages?.dependencies.length ?? 0;

  const tabStyle = (t: Tab): React.CSSProperties => ({
    flex: 1, background: 'none', border: 'none',
    borderBottom: `2px solid ${tab === t ? theme.accent : 'transparent'}`,
    color: tab === t ? theme.accent : theme.textMuted,
    fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1,
    padding: '8px 0', cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  });

  return (
    <div style={{
      width: 260, minWidth: 260,
      backgroundColor: theme.paletteBg,
      borderRight: `1px solid ${theme.border}`,
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
    }}>

      {/* ── Tab bar (only with a Packages tab) ── */}
      {packages && (
        <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, flexShrink: 0, background: theme.paletteHeaderBg }}>
          <button style={tabStyle('blocks')} onClick={() => setTab('blocks')}>Blocks</button>
          <button style={tabStyle('packages')} onClick={() => setTab('packages')}>
            Packages{chosenCount > 0 ? ` · ${chosenCount}` : ''}
          </button>
        </div>
      )}

      {/* ── Blocks tab ── */}
      {tab === 'blocks' && <>
        <div style={{ padding: '8px 10px 6px', flexShrink: 0 }}>
          <input
            type="search"
            placeholder="Search blocks…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: theme.inputBg,
              border: `1px solid ${theme.inputBorder}`,
              borderRadius: 4,
              color: theme.textPrimary,
              fontSize: 11, padding: '5px 9px', outline: 'none',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 0' }}>
          {filteredDefs ? (
            filteredDefs.length > 0
              ? filteredDefs.map(def => (
                  <PaletteBlock
                    key={def.id} def={def} onPointerDown={onPointerDown}
                    isPlaced={def.blockType === 'start' && placedStartIds.has(def.id)}
                  />
                ))
              : <div style={{ color: theme.textMuted, fontSize: 11, padding: '12px 0', textAlign: 'center' }}>No blocks match</div>
          ) : (
            categories.map(cat => (
              <CategorySection
                key={cat} cat={cat}
                defs={allDefs.filter(d => d.category === cat)}
                collapsed={collapsedCategories.has(cat)}
                onToggle={toggleCategory}
                onPointerDown={onPointerDown}
                placedStartIds={placedStartIds}
              />
            ))
          )}
        </div>

        <div style={{
          flexShrink: 0, margin: '8px 10px 10px', padding: '7px 10px',
          borderRadius: 4,
          background: isDropTarget ? theme.deleteActiveBg : 'transparent',
          border: `1px dashed ${isDropTarget ? theme.deleteActiveBorder : theme.deleteBorder}`,
          color: isDropTarget ? theme.deleteActiveText : theme.deleteText,
          textAlign: 'center', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5,
          textTransform: 'uppercase',
          transition: 'background 0.12s, color 0.12s, border-color 0.12s',
          pointerEvents: 'none', userSelect: 'none',
        }}>
          {isDropTarget ? 'Release to delete' : 'Drag here to delete'}
        </div>
      </>}

      {/* ── Packages tab ── */}
      {tab === 'packages' && packages && <PackagesTab {...packages} />}
    </div>
  );
}
