import { useState } from 'react';
import { useSerialStore } from '../../store/serialStore';

const STEP = 10;

/** Compact corner jog pad (axis cross); numeric X/Y + Go expand on demand. */
export function WorkspaceJogOverlay() {
  const { connectionState, jog } = useSerialStore();
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const disabled = connectionState !== 'connected';

  const go = (dx: number, dy: number) => {
    const nx = Math.max(0, x + dx);
    const ny = Math.max(0, y + dy);
    setX(nx);
    setY(ny);
    void jog(nx, ny);
  };

  return (
    <div className="lf-jog-dock" aria-label="Jog machine">
      <div className="lf-jog-dock__card">
        <div className="lf-jog-dock__badge" title="Step per arrow click">
          <span className="lf-jog-dock__badge-step">{STEP}</span>
          <span className="lf-jog-dock__badge-unit">px</span>
        </div>

        {expanded && (
          <div className="lf-jog-dock__numeric">
            <div className="lf-jog-dock__row">
              <label className="lf-jog-dock__field">
                <span className="lf-jog-dock__axis lf-jog-dock__axis--x">X</span>
                <input
                  className="lf-input lf-jog-dock__input"
                  type="number"
                  min={0}
                  value={x}
                  onChange={(e) => setX(Math.max(0, Number(e.target.value) || 0))}
                  disabled={disabled}
                />
              </label>
              <label className="lf-jog-dock__field">
                <span className="lf-jog-dock__axis lf-jog-dock__axis--y">Y</span>
                <input
                  className="lf-input lf-jog-dock__input"
                  type="number"
                  min={0}
                  value={y}
                  onChange={(e) => setY(Math.max(0, Number(e.target.value) || 0))}
                  disabled={disabled}
                />
              </label>
            </div>
            <button
              type="button"
              className="lf-btn lf-btn--ghost lf-jog-dock__go"
              disabled={disabled}
              title="Move head to X / Y"
              onClick={() => void jog(x, y)}
            >
              Go
            </button>
          </div>
        )}

        <div className="lf-jog-dock__cross" role="group" aria-label="Jog relative">
          <span className="lf-jog-dock__sp" />
          <button
            type="button"
            className="lf-jog-dock__arrow lf-jog-dock__arrow--y"
            disabled={disabled}
            title={`Y −${STEP} (up)`}
            onClick={() => go(0, -STEP)}
          >
            <svg className="lf-jog-dock__chev" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 5 L19 14 H5 Z" fill="currentColor" />
            </svg>
          </button>
          <span className="lf-jog-dock__sp" />

          <button
            type="button"
            className="lf-jog-dock__arrow lf-jog-dock__arrow--x"
            disabled={disabled}
            title={`X −${STEP} (left)`}
            onClick={() => go(-STEP, 0)}
          >
            <svg className="lf-jog-dock__chev lf-jog-dock__chev--left" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 12 L17 5 V19 Z" fill="currentColor" />
            </svg>
          </button>

          <button
            type="button"
            className="lf-jog-dock__hub"
            disabled={disabled}
            title={expanded ? 'Hide position entry' : 'Position & Go'}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <svg viewBox="0 0 24 24" className="lf-jog-dock__hub-icon" aria-hidden>
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <path
                d="M12 2v4M12 18v4M2 12h4M18 12h4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
                opacity="0.45"
              />
            </svg>
          </button>

          <button
            type="button"
            className="lf-jog-dock__arrow lf-jog-dock__arrow--x"
            disabled={disabled}
            title={`X +${STEP} (right)`}
            onClick={() => go(STEP, 0)}
          >
            <svg className="lf-jog-dock__chev lf-jog-dock__chev--right" viewBox="0 0 24 24" aria-hidden>
              <path d="M16 12 L7 5 V19 Z" fill="currentColor" />
            </svg>
          </button>

          <span className="lf-jog-dock__sp" />
          <button
            type="button"
            className="lf-jog-dock__arrow lf-jog-dock__arrow--y"
            disabled={disabled}
            title={`Y +${STEP} (down)`}
            onClick={() => go(0, STEP)}
          >
            <svg className="lf-jog-dock__chev lf-jog-dock__chev--down" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 19 L5 10 H19 Z" fill="currentColor" />
            </svg>
          </button>
          <span className="lf-jog-dock__sp" />
        </div>
      </div>
    </div>
  );
}
