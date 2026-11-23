import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { formatNumber, parseNumber } from '../lib/format';
import { effectiveFeed } from '../lib/limits';
import { parseSettings, type Axis3, type MachineProfile } from '../lib/profile';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { Alert } from '../ui/alert';
import { AckMark, useAck } from './Ack';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const AXES: Axis3[] = ['x', 'y', 'z'];

type Draft = Record<`${Axis3}${'min' | 'max'}` | 'feedXY' | 'feedZ', string> & {
  softLimits: boolean;
};

function toDraft(p: MachineProfile): Draft {
  return {
    xmin: String(p.travel.x.min),
    xmax: String(p.travel.x.max),
    ymin: String(p.travel.y.min),
    ymax: String(p.travel.y.max),
    zmin: String(p.travel.z.min),
    zmax: String(p.travel.z.max),
    feedXY: String(p.jogFeed.xy),
    feedZ: String(p.jogFeed.z),
    softLimits: p.softLimits,
  };
}

const num = (text: string) => (text.trim() === '' ? Number.NaN : parseNumber(text));

/** Travel (software end stops) and jog feed, entered by the operator and kept in the browser. */
export function ProfileEditor() {
  const profile = useJob((s) => s.profile);
  const setProfileSettings = useJob((s) => s.setProfileSettings);
  const mpos = useMachine((s) => s.status?.mpos);
  const addLog = useMachine((s) => s.addLog);
  const axes = profile.kinematics.axes;
  const [draft, setDraft] = useState(() => toDraft(profile));
  const [error, setError] = useState(false);
  useEffect(() => setDraft(toDraft(profile)), [profile]);

  const field = (key: keyof Omit<Draft, 'softLimits'>, label: string) => (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={draft[key]}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
    />
  );

  const ack = useAck();
  const apply = () => {
    const settings = parseSettings({
      travel: Object.fromEntries(
        AXES.map((a) => [a, { min: num(draft[`${a}min`]), max: num(draft[`${a}max`]) }]),
      ),
      softLimits: draft.softLimits,
      jogFeed: { xy: num(draft.feedXY), z: num(draft.feedZ) },
    });
    setError(settings === null);
    if (!settings) return false;
    setProfileSettings(settings);
    addLog('info', t('machine.applied'));
    return true;
  };

  return (
    <div className="profile-editor">
      <h3 className="font-medium text-muted-foreground text-sm" data-find="travel">
        {t('machine.travel')}
      </h3>
      <p className="text-muted-foreground text-sm">{t('machine.travelHint')}</p>
      <div className="travel-grid">
        <span />
        <span className="text-muted-foreground text-sm">{t('machine.min')}</span>
        <span className="text-muted-foreground text-sm">{t('machine.max')}</span>
        {AXES.map((a) => {
          const A = a.toUpperCase();
          const pos = mpos?.[AXES.indexOf(a)];
          return [
            <span key={`${a}l`} className="axis-name">
              {A}
            </span>,
            <div key={`${a}min`} className="travel-cell">
              {field(`${a}min`, `${A} ${t('machine.min')}`)}
              {pos !== undefined ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft({ ...draft, [`${a}min`]: String(pos) })}
                >
                  {t('machine.useCurrent', { side: t('machine.min') })}
                </Button>
              ) : null}
            </div>,
            <div key={`${a}max`} className="travel-cell">
              {field(`${a}max`, `${A} ${t('machine.max')}`)}
              {pos !== undefined ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft({ ...draft, [`${a}max`]: String(pos) })}
                >
                  {t('machine.useCurrent', { side: t('machine.max') })}
                </Button>
              ) : null}
            </div>,
          ];
        })}
      </div>
      <div className="feed-grid" data-find="jog-feed">
        <span className="text-muted-foreground text-sm">{t('machine.jogFeed')}</span>
        <Field>
          <FieldLabel>XY ({t('units.mmPerMin')})</FieldLabel>
          {field('feedXY', `${t('machine.jogFeed')} XY`)}
        </Field>
        <Field>
          <FieldLabel>Z ({t('units.mmPerMin')})</FieldLabel>
          {field('feedZ', `${t('machine.jogFeed')} Z`)}
        </Field>
      </div>
      <p className="text-muted-foreground text-sm">{t('machine.jogFeedHint')}</p>
      <ul className="text-sm tabular-nums" data-testid="jog-effective">
        {(
          [
            ['XY', profile.jogFeed.xy, Math.min(axes.x.maxRate, axes.y.maxRate)],
            ['Z', profile.jogFeed.z, axes.z.maxRate],
          ] as const
        ).map(([axis, set, max]) => (
          <li key={axis} data-capped={set > max ? '' : undefined}>
            {set > max
              ? t('machine.jogEffective', {
                  axis,
                  set: formatNumber(set),
                  max: formatNumber(effectiveFeed(set, max)),
                })
              : t('machine.jogWithin', { axis, set: formatNumber(set) })}
          </li>
        ))}
      </ul>
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={draft.softLimits}
          onCheckedChange={(checked) => setDraft({ ...draft, softLimits: checked })}
        />
        <span>{t('machine.softLimits')}</span>
      </Label>
      {error ? <Alert variant="warning">{t('machine.invalid')}</Alert> : null}
      <Button variant="outline" onClick={() => void ack.run(apply)}>
        {t('machine.apply')}
        <AckMark state={ack.state} />
      </Button>
    </div>
  );
}
