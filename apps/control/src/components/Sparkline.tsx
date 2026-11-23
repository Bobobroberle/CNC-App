import { formatCoordinate, formatDuration } from '../lib/format';

/**
 * Small line chart for trends (deviation over a job, over jobs). Values
 * above `warn` are drawn in the alarm colour: colour only with meaning.
 */
export function Sparkline({
  points,
  label,
  warn,
  xUnit = 'time',
  height = 96,
}: {
  points: [number, number][];
  label: string;
  warn?: number;
  xUnit?: 'time' | 'index';
  height?: number;
}) {
  if (points.length < 2) return null;
  const w = 320;
  const h = height;
  const pad = 4;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys, warn ?? 0) || 1;
  const sx = (x: number) => pad + ((x - minX) / Math.max(1e-9, maxX - minX)) * (w - 2 * pad);
  const sy = (y: number) => h - pad - (y / maxY) * (h - 2 * pad);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`)
    .join(' ');
  const peak = Math.max(...ys);
  return (
    <figure className="sparkline">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} preserveAspectRatio="none">
        {warn !== undefined ? (
          <line x1={pad} x2={w - pad} y1={sy(warn)} y2={sy(warn)} className="spark-warn" />
        ) : null}
        <path d={d} className={`spark-line${warn !== undefined && peak > warn ? ' over' : ''}`} />
      </svg>
      <figcaption className="text-muted-foreground text-sm tabular-nums">
        {label}: max {formatCoordinate(peak, 2)} mm ·{' '}
        {xUnit === 'time' ? formatDuration(maxX) : `${points.length}`}
      </figcaption>
    </figure>
  );
}
