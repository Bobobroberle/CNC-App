import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { useSensors } from '../store/sensors';
import { useWorkshop } from '../store/workshop';
import { Alert } from '../ui/alert';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';

/** Spindle load bar, chatter warning and the adaptive feed switch (companion sensors). */
export function SensorPanel() {
  const sensors = useSensors();
  const adaptive = useWorkshop((s) => s.settings.adaptive);
  const { setSettings } = useWorkshop.getState();
  if (!sensors.connected) return null;
  const load = sensors.load;
  return (
    <div className="sensor-panel" data-testid="sensor-panel">
      {load !== null ? (
        <>
          <h3 className="font-medium text-muted-foreground text-sm">
            {t('sensors.load')} {formatNumber(load)} %
          </h3>
          <Progress
            className={load >= 85 ? 'load-high' : undefined}
            aria-label={t('sensors.load')}
            value={Math.min(100, load)}
          />
        </>
      ) : null}
      {sensors.chatter ? (
        <Alert variant="warning" data-testid="chatter">
          {t('sensors.chatter', { hz: formatNumber(sensors.chatterFrequency) })}
        </Alert>
      ) : null}
      {load !== null ? (
        <Label className="min-h-target gap-3 font-normal">
          <Checkbox
            checked={adaptive.enabled}
            onCheckedChange={(checked) =>
              setSettings({ adaptive: { ...adaptive, enabled: checked } })
            }
          />
          <span>
            {t('sensors.adaptive', { target: adaptive.targetLoad, max: adaptive.maxOverride })}
          </span>
        </Label>
      ) : null}
    </div>
  );
}
