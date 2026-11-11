import { useState } from 'react';
import type { ReactNode } from 'react';
import BlockEditor from '../editor/BlockEditor';
import type { Collaboration } from '../collaboration/types';
import { useTheme } from '../ThemeContext';
import { LocalServer } from './LocalServer';
import { pythonWriter } from './pythonWriter';
import { DEMO_PACKAGES, demoPackageBlocksUrl } from '../demoPackages';

const USERS = [
  { id: 'ann', name: 'Ann', color: '#e0533d' },
  { id: 'bo',  name: 'Bo',  color: '#3d8be0' },
];

/**
 * Two editors on one in-memory server: every action goes through the server (with a delay, so pending actions show),
 * and each editor shows the other's cursor, drags and typing.
 */
export default function MultiplayerDemo({ navTabs }: { navTabs: ReactNode }) {
  const theme = useTheme();
  const [server] = useState(() => new LocalServer({ blocks: new Map(), dependencies: [] }, 400));
  const [collaborations] = useState<Collaboration[]>(() => USERS.map(user => {
    const { commands, presence } = server.connect(user.id, user.name, user.color);
    return { clientId: user.id, commands, presence };
  }));
  const [delay, setDelay] = useState(server.delay);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, height: 38, padding: '0 14px', flexShrink: 0,
        background: theme.titleBg, borderBottom: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 11,
      }}>
        <span style={{ color: theme.titlePrimaryText, fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>MULTIPLAYER DEMO</span>
        {navTabs}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          Server delay
          <input type="range" min={0} max={2000} step={100} value={delay}
            onChange={e => { const ms = Number(e.target.value); server.setDelay(ms); setDelay(ms); }} />
          <span style={{ width: 52 }}>{delay} ms</span>
        </label>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 2, background: theme.border }}>
        {USERS.map((user, i) => (
          <div key={user.id} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: theme.appBg }}>
            <div style={{ padding: '4px 10px', fontSize: 11, color: user.color, fontWeight: 'bold', borderBottom: `2px solid ${user.color}` }}>
              {user.name}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <BlockEditor
                blocksUrl="/blocks.json"
                hideTitleBar
                themeId={theme.id}
                collaboration={collaborations[i]}
                packageBlocksUrl={demoPackageBlocksUrl}
                availablePackages={DEMO_PACKAGES}
                scriptWriters={[pythonWriter]}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
