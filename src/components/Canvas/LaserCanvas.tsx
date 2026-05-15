import { useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  Canvas,
  FabricImage,
  FabricObject,
  Line,
  Point,
  type TPointerEvent,
} from 'fabric';
import toast from 'react-hot-toast';
import throttle from 'lodash/throttle';
import { GRID_MM, SNAP_THRESHOLD_PX } from '../../utils/constants';
import { mmToPx } from '../../utils/mmToPx';
import { laserCanvasApi } from '../../lib/laserCanvasApi';
import { useLaserCanvasUiStore } from '../../store/laserCanvasUiStore';
import { useLaserHistoryStore } from '../../store/laserHistoryStore';
import { useEditorUiStore } from '../../store/editorUiStore';
import { syncJobSourceFromCanvas } from '../../lib/syncJobSourceFromCanvas';
import { CanvasRulers } from './CanvasRulers';

const BED_VIEWPORT_SELECTOR = '[data-lf-bed-viewport]';

function clientFromPointer(e: TPointerEvent): { x: number; y: number; button: number; shiftKey: boolean } {
  if ('clientX' in e && typeof (e as MouseEvent).clientX === 'number') {
    const m = e as MouseEvent;
    return { x: m.clientX, y: m.clientY, button: m.button, shiftKey: m.shiftKey };
  }
  return { x: 0, y: 0, button: 0, shiftKey: false };
}

function isLfGuide(o: FabricObject | undefined | null): boolean {
  return !!o && (o as FabricObject & { lfGuide?: boolean }).lfGuide === true;
}

function removeGuides(canvas: Canvas) {
  const guides = canvas.getObjects().filter((o) => isLfGuide(o));
  for (const g of guides) canvas.remove(g);
}

function snapValue(v: number, step: number): number {
  if (step <= 0) return v;
  return Math.round(v / step) * step;
}

export type LaserCanvasProps = {
  workW: number;
  workH: number;
  bedWidthMm: number;
  bedHeightMm: number;
  pixelsPerMm: number;
  /** When this changes, the canvas is cleared and re-seeded from `seedDataUrl`. */
  seedKey?: string | null;
  seedDataUrl?: string | null;
  onCanvasLayout?: (info: { bedW: number; bedH: number; stackW: number; stackH: number }) => void;
};

export function LaserCanvas(props: LaserCanvasProps) {
  const { workW, workH, bedWidthMm, bedHeightMm, pixelsPerMm, seedKey, seedDataUrl, onCanvasLayout } = props;
  const hostRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const panning = useRef(false);
  const lastPan = useRef<{ x: number; y: number } | null>(null);
  const oobToast = useRef<ReturnType<typeof throttle> | null>(null);
  const lastSeedKeyRef = useRef<string | null>(null);

  const gridVisible = useLaserCanvasUiStore((s) => s.gridVisible);
  const snapEnabled = useLaserCanvasUiStore((s) => s.snapEnabled);
  const viewZoom = useLaserCanvasUiStore((s) => s.viewZoom);
  const spaceHeld = useLaserCanvasUiStore((s) => s.spaceHeld);
  const editorTool = useEditorUiStore((s) => s.editorTool);
  const editorToolRef = useRef(editorTool);
  const spaceHeldRef = useRef(spaceHeld);
  editorToolRef.current = editorTool;
  spaceHeldRef.current = spaceHeld;

  const throttledSync = useMemo(
    () =>
      throttle(
        () => {
          void syncJobSourceFromCanvas().catch((e) => {
            console.error(e);
            toast.error(String(e));
          });
        },
        180,
        { leading: false, trailing: true },
      ),
    [],
  );

  useEffect(() => {
    oobToast.current = throttle(
      () => toast('Object outside engraving area', { icon: '⚠️', duration: 2600 }),
      1200,
      { leading: true, trailing: false },
    );
    return () => oobToast.current?.cancel();
  }, []);

  const applyCssSize = useCallback(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const viewport =
      (host.closest(BED_VIEWPORT_SELECTOR) as HTMLElement | null) ?? host.parentElement;
    if (!viewport) return;
    const pad = 8;
    const maxW = Math.max(80, viewport.clientWidth - pad);
    const maxH = Math.max(80, viewport.clientHeight - pad);
    const fit = Math.min(maxW / workW, maxH / workH, 1);
    const disp = Math.max(0.15, fit * viewZoom);
    const cssW = workW * disp;
    const cssH = workH * disp;
    canvas.setDimensions({ width: cssW, height: cssH }, { cssOnly: true });
    canvas.calcOffset();
    onCanvasLayout?.({ bedW: cssW + 20, bedH: cssH + 20, stackW: cssW, stackH: cssH });
  }, [workW, workH, viewZoom, onCanvasLayout]);

  useLayoutEffect(() => {
    applyCssSize();
  }, [applyCssSize]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const canvas = new Canvas(el, {
      width: workW,
      height: workH,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      selection: true,
      enableRetinaScaling: true,
      fireRightClick: true,
      stopContextMenu: true,
    });

    canvasRef.current = canvas;
    laserCanvasApi.set(canvas);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    applyCssSize();

    let cancelled = false;
    const runSeed = async () => {
      if (!seedDataUrl || !seedKey) return;
      if (lastSeedKeyRef.current === seedKey) return;
      lastSeedKeyRef.current = seedKey;
      canvas.clear();
      try {
        const img = await FabricImage.fromURL(seedDataUrl, { crossOrigin: 'anonymous' });
        if (cancelled) return;
        const el = img.getElement();
        const iw = (el as HTMLImageElement).naturalWidth || (el as HTMLImageElement).width || 1;
        const ih = (el as HTMLImageElement).naturalHeight || (el as HTMLImageElement).height || 1;
        const sc = Math.min(workW / iw, workH / ih, 1);
        img.set({
          name: `lf-${crypto.randomUUID()}`,
          scaleX: sc,
          scaleY: sc,
          left: (workW - iw * sc) / 2,
          top: (workH - ih * sc) / 2,
        });
        (img as unknown as { data?: { label?: string } }).data = { label: 'Image 1' };
        img.setCoords();
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
        useLaserHistoryStore.getState().clear();
        useLaserHistoryStore.getState().push();
        throttledSync();
      } catch (e) {
        console.error(e);
        toast.error('Could not load image onto canvas');
      }
    };
    void runSeed();

    const gridStep = mmToPx(GRID_MM, pixelsPerMm, 1);

    const onMoving = (opt: { target?: FabricObject; e?: TPointerEvent }) => {
      const target = opt.target;
      if (!target || isLfGuide(target)) return;
      const e = opt.e;
      const shift = 'shiftKey' in (e ?? {}) && !!(e as MouseEvent).shiftKey;
      if (snapEnabled && !shift && gridStep > 0) {
        target.set({
          left: snapValue(target.left ?? 0, gridStep),
          top: snapValue(target.top ?? 0, gridStep),
        });
        target.setCoords();
      }

      removeGuides(canvas);
      const zoom = canvas.getZoom();
      const threshScene = SNAP_THRESHOLD_PX / Math.max(0.001, zoom);
      const bbox = target.getBoundingRect();
      const cx = bbox.left + bbox.width / 2;
      const cy = bbox.top + bbox.height / 2;
      const guides: Line[] = [];

      for (const o of canvas.getObjects()) {
        if (o === target || isLfGuide(o)) continue;
        const b = o.getBoundingRect();
        const pts: { x1: number; y1: number; x2: number; y2: number }[] = [];
        const x1 = b.left;
        const x2 = b.left + b.width;
        const xm = (x1 + x2) / 2;
        const y1 = b.top;
        const y2 = b.top + b.height;
        const ym = (y1 + y2) / 2;
        if (Math.abs(bbox.left - x1) < threshScene) pts.push({ x1, y1: 0, x2: x1, y2: workH });
        if (Math.abs(bbox.left + bbox.width - x2) < threshScene) pts.push({ x1: x2, y1: 0, x2: x2, y2: workH });
        if (Math.abs(cx - xm) < threshScene) pts.push({ x1: xm, y1: 0, x2: xm, y2: workH });
        if (Math.abs(bbox.top - y1) < threshScene) pts.push({ x1: 0, y1, x2: workW, y2: y1 });
        if (Math.abs(bbox.top + bbox.height - y2) < threshScene) pts.push({ x1: 0, y1: y2, x2: workW, y2: y2 });
        if (Math.abs(cy - ym) < threshScene) pts.push({ x1: 0, y1: ym, x2: workW, y2: ym });
        for (const p of pts) {
          const line = new Line([p.x1, p.y1, p.x2, p.y2], {
            stroke: '#00d4ff',
            strokeWidth: 1 / zoom,
            selectable: false,
            evented: false,
            excludeFromExport: true,
            opacity: 0.85,
          });
          (line as FabricObject & { lfGuide?: boolean }).lfGuide = true;
          guides.push(line);
        }
      }
      const mx = workW / 2;
      const my = workH / 2;
      if (Math.abs(cx - mx) < threshScene) {
        const line = new Line([mx, 0, mx, workH], {
          stroke: '#00d4ff',
          strokeWidth: 1 / zoom,
          selectable: false,
          evented: false,
          excludeFromExport: true,
        });
        (line as FabricObject & { lfGuide?: boolean }).lfGuide = true;
        guides.push(line);
      }
      if (Math.abs(cy - my) < threshScene) {
        const line = new Line([0, my, workW, my], {
          stroke: '#00d4ff',
          strokeWidth: 1 / zoom,
          selectable: false,
          evented: false,
          excludeFromExport: true,
        });
        (line as FabricObject & { lfGuide?: boolean }).lfGuide = true;
        guides.push(line);
      }
      for (const g of guides) canvas.add(g);
      canvas.requestRenderAll();
    };

    const checkOob = (target?: FabricObject) => {
      if (!target || isLfGuide(target)) return;
      const b = target.getBoundingRect();
      const outside =
        b.left < -0.5 ||
        b.top < -0.5 ||
        b.left + b.width > workW + 0.5 ||
        b.top + b.height > workH + 0.5;
      if (outside) {
        target.set({ opacity: Math.min(target.opacity ?? 1, 0.92) });
        oobToast.current?.();
      } else {
        target.set({ opacity: 1 });
      }
    };

    const onModified = (opt: { target?: FabricObject }) => {
      removeGuides(canvas);
      checkOob(opt.target);
      useLaserHistoryStore.getState().push();
      throttledSync();
    };

    const onRotating = (opt: { target?: FabricObject; e?: TPointerEvent }) => {
      const t = opt.target;
      if (!t || isLfGuide(t)) return;
      if (opt.e && clientFromPointer(opt.e).shiftKey) {
        const snap = 45;
        const deg = (Math.round((t.angle ?? 0) / snap) * snap) % 360;
        t.set({ angle: deg });
        t.setCoords();
      }
    };

    canvas.on('object:moving', onMoving);
    canvas.on('object:scaling', onMoving);
    canvas.on('object:modified', onModified);
    canvas.on('object:rotating', onRotating);
    canvas.on('text:changed', () => {
      useLaserHistoryStore.getState().push();
      throttledSync();
    });

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const delta = ev.deltaY;
      const z = canvas.getZoom();
      const next = delta > 0 ? z * 0.92 : z / 0.92;
      const clamped = Math.min(4, Math.max(0.25, next));
      const rect = canvas.lowerCanvasEl.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      canvas.zoomToPoint(new Point(px, py), clamped);
      canvas.requestRenderAll();
    };
    canvas.upperCanvasEl.addEventListener('wheel', onWheel, { passive: false });

    const onMouseDown = (opt: { e: TPointerEvent }) => {
      const e = clientFromPointer(opt.e);
      const panMode = editorToolRef.current === 'pan' || spaceHeldRef.current;
      if (panMode && e.button === 0) {
        panning.current = true;
        lastPan.current = { x: e.x, y: e.y };
        canvas.selection = false;
        canvas.defaultCursor = 'grabbing';
      }
    };
    const onMouseMove = (opt: { e: TPointerEvent }) => {
      if (!panning.current || !lastPan.current) return;
      const e = clientFromPointer(opt.e);
      const dx = e.x - lastPan.current.x;
      const dy = e.y - lastPan.current.y;
      lastPan.current = { x: e.x, y: e.y };
      canvas.relativePan(new Point(dx, dy));
    };
    const onMouseUp = () => {
      if (panning.current) {
        panning.current = false;
        lastPan.current = null;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
      }
    };

    canvas.on('mouse:down', onMouseDown);
    canvas.on('mouse:move', onMouseMove);
    canvas.on('mouse:up', onMouseUp);

    const host = hostRef.current;
    const viewport =
      (host?.closest(BED_VIEWPORT_SELECTOR) as HTMLElement | null) ?? host?.parentElement ?? null;
    const ro =
      viewport &&
      new ResizeObserver(() => {
        applyCssSize();
      });
    if (viewport && ro) ro.observe(viewport);

    return () => {
      cancelled = true;
      lastSeedKeyRef.current = null;
      ro?.disconnect();
      canvas.upperCanvasEl.removeEventListener('wheel', onWheel);
      throttledSync.cancel();
      canvas.dispose();
      canvasRef.current = null;
      laserCanvasApi.set(null);
    };
  }, [workW, workH, pixelsPerMm, snapEnabled, throttledSync, applyCssSize, seedKey, seedDataUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.selection = editorTool !== 'pan';
    canvas.defaultCursor = editorTool === 'pan' || spaceHeld ? 'grab' : 'default';
  }, [editorTool, spaceHeld]);

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        verticalAlign: 'top',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 0 0 2px rgba(255, 68, 68, 0.55)',
        background: '#fff',
        paddingLeft: 20,
        paddingTop: 20,
      }}
    >
      <CanvasRulers
        workW={workW}
        workH={workH}
        bedWidthMm={bedWidthMm}
        bedHeightMm={bedHeightMm}
        pixelsPerMm={pixelsPerMm}
      />
      {gridVisible ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 1,
            backgroundImage: `radial-gradient(circle, #d8d8d8 0.6px, transparent 0.7px)`,
            backgroundSize: `${mmToPx(GRID_MM, pixelsPerMm, 1)}px ${mmToPx(GRID_MM, pixelsPerMm, 1)}px`,
            mixBlendMode: 'multiply',
            opacity: 0.55,
          }}
        />
      ) : null}
      <canvas ref={hostRef} style={{ display: 'block', position: 'relative', zIndex: 2 }} />
    </div>
  );
}
