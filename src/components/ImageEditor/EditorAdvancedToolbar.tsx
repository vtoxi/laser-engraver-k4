import { useCallback } from 'react';
import { useEditorHistoryStore } from '../../store/editorHistoryStore';
import { useImageStore } from '../../store/imageStore';

/**
 * Photoshop-style options bar: precise transform and document readout.
 * Quick tools stay in {@link EditorToolbar}; numeric / preset transforms live here.
 */
export function EditorAdvancedToolbar() {
  const { params, updateParam, generatePreview, imageWidth, imageHeight } = useImageStore();
  const iw = Math.max(1, imageWidth);
  const ih = Math.max(1, imageHeight);

  const runPreview = useCallback(() => void generatePreview(), [generatePreview]);

  const pushAnd = useCallback(
    (fn: () => void) => {
      useEditorHistoryStore.getState().push();
      fn();
      runPreview();
    },
    [runPreview],
  );

  const setRotate = (deg: 0 | 90 | 180 | 270) =>
    pushAnd(() => updateParam('rotateDeg', deg));

  return (
    <div className="lf-ps-dock" role="toolbar" aria-label="Transform and document options">
      <span className="lf-ps-dock__brand">Options</span>

      <div className="lf-ps-dock__group">
        <span className="lf-ps-dock__label">Rotate</span>
        <div className="lf-ps-dock__chips">
          {([0, 90, 180, 270] as const).map((deg) => (
            <button
              key={deg}
              type="button"
              className={`lf-ps-opt lf-ps-opt--sm${params.rotateDeg === deg ? ' lf-ps-opt--on' : ''}`}
              title={`Set rotation to ${deg}°`}
              aria-label={`Set rotation to ${deg} degrees`}
              aria-pressed={params.rotateDeg === deg}
              onClick={() => setRotate(deg)}
            >
              {deg}°
            </button>
          ))}
        </div>
      </div>

      <div className="lf-ps-dock__group">
        <span className="lf-ps-dock__label">Adjust</span>
        <div className="lf-ps-dock__chips">
          <button
            type="button"
            className={`lf-ps-opt${params.invert ? ' lf-ps-opt--on' : ''}`}
            title="Invert luminance"
            aria-pressed={params.invert}
            onClick={() => pushAnd(() => updateParam('invert', !params.invert))}
          >
            Invert
          </button>
          <button
            type="button"
            className={`lf-ps-opt${params.flipH ? ' lf-ps-opt--on' : ''}`}
            title="Flip horizontal"
            aria-pressed={params.flipH}
            onClick={() => pushAnd(() => updateParam('flipH', !params.flipH))}
          >
            Flip H
          </button>
          <button
            type="button"
            className={`lf-ps-opt${params.flipV ? ' lf-ps-opt--on' : ''}`}
            title="Flip vertical"
            aria-pressed={params.flipV}
            onClick={() => pushAnd(() => updateParam('flipV', !params.flipV))}
          >
            Flip V
          </button>
        </div>
      </div>

      <div className="lf-ps-dock__meta" title="Source document size in pixels">
        <span className="lf-ps-dock__meta-k">Document</span>
        <span className="lf-ps-dock__meta-v">
          {iw} × {ih} px
        </span>
      </div>
    </div>
  );
}
