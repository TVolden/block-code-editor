import { useState } from 'react';
import { useTheme } from '../ThemeContext';

interface Props {
  lines: string[];
  onClear: () => void;
}

export default function Console({ lines, onClear }: Props) {
  const theme = useTheme();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div style={{
      height: collapsed ? 'auto' : 150,
      backgroundColor: theme.consoleBg,
      borderTop: `1px solid ${theme.border}`,
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
      fontSize: 12,
      flexShrink: 0,
    }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 12px',
          borderBottom: collapsed ? 'none' : `1px solid ${theme.border}`,
          background: theme.consoleHeaderBg,
          flexShrink: 0,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: theme.textMuted, fontSize: 8, lineHeight: 1, opacity: 0.6 }}>
            {collapsed ? '▶' : '▼'}
          </span>
          <span style={{ color: theme.textMuted, fontWeight: 'bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            Output
          </span>
          {collapsed && lines.length > 0 && (
            <span style={{ color: theme.textMuted, fontSize: 9, opacity: 0.6 }}>
              ({lines.length} line{lines.length !== 1 ? 's' : ''})
            </span>
          )}
        </span>
        {!collapsed && (
          <button
            onClick={e => { e.stopPropagation(); onClear(); }}
            style={{
              background: 'none', border: `1px solid ${theme.border}`, color: theme.textMuted,
              cursor: 'pointer', padding: '1px 8px', borderRadius: 3, fontSize: 10, letterSpacing: 0.5,
            }}
          >
            Clear
          </button>
        )}
      </div>
      {!collapsed && (
        <div style={{
          flex: 1, overflowY: 'auto', padding: '6px 12px',
          display: 'flex', flexDirection: 'column', gap: 1,
        }}>
          {lines.length === 0
            ? <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Click a block chain to run it…</span>
            : lines.map((line, i) => (
                <div key={i} style={{ color: line.startsWith('\u2500') ? theme.consoleSeparator : theme.consoleOutput, whiteSpace: 'pre' }}>
                  {line}
                </div>
              ))}
        </div>
      )}
    </div>
  );
}
