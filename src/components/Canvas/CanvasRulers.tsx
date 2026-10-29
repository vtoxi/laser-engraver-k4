import { mmToPx } from '../../utils/mmToPx';

type Props = {
  workW: number;
  workH: number;
  bedWidthMm: number;
  bedHeightMm: number;
  pixelsPerMm: number;
};

/** Rulers drawn in scene coordinates; parent should match canvas aspect. */
export function CanvasRulers(props: Props) {
  const { workW, workH, bedWidthMm, bedHeightMm, pixelsPerMm } = props;
  const tickEveryMm = 5;
  const topTicks: { x: number; label: string }[] = [];
  for (let mm = 0; mm <= bedWidthMm; mm += tickEveryMm) {
    topTicks.push({ x: mmToPx(mm, pixelsPerMm, 1), label: `${mm}` });
  }
  const leftTicks: { y: number; label: string }[] = [];
  for (let mm = 0; mm <= bedHeightMm; mm += tickEveryMm) {
    leftTicks.push({ y: mmToPx(mm, pixelsPerMm, 1), label: `${mm}` });
  }

  const pad = 20;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: workW + pad,
        height: workH + pad,
        pointerEvents: 'none',
        zIndex: 4,
        fontFamily: 'ui-monospace, monospace',
        fontSize: 9,
        color: 'var(--lf-muted, #8b9099)',
      }}
    >
      <svg width={workW + pad} height={pad} style={{ display: 'block' }}>
        {topTicks.map((t, i) => (
          <g key={i} transform={`translate(${pad + t.x},${pad - 2})`}>
            <line x1={0} y1={0} x2={0} y2={6} stroke="currentColor" strokeWidth={1} />
            <text x={0} y={-2} textAnchor="middle" fill="currentColor" fontSize={9}>
              {t.label}
            </text>
          </g>
        ))}
        <line
          x1={pad}
          y1={pad - 1}
          x2={pad + workW}
          y2={pad - 1}
          stroke="rgba(255,68,68,0.45)"
          strokeDasharray="4 3"
        />
      </svg>
      <svg width={pad} height={workH} style={{ display: 'block', marginTop: 0 }}>
        {leftTicks.map((t, i) => (
          <g key={i} transform={`translate(${pad - 2},${t.y})`}>
            <line x1={0} y1={0} x2={6} y2={0} stroke="currentColor" strokeWidth={1} />
            <text x={-2} y={3} textAnchor="end" fill="currentColor" fontSize={9}>
              {t.label}
            </text>
          </g>
        ))}
        <line
          x1={pad - 1}
          y1={0}
          x2={pad - 1}
          y2={workH}
          stroke="rgba(255,68,68,0.45)"
          strokeDasharray="4 3"
        />
      </svg>
    </div>
  );
}
