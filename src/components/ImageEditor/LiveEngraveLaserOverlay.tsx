import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { useSerialStore } from '../../store/serialStore';
import { logicalPixelToElementFraction } from '../../lib/imgDisplayRect';

type Props = {
  imgRef: RefObject<HTMLImageElement | null>;
};

/** Approximate laser head position from current raster line (job pixel space → burn preview image). */
export function LiveEngraveLaserOverlay(props: Props) {
  const { imgRef } = props;
  const live = useSerialStore((s) => s.liveEngrave);
  const [, setTick] = useState(0);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || !live) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [imgRef, live]);

  if (!live) return null;

  const { jobPixelW, jobPixelH, lineY } = live;
  const w = Math.max(1, jobPixelW);
  const h = Math.max(1, jobPixelH);
  const y = Math.max(0, Math.min(lineY, h - 1));
  const img = imgRef.current;
  if (!img) return null;

  const left = logicalPixelToElementFraction(img, 0.5, y + 0.5, w, h);
  const right = logicalPixelToElementFraction(img, w - 0.5, y + 0.5, w, h);
  const u0 = Math.min(left.u, right.u);
  const u1 = Math.max(left.u, right.u);
  const vmid = (left.v + right.v) / 2;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: `${u0 * 100}%`,
          width: `${Math.max(0.01, (u1 - u0)) * 100}%`,
          top: `${vmid * 100}%`,
          height: 3,
          marginTop: -1.5,
          background: 'rgba(231, 76, 60, 0.45)',
          boxShadow: '0 0 10px rgba(231,76,60,0.55)',
          pointerEvents: 'none',
          zIndex: 5,
          borderRadius: 1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${((left.u + right.u) / 2) * 100}%`,
          top: `${vmid * 100}%`,
          width: 12,
          height: 12,
          marginLeft: -6,
          marginTop: -6,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.9)',
          background: 'rgba(231, 76, 60, 0.95)',
          boxShadow: '0 0 16px rgba(231,76,60,0.9)',
          pointerEvents: 'none',
          zIndex: 6,
        }}
      />
    </>
  );
}
