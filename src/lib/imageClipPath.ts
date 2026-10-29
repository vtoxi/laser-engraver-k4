import type { CropRectPayload } from '../store/imageStore';

/** CSS `clip-path: inset(... %)` so only the crop region of the source bitmap is visible. */
export function imageClipPathFromCrop(
  rect: CropRectPayload | null,
  imageWidth: number,
  imageHeight: number,
): string | undefined {
  if (!rect || imageWidth <= 0 || imageHeight <= 0) return undefined;
  const iw = imageWidth;
  const ih = imageHeight;
  const xi = Math.max(0, Math.min(rect.x, iw - 1));
  const yi = Math.max(0, Math.min(rect.y, ih - 1));
  const wi = Math.max(1, Math.min(rect.width, iw - xi));
  const hi = Math.max(1, Math.min(rect.height, ih - yi));
  if (xi === 0 && yi === 0 && wi >= iw && hi >= ih) return undefined;
  const top = (yi / ih) * 100;
  const left = (xi / iw) * 100;
  const right = ((iw - xi - wi) / iw) * 100;
  const bottom = ((ih - yi - hi) / ih) * 100;
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
}
