import { useState } from 'react';
import { useImageStore } from '../../store/imageStore';
import { computeWorkAreaPixels, useSettingsStore } from '../../store/settingsStore';

/** Machine bed mm + px/mm; shared by Engrave tab and Settings. */
export function MachineBedForm() {
  const { updateParam, generatePreview } = useImageStore();
  const {
    bedWidthMm,
    bedHeightMm,
    pixelsPerMm,
    setMachineBed,
    setPixelsPerMm,
  } = useSettingsStore();
  const [bedW, setBedW] = useState(String(bedWidthMm));
  const [bedH, setBedH] = useState(String(bedHeightMm));
  const [ppm, setPpm] = useState(String(pixelsPerMm));

  const syncBedInputs = () => {
    setBedW(String(bedWidthMm));
    setBedH(String(bedHeightMm));
    setPpm(String(pixelsPerMm));
  };

  const applyMachineSettings = () => {
    const w = Number(bedW);
    const h = Number(bedH);
    const p = Number(ppm);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      setMachineBed(w, h);
    }
    if (Number.isFinite(p) && p > 0) {
      setPixelsPerMm(p);
    }
    void generatePreview();
  };

  const fitResizeToBed = () => {
    const w = Number(bedW);
    const h = Number(bedH);
    const p = Number(ppm);
    const bw = Number.isFinite(w) && w > 0 ? w : bedWidthMm;
    const bh = Number.isFinite(h) && h > 0 ? h : bedHeightMm;
    const pp = Number.isFinite(p) && p > 0 ? p : pixelsPerMm;
    const [pw, ph] = computeWorkAreaPixels(bw, bh, pp);
    updateParam('resizeTo', [pw, ph]);
    void generatePreview();
  };

  const workPx = computeWorkAreaPixels(bedWidthMm, bedHeightMm, pixelsPerMm);

  return (
    <div className="lf-stack">
      <div className="lf-field-label">Machine bed (mm)</div>
      <p className="lf-hint">
        K4 default 80 × 80. Raster ≈ mm × px/mm → {workPx[0]} × {workPx[1]} px.
      </p>
      <div className="lf-row">
        <input
          className="lf-input"
          placeholder="Width mm"
          value={bedW}
          onChange={(e) => setBedW(e.target.value)}
        />
        <input
          className="lf-input"
          placeholder="Height mm"
          value={bedH}
          onChange={(e) => setBedH(e.target.value)}
        />
      </div>
      <div className="lf-field-label" style={{ marginTop: 10 }}>
        Pixels per mm
      </div>
      <input
        className="lf-input"
        placeholder="px/mm"
        value={ppm}
        onChange={(e) => setPpm(e.target.value)}
      />
      <div className="lf-row" style={{ marginTop: 10 }}>
        <button type="button" className="lf-btn lf-btn--primary" onClick={() => void applyMachineSettings()}>
          Save machine
        </button>
        <button type="button" className="lf-btn lf-btn--ghost" onClick={syncBedInputs}>
          Reset fields
        </button>
        <button type="button" className="lf-btn lf-btn--accent" onClick={() => void fitResizeToBed()}>
          Resize image to bed
        </button>
      </div>
    </div>
  );
}
