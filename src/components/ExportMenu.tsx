import { useState } from 'react';
import type { ScriptWriter } from '../export/program';
import { useTheme } from '../ThemeContext';

/** An Export button with a menu of the script writers. */
export default function ExportMenu({ writers, onExport }: {
  writers: ScriptWriter[];
  onExport: (writer: ScriptWriter) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{
          height: 24, padding: '0 8px', fontSize: 11,
          background: theme.paletteBg, color: theme.textPrimary,
          border: `1px solid ${theme.border}`, borderRadius: 4, cursor: 'pointer',
        }}>
        Export ▾
      </button>
      {open && (
        <div role="menu" style={{
          position: 'absolute', top: 28, right: 0, minWidth: 120, zIndex: 10,
          background: theme.paletteBg, border: `1px solid ${theme.border}`, borderRadius: 4, padding: 3,
        }}>
          {writers.map(writer => (
            <button key={writer.id} type="button" role="menuitem"
              onClick={() => { setOpen(false); onExport(writer); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '4px 8px', fontSize: 11,
                background: 'none', border: 'none', color: theme.textPrimary, cursor: 'pointer',
              }}>
              {writer.label} <span style={{ color: theme.textMuted }}>.{writer.fileExtension}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
