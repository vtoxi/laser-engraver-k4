import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import { useEditorHistoryStore } from '../../store/editorHistoryStore';
import { useEditorUiStore } from '../../store/editorUiStore';
import { useImageStore, type CropRectPayload } from '../../store/imageStore';
import type { CropAspectLock } from '../../store/editorUiStore';

const tbBtn: CSSProperties = {
  width: 40,
  height: 40,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: '1px solid var(--lf-border)',
  background: 'rgba(22, 28, 48, 0.75)',
  color: 'var(--lf-text)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
};

const tbBtnOn: CSSProperties = {
  ...tbBtn,
  borderColor: 'rgba(123, 97, 255, 0.55)',
  boxShadow: '0 0 0 1px rgba(123, 97, 255, 0.35)',
  background: 'rgba(123, 97, 255, 0.15)',
};

const tbBtnSm: CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid var(--lf-border)',
  background: 'rgba(22, 28, 48, 0.75)',
  color: 'var(--lf-text)',
  cursor: 'pointer',
};

function Btn(props: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      style={props.active ? tbBtnOn : tbBtn}
    >
      {props.children}
    </button>
  );
}

function toCommittedPayload(cropRect: CropRectPayload | null, iw: number, ih: number): CropRectPayload | null {
  if (!cropRect) return null;
  if (cropRect.x === 0 && cropRect.y === 0 && cropRect.width === iw && cropRect.height === ih) return null;
  return { ...cropRect };
}

function draftMatchesCommitted(
  draft: CropRectPayload,
  committed: CropRectPayload | null,
  iw: number,
  ih: number,
): boolean {
  const a = toCommittedPayload({ ...draft }, iw, ih);
  const b = committed;
  if (a === null && b === null) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function EditorToolbar() {
  const { params, updateParam, generatePreview, imageWidth, imageHeight } = useImageStore();
  const pastLen = useEditorHistoryStore((s) => s.past.length);
  const futureLen = useEditorHistoryStore((s) => s.future.length);
  const {
    editorTool,
    setEditorTool,
    simulateScanlines,
    setSimulateScanlines,
    cropAspectLock,
    setCropAspectLock,
    cropDraft,
    syncCropDraftWithParams,
    burnOverlayVisible,
    setBurnOverlayVisible,
    burnOverlayOpacity,
    setBurnOverlayOpacity,
    textDraft,
    setTextDraft,
    addTextAnnotation,
    clearAnnotations,
    resetMachineHead,
  } = useEditorUiStore();

  const iw = Math.max(1, imageWidth);
  const ih = Math.max(1, imageHeight);

  const cropDirty = useMemo(
    () => editorTool === 'crop' && !draftMatchesCommitted(cropDraft, params.cropRect, iw, ih),
    [editorTool, cropDraft, params.cropRect, iw, ih],
  );

  const runPreview = () => void generatePreview();

  const pushAnd = (fn: () => void) => {
    useEditorHistoryStore.getState().push();
    fn();
    runPreview();
  };

  const flipH = () => pushAnd(() => updateParam('flipH', !params.flipH));
  const flipV = () => pushAnd(() => updateParam('flipV', !params.flipV));
  const rotate = () => pushAnd(() => updateParam('rotateDeg', (params.rotateDeg + 90) % 360));
  const invert = () => pushAnd(() => updateParam('invert', !params.invert));

  const resetImageAdjust = () => {
    useEditorHistoryStore.getState().push();
    updateParam('cropRect', null);
    updateParam('flipH', false);
    updateParam('flipV', false);
    updateParam('rotateDeg', 0);
    updateParam('invert', false);
    clearAnnotations();
    resetMachineHead();
    syncCropDraftWithParams();
    runPreview();
    setEditorTool('select');
  };

  const applyCrop = () => {
    const cropRect =
      cropDraft.x === 0 && cropDraft.y === 0 && cropDraft.width === iw && cropDraft.height === ih
        ? null
        : { x: cropDraft.x, y: cropDraft.y, width: cropDraft.width, height: cropDraft.height };
    useEditorHistoryStore.getState().push();
    const nextParams = { ...useImageStore.getState().params, cropRect };
    useImageStore.setState({ params: nextParams });
    void useImageStore.getState().generatePreview(nextParams);
    syncCropDraftWithParams();
    useEditorUiStore.getState().clampMachineHead();
    setEditorTool('select');
  };

  const cancelCrop = () => {
    syncCropDraftWithParams();
  };

  const applyText = () => {
    const t = (textDraft ?? '').trim();
    if (!t) return;
    useEditorHistoryStore.getState().push();
    addTextAnnotation(t);
    setTextDraft(null);
    setEditorTool('text');
  };

  const cancelText = () => setTextDraft(null);

  const cycleAspect = () => {
    const order: CropAspectLock[] = ['free', '1:1', 'bed'];
    const i = order.indexOf(cropAspectLock);
    setCropAspectLock(order[(i + 1) % order.length]);
  };

  const aspectLabel = cropAspectLock === 'free' ? '∿' : cropAspectLock === '1:1' ? '1∶1' : '⊡';
  const aspectTitle =
    cropAspectLock === 'free'
      ? 'Crop aspect: free — click to lock 1∶1 (corner drags keep ratio)'
      : cropAspectLock === '1:1'
        ? 'Crop aspect: 1∶1 — click to match machine bed ratio'
        : 'Crop aspect: match bed — click for free aspect';

  const showCropActions = cropDirty;
  const showTextActions = textDraft !== null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 'var(--lf-radius-sm)',
        border: '1px solid var(--lf-border)',
        background: 'rgba(14, 18, 32, 0.55)',
        marginBottom: 0,
      }}
    >
      <Btn
        title="Undo — revert last editor change (crop, transform, text)"
        onClick={() => void useEditorHistoryStore.getState().undo()}
        disabled={pastLen === 0}
      >
        ↶
      </Btn>
      <Btn
        title="Redo — reapply undone change"
        onClick={() => void useEditorHistoryStore.getState().redo()}
        disabled={futureLen === 0}
      >
        ↷
      </Btn>

      <span style={{ width: 1, height: 28, background: 'var(--lf-border)', margin: '0 4px' }} />

      <Btn title="Flip horizontal — mirror image left / right" onClick={flipH}>
        <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>⇄</span>
      </Btn>
      <Btn title="Flip vertical — mirror image top / bottom" onClick={flipV}>
        <span style={{ transform: 'scaleY(-1)', display: 'inline-block' }}>⇅</span>
      </Btn>
      <Btn title="Rotate 90° clockwise" onClick={rotate}>
        ↻
      </Btn>
      <Btn title="Invert — negative / photographic inverse" onClick={invert}>
        <span style={{ fontSize: 15 }}>☯</span>
      </Btn>

      <span style={{ width: 1, height: 28, background: 'var(--lf-border)', margin: '0 4px' }} />

      <Btn
        title="Crop tool — drag frame and handles on the bed; use Apply crop / Cancel in the bar below when done"
        active={editorTool === 'crop'}
        onClick={() => setEditorTool('crop')}
      >
        ▢
      </Btn>
      <Btn title={aspectTitle} onClick={cycleAspect} active={cropAspectLock !== 'free'}>
        {aspectLabel}
      </Btn>
      <Btn
        title="Select — default; no crop drag or bed pan"
        active={editorTool === 'select'}
        onClick={() => setEditorTool('select')}
      >
        ◉
      </Btn>
      <Btn
        title="Pan — drag the image on the bed to set job origin; machine jogs when connected"
        active={editorTool === 'pan'}
        onClick={() => setEditorTool('pan')}
      >
        ✥
      </Btn>
      <Btn
        title="Text — add a label on the bed (type below, then Apply text)"
        active={editorTool === 'text'}
        onClick={() => {
          setEditorTool('text');
          setTextDraft('');
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--lf-cyan)' }}>A</span>
      </Btn>
      <Btn
        title="Reset — clear crop, flips, rotation, invert, text labels, and bed head position"
        onClick={() => void resetImageAdjust()}
      >
        🗑
      </Btn>

      <span style={{ width: 1, height: 28, background: 'var(--lf-border)', margin: '0 4px' }} />

      <label
        title="Show or hide the processed burn preview on top of the source image"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--lf-muted)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          title="Toggle burn overlay"
          aria-label="Toggle burn overlay on the bed preview"
          checked={burnOverlayVisible}
          onChange={(e) => setBurnOverlayVisible(e.target.checked)}
        />
        Burn
      </label>
      <label
        title="Blend between source image and burn preview (0% = source only, 100% = full burn opacity)"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--lf-muted)',
          cursor: 'pointer',
          minWidth: 120,
        }}
      >
        <span style={{ whiteSpace: 'nowrap' }}>Mix</span>
        <input
          type="range"
          title={`Burn mix: ${Math.round(burnOverlayOpacity * 100)}%`}
          aria-label={`Burn overlay mix, ${Math.round(burnOverlayOpacity * 100)} percent`}
          min={0}
          max={100}
          value={Math.round(burnOverlayOpacity * 100)}
          disabled={!burnOverlayVisible}
          onChange={(e) => setBurnOverlayOpacity(Number(e.target.value) / 100)}
          style={{ flex: 1, minWidth: 60 }}
        />
      </label>
      <label
        title="Animate a horizontal scan line over the burn preview (visual only)"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--lf-muted)',
          cursor: 'pointer',
          marginLeft: 4,
        }}
      >
        <input
          type="checkbox"
          title="Toggle scanline animation on burn preview"
          aria-label="Toggle scanline animation on burn preview"
          checked={simulateScanlines}
          onChange={(e) => setSimulateScanlines(e.target.checked)}
        />
        Scanlines
      </label>

      {(showCropActions || showTextActions) && (
        <div
          style={{
            flexBasis: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingTop: 8,
            borderTop: '1px solid rgba(130, 160, 255, 0.12)',
          }}
        >
          {showTextActions && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <input
                className="lf-input"
                placeholder="Label text"
                title="Text shown on the machine bed preview"
                aria-label="Text label for bed annotation"
                value={textDraft ?? ''}
                onChange={(e) => setTextDraft(e.target.value)}
                style={{ flex: 1, minWidth: 160, maxWidth: 360 }}
              />
              <button
                type="button"
                className="lf-btn lf-btn--primary"
                style={tbBtnSm}
                title="Place this text on the bed (saved in history)"
                aria-label="Apply text to bed"
                onClick={applyText}
              >
                Apply text
              </button>
              <button
                type="button"
                className="lf-btn lf-btn--ghost"
                style={tbBtnSm}
                title="Discard text entry without adding a label"
                aria-label="Cancel text entry"
                onClick={cancelText}
              >
                Cancel
              </button>
            </div>
          )}
          {showCropActions && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="lf-btn lf-btn--primary"
                style={tbBtnSm}
                title="Commit crop rectangle to the job and regenerate preview"
                aria-label="Apply crop to job"
                onClick={() => void applyCrop()}
              >
                Apply crop
              </button>
              <button
                type="button"
                className="lf-btn lf-btn--ghost"
                style={tbBtnSm}
                title="Revert crop draft to last applied crop"
                aria-label="Cancel crop changes"
                onClick={cancelCrop}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
