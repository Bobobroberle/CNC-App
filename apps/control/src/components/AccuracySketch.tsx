import { t } from '../i18n';
import type { GantrySide } from '../lib/squaring';

/**
 * The drawings of the accuracy check. A line is told apart by its **number and its line style**, never by colour alone
 * (the one that is being typed is thicker as well as blue). Everything is drawn as the operator sees the machine from
 * the front: the origin at the front left, X to the right, Y to the back.
 */

/** The six distances to measure, in the order of the fields. */
export const LINES = ['bottom', 'top', 'left', 'right', 'diagonalAC', 'diagonalBD'] as const;
export type MeasureLine = (typeof LINES)[number];

/** The marks A (front left) B (front right) C (back right) D (back left) in the big drawing, and the line between. */
const BIG = {
  A: [70, 170],
  B: [250, 170],
  C: [250, 50],
  D: [70, 50],
} as const;

const ENDS: Record<MeasureLine, [keyof typeof BIG, keyof typeof BIG]> = {
  bottom: ['A', 'B'],
  top: ['D', 'C'],
  left: ['A', 'D'],
  right: ['B', 'C'],
  diagonalAC: ['A', 'C'],
  diagonalBD: ['B', 'D'],
};

/** Line styles that stay different in black and white. */
const DASH: Record<MeasureLine, string | undefined> = {
  bottom: undefined,
  top: '9 5',
  left: undefined,
  right: '9 5',
  diagonalAC: '12 4 2 4',
  diagonalBD: '2 5',
};

/** Where the number of a line sits: on the line, nudged off it where two lines would meet. */
const BADGE: Record<MeasureLine, [number, number]> = {
  bottom: [160, 170],
  top: [160, 50],
  left: [70, 110],
  right: [250, 110],
  diagonalAC: [118, 138],
  diagonalBD: [202, 138],
};

/** The test pattern with all six distances numbered; the one in `active` is drawn thick. */
export function MeasureSketch({ active }: { active: MeasureLine | null }) {
  return (
    <svg
      className="accuracy-sketch"
      viewBox="0 0 320 240"
      role="img"
      aria-label={t('accuracy.sketch.label')}
      data-testid="accuracy-sketch"
      data-active={active ?? ''}
    >
      {LINES.map((line) => {
        const [from, to] = ENDS[line];
        const [x1, y1] = BIG[from];
        const [x2, y2] = BIG[to];
        const on = line === active;
        return (
          <line
            key={line}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className={on ? 'sketch-line sketch-line-on' : 'sketch-line'}
            strokeDasharray={DASH[line]}
            data-line={line}
          />
        );
      })}
      {LINES.map((line, i) => {
        const [x, y] = BADGE[line];
        const on = line === active;
        return (
          <g key={line} className={on ? 'sketch-badge sketch-badge-on' : 'sketch-badge'}>
            <circle cx={x} cy={y} r="10" />
            <text x={x} y={y + 4.5} textAnchor="middle">
              {i + 1}
            </text>
          </g>
        );
      })}
      {(Object.entries(BIG) as [keyof typeof BIG, readonly [number, number]][]).map(
        ([label, [x, y]]) => (
          <g key={label}>
            <circle cx={x} cy={y} r="5" className="sketch-mark" />
            <text
              x={x + (label === 'A' || label === 'D' ? -15 : 15)}
              y={y + (label === 'A' || label === 'B' ? 18 : -9)}
              textAnchor="middle"
              className="sketch-label"
            >
              {label}
            </text>
          </g>
        ),
      )}
      <text x="160" y="12" textAnchor="middle" className="sketch-axis">
        {t('accuracy.sketch.back')}
      </text>
      <text x="160" y="214" textAnchor="middle" className="sketch-axis">
        {t('accuracy.sketch.front')}
      </text>
      <text x="14" y="112" textAnchor="middle" className="sketch-axis">
        X−
      </text>
      <text x="306" y="112" textAnchor="middle" className="sketch-axis">
        X+
      </text>
      <path d="M72 196 H112 m-6 -4 l6 4 l-6 4" className="sketch-arrow" />
      <text x="124" y="200" className="sketch-axis">
        +X
      </text>
      <path d="M44 168 V128 m-4 6 l4 -6 l4 6" className="sketch-arrow" />
      <text x="30" y="122" textAnchor="middle" className="sketch-axis">
        +Y
      </text>
    </svg>
  );
}

/** A small drawing for beside a field: the pattern, and only the line that field is for, drawn thick. */
export function LineGlyph({ line }: { line: MeasureLine }) {
  const small = { A: [6, 22], B: [30, 22], C: [30, 4], D: [6, 4] } as const;
  const [from, to] = ENDS[line];
  return (
    <svg className="line-glyph" viewBox="0 0 36 26" aria-hidden="true" data-glyph={line}>
      <rect x="6" y="4" width="24" height="18" className="glyph-frame" />
      <line
        x1={small[from][0]}
        y1={small[from][1]}
        x2={small[to][0]}
        y2={small[to][1]}
        className="glyph-line"
        strokeDasharray={DASH[line] ? '4 2' : undefined}
      />
    </svg>
  );
}

/**
 * The machine from above, as the operator sees it from the front: the two Y rails left and right, the gantry across
 * them, the rail distance that is asked for, and where Y motor 1 sits (the other one is motor 2).
 */
export function GantrySketch({ motor1Side }: { motor1Side: GantrySide | null }) {
  const left = 70;
  const right = 250;
  const motor = (side: GantrySide, x: number) => {
    const one = motor1Side === side;
    const unknown = motor1Side === null;
    return (
      <g key={side} className={one ? 'sketch-motor sketch-motor-one' : 'sketch-motor'}>
        <rect x={x - 11} y={99} width="22" height="22" rx="3" />
        <text x={x} y={115} textAnchor="middle">
          {unknown ? '?' : one ? '1' : '2'}
        </text>
      </g>
    );
  };
  return (
    <svg
      className="accuracy-sketch"
      viewBox="0 0 320 250"
      role="img"
      aria-label={t('accuracy.gantry.label')}
      data-testid="gantry-sketch"
      data-motor1={motor1Side ?? ''}
    >
      <rect x="40" y="26" width="240" height="190" className="sketch-table" />
      <line x1={left} y1="26" x2={left} y2="216" className="sketch-rail" />
      <line x1={right} y1="26" x2={right} y2="216" className="sketch-rail" />
      <line x1={left - 10} y1="110" x2={right + 10} y2="110" className="sketch-gantry" />
      {motor('xMin', left)}
      {motor('xMax', right)}
      <path
        d={`M${left} 160 H${right} m-6 -4 l6 4 l-6 4 M${left} 160 m6 -4 l-6 4 l6 4`}
        className="sketch-arrow"
      />
      <line x1={left} y1="150" x2={left} y2="170" className="sketch-tick" />
      <line x1={right} y1="150" x2={right} y2="170" className="sketch-tick" />
      <text x="160" y="150" textAnchor="middle" className="sketch-axis">
        {t('accuracy.gantry.distance')}
      </text>
      <text x="160" y="14" textAnchor="middle" className="sketch-axis">
        {t('accuracy.sketch.back')}
      </text>
      <text x="160" y="240" textAnchor="middle" className="sketch-axis">
        {t('accuracy.sketch.front')}
      </text>
      <text x="14" y="84" textAnchor="middle" className="sketch-axis">
        X−
      </text>
      <text x="14" y="98" textAnchor="middle" className="sketch-axis sketch-small">
        {t('accuracy.gantry.railLeft')}
      </text>
      <text x="306" y="84" textAnchor="middle" className="sketch-axis">
        X+
      </text>
      <text x="306" y="98" textAnchor="middle" className="sketch-axis sketch-small">
        {t('accuracy.gantry.railRight')}
      </text>
      <text x="160" y="92" textAnchor="middle" className="sketch-axis sketch-small">
        {t('accuracy.gantry.gantry')}
      </text>
    </svg>
  );
}
