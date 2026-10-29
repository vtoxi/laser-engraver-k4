export const BED_WIDTH_MM = 80;
export const BED_HEIGHT_MM = 80;
export const DEFAULT_SCREEN_DPI = 96;
export const MM_PER_INCH = 25.4;

/** Default minor grid in mm (1mm lines/dots). */
export const GRID_MM = 1;
export const SNAP_SUB_MM = 0.5;

export const SNAP_THRESHOLD_PX = 4;
export const MIN_HISTORY_STEPS = 50;

export const EXPORT_DPI_OPTIONS = [96, 150, 300, 600] as const;

/** On-screen bed editor viewport (CSS px). Inner canvas can exceed this when zoomed; scroll inside the viewport. */
export const BED_EDITOR_VIEWPORT_W = 560;
export const BED_EDITOR_VIEWPORT_H = 480;
