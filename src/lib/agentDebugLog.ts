/** Debug-mode NDJSON: Cursor ingest + same-origin dev sink (see vite.config.ts). */
export function agentDebugLog(payload: {
  runId?: string;
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
}) {
  const body = JSON.stringify({
    sessionId: 'e29c6c',
    timestamp: Date.now(),
    ...payload,
  });
  fetch('http://127.0.0.1:7309/ingest/79fbfa44-38de-4d57-a962-c73f4a0b423b', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e29c6c' },
    body,
  }).catch(() => {});
  if (import.meta.env.DEV) {
    fetch('/__agent-debug-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {});
  }
}
