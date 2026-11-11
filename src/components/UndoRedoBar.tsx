import type React from 'react';
import { useTheme } from '../ThemeContext';

/** Undo and redo buttons over the canvas's top-right corner, with a short notice (e.g. a step that couldn't be undone). */
export default function UndoRedoBar({ canUndo, canRedo, onUndo, onRedo, notice, extra }: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  notice: string | null;
  /** More controls before the buttons (e.g. the Export menu). */
  extra?: React.ReactNode;
}) {
  const theme = useTheme();
  const button = (enabled: boolean): React.CSSProperties => ({
    width: 28, height: 24, padding: 0,
    background: theme.paletteBg, color: enabled ? theme.textPrimary : theme.textMuted,
    border: `1px solid ${theme.border}`, borderRadius: 4,
    fontSize: 14, lineHeight: 1, cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.5,
  });
  return (
    <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
      {notice && (
        <span style={{
          fontSize: 11, color: theme.textPrimary, background: theme.paletteBg,
          border: `1px solid ${theme.accent}`, borderRadius: 4, padding: '3px 8px',
        }}>
          {notice}
        </span>
      )}
      {extra && <div style={{ pointerEvents: 'auto' }}>{extra}</div>}
      <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={onUndo}
        style={{ ...button(canUndo), pointerEvents: 'auto' }}>↶</button>
      <button type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={onRedo}
        style={{ ...button(canRedo), pointerEvents: 'auto' }}>↷</button>
    </div>
  );
}
