import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { Pixel } from '../../lib/rasterJobPath';
import { logicalPixelToElementFraction } from '../../lib/imgDisplayRect';

type Props = {
  imgRef: RefObject<HTMLImageElement | null>;
  /** Logical bitmap size matching `points` (job raster width / height). */
  logicalWidth: number;
  logicalHeight: number;
  points: Pixel[];
  /** Pixels advanced per animation tick. */
  pixelsPerTick?: number;
};

/**
 * Single “laser dot” over the burn preview, following an ordered pixel path (job or contour).
 */
export function BurnScanDotOverlay(props: Props) {
  const { imgRef, logicalWidth, logicalHeight, points, pixelsPerTick = 3 } = props;
  const [idx, setIdx] = useState(0);
  const [layoutTick, setLayoutTick] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [points]);

  useEffect(() => {
    if (points.length === 0) return;
    let raf = 0;
    const tick = () => {
      setIdx((i) => (i + pixelsPerTick) % points.length);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [points, pixelsPerTick]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLayoutTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [imgRef]);

  const img = imgRef.current;
  const lw = Math.max(1, logicalWidth);
  const lh = Math.max(1, logicalHeight);
  const p = points.length > 0 ? points[Math.min(idx, points.length - 1)] : null;

  if (!p || !img) return null;

  const { u, v } = logicalPixelToElementFraction(img, p.x + 0.5, p.y + 0.5, lw, lh);

  return (
    <div
      data-layout={layoutTick}
      style={{
        position: 'absolute',
        left: `${u * 100}%`,
        top: `${v * 100}%`,
        width: 10,
        height: 10,
        marginLeft: -5,
        marginTop: -5,
        borderRadius: '50%',
        background: 'rgba(231, 76, 60, 0.95)',
        boxShadow: '0 0 14px rgba(231,76,60,0.85), 0 0 4px #fff',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    />
  );
}
