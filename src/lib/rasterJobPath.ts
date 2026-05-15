/** Job pixel order: row 0→H−1, within each row column 0→W−1 (LTR), matches K4 `bytesImageLine` bit packing. */
export type Pixel = { x: number; y: number };

export function flattenJobPixels(lines: boolean[][]): Pixel[] {
  const out: Pixel[] = [];
  for (let y = 0; y < lines.length; y++) {
    const row = lines[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x]) out.push({ x, y });
    }
  }
  return out;
}

/** Repeat the same raster path for each pass (visual only). */
export function repeatJobPoints(points: Pixel[], passes: number): Pixel[] {
  const p = Math.max(1, Math.floor(passes));
  if (p <= 1) return points;
  const out: Pixel[] = [];
  for (let i = 0; i < p; i++) out.push(...points);
  return out;
}
