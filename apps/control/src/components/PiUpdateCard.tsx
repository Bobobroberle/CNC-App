import { useCallback, useEffect, useRef, useState } from 'react';
import { t, type MessageKey } from '../i18n';
import { companionBase, relayUrl, type UpdateStatus } from '../lib/companion';
import { getLocale } from '../lib/format';
import { BUSY_STATES, formatBuild } from '../lib/piUpdate';
import { useMachine } from '../store/machine';
import { usePiLogin } from '../store/piLogin';
import { useUpdate } from '../store/piUpdate';
import { useJobUnderWay } from '../store/underway';
import { companion, useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

/**
 * Update of the Pi from the app (Einstellungen → Verbindung): choose the zip, let the Pi check it, put it in
 * place with a hold, wait for the Pi to come back – or go back to the version before. What is decided is
 * decided on the Pi (login, checksum, a machine at rest, a version that starts, the way back if it does not).
 */
export function PiUpdateCard() {
  const url = useWorkshop((s) => s.settings.companionUrl);
  const health = useWorkshop((s) => s.companionHealth);
  const stored = usePiLogin((s) => s.login);
  const base = companionBase(url);
  const loggedIn = Boolean(stored && base && stored.base === base);
  const flow = useUpdate();
  const moving = useMachine((s) => BUSY_STATES.has(s.status?.state ?? ''));
  const underway = useJobUnderWay();

  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checksum, setChecksum] = useState('');
  const [allowOlder, setAllowOlder] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  // An end that was shown (done, failed) is not carried into the next visit: it would be judged against a Pi that
  // may have changed since – by update-pi.bat, or by another device
  useEffect(() => {
    const { phase, reset } = useUpdate.getState();
    if (phase === 'done' || phase === 'failed') reset();
  }, []);

  const refresh = useCallback(async () => {
    try {
      setStatus((await companion()?.updateStatus()) ?? null);
    } catch {
      setStatus(null);
    }
  }, []);

  const enabled = health?.update === true;
  // What the Pi says of itself: when the card shows, and again when a step has ended
  useEffect(() => {
    if (
      loggedIn &&
      enabled &&
      (flow.phase === 'idle' || flow.phase === 'done' || flow.phase === 'failed')
    ) {
      void refresh();
    }
  }, [loggedIn, enabled, flow.phase, refresh]);
  // What was known before a step is not what is true after it
  const working =
    flow.phase === 'uploading' || flow.phase === 'applying' || flow.phase === 'restarting';
  useEffect(() => {
    if (working) setStatus(null);
  }, [working]);
  // The new version answers a few seconds after the restart, but confirms itself only after half a minute – and a
  // version that dies in between is taken back: "done" is said when the trial is over, so look until then
  // (A way back by hand has no trial: it is done when the Pi answers.)
  const settling =
    flow.phase === 'done' && flow.kind === 'update' && (status === null || status.trial);
  const looks = useRef(0);
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (flow.phase !== 'done') {
      looks.current = 0;
      setGaveUp(false);
    }
  }, [flow.phase]);
  useEffect(() => {
    if (!loggedIn || !enabled || !settling || gaveUp) return;
    const timer = setInterval(() => {
      // After three minutes it stays unconfirmed – said as that, never as a success
      if (++looks.current > 45) setGaveUp(true);
      else void refresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [loggedIn, enabled, settling, gaveUp, refresh]);
  /** Looks again, and for another three minutes. */
  const recheck = () => {
    looks.current = 0;
    setGaveUp(false);
    void refresh();
  };
  // A step that ended without an answer (the Pi was slow, or the request never got there): look again by itself,
  // slowly – when the Pi is back, what it says (and the way back) must show without a reload
  const unknown =
    flow.phase === 'failed' &&
    (flow.error?.code === 'no-answer' || flow.error?.code === 'not-applied') &&
    status === null;
  const tries = useRef(0);
  useEffect(() => {
    if (!unknown) {
      tries.current = 0;
      return;
    }
    if (!loggedIn || !enabled) return;
    const timer = setInterval(() => {
      if (++tries.current > 60) clearInterval(timer);
      else void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [unknown, loggedIn, enabled, refresh]);
  // The checksum was for the file that went (or was thrown away): the next one has its own
  useEffect(() => {
    if (flow.phase === 'done' || flow.phase === 'idle') setChecksum('');
  }, [flow.phase]);
  // The Pi runs another build than the one that answered after the restart: the guard took the new version away
  const takenBack =
    flow.phase === 'done' &&
    flow.kind === 'update' &&
    status !== null &&
    !status.trial &&
    flow.reached !== null &&
    status.running.build !== flow.reached;

  if (!base) return null;
  const date = (build: number) => formatBuild(build, getLocale());

  const blocked: string | null = working
    ? t('update.blocked.working')
    : !flow.staged || flow.phase !== 'staged'
      ? t('update.blocked.none')
      : underway
        ? t('update.blocked.job')
        : moving
          ? t('update.blocked.moving')
          : null;

  /** Closes this device's own connection to the machine through the Pi: the Pi refuses while a browser is on it. */
  const leaveRelay = () => {
    const c = companion();
    const machine = useMachine.getState();
    if (c && machine.url === relayUrl(c.base) && machine.connection !== 'disconnected') {
      machine.disconnect();
    }
  };

  const apply = async () => {
    const c = companion();
    if (!c) return false;
    leaveRelay();
    await useUpdate.getState().apply(c, allowOlder);
    // A refusal that leaves the package on the Pi puts the flow back at the hold, with the reason: that is no success either
    return useUpdate.getState().error === null;
  };
  const rollback = async () => {
    const c = companion();
    if (!c || !status) return false;
    leaveRelay();
    await useUpdate.getState().rollback(c, status);
    return useUpdate.getState().phase !== 'failed';
  };
  const choose = async (picked: File | undefined) => {
    const c = companion();
    if (!picked || !c) return;
    setAllowOlder(false);
    await useUpdate.getState().upload(c, picked, checksum);
    if (file.current) file.current.value = '';
  };

  const failure = flow.error
    ? t(`update.errors.${flow.error.code}` as MessageKey, {
        detail: flow.error.detail ?? '',
        // only a "busy" says why, and only in words the dictionary has: any other reason is the general one
        why:
          flow.error.code === 'busy'
            ? t(
                (flow.error.detail === 'machine-connected' || flow.error.detail === 'recording'
                  ? `update.busyWhy.${flow.error.detail}`
                  : 'update.busyWhy.other') as MessageKey,
              )
            : '',
      })
    : null;
  const staged = flow.staged;
  const last = status?.last;

  return (
    <Card className="gap-3 p-4" data-testid="pi-update" data-find="pi-update">
      <CardTitle render={<h2 />}>{t('update.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('update.intro')}</p>

      {health !== null && !enabled ? (
        <Alert variant="warning" data-testid="update-not-enabled">
          {t('update.notEnabled')}
        </Alert>
      ) : null}
      {!loggedIn ? (
        <p className="text-muted-foreground text-sm" data-testid="update-need-login">
          {t('update.needLogin')}
        </p>
      ) : null}

      {loggedIn && enabled && status ? (
        <div className="grid gap-1 text-sm" data-testid="update-status">
          <p>
            {t('update.running', {
              version: status.running.version,
              date: date(status.running.build),
              commit: status.running.commit,
            })}
          </p>
          {status.previous ? (
            <p className="text-muted-foreground">
              {t('update.before', {
                date: date(status.previous.build),
                commit: status.previous.commit,
              })}
            </p>
          ) : null}
          {status.trial ? <p className="text-muted-foreground">{t('update.trial')}</p> : null}
          {last ? (
            <p className="text-muted-foreground" data-testid="update-last">
              {t(`update.last.${last.result}` as MessageKey, {
                date: new Date(last.at).toLocaleString(getLocale()),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {loggedIn && enabled ? (
        <>
          <Field>
            <FieldLabel>{t('update.checksum')}</FieldLabel>
            <Input
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono"
              value={checksum}
              // What was typed goes with the upload: once a file is staged the field is no longer a way to change what was checked
              disabled={working || flow.phase === 'staged'}
              onChange={(e) => setChecksum(e.target.value)}
              data-testid="update-checksum"
            />
          </Field>
          <p className="text-muted-foreground text-sm">{t('update.checksumHint')}</p>
          <input
            ref={file}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="update-file"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            disabled={working}
            reason={t('update.blocked.working')}
            onClick={() => file.current?.click()}
            data-testid="update-choose"
          >
            {t('update.choose')}
          </Button>
        </>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {flow.phase === 'uploading' ? t('update.uploading') : null}
        {flow.phase === 'applying' ? t('update.applying') : null}
        {flow.phase === 'restarting' ? t('update.restarting') : null}
      </p>
      {flow.phase === 'uploading' ? (
        <Alert variant="warning" aria-hidden="true">
          {t('update.uploading')}
        </Alert>
      ) : null}

      {staged && flow.phase === 'staged' ? (
        <div className="grid gap-2" data-testid="update-staged">
          <p>
            {t('update.found', {
              version: staged.release.version,
              date: date(staged.release.build),
              commit: staged.release.commit,
              files: staged.files,
            })}
          </p>
          <p className={staged.newer ? '' : 'text-muted-foreground'}>
            {t(staged.newer ? 'update.newer' : 'update.notNewer')}
          </p>
          {!staged.newer ? (
            <Label className="min-h-target gap-3 font-normal">
              <Checkbox
                checked={allowOlder}
                onCheckedChange={(on) => setAllowOlder(on === true)}
                data-testid="update-allow-older"
              />
              <span>{t('update.allowOlder')}</span>
            </Label>
          ) : null}
          <p className="font-mono text-xs break-all text-muted-foreground" data-testid="update-sha">
            {t('update.sha', { sha: staged.sha256 })}
          </p>
          <p className="text-muted-foreground text-sm">
            {t(flow.verified ? 'update.checked' : 'update.unchecked')}
          </p>
          <HoldButton
            variant="accent"
            disabled={blocked !== null || (!staged.newer && !allowOlder)}
            reason={blocked ?? t('update.allowOlder')}
            onConfirm={apply}
          >
            {t('update.apply')}
          </HoldButton>
          <Button
            variant="outline"
            onClick={() => void useUpdate.getState().discard(companion()!)}
            data-testid="update-discard"
          >
            {t('update.discard')}
          </Button>
          {failure ? (
            <Alert variant="warning" data-testid="update-error">
              {failure}
            </Alert>
          ) : null}
        </div>
      ) : null}

      {flow.phase === 'applying' ? <Alert variant="warning">{t('update.applying')}</Alert> : null}
      {flow.phase === 'restarting' ? (
        <Alert variant="warning" data-testid="update-restarting">
          {t('update.restarting')}
        </Alert>
      ) : null}
      {flow.phase === 'done' && flow.reached !== null && settling && !gaveUp ? (
        <Alert variant="warning" data-testid="update-settling">
          {t('update.settling', { date: date(flow.reached) })}
        </Alert>
      ) : null}
      {flow.phase === 'done' && flow.reached !== null && settling && gaveUp ? (
        <Alert variant="warning" data-testid="update-unconfirmed">
          <p>{t('update.unconfirmed', { date: date(flow.reached) })}</p>
          <Button className="mt-2" variant="outline" onClick={recheck} data-testid="update-recheck">
            {t('update.recheck')}
          </Button>
        </Alert>
      ) : null}
      {takenBack ? (
        <Alert variant="warning" data-testid="update-error">
          {t('update.errors.rolled-back')}
        </Alert>
      ) : null}
      {flow.phase === 'done' && flow.reached !== null && !takenBack && !settling ? (
        <Alert variant="success" data-testid="update-done">
          <p>{t('update.done', { date: date(flow.reached) })}</p>
          <Button
            className="mt-2"
            disabled={underway}
            reason={t('update.blocked.job')}
            onClick={() => location.reload()}
            data-testid="update-reload"
          >
            {t('update.reload')}
          </Button>
        </Alert>
      ) : null}
      {flow.phase === 'failed' && failure ? (
        <Alert variant="warning" data-testid="update-error">
          {failure}
        </Alert>
      ) : null}

      {loggedIn && enabled && status?.previous && !working ? (
        <div className="grid gap-2" data-testid="update-rollback">
          <HoldButton
            disabled={underway || moving}
            reason={t(underway ? 'update.blocked.job' : 'update.blocked.moving')}
            onConfirm={rollback}
          >
            {t('update.rollback')}
          </HoldButton>
          <p className="text-muted-foreground text-sm">{t('update.rollbackHint')}</p>
        </div>
      ) : null}
    </Card>
  );
}
