import type { Canvas } from 'fabric';

let canvas: Canvas | null = null;

type RasterExportFilter = NonNullable<Parameters<Canvas['toDataURL']>[0]>['filter'];

/** Fabric raster export ignores `excludeFromExport`; pass this as `toDataURL({ filter })`. */
export const fabricIncludeInRasterExport: RasterExportFilter = (obj) => !obj.excludeFromExport;

export const laserCanvasApi = {
  set(c: Canvas | null) {
    canvas = c;
  },
  get(): Canvas | null {
    return canvas;
  },
};
