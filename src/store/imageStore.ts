import { create } from 'zustand';
import { invoke, isTauri } from '@tauri-apps/api/core';
import throttle from 'lodash/throttle';
import { linesToPngDataUrl, rasterizeFromImageUrl, type BrowserRasterParams } from '../image/browserImagePipeline';
import { getWebSerialBridge } from '../serial/webSerialBridge';
import { notifyEngraveJobStarted } from '../lib/desktopNotifications';

let previewGeneration = 0;

function pickImageFileAsDataUrl(): Promise<{ dataUrl: string; name: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/jpg,image/bmp,image/gif,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result;
        resolve(typeof r === 'string' ? { dataUrl: r, name: file.name } : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

function toBrowserRasterParams(p: EngraveParamsPayload): BrowserRasterParams {
  return {
    cropRect: p.cropRect,
    resizeTo: p.resizeTo,
    engraveMode: p.engraveMode,
    brightness: p.brightness,
    contrast: p.contrast,
    threshold: p.threshold,
    ditherMode: p.ditherMode,
    invert: p.invert,
    rotateDeg: p.rotateDeg,
    flipH: p.flipH,
    flipV: p.flipV,
  };
}

export type DitherMode = 'threshold' | 'floyd' | 'atkinson' | 'bayer';

/** Matches Rust `CropRect` (`#[serde(rename_all = "camelCase")]`) for `invoke`. */
export interface CropRectPayload {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type EngraveMode = 'raster' | 'outline';

/** Matches Rust `EngraveParams` (`#[serde(rename_all = "camelCase")]`) for `invoke`. */
export interface EngraveParamsPayload {
  cropRect: CropRectPayload | null;
  resizeTo: [number, number] | null;
  engraveMode: EngraveMode;
  brightness: number;
  contrast: number;
  threshold: number;
  ditherMode: DitherMode;
  invert: boolean;
  rotateDeg: number;
  flipH: boolean;
  flipV: boolean;
  depth: number;
  power: number;
  passes: number;
  speed: number;
}

interface ImageState {
  imageLoaded: boolean;
  imagePath: string | null;
  imageWidth: number;
  imageHeight: number;
  originalPreview: string | null;
  processedPreview: string | null;
  /** Set when `generate_preview` fails (e.g. empty crop region); previous preview is left unchanged. */
  previewError: string | null;
  params: EngraveParamsPayload;
  isGeneratingPreview: boolean;
  openImage: () => Promise<void>;
  updateParam: <K extends keyof EngraveParamsPayload>(
    key: K,
    value: EngraveParamsPayload[K],
  ) => void;
  /** Pass `paramsOverride` when the store must not be read yet (e.g. right after a batched param update). */
  generatePreview: (paramsOverride?: EngraveParamsPayload) => Promise<void>;
  startJob: () => Promise<void>;
}

const DEFAULT_PARAMS: EngraveParamsPayload = {
  cropRect: null,
  resizeTo: null,
  engraveMode: 'raster',
  brightness: 0,
  contrast: 0,
  threshold: 128,
  ditherMode: 'floyd',
  invert: false,
  rotateDeg: 0,
  flipH: false,
  flipV: false,
  depth: 80,
  power: 800,
  passes: 1,
  speed: 3000,
};

export const useImageStore = create<ImageState>((set, get) => ({
  imageLoaded: false,
  imagePath: null,
  imageWidth: 0,
  imageHeight: 0,
  originalPreview: null,
  processedPreview: null,
  previewError: null,
  params: DEFAULT_PARAMS,
  isGeneratingPreview: false,

  openImage: async () => {
    if (isTauri()) {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
      const path = await openDialog({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }],
        multiple: false,
      });
      if (path === null || Array.isArray(path)) return;
      const p = path as string;

      const info = await invoke<{ width: number; height: number; preview_b64: string }>(
        'load_image',
        { path: p },
      );

      set({
        imageLoaded: true,
        imagePath: p,
        imageWidth: info.width,
        imageHeight: info.height,
        originalPreview: `data:image/png;base64,${info.preview_b64}`,
        processedPreview: null,
        previewError: null,
      });

      await get().generatePreview();
      return;
    }

    const picked = await pickImageFileAsDataUrl();
    if (!picked) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = picked.dataUrl;
    await img.decode();

    set({
      imageLoaded: true,
      imagePath: picked.name,
      imageWidth: img.naturalWidth,
      imageHeight: img.naturalHeight,
      originalPreview: picked.dataUrl,
      processedPreview: null,
      previewError: null,
    });

    await get().generatePreview();
  },

  updateParam: (key, value) => {
    set((s) => ({ params: { ...s.params, [key]: value } }));
  },

  generatePreview: async (paramsOverride?: EngraveParamsPayload) => {
    if (!get().imageLoaded) return;
    const params = paramsOverride ?? get().params;
    const myGen = ++previewGeneration;
    set({ isGeneratingPreview: true, previewError: null });
    try {
      if (isTauri()) {
        const b64 = await invoke<string>('generate_preview', { params });
        if (myGen !== previewGeneration) return;
        set({ processedPreview: `data:image/png;base64,${b64}`, previewError: null });
      } else {
        const orig = get().originalPreview;
        if (!orig) throw new Error('No image loaded');
        const lines = await rasterizeFromImageUrl(orig, toBrowserRasterParams(params));
        const previewUrl = linesToPngDataUrl(lines, 400);
        if (myGen !== previewGeneration) return;
        set({
          processedPreview: previewUrl,
          previewError: null,
        });
      }
    } catch (e) {
      if (myGen !== previewGeneration) return;
      const msg = e instanceof Error ? e.message : String(e);
      console.error('generate_preview failed:', e);
      set({ previewError: msg });
    } finally {
      if (myGen === previewGeneration) {
        set({ isGeneratingPreview: false });
      }
    }
  },

  startJob: async () => {
    if (!get().imageLoaded) return;
    if (isTauri()) {
      await invoke('start_engrave_job', { params: get().params });
      notifyEngraveJobStarted();
      return;
    }
    const orig = get().originalPreview;
    if (!orig) return;
    const p = get().params;
    const lines = await rasterizeFromImageUrl(orig, toBrowserRasterParams(p));
    const bridge = getWebSerialBridge();
    notifyEngraveJobStarted();
    await bridge.runRasterJob(lines, {
      depth: p.depth,
      power: p.power,
      speed: p.speed,
      passes: p.passes,
    });
  },
}));

/** Coalesces rapid slider moves into periodic `generate_preview` calls (leading + trailing). */
export const throttledRegeneratePreview = throttle(
  () => {
    void useImageStore.getState().generatePreview();
  },
  48,
  { leading: true, trailing: true },
);
