import { create } from 'zustand';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  dispatchJobCompleteNotification,
  markJobHadRuntimeError,
  markUserRequestedJobStop,
  notifyConnectionFailed,
  notifyEngraveJobPaused,
  notifyMachineConnected,
  notifyMachineDisconnected,
  notifySerialOrJobError,
  resetJobNotifyFlags,
} from '../lib/desktopNotifications';
import { getWebSerialBridge } from '../serial/webSerialBridge';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface PortInfo {
  path: string;
  description: string;
  is_k4_candidate: boolean;
}

function webSerialAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.serial;
}

/** Align with Rust `port_info_from_serial` / `is_k4_path_hint` (CH340 / WCH). */
function webPortInfo(port: SerialPort, index: number): PortInfo {
  const path = `web-serial:${index}`;
  const info = port.getInfo();
  const vid = info.usbVendorId;
  const pid = info.usbProductId;
  const isK4 =
    vid === 0x1a86 ||
    vid === 0x4348 ||
    (typeof vid === 'number' && (vid & 0xffff) === 0x1a86);
  const hex = (n: number) => (n & 0xffff).toString(16).padStart(4, '0');
  const description =
    vid != null
      ? pid != null
        ? `USB ${hex(vid)}:${hex(pid)}`
        : `USB ${hex(vid)}`
      : 'USB serial (granted in this browser)';
  return { path, description, is_k4_candidate: isK4 };
}

interface SerialState {
  ports: PortInfo[];
  selectedPort: string | null;
  /** When true, list every serial port (minus Bluetooth paths), not only K4-style devices. */
  showAllPorts: boolean;
  /** Set when `list_serial_ports` invoke fails (e.g. permissions). */
  portsListError: string | null;
  connectionState: ConnectionState;
  errorMessage: string | null;
  jobProgress: number;
  jobRunning: boolean;
  jobPaused: boolean;
  applySerialEvent: (payload: { type: string; [key: string]: unknown }) => void;
  setShowAllPorts: (show: boolean) => void;
  refreshPorts: () => Promise<void>;
  /** Browser only: system picker to grant a USB serial device (CH340 / WCH filters). */
  pairWebSerialDevice: () => Promise<void>;
  connect: (port: string) => Promise<void>;
  disconnect: () => Promise<void>;
  home: () => Promise<void>;
  jog: (x: number, y: number) => Promise<void>;
  previewFrame: (x: number, y: number, w: number, h: number) => Promise<void>;
  stopPreview: () => Promise<void>;
  stopJob: () => Promise<void>;
  pauseJob: () => Promise<void>;
  setParams: (speed: number, power: number, passes: number) => Promise<void>;
  installDriver: () => Promise<string>;
}

export const useSerialStore = create<SerialState>((set, get) => ({
  ports: [],
  selectedPort: null,
  showAllPorts: false,
  portsListError: null,
  connectionState: 'disconnected',
  errorMessage: null,
  jobProgress: 0,
  jobRunning: false,
  jobPaused: false,

  applySerialEvent: (payload) => {
    switch (payload.type) {
      case 'connected':
        {
          const was = get().connectionState;
          const port = String(payload.port ?? '');
          set({
            connectionState: 'connected',
            selectedPort: port,
            errorMessage: null,
          });
          if (was !== 'connected') {
            notifyMachineConnected(port);
          }
        }
        break;
      case 'disconnected':
        {
          const was = get().connectionState;
          resetJobNotifyFlags();
          set({ connectionState: 'disconnected', jobRunning: false, jobPaused: false });
          if (was === 'connected' || was === 'error') {
            notifyMachineDisconnected();
          }
        }
        break;
      case 'progress':
        set({
          jobProgress: Number(payload.pct ?? 0),
          jobRunning: true,
        });
        break;
      case 'job_complete':
        set({ jobProgress: 100, jobRunning: false, jobPaused: false });
        dispatchJobCompleteNotification();
        break;
      case 'error': {
        const jobWasRunning = get().jobRunning;
        set({
          connectionState: 'error',
          errorMessage: String(payload.message ?? 'Unknown error'),
          jobRunning: false,
        });
        if (jobWasRunning) {
          markJobHadRuntimeError();
        }
        notifySerialOrJobError(String(payload.message ?? 'Unknown error'));
        break;
      }
      default:
        break;
    }
  },

  setShowAllPorts: (show) => {
    set({ showAllPorts: show });
    void get().refreshPorts();
  },

  refreshPorts: async () => {
    if (isTauri()) {
      try {
        const showAll = get().showAllPorts;
        const ports = await invoke<PortInfo[]>('list_serial_ports', { showAll });
        const prev = get().selectedPort;
        const stillThere = prev && ports.some((p) => p.path === prev);
        set({
          ports,
          portsListError: null,
          selectedPort: stillThere ? prev : ports[0]?.path ?? null,
        });
      } catch (e: unknown) {
        const msg = String(e);
        set({ portsListError: msg, ports: [] });
        console.error('list_serial_ports failed:', e);
      }
      return;
    }

    if (!webSerialAvailable()) {
      set({
        portsListError:
          'Web Serial is unavailable here. Use Chrome or Edge on https:// or localhost, or run the desktop app.',
        ports: [],
      });
      return;
    }

    try {
      const showAll = get().showAllPorts;
      const bridge = getWebSerialBridge();
      await bridge.refreshGrantedList();
      const raw = bridge.grantedPorts.map((p, i) => webPortInfo(p, i));
      const ports = showAll ? raw : raw.filter((p) => p.is_k4_candidate);
      const prev = get().selectedPort;
      const stillThere = prev && ports.some((p) => p.path === prev);
      set({
        ports,
        portsListError: null,
        selectedPort: stillThere ? prev : ports[0]?.path ?? null,
      });
    } catch (e: unknown) {
      const msg = String(e);
      set({ portsListError: msg, ports: [] });
      console.error('Web Serial refresh failed:', e);
    }
  },

  pairWebSerialDevice: async () => {
    if (isTauri()) return;
    if (!webSerialAvailable()) {
      set({
        portsListError:
          'Web Serial is unavailable in this browser. Try Chrome or Edge on https:// or localhost.',
      });
      return;
    }
    try {
      const bridge = getWebSerialBridge();
      await bridge.requestNewPort();
      await get().refreshPorts();
      set({ portsListError: null });
    } catch (e: unknown) {
      const msg = String(e);
      set({ portsListError: msg });
      console.error('requestPort failed:', e);
    }
  },

  connect: async (port) => {
    set({ connectionState: 'connecting', selectedPort: port, errorMessage: null });
    try {
      if (isTauri()) {
        await invoke('connect_device', { portPath: port });
        set({ connectionState: 'connected', selectedPort: port, errorMessage: null });
      } else {
        await getWebSerialBridge().openPortAt(port);
      }
    } catch (e: unknown) {
      const msg = String(e);
      set({ connectionState: 'error', errorMessage: msg });
      notifyConnectionFailed(msg);
    }
  },

  disconnect: async () => {
    if (isTauri()) {
      await invoke('disconnect_device');
    } else {
      await getWebSerialBridge().closePort();
    }
  },

  home: async () => {
    if (isTauri()) await invoke('machine_home');
    else await getWebSerialBridge().home();
  },

  jog: async (x, y) => {
    if (isTauri()) await invoke('machine_jog', { x, y });
    else await getWebSerialBridge().jog(x, y);
  },

  previewFrame: async (x, y, w, h) => {
    if (isTauri()) await invoke('machine_preview_frame', { x, y, w, h });
    else await getWebSerialBridge().previewFrame(x, y, w, h);
  },

  stopPreview: async () => {
    if (isTauri()) await invoke('machine_stop_preview');
    else await getWebSerialBridge().stopPreview();
  },

  stopJob: async () => {
    markUserRequestedJobStop();
    if (isTauri()) await invoke('machine_stop_job');
    else await getWebSerialBridge().stopJob();
  },

  pauseJob: async () => {
    try {
      if (isTauri()) {
        await invoke('machine_pause_job');
      } else {
        await getWebSerialBridge().pauseJob();
      }
      notifyEngraveJobPaused();
    } catch (e) {
      console.error('pauseJob failed:', e);
    }
  },

  setParams: async (speed, power, passes) => {
    if (isTauri()) await invoke('machine_set_params', { speed, power, passes });
    else await getWebSerialBridge().setParams(speed, power, passes);
  },

  installDriver: async () => {
    if (!isTauri()) {
      return 'Driver bundling is only available in the desktop app. For the browser, install the WCH CH340 driver from the manufacturer, then use “Pair USB device…”.';
    }
    return invoke<string>('install_driver');
  },
}));
