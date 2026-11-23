import { useEffect, useRef } from 'react';
import { t } from '../i18n';
import { mountCamera, useCamera } from '../store/camera';
import { useJob } from '../store/job';
import { hasPicture, useUi } from '../store/ui';

/**
 * The live camera picture, small in the corner of the table view. A tap
 * makes it the stage (and the overview there leads back).
 */
export function LiveInset() {
  const box = useRef<HTMLSpanElement>(null);
  const source = useCamera((s) => s.source);
  const setView = useJob((s) => s.setView);

  useEffect(() => (source ? mountCamera(box.current!) : undefined), [source]);

  if (!source) return null;
  return (
    <button
      type="button"
      className="stage-inset live-inset"
      data-testid="live-inset"
      aria-label={t('stage.liveInset')}
      title={t('stage.liveInset')}
      onClick={() => {
        const { place, setStageView } = useUi.getState();
        if (hasPicture(place)) setStageView(place, 'camera');
        setView('camera');
      }}
    >
      <span className="live-inset-picture" ref={box} aria-hidden="true" />
    </button>
  );
}
