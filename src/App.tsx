import { useState, useMemo } from 'react';
import BlockEditor from './editor/BlockEditor';
import Console from './components/Console';
import CardDesigner from './carddesigner/CardDesigner';
import { ThemeContext } from './ThemeContext';
import { darkTheme, THEMES } from './theme';
import type { Theme } from './theme';
import './App.css';

type Page = 'block-editor' | 'card-designer';

const PAGES: { id: Page; label: string }[] = [
  { id: 'block-editor',  label: 'Behavior Editor' },
  { id: 'card-designer', label: 'Card Designer'   },
];

export default function App() {
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [page, setPage] = useState<Page>('block-editor');

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('cardcq-theme');
    return THEMES.find(t => t.id === saved) ?? darkTheme;
  });

  function handleRun(lines: string[]) {
    setConsoleLines(prev => [...prev, '\u2500\u2500\u2500 Run \u2500\u2500\u2500', ...lines]);
  }

  function handleThemeChange(t: Theme) {
    localStorage.setItem('cardcq-theme', t.id);
    setTheme(t);
  }

  const navTabs = useMemo(() => (
    <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
      {PAGES.map(p => {
        const active = page === p.id;
        return (
          <button key={p.id} onClick={() => setPage(p.id)} style={{
            background: active ? theme.switcherActiveBg : theme.switcherBg,
            border: `1px solid ${active ? theme.accent : theme.switcherBorder}`,
            borderRadius: 4, padding: '2px 10px',
            color: active ? theme.accent : theme.switcherText,
            fontSize: 10, fontWeight: active ? 600 : 400,
            letterSpacing: 0.5, cursor: 'pointer', transition: 'color 0.1s, background 0.1s',
          }}>
            {p.label}
          </button>
        );
      })}
    </div>
  ), [page, theme]);

  return (
    <ThemeContext.Provider value={theme}>
      <div className="app-root" style={{ background: theme.appBg }}>

        {page === 'block-editor' && (
          <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <BlockEditor
              blocksUrl="/blocks.json"
              onRun={handleRun}
              onThemeChange={handleThemeChange}
              navTabs={navTabs}
            />
            <Console lines={consoleLines} onClear={() => setConsoleLines([])} />
          </div>
        )}

        {page === 'card-designer' && (
          <CardDesigner onThemeChange={handleThemeChange} navTabs={navTabs} />
        )}

      </div>
    </ThemeContext.Provider>
  );
}
