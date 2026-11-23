import { IDENTITY, rotation } from '@lowrider/cam';
import { interpret } from '@lowrider/gcode-core';
import {
  fromJig,
  locatePart,
  marksOnPart,
  slideAccuracy,
  type PartPose,
  type SlideFit,
  type TagReading,
} from '@lowrider/workshop';
import { describe, expect, it } from 'vitest';
import { turnedProgram } from '../src/lib/jigs';
import {
  expectedMark,
  farthestPair,
  jobBox,
  makeSections,
  markBand,
  MARK_PAD,
  nextReach,
  sectionAxis,
  sectionFileName,
  sectionOf,
  sectionsState,
  sharedZone,
  sweepStops,
  type SectionsJob,
} from '../src/lib/sections';

/** A slot over 2000 mm at Y 40 and one back at Y 160, 2 mm deep, with a hole near each end. */
const LONG = [
  'G21 G90',
  'G0 Z5',
  'M3 S18000',
  'G0 X100 Y100',
  'G1 Z-3 F300',
  'G0 Z5',
  'G0 X1900 Y100',
  'G1 Z-3 F300',
  'G0 Z5',
  'G0 X0 Y40',
  'G1 Z-2 F300',
  'G1 X2000 F1200',
  'G1 Y160',
  'G1 X0',
  'G1 Y40',
  'G0 Z5',
  'M5',
  'M30',
].join('\n');

const source = (text = LONG, fileName = 'regal.nc') => ({
  fileName,
  text,
  original: null,
  pose: IDENTITY,
});

function made(input: Partial<Parameters<typeof makeSections>[0]> = {}): SectionsJob {
  const job = makeSections({
    source: source(),
    axis: 'x',
    travel: { min: 3, max: 1223 },
    zero: { x: 100, y: 50 },
    toolDiameter: 3,
    ...input,
  });
  if ('problem' in job) throw new Error(JSON.stringify(job));
  return job;
}

describe('sectionAxis', () => {
  it('offers sections for a job that leaves the travel along one of X and Y only', () => {
    expect(sectionAxis([{ axis: 'x' }])).toBe('x');
    expect(sectionAxis([{ axis: 'y' }, { axis: 'y' }])).toBe('y');
    expect(sectionAxis([{ axis: 'x' }, { axis: 'y' }])).toBeNull();
    expect(sectionAxis([{ axis: 'x' }, { axis: 'z' }])).toBeNull();
    expect(sectionAxis([{ axis: 'z' }])).toBeNull();
    expect(sectionAxis([])).toBeNull();
  });
});

describe('makeSections', () => {
  it('cuts the job for the part as it lies, each section a program of its own', () => {
    const job = made();
    // The zero at X 100: the tool reaches −97 … 1123 of the part. A third of the travel
    // (350 at most) is shared for the marks, 30 the hand may be off: slides of at most 840.
    // 2000 − 1123 + 30 = 907 more are needed: two slides of 460.
    expect(sharedZone(1220)).toBe(350);
    expect(sharedZone(400)).toBe(150);
    expect(sharedZone(900)).toBe(270);
    expect(job.slide).toBe(460);
    expect(job.plan.windows).toEqual([
      { min: -97, max: 1123 },
      { min: 393, max: 1553 },
      { min: 853, max: 2013 },
    ]);
    expect(job.parts.map((p) => p.fileName)).toEqual([
      'regal_abschnitt_1von3.nc',
      'regal_abschnitt_2von3.nc',
      'regal_abschnitt_3von3.nc',
    ]);
    expect(sectionFileName('regal', 1, 3)).toBe('regal_abschnitt_2von3.nc');
    expect(job.name).toBe('regal');
    expect(job.zero).toEqual({ x: 100, y: 50 });
    // The seams in the middle of what two neighbours both reach; the frame crosses each twice.
    expect(job.plan.seams).toEqual([
      { at: 759, cuts: 2 },
      { at: 1204, cuts: 2 },
    ]);
    // The hole at X 100 is the first section's, the one at 1900 the last's.
    expect(job.parts.map((p) => p.text.includes('G1 Z-3 F300'))).toEqual([true, false, true]);
    expect(job.parts[1]!.box).toEqual({ minX: 758, minY: 40, maxX: 1204, maxY: 160 });
    expect(jobBox(job)).toEqual({ minX: 0, minY: 40, maxX: 2000, maxY: 160 });
    expect(sectionOf(job, 'regal_abschnitt_3von3.nc')).toBe(2);
    expect(sectionOf(job, 'regal.nc')).toBe(-1);
    expect(sectionOf(null, 'regal.nc')).toBe(-1);
  });

  it('names the sections after the job as it was loaded and repairs what the SD card would not take', () => {
    const aligned = {
      fileName: 'regal_ausgerichtet.nc',
      text: LONG.replace('G0 Z5', 'G0 G43 Z5 H1'),
      original: { fileName: 'regal seite.nc', text: LONG },
      pose: rotation(0.3),
    };
    const job = made({ source: aligned });
    expect(job.parts[0]!.fileName).toBe('regal seite_abschnitt_1von3.nc');
    expect(job.parts[0]!.text).not.toContain('G43');
    expect(job.source).toBe(aligned);
  });

  it('works along Y and says why not', () => {
    const along = LONG.replace(/X(-?\d+) Y(-?\d+)/g, 'X$2 Y$1')
      .replace('G1 X2000 F1200', 'G1 Y2000 F1200')
      .replace('G1 Y160', 'G1 X160')
      .replace('G1 X0', 'G1 Y0')
      .replace('G1 Y40', 'G1 X40');
    const job = made({ source: source(along), axis: 'y', zero: { x: 50, y: 100 } });
    expect(job.axis).toBe('y');
    expect(job.slide).toBe(460);
    expect(jobBox(job)).toEqual({ minX: 40, minY: 0, maxX: 160, maxY: 2000 });
    const no = (input: Partial<Parameters<typeof makeSections>[0]>) =>
      makeSections({
        source: source(),
        axis: 'x',
        travel: { min: 3, max: 1223 },
        zero: { x: 100, y: 50 },
        toolDiameter: 3,
        ...input,
      });
    expect(no({ zero: { x: -100, y: 50 } })).toEqual({ problem: 'start-outside' });
    expect(no({ travel: { min: 3, max: 2223 } })).toEqual({ problem: 'fits' });
    expect(no({ source: source('G91\nG1 X10 F100') })).toMatchObject({ problem: 'unsupported' });
    expect(jobBox({ parts: [{ fileName: 'a', text: '', cuts: 0, box: null }] })).toBeNull();
  });
});

describe('sectionsState', () => {
  const job = made();
  const name = (i: number) => job.parts[i]!.fileName;
  const located = { zero: { x: -360, y: 52 }, pose: rotation(0.4) };
  const state = (
    flow: Partial<Parameters<typeof sectionsState>[0]>,
    file: string | null,
    wco: number[] | null = [100, 50, -80],
    pose = IDENTITY,
  ) => sectionsState({ job, index: 0, phase: 'cut', located: null, ...flow }, file, wco, pose);

  it('lets the section at hand start, and only that', () => {
    expect(state({}, name(0))).toEqual({ state: 'ready', n: 1, total: 3, at: 1 });
    expect(state({}, name(1))?.state).toBe('earlier');
    expect(state({}, 'regal.nc')).toBeNull();
    expect(state({ job: null }, name(0))).toBeNull();
    expect(state({ index: 1, located }, name(0), [-360, 52, -80])).toEqual({
      state: 'past',
      n: 1,
      total: 3,
      at: 2,
    });
  });

  it('holds a section that is cut, and blocks it once the part is slid', () => {
    expect(state({ phase: 'marks' }, name(0))?.state).toBe('cutAgain');
    expect(state({ phase: 'slide' }, name(0))?.state).toBe('slid');
    expect(state({ phase: 'find' }, name(0))?.state).toBe('slid');
    expect(state({ index: 2, phase: 'done' }, name(2))?.state).toBe('cutAgain');
  });

  it('wants the zero and the program as they were when the part was found', () => {
    const at = { index: 1, located };
    expect(state(at, name(1), [-360, 52, -80], rotation(0.4))?.state).toBe('ready');
    expect(state(at, name(1), null, rotation(0.4))?.state).toBe('ready');
    expect(state(at, name(1), [-360.5, 52, -80], rotation(0.4))?.state).toBe('moved');
    expect(state(at, name(1), [-360, 52, -80], rotation(0.5))?.state).toBe('moved');
    expect(state(at, name(1), [-360, 52, -80], IDENTITY)?.state).toBe('moved');
    // Loaded again after a restart, without the part having been found in this state.
    expect(state({ index: 1 }, name(1), [-360, 52, -80], rotation(0.4))?.state).toBe('moved');
  });
});

describe('where the camera looks for the marks', () => {
  const job = made();
  const cut: PartPose = { x: 100, y: 50, angle: 0 };
  /** The camera sits 35 mm right of the cutter and 20 in front of it. */
  const camera = { minX: 38, maxX: 1258, minY: -17, maxY: 2423 };

  it('marks the band the camera reaches before and after the slide, across the job', () => {
    // Along X: 38 + 460 + 30 and the half paper of a mark (30.7) … 1258 − 30.7. Across: the
    // job lies at Y 90 … 210 on the table; a mark keeps its paper on it.
    expect(MARK_PAD).toBeCloseTo(30.714, 3);
    const band = markBand(job, cut, camera)!;
    expect(band.minX).toBeCloseTo(558.714, 3);
    expect(band.maxX).toBeCloseTo(1227.286, 3);
    expect(band.minY).toBeCloseTo(120.714, 3);
    expect(band.maxY).toBeCloseTo(179.286, 3);
    // The part slid 460 to the left: the same stretch of the table, another one of the part.
    const slid = markBand(job, { x: -360, y: 50, angle: 0 }, camera)!;
    expect(slid.minX).toBeCloseTo(558.714, 3);
    // A narrow part: the marks go on its middle line.
    const slat = {
      ...job,
      parts: [{ ...job.parts[0]!, box: { minX: 0, minY: 0, maxX: 2000, maxY: 40 } }],
    };
    const narrow = markBand(slat, cut, camera)!;
    expect(narrow.minY).toBeCloseTo(70, 9);
    expect(narrow.maxY).toBeCloseTo(70, 9);
    // Nothing shared, nothing cut, or the part out of the camera's reach across: no band.
    expect(markBand({ ...job, slide: 1200 }, cut, camera)).toBeNull();
    expect(markBand({ ...job, parts: [] }, cut, camera)).toBeNull();
    expect(markBand(job, { x: 100, y: 3000, angle: 0 }, camera)).toBeNull();
  });

  it('marks the band along Y too', () => {
    const along = {
      ...job,
      axis: 'y' as const,
      parts: [{ ...job.parts[0]!, box: { minX: 40, minY: 0, maxX: 160, maxY: 2000 } }],
    };
    const band = markBand(
      along,
      { x: 50, y: 100, angle: 0 },
      { minX: 38, maxX: 1258, minY: -17, maxY: 1203 },
    )!;
    expect(band.minY).toBeCloseTo(-17 + 460 + 30 + MARK_PAD, 6);
    expect(band.maxY).toBeCloseTo(1203 - MARK_PAD, 6);
    expect(band.minX).toBeCloseTo(90 + MARK_PAD, 6);
    expect(band.maxX).toBeCloseTo(210 - MARK_PAD, 6);
  });

  it('sweeps the band so that a mark anywhere in it is wholly in one picture', () => {
    const band = { minX: 560, maxX: 1220, minY: 120, maxY: 180 };
    // A picture of 170 × 127 mm: a mark's middle may be 54.3 / 32.8 from the picture's.
    const stops = sweepStops(band, { width: 170, height: 127 }, 'x');
    // 660 / 108.6 → 7 columns, 60 / 65.6 → 1 row.
    expect(stops).toHaveLength(7);
    expect(stops[0]!.x).toBeCloseTo(560 + 660 / 14, 6);
    expect(stops[0]!.y).toBe(150);
    for (const p of [band.minX, 700, 933.3, band.maxX]) {
      const near = Math.min(...stops.map((s) => Math.abs(s.x - p)));
      expect(near).toBeLessThanOrEqual(170 / 2 - MARK_PAD);
    }
    // The simulator's small picture (120 × 90): more stops, to and fro along the slide.
    const small = sweepStops({ ...band, maxY: 280 }, { width: 120, height: 90 }, 'x');
    const rows = [...new Set(small.map((s) => s.y))];
    expect(rows).toHaveLength(6);
    const firstRow = small.filter((s) => s.y === rows[0]);
    const secondRow = small.filter((s) => s.y === rows[1]);
    expect(firstRow[0]!.x).toBeLessThan(firstRow[1]!.x);
    expect(secondRow[0]!.x).toBeGreaterThan(secondRow[1]!.x);
    // Along Y the rows run along Y.
    const upright = sweepStops(
      { minX: 120, maxX: 180, minY: 560, maxY: 1220 },
      { width: 170, height: 127 },
      'y',
    );
    expect(new Set(upright.map((s) => s.x)).size).toBe(1);
    expect(upright.length).toBe(11);
    // A picture hardly larger than a mark still moves on.
    expect(sweepStops(band, { width: 60, height: 60 }, 'x').length).toBeGreaterThan(60);
  });

  it('takes the two marks farthest apart', () => {
    const a = { id: 1, x: 0, y: 0 };
    const b = { id: 2, x: 100, y: 0 };
    const c = { id: 3, x: 300, y: 40 };
    expect(farthestPair([a, b, c])).toEqual([a, c]);
    expect(farthestPair([b])).toEqual([b]);
    expect(farthestPair([])).toEqual([]);
  });

  it('expects a mark where the part is slid to, and knows the lever of the next section', () => {
    expect(expectedMark(cut, { x: 800, y: 100 }, 'x', 460)).toEqual({ x: 440, y: 150 });
    expect(expectedMark(cut, { x: 100, y: 800 }, 'y', 460)).toEqual({ x: 200, y: 390 });
    const marks = marksOnPart(cut, [
      { id: 7, x: 700, y: 140, angle: 0, size: 40 },
      { id: 8, x: 1100, y: 160, angle: 0, size: 40 },
    ]);
    // The middle of the marks is at (800, 100) on the part; the second section cuts
    // X 758 … 1204, Y 40 … 160: its farthest corner is 404 right and 60 off.
    expect(nextReach(job, 0, marks)).toBeCloseTo(Math.hypot(404, 60), 6);
    expect(nextReach(job, 2, marks)).toBe(0);
  });
});

describe('from the marks to the next section on the table', () => {
  const job = made();
  /** Where a point of the part lies on the table when the part lies at `pose`. */
  const onTable = (pose: PartPose, x: number, y: number) => fromJig(pose, { x, y });
  /** The marks as the camera reads them with the part at `pose`, each off by `noise` mm. */
  const seen = (
    pose: PartPose,
    marks: ReturnType<typeof marksOnPart>,
    noise: { x: number; y: number }[] = [],
  ): TagReading[] =>
    marks.map((m, i) => {
      const p = fromJig(pose, m);
      return {
        id: m.id,
        size: m.size,
        x: p.x + (noise[i]?.x ?? 0),
        y: p.y + (noise[i]?.y ?? 0),
        angle: m.angle + pose.angle,
      };
    });
  /** Where the cutting moves of a section's program end on the table: zero + turned program. */
  const cutsOnTable = (index: number, pose: PartPose) => {
    const text = turnedProgram(job.parts[index]!.text, pose.angle) ?? job.parts[index]!.text;
    return interpret(text)
      .segments.filter((s) => s.motion !== 'rapid')
      .map((s) => ({ x: pose.x + s.to.x, y: pose.y + s.to.y, z: s.to.z }));
  };
  const found = (r: ReturnType<typeof locatePart>): SlideFit => {
    if ('problem' in r) throw new Error(JSON.stringify(r));
    return r;
  };

  it('puts the second section where the part lies after a slide towards −X', () => {
    // Section 1 was cut with the zero at (100, 50), the part square to the table.
    const first: PartPose = { x: 100, y: 50, angle: 0 };
    // Two marks in the shared stretch, measured on the table before the slide.
    const marks = marksOnPart(first, [
      { id: 7, x: 700, y: 140, angle: 12, size: 40 },
      { id: 8, x: 1100, y: 160, angle: -100, size: 40 },
    ]);
    expect(marks.map((m) => [m.x, m.y])).toEqual([
      [600, 90],
      [1000, 110],
    ]);
    // Slid by hand: 474 instead of 460, 6 mm towards the front, turned by 0.35°.
    const truth: PartPose = { x: -374, y: 44, angle: 0.35 };
    const fit = found(locatePart(first, marks, seen(truth, marks), false));
    expect(fit.pose.x).toBeCloseTo(-374, 6);
    expect(fit.pose.y).toBeCloseTo(44, 6);
    expect(fit.rotation).toBeCloseTo(0.35, 6);

    // The program of section 2, turned by 0.35° about the zero that is set at (−374, 44).
    const cuts = cutsOnTable(1, fit.pose);
    // It enters the lower slot 1 mm before the seam: (758, 40) on the part. By hand:
    // −374 + 758 cos 0.35° − 40 sin 0.35° = 383.7415, 44 + 758 sin 0.35° + 40 cos 0.35° = 88.6296.
    const entry = cuts.find((c) => c.z === -2)!;
    expect(entry.x).toBeCloseTo(383.7415, 3);
    expect(entry.y).toBeCloseTo(88.6296, 3);
    // … and cuts to the second seam, (1204, 40) on the part: where that point really lies.
    const far = onTable(truth, 1204, 40);
    const end = cuts.find((c) => Math.hypot(c.x - far.x, c.y - far.y) < 0.001);
    expect(end).toBeDefined();
    // Every cut of the section lies on the part's slots (Y 40 or 160 of the part), to a micron.
    for (const c of cuts) {
      const back = { x: c.x - truth.x, y: c.y - truth.y };
      const a = (-truth.angle * Math.PI) / 180;
      const y = Math.sin(a) * back.x + Math.cos(a) * back.y;
      expect(Math.min(Math.abs(y - 40), Math.abs(y - 160))).toBeLessThan(0.001);
    }
  });

  it('carries on over two slides: what the third section cuts lies where the first left off', () => {
    const first: PartPose = { x: 100, y: 50, angle: 0 };
    const second: PartPose = { x: -374, y: 44, angle: 0.35 };
    const third: PartPose = { x: -823, y: 51, angle: 0.05 };
    const marks1 = marksOnPart(first, [
      { id: 7, x: 700, y: 140, angle: 12, size: 40 },
      { id: 8, x: 1100, y: 160, angle: -100, size: 40 },
    ]);
    const pose2 = found(locatePart(first, marks1, seen(second, marks1), false)).pose;
    // New marks for the second slide, measured with the part lying as it was found.
    const stuck = marksOnPart(second, [
      { id: 7, ...onTable(second, 1050, 90), angle: 3, size: 40 },
      { id: 8, ...onTable(second, 1450, 110), angle: 80, size: 40 },
    ]);
    const marks2 = marksOnPart(pose2, seen(second, stuck));
    expect(marks2[0]!.x).toBeCloseTo(1050, 3);
    expect(marks2[1]!.y).toBeCloseTo(110, 3);
    const fit3 = found(locatePart(pose2, marks2, seen(third, marks2), false));
    expect(fit3.rotation).toBeCloseTo(-0.3, 6);
    // The far end of the part, (2000, 160): where the third section cuts it and where it is.
    const cuts = cutsOnTable(2, fit3.pose);
    const corner = onTable(third, 2000, 160);
    expect(Math.min(...cuts.map((c) => Math.hypot(c.x - corner.x, c.y - corner.y)))).toBeLessThan(
      0.001,
    );
    // By hand: −823 + 2000 cos 0.05° − 160 sin 0.05°, 51 + 2000 sin 0.05° + 160 cos 0.05°.
    expect(corner.x).toBeCloseTo(1176.8596, 3);
    expect(corner.y).toBeCloseTo(212.7453, 3);
  });

  it('works along Y and for a part that was slid the other way', () => {
    const first: PartPose = { x: 50, y: 100, angle: 0 };
    const marks = marksOnPart(first, [
      { id: 3, x: 140, y: 700, angle: 0, size: 40 },
      { id: 4, x: 160, y: 1100, angle: 0, size: 40 },
    ]);
    for (const truth of [
      { x: 44, y: -371, angle: -0.4 },
      { x: 57, y: 566, angle: 0.25 },
    ]) {
      const fit = found(locatePart(first, marks, seen(truth, marks), false));
      // Any point of the part, through the zero that is set and the turn of the program.
      const a = (fit.pose.angle * Math.PI) / 180;
      const p = { x: 160, y: 1700 };
      const cutAt = {
        x: fit.pose.x + Math.cos(a) * p.x - Math.sin(a) * p.y,
        y: fit.pose.y + Math.sin(a) * p.x + Math.cos(a) * p.y,
      };
      const real = onTable(truth, p.x, p.y);
      expect(cutAt.x).toBeCloseTo(real.x, 6);
      expect(cutAt.y).toBeCloseTo(real.y, 6);
    }
  });

  it('stays within what it says when the camera reads each mark a tenth off', () => {
    const first: PartPose = { x: 100, y: 50, angle: 0 };
    const marks = marksOnPart(first, [
      { id: 7, x: 700, y: 140, angle: 0, size: 40 },
      { id: 8, x: 1100, y: 160, angle: 0, size: 40 },
    ]);
    const truth: PartPose = { x: -374, y: 44, angle: 0.35 };
    const reach = nextReach(job, 0, marks);
    const said = slideAccuracy(marks, reach, false).error;
    // 0.1 + 408.4 · 0.2 / 400.5 = 0.30 mm at the far corner of the second section.
    expect(said).toBeCloseTo(0.304, 2);
    // The worst case: the marks read 0.1 mm off across their line, in opposite directions.
    const fit = found(
      locatePart(
        first,
        marks,
        seen(truth, marks, [
          { x: 0, y: 0.1 },
          { x: 0, y: -0.1 },
        ]),
        false,
      ),
    );
    for (const [x, y] of [
      [758, 40],
      [1204, 40],
      [1204, 160],
      [758, 160],
    ] as const) {
      const cutAt = fromJig(fit.pose, { x, y });
      const real = onTable(truth, x, y);
      expect(Math.hypot(cutAt.x - real.x, cutAt.y - real.y)).toBeLessThan(said);
    }
    // On a fence the direction is the fence's: the same readings move the part 0 mm at the
    // middle of the marks and turn nothing.
    const onFence = found(
      locatePart(
        first,
        marks,
        seen({ ...truth, angle: 0 }, marks, [
          { x: 0, y: 0.1 },
          { x: 0, y: -0.1 },
        ]),
        true,
      ),
    );
    expect(onFence.pose.angle).toBe(0);
    expect(onFence.pose.x).toBeCloseTo(-374, 6);
    expect(onFence.pose.y).toBeCloseTo(44, 6);
  });
});
