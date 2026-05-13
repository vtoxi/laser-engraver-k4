import type { CSSProperties } from 'react';
import { computeWorkAreaPixels, machineBedOverlayPercents } from '../../store/settingsStore';

type Props = {
  src: string;
  alt: string;
  imageWidth: number;
  imageHeight: number;
  bedWidthMm: number;
  bedHeightMm: number;
  pixelsPerMm: number;
  imgStyle?: CSSProperties;
};

export function MachineBedOverlay(props: Props) {
  const {
    src,
    alt,
    imageWidth,
    imageHeight,
    bedWidthMm,
    bedHeightMm,
    pixelsPerMm,
    imgStyle,
  } = props;
  const pct = machineBedOverlayPercents(imageWidth, imageHeight, bedWidthMm, bedHeightMm);
  const [workW, workH] = computeWorkAreaPixels(bedWidthMm, bedHeightMm, pixelsPerMm);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <img src={src} alt={alt} style={{ width: '100%', display: 'block', borderRadius: 6, ...imgStyle }} />
      {pct.widthPct > 0 && pct.heightPct > 0 && (
        <div
          title={`Machine bed ${bedWidthMm}×${bedHeightMm} mm — raster ~${workW}×${workH}px at current px/mm`}
          style={{
            position: 'absolute',
            left: `${pct.leftPct}%`,
            top: `${pct.topPct}%`,
            width: `${pct.widthPct}%`,
            height: `${pct.heightPct}%`,
            boxSizing: 'border-box',
            border: '2px dashed rgba(142, 68, 173, 0.95)',
            borderRadius: 4,
            pointerEvents: 'none',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.35) inset',
          }}
        />
      )}
    </div>
  );
}
