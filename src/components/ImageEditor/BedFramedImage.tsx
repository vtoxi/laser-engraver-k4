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
  } = props;
  const bedInnerRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);

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
          ...gridBg,
        }}
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
            cursor: panEnabled ? (panning ? 'grabbing' : 'grab') : undefined,
          }}
          onPointerDown={(e) => {
            if (!panEnabled || !onPanPixelDelta) return;
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            lastPanRef.current = { x: e.clientX, y: e.clientY };
            setPanning(true);
          }}
          onPointerMove={(e) => {
            if (!panEnabled || !onPanPixelDelta || !lastPanRef.current) return;
            const prev = lastPanRef.current;
            const dx = e.clientX - prev.x;
            const dy = e.clientY - prev.y;
            lastPanRef.current = { x: e.clientX, y: e.clientY };
            if (dx !== 0 || dy !== 0) onPanPixelDelta(dx, dy);
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            lastPanRef.current = null;
            setPanning(false);
          }}
          onPointerCancel={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            lastPanRef.current = null;
            setPanning(false);
          }}
        >
          <img
            ref={imgRef as React.Ref<HTMLImageElement>}
            src={src}
            alt={alt}
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
