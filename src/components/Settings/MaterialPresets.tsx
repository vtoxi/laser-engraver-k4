import { useState } from 'react';
import { useSettingsStore, type MaterialPreset } from '../../store/settingsStore';

export function MaterialPresets() {
  const { presets, addPreset, deletePreset } = useSettingsStore();
  const [draft, setDraft] = useState<Partial<MaterialPreset>>({
    name: '',
    material: '',
    speed: 3000,
    power: 600,
    passes: 1,
    depth: 80,
    threshold: 128,
    notes: '',
  });

  const saveNew = () => {
    if (!draft.name?.trim()) return;
    const id = `custom-${Date.now()}`;
    addPreset({
      id,
      name: draft.name.trim(),
      material: (draft.material ?? 'Custom').trim() || 'Custom',
      speed: Number(draft.speed ?? 3000),
      power: Number(draft.power ?? 600),
      passes: Number(draft.passes ?? 1),
      depth: Number(draft.depth ?? 80),
      threshold: Number(draft.threshold ?? 128),
      notes: draft.notes?.trim() ?? '',
    });
    setDraft({
      name: '',
      material: '',
      speed: 3000,
      power: 600,
      passes: 1,
      depth: 80,
      threshold: 128,
      notes: '',
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#ccc', fontSize: 13, fontWeight: 600 }}>Preset library</div>
      <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #333', borderRadius: 6 }}>
        {presets.map((p) => (
          <div
            key={p.id}
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid #222',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#eee' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#888' }}>
                {p.material} · S{p.speed} P{p.power} D{p.depth}
              </div>
            </div>
            {p.id.startsWith('custom-') && (
              <button
                type="button"
                onClick={() => deletePreset(p.id)}
                style={{
                  fontSize: 11,
                  background: '#442222',
                  color: '#faa',
                  border: '1px solid #633',
                  borderRadius: 4,
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ color: '#ccc', fontSize: 13, fontWeight: 600 }}>Add custom preset</div>
      <PresetField label="Name" value={draft.name ?? ''} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
      <PresetField label="Material" value={draft.material ?? ''} onChange={(v) => setDraft((d) => ({ ...d, material: v }))} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <PresetNumber label="Speed" value={draft.speed ?? 3000} onChange={(n) => setDraft((d) => ({ ...d, speed: n }))} />
        <PresetNumber label="Power" value={draft.power ?? 600} onChange={(n) => setDraft((d) => ({ ...d, power: n }))} />
        <PresetNumber label="Passes" value={draft.passes ?? 1} onChange={(n) => setDraft((d) => ({ ...d, passes: n }))} />
        <PresetNumber label="Depth" value={draft.depth ?? 80} onChange={(n) => setDraft((d) => ({ ...d, depth: n }))} />
        <PresetNumber label="Threshold" value={draft.threshold ?? 128} onChange={(n) => setDraft((d) => ({ ...d, threshold: n }))} />
      </div>
      <PresetField label="Notes" value={draft.notes ?? ''} onChange={(v) => setDraft((d) => ({ ...d, notes: v }))} />
      <button type="button" onClick={saveNew} style={{ background: '#27ae60', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 12px', cursor: 'pointer' }}>
        Save preset
      </button>
    </div>
  );
}

function PresetField(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#aaa' }}>
      {props.label}
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        style={{ background: '#16213e', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '6px 8px' }}
      />
    </label>
  );
}

function PresetNumber(props: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#aaa' }}>
      {props.label}
      <input
        type="number"
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        style={{ background: '#16213e', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '6px 8px' }}
      />
    </label>
  );
}
