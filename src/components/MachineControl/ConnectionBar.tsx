import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { useSerialStore } from '../../store/serialStore';

function webSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.serial;
}

export function ConnectionBar() {
  const {
    ports,
    selectedPort,
    showAllPorts,
    portsListError,
    connectionState,
    refreshPorts,
    setShowAllPorts,
    connect,
    disconnect,
    pairWebSerialDevice,
  } = useSerialStore();
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      void refreshPorts();
    }
  }, [refreshPorts]);

  const handleConnect = () => {
    if (connectionState === 'connected') {
      void disconnect();
    } else if (selectedPort) {
      void connect(selectedPort);
    }
  };

  const showHint =
    Boolean(portsListError) || (ports.length === 0 && connectionState !== 'connected');

  const isWeb = !isTauri();

  return (
    <div>
      <div className="lf-dock">
        <div
          title="Link status"
          style={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            flexShrink: 0,
            background:
              connectionState === 'connected'
                ? 'var(--lf-success)'
                : connectionState === 'connecting'
                  ? 'var(--lf-warn)'
                  : connectionState === 'error'
                    ? 'var(--lf-danger)'
                    : 'var(--lf-muted)',
            boxShadow:
              connectionState === 'connected'
                ? '0 0 14px rgba(61,255,156,0.55)'
                : connectionState === 'connecting'
                  ? '0 0 14px rgba(255,193,77,0.45)'
                  : 'none',
          }}
        />

        <div className="lf-dock__grow">
          <select
            className="lf-input"
            value={selectedPort ?? ''}
            onChange={(e) =>
              useSerialStore.setState({ selectedPort: e.target.value || null })
            }
            disabled={connectionState === 'connected'}
            style={{ width: '100%' }}
          >
            <option value="">Select serial port…</option>
            {ports.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path} {p.is_k4_candidate ? '· K4' : ''} — {p.description || 'Serial'}
              </option>
            ))}
          </select>
        </div>

        {isWeb && webSerialSupported() && (
          <button
            type="button"
            className="lf-btn lf-btn--ghost"
            onClick={() => void pairWebSerialDevice()}
            disabled={connectionState === 'connected'}
            title="Grant USB access in the browser (CH340 / WCH devices)"
          >
            Pair USB…
          </button>
        )}

        <button
          type="button"
          className="lf-btn lf-btn--ghost lf-btn--icon"
          onClick={() => void refreshPorts()}
          title="Refresh port list"
        >
          ↻
        </button>

        <button
          type="button"
          className={
            connectionState === 'connected'
              ? 'lf-btn lf-btn--danger'
              : 'lf-btn lf-btn--primary'
          }
          onClick={handleConnect}
          disabled={
            connectionState === 'connecting' || (!selectedPort && connectionState !== 'connected')
          }
        >
          {connectionState === 'connected'
            ? 'Disconnect'
            : connectionState === 'connecting'
              ? 'Connecting…'
              : 'Connect'}
        </button>
      </div>

      <div className="lf-dock__row2">
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12,
            color: 'var(--lf-muted)',
            cursor: connectionState === 'connected' ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={showAllPorts}
            disabled={connectionState === 'connected'}
            onChange={(e) => setShowAllPorts(e.target.checked)}
          />
          Show all ports
        </label>
        <span className="lf-hint" style={{ flex: 1 }}>
          {isWeb
            ? 'Web Serial only lists devices you have already granted in this browser. Use “Pair USB…” first. K4 filter matches CH340 / WCH vendor IDs.'
            : 'Off = K4-style only. On = full list (macOS may show cu.* and tty.*).'}
        </span>
      </div>

      {showHint && (
        <div
          style={{
            padding: '8px 20px 12px',
            fontSize: 11,
            color: portsListError ? 'var(--lf-danger)' : 'var(--lf-muted)',
            lineHeight: 1.45,
            background: 'rgba(6,8,14,0.55)',
            borderBottom: '1px solid var(--lf-border)',
          }}
        >
          {portsListError
            ? `Port scan failed: ${portsListError}`
            : isWeb
              ? webSerialSupported()
                ? 'No paired USB serial devices yet. Click “Pair USB…”, choose your laser adapter, then ↻ and Connect.'
                : 'This browser does not expose Web Serial. Use Chrome or Edge on https:// or localhost, or install the desktop app.'
              : showAllPorts
                ? 'No serial ports found. Click ↻ to rescan.'
                : 'No K4-style ports found. Plug in USB, install CH340 driver, click ↻, or enable “Show all ports”.'}
        </div>
      )}
    </div>
  );
}
