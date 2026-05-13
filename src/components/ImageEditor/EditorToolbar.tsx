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
    syncCropDraftWithParams();
    runPreview();
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
        marginBottom: 12,
      }}
    >
      <Btn title="Undo" onClick={() => void useEditorHistoryStore.getState().undo()} disabled={pastLen === 0}>
        ↶
      </Btn>
      <Btn title="Redo" onClick={() => void useEditorHistoryStore.getState().redo()} disabled={futureLen === 0}>
        ↷
      </Btn>

      <span style={{ width: 1, height: 28, background: 'var(--lf-border)', margin: '0 4px' }} />

      <Btn title="Flip horizontal" onClick={flipH}>
        <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>⇄</span>
      </Btn>
      <Btn title="Flip vertical" onClick={flipV}>
        <span style={{ transform: 'scaleY(-1)', display: 'inline-block' }}>⇅</span>
      </Btn>
      <Btn title="Rotate 90°" onClick={rotate}>
        ↻
      </Btn>
      <Btn title="Invert (negative)" onClick={invert}>
        <span style={{ fontSize: 15 }}>☯</span>
      </Btn>

      <span style={{ width: 1, height: 28, background: 'var(--lf-border)', margin: '0 4px' }} />

      <Btn title="Crop — drag frame; Apply or Cancel when done" active={editorTool === 'crop'} onClick={() => setEditorTool('crop')}>
        ▢
      </Btn>
      <Btn
        title="Crop aspect: free → 1∶1 → match bed (corners only)"
        onClick={cycleAspect}
        active={cropAspectLock !== 'free'}
      >
        {aspectLabel}
      </Btn>
      <Btn title="Select (no crop drag)" active={editorTool === 'select'} onClick={() => setEditorTool('select')}>
        ◉
      </Btn>
      <Btn
        title="Add text on bed"
        active={editorTool === 'text'}
        onClick={() => {
          setEditorTool('text');
          setTextDraft('');
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--lf-cyan)' }}>A</span>
      </Btn>
      <Btn title="Reset crop, flips, rotation, invert, and text labels" onClick={() => void resetImageAdjust()}>
        🗑
      </Btn>

      <span style={{ width: 1, height: 28, background: 'var(--lf-border)', margin: '0 4px' }} />

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--lf-muted)',
          cursor: 'pointer',
        }}
      >
        <input type="checkbox" checked={burnOverlayVisible} onChange={(e) => setBurnOverlayVisible(e.target.checked)} />
        Burn
      </label>
      <label
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
          min={0}
          max={100}
          value={Math.round(burnOverlayOpacity * 100)}
          disabled={!burnOverlayVisible}
          onChange={(e) => setBurnOverlayOpacity(Number(e.target.value) / 100)}
          style={{ flex: 1, minWidth: 60 }}
        />
      </label>
      <label
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
                value={textDraft ?? ''}
                onChange={(e) => setTextDraft(e.target.value)}
                style={{ flex: 1, minWidth: 160, maxWidth: 360 }}
              />
              <button type="button" className="lf-btn lf-btn--primary" style={tbBtnSm} onClick={applyText}>
                Apply text
              </button>
              <button type="button" className="lf-btn lf-btn--ghost" style={tbBtnSm} onClick={cancelText}>
                Cancel
              </button>
            </div>
          )}
          {showCropActions && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span className="lf-hint" style={{ flex: 1, minWidth: 140 }}>
                Crop changed — apply to job or cancel.
              </span>
              <button type="button" className="lf-btn lf-btn--primary" style={tbBtnSm} onClick={() => void applyCrop()}>
                Apply crop
              </button>
              <button type="button" className="lf-btn lf-btn--ghost" style={tbBtnSm} onClick={cancelCrop}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
