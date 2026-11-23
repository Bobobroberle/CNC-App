import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { formatCoordinate, formatSigned, parseNumber } from '../lib/format';
import { parseProbe, type ProbeSettings } from '../lib/profile';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';

const FIELDS: { key: keyof ProbeSettings; label: Parameters<typeof t>[0]; unit: string }[] = [
  { key: 'plateThickness', label: 'probe.plate', unit: 'mm' },
  { key: 'maxTravel', label: 'probe.maxTravel', unit: 'mm' },
  { key: 'feed', label: 'probe.feed', unit: 'mm/min' },
  { key: 'retract', label: 'probe.retract', unit: 'mm' },
];

/** Guided Z touch-off with the plate. */
export function ProbeCard() {
  const profile = useJob((s) => s.profile);
  const setProfileSettings = useJob((s) => s.setProfileSettings);
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const touching = useMachine((s) => s.status?.pins.includes('P') ?? false);
  const { probeZ, addLog } = useMachine.getState();
  const [draft, setDraft] = useState(() => toDraft(profile.probe));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  /** The Z offset before the last touch-off, to say how far the zero moved and to take it back */
  const [before, setBefore] = useState<number | null>(null);
  const [undone, setUndone] = useState(false);
  const nowZ = useMachine((s) => s.status?.wco[2]);
  const { setZeroAt } = useMachine.getState();
  useEffect(() => setDraft(toDraft(profile.probe)), [profile.probe]);

  const values = parseProbe(
    Object.fromEntries(FIELDS.map((f) => [f.key, parseNumber(draft[f.key])])),
  );
  const changed = values !== null && JSON.stringify(values) !== JSON.stringify(profile.probe);

  const save = () => {
    if (!values) return;
    const { travel, softLimits, jogFeed } = profile;
    setProfileSettings({ travel, softLimits, jogFeed, probe: values });
    addLog('info', t('probe.saved'));
  };

  return (
    <Card className="gap-3 p-4" data-testid="probe-card" data-find="probe">
      <CardTitle render={<h2 />}>{t('probe.title')}</CardTitle>
      <ol className="steps">
        <li>{t('probe.step1')}</li>
        <li>
          {t('probe.step2')}{' '}
          <Badge variant={touching ? 'success' : 'outline'} data-testid="probe-contact">
            {t('probe.contact')}: {touching ? t('probe.contactClosed') : t('probe.contactOpen')}
          </Badge>
        </li>
      </ol>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <Field key={f.key}>
            <FieldLabel>
              {t(f.label)} ({f.unit})
            </FieldLabel>
            <Input
              type="text"
              inputMode="decimal"
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <Alert variant="warning">{t('probe.plateHint')}</Alert>
      {changed ? (
        <Button variant="outline" onClick={save}>
          {t('probe.save')}
        </Button>
      ) : null}
      <HoldButton
        variant="accent"
        disabled={!idle || busy || changed || values === null}
        onConfirm={() => {
          setBusy(true);
          setDone(false);
          setUndone(false);
          setBefore(useMachine.getState().status?.wco[2] ?? null);
          void probeZ().then((ok) => {
            setBusy(false);
            setDone(ok);
          });
        }}
      >
        {t('probe.start')}
      </HoldButton>
      {done ? <Alert variant="warning">{t('probe.removePlate')}</Alert> : null}
      {done && before !== null && nowZ !== undefined ? (
        <Alert
          variant="success"
          className="justify-items-start gap-y-2"
          data-testid="probe-z-result"
        >
          <p className="tabular-nums">
            {undone
              ? t('probe.undone')
              : t('probe.result', {
                  z: formatCoordinate(nowZ, 3),
                  mm: formatSigned(nowZ - before, 3, true),
                })}
          </p>
          {!undone ? (
            <Button
              reason="machine"
              variant="outline"
              disabled={!idle}
              onClick={() => void setZeroAt({ z: before }).then((ok) => setUndone(ok))}
            >
              {t('probe.discard')}
            </Button>
          ) : null}
        </Alert>
      ) : null}
    </Card>
  );
}

function toDraft(p: ProbeSettings): Record<keyof ProbeSettings, string> {
  return {
    plateThickness: String(p.plateThickness),
    maxTravel: String(p.maxTravel),
    feed: String(p.feed),
    retract: String(p.retract),
  };
}
