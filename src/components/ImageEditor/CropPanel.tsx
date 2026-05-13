import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useEditorHistoryStore } from '../../store/editorHistoryStore';
import { useEditorUiStore } from '../../store/editorUiStore';
import { useImageStore } from '../../store/imageStore';

export function CropPanel() {
  const {
    imageLoaded,
    imagePath,
    imageWidth,
    imageHeight,
    params,
    generatePreview,
  } = useImageStore();
  const [cx, setCx] = useState('0');
  const [cy, setCy] = useState('0');
  const [cw, setCw] = useState('');
  const [ch, setCh] = useState('');

  useEffect(() => {
    if (!imageLoaded || imageWidth <= 0 || imageHeight <= 0) return;
    const r = params.cropRect;
    if (r) {
      setCx(String(r.x));
      setCy(String(r.y));
      setCw(String(r.width));
      setCh(String(r.height));
    } else {
      setCx('0');
      setCy('0');
      setCw(String(imageWidth));
      setCh(String(imageHeight));
    }
  }, [imagePath, imageLoaded, imageWidth, imageHeight, params.cropRect]);

  if (!imageLoaded) {
    return (
      <div style={{ padding: '0 16px 16px', color: '#666', fontSize: 12 }}>
        Open an image to crop (coordinates are in original image pixels).
      </div>
    );
  }

  const applyCrop = () => {
    const parseAxis = (raw: string, fallback: number) => {
      const t = raw.trim();
      if (t === '') return fallback;
      const n = Math.floor(Number(t));
      return Number.isFinite(n) ? n : fallback;
    };
    const parseSpan = (raw: string, fallback: number) => {
      const t = raw.trim();
      if (t === '') return fallback;
      const n = Math.floor(Number(t));
      return Number.isFinite(n) && n >= 1 ? n : fallback;
    };

    const x = parseAxis(cx, 0);
    const y = parseAxis(cy, 0);
    const w = parseSpan(cw, imageWidth);
    const h = parseSpan(ch, imageHeight);

    const x0 = Math.max(0, Math.min(x, imageWidth - 1));
    const y0 = Math.max(0, Math.min(y, imageHeight - 1));
    const w0 = Math.max(1, Math.min(w, imageWidth - x0));
    const h0 = Math.max(1, Math.min(h, imageHeight - y0));

    const fullFrame =
      x0 === 0 && y0 === 0 && w0 === imageWidth && h0 === imageHeight;
    const cropRect = fullFrame ? null : { x: x0, y: y0, width: w0, height: h0 };

    const nextParams = { ...useImageStore.getState().params, cropRect };
    useEditorHistoryStore.getState().push();
    useImageStore.setState({ params: nextParams });
    void generatePreview(nextParams);
    useEditorUiStore.getState().syncCropDraftWithParams();
  };

  const clearCrop = () => {
    useEditorHistoryStore.getState().push();
    const nextParams = { ...useImageStore.getState().params, cropRect: null };
    useImageStore.setState({ params: nextParams });
    void generatePreview(nextParams);
    useEditorUiStore.getState().syncCropDraftWithParams();
  };

  const useFullImage = () => {
    setCx('0');
    setCy('0');
    setCw(String(imageWidth));
    setCh(String(imageHeight));
    useEditorHistoryStore.getState().push();
    const nextParams = { ...useImageStore.getState().params, cropRect: null };
    useImageStore.setState({ params: nextParams });
    void generatePreview(nextParams);
    useEditorUiStore.getState().syncCropDraftWithParams();
  };

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={labelStyle}>Crop (px, from original)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="X" value={cx} onChange={setCx} />
        <Field label="Y" value={cy} onChange={setCy} />
        <Field label="Width" value={cw} onChange={setCw} />
        <Field label="Height" value={ch} onChange={setCh} />
      </div>
      <div style={{ fontSize: 11, color: '#888' }}>
        Image {imageWidth} × {imageHeight}px
        {params.cropRect && (
          <span style={{ marginLeft: 8, color: '#7f8' }}>
            Active crop: {params.cropRect.x},{params.cropRect.y} — {params.cropRect.width}×
            {params.cropRect.height}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => void applyCrop()} style={btn}>
          Apply crop
        </button>
        <button type="button" onClick={() => void clearCrop()} style={btnGhost}>
          Clear crop
        </button>
        <button type="button" onClick={() => void useFullImage()} style={btnGhost}>
          Full image
        </button>
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#aaa' }}>
      {props.label}
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        style={numInput}
      />
    </label>
  );
}

const labelStyle: CSSProperties = { color: '#ccc', fontSize: 13, fontWeight: 600 };

const numInput: CSSProperties = {
  width: '100%',
  background: '#16213e',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '6px 8px',
  boxSizing: 'border-box',
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
