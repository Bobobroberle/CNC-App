import { t } from '../i18n';
import { FEATURES, featureShown, withHidden, type FeatureId } from '../lib/features';
import { useReadiness } from '../store/readiness';
import { useWorkshop } from '../store/workshop';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

/**
 * Einstellungen → Maschine → Funktionen: the rare functions can be hidden (their cards and
 * buttons go, the quick search leads back here) – and shown again. A flow that is under way
 * stays in sight, and what runs in the background keeps running.
 */
export function FeaturesCard() {
  const hidden = useWorkshop((s) => s.settings.hiddenFeatures);
  const readiness = useReadiness();
  const items = readiness?.items ?? [];
  const { setSettings } = useWorkshop.getState();
  return (
    <Card className="gap-3 p-4" data-testid="features-card" data-find="features">
      <CardTitle render={<h2 />}>{t('features.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('features.hint')}</p>
      {FEATURES.map((id: FeatureId) => (
        <div key={id} className="flex flex-col gap-1">
          <Label className="min-h-target gap-3 font-normal">
            <Checkbox
              checked={!hidden.includes(id)}
              data-testid={`feature-${id}`}
              onCheckedChange={(shown) =>
                setSettings({ hiddenFeatures: withHidden(hidden, id, !shown) })
              }
            />
            <span>{t(`features.items.${id}`)}</span>
          </Label>
          {hidden.includes(id) && featureShown(id, hidden, items) ? (
            <p className="text-sm text-warning-foreground">{t('features.underWay')}</p>
          ) : null}
        </div>
      ))}
    </Card>
  );
}
