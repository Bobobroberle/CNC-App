import { jigAccuracy, jigFrame, teachJig, type Jig } from '@lowrider/workshop';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { jigsWithTag, jobReach } from '../lib/jigs';
import { useCamera } from '../store/camera';
import { useJigs } from '../store/jigs';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { cameraCalibrated, usePhotoMap } from '../store/photomap';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import {
  accuracyText,
  JIG_ERROR_WARN,
  JigBusy,
  tagNames,
  troubleText,
  useCanMeasure,
} from './JigCard';
import { Notice } from './Notice';
import { TagSheet } from './TagSheet';
import { Badge } from '../ui/badge';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Fold } from './Fold';
import { useJobUnderWay } from '../store/underway';

/** One line of the teach list: done, or what to do with the way there. */
function Step({
  done,
  children,
  action,
}: {
  done: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <li className={done ? 'check-ok' : 'check-warn'}>
      <span className="check-dot" aria-hidden="true" />
      <span className="check-text">{children}</span>
      {done ? null : action}
    </li>
  );
}

/**
 * Teaching a jig: set everything up once in the usual way, let the camera
 * measure the tags, give it a name. Three short steps with one thing to do
 * in each.
 */
function TeachFlow() {
  const teach = useJigs((s) => s.teach)!;
  const seen = useJigs((s) => s.seen);
  const trouble = useJigs((s) => s.trouble);
  const busy = useJigs((s) => s.busy);
  const jigs = useWorkshop((s) => s.jigs);
  const fileName = useJob((s) => s.fileName);
  const analysis = useJob((s) => s.analysis);
  const wcoKey = useMachine((s) => s.status?.wco.join(',') ?? null);
  const cameraOn = useCamera((s) => s.source !== null && s.size !== null);
  const calibrated = useWorkshop((s) => cameraCalibrated(s.settings.camera));
  const clamps = useWorkshop((s) => s.setup.fixtures.length);
  const pictures = usePhotoMap((s) => s.tiles);
  const ready = useCanMeasure();
  const go = useUi((s) => s.go);
  const [name, setName] = useState('');
  const store = useJigs.getState();

  const wco = wcoKey === null ? null : wcoKey.split(',').map(Number);
  const zero = wco ? { x: wco[0] ?? 0, y: wco[1] ?? 0 } : null;
  const zeroSet = zero !== null && (zero.x !== 0 || zero.y !== 0);
  const hasJob = analysis !== null && fileName !== null;
  const picked = teach.picked
    .map((id) => seen.find((s) => s.id === id))
    .filter((s) => s !== undefined);
  const tagsOk = picked.length >= 1 && picked.length === teach.picked.length;
  const step = teach.readings ? 2 : hasJob && zeroSet && cameraOn && calibrated && tagsOk ? 1 : 0;

  // What to expect, from the tags as measured (or, before that, as seen).
  const basis = teach.readings ?? picked;
  const frame = jigFrame(basis);
  const kept = zero ? teachJig(basis, zero) : null;
  const reach =
    kept && frame && zero && analysis ? jobReach(kept.tags, frame, zero, analysis.cutBounds) : null;
  const forecast = kept && reach !== null ? { tags: kept.tags, reach } : null;
  const accuracy = forecast ? jigAccuracy(forecast.tags, forecast.reach) : null;

  return (
    <div className="jig-teach" data-testid="jig-teach">
      <ol className="flip-steps" aria-label={t('jigs.teachSteps.label')}>
        {(['setup', 'measure', 'name'] as const).map((id, i) => (
          <li
            key={id}
            className={i < step ? 'done' : i === step ? 'current' : ''}
            aria-current={i === step ? 'step' : undefined}
          >
            <span className="flip-step-n">{i + 1}</span>
            {t(`jigs.teachSteps.${id}`)}
          </li>
        ))}
      </ol>

      {!teach.readings ? (
        <>
          <p className="text-muted-foreground text-sm">{t('jigs.teachHow')}</p>
          <ul className="checklist">
            <Step done={hasJob}>
              {hasJob ? t('jigs.check.job', { file: fileName }) : t('jigs.check.noJob')}
            </Step>
            <Step
              done={zeroSet}
              action={
                <Button variant="outline" size="sm" onClick={() => go('setup', 'zero')}>
                  {t('jigs.check.toZero')}
                </Button>
              }
            >
              {zeroSet ? t('jigs.check.zero') : t('jigs.check.noZero')}
            </Step>
            <Step
              done={cameraOn && calibrated}
              action={
                calibrated ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => useCamera.getState().switchOn()}
                  >
                    {t('jigs.check.cameraOn')}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => useUi.getState().openSetup('camera')}
                  >
                    {t('jigs.check.toCamera')}
                  </Button>
                )
              }
            >
              {cameraOn && calibrated
                ? t('jigs.check.camera')
                : calibrated
                  ? t('jigs.check.cameraOff')
                  : t('jigs.check.noCamera')}
            </Step>
            <Step
              done={tagsOk}
              action={
                pictures > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => store.lookAtMap()}>
                    {t('jigs.check.searchMap')}
                  </Button>
                ) : undefined
              }
            >
              {tagsOk
                ? t('jigs.check.tags', { tags: tagNames(teach.picked) })
                : t('jigs.check.noTags')}
            </Step>
          </ul>
          {seen.length > 0 ? (
            <div className="flex gap-3 flex-wrap" role="group" aria-label={t('jigs.pickLabel')}>
              {seen.map((s) => {
                const on = teach.picked.includes(s.id);
                const owner = jigsWithTag(jigs, s.id)[0];
                return (
                  <Button
                    key={s.id}
                    variant="outline"
                    className="chip"
                    pressed={on}
                    onClick={() => store.pick(s.id)}
                  >
                    <span className="chip-led" aria-hidden="true" />
                    {t('jigs.tagOne', { n: s.id })}
                    {owner ? ` (${owner.name})` : ''}
                  </Button>
                );
              })}
            </div>
          ) : null}
          {seen.length > 1 ? (
            <p className="text-muted-foreground text-sm">{t('jigs.pickHint')}</p>
          ) : null}
        </>
      ) : (
        <Notice tone="ok" testId="jig-teach-measured">
          {teach.readings.length === 2 && accuracy
            ? t('jigs.measuredTwo', {
                tags: tagNames(teach.readings.map((r) => r.id)),
                mm: formatNumber(accuracy.baseline, 1),
              })
            : t('jigs.measuredOne', { tags: tagNames(teach.readings.map((r) => r.id)) })}
        </Notice>
      )}

      {forecast && accuracy ? (
        <Alert
          variant={basis.length === 1 && accuracy.error > JIG_ERROR_WARN ? 'warning' : 'default'}
          data-testid="jig-forecast"
        >
          {accuracyText(forecast)}{' '}
          {basis.length === 1
            ? accuracy.error > JIG_ERROR_WARN
              ? t('jigs.oneTagWeak')
              : t('jigs.oneTagFine')
            : t('jigs.twoTags')}
        </Alert>
      ) : null}

      <JigBusy teaching />
      {trouble && trouble.jigId === null && !busy ? (
        <Notice tone="danger" testId="jig-teach-trouble">
          {troubleText(trouble)}
        </Notice>
      ) : null}

      {!teach.readings ? (
        <div className="flex gap-3">
          <HoldButton
            variant="accent"
            disabled={step < 1 || !ready}
            onConfirm={() => void store.teachMeasure()}
          >
            {t('jigs.teachMeasure')}
          </HoldButton>
          <Button variant="outline" onClick={() => store.cancelTeach()}>
            {t('jigs.cancel')}
          </Button>
        </div>
      ) : (
        <>
          <Field>
            <FieldLabel>{t('jigs.name')}</FieldLabel>
            <Input
              type="text"
              value={name}
              placeholder={t('jigs.namePlaceholder')}
              data-testid="jig-name"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <p className="text-muted-foreground text-sm">
            {t('jigs.keeps', { file: fileName ?? '' })}
            {clamps > 0 ? ` ${t('jigs.keepsClamps', { count: clamps })}` : ''}
          </p>
          <div className="flex gap-3">
            <Button
              reason="missing"
              className="flex-1"
              disabled={name.trim() === '' || !hasJob}
              onClick={() => store.teachSave(name)}
            >
              {t('jigs.save')}
            </Button>
            <Button variant="outline" onClick={() => store.cancelTeach()}>
              {t('jigs.cancel')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** One stored jig: what it is, and the three things that can be done with it. */
function JigRow({ jig }: { jig: Jig }) {
  const onTable = useJigs((s) => jig.tags.some((tag) => s.seen.some((x) => x.id === tag.id)));
  // Whatever the stores refuse while a job is under way, the buttons are shut for as well (and say so)
  const running = useJobUnderWay();
  const [renaming, setRenaming] = useState<string | null>(null);
  const { saveJig, removeJig } = useWorkshop.getState();
  const a = jigAccuracy(jig.tags, jig.reach);
  return (
    <li className="part" data-testid="jig-row">
      <div>
        {renaming === null ? (
          <strong>{jig.name}</strong>
        ) : (
          <form
            className="flex gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming.trim() !== '') saveJig({ ...jig, name: renaming.trim() });
              setRenaming(null);
            }}
          >
            <Input
              type="text"
              value={renaming}
              aria-label={t('jigs.name')}
              autoFocus
              onChange={(e) => setRenaming(e.target.value)}
            />
            <Button type="submit" variant="outline" size="sm">
              {t('jigs.renameOk')}
            </Button>
          </form>
        )}{' '}
        {onTable ? <Badge variant="outline">{t('jigs.onTable')}</Badge> : null}
        <div className="text-muted-foreground text-sm">
          {jig.tags.length === 2
            ? t('jigs.rowTwo', {
                tags: tagNames(jig.tags.map((x) => x.id)),
                size: jig.tags[0]!.size,
                mm: formatNumber(a.baseline, 0),
              })
            : t('jigs.rowOne', { tags: tagNames([jig.tags[0]!.id]), size: jig.tags[0]!.size })}
          {' · '}
          <code>{jig.job.fileName}</code>
          {' · '}
          {t('jigs.rowAccuracy', { mm: formatNumber(Math.max(0.1, a.error), 1) })}
        </div>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Button
          reason={running ? t('cam.jobRuns') : 'machine'}
          variant="outline"
          size="sm"
          disabled={running}
          onClick={() => useJigs.getState().loadJob(jig.id)}
        >
          {t('jigs.loadJob')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setRenaming(jig.name)}>
          {t('jigs.rename')}
        </Button>
        <HoldButton onConfirm={() => removeJig(jig.id)}>{t('jigs.remove')}</HoldButton>
      </div>
    </li>
  );
}

/**
 * Jigs with printed tags, as one card: the stored jigs, teaching a new one
 * and the page the tags are printed from. Using a jig needs nothing here –
 * the Job room offers it by itself as soon as the camera sees its tag.
 */
export function JigsCard() {
  const jigs = useWorkshop((s) => s.jigs);
  const teaching = useJigs((s) => s.teach !== null);
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Teaching was asked for elsewhere: the card opens and comes into view.
  useEffect(() => {
    if (!teaching) return;
    setOpen(true);
    document.getElementById('jigs-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [teaching]);

  return (
    <Fold
      variant="card"
      className="jigs-card"
      title={t('jigs.title')}
      id="jigs-card"
      testId="jigs-card"
      find="jigs"
      open={open}
      onOpenChange={setOpen}
    >
      <p className="text-muted-foreground text-sm">{t('jigs.intro')}</p>
      {jigs.length === 0 && !teaching ? (
        <p className="text-muted-foreground text-sm">{t('jigs.empty')}</p>
      ) : null}
      {jigs.length > 0 ? (
        <ul className="parts" data-testid="jig-list">
          {jigs.map((jig) => (
            <JigRow key={jig.id} jig={jig} />
          ))}
        </ul>
      ) : null}
      {teaching ? (
        <TeachFlow />
      ) : (
        <div className="flex gap-3">
          <Button className="flex-1" onClick={() => useJigs.getState().beginTeach()}>
            {t('jigs.teach')}
          </Button>
          <Button variant="outline" onClick={() => setPrinting(true)} data-find="tag-print">
            {t('jigs.print.open')}
          </Button>
        </div>
      )}
      {printing ? <TagSheet onClose={() => setPrinting(false)} /> : null}
    </Fold>
  );
}
