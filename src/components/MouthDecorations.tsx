import type { MouthInfo } from '../utils/blockLayout';
import { MOUTH_DIVIDER_H, socketTitle } from '../utils/blockLayout';
import { COMMAND_PARAM_TYPE } from '../types';
import { useTheme } from '../ThemeContext';

/** Outline colour of an empty mouth (the same amber as other "needs attention" placeholders). */
const EMPTY_MOUTH_STROKE = '#c08820';

/**
 * What a C-block draws around its mouths: each divider bar's parameter name, and a dashed placeholder with the
 * parameter's name in every empty mouth. Both show the parameter's name and type on hover (pressing them drags the
 * block, as they are part of it). The chains in the mouths are drawn by the caller.
 */
export function MouthDecorations({ mouths, w, isEmpty }: {
  mouths: MouthInfo[];
  /** The block's width, which the divider bars span. */
  w: number;
  /** Whether the mouth of the parameter at this index holds no chain. */
  isEmpty: (index: number) => boolean;
}) {
  const theme = useTheme();
  return (
    <g style={{ pointerEvents: 'none' }}>
      {mouths.map(mouth => (
        <g key={mouth.index}>
          {mouth.dividerY !== null && (
            <g style={{ pointerEvents: 'all' }}>
              <title>{socketTitle(mouth.name, COMMAND_PARAM_TYPE)}</title>
              <rect x={0} y={mouth.dividerY} width={w} height={MOUTH_DIVIDER_H} fill="transparent" />
              <text x={11} y={mouth.dividerY + MOUTH_DIVIDER_H / 2 + 4}
                fill={theme.blockText} fontSize={10} fontWeight="bold" fontFamily="sans-serif"
                style={{ userSelect: 'none' }}>
                {mouth.name}
              </text>
            </g>
          )}
          {isEmpty(mouth.index) && (
            <g style={{ pointerEvents: 'all' }}>
              <title>{socketTitle(mouth.name, COMMAND_PARAM_TYPE)}</title>
              <rect x={mouth.x + 3} y={mouth.y + 3} width={Math.max(60, mouth.name.length * 6 + 20)} height={mouth.h - 6}
                rx={3} fill="transparent" stroke={EMPTY_MOUTH_STROKE} strokeWidth={1} strokeDasharray="4,3" />
              <text x={mouth.x + 10} y={mouth.y + mouth.h / 2 + 3}
                fill={theme.textMuted} fontSize={9} fontFamily="sans-serif" fontStyle="italic"
                style={{ userSelect: 'none' }}>
                {mouth.name}
              </text>
            </g>
          )}
        </g>
      ))}
    </g>
  );
}
