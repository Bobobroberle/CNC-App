import type { ReactNode } from 'react';
import { featureShown, type FeatureId } from '../lib/features';
import { useReadiness } from '../store/readiness';
import { useWorkshop } from '../store/workshop';

/** A hidden function that may still show: its flow is under way (read from the readiness list). */
function WhileUnderWay({ id, children }: { id: FeatureId; children: ReactNode }) {
  const hidden = useWorkshop((s) => s.settings.hiddenFeatures);
  const readiness = useReadiness();
  return featureShown(id, hidden, readiness?.items ?? []) ? <>{children}</> : null;
}

/**
 * The entry points of a function the operator can hide (Einstellungen → Maschine → Funktionen):
 * shown unless it is hidden – and shown anyway while its flow is under way, because the card is
 * the way to what holds the start. Nothing here stops what runs in the background.
 */
export function Feature({ id, children }: { id: FeatureId; children: ReactNode }) {
  const hidden = useWorkshop((s) => s.settings.hiddenFeatures);
  if (!hidden.includes(id)) return <>{children}</>;
  return <WhileUnderWay id={id}>{children}</WhileUnderWay>;
}
