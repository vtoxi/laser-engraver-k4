import { isTauri, invoke } from '@tauri-apps/api/core';
import type { FabricObject } from 'fabric';
import { computeWorkAreaPixels, useSettingsStore } from '../store/settingsStore';
import { useImageStore } from '../store/imageStore';
import { fabricIncludeInRasterExport, laserCanvasApi } from './laserCanvasApi';

function isLfGuide(o: FabricObject): boolean {
  return (o as FabricObject & { lfGuide?: boolean }).lfGuide === true;
}

/** Flatten Fabric bed to a PNG and push into the existing preview / engrave pipeline. */
export async function syncJobSourceFromCanvas(): Promise<void> {
  const canvas = laserCanvasApi.get();
  if (!canvas) return;
  const { bedWidthMm, bedHeightMm, pixelsPerMm } = useSettingsStore.getState();
  const [w, h] = computeWorkAreaPixels(bedWidthMm, bedHeightMm, pixelsPerMm);
  const cw = canvas.getWidth();
  const ch = canvas.getHeight();
  const multW = w / Math.max(1, cw);
  const multH = h / Math.max(1, ch);
  const multiplier = Math.min(multW, multH);

  const hidden: { o: FabricObject; i: number }[] = [];
  canvas.getObjects().forEach((o, i) => {
    if (isLfGuide(o)) return;
    if (o.visible === false) hidden.push({ o, i });
  });
  hidden.sort((a, b) => b.i - a.i).forEach(({ o }) => canvas.remove(o));

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier,
      enableRetinaScaling: false,
      filter: fabricIncludeInRasterExport,
    });
  } finally {
    hidden.sort((a, b) => a.i - b.i).forEach(({ o, i }) => canvas.insertAt(i, o));
    canvas.requestRenderAll();
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = dataUrl;
  await img.decode();

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  if (isTauri()) {
    const comma = dataUrl.indexOf(',');
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const info = await invoke<{ width: number; height: number }>('set_current_image_from_png_base64', {
      base64Png: b64,
    });
    useImageStore.setState({
      imageLoaded: true,
      imageWidth: info.width,
      imageHeight: info.height,
      originalPreview: dataUrl,
      processedPreview: null,
      previewError: null,
      params: {
        ...useImageStore.getState().params,
        cropRect: null,
        resizeTo: null,
      },
    });
  } else {
    useImageStore.setState({
      imageLoaded: true,
      imageWidth: iw,
      imageHeight: ih,
      originalPreview: dataUrl,
      processedPreview: null,
      previewError: null,
      params: {
        ...useImageStore.getState().params,
        cropRect: null,
        resizeTo: null,
      },
    });
  }

  await useImageStore.getState().generatePreview();
}
