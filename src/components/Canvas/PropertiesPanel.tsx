import { useEffect, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import type { FabricObject } from 'fabric';
import { laserCanvasApi } from '../../lib/laserCanvasApi';
import { pxToMm, mmToPx } from '../../utils/mmToPx';
import { useSettingsStore } from '../../store/settingsStore';
import { syncJobSourceFromCanvas } from '../../lib/syncJobSourceFromCanvas';
import { useLaserHistoryStore } from '../../store/laserHistoryStore';

function rowId(o: FabricObject): string {
  return String((o as unknown as { name?: string }).name ?? '');
}

function useSelection(): FabricObject | undefined {
  const [sel, setSel] = useState<FabricObject | undefined>(() => laserCanvasApi.get()?.getActiveObject());
  useEffect(() => {
    const c = laserCanvasApi.get();
    if (!c) return;
    const bump = () => setSel(c.getActiveObject());
    c.on('selection:created', bump);
    c.on('selection:updated', bump);
    c.on('selection:cleared', bump);
    return () => {
      c.off('selection:created', bump);
      c.off('selection:updated', bump);
      c.off('selection:cleared', bump);
    };
  }, []);
  return sel;
}

export function PropertiesPanel() {
  const { pixelsPerMm } = useSettingsStore();
  const obj = useSelection();

  if (!obj) {
    return (
      <div style={{ fontSize: 12, color: 'var(--lf-muted)' }}>
        Select an object on the bed to edit position and rotation.
      </div>
    );
  }

  const xMm = pxToMm(obj.left ?? 0, pixelsPerMm, 1);
  const yMm = pxToMm(obj.top ?? 0, pixelsPerMm, 1);
  const angle = obj.angle ?? 0;

  const lab = { display: 'block', fontSize: 11, color: 'var(--lf-muted)', marginBottom: 4 } as const;
  const row = { marginBottom: 12 } as const;

  const apply = () => {
    obj.setCoords();
    laserCanvasApi.get()?.requestRenderAll();
    useLaserHistoryStore.getState().push();
    void syncJobSourceFromCanvas();
  };

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--lf-muted)', marginBottom: 10 }}>Properties</div>
      <div style={row}>
        <label style={lab}>X (mm)</label>
        <input
          className="lf-input"
          type="number"
          defaultValue={Math.round(xMm * 100) / 100}
          key={`x-${rowId(obj)}`}
          step={0.1}
          onBlur={(e) => {
            const v = Number(e.target.value);
            obj.set({ left: mmToPx(v, pixelsPerMm, 1) });
            apply();
          }}
        />
      </div>
      <div style={row}>
        <label style={lab}>Y (mm)</label>
        <input
          className="lf-input"
          type="number"
          defaultValue={Math.round(yMm * 100) / 100}
          key={`y-${rowId(obj)}`}
          step={0.1}
          onBlur={(e) => {
            const v = Number(e.target.value);
            obj.set({ top: mmToPx(v, pixelsPerMm, 1) });
            apply();
          }}
        />
      </div>
      <div style={row}>
        <label style={lab}>Rotation (°)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Slider.Root
            style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', height: 20 }}
            value={[angle]}
            min={0}
            max={359}
            step={1}
            onValueChange={([a]) => {
              obj.set({ angle: a });
              obj.setCoords();
              laserCanvasApi.get()?.requestRenderAll();
            }}
            onValueCommit={() => apply()}
          >
            <Slider.Track
              style={{ background: 'var(--lf-border)', height: 4, flex: 1, borderRadius: 2, position: 'relative' }}
            >
              <Slider.Range style={{ position: 'absolute', background: 'var(--lf-accent, #ff6b2b)', height: '100%', borderRadius: 2 }} />
            </Slider.Track>
            <Slider.Thumb
              aria-label="Rotation"
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                background: '#fff',
                border: '2px solid var(--lf-accent, #ff6b2b)',
              }}
            />
          </Slider.Root>
        </div>
      </div>
    </div>
  );
}
