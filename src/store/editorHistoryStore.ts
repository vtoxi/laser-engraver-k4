import { create } from 'zustand';
import { useEditorUiStore } from './editorUiStore';
import { useImageStore, type EngraveParamsPayload } from './imageStore';
import type { TextAnnotation } from './editorUiStore';

export type EditorSnapshot = {
  params: EngraveParamsPayload;
  annotations: TextAnnotation[];
};

const MAX = 48;

function cloneParams(p: EngraveParamsPayload): EngraveParamsPayload {
  return {
    ...p,
    cropRect: p.cropRect ? { ...p.cropRect } : null,
    resizeTo: p.resizeTo ? ([p.resizeTo[0], p.resizeTo[1]] as [number, number]) : null,
  };
}

function collectSnapshot(): EditorSnapshot {
  return {
    params: cloneParams(useImageStore.getState().params),
    annotations: useEditorUiStore.getState().annotations.map((a) => ({ ...a })),
  };
}

function applySnapshot(s: EditorSnapshot) {
  useImageStore.setState({ params: cloneParams(s.params) });
  useEditorUiStore.setState({ annotations: s.annotations.map((a) => ({ ...a })) });
}

function syncCropDraftAfterHistory() {
  useEditorUiStore.getState().syncCropDraftWithParams();
}

export const useEditorHistoryStore = create<{
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  push: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}>((set, get) => ({
  past: [],
  future: [],

  push: () =>
    set((s) => ({
      past: [...s.past, collectSnapshot()].slice(-MAX),
      future: [],
    })),

  undo: async () => {
    const { past } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    const cur = collectSnapshot();
    set({ past: past.slice(0, -1), future: [cur, ...get().future].slice(-MAX) });
    applySnapshot(prev);
    await useImageStore.getState().generatePreview();
    syncCropDraftAfterHistory();
  },

  redo: async () => {
    const { future } = get();
    if (future.length === 0) return;
    const next = future[0];
    const cur = collectSnapshot();
    set({ future: future.slice(1), past: [...get().past, cur].slice(-MAX) });
    applySnapshot(next);
    await useImageStore.getState().generatePreview();
    syncCropDraftAfterHistory();
  },
}));
