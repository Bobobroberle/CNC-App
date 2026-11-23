import { alarmName } from '@lowrider/fluidnc-client';
import { t, tDynamic } from '../i18n';
import { formatDuration } from '../lib/format';
import { useMachine } from './machine';
import { onJobEnd } from './recorder';
import { companion, useWorkshop } from './workshop';

export type NotifyEvent = 'job-done' | 'job-failed' | 'alarm' | 'tool-change' | 'test';

/** Sends to the browser (if allowed) and the companion (ntfy/webhook), as configured. */
export async function notify(event: NotifyEvent, title: string, message: string): Promise<void> {
  const { settings } = useWorkshop.getState();
  if (
    settings.notifyBrowser &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted'
  ) {
    try {
      new Notification(title, { body: message, tag: event });
    } catch {
      // some mobile browsers only allow notifications from a service worker
    }
  }
  const c = settings.notifyCompanion ? companion() : null;
  if (c) await c.notify(event, title, message).catch(() => undefined);
}

/** Job end, alarms and tool changes become notifications. */
export function startNotifications(): () => void {
  const offJob = onJobEnd((r) => {
    if (r.result === 'done') {
      void notify(
        'job-done',
        t('notify.doneTitle'),
        t('notify.done', { name: r.file, time: formatDuration(r.duration) }),
      );
    } else {
      void notify('job-failed', t('notify.failedTitle'), t('notify.failed', { name: r.file }));
    }
  });
  const offMachine = useMachine.subscribe((s, prev) => {
    if (s.alarm !== null && prev.alarm === null) {
      void notify(
        'alarm',
        t('alarm.title', { code: s.alarm }),
        tDynamic(`alarm.${alarmName(s.alarm)}.text`, 'alarm.Unknown.text'),
      );
    }
    const change = s.stream?.toolChange;
    if (change && !prev.stream?.toolChange) {
      void notify(
        'tool-change',
        t('toolChange.title'),
        t('notify.toolChange', { tool: change.tool ?? '?' }),
      );
    }
  });
  return () => {
    offJob();
    offMachine();
  };
}
