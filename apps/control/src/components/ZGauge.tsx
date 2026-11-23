import { t } from '../i18n';
import { formatCoordinate } from '../lib/format';
import { surfaceZ, useJob } from '../store/job';
import { useTrack } from '../store/track';

/** Z level: job range from top to deepest cut, with the tool's current height. */
export function ZGauge() {
  const analysis = useJob((s) => s.analysis);
  const surface = useJob((s) => surfaceZ(s.analysis, s.rotaryDiameter));
  const bounds = analysis?.bounds;
  const cut = analysis?.cutBounds;
  const position = useTrack((s) => s.live ?? s.position);
  // Always rendered so the stage keeps its width when a job is loaded.
  const hasJob = bounds !== undefined && bounds.min.z <= bounds.max.z;
  const top = hasJob ? Math.max(bounds.max.z, surface) : 10;
  const bottom = hasJob ? Math.min(bounds.min.z, surface) : -10;
  const span = Math.max(top - bottom, 1);
  const y = (z: number) => `${((top - Math.min(top, Math.max(bottom, z))) / span) * 100}%`;
  const deepest = cut && cut.min.z <= cut.max.z ? cut.min.z : null;
  return (
    <aside className="zgauge" aria-label={t('stage.zGauge')}>
      <span className="zgauge-label">Z</span>
      <div className="zgauge-track">
        <div className="zgauge-material" style={{ top: y(surface) }} />
        <div className="zgauge-tick" style={{ top: y(surface) }}>
          <span>{formatCoordinate(surface, 0)}</span>
        </div>
        {deepest !== null ? (
          <div className="zgauge-tick deepest" style={{ top: y(deepest) }}>
            <span>{formatCoordinate(deepest, 1)}</span>
          </div>
        ) : null}
        {position ? (
          <div
            className={`zgauge-tool${position.z < surface ? ' cutting' : ''}`}
            style={{ top: y(position.z) }}
          />
        ) : null}
      </div>
      <span className="zgauge-value">{position ? formatCoordinate(position.z, 1) : '—'}</span>
    </aside>
  );
}
