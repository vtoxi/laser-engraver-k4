import type { CSSProperties, ReactNode, RefObject } from 'react';

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
};

/**
 * Machine bed aspect ratio; image letterboxed inside (contain). Optional mm grid on bed.
 */
export function BedFramedImage(props: Props) {
  const { bedWidthMm, bedHeightMm, showGrid = true, src, alt, imgRef, imgStyle, children, overBed, stackAfterBase } =
    props;
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
          style={{
            position: 'relative',
            width: 'fit-content',
            height: 'fit-content',
            maxWidth: '100%',
            maxHeight: '100%',
            zIndex: 1,
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
