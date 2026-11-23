import {
  CircleAlertIcon,
  CircleCheckIcon,
  FilePlusIcon,
  HistoryIcon,
  HouseIcon,
  MoveIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { t } from '../i18n';
import { formatCoordinate, formatDuration, formatNumber, getLocale } from '../lib/format';
import { reveal } from '../lib/reveal';
import { toolForJob } from '../lib/setup';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { needsAttention } from '../lib/messages';
import { useMessages } from '../store/messages';
import { useJobProgress } from '../store/progress';
import { useInterrupted, useSteps } from '../store/steps';
import { STEPS, useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Dro, DroValue, type DroAxis } from '../ui/dro';
import { Progress } from '../ui/progress';
import { StatusBadge } from '../ui/status-badge';
import { HoldButton } from './HoldButton';
import { BADGE_SIGN, BADGE_TONE, useMachineBadge } from './StatusBar';

const AXES: readonly DroAxis[] = ['X', 'Y', 'Z', 'A'];

/** How the machine is: the state large, in words; where it stands; what an alarm means. */
function MachineCard() {
  const badge = useMachineBadge();
  const status = useMachine((s) => s.status);
  const homed = useMachine((s) => s.homed);
  const firmware = useMachine((s) => s.firmware);
  const hasRotary = useJob((s) => s.profile.hasRotary);
  const name = useJob((s) => s.profile.name);
  const axes = hasRotary ? AXES : AXES.slice(0, 3);
  return (
    <Card className="start-machine gap-4 p-5" data-testid="start-machine">
      <CardTitle render={<h2 />}>{t('start.machine')}</CardTitle>
      <StatusBadge
        size="lg"
        tone={BADGE_TONE[badge.kind]}
        icon={BADGE_SIGN[badge.kind]}
        className="self-start"
        data-testid="start-state"
      >
        {badge.text}
        {badge.code ? <small className="state-code"> {badge.code}</small> : null}
      </StatusBadge>
      {status ? (
        <Dro size="lg" className="flex-wrap" aria-label={t('tiles.position')}>
          {axes.map((axis, i) => (
            <DroValue
              key={axis}
              axis={axis}
              size="lg"
              value={formatCoordinate(status.wpos[i], 3)}
              unit={axis === 'A' ? '°' : 'mm'}
            />
          ))}
        </Dro>
      ) : null}
      <p className="text-muted-foreground text-sm">
        {name}
        {firmware ? ` · ${firmware}` : ''}
        {status ? ` · ${homed ? t('ready.homed') : t('ready.notHomed')}` : ''}
      </p>
    </Card>
  );
}

/** The job at hand – or, without one, the last one that was cut. */
function JobCard() {
  const fileName = useJob((s) => s.fileName);
  const estimate = useJob((s) => s.analysis?.timeline?.total ?? null);
  const progress = useJobProgress();
  const interrupted = useInterrupted();
  const last = useWorkshop((s) => s.history.at(-1));
  const { states } = useSteps();
  const go = useUi((s) => s.go);
  const percent = progress?.percent ?? interrupted?.percent;
  return (
    <Card className="gap-3 p-5" data-testid="start-job">
      <CardTitle render={<h2 />}>{fileName ? t('start.job') : t('start.lastJob')}</CardTitle>
      {fileName ? (
        <>
          <p className="start-value">{progress?.name ?? fileName}</p>
          {percent !== undefined ? (
            <div className="flex items-center gap-3">
              <Progress
                className="flex-1"
                value={Math.min(100, percent)}
                aria-label={t('files.progress')}
              />
              <span className="font-semibold tabular-nums">{formatNumber(percent, 0)} %</span>
            </div>
          ) : null}
          <p className="text-muted-foreground text-sm tabular-nums">
            {progress?.remaining != null
              ? t('runBar.left', { time: formatDuration(progress.remaining) })
              : estimate !== null
                ? `${t('dash.estimate')} ${formatDuration(estimate)}`
                : ''}
          </p>
          <ol className="start-steps" aria-label={t('nav.stepper')}>
            {STEPS.map((step, i) => (
              <li key={step} data-state={states[step]}>
                <button type="button" onClick={() => go(step)}>
                  <span className="start-step-number">{i + 1}</span>
                  <span>{t(`nav.steps.${step}`)}</span>
                  <span className="text-muted-foreground text-sm">
                    {t(`nav.states.${states[step]}`)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : last ? (
        <>
          <p className="start-value">{last.file}</p>
          <p className="text-muted-foreground text-sm tabular-nums">
            {new Date(last.endedAt).toLocaleDateString(getLocale())} ·{' '}
            {formatDuration(last.duration)} · {t(`history.results.${last.result}`)}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">{t('start.noJob')}</p>
      )}
    </Card>
  );
}

/** Which tool the job counts on and what is being cut. */
function ToolCard() {
  const analysis = useJob((s) => s.analysis);
  const toolDiameter = useJob((s) => s.toolDiameter);
  const headerDiameter = useJob((s) => s.header?.tools.find((x) => x.diameter)?.diameter);
  const parser = useMachine((s) => s.parserState);
  const tools = useWorkshop((s) => s.tools);
  const setup = useWorkshop((s) => s.setup);
  const material = useWorkshop((s) => s.materials.find((m) => m.id === s.setup.materialId));
  const number = parser?.tool || analysis?.tools[0] || 0;
  const tool = toolForJob(tools, setup.toolMap, number, headerDiameter);
  return (
    <Card className="gap-3 p-5" data-testid="start-tool">
      <CardTitle render={<h2 />}>{t('start.toolMaterial')}</CardTitle>
      <dl className="start-facts">
        <dt>{t('start.tool')}</dt>
        <dd>
          {number ? `T${number} · ` : ''}
          {tool ? `${tool.name} · ` : ''}Ø {formatNumber(tool?.diameter ?? toolDiameter, 1)} mm
        </dd>
        <dt>{t('start.material')}</dt>
        <dd>{material ? material.name : t('start.noMaterial')}</dd>
      </dl>
    </Card>
  );
}

/** The newest message that still asks for the operator – with the way to the message centre. */
function MessageCard() {
  const waiting = useMessages((s) => s.messages).filter(needsAttention);
  const last = waiting.at(-1);
  return (
    <Card className="gap-3 p-5" data-testid="start-message">
      <CardTitle render={<h2 />}>{t('start.message')}</CardTitle>
      {last ? (
        <>
          <p className="start-message">
            {last.level === 'warning' ? (
              <TriangleAlertIcon aria-hidden="true" className="text-warning-foreground" />
            ) : (
              <CircleAlertIcon aria-hidden="true" className="text-destructive-foreground" />
            )}
            <span>
              <strong>{t(`messages.levels.${last.level}`)}:</strong> {last.title}{' '}
              <time className="text-muted-foreground text-sm">
                {new Date(last.at).toLocaleTimeString(getLocale(), {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </span>
          </p>
          <p className="text-muted-foreground text-sm">{last.action}</p>
          {waiting.length > 1 ? (
            <p className="text-muted-foreground text-sm">
              {t('messages.last.open', { count: waiting.length })}
            </p>
          ) : null}
          <Button
            variant="outline"
            className="self-start"
            onClick={() => useMessages.getState().openCentre()}
          >
            {t('start.toMessages')}
          </Button>
        </>
      ) : (
        <p className="start-message text-muted-foreground">
          <CircleCheckIcon aria-hidden="true" className="text-success-foreground" />
          <span>{t('start.noMessage')}</span>
        </p>
      )}
    </Card>
  );
}

/** The ways to the things done most. */
function QuickCard() {
  const go = useUi((s) => s.go);
  const online = useMachine((s) => s.connection === 'connected');
  const idle = useMachine((s) => s.status?.state === 'Idle' || s.status?.state === 'Alarm');
  return (
    <Card className="start-quick gap-3 p-5" data-testid="start-quick">
      <CardTitle render={<h2 />}>{t('start.quick')}</CardTitle>
      <div className="start-quick-grid">
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            go('job');
            reveal(['program']);
          }}
        >
          <FilePlusIcon aria-hidden="true" />
          {t('start.quickNew')}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            // The jobs used last stand on ① Job, each with the zero it was cut with.
            go('job');
            reveal(['recent', 'program']);
          }}
        >
          <HistoryIcon aria-hidden="true" />
          {t('start.quickRecent')}
        </Button>
        <Button variant="outline" size="lg" onClick={() => useUi.getState().setJogOpen(true)}>
          <MoveIcon aria-hidden="true" />
          {t('start.quickJog')}
        </Button>
        <HoldButton disabled={!online || !idle} onConfirm={() => useMachine.getState().home()}>
          <span className="with-icon">
            <HouseIcon aria-hidden="true" /> {t('start.quickHome')}
          </span>
        </HoldButton>
      </div>
    </Card>
  );
}

/**
 * Start (DESIGN.md §3.1, §5): how the machine is, what is to do next (the
 * recommendation lies in the action bar, with its one action bottom right),
 * and the ways to the things done most. A working screen, not a collection
 * of functions.
 */
export function StartScreen() {
  return (
    <div className="start" data-testid="start-screen">
      <MachineCard />
      <JobCard />
      <ToolCard />
      <MessageCard />
      <QuickCard />
    </div>
  );
}
