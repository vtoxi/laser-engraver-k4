import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActiveSelection, type FabricObject } from 'fabric';
import { Eye, EyeOff, GripVertical, Lock, Trash2, Unlock } from 'lucide-react';
import { laserCanvasApi } from '../../lib/laserCanvasApi';
import { useLaserHistoryStore } from '../../store/laserHistoryStore';
import { syncJobSourceFromCanvas } from '../../lib/syncJobSourceFromCanvas';

function useCanvasRev(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const c = laserCanvasApi.get();
    if (!c) return;
    const bump = () => setN((x) => x + 1);
    c.on('object:added', bump);
    c.on('object:removed', bump);
    c.on('object:modified', bump);
    c.on('selection:created', bump);
    c.on('selection:updated', bump);
    c.on('selection:cleared', bump);
    return () => {
      c.off('object:added', bump);
      c.off('object:removed', bump);
      c.off('object:modified', bump);
      c.off('selection:created', bump);
      c.off('selection:updated', bump);
      c.off('selection:cleared', bump);
    };
  }, []);
  return n;
}

function isGuide(o: FabricObject): boolean {
  return (o as FabricObject & { lfGuide?: boolean }).lfGuide === true;
}

function rowId(o: FabricObject): string {
  return String((o as unknown as { name?: string }).name ?? '');
}

function rowLabel(o: FabricObject): string {
  const d = (o as FabricObject & { data?: { label?: string } }).data;
  const nm = (o as unknown as { name?: string }).name;
  return d?.label ?? (typeof nm === 'string' ? nm : o.type);
}

function Row(props: {
  id: string;
  label: string;
  visible: boolean;
  locked: boolean;
  onToggleVis: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onPick: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        borderRadius: 6,
        border: '1px solid var(--lf-border)',
        background: 'rgba(14, 18, 32, 0.55)',
        marginBottom: 6,
        cursor: 'default',
      }}
      onClick={props.onPick}
    >
      <button
        type="button"
        aria-label="Reorder"
        style={{ border: 'none', background: 'transparent', color: 'var(--lf-muted)', cursor: 'grab', padding: 2 }}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <span style={{ flex: 1, fontSize: 12, color: 'var(--lf-text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {props.label}
      </span>
      <button
        type="button"
        title={props.visible ? 'Hide' : 'Show'}
        style={{ border: 'none', background: 'transparent', color: 'var(--lf-text)', cursor: 'pointer', padding: 2 }}
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleVis();
        }}
      >
        {props.visible ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
      <button
        type="button"
        title={props.locked ? 'Unlock' : 'Lock'}
        style={{ border: 'none', background: 'transparent', color: 'var(--lf-text)', cursor: 'pointer', padding: 2 }}
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleLock();
        }}
      >
        {props.locked ? <Lock size={16} /> : <Unlock size={16} />}
      </button>
      <button
        type="button"
        title="Delete"
        style={{ border: 'none', background: 'transparent', color: 'var(--lf-danger)', cursor: 'pointer', padding: 2 }}
        onClick={(e) => {
          e.stopPropagation();
          props.onDelete();
        }}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export function LayerPanel() {
  const rev = useCanvasRev();
  const canvas = laserCanvasApi.get();
  const objs = canvas?.getObjects().filter((o) => !isGuide(o)) ?? [];
  const visual = [...objs].reverse();
  const ids = visual.map((o) => rowId(o));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const c = laserCanvasApi.get();
    if (!c || !e.active || !e.over || e.active.id === e.over.id) return;
    const oldIndex = ids.indexOf(String(e.active.id));
    const newIndex = ids.indexOf(String(e.over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedTop = arrayMove(visual, oldIndex, newIndex);
    const bottomFirst = [...reorderedTop].reverse();
    for (const o of objs) c.remove(o);
    for (const o of bottomFirst) c.add(o);
    c.requestRenderAll();
    useLaserHistoryStore.getState().push();
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--lf-muted)', marginBottom: 8 }}>Layers</div>
      <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {visual.map((o) => {
            const id = rowId(o);
            const label = rowLabel(o);
            const visible = o.visible !== false;
            const locked = o.selectable === false;
            return (
              <Row
                key={`${id}-${rev}`}
                id={id}
                label={label}
                visible={visible}
                locked={locked}
                onToggleVis={() => {
                  const next = !visible;
                  o.set({ visible: next, opacity: next ? 1 : 0.15 });
                  canvas?.requestRenderAll();
                }}
                onToggleLock={() => {
                  const nextLocked = !locked;
                  o.set({ selectable: !nextLocked, evented: !nextLocked });
                  canvas?.requestRenderAll();
                }}
                onDelete={() => {
                  canvas?.remove(o);
                  canvas?.discardActiveObject();
                  canvas?.requestRenderAll();
                  useLaserHistoryStore.getState().push();
                  void syncJobSourceFromCanvas();
                }}
                onPick={(e) => {
                  if (!canvas) return;
                  if (e.metaKey || e.ctrlKey) {
                    const cur = canvas.getActiveObjects();
                    const set = new Set(cur);
                    if (set.has(o)) set.delete(o);
                    else set.add(o);
                    const next = [...set];
                    if (next.length === 0) canvas.discardActiveObject();
                    else if (next.length === 1) canvas.setActiveObject(next[0]);
                    else {
                      const as = new ActiveSelection(next, { canvas });
                      canvas.setActiveObject(as);
                    }
                  } else {
                    canvas.setActiveObject(o);
                  }
                  canvas.requestRenderAll();
                }}
              />
            );
          })}
        </SortableContext>
      </DndContext>
    </div>
  );
}
