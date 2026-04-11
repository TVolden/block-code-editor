import React, { useRef } from 'react';
import type { CardDesign, CardElement, CardMeta } from './cardDesignTypes';
import { CARD_W, CARD_H, CARD_RX, SVG_PAD, interpolateMeta } from './cardDesignTypes';

const HANDLE_SZ = 8;
type HandleKind = 'nw' | 'ne' | 'sw' | 'se';

type DragState =
  | { kind: 'move'; id: string; ox: number; oy: number }
  | {
      kind: 'resize'; id: string; handle: HandleKind;
      startX: number; startY: number; startW: number; startH: number;
      px0: number; py0: number;
    };

interface Props {
  design: CardDesign;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, x: number, y: number, w: number, h: number) => void;
}

const VW = CARD_W + 2 * SVG_PAD;
const VH = CARD_H + 2 * SVG_PAD;

export default function CardCanvas({ design, selectedId, onSelect, onMove, onResize }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  /** Convert a client pointer position to card-local coordinates. */
  function toCard(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: svgPt.x - SVG_PAD, y: svgPt.y - SVG_PAD };
  }

  function startMove(e: React.PointerEvent, el: CardElement) {
    e.stopPropagation();
    onSelect(el.id);
    const { x, y } = toCard(e);
    dragRef.current = { kind: 'move', id: el.id, ox: x - el.x, oy: y - el.y };
    svgRef.current!.setPointerCapture(e.pointerId);
  }

  function startResize(e: React.PointerEvent, el: CardElement, handle: HandleKind) {
    e.stopPropagation();
    const { x, y } = toCard(e);
    dragRef.current = {
      kind: 'resize', id: el.id, handle,
      startX: el.x, startY: el.y, startW: el.w, startH: el.h,
      px0: x, py0: y,
    };
    svgRef.current!.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = toCard(e);

    if (d.kind === 'move') {
      onMove(d.id, Math.round(x - d.ox), Math.round(y - d.oy));
      return;
    }

    // resize
    const dx = x - d.px0, dy = y - d.py0;
    const MIN = 20;
    let { startX: nx, startY: ny, startW: nw, startH: nh } = d;
    if (d.handle === 'nw') {
      const ddx = Math.min(dx, nw - MIN), ddy = Math.min(dy, nh - MIN);
      nx += ddx; ny += ddy; nw -= ddx; nh -= ddy;
    } else if (d.handle === 'ne') {
      const ddy = Math.min(dy, nh - MIN);
      ny += ddy; nh -= ddy; nw = Math.max(MIN, nw + dx);
    } else if (d.handle === 'sw') {
      const ddx = Math.min(dx, nw - MIN);
      nx += ddx; nw -= ddx; nh = Math.max(MIN, nh + dy);
    } else {
      nw = Math.max(MIN, nw + dx); nh = Math.max(MIN, nh + dy);
    }
    onResize(d.id, Math.round(nx), Math.round(ny), Math.round(nw), Math.round(nh));
  }

  function onPointerUp() { dragRef.current = null; }

  const sel = design.elements.find(el => el.id === selectedId) ?? null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerDown={() => onSelect(null)}
    >
      <defs>
        <filter id="cd-shadow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="rgba(0,0,0,0.65)" />
        </filter>
        <clipPath id="cd-clip">
          <rect x={SVG_PAD} y={SVG_PAD}width={CARD_W} height={CARD_H} rx={CARD_RX} />
        </clipPath>
      </defs>

      {/* Card base colour */}
      <rect x={SVG_PAD} y={SVG_PAD}width={CARD_W} height={CARD_H} rx={CARD_RX}
        fill={design.background.color} filter="url(#cd-shadow)" />

      {/* Optional background image */}
      {design.background.imageUrl && (
        <image href={design.background.imageUrl}
          x={SVG_PAD} y={SVG_PAD}width={CARD_W} height={CARD_H}
          clipPath="url(#cd-clip)" preserveAspectRatio="xMidYMid slice" />
      )}

      {/* Design elements — clipped to card shape */}
      <g clipPath="url(#cd-clip)">
        {design.elements.map(el => (
          <ElNode key={el.id} el={el} meta={design.meta} onDown={startMove} />
        ))}
      </g>

      {/* Selection outline + resize handles (intentionally outside clip) */}
      {sel && (
        <>
          <rect
            x={SVG_PAD + sel.x - 1} y={SVG_PAD + sel.y - 1}
            width={sel.w + 2} height={sel.h + 2}
            fill="none" stroke="#4a9eff" strokeWidth={1.5} strokeDasharray="4 2"
            pointerEvents="none"
          />
          {(['nw', 'ne', 'sw', 'se'] as HandleKind[]).map(h => {
            const hx = SVG_PAD + sel.x + (h.includes('e') ? sel.w : 0);
            const hy = SVG_PAD + sel.y + (h.includes('s') ? sel.h : 0);
            return (
              <rect key={h}
                x={hx - HANDLE_SZ / 2} y={hy - HANDLE_SZ / 2}
                width={HANDLE_SZ} height={HANDLE_SZ}
                fill="white" stroke="#4a9eff" strokeWidth={1.5}
                style={{ cursor: `${h}-resize` }}
                onPointerDown={e => { e.stopPropagation(); startResize(e, sel, h); }}
              />
            );
          })}
        </>
      )}

      {/* Card border drawn on top so it's always crisp */}
      <rect x={SVG_PAD} y={SVG_PAD}width={CARD_W} height={CARD_H} rx={CARD_RX}
        fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth={1.5}
        pointerEvents="none" />
    </svg>
  );
}

// ── Per-element renderer ───────────────────────────────────────────────────────

function ElNode({ el, meta, onDown }: {
  el: CardElement;
  meta: CardMeta;
  onDown: (e: React.PointerEvent, el: CardElement) => void;
}) {
  const down = (e: React.PointerEvent) => onDown(e, el);

  if (el.type === 'rectangle') {
    return (
      <rect
        x={SVG_PAD + el.x} y={SVG_PAD + el.y} width={el.w} height={el.h}
        rx={el.rx} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth}
        style={{ cursor: 'move' }} onPointerDown={down}
      />
    );
  }

  if (el.type === 'circle') {
    return (
      <ellipse
        cx={SVG_PAD + el.x + el.w / 2} cy={SVG_PAD + el.y + el.h / 2}
        rx={el.w / 2} ry={el.h / 2}
        fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth}
        style={{ cursor: 'move' }} onPointerDown={down}
      />
    );
  }

  if (el.type === 'image') {
    return (
      <image
        href={el.src}
        x={SVG_PAD + el.x} y={SVG_PAD + el.y} width={el.w} height={el.h}
        preserveAspectRatio="xMidYMid slice"
        style={{ cursor: 'move' }} onPointerDown={down}
      />
    );
  }

  if (el.type === 'text') {
    return (
      <foreignObject
        x={SVG_PAD + el.x} y={SVG_PAD + el.y} width={el.w} height={el.h}
        style={{ cursor: 'move', overflow: 'visible' }} onPointerDown={down}
      >
        <div style={{
          width: '100%', height: '100%', overflow: 'hidden',
          fontSize: `${el.fontSize}px`,
          fontWeight: el.fontWeight,
          fontStyle: el.fontStyle,
          color: el.color,
          textAlign: el.align,
          userSelect: 'none',
          lineHeight: 1.35,
          boxSizing: 'border-box',
          padding: '2px 4px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {interpolateMeta(el.content, meta)}
        </div>
      </foreignObject>
    );
  }

  return null;
}
