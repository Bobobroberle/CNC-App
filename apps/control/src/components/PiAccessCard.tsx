import { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n';
import { companionBase, type PiDevice } from '../lib/companion';
import { getLocale } from '../lib/format';
import { deviceKind, loginError, type DeviceKind } from '../lib/piUpdate';
import { usePiLogin } from '../store/piLogin';
import { companion, useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';

/** Names that are the same in every language; the other kinds are the dictionary's. */
const DEVICE_PROPER: ReadonlySet<DeviceKind> = new Set(['iPad', 'iPhone', 'Mac', 'Chromebook']);

/**
 * The login at the Pi (Einstellungen → Verbindung): a device types the Pi code once and keeps a token. What
 * needs it – updating the Pi, powering it down – is protected on the Pi itself, not here.
 */
export function PiAccessCard() {
  const url = useWorkshop((s) => s.settings.companionUrl);
  const health = useWorkshop((s) => s.companionHealth);
  const online = useWorkshop((s) => s.companionOnline);
  const stored = usePiLogin((s) => s.login);
  const base = companionBase(url);
  // A login counts only for the address it was made at
  const login = stored && base && stored.base === base ? stored : null;
  // The Pi refused the token (wherever the call was made): the reason stays until a new login or a logout
  const expired = usePiLogin((s) => s.expired !== null && s.expired === base);

  const [code, setCode] = useState('');
  const [name, setName] = useState(() => {
    const kind = deviceKind(
      typeof navigator === 'undefined' ? '' : navigator.userAgent,
      typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
    );
    return DEVICE_PROPER.has(kind) ? kind : t(`access.device.${kind as 'other'}`);
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<PiDevice[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const [renewed, setRenewed] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    const c = companion();
    if (!c) return;
    try {
      setDevices(await c.devices());
    } catch {
      // the list is a convenience: the Pi may be away
    }
  }, []);

  // A login that the Pi no longer knows (the device was removed there, or the address is another Pi) ends where the
  // 401 arrives (the client clears it and the store says why): this only looks, once, when the card shows
  const token = login?.token;
  useEffect(() => {
    if (!token) return;
    let alive = true;
    void (async () => {
      try {
        await companion()?.me();
        if (alive) await loadDevices();
      } catch {
        // the Pi may be away; a refused token is handled by the client
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, loadDevices]);

  if (!base) return null;

  const submit = async () => {
    const c = companion();
    if (!c || busy || code.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const done = await c.login(code, name);
      usePiLogin.getState().set({ base: c.base, token: done.token, name: done.device.name });
      setCode('');
    } catch (e) {
      const failure = loginError(e);
      setError(t(`access.errors.${failure.key}`, { seconds: failure.seconds }));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await companion()
      ?.logout()
      .catch(() => {});
    usePiLogin.getState().clear();
    setShown(null);
    setRenewed(null);
    setDevices([]);
    setError(null);
  };

  /** A call made with the login failed: the Pi is not there, or it no longer knows this device (the login is cleared where the 401 arrives). */
  const failed = (e: unknown) => {
    if ((e as { status?: number }).status === 401) return;
    setError(
      t(`access.errors.${loginError(e).key === 'network' ? 'network' : 'other'}`, { seconds: 0 }),
    );
  };

  const toggleCode = async () => {
    if (shown !== null) return setShown(null);
    setError(null);
    try {
      setShown((await companion()!.piCode()) ?? null);
    } catch (e) {
      failed(e);
    }
  };

  const renew = async (revokeOthers: boolean) => {
    setError(null);
    try {
      const done = await companion()!.renewPiCode(revokeOthers);
      setRenewed(done.code);
      setShown(null);
      await loadDevices();
      return true;
    } catch (e) {
      failed(e);
      return false;
    }
  };

  const old = health !== null && health.auth !== true;
  return (
    <Card className="gap-3 p-4" data-testid="pi-access" data-find="pi-login">
      <CardTitle render={<h2 />}>{t('access.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('access.intro')}</p>
      {online === false ? <Alert variant="warning">{t('access.offline')}</Alert> : null}
      {old ? (
        <Alert variant="warning" data-testid="access-old">
          {t('access.oldCompanion')}
        </Alert>
      ) : null}
      {expired ? (
        <Alert variant="warning" data-testid="access-expired">
          {t('access.expired')}
        </Alert>
      ) : null}

      {!login && !old ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field>
            <FieldLabel>{t('access.code')}</FieldLabel>
            <Input
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="ABCD-EFGH-JKLM"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              data-testid="access-code"
            />
          </Field>
          <p className="text-muted-foreground text-sm">{t('access.codeHint')}</p>
          <Field>
            <FieldLabel>{t('access.name')}</FieldLabel>
            <Input
              type="text"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {error ? (
            <Alert variant="warning" data-testid="access-error">
              {error}
            </Alert>
          ) : null}
          <Button
            type="submit"
            reason="missing"
            disabled={busy || code.trim() === ''}
            data-testid="access-login"
          >
            {t('access.login')}
          </Button>
        </form>
      ) : null}

      {login ? (
        <div className="grid gap-3" data-testid="access-in">
          <p>{t('access.loggedIn', { name: login.name })}</p>
          <h3 className="font-medium text-muted-foreground text-sm">{t('access.devices')}</h3>
          <ul className="parts" data-testid="access-devices">
            {devices.map((d) => (
              <li key={d.id} className="part">
                <div className="min-w-0">
                  <strong>{d.name}</strong>
                  {d.current ? ` (${t('access.thisDevice')})` : ''}
                  <div className="text-muted-foreground text-sm tabular-nums">
                    {t('access.lastSeen', {
                      time: new Date(d.lastSeen).toLocaleString(getLocale()),
                    })}
                  </div>
                </div>
                {d.current ? null : (
                  <Button
                    variant="outline"
                    aria-label={t('access.removeDevice', { name: d.name })}
                    onClick={async () => {
                      setError(null);
                      try {
                        await companion()?.removeDevice(d.id);
                      } catch (e) {
                        failed(e);
                      }
                      await loadDevices();
                    }}
                  >
                    {t('access.remove')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {error ? (
            <Alert variant="warning" data-testid="access-error">
              {error}
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => void toggleCode()} data-testid="access-show">
              {t(shown === null ? 'access.showCode' : 'access.hideCode')}
            </Button>
            <Button variant="outline" onClick={() => void logout()} data-testid="access-logout">
              {t('access.logout')}
            </Button>
          </div>
          {shown !== null ? (
            <Alert data-testid="access-shown">
              <p className="font-mono text-lg tracking-wider">
                {t('access.codeShown', { code: shown })}
              </p>
              <p className="text-muted-foreground text-sm">{t('access.codeUse')}</p>
            </Alert>
          ) : null}
          {renewed !== null ? (
            <Alert variant="success" data-testid="access-renewed">
              <p className="font-mono text-lg tracking-wider">
                {t('access.renewed', { code: renewed })}
              </p>
            </Alert>
          ) : null}
          <HoldButton onConfirm={() => renew(false)}>{t('access.renew')}</HoldButton>
          <p className="text-muted-foreground text-sm">{t('access.renewHint')}</p>
          <HoldButton onConfirm={() => renew(true)}>{t('access.revokeOthers')}</HoldButton>
          <p className="text-muted-foreground text-sm">{t('access.revokeHint')}</p>
        </div>
      ) : null}
      <p className="text-muted-foreground text-sm">{t('access.plain')}</p>
    </Card>
  );
}
