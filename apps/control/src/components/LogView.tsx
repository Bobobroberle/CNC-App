import { getLocale } from '../lib/format';
import { useEffect, useRef } from 'react';
import { t } from '../i18n';
import { useMachine, type LogKind } from '../store/machine';

const time = (ms: number) => new Date(ms).toLocaleTimeString(getLocale());

/** Which lines of the log show: all, what went over the wire, or what the app said */
export type LogFilter = 'all' | 'wire' | 'app';

const SHOWN: Record<LogFilter, (kind: LogKind) => boolean> = {
  all: () => true,
  wire: (kind) => kind === 'in' || kind === 'out',
  app: (kind) => kind === 'info' || kind === 'error',
};

export function LogView({ filter = 'all', tall = false }: { filter?: LogFilter; tall?: boolean }) {
  const log = useMachine((s) => s.log);
  const list = useRef<HTMLOListElement>(null);
  // The newest line stays in sight – by scrolling the list itself, never the page around it.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, filter]);
  if (log.length === 0) return <p className="text-muted-foreground text-sm">{t('log.empty')}</p>;
  return (
    <ol className={`log${tall ? ' log-tall' : ''}`} data-testid="log" ref={list}>
      {log
        .filter((entry) => SHOWN[filter](entry.kind))
        .slice(-200)
        .map((entry) => (
          <li key={entry.id} className={`log-${entry.kind}`}>
            <time>{time(entry.time)}</time>
            <span className="log-dir">
              {entry.kind === 'in' ? '←' : entry.kind === 'out' ? '→' : '•'}
            </span>
            <span className="log-text">{entry.text}</span>
          </li>
        ))}
    </ol>
  );
}
