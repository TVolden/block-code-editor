import { useTheme } from '../ThemeContext';
import { THEMES } from '../theme';
import type { Theme } from '../theme';

interface Props {
  onSelect: (t: Theme) => void;
}

export default function ThemeSwitcher({ onSelect }: Props) {
  const theme = useTheme();
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {THEMES.map(t => (
        <button key={t.id} onClick={() => onSelect(t)} style={{
          background: theme.id === t.id ? theme.switcherActiveBg : theme.switcherBg,
          border: `1px solid ${theme.switcherBorder}`,
          borderRadius: 4, padding: '2px 9px',
          color: theme.id === t.id ? theme.switcherActiveText : theme.switcherText,
          fontSize: 10, fontWeight: theme.id === t.id ? 'bold' : 'normal',
          letterSpacing: 0.5, cursor: 'pointer',
          transition: 'color 0.1s, background 0.1s',
        }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
