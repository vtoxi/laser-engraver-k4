import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MaterialPreset {
  id: string;
  name: string;
  material: string;
  speed: number;
  power: number;
  passes: number;
  depth: number;
  threshold: number;
  notes: string;
}

const BUILTIN_PRESETS: MaterialPreset[] = [
  {
    id: 'wood-light',
    name: 'Light wood',
    material: 'Wood',
    speed: 3000,
    power: 600,
    passes: 1,
    depth: 80,
    threshold: 128,
    notes: 'Pine, balsa — light engrave',
  },
  {
    id: 'wood-deep',
    name: 'Deep wood',
    material: 'Wood',
    speed: 1500,
    power: 900,
    passes: 2,
    depth: 150,
    threshold: 120,
    notes: 'Oak, MDF — deep engrave',
  },
  {
    id: 'leather',
    name: 'Leather',
    material: 'Leather',
    speed: 2000,
    power: 700,
    passes: 1,
    depth: 100,
    threshold: 128,
    notes: 'Vegetable-tanned leather',
  },
  {
    id: 'cardboard',
    name: 'Cardboard',
    material: 'Cardboard',
    speed: 4000,
    power: 500,
    passes: 1,
    depth: 60,
    threshold: 140,
    notes: 'Corrugated or card',
  },
  {
    id: 'rubber',
    name: 'Rubber stamp',
    material: 'Rubber',
    speed: 2000,
    power: 800,
    passes: 1,
    depth: 120,
    threshold: 128,
    notes: 'Stamp rubber, dark rubber only',
  },
  {
    id: 'anodized',
    name: 'Anodized Al',
    material: 'Anodized Aluminum',
    speed: 1000,
    power: 1000,
    passes: 3,
    depth: 200,
    threshold: 110,
    notes: 'Black/colored anodized only',
  },
  {
    id: 'paper',
    name: 'Paper',
    material: 'Paper',
    speed: 5000,
    power: 300,
    passes: 1,
    depth: 40,
    threshold: 150,
    notes: 'Heavyweight paper / cardstock',
  },
];

/** Raster size for “resize to bed” = mm × pixelsPerMm (round). Tune px/mm if firmware scale differs. */
export function computeWorkAreaPixels(
  bedWidthMm: number,
  bedHeightMm: number,
  pixelsPerMm: number,
): [number, number] {
  const ppm = Number.isFinite(pixelsPerMm) && pixelsPerMm > 0 ? pixelsPerMm : 10;
  const w = Math.max(1, Math.round((Number.isFinite(bedWidthMm) ? bedWidthMm : 80) * ppm));
  const h = Math.max(1, Math.round((Number.isFinite(bedHeightMm) ? bedHeightMm : 80) * ppm));
  return [w, h];
}

/** Largest axis-aligned rect inside the image matching bed mm aspect (centered). Percents for CSS overlay on the source image. */
export function machineBedOverlayPercents(
  imageWidth: number,
  imageHeight: number,
  bedWidthMm: number,
  bedHeightMm: number,
): { leftPct: number; topPct: number; widthPct: number; heightPct: number } {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { leftPct: 0, topPct: 0, widthPct: 0, heightPct: 0 };
  }
  const bw = Math.max(1e-9, Number.isFinite(bedWidthMm) ? bedWidthMm : 80);
  const bh = Math.max(1e-9, Number.isFinite(bedHeightMm) ? bedHeightMm : 80);
  const bedAR = bw / bh;
  const imgAR = imageWidth / imageHeight;
  let boxW: number;
  let boxH: number;
  let left: number;
  let top: number;
  if (imgAR >= bedAR) {
    boxH = imageHeight;
    boxW = Math.round(boxH * bedAR);
    left = Math.floor((imageWidth - boxW) / 2);
    top = 0;
  } else {
    boxW = imageWidth;
    boxH = Math.round(boxW / bedAR);
    left = 0;
    top = Math.floor((imageHeight - boxH) / 2);
  }
  return {
    leftPct: (left / imageWidth) * 100,
    topPct: (top / imageHeight) * 100,
    widthPct: (boxW / imageWidth) * 100,
    heightPct: (boxH / imageHeight) * 100,
  };
}

interface SettingsState {
  presets: MaterialPreset[];
  /** Physical work area (K4 default 80 × 80 mm). */
  bedWidthMm: number;
  bedHeightMm: number;
  /** Job coordinate scale: work area in px ≈ mm × this value. */
  pixelsPerMm: number;
  /** OS toasts when minimized (Tauri: plugin; browser: Web Notifications). */
  desktopNotificationsEnabled: boolean;
  setMachineBed: (bedWidthMm: number, bedHeightMm: number) => void;
  setPixelsPerMm: (pixelsPerMm: number) => void;
  setDesktopNotificationsEnabled: (enabled: boolean) => void;
  addPreset: (p: MaterialPreset) => void;
  updatePreset: (id: string, p: Partial<MaterialPreset>) => void;
  deletePreset: (id: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      presets: BUILTIN_PRESETS,
      bedWidthMm: 80,
      bedHeightMm: 80,
      pixelsPerMm: 10,
      desktopNotificationsEnabled: true,
      setMachineBed: (bedWidthMm, bedHeightMm) =>
        set({
          bedWidthMm: Math.max(1, bedWidthMm),
          bedHeightMm: Math.max(1, bedHeightMm),
        }),
      setPixelsPerMm: (pixelsPerMm) =>
        set({ pixelsPerMm: Math.max(0.1, Math.min(500, pixelsPerMm)) }),
      setDesktopNotificationsEnabled: (enabled) => set({ desktopNotificationsEnabled: enabled }),
      addPreset: (p) => set((s) => ({ presets: [...s.presets, p] })),
      updatePreset: (id, p) =>
        set((s) => ({
          presets: s.presets.map((x) => (x.id === id ? { ...x, ...p } : x)),
        })),
      deletePreset: (id) =>
        set((s) => ({
          presets: s.presets.filter((x) => x.id !== id),
        })),
    }),
    {
      name: 'laserforge-settings',
      partialize: (s) => ({
        presets: s.presets,
        bedWidthMm: s.bedWidthMm,
        bedHeightMm: s.bedHeightMm,
        pixelsPerMm: s.pixelsPerMm,
        desktopNotificationsEnabled: s.desktopNotificationsEnabled,
      }),
    },
  ),
);
