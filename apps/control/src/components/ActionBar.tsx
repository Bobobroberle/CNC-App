import {
  ArrowRightIcon,
  FolderOpenIcon,
  MoveIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  SquareIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { alarmName } from '@lowrider/fluidnc-client';
import { t, tDynamic } from '../i18n';
import { formatNumber } from '../lib/format';
import type { Next } from '../lib/next';
import { blockers, warnings } from '../lib/readiness';
import { entryView } from '../lib/steps';
import { useJob } from '../store/job';
import { useKeys } from '../store/keys';
import { useMachine } from '../store/machine';
import { requestOpenFile } from '../store/recent';
import { useReadiness } from '../store/readiness';
import { useRun } from '../store/run';
import { requestStart, useStart } from '../store/start';
import { useNext, useSteps } from '../store/steps';
import { useUi, type Place } from '../store/ui';
import { Button } from '../ui/button';
import { Reason } from '../ui/tooltip';
import { HoldButton } from './HoldButton';
import { LiveTiles } from './LiveTiles';

/** The words of the one recommendation: what it is and why. */
export function useNextText(next: Next): { title: string; text: string } {
  const alarm = useMachine((s) => s.alarm);
  const step = next.step ? t(`nav.steps.${next.step}`) : '';
  const params = {
    name: next.name ?? '',
    percent: formatNumber(next.percent ?? 0, 0),
    step,
  };
  if (next.kind === 'alarm') {
    const name = alarm === null ? 'Unknown' : alarmName(alarm);
    return {
      title: t('start.next.alarm.title'),
      text: `${tDynamic(`alarm.${name}.text`, 'alarm.Unknown.text')} ${tDynamic(`alarm.${name}.action`, 'alarm.Unknown.action')}`,
    };
  }
  return {
    title: t(`start.next.${next.kind}.title`, params),
    text: t(`start.next.${next.kind}.text`, params),
  };
}

/**
 * Goes to the area the recommendation of the start screen leads to. Fräsen holds the check and the
 * job's tools: when it has warnings the way leads to the check, where they are listed – the cutting
 * view shows only "bereit".
 */
function enterStep(step: Place, states: ReturnType<typeof useSteps>['states']) {
  useUi.getState().go(step as never, entryView(step, states) as never);
}

/** The action of the one recommendation: a way somewhere, or – where the machine moves – a hold. */
function NextAction({ next }: { next: Next }) {
  const go = useUi((s) => s.go);
  const { states } = useSteps();
  const online = useMachine((s) => s.connection === 'connected');
  const step = next.step ? t(`nav.steps.${next.step}`) : '';
  const to = (place: Place, label: string) => (
    <Button size="lg" data-testid="primary-action" onClick={() => go(place as never)}>
      {label}
      <ArrowRightIcon aria-hidden="true" />
    </Button>
  );
  switch (next.kind) {
    case 'alarm':
      return (
        <span className="action-hold" data-testid="primary-action">
          <HoldButton variant="accent" onConfirm={() => useMachine.getState().command('$X')}>
            {t('alarm.unlock')}
          </HoldButton>
        </span>
      );
    case 'home':
      return (
        <span className="action-hold" data-testid="primary-action">
          <HoldButton
            variant="accent"
            disabled={!online}
            onConfirm={() => useMachine.getState().home()}
          >
            {t('start.next.home.action')}
          </HoldButton>
        </span>
      );
    case 'connect':
    case 'connecting':
      return (
        <Button size="lg" data-testid="primary-action" onClick={() => go('settings', 'connection')}>
          {t('start.next.connect.action')}
          <ArrowRightIcon aria-hidden="true" />
        </Button>
      );
    case 'resume':
      return to('run', t('start.next.resume.action'));
    default:
      return (
        <Button
          size="lg"
          data-testid="primary-action"
          onClick={() => enterStep(next.step ?? 'job', states)}
        >
          {t('nav.next', { step })}
          <ArrowRightIcon aria-hidden="true" />
        </Button>
      );
  }
}

/** Start: the "Als Nächstes" recommendation, with its one action at the bottom right. */
function StartActions() {
  const next = useNext();
  const { title, text } = useNextText(next);
  return (
    <>
      <div className="next" data-testid="next-card" data-kind={next.kind} data-find="next">
        <span className="next-label">{t('start.nextLabel')}</span>
        <strong className="next-title">{title}</strong>
        <span className="next-text">{text}</span>
      </div>
      <NextAction next={next} />
    </>
  );
}

/**
 * ⑤ Fräsen: the one action is the start itself – a hold, so a stray tap never
 * starts anything – then pause or going on while the job runs, and the next
 * piece of the same job at its end. While a point of the readiness list
 * blocks, the way leads to where it is dealt with instead.
 */
function RunAction() {
  const go = useUi((s) => s.go);
  const checking = useUi((s) => s.views.run === 'check');
  const start = useStart();
  const active = useMachine(
    (s) =>
      s.fileJob !== null ||
      s.stream?.result === 'running' ||
      s.status?.state === 'Run' ||
      s.status?.state === 'Hold',
  );
  const holding = useMachine((s) => s.status?.state.startsWith('Hold') === true);
  const streamWaits = useMachine(
    (s) => (s.stream?.toolChange ?? null) !== null || (s.stream?.stepAt ?? null) !== null,
  );
  // Between two parts of a job of several tools the cutting view names the tool to change.
  const waiting = streamWaits || start?.phase === 'between';
  const summary = useRun((s) => s.summary);
  const { feedHold, cycleStart } = useMachine.getState();
  // The check offers no start and no way on: between parts the cutting view says which tool to
  // change, and while a job waits it holds the field to go on. The switch of the views is above.
  if (checking && !active && !waiting) return null;
  if (active) {
    if (holding) {
      // Going on moves the machine again: a short hold, never the second half of a double tap.
      return (
        <span className="action-hold" data-testid="primary-action">
          <HoldButton variant="accent" duration={500} onConfirm={cycleStart}>
            {t('run5.resume')}
          </HoldButton>
        </span>
      );
    }
    if (waiting) {
      return (
        <Reason reason={t('run5.waitingInPanel')}>
          <Button size="lg" data-testid="primary-action" disabled>
            {t('run5.pause')}
          </Button>
        </Reason>
      );
    }
    return (
      <Button size="lg" data-testid="primary-action" onClick={feedHold}>
        <PauseIcon aria-hidden="true" />
        {t('run5.pause')}
      </Button>
    );
  }
  if (!start) {
    return (
      <Button size="lg" data-testid="primary-action" onClick={() => go('job')}>
        {t('nav.toJob')}
        <ArrowRightIcon aria-hidden="true" />
      </Button>
    );
  }
  if (start.phase === 'done' && summary) {
    return (
      <Button size="lg" data-testid="primary-action" onClick={() => useRun.getState().nextPiece()}>
        <RotateCwIcon aria-hidden="true" />
        {t('run5.nextPiece')}
      </Button>
    );
  }
  if (start.blocked > 0) {
    return (
      <Button size="lg" data-testid="primary-action" onClick={() => go('run', 'check')}>
        {t('ready.toCheck')}
        <ArrowRightIcon aria-hidden="true" />
      </Button>
    );
  }
  return (
    <span className="action-hold" data-testid="primary-action">
      <Reason reason={start.reason} className="block w-full">
        <HoldButton
          variant="accent"
          duration={1000}
          disabled={start.reason !== null}
          onConfirm={() => requestStart(start)}
        >
          <span className="with-icon">
            <PlayIcon aria-hidden="true" className="size-5" /> {start.label}
          </span>
        </HoldButton>
      </Reason>
    </span>
  );
}

/**
 * An area's part of the bar: the job at a glance, where the job stands – and the area's own
 * primary action where it has one: opening a program while there is none (Job), and in Fräsen the
 * start with what goes with it. The other areas have none; there is no "Weiter" from one to the
 * next – the tabs are the way.
 */
function StepActions({ place }: { place: Place }) {
  const readiness = useReadiness();
  const running = useMachine((s) => s.fileJob !== null || s.stream?.result === 'running');
  const blocked = readiness ? blockers(readiness.items).length : 0;
  const notes = readiness ? warnings(readiness.items).length : 0;
  const fileName = useJob((s) => s.fileName);
  let status: ReactNode = null;
  if (readiness && !running) {
    status = (
      <p className="start-bar-text" data-testid="start-bar" data-blocked={blocked}>
        <span
          className={`check-dot ${blocked > 0 ? 'check-block' : 'check-ok'}`}
          aria-hidden="true"
        />
        {blocked > 0
          ? t('ready.blocked', { count: blocked })
          : notes > 0
            ? t('ready.readyWithNotes', { count: notes })
            : t('ready.ready')}
      </p>
    );
  }
  let primary: ReactNode = null;
  if (place === 'job' && fileName === null) {
    // Nothing to go on with yet: the one thing to do is to get a program.
    primary = (
      <Button size="lg" data-testid="primary-action" onClick={() => requestOpenFile()}>
        <FolderOpenIcon aria-hidden="true" />
        {t('job.open')}
      </Button>
    );
  } else if (place === 'run') {
    primary = <RunAction />;
  }
  return (
    <>
      {/* The job at a glance: time or progress, the line, how far off the path the tool is */}
      <LiveTiles />
      <div className="action-status">
        {fileName ? (
          <span className="job-name" data-testid="job-name">
            {fileName}
          </span>
        ) : null}
        {status}
      </div>
      {primary}
    </>
  );
}

/**
 * "Job abbrechen" (DESIGN.md §5 ⑤, §6.4): there while a job runs, and it
 * asks before anything stops – the same question Esc asks.
 */
function AbortAction() {
  const active = useMachine(
    (s) =>
      s.fileJob !== null ||
      s.stream?.result === 'running' ||
      s.status?.state === 'Run' ||
      s.status?.state === 'Hold',
  );
  if (!active) return null;
  return (
    <Button
      variant="outline"
      size="lg"
      data-testid="abort-action"
      onClick={() => useKeys.setState({ abortAsked: true })}
    >
      <SquareIcon aria-hidden="true" />
      {t('abort.confirm')}
    </Button>
  );
}

/**
 * The action bar (DESIGN.md §4): secondary things on the left – the jog panel
 * from every screen – and on the right the primary action where the area has one (never more
 * than one; Start: the recommendation). (The context panel is put away with "Großbild" on the stage.)
 */
export function ActionBar() {
  const place = useUi((s) => s.place);
  const jogOpen = useUi((s) => s.jogOpen);
  const { setJogOpen } = useUi.getState();
  return (
    <footer className="actionbar" aria-label={t('nav.actions')}>
      <Button
        variant="outline"
        size="lg"
        pressed={jogOpen}
        data-testid="jog-toggle"
        data-find="jog-toggle"
        onClick={() => setJogOpen(!jogOpen)}
      >
        <MoveIcon aria-hidden="true" />
        {t('nav.jog')}
      </Button>
      {place === 'run' && !jogOpen ? <AbortAction /> : null}
      {place === 'start' ? <StartActions /> : <StepActions place={place} />}
    </footer>
  );
}
