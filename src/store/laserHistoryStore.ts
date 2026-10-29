import { create } from 'zustand';
import type { Canvas } from 'fabric';
import { MIN_HISTORY_STEPS } from '../utils/constants';
import { laserCanvasApi } from '../lib/laserCanvasApi';
import { syncJobSourceFromCanvas } from '../lib/syncJobSourceFromCanvas';

const MAX = Math.max(50, MIN_HISTORY_STEPS);

const EXTRA_PROPS = [
  'name',
  'data',
  'clipPath',
  'cropX',
  'cropY',
] as const;

function snapshot(canvas: Canvas): string {
  return JSON.stringify(canvas.toObject([...EXTRA_PROPS]));
}

export const useLaserHistoryStore = create<{
  past: string[];
  future: string[];
  push: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
}>((set, get) => ({
  past: [],
  future: [],

  clear: () => set({ past: [], future: [] }),

  push: () => {
    const c = laserCanvasApi.get();
    if (!c) return;
    const json = snapshot(c);
    set((s) => ({
      past: [...s.past, json].slice(-MAX),
      future: [],
    }));
  },

  undo: async () => {
    const c = laserCanvasApi.get();
    if (!c) return;
    const { past } = get();
    if (past.length === 0) return;
    const cur = snapshot(c);
    const prev = past[past.length - 1];
    set({ past: past.slice(0, -1), future: [cur, ...get().future].slice(-MAX) });
    await c.loadFromJSON(prev);
    c.requestRenderAll();
    void syncJobSourceFromCanvas();
  },

  redo: async () => {
    const c = laserCanvasApi.get();
    if (!c) return;
    const { future } = get();
    if (future.length === 0) return;
    const cur = snapshot(c);
    const next = future[0];
    set({ future: future.slice(1), past: [...get().past, cur].slice(-MAX) });
    await c.loadFromJSON(next);
    c.requestRenderAll();
    void syncJobSourceFromCanvas();
  },
}));
