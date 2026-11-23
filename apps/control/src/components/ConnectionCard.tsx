import { LoaderCircleIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { companionBase, relayUrl } from '../lib/companion';
import { demoHref } from '../lib/demo';
import { hostOf, secondsUntil } from '../lib/link';
import { SIM_ADDRESS } from '../sim';
import { useMachine } from '../store/machine';
import { useWake } from '../store/wake';
import { useWorkshop } from '../store/workshop';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Reason } from '../ui/tooltip';
import { CommandAck } from './Ack';
import { Fold } from './Fold';
import { LogView, type LogFilter } from './LogView';

/** Says honestly whether, and how, the screen is being kept on while connected. */
function ScreenLine() {
  const state = useWake((s) => s.state);
  return (
    <p className="text-muted-foreground text-sm" data-testid="screen-awake" data-state={state}>
      {t(`machine.screen.${state}`)}
    </p>
  );
}

/** Seconds until `at`, ticking once a second while there is something to count down. */
function useCountdown(at: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [at]);
  return at === null ? 0 : secondsUntil(at, now);
}

/**
 * What the way to the machine is doing right now (DESIGN.md §6.2): trying and
 * waiting for FluidNC's answer, waiting for the next try – with the reason the
 * last one failed, which device was missing and what to do –, or given up.
 */
function LinkStatus() {
  const link = useMachine((s) => s.link);
  const autoRetry = useMachine((s) => s.autoRetry);
  const { retryNow, stopRetry, setAutoRetry, disconnect } = useMachine.getState();
  const seconds = useCountdown(link.phase === 'waiting' ? link.retryAt : null);
  const target = link.target ?? t('link.unknownTarget');
  const via = link.via ?? '';
  return (
    <>
      {link.phase === 'connecting' ? (
        <Alert variant="info" data-testid="link-status" data-phase="connecting" aria-busy="true">
          <LoaderCircleIcon
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <AlertDescription className="text-foreground">
            {t(link.via ? 'link.connectingVia' : 'link.connecting', { target, via })}
          </AlertDescription>
        </Alert>
      ) : null}
      {link.phase === 'connecting' ? (
        <Button variant="outline" onClick={disconnect}>
          {t('link.cancel')}
        </Button>
      ) : null}
      {(link.phase === 'waiting' || link.phase === 'failed') && link.failure ? (
        <Alert
          variant="warning"
          data-testid="link-status"
          data-phase={link.phase}
          data-failure={link.failure}
        >
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>{t(`link.${link.failure}`, { target, via })}</AlertTitle>
          <AlertDescription>
            <span>{t(`link.explain.${link.failure}`, { target, via })}</span>
            {link.phase === 'waiting' ? (
              <span className="font-medium text-foreground tabular-nums" data-testid="link-retry">
                {t('link.retryIn', { seconds })}
              </span>
            ) : (
              <span>{t(link.lostDuringJob ? 'link.afterJob' : 'link.stopped')}</span>
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {link.phase === 'waiting' ? (
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={retryNow}>
            {t('link.retryNow')}
          </Button>
          <Button variant="outline" className="flex-1" onClick={stopRetry}>
            {t('link.stop')}
          </Button>
        </div>
      ) : null}
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox checked={autoRetry} onCheckedChange={(on) => setAutoRetry(on)} />
        <span>{t('link.auto')}</span>
      </Label>
      <p className="text-muted-foreground text-sm">{t('link.autoHint')}</p>
    </>
  );
}

/** The simulator and the demo: ways to try the app without a machine. */
function TryWithout() {
  const { setUrl, connect } = useMachine.getState();
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setUrl(SIM_ADDRESS);
          void connect();
        }}
      >
        {t('sim.start')}
      </Button>
      <p className="text-muted-foreground text-sm">{t('sim.startHint')}</p>
      <Button
        variant="outline"
        data-testid="demo-start"
        onClick={() => {
          // A fresh page, so the demo's memory storage applies from the start.
          location.assign(demoHref(true));
          location.reload();
        }}
      >
        {t('demo.start')}
      </Button>
      <p className="text-muted-foreground text-sm">{t('demo.startHint')}</p>
    </>
  );
}

/**
 * Connecting to the machine. When a companion relays FluidNC, the way through
 * it is the one obvious way (it connects, and says what it is doing); a typed
 * address, the simulator and the demo lie under "Andere Verbindung".
 */
export function ConnectionCard() {
  const { url, connection, firmware, setUrl, connect, disconnect } = useMachine();
  const relayOffered = useWorkshop((s) => s.companionHealth?.fluidnc ?? null);
  const companionUrl = useWorkshop((s) => s.settings.companionUrl);
  const phase = useMachine((s) => s.link.phase);
  const insecure = typeof location !== 'undefined' && location.protocol === 'https:';
  const base = relayOffered ? companionBase(companionUrl) : null;
  const relay = base ? relayUrl(base) : null;
  // While a try runs or the next one is due, its own buttons stand in the status below.
  const idle = connection === 'disconnected' && (phase === 'idle' || phase === 'failed');
  const direct = (
    <>
      <Field>
        <FieldLabel>{t('machine.address')}</FieldLabel>
        <Input
          type="text"
          inputMode="url"
          placeholder={t('machine.addressHint')}
          value={url}
          disabled={connection !== 'disconnected'}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
        />
      </Field>
      {idle ? (
        <Button
          variant="outline"
          reason="missing"
          disabled={url.trim() === ''}
          onClick={() => void connect()}
        >
          {t('machine.connect')}
        </Button>
      ) : null}
    </>
  );
  return (
    <Card className="gap-3 p-4" data-find="connection" data-testid="connection-card">
      <CardTitle render={<h2 />}>{t('machine.connection')}</CardTitle>
      {insecure ? <Alert variant="warning">{t('machine.httpsWarning')}</Alert> : null}
      {relay && relayOffered && base ? (
        <>
          <p className="text-muted-foreground text-sm" data-testid="link-route">
            {t('link.route', { via: hostOf(base), target: hostOf(relayOffered.url) })}
          </p>
          {idle ? (
            <Button
              variant="outline"
              data-testid="connect-via-pi"
              onClick={() => {
                setUrl(relay);
                void connect();
              }}
            >
              {t('link.viaPi')}
            </Button>
          ) : null}
        </>
      ) : (
        direct
      )}
      {connection === 'connected' ? (
        <Button variant="outline" onClick={disconnect}>
          {t('machine.disconnect')}
        </Button>
      ) : null}
      <LinkStatus />
      {firmware ? (
        <p className="text-muted-foreground text-sm">
          {t('machine.firmware')}: {firmware}
        </p>
      ) : null}
      {connection === 'connected' ? <ScreenLine /> : null}
      {idle ? (
        relay ? (
          <Fold title={t('link.other')} testId="other-connection">
            <div className="flex flex-col gap-3">
              {direct}
              <TryWithout />
            </div>
          </Fold>
        ) : (
          <TryWithout />
        )
      ) : null}
    </Card>
  );
}

/** What was said between the app and the controller: the log of Service & Diagnose. */
export function LogCard() {
  return (
    <Card className="gap-3 p-4" data-find="log">
      <CardTitle render={<h2 />}>{t('machine.log')}</CardTitle>
      <LogView />
    </Card>
  );
}

const LOG_FILTERS: readonly LogFilter[] = ['all', 'wire', 'app'];
/** How many sent lines the console remembers (this session) */
const MDI_HISTORY = 20;

/**
 * The Konsole area, for experts (DESIGN.md §3.3): the raw log with a filter
 * and a line to send G-code by hand (MDI). What was sent can be taken up
 * again – with ↑/↓ in the field or by a tap on the line; a tap only fills
 * the field, sending stays its own step.
 */
export function ConsoleCard() {
  const { connection, command } = useMachine();
  const [line, setLine] = useState('');
  const [filter, setFilter] = useState<LogFilter>('all');
  const [history, setHistory] = useState<string[]>([]);
  /** Where ↑/↓ stand in the history; -1 = the line being typed */
  const [at, setAt] = useState(-1);
  const online = connection === 'connected';
  const send = () => {
    const text = line.trim();
    if (text === '' || !online) return;
    void command(text);
    setHistory((h) => [text, ...h.filter((l) => l !== text)].slice(0, MDI_HISTORY));
    setAt(-1);
    setLine('');
  };
  const recall = (index: number) => {
    const next = Math.max(-1, Math.min(history.length - 1, index));
    setAt(next);
    setLine(next < 0 ? '' : history[next]!);
  };
  return (
    <Card className="gap-3 p-4" data-testid="console-card" data-find="console">
      <CardTitle render={<h2 />}>{t('machine.console')}</CardTitle>
      <SegmentedControl role="group" aria-label={t('console.filter')} className="w-full *:flex-1">
        {LOG_FILTERS.map((id) => (
          <SegmentedControlItem key={id} pressed={filter === id} onClick={() => setFilter(id)}>
            {t(`console.filters.${id}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <LogView filter={filter} tall />
      <form
        className="console flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Input
          type="text"
          className="font-mono"
          value={line}
          onChange={(e) => {
            setLine(e.target.value);
            setAt(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              recall(at + (e.key === 'ArrowUp' ? 1 : -1));
            }
          }}
          disabled={!online}
          spellCheck={false}
          autoCapitalize="characters"
          autoCorrect="off"
          placeholder={t('console.placeholder')}
          aria-label={t('machine.console')}
        />
        <Reason reason={online ? null : t('jog.reason.offline')}>
          <Button variant="outline" reason="machine" type="submit" disabled={!online}>
            {t('machine.send')}
          </Button>
        </Reason>
      </form>
      <CommandAck />
      {history.length > 0 ? (
        <div className="console-history" data-testid="console-history">
          <span className="text-muted-foreground text-sm">{t('console.history')}</span>
          {history.slice(0, 6).map((sentLine, index) => (
            <Button
              key={sentLine}
              variant="outline"
              className="font-mono"
              onClick={() => recall(index)}
            >
              {sentLine}
            </Button>
          ))}
        </div>
      ) : null}
      <p className="text-muted-foreground text-sm">{t('console.hint')}</p>
    </Card>
  );
}

/** Expert tools stay out of sight until someone asks for them. */
export function ExpertSwitch() {
  const expert = useWorkshop((s) => s.settings.expertMode);
  const { setSettings } = useWorkshop.getState();
  return (
    <Card className="gap-3 p-4" data-find="expert-mode">
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={expert}
          onCheckedChange={(checked) => setSettings({ expertMode: checked })}
        />
        <span>{t('machine.expertMode')}</span>
      </Label>
      <p className="text-muted-foreground text-sm">{t('machine.expertHint')}</p>
    </Card>
  );
}
