import React from 'react';
import type { CardDesign, CardElement, CardMeta } from './cardDesignTypes';
import { CARD_W, CARD_H, CARD_RX, SVG_PAD, interpolateMeta } from './cardDesignTypes';

const VW = CARD_W + 2 * SVG_PAD;
const VH = CARD_H + 2 * SVG_PAD;

interface Props {
  design: CardDesign;
  /** Unique string used to scope SVG filter/clip IDs — pass the card's id. */
  uid: string;
  style?: React.CSSProperties;
  className?: string;
}

export default function CardPreview({ design, uid, style, className }: Props) {
  const filterId = `cp-shadow-${uid}`;
  const clipId   = `cp-clip-${uid}`;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', ...style }}
      className={className}
    >
      <defs>
        <filter id={filterId} x="-30%" y="-20%" width="160%" height="150%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="rgba(0,0,0,0.55)" />
        </filter>
        <clipPath id={clipId}>
          <rect x={SVG_PAD} y={SVG_PAD} width={CARD_W} height={CARD_H} rx={CARD_RX} />
        </clipPath>
      </defs>

      {/* Card base */}
      <rect
        x={SVG_PAD} y={SVG_PAD} width={CARD_W} height={CARD_H} rx={CARD_RX}
        fill={design.background.color}
        filter={`url(#${filterId})`}
      />

      {/* Optional background image */}
      {design.background.imageUrl && (
        <image
          href={design.background.imageUrl}
          x={SVG_PAD} y={SVG_PAD} width={CARD_W} height={CARD_H}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      )}

      {/* Design elements */}
      <g clipPath={`url(#${clipId})`}>
        {design.elements.map((el, i) => (
          <StaticEl key={el.id ?? i} el={el} meta={design.meta} />
        ))}
      </g>

      {/* Card border on top */}
      <rect
        x={SVG_PAD} y={SVG_PAD} width={CARD_W} height={CARD_H} rx={CARD_RX}
        fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth={1.5}
        pointerEvents="none"
      />
    </svg>
  );
}

function StaticEl({ el, meta }: { el: CardElement; meta: CardMeta }) {
  if (el.type === 'rectangle') {
    return (
      <rect
        x={SVG_PAD + el.x} y={SVG_PAD + el.y} width={el.w} height={el.h}
        rx={el.rx} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth}
      />
    );
  }

  if (el.type === 'circle') {
    return (
      <ellipse
        cx={SVG_PAD + el.x + el.w / 2} cy={SVG_PAD + el.y + el.h / 2}
        rx={el.w / 2} ry={el.h / 2}
        fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth}
      />
    );
  }

  if (el.type === 'image') {
    return (
      <image
        href={el.src}
        x={SVG_PAD + el.x} y={SVG_PAD + el.y} width={el.w} height={el.h}
        preserveAspectRatio="xMidYMid slice"
      />
    );
  }

  if (el.type === 'text') {
    return (
      <foreignObject
        x={SVG_PAD + el.x} y={SVG_PAD + el.y} width={el.w} height={el.h}
        style={{ overflow: 'visible' }}
      >
        <div style={{
          width: '100%', height: '100%', overflow: 'hidden',
          fontSize: `${el.fontSize}px`,
          fontWeight: el.fontWeight,
          fontStyle: el.fontStyle,
          color: el.color,
          textAlign: el.align,
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
