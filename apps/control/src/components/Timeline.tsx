import { timeAtSegment } from '@lowrider/gcode-core';
import { PauseIcon, PlayIcon, SkipBackIcon } from 'lucide-react';
import { useMemo } from 'react';
import { t } from '../i18n';
import { formatDuration } from '../lib/format';
import { operationAt, operationsOf } from '../lib/operations';
import { useJob } from '../store/job';
import { useTrack } from '../store/track';
import { Button } from '../ui/button';

/**
 * The timeline of ④ Prüfen, under the 3D picture (DESIGN.md §5): play and
 * pause, the scrubber with a mark where each operation begins, and the
 * operations as buttons that jump there. Operations are what the program
 * itself names (`lib/operations.ts`) – a program that names none has its
 * tool changes as marks.
 */
export function Timeline({ inPanel = false }: { inPanel?: boolean } = {}) {
  const analysis = useJob((s) => s.analysis);
  const lines = useJob((s) => s.lines);
  const simTime = useJob((s) => s.simTime);
  const playing = useJob((s) => s.playing);
  const lineIndex = useTrack((s) => s.lineIndex);
  const { setSimTime, setPlaying } = useJob.getState();
  const timeline = analysis?.timeline ?? null;
  const marks = useMemo(() => {
    if (!analysis || !timeline) return [];
    return operationsOf(lines, analysis.segments).map((operation, i) => ({
      operation,
      n: i + 1,
      time: timeAtSegment(timeline, operation.segment),
    }));
  }, [analysis, lines, timeline]);
  if (!analysis || !timeline) return null;
  const total = timeline.total;
  const current = operationAt(
    marks.map((m) => m.operation),
    lineIndex,
  );
  const label = (m: (typeof marks)[number]) =>
    [m.operation.name, m.operation.tool > 0 ? `T${m.operation.tool}` : '']
      .filter(Boolean)
      .join(' · ') || t('timeline.operation', { n: m.n });
  return (
    <div
      className={`timeline${inPanel ? ' timeline-panel' : ''}`}
      data-testid="timeline"
      data-find="simulation"
    >
      <div className="timeline-row">
        <Button
          variant="outline"
          aria-label={t('job.rewind')}
          title={t('job.rewind')}
          onClick={() => setSimTime(0)}
        >
          <SkipBackIcon aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          pressed={playing}
          aria-label={playing ? t('job.pause') : t('job.play')}
          title={playing ? t('job.pause') : t('job.play')}
          data-testid="sim-play"
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
        </Button>
        <div className="timeline-track">
          <input
            type="range"
            className="scrubber"
            min={0}
            max={total}
            step={0.1}
            value={simTime}
            aria-label={t('job.simulation')}
            onChange={(e) => setSimTime(Number(e.target.value))}
          />
          <div className="timeline-marks" aria-hidden="true">
            {marks.map((m) => (
              <span
                key={m.n}
                className="timeline-mark"
                style={{ left: `${total > 0 ? (100 * m.time) / total : 0}%` }}
              />
            ))}
          </div>
        </div>
        <span className="timeline-time tabular-nums" data-testid="sim-time">
          {formatDuration(simTime)} / {formatDuration(total)}
        </span>
      </div>
      {marks.length > 1 ? (
        <div className="timeline-operations" role="group" aria-label={t('timeline.operations')}>
          {marks.map((m) => (
            <Button
              key={m.n}
              variant="outline"
              size="sm"
              pressed={current?.n === m.n}
              data-testid="timeline-operation"
              onClick={() => {
                setPlaying(false);
                setSimTime(m.time);
              }}
            >
              {m.n} · {label(m)}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
