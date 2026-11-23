import { t } from '../i18n';
import { formatCoordinate, formatNumber } from '../lib/format';
import { isSimulatorAddress } from '../sim';
import { useCamera, type CameraSource } from '../store/camera';
import { useHoles } from '../store/holes';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useRecorder } from '../store/recorder';
import { useTimelapse } from '../store/timelapse';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { NativeSelect } from '../ui/native-select';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

/**
 * Setting the camera up, once: where the picture comes from, scale and offset
 * by tapping the picture, the camera height, and the timelapse during jobs.
 */
export function CameraSetupCard() {
  const camera = useWorkshop((s) => s.settings.camera);
  const { setSettings } = useWorkshop.getState();
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const { jog, moveZ } = useMachine.getState();
  const workZ = useMachine((s) => s.status?.wpos[2]);
  const simulated = useMachine((s) => isSimulatorAddress(s.url));
  const source = useCamera((s) => s.source);
  const devices = useCamera((s) => s.devices);
  const deviceId = useCamera((s) => s.deviceId);
  const tapMode = useCamera((s) => s.tapMode);
  const taps = useCamera((s) => s.taps);
  const marked = useCamera((s) => s.marked);
  const { setSource, setTapMode, markHere } = useCamera.getState();
  const setView = useJob((s) => s.setView);
  const recording = useRecorder((s) => s.active);
  const lapse = useTimelapse();

  // Choosing a source or a calibration step means looking at the picture: put it on the stage.
  const showPicture = () => {
    if (useJob.getState().view !== 'camera') setView('camera');
  };
  /** Remembers the source for "Kamera einschalten" and switches it on; again switches it off. */
  const choose = (next: CameraSource) => {
    const on = source === next;
    setSettings({ camera: { ...camera, source: next } });
    setSource(on ? null : next);
    if (!on) showPicture();
  };
  const sources: CameraSource[] = simulated ? ['device', 'stream', 'sim'] : ['device', 'stream'];

  return (
    <Card className="gap-3 p-4" data-testid="camera-setup" data-find="camera-setup">
      <CardTitle render={<h2 />}>{t('camera.setupTitle')}</CardTitle>
      <h3 className="font-medium text-muted-foreground text-sm" data-find="camera-source">
        {t('camera.source')}
      </h3>
      <SegmentedControl
        className="w-full flex-wrap *:flex-auto"
        role="group"
        aria-label={t('camera.source')}
      >
        {sources.map((s) => (
          <SegmentedControlItem
            key={s}
            pressed={source === s}
            disabled={s === 'stream' && !camera.streamUrl}
            onClick={() => choose(s)}
          >
            {t(`camera.sources.${s}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {source === 'device' && devices.length > 1 ? (
        <Field>
          <FieldLabel>{t('camera.which')}</FieldLabel>
          <NativeSelect value={deviceId} onChange={(e) => setSource('device', e.target.value)}>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `${t('camera.sources.device')} ${i + 1}`}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      <Field>
        <FieldLabel>{t('camera.streamUrl')}</FieldLabel>
        <Input
          type="text"
          inputMode="url"
          spellCheck={false}
          placeholder="http://esp32-cam.local:81/stream"
          value={camera.streamUrl}
          onChange={(e) => setSettings({ camera: { ...camera, streamUrl: e.target.value.trim() } })}
        />
      </Field>
      <h3 className="font-medium text-muted-foreground text-sm" data-find="camera-calibration">
        {t('camera.calibrationTitle')}
      </h3>
      <SegmentedControl
        className="w-full flex-wrap *:flex-auto"
        role="group"
        aria-label={t('camera.calibrationTitle')}
      >
        {(['scale', 'offset'] as const).map((m) => (
          <SegmentedControlItem
            key={m}
            pressed={tapMode === m}
            onClick={() => {
              setTapMode(tapMode === m ? null : m);
              showPicture();
            }}
          >
            {t(`camera.modes.${m}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {tapMode === 'scale' || tapMode === 'offset' ? (
        <p className="text-muted-foreground text-sm">{t(`camera.hints.${tapMode}`)}</p>
      ) : null}
      {tapMode === 'scale' ? (
        <Button
          reason="machine"
          variant="outline"
          disabled={!idle || taps.length !== 1}
          onClick={() => jog('X', 10)}
        >
          {t('camera.jog10')}
        </Button>
      ) : null}
      {tapMode === 'offset' ? (
        <Button reason="machine" variant="outline" disabled={!idle} onClick={markHere}>
          {marked ? t('camera.marked') : t('camera.markHere')}
        </Button>
      ) : null}
      {tapMode === 'offset' && marked ? (
        <>
          <p className="text-muted-foreground text-sm">{t('camera.findMarkHint')}</p>
          <HoldButton
            disabled={!idle || !source}
            onConfirm={() => void useHoles.getState().calibrateOffset()}
          >
            {t('camera.findMark')}
          </HoldButton>
        </>
      ) : null}
      <p className="text-muted-foreground text-sm tabular-nums">
        {t('camera.calibration', {
          px: formatNumber(camera.pxPerMm, 2),
          angle: formatNumber(camera.rotation, 2),
          x: formatCoordinate(camera.offsetX, 2),
          y: formatCoordinate(camera.offsetY, 2),
        })}
      </p>

      <h3 className="font-medium text-muted-foreground text-sm" data-find="camera-height">
        {t('camera.focusTitle')}
      </h3>
      <p className="text-muted-foreground text-sm tabular-nums" data-testid="camera-focus">
        {camera.focusHeight === null
          ? t('camera.focusUnknown')
          : t('camera.focusAt', { z: formatCoordinate(camera.focusHeight, 2) })}
      </p>
      <HoldButton
        disabled={!idle || camera.focusHeight === null}
        onConfirm={() => camera.focusHeight !== null && void moveZ(camera.focusHeight)}
      >
        {t('camera.toFocus')}
      </HoldButton>
      <Button
        reason="missing"
        variant="outline"
        disabled={workZ === undefined}
        onClick={() =>
          workZ !== undefined &&
          setSettings({ camera: { ...camera, focusHeight: Number(workZ.toFixed(2)) } })
        }
      >
        {t('camera.focusHere')}
      </Button>

      <h3 className="font-medium text-muted-foreground text-sm" data-find="timelapse">
        {t('camera.timelapse')}
      </h3>
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={lapse.enabled}
          onCheckedChange={(checked) => lapse.setEnabled(checked)}
        />
        <span>{t('camera.timelapseOn')}</span>
      </Label>
      <Field>
        <FieldLabel>{t('camera.interval')}</FieldLabel>
        <Input
          type="text"
          inputMode="numeric"
          value={String(lapse.seconds)}
          onChange={(e) => lapse.setSeconds(Number(e.target.value.replace(/\D/g, '')) || 1)}
        />
      </Field>
      {lapse.enabled && recording ? <Alert variant="warning">{t('camera.recording')}</Alert> : null}
    </Card>
  );
}
