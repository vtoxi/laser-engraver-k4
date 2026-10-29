import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceJogOverlay } from '../MachineControl/WorkspaceJogOverlay';
import { useEditorUiStore } from '../../store/editorUiStore';
import { useImageStore, toBrowserRasterParams } from '../../store/imageStore';
import { computeWorkAreaPixels, useSettingsStore } from '../../store/settingsStore';
import { jobMachineRegion } from '../../lib/jobMachineRegion';
import { flattenContourLoops, boundaryLoopsFromFilledMask } from '../../lib/maskBoundaryPaths';
import { flattenJobPixels, repeatJobPoints } from '../../lib/rasterJobPath';
import type { Pixel } from '../../lib/rasterJobPath';
import { rasterizeFromImageUrlWithGeometry } from '../../image/browserImagePipeline';
import { BurnScanDotOverlay } from './BurnScanDotOverlay';
import { LiveEngraveLaserOverlay } from './LiveEngraveLaserOverlay';
import { EditorAdvancedToolbar } from './EditorAdvancedToolbar';
import { EditorToolbar } from './EditorToolbar';
import { LaserCanvas } from '../Canvas/LaserCanvas';
import { LayerPanel } from '../Canvas/LayerPanel';
import { PropertiesPanel } from '../Canvas/PropertiesPanel';
import { ExportModal } from '../Canvas/ExportModal';
import { useLaserCanvasUiStore } from '../../store/laserCanvasUiStore';
import { useLaserKeyboard } from '../../hooks/useLaserKeyboard';
import { BED_EDITOR_VIEWPORT_H, BED_EDITOR_VIEWPORT_W } from '../../utils/constants';

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
  useLaserKeyboard();
  const exportModalOpen = useLaserCanvasUiStore((s) => s.exportModalOpen);
  const setExportModalOpen = useLaserCanvasUiStore((s) => s.setExportModalOpen);

  const {
    originalPreview,
    processedPreview,
    imageWidth,
    imageHeight,
    isGeneratingPreview,
    previewError,
    imageLoaded,
    params,
    imagePath,
  } = useImageStore();
  const { bedWidthMm, bedHeightMm, pixelsPerMm } = useSettingsStore();
  const workPx = computeWorkAreaPixels(bedWidthMm, bedHeightMm, pixelsPerMm);
  const [workW, workH] = workPx;

  const {
    editorTool,
    simulateScanlines,
    outlineScanPreviewMode,
    annotations,
    burnOverlayVisible,
    burnOverlayOpacity,
    machineHeadX,
    machineHeadY,
  } = useEditorUiStore();

  const burnPreviewImgRef = useRef<HTMLImageElement>(null);
  const [outlineScanPath, setOutlineScanPath] = useState<{
    points: Pixel[];
    jobW: number;
    jobH: number;
  } | null>(null);
  const outlineScanGen = useRef(0);

  const [bedLayout, setBedLayout] = useState({ bedW: 0, bedH: 0, stackW: 0, stackH: 0 });
  const bedLayoutRef = useRef(bedLayout);
  bedLayoutRef.current = bedLayout;

  const onBedStackLayout = useCallback((info: typeof bedLayout) => {
    setBedLayout(info);
  }, []);

  useEffect(() => {
    if (!originalPreview) return;
    useEditorUiStore.getState().resetMachineHead();
  }, [originalPreview]);

  useEffect(() => {
    if (!imageLoaded || imageWidth <= 0 || imageHeight <= 0) return;
    useEditorUiStore.getState().clampMachineHead();
  }, [imageLoaded, imageWidth, imageHeight, params.cropRect, params.resizeTo, bedWidthMm, bedHeightMm, pixelsPerMm]);

  const { translateXPx, translateYPx } = useMemo(() => {
    if (!imageLoaded || imageWidth <= 0 || imageHeight <= 0) {
      return { translateXPx: 0, translateYPx: 0 };
    }
    const { maxW, maxH, jobW, jobH } = jobMachineRegion({
      imageWidth,
      imageHeight,
      params,
      bedWidthMm,
      bedHeightMm,
      pixelsPerMm,
    });
    const mhx = Math.max(0, maxW - jobW);
    const mhy = Math.max(0, maxH - jobH);
    const spanX = Math.max(0, bedLayout.bedW - bedLayout.stackW);
    const spanY = Math.max(0, bedLayout.bedH - bedLayout.stackH);
    const tx = mhx > 0 && spanX > 0 ? (machineHeadX / mhx) * spanX : 0;
    const ty = mhy > 0 && spanY > 0 ? (machineHeadY / mhy) * spanY : 0;
    return { translateXPx: tx, translateYPx: ty };
  }, [
    imageLoaded,
    imageWidth,
    imageHeight,
    params,
    bedWidthMm,
    bedHeightMm,
    pixelsPerMm,
    bedLayout,
    machineHeadX,
    machineHeadY,
  ]);

  useEffect(() => {
    if (
      !simulateScanlines ||
      params.engraveMode !== 'outline' ||
      !originalPreview ||
      !processedPreview ||
      !burnOverlayVisible
    ) {
      setOutlineScanPath(null);
      return;
    }
    const gen = ++outlineScanGen.current;
    const rasterParams = toBrowserRasterParams(params);
    const mode = useEditorUiStore.getState().outlineScanPreviewMode;
    void rasterizeFromImageUrlWithGeometry(originalPreview, rasterParams)
      .then(({ lines, filledThresholdMask }) => {
        if (gen !== outlineScanGen.current) return;
        const jobW = lines[0]?.length ?? 0;
        const jobH = lines.length;
        if (jobW <= 0 || jobH <= 0) {
          setOutlineScanPath(null);
          return;
        }
        let points: Pixel[];
        if (mode === 'job') {
          points = repeatJobPoints(flattenJobPixels(lines), params.passes);
        } else if (filledThresholdMask) {
          const loops = boundaryLoopsFromFilledMask(filledThresholdMask);
          points = flattenContourLoops(loops);
          if (points.length === 0) points = flattenJobPixels(lines);
        } else {
          points = flattenJobPixels(lines);
        }
        if (points.length === 0) {
          setOutlineScanPath(null);
          return;
        }
        setOutlineScanPath({ points, jobW, jobH });
      })
      .catch(() => {
        if (gen !== outlineScanGen.current) return;
        setOutlineScanPath(null);
      });
  }, [
    simulateScanlines,
    params.engraveMode,
    params.passes,
    params.threshold,
    params.cropRect,
    params.resizeTo,
    params.brightness,
    params.contrast,
    params.invert,
    params.rotateDeg,
    params.flipH,
    params.flipV,
    params.ditherMode,
    outlineScanPreviewMode,
    originalPreview,
    processedPreview,
    burnOverlayVisible,
  ]);

  const burnOverlayStack = useMemo(() => {
    if (!processedPreview || !burnOverlayVisible) return null;
    const op = burnOverlayOpacity;
    const showRasterScanBar = simulateScanlines && params.engraveMode === 'raster';
    const showOutlineDot =
      simulateScanlines &&
      params.engraveMode === 'outline' &&
      outlineScanPath != null &&
      outlineScanPath.points.length > 0;

    return (
      <>
        <img
          ref={burnPreviewImgRef}
          src={processedPreview}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            opacity: op,
            pointerEvents: 'none',
            zIndex: 1,
            borderRadius: 6,
            imageRendering: 'pixelated',
            border: '1px solid rgba(0,0,0,0.35)',
            boxSizing: 'border-box',
          }}
        />
        {showRasterScanBar ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
            <BurnScanlines />
          </div>
        ) : null}
        {showOutlineDot ? (
          <BurnScanDotOverlay
            imgRef={burnPreviewImgRef}
            logicalWidth={outlineScanPath!.jobW}
            logicalHeight={outlineScanPath!.jobH}
            points={outlineScanPath!.points}
          />
        ) : null}
      </>
    );
  }, [
    processedPreview,
    burnOverlayVisible,
    burnOverlayOpacity,
    simulateScanlines,
    params.engraveMode,
    outlineScanPath,
  ]);

  const stackAfterBase =
    burnOverlayStack != null ? (
      <>
        {burnOverlayStack}
        <LiveEngraveLaserOverlay imgRef={burnPreviewImgRef} />
      </>
    ) : undefined;

  const overBed =
    annotations.length > 0 ? (
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

  const seedKey = `${imagePath ?? 'blob'}:${imageWidth}x${imageHeight}`;

  return (
    <div className="lf-workspace-playground">
      <ExportModal open={exportModalOpen} onClose={() => setExportModalOpen(false)} />
      <div className="lf-ps-toolbar-stack">
        <EditorToolbar workW={workW} workH={workH} />
        <EditorAdvancedToolbar />
      </div>
      <section className="lf-panel lf-stack" style={{ padding: 16 }}>
        <div className="lf-hint" style={{ color: 'var(--lf-text)', fontWeight: 600 }}>
          Bed {bedWidthMm}×{bedHeightMm} mm · job {imageWidth}×{imageHeight}px · canvas {workPx[0]}×{workPx[1]} px
          {isGeneratingPreview ? ' · …' : ''}
          {previewError ? <span style={{ color: 'var(--lf-danger)', marginLeft: 8 }}>{previewError}</span> : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          <div
            style={{
              flex: '0 0 auto',
              width: '100%',
              maxWidth: BED_EDITOR_VIEWPORT_W,
              position: 'relative',
              background: 'var(--lf-bg, #0f1117)',
              borderRadius: 10,
              padding: 12,
              boxSizing: 'border-box',
            }}
          >
            <div
              data-lf-bed-viewport
              style={{
                width: '100%',
                height: BED_EDITOR_VIEWPORT_H,
                maxWidth: BED_EDITOR_VIEWPORT_W,
                margin: '0 auto',
                overflow: 'auto',
                overscrollBehavior: 'contain',
                borderRadius: 8,
                border: '1px solid var(--lf-border)',
                background: 'rgba(0,0,0,0.25)',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  transform: `translate(${translateXPx}px, ${translateYPx}px)`,
                  display: 'inline-block',
                  verticalAlign: 'top',
                }}
              >
                {originalPreview ? (
                  <LaserCanvas
                    workW={workW}
                    workH={workH}
                    bedWidthMm={bedWidthMm}
                    bedHeightMm={bedHeightMm}
                    pixelsPerMm={pixelsPerMm}
                    seedKey={seedKey}
                    seedDataUrl={originalPreview}
                    onCanvasLayout={onBedStackLayout}
                  />
                ) : null}
                <div
                  style={{
                    position: 'absolute',
                    left: 20,
                    top: 20,
                    width: bedLayout.stackW || '100%',
                    height: bedLayout.stackH || '100%',
                    pointerEvents: 'none',
                    zIndex: 5,
                  }}
                >
                  {stackAfterBase}
                </div>
                {overBed ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: 20,
                      top: 20,
                      width: bedLayout.stackW || '100%',
                      height: bedLayout.stackH || '100%',
                      pointerEvents: editorTool === 'text' ? 'auto' : 'none',
                      zIndex: 6,
                    }}
                  >
                    {overBed}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div style={{ width: 280, flexShrink: 0 }}>
            <LayerPanel />
            <PropertiesPanel />
          </div>
        </div>
      </section>
      <WorkspaceJogOverlay />
    </div>
  );
}
