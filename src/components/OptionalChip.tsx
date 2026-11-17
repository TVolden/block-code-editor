import { chipLabel } from '../utils/blockLayout';
import { useTheme } from '../ThemeContext';

/** An optional parameter that isn't added: a small dashed `+ name` chip, `w` × `h`, in the socket's place. */
export function OptionalChip({ name, w, h }: { name: string; w: number; h: number }) {
  const theme = useTheme();
  return (
    <>
      <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={(h - 1) / 2}
        fill="transparent" stroke={theme.textMuted} strokeWidth={1} strokeDasharray="3,2" />
      <text x={w / 2} y={h / 2 + 3} textAnchor="middle"
        fill={theme.textMuted} fontSize={9} fontFamily="sans-serif"
        style={{ userSelect: 'none', pointerEvents: 'none' }}>
        {chipLabel(name)}
      </text>
    </>
  );
}

const REMOVE_R = 5;

/** The `×` at the top-right corner of an added optional parameter (`w` wide), which leaves it out again. */
export function RemoveParamButton({ w, title, onRemove }: { w: number; title: string; onRemove: () => void }) {
  const theme = useTheme();
  return (
    <g
      transform={`translate(${w - 2},${-1})`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      style={{ cursor: 'pointer' }}
    >
      <title>{title}</title>
      <circle r={REMOVE_R} fill={theme.blockBody} stroke={theme.textMuted} strokeWidth={1} />
      <path d={`M -2 -2 L 2 2 M 2 -2 L -2 2`} stroke={theme.blockText} strokeWidth={1.2} strokeLinecap="round" />
    </g>
  );
}
