/**
 * Push notifications to the phone without a cloud account: an ntfy server
 * (self-hosted in the workshop or ntfy.sh) or any webhook that takes JSON.
 */
export type NotifyEvent = 'job-done' | 'job-failed' | 'alarm' | 'tool-change' | 'test';

export interface NotifySettings {
  kind: 'off' | 'ntfy' | 'webhook';
  /** ntfy topic URL (`http://pi.local:8080/lowrider`) or webhook URL */
  url: string;
  events: NotifyEvent[];
}

export const DEFAULT_NOTIFY: NotifySettings = {
  kind: 'off',
  url: '',
  events: ['job-done', 'job-failed', 'alarm', 'tool-change'],
};

export interface Notification {
  event: NotifyEvent;
  title: string;
  message: string;
}

const PRIORITY: Record<NotifyEvent, string> = {
  'job-done': 'default',
  'job-failed': 'high',
  alarm: 'urgent',
  'tool-change': 'high',
  test: 'low',
};

export function validateNotifySettings(value: unknown): NotifySettings | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Partial<NotifySettings>;
  if (!['off', 'ntfy', 'webhook'].includes(s.kind as string)) return null;
  if (typeof s.url !== 'string') return null;
  if (s.kind !== 'off' && !/^https?:\/\//.test(s.url)) return null;
  if (!Array.isArray(s.events) || !s.events.every((e) => e in PRIORITY)) return null;
  return { kind: s.kind!, url: s.url, events: s.events };
}

/** Sends a notification; resolves to false when it is switched off or filtered out. */
export async function sendNotification(
  settings: NotifySettings,
  n: Notification,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  if (settings.kind === 'off') return false;
  if (n.event !== 'test' && !settings.events.includes(n.event)) return false;
  const response =
    settings.kind === 'ntfy'
      ? await fetchFn(settings.url, {
          method: 'POST',
          body: n.message,
          headers: {
            // HTTP headers must be Latin-1; ntfy accepts RFC 2047 for anything else.
            Title: `=?UTF-8?B?${Buffer.from(n.title).toString('base64')}?=`,
            Priority: PRIORITY[n.event],
            Tags: n.event,
          },
        })
      : await fetchFn(settings.url, {
          method: 'POST',
          body: JSON.stringify({ ...n, source: 'lowrider-control', at: new Date().toISOString() }),
          headers: { 'Content-Type': 'application/json' },
        });
  if (!response.ok) throw new Error(`Notification failed: HTTP ${response.status}`);
  return true;
}
