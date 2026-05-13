import { useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { CropRectPayload } from '../../store/imageStore';
import type { BedStackLayout } from './BedFramedImage';
import { BedFramedImage } from './BedFramedImage';
import { InteractiveCropOverlay } from './InteractiveCropOverlay';

type Props = {
  src: string;
  alt: string;
  imageWidth: number;
  imageHeight: number;
  bedWidthMm: number;
  bedHeightMm: number;
  imgStyle?: CSSProperties;
  cropAspectWOverH: number | null;
  cropInteractive: boolean;
  showCropOverlay: boolean;
  overBed?: ReactNode;
  stackAfterBase?: ReactNode;
  controlledCrop?: { rect: CropRectPayload; onChange: (next: CropRectPayload | null) => void } | undefined;
  translateXPx?: number;
  translateYPx?: number;
  panTool?: boolean;
  onPanPixelDelta?: (dx: number, dy: number) => void;
  onBedStackLayout?: (info: BedStackLayout) => void;
  imageClipPath?: string;
};

/** Raster inside machine bed frame + optional crop UI. */
export function WorkspaceOriginalPreview(props: Props) {
  const {
    src,
    alt,
    imageWidth,
    imageHeight,
    bedWidthMm,
    bedHeightMm,
    imgStyle,
    cropAspectWOverH,
    cropInteractive,
    showCropOverlay,
    overBed,
    stackAfterBase,
    controlledCrop,
    translateXPx,
    translateYPx,
    panTool,
    onPanPixelDelta,
    onBedStackLayout,
    imageClipPath,
  } = props;
  const imgRef = useRef<HTMLImageElement>(null);

  return (
    <BedFramedImage
      bedWidthMm={bedWidthMm}
      bedHeightMm={bedHeightMm}
      showGrid
      src={src}
      alt={alt}
      imgRef={imgRef}
      imgStyle={imgStyle}
      overBed={overBed}
      stackAfterBase={stackAfterBase}
      translateXPx={translateXPx}
      translateYPx={translateYPx}
      panEnabled={!!panTool}
      onPanPixelDelta={onPanPixelDelta}
      onBedStackLayout={onBedStackLayout}
      imageClipPath={imageClipPath}
    >
      {showCropOverlay && imageWidth > 0 && imageHeight > 0 && (
        <InteractiveCropOverlay
          imgRef={imgRef}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          aspectWOverH={cropAspectWOverH}
          interactive={cropInteractive}
          controlledCrop={controlledCrop}
        />
      )}
    </BedFramedImage>
  );
}
