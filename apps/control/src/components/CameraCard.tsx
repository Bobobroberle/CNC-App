import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { formatCoordinate, formatNumber } from '../lib/format';
import { crosshairPoint, useCamera } from '../store/camera';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { cameraCalibrated } from '../store/photomap';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { HoleZero, TwoHoles } from './HolePanel';
import { PhotoMapPanel } from './PhotoMapPanel';
import { RecordingPanel } from './RecordingPanel';
import { Section } from './Section';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

/**
 * ③ Einrichten → Kamera: the zero on a hole on top, the occasional things
 * folded below (the zero at the crosshair is the one way of `SetZeroCard`). Picture source, camera height and calibration are set once
 * under Maschine → Einrichtung; a status line leads there. Without a picture
 * or a calibration there is one thing to do, and only that is offered.
 */
export function CameraCard() {
  const camera = useWorkshop((s) => s.settings.camera);
  const source = useCamera((s) => s.source);
  const { switchOn } = useCamera.getState();
  const setView = useJob((s) => s.setView);
  const openSetup = useUi((s) => s.openSetup);
  const calibrated = cameraCalibrated(camera);

  // The picture belongs on the stage while this card is open.
  useEffect(() => {
    if (useJob.getState().view !== 'camera') setView('camera');
  }, [setView]);

  return (
    <>
      <Card className="gap-3 p-4" data-testid="camera-card" data-find="camera">
        <CardTitle render={<h2 />}>{t('camera.title')}</CardTitle>
        {!source ? (
          <>
            <p>{t('stage.cameraOff')}</p>
            <Button onClick={switchOn}>{t('stage.cameraOn')}</Button>
          </>
        ) : !calibrated ? (
          <div data-testid="camera-setup-cta" className="cta">
            <p>{t('camera.setupNeeded')}</p>
            <Button onClick={() => openSetup('camera')}>{t('camera.setupTitle')}</Button>
          </div>
        ) : (
          <HoleZero />
        )}
        {source && calibrated ? (
          <div className="status-line" data-testid="camera-status">
            <p className="text-muted-foreground text-sm tabular-nums">
              {t(`camera.sources.${source}`)} ·{' '}
              {t('camera.focusShort', { z: formatNumber(camera.focusHeight ?? 0, 1) })}
            </p>
            <Button variant="outline" size="sm" onClick={() => openSetup('camera')}>
              {t('camera.change')}
            </Button>
          </div>
        ) : null}
      </Card>
      {source && calibrated ? (
        <>
          <Section title="camera.twoHoles" find="two-holes">
            <TwoHoles />
          </Section>
          <Section title="photomap.scanTitle" find="photomap">
            <PhotoMapPanel />
          </Section>
        </>
      ) : null}
      <Section title="recording.title" find="recording">
        <RecordingPanel />
      </Section>
    </>
  );
}
