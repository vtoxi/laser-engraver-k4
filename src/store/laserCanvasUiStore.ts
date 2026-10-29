import { create } from 'zustand';

/** View zoom is a multiplier on top of “fit” scale (50%–200% of fitted size). */
export type LaserZoomPreset = 50 | 75 | 100 | 150 | 200;

interface LaserCanvasUiState {
  /** 0.5 … 2.0 — applied after fit-to-container scale. */
  viewZoom: number;
  gridVisible: boolean;
  snapEnabled: boolean;
  spaceHeld: boolean;
  exportModalOpen: boolean;
  setViewZoom: (z: number) => void;
  setZoomPreset: (p: LaserZoomPreset) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setSpaceHeld: (v: boolean) => void;
  setExportModalOpen: (v: boolean) => void;
}

export const useLaserCanvasUiStore = create<LaserCanvasUiState>((set) => ({
  viewZoom: 1,
  gridVisible: true,
  snapEnabled: true,
  spaceHeld: false,
  exportModalOpen: false,

  setViewZoom: (z) => set({ viewZoom: Math.min(2, Math.max(0.5, z)) }),

  setZoomPreset: (p) => set({ viewZoom: p / 100 }),

  toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),

  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

  setSpaceHeld: (v) => set({ spaceHeld: v }),

  setExportModalOpen: (v) => set({ exportModalOpen: v }),
}));
