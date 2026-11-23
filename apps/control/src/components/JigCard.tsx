import { jigAccuracy, type Jig } from '@lowrider/workshop';
import { t, tDynamic } from '../i18n';
import { formatNumber } from '../lib/format';
import { jigsWithTag, jigState, type JigState, type JigTrouble } from '../lib/jigs';
import { useCalibration } from '../store/calibration';
import { useCamera } from '../store/camera';
import { useJigs } from '../store/jigs';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { cameraCalibrated } from '../store/photomap';
import { useSections } from '../store/sections';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Notice } from './Notice';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

/** From this expected error on, one tag alone is called too weak for the job, mm */
export const JIG_ERROR_WARN = 0.5;

/** Why measuring did not work, in words the operator can act on. */
export function troubleText(trouble: JigTrouble): string {
  if (trouble.kind === 'refused') {
    return t('jigs.trouble.refused', {
      why: tDynamic(`jigs.refused.${trouble.reason ?? 'unreadable'}`, 'jigs.refused.unreadable', {
        mm: formatNumber(trouble.mm ?? 0, 0),
      }),
    });
  }
  return tDynamic(`jigs.trouble.${trouble.kind}`, 'jigs.trouble.machine', {
    n: trouble.tag ?? '',
  });
}

/** What has happened to the job of a jig since it was measured – or that it was not. */
const staleTitle = (state: JigState | null, name: string) =>
  tDynamic(`jigs.stale.${state ?? 'unmeasured'}`, 'jigs.stale.unmeasured', { name });

/** "Marker 3", "Marker 3 und 4", "Marker 3, 4 und 7" */
export const tagNames = (ids: readonly number[]) =>
  ids.length < 2
    ? t('jigs.tagOne', { n: ids[0] ?? '' })
    : t('jigs.tagMany', { list: ids.slice(0, -1).join(', '), last: ids[ids.length - 1]! });

/** What to expect of a jig: "etwa ± 0,3 mm" at the far end of its job. */
export function accuracyText(jig: Pick<Jig, 'tags' | 'reach'>): string {
  const a = jigAccuracy(jig.tags, jig.reach);
  return t('jigs.accuracy', {
    mm: formatNumber(Math.max(0.1, a.error), 1),
    reach: formatNumber(jig.reach, 0),
  });
}

/** Whether a jig could be measured right now: machine still, camera on and calibrated. */
export function useCanMeasure(): boolean {
  const idle = useMachine(
    (s) =>
      s.connection === 'connected' &&
      s.status?.state === 'Idle' &&
      s.fileJob === null &&
      s.stream?.result !== 'running',
  );
  const cameraOn = useCamera((s) => s.source !== null && s.size !== null);
  const calibrated = useWorkshop((s) => cameraCalibrated(s.settings.camera));
  const busy = useJigs((s) => s.busy !== null);
  const centring = useCalibration((s) => s.task !== null);
  return idle && cameraOn && calibrated && !busy && !centring;
}

/** The measuring as it runs – for a jig, or while one is taught: which tag the camera is over, and the way out. */
export function JigBusy({ teaching = false }: { teaching?: boolean }) {
  const busy = useJigs((s) => s.busy);
  if (!busy || (busy.jigId === null) !== teaching) return null;
  return (
    <div className="flex gap-3 justify-between" data-testid="jig-busy">
      <span>
        {t('jigs.measuring', { n: Math.min(busy.total, busy.done + 1), total: busy.total })}
      </span>
      <Button variant="outline" onClick={() => useJigs.getState().cancel()}>
        {t('jigs.cancel')}
      </Button>
    </div>
  );
}

/**
 * At the top of the Job room, only when there is something to say: a known
 * jig lies on the table (one hold measures it, sets the X/Y zero and loads
 * its job), the job of a jig is loaded (what was measured, and what comes
 * next), or the camera sees a tag that belongs to no jig yet.
 */
export function JigCard() {
  const jigs = useWorkshop((s) => s.jigs);
  const seen = useJigs((s) => s.seen);
  const busy = useJigs((s) => s.busy);
  const trouble = useJigs((s) => s.trouble);
  const loaded = useJigs((s) => s.loaded);
  const placed = useJigs((s) => s.placed);
  const teaching = useJigs((s) => s.teach !== null);
  const ignored = useJigs((s) => s.ignored);
  const pose = useJob((s) => s.pose);
  const wcoKey = useMachine((s) => s.status?.wco.join(',') ?? null);
  const zKey = wcoKey === null ? null : (wcoKey.split(',')[2] ?? '0');
  const running = useMachine((s) => s.fileJob !== null || s.stream?.result === 'running');
  const ready = useCanMeasure();
  const go = useUi((s) => s.go);
  // On a part cut in sections the tags are register marks: nothing to teach.
  const sections = useSections((s) => s.job !== null);
  if (running) return null;

  const onTable = (jig: Jig) => jig.tags.some((tag) => seen.some((s) => s.id === tag.id));
  const active = jigs.find((j) => j.id === loaded?.jigId) ?? null;
  const state = active
    ? jigState(
        placed?.jigId === active.id ? placed : null,
        wcoKey === null ? null : wcoKey.split(',').map(Number),
        pose,
      )
    : null;
  // Jigs that lie on the table and are not the one that is measured and loaded.
  const offers = jigs.filter((j) => onTable(j) && !(j.id === active?.id && state === 'ok'));
  const unknown = seen
    .filter((s) => jigsWithTag(jigs, s.id).length === 0 && !ignored.includes(s.id))
    .map((s) => s.id);
  const showUnknown = unknown.length > 0 && !teaching && !sections;
  // While a jig is taught, its own card says what goes wrong.
  const shownTrouble = trouble && trouble.jigId !== null ? trouble : null;
  if (!active && offers.length === 0 && !showUnknown && !shownTrouble) return null;

  const measure = (jig: Jig) => void useJigs.getState().measure(jig.id);
  const accuracy = active ? jigAccuracy(active.tags, active.reach) : null;

  return (
    <Card className="gap-3 p-4 jig-card" id="jig-card" data-testid="jig-card">
      {active && state === 'ok' && placed ? (
        <div className="jig-block" data-testid="jig-placed">
          <h2>{t('jigs.placedTitle', { name: active.name })}</h2>
          <Notice tone="ok">
            {t('jigs.placed', { angle: formatNumber(placed.rotation, 1) })}{' '}
            <span data-testid="jig-accuracy">{accuracyText(active)}</span>
          </Notice>
          {active.tags.length === 1 && accuracy && accuracy.error > JIG_ERROR_WARN ? (
            <Alert variant="warning">{t('jigs.oneTagWeak')}</Alert>
          ) : null}
          {/* Until the Z zero has been set anew: the one thing a tag cannot give. */}
          {zKey !== null && Number(zKey) === placed.z ? (
            <div className="flex gap-3 justify-between jig-next" data-testid="jig-z-next">
              <span>{t('jigs.zNext')}</span>
              <Button variant="outline" onClick={() => go('setup', 'zero')}>
                {t('jigs.toZ')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {offers.map((jig) => {
        const stale = jig.id === active?.id && state !== null && state !== 'ok';
        return (
          <div key={jig.id} className="jig-block" data-testid="jig-offer">
            <h2>{stale ? staleTitle(state, jig.name) : t('jigs.found', { name: jig.name })}</h2>
            <p className="text-muted-foreground text-sm">
              {t(jig.tags.length === 1 ? 'jigs.offerOne' : 'jigs.offerTwo', {
                file: jig.job.fileName,
              })}{' '}
              {t('jigs.offerZ')}
            </p>
            <HoldButton variant="accent" disabled={!ready} onConfirm={() => measure(jig)}>
              {t('jigs.measure')}
            </HoldButton>
          </div>
        );
      })}
      {offers.length > 0 && !ready && !busy ? (
        <p className="text-muted-foreground text-sm" data-testid="jig-not-ready">
          {t('jigs.notReady')}
        </p>
      ) : null}

      {/* The job of a jig is loaded, but the jig is not on any picture: say how to get there. */}
      {active && state !== 'ok' && !offers.includes(active) ? (
        <div className="jig-block" data-testid="jig-unseen">
          <h2>{staleTitle(state, active.name)}</h2>
          <p className="text-muted-foreground text-sm">
            {t('jigs.unseen', { tags: tagNames(active.tags.map((x) => x.id)) })}
          </p>
        </div>
      ) : null}

      <JigBusy />
      {shownTrouble && !busy ? (
        <Notice tone="danger" testId="jig-trouble">
          {troubleText(shownTrouble)}
        </Notice>
      ) : null}

      {showUnknown ? (
        <div className="jig-block" data-testid="jig-unknown">
          <p>
            {t(unknown.length === 1 ? 'jigs.unknownOne' : 'jigs.unknownMany', {
              tags: tagNames(unknown),
            })}
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                useJigs.getState().beginTeach();
                go('job', 'extras');
              }}
            >
              {t('jigs.teach')}
            </Button>
            <Button variant="outline" onClick={() => useJigs.getState().ignoreUnknown()}>
              {t('jigs.notNow')}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
