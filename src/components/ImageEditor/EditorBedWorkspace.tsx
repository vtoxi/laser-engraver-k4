import { useEffect, useMemo, useState } from 'react';
import { WorkspaceJogOverlay } from '../MachineControl/WorkspaceJogOverlay';
import { useEditorUiStore } from '../../store/editorUiStore';
import { useImageStore } from '../../store/imageStore';
import type { CropRectPayload } from '../../store/imageStore';
import { computeWorkAreaPixels, useSettingsStore } from '../../store/settingsStore';
import { EditorToolbar } from './EditorToolbar';
import { WorkspaceOriginalPreview } from './WorkspaceOriginalPreview';

function BurnScanlines() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setT((x) => (x + 1) % 100);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', borderRadius: 6 }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 2,
          background: 'rgba(231, 76, 60, 0.9)',
          top: `${t}%`,
          boxShadow: '0 0 12px rgba(231,76,60,0.65)',
        }}
      />
    </div>
  );
}

export function EditorBedWorkspace() {
  const { originalPreview, processedPreview, imageWidth, imageHeight, isGeneratingPreview, previewError, imageLoaded } =
    useImageStore();
  const { bedWidthMm, bedHeightMm, pixelsPerMm } = useSettingsStore();
  const workPx = computeWorkAreaPixels(bedWidthMm, bedHeightMm, pixelsPerMm);
  const {
    editorTool,
    simulateScanlines,
    cropAspectLock,
    annotations,
    burnOverlayVisible,
    burnOverlayOpacity,
    cropDraft,
  } = useEditorUiStore();

  const cropAspectWOverH =
    cropAspectLock === '1:1' ? 1 : cropAspectLock === 'bed' ? bedWidthMm / Math.max(1e-9, bedHeightMm) : null;

  useEffect(() => {
    if (!imageLoaded || imageWidth <= 0 || imageHeight <= 0) return;
    useEditorUiStore.getState().syncCropDraftWithParams();
  }, [imageLoaded, imageWidth, imageHeight]);

  const controlledCrop = useMemo(() => {
    if (editorTool !== 'crop') return undefined;
    return {
      rect: cropDraft,
      onChange: (next: CropRectPayload | null) => {
        const st = useImageStore.getState();
        const w = Math.max(1, st.imageWidth);
        const h = Math.max(1, st.imageHeight);
        const rect = next == null ? { x: 0, y: 0, width: w, height: h } : next;
        useEditorUiStore.setState({ cropDraft: rect });
      },
    };
  }, [editorTool, cropDraft]);

  const stackAfterBase = useMemo(() => {
    if (!processedPreview || !burnOverlayVisible) return undefined;
    const op = burnOverlayOpacity;
    return (
      <>
        <img
          src={processedPreview}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: op,
            pointerEvents: 'none',
            zIndex: 1,
            borderRadius: 6,
            imageRendering: 'pixelated',
            border: '1px solid rgba(0,0,0,0.35)',
            boxSizing: 'border-box',
          }}
        />
        {simulateScanlines ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
            <BurnScanlines />
          </div>
        ) : null}
      </>
    );
  }, [processedPreview, burnOverlayVisible, burnOverlayOpacity, simulateScanlines]);

  const overBed = annotations.length > 0 ? (
    <>
      {annotations.map((a) => (
        <div
          key={a.id}
          title={a.text}
          style={{
            position: 'absolute',
            left: `${a.xNorm * 100}%`,
            top: `${a.yNorm * 100}%`,
            maxWidth: '88%',
            padding: '4px 8px',
            borderRadius: 6,
            background: 'rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'var(--lf-text)',
            fontSize: 14,
            fontWeight: 600,
            textShadow: '0 1px 3px #000',
            pointerEvents: editorTool === 'text' ? 'auto' : 'none',
            lineHeight: 1.25,
          }}
        >
          {a.text}
        </div>
      ))}
    </>
  ) : undefined;

  return (
    <div className="lf-workspace-playground">
      <EditorToolbar />
      <section className="lf-panel lf-stack" style={{ padding: 16 }}>
        <div className="lf-hint" style={{ color: 'var(--lf-text)', fontWeight: 600 }}>
          Bed {bedWidthMm}×{bedHeightMm} mm · source {imageWidth}×{imageHeight}px · raster cap ≈ {workPx[0]}×{workPx[1]} px
          {isGeneratingPreview ? ' · rendering…' : ''}
        </div>
        <p className="lf-hint" style={{ marginTop: 4 }}>
          Source and burn preview are <strong>one view</strong>: toggle <strong>Burn</strong> and <strong>Mix</strong> to compare.
          Crop with the ▢ tool, then <strong>Apply crop</strong> or <strong>Cancel</strong>. <strong>A</strong> adds text (Apply/Cancel).
          Undo / redo cover crop, transforms, text adds, and reset. Sidebar filters still drive the burn layer.
          {previewError ? (
            <span style={{ color: 'var(--lf-danger)', marginLeft: 8 }}>Preview error: {previewError}</span>
          ) : null}
        </p>
        <WorkspaceOriginalPreview
          src={originalPreview!}
          alt="Job source"
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          bedWidthMm={bedWidthMm}
          bedHeightMm={bedHeightMm}
          cropAspectWOverH={cropAspectWOverH}
          cropInteractive={editorTool === 'crop'}
          showCropOverlay
          controlledCrop={controlledCrop}
          stackAfterBase={stackAfterBase}
          imgStyle={{
            border: '1px solid var(--lf-border)',
            imageRendering: 'pixelated',
          }}
          overBed={overBed}
        />
        {!processedPreview && (
          <p className="lf-hint" style={{ marginTop: 8 }}>
            Burn overlay appears after a preview is built (sidebar Image / Engrave).
          </p>
        )}
      </section>
      <WorkspaceJogOverlay />
    </div>
  );
}
