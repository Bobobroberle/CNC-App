import type { SectionAxis } from '@lowrider/gcode-core';
import { slideAccuracy } from '@lowrider/workshop';
import { useEffect, useRef } from 'react';
import { t, tDynamic } from '../i18n';
import { formatNumber } from '../lib/format';
import {
  nextReach,
  SECTION_ERROR_WARN,
  sectionOf,
  type SectionsJob,
  type SectionsTrouble,
} from '../lib/sections';
import { useCamera } from '../store/camera';
import { useJigs } from '../store/jigs';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useSections } from '../store/sections';
import { useUi } from '../store/ui';
import { HoldButton } from './HoldButton';
import { troubleText, useCanMeasure } from './JigCard';
import { Notice } from './Notice';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Fold } from './Fold';

/**
 * How the part is slid along, seen from above like the table picture: the
 * table (dashed, what the machine reaches), the part lying over its end,
 * the stretch with the register marks and an arrow the way the part goes.
 * Purely an illustration: the text beside it says the same.
 */
function SlidePicture({ axis }: { axis: SectionAxis }) {
  const x = axis === 'x';
  return (
    <svg
      className="flip-picture"
      viewBox="0 0 120 84"
      width="120"
      height="84"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <marker
          id={`slide-arrow-${axis}`}
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10z" fill="currentColor" />
        </marker>
      </defs>
      {x ? (
        <>
          <rect x="14" y="12" width="62" height="60" rx="2" className="slide-table" />
          <rect x="20" y="30" width="94" height="24" rx="2" className="flip-board" />
          <rect x="56" y="30" width="16" height="24" className="flip-half" />
          <rect x="59" y="33" width="5" height="5" className="slide-mark" />
          <rect x="64" y="46" width="5" height="5" className="slide-mark" />
          <path d="M98 22 H62" className="flip-turn" markerEnd={`url(#slide-arrow-${axis})`} />
        </>
      ) : (
        <>
          <rect x="26" y="34" width="68" height="44" rx="2" className="slide-table" />
          <rect x="46" y="4" width="28" height="68" rx="2" className="flip-board" />
          <rect x="46" y="38" width="28" height="12" className="flip-half" />
          <rect x="49" y="40" width="5" height="5" className="slide-mark" />
          <rect x="66" y="43" width="5" height="5" className="slide-mark" />
          <path d="M84 10 V40" className="flip-turn" markerEnd={`url(#slide-arrow-${axis})`} />
        </>
      )}
    </svg>
  );
}

/** Why measuring or finding the marks did not work, in words the operator can act on. */
function sectionsTroubleText(trouble: SectionsTrouble): string {
  switch (trouble.kind) {
    case 'noMarks':
      return t('sections.trouble.noMarks');
    case 'oneMark':
      return t('sections.trouble.oneMark', { n: trouble.tag });
    case 'machine':
      return t('sections.trouble.machine');
    case 'tag':
      return trouble.trouble.kind === 'notThere'
        ? t('sections.trouble.notThere', { n: trouble.trouble.tag ?? '' })
        : troubleText(trouble.trouble);
    case 'fit':
      return tDynamic(`sections.trouble.${trouble.trouble.problem}`, 'sections.trouble.missing', {
        n: trouble.trouble.tag ?? '',
        mm: formatNumber(Math.abs(trouble.trouble.mm ?? 0), 1),
        deg: formatNumber(Math.abs(trouble.trouble.degrees ?? 0), 2),
      });
  }
}

/** The steps as the operator counts them: every section, and the slide between two. */
function Steps({ job, index, sliding }: { job: SectionsJob; index: number; sliding: boolean }) {
  const total = job.parts.length;
  return (
    <ol className="flip-steps sections-steps" aria-label={t('sections.stepsLabel')}>
      {job.parts.flatMap((_, i) => {
        const cutState =
          i < index || (i === index && sliding) ? 'done' : i === index ? 'current' : '';
        const slideState = i < index ? 'done' : i === index && sliding ? 'current' : '';
        const item = (key: string, state: string, n: number, label: string) => (
          <li key={key} className={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="flip-step-n">{n}</span>
            {label}
          </li>
        );
        return [
          item(`cut-${i}`, cutState, 2 * i + 1, t('sections.steps.cut', { n: i + 1 })),
          ...(i < total - 1
            ? [item(`slide-${i}`, slideState, 2 * i + 2, t('sections.steps.slide'))]
            : []),
        ];
      })}
    </ol>
  );
}

/**
 * The guided flow of a part longer than the table, under the steps of the
 * Job room: which section is on, and what to do now. Cutting each section
 * stays what it always is (Prüfen → Fertigen); this card leads from one to
 * the next: stick on the register marks, slide the part, find it again.
 */
export function SectionsCard() {
  const job = useSections((s) => s.job);
  const index = useSections((s) => s.index);
  const phase = useSections((s) => s.phase);
  const marks = useSections((s) => s.marks);
  const fence = useSections((s) => s.fence);
  const result = useSections((s) => s.result);
  const busy = useSections((s) => s.busy);
  const trouble = useSections((s) => s.trouble);
  const refused = useSections((s) => s.refused);
  const flow = useSections.getState();
  const loaded = useJob((s) => s.original?.fileName ?? s.fileName);
  const connected = useMachine((s) => s.connection === 'connected');
  const running = useMachine((s) => s.fileJob !== null || s.stream?.result === 'running');
  const cameraOn = useCamera((s) => s.source !== null && s.size !== null);
  const measuring = useJigs((s) => s.busy);
  const ready = useCanMeasure();
  const go = useUi((s) => s.go);
  // A step that asks for the operator's hands comes into view by itself: the section has
  // just been cut further down the panel.
  const card = useRef<HTMLDivElement>(null);
  const shown = useRef(phase);
  useEffect(() => {
    if (shown.current !== phase && phase !== 'cut') {
      card.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    shown.current = phase;
  }, [phase]);

  if (!job) {
    if (!refused) return null;
    return (
      <Card
        className="gap-3 p-4 flip-card"
        id="sections-card"
        data-testid="sections-card"
        data-find="sections"
      >
        <CardTitle render={<h2 />}>{t('sections.refused.title')}</CardTitle>
        <Notice tone="danger" testId="sections-refused">
          {refused.problem === 'unsupported'
            ? t('sections.refused.unsupported', {
                what: tDynamic(
                  `sections.refused.what.${refused.what}`,
                  'sections.refused.what.errors',
                ),
              })
            : tDynamic(`sections.refused.${refused.problem}`, 'sections.refused.outside')}
        </Notice>
        <Button variant="outline" onClick={flow.dismiss}>
          {t('sections.refused.close')}
        </Button>
      </Card>
    );
  }

  const total = job.parts.length;
  const AXIS = job.axis.toUpperCase();
  const n = index + 1;
  const part = job.parts[index]!;
  // What the section cuts along the axis; all it may reach when it cuts nothing.
  const x = job.axis === 'x';
  const reach = part.box
    ? { min: x ? part.box.minX : part.box.minY, max: x ? part.box.maxX : part.box.maxY }
    : job.plan.windows[index]!;
  const onTable = sectionOf(job, loaded) === index;
  const sliding = phase === 'marks' || phase === 'slide' || phase === 'find';
  const seam = job.plan.seams[Math.min(index, total - 2)]!;
  const mm = (v: number, digits = 0) => formatNumber(v, digits);
  const accuracy =
    marks.length > 0 ? slideAccuracy(marks, nextReach(job, index, marks), fence) : null;
  const busyNow = busy !== null && measuring !== null;

  return (
    <Card
      ref={card}
      className={`flip-card sections-card gap-3 p-4 phase-${phase}`}
      id="sections-card"
      data-testid="sections-card"
      data-find="sections"
      data-phase={phase}
      data-section={n}
    >
      <CardTitle render={<h2 />}>{t('sections.title', { name: job.name })}</CardTitle>
      <Steps job={job} index={index} sliding={sliding} />

      {phase === 'cut' ? (
        <div data-testid="sections-cut">
          {index > 0 && result ? (
            <Alert variant="success" data-testid="sections-found">
              {t('sections.found', {
                mm: mm(result.moved, 1),
                angle: mm(result.rotation, 2),
              })}{' '}
              {marks.length > 1
                ? t('sections.foundDistance', { error: mm(Math.abs(result.distanceError), 2) })
                : ''}
            </Alert>
          ) : null}
          {index === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="sections-intro">
              {t('sections.intro', {
                count: total,
                slides: total - 1,
                slide: mm(job.slide),
                direction: t(`sections.direction.${job.axis}`),
              })}
            </p>
          ) : null}
          <p>
            {t('sections.cutHint', {
              n,
              total,
              axis: AXIS,
              from: mm(reach.min),
              to: mm(reach.max),
            })}{' '}
            {part.cuts === 0 ? t('sections.nothing') : ''}
          </p>
          {index < total - 1 || index > 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="sections-seam">
              {t(seam.cuts === 0 ? 'sections.seamNone' : 'sections.seamCuts', {
                axis: AXIS,
                at: mm(seam.at),
                count: seam.cuts,
              })}
            </p>
          ) : null}
          {!onTable ? (
            <Notice
              action={
                <Button
                  reason="machine"
                  variant="outline"
                  size="sm"
                  disabled={running}
                  onClick={flow.loadSection}
                >
                  {t('sections.load', { n })}
                </Button>
              }
            >
              {t('sections.otherJob', { n })}
            </Notice>
          ) : null}
          {index > 0 ? (
            <Button
              reason="machine"
              variant="outline"
              disabled={running || busyNow}
              onClick={flow.back}
            >
              {t('sections.findAgain')}
            </Button>
          ) : null}
          <Fold title={t('sections.alreadyCut', { n })}>
            <div className="contents">
              <p className="text-muted-foreground text-sm">{t('sections.alreadyCutHint')}</p>
              <Button
                reason="machine"
                variant="outline"
                disabled={!connected || running}
                onClick={() => flow.cutDone()}
              >
                {t(index < total - 1 ? 'sections.markCut' : 'sections.close')}
              </Button>
            </div>
          </Fold>
        </div>
      ) : null}

      {phase === 'marks' ? (
        <div className="flip-turn-step" data-testid="sections-marks">
          <p>{t('sections.marks.lead', { n })}</p>
          <ol className="flip-todo">
            <li>{t(fence ? 'sections.marks.stickFence' : 'sections.marks.stick')}</li>
            <li>{t('sections.marks.hint')}</li>
          </ol>
          <Label className="min-h-target gap-3 font-normal">
            <Checkbox
              checked={fence}
              disabled={busyNow}
              onCheckedChange={(checked) => flow.setFence(checked)}
            />
            <span>{t('sections.marks.fence')}</span>
          </Label>
          <p className="text-muted-foreground text-sm">{t('sections.marks.fenceHint')}</p>
          <div className="flex gap-3">
            <HoldButton
              variant="accent"
              disabled={!ready}
              onConfirm={() => void flow.measureMarks()}
            >
              {t(busy === 'marks' ? 'sections.marks.measuring' : 'sections.marks.measure')}
            </HoldButton>
            <Button variant="outline" onClick={() => go('job', 'extras')}>
              {t('sections.marks.print')}
            </Button>
          </div>
        </div>
      ) : null}

      {phase === 'slide' ? (
        <div className="flip-turn-step" data-testid="sections-slide">
          <Alert variant="success" data-testid="sections-measured">
            {marks.length > 1
              ? t('sections.slide.measuredTwo', {
                  a: marks[0]!.id,
                  b: marks[1]!.id,
                  mm: mm(accuracy?.baseline ?? 0),
                })
              : t('sections.slide.measuredOne', { a: marks[0]?.id ?? '' })}{' '}
            <span data-testid="sections-accuracy">
              {fence
                ? t('sections.slide.accuracyFence', { mm: mm(accuracy?.error ?? 0, 1) })
                : t('sections.slide.accuracy', {
                    mm: mm(accuracy?.error ?? 0, 1),
                    reach: mm(nextReach(job, index, marks)),
                  })}
            </span>
          </Alert>
          {!fence && accuracy && accuracy.error > SECTION_ERROR_WARN ? (
            <Alert variant="warning" data-testid="sections-weak">
              {t('sections.slide.weak')}
            </Alert>
          ) : null}
          <div className="flip-how">
            <SlidePicture axis={job.axis} />
            <p>
              <strong>{t(`sections.slide.how.${job.axis}`, { mm: mm(job.slide) })}</strong>{' '}
              {t('sections.slide.exact')}
            </p>
          </div>
          <ol className="flip-todo">
            <li>{t('sections.slide.loosen')}</li>
            <li>
              {t(fence ? 'sections.slide.pushFence' : 'sections.slide.push', { mm: mm(job.slide) })}
            </li>
            <li>{t('sections.slide.clamp')}</li>
          </ol>
          <p className="text-muted-foreground text-sm">{t('sections.slide.z')}</p>
          <Button reason="machine" disabled={running} onClick={flow.slid}>
            {t('sections.slide.done')}
          </Button>
          <Button reason="machine" variant="outline" disabled={running} onClick={flow.back}>
            {t('sections.slide.again')}
          </Button>
        </div>
      ) : null}

      {phase === 'find' ? (
        <div className="flip-locate" data-testid="sections-find">
          <p className="text-muted-foreground text-sm">{t('sections.find.hint', { n: n + 1 })}</p>
          <HoldButton variant="accent" disabled={!ready} onConfirm={() => void flow.find()}>
            {t(busy === 'find' ? 'sections.find.finding' : 'sections.find.go')}
          </HoldButton>
          <Button
            reason="machine"
            variant="outline"
            disabled={running || busyNow}
            onClick={flow.back}
          >
            {t('sections.find.notYet')}
          </Button>
        </div>
      ) : null}

      {sliding && phase !== 'slide' && !cameraOn ? (
        <Notice
          action={
            <Button variant="outline" size="sm" onClick={() => useCamera.getState().switchOn()}>
              {t('stage.cameraOn')}
            </Button>
          }
        >
          {t('stage.cameraOff')}
        </Notice>
      ) : null}
      {sliding && phase !== 'slide' && cameraOn && !ready && !busyNow ? (
        <p className="text-muted-foreground text-sm">{t('sections.notReady')}</p>
      ) : null}
      {busyNow ? (
        <div className="flex gap-3 justify-between" data-testid="sections-busy">
          <span>{t(busy === 'marks' ? 'sections.marks.measuring' : 'sections.find.finding')}</span>
          <Button variant="outline" onClick={() => useJigs.getState().cancel()}>
            {t('jigs.cancel')}
          </Button>
        </div>
      ) : null}
      {trouble && !busyNow ? (
        <Notice
          tone="danger"
          testId="sections-trouble"
          action={
            phase === 'find' && trouble.kind === 'tag' ? (
              <HoldButton disabled={!ready} onConfirm={() => void flow.find(true)}>
                {t('sections.find.here')}
              </HoldButton>
            ) : undefined
          }
        >
          {sectionsTroubleText(trouble)}
        </Notice>
      ) : null}

      {phase === 'done' ? (
        <Alert variant="success" data-testid="sections-done">
          {t('sections.done', { count: total })}
        </Alert>
      ) : null}

      {phase === 'done' ? (
        <Button variant="outline" onClick={flow.cancel}>
          {t('sections.close')}
        </Button>
      ) : index === 0 && phase === 'cut' ? (
        // Nothing is cut yet: back to the whole job without ado.
        <Button reason="machine" variant="outline" disabled={running} onClick={flow.cancel}>
          {t('sections.discard')}
        </Button>
      ) : (
        // Held: without the flow the rest of the part would have to be found by hand.
        <HoldButton disabled={running || busyNow} onConfirm={flow.cancel}>
          {t('sections.cancel')}
        </HoldButton>
      )}
    </Card>
  );
}
