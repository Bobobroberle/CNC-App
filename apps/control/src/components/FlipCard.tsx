import { registrationLayout } from '@lowrider/cam';
import { useEffect, useRef } from 'react';
import { t } from '../i18n';
import { loadedSide } from '../lib/flip';
import { formatCoordinate, formatNumber } from '../lib/format';
import { useCalibration } from '../store/calibration';
import { useCamera } from '../store/camera';
import { useFlip, type FlipPhase } from '../store/flip';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useUi } from '../store/ui';
import { mm } from './camParts';
import { FlipPicture } from './FlipPicture';
import { HoldButton } from './HoldButton';
import { Notice } from './Notice';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Fold } from './Fold';
import { Card, CardTitle } from '../ui/card';

/** The steps of a two-sided job as the operator counts them: with the camera there is one more. */
function steps(camera: boolean): { phase: FlipPhase; label: string }[] {
  return [
    { phase: 'front', label: t('flip.steps.front') },
    { phase: 'turn', label: t(camera ? 'flip.steps.turn' : 'flip.steps.turnPins') },
    ...(camera ? [{ phase: 'locate' as const, label: t('flip.steps.locate') }] : []),
    { phase: 'back', label: t('flip.steps.back') },
  ];
}

const ORDER: FlipPhase[] = ['front', 'turn', 'locate', 'back', 'done'];

/**
 * The guided flow "Wenden" of a job machined from both sides, at the top of
 * the Job room: which of its steps is on, and what to do now. Cutting each
 * side stays what it always is (Vorbereiten → Prüfen → Fertigen); this card
 * leads from one side to the other: turn the part over, find it again.
 */
export function FlipCard() {
  const plan = useFlip((s) => s.plan);
  const phase = useFlip((s) => s.phase);
  const found = useFlip((s) => s.found);
  const fit = useFlip((s) => s.fit);
  const seeking = useFlip((s) => s.seeking);
  const trouble = useFlip((s) => s.trouble);
  const flip = useFlip.getState();
  const loaded = useJob((s) => s.original?.fileName ?? s.fileName);
  const connected = useMachine((s) => s.connection === 'connected');
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const running = useMachine((s) => s.fileJob !== null || s.stream?.result === 'running');
  const cameraOn = useCamera((s) => s.source !== null && s.size !== null);
  const centring = useCalibration((s) => s.task !== null);
  // A step that asks for the operator's hands comes into view by itself: the front has
  // just been cut further down the panel.
  const card = useRef<HTMLDivElement>(null);
  const shown = useRef(phase);
  useEffect(() => {
    if (shown.current !== phase && (phase === 'turn' || phase === 'locate')) {
      card.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    shown.current = phase;
  }, [phase]);
  if (!plan) return null;

  const camera = plan.method === 'camera';
  const list = steps(camera);
  const side = loadedSide(plan, loaded);
  const d = mm(plan.holeDiameter);
  const across = registrationLayout(plan.flip.axis, plan.holes) !== 'along';
  const ready = idle && cameraOn && !centring && !seeking;
  // The hole to look for next: the first, then the second.
  const next = found.a ? 'b' : 'a';

  return (
    <Card
      ref={card}
      className={`flip-card gap-3 p-4 phase-${phase}`}
      id="flip-card"
      data-testid="flip-card"
    >
      <CardTitle render={<h2 />}>{t('flip.title', { name: plan.name })}</CardTitle>
      <ol className="flip-steps" aria-label={t('flip.stepsLabel')}>
        {list.map((s, i) => {
          const state =
            ORDER.indexOf(phase) > ORDER.indexOf(s.phase)
              ? 'done'
              : phase === s.phase
                ? 'current'
                : '';
          return (
            <li
              key={s.phase}
              className={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="flip-step-n">{i + 1}</span>
              {s.label}
            </li>
          );
        })}
      </ol>

      {phase === 'front' ? (
        <>
          <p className="text-muted-foreground text-sm">
            {t(camera ? 'flip.frontHint' : 'flip.frontHintPins', { d })}
          </p>
          {side !== 'front' ? (
            // Another program is loaded: back to this job, or let it go (nothing is cut yet).
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={flip.loadFront}>
                {t('flip.loadFront')}
              </Button>
              <Button variant="outline" onClick={flip.cancel}>
                {t('flip.discard')}
              </Button>
            </div>
          ) : null}
          <Fold title={t('flip.alreadyCut')}>
            <div className="contents">
              <p className="text-muted-foreground text-sm">{t('flip.alreadyCutHint')}</p>
              <Button
                reason="machine"
                variant="outline"
                disabled={!connected || running}
                onClick={() => flip.frontCut()}
              >
                {t('flip.markCut')}
              </Button>
            </div>
          </Fold>
        </>
      ) : null}

      {phase === 'turn' ? (
        <div className="flip-turn-step" data-testid="flip-turn">
          <div className="flip-how">
            <FlipPicture axis={plan.flip.axis} />
            <p>
              <strong>{t(`flip.turn.${plan.flip.axis}`)}</strong>
            </p>
          </div>
          <ol className="flip-todo">
            <li>{t('flip.turn.loosen')}</li>
            <li>
              {t(`flip.turn.how.${plan.flip.axis}`)}{' '}
              {camera
                ? t('flip.turn.putCamera')
                : t(across ? 'flip.turn.putPins' : 'flip.turn.putPinsAlong', { d })}
            </li>
            <li>{t('flip.turn.clamp')}</li>
          </ol>
          <p className="text-muted-foreground text-sm">{t('flip.turn.z')}</p>
          <Button
            reason="machine"
            disabled={!idle || running}
            onClick={() => {
              void flip.turned().then((ok) => {
                // With the part on its pins the back is ready for the usual steps.
                if (ok && !camera) useUi.getState().setView('job', 'prepare');
              });
            }}
          >
            {t(camera ? 'flip.turn.done' : 'flip.turn.donePins')}
          </Button>
          {!connected ? (
            <p className="text-muted-foreground text-sm">{t('flip.needsMachine')}</p>
          ) : null}
        </div>
      ) : null}

      {phase === 'locate' ? (
        <div className="flip-locate" data-testid="flip-locate">
          <p className="text-muted-foreground text-sm">{t('flip.locate.hint')}</p>
          {(['a', 'b'] as const).map((which, i) => {
            const hole = found[which];
            return (
              <div key={which} className="hole-step">
                <HoldButton
                  variant={which === next ? 'accent' : 'default'}
                  disabled={!ready}
                  onConfirm={() => void flip.seek(which, true)}
                >
                  {seeking === which
                    ? t('flip.locate.seeking', { n: i + 1 })
                    : t(hole ? 'flip.locate.again' : 'flip.locate.find', { n: i + 1 })}
                </HoldButton>
                <p
                  className="text-muted-foreground text-sm tabular-nums"
                  data-testid={`flip-hole-${i + 1}`}
                >
                  {hole
                    ? t('camera.holeAt', {
                        x: formatCoordinate(hole.x, 2),
                        y: formatCoordinate(hole.y, 2),
                      })
                    : t('camera.holeOpen')}
                </p>
              </div>
            );
          })}
          {!cameraOn ? (
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
          {trouble === 'no-hole' || trouble === 'no-move' ? (
            <Notice
              tone="danger"
              testId="flip-trouble"
              action={
                <HoldButton disabled={!ready} onConfirm={() => void flip.seek(next, false)}>
                  {t('flip.locate.here', { n: next === 'a' ? 1 : 2 })}
                </HoldButton>
              }
            >
              {t(trouble === 'no-hole' ? 'flip.locate.noHole' : 'flip.locate.noMove')}
            </Notice>
          ) : null}
          {trouble === 'mismatch' ? (
            <Notice tone="danger" testId="flip-trouble">
              {t('flip.locate.mismatch', {
                error: fit ? formatNumber(Math.abs(fit.distanceError), 1) : '?',
              })}
            </Notice>
          ) : null}
          <Button variant="outline" onClick={flip.again}>
            {t('flip.backToTurn')}
          </Button>
        </div>
      ) : null}

      {phase === 'back' ? (
        <>
          <Alert variant="success" data-testid="flip-located">
            {fit
              ? t('flip.located', {
                  angle: formatNumber(fit.rotation, 2),
                  error: formatNumber(Math.abs(fit.distanceError), 2),
                })
              : t('flip.onPins')}
          </Alert>
          {side !== 'back' ? <Alert variant="warning">{t('flip.otherJob')}</Alert> : null}
          <Button
            reason="machine"
            variant="outline"
            disabled={running}
            onClick={camera ? flip.relocate : flip.again}
          >
            {t(camera ? 'flip.findAgain' : 'flip.backToTurn')}
          </Button>
        </>
      ) : null}

      {phase === 'done' ? <Alert variant="success">{t('flip.done')}</Alert> : null}

      {phase === 'done' ? (
        <Button variant="outline" onClick={flip.cancel}>
          {t('flip.close')}
        </Button>
      ) : phase !== 'front' ? (
        // Held: without the flow the back would have to be found by hand.
        <HoldButton disabled={running} onConfirm={flip.cancel}>
          {t('flip.cancel')}
        </HoldButton>
      ) : null}
    </Card>
  );
}
