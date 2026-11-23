import {
  learnedFactor,
  suggestCutting,
  toolLengthOffsetCommand,
  toolLengthRoutine,
  type Tool,
  type ToolKind,
} from '@lowrider/workshop';
import { CheckIcon, LockIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n';
import { formatCoordinate, formatNumber } from '../lib/format';
import { feedRatio } from '../lib/setup';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useJobTools, type JobTool } from '../store/steps';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { NativeSelect } from '../ui/native-select';
import { Reason } from '../ui/tooltip';
import { Deviation, Recommended } from './Depth';
import { HoldButton } from './HoldButton';

/** The tip of each kind of tool, from the side: what tells them apart at a glance. */
const TIP: Record<ToolKind, string> = {
  flat: 'M9 2h10v18H9z',
  ball: 'M9 2h10v13a5 5 0 0 1-10 0z',
  vbit: 'M9 2h10v9l-5 9-5-9z',
  drill: 'M10 2h8v13l-4 5-4-5z',
  chamfer: 'M6 2h16v6l-8 8-8-8z',
};

export function ToolKindIcon({ kind }: { kind: ToolKind }) {
  return (
    <svg viewBox="0 0 28 22" className="tool-kind" aria-hidden="true">
      <path d={TIP[kind]} />
    </svg>
  );
}

const STATE_ICON = { ok: CheckIcon, warn: TriangleAlertIcon, block: XIcon } as const;

/**
 * "Länge messen" for the tool of a row, on the tool length sensor: measures,
 * then offers what the probing assistant offers – take it as the reference
 * or apply the difference as the length offset.
 */
function MeasureLength({ tool }: { tool: Tool }) {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const connected = useMachine((s) => s.connection === 'connected');
  const setter = useWorkshop((s) => s.settings.toolSetter);
  const reference = useWorkshop((s) => s.toolReferenceZ);
  const probe = useJob((s) => s.profile.probe);
  const go = useUi((s) => s.go);
  const [busy, setBusy] = useState(false);
  const [z, setZ] = useState<number | null>(null);
  const { runProbeRoutine, command, addLog } = useMachine.getState();
  const { setToolReferenceZ } = useWorkshop.getState();

  if (!setter) {
    // No sensor set up: the row says so and leads to where it is entered.
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Reason reason={t('toolsStep.noSetter')}>
          <Button variant="outline" disabled>
            {t('toolsStep.measure')}
          </Button>
        </Reason>
        <Button variant="outline" size="sm" onClick={() => go('setup', 'probe')}>
          {t('toolsStep.toProbe')}
        </Button>
      </div>
    );
  }
  const reason = !connected ? t('ready.offline') : !idle || busy ? t('ready.busy') : null;
  const measure = async () => {
    setBusy(true);
    setZ(null);
    const r = await runProbeRoutine(
      toolLengthRoutine(
        {
          feed: probe.feed,
          maxTravel: probe.maxTravel,
          retract: Math.min(probe.retract, 5),
          toolDiameter: tool.diameter,
        },
        setter,
      ),
    );
    setBusy(false);
    if (r?.z !== undefined) setZ(r.z);
  };
  return (
    <>
      <Reason reason={reason} className="block w-full">
        <HoldButton disabled={reason !== null} onConfirm={() => void measure()}>
          {busy ? t('probeWizard.running') : t('toolsStep.measure')}
        </HoldButton>
      </Reason>
      {z !== null ? (
        <Alert
          variant="success"
          className="justify-items-start gap-y-2"
          data-testid="tool-measured"
        >
          <p>{t('probeWizard.measured', { z: formatCoordinate(z, 3) })}</p>
          <div className="flex w-full flex-wrap gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setToolReferenceZ(z);
                addLog('info', t('probeWizard.referenceSaved'));
              }}
            >
              {t('probeWizard.asReference')}
            </Button>
            <Button
              reason="machine"
              className="flex-1"
              disabled={reference === null || !idle}
              onClick={() => {
                const cmd = toolLengthOffsetCommand(reference!, z);
                void command(cmd).then(
                  (ok) => ok && addLog('info', t('probeWizard.tloApplied', { cmd })),
                );
              }}
            >
              {t('probeWizard.applyTlo')}
            </Button>
          </div>
        </Alert>
      ) : null}
    </>
  );
}

/** One tool of the job: what it is, whether it fits, what would do instead, its length. */
function ToolRow({ row, first }: { row: JobTool; first: boolean }) {
  const { number, tool, issues, state, depth } = row;
  const analysis = useJob((s) => s.analysis)!;
  const tools = useWorkshop((s) => s.tools);
  const materials = useWorkshop((s) => s.materials);
  const setup = useWorkshop((s) => s.setup);
  const learning = useWorkshop((s) => s.learning);
  const spindle = useWorkshop((s) => s.settings.spindle);
  const { setSetup } = useWorkshop.getState();
  const { setToolDiameter } = useJob.getState();
  const go = useUi((s) => s.go);
  const material = materials.find((m) => m.id === setup.materialId) ?? null;
  const suggestion =
    tool && material
      ? suggestCutting(tool, material, spindle, learnedFactor(learning, tool.id, material.id))
      : null;
  const ratio = suggestion ? feedRatio(analysis.feedRange, suggestion.feed) : null;
  const choose = (id: string) => {
    setSetup({ toolMap: { ...setup.toolMap, [number]: id } });
    const chosen = tools.find((x) => x.id === id);
    // The first tool of the job is the one the pictures draw.
    if (chosen && first) setToolDiameter(chosen.diameter);
  };
  const StateIcon = STATE_ICON[state];
  return (
    <li className={`tool-row tool-${state}`} data-testid="tool-row" data-state={state}>
      <div className="tool-row-head">
        {tool ? <ToolKindIcon kind={tool.kind} /> : null}
        <div className="tool-row-name">
          <strong>
            {number > 0 ? `T${number}` : t('toolsStep.noNumber')}
            {tool ? ` · ${tool.name}` : ''}
          </strong>
          {tool ? (
            <span className="text-muted-foreground text-sm tabular-nums">
              {t(`tools.kinds.${tool.kind}`)} · Ø {formatNumber(tool.diameter, 1)} mm ·{' '}
              {t('toolsStep.fluteLength', { mm: formatNumber(tool.fluteLength, 0) })}
              {depth > 0 ? ` · ${t('toolsStep.depth', { mm: formatNumber(depth, 1) })}` : ''}
            </span>
          ) : null}
        </div>
        <span className={`tool-state tool-state-${state}`} data-testid="tool-state">
          <StateIcon aria-hidden="true" className="size-5" />
          {t(`toolsStep.states.${state}`)}
        </span>
      </div>
      {issues.length > 0 ? (
        <ul className="tool-issues">
          {issues.map((issue) => (
            <li key={issue} data-issue={issue}>
              {issue === 'probe' ? <LockIcon aria-hidden="true" className="size-4" /> : null}
              {t(`toolsStep.issues.${issue}`, {
                depth: formatNumber(depth, 1),
                flute: formatNumber(tool?.fluteLength ?? 0, 0),
              })}
            </li>
          ))}
        </ul>
      ) : null}
      {issues.includes('none') ? (
        <Button variant="outline" onClick={() => go('toollist')}>
          {t('toolsStep.toList')}
        </Button>
      ) : null}
      {state !== 'ok' && (row.alternatives.length > 0 || (tool && !row.known)) ? (
        <div className="flex flex-col gap-2" data-testid="tool-alternatives">
          <span className="text-muted-foreground text-sm">{t('toolsStep.alternative')}</span>
          {/* The guess may be right: one tap says so. */}
          {tool && !row.known ? (
            <Button variant="outline" onClick={() => choose(tool.id)}>
              {t('toolsStep.use', {
                tool: `T${tool.number} ${tool.name} (Ø ${formatNumber(tool.diameter, 1)})`,
              })}
            </Button>
          ) : null}
          {row.alternatives.map((x) => (
            <Button key={x.id} variant="outline" onClick={() => choose(x.id)}>
              {t('toolsStep.use', {
                tool: `T${x.number} ${x.name} (Ø ${formatNumber(x.diameter, 1)})`,
              })}
            </Button>
          ))}
        </div>
      ) : null}
      {tool ? (
        <Field>
          <FieldLabel>
            {number > 0 ? t('assistant.toolFor', { n: number }) : t('assistant.toolSingle')}
          </FieldLabel>
          <NativeSelect value={tool.id} onChange={(e) => choose(e.target.value)}>
            {tools.map((x) => (
              <option key={x.id} value={x.id}>
                T{x.number} {x.name} (Ø {formatNumber(x.diameter, 1)})
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {suggestion ? (
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
          <Recommended />
          {t('assistant.suggestion', {
            rpm: formatNumber(suggestion.rpm),
            feed: formatNumber(suggestion.feed),
            depth: formatNumber(suggestion.depthPerPass, 1),
          })}
          {ratio !== null && (ratio > 1.3 || ratio < 0.5) ? (
            <Deviation recommended={`${formatNumber(suggestion.feed)} mm/min`} />
          ) : null}
        </p>
      ) : tool ? (
        <p className="text-muted-foreground text-sm">{t('assistant.chooseMaterialFirst')}</p>
      ) : null}
      {ratio !== null && ratio > 1.3 ? (
        <Alert variant="warning">
          {t('assistant.feedHigh', { percent: formatNumber((ratio - 1) * 100) })}
        </Alert>
      ) : null}
      {tool ? <MeasureLength tool={tool} /> : null}
    </li>
  );
}

/**
 * ② Werkzeuge – do I have the right one in? The job's tools in their order,
 * each against the tool list: kind, diameter, cutting length, state; what
 * else would do; its length measured right in the row.
 */
export function JobToolsCard() {
  const rows = useJobTools();
  const header = useJob((s) => s.header);
  const go = useUi((s) => s.go);
  return (
    <Card className="gap-3 p-4" data-testid="job-tools" data-find="job-tools">
      <CardTitle render={<h2 />}>{t('toolsStep.title')}</CardTitle>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('toolsStep.empty')}</p>
      ) : (
        <>
          {header && header.tools.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('assistant.namedTools', {
                list: header.tools.map((x) => x.name).join(', '),
                source: header.generator ?? 'CAM',
              })}
            </p>
          ) : null}
          <ol className="tool-rows" data-testid="setup-tool">
            {rows.map((row, i) => (
              <ToolRow key={row.number} row={row} first={i === 0} />
            ))}
          </ol>
        </>
      )}
      <Button variant="outline" onClick={() => go('toollist')}>
        {t('toolsStep.toList')}
      </Button>
    </Card>
  );
}
