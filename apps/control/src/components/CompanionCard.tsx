import { useState } from 'react';
import { t, type MessageKey } from '../i18n';
import { relayUrl } from '../lib/companion';
import { hostOf } from '../lib/link';
import { useMachine } from '../store/machine';
import { useShutdown, type ShutdownFailure } from '../store/shutdown';
import { syncNow, useStateSync } from '../store/stateSync';
import { adoptCompanion, companion, useWorkshop } from '../store/workshop';
import { AckMark, useAck } from './Ack';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';

/** Optional companion computer: libraries and history in SQLite, FluidNC relay, sensors. */
export function CompanionCard() {
  const url = useWorkshop((s) => s.settings.companionUrl);
  const online = useWorkshop((s) => s.companionOnline);
  const { setSettings, syncCompanion } = useWorkshop.getState();
  const { addLog } = useMachine.getState();
  const [text, setText] = useState(url);
  const health = useWorkshop((s) => s.companionHealth);

  const tested = useAck();
  const synced = useAck();
  const test = async () => {
    setSettings({ companionUrl: text.trim() });
    const c = companion();
    if (!c) return false;
    try {
      const h = await c.health();
      useWorkshop.setState({ companionOnline: true });
      adoptCompanion(h);
      return true;
    } catch {
      useWorkshop.setState({ companionOnline: false, companionHealth: null });
      addLog('error', t('companion.offline'), 'companion.offline');
      return false;
    }
  };

  return (
    <Card className="gap-3 p-4" data-testid="companion-card" data-find="companion">
      <CardTitle render={<h2 />}>{t('companion.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('companion.intro')}</p>
      <Field>
        <FieldLabel>{t('companion.address')}</FieldLabel>
        <Input
          type="text"
          inputMode="url"
          placeholder="lowrider.local:8080"
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => void tested.run(test)}>
          {t('companion.test')}
          <AckMark state={tested.state} />
        </Button>
        <Button
          reason="missing"
          variant="outline"
          className="flex-1"
          disabled={!url}
          onClick={() =>
            void synced.run(() =>
              syncCompanion().then(async (ok) => {
                // the state of the machine (settings …) goes with the libraries
                await syncNow();
                addLog(ok ? 'info' : 'error', t(ok ? 'companion.synced' : 'companion.offline'));
                return ok;
              }),
            )
          }
        >
          {t('companion.sync')}
          <AckMark state={synced.state} />
        </Button>
      </div>
      {online === false ? <Alert variant="warning">{t('companion.offline')}</Alert> : null}
      {health ? (
        <Alert variant="success">
          {t('companion.online', { version: health.version })}{' '}
          {health.fluidnc
            ? t('link.relayed', { target: hostOf(health.fluidnc.url) })
            : t('companion.noRelay')}{' '}
          {health.camera ? t('companion.camera', { url: health.camera }) : null}
        </Alert>
      ) : null}
      {health?.backup ? (
        health.backup.error ? (
          <Alert variant="warning" data-testid="backup-failed">
            {t('companion.backupFailed', { error: health.backup.error })}
          </Alert>
        ) : (
          <p className="text-muted-foreground text-sm" data-testid="backup-status">
            {health.backup.last
              ? t('companion.backup', { name: health.backup.last, count: health.backup.count })
              : t('companion.backupNone')}
          </p>
        )
      ) : null}
      {url ? <SyncStatus /> : null}
      <ShutdownPanel />
    </Card>
  );
}

/** What the exchange of the settings and measurements with the Pi did last, in a line. */
function SyncStatus() {
  const { state, lastOkAt } = useStateSync();
  const text = t(`sync.state.${state}` as MessageKey, {
    time: lastOkAt === null ? '' : new Date(lastOkAt).toLocaleTimeString('de-DE'),
  });
  return state === 'unsupported' || state === 'refused' ? (
    <Alert variant="warning" data-testid="sync-state">
      {text}
    </Alert>
  ) : (
    <p className="text-muted-foreground text-sm" data-testid="sync-state">
      {t('sync.title')}: {text}
    </p>
  );
}

const FAILURE_TEXT: Record<ShutdownFailure, Parameters<typeof t>[0]> = {
  'not-supported': 'companion.shutdownNotSupported',
  request: 'companion.shutdownRequestFailed',
  host: 'companion.shutdownRefused',
  'still-running': 'companion.shutdownStillRunning',
};

/** Machine states in which the Pi must stay up (motion through the relay, job watch). */
const BUSY = new Set(['Run', 'Hold', 'Jog', 'Home']);

/** Powers the Pi down cleanly and says when it is safe to unplug. */
function ShutdownPanel() {
  const offered = useWorkshop((s) => s.companionHealth?.shutdown === true);
  const { phase, failure, detail, remaining } = useShutdown();
  const busy = useMachine((s) => BUSY.has(s.status?.state ?? ''));
  if (!offered && phase === 'idle') return null;

  const start = () => {
    const c = companion();
    if (!c) return;
    // The relay goes down with the Pi: close the machine connection first, cleanly.
    const machine = useMachine.getState();
    if (machine.url === relayUrl(c.base) && machine.connection !== 'disconnected')
      machine.disconnect();
    useShutdown.getState().start(c);
  };

  return (
    <div className="subsection" data-testid="pi-shutdown" data-find="pi-shutdown">
      <h3 className="font-medium text-muted-foreground text-sm">{t('companion.shutdownTitle')}</h3>
      {phase === 'idle' || phase === 'failed' ? (
        <>
          <p className="text-muted-foreground text-sm">{t('companion.shutdownHint')}</p>
          <HoldButton variant="danger" disabled={busy} onConfirm={start}>
            {t('companion.shutdown')}
          </HoldButton>
          {busy ? (
            <p className="text-muted-foreground text-sm">{t('companion.shutdownBusy')}</p>
          ) : null}
        </>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {phase === 'requesting' ? t('companion.shutdownRequesting') : null}
        {phase === 'stopping' ? t('companion.shutdownStopping') : null}
        {phase === 'done' ? t('companion.shutdownDone') : null}
      </p>
      {phase === 'requesting' || phase === 'stopping' ? (
        <Alert variant="warning" aria-hidden="true">
          {t(
            phase === 'requesting' ? 'companion.shutdownRequesting' : 'companion.shutdownStopping',
          )}
        </Alert>
      ) : null}
      {phase === 'settling' ? (
        <Alert variant="warning">{t('companion.shutdownSettling', { seconds: remaining })}</Alert>
      ) : null}
      {phase === 'done' ? (
        <>
          <Alert variant="success" aria-hidden="true">
            {t('companion.shutdownDone')}
          </Alert>
          <Button variant="outline" onClick={() => useShutdown.getState().reset()}>
            {t('companion.shutdownAgain')}
          </Button>
        </>
      ) : null}
      {failure ? (
        <Alert variant="error" role="alert">
          {t(FAILURE_TEXT[failure], { detail: detail ?? '' })}
        </Alert>
      ) : null}
    </div>
  );
}
