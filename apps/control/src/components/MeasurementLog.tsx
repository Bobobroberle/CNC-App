import { t, type MessageKey } from '../i18n';
import { formatNumber } from '../lib/format';
import type { Measurement } from '../lib/measurements';
import { useMeasurements } from '../store/measurements';
import { Card, CardTitle } from '../ui/card';
import { signed } from './CorrectionPanel';

/** How many entries the card lists: the latest; older ones are on the Pi. */
const SHOWN = 30;

const number = (m: Measurement, key: string, digits: number) => {
  const v = m.values[key];
  return typeof v === 'number' ? formatNumber(v, digits) : '–';
};
/** A scale as the percent it is off from 1 – the way the measuring cards show it. */
const percent = (m: Measurement, key: string) => {
  const v = m.values[key];
  return typeof v === 'number' ? signed((v - 1) * 100, 3) : '–';
};

/** What an entry says, in a line: the numbers that matter for its kind. */
export function summaryOf(m: Measurement): string {
  switch (m.kind) {
    case 'camera-scale':
      return t('measurements.summary.cameraScale', {
        px: number(m, 'pxPerMm', 2),
        angle: number(m, 'rotation', 2),
        z: number(m, 'focusHeight', 2),
      });
    case 'camera-offset':
      return t('measurements.summary.cameraOffset', {
        x: number(m, 'offsetX', 3),
        y: number(m, 'offsetY', 3),
      });
    case 'machine-grid':
      return t('measurements.summary.machineGrid', {
        sx: percent(m, 'scaleX'),
        sy: percent(m, 'scaleY'),
        sq: number(m, 'squareness', 3),
        points: number(m, 'points', 0),
        turned: m.values.turned === true ? t('measurements.summary.turned') : '',
      });
    case 'machine-backlash':
      return t('measurements.summary.machineBacklash', {
        x: number(m, 'x', 3),
        y: number(m, 'y', 3),
      });
    case 'machine-tilt':
      return t('measurements.summary.machineTilt', {
        x: number(m, 'x', 3),
        y: number(m, 'y', 3),
        per100: number(m, 'per100', 2),
      });
    case 'ruler-check':
      return t('measurements.summary.rulerCheck', {
        w: number(m, 'sizeX', 0),
        h: number(m, 'sizeY', 0),
        sx: percent(m, 'scaleX'),
        sy: percent(m, 'scaleY'),
        sq: number(m, 'squareness', 3),
      });
    case 'correction': {
      // "axes/x/steps_per_mm: 800 → 799,2" for every value that was written
      const list = Object.keys(m.values)
        .filter((k) => k.endsWith('.from'))
        .map((k) => {
          const path = k.slice(0, -'.from'.length);
          return `${path}: ${number(m, k, 3)} → ${number(m, `${path}.to`, 3)}`;
        })
        .join('; ');
      return t('measurements.summary.correction', { list });
    }
    case 'tool-reference':
      return t('measurements.summary.toolReference', { z: number(m, 'z', 3) });
  }
}

/** Service → Kalibrieren: what was measured and written, newest first (it is on the Pi too). */
export function MeasurementLog() {
  const list = useMeasurements((s) => s.list);
  const latest = [...list].reverse().slice(0, SHOWN);
  return (
    <Card className="gap-3 p-4" data-testid="measurement-log" data-find="measurements">
      <CardTitle render={<h2 />}>{t('measurements.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('measurements.hint')}</p>
      {latest.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('measurements.empty')}</p>
      ) : (
        <ul className="parts" data-testid="measurement-list">
          {latest.map((m) => (
            <li key={m.id} className="part" data-kind={m.kind}>
              <div className="min-w-0">
                <strong>{t(`measurements.kinds.${m.kind}` as MessageKey)}</strong>
                <div className="text-muted-foreground text-sm tabular-nums">
                  {new Date(m.at).toLocaleString('de-DE')}
                </div>
                <div className="text-sm tabular-nums">{summaryOf(m)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
