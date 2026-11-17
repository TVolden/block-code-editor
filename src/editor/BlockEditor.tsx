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
import type {
  BlockDefinition, ParamType, PlacedBlock, ParamSlot, SerializedCanvas, PackageRef, CatalogPackage, PackageAction,
} from '../types';
import { DEPENDENCY_PREFIX, dependencyPackageId, packageKey } from '../utils/packages';
import type { CanvasState, Command, Place, RejectionCode } from '../commands/types';
import { fragmentOf, normalizeBlock } from '../commands/apply';
import { changeDependencies, deleteChain, moveChain, placeNewBlock, setSocketText } from '../commands/build';
import type { Collaboration, CommandEnvelope, PeerPresence } from '../collaboration/types';
import type { ActionKind, SyncState } from '../collaboration/sync';
import {
  canUndoRedo, initialSync, onApplied, onRejected, onSnapshot, preview, submitAction, submitRedo, submitUndo,
} from '../collaboration/sync';
import { DEFAULT_PRESENCE_INTERVAL_MS, PresencePublisher } from '../collaboration/presence';
import type { ScriptWriter } from '../export/program';
import { toProgram } from '../export/program';
export type { SerializedCanvas, BlockDefinition } from '../types';
import {
  loadBlockRegistry, loadPackage, unloadPackage, getLoadedPackages,
  getDefinition, tryGetDefinition, loadInlinePackage, getBlockPackageId,
} from '../blockRegistry';
import type { LoadedPackage } from '../blockRegistry';
import {
  getBlockWidth, getBlockHeight, getHeaderHeight, getSocketPositions, getMouthPositions,
  computeLayout, isCommandParam,
} from '../utils/blockLayout';
import { darkTheme, THEMES } from '../theme';
import type { Theme, ThemeId } from '../theme';
import { ThemeContext, useTheme } from '../ThemeContext';
import { blockPath } from '../utils/blockShapes';
import BlockPalette from '../components/BlockPalette';
import { MouthDecorations } from '../components/MouthDecorations';
import Canvas from '../components/Canvas';
import { BlockRenderer } from '../components/BlockRenderer';
import ThemeSwitcher from '../components/ThemeSwitcher';
import UndoRedoBar from '../components/UndoRedoBar';
import { readSetting, writeSetting } from '../utils/storage';
import { activateEditor, isActiveEditor, registerEditor, unregisterEditor } from './activeEditor';
import ExportMenu from '../components/ExportMenu';
import PeersOverlay from '../components/PeersOverlay';

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
  /**
   * The packages the canvas depends on, maintained in the palette's Packages tab (which shows only with this prop).
   * Controlled: a change is reported with `onDependenciesChange`, and the editor loads what it is given back. Their
   * blocks are fetched from `packageBlocksUrl`, after the `blocksUrl(s)`, which stay the core set.
   */
  dependencies?: PackageRef[];
  onDependenciesChange?: (dependencies: PackageRef[]) => void;
  /** Where a package version's blocks (`BlockDefinition[]`) are fetched. Required with `dependencies`. */
  packageBlocksUrl?: (ref: PackageRef) => string;
  /** The packages the Packages tab offers to add, each at the version adding it pins. */
  availablePackages?: CatalogPackage[];
  /** Extra buttons in the Packages tab. */
  packageActions?: PackageAction[];
  /**
   * Collaboration: with `commands` the editor is command-sourced (it submits every action and changes its state only
   * by the host's events); with `presence` it shares and shows cursors, drags and typing. Without it, standalone.
   * The channels are read when the editor mounts and whenever they change identity.
   */
  collaboration?: Collaboration;
  /** Script writers offered in the Export menu (the canvas as a program, see `toProgram`). */
  scriptWriters?: ScriptWriter[];
  /** Receives an exported script; without it the script is downloaded as `behavior.<extension>`. */
  onExport?: (script: string, writer: ScriptWriter) => void;
}

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
  carriedIds?: string[];   // this block + all chained blocks below it (still linked: a drag changes no state)
  offsetX: number;         // cursor offset from block's top-left corner
  offsetY: number;
  startClientX: number;    // initial pointer position (detect click vs drag)
  startClientY: number;
  moved: boolean;          // true once pointer has moved far enough
}

// ── Helper functions ─────────────────────────────────────────────────────────

/** The client id of a standalone editor (its envelopes never leave it). */
const LOCAL_CLIENT_ID = 'local';

/** What to tell the user when the host rejects one of their actions. */
function rejectionNotice(kind: ActionKind, code: RejectionCode, message: string): string {
  const what = kind === 'undo' ? "Couldn't undo" : kind === 'redo' ? "Couldn't redo" : 'Your change was undone';
  // The host's own reason: only its message says what it is.
  if (code === 'HOST_REJECTED') return `${what}: ${message}`;
  const why: Partial<Record<RejectionCode, string>> = {
    TEXT_CHANGED:         'someone else changed that parameter',
    PLACE_OCCUPIED:       'someone else put a block there first',
    BLOCK_NOT_FOUND:      'a block it needs was deleted',
    BLOCK_CHANGED:        'someone else changed those blocks',
    NOT_AT_PLACE:         'someone else moved that block',
    NOT_A_ROOT:           'someone else moved that block',
    POSITION_CHANGED:     'someone else moved that block',
    DEPENDENCIES_CHANGED: 'someone else changed the packages',
  };
  return `${what}: ${why[code] ?? 'the canvas has changed'}.`;
}

/** A new block id: random, so blocks made by different clients never collide. Ids are opaque strings. */
function newBlockId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID needs a secure context; fall back to the same format from random bytes.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Whether the block is the first block of a mouth's chain (rather than a query in a socket). */
function isMouthHead(block: PlacedBlock, blocks: Map<string, PlacedBlock>): boolean {
  if (!block.embeddedInBlockId) return false;
  const host = blocks.get(block.embeddedInBlockId);
  return host?.paramSlots[block.embeddedSlotIndex]?.commandBlockId === block.instanceId;
}

/** Where a carried chain can attach: under a chain's last block, or at the top of a mouth. */
type ChainSnap =
  | { kind: 'next';  blockId: string; snapX: number; snapY: number; dist: number }
  | { kind: 'mouth'; blockId: string; slotIndex: number; snapX: number; snapY: number; dist: number };

/** The command place of a snap target. */
function snapPlace(snap: ChainSnap): Place {
  return snap.kind === 'next' ? { next: snap.blockId } : { mouth: snap.blockId, slot: snap.slotIndex };
}

/**
 * Brings the registry's dependencies in line with `deps`: unloads the loaded ones no longer wanted (a package whose
 * version changed included) and loads the missing ones from `blocksUrlOf`. Returns whether anything changed. Does
 * nothing without dependencies (an editor that doesn't maintain packages).
 */
async function syncDependencies(
  deps: PackageRef[] | undefined,
  blocksUrlOf: ((ref: PackageRef) => string) | undefined,
): Promise<boolean> {
  if (!deps || !blocksUrlOf) return false;
  const wanted   = new Map(deps.map(d => [dependencyPackageId(d), d]));
  const loaded   = new Set(getLoadedPackages().map(lp => lp.info.id).filter(id => id.startsWith(DEPENDENCY_PREFIX)));
  const toUnload = [...loaded].filter(id => !wanted.has(id));
  const toLoad   = [...wanted].filter(([id]) => !loaded.has(id));
  // Unload first: another version of a package defines the same block ids, and the first registered wins.
  toUnload.forEach(unloadPackage);
  for (const [id, ref] of toLoad) {
    await loadPackage({ id, name: packageKey(ref), description: '', url: blocksUrlOf(ref), builtIn: false });
  }
  return toUnload.length > 0 || toLoad.length > 0;
}

/** How many canvas blocks each loaded dependency provides, by `packageKey` (the name it is loaded under). */
function countBlocksByPackage(blocks: Map<string, PlacedBlock>): Map<string, number> {
  const names = new Map(getLoadedPackages().map(lp => [lp.info.id, lp.info.name]));
  const counts = new Map<string, number>();
  blocks.forEach(block => {
    const packageId = getBlockPackageId(block.definitionId);
    if (!packageId?.startsWith(DEPENDENCY_PREFIX)) return;
    const key = names.get(packageId)!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

/** Creates a fresh root block with empty parameter slots. */
function createBlock(defId: string, x: number, y: number): PlacedBlock {
  const def = getDefinition(defId);
  return {
    instanceId: newBlockId(),
    definitionId: defId,
    x, y,
    nextBlockId: null,
    parentBlockId: null,
    embeddedInBlockId: null,
    embeddedSlotIndex: -1,
    paramSlots: def.params.map((): ParamSlot => ({ textValue: null, queryBlockId: null, commandBlockId: null })),
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

/** Walks parentBlockId links (and out of mouths) upward to find the root of a chain. */
function findChainRoot(id: string, blocks: Map<string, PlacedBlock>): string {
  const block = blocks.get(id);
  if (block?.parentBlockId) return findChainRoot(block.parentBlockId, blocks);
  if (block && isMouthHead(block, blocks)) return findChainRoot(block.embeddedInBlockId!, blocks);
  return id;
}

/**
 * Formats one block as a console output line:
 *   "block-id(param1, param2)"  — always parentheses, strings quoted, empty slots → _,
 *   a mouth → "{ A(...); B(...) }"
 */
function formatOutputLine(block: PlacedBlock, blocks: Map<string, PlacedBlock>): string {
  const def  = tryGetDefinition(block.definitionId);
  if (!def) return `[missing:${block.definitionId}]`;
  const args = block.paramSlots.map((slot, i) => {
    const param = def.params[i];
    if (param && isCommandParam(def, param)) {
      const chain = slot.commandBlockId ? collectChain(slot.commandBlockId, blocks) : [];
      const lines = chain.map(id => blocks.get(id)).filter(Boolean).map(b => formatOutputLine(b!, blocks));
      return lines.length > 0 ? `{ ${lines.join('; ')} }` : '{ }';
    }
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

// ── DragGhost ─────────────────────────────────────────────────────────────────

/** Where the drag ghost is drawn, and what it shows. */
interface GhostPos {
  x: number;
  y: number;
  defId: string;        // block definition being dragged
  instanceId?: string;  // canvas block being dragged (canvas drags only)
}

interface DragGhostProps {
  ghostPos: GhostPos | null;
  blocks:   Map<string, PlacedBlock>;
}

function DragGhost({ ghostPos, blocks }: DragGhostProps) {
  const theme = useTheme();
  if (!ghostPos) return null;

  // Canvas drag: render the full block so embedded params follow the cursor
  if (ghostPos.instanceId) {
    const block = blocks.get(ghostPos.instanceId);
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

  // Palette drag: simple ghost (new block has no embedded params yet, and empty mouths)
  const def = getDefinition(ghostPos.defId);
  const h   = getBlockHeight(def);
  const isCommand = def.blockType === 'command';
  const path = blockPath(def);
  const mouths = getMouthPositions(def);

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
        {mouths.length > 0 && <MouthDecorations mouths={mouths} w={getBlockWidth(def)} isEmpty={() => true} />}
        <text x={11} y={getHeaderHeight(def) / 2 + 4} fill={isCommand ? theme.blockText : 'white'} fontSize={11} fontWeight="bold"
          fontFamily="sans-serif" style={{ userSelect: 'none' }}>
          {def.name}
        </text>
      </g>
    </svg>
  );
}

/** Whether a query fits a socket of the type: it returns that type, or its result can be used as it. */
function fitsSocket(query: BlockDefinition, socketType: ParamType): boolean {
  return query.returnType === socketType || (query.usableAs?.includes(socketType) ?? false);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BlockEditor({
  blocksUrl = '/blocks.json', blocksUrls, onRun, onThemeChange, navTabs, initialState, onSave, themeId, hideTitleBar,
  getStateRef, additionalBlocks,
  dependencies, onDependenciesChange, packageBlocksUrl, availablePackages, packageActions,
  collaboration, scriptWriters, onExport,
}: Props) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (themeId) return THEMES.find(t => t.id === themeId) ?? darkTheme;
    const saved = readSetting('cardcq-theme');
    return THEMES.find(t => t.id === saved) ?? darkTheme;
  });

  // Keep theme in sync when the caller changes the themeId prop (adjusted during render, not in an effect).
  const [prevThemeId, setPrevThemeId] = useState(themeId);
  if (themeId !== prevThemeId) {
    setPrevThemeId(themeId);
    if (themeId) setTheme(THEMES.find(t => t.id === themeId) ?? darkTheme);
  }
  const [ready, setReady]         = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Canvas state: changed only by applying commands ─────────────────────────
  // The sync state holds the confirmed state, this client's pending actions and its history. Standalone, an action
  // is confirmed at once; command-sourced, it is submitted and confirmed (or rejected) by the host's events. What is
  // shown is the preview: the confirmed state with the pending actions on top.

  const commandChannel = collaboration?.commands;
  const clientId = collaboration?.clientId ?? LOCAL_CLIENT_ID;
  const [sync, setSync] = useState<SyncState>(() => initialSync({
    blocks: new Map((initialState?.blocks ?? []).map(([id, block]) => [id, normalizeBlock(block)])),
    dependencies: dependencies ?? [],
  }));
  const { state: canvas, provisionalIds } = useMemo(() => preview(sync), [sync]);
  const blocks = canvas.blocks;
  // The latest sync state and preview for handlers (several updates can come before React re-renders).
  const syncRef = useRef(sync);
  const stateRef = useRef(canvas);
  useEffect(() => {
    syncRef.current = sync;
    stateRef.current = canvas;
  });

  // Standalone, a host change of the dependencies (not one the editor reported) replaces them, without a history
  // step. Command-sourced, they come from the snapshot and the commands only.
  const dependenciesPropKey = (dependencies ?? []).map(dependencyPackageId).join('|');
  const [seenDependenciesPropKey, setSeenDependenciesPropKey] = useState(dependenciesPropKey);
  if (dependenciesPropKey !== seenDependenciesPropKey) {
    setSeenDependenciesPropKey(dependenciesPropKey);
    if (!commandChannel && dependenciesPropKey !== sync.confirmed.dependencies.map(dependencyPackageId).join('|')) {
      setSync(s => ({ ...s, confirmed: { ...s.confirmed, dependencies: dependencies ?? [] } }));
    }
  }

  const onDependenciesChangeRef = useRef(onDependenciesChange);
  useEffect(() => { onDependenciesChangeRef.current = onDependenciesChange; });

  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  /** Sets the sync state (and the refs at once); reports a change of the confirmed dependencies to the host. */
  const updateSync = useCallback((next: SyncState) => {
    const previous = syncRef.current;
    syncRef.current = next;
    stateRef.current = preview(next).state;
    setSync(next);
    if (next.confirmed.dependencies !== previous.confirmed.dependencies) {
      onDependenciesChangeRef.current?.(next.confirmed.dependencies);
    }
  }, []);

  /**
   * Sends an action that `withAction` added as pending: to the host when command-sourced (it stays pending until its
   * event comes back), else confirmed at once.
   */
  const submit = useCallback((withAction: SyncState, id: string, command: Command) => {
    const envelope: CommandEnvelope = { id, clientId, baseVersion: syncRef.current.version, command };
    if (commandChannel) {
      updateSync(withAction);
      commandChannel.submit(envelope);
      return;
    }
    const applied = onApplied(withAction, envelope, withAction.version + 1);
    if (applied.outOfSync) {
      updateSync(onRejected(withAction, id).sync);
      showNotice("That change couldn't be made: the canvas has changed.");
    } else {
      updateSync(applied.sync);
    }
  }, [clientId, commandChannel, updateSync, showNotice]);

  /** A user action (one undo step). Nothing for null (an action that changes nothing). */
  const perform = useCallback((command: Command | null) => {
    if (!command) return;
    const id = newBlockId();
    submit(submitAction(syncRef.current, id, command), id, command);
  }, [submit]);

  const undo = useCallback(() => {
    const id = newBlockId();
    const undone = submitUndo(syncRef.current, id);
    if (undone) submit(undone.sync, id, undone.command);
  }, [submit]);

  const redo = useCallback(() => {
    const id = newBlockId();
    const redone = submitRedo(syncRef.current, id);
    if (redone) submit(redone.sync, id, redone.command);
  }, [submit]);

  // ── Presence: this client's (published, throttled) and the others' ─────────

  const presenceChannel = collaboration?.presence;
  const presenceIntervalMs = collaboration?.presenceIntervalMs ?? DEFAULT_PRESENCE_INTERVAL_MS;
  const publisherRef = useRef<PresencePublisher | null>(null);
  const [peers, setPeers] = useState<PeerPresence[]>([]);
  useEffect(() => {
    if (!presenceChannel) return;
    const publisher = new PresencePublisher(p => presenceChannel.publish(p), presenceIntervalMs);
    publisherRef.current = publisher;
    const unsubscribe = presenceChannel.subscribe(list => setPeers(list.filter(p => p.clientId !== clientId)));
    return () => {
      publisher.updateNow({ cursor: null, drag: null, typing: null });
      publisher.dispose();
      publisherRef.current = null;
      unsubscribe();
      setPeers([]);
    };
  }, [presenceChannel, presenceIntervalMs, clientId]);

  // The host's events, when command-sourced.
  useEffect(() => {
    if (!commandChannel) return;
    return commandChannel.subscribe(event => {
      if (event.type === 'snapshot') {
        const state: CanvasState = {
          blocks: new Map(event.state.blocks.map(([id, block]) => [id, normalizeBlock(block)])),
          dependencies: event.state.dependencies,
        };
        const result = onSnapshot(state, event.version, syncRef.current);
        updateSync(result.sync);
        if (result.dropped > 0) showNotice('Reloaded from the server: your unconfirmed changes were discarded.');
      } else if (event.type === 'applied') {
        const result = onApplied(syncRef.current, event.envelope, event.version);
        if (result.outOfSync) {
          showNotice('Out of sync with the server: reloading…');
          commandChannel.resync?.();
        } else {
          updateSync(result.sync);
        }
      } else {
        const result = onRejected(syncRef.current, event.id);
        updateSync(result.sync);
        if (result.action) showNotice(rejectionNotice(result.action.kind, event.code, event.message));
      }
    });
  }, [commandChannel, updateSync, showNotice]);

  // Keyboard shortcuts act on the active editor only (several can share a page): the one last pointed into or focused.
  const [editorId] = useState(() => Symbol('BlockEditor'));
  useEffect(() => {
    registerEditor(editorId);
    return () => unregisterEditor(editorId);
  }, [editorId]);
  const activate = useCallback(() => activateEditor(editorId), [editorId]);

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y, except while typing in a field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isActiveEditor(editorId)) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.metaKey)) { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, editorId]);
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

  const [ghostPos, setGhostPos]         = useState<GhostPos | null>(null);
  const [draggingIds, setDraggingIds]   = useState<Set<string>>(new Set());
  const [isOverPalette, setIsOverPalette] = useState(false);

  const [registryVersion, setRegistryVersion]     = useState(0);
  const [loadedPackages, setLoadedPackages]       = useState<LoadedPackage[]>([]);

  // Where every block is drawn (non-root blocks are placed by the block they hang off). It depends on the definitions
  // in the registry too, which change with registryVersion (e.g. when they load after an initial state).
  // The registry is module-level, so the hooks linter can't see that registryVersion is what signals its changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- registryVersion signals a change of the registry
  const layout = useMemo(() => computeLayout(blocks), [blocks, registryVersion]);

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

  // The latest dependencies (the canvas's: they change by commands), for the loaders below (which run on the registry
  // one after the other, see loadQueue). Without the dependencies prop the editor maintains no packages.
  // Standalone the host passes `dependencies`; command-sourced they come with the snapshot, and `packageBlocksUrl` says
  // the host wants them maintained.
  const maintainsPackages   = dependencies !== undefined || (collaboration?.commands !== undefined && packageBlocksUrl !== undefined);
  const dependenciesRef     = useRef<PackageRef[] | undefined>(maintainsPackages ? canvas.dependencies : undefined);
  const packageBlocksUrlRef = useRef(packageBlocksUrl);
  useEffect(() => {
    dependenciesRef.current     = maintainsPackages ? canvas.dependencies : undefined;
    packageBlocksUrlRef.current = packageBlocksUrl;
  });
  const dependenciesKey = canvas.dependencies.map(dependencyPackageId).join('|');

  // Loads change the module-level registry, so they run one after another.
  const loadQueue = useRef<Promise<void>>(Promise.resolve());

  // New URLs: the editor is not ready until the load below is done (reset during render, not in the effect).
  const [prevUrlsKey, setPrevUrlsKey] = useState(resolvedUrlsKey);
  if (resolvedUrlsKey !== prevUrlsKey) {
    setPrevUrlsKey(resolvedUrlsKey);
    setReady(false);
    setLoadError(null);
  }

  // The core set, then the dependencies; the editor is ready only once all are in.
  // A run whose effect was cleaned up (StrictMode's double run in development, or new URLs) does nothing more: a later
  // run clears and reloads the registry, and must not find a stale run marking the editor ready while it is still
  // loading.
  useEffect(() => {
    let cancelled = false;
    const urls = resolvedUrlsKey.split('|');
    loadQueue.current = loadQueue.current.then(async () => {
      if (cancelled) return;
      try {
        // First URL clears registry and loads as core; subsequent URLs append as named packages.
        await loadBlockRegistry(urls[0]);
        for (let i = 1; i < urls.length && !cancelled; i++) {
          await loadPackage({
            id: `__extra_${i}__`,
            name: `Extra ${i}`,
            description: '',
            url: urls[i],
            builtIn: true,
          });
        }
        if (cancelled) return;
        await syncDependencies(dependenciesRef.current, packageBlocksUrlRef.current);
        if (cancelled) return;
        setLoadedPackages(getLoadedPackages());
        setRegistryVersion(v => v + 1);
        setReady(true);
      } catch (err) {
        if (!cancelled) setLoadError(String(err));
      }
    });
    return () => { cancelled = true; };
  }, [resolvedUrlsKey]);

  // A change of dependencies once ready: load and unload only what changed. Blocks are never removed here: removing a
  // package removes its blocks in the same user action (changeDependencies), and blocks whose definitions are missing
  // otherwise stay as placeholders. A run whose effect was cleaned up before its turn is skipped: the next run syncs to
  // the latest dependencies anyway.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    loadQueue.current = loadQueue.current.then(async () => {
      if (cancelled) return;
      try {
        const changed = await syncDependencies(dependenciesRef.current, packageBlocksUrlRef.current);
        if (!changed) return;
        setLoadedPackages(getLoadedPackages());
        setRegistryVersion(v => v + 1);
      } catch (err) {
        setLoadError(String(err));
      }
    });
    return () => { cancelled = true; };
  }, [ready, dependenciesKey]);

  // ── Inline (additional) blocks ───────────────────────────────────────────────

  // Queued like the other loads (they change the same registry). A run whose effect was cleaned up before its turn is
  // skipped: the next run replaces the inline blocks anyway.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    loadQueue.current = loadQueue.current.then(() => {
      if (cancelled) return;
      try {
        unloadPackage('__inline__');
        if (additionalBlocks && additionalBlocks.length > 0) {
          loadInlinePackage(
            { id: '__inline__', name: 'Inline', description: '', url: '', builtIn: true },
            additionalBlocks,
          );
        }
        setLoadedPackages(getLoadedPackages());
        setRegistryVersion(v => v + 1);
        // Blocks whose definition went (e.g. a renamed collection) stay as placeholders until the user deletes them.
      } catch (err) {
        setLoadError(String(err));
      }
    });
    return () => { cancelled = true; };
  }, [additionalBlocks, ready]);

  // ── Coordinate helpers ───────────────────────────────────────────────────────

  const toSVG = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // ── Snap detection ───────────────────────────────────────────────────────────

  /**
   * Where a chain led by a block of `leadDefId`, dropped with its top-left at (svgX, svgY), attaches: under the last
   * block of any chain (also in a mouth), or at the top of a mouth, empty or not. Only command chains attach.
   * `exclude` holds the carried blocks and everything they hold, so a chain never snaps into itself. A drag changes no
   * state, so the place the carried lead (`leadId`) still occupies counts as free: dropping it back is a no-op.
   */
  const findSnapTarget = useCallback((svgX: number, svgY: number, leadDefId: string, leadId: string | null, exclude: Set<string>): ChainSnap | null => {
    const SNAP_DISTANCE = 24;
    // Only a command has an inlet: a start block never attaches under anything.
    if (tryGetDefinition(leadDefId)?.blockType !== 'command') return null;
    let best: ChainSnap | null = null;
    const consider = (candidate: ChainSnap) => {
      if (!best || candidate.dist < best.dist) best = candidate;
    };
    const distanceTo = (x: number, y: number) => {
      const dx = Math.abs(svgX - x);
      const dy = Math.abs(svgY - y);
      return dx < 40 && dy < SNAP_DISTANCE ? Math.hypot(dx, dy) : null;
    };
    blocks.forEach((block) => {
      if (exclude.has(block.instanceId)) return;
      const def = tryGetDefinition(block.definitionId);
      const pos = layout.get(block.instanceId);
      if (!def || def.blockType === 'query' || !pos) return;
      if (!block.nextBlockId || block.nextBlockId === leadId) {
        const bottom = pos.y + getBlockHeight(def, block.paramSlots, blocks);
        const dist = distanceTo(pos.x, bottom);
        if (dist !== null) consider({ kind: 'next', blockId: block.instanceId, snapX: pos.x, snapY: bottom, dist });
      }
      for (const mouth of getMouthPositions(def, block.paramSlots, blocks)) {
        const x = pos.x + mouth.x;
        const y = pos.y + mouth.y;
        const dist = distanceTo(x, y);
        if (dist !== null) consider({ kind: 'mouth', blockId: block.instanceId, slotIndex: mouth.index, snapX: x, snapY: y, dist });
      }
    });
    return best;
  }, [blocks, layout]);

  /** Where a query dropped with its top-left at (svgX, svgY) fits a socket; the socket the dragged query (`leadId`) is in counts as free. */
  const findSocketSnap = useCallback((svgX: number, svgY: number, defId: string, leadId: string | null, exclude: Set<string>): SockResult | null => {
    const draggedDef = tryGetDefinition(defId);
    if (!draggedDef || draggedDef.blockType !== 'query') return null;
    const SNAP_DISTANCE = 20;
    let best: SockResult | null = null;
    blocks.forEach((block) => {
      if (exclude.has(block.instanceId)) return;
      const blockDef = tryGetDefinition(block.definitionId);
      const pos      = layout.get(block.instanceId);
      if (!blockDef || !pos) return;
      const sockets  = getSocketPositions(blockDef, block.paramSlots, blocks);
      sockets.forEach((socket) => {
        if (!fitsSocket(draggedDef, socket.type)) return;
        const occupant = block.paramSlots[socket.index]?.queryBlockId;
        if (occupant && occupant !== leadId) return;
        const centerX = pos.x + socket.x + socket.w / 2;
        const centerY = pos.y + socket.y + socket.h / 2;
        const dx = Math.abs(svgX + socket.w / 2 - centerX);
        const dy = Math.abs(svgY + socket.h / 2 - centerY);
        if (dx < socket.w / 2 + SNAP_DISTANCE && dy < socket.h / 2 + SNAP_DISTANCE) {
          const dist = Math.hypot(dx, dy);
          if (!best || dist < best.dist)
            best = { blockId: block.instanceId, slotIndex: socket.index, snapX: pos.x + socket.x, snapY: pos.y + socket.y, dist };
        }
      });
    });
    return best;
  }, [blocks, layout]);

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

  // The socket being typed into, with its text when editing started (the SetText's `from`: a change someone else
  // makes meanwhile rejects this one instead of being overwritten).
  type EditingSocket = { blockId: string; slotIndex: number; startText: string | null };
  const [editingSocket, setEditingSocket] = useState<EditingSocket | null>(null);
  // The edit in progress for the handlers: Enter and the input's blur can both commit, and only the first counts.
  const editingRef = useRef<EditingSocket | null>(null);

  const handleSocketClick = useCallback((blockId: string, slotIndex: number) => {
    if (dragRef.current?.moved) return;
    const startText = stateRef.current.blocks.get(blockId)?.paramSlots[slotIndex]?.textValue ?? null;
    editingRef.current = { blockId, slotIndex, startText };
    setEditingSocket(editingRef.current);
    publisherRef.current?.updateNow({ typing: { blockId, slot: slotIndex, text: startText ?? '' } });
  }, []);

  const handleSocketInput = useCallback((blockId: string, slotIndex: number, text: string) => {
    publisherRef.current?.update({ typing: { blockId, slot: slotIndex, text } });
  }, []);

  const handleSocketCommit = useCallback((blockId: string, slotIndex: number, value: string) => {
    const editing = editingRef.current;
    editingRef.current = null;
    setEditingSocket(null);
    if (!editing || editing.blockId !== blockId || editing.slotIndex !== slotIndex) return;
    publisherRef.current?.updateNow({ typing: null });
    perform(setSocketText(blockId, slotIndex, editing.startText, value));
  }, [perform]);

  const handleSocketCancelEdit = useCallback(() => {
    editingRef.current = null;
    setEditingSocket(null);
    publisherRef.current?.updateNow({ typing: null });
  }, []);

  /**
   * An added optional parameter left out again (its `×`): its text is cleared, or its query detached and put down right
   * of the block, as if dragged out, so nothing is lost. One user action either way.
   */
  const handleParamRemove = useCallback((blockId: string, slotIndex: number) => {
    const state = stateRef.current;
    const block = state.blocks.get(blockId);
    const slot  = block?.paramSlots[slotIndex];
    if (!block || !slot) return;
    if (!slot.queryBlockId) {
      perform(setSocketText(blockId, slotIndex, slot.textValue, null));
      return;
    }
    const def = tryGetDefinition(block.definitionId);
    const pos = layout.get(blockId) ?? block;
    const right = pos.x + (def ? getBlockWidth(def, block.paramSlots, state.blocks) : 0) + 24;
    perform(moveChain(state, slot.queryBlockId, { x: right, y: pos.y }, null));
  }, [layout, perform]);

  /**
   * The Packages tab changed the dependencies: one user action that also removes the blocks of removed packages
   * (a version update keeps the blocks; its blocks are loaded from the new version).
   */
  const handleDependenciesChange = useCallback((to: PackageRef[]) => {
    const state = stateRef.current;
    const kept = new Set(to.map(packageKey));
    const removedPackageIds = new Set(state.dependencies.filter(d => !kept.has(packageKey(d))).map(dependencyPackageId));
    const removedIds = [...state.blocks.values()]
      .filter(block => removedPackageIds.has(getBlockPackageId(block.definitionId) ?? ''))
      .map(block => block.instanceId);
    perform(changeDependencies(state, to, removedIds));
  }, [perform]);

  const changeTheme = useCallback((t: Theme) => {
    setTheme(t);
    if (!themeId) writeSetting('cardcq-theme', t.id);
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

    // Where the block is drawn; only a root's stored x,y is its position.
    const { x: blockX, y: blockY } = layout.get(instanceId) ?? block;

    const offsetX = svgX - blockX;
    const offsetY = svgY - blockY;

    const def   = tryGetDefinition(block.definitionId);
    // A query is dragged alone; any other block takes the blocks below it along (out of a mouth too).
    const chain = def?.blockType === 'query' ? [instanceId] : collectChain(instanceId, blocks);

    // Nothing changes until the drop: the chain stays where it is (faded) while its ghost follows the pointer.
    dragRef.current = {
      type: 'canvas', defId: block.definitionId, instanceId,
      carriedIds: chain, offsetX, offsetY,
      startClientX: e.clientX, startClientY: e.clientY,
      moved: false,
    };
    // The lead is faded; the blocks hanging off it are drawn inside it and fade with it.
    setDraggingIds(new Set([instanceId]));
    setGhostPos({ x: e.clientX - offsetX, y: e.clientY - offsetY, defId: block.definitionId, instanceId });
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [blocks, layout, toSVG]);

  // ── Global pointer events ────────────────────────────────────────────────────

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      let started = false;
      if (!drag.moved && (Math.abs(e.clientX - drag.startClientX) > 4 || Math.abs(e.clientY - drag.startClientY) > 4)) {
        drag.moved = true;
        started = true;
      }
      if (!drag.moved) return;
      setGhostPos({
        x: e.clientX - drag.offsetX, y: e.clientY - drag.offsetY, defId: drag.defId, instanceId: drag.instanceId,
      });

      // Presence: the ghost's top-left in canvas coordinates (sent at once when the drag starts).
      const at = toSVG(e.clientX - drag.offsetX, e.clientY - drag.offsetY);
      const dragPresence = drag.type === 'canvas'
        ? { drag: { leadId: drag.instanceId!, at }, cursor: toSVG(e.clientX, e.clientY) }
        : { drag: { definitionId: drag.defId, at }, cursor: toSVG(e.clientX, e.clientY) };
      if (started) publisherRef.current?.updateNow(dragPresence);
      else publisherRef.current?.update(dragPresence);

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
      publisherRef.current?.updateNow({ drag: null });

      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      const state = stateRef.current;

      // ── Delete: canvas block dropped over the palette ────────────────────────
      if (drag.type === 'canvas' && e.clientX < canvasRect.left) {
        perform(deleteChain(state, drag.instanceId!));
        return;
      }

      const dropX = e.clientX - drag.offsetX - canvasRect.left;
      const dropY = e.clientY - drag.offsetY - canvasRect.top;
      const def   = getDefinition(drag.defId);
      const leadId = drag.type === 'canvas' ? drag.instanceId! : null;
      // Never snap into the carried blocks or anything they hold.
      const carried = new Set(leadId ? fragmentOf(state.blocks, leadId) : []);

      let place: Place | null = null;
      if (def.blockType === 'query') {
        const socketSnap = findSocketSnap(dropX, dropY, drag.defId, leadId, carried);
        if (socketSnap) place = { socket: socketSnap.blockId, slot: socketSnap.slotIndex };
      } else {
        const snap = findSnapTarget(dropX, dropY, drag.defId, leadId, carried);
        if (snap) place = snapPlace(snap);
      }

      if (drag.type === 'palette') {
        if (e.clientX < canvasRect.left || e.clientX > canvasRect.right ||
            e.clientY < canvasRect.top  || e.clientY > canvasRect.bottom) return;

        // Enforce one instance per event (start) block.
        if (def.blockType === 'start') {
          const alreadyPlaced = [...state.blocks.values()].some(block => block.definitionId === drag.defId);
          if (alreadyPlaced) return;
        }

        perform(placeNewBlock(state, createBlock(drag.defId, dropX, dropY), { x: dropX, y: dropY }, place));
      } else {
        perform(moveChain(state, leadId!, { x: dropX, y: dropY }, place));
      }
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [findSnapTarget, findSocketSnap, perform, toSVG]);

  // ── Cursor presence and export ───────────────────────────────────────────────

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragRef.current?.moved) return;   // a drag publishes its own cursor
    publisherRef.current?.update({ cursor: toSVG(e.clientX, e.clientY) });
  }, [toSVG]);

  const handleCanvasPointerLeave = useCallback(() => {
    if (dragRef.current?.moved) return;
    publisherRef.current?.updateNow({ cursor: null });
  }, []);

  const handleExport = useCallback((writer: ScriptWriter) => {
    const script = writer.write(toProgram(stateRef.current, tryGetDefinition));
    if (onExport) {
      onExport(script, writer);
      return;
    }
    const url = URL.createObjectURL(new Blob([script], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `behavior.${writer.fileExtension}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [onExport]);

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
    {/* Capture phase: blocks stop pointer-down from bubbling. */}
    <div style={outerStyle} onPointerDownCapture={activate} onFocusCapture={activate}>
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
          packages={maintainsPackages && (onDependenciesChange || commandChannel) ? {
            available:      availablePackages ?? [],
            dependencies:   canvas.dependencies,
            onChange:       handleDependenciesChange,
            actions:        packageActions,
            blockCounts:    countBlocksByPackage(blocks),
            conflictCounts: new Map(loadedPackages
              .filter(lp => lp.info.id.startsWith(DEPENDENCY_PREFIX))
              .map(lp => [lp.info.name, lp.conflictIds.length])),
          } : undefined}
          placedStartIds={placedStartIds}
        />
        <div
          style={{ flex: 1, minWidth: 0, display: 'flex', position: 'relative' }}
          onPointerMove={handleCanvasPointerMove}
          onPointerLeave={handleCanvasPointerLeave}
        >
          <Canvas
            ref={canvasRef}
            blocks={blocks}
            draggingIds={draggingIds}
            provisionalIds={provisionalIds}
            onBlockPointerDown={handleBlockPointerDown}
            onBlockClick={handleBlockClick}
            onSocketClick={handleSocketClick}
            editingSocket={editingSocket}
            onSocketInput={handleSocketInput}
            onSocketCommit={handleSocketCommit}
            onSocketCancelEdit={handleSocketCancelEdit}
            onParamRemove={handleParamRemove}
            onOutputDrag={handlePalettePointerDown}
            overlay={peers.length > 0 ? <PeersOverlay peers={peers} blocks={blocks} layout={layout} /> : null}
          />
          <UndoRedoBar
            canUndo={canUndoRedo(sync) && sync.undo.length > 0}
            canRedo={canUndoRedo(sync) && sync.redo.length > 0}
            onUndo={undo}
            onRedo={redo}
            notice={notice}
            extra={scriptWriters && scriptWriters.length > 0 ? <ExportMenu writers={scriptWriters} onExport={handleExport} /> : null}
          />
        </div>
      </div>
      <DragGhost ghostPos={ghostPos} blocks={blocks} />
    </div>
    </ThemeContext.Provider>
  );
}
