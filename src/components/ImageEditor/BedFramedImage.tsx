import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

export type BedStackLayout = { bedW: number; bedH: number; stackW: number; stackH: number };

type Props = {
  bedWidthMm: number;
  bedHeightMm: number;
  /** Draw faint mm grid (10 mm cells when divisible, else one cell = full bed). */
  showGrid?: boolean;
  src: string;
  alt: string;
  imgRef?: RefObject<HTMLImageElement | null>;
  imgStyle?: CSSProperties;
  children?: ReactNode;
  /** Rendered above the image, positioned over the full bed frame (e.g. text annotations). */
  overBed?: ReactNode;
  /** Inserted after the base image inside the letterboxed frame (e.g. burn overlay). */
  stackAfterBase?: ReactNode;
  /** Extra translate on the image stack (px), e.g. machine head → bed pan. */
  translateXPx?: number;
  translateYPx?: number;
  /** When true, drag on the stack reports pixel deltas via `onPanPixelDelta`. */
  panEnabled?: boolean;
  onPanPixelDelta?: (dx: number, dy: number) => void;
  /** Bed inner vs stack size for mapping head position to pixels. */
  onBedStackLayout?: (info: BedStackLayout) => void;
  /** Clips image + stack children to this crop (CSS clip-path), e.g. committed crop. */
  imageClipPath?: string;
};

/**
 * Machine bed aspect ratio; image letterboxed inside (contain). Optional mm grid on bed.
 */
export function BedFramedImage(props: Props) {
  const {
    bedWidthMm,
    bedHeightMm,
    showGrid = true,
    src,
    alt,
    imgRef,
    imgStyle,
    children,
    overBed,
    stackAfterBase,
    translateXPx = 0,
    translateYPx = 0,
    panEnabled = false,
    onPanPixelDelta,
    onBedStackLayout,
    imageClipPath,
  } = props;
  const bedInnerRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);
  const panWindowHandlersRef = useRef<{
    move: (ev: PointerEvent) => void;
    up: (ev: PointerEvent) => void;
  } | null>(null);

  const publishLayout = useCallback(() => {
    const bedEl = bedInnerRef.current;
    const stackEl = stackRef.current;
    if (!bedEl || !stackEl || !onBedStackLayout) return;
    const bedW = bedEl.clientWidth;
    const bedH = bedEl.clientHeight;
    const stackW = stackEl.offsetWidth;
    const stackH = stackEl.offsetHeight;
    if (bedW <= 0 || bedH <= 0) return;
    onBedStackLayout({ bedW, bedH, stackW, stackH });
  }, [onBedStackLayout]);

  useEffect(() => {
    if (!onBedStackLayout) return;
    const bedEl = bedInnerRef.current;
    const stackEl = stackRef.current;
    if (!bedEl || !stackEl) return;
    publishLayout();
    const ro = new ResizeObserver(() => publishLayout());
    ro.observe(bedEl);
    ro.observe(stackEl);
    return () => ro.disconnect();
  }, [onBedStackLayout, publishLayout, src]);

  useEffect(() => {
    return () => {
      const h = panWindowHandlersRef.current;
      if (h) {
        window.removeEventListener('pointermove', h.move);
        window.removeEventListener('pointerup', h.up);
        window.removeEventListener('pointercancel', h.up);
        panWindowHandlersRef.current = null;
      }
      lastPanRef.current = null;
    };
  }, []);

  const startPan = useCallback(
    (e: React.PointerEvent) => {
      if (!panEnabled || !onPanPixelDelta || e.button !== 0) return;
      e.preventDefault();
      const prevHandlers = panWindowHandlersRef.current;
      if (prevHandlers) {
        window.removeEventListener('pointermove', prevHandlers.move);
        window.removeEventListener('pointerup', prevHandlers.up);
        window.removeEventListener('pointercancel', prevHandlers.up);
      }
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      setPanning(true);
      const move = (ev: PointerEvent) => {
        if (!onPanPixelDelta || !lastPanRef.current) return;
        const prev = lastPanRef.current;
        const dx = ev.clientX - prev.x;
        const dy = ev.clientY - prev.y;
        lastPanRef.current = { x: ev.clientX, y: ev.clientY };
        if (dx !== 0 || dy !== 0) onPanPixelDelta(dx, dy);
      };
      const up = () => {
        const h = panWindowHandlersRef.current;
        if (h) {
          window.removeEventListener('pointermove', h.move);
          window.removeEventListener('pointerup', h.up);
          window.removeEventListener('pointercancel', h.up);
          panWindowHandlersRef.current = null;
        }
        lastPanRef.current = null;
        setPanning(false);
      };
      panWindowHandlersRef.current = { move, up };
      window.addEventListener('pointermove', move, { passive: true });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [panEnabled, onPanPixelDelta],
  );

  const bw = Math.max(1, bedWidthMm);
  const bh = Math.max(1, bedHeightMm);
  const stepMm = 10;
  const gx = (stepMm / bw) * 100;
  const gy = (stepMm / bh) * 100;

  const gridBg =
    showGrid && gx > 0 && gy > 0
      ? {
          backgroundImage: [
            `repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px ${gx}%)`,
            `repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 1px, transparent 1px ${gy}%)`,
          ].join(','),
        }
      : {};

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        ref={bedInnerRef}
        title={`Machine bed ${bw}×${bh} mm`}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${bw} / ${bh}`,
          boxSizing: 'border-box',
          borderRadius: 'var(--lf-radius-sm)',
          border: '2px solid rgba(160, 170, 200, 0.35)',
          background: 'rgba(8, 10, 18, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          touchAction: panEnabled ? 'none' : undefined,
          cursor: panEnabled ? (panning ? 'grabbing' : 'grab') : undefined,
          userSelect: panEnabled ? 'none' : undefined,
          ...gridBg,
        }}
        onPointerDown={startPan}
      >
        <div
          ref={stackRef}
          style={{
            position: 'relative',
            width: 'fit-content',
            height: 'fit-content',
            maxWidth: '100%',
            maxHeight: '100%',
            zIndex: 1,
            transform: `translate(${translateXPx}px, ${translateYPx}px)`,
            touchAction: panEnabled ? 'none' : undefined,
          }}
        >
          <div
            style={{
              position: 'relative',
              borderRadius: 6,
              overflow: imageClipPath ? 'hidden' : undefined,
              clipPath: imageClipPath,
              WebkitClipPath: imageClipPath,
              touchAction: panEnabled ? 'none' : undefined,
              isolation: 'isolate',
            }}
          >
            <img
              ref={imgRef as React.Ref<HTMLImageElement>}
              src={src}
              alt={alt}
              draggable={false}
              onDragStart={(ev) => ev.preventDefault()}
              className="lf-bed-stack__img"
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                borderRadius: 6,
                ...imgStyle,
              }}
            />
            {stackAfterBase}
            {children}
          </div>
        </div>
        {overBed != null ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              borderRadius: 'var(--lf-radius-sm)',
              pointerEvents: 'none',
            }}
          >
            {overBed}
          </div>
        ) : null}
      </div>
    </div>
  );
}
