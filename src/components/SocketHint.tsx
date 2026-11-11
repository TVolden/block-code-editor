import type { ParamType } from '../types';
import { fitLabel } from '../utils/blockLayout';
import { useTheme } from '../ThemeContext';

/**
 * The name of an empty socket's parameter, centred in the socket and cut to fit. The type is on hover (the socket's
 * title): primitive types are told apart by the socket's shape.
 */
export function SocketHint({ name, type, w, h }: { name: string; type: ParamType; w: number; h: number }) {
  const theme = useTheme();
  return (
    <text x={w / 2} y={h / 2 + 3} textAnchor="middle"
      fill={theme.textMuted} fontSize={9} fontFamily="sans-serif" fontStyle="italic"
      style={{ userSelect: 'none', pointerEvents: 'none' }}>
      {fitLabel(name, type, w)}
    </text>
  );
}
