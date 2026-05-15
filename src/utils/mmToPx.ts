/** Canvas / job pixels per mm from machine settings (not a fixed 6px/mm). */
export function mmToPx(mm: number, pixelsPerMm: number, zoom = 1): number {
  return mm * pixelsPerMm * zoom;
}

export function pxToMm(px: number, pixelsPerMm: number, zoom = 1): number {
  const d = pixelsPerMm * zoom;
  return d === 0 ? 0 : px / d;
}
