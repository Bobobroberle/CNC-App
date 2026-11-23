import { arcPoints, type Contour, type Point } from './geometry';

const TOL = 0.01;

/** Rectangle from its lower left corner, with optional corner radius. */
export function rectangle(x: number, y: number, w: number, h: number, radius = 0): Contour {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0) {
    return {
      closed: true,
      points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
    };
  }
  const q = Math.PI / 2;
  const corners: [number, number, number][] = [
    [x + w - r, y + r, -q],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, q],
    [x + r, y + r, 2 * q],
  ];
  const points: Point[] = corners.flatMap(([cx, cy, a]) => arcPoints(cx, cy, r, a, q, TOL));
  return { closed: true, points };
}

/** Circle around its centre. */
export function circle(cx: number, cy: number, diameter: number): Contour {
  const r = diameter / 2;
  const points = arcPoints(cx, cy, r, 0, 2 * Math.PI, TOL);
  points.pop();
  return { closed: true, points, circle: { cx, cy, r } };
}

/** Slot (long hole) from centre, length end to end, width, angle in degrees. */
export function slot(cx: number, cy: number, length: number, width: number, angle = 0): Contour {
  const r = width / 2;
  const half = Math.max(0, length / 2 - r);
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a) * half;
  const dy = Math.sin(a) * half;
  const points = [
    ...arcPoints(cx + dx, cy + dy, r, a - Math.PI / 2, Math.PI, TOL),
    ...arcPoints(cx - dx, cy - dy, r, a + Math.PI / 2, Math.PI, TOL),
  ];
  return { closed: true, points };
}

/** Holes in a grid: columns × rows with a pitch, starting at the first hole's centre. */
export function holeGrid(
  x: number,
  y: number,
  diameter: number,
  columns: number,
  rows: number,
  pitchX: number,
  pitchY: number,
): Contour[] {
  const out: Contour[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) out.push(circle(x + i * pitchX, y + j * pitchY, diameter));
  }
  return out;
}
