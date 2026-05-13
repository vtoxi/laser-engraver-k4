import { isTauri } from '@tauri-apps/api/core';
import {
  requestDesktopNotificationPermissionForUser,
  resetNotifyPermissionCache,
} from '../../lib/desktopNotifications';
import { MaterialPresets } from './MaterialPresets';
import { MachineBedForm } from './MachineBedForm';
import { useSerialStore } from '../../store/serialStore';
import { useSettingsStore } from '../../store/settingsStore';

export function SettingsScreen() {
  const { installDriver } = useSerialStore();
  const { desktopNotificationsEnabled, setDesktopNotificationsEnabled } = useSettingsStore();
  const desktop = isTauri();

  return (
    <div className="lf-settings">
      <header className="lf-settings__head">
        <h1 className="lf-settings__title">Settings</h1>
        <p className="lf-settings__sub">
          One-time calibration and presets. Day-to-day engraving lives on the Workspace tab.
        </p>
      </header>

      <section className="lf-panel lf-settings__section">
        <h2 className="lf-section-title">Machine &amp; bed</h2>
        <MachineBedForm />
      </section>

      <section className="lf-panel lf-settings__section">
        <h2 className="lf-section-title">Material presets</h2>
        <p className="lf-hint" style={{ marginBottom: 12 }}>
          Add, edit, or remove saved material profiles. Apply them from the Engrave tab during a job.
        </p>
        <MaterialPresets />
      </section>

      <section className="lf-panel lf-settings__section">
        <h2 className="lf-section-title">Desktop notifications</h2>
        <p className="lf-hint" style={{ marginBottom: 12 }}>
          {desktop
            ? 'Shows system toasts when the window is in the background or minimized (connect, disconnect, job start, pause, finish, and errors).'
            : 'Uses the browser’s Web Notification API when permitted — same events as the desktop app, but delivery depends on the browser and OS.'}
        </p>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            color: 'var(--lf-text)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={desktopNotificationsEnabled}
            onChange={(e) => {
              const on = e.target.checked;
              setDesktopNotificationsEnabled(on);
              if (!on) {
                resetNotifyPermissionCache();
                return;
              }
              void requestDesktopNotificationPermissionForUser().then((ok) => {
                if (!ok) {
                  useSettingsStore.getState().setDesktopNotificationsEnabled(false);
                  resetNotifyPermissionCache();
                  window.alert(
                    'Notification permission was not granted. You can allow LaserForge K4 in system settings and try again.',
                  );
                }
              });
            }}
          />
          Show desktop notifications
        </label>
      </section>

      <section className="lf-panel lf-settings__section">
        <h2 className="lf-section-title">USB driver (CH340)</h2>
        {desktop ? (
          <>
            <p className="lf-hint" style={{ marginBottom: 12 }}>
              If macOS does not see the laser adapter, install the WCH driver, then reconnect USB.
            </p>
            <button
              type="button"
              className="lf-btn lf-btn--primary"
              onClick={() => void installDriver().then((msg) => window.alert(msg))}
            >
              Install / open driver instructions
            </button>
          </>
        ) : (
          <p className="lf-hint" style={{ marginBottom: 12 }}>
            In the browser, use the workspace “Pair USB…” control and install the WCH CH340 driver from
            the manufacturer if the device is not recognized. The bundled driver helper runs in the
            desktop app only.
          </p>
        )}
      </section>

      <footer className="lf-settings__foot lf-hint">
        LaserForge K4 — protocol tooling: <code className="lf-code">tools/k4_sniffer.py</code>
      </footer>
    </div>
  );
}
