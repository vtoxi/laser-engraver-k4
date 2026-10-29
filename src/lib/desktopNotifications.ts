import { isTauri } from '@tauri-apps/api/core';
import { useSettingsStore } from '../store/settingsStore';

const APP = 'LaserForge K4';

let userRequestedJobStop = false;
let jobHadRuntimeError = false;
/** Avoid re-prompting every toast after permission is granted once this session. */
let permissionOkCached: boolean | null = null;

export function resetJobNotifyFlags(): void {
  userRequestedJobStop = false;
  jobHadRuntimeError = false;
}

export function markUserRequestedJobStop(): void {
  userRequestedJobStop = true;
}

function consumeUserRequestedJobStop(): boolean {
  const v = userRequestedJobStop;
  userRequestedJobStop = false;
  return v;
}

export function markJobHadRuntimeError(): void {
  jobHadRuntimeError = true;
}

function consumeJobHadRuntimeError(): boolean {
  const v = jobHadRuntimeError;
  jobHadRuntimeError = false;
  return v;
}

export function resetNotifyPermissionCache(): void {
  permissionOkCached = null;
}

function notificationsEnabled(): boolean {
  return useSettingsStore.getState().desktopNotificationsEnabled;
}

async function ensureNotifyPermission(): Promise<boolean> {
  if (!notificationsEnabled()) return false;
  if (permissionOkCached === true) return true;
  if (permissionOkCached === false) return false;

  if (isTauri()) {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
    let ok = await isPermissionGranted();
    if (!ok) {
      ok = (await requestPermission()) === 'granted';
    }
    permissionOkCached = ok;
    return ok;
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    permissionOkCached = false;
    return false;
  }
  if (Notification.permission === 'granted') {
    permissionOkCached = true;
    return true;
  }
  if (Notification.permission === 'denied') {
    permissionOkCached = false;
    return false;
  }
  const p = await Notification.requestPermission();
  const ok = p === 'granted';
  permissionOkCached = ok;
  return ok;
}

/** Call when the user turns notifications on in Settings (re-check OS permission). */
export async function requestDesktopNotificationPermissionForUser(): Promise<boolean> {
  resetNotifyPermissionCache();
  return ensureNotifyPermission();
}

async function sendToast(title: string, body?: string): Promise<void> {
  if (!notificationsEnabled()) return;
  const ok = await ensureNotifyPermission();
  if (!ok) return;

  if (isTauri()) {
    const { sendNotification } = await import('@tauri-apps/plugin-notification');
    sendNotification({ title, body: body ?? '' });
    return;
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, silent: false });
  }
}

export function notifyMachineConnected(port: string): void {
  void sendToast(`${APP} — Connected`, port);
}

export function notifyMachineDisconnected(): void {
  void sendToast(`${APP} — Disconnected`, 'Serial link closed.');
}

export function notifyConnectionFailed(message: string): void {
  void sendToast(`${APP} — Connection failed`, clip(message, 220));
}

export function notifySerialOrJobError(message: string): void {
  void sendToast(`${APP} — Error`, clip(message, 220));
}

export function notifyEngraveJobStarted(): void {
  void sendToast(`${APP} — Job started`, 'Engraving is running.');
}

export function notifyEngraveJobPaused(): void {
  void sendToast(`${APP} — Paused`, 'Engrave job was paused.');
}

/** Call after `job_complete` serial event (uses user-stop and runtime-error flags). */
export function dispatchJobCompleteNotification(): void {
  const userStopped = consumeUserRequestedJobStop();
  const hadRuntimeError = consumeJobHadRuntimeError();
  if (userStopped) {
    void sendToast(`${APP} — Stopped`, 'Engraving was stopped.');
    return;
  }
  if (hadRuntimeError) {
    return;
  }
  void sendToast(`${APP} — Finished`, 'Engraving job completed successfully.');
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
