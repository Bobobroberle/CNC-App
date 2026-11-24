import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { parseNumber } from '../lib/format';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useJobUnderWay } from '../store/underway';
import { safeMachineZ, useWorkshop, type WorkshopSettings } from '../store/workshop';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

const num = (s: string) => (s.trim() === '' ? Number.NaN : parseNumber(s));

type Draft = Record<'rpmMin' | 'rpmMax' | 'maxFeed' | 'safeZ' | 'changeX' | 'changeY', string>;

const toDraft = (s: WorkshopSettings): Draft => ({
  rpmMin: String(s.spindle.rpmMin),
  rpmMax: String(s.spindle.rpmMax),
  maxFeed: String(s.spindle.maxFeed),
  safeZ: s.safeMachineZ === null ? '' : String(s.safeMachineZ),
  changeX: s.toolChangePosition ? String(s.toolChangePosition.x) : '',
  changeY: s.toolChangePosition ? String(s.toolChangePosition.y) : '',
});

/** Spindle range, safe height and tool change position used by the workshop functions. */
export function WorkshopSettingsCard() {
  const settings = useWorkshop((s) => s.settings);
  const { setSettings } = useWorkshop.getState();
  const zMax = useJob((s) => s.profile.travel.z.max);
  const mpos = useMachine((s) => s.status?.mpos);
  const addLog = useMachine((s) => s.addLog);
  // A job under way drives to the tool change place itself: it is not changed from here either
  const underway = useJobUnderWay();
  const [draft, setDraft] = useState(() => toDraft(settings));
  useEffect(() => setDraft(toDraft(settings)), [settings]);

  const spindle = {
    rpmMin: num(draft.rpmMin),
    rpmMax: num(draft.rpmMax),
    maxFeed: num(draft.maxFeed),
  };
  const safe = draft.safeZ.trim() === '' ? null : num(draft.safeZ);
  const change =
    draft.changeX.trim() === '' && draft.changeY.trim() === ''
      ? null
      : { x: num(draft.changeX), y: num(draft.changeY) };
  const valid =
    spindle.rpmMin > 0 &&
    spindle.rpmMax >= spindle.rpmMin &&
    spindle.maxFeed > 0 &&
    (safe === null || Number.isFinite(safe)) &&
    (underway || change === null || (Number.isFinite(change.x) && Number.isFinite(change.y)));

  const field = (key: keyof Draft, label: Parameters<typeof t>[0], disabled = false) => (
    <Field>
      <FieldLabel>{t(label)}</FieldLabel>
      <Input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </Field>
  );

  return (
    <Card className="gap-3 p-4" data-testid="workshop-settings" data-find="workshop">
      <CardTitle render={<h2 />}>{t('workshop.title')}</CardTitle>
      <h3 className="font-medium text-muted-foreground text-sm" data-find="language">
        {t('workshop.language')}
      </h3>
      <SegmentedControl role="group" aria-label={t('workshop.language')}>
        {(['de', 'en'] as const).map((l) => (
          <SegmentedControlItem
            key={l}
            pressed={settings.language === l}
            onClick={() => setSettings({ language: l })}
          >
            {t(`workshop.languages.${l}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={settings.keepAwake}
          onCheckedChange={(checked) => setSettings({ keepAwake: checked })}
        />
        <span>{t('workshop.keepAwake')}</span>
      </Label>
      <h3 className="font-medium text-muted-foreground text-sm" data-find="spindle">
        {t('workshop.spindle')}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {field('rpmMin', 'workshop.rpmMin')}
        {field('rpmMax', 'workshop.rpmMax')}
        {field('maxFeed', 'workshop.maxFeed')}
      </div>
      <h3 className="font-medium text-muted-foreground text-sm" data-find="safe-height">
        {t('workshop.heights')}
      </h3>
      {field('safeZ', 'workshop.safeZ')}
      <p className="text-muted-foreground text-sm">
        {t('workshop.safeZHint', { z: safeMachineZ({ ...settings, safeMachineZ: null }, zMax) })}
      </p>
      <h3 className="font-medium text-muted-foreground text-sm" data-find="tool-change">
        {t('workshop.toolChange')}
      </h3>
      {underway ? <p className="text-muted-foreground text-sm">{t('jog.change.locked')}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        {field('changeX', 'workshop.changeX', underway)}
        {field('changeY', 'workshop.changeY', underway)}
      </div>
      <div className="flex gap-3">
        <Button
          reason={underway ? t('jog.change.locked') : 'missing'}
          variant="outline"
          className="flex-1"
          disabled={!mpos || underway}
          onClick={() =>
            setDraft({
              ...draft,
              changeX: String(mpos?.[0] ?? ''),
              changeY: String(mpos?.[1] ?? ''),
            })
          }
        >
          {t('workshop.here')}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          reason={underway ? t('jog.change.locked') : undefined}
          disabled={underway}
          onClick={() => setDraft({ ...draft, changeX: '', changeY: '' })}
        >
          {t('workshop.noChangePosition')}
        </Button>
      </div>
      {!valid ? <Alert variant="warning">{t('machine.invalid')}</Alert> : null}
      <Button
        variant="outline"
        reason="missing"
        disabled={!valid}
        onClick={() => {
          setSettings({
            spindle,
            safeMachineZ: safe,
            toolChangePosition: underway ? settings.toolChangePosition : change,
          });
          addLog('info', t('workshop.saved'));
        }}
      >
        {t('machine.apply')}
      </Button>
    </Card>
  );
}
