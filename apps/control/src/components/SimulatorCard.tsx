import { useState } from 'react';
import { t } from '../i18n';
import { isFullDemo } from '../lib/persist';
import { demoHref } from '../lib/demo';
import { formatCoordinate, formatNumber } from '../lib/format';
import {
  isSimulatorAddress,
  resetSimulator,
  SIM_BLANKS,
  SIM_CAMERA,
  SIM_ERRORS,
  simulator,
  simulatorScene,
  SURFACE_Z,
  type SimScene,
} from '../sim';
import { loadLongDemo } from '../store/demo';
import { scanDemoMap } from '../store/demoMap';
import { useMachine } from '../store/machine';
import { usePhotoMap } from '../store/photomap';
import { useSeries } from '../store/series';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

/** How much faster than a real machine the simulated one may run */
const SPEEDS = [1, 10, 50] as const;

/** Watching a whole job takes as long as cutting it – unless time runs faster. */
function TimeLapse() {
  const [speed, setSpeed] = useState(() => simulator().speed);
  return (
    <>
      <h3 className="font-medium text-muted-foreground text-sm">{t('sim.speed')}</h3>
      <SegmentedControl role="group" aria-label={t('sim.speed')}>
        {SPEEDS.map((x) => (
          <SegmentedControlItem
            key={x}
            pressed={speed === x}
            onClick={() => {
              simulator().speed = x;
              setSpeed(x);
            }}
          >
            {x}×
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </>
  );
}

const SCENES: SimScene[] = ['board', 'blanks', 'jig', 'long'];

/**
 * The pictures of the table that were taken before no longer show it: the
 * demo lays its map anew (as a scan would), elsewhere the map is emptied.
 */
function tableChanged() {
  // Blanks found on the old table are not there any more.
  if (useSeries.getState().blanks.length > 0) useSeries.getState().again();
  if (isFullDemo()) scanDemoMap();
  else usePhotoMap.getState().clear();
}

/**
 * What lies on the simulated table: the board with the dot plate, or – the
 * table cleared – small blanks for a series, a jig with printed tags, or a
 * board longer than the machine reaches.
 */
function SceneSwitch({ scene, onChange }: { scene: SimScene; onChange: (s: SimScene) => void }) {
  return (
    <>
      <h3 className="font-medium text-muted-foreground text-sm">{t('sim.scene')}</h3>
      <SegmentedControl
        className="w-full flex-wrap *:flex-auto"
        role="group"
        aria-label={t('sim.scene')}
      >
        {SCENES.map((x) => (
          <SegmentedControlItem
            key={x}
            pressed={scene === x}
            onClick={() => {
              if (x === scene) return;
              simulator().setScene(x);
              onChange(x);
              tableChanged();
              useMachine
                .getState()
                .addLog('info', t('sim.sceneChanged', { scene: t(`sim.scenes.${x}`) }));
            }}
          >
            {t(`sim.scenes.${x}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {scene === 'blanks' ? (
        <p className="text-muted-foreground text-sm">
          {t('sim.blanksValue', { count: SIM_BLANKS.length })}
        </p>
      ) : null}
      {scene === 'jig' ? (
        <>
          <p className="text-muted-foreground text-sm">{t('sim.jigValue')}</p>
          <Button
            variant="outline"
            onClick={() => {
              // Picked up and put down somewhere else, as between two jobs.
              simulator().moveJig();
              tableChanged();
              const { angle } = simulator().jig;
              useMachine
                .getState()
                .addLog('info', t('sim.jigMoved', { angle: formatNumber(angle, 1) }));
            }}
          >
            {t('sim.moveJig')}
          </Button>
        </>
      ) : null}
      {scene === 'long' ? (
        <>
          <p className="text-muted-foreground text-sm">{t('sim.longValue')}</p>
          {/* Held: it sets the X/Y zero. */}
          <HoldButton onConfirm={() => void loadLongDemo()}>{t('sim.loadLong')}</HoldButton>
        </>
      ) : null}
    </>
  );
}

/** While connected to the simulator: what is built in, to compare with what the app measures. */
export function SimulatorCard() {
  const url = useMachine((s) => s.url);
  const connected = useMachine((s) => s.connection === 'connected');
  // A reset table starts in real time again.
  const [resets, setResets] = useState(0);
  const [scene, setScene] = useState(() => simulator().scene);
  if (!connected || !isSimulatorAddress(url)) return null;
  const layout = simulatorScene();
  const [h1, h2, h3] = layout.holes;
  const xy = (p: { x: number; y: number }) =>
    `X ${formatCoordinate(p.x, 1)} · Y ${formatCoordinate(p.y, 1)}`;
  return (
    <Card className="gap-3 p-4" data-testid="simulator-card" data-find="simulator">
      <CardTitle render={<h2 />}>{t('sim.title')}</CardTitle>
      {isFullDemo() ? (
        <Alert variant="warning" className="justify-items-start gap-y-2" data-testid="demo-notice">
          <p>{t('demo.notice')}</p>
          {location.hash === '#demo' ? (
            <Button
              variant="outline"
              // Dropping the hash loads the page afresh, with the real settings.
              onClick={() => location.replace(demoHref(false))}
            >
              {t('demo.leave')}
            </Button>
          ) : null}
        </Alert>
      ) : null}
      <p className="text-muted-foreground text-sm">{t('sim.intro')}</p>
      <dl className="facts">
        <dt>{t('sim.errors')}</dt>
        <dd className="tabular-nums">
          {t('sim.errorsValue', {
            x: formatNumber((SIM_ERRORS.kx - 1) * 100, 2),
            y: formatNumber((SIM_ERRORS.ky - 1) * 100, 2),
            angle: formatNumber(90 - SIM_ERRORS.gamma, 2),
            play: formatNumber(SIM_ERRORS.playX, 2),
            tilt: formatNumber(SIM_ERRORS.tiltZ * 100, 2),
          })}
        </dd>
        <dt>{t('sim.camera')}</dt>
        <dd className="tabular-nums">
          {t('sim.cameraValue', {
            x: formatCoordinate(SIM_CAMERA.offset.x, 1),
            y: formatCoordinate(SIM_CAMERA.offset.y, 1),
            px: formatNumber(SIM_CAMERA.pxPerMm),
          })}
        </dd>
        {scene === 'board' ? (
          <>
            <dt>{t('sim.plate')}</dt>
            <dd className="tabular-nums">{xy(layout.plate)}</dd>
            <dt>{t('sim.holes')}</dt>
            <dd className="tabular-nums">
              1: {xy(h1!)}
              <br />
              2: {xy(h2!)}
              <br />
              3: {xy(h3!)}
            </dd>
          </>
        ) : null}
        <dt>{t('sim.surface')}</dt>
        <dd className="tabular-nums">Z {formatCoordinate(SURFACE_Z, 1)}</dd>
      </dl>
      <p className="text-muted-foreground text-sm">{t('sim.howTo')}</p>
      <SceneSwitch scene={scene} onChange={setScene} />
      <TimeLapse key={resets} />
      <Button
        variant="outline"
        onClick={() => {
          // The marks go, what lies on the table stays.
          const { scene, jig, long, longTags } = simulator();
          resetSimulator();
          Object.assign(simulator(), { scene, jig, long, longTags });
          setResets(resets + 1);
          useMachine.setState({ homed: false });
          useMachine.getState().addLog('info', t('sim.wasReset'));
        }}
      >
        {t('sim.reset')}
      </Button>
    </Card>
  );
}
