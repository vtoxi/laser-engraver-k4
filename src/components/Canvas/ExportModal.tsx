import { useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import * as Slider from '@radix-ui/react-slider';
import { EXPORT_DPI_OPTIONS } from '../../utils/constants';
import { computeWorkAreaPixels, useSettingsStore } from '../../store/settingsStore';
import { fabricIncludeInRasterExport, laserCanvasApi } from '../../lib/laserCanvasApi';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ExportModal(props: Props) {
  const { open, onClose } = props;
  const { bedWidthMm, bedHeightMm, pixelsPerMm } = useSettingsStore();
  const [format, setFormat] = useState<'png' | 'svg'>('png');
  const [dpiIdx, setDpiIdx] = useState(0);
  const dpi = EXPORT_DPI_OPTIONS[dpiIdx];
  const [includeGrid, setIncludeGrid] = useState(false);

  const targetPx = useMemo(() => {
    const wMm = bedWidthMm;
    const side = Math.round((wMm * dpi) / 25.4);
    return Math.max(1, side);
  }, [bedWidthMm, dpi]);

  if (!open) return null;

  const runExport = async () => {
    const src = laserCanvasApi.get();
    if (!src) return;
    const [bw] = computeWorkAreaPixels(bedWidthMm, bedHeightMm, pixelsPerMm);
    const mult = targetPx / Math.max(1, bw);

    if (format === 'svg') {
      const svg = src.toSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      saveAs(blob, `k4-export-${dpi}dpi.svg`);
      onClose();
      return;
    }

    const dataUrl = src.toDataURL({
      format: 'png',
      multiplier: mult,
      enableRetinaScaling: false,
      filter: fabricIncludeInRasterExport,
    });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    saveAs(blob, `k4-export-${dpi}dpi.png`);
    onClose();
  };

  const copyPng = async () => {
    const src = laserCanvasApi.get();
    if (!src) return;
    const [bw] = computeWorkAreaPixels(bedWidthMm, bedHeightMm, pixelsPerMm);
    const mult = targetPx / Math.max(1, bw);
    const dataUrl = src.toDataURL({
      format: 'png',
      multiplier: mult,
      enableRetinaScaling: false,
      filter: fabricIncludeInRasterExport,
    });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="lf-panel lf-stack"
        style={{ maxWidth: 420, width: '100%', padding: 20, borderRadius: 12 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Export</h2>
        <label style={{ fontSize: 12, color: 'var(--lf-muted)', display: 'block', marginBottom: 6 }}>Format</label>
        <select className="lf-input" value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'svg')} style={{ marginBottom: 14 }}>
          <option value="png">PNG</option>
          <option value="svg">SVG</option>
        </select>

        <label style={{ fontSize: 12, color: 'var(--lf-muted)', display: 'block', marginBottom: 6 }}>
          DPI ({dpi}) — output ≈ {targetPx}×{targetPx}px
        </label>
        <Slider.Root
          style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 24, marginBottom: 14 }}
          value={[dpiIdx]}
          min={0}
          max={EXPORT_DPI_OPTIONS.length - 1}
          step={1}
          onValueChange={([v]) => setDpiIdx(v)}
        >
          <Slider.Track style={{ background: 'var(--lf-border)', height: 4, flex: 1, borderRadius: 2, position: 'relative' }}>
            <Slider.Range style={{ position: 'absolute', background: 'var(--lf-accent, #ff6b2b)', height: '100%', borderRadius: 2 }} />
          </Slider.Track>
          <Slider.Thumb
            aria-label="DPI preset"
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: '#fff',
              border: '2px solid var(--lf-accent, #ff6b2b)',
            }}
          />
        </Slider.Root>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input type="checkbox" checked={includeGrid} onChange={(e) => setIncludeGrid(e.target.checked)} />
          Include grid (PNG raster only; not yet applied)
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="lf-btn lf-btn--primary" onClick={() => void runExport()}>
            Download
          </button>
          {format === 'png' ? (
            <button type="button" className="lf-btn lf-btn--ghost" onClick={() => void copyPng().catch(() => {})}>
              Copy PNG
            </button>
          ) : null}
          <button type="button" className="lf-btn lf-btn--ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
