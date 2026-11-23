import { useState, type ReactNode } from 'react';
import { t, type MessageKey } from '../i18n';
import { useJob } from '../store/job';
import { useStageTools } from '../store/tools';
import { useUi } from '../store/ui';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { ProbeCard } from './ProbeCard';
import { ProbeWizard } from './ProbeWizard';

type Tile = 'z' | 'corner' | 'edge' | 'center' | 'toolLength' | 'angle';

/** The workpiece (or the sensor) of a sketch */
const BLOCK = { fill: 'var(--muted)', stroke: 'currentColor', strokeWidth: 1.5 } as const;
/** The cutter, and the way it moves while probing */
const TOOL = { fill: 'currentColor' } as const;
const MOVE = {
  stroke: 'var(--probe)',
  strokeWidth: 2.5,
  fill: 'none',
  strokeLinecap: 'round',
  markerEnd: 'url(#probe-arrow)',
} as const;

/** Each cycle as a small picture: what is touched, and in which direction the tool moves. */
const SKETCH: Record<Tile, ReactNode> = {
  // From the side: down onto the surface.
  z: (
    <>
      <rect x="6" y="34" width="60" height="12" {...BLOCK} />
      <rect x="32" y="4" width="8" height="14" {...TOOL} />
      <path d="M36 20V31" {...MOVE} />
    </>
  ),
  // From above: at the corner, towards both edges.
  corner: (
    <>
      <rect x="28" y="4" width="40" height="28" {...BLOCK} />
      <circle cx="14" cy="42" r="5" {...TOOL} />
      <path d="M14 34V20h10" {...MOVE} />
      <path d="M22 42h20V35" {...MOVE} />
    </>
  ),
  // From above: beside the workpiece, towards its edge.
  edge: (
    <>
      <rect x="36" y="4" width="32" height="42" {...BLOCK} />
      <circle cx="10" cy="25" r="5" {...TOOL} />
      <path d="M18 25h14" {...MOVE} />
    </>
  ),
  // From above: inside the bore, out to four sides.
  center: (
    <>
      <rect x="6" y="2" width="60" height="46" {...BLOCK} />
      <circle cx="36" cy="25" r="18" fill="var(--card)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="36" cy="25" r="3.5" {...TOOL} />
      <path d="M41 25h9" {...MOVE} />
      <path d="M31 25h-9" {...MOVE} />
      <path d="M36 20v-9" {...MOVE} />
      <path d="M36 30v9" {...MOVE} />
    </>
  ),
  // From the side: down onto the tool length sensor.
  toolLength: (
    <>
      <rect x="26" y="36" width="20" height="10" {...BLOCK} />
      <rect x="31" y="31" width="10" height="5" {...BLOCK} />
      <rect x="32" y="2" width="8" height="12" {...TOOL} />
      <path d="M36 16v11" {...MOVE} />
    </>
  ),
  // From above: two points along an edge of a board that lies askew.
  angle: (
    <>
      <rect x="10" y="12" width="52" height="28" transform="rotate(-10 36 26)" {...BLOCK} />
      <circle cx="18" cy="44" r="3.5" fill="var(--probe)" />
      <circle cx="56" cy="37" r="3.5" fill="var(--probe)" />
      <path d="M18 44L56 37" stroke="var(--probe)" strokeWidth="1.5" strokeDasharray="3 3" />
    </>
  ),
};

const TILES: { id: Tile; label: MessageKey; hint: MessageKey }[] = [
  { id: 'z', label: 'probeTiles.z', hint: 'probeTiles.hints.z' },
  { id: 'corner', label: 'probeWizard.corner', hint: 'probeTiles.hints.corner' },
  { id: 'edge', label: 'probeWizard.edge', hint: 'probeTiles.hints.edge' },
  { id: 'center', label: 'probeWizard.center', hint: 'probeTiles.hints.center' },
  { id: 'toolLength', label: 'probeWizard.toolLength', hint: 'probeTiles.hints.toolLength' },
  { id: 'angle', label: 'probeTiles.angle', hint: 'probeTiles.hints.angle' },
];

/** "Winkel ausrichten" is done on the picture: two taps along an edge, with the zero tool. */
function AngleCard() {
  const go = useUi((s) => s.go);
  const hasJob = useJob((s) => s.fileName !== null);
  const edge = useStageTools((s) => s.active === 'zero' && s.zeroStep === 'edge');
  return (
    <Card className="gap-3 p-4" data-testid="probe-angle">
      <CardTitle render={<h2 />}>{t('probeTiles.angle')}</CardTitle>
      <p>{t('probeTiles.angleText')}</p>
      <Button
        pressed={edge}
        onClick={() => {
          const job = useJob.getState();
          if (job.view === '3d') job.setView('table');
          useStageTools.getState().select('zero');
          useStageTools.getState().setZeroStep('edge');
        }}
      >
        {t('probeTiles.angleStart')}
      </Button>
      {hasJob ? (
        <Button variant="outline" onClick={() => go('setup', 'align')}>
          {t('probeTiles.angleNumbers')}
        </Button>
      ) : null}
    </Card>
  );
}

/**
 * The probing assistants as tiles (DESIGN.md §5 ③): each shows what it
 * touches and the way the tool moves; the chosen one opens below. A rotary
 * axis has no cycle of its own yet (axis A is only prepared).
 */
export function ProbeTiles() {
  const [tile, setTile] = useState<Tile>('z');
  return (
    <>
      <Card className="gap-3 p-4" data-testid="probe-tiles" data-find="probe-wizard">
        <CardTitle render={<h2 />}>{t('probeWizard.title')}</CardTitle>
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <defs>
            <marker
              id="probe-arrow"
              viewBox="0 0 6 6"
              refX="4.5"
              refY="3"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M0 0L6 3L0 6z" fill="var(--probe)" />
            </marker>
          </defs>
        </svg>
        <div className="probe-tiles" role="group" aria-label={t('probeWizard.title')}>
          {TILES.map(({ id, label, hint }) => (
            <Button
              key={id}
              variant="outline"
              className="probe-tile"
              pressed={tile === id}
              data-tile={id}
              onClick={() => setTile(id)}
            >
              <svg viewBox="0 0 72 50" className="probe-sketch" aria-hidden="true">
                {SKETCH[id]}
              </svg>
              <span className="probe-tile-label">{t(label)}</span>
              <span className="probe-tile-hint">{t(hint)}</span>
            </Button>
          ))}
        </div>
      </Card>
      {tile === 'z' ? <ProbeCard /> : null}
      {tile === 'angle' ? <AngleCard /> : null}
      {tile !== 'z' && tile !== 'angle' ? <ProbeWizard kind={tile} /> : null}
    </>
  );
}
