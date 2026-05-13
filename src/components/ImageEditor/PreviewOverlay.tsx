import { useEffect, useState } from 'react';

/** Simple scanline overlay to visualize raster order (not machine-accurate timing). */
export function PreviewOverlay(props: { active: boolean; src: string | null }) {
  const { active, src } = props;
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!active || !src) return;
    let raf = 0;
    const loop = () => {
      setT((x) => (x + 1) % 100);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [active, src]);

  if (!src) return null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <img
        src={src}
        alt="Burn preview"
        style={{
          width: '100%',
          borderRadius: 6,
          border: '1px solid #333',
          imageRendering: 'pixelated',
          display: 'block',
        }}
      />
      {active && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
            borderRadius: 6,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: 2,
              background: 'rgba(231, 76, 60, 0.9)',
              top: `${t}%`,
              boxShadow: '0 0 12px rgba(231,76,60,0.65)',
            }}
          />
        </div>
      )}
    </div>
  );
}
