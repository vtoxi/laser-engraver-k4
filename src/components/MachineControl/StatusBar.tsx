import { useSerialStore } from '../../store/serialStore';

export function StatusBar() {
  const { connectionState, errorMessage, jobRunning } = useSerialStore();
  const label =
    connectionState === 'connected'
      ? jobRunning
        ? 'Running job'
        : 'Idle'
      : connectionState === 'connecting'
        ? 'Connecting…'
        : connectionState === 'error'
          ? 'Fault'
          : 'Offline';

  return (
    <div
      style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--lf-border)',
        fontSize: 12,
        color: 'var(--lf-muted)',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'center',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <span style={{ fontFamily: 'var(--lf-mono)', fontSize: 11 }}>Machine · {label}</span>
      {errorMessage && (
        <span style={{ color: 'var(--lf-danger)', textAlign: 'right', flex: 1, fontSize: 11 }}>
          {errorMessage}
        </span>
      )}
    </div>
  );
}
