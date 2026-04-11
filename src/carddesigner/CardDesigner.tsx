import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../ThemeContext';
import type { Theme } from '../theme';
import type { CardDesign, CardElement, CardMeta, TextEl, ImageEl, RectEl, CircleEl } from './cardDesignTypes';
import { defaultCardDesign, genId, CARD_W } from './cardDesignTypes';
import CardCanvas from './CardCanvas';
import ThemeSwitcher from '../components/ThemeSwitcher';

const PANEL_W = 248;
const STORAGE_KEY = 'cardcq-card-design';

function loadDesign(): CardDesign {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw) as CardDesign;
      if (!Array.isArray(d.meta.customFields)) d.meta.customFields = [];
      return d;
    }
  } catch { /* ignore */ }
  return defaultCardDesign();
}

interface Props {
  onThemeChange?: (t: Theme) => void;
  navTabs?: React.ReactNode;
}

export default function CardDesigner({ onThemeChange, navTabs }: Props) {
  const theme = useTheme();
  const [design, setDesign] = useState<CardDesign>(loadDesign);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Persist to localStorage after changes settle. Compact JSON (no pretty-print)
  // keeps serialisation fast during drag (60 Hz pointer events).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
    }, 150);
  }, [design]);

  // ── Mutators ─────────────────────────────────────────────────────────────────

  function updateMeta(patch: Partial<CardMeta>) {
    setDesign(d => ({ ...d, meta: { ...d.meta, ...patch } }));
  }
  function updateBg(patch: Partial<CardDesign['background']>) {
    setDesign(d => ({ ...d, background: { ...d.background, ...patch } }));
  }
  function updateEl(id: string, patch: Partial<CardElement>) {
    setDesign(d => ({
      ...d,
      elements: d.elements.map(el => el.id === id ? { ...el, ...patch } as CardElement : el),
    }));
  }
  function deleteEl(id: string) {
    setDesign(d => ({ ...d, elements: d.elements.filter(el => el.id !== id) }));
    setSelectedId(null);
  }
  function addElement(el: CardElement) {
    setDesign(d => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(el.id);
  }
  function moveZ(id: string, dir: 1 | -1) {
    setDesign(d => {
      const idx = d.elements.findIndex(el => el.id === id);
      const target = idx + dir;
      if (target < 0 || target >= d.elements.length) return d;
      const els = [...d.elements];
      [els[idx], els[target]] = [els[target], els[idx]];
      return { ...d, elements: els };
    });
  }

  // Arrow-key nudging. Shift+Arrow = 10 px, plain Arrow = 1 px.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!selectedId) return;
      const target = e.target as Element;
      if (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement) return;

      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if      (e.key === 'ArrowLeft')  dx = -step;
      else if (e.key === 'ArrowRight') dx =  step;
      else if (e.key === 'ArrowUp')    dy = -step;
      else if (e.key === 'ArrowDown')  dy =  step;
      else return;

      e.preventDefault();
      setDesign(prev => ({
        ...prev,
        elements: prev.elements.map(el =>
          el.id === selectedId ? { ...el, x: el.x + dx, y: el.y + dy } : el
        ),
      }));
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  // ── Add helpers ──────────────────────────────────────────────────────────────

  function addText() {
    addElement({
      id: genId(), type: 'text',
      x: 20, y: 20, w: CARD_W - 40, h: 36,
      content: 'Card Name', fontSize: 18,
      fontWeight: 'bold', fontStyle: 'normal',
      color: '#ffffff', align: 'center',
    } satisfies TextEl);
  }
  function addRect() {
    addElement({
      id: genId(), type: 'rectangle',
      x: 40, y: 60, w: 200, h: 100,
      fill: '#2a3a5a', stroke: '#4a6090', strokeWidth: 2, rx: 6,
    } satisfies RectEl);
  }
  function addCircle() {
    addElement({
      id: genId(), type: 'circle',
      x: 90, y: 100, w: 100, h: 100,
      fill: '#2a3a5a', stroke: '#4a6090', strokeWidth: 2,
    } satisfies CircleEl);
  }
  function addImage() {
    addElement({
      id: genId(), type: 'image',
      x: 20, y: 60, w: CARD_W - 40, h: 160, src: '',
    } satisfies ImageEl);
  }

  // ── Export / Import ──────────────────────────────────────────────────────────

  function exportJson() {
    const json = JSON.stringify(design, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${design.meta.name.replace(/\s+/g, '_') || 'card'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const d = JSON.parse(ev.target?.result as string) as CardDesign;
          if (!Array.isArray(d.meta.customFields)) d.meta.customFields = [];
          setDesign(d);
          setSelectedId(null);
        } catch { alert('Invalid JSON file'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  const sel = design.elements.find(el => el.id === selectedId) ?? null;
  const inputStyle = inputStyleFor(theme);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: 1, minHeight: 0, overflow: 'hidden',
      background: theme.appBg, color: theme.textPrimary,
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* ── Title bar ── */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 14px', height: 38,
        background: theme.titleBg, borderBottom: `1px solid ${theme.border}`,
      }}>
        <span style={{ color: theme.titlePrimaryText, fontWeight: 'bold', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>
          CardCQ
        </span>
        <span style={{ color: theme.titleSecondaryText, fontSize: 11, letterSpacing: 0.5 }}>
          Card Designer
        </span>
        {navTabs}
        <div style={{ marginLeft: 'auto' }}>
          <ThemeSwitcher onSelect={t => onThemeChange?.(t)} />
        </div>
      </div>

      {/* ── Three-column body ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Left panel: meta + tools ── */}
        <div style={{
          width: PANEL_W, flexShrink: 0,
          background: theme.paletteBg, borderRight: `1px solid ${theme.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <PanelHeader>Card Properties</PanelHeader>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>

            <Section>
              <SectionHead>Meta</SectionHead>
              <Field lbl="Name">
                <input type="text" value={design.meta.name} style={inputStyle}
                  onChange={e => updateMeta({ name: e.target.value })} />
              </Field>
              <Field lbl="Type">
                <input type="text" value={design.meta.cardType} style={inputStyle}
                  placeholder="e.g. Creature, Spell…"
                  onChange={e => updateMeta({ cardType: e.target.value })} />
              </Field>
              <Field lbl="Description">
                <textarea value={design.meta.description}
                  onChange={e => updateMeta({ description: e.target.value })}
                  style={{ ...inputStyle, height: 56, resize: 'none' }} />
              </Field>
              <Field lbl="Tags (comma-separated)">
                <input type="text" value={design.meta.tags} style={inputStyle}
                  onChange={e => updateMeta({ tags: e.target.value })} />
              </Field>

              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 6 }}>Custom Fields</div>
                {design.meta.customFields.map((cf, i) => (
                  <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                    <input type="text" value={cf.key} placeholder="key"
                      onChange={e => {
                        const fields = design.meta.customFields.map((f, j) =>
                          j === i ? { ...f, key: e.target.value } : f
                        );
                        updateMeta({ customFields: fields });
                      }}
                      style={{ ...inputStyle, flex: '0 0 80px', width: 80 }} />
                    <input type="text" value={cf.value} placeholder="value"
                      onChange={e => {
                        const fields = design.meta.customFields.map((f, j) =>
                          j === i ? { ...f, value: e.target.value } : f
                        );
                        updateMeta({ customFields: fields });
                      }}
                      style={{ ...inputStyle, flex: 1 }} />
                    <button
                      onClick={() => updateMeta({ customFields: design.meta.customFields.filter((_, j) => j !== i) })}
                      style={{
                        flexShrink: 0, background: 'none',
                        border: `1px solid ${theme.border}`,
                        color: theme.textMuted, borderRadius: 4,
                        width: 22, height: 22, cursor: 'pointer',
                        fontSize: 12, lineHeight: 1, padding: 0,
                      }}
                      title="Remove field"
                    >×</button>
                  </div>
                ))}
                <button
                  onClick={() => updateMeta({ customFields: [...design.meta.customFields, { key: '', value: '' }] })}
                  style={{
                    width: '100%', marginTop: 2, background: 'none',
                    border: `1px dashed ${theme.border}`,
                    color: theme.textMuted, borderRadius: 4,
                    padding: '4px', cursor: 'pointer', fontSize: 11,
                  }}
                >+ Add Field</button>
              </div>
            </Section>

            <Section>
              <SectionHead>Background</SectionHead>
              <Field lbl="Color">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="color" value={design.background.color}
                    onChange={e => updateBg({ color: e.target.value })}
                    style={{ width: 32, height: 24, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }} />
                  <span style={{ fontSize: 11, color: theme.textMuted }}>{design.background.color}</span>
                </div>
              </Field>
              <Field lbl="Image URL">
                <input type="text" value={design.background.imageUrl} style={inputStyle}
                  placeholder="https://…"
                  onChange={e => updateBg({ imageUrl: e.target.value })} />
              </Field>
            </Section>

            <Section>
              <SectionHead>Add Element</SectionHead>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {([
                  { label: 'Text',   icon: 'T',  fn: addText   },
                  { label: 'Rect',   icon: '□',  fn: addRect   },
                  { label: 'Circle', icon: '○',  fn: addCircle },
                  { label: 'Image',  icon: '⬛', fn: addImage  },
                ] as const).map(({ label, icon, fn }) => (
                  <button key={label} onClick={fn} style={{
                    background: theme.blockBody, border: `1px solid ${theme.border}`,
                    color: theme.textPrimary, borderRadius: 4, padding: '7px 4px',
                    cursor: 'pointer', fontSize: 11,
                    display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center',
                  }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </Section>

            <div>
              <SectionHead>Data</SectionHead>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={exportJson} style={{
                  flex: 1, background: theme.accent, border: 'none',
                  color: '#0e1118', borderRadius: 4, padding: '6px',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                }}>Export JSON</button>
                <button onClick={importJson} style={{
                  flex: 1, background: theme.blockBody,
                  border: `1px solid ${theme.border}`,
                  color: theme.textPrimary, borderRadius: 4,
                  padding: '6px', cursor: 'pointer', fontSize: 11,
                }}>Import JSON</button>
              </div>
            </div>

          </div>
        </div>

        {/* ── Canvas ── */}
        <div style={{
          flex: 1, minWidth: 0, background: theme.canvasBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `radial-gradient(circle, ${theme.gridDot} 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
          }} />
          <CardCanvas
            design={design}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={(id, x, y) => updateEl(id, { x, y })}
            onResize={(id, x, y, w, h) => updateEl(id, { x, y, w, h })}
          />
        </div>

        {/* ── Right panel: element properties ── */}
        <div style={{
          width: PANEL_W, flexShrink: 0,
          background: theme.paletteBg, borderLeft: `1px solid ${theme.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <PanelHeader>Element Properties</PanelHeader>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {!sel ? (
              <div style={{ color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 40, lineHeight: 1.6 }}>
                Select an element on<br />the card to edit it
              </div>
            ) : (
              <ElProperties
                el={sel}
                onUpdate={patch => updateEl(sel.id, patch)}
                onDelete={() => deleteEl(sel.id)}
                onMoveZ={dir => moveZ(sel.id, dir)}
              />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function inputStyleFor(theme: Theme): React.CSSProperties {
  return {
    width: '100%', background: theme.inputBg,
    border: `1px solid ${theme.inputBorder}`,
    borderRadius: 4, color: theme.textPrimary,
    fontSize: 12, padding: '4px 6px',
    outline: 'none', boxSizing: 'border-box',
  };
}

// ── Shared panel primitives ────────────────────────────────────────────────────

function PanelHeader({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <div style={{
      padding: '8px 12px', background: theme.paletteHeaderBg,
      borderBottom: `1px solid ${theme.border}`,
      fontSize: 11, fontWeight: 600, color: theme.textSecondary,
      letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0,
    }}>
      {children}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: theme.accent,
      marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <div style={{ borderBottom: `1px solid ${theme.border}`, paddingBottom: 12, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Field({ lbl, children }: { lbl: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, color: theme.textMuted, marginBottom: 2, display: 'block' }}>{lbl}</label>
      {children}
    </div>
  );
}

// ── Element properties panel ───────────────────────────────────────────────────

interface ElPropsProps {
  el: CardElement;
  onUpdate: (patch: Partial<CardElement>) => void;
  onDelete: () => void;
  onMoveZ: (dir: 1 | -1) => void;
}

function ElProperties({ el, onUpdate, onDelete, onMoveZ }: ElPropsProps) {
  const theme = useTheme();
  const inputStyle = inputStyleFor(theme);
  const lblStyle: React.CSSProperties = { fontSize: 11, color: theme.textMuted, marginBottom: 2, display: 'block' };
  const secStyle: React.CSSProperties = { borderBottom: `1px solid ${theme.border}`, paddingBottom: 12, marginBottom: 12 };
  const secHead: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: theme.accent, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' };

  const btn: React.CSSProperties = {
    background: theme.blockBody, border: `1px solid ${theme.border}`,
    color: theme.textPrimary, borderRadius: 4, padding: '4px 6px',
    cursor: 'pointer', fontSize: 11,
  };
  const activeBtn = (active: boolean): React.CSSProperties => ({
    ...btn,
    background: active ? theme.accent : theme.blockBody,
    color: active ? '#0e1118' : theme.textPrimary,
  });

  function numInput(label: string, key: string, val: number, min?: number, max?: number) {
    return (
      <div>
        <label style={lblStyle}>{label}</label>
        <input type="number" value={val} min={min} max={max}
          onChange={e => onUpdate({ [key]: Number(e.target.value) } as Partial<CardElement>)}
          style={inputStyle} />
      </div>
    );
  }

  function colorRow(label: string, key: string, val: string) {
    return (
      <div style={{ marginBottom: 8 }}>
        <label style={lblStyle}>{label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="color" value={val}
            onChange={e => onUpdate({ [key]: e.target.value } as Partial<CardElement>)}
            style={{ width: 32, height: 22, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }} />
          <span style={{ fontSize: 11, color: theme.textMuted }}>{val}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: theme.accent, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
        {el.type}
      </div>

      <div style={secStyle}>
        <div style={secHead}>Transform</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {numInput('X', 'x', el.x)}
          {numInput('Y', 'y', el.y)}
          {numInput('W', 'w', el.w, 1)}
          {numInput('H', 'h', el.h, 1)}
        </div>
      </div>

      {el.type === 'text' && (
        <div style={secStyle}>
          <div style={secHead}>Text</div>
          <div style={{ marginBottom: 8 }}>
            <label style={lblStyle}>Content</label>
            <textarea value={el.content}
              onChange={e => onUpdate({ content: e.target.value })}
              style={{ ...inputStyle, height: 72, resize: 'none' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
            <div>
              <label style={lblStyle}>Font Size</label>
              <input type="number" value={el.fontSize} min={6} max={96}
                onChange={e => onUpdate({ fontSize: Number(e.target.value) })}
                style={inputStyle} />
            </div>
            <div>
              <label style={lblStyle}>Color</label>
              <input type="color" value={el.color}
                onChange={e => onUpdate({ color: e.target.value })}
                style={{ width: '100%', height: 28, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onUpdate({ fontWeight: el.fontWeight === 'bold' ? 'normal' : 'bold' })}
              style={{ ...activeBtn(el.fontWeight === 'bold'), flex: 1, fontWeight: 'bold' }}>B</button>
            <button onClick={() => onUpdate({ fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic' })}
              style={{ ...activeBtn(el.fontStyle === 'italic'), flex: 1, fontStyle: 'italic' }}>I</button>
            {(['left', 'center', 'right'] as const).map(a => (
              <button key={a} onClick={() => onUpdate({ align: a })}
                style={{ ...activeBtn(el.align === a), flex: 1 }}>
                {a === 'left' ? '⇤' : a === 'center' ? '⇔' : '⇥'}
              </button>
            ))}
          </div>
        </div>
      )}

      {(el.type === 'rectangle' || el.type === 'circle') && (
        <div style={secStyle}>
          <div style={secHead}>Appearance</div>
          {colorRow('Fill', 'fill', el.fill)}
          {colorRow('Stroke', 'stroke', el.stroke)}
          <div style={{ marginBottom: el.type === 'rectangle' ? 8 : 0 }}>
            <label style={lblStyle}>Stroke Width</label>
            <input type="number" value={el.strokeWidth} min={0} max={20}
              onChange={e => onUpdate({ strokeWidth: Number(e.target.value) })}
              style={inputStyle} />
          </div>
          {el.type === 'rectangle' && (
            <div>
              <label style={lblStyle}>Corner Radius</label>
              <input type="number" value={el.rx} min={0} max={140}
                onChange={e => onUpdate({ rx: Number(e.target.value) })}
                style={inputStyle} />
            </div>
          )}
        </div>
      )}

      {el.type === 'image' && (
        <div style={secStyle}>
          <div style={secHead}>Image</div>
          <label style={lblStyle}>URL or Data URI</label>
          <input type="text" value={el.src} style={inputStyle}
            placeholder="https://…"
            onChange={e => onUpdate({ src: e.target.value })} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={() => onMoveZ(-1)} style={{ ...btn, flex: 1 }}>↓ Send Back</button>
        <button onClick={() => onMoveZ(1)}  style={{ ...btn, flex: 1 }}>↑ Bring Fwd</button>
      </div>
      <button onClick={onDelete} style={{
        width: '100%', background: '#3a0c0c',
        border: '1px solid #8a2020', color: '#e06060',
        borderRadius: 4, padding: '6px', cursor: 'pointer', fontSize: 11,
      }}>Delete Element</button>
    </div>
  );
}
