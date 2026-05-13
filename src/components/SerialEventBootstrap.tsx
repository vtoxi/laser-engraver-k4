import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getWebSerialBridge } from '../serial/webSerialBridge';
import { useSerialStore } from '../store/serialStore';

/** Single subscription to backend `serial-event` (Tauri) or Web Serial bridge (browser). */
export function SerialEventBootstrap() {
  useEffect(() => {
    if (isTauri()) {
      let unlisten: (() => void) | undefined;
      let cancelled = false;
      listen<{ type: string; [key: string]: unknown }>('serial-event', ({ payload }) => {
        useSerialStore.getState().applySerialEvent(payload);
      }).then((fn) => {
        if (!cancelled) unlisten = fn;
      });
      return () => {
        cancelled = true;
        unlisten?.();
      };
    }

    const bridge = getWebSerialBridge();
    const unsub = bridge.subscribe((payload) => {
      useSerialStore.getState().applySerialEvent(payload);
    });
    return unsub;
  }, []);
  return null;
}
