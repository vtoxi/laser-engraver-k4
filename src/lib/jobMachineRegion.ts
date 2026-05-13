import type { EngraveParamsPayload } from '../store/imageStore';
import { computeWorkAreaPixels } from '../store/settingsStore';

/** Work area caps and final job raster size in machine pixel space (matches preview / engrave pipeline). */
export function jobMachineRegion(args: {
  imageWidth: number;
  imageHeight: number;
  params: EngraveParamsPayload;
  bedWidthMm: number;
  bedHeightMm: number;
  pixelsPerMm: number;
}): { maxW: number; maxH: number; jobW: number; jobH: number } {
  const { imageWidth, imageHeight, params, bedWidthMm, bedHeightMm, pixelsPerMm } = args;
  const [maxW, maxH] = computeWorkAreaPixels(bedWidthMm, bedHeightMm, pixelsPerMm);
  let w = imageWidth;
  let h = imageHeight;
  if (params.cropRect) {
    w = params.cropRect.width;
    h = params.cropRect.height;
  }
  if (params.resizeTo) {
    w = params.resizeTo[0];
    h = params.resizeTo[1];
  }
  const jobW = Math.max(1, Math.min(Math.round(w), maxW));
  const jobH = Math.max(1, Math.min(Math.round(h), maxH));
  return { maxW, maxH, jobW, jobH };
}
