/**
 * Raster style helpers for laser preview (extend alongside `browserImagePipeline`).
 * Heavy processing stays in {@link ./browserImagePipeline}.
 */

export type ImageStyleMode = 'original' | 'monotone' | 'outline' | 'filled' | 'grayscale' | 'dithered';
