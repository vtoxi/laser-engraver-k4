import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { agentDebugLog } from '../../lib/agentDebugLog';
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
  /** Stronger dim outside crop while actively adjusting (crop tool). */
  strongOutsideDim?: boolean;
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
    strongOutsideDim = false,
    controlledCrop,
  } = props;
  const cc = controlledCrop ?? null;
  const cropRect = useImageStore((s) => s.params.cropRect);
  const [draft, setDraft] = useState<Rect | null>(null);
  const draftRef = useRef<Rect | null>(null);
  /** Removes window drag listeners + pointer capture (see beginDrag). Unmount must not leave stale pointerup. */
  const windowDragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      windowDragCleanupRef.current?.();
      windowDragCleanupRef.current = null;
    },
    [],
  );

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

  const outsideShade =
    strongOutsideDim && interactive ? 'rgba(5,8,18,0.62)' : 'rgba(0,0,0,0.28)';
  const fullFrameHint =
    strongOutsideDim && interactive ? 'rgba(5,8,18,0.22)' : 'rgba(0,0,0,0.12)';

  const shadeBase: CSSProperties = {
    position: 'absolute',
    background: outsideShade,
    pointerEvents: 'none',
    zIndex: 0,
  };

  const activeFrameStyle: CSSProperties =
    strongOutsideDim && interactive
      ? {
          border: '1px solid rgba(88, 230, 156, 0.95)',
          boxShadow:
            '0 0 0 1px rgba(0,0,0,0.35) inset, 0 0 28px rgba(46, 204, 113, 0.22)',
        }
      : {
          border: '1px solid rgba(46, 204, 113, 0.9)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.25) inset',
        };

  const beginDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!interactive) return;
    windowDragCleanupRef.current?.();
    const img = imgRef.current;
    if (!img || iw <= 0 || ih <= 0) return;
    // #region agent log
    agentDebugLog({
      runId: 'pre',
      hypothesisId: 'H2',
      location: 'InteractiveCropOverlay.tsx:beginDrag',
      message: 'crop drag started',
      data: {
        mode,
        iw,
        ih,
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        hasControlled: !!cc,
      },
    });
    // #endregion

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

    function removeWindowDrag() {
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
      windowDragCleanupRef.current = null;
    }

    function onUp() {
      removeWindowDrag();
      const finalR = draftRef.current ?? session.R0;
      draftRef.current = null;
      setDraft(null);
      const payload = normalizeRectToPayload(finalR, session.iw, session.ih);
      // #region agent log
      agentDebugLog({
        runId: 'pre',
        hypothesisId: 'H3',
        location: 'InteractiveCropOverlay.tsx:onUp',
        message: 'crop drag end commit',
        data: {
          mode: session.mode,
          finalR,
          payload,
          controlled: !!cc,
        },
      });
      // #endregion
      if (cc) {
        cc.onChange(payload);
      } else {
        commitRect(finalR, session.iw, session.ih);
      }
    }

    windowDragCleanupRef.current = removeWindowDrag;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const edgeLocked = aspectWOverH != null && Number.isFinite(aspectWOverH) && aspectWOverH > 0;
  const hit = 36;
  const vis = 11;
  const edgeBars = interactive && !edgeLocked;

  const cornerHandle = (cursor: string, left: string | 0, top: string | 0, mode: DragMode) => (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: hit,
        height: hit,
        marginLeft: -hit / 2,
        marginTop: -hit / 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor,
        pointerEvents: interactive ? 'auto' : 'none',
        zIndex: 2,
        touchAction: interactive ? 'none' : undefined,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        beginDrag(mode, e);
      }}
    >
      <div
        style={{
          width: vis,
          height: vis,
          background: 'rgba(46, 204, 113, 0.95)',
          border: '1px solid rgba(0,0,0,0.5)',
          borderRadius: 2,
          pointerEvents: 'none',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.12)',
        }}
      />
    </div>
  );

  const edgeHandle = (cursor: string, mode: DragMode, style: CSSProperties) => (
    <div
      style={{
        position: 'absolute',
        zIndex: 2,
        cursor,
        pointerEvents: edgeBars ? 'auto' : 'none',
        touchAction: interactive ? 'none' : undefined,
        ...style,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        beginDrag(mode, e);
      }}
    />
  );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        borderRadius: 6,
      }}
    >
      {isFullFrame && interactive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 6,
            background: fullFrameHint,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}
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
          borderRadius: 3,
          pointerEvents: interactive ? 'auto' : 'none',
          cursor: interactive ? 'move' : 'default',
          zIndex: 1,
          touchAction: interactive ? 'none' : undefined,
          ...activeFrameStyle,
        }}
        onPointerDown={(e) => beginDrag('move', e)}
      >
        {cornerHandle('nw-resize', 0, 0, 'nw')}
        {edgeHandle('n-resize', 'n', {
          left: '50%',
          top: 0,
          width: 'min(168px, 52%)',
          height: 32,
          transform: 'translate(-50%, -50%)',
        })}
        {cornerHandle('ne-resize', '100%', 0, 'ne')}
        {edgeHandle('e-resize', 'e', {
          right: 0,
          top: '50%',
          width: 32,
          height: 'min(160px, 55%)',
          transform: 'translate(50%, -50%)',
        })}
        {cornerHandle('se-resize', '100%', '100%', 'se')}
        {edgeHandle('s-resize', 's', {
          left: '50%',
          bottom: 0,
          width: 'min(168px, 52%)',
          height: 32,
          transform: 'translate(-50%, 50%)',
        })}
        {cornerHandle('sw-resize', 0, '100%', 'sw')}
        {edgeHandle('w-resize', 'w', {
          left: 0,
          top: '50%',
          width: 32,
          height: 'min(160px, 55%)',
          transform: 'translate(-50%, -50%)',
        })}
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
