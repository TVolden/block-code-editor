/**
 * BlockEditor.tsx
 *
 * The self-contained block editor: palette on the left, canvas on the right.
 * Does NOT include the output console — use the `onRun` callback to handle
 * sequence output however you like (display in a console, fire an event, etc.)
 *
 * Props:
 *   blocksUrl  — URL for blocks.json  (default: '/blocks.json')
 *   onRun      — called with an ordered list of output lines when the user
 *                clicks a block sequence
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { PlacedBlock, ParamSlot, SerializedCanvas } from '../types';
export type { SerializedCanvas, BlockDefinition } from '../types';
export { default as CardDesigner } from '../carddesigner/CardDesigner';
export { default as CardPreview } from '../carddesigner/CardPreview';
export type { CardDesign, CardMeta } from '../carddesigner/cardDesignTypes';
export { defaultCardDesign } from '../carddesigner/cardDesignTypes';
import {
  loadBlockRegistry, loadPackage, unloadPackage, getLoadedPackages,
  getDefinition, tryGetDefinition, loadInlinePackage,
} from '../blockRegistry';
import type { PackageInfo, LoadedPackage } from '../blockRegistry';
import { getBlockWidth, getBlockHeight, getSocketPositions, QUERY_H } from '../utils/blockLayout';
import { darkTheme, THEMES } from '../theme';
import type { Theme, ThemeId } from '../theme';
import { ThemeContext, useTheme } from '../ThemeContext';
import { commandBlockPath, hatBlockPath, queryBlockPath } from '../utils/blockShapes';
import BlockPalette from '../components/BlockPalette';
import Canvas from '../components/Canvas';
import { BlockRenderer } from '../components/BlockRenderer';
import ThemeSwitcher from '../components/ThemeSwitcher';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  blocksUrl?: string;
  /** Load multiple block packages in order. Takes precedence over blocksUrl. */
  blocksUrls?: string[];
  onRun?: (lines: string[]) => void;
  onThemeChange?: (theme: Theme) => void;
  /** Optional nav tabs rendered in the title bar between the subtitle and theme switcher. */
  navTabs?: React.ReactNode;
  /** Pre-populate the canvas from a previously serialized state. */
  initialState?: SerializedCanvas;
  /** Called with the current canvas state when the user clicks Save. */
  onSave?: (state: SerializedCanvas) => void;
  /**
   * When provided, the editor runs in controlled-theme mode: it applies this
   * theme and hides the built-in theme-switcher buttons.  The platform is then
   * responsible for toggling dark/light.
   */
  themeId?: ThemeId;
  /** When true, the built-in title bar is not rendered. */
  hideTitleBar?: boolean;
  /**
   * When provided, the ref is populated with a function that returns the
   * current canvas state. Lets a parent component read state on demand
   * (e.g. to implement its own Save button).
   */
  getStateRef?: React.MutableRefObject<(() => SerializedCanvas) | null>;
  /**
   * Extra block definitions injected into the registry after the core blocks
   * load. Registered under the synthetic package '__inline__'. Changing this
   * prop unregisters the previous set and registers the new one.
   */
  additionalBlocks?: import('../types').BlockDefinition[];
}

/** Where a block chain can snap onto another block's bottom connector. */
type SnapResult = { blockId: string; snapX: number; snapY: number; dist: number };

/** Where a query block can snap into a parameter socket. */
type SockResult = { blockId: string; slotIndex: number; snapX: number; snapY: number; dist: number };

/**
 * All state needed for an in-progress drag.
 * Stored in a ref so pointer-move updates don't trigger re-renders.
 */
interface DragState {
  /** 'palette' = new block from sidebar; 'canvas' = moving an existing block */
  type: 'palette' | 'canvas';
  defId: string;           // block definition being dragged
  instanceId?: string;     // canvas block being dragged (canvas drags only)
  carriedIds?: string[];   // this block + all chained blocks below it
  offsetX: number;         // cursor offset from block's top-left corner
  offsetY: number;
  startClientX: number;    // initial pointer position (detect click vs drag)
  startClientY: number;
  moved: boolean;          // true once pointer has moved far enough
}

// ── Module-level counter ─────────────────────────────────────────────────────

let nextBlockId = 1;
function makeId() { return `b${nextBlockId++}`; }

// ── Helper functions ─────────────────────────────────────────────────────────

/**
 * Recursively collects IDs of a set of blocks and all query blocks embedded
 * in their param slots (and so on down the tree). Pure — does not mutate.
 */
function gatherWithDescendants(ids: string[], blocks: Map<string, PlacedBlock>): string[] {
  const result: string[] = [];
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    blocks.get(id)?.paramSlots.forEach(slot => {
      if (slot.queryBlockId) queue.push(slot.queryBlockId);
    });
  }
  return result;
}

/**
 * Returns a new canvas map with all orphaned blocks removed — blocks whose
 * definition is no longer registered (e.g. a collection query block whose
 * collection was renamed or deleted). Repairs command chains around removed blocks.
 */
function withOrphansRemoved(blocks: Map<string, PlacedBlock>): Map<string, PlacedBlock> {
  const orphanIds: string[] = [];
  blocks.forEach((block) => {
    if (!tryGetDefinition(block.definitionId)) orphanIds.push(block.instanceId);
  });
  if (orphanIds.length === 0) return blocks;

  const next = new Map(blocks);

  for (const orphanId of orphanIds) {
    const orphan = next.get(orphanId);
    if (!orphan) continue;

    // Stitch command chain past this block so downstream blocks aren't stranded.
    if (orphan.parentBlockId || orphan.nextBlockId) {
      const parent = orphan.parentBlockId ? next.get(orphan.parentBlockId) : null;
      const child  = orphan.nextBlockId   ? next.get(orphan.nextBlockId)   : null;
      if (parent) next.set(orphan.parentBlockId!, { ...parent, nextBlockId:   orphan.nextBlockId   ?? null });
      if (child)  next.set(orphan.nextBlockId!,   { ...child,  parentBlockId: orphan.parentBlockId ?? null });
    }

    // Clear the socket in the parent block that was holding this query block.
    if (orphan.embeddedInBlockId && orphan.embeddedSlotIndex >= 0) {
      const parent = next.get(orphan.embeddedInBlockId);
      if (parent) {
        const slots = [...parent.paramSlots];
        slots[orphan.embeddedSlotIndex] = { textValue: null, queryBlockId: null };
        next.set(orphan.embeddedInBlockId, { ...parent, paramSlots: slots });
      }
    }
  }

  // Remove orphans and any query blocks they themselves embed.
  const allToRemove = new Set(gatherWithDescendants(orphanIds, blocks));
  allToRemove.forEach(id => next.delete(id));
  return next;
}

/** Creates a fresh PlacedBlock with empty parameter slots. */
function createBlock(defId: string, x: number, y: number): PlacedBlock {
  const def = getDefinition(defId);
  return {
    instanceId: makeId(),
    definitionId: defId,
    x, y,
    nextBlockId: null,
    parentBlockId: null,
    embeddedInBlockId: null,
    embeddedSlotIndex: -1,
    paramSlots: def.params.map((): ParamSlot => ({ textValue: null, queryBlockId: null })),
  };
}

/** Collects all block IDs in a chain, starting from startId, following nextBlockId. */
function collectChain(startId: string, blocks: Map<string, PlacedBlock>): string[] {
  const chain: string[] = [];
  let current: string | null = startId;
  while (current) {
    chain.push(current);
    current = blocks.get(current)?.nextBlockId ?? null;
  }
  return chain;
}

/** Walks parentBlockId links upward to find the root of a chain. */
function findChainRoot(id: string, blocks: Map<string, PlacedBlock>): string {
  const block = blocks.get(id);
  return block?.parentBlockId ? findChainRoot(block.parentBlockId, blocks) : id;
}

/**
 * Formats one block as a console output line:
 *   "block-id(param1, param2)"  — always parentheses, strings quoted, empty slots → _
 */
function formatOutputLine(block: PlacedBlock, blocks: Map<string, PlacedBlock>): string {
  const def  = tryGetDefinition(block.definitionId);
  if (!def) return `[missing:${block.definitionId}]`;
  const args = block.paramSlots.map((slot, i) => {
    if (slot.queryBlockId) {
      const embedded = blocks.get(slot.queryBlockId);
      if (embedded) return formatOutputLine(embedded, blocks);
    }
    if (slot.textValue !== null && slot.textValue !== undefined) {
      const paramType = def.params[i]?.type;
      return paramType === 'string' ? `"${slot.textValue}"` : slot.textValue;
    }
    return '_';
  });
  return `${def.id}(${args.join(', ')})`;
}

/**
 * Returns a new canvas map with the given carried block IDs (and all query
 * blocks embedded in their slots) deleted. Pure — does not mutate the input.
 */
function deleteCarried(blocks: Map<string, PlacedBlock>, carriedIds: string[]): Map<string, PlacedBlock> {
  const next = new Map(blocks);
  gatherWithDescendants(carriedIds, blocks).forEach(id => next.delete(id));
  return next;
}

/**
 * Returns a new canvas map with the text value of a socket updated.
 * Pure — does not mutate the input.
 */
function commitSocketText(
  blocks: Map<string, PlacedBlock>,
  blockId: string,
  slotIndex: number,
  value: string,
): Map<string, PlacedBlock> {
  const block = blocks.get(blockId);
  if (!block) return blocks;
  const slots = [...block.paramSlots];
  slots[slotIndex] = { ...slots[slotIndex], textValue: value || null };
  const next = new Map(blocks);
  next.set(blockId, { ...block, paramSlots: slots });
  return next;
}

// ── DragGhost ─────────────────────────────────────────────────────────────────

interface DragGhostProps {
  ghostPos: { x: number; y: number; defId: string } | null;
  dragRef:  React.RefObject<DragState | null>;
  blocks:   Map<string, PlacedBlock>;
}

function DragGhost({ ghostPos, dragRef, blocks }: DragGhostProps) {
  const theme = useTheme();
  if (!ghostPos) return null;

  const drag = dragRef.current;

  // Canvas drag: render the full block so embedded params follow the cursor
  if (drag?.type === 'canvas' && drag.instanceId) {
    const block = blocks.get(drag.instanceId);
    if (block) {
      return (
        <svg style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999 }}>
          <g transform={`translate(${ghostPos.x},${ghostPos.y})`} opacity={0.8}>
            <BlockRenderer block={block} allBlocks={blocks} isGhost />
          </g>
        </svg>
      );
    }
  }

  // Palette drag: simple ghost (new block has no embedded params yet)
  const def = getDefinition(ghostPos.defId);
  const w   = getBlockWidth(def);
  const bh  = getBlockHeight(def);
  const h   = def.blockType === 'query' ? QUERY_H : bh;
  const isCommand = def.blockType === 'command';
  let path: string;
  if      (def.blockType === 'start')   path = hatBlockPath(w, bh);
  else if (def.blockType === 'command') path = commandBlockPath(w, h);
  else                                  path = queryBlockPath(def.returnType!, w, h);

  return (
    <svg style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999 }}>
      {isCommand && (
        <defs>
          <clipPath id="ghost-pal-clip"><path d={path} /></clipPath>
        </defs>
      )}
      <g transform={`translate(${ghostPos.x},${ghostPos.y})`} opacity={0.8}>
        <path d={path} fill={isCommand ? theme.blockBody : def.color} stroke={isCommand ? theme.blockBorder : 'rgba(0,0,0,0.4)'} strokeWidth={1.5} />
        {isCommand && <rect x={0} y={0} width={4} height={h + 20} fill={def.color} clipPath="url(#ghost-pal-clip)" />}
        <text x={11} y={h / 2 + 4} fill={isCommand ? theme.blockText : 'white'} fontSize={11} fontWeight="bold"
          fontFamily="sans-serif" style={{ userSelect: 'none' }}>
          {def.name}
        </text>
      </g>
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BlockEditor({ blocksUrl = '/blocks.json', blocksUrls, onRun, onThemeChange, navTabs, initialState, onSave, themeId, hideTitleBar, getStateRef, additionalBlocks }: Props) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (themeId) return THEMES.find(t => t.id === themeId) ?? darkTheme;
    const saved = localStorage.getItem('cardcq-theme');
    return THEMES.find(t => t.id === saved) ?? darkTheme;
  });

  // Keep theme in sync when the caller changes the themeId prop.
  useEffect(() => {
    if (!themeId) return;
    const next = THEMES.find(t => t.id === themeId) ?? darkTheme;
    setTheme(next);
  }, [themeId]);
  const [ready, setReady]         = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [blocks, setBlocks]             = useState<Map<string, PlacedBlock>>(() => {
    if (!initialState) return new Map();
    const map = new Map(initialState.blocks);
    // Advance the ID counter past any restored block IDs to avoid collisions
    map.forEach((_b, id) => {
      const n = parseInt(id.slice(1), 10);
      if (!isNaN(n) && n >= nextBlockId) nextBlockId = n + 1;
    });
    return map;
  });
  // Which "start" block definition IDs are already placed on the canvas.
  // Used to enforce one-instance-per-event-type.
  const placedStartIds = useMemo(() => {
    const ids = new Set<string>();
    for (const block of blocks.values()) {
      const def = tryGetDefinition(block.definitionId);
      if (def?.blockType === 'start') ids.add(block.definitionId);
    }
    return ids;
  }, [blocks]);

  const [ghostPos, setGhostPos]         = useState<{ x: number; y: number; defId: string } | null>(null);
  const [draggingIds, setDraggingIds]   = useState<Set<string>>(new Set());
  const [isOverPalette, setIsOverPalette] = useState(false);

  const [registryVersion, setRegistryVersion]     = useState(0);
  const [availablePackages, setAvailablePackages] = useState<PackageInfo[]>([]);
  const [loadedPackages, setLoadedPackages]       = useState<LoadedPackage[]>([]);

  // Keep getStateRef current so the parent can read canvas state on demand.
  useEffect(() => {
    if (getStateRef) getStateRef.current = () => ({ blocks: [...blocks.entries()] });
  }, [blocks, getStateRef]);

  const dragRef          = useRef<DragState | null>(null);
  const isOverPaletteRef = useRef(false);
  const canvasRef        = useRef<SVGSVGElement>(null);

  // ── Startup ─────────────────────────────────────────────────────────────────

  const resolvedUrls = blocksUrls ?? [blocksUrl];
  const resolvedUrlsKey = resolvedUrls.join('|');

  useEffect(() => {
    const urls = resolvedUrlsKey.split('|');
    setReady(false);
    setLoadError(null);
    // First URL clears registry and loads as core; subsequent URLs append as named packages.
    loadBlockRegistry(urls[0])
      .then(async () => {
        for (let i = 1; i < urls.length; i++) {
          await loadPackage({
            id: `__extra_${i}__`,
            name: `Extra ${i}`,
            description: '',
            url: urls[i],
            builtIn: true,
          });
        }
        setReady(true);
        setLoadedPackages(getLoadedPackages());
      })
      .catch(err => setLoadError(String(err)));
  }, [resolvedUrlsKey]);

  useEffect(() => {
    fetch('/packages.json')
      .then(r => r.json())
      .then(setAvailablePackages)
      .catch(() => { /* packages.json is optional */ });
  }, []);

  // ── Inline (additional) blocks ───────────────────────────────────────────────

  useEffect(() => {
    if (!ready) return;
    unloadPackage('__inline__');
    if (additionalBlocks && additionalBlocks.length > 0) {
      loadInlinePackage(
        { id: '__inline__', name: 'Inline', description: '', url: '', builtIn: true },
        additionalBlocks,
      );
    }
    setLoadedPackages(getLoadedPackages());
    setRegistryVersion(v => v + 1);
    // Auto-correct: remove any canvas blocks whose definition is no longer in
    // the registry (e.g. a collection block whose collection was renamed/deleted).
    setBlocks(prev => withOrphansRemoved(prev));
  }, [additionalBlocks, ready]);

  // ── Package toggle ───────────────────────────────────────────────────────────

  const handlePackageToggle = useCallback(async (pkg: PackageInfo, currentlyLoaded: boolean) => {
    if (currentlyLoaded) {
      // Remove canvas blocks whose definition belongs to this package before unloading
      const loaded = getLoadedPackages().find(lp => lp.info.id === pkg.id);
      if (loaded) {
        const removedDefIds = new Set(loaded.blockIds);
        setBlocks(prev => {
          const next = new Map(prev);
          // Find top-level blocks from the unloaded package
          const rootsToRemove: string[] = [];
          next.forEach(block => {
            if (removedDefIds.has(block.definitionId)) rootsToRemove.push(block.instanceId);
          });
          // Collect embedded query blocks too
          const allToRemove = new Set(gatherWithDescendants(rootsToRemove, next));
          // Clean up dangling chain links on surviving blocks
          next.forEach(block => {
            if (allToRemove.has(block.instanceId)) return;
            let changed = false;
            let updated = block;
            if (block.nextBlockId   && allToRemove.has(block.nextBlockId))   { updated = { ...updated, nextBlockId: null };   changed = true; }
            if (block.parentBlockId && allToRemove.has(block.parentBlockId)) { updated = { ...updated, parentBlockId: null }; changed = true; }
            if (changed) next.set(block.instanceId, updated);
          });
          allToRemove.forEach(id => next.delete(id));
          return next;
        });
      }
      unloadPackage(pkg.id);
    } else {
      await loadPackage(pkg);
    }
    setLoadedPackages(getLoadedPackages());
    setRegistryVersion(v => v + 1);
  }, []);

  // ── Coordinate helpers ───────────────────────────────────────────────────────

  const toSVG = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // ── Snap detection ───────────────────────────────────────────────────────────

  const findSnapTarget = useCallback((svgX: number, svgY: number, exclude: Set<string>): SnapResult | null => {
    const SNAP_DISTANCE = 24;
    let best: SnapResult | null = null;
    blocks.forEach((block) => {
      if (exclude.has(block.instanceId) || block.embeddedInBlockId || block.nextBlockId) return;
      const def = tryGetDefinition(block.definitionId);
      if (!def || def.blockType === 'query') return;
      const blockBottom = block.y + getBlockHeight(def);
      const dx = Math.abs(svgX - block.x);
      const dy = Math.abs(svgY - blockBottom);
      if (dx < 40 && dy < SNAP_DISTANCE) {
        const dist = Math.hypot(dx, dy);
        if (!best || dist < best.dist) best = { blockId: block.instanceId, snapX: block.x, snapY: blockBottom, dist };
      }
    });
    return best;
  }, [blocks]);

  const findSocketSnap = useCallback((svgX: number, svgY: number, defId: string, exclude: Set<string>): SockResult | null => {
    const draggedDef = tryGetDefinition(defId);
    if (!draggedDef || draggedDef.blockType !== 'query') return null;
    const SNAP_DISTANCE = 20;
    let best: SockResult | null = null;
    blocks.forEach((block) => {
      if (exclude.has(block.instanceId)) return;
      const blockDef = tryGetDefinition(block.definitionId);
      if (!blockDef) return;
      const sockets  = getSocketPositions(blockDef, block.paramSlots, blocks);
      sockets.forEach((socket) => {
        if (socket.type !== draggedDef.returnType) return;
        if (block.paramSlots[socket.index]?.queryBlockId) return;
        const centerX = block.x + socket.x + socket.w / 2;
        const centerY = block.y + socket.y + socket.h / 2;
        const dx = Math.abs(svgX + socket.w / 2 - centerX);
        const dy = Math.abs(svgY + socket.h / 2 - centerY);
        if (dx < socket.w / 2 + SNAP_DISTANCE && dy < socket.h / 2 + SNAP_DISTANCE) {
          const dist = Math.hypot(dx, dy);
          if (!best || dist < best.dist)
            best = { blockId: block.instanceId, slotIndex: socket.index, snapX: block.x + socket.x, snapY: block.y + socket.y, dist };
        }
      });
    });
    return best;
  }, [blocks]);

  // ── Interaction handlers ─────────────────────────────────────────────────────

  const handleBlockClick = useCallback((instanceId: string) => {
    if (dragRef.current?.moved) return;
    const rootId = findChainRoot(instanceId, blocks);
    const chain  = collectChain(rootId, blocks);
    const lines  = chain
      .map(id => blocks.get(id))
      .filter(Boolean)
      .map(b => formatOutputLine(b!, blocks));
    onRun?.(lines);
  }, [blocks, onRun]);

  const [editingSocket, setEditingSocket] = useState<{ blockId: string; slotIndex: number } | null>(null);

  const handleSocketClick = useCallback((blockId: string, slotIndex: number) => {
    if (dragRef.current?.moved) return;
    setEditingSocket({ blockId, slotIndex });
  }, []);

  const handleSocketCommit = useCallback((blockId: string, slotIndex: number, value: string) => {
    setEditingSocket(null);
    setBlocks(prev => commitSocketText(prev, blockId, slotIndex, value));
  }, []);

  const handleSocketCancelEdit = useCallback(() => setEditingSocket(null), []);

  const changeTheme = useCallback((t: Theme) => {
    setTheme(t);
    if (!themeId) localStorage.setItem('cardcq-theme', t.id);
    onThemeChange?.(t);
  }, [onThemeChange, themeId]);

  const handlePalettePointerDown = useCallback((e: React.PointerEvent, defId: string) => {
    e.preventDefault();
    const def = getDefinition(defId);
    const w   = getBlockWidth(def);
    const h   = getBlockHeight(def);
    dragRef.current = {
      type: 'palette', defId,
      offsetX: w / 2, offsetY: h / 2,
      startClientX: e.clientX, startClientY: e.clientY,
      moved: false,
    };
    setGhostPos({ x: e.clientX - w / 2, y: e.clientY - h / 2, defId });
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const handleBlockPointerDown = useCallback((e: React.PointerEvent, instanceId: string) => {
    e.preventDefault();
    const block = blocks.get(instanceId);
    if (!block) return;
    const { x: svgX, y: svgY } = toSVG(e.clientX, e.clientY);

    // For embedded blocks, compute actual position from parent + socket offset.
    // The stored x,y may be stale if the parent moved after the block was embedded.
    let blockX = block.x;
    let blockY = block.y;
    if (block.embeddedInBlockId) {
      const parent = blocks.get(block.embeddedInBlockId);
      if (parent) {
        const sockets = getSocketPositions(getDefinition(parent.definitionId), parent.paramSlots, blocks);
        const socket  = sockets[block.embeddedSlotIndex];
        if (socket) { blockX = parent.x + socket.x; blockY = parent.y + socket.y; }
      }
    }

    const offsetX = svgX - blockX;
    const offsetY = svgY - blockY;

    const def   = tryGetDefinition(block.definitionId);
    // Orphaned blocks (missing def) are treated as single-block drags so the
    // user can drag them to the palette to delete them.
    const chain = def?.blockType === 'query' ? [instanceId] : collectChain(instanceId, blocks);

    if (block.embeddedInBlockId || block.parentBlockId) {
      const embParentId   = block.embeddedInBlockId;
      const embSlotIdx    = block.embeddedSlotIndex;
      const chainParentId = block.parentBlockId;
      setBlocks(prev => {
        const next = new Map(prev);
        if (embParentId) {
          const parent = next.get(embParentId);
          if (parent) {
            const slots = [...parent.paramSlots];
            slots[embSlotIdx] = { textValue: null, queryBlockId: null };
            next.set(embParentId, { ...parent, paramSlots: slots });
          }
          next.set(instanceId, { ...block, x: blockX, y: blockY, embeddedInBlockId: null, embeddedSlotIndex: -1 });
        }
        if (chainParentId) {
          const parent = next.get(chainParentId);
          if (parent) next.set(chainParentId, { ...parent, nextBlockId: null });
          const block = next.get(instanceId);
          if (block) next.set(instanceId, { ...block, parentBlockId: null });
        }
        return next;
      });
    }

    dragRef.current = {
      type: 'canvas', defId: block.definitionId, instanceId,
      carriedIds: chain, offsetX, offsetY,
      startClientX: e.clientX, startClientY: e.clientY,
      moved: false,
    };
    setDraggingIds(new Set(chain));
    setGhostPos({ x: e.clientX - offsetX, y: e.clientY - offsetY, defId: block.definitionId });
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [blocks, toSVG]);

  // ── Global pointer events ────────────────────────────────────────────────────

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (Math.abs(e.clientX - drag.startClientX) > 4 || Math.abs(e.clientY - drag.startClientY) > 4)
        drag.moved = true;
      if (!drag.moved) return;
      setGhostPos({ x: e.clientX - drag.offsetX, y: e.clientY - drag.offsetY, defId: drag.defId });

      if (drag.type === 'canvas') {
        const rect = canvasRef.current?.getBoundingClientRect();
        const over = !!rect && e.clientX < rect.left;
        if (over !== isOverPaletteRef.current) {
          isOverPaletteRef.current = over;
          setIsOverPalette(over);
        }
      }
    }

    function onPointerUp(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      setGhostPos(null);
      setDraggingIds(new Set());
      isOverPaletteRef.current = false;
      setIsOverPalette(false);
      if (!drag.moved) return;

      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      // ── Delete: canvas block dropped over the palette ────────────────────────
      if (drag.type === 'canvas' && e.clientX < canvasRect.left) {
        setBlocks(prev => deleteCarried(prev, drag.carriedIds!));
        return;
      }

      const dropX = e.clientX - drag.offsetX - canvasRect.left;
      const dropY = e.clientY - drag.offsetY - canvasRect.top;
      const def   = getDefinition(drag.defId);

      if (drag.type === 'palette') {
        if (e.clientX < canvasRect.left || e.clientX > canvasRect.right ||
            e.clientY < canvasRect.top  || e.clientY > canvasRect.bottom) return;

        // Enforce one instance per event (start) block.
        if (def?.blockType === 'start') {
          const alreadyPlaced = [...blocks.values()].some(block => block.definitionId === drag.defId);
          if (alreadyPlaced) return;
        }

        const newBlock = createBlock(drag.defId, dropX, dropY);

        if (def.blockType !== 'query') {
          const snap = findSnapTarget(dropX, dropY, new Set());
          if (snap) {
            const { blockId: snapId, snapX, snapY } = snap;
            newBlock.x = snapX; newBlock.y = snapY; newBlock.parentBlockId = snapId;
            setBlocks(prev => {
              const next = new Map(prev);
              const parent = next.get(snapId)!;
              next.set(snapId, { ...parent, nextBlockId: newBlock.instanceId });
              next.set(newBlock.instanceId, newBlock);
              return next;
            });
            return;
          }
        } else {
          const socketSnap = findSocketSnap(dropX, dropY, drag.defId, new Set());
          if (socketSnap) {
            const { blockId: parentId, slotIndex, snapX, snapY } = socketSnap;
            newBlock.x = snapX; newBlock.y = snapY;
            newBlock.embeddedInBlockId = parentId; newBlock.embeddedSlotIndex = slotIndex;
            setBlocks(prev => {
              const next = new Map(prev);
              const parent = next.get(parentId)!;
              const slots = [...parent.paramSlots];
              slots[slotIndex] = { textValue: null, queryBlockId: newBlock.instanceId };
              next.set(parentId, { ...parent, paramSlots: slots });
              next.set(newBlock.instanceId, newBlock);
              return next;
            });
            return;
          }
        }
        setBlocks(prev => { const next = new Map(prev); next.set(newBlock.instanceId, newBlock); return next; });

      } else {
        const leadId = drag.instanceId!;
        setBlocks(prev => {
          const next = new Map(prev);
          const lead = next.get(leadId);
          if (!lead) return prev;

          const deltaX = dropX - lead.x;
          const deltaY = dropY - lead.y;
          // Move carried blocks AND all query blocks embedded in their sockets
          const allToMove = gatherWithDescendants(drag.carriedIds!, next);
          allToMove.forEach(id => {
            const block = next.get(id);
            if (block) next.set(id, { ...block, x: block.x + deltaX, y: block.y + deltaY });
          });

          if (def.blockType !== 'query') {
            const snap = findSnapTarget(dropX, dropY, new Set(drag.carriedIds!));
            if (snap) {
              const { blockId: snapId, snapX, snapY } = snap;
              const nudgeX = snapX - dropX;
              const nudgeY = snapY - dropY;
              drag.carriedIds!.forEach(id => {
                const block = next.get(id);
                if (block) next.set(id, { ...block, x: block.x + nudgeX, y: block.y + nudgeY });
              });
              const parent = next.get(snapId)!;
              next.set(snapId, { ...parent, nextBlockId: leadId });
              next.set(leadId, { ...next.get(leadId)!, parentBlockId: snapId });
            }
          } else {
            const socketSnap = findSocketSnap(dropX, dropY, drag.defId, new Set([leadId]));
            if (socketSnap) {
              const { blockId: parentId, slotIndex, snapX, snapY } = socketSnap;
              const block = next.get(leadId)!;
              next.set(leadId, { ...block, x: snapX, y: snapY, embeddedInBlockId: parentId, embeddedSlotIndex: slotIndex });
              const parent = next.get(parentId)!;
              const slots = [...parent.paramSlots];
              slots[slotIndex] = { textValue: null, queryBlockId: leadId };
              next.set(parentId, { ...parent, paramSlots: slots });
            }
          }
          return next;
        });
      }
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [blocks, findSnapTarget, findSocketSnap]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const outerStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column',
    flex: 1, minHeight: 0, width: '100%', height: '100%',
    overflow: 'hidden', background: theme.appBg,
    color: theme.textPrimary, fontFamily: 'system-ui, sans-serif',
    boxSizing: 'border-box',
  };

  const innerStyle: React.CSSProperties = {
    display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden',
  };

  if (loadError) return (
    <ThemeContext.Provider value={theme}>
      <div style={{ ...outerStyle, alignItems: 'center', justifyContent: 'center', color: '#c06060', fontFamily: 'monospace' }}>
        Failed to load blocks: {loadError}
      </div>
    </ThemeContext.Provider>
  );

  if (!ready) return (
    <ThemeContext.Provider value={theme}>
      <div style={{ ...outerStyle, alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
        Loading…
      </div>
    </ThemeContext.Provider>
  );

  return (
    <ThemeContext.Provider value={theme}>
    <div style={outerStyle}>
      {/* ── Title bar ── */}
      {!hideTitleBar && (
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 14px', height: 38,
        background: theme.titleBg,
        borderBottom: `1px solid ${theme.border}`,
      }}>
        <span style={{ color: theme.titlePrimaryText, fontWeight: 'bold', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>
          CardCQ
        </span>
        <span style={{ color: theme.titleSecondaryText, fontSize: 11, letterSpacing: 0.5 }}>
          Behavior Editor
        </span>
        {navTabs}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {onSave && (
            <button
              onClick={() => onSave({ blocks: [...blocks.entries()] })}
              style={{
                padding: '3px 10px', fontSize: 11, fontWeight: 'bold',
                background: theme.titleBg, color: theme.titlePrimaryText,
                border: `1px solid ${theme.border}`, borderRadius: 4,
                cursor: 'pointer', letterSpacing: 0.5,
              }}
            >
              Save
            </button>
          )}
          {!themeId && <ThemeSwitcher onSelect={changeTheme} />}
        </div>
      </div>
      )}
      <div style={innerStyle}>
        <BlockPalette
          onPointerDown={handlePalettePointerDown}
          isDropTarget={isOverPalette}
          registryVersion={registryVersion}
          availablePackages={availablePackages}
          loadedPackages={loadedPackages}
          onPackageToggle={handlePackageToggle}
          placedStartIds={placedStartIds}
        />
        <Canvas
          ref={canvasRef}
          blocks={blocks}
          draggingIds={draggingIds}
          onBlockPointerDown={handleBlockPointerDown}
          onBlockClick={handleBlockClick}
          onSocketClick={handleSocketClick}
          editingSocket={editingSocket}
          onSocketCommit={handleSocketCommit}
          onSocketCancelEdit={handleSocketCancelEdit}
        />
      </div>
      <DragGhost ghostPos={ghostPos} dragRef={dragRef} blocks={blocks} />
    </div>
    </ThemeContext.Provider>
  );
}
