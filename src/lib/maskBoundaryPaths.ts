import type { Pixel } from './rasterJobPath';

function inFg(mask: boolean[][], y: number, x: number): boolean {
  const h = mask.length;
  const w = mask[0]?.length ?? 0;
  return y >= 0 && y < h && x >= 0 && x < w && mask[y][x];
}

/** Pixels on the boundary of the foreground (4-neighbor touches background or edge). */
function boundaryPixelsOfFilledMask(mask: boolean[][]): Pixel[] {
  const h = mask.length;
  if (!h) return [];
  const w = mask[0].length;
  const out: Pixel[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y][x]) continue;
      if (
        !inFg(mask, y - 1, x) ||
        !inFg(mask, y + 1, x) ||
        !inFg(mask, y, x - 1) ||
        !inFg(mask, y, x + 1)
      ) {
        out.push({ x, y });
      }
    }
  }
  return out;
}

const keyOf = (p: Pixel) => `${p.y},${p.x}`;

const D8: [number, number][] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/**
 * Closed-ish loops along the threshold shape boundary for preview (not identical to K4 job order).
 * Uses 8-connected components of boundary pixels, ordered by angle from each component centroid.
 */
export function boundaryLoopsFromFilledMask(mask: boolean[][]): Pixel[][] {
  const boundary = boundaryPixelsOfFilledMask(mask);
  if (boundary.length === 0) return [];

  const bset = new Set(boundary.map(keyOf));
  const visited = new Set<string>();
  const loops: Pixel[][] = [];

  for (const seed of boundary) {
    const sk = keyOf(seed);
    if (visited.has(sk)) continue;

    const comp: Pixel[] = [];
    const stack: Pixel[] = [seed];
    visited.add(sk);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const [dy, dx] of D8) {
        const ny = cur.y + dy;
        const nx = cur.x + dx;
        const nk = `${ny},${nx}`;
        if (!bset.has(nk) || visited.has(nk)) continue;
        visited.add(nk);
        stack.push({ x: nx, y: ny });
      }
    }

    let sx = 0;
    let sy = 0;
    for (const p of comp) {
      sx += p.x;
      sy += p.y;
    }
    const cx = sx / comp.length;
    const cy = sy / comp.length;
    comp.sort((a, b) => {
      const ta = Math.atan2(a.y - cy, a.x - cx);
      const tb = Math.atan2(b.y - cy, b.x - cx);
      return ta - tb;
    });
    loops.push(comp);
  }

  return loops;
}

export function flattenContourLoops(loops: Pixel[][]): Pixel[] {
  const out: Pixel[] = [];
  for (const L of loops) out.push(...L);
  return out;
}
