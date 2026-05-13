import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { useImageStore, type CropRectPayload } from '../../store/imageStore';

type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type Rect = { x: number; y: number; w: number; h: number };

/** Width / height. Corner drags only when aspect lock is active. */
function applyDragCornerAspect(
  mode: 'ne' | 'nw' | 'se' | 'sw',
  R0: Rect,
  dix: number,
  diy: number,
  iw: number,
  ih: number,
  r: number,
): Rect {
  const minS = 4;
  const ar = Math.max(1e-6, r);

  switch (mode) {
    case 'se': {
      const maxW = iw - R0.x;
      const maxH = ih - R0.y;
      let nw = Math.max(minS, Math.min(R0.w + dix, maxW));
      let nh = nw / ar;
      if (nh > maxH) {
        nh = Math.max(minS, maxH);
        nw = nh * ar;
      }
      if (nw < minS) {
        nw = minS;
        nh = Math.min(nw / ar, maxH);
      }
      return { x: R0.x, y: R0.y, w: nw, h: nh };
    }
    case 'ne': {
      const bottom = R0.y + R0.h;
      const maxW = iw - R0.x;
      const maxH = bottom;
      let nw = Math.max(minS, Math.min(R0.w + dix, maxW));
      let nh = nw / ar;
      if (nh > maxH) {
        nh = Math.max(minS, maxH);
        nw = nh * ar;
      }
      const y = bottom - nh;
      return { x: R0.x, y, w: nw, h: nh };
    }
    case 'sw': {
      const right = R0.x + R0.w;
      const maxW = right;
      const maxH = ih - R0.y;
      let nh = Math.max(minS, Math.min(R0.h + diy, maxH));
      let nw = nh * ar;
      if (nw > maxW) {
        nw = Math.max(minS, maxW);
        nh = nw / ar;
      }
      const x = right - nw;
      return { x, y: R0.y, w: nw, h: nh };
    }
    case 'nw': {
      const right = R0.x + R0.w;
      const bottom = R0.y + R0.h;
      const maxW = right;
      const maxH = bottom;
      let nh = Math.max(minS, Math.min(R0.h - diy, maxH));
      let nw = nh * ar;
      if (nw > maxW) {
        nw = Math.max(minS, maxW);
        nh = nw / ar;
      }
      const x = right - nw;
      const y = bottom - nh;
      return { x, y, w: nw, h: nh };
    }
    default:
      return R0;
  }
}

/**
 * Map pointer to logical image pixels (`logicalIw` × `logicalIh`, same as job / store).
 * Handles letterboxed `object-fit: contain` and previews smaller than full size (e.g. Tauri bed thumbnail).
 */
function clientToImg(
  clientX: number,
  clientY: number,
  img: HTMLImageElement,
  logicalIw: number,
  logicalIh: number,
): { ix: number; iy: number } {
  const r = img.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return { ix: 0, iy: 0 };
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (nw <= 0 || nh <= 0) {
    const u = (clientX - r.left) / r.width;
    const v = (clientY - r.top) / r.height;
    return { ix: u * logicalIw, iy: v * logicalIh };
  }
  const scale = Math.min(r.width / nw, r.height / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const ox = r.left + (r.width - dw) / 2;
  const oy = r.top + (r.height - dh) / 2;
  const u = Math.max(0, Math.min(1, (clientX - ox) / dw));
  const v = Math.max(0, Math.min(1, (clientY - oy) / dh));
  return { ix: u * logicalIw, iy: v * logicalIh };
}

function rectFromStore(cropRect: { x: number; y: number; width: number; height: number } | null, iw: number, ih: number): Rect {
  if (cropRect) {
    return { x: cropRect.x, y: cropRect.y, w: cropRect.width, h: cropRect.height };
  }
  return { x: 0, y: 0, w: iw, h: ih };
}

function applyDrag(
  mode: DragMode,
  R0: Rect,
  dix: number,
  diy: number,
  iw: number,
  ih: number,
  aspectWOverH: number | null,
): Rect {
  const minS = 4;
  const useAspect =
    aspectWOverH != null &&
    Number.isFinite(aspectWOverH) &&
    aspectWOverH > 0 &&
    (mode === 'ne' || mode === 'nw' || mode === 'se' || mode === 'sw');
  if (useAspect) {
    return applyDragCornerAspect(mode as 'ne' | 'nw' | 'se' | 'sw', R0, dix, diy, iw, ih, aspectWOverH!);
  }
  switch (mode) {
    case 'move': {
      let nx = R0.x + dix;
      let ny = R0.y + diy;
      nx = Math.max(0, Math.min(nx, iw - R0.w));
      ny = Math.max(0, Math.min(ny, ih - R0.h));
      return { x: nx, y: ny, w: R0.w, h: R0.h };
    }
    case 'e': {
      const nw = Math.max(minS, Math.min(R0.w + dix, iw - R0.x));
      return { x: R0.x, y: R0.y, w: nw, h: R0.h };
    }
    case 'w': {
      const nx = Math.max(0, Math.min(R0.x + dix, R0.x + R0.w - minS));
      const nw = R0.x + R0.w - nx;
      return { x: nx, y: R0.y, w: nw, h: R0.h };
    }
    case 's': {
      const nh = Math.max(minS, Math.min(R0.h + diy, ih - R0.y));
      return { x: R0.x, y: R0.y, w: R0.w, h: nh };
    }
    case 'n': {
      const ny = Math.max(0, Math.min(R0.y + diy, R0.y + R0.h - minS));
      const nh = R0.y + R0.h - ny;
      return { x: R0.x, y: ny, w: R0.w, h: nh };
    }
    case 'se': {
      const nw = Math.max(minS, Math.min(R0.w + dix, iw - R0.x));
      const nh = Math.max(minS, Math.min(R0.h + diy, ih - R0.y));
      return { x: R0.x, y: R0.y, w: nw, h: nh };
    }
    case 'ne': {
      const ny = Math.max(0, Math.min(R0.y + diy, R0.y + R0.h - minS));
      const nh = R0.y + R0.h - ny;
      const nw = Math.max(minS, Math.min(R0.w + dix, iw - R0.x));
      return { x: R0.x, y: ny, w: nw, h: nh };
    }
    case 'sw': {
      const nx = Math.max(0, Math.min(R0.x + dix, R0.x + R0.w - minS));
      const nw = R0.x + R0.w - nx;
      const nh = Math.max(minS, Math.min(R0.h + diy, ih - R0.y));
      return { x: nx, y: R0.y, w: nw, h: nh };
    }
    case 'nw': {
      const nx = Math.max(0, Math.min(R0.x + dix, R0.x + R0.w - minS));
      const nw = R0.x + R0.w - nx;
      const ny = Math.max(0, Math.min(R0.y + diy, R0.y + R0.h - minS));
      const nh = R0.y + R0.h - ny;
      return { x: nx, y: ny, w: nw, h: nh };
    }
    default:
      return R0;
  }
}

function rectFromPayload(p: CropRectPayload): Rect {
  return { x: p.x, y: p.y, w: p.width, h: p.height };
}

/** Returns null when crop is full frame (same as store convention). */
function normalizeRectToPayload(r: Rect, iw: number, ih: number): CropRectPayload | null {
  const xi = Math.max(0, Math.min(Math.round(r.x), iw - 1));
  const yi = Math.max(0, Math.min(Math.round(r.y), ih - 1));
  const wi = Math.max(1, Math.min(Math.round(r.w), iw - xi));
  const hi = Math.max(1, Math.min(Math.round(r.h), ih - yi));
  const fullFrame = xi === 0 && yi === 0 && wi === iw && hi === ih;
  return fullFrame ? null : { x: xi, y: yi, width: wi, height: hi };
}

function commitRect(r: Rect, iw: number, ih: number) {
  const cropRect = normalizeRectToPayload(r, iw, ih);
  const prev = useImageStore.getState().params;
  const nextParams = { ...prev, cropRect };
  useImageStore.setState({ params: nextParams });
  void useImageStore.getState().generatePreview(nextParams);
}

type Props = {
  imgRef: RefObject<HTMLImageElement | null>;
  imageWidth: number;
  imageHeight: number;
  aspectWOverH?: number | null;
  interactive?: boolean;
  /** When set, crop edits call onChange instead of writing the image store (draft mode). */
  controlledCrop?: {
    rect: CropRectPayload;
    onChange: (next: CropRectPayload | null) => void;
  };
};

export function InteractiveCropOverlay(props: Props) {
  const {
    imgRef,
    imageWidth: iw,
    imageHeight: ih,
    aspectWOverH = null,
    interactive = true,
    controlledCrop,
  } = props;
  const cc = controlledCrop ?? null;
  const cropRect = useImageStore((s) => s.params.cropRect);
  const [draft, setDraft] = useState<Rect | null>(null);
  const draftRef = useRef<Rect | null>(null);

  const syncKey = cc
    ? `${cc.rect.x},${cc.rect.y},${cc.rect.width},${cc.rect.height}`
    : `${cropRect?.x ?? 0},${cropRect?.y ?? 0},${cropRect?.width ?? 0},${cropRect?.height ?? 0}`;

  useEffect(() => {
    draftRef.current = null;
    setDraft(null);
  }, [syncKey, iw, ih]);

  const baseRect = cc ? rectFromPayload(cc.rect) : rectFromStore(cropRect, iw, ih);
  const display = draft ?? baseRect;
  const leftPct = (display.x / iw) * 100;
  const topPct = (display.y / ih) * 100;
  const wPct = (display.w / iw) * 100;
  const hPct = (display.h / ih) * 100;
  const isFullFrame =
    display.x === 0 && display.y === 0 && Math.round(display.w) === iw && Math.round(display.h) === ih;

  const shadeBase: CSSProperties = {
    position: 'absolute',
    background: 'rgba(0,0,0,0.5)',
    pointerEvents: 'none',
    zIndex: 0,
  };

  const beginDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!interactive) return;
    const img = imgRef.current;
    if (!img || iw <= 0 || ih <= 0) return;

    const capEl = e.currentTarget;
    const pointerId = e.pointerId;
    if (capEl instanceof HTMLElement) {
      try {
        capEl.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }

    const base = draftRef.current ?? (cc ? rectFromPayload(cc.rect) : rectFromStore(useImageStore.getState().params.cropRect, iw, ih));
    const p0 = clientToImg(e.clientX, e.clientY, img, iw, ih);
    const R0 = { ...base };
    const session = { mode, R0, startIx: p0.ix, startIy: p0.iy, iw, ih };

    const onMove = (ev: PointerEvent) => {
      const p = clientToImg(ev.clientX, ev.clientY, img, session.iw, session.ih);
      const dix = p.ix - session.startIx;
      const diy = p.iy - session.startIy;
      const next = applyDrag(session.mode, session.R0, dix, diy, session.iw, session.ih, aspectWOverH);
      draftRef.current = next;
      setDraft(next);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (capEl instanceof HTMLElement) {
        try {
          if (capEl.hasPointerCapture(pointerId)) capEl.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
      }
      const finalR = draftRef.current ?? session.R0;
      draftRef.current = null;
      setDraft(null);
      if (cc) {
        cc.onChange(normalizeRectToPayload(finalR, session.iw, session.ih));
      } else {
        commitRect(finalR, session.iw, session.ih);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const edgeLocked = aspectWOverH != null && Number.isFinite(aspectWOverH) && aspectWOverH > 0;
  const hz = 22;
  const handleStyle = (cursor: string, extra?: CSSProperties, isEdge = false): CSSProperties => {
    const pe = !interactive ? 'none' : isEdge && edgeLocked ? 'none' : 'auto';
    const op = isEdge && edgeLocked ? 0.35 : 1;
    return {
      position: 'absolute',
      width: hz,
      height: hz,
      marginLeft: -hz / 2,
      marginTop: -hz / 2,
      background: 'rgba(46, 204, 113, 0.95)',
      border: '1px solid rgba(0,0,0,0.45)',
      borderRadius: 2,
      cursor,
      pointerEvents: pe,
      opacity: op,
      boxSizing: 'border-box',
      zIndex: 2,
      ...extra,
    };
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        borderRadius: 6,
      }}
    >
      {!isFullFrame && (
        <>
          <div style={{ ...shadeBase, left: 0, top: 0, width: '100%', height: `${topPct}%` }} />
          <div
            style={{
              ...shadeBase,
              left: 0,
              top: `${topPct + hPct}%`,
              width: '100%',
              height: `${100 - topPct - hPct}%`,
            }}
          />
          <div
            style={{
              ...shadeBase,
              left: 0,
              top: `${topPct}%`,
              width: `${leftPct}%`,
              height: `${hPct}%`,
            }}
          />
          <div
            style={{
              ...shadeBase,
              left: `${leftPct + wPct}%`,
              top: `${topPct}%`,
              width: `${100 - leftPct - wPct}%`,
              height: `${hPct}%`,
            }}
          />
        </>
      )}
      <div
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${wPct}%`,
          height: `${hPct}%`,
          boxSizing: 'border-box',
          border: '2px solid rgba(46, 204, 113, 0.95)',
          borderRadius: 4,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.35) inset',
          pointerEvents: interactive ? 'auto' : 'none',
          cursor: interactive ? 'move' : 'default',
          zIndex: 1,
          touchAction: interactive ? 'none' : undefined,
        }}
        onPointerDown={(e) => beginDrag('move', e)}
      >
        <div
          style={handleStyle('nw-resize', { left: 0, top: 0 })}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginDrag('nw', e);
          }}
        />
        <div
          style={handleStyle('n-resize', { left: '50%', top: 0 }, true)}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginDrag('n', e);
          }}
        />
        <div
          style={handleStyle('ne-resize', { left: '100%', top: 0 })}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginDrag('ne', e);
          }}
        />
        <div
          style={handleStyle('e-resize', { left: '100%', top: '50%' }, true)}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginDrag('e', e);
          }}
        />
        <div
          style={handleStyle('se-resize', { left: '100%', top: '100%' })}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginDrag('se', e);
          }}
        />
        <div
          style={handleStyle('s-resize', { left: '50%', top: '100%' }, true)}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginDrag('s', e);
          }}
        />
        <div
          style={handleStyle('sw-resize', { left: 0, top: '100%' })}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginDrag('sw', e);
          }}
        />
        <div
          style={handleStyle('w-resize', { left: 0, top: '50%' }, true)}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginDrag('w', e);
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          left: 6,
          right: 6,
          fontSize: 11,
          color: 'rgba(255,255,255,0.9)',
          textShadow: '0 0 4px #000',
          pointerEvents: 'none',
          lineHeight: 1.3,
          zIndex: 3,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {Math.round(display.x)}, {Math.round(display.y)} · {Math.round(display.w)}×{Math.round(display.h)}
      </div>
    </div>
  );
}
