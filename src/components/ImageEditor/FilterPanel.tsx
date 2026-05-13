import { useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useImageStore, throttledRegeneratePreview, type DitherMode } from '../../store/imageStore';

export function FilterPanel() {
  const { params, updateParam, generatePreview, isGeneratingPreview, previewError } = useImageStore();

  const updateSlider = useCallback(
    <K extends keyof typeof params>(key: K, value: (typeof params)[K]) => {
      updateParam(key, value);
      throttledRegeneratePreview();
    },
    [updateParam],
  );

  const updateImmediate = useCallback(
    <K extends keyof typeof params>(key: K, value: (typeof params)[K]) => {
      updateParam(key, value);
      void useImageStore.getState().generatePreview();
    },
    [updateParam],
  );

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={labelStyle}>Dithering</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {(['threshold', 'floyd', 'atkinson', 'bayer'] as DitherMode[]).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => updateImmediate('ditherMode', m)}
            style={{
              background: params.ditherMode === m ? '#2980b9' : '#2a2a3e',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: 4,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 12,
              textTransform: 'capitalize',
            }}
          >
            {m === 'floyd'
              ? 'Floyd-Steinberg'
              : m === 'atkinson'
                ? 'Atkinson'
                : m === 'bayer'
                  ? 'Bayer 4×4'
                  : 'Threshold'}
          </button>
        ))}
      </div>

      <SliderRow
        label="Threshold"
        value={params.threshold}
        min={0}
        max={255}
        onChange={(v) => updateSlider('threshold', v)}
        onInteractionEnd={() => throttledRegeneratePreview.flush()}
      />
      <SliderRow
        label="Brightness"
        value={params.brightness}
        min={-100}
        max={100}
        onChange={(v) => updateSlider('brightness', v)}
        onInteractionEnd={() => throttledRegeneratePreview.flush()}
      />
      <SliderRow
        label="Contrast"
        value={params.contrast}
        min={-100}
        max={100}
        onChange={(v) => updateSlider('contrast', v)}
        onInteractionEnd={() => throttledRegeneratePreview.flush()}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ToggleBtn label="Invert" active={params.invert} onClick={() => updateImmediate('invert', !params.invert)} />
        <ToggleBtn label="Flip H" active={params.flipH} onClick={() => updateImmediate('flipH', !params.flipH)} />
        <ToggleBtn label="Flip V" active={params.flipV} onClick={() => updateImmediate('flipV', !params.flipV)} />
      </div>

      <div>
        <label style={labelStyle}>Rotate</label>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {[0, 90, 180, 270].map((deg) => (
            <button
              type="button"
              key={deg}
              onClick={() => updateImmediate('rotateDeg', deg)}
              style={{
                background: params.rotateDeg === deg ? '#2980b9' : '#2a2a3e',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: 4,
                padding: '5px 10px',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {deg}°
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void generatePreview()}
          disabled={isGeneratingPreview}
          style={{
            background: '#8e44ad',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {isGeneratingPreview ? 'Generating...' : '⟳ Update Preview'}
        </button>
        {previewError && (
          <span style={{ color: '#e74c3c', fontSize: 12, maxWidth: 280 }}>
            Preview failed: {previewError}
          </span>
        )}
      </div>
    </div>
  );
}

function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onInteractionEnd?: () => void;
}) {
  const { label, value, min, max, onChange, onInteractionEnd } = props;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ color: '#aaa', fontSize: 12 }}>{Math.round(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={onInteractionEnd}
        onTouchEnd={onInteractionEnd}
        style={{ width: '100%', accentColor: '#2980b9' }}
      />
    </div>
  );
}

function ToggleBtn(props: { label: string; active: boolean; onClick: () => void }) {
  const { label, active, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? '#e67e22' : '#2a2a3e',
        color: '#fff',
        border: '1px solid #444',
        borderRadius: 4,
        padding: '5px 12px',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      {label}
    </button>
  );
}

const labelStyle: CSSProperties = { color: '#ccc', fontSize: 13, fontWeight: 600 };
