import {
  circle,
  rectangle,
  sketchContours,
  transformContour,
  translation,
  type Contour,
  type Sketch,
} from '@lowrider/cam';
import type { Rect } from './photomap';

/**
 * Geometry of the full demo ("as if set up and calibrated") on the simulated
 * table: where the work zero goes, what the example job draws and which area
 * the pre-scanned photo map covers. Pure numbers, machine millimetres.
 */

export interface Placement {
  x: number;
  y: number;
  /** degrees, counter-clockwise */
  angle: number;
}

/** A point given in the coordinates of a placed part, in table coordinates. */
export function placeOn(base: Placement, p: { x: number; y: number }): { x: number; y: number } {
  const a = (base.angle * Math.PI) / 180;
  return {
    x: base.x + Math.cos(a) * p.x - Math.sin(a) * p.y,
    y: base.y + Math.sin(a) * p.x + Math.cos(a) * p.y,
  };
}

/** The address of this page as the full demo, or back without it. */
export function demoHref(on: boolean, href: string = location.href): string {
  const base = href.replace(/#.*$/, '');
  return on ? `${base}#demo` : base;
}

/** Work Z of the camera height in the demo (the scale is "calibrated" there). */
export const DEMO_CAMERA_HEIGHT = 30;

/** Where the camera looks at the start, in board coordinates: hole 1, the job's corner and a mounting hole. */
export const DEMO_CAMERA_SPOT = { x: 72, y: 58 };

/** Machine box of camera-centre positions the demo map covers: plate and board. */
export const DEMO_SCAN_AREA: Rect = { minX: 110, minY: 105, maxX: 835, maxY: 395 };

/**
 * What the demo map covers with the long board on the table: the board as
 * far as the camera reaches it.
 */
export const DEMO_LONG_SCAN_AREA: Rect = { minX: 110, minY: 105, maxX: 1250, maxY: 480 };

/**
 * The example job, relative to the work zero on board hole 1 (and turned with
 * the board): a sign plate with rounded corners, four mounting holes and a
 * round pocket (and `DEMO_TEXT` engraved on it). It lies inside the board and
 * clear of holes 2 and 3.
 */
export function demoJobContours(): Contour[] {
  return demoJobSketches().flatMap(({ sketch, at }) =>
    sketchContours(sketch).contours.map((c) => transformContour(c, translation(at.x, at.y))),
  );
}

/**
 * The same job as it is drawn in the workspace: every shape by its measures
 * and where its middle lies (board coordinates), so the demo's drawing can
 * be changed like one drawn by hand.
 */
export function demoJobSketches(): { sketch: Sketch; at: { x: number; y: number } }[] {
  const holes = [
    [55, 35],
    [305, 35],
    [55, 165],
    [305, 165],
  ] as const;
  return [
    { sketch: { type: 'rect', w: 280, h: 160, r: 10 }, at: { x: 180, y: 100 } },
    ...holes.map(([x, y]) => ({ sketch: { type: 'circle', d: 10 } as Sketch, at: { x, y } })),
    { sketch: { type: 'circle', d: 40 }, at: { x: 180, y: 100 } },
  ];
}

/**
 * Engraved across the sign above the round pocket: the words, the height of
 * the capitals and the middle of the baseline, in the job's coordinates.
 */
export const DEMO_TEXT = { text: 'LowRider', height: 16, x: 180, y: 136 };

/**
 * A clamp marked beside the job, in board coordinates: it holds the board at
 * its right edge, far enough from the sign plate for the collet nut to pass.
 */
export const DEMO_CLAMP = { x: 392, y: 125 };

/**
 * The job of the demo's jig, relative to the middle of the coaster it holds:
 * a frame with rounded corners and a word across it, engraved, and a hole
 * as wide as the cutter in one corner – so the cut shows which way round the
 * coaster lay.
 */
export const DEMO_JIG = {
  name: 'Untersetzer-Rahmen',
  fileName: 'untersetzer.nc',
  frame: { size: 76, radius: 8 },
  text: { text: 'Demo', height: 12 },
  hole: { x: 26, y: 26, depth: 2 },
};

/** The frame of the demo jig's job, around the coaster's middle. */
export function demoJigFrame(): Contour {
  const { size, radius } = DEMO_JIG.frame;
  return rectangle(-size / 2, -size / 2, size, size, radius);
}

/**
 * The example for the simulator's long board: the side of a shelf, 2.48 m
 * long – more than twice the travel in X. Counted from the work zero, which
 * lies at `zero` on the board (board coordinates): the outline, two rows of
 * holes for shelf pins, two grip slots – each right where a seam between
 * two sections comes to lie, so they show that small things stay whole –
 * and a word.
 */
export const DEMO_LONG = {
  name: 'regalseite',
  zero: { x: 30, y: 40 },
  outline: { width: 2480, height: 220, radius: 12 },
  pins: { rows: [50, 170], first: 100, pitch: 96, count: 25, depth: 4 },
  grips: [884, 1559].map((x) => ({ x, y: 110, width: 120, height: 30 })),
  text: { text: 'Regal links', height: 24, x: 300, y: 98 },
};

/** The contours of the long example without its word: outline, grip slots, then the pin holes. */
export function demoLongContours(toolDiameter: number): { shapes: Contour[]; holes: Contour[] } {
  const { outline, pins, grips } = DEMO_LONG;
  return {
    shapes: [
      rectangle(0, 0, outline.width, outline.height, outline.radius),
      ...grips.map((g) =>
        rectangle(g.x - g.width / 2, g.y - g.height / 2, g.width, g.height, g.height / 2),
      ),
    ],
    // As wide as the cutter: one plunge each.
    holes: pins.rows.flatMap((y) =>
      Array.from({ length: pins.count }, (_, i) =>
        circle(pins.first + i * pins.pitch, y, toolDiameter),
      ),
    ),
  };
}
