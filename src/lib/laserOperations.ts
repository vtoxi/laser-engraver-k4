import { FabricImage, Textbox, type Canvas } from 'fabric';
import toast from 'react-hot-toast';
import { laserCanvasApi } from './laserCanvasApi';
import { useLaserHistoryStore } from '../store/laserHistoryStore';
import { syncJobSourceFromCanvas } from './syncJobSourceFromCanvas';

let imageCounter = 1;
let textCounter = 1;

export async function addFabricImagesFromFiles(
  files: FileList | File[],
  workW: number,
  workH: number,
): Promise<void> {
  const canvas = laserCanvasApi.get();
  if (!canvas) {
    toast.error('Canvas not ready');
    return;
  }
  const list = Array.from(files);
  for (const file of list) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    try {
      const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
      const el = img.getElement() as HTMLImageElement;
      const iw = el.naturalWidth || el.width || 1;
      const ih = el.naturalHeight || el.height || 1;
      const sc = Math.min(workW / iw, workH / ih, 1);
      img.set({
        name: `lf-${crypto.randomUUID()}`,
        scaleX: sc,
        scaleY: sc,
        left: (workW - iw * sc) / 2,
        top: (workH - ih * sc) / 2,
      });
      (img as unknown as { data?: { label?: string; originalSrc?: string } }).data = {
        label: `Image ${imageCounter++}`,
        originalSrc: url,
      };
      img.setCoords();
      canvas.add(img);
      canvas.setActiveObject(img);
    } catch (e) {
      console.error(e);
      toast.error(`Could not load ${file.name}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  canvas.requestRenderAll();
  useLaserHistoryStore.getState().push();
  await syncJobSourceFromCanvas();
}

export function addFabricText(workW: number, workH: number, text: string): void {
  const canvas = laserCanvasApi.get();
  if (!canvas) return;
  const tb = new Textbox(text || 'Text', {
    name: `lf-${crypto.randomUUID()}`,
    left: workW / 2 - 40,
    top: workH / 2 - 12,
    width: Math.min(200, workW * 0.6),
    fontSize: 22,
    fill: '#111',
    fontFamily: 'system-ui, sans-serif',
  });
  (tb as unknown as { data?: { label?: string } }).data = { label: `Text ${textCounter++}` };
  canvas.add(tb);
  canvas.setActiveObject(tb);
  canvas.requestRenderAll();
  useLaserHistoryStore.getState().push();
  void syncJobSourceFromCanvas();
}

export function deleteActiveObjects(canvas: Canvas | null): void {
  if (!canvas) return;
  const sel = canvas.getActiveObjects();
  if (sel.length === 0) return;
  for (const o of sel) canvas.remove(o);
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  useLaserHistoryStore.getState().push();
  void syncJobSourceFromCanvas();
}
