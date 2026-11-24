import { applyHeightMap, HeightMap, probeGridPoints, type ProbeGrid } from '@lowrider/gcode-core';
import type { ProbeRoutine, ProbeStep } from '@lowrider/workshop';
import { useState } from 'react';
import { t } from '../i18n';
import { formatCoordinate, formatNumber, parseNumber } from '../lib/format';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { HoldButton } from './HoldButton';
import { Button } from '../ui/button';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Fold } from './Fold';

const num = (s: string) => parseNumber(s);
const f = (n: number) => String(Number(n.toFixed(3)));

/**
 * Autolevel for V-carving on warped boards: probes a grid over the job,
 * then bends every move to follow the measured surface.
 */
export function AutolevelCard() {
  const analysis = useJob((s) => s.analysis);
  const fileName = useJob((s) => s.fileName);
  const lines = useJob((s) => s.lines);
  const probe = useJob((s) => s.profile.probe);
  const { loadDerived } = useJob.getState();
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const { runProbeRoutine, addLog } = useMachine.getState();
  const [cols, setCols] = useState('4');
  const [rows, setRows] = useState('3');
  const [margin, setMargin] = useState('2');
  const [clearance, setClearance] = useState('3');
  const [depth, setDepth] = useState('5');
  const [map, setMap] = useState<HeightMap | null>(null);
  const [busy, setBusy] = useState(false);

  if (!analysis || !fileName) return null;
  const b = analysis.cutBounds;
  const grid: ProbeGrid | null =
    Number.isInteger(num(cols)) &&
    Number.isInteger(num(rows)) &&
    num(cols) >= 2 &&
    num(rows) >= 2 &&
    num(cols) <= 12 &&
    num(rows) <= 12
      ? {
          minX: b.min.x - num(margin),
          minY: b.min.y - num(margin),
          maxX: b.max.x + num(margin),
          maxY: b.max.y + num(margin),
          cols: num(cols),
          rows: num(rows),
        }
      : null;
  const valid =
    grid !== null && num(clearance) > 0 && num(depth) > 0 && Number.isFinite(num(margin));

  const run = async () => {
    if (!grid) return;
    const points = probeGridPoints(grid);
    const steps: ProbeStep[] = [];
    points.forEach((p, i) => {
      steps.push({ kind: 'move', gcode: () => `G90 G0 Z${f(num(clearance))}` });
      steps.push({ kind: 'move', gcode: () => `G90 G0 X${f(p.x)} Y${f(p.y)}` });
      steps.push({
        kind: 'probe',
        key: `p${i}`,
        axis: 'z',
        gcode: () => `G91 G38.2 Z-${f(num(clearance) + num(depth))} F${f(probe.feed)}`,
      });
      steps.push({ kind: 'move', gcode: () => `G90 G0 Z${f(num(clearance))}` });
    });
    const routine: ProbeRoutine = { name: 'z', steps, finish: () => ({}) };
    setBusy(true);
    const wcoZ = useMachine.getState().status?.wco[2] ?? 0;
    const results = await runProbeRoutine(routine);
    setBusy(false);
    if (!results) return;
    // Contact Z (machine) → work Z of the surface at each grid point, row-major.
    const z = new Array<number>(grid.cols * grid.rows).fill(0);
    points.forEach((p, i) => (z[p.row * grid.cols + p.col] = results[`p${i}`]! - wcoZ));
    const m = new HeightMap(grid, z);
    setMap(m);
    addLog('info', t('autolevel.measured', { range: formatNumber(m.range(), 3) }));
  };

  return (
    <Fold variant="card" title={t('autolevel.title')} testId="autolevel-card" find="autolevel">
      <p className="text-muted-foreground text-sm">{t('autolevel.hint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['cols', cols, setCols],
            ['rows', rows, setRows],
            ['margin', margin, setMargin],
            ['clearance', clearance, setClearance],
            ['depth', depth, setDepth],
          ] as const
        ).map(([key, value, set]) => (
          <Field key={key}>
            <FieldLabel>{t(`autolevel.${key}`)}</FieldLabel>
            <Input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => set(e.target.value)}
            />
          </Field>
        ))}
      </div>
      {grid ? (
        <p className="text-muted-foreground text-sm">
          {t('autolevel.points', {
            count: grid.cols * grid.rows,
            w: formatNumber(grid.maxX - grid.minX, 0),
            h: formatNumber(grid.maxY - grid.minY, 0),
          })}
        </p>
      ) : null}
      <HoldButton variant="accent" disabled={!idle || !valid || busy} onConfirm={() => void run()}>
        {busy ? t('probeWizard.running') : t('autolevel.start')}
      </HoldButton>
      {map ? (
        <>
          <table className="table-list" data-testid="autolevel-map">
            <tbody>
              {Array.from({ length: map.grid.rows }, (_, r) => map.grid.rows - 1 - r).map((r) => (
                <tr key={r}>
                  {Array.from({ length: map.grid.cols }, (_, c) => (
                    <td key={c} className="num">
                      {formatCoordinate(map.z[r * map.grid.cols + c]!, 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted-foreground text-sm">
            {t('autolevel.range', { range: formatNumber(map.range(), 3) })}
          </p>
          <Button
            onClick={() => {
              const r = applyHeightMap(lines.join('\n'), map);
              if (!loadDerived(`${fileName.replace(/\.[^.]*$/, '')}_autolevel.nc`, r.text)) return;
              addLog('info', t('autolevel.applied', { warnings: r.warnings.length }));
            }}
          >
            {t('autolevel.apply')}
          </Button>
        </>
      ) : null}
    </Fold>
  );
}
