import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useSerialStore } from '../../store/serialStore';
import { useImageStore, type EngraveParamsPayload } from '../../store/imageStore';
import { jobMachineRegion } from '../../lib/jobMachineRegion';

/** @deprecated use jobMachineRegion from lib */
function previewFrameArgs(
  imageWidth: number,
  imageHeight: number,
  params: EngraveParamsPayload,
  bedWidthMm: number,
  bedHeightMm: number,
  pixelsPerMm: number,
): { x: number; y: number; w: number; h: number } {
  const { jobW, jobH } = jobMachineRegion({
    imageWidth,
    imageHeight,
    params,
    bedWidthMm,
    bedHeightMm,
    pixelsPerMm,
  });
  let x = 0;
  let y = 0;
  if (params.cropRect) {
    x = params.cropRect.x;
    y = params.cropRect.y;
  }
  return { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), w: jobW, h: jobH };
}

export function JobControl() {
  const {
    connectionState,
    jobRunning,
    jobProgress,
    previewFrame,
    stopPreview,
    stopJob,
    pauseJob,
    setParams,
  } = useSerialStore();
  const { imageLoaded, imageWidth, imageHeight, params, startJob } = useImageStore();
  const { bedWidthMm, bedHeightMm, pixelsPerMm } = useSettingsStore();
  const [previewOn, setPreviewOn] = useState(false);

  useEffect(() => {
    if (connectionState !== 'connected') setPreviewOn(false);
  }, [connectionState]);

  const canRun = connectionState === 'connected' && imageLoaded && !jobRunning;
  const canPreview = connectionState === 'connected' && imageLoaded;

  const togglePreview = async () => {
    if (!canPreview) return;
    if (previewOn) {
      await stopPreview();
      setPreviewOn(false);
      return;
    }
    await setParams(params.speed, params.power, params.passes);
    const { x, y, w, h } = previewFrameArgs(
      imageWidth,
      imageHeight,
      params,
      bedWidthMm,
      bedHeightMm,
      pixelsPerMm,
    );
    await previewFrame(x, y, w, h);
    setPreviewOn(true);
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void togglePreview()}
          disabled={!canPreview}
          style={btnStyle(previewOn ? '#c0392b' : '#8e44ad', !canPreview)}
        >
          {previewOn ? '■ Stop preview' : '□ Preview frame'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => void startJob()}
          disabled={!canRun}
          style={btnStyle('#27ae60', !canRun)}
        >
          ▶ Start Engrave
        </button>
        <button
          type="button"
          onClick={() => void pauseJob()}
          disabled={!jobRunning}
          style={btnStyle('#f39c12', !jobRunning)}
        >
          ⏸ Pause
        </button>
        <button
          type="button"
          onClick={() => void stopJob()}
          disabled={!jobRunning}
          style={btnStyle('#e74c3c', !jobRunning)}
        >
          ■ Stop
        </button>
      </div>

      {(jobRunning || jobProgress > 0) && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: '#aaa',
              marginBottom: 4,
            }}
          >
            <span>{jobRunning ? 'Engraving...' : 'Complete'}</span>
            <span>{Math.round(jobProgress)}%</span>
          </div>
          <div style={{ background: '#333', borderRadius: 4, height: 8 }}>
            <div
              style={{
                background: '#2ecc71',
                height: '100%',
                borderRadius: 4,
                width: `${jobProgress}%`,
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function btnStyle(bg: string, disabled = false): CSSProperties {
  return {
    background: disabled ? '#444' : bg,
    color: disabled ? '#888' : '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '8px 14px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    opacity: disabled ? 0.6 : 1,
  };
}
