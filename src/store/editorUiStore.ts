import { create } from 'zustand';
import { jobMachineRegion } from '../lib/jobMachineRegion';
import { useImageStore, type CropRectPayload } from './imageStore';
import { useSerialStore } from './serialStore';
import { useSettingsStore } from './settingsStore';

export type EditorTool = 'select' | 'crop' | 'text' | 'pan';
export type CropAspectLock = 'free' | '1:1' | 'bed';

export interface TextAnnotation {
  id: string;
  text: string;
  /** 0–1 relative to machine bed frame (top-left of bed). */
  xNorm: number;
  yNorm: number;
}

function cropPayloadFromParams(iw: number, ih: number, cropRect: CropRectPayload | null): CropRectPayload {
  if (cropRect) return { ...cropRect };
  return { x: 0, y: 0, width: iw, height: ih };
}

interface EditorUiState {
  editorTool: EditorTool;
  simulateScanlines: boolean;
  /** Outline burn preview: actual K4 row order vs traced boundary (visual only). */
  outlineScanPreviewMode: 'job' | 'contour';
  cropAspectLock: CropAspectLock;
  /** Draft crop in image pixels (full image = 0,0,iw,ih). Applied on “Apply crop”. */
  cropDraft: CropRectPayload;
  burnOverlayVisible: boolean;
  burnOverlayOpacity: number;
  textDraft: string | null;
  annotations: TextAnnotation[];
  /** Machine head / job origin in protocol units (same as jog). Drives pan on bed when connected. */
  machineHeadX: number;
  machineHeadY: number;

  setEditorTool: (t: EditorTool) => void;
  setSimulateScanlines: (v: boolean) => void;
  setOutlineScanPreviewMode: (v: 'job' | 'contour') => void;
  setCropAspectLock: (v: CropAspectLock) => void;
  setBurnOverlayVisible: (v: boolean) => void;
  setBurnOverlayOpacity: (v: number) => void;
  setCropDraft: (rect: CropRectPayload) => void;
  syncCropDraftWithParams: () => void;
  setTextDraft: (v: string | null) => void;
  addTextAnnotation: (text: string) => void;
  clearAnnotations: () => void;
  setMachineHead: (x: number, y: number, skipJog?: boolean) => void;
  /** Clamp head into valid range for current job size (call after crop/resize change). */
  clampMachineHead: () => void;
  resetMachineHead: () => void;
}

function readImageSize(): { iw: number; ih: number } {
  const { imageWidth, imageHeight } = useImageStore.getState();
  return { iw: Math.max(1, imageWidth), ih: Math.max(1, imageHeight) };
}

function clampHeadCoords(mx: number, my: number): { x: number; y: number } {
  const { imageWidth, imageHeight, params, imageLoaded } = useImageStore.getState();
  if (!imageLoaded || imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0 };
  }
  const { bedWidthMm, bedHeightMm, pixelsPerMm } = useSettingsStore.getState();
  const { maxW, maxH, jobW, jobH } = jobMachineRegion({
    imageWidth,
    imageHeight,
    params,
    bedWidthMm,
    bedHeightMm,
    pixelsPerMm,
  });
  const maxX = Math.max(0, maxW - jobW);
  const maxY = Math.max(0, maxH - jobH);
  return {
    x: Math.max(0, Math.min(Math.round(mx), Math.min(65535, maxX))),
    y: Math.max(0, Math.min(Math.round(my), Math.min(65535, maxY))),
  };
}

export const useEditorUiStore = create<EditorUiState>((set, get) => ({
  editorTool: 'select',
  simulateScanlines: false,
  outlineScanPreviewMode: 'contour',
  cropAspectLock: 'free',
  cropDraft: { x: 0, y: 0, width: 1, height: 1 },
  burnOverlayVisible: true,
  burnOverlayOpacity: 0.42,
  textDraft: null,
  annotations: [],
  machineHeadX: 0,
  machineHeadY: 0,

  syncCropDraftWithParams: () => {
    const { iw, ih } = readImageSize();
    const cropRect = useImageStore.getState().params.cropRect;
    set({ cropDraft: cropPayloadFromParams(iw, ih, cropRect) });
  },

  setEditorTool: (editorTool) => {
    const s = get();
    if (s.editorTool === 'crop' && editorTool !== 'crop') {
      const { iw, ih } = readImageSize();
      const cropRect = useImageStore.getState().params.cropRect;
      set({
        editorTool,
        cropDraft: cropPayloadFromParams(iw, ih, cropRect),
      });
      return;
    }
    if (editorTool === 'crop') {
      const { iw, ih } = readImageSize();
      const cropRect = useImageStore.getState().params.cropRect;
      set({
        editorTool,
        cropDraft: cropPayloadFromParams(iw, ih, cropRect),
      });
      return;
    }
    set({ editorTool });
  },

  setSimulateScanlines: (simulateScanlines) => set({ simulateScanlines }),
  setOutlineScanPreviewMode: (outlineScanPreviewMode) => set({ outlineScanPreviewMode }),
  setCropAspectLock: (cropAspectLock) => set({ cropAspectLock }),
  setBurnOverlayVisible: (burnOverlayVisible) => set({ burnOverlayVisible }),
  setBurnOverlayOpacity: (burnOverlayOpacity) =>
    set({ burnOverlayOpacity: Math.max(0, Math.min(1, burnOverlayOpacity)) }),

  setCropDraft: (cropDraft) => set({ cropDraft }),

  setTextDraft: (textDraft) => set({ textDraft }),

  addTextAnnotation: (text) =>
    set((st) => ({
      annotations: [
        ...st.annotations,
        {
          id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          xNorm: 0.08 + (st.annotations.length % 5) * 0.04,
          yNorm: 0.08 + (st.annotations.length % 3) * 0.06,
        },
      ],
    })),
  clearAnnotations: () => set({ annotations: [] }),

  setMachineHead: (nx, ny, skipJog = false) => {
    const { x, y } = clampHeadCoords(nx, ny);
    set({ machineHeadX: x, machineHeadY: y });
    if (skipJog) return;
    const ser = useSerialStore.getState();
    if (ser.connectionState === 'connected') {
      void ser.jog(x, y);
    }
  },

  clampMachineHead: () => {
    const s = get();
    const { x, y } = clampHeadCoords(s.machineHeadX, s.machineHeadY);
    if (x !== s.machineHeadX || y !== s.machineHeadY) {
      set({ machineHeadX: x, machineHeadY: y });
    }
  },

  resetMachineHead: () => set({ machineHeadX: 0, machineHeadY: 0 }),
}));
