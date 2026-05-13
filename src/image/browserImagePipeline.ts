/**
 * Browser-side raster pipeline (mirrors `process_image` in `src-tauri/src/lib.rs`).
 */

export interface BrowserRasterParams {
  cropRect: { x: number; y: number; width: number; height: number } | null;
  resizeTo: [number, number] | null;
  engraveMode: string;
  brightness: number;
  contrast: number;
  threshold: number;
  ditherMode: string;
  invert: boolean;
  rotateDeg: number;
  flipH: boolean;
  flipV: boolean;
}

function uiContrastToFactor(ui: number): number {
  return Math.max(0.05, Math.min(3, 1 + (ui / 100) * 0.85));
}

function grayFromRgba(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

function floydSteinberg(gray: number[][], w: number, h: number, threshold: number): boolean[][] {
  const pixels: number[][] = gray.map((row) => row.map((v) => v));
  const result: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const old = pixels[y][x];
      const newVal = old < threshold ? 0 : 255;
      result[y][x] = newVal === 0;
      const err = old - newVal;
      if (x + 1 < w) pixels[y][x + 1] += (err * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) pixels[y + 1][x - 1] += (err * 3) / 16;
        pixels[y + 1][x] += (err * 5) / 16;
        if (x + 1 < w) pixels[y + 1][x + 1] += (err * 1) / 16;
      }
    }
  }
  return result;
}

function atkinson(gray: number[][], w: number, h: number, threshold: number): boolean[][] {
  const pixels: number[][] = gray.map((row) => row.map((v) => Math.max(0, Math.min(255, v))));
  const result: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const spread: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, -1],
    [1, 0],
    [1, 1],
    [2, 0],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const old = pixels[y][x];
      const newVal = old < threshold ? 0 : 255;
      result[y][x] = newVal === 0;
      const err = (old - newVal) / 8;
      for (const [dy, dx] of spread) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < h && nx >= 0 && nx < w) pixels[ny][nx] += err;
      }
    }
  }
  return result;
}

const BAYER: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function bayer4x4(gray: number[][], w: number, h: number): boolean[][] {
  const result: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pixel = gray[y][x];
      const t = Math.min(255, BAYER[y % 4][x % 4] * 16 + 8);
      result[y][x] = pixel < t;
    }
  }
  return result;
}

function thresholdRaster(gray: number[][], w: number, h: number, t: number): boolean[][] {
  const result: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      result[y][x] = gray[y][x] < t;
    }
  }
  return result;
}

function foregroundOutline(mask: boolean[][]): boolean[][] {
  const h = mask.length;
  if (!h) return [];
  const w = mask[0].length;
  const out: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y][x]) continue;
      const edge =
        x === 0 || y === 0 || x + 1 === w || y + 1 === h
          ? true
          : !mask[y][x - 1] || !mask[y][x + 1] || !mask[y - 1][x] || !mask[y + 1][x];
      if (edge) out[y][x] = true;
    }
  }
  return out;
}

function applyRgbaAdjustments(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  brightness: number,
  contrast: number,
  invert: boolean,
): void {
  const f = uiContrastToFactor(contrast);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      if (invert) {
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      }
      r = Math.max(0, Math.min(255, r + brightness));
      g = Math.max(0, Math.min(255, g + brightness));
      b = Math.max(0, Math.min(255, b + brightness));
      r = Math.round((r - 128) * f + 128);
      g = Math.round((g - 128) * f + 128);
      b = Math.round((b - 128) * f + 128);
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }
  }
}

function rgbaToLuma2d(data: Uint8ClampedArray, w: number, h: number): number[][] {
  const gray: number[][] = Array.from({ length: h }, () => Array(w).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      gray[y][x] = grayFromRgba(data[i], data[i + 1], data[i + 2]);
    }
  }
  return gray;
}

function drawToCanvas(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  rotateDeg: number,
  flipH: boolean,
  flipV: boolean,
): ImageData {
  const r = ((rotateDeg % 360) + 360) % 360;
  let ow = sw;
  let oh = sh;
  if (r === 90 || r === 270) {
    ow = sh;
    oh = sw;
  }
  const c = document.createElement('canvas');
  c.width = ow;
  c.height = oh;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');
  ctx.save();
  ctx.translate(ow / 2, oh / 2);
  if (r === 90) ctx.rotate(Math.PI / 2);
  else if (r === 180) ctx.rotate(Math.PI);
  else if (r === 270) ctx.rotate(-Math.PI / 2);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(source, 0, 0, sw, sh, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
  return ctx.getImageData(0, 0, c.width, c.height);
}

export async function rasterizeFromImageUrl(
  dataUrl: string,
  params: BrowserRasterParams,
): Promise<boolean[][]> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = dataUrl;
  await img.decode();
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;
  if (params.cropRect) {
    const c = params.cropRect;
    sx = Math.max(0, Math.min(c.x, iw - 1));
    sy = Math.max(0, Math.min(c.y, ih - 1));
    sw = Math.max(1, Math.min(c.width, iw - sx));
    sh = Math.max(1, Math.min(c.height, ih - sy));
  }

  let cw = sw;
  let ch = sh;
  if (params.resizeTo) {
    cw = Math.max(1, Math.floor(params.resizeTo[0]));
    ch = Math.max(1, Math.floor(params.resizeTo[1]));
  }

  const c0 = document.createElement('canvas');
  c0.width = sw;
  c0.height = sh;
  const x0 = c0.getContext('2d');
  if (!x0) throw new Error('Canvas unsupported');
  x0.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  let src: CanvasImageSource = c0;
  let stepW = sw;
  let stepH = sh;
  if (params.resizeTo) {
    const c1 = document.createElement('canvas');
    c1.width = cw;
    c1.height = ch;
    const x1 = c1.getContext('2d');
    if (!x1) throw new Error('Canvas unsupported');
    x1.drawImage(c0, 0, 0, sw, sh, 0, 0, cw, ch);
    src = c1;
    stepW = cw;
    stepH = ch;
  }

  const cAdj = document.createElement('canvas');
  cAdj.width = stepW;
  cAdj.height = stepH;
  const xAdj = cAdj.getContext('2d');
  if (!xAdj) throw new Error('Canvas unsupported');
  xAdj.drawImage(src as CanvasImageSource, 0, 0);
  const id0 = xAdj.getImageData(0, 0, stepW, stepH);
  applyRgbaAdjustments(
    id0.data,
    stepW,
    stepH,
    params.brightness,
    params.contrast,
    params.invert,
  );
  xAdj.putImageData(id0, 0, 0);

  const id = drawToCanvas(cAdj, stepW, stepH, params.rotateDeg, params.flipH, params.flipV);
  const w = id.width;
  const h = id.height;
  const gray = rgbaToLuma2d(id.data, w, h);

  let lines: boolean[][];
  if (params.engraveMode === 'outline') {
    const mask = thresholdRaster(gray, w, h, params.threshold);
    lines = foregroundOutline(mask);
  } else {
    switch (params.ditherMode) {
      case 'floyd':
        lines = floydSteinberg(gray, w, h, params.threshold);
        break;
      case 'atkinson':
        lines = atkinson(gray, w, h, params.threshold);
        break;
      case 'bayer':
        lines = bayer4x4(gray, w, h);
        break;
      default:
        lines = thresholdRaster(gray, w, h, params.threshold);
    }
  }

  if (!lines.length || !lines[0].length) throw new Error('Processed image has no pixels');
  if (!lines.some((row) => row.some((on) => on))) {
    throw new Error('Nothing to engrave (try outline threshold or raster mode)');
  }
  return lines;
}

export function linesToPngDataUrl(lines: boolean[][], maxSize: number): string {
  const h = lines.length;
  const w = lines[0]?.length ?? 0;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');
  const imgData = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = lines[y][x];
      const v = on ? 0 : 255;
      const i = (y * w + x) * 4;
      imgData.data[i] = v;
      imgData.data[i + 1] = v;
      imgData.data[i + 2] = v;
      imgData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const scale = Math.min(maxSize / w, maxSize / h, 1);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * scale));
  out.height = Math.max(1, Math.round(h * scale));
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Canvas unsupported');
  octx.imageSmoothingEnabled = scale < 1;
  octx.drawImage(c, 0, 0, w, h, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

export function dataUrlToPngBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
