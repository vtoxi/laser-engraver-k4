import { useEffect } from 'react';
import { useLaserCanvasUiStore } from '../store/laserCanvasUiStore';
import { useLaserHistoryStore } from '../store/laserHistoryStore';
import { useEditorUiStore } from '../store/editorUiStore';
import { laserCanvasApi } from '../lib/laserCanvasApi';
import { mmToPx } from '../utils/mmToPx';
import { useSettingsStore } from '../store/settingsStore';
import { deleteActiveObjects } from '../lib/laserOperations';

function targetIsTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export function useLaserKeyboard() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (!targetIsTyping(e.target)) useLaserCanvasUiStore.getState().setSpaceHeld(true);
      }
      if (targetIsTyping(e.target)) return;
      const ui = useLaserCanvasUiStore.getState();
      const ed = useEditorUiStore.getState();
      if (e.key === 'g' || e.key === 'G') {
        if (!e.ctrlKey && !e.metaKey) ui.toggleGrid();
      }
      if (e.key === 's' || e.key === 'S') {
        if (!e.ctrlKey && !e.metaKey) ui.toggleSnap();
      }
      if (e.key === 'v' || e.key === 'V') ed.setEditorTool('select');
      if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) ed.setEditorTool('crop');
      }
      if (e.key === 't' || e.key === 'T') ed.setEditorTool('text');
      if (e.key === 'h' || e.key === 'H') ed.setEditorTool('pan');
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) ui.setViewZoom(1);
      if (e.key === '+' || e.key === '=') ui.setViewZoom(ui.viewZoom * 1.1);
      if (e.key === '-' || e.key === '_') ui.setViewZoom(ui.viewZoom / 1.1);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.key === 'Backspace' && targetIsTyping(e.target)) return;
        deleteActiveObjects(laserCanvasApi.get());
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const lp = useLaserHistoryStore.getState();
        if (e.shiftKey) void lp.redo();
        else void lp.undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        void useLaserHistoryStore.getState().redo();
      }
      const canvas = laserCanvasApi.get();
      const { pixelsPerMm } = useSettingsStore.getState();
      const nudge = e.altKey ? mmToPx(0.1, pixelsPerMm, 1) : mmToPx(1, pixelsPerMm, 1);
      const o = canvas?.getActiveObject();
      if (o && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'ArrowLeft') {
          o.set({ left: (o.left ?? 0) - nudge });
          o.setCoords();
          canvas?.requestRenderAll();
        }
        if (e.key === 'ArrowRight') {
          o.set({ left: (o.left ?? 0) + nudge });
          o.setCoords();
          canvas?.requestRenderAll();
        }
        if (e.key === 'ArrowUp') {
          o.set({ top: (o.top ?? 0) - nudge });
          o.setCoords();
          canvas?.requestRenderAll();
        }
        if (e.key === 'ArrowDown') {
          o.set({ top: (o.top ?? 0) + nudge });
          o.setCoords();
          canvas?.requestRenderAll();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') useLaserCanvasUiStore.getState().setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
