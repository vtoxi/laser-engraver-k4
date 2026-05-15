/**
 * Map logical image pixel (job / crop space) to fractions (0–1) within the laid-out `<img>` element,
 * matching letterboxing from `object-fit: contain` (same convention as crop overlay `clientToImg`).
 */
export function logicalPixelToElementFraction(
  img: HTMLImageElement,
  ix: number,
  iy: number,
  logicalIw: number,
  logicalIh: number,
): { u: number; v: number } {
  const r = img.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return { u: 0, v: 0 };
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (nw <= 0 || nh <= 0) {
    return {
      u: Math.max(0, Math.min(1, ix / logicalIw)),
      v: Math.max(0, Math.min(1, iy / logicalIh)),
    };
  }
  const scale = Math.min(r.width / nw, r.height / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const ox = (r.width - dw) / 2;
  const oy = (r.height - dh) / 2;
  const px = (ix / logicalIw) * dw + ox;
  const py = (iy / logicalIh) * dh + oy;
  return {
    u: Math.max(0, Math.min(1, px / r.width)),
    v: Math.max(0, Math.min(1, py / r.height)),
  };
}
