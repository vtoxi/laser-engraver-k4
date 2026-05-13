import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useImageStore, throttledRegeneratePreview } from '../../store/imageStore';
import { useSettingsStore } from '../../store/settingsStore';
import { MachineBedForm } from './MachineBedForm';

export function EngravingParams() {
  const { params, updateParam, generatePreview } = useImageStore();
  const { presets } = useSettingsStore();
  const [rw, setRw] = useState('');
  const [rh, setRh] = useState('');

  useEffect(() => {
    if (params.resizeTo) {
      setRw(String(params.resizeTo[0]));
      setRh(String(params.resizeTo[1]));
    }
  }, [params.resizeTo]);

  const applyPreset = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    updateParam('depth', preset.depth);
    updateParam('power', preset.power);
    updateParam('passes', preset.passes);
    updateParam('threshold', preset.threshold);
    updateParam('speed', preset.speed);
    void generatePreview();
  };

  const applyResize = () => {
    const w = Number(rw);
    const h = Number(rh);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      updateParam('resizeTo', null);
    } else {
      updateParam('resizeTo', [Math.floor(w), Math.floor(h)]);
    }
    void generatePreview();
  };

  const clearResize = () => {
    setRw('');
    setRh('');
    updateParam('resizeTo', null);
    void generatePreview();
  };

  return (
    <div className="lf-panel lf-stack" style={{ padding: 16 }}>
      <div>
        <label style={labelStyle}>Engrave style</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {(['raster', 'outline'] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => {
                updateParam('engraveMode', m);
                void generatePreview();
              }}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 4,
                border: '1px solid #444',
                cursor: 'pointer',
                fontSize: 12,
                background: params.engraveMode === m ? '#2980b9' : '#2a2a3e',
                color: '#fff',
              }}
            >
              {m === 'raster' ? 'Raster (fill)' : 'Outline (edge)'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 8, lineHeight: 1.4 }}>
          Outline traces the boundary of dark vs light using the Threshold control on the Image tab.
          The laser only fires on that edge; the head still moves in normal scan rows (K4 line protocol).
        </div>
      </div>

      <MachineBedForm />

      <div>
        <label style={labelStyle}>Material Preset</label>
        <select
          defaultValue=""
          onChange={(e) => {
            applyPreset(e.target.value);
            e.target.value = '';
          }}
          style={{
            width: '100%',
            marginTop: 6,
            background: '#16213e',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '6px 8px',
          }}
        >
          <option value="">— Select preset —</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.material}: {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Resize to exact (px)</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input
            placeholder="W"
            value={rw}
            onChange={(e) => setRw(e.target.value)}
            style={numInput}
          />
          <input
            placeholder="H"
            value={rh}
            onChange={(e) => setRh(e.target.value)}
            style={numInput}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={() => void applyResize()} style={btn}>
            Apply resize
          </button>
          <button type="button" onClick={() => void clearResize()} style={btnGhost}>
            Clear
          </button>
        </div>
        {params.resizeTo && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
            Active: {params.resizeTo[0]} × {params.resizeTo[1]}
          </div>
        )}
      </div>

      <NumRow
        label="Speed (mm/min)"
        value={params.speed}
        min={100}
        max={6000}
        step={100}
        hint="Raster speed"
        onChange={(v) => {
          updateParam('speed', v);
          throttledRegeneratePreview();
        }}
        onInteractionEnd={() => throttledRegeneratePreview.flush()}
      />

      <NumRow
        label="Power (0–1000)"
        value={params.power}
        min={0}
        max={1000}
        step={50}
        hint="Higher = brighter / deeper"
        onChange={(v) => {
          updateParam('power', v);
          throttledRegeneratePreview();
        }}
        onInteractionEnd={() => throttledRegeneratePreview.flush()}
      />

      <NumRow
        label="Depth (laser on-time)"
        value={params.depth}
        min={1}
        max={255}
        step={5}
        hint="Time laser fires per pixel"
        onChange={(v) => {
          updateParam('depth', v);
          throttledRegeneratePreview();
        }}
        onInteractionEnd={() => throttledRegeneratePreview.flush()}
      />

      <NumRow
        label="Passes"
        value={params.passes}
        min={1}
        max={10}
        step={1}
        hint="Multiple passes = deeper"
        onChange={(v) => {
          updateParam('passes', v);
          throttledRegeneratePreview();
        }}
        onInteractionEnd={() => throttledRegeneratePreview.flush()}
      />
    </div>
  );
}

function NumRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint: string;
  onChange: (v: number) => void;
  onInteractionEnd?: () => void;
}) {
  const { label, value, min, max, step, hint, onChange, onInteractionEnd } = props;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ color: '#aaa', fontSize: 11 }}>{hint}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseUp={onInteractionEnd}
          onTouchEnd={onInteractionEnd}
          style={{ flex: 1, accentColor: '#8e44ad' }}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            onChange(Number(e.target.value));
            onInteractionEnd?.();
          }}
          style={{
            width: 64,
            background: '#16213e',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '4px 8px',
            textAlign: 'right',
          }}
        />
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = { color: '#ccc', fontSize: 13, fontWeight: 600 };

const numInput: CSSProperties = {
  flex: 1,
  background: '#16213e',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '6px 8px',
};

const btn: CSSProperties = {
  background: '#2980b9',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 12,
};

const btnGhost: CSSProperties = {
  background: 'transparent',
  color: '#aaa',
  border: '1px solid #555',
  borderRadius: 4,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 12,
};
