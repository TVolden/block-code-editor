import { useState } from 'react';
import type React from 'react';
import type { CatalogPackage, PackageAction, PackageRef } from '../types';
import { compareVersions, packageKey, runPackageAction } from '../utils/packages';
import { useTheme } from '../ThemeContext';

export interface PackagesTabProps {
  /** Packages that may be added (the caller decides which: e.g. only those usable here). */
  available: CatalogPackage[];
  /** The chosen packages. */
  dependencies: PackageRef[];
  onChange: (dependencies: PackageRef[]) => void;
  /** Extra buttons below the add row. */
  actions?: PackageAction[];
  /** Blocks on the canvas per chosen package, by `packageKey`. */
  blockCounts: Map<string, number>;
  /** Blocks of a chosen package skipped because another package already defines their id, by `packageKey`. */
  conflictCounts: Map<string, number>;
}

/**
 * The chosen packages of a canvas, maintained by the user: adding pins the listed version (a specific version is an
 * advanced option), a badge offers a newer listed version, and removing asks first, because the package's blocks are
 * deleted from the canvas. Versions are never updated automatically.
 */
export default function PackagesTab({ available, dependencies, onChange, actions, blockCounts, conflictCounts }: PackagesTabProps) {
  const theme = useTheme();
  const [selected, setSelected]           = useState('');
  const [customVersion, setCustomVersion] = useState('');
  const [advanced, setAdvanced]           = useState(false);
  /** Package awaiting removal confirmation. */
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const listed     = new Map(available.map(p => [packageKey(p), p]));
  const chosenKeys = new Set(dependencies.map(packageKey));
  const addable    = available.filter(p => !chosenKeys.has(packageKey(p)));

  function add() {
    const pkg = listed.get(selected);
    if (!pkg) return;
    const version = advanced && customVersion.trim() ? customVersion.trim() : pkg.version;
    onChange([...dependencies, { publisher: pkg.publisher, name: pkg.name, version }]);
    setSelected('');
    setCustomVersion('');
  }

  function remove(key: string) {
    onChange(dependencies.filter(d => packageKey(d) !== key));
    setConfirmRemove(null);
  }

  function update(key: string, version: string) {
    onChange(dependencies.map(d => (packageKey(d) === key ? { ...d, version } : d)));
  }

  const field: React.CSSProperties = {
    background: theme.inputBg, color: theme.textPrimary,
    border: `1px solid ${theme.inputBorder}`, borderRadius: 4,
    fontSize: 11, padding: '4px 6px', outline: 'none', minWidth: 0,
  };
  const button: React.CSSProperties = {
    background: 'none', color: theme.textSecondary,
    border: `1px solid ${theme.border}`, borderRadius: 4,
    fontSize: 11, padding: '4px 8px', cursor: 'pointer',
  };
  const confirmCount = confirmRemove ? blockCounts.get(confirmRemove) ?? 0 : 0;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {dependencies.length === 0 && (
        <div style={{ color: theme.textMuted, fontSize: 11, fontStyle: 'italic' }}>
          No packages yet — add one to get blocks.
        </div>
      )}

      {confirmRemove && (
        <div style={{
          border: `1px solid ${theme.deleteActiveBorder}`, background: theme.deleteActiveBg,
          borderRadius: 4, padding: '6px 8px', fontSize: 11, color: theme.textPrimary,
        }}>
          Remove <b>{confirmRemove}</b>?{' '}
          {confirmCount > 0
            ? `Its ${confirmCount} block${confirmCount === 1 ? '' : 's'} on the canvas ${confirmCount === 1 ? 'is' : 'are'} deleted.`
            : 'None of its blocks are on the canvas.'}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button type="button" onClick={() => remove(confirmRemove)}
              style={{ ...button, background: theme.deleteActiveBorder, color: 'white', borderColor: theme.deleteActiveBorder }}>
              Remove
            </button>
            <button type="button" onClick={() => setConfirmRemove(null)} style={button}>Cancel</button>
          </div>
        </div>
      )}

      {dependencies.map(dep => {
        const key       = packageKey(dep);
        const pkg       = listed.get(key);
        const newer     = pkg && compareVersions(pkg.version, dep.version) > 0 ? pkg.version : null;
        const conflicts = conflictCounts.get(key) ?? 0;
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span aria-hidden style={{ width: 9, height: 9, flexShrink: 0, background: pkg?.color ?? theme.border }} />
            <span title={pkg?.description} style={{
              color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {key}
            </span>
            <span style={{ color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>{dep.version}</span>
            {conflicts > 0 && (
              <span title={`${conflicts} block ID(s) skipped: another package already defines them`}
                style={{ fontSize: 9, color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 3, padding: '0 3px' }}>
                ⚠ {conflicts}
              </span>
            )}
            {newer && (
              <button type="button" onClick={() => update(key, newer)}
                title={`Version ${newer} is available. Click to update.`}
                style={{ ...button, padding: '0 5px', fontSize: 10, color: theme.accent, borderColor: theme.accent }}>
                {newer} available
              </button>
            )}
            <button type="button" onClick={() => setConfirmRemove(key)} title="Remove package"
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: theme.textMuted, fontSize: 15, lineHeight: 1, cursor: 'pointer' }}>
              ×
            </button>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <select value={selected} onChange={e => setSelected(e.target.value)} style={{ ...field, flex: 1 }}>
          <option value="">{addable.length ? 'Add package…' : 'No more packages'}</option>
          {addable.map(p => (
            <option key={packageKey(p)} value={packageKey(p)}>{packageKey(p)} {p.version}</option>
          ))}
        </select>
        {advanced && (
          <input value={customVersion} onChange={e => setCustomVersion(e.target.value)}
            placeholder={listed.get(selected)?.version ?? 'version'} style={{ ...field, width: 64 }} />
        )}
        <button type="button" onClick={add} disabled={!selected}
          style={{ ...button, opacity: selected ? 1 : 0.4, cursor: selected ? 'pointer' : 'default' }}>
          Add
        </button>
      </div>

      {actions && actions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {actions.map(action => (
            <button key={action.label} type="button" onClick={() => runPackageAction(action, dependencies, onChange)} title={action.title} style={button}>
              {action.label}
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setAdvanced(a => !a)}
        style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: theme.textMuted, fontSize: 10, cursor: 'pointer' }}>
        {advanced ? 'Hide version choice' : 'Choose a specific version…'}
      </button>
    </div>
  );
}
